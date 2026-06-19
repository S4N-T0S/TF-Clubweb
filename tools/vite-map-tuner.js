// Dev-only Vite plugin: a visual tuner for the match-history map backgrounds.
//
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAPS_PATH = fileURLToPath(new URL('../src/vault/lib/maps.js', import.meta.url));
const HTML_PATH = fileURLToPath(new URL('./map-focus-tuner.html', import.meta.url));

// Pull { codename, slug, name, focus, zoom } out of the MAPS object literal. Each
// entry is a single line: `Code_NN: { key: 'slug', name: 'Name', focus: '50% 40%', zoom: 0.9 },`
// (key can be null; focus/zoom can be absent — defaults applied).
function parseEntries(src) {
  const re =
    /(\w+):\s*\{\s*key:\s*(?:null|'([^']*)')\s*,\s*name:\s*'([^']*)'\s*(?:,\s*focus:\s*'([^']*)')?\s*(?:,\s*zoom:\s*([\d.]+))?\s*\}/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    out.push({ codename: m[1], slug: m[2] || null, name: m[3], focus: m[4] || '50% 40%', zoom: m[5] ? Number(m[5]) : 1 });
  }
  return out;
}

// One card per unique slug (image); list the codenames it covers so the user knows
// which MAPS entries a tweak touches.
function groupBySlug(entries) {
  const bySlug = new Map();
  for (const e of entries) {
    if (!e.slug) continue;
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, { slug: e.slug, name: e.name, focus: e.focus, zoom: e.zoom, codenames: [] });
    bySlug.get(e.slug).codenames.push(e.codename);
  }
  return [...bySlug.values()];
}

// Rewrite each MAPS entry whose slug is in `bySlug`, setting focus and zoom. Scoped
// to the `const MAPS = { … };` block, and only entries with a quoted key match.
// zoom === 1 is the default, so it's omitted (and any stale zoom stripped) to keep
// maps.js tidy.
function applyEntries(src, bySlug) {
  return src.replace(/const MAPS = \{[\s\S]*?\n\};/, (block) =>
    block.replace(/(\w+):\s*\{([^}]*)\}/g, (full, code, rawBody) => {
      const sm = /key:\s*'([^']+)'/.exec(rawBody);
      if (!sm) return full; // key: null entries (no image)
      const data = bySlug[sm[1]];
      if (!data) return full;
      let b = rawBody.trim();
      // focus — replace if present, else add after name
      if (/focus:\s*'[^']*'/.test(b)) b = b.replace(/focus:\s*'[^']*'/, `focus: '${data.focus}'`);
      else b = b.replace(/(name:\s*'[^']*')/, `$1, focus: '${data.focus}'`);
      // zoom — strip any existing, then add only when not the default 1
      b = b.replace(/\s*,\s*zoom:\s*[\d.]+/, '');
      if (data.zoom != null && Number(data.zoom) !== 1) b = b.replace(/(focus:\s*'[^']*')/, `$1, zoom: ${data.zoom}`);
      return `${code}: { ${b} }`;
    })
  );
}

const FOCUS_RE = /^\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/; // guard incoming focus values

export function mapTunerPlugin() {
  return {
    name: 'map-focus-tuner',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__maptuner', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const incoming = JSON.parse(body || '{}');
              const src = fs.readFileSync(MAPS_PATH, 'utf8');
              const known = new Set(parseEntries(src).map((e) => e.slug).filter(Boolean));
              // Whitelist known slugs; validate focus format + clamp zoom to a sane range.
              const clean = {};
              for (const [slug, v] of Object.entries(incoming)) {
                if (!known.has(slug) || !v || typeof v !== 'object') continue;
                const focus = typeof v.focus === 'string' && FOCUS_RE.test(v.focus.trim()) ? v.focus.trim() : null;
                if (!focus) continue;
                let zoom = Number(v.zoom);
                if (!Number.isFinite(zoom)) zoom = 1;
                zoom = Math.min(3, Math.max(0.3, Math.round(zoom * 100) / 100));
                clean[slug] = { focus, zoom };
              }
              fs.writeFileSync(MAPS_PATH, applyEntries(src, clean));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, count: Object.keys(clean).length }));
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
            }
          });
          return;
        }
        // GET → serve the tool with the live map data injected
        try {
          const maps = groupBySlug(parseEntries(fs.readFileSync(MAPS_PATH, 'utf8')));
          const html = fs.readFileSync(HTML_PATH, 'utf8').replace('__MAPS_JSON__', JSON.stringify(maps));
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
        } catch (e) {
          res.statusCode = 500;
          res.end('map-focus-tuner error: ' + (e && e.message ? e.message : e));
        }
      });
    },
  };
}
