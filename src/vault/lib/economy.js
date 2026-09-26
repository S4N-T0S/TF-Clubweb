// Display metadata for the Purchases / Economy view.
//
// The export records WHEN / WHERE / WHY something was granted, but carries no
// item id and usually no price, so everything here is about labelling the
// transaction / currency record types — NOT naming the bought items (which are
// generally not recoverable; the page is explicit about that).

// TransactionLog.Source -> friendly label
export const SOURCE_LABELS = {
  realmoneytransaction: 'Real money',
  battlepass: 'Battle Pass',
  'battlepass-historical': 'Battle Pass (historical)',
  collectionevent: 'Collection Event',
  embarkstore: 'In-game Store',
  twitchdrop: 'Twitch Drop',
  giveaway: 'Giveaway',
  thirdpartysubscription: 'Subscription perk',
  unknown: 'Unknown',
};
// hasOwn on the label tables below: they are keyed by raw export values, and a
// "__proto__" one would otherwise return Object.prototype (React throws when an
// object reaches it as a child) or a function for "constructor" (renders blank).
export const sourceLabel = (s) => (Object.hasOwn(SOURCE_LABELS, s) ? SOURCE_LABELS[s] : s || 'Unknown');

export const SOURCE_TONES = {
  realmoneytransaction: 'yellow',
  battlepass: 'indigo',
  'battlepass-historical': 'indigo',
  collectionevent: 'blue',
  embarkstore: 'emerald',
  twitchdrop: 'fuchsia',
  giveaway: 'gray',
  thirdpartysubscription: 'blue',
  unknown: 'gray',
};
export const sourceTone = (s) => SOURCE_TONES[s] || 'gray';

// TransactionLog.GameStore -> friendly label
export const STORE_LABELS = {
  embark: 'In-game',
  steam: 'Steam',
  microsoft: 'Microsoft',
  twitch: 'Twitch',
  giveaway: 'Giveaway',
};
export const storeLabel = (s) => (s && Object.hasOwn(STORE_LABELS, s) ? STORE_LABELS[s] : s || '—');

// TransactionLog.TransactionType -> friendly label. `purchasewithoutconsume` is still a purchase (the consumable just wasn't burned yet); show it as one
export const TYPE_LABELS = {
  purchase: 'Purchase',
  purchasewithoutconsume: 'Purchase',
  gift: 'Gift',
  reward: 'Reward',
  rewarddurables: 'Reward',
  revokedurables: 'Revoked',
};
export const typeLabel = (t) => (Object.hasOwn(TYPE_LABELS, t) ? TYPE_LABELS[t] : t || '—');

// HardCurrencyLog.LogType -> label + badge tone + sign (+1 inflow / -1 outflow)
export const LOGTYPE_META = {
  earned: { label: 'Earned', tone: 'emerald', sign: 1 },
  bought: { label: 'Bought', tone: 'yellow', sign: 1 },
  gifted: { label: 'Gifted', tone: 'blue', sign: 1 },
  spent: { label: 'Spent', tone: 'red', sign: -1 },
  unknown: { label: 'Other', tone: 'gray', sign: 1 },
};
export const logTypeMeta = (t) => (Object.hasOwn(LOGTYPE_META, t) ? LOGTYPE_META[t] : { label: t || 'Unknown', tone: 'gray', sign: 0 });

// Transaction-log filter groups (button -> the set of Sources it matches). `match: null` = show everything
export const SOURCE_GROUPS = [
  { key: 'All', match: null },
  { key: 'Real money', match: ['realmoneytransaction'] },
  { key: 'Battle Pass', match: ['battlepass', 'battlepass-historical'] },
  { key: 'Store', match: ['embarkstore'] },
  { key: 'Twitch', match: ['twitchdrop'] },
  { key: 'Events', match: ['collectionevent'] },
  { key: 'Other', match: ['giveaway', 'thirdpartysubscription', 'unknown'] },
];

// The price we display is the standard USD/EUR store price (TransactionLog.PricePoint —
// the same number in $ and €). A wallet in one of these currencies paid exactly that
// amount; any other wallet paid a regionally-priced / converted amount we can't derive,
// so the page shows a disclaimer for non-base wallets. Treat an unknown (null) code as
// base — we can't claim a different amount was charged without evidence.
// The number in a LocalizedPrice ("$14.95", "MX$180.00", "PLN 20.95"). Only the number:
// a bare "$" is AUD on one export and USD on another, so the currency has to come from
// CurrencyCode. Every sample uses "." decimals, but a lone "," is read as a decimal
// unless three digits follow it, in case a store ever localises the separator.
export const localAmount = (s) => {
  let n = typeof s === 'string' ? s.replace(/[^\d.,]/g, '') : '';
  if (!n) return null;
  const dot = n.lastIndexOf('.');
  const comma = n.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) n = dot > comma ? n.replace(/,/g, '') : n.replace(/\./g, '').replace(',', '.');
  else if (comma >= 0) n = /,\d{3}$/.test(n) ? n.replace(/,/g, '') : n.replace(',', '.');
  else if (n.indexOf('.') !== dot) n = n.replace(/\./g, '');
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
};

export const BASE_CURRENCIES = new Set(['EUR', 'USD']);
export const isBaseCurrency = (code) => !code || BASE_CURRENCIES.has(code);

// Steam app ids
export const STEAM_BASE_GAME_ID = 2073850;
export const DLC_NAMES = {
  4835420: 'FUNKOMATIC 2000 Set',
  4835410: 'Season 11 Starter Pack',
  4835400: 'Season 11 Ultimate Battle Pass Bundle',
  4652630: 'Data Crusader Set',
  4599390: 'Crown That Remains Set',
  4406660: 'Morrígan\'s Call Set',
  4403960: 'Season 10 Starter Pack',
  4403950: 'Season 10 Ultimate Battle Pass Bundle',
  4271490: 'Glitch Prowler Set',
  4197310: 'Year 1 Deluxe Edition',
  4191180: 'Year 1 Deluxe Exclusives',
  4191170: 'Legacy Battle Pass Season 4',
  4191160: 'Legacy Battle Pass Season 3',
  4191150: 'Legacy Battle Pass Season 2',
  4191140: 'Legacy Battle Pass Season 1',
  4167870: 'NTMR TGM25 CHAMPIONS SET',
  4167860: 'Project Hú Set',
  4162410: '2nd Anniversary Bundle',
  4162400: 'Season 9 Starter Pack',
  4162390: 'Season 9 Ultimate Battle Pass Bundle',
  4124770: 'New Contestant Pack',
  4124680: 'FN ESPORTS TGM25',
  4124670: 'FIVE FEARS TGM25',
  4124660: 'APE SQUAD TGM25',
  4124650: 'DRG TGM25',
  4093840: 'VANGUARD TGM25',
  4093830: 'TSM TGM25',
  4093820: 'KINGZERO TGM25',
  4093810: 'GEN.G TGM25',
  4093800: 'FNATIC TGM25',
  4093790: 'TEAM SECRET TGM25',
  4077560: 'The Chirurgeon Set',
  4062430: 'The Apothecarion Set',
  4013250: 'SSG TGM25',
  4013240: 'PULSAR TGM25',
  4013230: 'NTMR TGM25',
  4013220: 'KCP TGM25',
  4013210: 'ENVY TGM25',
  4013200: 'ALLIANCE TGM25',
  3964990: 'Depth Charger Set',
  3964980: 'Season 8: Starter Pack',
  3964970: 'Season 8: Ultimate Battle Pass Bundle',
  3841760: 'Lotus Reaper Set',
  3741380: 'Ops Override Set',
  3741370: 'Season 7: Starter Pack',
  3735580: 'Season 7: Ultimate Battle Pass Bundle',
  3668920: 'Eyecaster Pack',
  3620110: 'Zero-G Menace Set',
  3519920: 'Season 6 Starter Pack',
  3519910: 'Wavereaver Set',
  3411130: 'IVADA Cataclysm Set',
  3348090: '1st Anniversary Bundle',
  3348080: 'Permafang Prowler Set',
  3348070: 'Season 5 Starter Pack',
  3288070: 'Seas The Day Set',
  3225070: 'Hedge Hunter Set',
  3211950: 'Örf Tactical Pack',
  3202140: 'Season 4 Starter Pack',
  3080260: 'Metro Drifter Set',
  3025990: 'Season 3 Starter Pack',
  2897810: 'Bank Rabbit Set',
  // Not a THE FINALS DLC: owning Embark's other game logs a row here too.
  1808500: 'ARC Raiders',
};
export const steamAppUrl = (id) => `https://store.steampowered.com/app/${id}/`;
export const resolveDlc = (id) => {
  // `in` walks the prototype chain, so it would report DLC #constructor as known.
  const known = Object.hasOwn(DLC_NAMES, id);
  return { name: known ? DLC_NAMES[id] : `Steam DLC #${id}`, known, url: steamAppUrl(id) };
};

// Microsoft Store product ids: `MicrosoftOrderAttributes.MicrosoftProductID` and the id that
// ends `MicrosoftBundleRecord.BundleTransactionID`. Titles from Microsoft's public catalogue.
export const MS_PRODUCT_NAMES = {
  '9PGD71CMDS0Z': 'THE FINALS',
  '9P8MCNKJ09GL': 'Year 1 Deluxe Edition',
  '9N538V3HQT4H': 'Bank Rabbit Set',
  '9N28WJC4359B': 'Crown That Remains Set',
  '9P8NRJ7KZ7MP': 'Data Crusader Set',
  '9PMPKR974GW7': 'Depth Charger Set',
  '9PH3L3X7D7T2': 'Eyecaster Pack',
  '9NF33TQBL11G': 'FUNKOMATIC 2000 Set',
  '9NF2PLLDXJNM': 'Glitch Prowler Set',
  '9PGBHBPPJF2B': 'Hedge Hunter Set',
  '9NS2HWTF36KD': 'IVADA Cataclysm Set',
  '9P0FK9C9DBJ0': 'Legacy Battle Pass Season 2',
  '9MTV5QLG371L': 'Legacy Battle Pass Season 3',
  '9NKPLJKZXNGM': 'Legacy Battle Pass Season 4',
  '9NJN8Q8VM643': 'Lotus Reaper Set',
  '9NKP9XF3CZ84': 'Metro Drifter Set',
  '9PJBDN787NJ7': 'Morrígans Call Set',
  '9NZGJGVCDVML': 'New Contestant Pack',
  '9P7RW0Q86DXZ': 'NTMR TGM25 CHAMPIONS SET',
  '9MZHXFZD6PJF': 'Ops Override Set',
  '9MV38KQ8S6QR': 'Permafang Prowler Set',
  '9PC4L8SK7DX0': 'Project Hú Set',
  '9NBN44WJF4RH': 'Seas The Day Set',
  '9P6TQ1Q65G9V': 'Season 10 Starter Pack',
  '9PCZCJ74Z80Z': 'Season 10 Ultimate Battle Pass Bundle',
  '9PMH0KSWRRMN': 'Season 11 Starter Pack',
  '9NHTFK76N769': 'Season 11 Ultimate Battle Pass Bundle',
  '9P022SNQFLJJ': 'Season 8 Starter Pack',
  '9NZC1SZSRL6F': 'Season 9 Ultimate Battle Pass Bundle',
  '9PFNTN69GZQN': 'Silent Cypher Set',
  '9PLVZBZLF8LP': 'Sugar Crasher Set',
  '9NFL43WSHP5R': 'Sugar Shocker Set',
  '9MZ11CFR42D1': 'The Apothecarion Set',
  '9MZ5J0VT09MH': 'The Chirurgeon Set',
  '9N08ZZZRT4NH': 'Wavereaver Set',
  '9NLG2JRJXSFV': 'Year 1 Deluxe Edition',
  '9P9CWG84M9TS': 'Year 1 Deluxe Exclusives',
  '9N8V4KQN7V30': 'Zero-G Menace Set',
  '9NFHDG3JN65T': 'Örf Tactical Pack',
  '9NMTP7DRL90M': '1,150 Multibucks',
  '9P3FGLQ1878B': '13,000 Multibucks',
  '9NHNVJ5ZBMSN': '2,400 Multibucks',
  '9NMZ0X2D8D5D': '500 Multibucks',
  '9PDVC55H15JR': '6,250 Multibucks',
  CFQ7TTC0KGQ8: 'PC Game Pass',
  CFQ7TTC0K5DJ: 'Xbox Game Pass Essential',
  CFQ7TTC0P85B: 'Xbox Game Pass Premium',
  CFQ7TTC0KHS0: 'Xbox Game Pass Ultimate',
  // Not a THE FINALS product: buying Embark's other game on Xbox granted items here too.
  '9NDF1F263RZ4': 'ARC Raiders',
};
export const msStoreUrl = (id) => `https://www.xbox.com/games/store/_/${id}`;
export const resolveMsProduct = (id) => {
  const known = Object.hasOwn(MS_PRODUCT_NAMES, id);
  return { id, name: known ? MS_PRODUCT_NAMES[id] : `Store product ${id}`, known, url: msStoreUrl(id) };
};
