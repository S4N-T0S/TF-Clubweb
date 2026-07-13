// Customer-Service export (CS_extracted_data.pdf) — lazy extractor + parser.
//
// The PDF has two sections: "CHAT HISTORY" (a literal CSV: type,message,time —
// the player's own in-game chat, profanity starred) and "TICKET HISTORY"
// (Helpshift support-ticket transcripts). Only ever import this module
// dynamically (like geoip.js): pdfjs-dist is heavy and most exports don't
// include the CS component at all.
//
// Format quirks this parser is built around (verified on a real export):
// - A message's TEXT comes first; the sender line FOLLOWS it, usually with the
//   day-stamp on the same line ("00#0000 15dago", "QuickSearch Bot 15dago").
// - Agent replies often have NO sender line at all — they end with a bare
//   stamp line ("113dago � 87dago" = sent/read) or an absolute
//   "Sent September-29-2025 04:37:55 PM � Read …" line; the agent's name only
//   appears in the sign-off text ("Kind regards, Blade").
// - Timestamps are RELATIVE day offsets ("15dago"). The only absolute per-ticket
//   time is the "Resolved / On <Month>-<D>-<YYYY> <time>" footer, so each ticket
//   anchors its offsets on that (offsets drift several days vs the PDF's own
//   CreationDate). Day granularity only — always presented as approximate.
// - Chat CSV rows are NOT reliably line-separated after text extraction, so the
//   chat scanner is timestamp-terminated, not line-based.

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const DAY_MS = 24 * 3600 * 1000;

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// 'June-25-2026 09:09 AM' / 'September-29-2025 04:37:55 PM' -> UTC ms (day-ish precision)
export const parseLongDate = (str) => {
  const m = /([A-Za-z]+)-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/.exec(String(str || ''));
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (mon == null) return null;
  let h = m[4] ? parseInt(m[4], 10) : 0;
  if (m[7]) {
    if (/pm/i.test(m[7]) && h < 12) h += 12;
    if (/am/i.test(m[7]) && h === 12) h = 0;
  }
  return Date.UTC(+m[3], mon, +m[2], h, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
};

// PDF metadata date: D:20260713082657+02'00'
const parsePdfDate = (str) => {
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?(?:([+\-Z])(\d{2})?'?(\d{2})?)?/.exec(String(str || ''));
  if (!m) return null;
  let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if (m[7] === '+' || m[7] === '-') {
    const off = (+(m[8] || 0) * 60 + +(m[9] || 0)) * 60000;
    ms += m[7] === '+' ? -off : off;
  }
  return ms;
};

// --- text-layer -> lines ----------------------------------------------------
// Group positioned text items into visual lines: bucket by y (±2), sort by x.
function linesFromItems(items, out) {
  const frags = [];
  for (const it of items) {
    const s = (it.str || '').replace(/\s+/g, ' ').trim();
    if (!s) continue;
    frags.push({ x: it.transform[4], y: it.transform[5], s });
  }
  frags.sort((a, b) => b.y - a.y || a.x - b.x);
  let curY = null;
  let cur = null;
  for (const f of frags) {
    if (curY === null || Math.abs(f.y - curY) > 2) {
      if (cur?.length) out.push(cur.join(' '));
      cur = [];
      curY = f.y;
    }
    cur.push(f.s);
  }
  if (cur?.length) out.push(cur.join(' '));
}

async function extractPdf(bytes, onProgress) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // .slice() matters: pdf.js transfers the buffer to its worker, detaching the
  // caller's copy — without it the cached bytes would be dead after one parse.
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true });
  try {
    const doc = await task.promise;
    let creationDateMs = null;
    try {
      const meta = await doc.getMetadata();
      creationDateMs = parsePdfDate(meta?.info?.CreationDate);
    } catch { /* metadata is optional */ }
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      linesFromItems(tc.items, lines);
      page.cleanup();
      if ((p & 7) === 0) {
        onProgress?.(p, doc.numPages);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return { lines, creationDateMs };
  } finally {
    task.destroy();
  }
}

// --- parsing ----------------------------------------------------------------

const stripJunk = (s) => s.replace(/[�•·|]/g, ' ');
const STAMP_G = /(\d+)\s*d\s*ago\b/gi;

// A line that is nothing but relative stamps (and junk glyphs) — terminates a
// message without naming a sender. Returns the FIRST offset (= sent).
const stampOnly = (line) => {
  const clean = stripJunk(line);
  const m = /(\d+)\s*d\s*ago\b/i.exec(clean);
  if (!m) return null;
  return clean.replace(STAMP_G, ' ').trim() === '' ? parseInt(m[1], 10) : null;
};

const SYSTEM_RES = [
  /^Issue Created$/i,
  /^Resolved$/i,
  /has been initiated$/i,
  /is done interacting with the user$/i,
  /has expired$/i,
];
const isSystemText = (s) => SYSTEM_RES.some((re) => re.test(s)) || /^Attachment sent/i.test(s);

const BOT_RES = [/^Greeting Message$/i, /^Automations$/i, /^QuickSearch Bot$/i, /Resolution Bot/i, /^Feedback [\d.]+$/i];
const isBotName = (s) => BOT_RES.some((re) => re.test(s));
const isPlayerName = (s, identityName) => /#\d{3,4}$/.test(s) || (!!identityName && s === identityName);
const isKnownSender = (s, identityName) => isPlayerName(s, identityName) || isBotName(s) || /^Helpshift Support$/i.test(s);

// Chat rows are timestamp-terminated: text extraction can collapse several CSV
// rows into one paragraph, so we scan the whole blob instead of splitting lines.
export function parseChatBlob(blob) {
  const out = [];
  const re = /(pl|party)\s*,\s*("(?:""|[^"])*"|[^,]*?)\s*,\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)/g;
  let m;
  while ((m = re.exec(blob))) {
    let text = m[2].trim();
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).replace(/""/g, '"');
    const ms = Date.parse(m[3]);
    if (!Number.isFinite(ms)) continue;
    out.push({ ms, iso: m[3], channel: m[1], text, censored: text, wasCensored: /\*{2,}/.test(text), source: 'pdf' });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

const QUEUE_RE = /^THE FINALS - (.+?)\s*Queue$/;

function parseTicketBlock(lines, ctx) {
  const ticket = {
    queue: ctx.queue,
    tags: [],
    intent: null,
    resolvedAtMs: null,
    approxStartMs: null,
    attachmentCount: 0,
    attachments: [],
    messages: [],
  };
  let resolvedOffset = null;
  let pendingResolved = false;
  let lastStampOffset = null; // most recent day offset seen — the "Resolved" line's own stamp precedes it
  const buf = [];

  const flush = (meta = {}) => {
    let text = buf.join('\n').trim();
    buf.length = 0;
    let name = meta.name ?? null;
    if (!text && !name) return;

    // The sender line can also arrive as the buffer's LAST line (stamp on its own
    // line below it) — pop it off when it matches a known sender.
    if (!name) {
      const parts = text.split('\n');
      const last = parts[parts.length - 1]?.trim();
      if (parts.length > 1 && last && isKnownSender(last, ctx.identityName)) {
        name = last;
        text = parts.slice(0, -1).join('\n').trim();
      }
    }

    const flat = text.replace(/\n/g, ' ').trim();

    // Attachments render as "Attachment sent / No malware found / <filename?>",
    // attributed to the uploader — treat as a system event whoever sent it.
    if (/^Attachment sent/i.test(flat)) {
      ticket.attachmentCount += 1;
      const fname = flat.replace(/^Attachment sent/i, '').replace(/No malware found/i, '').trim() || null;
      if (fname) ticket.attachments.push(fname);
      ticket.messages.push({ who: 'system', name: null, text: fname ? `Attachment sent · ${fname}` : 'Attachment sent', dayOffset: meta.dayOffset ?? null, approxMs: null, sentMs: null, attachment: true });
      return;
    }

    // Whole-buffer system events ("Resolved", "Issue Created", bot lifecycle …)
    if (text && !name && isSystemText(flat)) {
      if (/^Resolved$/i.test(flat)) {
        pendingResolved = true;
        if (meta.dayOffset != null) resolvedOffset = meta.dayOffset;
      }
      ticket.messages.push({ who: 'system', name: null, text: flat, dayOffset: meta.dayOffset ?? null, approxMs: null, sentMs: null });
      return;
    }

    // The intent block renders as "Intent\n<category>\n<choice…>"
    if (/^Intent$/i.test(text.split('\n')[0]?.trim() || '')) {
      const parts = text.split('\n').map((s) => s.trim()).filter(Boolean);
      ticket.intent = parts[1] || null;
      text = parts.slice(2).join('\n');
      if (!text && !name) return;
    }

    let who = 'agent';
    let display = name;
    if (name && isPlayerName(name, ctx.identityName)) who = 'you';
    else if (name && isBotName(name)) who = 'bot';
    else {
      // Agent identity is usually only in the sign-off.
      const signoff = /(?:kind|best|warm)\s+regards,?\s*\n\s*(.+)/i.exec(text);
      if (signoff) display = signoff[1].trim();
      else if (!name) display = null;
    }
    ticket.messages.push({
      who, name: display, text,
      dayOffset: meta.dayOffset ?? null,
      approxMs: null,
      sentMs: meta.sentMs ?? null,
      readMs: meta.readMs ?? null,
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || stripJunk(line).trim() === '') continue;

    // Bare "Resolved" line (its own stamp is the one just before it), then
    // "On June-25-2026 09:09 AM" — the ticket's only absolute timestamp.
    if (/^Resolved$/i.test(line)) {
      flush({});
      buf.push('Resolved');
      flush({ dayOffset: lastStampOffset });
      continue;
    }
    if (pendingResolved && /^On\s+[A-Za-z]+-\d/.test(line)) {
      ticket.resolvedAtMs = parseLongDate(line.replace(/^On\s+/, ''));
      pendingResolved = false;
      continue;
    }

    // helpshift tags row ("tf_general tf_tier1 …")
    if (!ticket.messages.length && !buf.length && /^(tf_\w+\s*)+$/.test(line)) {
      ticket.tags = line.split(/\s+/).filter(Boolean);
      continue;
    }

    const off = stampOnly(line);
    if (off != null) { lastStampOffset = off; flush({ dayOffset: off }); continue; }

    const sr = /^Sent\s+(.+?)(?:\s*[�•·|]\s*Read\s+(.+))?$/.exec(stripJunk(line).trim());
    if (sr && parseLongDate(sr[1]) != null) {
      flush({ sentMs: parseLongDate(sr[1]), readMs: sr[2] ? parseLongDate(sr[2]) : null });
      continue;
    }

    // "<Sender> 15dago [� 15dago]" — sender + stamp on one line
    const ns = /^(.{1,48}?)\s+(\d+)\s*d\s*ago\b/.exec(stripJunk(line));
    if (ns && !/[.!?]/.test(ns[1]) && stripJunk(line).slice(ns[0].length).replace(STAMP_G, ' ').trim() === '') {
      const namePart = ns[1].trim();
      lastStampOffset = parseInt(ns[2], 10);
      if (isSystemText(namePart)) {
        flush({});
        buf.push(namePart);
        flush({ dayOffset: lastStampOffset });
      } else {
        flush({ name: namePart, dayOffset: lastStampOffset });
      }
      continue;
    }

    buf.push(line);
  }
  flush({});

  // Anchor the relative day offsets. Best: the Resolved event's own offset against
  // its absolute date; fallback: the PDF's creation date, then the README date.
  const anchorMs = ticket.resolvedAtMs != null && resolvedOffset != null
    ? ticket.resolvedAtMs + resolvedOffset * DAY_MS
    : ctx.creationDateMs ?? ctx.fallbackMs ?? null;
  if (anchorMs != null) {
    for (const msg of ticket.messages) {
      if (msg.approxMs == null && msg.dayOffset != null) msg.approxMs = anchorMs - msg.dayOffset * DAY_MS;
    }
  }
  const times = ticket.messages.map((msg) => msg.sentMs ?? msg.approxMs).filter((t) => t != null);
  ticket.approxStartMs = times.length ? Math.min(...times) : null;
  return ticket;
}

export function parseCsText(lines, { creationDateMs = null, fallbackMs = null, identityName = null } = {}) {
  const ticketIdx = lines.findIndex((l) => /^TICKET HISTORY$/i.test(l.trim()));
  const chatLines = (ticketIdx === -1 ? lines : lines.slice(0, ticketIdx))
    .filter((l) => !/^(CHAT HISTORY|type,message,time)$/i.test(l.trim()));
  const chat = parseChatBlob(chatLines.join('\n'));

  const tickets = [];
  if (ticketIdx !== -1) {
    const rest = lines.slice(ticketIdx + 1);
    const starts = [];
    rest.forEach((l, i) => { if (QUEUE_RE.test(l.trim())) starts.push(i); });
    starts.forEach((s, qi) => {
      const block = rest.slice(s + 1, qi + 1 < starts.length ? starts[qi + 1] : rest.length);
      const queue = QUEUE_RE.exec(rest[s].trim())[1];
      try {
        const t = parseTicketBlock(block, { queue, creationDateMs, fallbackMs, identityName });
        if (t.messages.length === 0 && block.join('').trim()) {
          tickets.push({ queue, tags: t.tags, parseFallback: true, rawText: block.join('\n'), messages: [], attachmentCount: 0, resolvedAtMs: t.resolvedAtMs, approxStartMs: null, intent: null });
        } else {
          tickets.push(t);
        }
      } catch {
        tickets.push({ queue, tags: [], parseFallback: true, rawText: block.join('\n'), messages: [], attachmentCount: 0, resolvedAtMs: null, approxStartMs: null, intent: null });
      }
    });
  }
  return { chat, tickets, creationDateMs };
}

// --- public API ---------------------------------------------------------------

// One parse per imported file: keyed on the bytes object itself, so a re-import
// naturally invalidates and the old result stays GC-able.
const cache = new WeakMap();

export function parseCsPdf(support, opts = {}) {
  if (!support?.bytes) return Promise.resolve(null);
  let p = cache.get(support.bytes);
  if (!p) {
    p = extractPdf(support.bytes, opts.onProgress)
      .then(({ lines, creationDateMs }) => parseCsText(lines, { ...opts, creationDateMs }))
      .catch((err) => ({ chat: [], tickets: [], parseError: err?.message || 'Could not read this PDF' }));
    cache.set(support.bytes, p);
  }
  return p;
}
