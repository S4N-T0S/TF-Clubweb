// Matches an owned cosmetic to its picture, or a sound bite to its audio, from thefinals.wiki.
// The wiki has no Embark ids, so the match is by name, then narrowed by type, weapon,
// sponsor, rarity and season. tools/build-vault-item-images.mjs writes the files and the
// index (itemManifest.json).
export const ITEM_IMAGE_BASE = '/vault/items';
export const ITEM_SOUND_BASE = '/vault/sounds';

export const normName = (s) =>
  String(s ?? '')
    .replace(/''/g, "'")
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

// Finer than ItemType: an outfit piece's slot, the kind of emote, card part or animation.
// `k` is a key-file row as keys.item() returns it.
export const itemClass = (k) => {
  const part = (k.asset || '').split('_')[1] || '';
  switch (k.itemType) {
    case 'CustomizationItem':
      return k.subType || part || 'Other';
    case 'PlayerCardCustomization':
      return part.replace('PlayerCard', 'Card') || 'Card';
    case 'ClansCustomization':
      return part || 'Clans';
    case 'AnimationCustomization':
      return `Anim${(k.tags || []).find((t) => t.startsWith('Customization.Item.Animation.'))?.split('.').pop() ?? ''}`;
    case 'WeaponAttachment':
      return part === 'MultiDeviceScreen' ? 'Screen' : 'Sight';
    default:
      return k.itemType || 'Other';
  }
};

export const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];

export const itemSeason = (tags) => {
  const n = Number((tags || []).find((t) => t.startsWith('Online.Season.'))?.split('.')[2]);
  return Number.isInteger(n) ? n : null;
};

export const itemSponsor = (tags) => normName((tags || []).find((t) => t.startsWith('Customization.Sponsor.'))?.split('.')[2]) || null;

// Item class -> what the game calls it, its group on the Collection page, and the wiki's
// Type. A class with no wiki type gets no picture: the wiki has no sights or club items,
// shows animations, gestures, sound bites and voices with one generic icon each, and every
// hair is named "Hair", which leaves nothing to match on.
const cls = (label, group, wiki = null) => ({ label, group, wiki });
export const ITEM_GROUPS = ['Outfit', 'Body', 'Weapons', 'Emotes', 'Player card', 'Club'];
export const ITEM_CLASSES = {
  Headwear: cls('Headwear', 'Outfit', 'HEADWEAR'),
  Facewear: cls('Facewear', 'Outfit', 'FACEWEAR'),
  Earrings: cls('Ears', 'Outfit', 'EARS'),
  BodyUpper: cls('Upper body', 'Outfit', 'UPPER BODY'),
  Hands: cls('Hands', 'Outfit', 'HANDS'),
  Wrists: cls('Wrist', 'Outfit', 'WRIST'),
  Watch: cls('Watch', 'Outfit', 'WATCH'),
  BodyLower: cls('Lower body', 'Outfit', 'LOWER BODY'),
  Shoes: cls('Feet', 'Outfit', 'FEET'),
  BackUpper: cls('Upper back', 'Outfit', 'UPPER BACK'),
  BackLowerRight: cls('Lower back', 'Outfit', 'LOWER BACK'),
  Bandolier: cls('Crossbody', 'Outfit', 'CROSSBODY'),
  TorsoUpperLeft: cls('Emblem', 'Outfit', 'EMBLEM'),
  Pet: cls('Pet', 'Outfit', 'PET'),
  VisualEffects: cls('Effect', 'Outfit', 'EFFECT'),
  BodyType: cls('Body type', 'Body', 'BODY TYPE'),
  Head: cls('Face', 'Body', 'FACE'),
  Hair: cls('Hair', 'Body'),
  Eyes: cls('Eyes', 'Body', 'EYES'),
  FacialHair: cls('Facial hair', 'Body', 'FACIAL HAIR'),
  FacePaint: cls('Face paint', 'Body', 'FACE PAINT'),
  BodyPaint: cls('Body paint', 'Body', 'BODY PAINT'),
  Tattoos: cls('Tattoo', 'Body', 'TATTOO'),
  Nails: cls('Nails', 'Body', 'NAILS'),
  Voice: cls('Voice', 'Body'),
  WeaponSkin: cls('Skin', 'Weapons', 'SKIN'),
  WeaponCharm: cls('Charm', 'Weapons', 'CHARM'),
  WeaponSticker: cls('Sticker', 'Weapons', 'STICKER'),
  Sight: cls('Sight', 'Weapons'),
  Screen: cls('Screen', 'Weapons', 'SCREEN'),
  AnimInspect: cls('Inspect animation', 'Weapons'),
  AnimDeploy: cls('Deploy animation', 'Weapons'),
  AnimReloadTactical: cls('Tactical reload', 'Weapons'),
  AnimReloadEmpty: cls('Empty reload', 'Weapons'),
  AnimCycleAction: cls('Cycle action', 'Weapons'),
  AnimPrimary: cls('Primary animation', 'Weapons'),
  AnimSecondary: cls('Secondary animation', 'Weapons'),
  Anim: cls('Animation', 'Weapons'),
  Emote: cls('Emote', 'Emotes', 'EMOTE'),
  InGameEmote: cls('Emote', 'Emotes', 'EMOTE'),
  HandGesture: cls('Gesture', 'Emotes'),
  CharacterSoundEffect: cls('Sound', 'Emotes'),
  Emoticon: cls('Emoticon', 'Emotes', 'EMOTICON'),
  Spray: cls('Spray', 'Emotes', 'SPRAY'),
  CardBackground: cls('Card background', 'Player card', 'BACKGROUND'),
  CardBorder: cls('Card border', 'Player card', 'BORDER'),
  CardBadge: cls('Card badge', 'Player card', 'BADGE'),
  ClansLogo: cls('Club logo', 'Club'),
  ClansFrame: cls('Club frame', 'Club'),
  ClansHomeScreen: cls('Club home screen', 'Club'),
};
const COSMETIC_TYPES = new Set(['CustomizationItem', 'WeaponSkin', 'WeaponCharm', 'WeaponSticker', 'WeaponAttachment', 'AnimationCustomization', 'Emoticon', 'Spray', 'PlayerCardCustomization', 'ClansCustomization']);
const GROUP_OF_TYPE = { CustomizationItem: 'Outfit', AnimationCustomization: 'Weapons', WeaponAttachment: 'Weapons', PlayerCardCustomization: 'Player card', ClansCustomization: 'Club' };

// False for the classes the wiki has no picture of: their tiles never wait for the index.
export const classHasPictures = (klass) => Object.hasOwn(ITEM_CLASSES, klass) && ITEM_CLASSES[klass].wiki != null;

// { klass, label, group } of a key-file row, or null for what is not a cosmetic (quests,
// currencies, weapons). A class newer than the table keeps its type's group.
export const itemKind = (k) => {
  if (!k || !COSMETIC_TYPES.has(k.itemType)) return null;
  const klass = itemClass(k);
  if (Object.hasOwn(ITEM_CLASSES, klass)) return { klass, label: ITEM_CLASSES[klass].label, group: ITEM_CLASSES[klass].group };
  return { klass, label: klass.replace(/([a-z0-9])([A-Z])/g, '$1 $2'), group: GROUP_OF_TYPE[k.itemType] ?? 'Weapons' };
};

// Weapon code inside a skin, animation or sight asset name -> the weapon, in the wiki's
// spelling. Longest prefix wins.
const EQUIPMENT = Object.entries({
  APSTurret: 'APS Turret', AssaultRifle_01: 'AKM', AssaultRifle_Famas: 'FAMAS', Famas: 'FAMAS', AssaultRifle_SCAR: 'FCAR', SCAR: 'FCAR', ScarH: 'FCAR',
  AssaultRifleHeavy: 'ShAK-50', AssaultRifleLight: 'ARN-220', BattleRifleLeverAction: 'CB-01 Repeater', BattleRifle_01: 'LH1', BattleRifle_02: 'Pike-556',
  Beretta93R: '93R', Pistol: '93R', PistolDual: '.50 Akimbo', PistolSuppressed: 'V9S', SilencedPistol: 'V9S', Bow: 'Recurve Bow', Firearm_Bow: 'Recurve Bow',
  C4: 'C4', Crossbow: 'Chimera-XB', Defibrillator: 'Defibrillator', DeployableShield: 'Barricade', DomeShield: 'Dome Shield', DrillBreach: 'Breach Drill',
  DualBlades: 'Dual Blades', Melee_DualBlades: 'Dual Blades', EMPTrap: 'Glitch Trap', Flamethrower: 'Flamethrower', FoxTacticalElementum: 'Dagger',
  GooGun: 'Goo Gun', GravityWell: 'Gravity Vortex', GrenadeEMP: 'Glitch Grenade', GrenadeFlash: 'Flashbang', GrenadeFrag: 'Frag Grenade',
  GrenadeGas: 'Gas Grenade', GrenadeGoo: 'Goo Grenade', GrenadeIncendiary: 'Pyro Grenade', GrenadeSmoke: 'Smoke Grenade', GrenadeSonar: 'Sonar Grenade',
  HMG_Minigun: 'M134 Minigun', Minigun: 'M134 Minigun', HealingEmitter: 'Healing Emitter', HealingGun: 'Healing Beam', JumpPad: 'Jump Pad',
  KS23: 'KS-23', Shotgun_KS23: 'KS-23', LMG: 'M60', M60: 'M60', LMG_LewisGun: 'Lewis Gun', LewisGun: 'Lewis Gun', Launcher_01: 'CL-40', Launcher_02: 'RPG-7',
  Launcher_03: 'MGL32', Launcher_Anchor: 'Lockbolt', LevitatingPlatform: 'Hover Pad', LinkedPortals: 'Gateway', MP5: 'XP-54', SMG_MP5: 'XP-54',
  MineGas: 'Gas Mine', MineIncendiary: 'Pyro Mine', Mine_01: 'Explosive Mine', MultiDevice: 'Multi-Device', PlayingCards: 'Throwing Knives',
  ThrowingKnives: 'Throwing Knives', Polearm: 'Spear', ProximitySensor: 'Proximity Sensor', RemingtonModel1900: 'SH1900', ReverseGravityZone: 'Anti-Gravity Cube',
  RevolverHeavy: 'BFR Titan', Revolver: 'R .357', RifleDart: 'Tracking Dart', RifleDart01: 'Tracking Dart', RiotShield: 'Riot Shield', SMG_01: 'M11',
  Mac11: 'M11', SMG_Friendly: 'H+ Infuser', SMG_Medium: 'P90', Shotgun_02: 'SA1216', Shotgun_03: 'Model 1887', ShotgunBreakAction: 'Cerberus 12GA',
  ShotgunPumpAction: 'M26 Matter', Sledgehammer: 'Sledgehammer', Sniper: 'SR-84', Sword: 'Sword', TacticalBreach: 'Breach Charge', Taser: 'Nullifier',
  Thermite: 'Thermal Bore', TurretDeployable: 'Guardian Turret', VanishBomb: 'Vanishing Bomb', Zipwire: 'Zipline',
}).sort((a, b) => b[0].length - a[0].length);

export const itemEquipment = (asset) => {
  const rest = /^DA_(?:Skin|Anim)_(.+)$/.exec(asset || '')?.[1] ?? /^DA_Sight_[A-Za-z]+_\d+_(.+)$/.exec(asset || '')?.[1];
  if (!rest) return null;
  return EQUIPMENT.find(([code]) => rest === code || rest.startsWith(`${code}_`))?.[1] ?? null;
};

// Mastery levels 2 to 5 of every weapon reward a skin named "Dye Job" (later levels have
// names of their own and match by name). The asset letter says which: on every weapon in
// both exports checked, the letters owned are the first of A, C, B, F up to its level. A
// bare name is A.
const DYE_LEVELS = { '': 2, A: 2, C: 3, B: 4, F: 5 };

// A sound bite's name is unique on the wiki, so the name alone picks its audio file.
export function createItemSounds(manifest) {
  const sounds = manifest?.sounds ?? {};
  return (it) => {
    const key = it.klass === 'CharacterSoundEffect' ? normName(it.name) : null;
    return key && Object.hasOwn(sounds, key) ? sounds[key] : null;
  };
}

// Manifest rows: [type, equipment, rarity initial, season, mastery level, file, sponsors].
// File is 0 for a wiki row whose picture is missing: it still counts as a candidate.
const TYPE = 0, EQUIP = 1, RARITY = 2, SEASON = 3, LEVEL = 4, FILE = 5, SPONSORS = 6;

// `it`: { name, klass, asset, rarity, season, sponsor }. Returns a file name, or null when
// the wiki has no row for it or more than one picture still fits.
export function createItemImages(manifest) {
  const names = manifest?.names ?? {};
  return (it) => {
    const type = Object.hasOwn(ITEM_CLASSES, it.klass) ? ITEM_CLASSES[it.klass].wiki : null;
    const key = normName(it.name);
    const rows = type && Object.hasOwn(names, key) ? names[key] : null;
    if (!rows) return null;
    let c = rows.filter((r) => r[TYPE] === type);
    if (type === 'SKIN') {
      // A skin name repeats across weapons, so one from an unlisted weapon gets no picture.
      const equipment = itemEquipment(it.asset);
      if (!equipment) return null;
      c = c.filter((r) => r[EQUIP] === equipment);
      if (key === 'DYEJOB') {
        const letter = /_([A-Z])$/.exec(it.asset)?.[1] ?? '';
        const level = Object.hasOwn(DYE_LEVELS, letter) ? DYE_LEVELS[letter] : null;
        c = c.filter((r) => r[LEVEL] === level);
      }
    }
    // The wiki leaves the sponsor off some sponsored items, but never names another one.
    if (it.sponsor) {
      const same = c.filter((r) => r[SPONSORS] && r[SPONSORS].split('|').includes(it.sponsor));
      c = same.length ? same : c.filter((r) => !r[SPONSORS]);
    }
    if (!c.length) return null;
    const rarity = it.rarity && it.rarity !== 'Unknown' ? it.rarity[0] : null;
    if (c.length === 1) {
      const [r] = c;
      const off = (a, b) => a != null && b && a !== b;
      return off(rarity, r[RARITY]) && off(it.season, r[SEASON]) ? null : r[FILE] || null;
    }
    // Colour variants share a name: only a rarity and season that leave one picture decide.
    if (rarity) c = c.filter((r) => r[RARITY] === rarity);
    if (it.season != null) c = c.filter((r) => r[SEASON] === it.season);
    return c.length && c.every((r) => r[FILE] === c[0][FILE]) ? c[0][FILE] || null : null;
  };
}
