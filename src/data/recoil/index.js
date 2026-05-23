export const WEAPON_CLASSES = ['Light', 'Medium', 'Heavy'];

// Fire-mode badge styling.
export const FIRE_MODE_META = {
  auto: { label: 'Auto', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  burst: { label: 'Burst', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  semi: { label: 'Semi', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
};

// Per-bullet colour: 1st shot cyan -> last shot red, conveying spray order.
export function shotColor(frac) {
  const hue = 190 * (1 - frac); // 190 (cyan) -> 0 (red)
  return `hsl(${hue.toFixed(0)}, 85%, 60%)`;
}

// Don't magnify patterns smaller than this (data units) to fill the box —
// keeps near-zero-recoil single-shot weapons from blowing up tracking jitter.
export const MIN_RECOIL_UNITS = 25;

// Largest bullet-impact distance from the first shot. Used to tell whether a
// weapon actually has a recoil pattern worth practising (auto/burst) vs a
// single-shot/bolt weapon (Revolver, BFR TITAN, CB-01) with effectively none.
export const RECOIL_THRESHOLD_PX = 15;
export function patternExtent(weapon) {
  let m = 0;
  for (const [x, y] of weapon.pattern) {
    const r = Math.hypot(x, y);
    if (r > m) m = r;
  }
  return m;
}
export function hasRecoil(weapon) {
  return patternExtent(weapon) >= RECOIL_THRESHOLD_PX;
}

// Path to a gameplay clip for a weapon.
export function weaponVideoSrc(weapon) {
  return `/videos/recoil/${weapon.key.toUpperCase()}-web.mp4`;
}

// Accent colour per weapon class, reused by the selector and the viewer.
// Class strings are written out in full so Tailwind's JIT keeps them.
export const CLASS_ACCENT = {
  Light: { text: 'text-sky-400', btn: 'bg-sky-600 hover:bg-sky-500', stroke: '#38bdf8', dot: '#7dd3fc' },
  Medium: { text: 'text-emerald-400', btn: 'bg-emerald-600 hover:bg-emerald-500', stroke: '#34d399', dot: '#6ee7b7' },
  Heavy: { text: 'text-rose-400', btn: 'bg-rose-600 hover:bg-rose-500', stroke: '#fb7185', dot: '#fda4af' },
};

let cache = null;
export async function loadWeapons() {
  if (cache) return cache;
  const mod = await import('./weapons.json');
  cache = mod.default;
  return cache;
}

// Largest absolute X/Y across every weapon, used to derive a single shared
// scale so low-recoil and high-recoil weapons stay visually proportional.
export function getGlobalBounds(weapons) {
  let maxX = 1;
  let maxY = 1;
  for (const w of weapons) {
    for (const [x, y] of w.pattern) {
      if (Math.abs(x) > maxX) maxX = Math.abs(x);
      if (Math.abs(y) > maxY) maxY = Math.abs(y);
    }
    for (const [x, y] of w.trajectory) {
      if (Math.abs(x) > maxX) maxX = Math.abs(x);
      if (Math.abs(y) > maxY) maxY = Math.abs(y);
    }
  }
  return { maxX, maxY };
}

export function getWeaponBounds(weapon) {
  let maxX = 1;
  let maxY = 1;
  for (const [x, y] of weapon.trajectory) {
    if (Math.abs(x) > maxX) maxX = Math.abs(x);
    if (Math.abs(y) > maxY) maxY = Math.abs(y);
  }
  return { maxX, maxY };
}
