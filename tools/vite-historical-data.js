// Vite plugin: packs the closed-season leaderboard snapshots into one columnar, brotli-11
// compressed blob at build time (and in `vite dev`), served from /data/ and fetched by
// historicalDataService.js before the leaderboard app mounts. The season JSON files stay the source of
// truth. The file name hashes the uncompressed columnar JSON, so only a data change renames it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { encodeSeason, decodeSeason } from '../src/services/historicalDataBlob.js';

// A new closed season needs an entry here and in SEASONS (historicalDataService.js).
const SEASON_FILES = {
  OB: 'Betas/OB-crossplay.json',
  S1: 'S1/S1-merged.json',
  S2: 'S2/S2-merged.json',
  S3: 'S3/S3-crossplay.json',
  S4: 'S4/S4-crossplay.json',
  S5: 'S5/S5-crossplay.json',
  S6: 'S6/S6-crossplay.json',
  S7: 'S7/S7-crossplay.json',
  S8: 'S8/S8-official-merged.json',
  S9: 'S9/S9-official-merged.json',
  S10: 'S10/S10-official-merged.json',
  S11: 'S11/S11-crossplay.json',
};

const DATA_DIR = fileURLToPath(new URL('../src/data/', import.meta.url));
const CACHE_DIR = fileURLToPath(new URL('../node_modules/.cache/historical-data/', import.meta.url));
const VIRTUAL_ID = 'virtual:historical-data-url';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

// Build failure, not a warning: the decoded rows must equal the source rows key for key.
function assertParity(seasonKey, source, decoded) {
  const rows = source.data;
  const back = decoded.data;
  const bad = (detail) => {
    throw new Error(`historical-data: ${seasonKey} ${detail}`);
  };
  if (source.count !== rows.length) bad(`count ${source.count} does not match ${rows.length} rows`);
  if (back.length !== rows.length || decoded.count !== source.count) bad('row count changed in the round trip');
  if (JSON.stringify(decoded.meta) !== JSON.stringify(source.meta)) bad('meta changed in the round trip');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Number.isSafeInteger(row.rank) || !Number.isSafeInteger(row.leagueNumber)) bad(`row ${i} lacks rank or leagueNumber`);
    const keys = Object.keys(row).sort();
    const backKeys = Object.keys(back[i]).sort();
    if (keys.join('\0') !== backKeys.join('\0')) bad(`row ${i} keys changed: ${keys} vs ${backKeys}`);
    for (const key of keys) if (row[key] !== back[i][key]) bad(`row ${i} ${key} changed: ${row[key]} vs ${back[i][key]}`);
  }
}

function buildBlob() {
  const blob = {};
  for (const [key, file] of Object.entries(SEASON_FILES)) {
    let source;
    try {
      source = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
    } catch (error) {
      throw new Error(`historical-data: ${key} (${file}): ${error.message}`);
    }
    if (!Array.isArray(source?.data)) throw new Error(`historical-data: ${key} (${file}) has no data array`);
    const column = encodeSeason(source);
    assertParity(key, source, decodeSeason(JSON.parse(JSON.stringify(column)), key));
    blob[key] = column;
  }
  const json = JSON.stringify(blob);
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 12);
  return { json, fileName: `data/history-${hash}.bin`, cachePath: path.join(CACHE_DIR, `${hash}.bin`) };
}

// Brotli-11 of 7 MB takes several seconds; the result is cached by hash under node_modules.
function compress(blob) {
  try {
    const cached = fs.readFileSync(blob.cachePath);
    if (zlib.brotliDecompressSync(cached).toString('utf8') === blob.json) return cached;
  } catch {
    // no usable cache entry
  }
  const bytes = new TextEncoder().encode(blob.json);
  const out = zlib.brotliCompressSync(bytes, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(blob.cachePath, out);
  return out;
}

export function historicalDataPlugin({ skipPreloadOn = [] } = {}) {
  let base = '/';
  let blob = null;
  let compressed = null;
  const current = () => (blob ??= buildBlob());
  const url = () => base + current().fileName;

  return {
    name: 'historical-data-blob',
    configResolved(config) {
      base = config.base;
    },
    buildStart() {
      blob = null;
      compressed = null;
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID) return `export default ${JSON.stringify(url())};`;
    },
    // Starts the download while the HTML is still parsing, except on routes that never read the data.
    transformIndexHtml() {
      const skip = JSON.stringify(skipPreloadOn);
      return [{
        tag: 'script',
        injectTo: 'head-prepend',
        children: `(() => {
        const path = location.pathname.toLowerCase();
        if (${skip}.some((p) => path === p || path.startsWith(p + '/'))) return;
        const l = document.createElement('link');
        l.rel = 'preload'; l.as = 'fetch'; l.href = ${JSON.stringify(url())}; l.crossOrigin = '';
        l.setAttribute('fetchpriority', 'high');
        document.head.appendChild(l);
      })();`,
      }];
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: current().fileName, source: compress(current()) });
    },
    configureServer(server) {
      // Nothing imports the season JSON any more, so an edit needs a restart to rebuild the blob.
      server.watcher.on('change', (file) => {
        const rel = path.relative(DATA_DIR, file).split(path.sep).join('/');
        if (Object.values(SEASON_FILES).includes(rel)) server.restart();
      });
      server.middlewares.use((req, res, next) => {
        if ((req.url || '').split('?')[0] !== url()) return next();
        const br = /\bbr\b/.test(req.headers['accept-encoding'] || '');
        const body = br ? (compressed ??= compress(current())) : new TextEncoder().encode(current().json);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          ...(br && { 'Content-Encoding': 'br' }),
          'Content-Length': body.length,
          'Cache-Control': 'public, max-age=31536000, immutable, no-transform',
          'Vary': 'Accept-Encoding',
        });
        res.end(body);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (pathname.startsWith(base + 'data/') && pathname.endsWith('.bin')) res.setHeader('Content-Encoding', 'br');
        next();
      });
    },
  };
}
