// Map identity + background art, bundled from thefinals.wiki (thank you bbg)

// Keys that have a bundled <key>.webp file
const MAP_SLUGS = new Set([
  'monaco', 'seoul', 'kyoto', 'vegas', 'vegas-stadium', 'bernal', 'skyway', 'horizon',
  'citadel', 'fangwai', 'peace', 'starlight', 'practice', 'fortune', 'heavyhitters',
]);

// `focus` is the CSS object-position used to crop the wide photo into the card — tune per map (e.g. '50% 30%' shows higher up) to frame the recognizable part
const MAPS = {
  Arena_01: { key: 'skyway', name: 'Skyway Stadium', focus: '50% 35%' },
  Arena_02: { key: 'horizon', name: 'Horizon', focus: '50% 38%' },
  Arena_04: { key: 'citadel', name: 'NOZOMI Citadel', focus: '50% 38%' },
  Monaco_01: { key: 'monaco', name: 'Monaco', focus: '50% 42%' },
  Seoul_01: { key: 'seoul', name: 'Seoul', focus: '50% 38%' },
  Seoul_02: { key: 'fortune', name: 'Fortune Stadium', focus: '50% 38%' },
  Kyoto_01: { key: 'kyoto', name: 'Kyoto', focus: '50% 42%' },
  Bernal_01: { key: 'bernal', name: 'Bernal', focus: '50% 40%' },
  LasVegas_01: { key: 'vegas', name: 'Las Vegas', focus: '50% 45%' },
  LasVegas_02: { key: 'vegas-stadium', name: 'Las Vegas Stadium', focus: '50% 42%' },
  BayCity_01: { key: 'fangwai', name: 'Fangwai City', focus: '50% 40%' },
  Forest_01: { key: 'peace', name: 'P.E.A.C.E. Center', focus: '50% 42%' },
  PracticeRange_01: { key: 'practice', name: 'Practice Range', focus: '50% 45%' },
  Playground_01: { key: 'heavyhitters', name: 'Heavy Hitters', focus: '50% 42%' },
  HeavyHitters_02: { key: 'heavyhitters', name: 'Heavy Hitters', focus: '50% 42%' },
  Village_01: { key: 'starlight', name: 'Starlight Hollow', focus: '50% 40%' },
  CashBall_01: { key: null, name: 'Cashball' },
};

const lookup = (mv) => {
  const m = /^DA_MV_([A-Za-z]+)_(\d+)/.exec(mv || '');
  if (!m) return null;
  return MAPS[`${m[1]}_${m[2]}`] || MAPS[`${m[1]}_01`] || null; // unknown number -> _01 of same map
};

// { name, image (path|null), focus } for a round's MapVariant
export function resolveMap(mapVariant) {
  const e = lookup(mapVariant);
  if (!e) return { name: null, image: null, focus: '50% 40%' };
  return {
    name: e.name,
    image: e.key && MAP_SLUGS.has(e.key) ? `/vault/maps/${e.key}.webp` : null,
    focus: e.focus || '50% 40%',
  };
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
