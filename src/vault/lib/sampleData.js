// Synthetic "sample player" for the landing-page preview.
//
// This builds a fully fictional RAW export (the same shape parse.js produces)
// and hands it to the real buildModel(), so every page renders from the exact
// same pipeline as a real upload — no separate mock view-models to drift out of
// sync, and nothing can crash on a field the generator forgot, because the
// generator only has to produce the raw records the parser would.
//
// It is deterministic (seeded RNG, fixed timeline anchors, no Date.now()) so the
// preview looks identical on every visit. The identity is obviously-fake and the
// numbers are a believable composite of a long-time THE FINALS player — there is
// no real personal data here.

// --- deterministic RNG ----------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x0067_4c5b);
const rf = () => rng();
const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const chance = (p) => rng() < p;

// --- timeline (fixed, in the past, so the sample never drifts) ------------
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();
const lerp = (a, b, t) => a + (b - a) * t;

const ACCOUNT_CREATED = Date.parse('2023-09-25T14:30:00Z'); // closed-beta era veteran
const SPAN_START = Date.parse('2024-01-20T18:00:00Z');
const SPAN_END = Date.parse('2026-06-14T22:00:00Z');
const ANYBRAIN_GOLIVE = Date.parse('2025-07-24T00:00:00Z');

// Two London-block IPs (the classic GeoIP example range)
const IPS = ['81.2.69.142', '81.2.69.160'];

// --- content ids (all present in weapons.js / gameMeta.js / maps.js) ------
const ARCH_KEY = { Light: 'DA_Archetype_Small', Medium: 'DA_Archetype_Medium', Heavy: 'DA_Archetype_Heavy' };
const PRIMARY = {
  Light: ['199277493', '1599997630', '-322594587', '-158222801', '1612446258', '-657541680'], // ARN-220, M11, XP-54, V9S, SH1900, SR-84
  Medium: ['473278792', '-566338044', '-2101446056', '-240495033', '107797000', '1501440399'], // AKM, FCAR, PIKE-556, FAMAS, Cerberus, CL-40
  Heavy: ['-212966229', '-676727577', '-160507163', '1743942098', '1096645849', '1480845770'], // M60, SHAK-50, SA1216, Lewis Gun, KS-23, Flamethrower
};
const GADGET = {
  Light: ['432758549', '1948814529'], // Breach Charge, Gateway
  Medium: ['-21077747', '1886362451'], // Gas Mine, APS Turret
  Heavy: ['1042541498', '-455578974', '1647891907'], // RPG-7, C4, Pyro Mine
};
const GLOBAL_GADGET = ['1082327915', '-351094439', '81925953']; // Frag, Explosive Mine, Pyro Grenade

const TOURNEY_MAPS = [
  'DA_MV_Arena_01_Base', 'DA_MV_Arena_02_Base', 'DA_MV_Arena_04_Base', 'DA_MV_Seoul_01_Base',
  'DA_MV_Seoul_02_Base', 'DA_MV_Kyoto_01_Base', 'DA_MV_LasVegas_02_Base', 'DA_MV_LasVegas_02_Sundown',
  'DA_MV_BayCity_01_Base',
];
const CASUAL_MAPS = ['DA_MV_Monaco_01_Base', 'DA_MV_Seoul_01_Base', 'DA_MV_Kyoto_01_Base', 'DA_MV_LasVegas_02_Base', 'DA_MV_Arena_01_Base'];
const CONDS = ['Day', 'Night', 'Sunset', 'Sandstorm', 'HeavyRain', 'Fog'];
const SQUADS = ['THE OG CLUB', 'Iron Vultures', 'Night Shift', 'Vault Runners', 'Last Call', 'Static Hazard', 'Concrete Jungle'];

const archetypeRoll = () => (chance(0.3) ? 'Light' : chance(0.685) ? 'Medium' : 'Heavy');

// kills -> KillsPerItem (primary gun gets most; a gadget/grenade chips in ~45%)
function killsPerItem(arch, kills) {
  const kpi = {};
  if (kills <= 0) return kpi;
  let gadget = chance(0.45) ? Math.min(kills, ri(1, 2)) : 0;
  const prim = kills - gadget;
  if (prim > 0) kpi[pick(PRIMARY[arch])] = prim;
  if (gadget > 0) kpi[pick([...GADGET[arch], ...GLOBAL_GADGET])] = gadget;
  return kpi;
}

// One round record (the { CreatedAt, Data } the parser yields per RoundStat).
function roundRecord({ arch, map, scenarioId, t, dur, combat, tournamentId = null, tier = null, matchId = null, position = null, roundWon = false, tournamentWon = false, backfill = false, disconnected = false }) {
  const cond = pick(CONDS);
  return {
    CreatedAt: iso(t),
    Data: {
      CharacterArchetype: ARCH_KEY[arch],
      MapVariant: map,
      EnvironmentalCondition: cond,
      KillsPerItem: killsPerItem(arch, combat.kills),
      StartTime: iso(t),
      EndTime: iso(t + dur),
      Kills: combat.kills,
      Deaths: combat.deaths,
      Dbnos: combat.dbnos,
      RevivesDone: combat.revives,
      DamageDone: combat.damage,
      Currency: combat.currency,
      FameAmount: combat.fame,
      ScenarioID: scenarioId,
      Tier: tier,
      TournamentID: tournamentId,
      MatchID: matchId,
      TournamentWon: tournamentWon,
      RoundWon: roundWon,
      LeaderboardPosition: position == null ? undefined : position,
      IsBackfill: backfill,
      Disconnected: disconnected,
      SquadName: pick(SQUADS),
      SquadID: `sq_${ri(100000, 999999)}`,
    },
  };
}

function combat(kLo, kHi, dLo, dHi, cashLo, cashHi) {
  const kills = ri(kLo, kHi);
  const deaths = ri(dLo, dHi);
  return {
    kills,
    deaths,
    dbnos: Math.round(kills * (0.5 + rf() * 0.5)),
    revives: chance(0.08) ? ri(6, 12) : ri(0, 4),
    damage: kills * ri(280, 460) + ri(0, 900),
    currency: cashLo === 0 && cashHi === 0 ? 0 : ri(cashLo, cashHi),
    fame: ri(200, 2600),
  };
}

// An 8-team bracket: Round 1 (rr2) -> Round 2 (rr1) -> Final (rr0). MatchID's
// first number == Tier == rounds-remaining (the bracket counts DOWN). `skill`
// (0 early career -> 1 now) ramps how far the player gets, so the newest
// matches — the first page the user sees — are full of deep runs and wins, not
// the rookie losses from the start of the account.
function tournament(rounds, scenarioId, startT, skill = 0.5) {
  const arch = archetypeRoll();
  const map = pick(TOURNEY_MAPS);
  const tid = `T${ri(1_000_000, 9_999_999)}`;
  const r1Exit = 0.45 - skill * 0.25; // ~45% R1 exits early, ~20% now
  const reach = chance(r1Exit) ? 'R1' : chance(0.45) ? 'R2' : 'FINAL';
  const won = reach === 'FINAL' && chance(0.4 + skill * 0.2); // wins the final ~40% -> ~60%
  let t = startT;
  const advR1 = reach !== 'R1';
  const posR1 = advR1 ? ri(1, 2) : ri(3, 4);
  rounds.push(roundRecord({ arch, map, scenarioId, t, dur: ri(7, 11) * 60_000, combat: combat(2, 16, 2, 10, 12000, 52000), tournamentId: tid, tier: 2, matchId: `2-${ri(0, 1)}`, position: posR1, roundWon: posR1 === 1, backfill: chance(0.05) }));
  t += ri(13, 22) * 60_000;
  if (advR1) {
    const advR2 = reach === 'FINAL';
    const posR2 = advR2 ? ri(1, 2) : ri(3, 4);
    rounds.push(roundRecord({ arch, map, scenarioId, t, dur: ri(7, 11) * 60_000, combat: combat(3, 17, 2, 9, 20000, 60000), tournamentId: tid, tier: 1, matchId: '1-0', position: posR2, roundWon: posR2 === 1 }));
    t += ri(13, 22) * 60_000;
    if (advR2) {
      const posF = won ? 1 : 2;
      rounds.push(roundRecord({ arch, map, scenarioId, t, dur: ri(8, 12) * 60_000, combat: combat(4, 19, 2, 9, 35000, 90000), tournamentId: tid, tier: 0, matchId: '0-0', position: posF, roundWon: won, tournamentWon: won }));
      t += ri(8, 12) * 60_000;
    }
  }
  return t;
}

function casualMatch(rounds, mode, startT) {
  const arch = archetypeRoll();
  const map = mode.maps ? pick(mode.maps) : mode.map ? mode.map : pick(CASUAL_MAPS);
  const c = mode.combatArgs ? combat(...mode.combatArgs) : mode.tdm ? combat(5, 25, 5, 20, 0, 0) : combat(1, 14, 2, 11, 0, 40000);
  rounds.push(roundRecord({ arch, map, scenarioId: mode.id, t: startT, dur: ri(6, 12) * 60_000, combat: c, roundWon: chance(mode.winChance ?? 0.42), disconnected: chance(0.03) }));
  return startT + ri(8, 16) * 60_000;
}

const RANKED_ID = 498553443;
const WORLD_TOUR_IDS = [296178816, 465304560, 308426432];
const CASUAL_MODES = [
  { id: 164312917, winChance: 0.4 }, // Quick Cash
  { id: 545190106, winChance: 0.5 }, // Power Shift
  { id: 418401773, tdm: true, map: 'DA_MV_Forest_01_Base', winChance: 0.55 }, // Team Deathmatch (P.E.A.C.E. Center)
  { id: 184486584, maps: ['DA_MV_Arena_02_Base', 'DA_MV_Arena_04_Base', 'DA_MV_Bernal_01_Base', 'DA_MV_Monaco_01_Base'], combatArgs: [4, 20, 4, 14, 20000, 50000], winChance: 0.5 },
];
const LTM_MODES = [
  { id: 597953832, map: 'DA_MV_Monaco_01_Base', winChance: 0.5 }, // Bunny Bash
  { id: 152796620, map: 'DA_MV_Playground_01_Base', winChance: 0.5 }, // Heavy Hitters (Playground arena)
  { id: 152796620, map: 'DA_MV_HeavyHitters_02_Base', winChance: 0.5 }, // Heaven or Else (same id, HeavyHitters arena)
  { id: 905608807, map: 'DA_MV_CashBall_01_Base', winChance: 0.5 }, // Super Cashball
  { id: 106717113, map: 'DA_MV_Monaco_01_Base', winChance: 0.5 }, // Snowball Blitz
  { id: 211556165, map: 'DA_MV_Village_01_Base', combatArgs: [5, 22, 3, 12, 25000, 55000], winChance: 0.55 }, // Point Break — Arena Debut LTM (Starlight Hollow)
];

// --- match history --------------------------------------------------------
function buildRounds() {
  const rounds = [];
  const DAYS = 240;
  for (let d = 0; d < DAYS; d++) {
    const dayMs = lerp(SPAN_START, SPAN_END, (d + rf() * 0.7) / DAYS);
    const skill = (d + 0.5) / DAYS; // improves over the account's lifetime
    let t = dayMs + ri(0, 3) * HOUR;
    const matches = ri(1, 4);
    for (let m = 0; m < matches; m++) {
      const roll = rf();
      if (roll < 0.4) t = tournament(rounds, RANKED_ID, t, skill);
      else if (roll < 0.6) t = tournament(rounds, pick(WORLD_TOUR_IDS), t, skill);
      else if (roll < 0.86) t = casualMatch(rounds, pick(CASUAL_MODES), t);
      else t = casualMatch(rounds, pick(LTM_MODES), t);
      t += ri(4, 30) * 60_000;
    }
  }
  return rounds;
}

// --- lifetime summary (RoundStatSummary buckets, the career headline) -----
// Derived from the generated match history so every career total reconciles with
// the rounds the dashboard actually shows. (Real exports store these buckets
// separately, but a real RoundStatSummary ≈ the player's RoundStat history.)
// ranked = the ranked playlist, casual = the core casual modes, total =
// everything (World Tour + LTM live only in the total, never in ranked/casual).
const CASUAL_IDS = new Set(CASUAL_MODES.map((m) => m.id));

function aggregateRoundStats(records) {
  const tids = new Set();
  const tWon = new Set();
  const byArch = {};
  const a = {
    Kills: 0, Deaths: 0, DamageDone: 0, Dbnos: 0, Respawns: 0, RevivesDone: 0,
    RoundsPlayed: 0, RoundsWon: 0, TotalCashOut: 0, TotalTimePlayed: 0, Disconnects: 0, HighestFameAmount: 0,
  };
  for (const { Data: d } of records) {
    a.Kills += d.Kills || 0;
    a.Deaths += d.Deaths || 0;
    a.DamageDone += d.DamageDone || 0;
    a.Dbnos += d.Dbnos || 0;
    a.RevivesDone += d.RevivesDone || 0;
    a.RoundsPlayed += 1;
    if (d.RoundWon) a.RoundsWon += 1;
    a.TotalCashOut += d.Currency || 0;
    if (d.Disconnected) a.Disconnects += 1;
    if ((d.FameAmount || 0) > a.HighestFameAmount) a.HighestFameAmount = d.FameAmount;
    const dur = Date.parse(d.EndTime) - Date.parse(d.StartTime);
    if (dur > 0) {
      a.TotalTimePlayed += dur;
      byArch[d.CharacterArchetype] = (byArch[d.CharacterArchetype] || 0) + dur;
    }
    if (d.TournamentID) {
      tids.add(d.TournamentID);
      if (d.TournamentWon) tWon.add(d.TournamentID);
    }
  }
  a.Respawns = a.Deaths; // real exports: Respawns ≈ Deaths (redundant, not surfaced)
  a.TournamentsPlayed = tids.size;
  a.TournamentsWon = tWon.size;
  if (Object.keys(byArch).length) a.TimePlayedByArchetype = byArch;
  return a;
}

function buildSummary(rounds) {
  const ranked = rounds.filter((r) => r.Data.ScenarioID === RANKED_ID);
  const casual = rounds.filter((r) => CASUAL_IDS.has(r.Data.ScenarioID));
  return [
    {
      UpdatedAt: iso(SPAN_END),
      Data: {
        total: aggregateRoundStats(rounds),
        casual: aggregateRoundStats(casual),
        ranked: aggregateRoundStats(ranked),
      },
    },
  ];
}

// --- purchases & economy --------------------------------------------------
const PURCHASES = [
  { iso: '2024-02-10T20:14:00Z', price: 9.99, mb: 1150, localized: '£8.39' },
  { iso: '2024-06-20T18:42:00Z', price: 19.99, mb: 2800, dlc: 3025990 },
  { iso: '2024-12-15T13:05:00Z', price: 4.99, mb: 500 },
  { iso: '2025-03-22T21:30:00Z', price: 9.99, mb: 1150, dlc: 4124770, localized: '£8.39' },
  { iso: '2025-09-12T19:18:00Z', price: 29.99, mb: 5000, dlc: 3519910, localized: '£25.99' },
  { iso: '2026-04-02T17:55:00Z', price: 8.99, mb: 1000, dlc: 4167870 },
];

function buildTransactions() {
  const tx = [];
  // Real-money purchases (the only rows with a price).
  for (const p of PURCHASES) {
    tx.push({ TransactionType: 'purchase', State: 'granted', Source: 'realmoneytransaction', GameStore: 'steam', GameStorePurchasedAt: p.iso, CreatedAt: p.iso, PricePoint: p.price, CurrencyCode: 'GBP', Country: 'GB', LocalizedPrice: p.localized ?? null });
  }
  // One failed attempt (shown, excluded from the total).
  tx.push({ TransactionType: 'purchase', State: 'failed', Source: 'realmoneytransaction', GameStore: 'steam', GameStorePurchasedAt: '2025-01-08T22:01:00Z', CreatedAt: '2025-01-08T22:01:00Z', PricePoint: 19.99, CurrencyCode: null, Country: 'GB', LocalizedPrice: null });
  // Non-fiat grants — fill out the "where your items came from" bars + the log.
  const SOURCES = [
    ['battlepass', 'embark', 40], ['battlepass-historical', 'embark', 8], ['collectionevent', 'embark', 18],
    ['embarkstore', 'embark', 22], ['twitchdrop', 'twitch', 14], ['giveaway', 'giveaway', 6], ['thirdpartysubscription', 'twitch', 4],
  ];
  for (const [source, store, n] of SOURCES) {
    for (let i = 0; i < n; i++) {
      const t = lerp(SPAN_START, SPAN_END, (i + 0.5) / n) + ri(-5, 5) * DAY;
      tx.push({ TransactionType: source === 'embarkstore' ? 'purchase' : 'reward', State: 'granted', Source: source, GameStore: store, GameStorePurchasedAt: iso(t), CreatedAt: iso(t), PricePoint: null, CurrencyCode: null, Country: null, LocalizedPrice: null });
    }
  }
  return tx;
}

// Coherent Multibucks ledger: events get unique, increasing timestamps and a
// chained running balance, so the model's balance-reconstruction reconciles
// exactly (total in − spent + start = current). 'bought' rows reuse each
// purchase's exact timestamp so the page can show what the charge granted.
// Spending is sized to leave a believable positive balance at the end, rather
// than draining to zero.
const TARGET_BALANCE = 1750;
function buildLedger() {
  const inflow = [];
  for (const p of PURCHASES) inflow.push({ ms: Date.parse(p.iso), logType: 'bought', qty: p.mb });
  for (let i = 0; i < 60; i++) inflow.push({ ms: lerp(SPAN_START, SPAN_END, (i + 0.5) / 60) + ri(0, 6) * HOUR, logType: 'earned', qty: ri(150, 400) }); // battle pass + rank rewards
  for (let i = 0; i < 5; i++) inflow.push({ ms: lerp(SPAN_START, SPAN_END, (i + 0.5) / 5) + ri(0, 20) * DAY, logType: 'gifted', qty: pick([500, 1000, 1700]) });
  for (let i = 0; i < 12; i++) inflow.push({ ms: lerp(SPAN_START, SPAN_END, (i + 0.5) / 12) + ri(0, 10) * DAY, logType: 'unknown', qty: 75 }); // small reward drops

  const totalIn = inflow.reduce((s, e) => s + e.qty, 0);
  // Spend most of it back on skins, leaving ~TARGET_BALANCE. Spends sit in the
  // latter 75% of the timeline so the running balance rarely needs clamping.
  let toSpend = Math.max(0, totalIn - TARGET_BALANCE);
  const spends = [];
  const N = 34;
  const spendStart = SPAN_START + (SPAN_END - SPAN_START) * 0.25;
  for (let i = 0; i < N && toSpend > 0; i++) {
    const amt = Math.min(toSpend, pick([500, 700, 1100, 1400, 1900, 2400]));
    toSpend -= amt;
    spends.push({ ms: lerp(spendStart, SPAN_END, (i + rf() * 0.5) / N), logType: 'spent', qty: amt });
  }
  if (toSpend > 0) spends.push({ ms: SPAN_END - 5 * DAY, logType: 'spent', qty: toSpend });

  const ev = [...inflow, ...spends].sort((a, b) => a.ms - b.ms);
  let last = -1;
  for (const e of ev) {
    if (e.ms <= last) e.ms = last + 1000; // keep timestamps unique for clean chaining
    last = e.ms;
  }
  let bal = 0;
  const rows = [];
  for (const e of ev) {
    let qty = e.qty;
    if (e.logType === 'spent') {
      qty = Math.min(qty, bal);
      if (qty <= 0) continue;
      bal -= qty;
    } else bal += qty;
    rows.push({ LogType: e.logType, Quantity: qty, NewUserTotalBalance: bal, CreatedAt: iso(e.ms), UpdatedAt: iso(e.ms) });
  }
  return rows;
}

function buildSteamDlc() {
  const rows = [];
  for (const p of PURCHASES) {
    if (!p.dlc) continue;
    for (let c = 0; c < 3; c++) rows.push({ SteamID: '76561198000000000', DLCID: p.dlc, TenancyUserID: 'sample', UnsettledHardCurrency: 0, CreatedAt: p.iso, UpdatedAt: p.iso });
  }
  return rows;
}

function buildOffers() {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const t = lerp(SPAN_START, SPAN_END, (i + 0.5) / 6);
    out.push({ StartedTime: iso(t), DurationInSeconds: pick([86400, 172800, 259200]), IsCompleted: chance(0.3) });
  }
  return out;
}

// Owned items (persistence `InventoryItem`). No item ids exist in the export, so
// only per-Type counts are meaningful — a believable cosmetic-heavy spread.
const INVENTORY_SPREAD = [
  ['CustomizationItem', 180], ['WeaponSkin', 142], ['WeaponCharm', 46], ['WeaponSticker', 38],
  ['PlayerCardCustomization', 33], ['AnimationCustomization', 21], ['Spray', 16], ['Emoticon', 12],
  ['GameItem', 9], ['BattlePass', 6], ['ClansCustomization', 4], ['Currency', 3],
];
function buildInventoryItems() {
  const rows = [];
  for (const [type, n] of INVENTORY_SPREAD) {
    for (let i = 0; i < n; i++) rows.push({ Type: type, Amount: 1, HasSeen: true, UpdatedAt: iso(lerp(SPAN_START, SPAN_END, (i + 0.5) / n)) });
  }
  return rows;
}

// Hidden matchmaking / skill ratings (persistence `BucketObject`). A believable
// long-time-Diamond veteran: OpenSkill-era ranked in S2-S3, the IVK ladder S4+
// with one Ruby-peak season, plus the casual/World-Tour hidden MMR and the raw
// OpenSkill model. Includes a couple of zero-match "migration seed" rows so the
// preview also exercises the de-duplication. Uses the real season ids/dates so
// the season mapping resolves exactly as a real export would.
function buildRatingBuckets() {
  const rb = (ObjectKey, value, CreatedAt, UpdatedAt) => ({ ObjectKey, Value: JSON.stringify(value), CreatedAt, UpdatedAt });
  const ranked = (ratingId, seasonId, mu, sigma, matches, lri, peak, rp) => ({
    ratingId, mu, sigma, seasonId: String(seasonId), completedMatches: matches,
    leagueRankIndex: lri, rankPoints: rp, highestLeagueRankIndex: peak, countSincePromotion: 0, lastTournamentPlayed: '',
  });
  const flat = (ratingId, mu, sigma, matches) => ({
    ratingId, mu, sigma, seasonId: '', completedMatches: matches,
    leagueRankIndex: 0, rankPoints: 0, highestLeagueRankIndex: 0, countSincePromotion: 0, lastTournamentPlayed: '',
  });

  const out = [];
  // Per-season ranked: [objectKey base = ratingId, seasonId, created, updated, mu, sigma, matches, finalIndex, peakIndex, RankPoints]
  const R = [
    ['OpenSkillRankedRating', 762104396, '2024-03-14T11:00:00Z', '2024-06-10T22:00:00Z', 32.4, 1.4, 120, 16, 16, 72000],
    ['OpenSkillRankedRating', 751146294, '2024-06-13T11:00:00Z', '2024-09-20T22:00:00Z', 33.6, 1.1, 185, 18, 19, 83500],
    ['IVKRankedTournamentRating', 814189767, '2024-09-26T11:00:00Z', '2024-12-10T22:00:00Z', 4050, 0, 150, 17, 17, 40500],
    ['IVKRankedTournamentRating2', 483101830, '2024-12-12T11:00:00Z', '2025-03-15T22:00:00Z', 4320, 0, 210, 18, 19, 43200],
    ['IVKRankedTournamentRating2', 279111264, '2025-03-20T11:00:00Z', '2025-06-08T22:00:00Z', 4600, 0, 240, 19, 20, 46000],
    ['IVKRankedTournamentRating2', 607580158, '2025-06-12T11:00:00Z', '2025-09-05T22:00:00Z', 5200, 0, 300, 20, 21, 52000],
    ['IVKRankedTournamentRating2', 607608768, '2025-09-10T11:00:00Z', '2025-12-05T22:00:00Z', 4500, 0, 190, 19, 20, 45000],
    ['IVKRankedTournamentRating3', 825209376, '2025-12-10T11:00:00Z', '2026-02-20T22:00:00Z', 5000, 0, 260, 20, 20, 50000],
    ['IVKRankedTournamentRating4', 965777394, '2026-03-26T11:00:00Z', '2026-06-12T22:00:00Z', 3800, 0, 35, 16, 16, 38000],
  ];
  for (const [rid, sid, c, u, mu, sigma, m, lri, peak, rp] of R)
    out.push(rb(`${rid}_${sid}`, ranked(rid, sid, mu, sigma, m, lri, peak, rp), c, u));

  // A backfilled migration seed (0 matches) for S9 + the S2/S3-era IVK shadow rating —
  // both should be de-duplicated away in favour of the real progression.
  out.push(rb('IVKRankedTournamentRating3_825209376', ranked('IVKRankedTournamentRating3', 825209376, 1250, 0, 0, 0, 0, 0), '2025-12-08T17:03:44Z', '2025-12-08T17:03:44Z'));
  out.push(rb('IVKRankedRating_751146294', ranked('IVKRankedRating', 751146294, 1700, 0, 0, 0, 0, 0), '2024-06-20T11:00:00Z', '2024-06-20T11:00:00Z'));

  // Hidden MMR for the non-ranked playlists (no league rank, just a skill number).
  out.push(rb('IVKCasualRating', flat('IVKCasualRating', 905, 0, 3240), '2024-01-20T18:00:00Z', '2026-06-12T22:00:00Z'));
  out.push(rb('IVKWorldTourRating', flat('IVKWorldTourRating', 842, 0, 2410), '2024-08-24T10:00:00Z', '2026-06-10T22:00:00Z'));
  out.push(rb('IVKCasualAttackDefendRating', flat('IVKCasualAttackDefendRating', 511, 0, 22), '2024-06-01T13:00:00Z', '2024-10-24T21:00:00Z'));
  out.push(rb('IVKCasualRating', flat('IVKCasualRating', 160, 0, 0), '2025-12-08T17:03:44Z', '2025-12-08T17:03:44Z'));

  // The raw OpenSkill model the IVK numbers are built from (mu = skill, sigma = uncertainty).
  out.push(rb('OpenSkillRating', flat('OpenSkillRating', 28.1, 0.72, 88), '2023-10-01T12:00:00Z', '2024-05-25T16:00:00Z'));
  out.push(rb('OpenSkillCasualRating', flat('OpenSkillCasualRating', 29.6, 0.55, 1410), '2023-12-09T12:00:00Z', '2025-02-08T06:00:00Z'));
  out.push(rb('OpenSkillV2CasualRatings3', flat('OpenSkillV2CasualRating', 96.4, 2.6, 2520), '2024-06-14T15:00:00Z', '2025-02-10T06:00:00Z'));
  out.push(rb('OpenSkillTournamentRating', flat('OpenSkillTournamentRating', 24.2, 1.15, 0), '2023-12-09T12:00:00Z', '2024-03-05T20:00:00Z'));
  out.push(rb('OpenSkillCasualAttackDefendRating', flat('OpenSkillCasualAttackDefendRating', 30.1, 7.6, 12), '2024-06-01T13:00:00Z', '2024-10-24T21:00:00Z'));

  return out;
}

// --- identity / linked accounts / restriction ----------------------------
function buildPersistence() {
  // Generate the match history ONCE and derive the lifetime summary from it, so
  // the RoundStatSummary buckets (career headline + the ranked/casual/other note)
  // stay consistent with the actual rounds the dashboard shows.
  const rounds = buildRounds();
  const byType = {
    // A single Embark account
    EmbarkUser: [
      { EmbarkUserID: '00000000-5a3f-4e21-9c7a-5a3p1ed0000', CreatedAt: iso(ACCOUNT_CREATED) },
    ],
    Profile: [
      {
        DisplayName: 'SAMPLE_PLAYER', DisplayNameDiscriminator: '0000', Email: 'sample.player@example.com',
        EmailVerifiedAt: iso(ACCOUNT_CREATED + DAY), DateOfBirth: '1996-04-12', CountryCode: 'GB',
        TOSVersionSeen: 7, IsPlaytester: true, CreatedAt: iso(ACCOUNT_CREATED), UpdatedAt: iso(SPAN_END),
        // NB: the "have they ever spent real money" marker (is_spender) is NOT here —
        // like a real export, it rides along only in the audit ProfileUpdated snapshots
        // (see buildAudit), surfaced as the dollar badge by the username.
      },
    ],
    // Two non-active restrictions — both showcase the history UI without the
    // scary permanent-ban banner (so the account still reads "in good standing").
    //   1. A permanent "Cheating" flag Embark later REVERSED as a false positive
    //      (CancelReason/CancelledAt) → demonstrates the lifted state + reason.
    //   2. A temporary matchmaking penalty that has since expired.
    Restriction: [
      { Reason: 'Cheating', StartsAt: iso(Date.parse('2024-11-02T08:15:00Z')), CreatedAt: iso(Date.parse('2024-11-02T08:15:00Z')), CancelReason: 'Incorrect restriction', CancelledAt: iso(Date.parse('2024-11-09T14:20:00Z')) },
      { Reason: 'Early match leave (matchmaking penalty)', StartsAt: iso(Date.parse('2025-04-18T19:30:00Z')), CreatedAt: iso(Date.parse('2025-04-18T19:30:00Z')), EndsAt: iso(Date.parse('2025-04-21T19:30:00Z')) },
    ],
    ThirdPartyUser: [
      { ThirdPartyProviderID: 'steam', ThirdPartyUserID: '76561198000000000', LastSeenAccountName: 'SamplePlayer', Enabled: true, CreatedAt: iso(ACCOUNT_CREATED) },
      { ThirdPartyProviderID: 'xbox', ThirdPartyUserID: 'xuid_000', LastSeenAccountName: 'Demo Gamer#1234', Enabled: true, CreatedAt: iso(ACCOUNT_CREATED + 40 * DAY) },
      { ThirdPartyProviderID: 'twitch', ThirdPartyUserID: '123456789', LastSeenAccountName: '123456789#demostreamer', Enabled: true, CreatedAt: iso(ACCOUNT_CREATED + 120 * DAY) },
      { ThirdPartyProviderID: 'discord', ThirdPartyUserID: 'disc_000', LastSeenAccountName: 'sampleplayer#0', Enabled: true, CreatedAt: iso(ACCOUNT_CREATED + 5 * DAY) },
    ],
    InventoryItem: buildInventoryItems(),
    BucketObject: buildRatingBuckets(),
    RoundStatSummary: buildSummary(rounds),
    RoundStat: rounds,
    RankBucket: [{ XP: 184500, Rank: 'Diamond' }, { XP: 92000, Rank: 'Platinum' }],
    TransactionLog: buildTransactions(),
    HardCurrencyLog: buildLedger(),
    SteamDLC: buildSteamDlc(),
    OfferTransaction: buildOffers(),
  };
  const counts = Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { byType, counts, total, badLines: 0 };
}

// --- anti-cheat / sessions ------------------------------------------------
function buildEosAnticheat() {
  const sessions = [];
  const BUILDS = ['2024-03-12T09:00:00Z', '2024-09-26T09:00:00Z', '2025-06-12T09:00:00Z', '2026-03-26T09:00:00Z'];
  for (let i = 0; i < 90; i++) {
    const start = lerp(SPAN_START, SPAN_END, (i + rf() * 0.6) / 90);
    sessions.push({
      timeStart: iso(start), timeEnd: iso(start + ri(15, 24) * 60_000),
      eacClient: { OperatingSystem: 'Windows 11', ClientIP: pick(IPS) },
      gameClient: { ClientBuildTime: pick(BUILDS) },
    });
  }
  return [{ sessions, kicks: [] }];
}
function buildAnybrain() {
  const sessions = [];
  for (let i = 0; i < 24; i++) {
    const start = lerp(ANYBRAIN_GOLIVE, SPAN_END, (i + rf() * 0.6) / 24);
    sessions.push({ sessionStart: Math.round(start), sessionEnd: Math.round(start + ri(20, 90) * 60_000), ipAddress: pick(IPS) });
  }
  return { os: [{ name: 'Windows 11' }], screens: [{ width: '2560', height: '1440' }, { width: '1920', height: '1080' }], sessions };
}
function buildDenuvo() {
  const steam = [];
  for (let i = 0; i < 26; i++) {
    const start = lerp(SPAN_START, SPAN_END, (i + rf() * 0.6) / 26);
    steam.push({ start: iso(start), end: iso(start + ri(30, 150) * 60_000) });
  }
  const xbox = [];
  for (let i = 0; i < 6; i++) {
    const start = lerp(Date.parse('2024-10-01T00:00:00Z'), SPAN_END, (i + 0.5) / 6);
    xbox.push({ start: iso(start), end: iso(start + ri(30, 120) * 60_000) });
  }
  return [
    { gameInfos: [{ name: 'Steam' }], sessionInfos: steam },
    { gameInfos: [{ name: 'Xbox' }], sessionInfos: xbox },
  ];
}
// Reports the player FILED against other players (audit `PlayerReport`). Reason +
// the free-text note are kept; the target is anonymised (blank origin_uuid) just
// like a real export. A long-time player reports cheaters regularly.
const REPORT_NOTES = [
  ['Cheating', 'Snapping straight to heads through walls'],
  ['Cheating', 'Tracked our whole squad through the smoke'],
  ['Cheating', 'Zero recoil, beaming from across the map'],
  ['Cheating', 'Spinbot in the final round'],
  ['Cheating', 'Pre-firing every corner before we pushed'],
  ['Cheating', 'Impossible flicks in every single duel'],
  ['Cheating', 'Saw us through the wall the whole match'],
  ['Cheating', ''],
  ['Cheating', ''],
  ['Verbal abuse', 'Abusive voice chat the entire match'],
  ['Verbal abuse', 'Threats in team chat after the round'],
  ['Offensive name', 'Slur in their display name'],
  ['Teaming', 'Teaming with the enemy squad in ranked'],
];
function buildPlayerReports() {
  const out = [];
  for (let i = 0; i < 28; i++) {
    const ms = lerp(SPAN_START, SPAN_END, (i + rf() * 0.6) / 28);
    const [reason, message] = pick(REPORT_NOTES);
    out.push({ logtime: iso(ms), reason, message, target_client: { origin_uuid: '' } });
  }
  return out;
}
// Account name history (audit `AccountNameAudit2`). The sample renamed once on
// Steam (RookieRunner -> SamplePlayer) and never changed on Xbox — enough to show
// both a rename timeline and a stable "since" entry. third_party_user_id matches
// the ThirdPartyUser ids below so the model resolves the platform.
function buildNameAudit() {
  const rows = [];
  const steamId = '76561198000000000';
  const xuid = 'xuid_000';
  const renameAt = ACCOUNT_CREATED + 190 * DAY;
  for (let i = 0; i < 20; i++) rows.push({ logtime: iso(lerp(ACCOUNT_CREATED, renameAt - DAY, (i + 0.5) / 20)), last_seen_account_name: 'RookieRunner', third_party_provider_id: 8, third_party_user_id: steamId });
  for (let i = 0; i < 40; i++) rows.push({ logtime: iso(lerp(renameAt, SPAN_END, (i + 0.5) / 40)), last_seen_account_name: 'SamplePlayer', third_party_provider_id: 8, third_party_user_id: steamId });
  for (let i = 0; i < 10; i++) rows.push({ logtime: iso(lerp(ACCOUNT_CREATED + 40 * DAY, SPAN_END, (i + 0.5) / 10)), last_seen_account_name: 'Demo Gamer', third_party_provider_id: 3, third_party_user_id: xuid });
  return rows;
}

// Marketing + account emails (audit `AwsSesEvent` + legacy `EmailStatus`).
// Embark's season/event blasts and transactional notices go through Amazon SES,
// whose per-message Send → Delivery → Open → Click stream is kept in the audit.
// We synthesise a believable inbox so the Email-tracking page shows a full
// funnel: most delivered, several opened (one re-opened many times), a couple
// clicked, plus a few account emails that aren't open-tracked. Subjects mirror
// real THE FINALS campaigns; the dates line up with the season calendar.
const SES_SENDER = 'THE FINALS <noreply@embark.email>';
const SES_OPEN_UAS = [
  'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)', // Gmail's tracking-pixel proxy
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
];
const SES_LINKS = [
  'https://id.embark.games/id/the-finals/giveaway',
  'https://www.reachthefinals.com/patchnotes',
  'https://store.steampowered.com/app/2073850/THE_FINALS/',
];

// One SES `mail` blob (a JSON STRING, exactly as the audit stores it).
const sesMailBlob = (mid, ms, subject, email, { topic = null, transactional = false } = {}) => {
  const source = transactional ? 'Embark <noreply@embark.email>' : SES_SENDER;
  const headers = [
    { name: 'From', value: source },
    { name: 'To', value: email },
    { name: 'Subject', value: subject },
  ];
  if (topic) headers.push({ name: 'List-Unsubscribe', value: `https://id.embark.games/api/unsubscribe?token=sample&topics=${topic}` });
  // Marketing runs through the "email-scheduler" identity; transactional mail doesn't.
  const tags = transactional
    ? { 'ses:operation': ['SendEmail'], 'ses:configuration-set': ['email-events'] }
    : { 'ses:operation': ['SendTemplatedEmail'], 'ses:caller-identity': ['email-scheduler'], 'ses:configuration-set': ['email-events'] };
  return JSON.stringify({ timestamp: iso(ms), source, messageId: mid, destination: [email], headers, commonHeaders: { from: [source], to: [email], subject }, tags });
};

function buildSesEvents(email) {
  const ses = []; // AwsSesEvent rows (the modern Send/Delivery/Open/Click stream)
  const legacy = []; // EmailStatus rows (older delivery-only system)
  let n = 0;
  const mid = () => `0100sample${String(++n).padStart(4, '0')}-${(n * 7919).toString(16)}`;
  const MK = 'PROMOTIONAL_MARKETING';
  const ARC = 'PROMOTIONAL_MARKETING_ARC';
  // [date, subject, topic, opens, clicks]
  const CAMPAIGNS = [
    ['2024-03-14T17:00:00Z', 'THE FINALS | SEASON 2', MK, 1, 0],
    ['2024-06-13T17:00:00Z', 'Claim your S3 gifts!', MK, 0, 1],
    ['2024-09-26T17:00:00Z', "SEASON 4: IT'S SHOWTIME!", MK, 2, 1],
    ['2024-12-12T17:00:00Z', 'SEASON 5: NEXT STAGE!', MK, 1, 0],
    ['2025-03-20T17:00:00Z', 'SEASON 6: RISING STARS', MK, 0, 0],
    ['2025-05-22T17:00:00Z', 'BLAST OFF! New Event Starts Now!', MK, 3, 0],
    ['2025-06-12T17:00:00Z', 'Season 7 is here with new free gifts!', MK, 2, 1],
    ['2025-07-18T17:00:00Z', 'Sign Up for a Chance to Play ARC Raiders', ARC, 1, 0],
    ['2025-08-21T17:00:00Z', 'Your judgment awaits. The Heaven or Else event is LIVE with free rewards!', MK, 2, 0],
    ['2025-09-10T17:00:00Z', 'Claim your free SEASON 8 Gift!', MK, 1, 0],
    ['2025-10-23T17:00:00Z', 'The Hunt is On: GHOUL RUSH is LIVE with FREE rewards! 👻', MK, 4, 1],
    ['2025-12-10T17:00:00Z', 'Season 9 Reveal Recap: Here’s What Awaits You on Dec. 10 🐉', MK, 2, 0],
    ['2026-01-29T17:00:00Z', 'Mid-Season: Event, Map, and More!', MK, 9, 1], // re-opened a lot → "most re-opened" callout
    ['2026-02-19T17:00:00Z', 'SCORE GOALS! Super Cashball Kicks Off!', MK, 1, 0],
    ['2026-04-09T17:00:00Z', "Outfit's Fluffed, Basket's Loaded - Let the Bunny Bash begin!", MK, 0, 0],
  ];
  for (const [d, subject, topic, opens, clicks] of CAMPAIGNS) {
    const sentMs = Date.parse(d);
    const id = mid();
    const mail = sesMailBlob(id, sentMs, subject, email, { topic });
    ses.push({ logtime: iso(sentMs), event_type: 'Send', mail, send: '{}' });
    const delMs = sentMs + ri(20, 90) * 1000;
    ses.push({ logtime: iso(delMs), event_type: 'Delivery', mail, delivery: JSON.stringify({ timestamp: iso(delMs), processingTimeMillis: ri(300, 900), recipients: [email], smtpResponse: '250 2.0.0 OK', reportingMTA: 'a8-64.smtp-out.eu-north-1.amazonses.com' }) });
    for (let k = 0; k < opens; k++) {
      const oms = sentMs + ri(1, 96) * HOUR + k * ri(1, 40) * HOUR;
      ses.push({ logtime: iso(oms), event_type: 'Open', mail, open: JSON.stringify({ timestamp: iso(oms), userAgent: pick(SES_OPEN_UAS), ipAddress: pick(IPS) }) });
    }
    for (let k = 0; k < clicks; k++) {
      const cms = sentMs + ri(2, 72) * HOUR;
      ses.push({ logtime: iso(cms), event_type: 'Click', mail, click: JSON.stringify({ timestamp: iso(cms), userAgent: SES_OPEN_UAS[1], ipAddress: pick(IPS), link: pick(SES_LINKS), linkTags: null }) });
    }
  }
  // A few transactional account emails (no open tracking) via the older system.
  const ACCOUNT = [
    [ACCOUNT_CREATED + DAY, 'Verify Email'],
    [Date.parse('2024-02-10T20:13:00Z'), 'Updated email'],
    [Date.parse('2024-02-10T20:14:30Z'), 'Verify Email'],
  ];
  for (const [ms, subject] of ACCOUNT) {
    const id = mid();
    legacy.push({ logtime: iso(ms + 30_000), delivery: JSON.stringify({ timestamp: iso(ms + 30_000), processingTimeMillis: ri(300, 800), recipients: [email], smtpResponse: '250 2.0.0 OK', reportingMTA: 'a8-64.smtp-out.eu-north-1.amazonses.com' }), mail: sesMailBlob(id, ms, subject, email, { transactional: true }), notification_type: 'Delivery' });
  }
  return { ses, legacy };
}

function buildAudit() {
  // One physical machine, fingerprinted two ways across client updates (TPM +
  // firmware) — demonstrates "Machines (est.) = 1" with a method breakdown rather
  // than miscounting the two fingerprints as two machines.
  const TPM = 'Tpm:9F3A77C1D2E4B5A6F8091A2B3C4D5E6F70819293A4B5C6D7E8F90A1B2C3D4E5F';
  const FMW = 'Fmw:11223344556677889900AABBCCDDEEFF00112233445566778899AABBCCDDEEFF';
  const login = [];
  for (let i = 0; i < 30; i++) login.push({ tamper_id: i % 4 === 0 ? FMW : TPM });
  const names = buildNameAudit();
  const reports = buildPlayerReports();
  // Versioned profile snapshots. They carry the EMBARK name history (the sample
  // renamed RookiePlayer -> SAMPLE_PLAYER, distinct from the Steam/Xbox platform
  // names) and the raw is_spender flag (= spent AND email-verified; here verified
  // throughout, flips true at the first purchase).
  const EMAIL = 'sample.player@example.com';
  const FORMER_EMAIL = 'old.sample@example.com'; // changed away from — shows in "emails on record"
  const profileUpdated = [
    // Renamed RookiePlayer -> SAMPLE_PLAYER; email verified; also changed email once
    // (FORMER_EMAIL -> EMAIL) so two addresses show in "emails on record". is_spender
    // flips true at the first purchase.
    { logtime: iso(ACCOUNT_CREATED + DAY), created_msts: ACCOUNT_CREATED, display_name: 'RookiePlayer', display_name_discriminator: '0000', is_spender: false, email_verified_msts: ACCOUNT_CREATED + DAY, email: FORMER_EMAIL },
    { logtime: iso(Date.parse('2024-02-10T20:14:01Z')), created_msts: ACCOUNT_CREATED, display_name: 'SAMPLE_PLAYER', display_name_discriminator: '0000', is_spender: true, email_verified_msts: ACCOUNT_CREATED + DAY, email: EMAIL },
    { logtime: iso(SPAN_END), created_msts: ACCOUNT_CREATED, display_name: 'SAMPLE_PLAYER', display_name_discriminator: '0000', is_spender: true, email_verified_msts: ACCOUNT_CREATED + DAY, email: EMAIL },
  ];
  const { ses, legacy } = buildSesEvents(EMAIL);
  const byType = { ClientUserLoginDetails: login, AccountNameAudit2: names, PlayerReport: reports, ProfileUpdated3: profileUpdated, AwsSesEvent: ses, EmailStatus: legacy };
  const counts = Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { byType, counts, total, badLines: 0 };
}

/**
 * Build a complete fictional raw export, shaped exactly like parseFileset()'s
 * output, ready for buildModel(). No real personal data; deterministic.
 */
export function buildSampleRaw() {
  return {
    persistence: buildPersistence(),
    audit: buildAudit(),
    eos: { anticheat: buildEosAnticheat(), linkedAccounts: [] },
    anybrain: buildAnybrain(),
    denuvo: buildDenuvo(),
    // Request "worked on" a few days after the last session — demonstrates the
    // "data as of your request" freshness banner (request date > last activity).
    readme: { requestedAtMs: Date.parse('2026-06-18T00:00:00Z'), requestId: '0000', label: '18 June 2026' },
  };
}
