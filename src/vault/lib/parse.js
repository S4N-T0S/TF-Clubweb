// Decode a classified fileset into raw, typed records.
// Pure-ish (only touches the event loop to yield); safe to move into a Web Worker later if need
import { entryText } from './ingest';
import { classifyRoundStat, ROUND_KIND } from './realms';

const yieldToEventLoop = () => new Promise((r) => setTimeout(r, 0));

// `RoundStat` is written by both games an Embark account can own, with unrelated
// payloads (see `classifyRoundStat`). Split on the way in; ARC and unrecognised
// rows are preserved verbatim and go unread until the vault surfaces ARC data.
const ROUND_STAT_BUCKETS = {
  [ROUND_KIND.FINALS]: 'RoundStat',
  [ROUND_KIND.ARC]: 'ArcRoundStat',
  [ROUND_KIND.UNKNOWN]: 'UnknownRoundStat',
};

// Since 2026-09 game-scoped types carry their title (`TheFinalsRoundStat`). Stripping
// it here makes both generations look alike downstream. ARC Raiders keeps its prefix:
// bare, it would collide with THE FINALS' own types, as it did in older exports.
const canonicalType = (type) => {
  if (type === 'ArcRaidersRoundStat') return ROUND_STAT_BUCKETS[ROUND_KIND.ARC];
  return type.length > 9 && type.startsWith('TheFinals') ? type.slice(9) : type;
};

// JSON Lines: each line is `{"<RecordType>": {...}}` (one top-level key).
// Returns { byType: { RecordType: [...inner records] }, counts, total, badLines }.
async function parseJsonl(text, onProgress = () => {}, label = 'records', rename = canonicalType) {
  // Null prototype: the record type is whatever key the line carried, so a
  // "__proto__" / "constructor" line would otherwise hit an inherited member
  // (truthy, so `||=` keeps it) and `.push` on it throws.
  const byType = Object.create(null);
  let total = 0;
  let badLines = 0;
  let gamePrefixed = false;

  // Split lazily-ish: one big split is fine for tens of MB; yield while iterating so the UI thread stays responsive.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    const keys = Object.keys(obj);
    if (!keys[0]) continue;
    const inner = obj[keys[0]];
    const type = rename(keys[0]);
    if (!gamePrefixed && /^(TheFinals|ArcRaiders)/.test(keys[0])) gamePrefixed = true;
    // Standard records are { "<RecordType>": {...} } — exactly one top-level key
    // whose value is the record object. A few rows are FLAT (no wrapper): the
    // Steam DLC ownership row is { SteamID, DLCID, ... }. Bucket those under a
    // synthetic type so the model can find them — otherwise the first field name
    // (e.g. "SteamID") would be mistaken for the record type and its scalar value
    // pushed in place of the record.
    if (keys.length === 1 && inner && typeof inner === 'object' && !Array.isArray(inner)) {
      (byType[type === 'RoundStat' ? ROUND_STAT_BUCKETS[classifyRoundStat(inner)] : type] ||= []).push(inner);
    } else {
      (byType['DLCID' in obj ? 'SteamDLC' : `Flat:${type}`] ||= []).push(obj);
    }
    total++;

    if ((i & 2047) === 0) {
      onProgress(`Parsing ${label}… ${Math.round((i / lines.length) * 100)}%`);
      await yieldToEventLoop();
    }
  }

  const counts = Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length]));
  return { byType, counts, total, badLines, gamePrefixed };
}

// Minimal CSV: Anybrain files (os/screens/sessions are simple columns)
function parseCsv(text) {
  if (!text) return [];
  const rows = text.split(/\r?\n/).filter((r) => r.trim().length);
  if (rows.length === 0) return [];
  const header = rows[0].split(',').map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const cells = r.split(',');
    const obj = Object.create(null); // header names come from the file, same reason as byType
    header.forEach((h, i) => (obj[h] = (cells[i] ?? '').trim()));
    return obj;
  });
}

const safeJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * Parse a classified fileset (from ingest.js) into raw typed records
 * @param {object} fileset
 * @param {(msg:string)=>void} [onProgress]
 */
export async function parseFileset(fileset, onProgress = () => {}) {
  onProgress('Parsing persistence…');
  const persistence = await parseJsonl(entryText(fileset.persistence), onProgress, 'persistence');

  let audit = null;
  if (fileset.audit) {
    onProgress('Parsing audit…');
    audit = await parseJsonl(entryText(fileset.audit), onProgress, 'audit');
  }

  const eos = {
    anticheat: fileset.eos.anticheat.map((e) => safeJson(entryText(e))).filter(Boolean),
    linkedAccounts: fileset.eos.linkedAccounts.map((e) => safeJson(entryText(e))).filter(Boolean),
  };

  const anybrainCsv = (entries) => entries.flatMap((e) => parseCsv(entryText(e)));
  const anybrain = {
    os: anybrainCsv(fileset.anybrain.os),
    screens: anybrainCsv(fileset.anybrain.screens),
    sessions: anybrainCsv(fileset.anybrain.sessions),
    peripherals: anybrainCsv(fileset.anybrain.peripherals),
  };

  // Denuvo files are single-object JSON (despite .jsonl)
  const denuvo = fileset.denuvo.map((e) => safeJson(entryText(e))).filter(Boolean);

  // Request metadata parsed from the README pdf filename (date/ticket), if present
  const readme = fileset.readme || null;

  // Embark's id -> name lookup, under its own type names (lib/keys.js reads those).
  let keys = null;
  if (fileset.keys?.length) {
    onProgress('Reading item keys…');
    const byType = Object.create(null);
    for (const e of fileset.keys) {
      const parsed = await parseJsonl(entryText(e), onProgress, 'item keys', (t) => t);
      for (const [t, rows] of Object.entries(parsed.byType)) byType[t] = (byType[t] || []).concat(rows);
    }
    keys = { byType };
  }

  // Customer-Service PDF: passed through as raw bytes — parsing it needs pdfjs,
  // which stays out of the import path (the Support page lazy-parses on demand).
  const customerSupport = fileset.customerSupport
    ? { name: fileset.customerSupport.path, bytes: fileset.customerSupport.bytes, size: fileset.customerSupport.bytes.length }
    : null;

  return { persistence, audit, eos, anybrain, denuvo, readme, customerSupport, keys };
}
