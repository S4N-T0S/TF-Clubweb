// Map identity + background art, bundled from thefinals.wiki (thank you bbg)

// Keys that have a bundled <key>.webp file
const MAP_SLUGS = new Set([
  'monaco', 'seoul', 'kyoto', 'vegas', 'vegas-stadium', 'bernal', 'skyway', 'horizon',
  'citadel', 'fangwai', 'peace', 'starlight', 'practice', 'fortune', 'heavyhitters',
  'heavenorelse', 'cashball',
]);

// `focus` is the CSS object-position used to crop the wide photo into the card — tune per map (e.g. '50% 30%' shows higher up) to frame the recognizable part.
// `zoom` (optional, default 1) scales the photo: 1 = cover, <1 zooms OUT to reveal more of the scene (gaps get a blurred fill), >1 zooms IN. Tune both with /__maptuner.
const MAPS = {
  Arena_01: { key: 'skyway', name: 'Skyway Stadium', focus: '50% 42%' },
  Arena_02: { key: 'horizon', name: 'Horizon', focus: '50% 51%' },
  Arena_04: { key: 'citadel', name: 'NOZOMI Citadel', focus: '50% 85%' },
  Monaco_01: { key: 'monaco', name: 'Monaco', focus: '50% 60%' },
  Seoul_01: { key: 'seoul', name: 'Seoul', focus: '50% 53%' },
  Seoul_02: { key: 'fortune', name: 'Fortune Stadium', focus: '50% 72%' },
  Kyoto_01: { key: 'kyoto', name: 'Kyoto', focus: '50% 42%' },
  Bernal_01: { key: 'bernal', name: 'Bernal', focus: '50% 63%' },
  LasVegas_01: { key: 'vegas', name: 'Las Vegas', focus: '50% 27%' },
  LasVegas_02: { key: 'vegas-stadium', name: 'Las Vegas Stadium', focus: '50% 64%' },
  BayCity_01: { key: 'fangwai', name: 'Fangwai City', focus: '50% 57%' },
  Forest_01: { key: 'peace', name: 'P.E.A.C.E. Center', focus: '50% 38%' },
  PracticeRange_01: { key: 'practice', name: 'Practice Range', focus: '50% 66%' },
  Playground_01: { key: 'heavyhitters', name: 'Heavy Hitters', focus: '50% 21%' },
  HeavyHitters_02: { key: 'heavenorelse', name: 'Heaven or Else', focus: '50% 16%' },
  Village_01: { key: 'starlight', name: 'Starlight Hollow', focus: '50% 56%' },
  CashBall_01: { key: 'cashball', name: 'Cashball', focus: '50% 37%' },
};

const lookup = (mv) => {
  const m = /^DA_MV_([A-Za-z]+)_(\d+)/.exec(mv || '');
  if (!m) return null;
  return MAPS[`${m[1]}_${m[2]}`] || MAPS[`${m[1]}_01`] || null; // unknown number -> _01 of same map
};

// { name, image (path|null), focus, zoom } for a round's MapVariant
export function resolveMap(mapVariant) {
  const e = lookup(mapVariant);
  if (!e) return { name: null, image: null, focus: '50% 40%', zoom: 1 };
  return {
    name: e.name,
    image: e.key && MAP_SLUGS.has(e.key) ? `/vault/maps/${e.key}.webp` : null,
    focus: e.focus || '50% 40%',
    zoom: e.zoom ?? 1,
  };
}

// LTM background override, keyed by ScenarioID (the gamemode/matchmaking id). A
// limited-time mode that plays across normal/varied maps can force its own branded
// arena art here — this takes PRIORITY over the round's actual MapVariant. Each
// value is a MAPS codename, so the art + focus stay tunable in /__maptuner.
// NB Heavy Hitters & Heaven or Else are intentionally NOT here: they share
// ScenarioID 152796620 and are told apart by their own arenas (Playground_01 vs
// HeavyHitters_02), handled by the normal map lookup above.
const LTM_BG_SCENARIOS = {
  '905608807': 'CashBall_01', // Super Cashball
};

// { image, focus, zoom } for a ScenarioID with a dedicated LTM background, else null.
export function resolveLtmBackground(scenarioId) {
  const e = MAPS[LTM_BG_SCENARIOS[String(scenarioId)]];
  if (!e?.key || !MAP_SLUGS.has(e.key)) return null;
  return { image: `/vault/maps/${e.key}.webp`, focus: e.focus || '50% 40%', zoom: e.zoom ?? 1 };
}

// Bundled map-background URLs — for preloading alongside the weapon icons so the match-history cards paint instantly once an export is loaded
export const mapImageUrls = () => [...MAP_SLUGS].map((s) => `/vault/maps/${s}.webp`);

// EnvironmentalCondition -> a small icon family the UI renders (time/weather)
const CONDITION_TYPE = {
  Afternoon: 'day', Day: 'day', BrightDay: 'day', Morning: 'day', '01': 'day',
  Night: 'night', Blackout: 'night',
  Evening: 'sunset', Sunset: 'sunset', Dawn: 'sunset',
  Fog: 'fog', Storm: 'storm', HeavyRain: 'rain', Sandstorm: 'sandstorm', Winter: 'snow',
  Lunar: 'event', Halloween: 'event',
};
export const conditionType = (condition) => CONDITION_TYPE[condition] || null;
