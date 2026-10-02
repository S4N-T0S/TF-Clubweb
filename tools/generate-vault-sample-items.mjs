// Regenerates src/vault/lib/sampleItems.js, the real cosmetics the vault's sample player owns.
//
//   node tools/generate-vault-sample-items.mjs
//
// Draws a fixed, seeded pick of item definitions (name, asset, slot, rarity, tags) from the
// key files under public/__verify/player_examples/, so the sample's Collection page shows
// real names and pictures. The rows are the game's catalogue, mixed from every key file,
// and carry nothing of a player. The counts per type are the sample's INVENTORY_SPREAD.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = join(ROOT, 'public', '__verify', 'player_examples');
const OUT = join(ROOT, 'src', 'vault', 'lib', 'sampleItems.js');
const { itemClass } = await import(pathToFileURL(join(ROOT, 'src', 'vault', 'lib', 'itemImages.js')).href);

const QUOTA = { CustomizationItem: 180, WeaponSkin: 142, WeaponCharm: 46, WeaponSticker: 38, PlayerCardCustomization: 33, AnimationCustomization: 21, Spray: 16, Emoticon: 12, ClansCustomization: 4, WeaponAttachment: 14 };
// Slots the worn-per-round record needs a few of, whatever their share of the catalogue.
const MINIMUM = { BodyType: 4, Voice: 2, Head: 5, Eyes: 4, Hair: 8 };
const LAUNCH_SLOTS = ['BodyUpper', 'BodyLower', 'Shoes', 'Head'];
const KEPT_TAGS = /^(Online\.Season\.|Customization\.Sponsor\.|Customization\.Item\.Animation\.|Customization\.Theme\.StarterSet$)/;
// What two event modes dress every player in. The sample wears them without owning them.
const UNIFORMS = { heavyHitters: /_Tiger_TeamLTM$|_TigerHead_Paper_LTM$/, cashball: /_Cashball_LTM$/ };

const isKeys = (p) => /keys\.(jsonl|json|txt)$/i.test(basename(p));
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [p]);
const all = new Map();
for (const p of walk(SAMPLES)) {
  const texts = isKeys(p) ? [readFileSync(p, 'utf8')] : /persistence.*\.zip$/i.test(basename(p)) ? Object.values(unzipSync(readFileSync(p), { filter: (f) => isKeys(f.name) })).map(strFromU8) : [];
  for (const text of texts) {
    for (const line of text.split('\n')) {
      if (!line.includes('"TheFinalsItemKey"')) continue;
      const r = JSON.parse(line).TheFinalsItemKey;
      if (r.Kind === 'Item' && r.Resolved !== false && r.Name && r.AssetName && Object.hasOwn(QUOTA, r.ItemType) && !/DEPRECATED/.test(r.Name)) all.set(r.GameAssetID, r);
    }
  }
}
if (!all.size) throw new Error(`No key files under ${SAMPLES}`);

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const seasonOf = (r) => Number((r.AssetTags || []).find((t) => t.startsWith('Online.Season.'))?.split('.')[2] ?? 99);
const klassOf = (r) => itemClass({ itemType: r.ItemType, subType: r.ItemSubType, asset: r.AssetName, tags: r.AssetTags });
const row = (r) => [r.GameAssetID, r.Name, r.ItemType, r.ItemSubType && r.ItemSubType !== 'Unknown' ? r.ItemSubType : 0, r.AssetName, r.Rarity && r.Rarity !== 'Unknown' ? r.Rarity : 0, (r.AssetTags || []).filter((t) => KEPT_TAGS.test(t))];

const isUniform = (r) => /LTM$/.test(r.AssetName);
const picked = [];
for (const [type, quota] of Object.entries(QUOTA)) {
  const byKlass = new Map();
  for (const r of all.values()) {
    if (r.ItemType !== type || isUniform(r)) continue;
    // Embark's key file still names most Season 10 and 11 items by asset label: keep a quarter.
    if (seasonOf(r) >= 10 && seasonOf(r) < 99 && hash(`recent ${r.AssetName}`) % 4) continue;
    const k = klassOf(r);
    if (!byKlass.has(k)) byKlass.set(k, []);
    byKlass.get(k).push(r);
  }
  const total = [...byKlass.values()].reduce((s, a) => s + a.length, 0);
  // Each class keeps its share of the catalogue, by largest remainder.
  const want = [...byKlass.entries()].map(([k, a]) => {
    const exact = (quota * a.length) / total;
    return { k, a, n: Math.min(a.length, Math.max(Math.floor(exact), MINIMUM[k] ?? 0)), rest: exact - Math.floor(exact) };
  });
  let left = quota - want.reduce((s, w) => s + w.n, 0);
  for (const w of [...want].sort((x, y) => y.rest - x.rest || x.k.localeCompare(y.k))) {
    if (left <= 0) break;
    if (w.n < w.a.length) {
      w.n++;
      left--;
    }
  }
  for (const w of [...want].sort((x, y) => y.n - x.n)) {
    if (left >= 0) break;
    if (w.n > (MINIMUM[w.k] ?? 0) + 1) {
      w.n--;
      left++;
    }
  }
  const mine = want.flatMap((w) => {
    const pick = w.a.sort((x, y) => hash(x.AssetName) - hash(y.AssetName)).slice(0, w.n);
    // The sample plays from Season 1, so each slot a round always lists needs a launch piece.
    const launch = LAUNCH_SLOTS.includes(w.k) && !pick.some((r) => seasonOf(r) <= 1) && w.a.find((r) => seasonOf(r) <= 1);
    if (launch) pick[pick.length - 1] = launch;
    return pick;
  });
  // The sample acquires its items in this order: by season, shuffled across up to four
  // seasons, so its newest items are not all from the latest one.
  const order = (r) => Math.min(seasonOf(r), 11) + (hash(`late ${r.AssetName}`) % 1000) / 250;
  mine.sort((x, y) => order(x) - order(y));
  picked.push(...mine);
}

const uniforms = Object.fromEntries(Object.entries(UNIFORMS).map(([name, re]) => [name, [...all.values()].filter((r) => re.test(r.AssetName)).sort((x, y) => x.AssetName.localeCompare(y.AssetName)).map(row)]));
const lines = (rows) => rows.map((r) => `  ${JSON.stringify(r)},`).join('\n');
writeFileSync(
  OUT,
  `// GENERATED by tools/generate-vault-sample-items.mjs from Embark's key files. Do not edit by hand.
// [GameAssetID, Name, ItemType, ItemSubType, AssetName, Rarity, AssetTags]
export const SAMPLE_ITEMS = [
${lines(picked.map(row))}
];
export const SAMPLE_UNIFORMS = {
${Object.entries(uniforms).map(([name, rows]) => `  ${name}: [\n${rows.map((r) => `    ${JSON.stringify(r)},`).join('\n')}\n  ],`).join('\n')}
};
`,
);
const per = {};
for (const r of picked) per[r.ItemType] = (per[r.ItemType] ?? 0) + 1;
console.log(`Read ${all.size} cosmetics, wrote ${picked.length} to ${OUT} (${statSync(OUT).size.toLocaleString()} bytes)`);
console.log(per);
console.log(Object.fromEntries(Object.entries(uniforms).map(([k, v]) => [k, v.map((r) => r[1]).join(', ')])));
