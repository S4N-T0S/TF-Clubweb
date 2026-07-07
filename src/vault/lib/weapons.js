// Weapon / gadget / specialization content-ID -> name map.
// Keys are the signed-32-bit IDs that appear in RoundStat.Data.KillsPerItem.
// Source: .docs/finals-weapon-id-table.md (all 56 sample IDs mapped).
// KillsPerItem keys arrive as strings, so we key this table by string too.

// type: Weapon | Gadget | Spec | Event
// archetype: Light | Medium | Heavy | Global
export const WEAPONS = {
  // Light
  '199277493': { name: 'ARN-220', archetype: 'Light', type: 'Weapon' },
  '1599997630': { name: 'M11', archetype: 'Light', type: 'Weapon' },
  '1588362446': { name: 'LH1', archetype: 'Light', type: 'Weapon' },
  '-322594587': { name: 'XP-54', archetype: 'Light', type: 'Weapon' },
  '-158222801': { name: 'V9S', archetype: 'Light', type: 'Weapon' },
  '801833527': { name: '93R', archetype: 'Light', type: 'Weapon' },
  '-1900663257': { name: 'Throwing Knives', archetype: 'Light', type: 'Weapon' },
  '81981883': { name: 'Recurve Bow', archetype: 'Light', type: 'Weapon' },
  '-638001333': { name: 'M26 Matter', archetype: 'Light', type: 'Weapon' },
  '1612446258': { name: 'SH1900', archetype: 'Light', type: 'Weapon' },
  '-657541680': { name: 'SR-84', archetype: 'Light', type: 'Weapon' },
  '757827716': { name: 'Dagger', archetype: 'Light', type: 'Weapon' },
  '-915684865': { name: 'Sword', archetype: 'Light', type: 'Weapon' },
  '1948814529': { name: 'Gateway', archetype: 'Light', type: 'Gadget' },
  '432758549': { name: 'Breach Charge', archetype: 'Light', type: 'Gadget' },
  '981999322': { name: 'Tracking Dart', archetype: 'Light', type: 'Gadget' },
  '-578452692': { name: 'Thermal Bore', archetype: 'Light', type: 'Gadget' },

  // Medium
  '473278792': { name: 'AKM', archetype: 'Medium', type: 'Weapon' },
  '-566338044': { name: 'FCAR', archetype: 'Medium', type: 'Weapon' },
  '-2101446056': { name: 'PIKE-556', archetype: 'Medium', type: 'Weapon' },
  '1333183869': { name: 'Model 1887', archetype: 'Medium', type: 'Weapon' },
  '-2036840549': { name: 'R .357', archetype: 'Medium', type: 'Weapon' },
  '-240495033': { name: 'FAMAS', archetype: 'Medium', type: 'Weapon' },
  '-684923521': { name: 'CB-01 Repeater', archetype: 'Medium', type: 'Weapon' },
  '1501440399': { name: 'CL-40', archetype: 'Medium', type: 'Weapon' },
  '107797000': { name: 'Cerberus 12GA', archetype: 'Medium', type: 'Weapon' },
  '-237953358': { name: 'Dual Blades', archetype: 'Medium', type: 'Weapon' },
  '-1834102173': { name: 'P90', archetype: 'Medium', type: 'Weapon' },
  '-1714487033': { name: 'Riot Shield', archetype: 'Medium', type: 'Weapon' },
  '-21077747': { name: 'Gas Mine', archetype: 'Medium', type: 'Gadget' },
  '1886362451': { name: 'APS Turret', archetype: 'Medium', type: 'Gadget' },
  '140643579': { name: 'Chimera-XB', archetype: 'Medium', type: 'Weapon' },
  '-2146518365': { name: 'Defibrillator', archetype: 'Medium', type: 'Gadget' },
  '-1356235903': { name: 'Jump Pad', archetype: 'Medium', type: 'Gadget' },

  // Heavy
  '-816074217': { name: '.50 Akimbo', archetype: 'Heavy', type: 'Weapon' },
  '-160507163': { name: 'SA1216', archetype: 'Heavy', type: 'Weapon' },
  '545639535': { name: 'BFR Titan', archetype: 'Heavy', type: 'Weapon' },
  '-212966229': { name: 'M60', archetype: 'Heavy', type: 'Weapon' },
  '-676727577': { name: 'SHAK-50', archetype: 'Heavy', type: 'Weapon' },
  '1743942098': { name: 'Lewis Gun', archetype: 'Heavy', type: 'Weapon' },
  '1042541498': { name: 'RPG-7', archetype: 'Heavy', type: 'Gadget' },
  '-211705009': { name: 'Sledgehammer', archetype: 'Heavy', type: 'Weapon' },
  '-1152803024': { name: 'M134 Minigun', archetype: 'Heavy', type: 'Weapon' },
  '1096645849': { name: 'KS-23', archetype: 'Heavy', type: 'Weapon' },
  '1480845770': { name: 'Flamethrower', archetype: 'Heavy', type: 'Weapon' },
  '1821236620': { name: 'Spear', archetype: 'Heavy', type: 'Weapon' },
  '1647891907': { name: 'Pyro Mine', archetype: 'Heavy', type: 'Gadget' },
  '520836765': { name: "Charge 'n' Slam", archetype: 'Heavy', type: 'Spec' },
  '-455578974': { name: 'C4', archetype: 'Heavy', type: 'Gadget' },
  '1088429850': { name: 'MGL32', archetype: 'Heavy', type: 'Weapon' },
  '-1790216799': { name: 'Winch Claw', archetype: 'Heavy', type: 'Spec' },
  '-1823661953': { name: 'Lockbolt', archetype: 'Heavy', type: 'Gadget' },

  // Global / shared gadgets
  '1082327915': { name: 'Frag Grenade', archetype: 'Global', type: 'Gadget' },
  '-351094439': { name: 'Explosive Mine', archetype: 'Global', type: 'Gadget' },
  '207168914': { name: 'Gas Grenade', archetype: 'Global', type: 'Gadget' },
  '81925953': { name: 'Pyro Grenade', archetype: 'Global', type: 'Gadget' },

  // Event / LTM items
  '-1157104516': { name: 'Snowball', archetype: 'Global', type: 'Event' },
  '-2046791033': { name: 'Blast Off! RPG-7', archetype: 'Medium', type: 'Event' },
};

// Slugs that have a bundled icon under public/vault/weapons/<slug>.webp.
// Sourced from thefinals.wiki (in-game Rank-1 weapon/gadget/spec renders),
// converted with `magick <src> -resize 128x128 -quality 82 <slug>.webp`.
// Snowball has no wiki icon -> falls back to a text chip.
// To add one later: drop <slug>.webp in that folder and add the slug here.
const ICON_SLUGS = new Set([
  '50-akimbo', '93r', 'akm', 'aps-turret', 'arn-220', 'bfr-titan', 'blast-off-rpg-7', 'breach-charge',
  'c4', 'cb-01-repeater', 'cerberus-12ga', 'charge-n-slam', 'chimera-xb', 'cl-40', 'dagger', 'defibrillator',
  'dual-blades', 'explosive-mine', 'famas', 'fcar', 'flamethrower', 'frag-grenade', 'gas-grenade', 'gas-mine',
  'gateway', 'h-infuser', 'jump-pad', 'ks-23', 'lewis-gun', 'lh1', 'lockbolt', 'm11', 'm134-minigun', 'm26-matter', 'm60',
  'mgl32', 'model-1887', 'p90', 'pike-556', 'pyro-grenade', 'pyro-mine', 'r-357', 'recurve-bow', 'riot-shield',
  'rpg-7', 'sa1216', 'sh1900', 'shak-50', 'sledgehammer', 'spear', 'sr-84', 'sword', 'thermal-bore',
  'throwing-knives', 'tracking-dart', 'v9s', 'winch-claw', 'xp-54',
]);

// Weapon display-name -> filename slug (matches the bundled icon files).
export const weaponSlug = (name) => (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null);

// Resolve a KillsPerItem id to a display record, tolerant of unknown ids (real
// exports from later seasons may contain ids not in the sample set). `icon` is
// the bundled webp path when one exists, else null (UI falls back to a chip).
export const resolveWeapon = (id) => {
  const hit = WEAPONS[String(id)];
  if (!hit) return { name: `Unknown item (${id})`, archetype: 'Unknown', type: 'Unknown', unknown: true, slug: null, icon: null };
  const slug = weaponSlug(hit.name);
  return { ...hit, slug, icon: ICON_SLUGS.has(slug) ? `/vault/weapons/${slug}.webp` : null };
};

// Every weapon / gadget / specialization as a display record, in the table's
// natural order (Light → Medium → Heavy → Global → Event). Used by the match
// weapon-filter picker (grouped like thefinals.wiki/wiki/Weapons by archetype).
export const ALL_WEAPONS = Object.entries(WEAPONS).map(([id, w]) => {
  const slug = weaponSlug(w.name);
  return { id, ...w, slug, icon: ICON_SLUGS.has(slug) ? `/vault/weapons/${slug}.webp` : null };
});

// Bundled weapon-icon URLs — for preloading so the match tooltips and the
// weapon-filter picker are instant once an export is loaded.
export const weaponIconUrls = () => [...ICON_SLUGS].map((s) => `/vault/weapons/${s}.webp`);
