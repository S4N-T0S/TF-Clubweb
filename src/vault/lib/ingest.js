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
const basename = (p) => p.split(/[\\/]/).pop().toLowerCase();

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
    anybrain: { os: null, screens: null, sessions: null },
    denuvo: [],
    unknown: [],
    all: flat,
  };

  for (const entry of flat) {
    const base = basename(entry.path);

    if (/persistence\.(jsonl|json|txt)$/.test(base) || (base.includes('persistence') && /\.(jsonl|txt)$/.test(base))) {
      // Prefer the largest persistence file if several appear.
      if (!fileset.persistence || entry.bytes.length > fileset.persistence.bytes.length) fileset.persistence = entry;
    } else if (base.includes('audit') && /\.(jsonl|json|txt)$/.test(base)) {
      if (!fileset.audit || entry.bytes.length > fileset.audit.bytes.length) fileset.audit = entry;
    } else if (base.startsWith('anticheat') && base.endsWith('.json')) {
      fileset.eos.anticheat.push(entry);
    } else if (base === 'linkedaccounts.json') {
      fileset.eos.linkedAccounts.push(entry);
    } else if (base === 'os.csv') {
      fileset.anybrain.os = entry;
    } else if (base === 'screens.csv') {
      fileset.anybrain.screens = entry;
    } else if (base === 'sessions.csv') {
      fileset.anybrain.sessions = entry;
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
