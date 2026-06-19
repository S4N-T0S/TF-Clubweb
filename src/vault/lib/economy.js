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
export const sourceLabel = (s) => SOURCE_LABELS[s] || s || 'Unknown';

export const SOURCE_TONES = {
  realmoneytransaction: 'yellow',
  battlepass: 'purple',
  'battlepass-historical': 'purple',
  collectionevent: 'blue',
  embarkstore: 'emerald',
  twitchdrop: 'purple',
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
export const storeLabel = (s) => (s ? STORE_LABELS[s] || s : '—');

// TransactionLog.TransactionType -> friendly label. `purchasewithoutconsume` is still a purchase (the consumable just wasn't burned yet); show it as one
export const TYPE_LABELS = {
  purchase: 'Purchase',
  purchasewithoutconsume: 'Purchase',
  gift: 'Gift',
  reward: 'Reward',
  rewarddurables: 'Reward',
  revokedurables: 'Revoked',
};
export const typeLabel = (t) => TYPE_LABELS[t] || t || '—';

// HardCurrencyLog.LogType -> label + badge tone + sign (+1 inflow / -1 outflow)
export const LOGTYPE_META = {
  earned: { label: 'Earned', tone: 'emerald', sign: 1 },
  bought: { label: 'Bought', tone: 'yellow', sign: 1 },
  gifted: { label: 'Gifted', tone: 'blue', sign: 1 },
  spent: { label: 'Spent', tone: 'red', sign: -1 },
  unknown: { label: 'Other', tone: 'gray', sign: 1 },
};
export const logTypeMeta = (t) => LOGTYPE_META[t] || { label: t || 'Unknown', tone: 'gray', sign: 0 };

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
export const BASE_CURRENCIES = new Set(['EUR', 'USD']);
export const isBaseCurrency = (code) => !code || BASE_CURRENCIES.has(code);

// Steam app ids
export const STEAM_BASE_GAME_ID = 2073850;
export const DLC_NAMES = {
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
};
export const steamAppUrl = (id) => `https://store.steampowered.com/app/${id}/`;
export const resolveDlc = (id) => ({
  name: DLC_NAMES[id] || `Steam DLC #${id}`,
  known: id in DLC_NAMES,
  url: steamAppUrl(id),
});
