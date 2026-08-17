// Customer-Service export (CS_extracted_data.pdf) — lazy extractor + parser.
//
// Only ever import this module dynamically (like geoip.js): pdfjs-dist is heavy
// and most exports don't include the CS component at all.
//
// TWO layouts exist and share no structure, so there are two parsers below:
//
// 1. "Helpshift console print" (Skia/Google Docs producer, exports up to ~mid
//    2026). Two sections: "CHAT HISTORY" (a literal CSV: type,message,time —
//    the player's own in-game chat, profanity starred) and "TICKET HISTORY"
//    (Helpshift support-ticket transcripts).
// 2. "Customer Support Data Export" (ReportLab producer, newer exports —
//    Embark now generate the file themselves). See parseCsExport below.
//
// Layout 1 quirks this parser is built around (verified on a real export):
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

// Neither layout ever names the agent in a header — the only place their handle
// appears is the sign-off at the very end of the reply ("Kind regards, Blade").
// Take the LAST closing phrase (agents write "with regards to …" mid-reply too)
// and accept the tail only if it still looks like a name.
const CLOSING_G = /(?:kind|kindest|best|warm|warmest)?\s*(?:regards|sincerely|cheers)[,.!:]*[ \t\n]+/gi;
// Handles run to non-ASCII capitals and underscores ("Émile", "Blade_TF").
const NAME_RE = /^\p{Lu}[\p{L}\p{N}'’._-]*(?:[ \t]+\p{Lu}[\p{L}\p{N}'’._-]*){0,2}$/u;
// A lower-case handle ("xX_sniper_Xx") is only distinguishable from an ordinary
// word ("Cheers, mate") by its punctuation, digits or inner caps.
const HANDLE_RE = /^\p{L}[\p{L}\p{N}'’._-]*$/u;
const HANDLEISH_RE = /[_\d]|\p{Ll}\p{Lu}/u;
// "Cheers, / The Support Team" signs off as a department, not a person.
const TEAM_TAIL_RE = /\b(team|support|studios|staff|crew)\b/i;
// Layout B reflows the line breaks away, so a signature block arrives as
// "Best regards, Blade THE FINALS Support Team" on one line.
const FOOTER_TAIL_RE = /\s+(?:the\s+)?(?:THE FINALS\s+|Embark(?:\s+Studios)?\s+)?(?:customer\s+|player\s+)?(?:support|service)\s+team\.?$/i;
const STOPWORD_RE = /^(the|a|an|our|your|my|we|us|i|all|thanks|thank|yours|sincerely|regards|cheers)$/i;
// Stripping the footer off "THE FINALS Support Team" leaves the brand, which
// otherwise passes as a handle.
const BRAND_RE = /^(the\s+)?(finals|embark(\s+studios)?)$/i;
const signoffName = (text) => {
  let m;
  let last = null;
  CLOSING_G.lastIndex = 0;
  while ((m = CLOSING_G.exec(text))) last = m;
  if (!last) return null;
  // Anything past the first line break is a team footer, not the name.
  const tail = text.slice(last.index + last[0].length).split('\n')[0].trim().replace(FOOTER_TAIL_RE, '');
  // A trailing full stop is sentence punctuation unless the handle is initials.
  const name = /\.\w/.test(tail) ? tail : tail.replace(/[.!]$/, '');
  const looksLikeName = NAME_RE.test(name) || (HANDLE_RE.test(name) && HANDLEISH_RE.test(name));
  const isNotAPerson = TEAM_TAIL_RE.test(name) || STOPWORD_RE.test(name) || BRAND_RE.test(name);
  return looksLikeName && !isNotAPerson ? name : null;
};

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
    // `isKnownSender` also accepts "Helpshift Support", which is neither player
    // nor bot — keep that captured name when there's no sign-off to beat it.
    else display = signoffName(text) ?? name;
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

// --- layout 2: "Customer Support Data Export" (ReportLab) --------------------
// Newer exports are generated by Embark rather than printed from the Helpshift
// console, and nothing about the old parser applies:
// - There is NO chat section at all. In-game chat now only reaches the vault
//   through the audit log's ChatMessageSent rows.
// - Tickets are numbered blocks ("Ticket #198987 · 1 of 6"), each opening with
//   a key/value detail table that carries EXACT UTC created/updated/resolved
//   stamps — so none of the day-offset anchoring is needed here.
// - The sender line comes BEFORE its message (the old layout put it after) and
//   is always present, but there are no per-message timestamps whatsoever.
// - Message text is hard-wrapped to the column width, so it has to be re-flowed
//   into one paragraph instead of keeping the extracted line breaks.
// - Every page ends with an "Embark Studios Page N" footer.

const EXPORT_TITLE_RE = /^Customer Support Data Export$/i;
// The header line and nothing else — "· 1 of 6" is absent on single-ticket exports.
const EXPORT_TICKET_RE = /^Ticket\s+#(\d+)(?:\s*[^\w\s]?\s*\d+\s+of\s+\d+)?\s*$/i;
const EXPORT_FOOTER_RE = /^Embark Studios\s+Page\s+\d+$/i;
const EXPORT_SECTIONS = /^(TICKET DETAILS|ADDITIONAL INFORMATION|SESSION AND DEVICE|CONVERSATION)$/;
const EXPORT_STAFF_RE = /^Embark Studios\s*[-–—]\s*(.{1,40})$/;
// Embark IDs are a single token plus discriminator; a wrapped body line never is.
const EXPORT_ID_RE = /^\S{1,24}#\d{3,4}$/;
// The subject's own ID, off the cover sheet / each ticket's ADDITIONAL INFORMATION.
const EXPORT_SUBJECT_RE = /^EMBARK ID\s+(\S.*)$/;

// Sniff off the opening pages, not a ticket header anywhere in the file:
// players quote ticket numbers back at support, and misrouting a Layout A file
// loses every ticket and chat row in it.
const LAYOUT_A_RE = /^(CHAT HISTORY|TICKET HISTORY)$/i;
export const isCsExportLayout = (lines) => {
  const trimmed = lines.map((l) => l.trim());
  const head = trimmed.slice(0, 200);
  if (head.some((s) => EXPORT_TITLE_RE.test(s))) return true;
  if (head.some((s) => LAYOUT_A_RE.test(s))) return false;
  // Last resort: same corroboration the block splitter uses.
  return trimmed.some((s, i) => EXPORT_TICKET_RE.test(s)
    && trimmed.slice(i + 1, i + 5).filter((n) => n && !EXPORT_FOOTER_RE.test(n)).includes('TICKET DETAILS'));
};

// '2025-09-13 18:48:21 UTC' -> ms. Stamps are labelled UTC today, but honour an
// explicit offset if one ever appears rather than silently reading it as UTC.
const parseUtcStamp = (str) => {
  const s = String(str || '');
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  // Reject out-of-range fields; Date.UTC would roll them into a wrong date.
  const [mo, d, h, mi, sec] = [+m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  const ms = Date.UTC(+m[1], mo - 1, d, h, mi, sec);
  const off = /([+-])(\d{2}):?(\d{2})\)?\s*$/.exec(s.slice(m.index + m[0].length));
  if (!off) return ms;
  const delta = (+off[2] * 60 + +off[3]) * 60000;
  return off[1] === '+' ? ms - delta : ms + delta;
};

// The detail tables are two columns, so extraction gives "<LABEL> <value>" per row.
// TICKET DETAILS has a fixed vocabulary we map onto named fields; the other two
// blocks are open-ended, so they're kept as ordered label/value rows instead.
const DETAIL_KEYS = ['TICKET ID', 'LAST UPDATED', 'CSAT RATING', 'ATTACHMENTS', 'USER EMAIL', 'RESOLVED', 'CHANNEL', 'CREATED', 'STATE', 'GAME'];
const SECTION_OF = {
  'TICKET DETAILS': 'details',
  'ADDITIONAL INFORMATION': 'extra',
  'SESSION AND DEVICE': 'session',
  CONVERSATION: 'conversation',
};
// ADDITIONAL INFORMATION only ever repeats identity we already show; anything
// else Helpshift was configured to collect is worth keeping.
const EXTRA_SKIP = /^(EMBARK ID|EMAIL|GAME)$/;

// Longest first. Without the source x-coordinates an all-upper-case VALUE is
// indistinguishable from more label ("GAME THE FINALS", "COUNTRY UNITED
// STATES"), so known labels are matched before falling back to the heuristic.
const KNOWN_ROW_LABELS = [
  'DEVELOPER-SET LANGUAGE', 'DETECTED LANGUAGE', 'DEVICE LANGUAGE', 'OPERATING SYSTEM',
  'BROWSER VERSION', 'PAGE TITLE', 'OS VERSION', 'EMBARK ID', 'PAGE URL', 'TIMEZONE',
  'LANGUAGE', 'PLATFORM', 'COUNTRY', 'BROWSER', 'EMAIL', 'GAME',
];
const CAPS_TOKEN = /^[A-Z][A-Z0-9-]*$/;
// A label too wide for its column wraps onto the next line, leaving its value
// behind on the first ("DEVELOPER-SET en" then a bare "LANGUAGE").
function pushCapsRow(rows, line) {
  const parts = line.split(' ');
  let n = 0;
  while (n < parts.length && CAPS_TOKEN.test(parts[n])) n += 1;

  // A lone upper-case word is the tail of the previous row's wrapped label.
  if (parts.length === 1) {
    if (rows.length && n === 1) rows[rows.length - 1].label += ` ${line}`;
    return;
  }
  // The boundary is ambiguous only when every token is upper-case. Consulting
  // known labels earlier lets short ones ("GAME") swallow longer real labels
  // ("GAME MODE Ranked").
  if (n === parts.length) {
    const known = KNOWN_ROW_LABELS.find((k) => line.startsWith(`${k} `));
    n = known ? known.split(' ').length : n - 1;
  }
  const label = parts.slice(0, n).join(' ');
  const value = parts.slice(n).join(' ').trim();
  if (label && value) rows.push({ label, value });
}

// The subject is the only player who can send here, so match their ID exactly.
// Shape-matching would consume third-party IDs quoted in bodies (a cheater
// report is a bare "Someone#2005" line); a consumed sender line is not rendered.
const exportSender = (line, ctx) => {
  const staff = EXPORT_STAFF_RE.exec(line);
  if (staff) {
    const role = staff[1].trim();
    return { who: /automation|bot/i.test(role) ? 'bot' : 'agent', role };
  }
  if (ctx.subjectIds.size) return ctx.subjectIds.has(line) ? { who: 'you', role: null } : null;
  // No cover sheet and no identity to go on: fall back to the shape.
  return EXPORT_ID_RE.test(line) ? { who: 'you', role: null } : null;
};

// Every emitted shape carries the full field set, fallbacks included, so no
// caller has to guard per-field.
const EXPORT_TICKET_BASE = {
  ticketId: null,
  queue: null,
  tags: [],
  intent: null,
  state: null,
  channel: null,
  csat: null,
  game: null,
  userEmail: null,
  createdAtMs: null,
  updatedAtMs: null,
  resolvedAtMs: null,
  approxStartMs: null,
  attachmentCount: 0,
  attachments: [],
  attachmentsWithheld: false,
  // The browser/OS/timezone Helpshift captured when the ticket was filed, plus
  // any other custom fields — data the older layout never carried at all.
  session: [],
  extra: [],
  messages: [],
};

function parseExportTicketBlock(ticketId, lines, ctx) {
  const ticket = { ...EXPORT_TICKET_BASE, ticketId, tags: [], attachments: [], session: [], extra: [], messages: [] };
  let section = 'details';
  let sender = null;
  let sawYou = false;
  let seenConversation = false;
  const buf = [];

  const push = (msg) => ticket.messages.push({ dayOffset: null, approxMs: null, sentMs: null, readMs: null, ...msg });

  const flush = () => {
    let text = buf.join(' ').replace(/\s+/g, ' ').trim();
    buf.length = 0;
    if (!text) return;
    // Preamble before any recognised sender: show it unattributed rather than
    // dropping it, so an unfamiliar sender line can never erase a message.
    if (!sender) { push({ who: 'system', name: null, text }); return; }
    // Set before the attachment early-return, or an attachment-only first turn
    // leaves the menu-pick guard armed for the next real message.
    const firstFromYou = sender.who === 'you' && !sawYou;
    if (sender.who === 'you') sawYou = true;

    // Marker only: this layout carries no filenames. Trailing text is a real
    // message sharing the turn.
    const att = /^Attachment sent\b[.,]?\s*/i.exec(text);
    if (att) {
      ticket.attachmentCount += 1;
      push({ who: 'system', name: null, text: 'Attachment sent', attachment: true });
      text = text.slice(att[0].length).trim();
      if (!text) return;
    }

    // The opening menu pick renders as "<category> -> <choice>", the old
    // layout's "Intent" block. Guarded hard — a false positive deletes the front
    // of a real message and promotes it to the ticket title: subject's first
    // message only, short, one arrow, left side a menu label rather than prose.
    let body = text;
    if (firstFromYou && text.length <= 120 && text.split('->').length === 2) {
      const menu = /^([^.,!?]{1,40}?)\s*->\s*(.+)$/.exec(text);
      if (menu && menu[1].trim().split(/\s+/).every((w) => /^[A-Z0-9]/.test(w))) {
        ticket.intent = menu[1].trim();
        body = menu[2].trim();
      }
    }

    push({
      who: sender.who,
      name: sender.who === 'agent' ? signoffName(body) : sender.who === 'bot' ? sender.role : null,
      text: body,
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || EXPORT_FOOTER_RE.test(line)) continue;

    if (EXPORT_SECTIONS.test(line)) {
      section = SECTION_OF[line];
      if (section === 'conversation') seenConversation = true;
      continue;
    }

    // A second detail table means an uncorroborated "Ticket #N" header let the
    // next block merge into this one; ignore it rather than overwrite.
    if (section !== 'conversation' && seenConversation) continue;

    if (section === 'session') { pushCapsRow(ticket.session, line); continue; }
    if (section === 'extra') {
      const before = ticket.extra.length;
      pushCapsRow(ticket.extra, line);
      if (ticket.extra.length > before && EXTRA_SKIP.test(ticket.extra[before].label)) ticket.extra.pop();
      continue;
    }

    if (section !== 'conversation') {
      const key = DETAIL_KEYS.find((k) => line.startsWith(`${k} `));
      // Keep anything Embark adds to the detail table rather than dropping it.
      if (!key) { pushCapsRow(ticket.extra, line); continue; }
      const v = line.slice(key.length + 1).trim();
      if (key === 'TICKET ID') ticket.ticketId = v || ticket.ticketId;
      else if (key === 'STATE') ticket.state = v;
      else if (key === 'CHANNEL') ticket.channel = v;
      else if (key === 'GAME') ticket.game = v;
      else if (key === 'USER EMAIL') ticket.userEmail = v;
      else if (key === 'CREATED') ticket.createdAtMs = parseUtcStamp(v);
      else if (key === 'LAST UPDATED') ticket.updatedAtMs = parseUtcStamp(v);
      else if (key === 'RESOLVED') ticket.resolvedAtMs = parseUtcStamp(v);
      else if (key === 'CSAT RATING') ticket.csat = Number.isFinite(parseFloat(v)) ? parseFloat(v) : null;
      // "Yes (not included in this export)" — the files themselves are withheld,
      // but the transcript still marks where each one was sent.
      else if (key === 'ATTACHMENTS') ticket.attachmentsWithheld = !!v && !/^(none|no|n\/a|0|-|—)$/i.test(v);
      continue;
    }

    const next = exportSender(line, ctx);
    if (next) { flush(); sender = next; continue; }
    buf.push(line);
  }
  flush();

  ticket.approxStartMs = ticket.createdAtMs;
  return ticket;
}

export function parseCsExport(lines, { identityName = null } = {}) {
  const trimmed = lines.map((l) => l.trim());

  // Players quote ticket numbers, so a "Ticket #N" line is only a block start
  // when its detail table follows.
  const starts = [];
  trimmed.forEach((s, i) => {
    const m = EXPORT_TICKET_RE.exec(s);
    if (!m) return;
    const follows = trimmed.slice(i + 1, i + 5).filter((n) => n && !EXPORT_FOOTER_RE.test(n));
    if (follows.includes('TICKET DETAILS')) starts.push({ i, id: m[1] });
  });

  // Detail tables only: an "EMBARK ID …" line inside a message body would
  // register a third party as the subject.
  const subjectIds = new Set();
  if (identityName) subjectIds.add(identityName);
  let inConversation = false;
  for (const s of trimmed) {
    if (EXPORT_TICKET_RE.test(s)) { inConversation = false; continue; }
    if (EXPORT_SECTIONS.test(s)) { inConversation = s === 'CONVERSATION'; continue; }
    if (inConversation) continue;
    const m = EXPORT_SUBJECT_RE.exec(s);
    if (m) subjectIds.add(m[1].trim());
  }
  const ctx = { identityName, subjectIds };

  // Layout recognised but headers not: surface the text, not an empty page.
  if (!starts.length) {
    const rawText = trimmed.filter((s) => s && !EXPORT_FOOTER_RE.test(s)).join('\n');
    return { layout: 'export', chat: [], tickets: rawText ? [{ ...EXPORT_TICKET_BASE, parseFallback: true, rawText }] : [] };
  }

  const tickets = starts.map(({ i, id }, n) => {
    const block = lines.slice(i + 1, n + 1 < starts.length ? starts[n + 1].i : lines.length);
    const rawText = block.map((l) => l.trim()).filter((s) => s && !EXPORT_FOOTER_RE.test(s)).join('\n');
    try {
      const t = parseExportTicketBlock(id, block, ctx);
      return t.messages.length ? t : { ...t, parseFallback: true, rawText };
    } catch {
      return { ...EXPORT_TICKET_BASE, ticketId: id, parseFallback: true, rawText };
    }
  });

  return { layout: 'export', chat: [], tickets };
}

export function parseCsText(lines, { creationDateMs = null, fallbackMs = null, identityName = null } = {}) {
  if (isCsExportLayout(lines)) return { ...parseCsExport(lines, { identityName }), creationDateMs };

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
  return { layout: 'helpshift', chat, tickets, creationDateMs };
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
