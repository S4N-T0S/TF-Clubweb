// Embark's id -> name lookup. Exports since 2026-09 ship one (`<id>_keys.jsonl`) for
// the ids they reference; keysStatic.js merges every one seen, so older exports decode too.
import STATIC from './keysStatic.js';

// The export doubles apostrophes ("Champion''s Crown").
export const cleanName = (s) => (typeof s === 'string' ? s.replace(/''/g, "'") : null);

const ms = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

// `exportByType`: parse.js's `raw.keys.byType`, or null for the static catalogue alone.
export function createKeys(exportByType) {
  const items = new Map();
  const scenarios = new Map();
  const maps = new Map();
  const seasons = new Map();
  const mastery = new Map();

  // Export last: Embark's current wording beats our snapshot of it.
  for (const src of [STATIC, exportByType]) {
    if (!src) continue;
    const rows = (type) => (Array.isArray(src[type]) ? src[type] : []).filter((r) => r && typeof r === 'object' && r.Resolved !== false);
    for (const r of rows('TheFinalsItemKey')) {
      if (r.GameAssetID == null) continue;
      items.set(String(r.GameAssetID), { name: cleanName(r.Name), kind: r.Kind ?? null, itemType: r.ItemType ?? null, subType: r.ItemSubType ?? null, asset: r.AssetName ?? null });
    }
    for (const r of rows('TheFinalsScenarioKey')) {
      if (r.ScenarioID != null && r.Name) scenarios.set(String(r.ScenarioID), { name: r.Name, internalName: r.InternalName ?? null, gameMode: r.GameMode ?? null });
    }
    for (const r of rows('TheFinalsMapKey')) {
      if (r.MapVariant && r.MapName) maps.set(r.MapVariant, { name: cleanName(r.MapName), variant: cleanName(r.VariantName) });
    }
    for (const r of rows('TheFinalsSeasonKey')) {
      const n = Number(r.SeasonNumber);
      if (r.SeasonID != null && Number.isInteger(n) && n > 0) seasons.set(String(r.SeasonID), { id: String(r.SeasonID), n, name: r.Name ?? `Season ${n}`, startMs: ms(r.StartDate), endMs: ms(r.EndDate) });
    }
    for (const r of rows('TheFinalsMasteryKey')) {
      if (r.BucketID != null) mastery.set(String(r.BucketID), { category: r.Category ?? null, name: cleanName(r.Name), assetId: r.GameAssetID ?? null });
    }
  }

  return {
    item: (id) => items.get(String(id)) ?? null,
    scenario: (id) => scenarios.get(String(id)) ?? null,
    map: (mapVariant) => maps.get(mapVariant) ?? null,
    season: (id) => seasons.get(String(id)) ?? null,
    seasons: () => [...seasons.values()].sort((a, b) => a.n - b.n),
    mastery: (bucketId) => mastery.get(String(bucketId)) ?? null,
  };
}

export const STATIC_KEYS = createKeys(null);
