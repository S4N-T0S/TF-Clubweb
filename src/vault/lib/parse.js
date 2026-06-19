// Decode a classified fileset into raw, typed records.
// Pure-ish (only touches the event loop to yield); safe to move into a Web Worker later if need
import { entryText } from './ingest';

const yieldToEventLoop = () => new Promise((r) => setTimeout(r, 0));

// JSON Lines: each line is `{"<RecordType>": {...}}` (one top-level key).
// Returns { byType: { RecordType: [...inner records] }, counts, total, badLines }.
async function parseJsonl(text, onProgress = () => {}, label = 'records') {
  const byType = {};
  let total = 0;
  let badLines = 0;

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
    const type = keys[0];
    if (!type) continue;
    const inner = obj[type];
    // Standard records are { "<RecordType>": {...} } — exactly one top-level key
    // whose value is the record object. A few rows are FLAT (no wrapper): the
    // Steam DLC ownership row is { SteamID, DLCID, ... }. Bucket those under a
    // synthetic type so the model can find them — otherwise the first field name
    // (e.g. "SteamID") would be mistaken for the record type and its scalar value
    // pushed in place of the record.
    if (keys.length === 1 && inner && typeof inner === 'object' && !Array.isArray(inner)) {
      (byType[type] ||= []).push(inner);
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
  return { byType, counts, total, badLines };
}

// Minimal CSV: Anybrain files (os/screens/sessions are simple columns)
function parseCsv(text) {
  if (!text) return [];
  const rows = text.split(/\r?\n/).filter((r) => r.trim().length);
  if (rows.length === 0) return [];
  const header = rows[0].split(',').map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const cells = r.split(',');
    const obj = {};
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

  const anybrain = {
    os: parseCsv(entryText(fileset.anybrain.os)),
    screens: parseCsv(entryText(fileset.anybrain.screens)),
    sessions: parseCsv(entryText(fileset.anybrain.sessions)),
  };

  // Denuvo files are single-object JSON (despite .jsonl)
  const denuvo = fileset.denuvo.map((e) => safeJson(entryText(e))).filter(Boolean);

  // Request metadata parsed from the README pdf filename (date/ticket), if present
  const readme = fileset.readme || null;

  return { persistence, audit, eos, anybrain, denuvo, readme };
}
