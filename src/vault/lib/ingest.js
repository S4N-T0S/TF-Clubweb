// File ingestion: takes the File objects a user drops/picks (the SAR zip, a
// folder of pre-extracted files, or any mix) and produces a flat, classified
// fileset. Everything runs in the browser — nothing is uploaded.
import { unzip, strFromU8 } from 'fflate';

const readFileBytes = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result));
    r.onerror = () => reject(r.error || new Error(`Could not read ${file.name}`));
    r.readAsArrayBuffer(file);
  });

const unzipAsync = (bytes) =>
  new Promise((resolve, reject) => {
    // fflate's async unzip runs off the main thread for large archives.
    unzip(bytes, (err, data) => (err ? reject(err) : resolve(data)));
  });

const isZip = (name) => /\.zip$/i.test(name);
const rawBasename = (p) => p.split(/[\\/]/).pop();
const basename = (p) => rawBasename(p).toLowerCase();

// The SAR README is usually named `README_<DD Month_YYYY>(<id>).pdf`, but some
// exports mangle it to `README <DD Month YYYY> <id>.pdf` (bare id, no parens).
// The `(id)` must sit directly against the year: a separator before parens means
// a duplicate-download suffix (`README … 1259 (1).pdf`), not the request id.
const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};
function parseReadmeName(name) {
  const m = name.match(/readme[_ ]+(\d{1,2})[_ ]+([a-z]+)[_ ]+(\d{4})(?:\((\d+)\)|[_ ]+(\d+))?/i);
  if (!m) return null;
  const monthKey = m[2].toLowerCase();
  const month = Object.hasOwn(MONTHS, monthKey) ? MONTHS[monthKey] : null;
  if (month == null) return null;
  const day = Number(m[1]);
  const year = Number(m[3]);
  const monthName = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
  return {
    requestedAtMs: Date.UTC(year, month, day),
    requestId: m[4] ?? m[5] ?? null,
    label: `${day} ${monthName} ${year}`,
  };
}

// Recursively expand an entry, unzipping nested archives, into a flat list.
async function expandEntry(path, bytes, out, depth = 0) {
  if (isZip(path) && depth < 8) {
    let entries;
    try {
      entries = await unzipAsync(bytes);
    } catch {
      out.push({ path, bytes }); // not a readable zip — keep raw
      return;
    }
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith('/') || data.length === 0) continue; // skip dir entries
      await expandEntry(`${path}/${name}`, data, out, depth + 1);
    }
    return;
  }
  out.push({ path, bytes });
}

// Assign each flat file to a SAR component role by filename convention.
function classify(flat) {
  const fileset = {
    persistence: null,
    audit: null,
    eos: { anticheat: [], linkedAccounts: [] },
    anybrain: { os: [], screens: [], sessions: [], peripherals: [] }, // arrays: exports can split across anybrain_clean_N.zip
    denuvo: [],
    readme: null, // { requestedAtMs, requestId, label } parsed from the README pdf name
    customerSupport: null, // CS_extracted_data.pdf raw bytes (chat log + support tickets)
    unknown: [],
    all: flat,
  };

  for (const entry of flat) {
    const base = basename(entry.path);

    if (base.startsWith('readme') && base.endsWith('.pdf')) {
      // Capture the request date/ticket from the filename; ignore the PDF bytes.
      // With several readme-ish pdfs (duplicate downloads), prefer a parse that
      // carries a request id over a date-only one, regardless of file order.
      const parsed = parseReadmeName(rawBasename(entry.path));
      if (parsed && (!fileset.readme || (parsed.requestId && !fileset.readme.requestId))) fileset.readme = parsed;
    } else if (base.endsWith('.pdf') && (base.startsWith('cs_') || base.includes('extracted_data'))) {
      // Customer-Service export: in-game chat log + Helpshift support tickets.
      // Bytes are kept raw here; the Support page lazy-parses them (pdfjs).
      if (!fileset.customerSupport || entry.bytes.length > fileset.customerSupport.bytes.length) fileset.customerSupport = entry;
    } else if (/persistence\.(jsonl|json|txt)$/.test(base) || (base.includes('persistence') && /\.(jsonl|txt)$/.test(base))) {
      // Prefer the largest persistence file if several appear.
      if (!fileset.persistence || entry.bytes.length > fileset.persistence.bytes.length) fileset.persistence = entry;
    } else if (base.includes('audit') && /\.(jsonl|json|txt)$/.test(base)) {
      if (!fileset.audit || entry.bytes.length > fileset.audit.bytes.length) fileset.audit = entry;
    } else if (base.startsWith('anticheat') && base.endsWith('.json')) {
      fileset.eos.anticheat.push(entry);
    } else if (base === 'linkedaccounts.json') {
      fileset.eos.linkedAccounts.push(entry);
    } else if (base === 'os.csv') {
      fileset.anybrain.os.push(entry);
    } else if (base === 'screens.csv') {
      fileset.anybrain.screens.push(entry);
    } else if (base === 'sessions.csv') {
      fileset.anybrain.sessions.push(entry);
    } else if (base === 'peripherals.csv') {
      fileset.anybrain.peripherals.push(entry);
    } else if (base.includes('denuvo') && /\.(jsonl|json)$/.test(base)) {
      fileset.denuvo.push(entry);
    } else {
      fileset.unknown.push(entry);
    }
  }
  return fileset;
}

// Decode an entry's bytes to a UTF-8 string (the export is UTF-8; € is valid).
export const entryText = (entry) => (entry ? strFromU8(entry.bytes) : '');

// Inspect a classified fileset and report which expected SAR components were found.
export function summarizeFileset(fileset) {
  const eosFound = fileset.eos.anticheat.length > 0 || fileset.eos.linkedAccounts.length > 0;
  const anybrainFound =
    fileset.anybrain.os.length > 0 || fileset.anybrain.screens.length > 0 ||
    fileset.anybrain.sessions.length > 0 || fileset.anybrain.peripherals.length > 0;

  const components = [
    {
      key: 'persistence', label: 'Game & account data', file: '<id>_persistence', required: true,
      found: !!fileset.persistence, powers: 'Career, match history, weapons, breakdowns and purchases',
    },
    {
      key: 'audit', label: 'Account audit log', file: '<id>_audit', required: false,
      found: !!fileset.audit, powers: 'name-change history and the reports you’ve filed',
    },
    {
      key: 'eos', label: 'Easy Anti-Cheat (EOS)', file: 'eos-archive_clean.zip', required: false,
      found: eosFound, powers: 'login sessions and linked platform accounts',
    },
    {
      key: 'anybrain', label: 'Anybrain anti-cheat', file: 'anybrain_clean.zip', required: false,
      found: anybrainFound, powers: 'extra play-session and peripheral records on the Sessions page',
    },
    {
      key: 'denuvo', label: 'Denuvo anti-cheat', file: 'denuvo_clean.jsonl', required: false,
      found: fileset.denuvo.length > 0, powers: 'per-platform session records',
    },
    {
      key: 'readme', label: 'Request README', file: 'README_<date>(<id>).pdf', required: false,
      found: !!fileset.readme, powers: 'the “data as of” date',
    },
  ];

  if (fileset.customerSupport) {
    components.push({
      key: 'support', label: 'Customer support & chat', file: 'CS_extracted_data.pdf', required: false,
      found: true, powers: 'your in-game chat log and support tickets',
    });
  }

  const missing = components.filter((c) => !c.required && !c.found);
  return {
    components,
    missing,
    foundCount: components.filter((c) => c.found).length,
    total: components.length,
    complete: missing.length === 0,
    unknownCount: fileset.unknown.length,
  };
}

/**
 * Ingest a FileList / File[] into a classified, flat fileset.
 * @param {FileList|File[]} fileList
 * @param {(msg:string)=>void} [onProgress]
 */
export async function ingestFiles(fileList, onProgress = () => {}) {
  const files = Array.from(fileList || []);
  if (files.length === 0) throw new Error('No files selected.');

  const flat = [];
  for (const f of files) {
    onProgress(`Reading ${f.name}…`);
    const bytes = await readFileBytes(f);
    const path = f.webkitRelativePath || f.name;
    await expandEntry(path, bytes, flat);
  }

  const fileset = classify(flat);
  if (!fileset.persistence) {
    throw new Error(
      'No persistence file found. Drop the whole SAR package (the email zip, or the folder you extracted it to) — it should contain a "<id>_persistence.jsonl" file.'
    );
  }
  return fileset;
}
