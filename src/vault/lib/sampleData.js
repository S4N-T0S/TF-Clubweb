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

import { PERFORMANCE_BONUS_MAX_SCORE } from './ratings';
import { WEAPONS } from './weapons';
import { worldTourEvent, sponsorName, sponsorTrackLength, sponsorLevelFans, sponsorAddedLevels } from './gameMeta';
import { itemClass, itemSeason, itemEquipment, normName } from './itemImages';
import { SEASONS } from './seasons';
import { SAMPLE_ITEMS, SAMPLE_UNIFORMS } from './sampleItems';

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
const SEED = 0x0067_4c5b;
// Reseeded at the top of buildSampleRaw, not just at module load: the generator
// runs again whenever the preview is re-entered, and a stream that carried on
// from where the last run stopped would hand back a different player each time.
let rng = mulberry32(SEED);
const rf = () => rng();
const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const chance = (p) => rng() < p;
// A second stream for the 2026-09 export fields (see decorateRounds).
let rng2 = mulberry32(SEED ^ 0x2026_0921);
const rf2 = () => rng2();
const ri2 = (lo, hi) => lo + Math.floor(rng2() * (hi - lo + 1));
const pick2 = (arr) => arr[Math.floor(rng2() * arr.length)];
const chance2 = (p) => rng2() < p;

// Tournament ids must be unique: matches are grouped by TournamentID, so a
// collision welds two unrelated tournaments into one match spanning the gap
// between them. Seven random digits is only ~9M values, and the birthday bound
// over ~1,900 tournaments puts a collision near one run in five, so draw again
// rather than trusting the odds.
const usedTids = new Set();
const newTid = () => {
  let t;
  do {
    t = `T${ri(1_000_000, 9_999_999)}`;
  } while (usedTids.has(t));
  usedTids.add(t);
  return t;
};

// A third stream for the per-item damage, mastery, moderation, named-purchase and
// World Tour fields (added 2026-09-22), so the earlier streams' output stays put.
let rng3 = mulberry32(SEED ^ 0x2026_0922);
const rf3 = () => rng3();
const ri3 = (lo, hi) => lo + Math.floor(rng3() * (hi - lo + 1));
const pick3 = (arr) => arr[Math.floor(rng3() * arr.length)];
const chance3 = (p) => rng3() < p;
// A fourth stream for the fields added 2026-09-25 (Deathmatch scorecards).
let rng4 = mulberry32(SEED ^ 0x2026_0925);
const ri4 = (lo, hi) => lo + Math.floor(rng4() * (hi - lo + 1));
// A fifth for the per-round figures redrawn 2026-09-26 to match real exports (see settleCombat).
let rng5 = mulberry32(SEED ^ 0x2026_0926);
const rf5 = () => rng5();
const ri5 = (lo, hi) => lo + Math.floor(rng5() * (hi - lo + 1));
// Later draws get a stream of their own, made where it is used.
const localRng = (salt) => mulberry32((SEED ^ salt) >>> 0);
// Key-file rows the generated records refer to (see buildSampleRaw).
let keyRows = { items: [], mastery: [] };
// The rounds played on a preview build (see pickPreviewRounds), shared with buildAudit.
let previewRounds = [];
// The round the in-game survey followed (see buildPersistence), shared with buildAudit.
let surveyRound = null;
// Every round, for the chat rooms buildAudit names after them.
let playedRounds = [];

const resetGenerator = () => {
  rng = mulberry32(SEED);
  rng2 = mulberry32(SEED ^ 0x2026_0921);
  rng3 = mulberry32(SEED ^ 0x2026_0922);
  rng4 = mulberry32(SEED ^ 0x2026_0925);
  rng5 = mulberry32(SEED ^ 0x2026_0926);
  keyRows = { items: [], mastery: [] };
  previewRounds = [];
  surveyRound = null;
  playedRounds = [];
  usedTids.clear();
};

// --- timeline (fixed, in the past, so the sample never drifts) ------------
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();
const lerp = (a, b, t) => a + (b - a) * t;
// The next 09:00:30 UTC after `ms`, when real revert runs write their rows.
const nextRun = (ms) => {
  const d = new Date(ms);
  d.setUTCHours(9, 0, 30, 0);
  return d.getTime() > ms ? d.getTime() : d.getTime() + DAY;
};

const ACCOUNT_CREATED = Date.parse('2023-09-25T14:30:00Z'); // closed-beta era veteran
const SPAN_START = Date.parse('2024-01-20T18:00:00Z');
const SPAN_END = Date.parse('2026-08-14T22:00:00Z');
const EXPORTED_AT = Date.parse('2026-08-16T00:00:00Z');
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
  Medium: ['-21077747', '1886362451'], // Gas Mine, Guardian Turret
  Heavy: ['1042541498', '-455578974', '1647891907'], // RPG-7, C4, Pyro Mine
};
const GLOBAL_GADGET = ['1082327915', '-351094439', '81925953']; // Frag, Explosive Mine, Pyro Grenade
// Real exports lean on one or two guns per class. Weights follow PRIMARY's order.
const MAIN_WEIGHTS = { Light: [0.2, 0.24, 0.34, 0.06, 0.08, 0.08], Medium: [0.18, 0.38, 0.1, 0.12, 0.14, 0.08], Heavy: [0.12, 0.24, 0.1, 0.34, 0.14, 0.06] };
// Gadget and specialization kills come only from damaging items a build of the class carries (see BUILDS),
// at each class's real share: rare on Light, mostly Frag on Medium, RPG-7 first on Heavy. `null` keeps the
// kills on the gun, and GADGET_SHARE lets Heavy and Medium gadget rounds score several.
const KILL_GADGETS = {
  Light: [[null, 0.88], ['207168914', 0.06], ['81925953', 0.04], ['432758549', 0.02]], // Gas Grenade, Pyro Grenade, Breach Charge
  Medium: [[null, 0.35], ['1082327915', 0.38], ['-351094439', 0.12], ['1886362451', 0.11], ['-21077747', 0.04]], // Frag, Explosive Mine, Guardian Turret, Gas Mine
  Heavy: [[null, 0.2], ['1042541498', 0.44], ['520836765', 0.2], ['-455578974', 0.12], ['1647891907', 0.04]], // RPG-7, Charge 'n' Slam, C4, Pyro Mine
};
const GADGET_SHARE = { Light: 1, Medium: 1.5, Heavy: 3 };
const weighted = (pairs, x) => {
  let acc = 0;
  for (const [v, w] of pairs) if (x < (acc += w)) return v;
  return pairs.at(-1)[0];
};

const TOURNEY_MAPS = [
  'DA_MV_Arena_01_Base', 'DA_MV_Arena_02_Base', 'DA_MV_Arena_04_Base', 'DA_MV_Seoul_01_Base',
  'DA_MV_Seoul_02_Base', 'DA_MV_Kyoto_01_Base', 'DA_MV_LasVegas_02_Base', 'DA_MV_LasVegas_02_Sundown',
  'DA_MV_BayCity_01_Base',
];
const CASUAL_MAPS = ['DA_MV_Monaco_01_Base', 'DA_MV_Seoul_01_Base', 'DA_MV_Kyoto_01_Base', 'DA_MV_LasVegas_02_Base', 'DA_MV_Arena_01_Base'];
const CONDS = ['Day', 'Night', 'Sunset', 'Sandstorm', 'HeavyRain', 'Fog'];
const SQUADS = ['THE OG CLUB', 'Iron Vultures', 'Night Shift', 'Vault Runners', 'Last Call', 'Static Hazard', 'Concrete Jungle'];

const archetypeRoll = () => (chance(0.3) ? 'Light' : chance(0.685) ? 'Medium' : 'Heavy');

// kills -> KillsPerItem, and the gun drawn for them. The draws are the ones the sample always made,
// so nothing drawn after them moves.
function killsPerItem(arch, kills) {
  const kpi = {};
  if (kills <= 0) return { kpi, gun: null };
  let gadget = chance(0.45) ? Math.min(kills, ri(1, 2)) : 0;
  let prim = kills - gadget;
  const gun = prim > 0 ? weighted(PRIMARY[arch].map((id, i) => [id, MAIN_WEIGHTS[arch][i]]), rf()) : null;
  const tool = gadget > 0 ? weighted(KILL_GADGETS[arch], rf()) : null;
  if (tool) {
    const more = Math.max(0, Math.min(prim - 1, Math.round(gadget * (GADGET_SHARE[arch] - 1))));
    kpi[tool] = gadget + more;
    prim -= more;
  } else prim += gadget;
  if (prim > 0) kpi[gun ?? PRIMARY[arch][MAIN_WEIGHTS[arch].indexOf(Math.max(...MAIN_WEIGHTS[arch]))]] = prim;
  return { kpi, gun };
}

// The gun each round drew (see killsPerItem), which decorateRounds keys its rng2 draws on.
const drawnGuns = new WeakMap();

// One round record (the { CreatedAt, Data } the parser yields per RoundStat).
function roundRecord({ arch, map, scenarioId, t, dur, combat, tournamentId = null, tier = null, matchId = null, position = null, roundWon = false, tournamentWon = false, backfill = false, disconnected = false }) {
  const cond = pick(CONDS);
  const { kpi, gun } = killsPerItem(arch, combat.kills);
  const rec = {
    CreatedAt: iso(t),
    Data: {
      CharacterArchetype: ARCH_KEY[arch],
      MapVariant: map,
      EnvironmentalCondition: cond,
      KillsPerItem: kpi,
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
  drawnGuns.set(rec, gun);
  return rec;
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
  const tid = newTid();
  const r1Exit = 0.45 - skill * 0.25; // ~45% R1 exits early, ~20% now
  const reach = chance(r1Exit) ? 'R1' : chance(0.45) ? 'R2' : 'FINAL';
  const won = reach === 'FINAL' && chance(0.4 + skill * 0.2); // wins the final ~40% -> ~60%
  let t = startT;
  const advR1 = reach !== 'R1';
  const posR1 = advR1 ? ri(1, 2) : ri(3, 4);
  rounds.push(roundRecord({ arch, map, scenarioId, t, dur: ri(7, 11) * 60_000, combat: combat(2, 16, 2, 10, 12000, 52000), tournamentId: tid, tier: 2, matchId: `2-${ri(0, 1)}`, position: posR1, roundWon: advR1, backfill: chance(0.05) }));
  t += ri(13, 22) * 60_000;
  if (advR1) {
    const advR2 = reach === 'FINAL';
    const posR2 = advR2 ? ri(1, 2) : ri(3, 4);
    rounds.push(roundRecord({ arch, map, scenarioId, t, dur: ri(7, 11) * 60_000, combat: combat(3, 17, 2, 9, 20000, 60000), tournamentId: tid, tier: 1, matchId: '1-0', position: posR2, roundWon: advR2 }));
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
// Before World Tour: the unranked Tournament playlist until its last day on real exports, then Ranked.
const UNRANKED_TOURNAMENT_ID = 377270267;
const UNRANKED_TOURNAMENT_END = Date.parse('2024-03-26T00:00:00Z');
// The World Tour scenario each week ran on, by the week's first round on real exports.
// From Update 9.8.0 every week shares one id, apart from Season 11's opening week.
const WT_WEEK_IDS = [
  ['2024-06-13', 520946128], ['2024-06-27', 425956530], ['2024-07-11', 896067198], ['2024-07-25', 201724873], ['2024-08-08', 380601982], ['2024-08-22', 598537342], ['2024-09-05', 211390302],
  ['2024-09-26', 425956530], ['2024-10-03', 134128679], ['2024-10-10', 704216536], ['2024-10-17', 408400623], ['2024-10-24', 803397762], ['2024-10-31', 791733099], ['2024-11-07', 526555163], ['2024-11-14', 572195019], ['2024-11-21', 769062689], ['2024-11-28', 159466872],
  ['2024-12-12', 785620432], ['2024-12-19', 517351037], ['2024-12-26', 540904715], ['2025-01-02', 970363916], ['2025-01-09', 308426432], ['2025-01-16', 973907767], ['2025-01-23', 976473257], ['2025-01-30', 657258550], ['2025-02-06', 994677702], ['2025-02-13', 619195988], ['2025-02-20', 863388693], ['2025-02-27', 609953292], ['2025-03-06', 776552271],
  ['2025-03-20', 972819353], ['2025-03-27', 572258369], ['2025-04-03', 372967157], ['2025-04-10', 974012321], ['2025-04-17', 688748083], ['2025-04-24', 251023268], ['2025-05-01', 326545039], ['2025-05-08', 722407850], ['2025-05-15', 648075701], ['2025-05-22', 578592227], ['2025-05-29', 193786221], ['2025-06-05', 769621951],
  ['2025-06-12', 741843420], ['2025-06-19', 375377587], ['2025-06-26', 465304560], ['2025-07-03', 525513529], ['2025-07-10', 198101066], ['2025-07-17', 897735170], ['2025-07-24', 416583905], ['2025-07-31', 960388364], ['2025-08-07', 472521555], ['2025-08-14', 516835794], ['2025-08-21', 328125031], ['2025-08-28', 503132740], ['2025-09-04', 917842285],
  ['2025-09-10', 496014728], ['2025-09-18', 269727098], ['2025-09-25', 907722781], ['2025-10-02', 202759954], ['2025-10-09', 294854036], ['2025-10-16', 262477207], ['2025-10-23', 146323197], ['2025-10-30', 146663231], ['2025-11-06', 961176664], ['2025-11-13', 205691223], ['2025-11-20', 852907964], ['2025-11-27', 950590405],
  ['2025-12-10', 812906781], ['2025-12-18', 796922784], ['2025-12-25', 858837033], ['2026-01-01', 405873674], ['2026-01-08', 709035454], ['2026-01-15', 987755586], ['2026-01-22', 961608855], ['2026-01-29', 790343144],
  ['2026-02-05', 732865891], ['2026-07-09', 232142677], ['2026-07-16', 732865891],
].map(([d, id]) => [Date.parse(`${d}T00:00:00Z`), id]);
const sampleWtId = (t) => {
  let id = t < UNRANKED_TOURNAMENT_END ? UNRANKED_TOURNAMENT_ID : RANKED_ID;
  for (const [start, x] of WT_WEEK_IDS) if (start <= t) id = x;
  return id;
};
const SAMPLE_WT_IDS = new Set(WT_WEEK_IDS.map(([, id]) => id));
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
  const DAYS = 470;
  for (let d = 0; d < DAYS; d++) {
    const dayMs = lerp(SPAN_START, SPAN_END, (d + rf() * 0.7) / DAYS);
    const skill = (d + 0.5) / DAYS; // improves over the account's lifetime
    let t = dayMs + ri(0, 3) * HOUR;
    // Activity rides a slow wave rather than sitting flat: real exports swing
    // hard between seasons, and a flat rate makes every season's curve the same
    // length, which is the one thing they never are.
    const busy = 0.5 + 0.5 * Math.sin((d / DAYS) * Math.PI * 4.5);
    const matches = ri(1, 3) + Math.round(busy * 4);
    for (let m = 0; m < matches; m++) {
      const roll = rf();
      // Ranked-heavy: a season has to hold enough matches that the per-match
      // rank change stays in the range real exports show (median 10 mu, never
      // past ~31). Too few and each match has to move the score so far that a
      // whole placement ladder goes positive, which never happens for real.
      if (roll < 0.62) t = tournament(rounds, RANKED_ID, t, skill);
      else if (roll < 0.72) {
        rf(); // the id draw this history was generated with, so the random stream stays put
        t = tournament(rounds, sampleWtId(t), t, skill);
      }
      else if (roll < 0.9) t = casualMatch(rounds, pick(CASUAL_MODES), t);
      else t = casualMatch(rounds, pick(LTM_MODES), t);
      t += ri(4, 30) * 60_000;
    }
  }
  return rounds;
}

// --- per-match ranked log (RankUpdate) ------------------------------------
// Built from the ranked tournaments above so the two agree, and chained so each
// season ends on the RankPoints its snapshot records. S2/S3 get no rows: the
// real log starts at S4, and the snapshot-only path has to stay exercised.
// startMu is the soft reset, 70% of last season's finish (85% at S11), capped by
// the placement ceiling. `ladder` is off for S4/S5, where the real per-placement
// breakdown doesn't appear until S6.
//
// endMu must stay reachable in the number of ranked matches that season actually
// has. Each row's movement is LADDER_SHAPE plus an even correction that lands the
// season on endMu, so too few matches for the climb pushes that correction up and
// shifts the whole placement ladder positive — every slot paying out, including
// last, which happens in 0 of the ~4,000 real ladders. Raising a rank target
// means raising the match count with it.
const RANKED_LOG_SEASONS = [
  { seasonId: 814189767, from: Date.parse('2024-09-26T00:00:00Z'), to: Date.parse('2024-12-12T00:00:00Z'), startMu: 1250, endMu: 2090, ladder: false },
  { seasonId: 483101830, from: Date.parse('2024-12-12T00:00:00Z'), to: Date.parse('2025-03-20T00:00:00Z'), startMu: 1463, endMu: 2453, ladder: false },
  { seasonId: 279111264, from: Date.parse('2025-03-20T00:00:00Z'), to: Date.parse('2025-06-12T00:00:00Z'), startMu: 1717, endMu: 2277, ladder: true },
  { seasonId: 607580158, from: Date.parse('2025-06-12T00:00:00Z'), to: Date.parse('2025-09-10T00:00:00Z'), startMu: 1594, endMu: 2322, ladder: true },
  { seasonId: 607608768, from: Date.parse('2025-09-10T00:00:00Z'), to: Date.parse('2025-12-10T00:00:00Z'), startMu: 1625, endMu: 2129, ladder: true },
  { seasonId: 825209376, from: Date.parse('2025-12-10T00:00:00Z'), to: Date.parse('2026-03-26T00:00:00Z'), startMu: 1490, endMu: 2618, ladder: true },
  { seasonId: 965777394, from: Date.parse('2026-03-26T00:00:00Z'), to: Date.parse('2026-07-09T00:00:00Z'), startMu: 1833, endMu: 3058, ladder: true },
  // In progress at export time, and the only season paying the performance
  // grant; `bonus` switches it on so the preview shows the Diamond cut-off too.
  { seasonId: 349883189, from: Date.parse('2026-07-09T00:00:00Z'), to: Infinity, startMu: 2599, endMu: 2963, ladder: true, bonus: true },
];
// Typical payout for the 8 finishing places, in mu. The real ladder slides with
// the lobby, so only the shape is fixed. These suit a Platinum player, the
// closest rank to this demo player: the ladder scales hard with rank, so the
// shape must match the rank being shown.
const LADDER_SHAPE = [101, 71, 28, -3, -46, -46, -76, -76];

// Seasons that predate the log still need a window, so their snapshot match
// counts come from the generated history like every other season's.
const PRE_LOG_SEASON_WINDOWS = [
  { seasonId: 762104396, from: Date.parse('2024-03-14T00:00:00Z'), to: Date.parse('2024-06-13T00:00:00Z') },
  { seasonId: 751146294, from: Date.parse('2024-06-13T00:00:00Z'), to: Date.parse('2024-09-26T00:00:00Z') },
];

function buildRankUpdates(rounds) {
  const byTid = new Map();
  for (const { Data: d } of rounds) {
    if (d.ScenarioID !== RANKED_ID || !d.TournamentID) continue;
    const start = Date.parse(d.StartTime);
    const end = Date.parse(d.EndTime);
    const t = byTid.get(d.TournamentID);
    if (t) {
      t.rounds.push(d);
      if (start < t.start) t.start = start;
      if (end > t.end) t.end = end;
    } else byTid.set(d.TournamentID, { id: d.TournamentID, start, end, rounds: [d] });
  }
  const all = [...byTid.values()].sort((a, b) => a.start - b.start);
  const runLag = localRng(0x5f27);

  const out = [];
  for (const s of RANKED_LOG_SEASONS) {
    const list = all.filter((t) => t.start >= s.from && t.start < s.to);
    if (!list.length) continue;

    // Finish position, 0-based (0 = won it), from the deepest round reached.
    const drawn = [];
    for (const t of list) {
      const deepest = t.rounds.reduce((m, d) => Math.min(m, d.Tier), 9);
      const last = t.rounds.find((d) => d.Tier === deepest);
      const place = deepest === 0 ? (last.TournamentWon ? 0 : 1) : deepest === 1 ? (last.LeaderboardPosition ?? 3) - 1 : (last.LeaderboardPosition ?? 3) === 3 ? 4 : 6;
      // `extra` is what the result was worth beyond the flat placement value,
      // kept apart so PositionUpdates still shows the placement alone. Negative
      // = leaver penalty; the S11 grant adds a positive one below.
      const extra = chance(0.02) ? -ri(80, 150) : 0;
      // A played row is written as the tournament's last round ends.
      drawn.push({ t, place, type: extra ? 'PENALTY' : 'NORMAL', at: t.end + 100 + (ri(20, 40) - 20) * 20, extra, raw: LADDER_SHAPE[place] + extra + (rf() - 0.5) * 8 });
      // Real exports log a revert as a second row on the same tournament, written by
      // a 09:00 UTC run one to eight days later. Its amount is recomputed, not the
      // result mirrored: it lowers a win and raises every other place, and it can
      // itself be undone.
      if (chance(0.08)) {
        const run = nextRun(t.start + ri(20, 160) * HOUR);
        const raw = place === 0 ? -LADDER_SHAPE[0] * 0.3 : Math.abs(LADDER_SHAPE[place]) * 0.5 + 12;
        drawn.push({ t, place, type: 'REVERT', at: run + Math.floor(runLag() * 40_000), extra: 0, raw });
        if (chance(0.2)) drawn.push({ t, place, type: 'UNDO_REVERT', at: nextRun(run + ri(1, 3) * DAY) + Math.floor(runLag() * 40_000), extra: 0, raw: -raw * 0.97 });
      }
    }
    // Chain in timestamp order: a rollback lands on its own stamp, so curves step.
    drawn.sort((a, b) => a.at - b.at);
    // A run due after the export was requested has not happened yet.
    const events = drawn.filter((e) => e.at < EXPORTED_AT);
    const spread = () => (s.endMu - s.startMu - events.reduce((a, e) => a + e.raw, 0)) / events.length;
    // The grant only pays below the Diamond line, so eligibility depends on the
    // running score: dry-run the season, then fold the grants into the totals.
    if (s.bonus) {
      const dry = spread();
      let mu = s.startMu;
      for (const e of events) {
        if (e.type === 'NORMAL' && mu * 10 < PERFORMANCE_BONUS_MAX_SCORE && chance(0.55)) {
          e.extra = ri(6, 150) / 10;
          e.raw += e.extra;
        }
        mu += e.raw + dry;
      }
    }
    // Spread the remainder over the played rows so no single row jumps to the target
    // and a revert keeps its own amount.
    const isPlayed = (e) => e.type === 'NORMAL' || e.type === 'PENALTY';
    const fix = (s.endMu - s.startMu - events.reduce((a, e) => a + e.raw, 0)) / events.filter(isPlayed).length;

    let mu = s.startMu;
    for (const e of drawn) {
      // The draws below are made for a run that has not happened too, so the stream stays where it was.
      const team = ri(0, 7);
      const lead = isPlayed(e) ? 0 : ri(20, 40) * 1000;
      if (e.at >= EXPORTED_AT) continue;
      const delta = e.raw + (isPlayed(e) ? fix : 0);
      const before = mu;
      mu += delta;
      // Real rollback rows carry a breakdown too, but it is the original match's
      // — a rollback has no placement of its own. Deriving one from the reversal
      // instead pays every slot, including last, which never happens for real.
      const played = e.type === 'NORMAL' || e.type === 'PENALTY';
      if (s.ladder && played) e.t.ladder = LADDER_SHAPE.map((v) => v + (delta - e.extra - LADDER_SHAPE[e.place]));
      const ladder = s.ladder ? e.t.ladder : null;
      out.push({
        TournamentID: e.t.id,
        SeasonID: s.seasonId,
        ScenarioID: String(RANKED_ID),
        UpdateType: e.type,
        MuBefore: before,
        MuAfter: mu,
        TeamIndex: team,
        IsCompleteMatch: e.type === 'NORMAL' || e.type === 'PENALTY',
        // PositionUpdates is what the placement alone was worth, so anything
        // paid on top of it (or docked from it) comes back out first.
        ...(ladder ? { PositionIndex: e.place, PositionUpdates: ladder } : {}),
        CreatedAt: iso(e.at),
        ...(isPlayed(e) ? {} : { AdjustedAt: iso(e.at - lead) }),
      });
    }
  }
  return out;
}

// --- lifetime summary (RoundStatSummary buckets, the career headline) -----
// Derived from the generated match history so every career total reconciles with
// the rounds the dashboard actually shows. (Real exports store these buckets
// separately, but a real RoundStatSummary ≈ the player's RoundStat history.)
// ranked = the ranked playlist, worldTour = Seasons 3 to 8's World Tour, casual =
// the rest, total = all three.
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

// Season ids as Embark's key file numbers them, for the World Tour seasonal record.
const SEASON_IDS = [
  ['2023-12-08', 371919277], ['2024-03-14', 762104396], ['2024-06-13', 751146294], ['2024-09-26', 814189767],
  ['2024-12-12', 483101830], ['2025-03-20', 279111264], ['2025-06-12', 607580158], ['2025-09-10', 607608768],
  ['2025-12-10', 825209376], ['2026-03-26', 965777394], ['2026-07-09', 349883189],
].map(([d, id]) => [Date.parse(`${d}T00:00:00Z`), id]);
const seasonIdAt = (ms) => SEASON_IDS.reduce((best, [start, id]) => (start <= ms ? id : best), null);

// Sponsors: one per season through Season 8, then switched by stop. Fans follow the rounds played.
const SPONSOR = { HOLTOW: 694448565, VAIIYA: 318896507, ALFA_ACTA: -1450283644, TRENTILA: 1789104437, OSPUZE: -234554384, VOLPE: -1916700347, ISEUL_T: -712450515, ENGIMO: -36016083, DISSUN: -1229618176 };
const CAREER_SPONSORS = [[814189767, SPONSOR.HOLTOW], [483101830, SPONSOR.VAIIYA], [279111264, SPONSOR.ALFA_ACTA], [607580158, SPONSOR.VAIIYA], [607608768, SPONSOR.TRENTILA]];
const JOURNEY_SPONSORS = {
  825209376: [SPONSOR.OSPUZE, SPONSOR.OSPUZE, SPONSOR.OSPUZE, SPONSOR.VOLPE, SPONSOR.VOLPE],
  965777394: [SPONSOR.ALFA_ACTA, SPONSOR.ALFA_ACTA, SPONSOR.ISEUL_T, SPONSOR.ISEUL_T, SPONSOR.ISEUL_T],
  349883189: [SPONSOR.ENGIMO, SPONSOR.ENGIMO, SPONSOR.ENGIMO, SPONSOR.ENGIMO, SPONSOR.ENGIMO],
};
const STOP_IDS = [754316888, 883498882, 858581427, 958846313, 419510279];
const STOP_MS = 21 * DAY;
const fansOf = (d) => 300 + (d.RoundWon ? 500 : 150) + (d.Kills || 0) * 25;

function buildSponsorRecords(rounds) {
  const seasonStart = new Map(SEASON_IDS.map(([ms, id]) => [id, ms]));
  const bySeason = new Map();
  const gained = {};
  for (const { Data: d } of rounds) {
    const t = Date.parse(d.StartTime);
    const s = seasonIdAt(t);
    if (s == null) continue;
    bySeason.set(s, (bySeason.get(s) || 0) + fansOf(d));
    if (!JOURNEY_SPONSORS[s]) continue;
    const stop = Math.min(4, Math.floor((t - seasonStart.get(s)) / STOP_MS));
    const g = (gained[s] ||= {});
    g[STOP_IDS[stop]] = (g[STOP_IDS[stop]] || 0) + fansOf(d);
  }
  const seasonN = new Map(SEASON_IDS.map(([, id], i) => [id, i + 1]));
  // An empty track (level 0, no fans), as two real exports hold.
  const progress = { [SPONSOR.DISSUN]: { sponsorLevel: 0, nextLevelProgress: 0, fansPerSeason: {} } };
  // The game's own level costs. Through Season 8 a season could only finish the track it started on.
  const levelUp = (id, fans, s) => {
    const p = (progress[id] ||= { sponsorLevel: 0, nextLevelProgress: 0, fansPerSeason: {} });
    const n = seasonN.get(s);
    const released = sponsorTrackLength(n, sponsorName(id));
    const cap = n <= 8 ? Math.min(released, 20 * (Math.floor(p.sponsorLevel / 20) + 1)) : released;
    let left = p.nextLevelProgress + fans;
    let cost = sponsorLevelFans(n, p.sponsorLevel + 1);
    while (p.sponsorLevel < cap && cost != null && left >= cost) {
      left -= cost;
      p.sponsorLevel += 1;
      cost = sponsorLevelFans(n, p.sponsorLevel + 1);
    }
    p.nextLevelProgress = p.sponsorLevel >= cap ? 0 : left;
    p.fansPerSeason[s] = fans;
    return p;
  };
  const trackSeasonId = (id, level, s) => {
    const name = sponsorName(id);
    const added = SEASON_IDS.filter(([, sid]) => seasonN.get(sid) <= seasonN.get(s) && sponsorAddedLevels(seasonN.get(sid), name)).map(([, sid]) => sid);
    return added[Math.max(0, Math.ceil(level / 20) - 1)] ?? s;
  };
  const seasonalRecords = CAREER_SPONSORS.filter(([s]) => bySeason.has(s)).map(([s, id]) => {
    const fans = bySeason.get(s);
    const p = levelUp(id, fans, s);
    return { totalFans: fans, selectedSponsor: id, sponsorLevel: p.sponsorLevel, seasonId: s, sponsorTrackSeasonId: trackSeasonId(id, p.sponsorLevel, s), nextLevelProgress: p.nextLevelProgress };
  });
  for (const [s, stops] of Object.entries(gained).sort(([a], [b]) => seasonStart.get(Number(a)) - seasonStart.get(Number(b)))) {
    const perSponsor = new Map();
    STOP_IDS.forEach((stopId, i) => {
      if (stops[stopId]) perSponsor.set(JOURNEY_SPONSORS[s][i], (perSponsor.get(JOURNEY_SPONSORS[s][i]) || 0) + stops[stopId]);
    });
    for (const [id, fans] of perSponsor) levelUp(id, fans, Number(s));
  }
  const last = seasonalRecords.at(-1);
  const lastSeason = Object.keys(gained).map(Number).sort((a, b) => seasonStart.get(a) - seasonStart.get(b)).at(-1);
  const lastStops = lastSeason ? STOP_IDS.map((id, i) => [id, i]).filter(([id]) => gained[lastSeason][id]) : [];
  return {
    stopsWithFans: Object.values(gained).reduce((a, g) => a + Object.keys(g).length, 0),
    lastStopId: lastStops.at(-1)?.[0] ?? 0,
    rows: [
      {
        ObjectKey: 'player_career',
        Value: JSON.stringify({ fans: last?.totalFans ?? 0, selectedSponsor: last?.selectedSponsor ?? 0, sponsorLevel: last?.sponsorLevel ?? 0, season: last?.seasonId ?? 0, isMigrated: true, seasonalRecords }),
        CreatedAt: '2024-09-26T11:00:00Z',
        UpdatedAt: '2025-12-10T00:20:00Z',
      },
      {
        ObjectKey: 'sponsor_journey',
        Value: JSON.stringify({ bufferedFans: 0, gainedFans: gained, sponsorProgress: progress, signedSponsor: lastStops.length ? JOURNEY_SPONSORS[lastSeason][lastStops.at(-1)[1]] : 0 }),
        CreatedAt: '2025-12-10T16:30:00Z',
        UpdatedAt: iso(SPAN_END),
      },
    ],
  };
}

// Counted the way Embark counts TotalWorldTourEvents.
function worldTourEventCount(rounds, stopsWithFans) {
  const seasonN = new Map(SEASON_IDS.map(([, id], i) => [id, i + 1]));
  const seen = new Set();
  for (const { Data: d } of rounds) {
    if (!SAMPLE_WT_IDS.has(d.ScenarioID) || !d.TournamentID) continue;
    const n = seasonN.get(seasonIdAt(Date.parse(d.StartTime)));
    if (n == null || n < 3 || n > 8) continue;
    const ev = worldTourEvent(d.ScenarioID, n);
    if (n === 3) seen.add(`3:${ev?.event ?? d.ScenarioID}`);
    else if (ev) seen.add(`${n}:${ev.stop}`);
  }
  return seen.size + stopsWithFans;
}

function buildSummary(rounds, sponsors) {
  const ranked = rounds.filter((r) => r.Data.ScenarioID === RANKED_ID);
  // World Tour kept its own bucket through Season 8 and froze when Season 9 folded it into
  // every mode. Everything else outside Ranked, LTMs included, is `casual`, so total =
  // casual + ranked + worldTour, as on real 2026-09+ exports.
  const OLD_WT = [751146294, 814189767, 483101830, 279111264, 607580158, 607608768];
  const oldWt = new Set(rounds.filter((r) => SAMPLE_WT_IDS.has(r.Data.ScenarioID) && OLD_WT.includes(seasonIdAt(Date.parse(r.Data.StartTime)))));
  const casual = rounds.filter((r) => r.Data.ScenarioID !== RANKED_ID && !oldWt.has(r));
  // World Tour: per-season badge score and finals won, scored by era as real exports store them.
  const WT2_SEASONS = new Set([825209376, 965777394, 349883189]);
  const seasonal = {};
  const entry = (s) => (seasonal[s] ||= { BadgeScore: 0, FinalsWon: 0 });
  const tourneys = new Map();
  for (const r of rounds) {
    const d = r.Data;
    const s = seasonIdAt(Date.parse(d.StartTime));
    if (s == null || !WT2_SEASONS.has(s)) continue;
    const tournament = d.ScenarioID === RANKED_ID || SAMPLE_WT_IDS.has(d.ScenarioID);
    if (tournament) {
      const t = tourneys.get(d.TournamentID) || { s, furthest: 9, won: false };
      t.furthest = Math.min(t.furthest, Number(String(d.MatchID).split('-')[0]));
      if (d.TournamentWon) t.won = true;
      tourneys.set(d.TournamentID, t);
      if (d.RoundWon && s === 349883189) entry(s).FinalsWon += 1;
    } else if (d.ScenarioID === QUICK_CASH_ID) {
      entry(s).BadgeScore += d.PlacedAt === 1 ? 6 : d.PlacedAt === 2 ? 4 : d.PlacedAt === 3 ? 2 : 0;
    } else if (!d.Abandoned) {
      entry(s).BadgeScore += d.RoundWon ? 4 : 2;
    }
  }
  for (const t of tourneys.values()) {
    entry(t.s).BadgeScore += t.won ? 25 : t.furthest === 0 ? 14 : t.furthest === 1 ? 6 : 2;
    // Seasons 9 and 10 count World Tour and Ranked tournaments won (Season 11 counts rounds, above).
    if (t.won && t.s !== 349883189) entry(t.s).FinalsWon += 1;
  }
  // Seasons 3 to 8 scored World Tour tournaments only, a round-1 exit paying 2 from
  // Season 7. This player never reached Season 3's Finals stage, so FinalsWon stays 0.
  const oldTourneys = new Map();
  for (const r of rounds) {
    const d = r.Data;
    const s = seasonIdAt(Date.parse(d.StartTime));
    if (!OLD_WT.includes(s) || !SAMPLE_WT_IDS.has(d.ScenarioID) || !d.TournamentID) continue;
    const t = oldTourneys.get(d.TournamentID) || { s, furthest: 9, won: false };
    t.furthest = Math.min(t.furthest, Number(String(d.MatchID).split('-')[0]));
    if (d.TournamentWon) t.won = true;
    oldTourneys.set(d.TournamentID, t);
  }
  for (const t of oldTourneys.values()) {
    const r1 = t.s === 607580158 || t.s === 607608768 ? 2 : 0;
    entry(t.s).BadgeScore += t.won ? 25 : t.furthest === 0 ? 14 : t.furthest === 1 ? 6 : r1;
  }
  // The Quickplay badge (Seasons 6 to 8): the wiki's per-result points.
  const quickplay = {};
  for (const r of rounds) {
    const d = r.Data;
    const s = seasonIdAt(Date.parse(d.StartTime));
    if (![279111264, 607580158, 607608768].includes(s) || !CASUAL_IDS.has(d.ScenarioID) || d.Abandoned) continue;
    const pts = d.ScenarioID === QUICK_CASH_ID ? ([10, 6, 5][(d.PlacedAt ?? 9) - 1] ?? 0) : d.RoundWon ? 10 : 5;
    quickplay[s] = (quickplay[s] || 0) + pts;
  }
  // One entry per scenario whose last round was won: the run of won rounds it ended on.
  const streaks = {};
  for (const { Data: d } of [...rounds].sort((a, b) => Date.parse(a.Data.StartTime) - Date.parse(b.Data.StartTime))) {
    if (d.RoundWon) streaks[d.ScenarioID] = { Streak: (streaks[d.ScenarioID]?.Streak ?? 0) + 1, LastWin: d.EndTime };
    else delete streaks[d.ScenarioID];
  }
  const total = aggregateRoundStats(rounds);
  total.WinStreakPerMatchmakingScenario = streaks;
  return [
    {
      UpdatedAt: iso(SPAN_END),
      Data: {
        total,
        casual: aggregateRoundStats(casual),
        ranked: aggregateRoundStats(ranked),
        worldTour: {
          ...aggregateRoundStats([...oldWt]),
          WorldTourBadgeScore: OLD_WT.reduce((a, s) => a + (seasonal[s]?.BadgeScore ?? 0), 0),
          WorldTourFinalsWon: seasonal[OLD_WT[0]]?.FinalsWon ?? 0,
          TotalWorldTourEvents: worldTourEventCount(rounds, sponsors.stopsWithFans),
          LastWorldTourEventIdentifier: sponsors.lastStopId,
          SeasonalStats: seasonal,
        },
        scores: { QuickPlayScore: quickplay },
      },
    },
  ];
}

// The preview build's own summary, which the export emits beside the live one and
// updates as that build's last round ends.
function previewSummary(rounds) {
  if (!rounds.length) return [];
  const all = aggregateRoundStats(rounds);
  return [{ UpdatedAt: rounds.at(-1).Data.EndTime, Data: { total: all, casual: all, ranked: aggregateRoundStats([]), scores: {} } }];
}

// Two Point Break rounds on the S9 preview build (the audit names the build, see buildAudit).
const pickPreviewRounds = (rounds) => rounds.filter((r) => r.Data.StartTime.startsWith('2025-12-05') && r.Data.ScenarioID === 184486584);

// --- purchases & economy --------------------------------------------------
// Standalone Multibucks packs must use REAL store pairs
const PURCHASES = [
  { iso: '2024-02-10T20:14:00Z', price: 9.99, mb: 1150, localized: '£8.39' },
  { iso: '2024-06-20T18:42:00Z', price: 19.99, mb: 2400, dlc: 3025990 },
  { iso: '2024-12-15T13:05:00Z', price: 4.99, mb: 500 },
  { iso: '2025-03-22T21:30:00Z', price: 9.99, mb: 1150, dlc: 3519920, localized: '£8.39' },
  { iso: '2025-09-12T19:18:00Z', price: 49.99, mb: 6250, dlc: 3964970, localized: '£42.99' },
  { iso: '2026-04-02T17:55:00Z', price: 8.99, mb: 1000, dlc: 4403960 },
];

function buildTransactions() {
  const tx = [];
  // Real-money purchases (the only rows with a price).
  for (const p of PURCHASES) {
    const Items = [multibucks(p.mb), ...(p.dlc ? [purchaseItem('CustomizationItem'), purchaseItem('CustomizationItem'), purchaseItem('WeaponSkin'), purchaseItem('WeaponCharm')] : [])];
    tx.push({ TransactionType: 'purchase', State: 'granted', Source: 'realmoneytransaction', GameStore: 'steam', GameStorePurchasedAt: p.iso, CreatedAt: p.iso, PricePoint: p.price, CurrencyCode: 'GBP', Country: 'GB', LocalizedPrice: p.localized ?? null, Items });
  }
  // One failed attempt (shown, excluded from the total).
  tx.push({ TransactionType: 'purchase', State: 'failed', Source: 'realmoneytransaction', GameStore: 'steam', GameStorePurchasedAt: '2025-01-08T22:01:00Z', CreatedAt: '2025-01-08T22:01:00Z', PricePoint: 19.99, CurrencyCode: null, Country: 'GB', LocalizedPrice: null });
  // Non-fiat grants — fill out the "where your items came from" bars + the log.
  const SOURCES = [
    ['battlepass', 'embark', 40], ['battlepass-historical', 'embark', 8], ['collectionevent', 'embark', 18],
    ['embarkstore', 'embark', 22], ['twitchdrop', 'twitch', 14], ['giveaway', 'giveaway', 6], ['thirdpartysubscription', 'twitch', 4],
  ];
  // Named contents come with store buys, drops, giveaways and subscription perks; the
  // battle pass and collection events hand items out without naming them.
  const NAMED = { twitchdrop: 1, giveaway: 1, thirdpartysubscription: 2 };
  for (const [source, store, n] of SOURCES) {
    for (let i = 0; i < n; i++) {
      const t = lerp(SPAN_START, SPAN_END, (i + 0.5) / n) + ri(-5, 5) * DAY;
      const Items = NAMED[source] ? Array.from({ length: NAMED[source] }, () => purchaseItem()) : undefined;
      tx.push({ TransactionType: source === 'embarkstore' ? 'purchase' : 'reward', State: 'granted', Source: source, GameStore: store, GameStorePurchasedAt: iso(t), CreatedAt: iso(t), PricePoint: null, CurrencyCode: null, Country: null, LocalizedPrice: null, ...(Items && { Items }) });
    }
  }
  return tx;
}

// Store buys are dated and priced off the ledger's "spent" rows, so each spend can
// be matched to what it bought, as the model does on real exports. One of them is
// the season's battle pass, which the export names only by its internal label.
function nameStorePurchases(tx, ledger) {
  const spent = ledger.filter((r) => r.LogType === 'spent');
  const store = tx.filter((t) => t.Source === 'embarkstore').sort((a, b) => Date.parse(a.CreatedAt) - Date.parse(b.CreatedAt));
  store.forEach((t, i) => {
    const s = spent[Math.floor((i * spent.length) / store.length)];
    if (!s) return;
    t.CreatedAt = s.CreatedAt;
    t.GameStorePurchasedAt = s.CreatedAt;
    const granted = i === 3 ? [battlePassItem()] : Array.from({ length: chance3(0.3) ? ri3(2, 4) : 1 }, () => purchaseItem());
    t.Items = [multibucks(-s.Quantity), ...granted];
  });
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

// Owned items (persistence `InventoryItem`): a believable cosmetic-heavy spread.
// buildInventoryItems names them, as exports have since 2026-09.
const INVENTORY_SPREAD = [
  ['CustomizationItem', 180], ['WeaponSkin', 142], ['WeaponCharm', 46], ['WeaponSticker', 38],
  ['PlayerCardCustomization', 33], ['AnimationCustomization', 21], ['Spray', 16], ['Emoticon', 12],
  ['GameItem', 9], ['BattlePass', 6], ['ClansCustomization', 4], ['Currency', 3],
];

// Hidden matchmaking / skill ratings (persistence `BucketObject`): OpenSkill-era
// ranked in S2, the IVK ladder from S3 on, plus the casual/World-Tour hidden MMR and
// the raw OpenSkill model. Carries the migration seeds and both parallel shadow
// ratings a real export has, so the preview exercises de-duplication AND the S2/S3
// engine handover. Match counts, dates and peaks come from the generated history.
const TOURNAMENT_FAMILY = { 814189767: '', 483101830: '2', 279111264: '2', 607580158: '2', 607608768: '2', 825209376: '3', 965777394: '4', 349883189: '5' };
function buildRatingBuckets(rounds, rankUpdates) {
  const rb = (ObjectKey, value, CreatedAt, UpdatedAt) => ({ ObjectKey, Value: JSON.stringify(value), CreatedAt, UpdatedAt });
  const leagueIdx = (mu) => Math.min(Math.floor(mu / 250) + 1, 20);
  // A rating row is created some hours before its first match and updated as its last one ends.
  const lead = localRng(0xb7f5);
  const played = (keep, from = ACCOUNT_CREATED) => {
    const spans = new Map();
    for (const { Data: d } of rounds) {
      const t = Date.parse(d.StartTime);
      if (!keep(d, t)) continue;
      const id = d.TournamentID || d.StartTime;
      const s = spans.get(id) ?? { start: t, end: 0 };
      spans.set(id, { start: Math.min(s.start, t), end: Math.max(s.end, Date.parse(d.EndTime)) });
    }
    const list = [...spans.values()].sort((a, b) => a.start - b.start);
    const earliest = from + (5 + lead() * 50) * 60_000;
    const first = (list[0]?.start ?? SPAN_START) - 1.4 * 40 ** lead() * HOUR;
    return { n: list.length, first: iso(Math.max(first, earliest)), last: iso((list.at(-1)?.end ?? SPAN_START) + 300) };
  };
  const windows = [...PRE_LOG_SEASON_WINDOWS, ...RANKED_LOG_SEASONS];
  const season = (sid) => {
    const w = windows.find((x) => x.seasonId === sid);
    const p = played((d, t) => d.ScenarioID === RANKED_ID && d.TournamentID && t >= w.from && t < w.to, w.from);
    const rows = rankUpdates.filter((r) => r.SeasonID === sid);
    if (!rows.length) return p;
    // One finished season in three is touched again when it closes.
    const closing = [lead(), lead()];
    const last = Date.parse(rows.map((r) => r.CreatedAt).sort().at(-1));
    const later = Number.isFinite(w.to) && closing[0] < 1 / 3 ? Math.max(last, w.to) + (2 + closing[1] * 60) * HOUR : last;
    return { ...p, last: iso(later), peak: rows.reduce((m, r) => Math.max(m, leagueIdx(r.MuBefore), leagueIdx(r.MuAfter)), 0) };
  };
  const ranked = (ratingId, seasonId, mu, sigma, matches, lri, peak, rp) => ({
    ratingId, mu, sigma, seasonId: String(seasonId), completedMatches: matches,
    leagueRankIndex: lri, rankPoints: rp, highestLeagueRankIndex: peak, countSincePromotion: 0, lastTournamentPlayed: '',
  });
  const flat = (ratingId, mu, sigma, matches) => ({
    ratingId, mu, sigma, seasonId: '', completedMatches: matches,
    leagueRankIndex: 0, rankPoints: 0, highestLeagueRankIndex: 0, countSincePromotion: 0, lastTournamentPlayed: '',
  });

  const out = [];
  // S2 is the last OpenSkill season, its points run about 5,000 per division from zero.
  // S3 is the first IVK season: [ratingId, seasonId, mu, sigma, finalIndex, peakIndex, RankPoints]
  const EARLY = [
    ['OpenSkillRankedRating', 762104396, 32.4, 1.4, 11, 12, 52000],
    ['IVKRankedRating', 751146294, 2600, 0, 11, 12, 26000],
  ];
  for (const [rid, sid, mu, sigma, lri, peak, rp] of EARLY) {
    const s = season(sid);
    out.push(rb(`${rid}_${sid}`, ranked(rid, sid, mu, sigma, s.n, lri, peak, rp), s.first, s.last));
  }
  for (const w of RANKED_LOG_SEASONS) {
    const s = season(w.seasonId);
    const rid = `IVKRankedTournamentRating${TOURNAMENT_FAMILY[w.seasonId]}`;
    out.push(rb(`${rid}_${w.seasonId}`, ranked(rid, w.seasonId, w.endMu, 0, s.n, leagueIdx(w.endMu), s.peak, w.endMu * 10), s.first, s.last));
  }

  // Rows that must resolve away in favour of the real progression: a backfilled S9
  // migration seed (0 matches); the S2-era IVK shadow (a brief run alongside
  // OpenSkill at the end of S2, never assigned a league); and S3's OpenSkillRankedRating
  // shadow, still on the S2 point scale and so reading several divisions high.
  const seededAt = '2025-12-09T08:26:51Z';
  const s9 = RANKED_LOG_SEASONS.find((w) => w.seasonId === 825209376);
  out.push(rb('IVKRankedTournamentRating3_825209376', ranked('IVKRankedTournamentRating3', 825209376, s9.startMu, 0, 0, 0, 0, 0), seededAt, seededAt));
  const shadowFrom = Date.parse('2024-06-03T00:00:00Z');
  const shadow = played((d, t) => d.ScenarioID === RANKED_ID && d.TournamentID && t >= shadowFrom && t < PRE_LOG_SEASON_WINDOWS[0].to, shadowFrom);
  out.push(rb('IVKRankedRating_762104396', ranked('IVKRankedRating', 762104396, 1250 + shadow.n * 38, 0, shadow.n, 0, 0, 0), shadow.first, shadow.last));
  const s3 = season(751146294);
  out.push(rb('OpenSkillRankedRating_751146294', ranked('OpenSkillRankedRating', 751146294, 31.2, 3.1, s3.n - 3, 17, 18, 81250), s3.first, s3.last));

  // Hidden MMR for the non-ranked playlists (no league rank, just a skill number).
  const casual = played((d) => !d.TournamentID);
  const tour = played((d) => SAMPLE_WT_IDS.has(d.ScenarioID));
  out.push(rb('IVKCasualRating', flat('IVKCasualRating', 1012, 0, casual.n), casual.first, casual.last));
  out.push(rb('IVKWorldTourRating', flat('IVKWorldTourRating', 968, 0, tour.n), tour.first, tour.last));
  out.push(rb('IVKCasualAttackDefendRating', flat('IVKCasualAttackDefendRating', 447, 0, 17), '2024-06-05T17:42:19Z', '2024-10-19T20:07:53Z'));
  out.push(rb('IVKCasualRating', flat('IVKCasualRating', 205, 0, 0), seededAt, seededAt));

  // The raw OpenSkill model the IVK numbers are built from (mu = skill, sigma = uncertainty).
  const openSkillUntil = Date.parse('2025-02-09T00:00:00Z');
  const osCasual = played((d, t) => !d.TournamentID && t < openSkillUntil);
  const osV2 = played((d, t) => !d.TournamentID && t >= PRE_LOG_SEASON_WINDOWS[1].from && t < openSkillUntil);
  out.push(rb('OpenSkillRating', flat('OpenSkillRating', 26.7, 0.81, 61), '2023-10-03T17:26:41Z', '2024-05-21T19:48:12Z'));
  out.push(rb('OpenSkillCasualRating', flat('OpenSkillCasualRating', 27.9, 0.63, osCasual.n), osCasual.first, osCasual.last));
  out.push(rb('OpenSkillV2CasualRatings3', flat('OpenSkillV2CasualRating', 91.3, 3.1, osV2.n), osV2.first, osV2.last));
  out.push(rb('OpenSkillTournamentRating', flat('OpenSkillTournamentRating', 21.8, 1.71, 0), '2023-12-10T19:12:37Z', '2024-03-02T21:37:05Z'));
  out.push(rb('OpenSkillCasualAttackDefendRating', flat('OpenSkillCasualAttackDefendRating', 27.6, 6.9, 17), '2024-06-05T17:42:19Z', '2024-10-19T20:07:53Z'));

  return out;
}

// --- fields Embark added to the export in 2026-09 -------------------------
// Loadouts, scorecards, placements, named inventory, saved contestants, social, inbox and
// console records. They draw from their own stream (rng2), so adding one never
// reshuffles the numbers the rest of the sample already produces.
const pseudoUuid = () => {
  const hex = (n) => Array.from({ length: n }, () => Math.floor(rng2() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
};

// spec + three gadgets per class, most-played first, after the builds real exports use most; the weapon
// is picked per round.
const BUILDS = {
  Light: [
    { spec: -1926332066, gadgets: [-660720463, -657063493, 1948814529] }, // Cloaking Device: Sonar Grenade, Thermal Vision, Gateway
    { spec: -1873247082, gadgets: [988268619, 780830895, 1948814529] }, // Evasive Dash: H+ Infuser, Glitch Grenade, Gateway
    { spec: -1107836742, gadgets: [432758549, 207168914, 81925953] }, // Grappling Hook: Breach Charge, Gas Grenade, Pyro Grenade
  ],
  Medium: [
    { spec: 782876493, gadgets: [-2146518365, -1356235903, 1082327915] }, // Healing Beam: Defibrillator, Jump Pad, Frag Grenade
    { spec: 1886362451, gadgets: [-351094439, 1082327915, -1356235903] }, // Guardian Turret: Explosive Mine, Frag Grenade, Jump Pad
    { spec: -1652494848, gadgets: [-21077747, -1356235903, 1884976108] }, // Dematerializer: Gas Mine, Jump Pad, Goo Grenade
  ],
  Heavy: [
    { spec: -1790216799, gadgets: [534956297, -455578974, 1042541498] }, // Winch Claw: Dome Shield, C4, RPG-7
    { spec: 520836765, gadgets: [1042541498, 2124147649, 534956297] }, // Charge 'n' Slam: RPG-7, Barricade, Dome Shield
    { spec: 31490805, gadgets: [534956297, 1647891907, 1042541498] }, // Mesh Shield: Dome Shield, Pyro Mine, RPG-7
  ],
};
const ARCH_OF = Object.fromEntries(Object.entries(ARCH_KEY).map(([name, key]) => [key, name]));

// Scorecard metric ids (the objective-mode set) and cut-offs shaped like the real
// ones. Level 0 is the TOP tier. Before Season 10 the export records the tier but a
// Score of 0, as on real exports.
const SCORECARD_FROM = Date.parse('2026-03-05T00:00:00Z');
const SCORES_FROM = Date.parse('2026-03-26T10:00:00Z');
const SCORECARD_METRICS = [
  { id: 2096050391, cuts: [3500, 2100, 1100, 250], score: (d) => d.DamageDone * (1 - rf2() ** 4 * 0.06) }, // Damage
  { id: -293567368, cuts: [16, 9, 6, 2], score: (d) => d.Kills }, // Eliminations
  { id: -235639956, cuts: [4, 2.5, 1.5, 0.8], score: (d) => (d.Deaths ? d.Kills / d.Deaths : d.Kills) }, // KDR
  { id: -1113936816, cuts: [2500, 1200, 600, 150], score: (d) => d.RevivesDone * 220 + ri2(0, 1600) }, // Support
  { id: -227416787, cuts: [5000, 2500, 1200, 300], score: (d) => Math.round(d.Currency / 20) + ri2(0, 1500) }, // Objective
  { id: -521537420, cuts: [5, 3, 2, 1], score: (d) => d.RevivesDone }, // Revives
];
const QUICK_CASH_ID = 164312917;
const TDM_ID = 418401773;
// Deathmatch modes swap Objective and Revives for KillStreak and Assists (Embark's key file ids).
const DEATHMATCH_METRICS = [
  { id: 1818371758, cuts: [4200, 3000, 1800, 600], score: (d) => d.DamageDone * (1 - rng4() ** 4 * 0.06) }, // Damage
  { id: -1177173016, cuts: [22, 15, 9, 4], score: (d) => d.Kills }, // Eliminations
  { id: 1857931620, cuts: [3, 2, 1.3, 0.8], score: (d) => (d.Deaths ? d.Kills / d.Deaths : d.Kills) }, // KDR
  { id: -7232501, cuts: [900, 500, 250, 80], score: () => ri4(0, 1100) }, // Support
  { id: 2018882246, cuts: [8, 5, 3, 2], score: (d) => Math.min(d.Kills, ri4(1, 9)) }, // KillStreak
  { id: -695442701, cuts: [8, 5, 3, 1], score: () => ri4(0, 9) }, // Assists
];
// Per-round figures on the scale of real exports: 5.6 to 7.3 kills a round, 3% of rounds without
// a kill, a few rounds far above that, 330 to 350 damage per kill, 1.2 to 1.6 revives, no DBNOs, fame
// only in tournaments before Season 3. Its own stream, so the match history drawn above stays put.
const FAME_UNTIL = Date.parse('2024-06-13T00:00:00Z');
function settleCombat(rounds) {
  for (const r of rounds) {
    const d = r.Data;
    const drawn = d.Kills || 0;
    const none = rf5() < 0.03;
    const hot = rf5() < 0.04;
    const kills = none ? 0 : Math.round(drawn * (hot ? 1.1 + rf5() * 0.9 : 0.5 + rf5() * 0.28));
    // Each item keeps its share of the kills, and the main gun takes the remainder.
    const entries = Object.entries(d.KillsPerItem).sort((a, b) => a[1] - b[1]);
    const kpi = {};
    let left = kills;
    entries.forEach(([id, n], i) => {
      const take = i === entries.length - 1 ? left : Math.min(left, Math.round((n * kills) / drawn));
      if (take > 0) kpi[id] = take;
      left -= take;
    });
    d.Kills = kills;
    d.KillsPerItem = kpi;
    d.Dbnos = 0;
    d.RevivesDone = Math.round((d.RevivesDone || 0) * (hot ? 1 : 0.5));
    d.DamageDone = kills * ri5(255, 355) + ri5(1, kills ? 450 : 1100);
    if (!d.TournamentID || Date.parse(d.StartTime) >= FAME_UNTIL) d.FameAmount = 0;
  }
}

// How much a damaging item chips in on a round it scores no kill, against a kill's worth.
const CHIP = {
  1042541498: 1.1, '-455578974': 0.8, 1082327915: 0.8, '-351094439': 0.8, 1647891907: 0.9, 81925953: 0.6, 207168914: 0.6, '-21077747': 0.6,
  432758549: 0.4, '-578452692': 0.15, 1886362451: 0.7, 520836765: 0.9, '-1790216799': 0.05,
}; // RPG-7, C4, Frag, Explosive Mine, Pyro Mine, Pyro Grenade, Gas Grenade, Gas Mine, Breach Charge, Thermal Bore, Guardian Turret, Charge 'n' Slam, Winch Claw

function decorateRounds(rounds) {
  for (const r of rounds) {
    const d = r.Data;
    const arch = ARCH_OF[d.CharacterArchetype];
    const roll = rf2();
    // A gadget or specialization that scored a kill was equipped: take the build that carries it.
    const drawnBuild = BUILDS[arch][roll < 0.55 ? 0 : roll < 0.85 ? 1 : 2];
    const carries = (b, id) => String(b.spec) === id || b.gadgets.some((g) => String(g) === id);
    const tool = Object.keys(d.KillsPerItem).find((id) => !PRIMARY[arch].includes(id) && id !== '0');
    const build = tool && !carries(drawnBuild, tool) ? (BUILDS[arch].find((b) => carries(b, tool)) ?? drawnBuild) : drawnBuild;
    // One snapshot per round: about a third of the time the gun that got the kills
    // had been swapped in from reserve and is not in it, as on real exports.
    const topGun = Object.entries(d.KillsPerItem).filter(([id]) => PRIMARY[arch].includes(id)).sort((a, b) => b[1] - a[1])[0]?.[0];
    const drawnGun = drawnGuns.get(r);
    const weapon = drawnGun && chance2(0.68) ? (topGun ?? drawnGun) : pick2(PRIMARY[arch]);
    d.LoadoutItemAssetIDs = [build.spec, Number(weapon), ...build.gadgets];

    d.Abandoned = d.Disconnected && !d.RoundWon && chance2(0.8);
    if (d.Abandoned) d.PlacedAt = 0;
    else if (d.LeaderboardPosition != null) d.PlacedAt = d.LeaderboardPosition;
    else d.PlacedAt = d.RoundWon ? 1 : d.ScenarioID === QUICK_CASH_ID ? ri2(2, 3) : 2;

    const t = Date.parse(d.StartTime);
    if (t >= SCORECARD_FROM && !d.Abandoned && d.ScenarioID !== TDM_ID) {
      d.Scorecards = SCORECARD_METRICS.map((m) => {
        const score = Math.round(m.score(d) * 100) / 100;
        const level = m.cuts.findIndex((c) => score >= c);
        return { GameAssetID: m.id, Score: score, Level: level < 0 ? 4 : level };
      });
    }
    if (t >= SCORECARD_FROM && !d.Abandoned && d.ScenarioID === TDM_ID) {
      d.Scorecards = DEATHMATCH_METRICS.map((m) => {
        const score = Math.round(m.score(d) * 100) / 100;
        const level = m.cuts.findIndex((c) => score >= c);
        return { GameAssetID: m.id, Score: score, Level: level < 0 ? 4 : level };
      });
    }
    if (d.Scorecards && t < SCORES_FROM) for (const s of d.Scorecards) s.Score = 0;

    // Per-item damage: the killing items take most of it, a gadget from the loadout
    // often chips in without a kill, and the sum lands just under DamageDone, as on
    // real exports.
    const total = d.DamageDone || 0;
    if (total > 0) {
      const parts = Object.entries(d.KillsPerItem).map(([id, k]) => [id, k + 0.5]);
      if (chance3(0.45) && build.gadgets.some((id) => !d.KillsPerItem[id])) {
        const u = rf3();
        const hurts = [...build.gadgets, build.spec].filter((id) => Object.hasOwn(CHIP, id) && !d.KillsPerItem[id]);
        const chip = hurts[Math.floor(u * hurts.length)];
        if (chip != null) parts.push([String(chip), (0.12 + u * 0.25) * CHIP[chip]]);
      }
      if (chance3(0.08)) parts.push(['0', 0.03]);
      if (!parts.length) parts.push([String(weapon), 1]);
      const W = parts.reduce((s, [, w]) => s + w, 0);
      const scale = ((0.97 + rf3() * 0.03) * total) / W;
      d.DamagePerItem = Object.fromEntries(parts.map(([id, w]) => [id, Math.round(w * scale * 1000) / 1000]));
    }
  }
}

// Item mastery: one RankBucket row per item the builds and kill tables refer to,
// with a key-file row naming its track. A gun earns XP by its kills, anything else by
// the rounds it was carried in, and an item that was never equipped has next to none.
const MASTERY_STEPS = [10000, 18000, 54000, 108000, 258000, 410000, 560000, 800000, 900000];
function buildMastery(rounds) {
  const kills = {};
  const carried = {};
  for (const r of rounds) {
    for (const [id, k] of Object.entries(r.Data.KillsPerItem)) kills[id] = (kills[id] || 0) + k;
    for (const id of r.Data.LoadoutItemAssetIDs) carried[id] = (carried[id] || 0) + 1;
  }
  const guns = new Set(Object.values(PRIMARY).flat());
  const ids = new Set([
    ...Object.values(PRIMARY).flat(), ...Object.values(GADGET).flat(), ...GLOBAL_GADGET,
    ...Object.values(BUILDS).flat().flatMap((b) => [b.spec, ...b.gadgets]),
    ...SAVED_BUILDS.flatMap((b) => b.reserve),
  ].map(String));
  const rows = [];
  let i = 0;
  for (const id of ids) {
    const u = rf3();
    const earned = guns.has(id) ? (kills[id] || 0) * (112 + u * 30) : carried[id] ? carried[id] * 100 * 12 ** u : u * 60;
    // A finished track stops counting a little past its last rank.
    const xp = Math.round(earned > MASTERY_STEPS.at(-1) ? MASTERY_STEPS.at(-1) + u * 50_000 : earned);
    const bucket = String(-(900_000_000 + i++ * 7919));
    rows.push({ BucketID: bucket, XP: xp, Rank: 1 + MASTERY_STEPS.filter((s) => xp >= s).length });
    keyRows.mastery.push({ BucketID: bucket, Category: 'Item mastery', Name: WEAPONS[id]?.name ?? `Item ${id}`, GameAssetID: Number(id), Resolved: true });
  }
  return rows;
}

// Named purchase contents (`TransactionLog.Items`). A store buy costs Multibucks and
// grants one to three cosmetics; a real-money pack grants its Multibucks plus, for the
// DLC packs, an outfit set. A few names stay internal, as on real exports.
const PURCHASE_TYPES = ['WeaponSkin', 'WeaponSkin', 'WeaponCharm', 'CustomizationItem', 'CustomizationItem', 'WeaponSticker', 'Spray', 'Emoticon'];
const MULTIBUCKS_ID = -1394063900;
function purchaseItem(type = pick3(PURCHASE_TYPES)) {
  const id = ri3(-2_000_000_000, 2_000_000_000);
  const name = chance3(0.08) ? `${pick3(NAME_ADJ)}_0${ri3(1, 3)}` : `${pick3(NAME_ADJ)} ${pick3(NAME_NOUN[type])}`;
  keyRows.items.push({ GameAssetID: id, Kind: 'Item', Name: name, ItemType: type, Resolved: true });
  return { GameAssetID: id, Name: name, Amount: 1 };
}
function battlePassItem() {
  const id = ri3(1, 2_000_000_000);
  keyRows.items.push({ GameAssetID: id, Kind: 'Item', Name: 'Premium', ItemType: 'BattlePass', ItemSubType: 'Premium', Resolved: true });
  return { GameAssetID: id, Name: 'Premium', Amount: 1 };
}
const multibucks = (amount) => ({ GameAssetID: MULTIBUCKS_ID, Name: 'Multibucks', Amount: amount });

// Store purchases keep invented names. The owned cosmetics are real items (sampleItems.js),
// so the Collection page finds their pictures.
const NAME_ADJ = ['Neon', 'Velvet', 'Chrome', 'Arcade', 'Midnight', 'Solar', 'Static', 'Paper', 'Coral', 'Carbon', 'Retro', 'Glacier', 'Signal', 'Rogue', 'Pastel', 'Turbo'];
const NAME_NOUN = {
  CustomizationItem: ['Jacket', 'Visor', 'Sneakers', 'Gloves', 'Backpack', 'Beanie', 'Trousers', 'Mask', 'Headphones', 'Scarf', 'Boots', 'Cap'],
  WeaponSkin: ['Finish', 'Wrap', 'Coat', 'Pattern', 'Lacquer', 'Camo', 'Plating', 'Weave', 'Glaze', 'Etching'],
  WeaponCharm: ['Dice', 'Rubber Duck', 'Dog Tag', 'Lucky Coin', 'Keycard', 'Plush'],
  WeaponSticker: ['Stamp', 'Decal', 'Emblem'],
  PlayerCardCustomization: ['Background', 'Border', 'Badge'],
  AnimationCustomization: ['Reload', 'Inspect', 'Spin', 'Flourish'],
  Spray: ['Tag', 'Stencil', 'Mural'],
  Emoticon: ['Wave', 'Laugh', 'Salute'],
  ClansCustomization: ['Banner', 'Crest'],
};
const itemKeyRow = ([id, name, type, subType, asset, rarity, tags]) => ({
  GameAssetID: id, Kind: 'Item', Name: name, AssetName: asset, ItemType: type, ...(subType && { ItemSubType: subType }), Rarity: rarity || 'Unknown', AssetTags: tags, Resolved: true,
});
const sampleItemClass = (c) => itemClass({ itemType: c[2], subType: c[3] || null, asset: c[4], tags: c[6] });
// No item is owned before the season that added it.
const releasedAt = (c) => (SEASONS.find((season) => season.n === itemSeason(c[6])) ?? SEASONS[0]).startMs;
// What an account has from its first day: every body type and up to three launch pieces of each basic slot.
const STARTER_SLOTS = new Set(['BodyType', 'Head', 'Hair', 'Eyes', 'BodyUpper', 'BodyLower', 'Shoes', 'Hands']);
const SAVED_BUILDS = [
  { title: 'Light 1', arch: 'Light', build: 0, weapon: '199277493', reserve: ['1599997630', '-322594587', '-158222801', 780830895] },
  { title: 'Light 2', arch: 'Light', build: 1, weapon: '1599997630', reserve: ['199277493', '-657541680', '1612446258', -1360814459] },
  { title: 'Medium 1', arch: 'Medium', build: 0, weapon: '-566338044', reserve: ['473278792', '-240495033', '107797000', -862944950], selected: true },
  { title: 'Heavy 1', arch: 'Heavy', build: 0, weapon: '-676727577', reserve: ['-212966229', '1743942098', '1096645849', 1647891907] },
  { title: 'Heavy 2', arch: 'Heavy', build: 1, weapon: '1096645849', reserve: ['-160507163', '1480845770', '-676727577', 1166704846] },
];

function buildInventoryItems() {
  const rows = [];
  const byType = {};
  const add = (type, i, n, extra) => {
    const at = iso(lerp(SPAN_START, SPAN_END, (i + 0.5) / n));
    const row = { InstanceID: pseudoUuid(), Type: type, Amount: 1, HasSeen: chance2(0.1), CreatedAt: at, UpdatedAt: at, ...extra };
    rows.push(row);
    (byType[type] ||= []).push(row);
    return row;
  };
  const starters = {};
  const poses = [];
  INVENTORY_SPREAD.forEach(([type, n]) => {
    if (!NAME_NOUN[type]) return;
    const real = SAMPLE_ITEMS.filter((c) => c[2] === type);
    for (let i = 0; i < n; i++) {
      const klass = sampleItemClass(real[i]);
      const released = releasedAt(real[i]);
      const starter = released === SEASONS[0].startMs && STARTER_SLOTS.has(klass) && (klass === 'BodyType' || (starters[klass] || 0) < 3);
      if (starter) starters[klass] = (starters[klass] || 0) + 1;
      const at = iso(starter ? released : Math.max(released, lerp(SPAN_START, SPAN_END, (i + 0.5) / n)));
      ri2(-2_000_000_000, 2_000_000_000); // drawn still, so the stream stays put
      const row = add(type, i, n, { GameAssetID: real[i][0], Name: real[i][1], CreatedAt: at, UpdatedAt: at });
      if (klass === 'Emote' || klass === 'InGameEmote') poses.push(row);
    }
  });
  keyRows.items.push(...SAMPLE_ITEMS.map(itemKeyRow), ...Object.values(SAMPLE_UNIFORMS).flat().map(itemKeyRow));
  for (let s = 6; s <= 11; s++) add('BattlePass', s - 6, 6, { GameAssetID: ri2(1, 2_000_000_000), Name: `Season ${s} Battle Pass` });
  // The Multibucks amount is set from the ledger once that exists (see buildPersistence).
  [['Multibucks', 0], ['VRs', 5000], ['Show Tokens', 12]].forEach(([name, amount], i) => {
    const id = ri2(1, 2_000_000_000);
    add('Currency', i, 3, { GameAssetID: name === 'Multibucks' ? MULTIBUCKS_ID : id, Name: name, Amount: amount });
  });

  // Every weapon, gadget and specialization the saved contestants refer to.
  const gearRow = new Map();
  const gearIds = [...new Set(SAVED_BUILDS.flatMap((b) => [BUILDS[b.arch][b.build].spec, b.weapon, ...BUILDS[b.arch][b.build].gadgets, ...b.reserve]).map(String))];
  gearIds.forEach((id, i) => gearRow.set(id, add('GameItem', i, gearIds.length, { GameAssetID: Number(id), Name: WEAPONS[id]?.name ?? `Item ${id}` })));
  const archRow = Object.fromEntries(['Light', 'Medium', 'Heavy'].map((a, i) => [a, add('Archetype', i, 3, { GameAssetID: ri2(1, 2_000_000_000), Name: a })]));

  const some = (type) => pick2(byType[type]).InstanceID;
  const pose = () => pick2(poses).InstanceID;
  let selected = null;
  SAVED_BUILDS.forEach((b, i) => {
    const build = BUILDS[b.arch][b.build];
    const pack = add('ContestantPack', i, SAVED_BUILDS.length, {
      GameAssetID: ri2(1, 2_000_000_000),
      Name: 'User-managed contestant pack',
      Properties: {
        ContestantPack: {
          Title: b.title,
          ArchetypeItemID: archRow[b.arch].InstanceID,
          FirstHandItemIDs: [build.spec, b.weapon, ...build.gadgets].map((id) => gearRow.get(String(id)).InstanceID),
          ReservedItemIDs: b.reserve.map((id) => gearRow.get(String(id)).InstanceID),
          Slots: [
            { SlotName: 'IntroPose', ItemIDs: [pose()] },
            { SlotName: 'VictoryPose', ItemIDs: [pose()] },
            ...(i % 2 === 0 ? [{ SlotName: 'ObjectiveSticker', ItemIDs: [some('WeaponSticker')] }] : []),
          ],
          SprayItemID: some('Spray'),
          EmoteWheelItemIDs: [some('Emoticon'), some('Emoticon'), pose()],
        },
      },
    });
    if (b.selected) selected = pack;
  });
  add('Loadout', 0, 1, { GameAssetID: ri2(1, 2_000_000_000), Name: 'Loadout', Properties: { Loadout: { SelectedContestantPackItemID: selected.InstanceID, CosmeticNumber: 3 } } });
  return rows;
}

// --- cosmetics worn per round (`CustomizationItemAssetIDs`) ----------------
// Shaped like real exports: an outfit stays for a run of rounds on its class and never
// changes inside a tournament, a few saved outfits take most rounds, about half of what
// is owned is never worn, and two event modes dress everyone in pieces the player does
// not own.
const WORN_ALWAYS = ['BodyUpper', 'Head', 'Shoes'];
const WORN_ODDS = {
  BodyLower: 0.96, Hands: 0.8, Hair: 0.75, Eyes: 0.6, Headwear: 0.55, Facewear: 0.45, Voice: 0.3, BodyPaint: 0.28, Wrists: 0.25, TorsoUpperLeft: 0.22,
  Tattoos: 0.2, FacePaint: 0.2, Nails: 0.15, BackUpper: 0.08, FacialHair: 0.08, Earrings: 0.05, BackLowerRight: 0.04, Bandolier: 0.03, VisualEffects: 0.03,
};
const BODY_FEATURES = new Set(['Head', 'Hair', 'Eyes', 'Voice', 'BodyPaint', 'Tattoos', 'FacePaint', 'Nails', 'FacialHair']);
const BODY_TYPE_FROM = Date.parse('2024-11-20T00:00:00Z');
const VOICE_FROM = Date.parse('2025-07-25T00:00:00Z');
const OUTFIT_CHANGE = 0.16;

function dressRounds(rounds, inventory) {
  const rand = localRng(0x2026_1001);
  const def = new Map(SAMPLE_ITEMS.map((c) => [c[0], c]));
  const bySlot = {};
  for (const row of inventory) {
    const c = def.get(row.GameAssetID);
    if (!c || c[2] !== 'CustomizationItem') continue;
    (bySlot[sampleItemClass(c)] ||= []).push({ id: row.GameAssetID, instance: row.InstanceID, at: Date.parse(row.CreatedAt), appeal: rand() < 0.62 ? 0 : 1 });
  }
  // A new piece is tried on more in its first weeks.
  const pull = (it, at) => it.appeal * (1 + 6 * Math.exp((it.at - at) / (60 * DAY)));
  const choose = (slot, at) => {
    const have = (bySlot[slot] || []).filter((it) => it.at <= at);
    let roll = rand() * have.reduce((sum, it) => sum + pull(it, at), 0);
    return have.find((it) => (roll -= pull(it, at)) <= 0) ?? have[0] ?? null;
  };
  const wearable = (slot, at) => slot !== 'Voice' || at >= VOICE_FROM;
  const fresh = (at) => {
    const outfit = new Map();
    for (const slot of WORN_ALWAYS) outfit.set(slot, choose(slot, at) ?? bySlot[slot][0]);
    for (const [slot, odds] of Object.entries(WORN_ODDS)) {
      const it = wearable(slot, at) && rand() < odds ? choose(slot, at) : null;
      if (it) outfit.set(slot, it);
    }
    return outfit;
  };
  const tweak = (outfit, at) => {
    const next = new Map(outfit);
    const slots = [...WORN_ALWAYS, ...Object.keys(WORN_ODDS)];
    const clothes = ['BodyUpper', 'BodyLower', 'Shoes', 'Hands', 'Headwear'];
    for (let n = 2 + Math.floor(rand() * 3); n > 0; n--) {
      // Clothes change far more often than a face or a tattoo.
      const slot = rand() < 0.75 ? clothes[Math.floor(rand() * clothes.length)] : slots[Math.floor(rand() * slots.length)];
      const optional = Object.hasOwn(WORN_ODDS, slot);
      const it = wearable(slot, at) && (!optional || rand() < WORN_ODDS[slot]) ? choose(slot, at) : null;
      if (it) next.set(slot, it);
      else if (optional) next.delete(slot);
    }
    return next;
  };

  const bodyType = choose('BodyType', SPAN_START);
  const current = {};
  const saved = { Light: [], Medium: [], Heavy: [] };
  const lastTournament = {};
  for (const r of rounds) {
    const d = r.Data;
    const arch = ARCH_OF[d.CharacterArchetype];
    if (!arch) continue;
    const at = Date.parse(d.StartTime);
    if (!current[arch]) saved[arch].push((current[arch] = fresh(at)));
    else if (!(d.TournamentID && d.TournamentID === lastTournament[arch]) && rand() < OUTFIT_CHANGE) {
      const roll = rand();
      if (roll < 0.2 && saved[arch].length > 1) current[arch] = saved[arch][Math.floor(rand() * saved[arch].length)];
      else {
        current[arch] = roll < 0.6 ? tweak(current[arch], at) : fresh(at);
        if (roll >= 0.6 || rand() < 0.3) {
          if (saved[arch].length < 3) saved[arch].push(current[arch]);
          else saved[arch][Math.floor(rand() * 3)] = current[arch];
        }
      }
    }
    // Now and then a piece is tried on for a single round.
    let worn = current[arch];
    if (!d.TournamentID && rand() < 0.08) {
      const slot = WORN_ALWAYS.concat('BodyLower', 'Hands', 'Headwear')[Math.floor(rand() * 6)];
      const have = (bySlot[slot] || []).filter((it) => it.at <= at);
      if (have.length) worn = new Map(worn).set(slot, have[Math.floor(rand() * have.length)]);
    }
    lastTournament[arch] = d.TournamentID ?? null;
    const uniform = /HeavyHitters/.test(d.MapVariant) ? SAMPLE_UNIFORMS.heavyHitters : /CashBall/.test(d.MapVariant) ? SAMPLE_UNIFORMS.cashball : null;
    const dressed = uniform && new Set(uniform.map((c) => c[3]));
    const ids = [...worn].filter(([slot]) => !uniform || BODY_FEATURES.has(slot) || (slot === 'Shoes' && !dressed.has('Shoes'))).map(([, it]) => it.id);
    if (uniform) ids.push(...uniform.map((c) => c[0]));
    if (at >= BODY_TYPE_FROM) ids.push(bodyType.id);
    // The export lists them in no order.
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    d.CustomizationItemAssetIDs = ids;
  }

  // Each saved pack holds one of its class's saved outfits and the pack's emote. The last
  // pack lists the emote alone, as some real packs do, and one outfit includes a watch.
  const emote = inventory.find((row) => def.get(row.GameAssetID)?.[4].startsWith('DA_Emote_'))?.InstanceID;
  const watch = bySlot.Watch?.[0]?.instance;
  const packs = inventory.filter((row) => row.Properties?.ContestantPack);
  const used = { Light: 0, Medium: 0, Heavy: 0 };
  packs.forEach((row, i) => {
    const arch = row.Properties.ContestantPack.Title.split(' ')[0];
    const outfit = i === packs.length - 1 ? null : saved[arch][used[arch]++ % saved[arch].length];
    row.Properties.ContestantPack.CustomizationItemIDs = [...(outfit ? [...outfit.values()].map((it) => it.instance) : []), ...(outfit && i === 0 && watch ? [watch] : []), ...(emote ? [emote] : [])];
  });
}

// --- weapon cosmetics per contestant, favourite skins, the player card ------
const FIRST_SEASON = {
  '93R': 2, 'KS-23': 2, FAMAS: 2, Dematerializer: 2, Gateway: 2, 'Data Reshaper': 2, 'Anti-Gravity Cube': 2,
  'Recurve Bow': 3, Spear: 3, 'Thermal Bore': 3, 'Dual Blades': 3, 'Winch Claw': 3,
  'Proximity Sensor': 4, 'M26 Matter': 4, 'PIKE-556': 4, '.50 Akimbo': 4,
  'Cerberus 12GA': 5, 'Gravity Vortex': 5, 'SHAK-50': 5, Lockbolt: 5,
  'ARN-220': 6, Nullifier: 6, 'CB-01 Repeater': 6, 'M134 Minigun': 6,
  'Breach Drill': 7, 'H+ Infuser': 7, 'Healing Emitter': 7, 'BFR Titan': 8, P90: 8, 'Chimera-XB': 10, Shockwave: 10,
};
const SEASON_11 = SEASONS.find((season) => season.n === 11)?.startMs ?? SPAN_START;
const CARD_SAVED = Date.parse('2026-05-02T19:14:00Z');
const CARD_PICKS = { Background: 'Dugout Design', Border: 'Crime Scene', BadgeOne: 'Heavy Duty', BadgeTwo: 'Cash Flow Manager' };
const BADGE_LEVELS = [1, 1, 1, 2, 2, 3, 4, 5, 7, 10, 16, 19];
function dressWeapons(inventory, buckets) {
  const rand = localRng(0x2026_1003);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const def = new Map(SAMPLE_ITEMS.map((c) => [c[0], c]));
  const fresh = (block, i) => `5a3c7100-0000-4000-8000-000000000${block}${String(i).padStart(2, '0')}`;

  const have = new Set(inventory.filter((row) => row.Type === 'GameItem').map((row) => String(row.GameAssetID)));
  Object.entries(WEAPONS)
    .filter(([id, w]) => ['Weapon', 'Gadget', 'Spec'].includes(w.type) && w.archetype !== 'Event' && !have.has(id))
    .forEach(([id, w], i) => {
      const from = Math.max(SPAN_START, SEASONS.find((season) => season.n === (FIRST_SEASON[w.name] ?? 1)).startMs);
      const at = iso(lerp(from, Math.min(from + 240 * DAY, SPAN_END), rand()));
      inventory.push({ GameAssetID: Number(id), Name: w.name, InstanceID: fresh(2, i), Amount: 1, HasSeen: true, Type: 'GameItem', CreatedAt: at, UpdatedAt: at });
    });

  const by = { WeaponSkin: new Map(), Sight: new Map(), Anim: new Map(), WeaponCharm: [], WeaponSticker: [] };
  const cards = { CardBackground: [], CardBorder: [], CardBadge: [] };
  for (const row of inventory) {
    const c = def.get(row.GameAssetID);
    if (!c) continue;
    const klass = sampleItemClass(c);
    const group = klass.startsWith('Anim') ? 'Anim' : klass;
    if (Object.hasOwn(cards, klass)) cards[klass].push(row);
    else if (Array.isArray(by[group])) by[group].push(row);
    else if (by[group]) {
      const weapon = normName(itemEquipment(c[4]));
      if (weapon) by[group].set(weapon, [...(by[group].get(weapon) ?? []), row]);
    }
  }
  const usual = { WeaponCharm: pick(by.WeaponCharm), WeaponSticker: pick(by.WeaponSticker) };
  const maybe = (type, p) => (rand() < p && by[type].length ? [(rand() < 0.7 ? usual[type] : pick(by[type])).InstanceID] : []);

  const packs = inventory.filter((row) => row.Properties?.ContestantPack);
  const selected = packs.find((row) => row.Properties.ContestantPack.Title === 'Medium 1');
  const gear = inventory.filter((row) => row.Type === 'GameItem' && Object.hasOwn(WEAPONS, row.GameAssetID));
  const marks = {};
  packs.forEach((row, n) => {
    const pack = row.Properties.ContestantPack;
    const arch = pack.Title.split(' ')[0];
    const carried = new Set([...pack.FirstHandItemIDs, ...pack.ReservedItemIDs]);
    const marking = n === 0 || row === selected;
    const mark = { itemToRandomizeSkin: [], itemToFavoriteSkins: {} };
    pack.ItemAttachments = [];
    for (const item of gear) {
      const w = WEAPONS[item.GameAssetID];
      if (w.archetype !== arch && w.archetype !== 'Global') continue;
      const weapon = normName(w.name);
      const all = by.WeaponSkin.get(weapon) ?? [];
      const skins = all.filter((skin) => skin.Name !== 'Standard Issue');
      const on = carried.has(item.InstanceID);
      if (!skins.length || rand() > (w.type === 'Spec' ? 0.3 : on ? 0.95 : 0.8)) continue;
      const favourite = marking && w.type === 'Weapon' && skins.length >= 2 && rand() < (on ? 0.9 : 0.12) ? skins.filter(() => rand() < 0.6).slice(0, 6) : [];
      if (favourite.length >= 2) mark.itemToFavoriteSkins[item.GameAssetID] = { favoriteSkins: favourite.map((skin) => skin.GameAssetID) };
      const skin = favourite.length >= 2 ? pick(favourite) : rand() < 0.02 ? (all.find((s) => s.Name === 'Standard Issue') ?? pick(skins)) : pick(skins);
      pack.ItemAttachments.push({
        ItemID: item.InstanceID,
        AttachedItemIDs: [
          skin.InstanceID,
          ...maybe('WeaponCharm', w.type === 'Weapon' ? 0.3 : 0.08),
          ...maybe('WeaponSticker', 0.35),
          ...(by.Sight.get(weapon)?.length && rand() < 0.7 ? [pick(by.Sight.get(weapon)).InstanceID] : []),
          ...(by.Anim.get(weapon) ?? []).filter(() => rand() < 0.75).map((anim) => anim.InstanceID),
        ],
      });
    }
    if (marking) marks[row.InstanceID] = mark;
  });
  const main = selected && gear.find((item) => item.InstanceID === selected.Properties.ContestantPack.FirstHandItemIDs[1]);
  if (main && marks[selected.InstanceID].itemToFavoriteSkins[main.GameAssetID]) marks[selected.InstanceID].itemToRandomizeSkin.push(main.GameAssetID);
  // The bucket still holds the lists of two deleted contestants.
  [['SHAK50', fresh(4, 1)], ['ARN220', fresh(4, 2)]].forEach(([weapon, id]) => {
    const item = gear.find((g) => normName(WEAPONS[g.GameAssetID].name) === weapon);
    if (!item || !by.WeaponSkin.get(weapon)) return;
    marks[id] = { itemToRandomizeSkin: [item.GameAssetID], itemToFavoriteSkins: { [item.GameAssetID]: { favoriteSkins: by.WeaponSkin.get(weapon).filter((skin) => skin.Name !== 'Standard Issue').slice(-3).map((skin) => skin.GameAssetID) } } };
  });
  buckets.push({ ObjectKey: 'UI.Persistence.Customization.ItemSkinRandomizers', Value: JSON.stringify({ version: 1, packIdsWithRandomizers: marks }), CreatedAt: '2025-07-02T18:20:00.000Z', UpdatedAt: iso(SPAN_END - 9 * DAY) });

  for (const row of [...cards.CardBackground, ...cards.CardBorder]) row.Properties = { PlayerCardCustomization: { Level: 0, Progress: 0 } };
  for (const row of cards.CardBadge) row.Properties = { PlayerCardCustomization: { Level: rand() < 0.12 ? 0 : pick(BADGE_LEVELS), Progress: 0 } };
  const slot = (name, rows, taken = []) => {
    const pool = rows.filter((row) => Date.parse(row.CreatedAt) < CARD_SAVED && !taken.includes(row));
    return pool.find((row) => row.Name === CARD_PICKS[name]) ?? pool[0] ?? null;
  };
  const badgeOne = slot('BadgeOne', cards.CardBadge);
  const badgeTwo = slot('BadgeTwo', cards.CardBadge, [badgeOne]);
  for (const [row, level] of [[badgeOne, 3], [badgeTwo, 5], [cards.CardBadge.findLast((row) => row !== badgeOne && row !== badgeTwo), 0]]) if (row) row.Properties.PlayerCardCustomization.Level = level;
  const placed = { Background: slot('Background', cards.CardBackground), Border: slot('Border', cards.CardBorder), BadgeOne: badgeOne, BadgeTwo: badgeTwo, BadgeThree: null };
  inventory.push({
    GameAssetID: 4334566053, Name: 'Player card', InstanceID: fresh(3, 0), Amount: 1, HasSeen: true, Type: 'PlayerCard',
    Properties: { PlayerCard: { Slots: Object.entries(placed).map(([SlotName, row]) => ({ SlotName, ItemID: row?.InstanceID ?? '' })) } },
    CreatedAt: iso(SEASONS[0].startMs), UpdatedAt: iso(CARD_SAVED),
  });
  packs.forEach((row, i) => {
    const at = iso(SEASON_11 + (1 + i * 6) * DAY + i * 37 * 60_000);
    inventory.push({ GameAssetID: 1292032845, Name: 'PlayerCard', InstanceID: fresh(3, i + 1), Amount: 1, HasSeen: true, Type: 'PersistentEntity', Properties: { PersistentEntity: { Version: 0 } }, CreatedAt: at, UpdatedAt: at });
    row.Properties.ContestantPack.Slots.push({ SlotName: 'PlayerCard', ItemIDs: [fresh(3, i + 1)] });
  });
  // A migration re-stamped CreatedAt on the older wardrobe outfits.
  const restamp = Date.parse('2025-08-19T18:05:00Z');
  for (let i = 0; i < Math.max(7, packs.length); i++) {
    const made = lerp(SEASONS.find((season) => season.n === 6).startMs, SPAN_END, rand());
    inventory.push({ GameAssetID: 762419378, Name: 'CustomizationAppearancePack', InstanceID: fresh(5, i), Amount: 1, HasSeen: true, Type: 'PersistentEntity', Properties: { PersistentEntity: { Version: 0 } }, CreatedAt: iso(Math.max(made, restamp)), UpdatedAt: iso(made) });
  }
  packs.forEach((row, i) => {
    row.Properties.ContestantPack.Slots.push({ SlotName: 'OutfitPack', ItemIDs: [fresh(5, i)] });
    const targets = [fresh(3, i + 1), fresh(5, i)].map((id) => Date.parse(inventory.find((r) => r.InstanceID === id).CreatedAt));
    row.UpdatedAt = iso(Math.max(Date.parse(row.UpdatedAt), ...targets));
  });
}

// Clubs the player was in before the current one.
const FORMER_CLUBS = [
  { ClanName: 'PAPER LANTERNS', ClanTag: 'PLN', joined: '2024-06-20T18:05:11Z', days: 108, quests: 14, partyUps: 4 },
  { ClanName: 'SECOND WIND', ClanTag: 'SWND', joined: '2024-11-16T20:31:47Z', days: 15, quests: 3, partyUps: 1 },
];
const CLUB = { ClanName: 'THE OG CLUB', ClanTag: 'OG' };

// Friends, blocks and club: dates and directions only, as in a real export. A friendship is
// two rows, the request and its answer, and a club stint is a join, its party-ups and one
// ClanStats row running from its first quest to its last.
function buildSocial() {
  const byCreated = (a, b) => a.CreatedAt.localeCompare(b.CreatedAt);
  const spread = (n, from, make) => Array.from({ length: n }, (_, i) => make(iso(lerp(from, SPAN_END, (i + rf2()) / n)))).sort(byCreated);
  const clubJoined = Date.parse('2025-02-01T19:20:00Z');
  const friends = [];
  for (let i = 0; i < 32; i++) {
    const at = lerp(ACCOUNT_CREATED + 30 * DAY, SPAN_END, (i + rf2()) / 32);
    const asked = chance2(0.4);
    const wait = 2000 * 10 ** (rf2() * 4.4) * (chance2(0.15) ? 30 : 1);
    friends.push({ Direction: asked ? 'sent' : 'received', CreatedAt: iso(at) }, { Direction: asked ? 'received' : 'sent', CreatedAt: iso(Math.min(at + wait, SPAN_END)) });
  }
  const blocked = spread(7, SPAN_START, (at) => ({ CreatedAt: at }));
  const partyUps = spread(6, clubJoined, (at) => ({ CreatedAt: at })).map((r) => r.CreatedAt);

  const club = localRng(0xc1ab);
  const stats = [];
  const timeline = [];
  const stint = ({ ClanName, ClanTag }, joined, quests, until, events) => {
    stats.push({ QuestsCompleted: quests, CreatedAt: iso(joined + (6 + club() * 10) * HOUR), UpdatedAt: iso(until) });
    timeline.push({ ClanName, ClanTag, PayloadType: 'TYPE_MEMBER_JOINED', CreatedAt: iso(joined) });
    for (const at of events) timeline.push({ ClanName, ClanTag, PayloadType: 'TYPE_PARTY_UP', CreatedAt: at });
  };
  for (const c of FORMER_CLUBS) {
    const joined = Date.parse(c.joined);
    const until = joined + (c.days - club() * 3) * DAY;
    stint(c, joined, c.quests, until, Array.from({ length: c.partyUps }, () => iso(lerp(joined + DAY, until, club()))));
  }
  stint(CLUB, clubJoined, 41, SPAN_END - 3 * DAY, [...partyUps, ...CLUB_PARTY_UPS]);
  return {
    Friend: friends.sort(byCreated),
    BlockedPlayer: blocked,
    ClanMembership: [{ ...CLUB, Role: 'member', LastLoggedInAt: iso(SPAN_END - 2 * HOUR), CreatedAt: iso(clubJoined) }],
    ClanStats: stats,
    ClanTimelineMessage: timeline.sort(byCreated),
  };
}

// In-game inbox. The wording is invented for the preview.
const INBOX = [
  ['Season 11 is live', 'A new season has started. Your seasonal progress has been reset and a fresh Battle Pass is waiting in the store.\n\nGood luck out there, contestant.', null, 11],
  ['A small thank-you', 'Matchmaking was unavailable for a few hours last weekend. We have added a gift to your account for the trouble.', 'SAMPLECOMP0001', null],
  ['Twitch Drops are back', 'Link your account and watch any participating stream to earn this month’s cosmetics.', null, null],
  ['Your club finished a quest', 'THE OG CLUB completed a weekly club quest. Rewards have been shared with every active member.', 'SAMPLECOMP0002', null],
  ['World Tour: new stop', 'A new sponsor has taken over World Tour for the next three weeks, with its own rules and rewards.', null, null],
  ['Season 10 rewards', 'Thanks for playing Season 10. Your ranked rewards have been delivered to your inventory.', 'SAMPLECOMP0003', 10, true],
  [null, null, null, null],
  ['Limited-time mode returns', 'Heavy Hitters is back for one week only. Knock your opponents out of the arena to score.', null, null],
  [null, null, null, null],
  ['Patch notes', 'Balance changes for several weapons and gadgets went live today. The full notes are on the website.', null, null],
  ['Welcome back', 'It has been a while. Here is a little something to get you started again.', 'SAMPLECOMP0004', null],
  ['Season 9 is live', 'A new season has started, with a new map and a new limited-time event.', null, 9],
];
function buildInbox() {
  const at = (i, n) => iso(lerp(Date.parse('2025-12-10T16:00:00Z'), SPAN_END, (n - i - 0.5) / n));
  // A season message goes out the day its season launches, or the day after it ends.
  const seasonStart = (n) => SEASON_IDS[n - 1][0];
  const seasonAt = (n, ended) => iso((ended ? seasonStart(n + 1) + DAY : seasonStart(n)) + 17 * HOUR + n * 431_000);
  const launches = { SampleSeason11LaunchMessage: 11, SampleSeason10LaunchMessage: 10 };
  const finals = INBOX.map(([Title, Body, comp, season, ended], i) => ({
    Game: 'THE FINALS',
    ...(Title ? { Title, Body } : {}),
    MessageID: ri2(1, 900_000_000),
    MessageName: Title ? 'SharedParameterizedMessageRef' : 'SampleStoreRefreshMessage',
    Payload: { ...(comp ? { compensationId: comp } : {}), ...(season ? { season } : {}) },
    Seen: i > 1,
    Favorited: i === 5,
    CreatedAt: season ? seasonAt(season, ended) : at(i, INBOX.length),
  }));
  const arc = Array.from({ length: 4 }, (_, i) => ({ Game: 'ARC Raiders', Title: 'Expedition rewards ready', Body: 'Your rewards from the last expedition can be collected.', MessageID: ri2(1, 900_000_000), MessageName: 'SharedParameterizedMessageRef', Payload: {}, Seen: true, Favorited: false, CreatedAt: at(i, 4) }));
  const notices = ['SampleSeason11LaunchMessage', 'SamplePrivacyUpdateMessage', 'SampleEventPassMessage', 'SampleSeason10LaunchMessage', 'SampleCrossPromotionMessage'].map((MessageName, i) => {
    const published = launches[MessageName] ? seasonStart(launches[MessageName]) + 15 * HOUR + launches[MessageName] * 173_000 : Date.parse(at(i, 5));
    return { Game: i === 4 ? 'ARC Raiders' : 'THE FINALS', MessageID: ri2(1, 900_000_000), MessageName, PublishedAt: iso(published), ExpiredAt: iso(published + 21 * DAY), Seen: i !== 0, Deleted: i === 3, Favorited: false, CreatedAt: iso(published + HOUR) };
  });
  return { InboxMessage: [...finals, ...arc], InboxGlobalMessage: notices };
}

// Party-ups in the current club, beside the ones buildSocial spreads.
const CLUB_PARTY_UPS = ['2025-02-14T20:11:03Z', '2025-03-02T19:40:51Z', '2025-05-18T21:05:12Z', '2025-08-09T18:22:40Z', '2025-11-22T20:48:09Z', '2026-02-07T19:15:33Z', '2026-05-30T21:32:26Z'];

// From Season 9 a ranked revert is followed by a Wednesday inbox notice whose
// rsChange equals it, as on real exports. The newest five, so the inbox stays varied.
function rankNotices(rankUpdates) {
  const from = Date.parse('2025-12-10T00:00:00Z');
  return rankUpdates
    .filter((r) => r.UpdateType === 'REVERT' && Date.parse(r.CreatedAt) >= from)
    .map((r) => {
      const at = new Date(Date.parse(r.CreatedAt));
      at.setUTCDate(at.getUTCDate() + ((3 - at.getUTCDay() + 7) % 7));
      at.setUTCHours(13, 6, 11, 0);
      return { r, at: at.getTime() };
    })
    .filter((n) => n.at < EXPORTED_AT)
    .sort((a, b) => a.at - b.at || a.r.CreatedAt.localeCompare(b.r.CreatedAt))
    .slice(-5)
    .map(({ r, at }, i) => ({
      Game: 'THE FINALS', MessageID: 7_100_000 + i, MessageName: 'DiscoveryRankUpdateMessage',
      Payload: { reason: 'DISCOVERY_RANK_UPDATE_REASON_WEEKLY_SUMMARY', rsChange: String(Math.round((r.MuAfter - r.MuBefore) * 10)) },
      Seen: true, Favorited: false, CreatedAt: iso(at + i * 69_000),
    }));
}

// Inbox messages that carry no title: a gift, reported-player bans, friend requests
// and a season welcome. Gift items get key rows, as a real export's key file would.
function untitledInbox() {
  const gifts = [
    { GameAssetID: 1999000001, Kind: 'Item', Name: 'Signal Crest', ItemType: 'WeaponSticker', Resolved: true },
    { GameAssetID: 1999000002, Kind: 'Item', Name: 'Chrome Charm', ItemType: 'WeaponCharm', Resolved: true },
    { GameAssetID: 1999000003, Kind: 'Item', Name: 'Neon Guard', ItemType: 'WeaponSkin', Resolved: true },
    { GameAssetID: 1999000004, Kind: 'Item', Name: 'Premium', ItemType: 'BattlePass', ItemSubType: 'Premium', Resolved: true },
  ];
  keyRows.items.push(...gifts);
  const msg = (id, MessageName, CreatedAt, Payload = {}) => ({ Game: 'THE FINALS', MessageID: id, MessageName, Payload, Seen: true, Favorited: false, CreatedAt });
  return [
    msg(7_200_001, 'DiscoveryGiftMessage', '2025-12-23T17:51:36Z', { receivedGameAssetIds: [...gifts.map((g) => String(g.GameAssetID)), String(MULTIBUCKS_ID)] }),
    msg(7_200_002, 'ReportedUserBannedMessage', '2025-12-29T07:12:26Z'),
    msg(7_200_003, 'ReportedUserBannedMessage', '2026-01-22T07:41:03Z'),
    msg(7_200_004, 'ReportedUserBannedMessage', '2026-04-07T08:05:47Z'),
    msg(7_200_005, 'SharedFriendRequestMessage', '2026-02-11T18:40:05Z'),
    msg(7_200_006, 'SharedFriendRequestMessage', '2026-06-20T20:03:44Z'),
    msg(7_200_007, 'DiscoveryRankWelcomeMessage', '2026-07-10T19:26:41Z', { season: 11 }),
  ];
}

// Console token claims for the linked Xbox account ("Demo Gamer"), which this
// otherwise-PC player signs in on now and then.
function buildConsoleClaims() {
  const privileges = [197, 198, 203, 205, 207, 208, 209, 211, 214, 219, 220, 224, 235, 245, 247, 249, 252, 254, 255].join(' ');
  const from = Date.parse('2025-10-04T18:00:00Z');
  const claims = Array.from({ length: 36 }, (_, i) => ({
    logtime: iso(lerp(from, SPAN_END, (i + rf2()) / 36)), tenancy: 'discovery-live', xbox_id: 'xuid_000',
    gamer_tag_classic: 'Demo Gamer', gamer_tag_modern: 'Demo Gamer', gamer_tag_modern_suffix: '1234', age_group: 'Adult', country: 'GB',
    privileges, device_id: 'F4000SAMPLE00001', device_type: 'Scarlett', device_pairwise_id: 'SAMPLEPAIRWISE0000000000000000000000001',
  }));
  const licences = Array.from({ length: 6 }, (_, i) => ({ logtime: iso(lerp(from, SPAN_END, (i + 0.5) / 6)), tenancy: null, third_party_account_id: 'xuid_000', third_party_provider_name: 'xbox', license_id: 'samplelicence0000000000000000001', is_restricted: false, third_party_device_platform_name: 'microsoft_scarlett', third_party_device_platform_id: 1 }));
  return { XboxTokenClaims3: claims, ThirdPartyLicenseAssociationUpdated: licences };
}

// 20 base-32 characters, like Embark's RoundIDs, led by the index so none repeat.
const sampleRoundId = (i) => {
  let h = Math.imul(i + 1, 0x9e3779b1) >>> 0;
  let s = i.toString(32).padStart(4, '0');
  while (s.length < 20) {
    s += '0123456789abcdefghijklmnopqrstuv'[h & 31];
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  }
  return s;
};

// Battle-pass tracks (ids from BATTLE_PASS_TRACKS in gameMeta.js). Rank is levels unlocked
// plus one and XP stops at the season's total: Season 1 part done, Season 4 one level short,
// Season 7 short of its bonus pages, Season 11 still running, one event pass part done.
const BATTLE_PASS_ROWS = [
  ['-1015630235', 65, 579100], ['-852579741', 107, 1184000], ['-1998502183', 107, 1520000], ['1676196360', 106, 1861250],
  ['-1248342082', 107, 1854000], ['14840406', 107, 1729000], ['-1765989502', 97, 1125480], ['-522336115', 107, 1729000],
  ['-1547834953', 107, 1729000], ['-132703550', 107, 1729000], ['1027926733', 72, 711200],
  ['216970600', 17, 340000], ['-918913416', 12, 70500],
].map(([BucketID, Rank, XP]) => ({ BucketID, XP, Rank }));

// The sticker an Embark staff tool set to 1 (see buildAudit).
const STAFF_GRANT = { GameAssetID: 1999000011, Name: 'Turbo Emblem', ItemType: 'WeaponSticker' };

// The latest World Tour tournament trades its time slot with the last one the player won on the
// same scenario, so the history ends on a run of won rounds.
function endOnAWin(rounds) {
  const tours = new Map();
  for (const r of rounds) {
    if (!SAMPLE_WT_IDS.has(r.Data.ScenarioID)) continue;
    if (!tours.has(r.Data.TournamentID)) tours.set(r.Data.TournamentID, []);
    tours.get(r.Data.TournamentID).push(r);
  }
  const list = [...tours.values()];
  const last = list.at(-1);
  const won = list.findLast((t) => t.at(-1).Data.TournamentWon && t[0].Data.ScenarioID === last[0].Data.ScenarioID);
  if (!won || won === last) return;
  const move = (t, by) => {
    for (const r of t) {
      r.CreatedAt = iso(Date.parse(r.Data.StartTime) + by);
      Object.assign(r.Data, { StartTime: r.CreatedAt, EndTime: iso(Date.parse(r.Data.EndTime) + by) });
    }
  };
  const by = Date.parse(last[0].Data.StartTime) - Date.parse(won[0].Data.StartTime);
  move(won, by);
  move(last, -by);
  rounds.sort((a, b) => Date.parse(a.Data.StartTime) - Date.parse(b.Data.StartTime));
}

// --- identity / linked accounts / restriction ----------------------------
function buildPersistence() {
  // Generate the match history ONCE and derive the lifetime summary from it, so
  // the RoundStatSummary buckets (career headline + the ranked/casual/other note)
  // stay consistent with the actual rounds the dashboard shows.
  const rounds = buildRounds();
  settleCombat(rounds);
  decorateRounds(rounds);
  endOnAWin(rounds);
  rounds.forEach((r, i) => (r.RoundID = sampleRoundId(i)));
  previewRounds = pickPreviewRounds(rounds);
  playedRounds = rounds;
  const live = rounds.filter((r) => !previewRounds.includes(r));
  surveyRound = live.filter((r) => !r.Data.TournamentID && r.Data.StartTime < '2026-08-01').at(-1) ?? null;
  // The World Tour round the player walked out of, which earned the matchmaking sanction.
  const abandoned = live.find((r) => SAMPLE_WT_IDS.has(r.Data.ScenarioID) && r.Data.Tier === 2 && r.Data.LeaderboardPosition > 2 && r.Data.StartTime >= '2025-11-01');
  Object.assign(abandoned.Data, { Disconnected: true, Abandoned: true, PlacedAt: 0 });
  const sanctionedAt = iso(Date.parse(abandoned.Data.StartTime) + 247_000);
  const sponsors = buildSponsorRecords(live);
  const rankUpdates = buildRankUpdates(rounds);
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
    //   2. A temporary restriction that has since expired. (Matchmaking cooldowns
    //      are sanctions, not restrictions: see the Sanction inventory row.)
    Restriction: [
      { Reason: 'Cheating', StartsAt: iso(Date.parse('2024-11-02T08:15:00Z')), CreatedAt: iso(Date.parse('2024-11-02T08:15:00Z')), CancelReason: 'Incorrect restriction', CancelledAt: iso(Date.parse('2024-11-09T14:20:00Z')) },
      { Reason: 'Exploiting', StartsAt: iso(Date.parse('2025-04-18T19:30:00Z')), CreatedAt: iso(Date.parse('2025-04-18T19:30:00Z')), EndsAt: iso(Date.parse('2025-04-21T19:30:00Z')) },
    ],
    ThirdPartyUser: [
      { ThirdPartyProviderID: 'steam', ThirdPartyUserID: '76561198000000000', LastSeenAccountName: 'SamplePlayer', Enabled: true, CreatedAt: iso(ACCOUNT_CREATED) },
      { ThirdPartyProviderID: 'xbox', ThirdPartyUserID: 'xuid_000', LastSeenAccountName: 'Demo Gamer#1234', Enabled: true, CreatedAt: iso(ACCOUNT_CREATED + 40 * DAY) },
      { ThirdPartyProviderID: 'twitch', ThirdPartyUserID: '123456789', LastSeenAccountName: '123456789#demostreamer', Enabled: true, CreatedAt: iso(ACCOUNT_CREATED + 120 * DAY) },
      { ThirdPartyProviderID: 'discord', ThirdPartyUserID: 'disc_000', LastSeenAccountName: 'sampleplayer#0', Enabled: true, CreatedAt: iso(ACCOUNT_CREATED + 5 * DAY) },
    ],
    InventoryItem: buildInventoryItems(),
    BucketObject: [...buildRatingBuckets(live, rankUpdates), ...sponsors.rows],
    RankUpdate: rankUpdates,
    RoundStatSummary: [...buildSummary(live, sponsors), ...previewSummary(previewRounds)],
    RoundStat: rounds,
    UserLogin: buildUserLogins(rounds),
    // The BucketID'd row is the 2026-09+ shape: that id is the "Career rank" track in Embark's key file.
    RankBucket: [{ XP: 184500, Rank: 'Diamond' }, { XP: 92000, Rank: 'Platinum' }, { BucketID: '393268067', XP: 4125000, Rank: 62 }, ...buildMastery(rounds), ...BATTLE_PASS_ROWS],
    TransactionLog: buildTransactions(),
    HardCurrencyLog: buildLedger(),
    SteamDLC: buildSteamDlc(),
    ...buildSocial(),
    ...buildInbox(),
  };
  // Twelve values were drawn here for rows the sample no longer carries: drawn still, so the stream stays put.
  for (let i = 0; i < 12; i++) rf();
  nameStorePurchases(byType.TransactionLog, byType.HardCurrencyLog);
  const closing = byType.HardCurrencyLog.at(-1);
  Object.assign(byType.InventoryItem.find((r) => r.GameAssetID === MULTIBUCKS_ID), { Amount: closing.NewUserTotalBalance, UpdatedAt: closing.CreatedAt });
  dressRounds(rounds, byType.InventoryItem);
  const sightDate = localRng(0x2026_1002);
  SAMPLE_ITEMS.filter((c) => c[2] === 'WeaponAttachment').forEach((c, i) => {
    const at = iso(Math.max(releasedAt(c), lerp(SPAN_START, SPAN_END, sightDate())));
    byType.InventoryItem.push({ GameAssetID: c[0], Name: c[1], InstanceID: `5a3c7100-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, Amount: 1, HasSeen: false, Type: c[2], CreatedAt: at, UpdatedAt: at });
  });
  dressWeapons(byType.InventoryItem, byType.BucketObject);
  // Added after the literal so no random stream above moves.
  byType.InventoryItem.push({
    GameAssetID: 4334566052, Name: 'Sanction', InstanceID: '5a3c7100-0000-4000-8000-000000000001', Amount: 1, HasSeen: true, Type: 'Sanction',
    Properties: { Sanction: { Type: 'tournament_abandon', Tier: 1, TimeOfSanction: sanctionedAt, DurationSeconds: 600 } },
    CreatedAt: '2025-08-21T10:37:26Z', UpdatedAt: sanctionedAt,
  });
  // Granted by hand through Embark's staff tool (see buildAudit).
  byType.InventoryItem.push({ GameAssetID: STAFF_GRANT.GameAssetID, Name: STAFF_GRANT.Name, InstanceID: '5a3c7100-0000-4000-8000-000000000002', Amount: 1, HasSeen: true, Type: STAFF_GRANT.ItemType, CreatedAt: '2024-04-02T10:21:44.208Z', UpdatedAt: '2024-04-02T10:21:44.208Z' });
  keyRows.items.push({ GameAssetID: STAFF_GRANT.GameAssetID, Kind: 'Item', Name: STAFF_GRANT.Name, ItemType: STAFF_GRANT.ItemType, Resolved: true });
  byType.ClanInvite = [{ ClanName: 'THE OG CLUB', ClanTag: 'OG', Direction: 'sent', CreatedAt: '2025-06-14T19:02:00Z' }];
  byType.InboxMessage.push(...rankNotices(byType.RankUpdate), ...untitledInbox());
  const counts = Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // gamePrefixed: the sample stands for an export in the 2026-09 format.
  return { byType, counts, total, badLines: 0, gamePrefixed: true };
}

// Backend sign-ins (persistence `UserLogin`) — the account system's token
// grants. Interactive `authorization_code` logins are sparse; `client_credentials`
// re-auths cluster around play days. IPs stay in the London example block so the
// offline GeoIP resolves everything to GB (the account country) and the
// Countries stat stays green.
const CLIENT_FROM = Date.parse('2025-02-07T00:00:00Z');
const ARC_FROM = Date.parse('2025-10-30T00:00:00Z');
// Sign-ins name their client from CLIENT_FROM on, and ARC Raiders from its launch.
const client = (ms, game) => (ms < CLIENT_FROM ? {} : { Game: game === 'ARC Raiders' && ms < ARC_FROM ? 'THE FINALS' : game });
function buildUserLogins(rounds) {
  const out = [];
  for (let t = ACCOUNT_CREATED; t <= SPAN_END; t += ri(11, 18) * DAY) {
    const ms = t + ri(0, 12) * 3_600_000;
    out.push({ CreatedAt: iso(ms), GrantType: 'authorization_code', IPAddress: IPS[ri(0, IPS.length - 1)], ...client(ms, chance2(0.3) ? 'Embark account' : 'THE FINALS') });
  }
  rounds.forEach((r, i) => {
    if (i % 5 !== 0) return;
    const start = Date.parse(r.CreatedAt);
    if (!Number.isFinite(start)) return;
    const ms = start - ri(5, 40) * 60_000;
    out.push({ CreatedAt: iso(ms), GrantType: 'client_credentials', IPAddress: IPS[ri(0, IPS.length - 1)], ...client(ms, chance2(0.05) ? 'ARC Raiders' : 'THE FINALS') });
  });
  return out.sort((a, b) => a.CreatedAt.localeCompare(b.CreatedAt));
}

// --- anti-cheat / sessions ------------------------------------------------
// One EOS archive per product, told apart by LinkedAccounts, as real exports ship them.
const EOS_TF = { productId: 'b5adc328432e4883a396eba3d9c05133', productUserId: '0002a1c0e6b54f0d9a1e3c5b7d9f1a2b' };
const EOS_ARC = { productId: '9e8b37541e614575b4de303d2c2e44cf', productUserId: '0002e7f1a3c54b6d8e0f2a4c6e8a0b1c' };
function buildEosAnticheat() {
  const sessions = [];
  const BUILDS = ['2024-03-12T09:00:00Z', '2024-09-26T09:00:00Z', '2025-06-12T09:00:00Z', '2026-03-26T09:00:00Z'];
  for (let i = 0; i < 90; i++) {
    const start = lerp(Date.parse('2025-08-18T00:00:00Z'), SPAN_END, (i + rf() * 0.6) / 90);
    sessions.push({
      timeStart: iso(start), timeEnd: iso(start + ri(15, 24) * 60_000),
      eacClient: { OperatingSystem: 'Windows 11', ClientIP: pick(IPS) },
      gameClient: { ClientBuildTime: pick(BUILDS) },
    });
  }
  // ARC Raiders from its launch, on fixed times so no random stream moves.
  const arc = [];
  for (let i = 0; i < 16; i++) {
    const start = Date.parse('2025-10-30T18:00:00Z') + i * 11 * DAY + (i % 3) * 3_600_000;
    arc.push({
      timeStart: iso(start), timeEnd: iso(start + (40 + (i % 4) * 15) * 60_000),
      eacClient: { OperatingSystem: 'Windows 11', ClientIP: IPS[i % IPS.length] },
      gameClient: { ClientBuildTime: '2025-10-28T09:00:00Z' },
    });
  }
  return [{ productUserId: EOS_TF.productUserId, sessions, kicks: [] }, { productUserId: EOS_ARC.productUserId, sessions: arc, kicks: [] }];
}
function buildAnybrain() {
  const sessions = [];
  for (let i = 0; i < 24; i++) {
    const start = lerp(ANYBRAIN_GOLIVE, SPAN_END, (i + rf() * 0.6) / 24);
    sessions.push({ sessionStart: Math.round(start), sessionEnd: Math.round(start + ri(20, 90) * 60_000), ipAddress: pick(IPS) });
  }
  // Input-device fingerprint rows (peripherals.csv, newer exports): a Logitech
  // mouse, a Keychron keyboard and an 8BitDo pad, with per-interface duplicates.
  const peripherals = [
    { peripheral: 'USB\\VID_046D&PID_C08B&MI_00' },
    { peripheral: 'HID\\VID_046D&PID_C08B&MI_01&COL01' },
    { peripheral: 'USB\\VID_3434&PID_0A51&MI_00' },
    { peripheral: 'HID\\VID_3434&PID_0A51&MI_02&COL01' },
    { peripheral: 'HID\\VID_2DC8&PID_310A&MI_01&COL01' },
  ];
  return { os: [{ name: 'Windows 11' }], screens: [{ width: '2560', height: '1440' }, { width: '1920', height: '1080' }], sessions, peripherals };
}
function buildDenuvo() {
  const steam = [];
  for (let i = 0; i < 26; i++) {
    const start = lerp(Date.parse('2025-09-11T00:00:00Z'), SPAN_END, (i + rf() * 0.6) / 26);
    steam.push({ start: iso(start), end: iso(start + ri(30, 150) * 60_000) });
  }
  const xbox = [];
  for (let i = 0; i < 6; i++) {
    const start = lerp(Date.parse('2025-10-25T00:00:00Z'), SPAN_END, (i + 0.5) / 6);
    xbox.push({ start: iso(start), end: iso(start + ri(30, 120) * 60_000) });
  }
  return [
    { gameInfos: [{ name: 'The Finals - Steam - Retail - Anti-Cheat' }], sessionInfos: steam },
    { gameInfos: [{ name: 'The Finals - Microsoft - Retail - Anti-Cheat' }], sessionInfos: xbox },
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
  ['VerbalAbuse', 'Abusive voice chat the entire match'],
  ['VerbalAbuse', 'Threats in team chat after the round'],
  ['OffensiveProfile', 'Slur in their display name'],
  ['Other', 'Teaming with the enemy squad in ranked'],
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
  const chat = buildChatMessages();
  // One row per round played on a preview build, under that build's tenancy, logged
  // shortly before the round starts (as on real exports).
  const previewRoundRows = previewRounds.map((r) => ({
    logtime: iso(Date.parse(r.Data.StartTime) - 45_000), tenancy: 'discovery-s9-preview-event',
    product_user_id: '0002sample0000000000000000000009', round_id: r.RoundID,
  }));
  // Staff actions: a sticker set by hand in Season 2, and the tool's two rows
  // for the temporary restriction (the persistence Restriction's 2025-04-18 one).
  const restrictionEnd = Date.parse('2025-04-21T19:30:00Z');
  const staff = {
    PlayerViewUpdateInventoryItem: [{ logtime: '2024-04-02T10:21:44.208Z', tenancy: '', game_asset_id: STAFF_GRANT.GameAssetID, old_amount: 0, new_amount: 1 }],
    PlayerViewAddTenancyUserRestriction2: [{ logtime: '2025-04-18T19:30:00.412Z', tenancy: 'discovery-live', ends_at_ms: restrictionEnd, restriction_id: 1000000000000000000, reason: 'Exploiting', issue_steam_game_ban: false }],
    TenancyUserRestrictionCreated3: [{ logtime: '2025-04-18T19:30:00.418Z', tenancy: 'discovery-live', source: 'PLAYER_VIEW', reason: 'Exploiting', ends_at_ms: restrictionEnd, restriction_id: 1000000000000000000 }],
  };
  // One in-game survey answer, logged half a minute after the round it followed.
  const survey = surveyRound
    ? [{ logtime: iso(Date.parse(surveyRound.Data.EndTime) + 31_000), tenancy: 'discovery-live', announcement_id: 700114256, template_id: -503318842, answer: 8, last_round_id: surveyRound.RoundID, free_text_answer: 'Fun matches lately, but Quick Cash takes ages to find a lobby in the evening.' }]
    : [];
  const byType = { ClientUserLoginDetails: login, AccountNameAudit2: names, PlayerReport: reports, ProfileUpdated3: profileUpdated, AwsSesEvent: ses, EmailStatus: legacy, ChatMessageSent: chat, ModerationDecisionPII: buildModeration(chat), EOSProductUserId: previewRoundRows, ...buildConsoleClaims(), ...staff, NpsSurveyFreeText: survey };
  const counts = Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { byType, counts, total, badLines: 0 };
}

// In-game chat (audit `ChatMessageSent`) — only the player's OWN sent messages,
// and only from the last ~90 days before the export (matches the observed
// retention). One row is profanity-filtered to demo the "filtered in game" badge.
const CHAT_ROOMS = { party: '5ample-9a7e-4c3b-8d2f-000000000001-party', clan: '5ample-9a7e-4c3b-8d2f-000000000002-clan', pl: 'QX7D-pl' };
function buildChatMessages() {
  // A squad room is named after the round it belongs to.
  const squadRoom = (isoTime) => `${playedRounds.findLast((r) => r.Data.StartTime <= isoTime)?.RoundID ?? sampleRoundId(0)}-squad`;
  const row = (isoTime, room_type, message, purified_message = message) => ({
    logtime: isoTime,
    tenancy: 'discovery-live',
    room_type,
    room_id: CHAT_ROOMS[room_type] ?? squadRoom(isoTime),
    purified: message !== purified_message,
    message,
    purified_message,
  });
  return [
    row('2026-05-28T19:02:11.204Z', 'party', 'ready when you are'),
    row('2026-05-28T19:02:47.316Z', 'party', 'lets run ranked'),
    row('2026-05-28T19:41:03.550Z', 'party', 'that final was so close'),
    row('2026-06-02T20:15:37.118Z', 'pl', 'gg everyone'),
    row('2026-06-02T20:16:02.930Z', 'pl', 'nice winch play'),
    row('2026-06-09T18:30:19.401Z', 'pl', 'anyone else lagging?'),
    row('2026-06-09T18:31:05.777Z', 'pl', 'ok its just me lol'),
    row('2026-06-12T21:08:56.023Z', 'party', 'one more then im done', 'one more then im done'),
    row('2026-06-12T21:44:12.309Z', 'party', 'that damn turret again', 'that **** turret again'),
    row('2026-06-12T22:01:40.665Z', 'party', 'gn o7'),
    // Inside the last three weeks, so the moderation verdicts have messages to join.
    row('2026-07-27T19:12:40.118Z', 'squad', 'push the vault now'),
    row('2026-07-27T19:13:02.406Z', 'squad', 'nice'),
    row('2026-08-02T18:19:31.972Z', 'clan', 'club night thursday?'),
    row('2026-08-05T20:40:15.230Z', 'squad', 'crap i dropped the cashbox', '**** i dropped the cashbox'),
    row('2026-08-05T20:41:50.611Z', 'squad', 'that one was on me'),
    row('2026-08-13T21:30:08.077Z', 'party', 'last one tonight'),
  ];
}

// Automated moderation verdicts (audit `ModerationDecisionPII`): three checks per
// message inside the last three weeks, an advisory one then two enforcing ones, and
// the enforcing ones flag exactly the message the filter censored. One club-name
// check on the day the club name was set.
const MODERATION_WINDOW_MS = 21 * DAY;
function buildModeration(chat) {
  const out = [];
  const call = (logtime, call_name, flagged, enforced) => out.push({ logtime, tenancy: 'discovery-live', call_name, flagged, enforced });
  for (const c of chat) {
    const t = Date.parse(c.logtime);
    if (t < SPAN_END - MODERATION_WINDOW_MS) continue;
    const name = `${c.room_type}-chat-message`;
    call(iso(t + 4), name, false, false);
    call(iso(t + 11), name, c.purified, true);
    call(iso(t + 18), name, c.purified, true);
  }
  const named = Date.parse('2026-08-02T18:17:55.400Z');
  for (const dt of [0, 130, 250]) call(iso(named + dt), 'clan-name', false, dt > 0);
  return out;
}

// Support tickets in the parsed shape (`raw.customerSupportParsed`) of the CS pdf layout exports have used since
// 2026-08 (`layout: 'export'`), so the sample never loads pdfjs. That layout keeps about a year of tickets.
function buildSampleSupport() {
  const T = (s) => Date.parse(s);
  const session = (browserVersion) => [
    { label: 'DETECTED LANGUAGE', value: 'en' },
    { label: 'DEVELOPER-SET LANGUAGE', value: 'en' },
    { label: 'LANGUAGE', value: 'en' },
    { label: 'DEVICE LANGUAGE', value: 'en-GB' },
    { label: 'TIMEZONE', value: 'Europe/London' },
    { label: 'OPERATING SYSTEM', value: 'Windows' },
    { label: 'OS VERSION', value: '10' },
    { label: 'BROWSER', value: 'Chrome' },
    { label: 'BROWSER VERSION', value: browserVersion },
    { label: 'PAGE URL', value: 'https://id.embark.games/the-finals/support' },
    { label: 'PAGE TITLE', value: 'Embark ID: Technical Support and Help Center' },
  ];
  const msg = (who, text, name = null) => ({ who, name, text, dayOffset: null, approxMs: null, sentMs: null, readMs: null });
  const you = (text) => msg('you', text);
  const bot = (text) => msg('bot', text, 'Automation');
  const attachment = () => ({ ...msg('system', 'Attachment sent'), attachment: true });
  const ticket = (t) => {
    const attachmentCount = t.messages.filter((m) => m.attachment).length;
    return {
      queue: null, tags: [], state: 'resolved', channel: 'webmessenger', csat: null, game: 'THE FINALS', userEmail: 'sample.player@example.com',
      attachmentCount, attachments: [], attachmentsWithheld: attachmentCount > 0, extra: [], ...t, approxStartMs: t.createdAtMs,
    };
  };
  const FORWARDED = 'Thank you for providing this information. We will now pass your ticket on to our support team, who will reply to you here.';
  const QUEUED = 'Thank you for reaching out. Please note that it can take a few days before we reply, as tickets are answered in the order they arrive.';
  const RATE = 'How would you rate your support experience?';
  return {
    layout: 'export',
    chat: [],
    creationDateMs: T('2026-08-16T09:12:47Z'),
    tickets: [
      ticket({
        ticketId: '198653',
        intent: 'Purchase Issue',
        createdAtMs: T('2025-09-12T19:41:03Z'),
        updatedAtMs: T('2025-09-16T04:27:51Z'),
        resolvedAtMs: T('2025-09-16T04:27:51Z'),
        session: session('140.0.0.0'),
        messages: [
          you('Purchase Issue'),
          bot('Thank you for contacting us about your purchase issue. Please tell us which platform you bought on, what you bought and when, and what went wrong.'),
          you('I bought the bundle with 6,250 Multibucks on Steam about twenty minutes ago. Steam took the payment and the Multibucks arrived, but none of the bundle items are in my locker. I already restarted the game once and they are still missing.'),
          bot('Please attach the receipt of your purchase below, for example a screenshot of your Steam purchase history, so we can find the order quickly.'),
          attachment(),
          bot('Thank you for sending us this information. If there is anything else we should know, please write it below.'),
          you('Only the cosmetics are missing, the Multibucks are fine.'),
          bot(FORWARDED),
          bot(QUEUED),
          you('Update: everything showed up after I restarted my PC.'),
          you('You can close this, sorry for the trouble!'),
          msg('agent', 'Hi, thank you for reaching out and for letting us know. We have checked your account, and every item from the bundle was granted at the moment of purchase, so the game most likely needed a full restart before it could show them. We are glad to hear that everything is in your locker now. If anything from this purchase goes missing again, you are welcome to reply to this ticket and we will take another look. Kind regards, Maple', 'Maple'),
        ],
      }),
      ticket({
        ticketId: '798214',
        intent: 'Report a Cheater',
        createdAtMs: T('2026-04-11T21:05:52Z'),
        updatedAtMs: T('2026-04-15T11:19:30Z'),
        resolvedAtMs: T('2026-04-14T16:38:12Z'),
        csat: 2,
        session: session('146.0.0.0'),
        messages: [
          you('Report a Cheater or Hacker'),
          bot('Thank you for reaching out to us about a player you suspect of cheating. Please describe what happened, when the match took place and anything that could help us identify the player. Reports that include a clip or a screenshot are much easier for our team to review.'),
          you('In a match tonight a player on another team knew where we were for the whole round. They followed us through walls, pre-fired every corner we were behind and hit almost every shot while jumping. I recorded the round and cut a clip of the worst part, and their name is on the scoreboard at the end of it.'),
          bot('If you can, please attach a clip or a screenshot of what you saw below.'),
          attachment(),
          bot(FORWARDED),
          bot(QUEUED),
          msg('agent', 'Hello, thank you for taking the time to report this player and for including a clip. We have passed your report and the clip on to our anti-cheat team, who will review the match. For privacy reasons we are not able to share the outcome of an investigation or any action taken against another account, but every report is looked at. If you meet this player again, you can also report them in game from the scoreboard after the match. Sincerely, Rook', 'Rook'),
          bot(RATE),
          you('Disliked it'),
          bot('Please let us know if you have any comments about the support you received.'),
          you('I never find out if anything happened to the players I report.'),
          bot('Would you like to contact us again regarding this issue?'),
          you('No'),
          bot('Thank you for your feedback! We appreciate the time you took to share it with us.'),
        ],
      }),
      ticket({
        ticketId: '896031',
        intent: 'Technical Issues',
        createdAtMs: T('2026-05-26T08:41:17Z'),
        updatedAtMs: T('2026-06-02T09:12:40Z'),
        resolvedAtMs: T('2026-05-30T09:12:40Z'),
        session: session('148.0.0.0'),
        messages: [
          you('I am having another technical issue'),
          bot('We are sorry to hear that technical issues are getting in the way of your game. To help us look into this, please describe the problem in as much detail as you can: what happens, when it started, and whether anything changed on your system around that time.'),
          you('Since the last update the game crashes every time I launch it. The Embark logo shows up, then the window closes and the crash reporter opens. I have verified the game files on Steam, reinstalled the game and restarted my PC, but nothing changed. Other games run fine and I have not changed any settings since the update.'),
          bot('Thank you for this information. If you can, please attach a crash report or a log file from your game folder, as it helps our team find the cause faster.'),
          attachment(),
          bot('We are aware of some reported issues that our team is already working on, and you can follow their status on our official channels while you wait.'),
          bot(FORWARDED),
          bot(QUEUED),
          msg('agent', 'Hi, thank you for contacting us and for sending the crash report. The report shows the game stopping while it loads your graphics driver, which we have seen with older drivers since the latest update. Please install the newest driver from the website of your graphics card maker using a clean installation, then restart your PC and launch the game again. If it still crashes after that, reply to this ticket with a new crash report and we will take another look. Best regards, Sorrel', 'Sorrel'),
          bot(RATE),
        ],
      }),
    ],
  };
}

/**
 * Build a complete fictional raw export, shaped exactly like parseFileset()'s
 * output, ready for buildModel(). No real personal data; deterministic.
 */
export function buildSampleRaw() {
  resetGenerator();
  return {
    persistence: buildPersistence(),
    // Embark's key file, scoped to the ids above (item names and mastery tracks).
    keys: { byType: { TheFinalsItemKey: [...keyRows.items, { GameAssetID: MULTIBUCKS_ID, Kind: 'Item', Name: 'Multibucks', ItemType: 'Currency', Resolved: true }], TheFinalsMasteryKey: keyRows.mastery } },
    audit: buildAudit(),
    eos: { anticheat: buildEosAnticheat(), linkedAccounts: [EOS_TF, EOS_ARC] },
    anybrain: buildAnybrain(),
    denuvo: buildDenuvo(),
    // Request "worked on" a few days after the last session — demonstrates the
    // "data as of your request" freshness banner (request date > last activity).
    readme: { requestedAtMs: EXPORTED_AT, requestId: '0000', label: '16 August 2026' },
    // Pre-parsed CS data (chat comes from the audit rows; tickets in the parsed
    // shape) — the sample must never need pdfjs.
    customerSupportParsed: buildSampleSupport(),
  };
}
