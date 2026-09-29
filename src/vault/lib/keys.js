// Embark's id -> name lookup. Exports since 2026-09 ship one (`<id>_keys.jsonl`) for
// the ids they reference; keysStatic.js merges every one seen, so older exports decode too.
import STATIC from './keysStatic.js';

// The export doubles apostrophes ("Champion''s Crown").
export const cleanName = (s) => (typeof s === 'string' ? s.replace(/''/g, "'") : null);

const ms = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const str = (v) => (typeof v === 'string' && v ? v : null);

// `exportByType`: parse.js's `raw.keys.byType`, or null for the static catalogue alone.
export function createKeys(exportByType) {
  const items = new Map();
  const scenarios = new Map();
  const maps = new Map();
  const seasons = new Map();
  const mastery = new Map();
  let currentSeason = null;

  // Export last: Embark's current wording beats our snapshot of it.
  for (const src of [STATIC, exportByType]) {
    if (!src) continue;
    const rows = (type) => (Array.isArray(src[type]) ? src[type] : []).filter((r) => r && typeof r === 'object' && r.Resolved !== false);
    // A row that names nothing never replaces one that does.
    for (const r of rows('TheFinalsItemKey')) {
      if (r.GameAssetID == null) continue;
      const name = str(cleanName(r.Name));
      if (!name && items.get(String(r.GameAssetID))?.name) continue;
      items.set(String(r.GameAssetID), { name, kind: str(r.Kind), itemType: str(r.ItemType), subType: str(r.ItemSubType), asset: str(r.AssetName) });
    }
    for (const r of rows('TheFinalsScenarioKey')) {
      if (r.ScenarioID != null && str(r.Name)) scenarios.set(String(r.ScenarioID), { name: r.Name, internalName: str(r.InternalName), gameMode: str(r.GameMode) });
    }
    for (const r of rows('TheFinalsMapKey')) {
      if (str(r.MapVariant) && str(r.MapName)) maps.set(r.MapVariant, { name: cleanName(r.MapName), variant: cleanName(r.VariantName) });
    }
    for (const r of rows('TheFinalsSeasonKey')) {
      const n = Number(r.SeasonNumber);
      if (r.SeasonID == null || !Number.isInteger(n) || n <= 0) continue;
      seasons.set(String(r.SeasonID), { id: String(r.SeasonID), n, name: str(r.Name) ?? `Season ${n}`, startMs: ms(r.StartDate), endMs: ms(r.EndDate) });
      // Only an export's own key file says which season was running when it was made.
      if (src === exportByType && r.IsCurrent === true) currentSeason = n;
    }
    for (const r of rows('TheFinalsMasteryKey')) {
      if (r.BucketID == null) continue;
      const assetId = typeof r.GameAssetID === 'number' || typeof r.GameAssetID === 'string' ? r.GameAssetID : null;
      mastery.set(String(r.BucketID), { category: str(r.Category), name: str(cleanName(r.Name)), assetId });
    }
  }

  return {
    item: (id) => items.get(String(id)) ?? null,
    scenario: (id) => scenarios.get(String(id)) ?? null,
    map: (mapVariant) => maps.get(mapVariant) ?? null,
    season: (id) => seasons.get(String(id)) ?? null,
    seasons: () => [...seasons.values()].sort((a, b) => a.n - b.n),
    currentSeason: () => currentSeason,
    mastery: (bucketId) => mastery.get(String(bucketId)) ?? null,
  };
}

export const STATIC_KEYS = createKeys(null);
