// Builds the vault's cosmetic pictures, sound bites and their index from thefinals.wiki's CosmeticsTable.
//
//   node tools/build-vault-item-images.mjs [--out public/vault/items] [--limit N] [--refresh] [--prune] [--no-download] [--check]
//
// Writes <out>/<slug>.webp (192px), <out>/../sounds/<slug>.mp3 and the index of both,
// src/vault/lib/itemManifest.json, which the Collection page fetches (see
// src/vault/lib/itemImages.js). A re-run downloads only the files it does not have yet.
// --refresh downloads every one again, --prune deletes pictures no wiki row uses any more,
// --limit is a trial run that leaves the index.
// --check also resolves every cosmetic in the key files under public/__verify/player_examples/
// and prints what found no picture, including skin codes itemImages.js has no weapon for.
// Needs ImageMagick (`magick`) on PATH, and `ffmpeg` for the few sound bites the wiki keeps as wav.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const OUT = resolve(ROOT, opt('--out', 'public/vault/items'));
const RAW = join(OUT, '.raw');
const SOUNDS = resolve(OUT, '..', 'sounds');
const MANIFEST = join(ROOT, 'src', 'vault', 'lib', 'itemManifest.json');
const LIMIT = Number(opt('--limit', 0));
const SIZE = 192;
const WIKI = 'https://www.thefinals.wiki/w';
const UA = { 'User-Agent': 'ogclub-vault-item-images/1.0 (https://ogclub.s4nt0s.eu/gdpr-vault)' };
const PAUSE_MS = 250;
const WORKERS = 3;

const FIELDS = ['Name', 'Type', 'Rarity', 'Icon', 'Equipment', 'SeasonAdded', 'IsEquipmentLevelReward', 'EquipmentLevel', 'Sponsors', 'SoundAudio'];
const SKIP_TYPES = new Set(['BUNDLE', 'OUTFIT']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => String(s ?? '').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const slugOf = (icon) => icon.replace(/\.[a-z]+$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const getJson = async (url) => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

const { normName, itemClass, itemSeason, itemSponsor, itemEquipment, createItemImages, ITEM_CLASSES } = await import(pathToFileURL(join(ROOT, 'src', 'vault', 'lib', 'itemImages.js')).href);
// Hair is kept although nothing matches it yet: every hair is named "Hair" in the export, so
// matching one needs a table from its asset style to the wiki's picture.
const wikiTypes = new Set([...Object.values(ITEM_CLASSES).map((c) => c.wiki).filter(Boolean), 'HAIR']);

mkdirSync(OUT, { recursive: true });

console.log('Reading CosmeticsTable...');
const table = [];
for (let offset = 0; ; offset += 2000) {
  const page = await getJson(`${WIKI}/index.php?title=Special:CargoExport&tables=CosmeticsTable&fields=${FIELDS.join(',')}&format=json&limit=2000&offset=${offset}&order+by=_pageName`);
  table.push(...page);
  if (page.length < 2000) break;
  await sleep(PAUSE_MS);
}
// Every row of a pictured type is indexed, with or without a usable icon: a row left out
// would let its name match another variant's picture.
const rows = table.map((r) => ({ ...r, Name: decode(r.Name), Icon: decode(r.Icon) })).filter((r) => r.Name && !SKIP_TYPES.has(r.Type) && wikiTypes.has(r.Type));
const usable = (icon) => /\.(png|jpe?g|webp)$/i.test(icon);
console.log(`  ${table.length} rows, ${rows.length} of a pictured type`);

// One file per wiki icon. Icon names that slug alike each take a suffix made from the
// name itself, so a new icon never moves an existing file's name.
const hash = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
const bySlug = new Map();
for (const icon of new Set(rows.map((r) => r.Icon).filter(usable))) {
  const base = slugOf(icon) || 'item';
  if (!bySlug.has(base)) bySlug.set(base, []);
  bySlug.get(base).push(icon);
}
const icons = new Map();
for (const [base, same] of bySlug) for (const icon of same) icons.set(icon, same.length > 1 ? `${base}-${hash(icon)}` : base);

if (!flag('--no-download')) {
  const todo = [...icons.keys()].filter((icon) => flag('--refresh') || !existsSync(join(OUT, `${icons.get(icon)}.webp`))).slice(0, LIMIT || undefined);
  let fetched = 0;
  let failed = 0;
  // The wiki answered 429 or 503: stop, and let a later run pick up what is missing.
  let busy = false;
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    let info;
    try {
      info = await getJson(`${WIKI}/api.php?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=${SIZE}&titles=${encodeURIComponent(batch.map((t) => `File:${t}`).join('|'))}`);
    } catch (e) {
      console.warn(`  batch ${i} failed: ${e.message}`);
      if (/^(429|503) /.test(e.message)) busy = true;
      failed += batch.length;
      if (busy) break;
      continue;
    }
    const back = new Map((info.query.normalized || []).map((n) => [n.to, n.from]));
    const queue = Object.values(info.query.pages || {});
    const work = async () => {
      for (let page = queue.pop(); page; page = queue.pop()) {
        const icon = (back.get(page.title) ?? page.title).replace(/^File:/, '');
        const ii = page.imageinfo?.[0];
        const slug = icons.get(icon);
        if (!slug || !ii) continue;
        try {
          const res = await fetch(ii.thumburl || ii.url, { headers: UA });
          if (res.status === 429 || res.status === 503) busy = true;
          if (!res.ok) throw new Error(String(res.status));
          writeFileSync(join(RAW, `${slug}.webp`), Buffer.from(await res.arrayBuffer()));
          fetched++;
        } catch (e) {
          failed++;
          console.warn(`  ${icon}: ${e.message}`);
        }
        if (busy) return;
      }
    };
    mkdirSync(RAW, { recursive: true });
    await Promise.all(Array.from({ length: WORKERS }, work));
    // One ImageMagick run per batch: starting it once per picture takes about a second each.
    if (readdirSync(RAW).length) execFileSync('magick', ['mogrify', '-path', OUT, '-format', 'webp', '-resize', `${SIZE}x${SIZE}`, '-quality', '80', join(RAW, '*.webp')]);
    rmSync(RAW, { recursive: true });
    if ((i / 50) % 10 === 0) console.log(`  ${Math.min(i + 50, todo.length)} / ${todo.length}, ${fetched} downloaded, ${failed} failed`);
    if (busy) break;
    await sleep(PAUSE_MS);
  }
  console.log(`Downloaded ${fetched}, failed ${failed}${busy ? '. The wiki asked for a pause: run again later.' : ''}`);
}

// Sound bites share one icon, but each wiki row names its own audio file.
const soundRows = table.filter((r) => r.Type === 'SOUND' && r.Name && r.SoundAudio).map((r) => ({ name: decode(r.Name), audio: decode(r.SoundAudio), slug: slugOf(`${decode(r.Name)}.x`) }));
mkdirSync(SOUNDS, { recursive: true });
if (!flag('--no-download') && !LIMIT) {
  const todo = soundRows.filter((r) => flag('--refresh') || !existsSync(join(SOUNDS, `${r.slug}.mp3`)));
  let fetched = 0;
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const info = await getJson(`${WIKI}/api.php?action=query&format=json&prop=imageinfo&iiprop=url|mime&titles=${encodeURIComponent(batch.map((r) => `File:${r.audio}`).join('|'))}`);
    const back = new Map((info.query.normalized || []).map((n) => [n.to, n.from]));
    for (const page of Object.values(info.query.pages || {})) {
      const row = batch.find((r) => `File:${r.audio}` === (back.get(page.title) ?? page.title));
      const ii = page.imageinfo?.[0];
      if (!row || !ii) continue;
      const res = await fetch(ii.url, { headers: UA });
      if (!res.ok) {
        console.warn(`  ${row.audio}: ${res.status}`);
        continue;
      }
      const file = join(SOUNDS, `${row.slug}.mp3`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (ii.mime === 'audio/mpeg') writeFileSync(file, bytes);
      else {
        const tmp = join(SOUNDS, `.tmp-${row.slug}`);
        writeFileSync(tmp, bytes);
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '128k', file]);
        rmSync(tmp);
      }
      fetched++;
      await sleep(PAUSE_MS);
    }
  }
  if (todo.length) console.log(`Sound bites: ${fetched} of ${todo.length} downloaded`);
}
const sounds = {};
for (const r of soundRows) if (existsSync(join(SOUNDS, `${r.slug}.mp3`))) sounds[normName(r.name)] = `${r.slug}.mp3`;

// A row whose picture is not on disk keeps its place with file 0.
const names = {};
let pictured = 0;
for (const r of rows) {
  const slug = icons.get(r.Icon);
  const file = slug && existsSync(join(OUT, `${slug}.webp`)) ? `${slug}.webp` : 0;
  if (file) pictured++;
  const sponsors = (Array.isArray(r.Sponsors) ? r.Sponsors : []).map(normName).filter(Boolean).join('|');
  (names[normName(r.Name)] ??= []).push([r.Type, r.Equipment ? decode(r.Equipment) : 0, r.Rarity ? r.Rarity[0] : 0, r.SeasonAdded ?? 0, r.IsEquipmentLevelReward ? r.EquipmentLevel ?? 0 : 0, file, sponsors || 0]);
}
const manifest = { v: 1, built: new Date().toISOString().slice(0, 10), size: SIZE, names, sounds };
const webps = readdirSync(OUT).filter((f) => f.endsWith('.webp'));
const bytes = webps.reduce((s, f) => s + statSync(join(OUT, f)).size, 0);
if (LIMIT) console.log(`--limit is a trial run: ${MANIFEST} is left as it was`);
else {
  writeFileSync(MANIFEST, JSON.stringify(manifest));
  console.log(`Wrote ${MANIFEST}: ${rows.length} wiki rows (${pictured} with a picture), ${Object.keys(names).length} names, ${Object.keys(sounds).length} sound bites, ${statSync(MANIFEST).size.toLocaleString()} bytes`);
}
const wanted = new Set(icons.values());
const stray = webps.filter((f) => !wanted.has(f.slice(0, -5)));
console.log(`${webps.length} pictures, ${(bytes / 1048576).toFixed(1)} MB in ${OUT}`);
if (stray.length && flag('--prune')) for (const f of stray) rmSync(join(OUT, f));
if (stray.length) console.log(`${stray.length} pictures no wiki row uses ${flag('--prune') ? 'were deleted' : '(--prune deletes them)'}: ${stray.slice(0, 8).join(', ')}${stray.length > 8 ? '...' : ''}`);

if (flag('--check')) {
  const SAMPLES = join(ROOT, 'public', '__verify', 'player_examples');
  const isKeys = (p) => /keys\.(jsonl|json|txt)$/i.test(basename(p));
  const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [p]);
  const texts = [];
  for (const p of existsSync(SAMPLES) ? walk(SAMPLES) : []) {
    if (isKeys(p)) texts.push(readFileSync(p, 'utf8'));
    else if (/persistence.*\.zip$/i.test(basename(p))) for (const bytes of Object.values(unzipSync(readFileSync(p), { filter: (f) => isKeys(f.name) }))) texts.push(strFromU8(bytes));
  }
  const keys = new Map();
  for (const text of texts) {
    for (const line of text.split('\n')) {
      if (!line.includes('"TheFinalsItemKey"')) continue;
      const r = JSON.parse(line).TheFinalsItemKey;
      if (r.Kind === 'Item' && r.Name && r.AssetName) keys.set(r.GameAssetID, r);
    }
  }
  const imageOf = createItemImages(manifest);
  const per = new Map();
  const codes = new Map();
  for (const r of keys.values()) {
    const k = { name: r.Name, itemType: r.ItemType, subType: r.ItemSubType, asset: r.AssetName, tags: r.AssetTags };
    const klass = itemClass(k);
    if (r.ItemType === 'GameItem' || r.ItemType === 'Currency') continue;
    const hit = imageOf({ name: r.Name, klass, asset: r.AssetName, rarity: r.Rarity, season: itemSeason(r.AssetTags), sponsor: itemSponsor(r.AssetTags) });
    const rec = per.get(klass) ?? { n: 0, hit: 0 };
    rec.n++;
    if (hit) rec.hit++;
    per.set(klass, rec);
    if (r.ItemType === 'WeaponSkin' && !itemEquipment(r.AssetName)) {
      const code = r.AssetName.replace(/^DA_Skin_/, '').split('_').slice(0, 2).join('_');
      codes.set(code, (codes.get(code) ?? 0) + 1);
    }
  }
  const all = [...per.values()].reduce((s, r) => ({ n: s.n + r.n, hit: s.hit + r.hit }), { n: 0, hit: 0 });
  console.log(`\nCheck: ${all.hit} of ${all.n} cosmetics in ${texts.length} key file(s) found a picture`);
  for (const [klass, r] of [...per.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(r.hit).padStart(5)} / ${String(r.n).padEnd(5)} ${klass}`);
  if (codes.size) console.log(`\nSkin codes with no weapon in itemImages.js:\n  ${[...codes.entries()].map(([c, n]) => `${c} (${n})`).join('\n  ')}`);
}
