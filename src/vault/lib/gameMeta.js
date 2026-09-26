// Game metadata + classifiers for RoundStat records
import { STATIC_KEYS } from './keys.js';

// CharacterArchetype -> class label.
export const ARCHETYPES = {
  DA_Archetype_Small: 'Light',
  DA_Archetype_Medium: 'Medium',
  DA_Archetype_Heavy: 'Heavy',
};
// hasOwn on the export-keyed tables in this file: a CharacterArchetype of
// "__proto__" would otherwise return Object.prototype, which React throws on when
// it reaches a child ("constructor" returns a function and renders blank instead).
export const archetypeLabel = (raw) => (Object.hasOwn(ARCHETYPES, raw) ? ARCHETYPES[raw] : (raw ? 'Unknown' : '—'));

// Fallback only: maps.js names a map by code AND number.
export const MAP_NAMES = {
  Monaco: 'Monaco',
  Seoul: 'Seoul',
  LasVegas: 'Las Vegas',
  Kyoto: 'Kyoto',
  Arena: 'Arena (Stadium)',
  Bernal: 'Bernal',
  BayCity: 'Fangwai City',
  Forest: 'P.E.A.C.E. Center',
  Village: 'Starlight Hollow',
  Playground: 'Heavy Hitters',
  HeavyHitters: 'Heavy Hitters',
  CashBall: 'Ca$hball Stadium',
  Space: 'Galaxy Estates',
  PracticeRange: 'Practice Range',
};

// Parse "DA_MV_Seoul_01_Base" -> { map: 'Seoul', variant: 'Base', display }
export const parseMapVariant = (mv) => {
  // Practice-range rounds carry the literal string "None".
  if (!mv || mv === 'None') return { map: null, variant: null, display: '—' };
  const m = /^DA_MV_([A-Za-z]+)_(\d+)_?(.*)$/.exec(mv);
  if (!m) return { map: mv, variant: null, display: mv };
  const code = m[1];
  const variant = m[3] || 'Base';
  return { map: code, variant, display: Object.hasOwn(MAP_NAMES, code) ? MAP_NAMES[code] : code };
};

// "DA_EC_Arena_01_Night", "DA_EC_Kyoto_01_Winter_Night", "DA_EC_BayCity_01_Night_01" or bare "Night"
export const parseCondition = (ec) => {
  if (!ec) return null;
  if (!ec.startsWith('DA_EC_')) return ec; // older bare format e.g. "Night"
  const parts = ec.split('_').filter((p) => !/^\d+$/.test(p));
  return parts[parts.length - 1] || ec;
};

// World Tour badge thresholds from Season 4 on (thefinals.wiki/wiki/World_Tour; identical in
// the wiki's Season 4 revision). Level 4 is a tier's entry step, 1 its top. No cap.
export const WORLD_TOUR_BADGES = [
  { name: 'Bronze', steps: [25, 50, 75, 100], color: '#b45309', text: 'text-amber-700' },
  { name: 'Silver', steps: [150, 200, 250, 300], color: '#d1d5db', text: 'text-gray-300' },
  { name: 'Gold', steps: [375, 450, 525, 600], color: '#facc15', text: 'text-yellow-400' },
  { name: 'Platinum', steps: [700, 800, 900, 1000], color: '#67e8f9', text: 'text-cyan-300' },
  { name: 'Diamond', steps: [1150, 1300, 1450, 1600], color: '#60a5fa', text: 'text-blue-400' },
  { name: 'Emerald', steps: [1800, 2000, 2200, 2400], color: '#34d399', text: 'text-emerald-400' },
];
const ladderBadge = (ladder, score) => {
  if (!Number.isFinite(score)) return null;
  let best = null;
  for (const tier of ladder) {
    tier.steps.forEach((min, i) => {
      if (score >= min) best = { name: tier.name, level: 4 - i, label: `${tier.name} ${4 - i}`, color: tier.color, text: tier.text };
    });
  }
  return best;
};
export const worldTourBadge = (score) => ladderBadge(WORLD_TOUR_BADGES, score);
// A named tier without the ladder, e.g. Season 3's Emerald (level null when unknown).
export const worldTourTier = (name, level = null) => {
  const t = WORLD_TOUR_BADGES.find((x) => x.name === name);
  return t ? { name, level, label: level ? `${name} ${level}` : name, color: t.color, text: t.text } : null;
};

// World Tour stop and week names as the game showed them (thefinals.wiki), matched to
// Embark's weekly scenario names (`WT_S07_S02E03_Lockout`) by what each week did.
// [name, sponsors, start, end] per stop; Season 3's seven events stand in for stops.
const WT_STOPS = {
  3: [
    ['ENGIMO OPEN', ['ENGIMO'], '2024-06-13', '2024-06-27'],
    ['OSPUZE EXPO', ['OSPUZE'], '2024-06-27', '2024-07-11'],
    ['ISEUL-T CUP', ['ISEUL-T'], '2024-07-11', '2024-07-25'],
    ['VOLPE CHAMPIONSHIP', ['VOLPE'], '2024-07-25', '2024-08-08'],
    ['DISSUN CHALLENGE', ['DISSUN'], '2024-08-08', '2024-08-22'],
    ['VAIIYA INTERNATIONAL', ['VAIIYA'], '2024-08-22', '2024-09-05'],
    ['HOLTOW CLASSIC', ['HOLTOW'], '2024-09-05', '2024-09-26'],
  ],
  4: [
    ['ENGIMO OPEN', ['ENGIMO'], '2024-09-26', '2024-10-17'],
    ['HOLTOW CLASSIC', ['HOLTOW'], '2024-10-17', '2024-11-07'],
    ['ISEUL-T CUP', ['ISEUL-T'], '2024-11-07', '2024-11-28'],
    ['THE FINALS', ['HOLTOW', 'ISEUL-T', 'ENGIMO'], '2024-11-28', '2024-12-12'],
  ],
  5: [
    ['VAIIYA INTERNATIONAL', ['VAIIYA'], '2024-12-12', '2025-01-02'],
    ['ISEUL-T CUP', ['ISEUL-T'], '2025-01-02', '2025-01-23'],
    ['DISSUN CHALLENGE', ['DISSUN'], '2025-01-23', '2025-02-14'],
    ['//SYS$WT.CNS', ['CNS'], '2025-02-14', '2025-03-06'],
    ['SPONSOR SHOWDOWN', ['ISEUL-T', 'DISSUN', 'VAIIYA'], '2025-03-06', '2025-03-20'],
  ],
  6: [
    ['ALFA ACTA OPEN', ['ALFA ACTA'], '2025-03-20', '2025-04-10'],
    ['ENGIMO OPEN', ['ENGIMO'], '2025-04-10', '2025-05-01'],
    ['OSPUZE EXPO', ['OSPUZE'], '2025-05-01', '2025-05-22'],
    ['SPONSOR SHOWDOWN', ['ALFA ACTA', 'ENGIMO', 'OSPUZE'], '2025-05-22', '2025-06-12'],
  ],
  7: [
    ['VAIIYA INTERNATIONAL', ['VAIIYA'], '2025-06-12', '2025-07-03'],
    ['CNS OVERRIDE', ['CNS'], '2025-07-03', '2025-07-24'],
    ['VAIIYA DIRECTIVE', ['VAIIYA'], '2025-07-24', '2025-08-14'],
    ['CNS ECHO', ['CNS'], '2025-08-14', '2025-09-10'],
    ['SPONSOR SHOWDOWN', ['VAIIYA', 'CNS'], '2025-08-28', '2025-09-04'],
  ],
  8: [
    ['TRENTILA INVITATIONAL', ['TRENTILA'], '2025-09-10', '2025-10-02'],
    ['HOLTOW CUP', ['HOLTOW'], '2025-10-02', '2025-10-23'],
    ['HOLTOW OPEN', ['HOLTOW'], '2025-10-23', '2025-11-13'],
    ['TRENTILA MASTERS', ['TRENTILA'], '2025-11-13', '2025-12-04'],
    ['SPONSOR SHOWDOWN', ['TRENTILA', 'HOLTOW'], '2025-12-04', '2025-12-10'],
  ],
  9: [
    ['VOLPE CHAMPIONSHIP', ['VOLPE'], '2025-12-10', '2026-01-01'],
    ['OSPUZE EXPO', ['OSPUZE'], '2026-01-01', '2026-01-22'],
    ['VOLPE MASTERS', ['VOLPE'], '2026-01-22', '2026-02-12'],
    ['OSPUZE INTERNATIONAL', ['OSPUZE'], '2026-02-12', '2026-03-05'],
    ['SPONSOR SHOWDOWN', ['OSPUZE', 'VOLPE'], '2026-03-05', '2026-03-26'],
  ],
  10: [
    ['ALFA ACTA OPEN', ['ALFA ACTA'], '2026-03-26', '2026-04-16'],
    ['ISEUL-T CUP', ['ISEUL-T'], '2026-04-16', '2026-05-07'],
    ['ALFA ACTA OPEN', ['ALFA ACTA'], '2026-05-07', '2026-05-28'],
    ['ISEUL-T CUP', ['ISEUL-T'], '2026-05-28', '2026-06-18'],
    ['SPONSOR SHOWDOWN', ['ISEUL-T', 'ALFA ACTA'], '2026-06-18', '2026-07-09'],
  ],
  11: [
    ['COMETA LAUNCH CUP', ['COMETA'], '2026-07-09', '2026-07-30'],
    ['COMETA MASTERS', ['COMETA'], '2026-07-30', '2026-08-20'],
    ['ENGIMO INVITATIONAL', ['ENGIMO'], '2026-08-20', '2026-09-10'],
    ['ENGIMO OPEN', ['ENGIMO'], '2026-09-10', '2026-10-01'],
    ['SPONSOR SHOWDOWN', ['COMETA', 'ENGIMO'], '2026-10-01', '2026-10-20'],
  ],
};
const WT_WEEKS = {
  'WorldTour_S4_Stop1Event1_24_Players_Cashout': 'OPENING WEEK',
  'WorldTour_S4_Stop1Event2_24_Players_Cashout': 'FRIENDS & FAMILY',
  'WorldTour_S4_Stop1Event3_24_Players_Cashout': 'PRIMETIME BUFF',
  'WorldTour_S4_Stop2Event1_24_Players_Cashout': 'OPENING WEEK',
  'WorldTour_S4_Stop2Event2_24_Players_Cashout': 'COSMIC LIABILITY',
  'WorldTour_S4_Stop2Event3_24_Players_Cashout': 'TRICK OR TREAT',
  'WorldTour_S4_Stop3Event1_24_Players_Cashout': 'OPENING WEEK',
  'WorldTour_S4_Stop3Event2_24_Players_Cashout': 'FASHION WEEK',
  'WorldTour_S4_Stop3Event3_24_Players_Cashout': 'HIGH-FASHION HAVOC',
  'WorldTour_S4_Stop4Event1_24_Players_Cashout': 'SPONSOR SHOWDOWN',
  'WT_S05_S01E01_OpeningWeek': 'OPENING WEEK',
  'WT_S05_S01E02_Christmas': 'MERRY MAYHEM',
  'WT_S05_S01E03_Vaiiya': 'BOOST PROTOCOL',
  'WT_S05_S02E01_OpeningWeek': 'OPENING WEEK',
  'WT_S05_S02E02_Limelight': 'TIME TO SHINE',
  'WT_S05_S03E01_Lunar': 'LIGHT THE WAY',
  'WT_S05_S03E02_NormalWeek': 'CLASSIC CASHOUT',
  'WT_S05_S03E03_Valentines': 'LOVE HURTS',
  'WT_S05_S04E01_OpeningWeek': '..::[C]::..',
  'WT_S05_S04E03_CNS': '..::[S]::..',
  'WT_S05_S05E01-02_SponsorShowdown': 'SPONSOR SHOWDOWN',
  'WT_S06_S01E01_OpeningWeek': 'OPENING WEEK',
  'WT_S06_S01E02_RiskReward': 'RISK & REWARD',
  'WT_S06_S01E03_HeadHunter': 'HEAD HUNTER',
  'WT_S06_S02E01_OpeningWeek': 'OPENING WEEK',
  'WT_S06_S02E02_SequentialGSEs': 'PROTOCOL OVERDRIVE',
  'WT_S06_S02E03_StrikeAPose': 'STRIKE A POSE 2.0',
  'WT_S06_S03E01_OpeningWeek': 'OPENING WEEK',
  'WT_S06_S03E02_DeadGoBoomV2': 'LAST DROP',
  'WT_S06_S03E03_ConcurrentGSEs': 'DOUBLE DOSE',
  'WT_S06_S04E01-03_SponsorShowdown': 'SPONSOR SHOWDOWN',
  'WT_S06_S04E02_SponsorShowdown': 'SPONSOR SHOWDOWN',
  'WT_S06_S04E03_SponsorShowdown': 'SPONSOR SHOWDOWN',
  'WT_S07_S01E01_OpeningWeek': 'OPENING WEEK',
  'WT_S07_S02E01_OpeningWeek': 'OPENING WEEK',
  'WT_S07_S02E02_StandardWeek': 'STANDARD CASHOUT',
  'WT_S07_S02E03_Lockout': 'LOCK.PHASE()',
  'WT_S07_S03E01_OpeningWeek': 'OPENING WEEK',
  'WT_S07_S03E02_StandardWeek': 'STANDARD CASHOUT',
  'WT_S07_S04E01_OpeningWeek': 'OPENING WEEK',
  'WT_S07_S04E02_StandardWeek': 'STANDARD CASHOUT',
  'WT_S07_S04E03_DanceFloor': 'CNS.SYNC',
  'WT_S07_S05E01_SponsorShowdown': 'SPONSOR SHOWDOWN',
  'WT_S08_S01E01_OpeningWeek': 'OPENING WEEK',
  'WT_S08_S01E02_StandardWeek': 'STANDARD CASHOUT',
  'WT_S08_S01E03_SuperJump': 'VERTIGO!',
  'WT_S08_S02E02_StandardWeek': 'STANDARD CASHOUT',
  'WT_S08_S04E02_StandardWeek': 'STANDARD CASHOUT',
  'WT_S09_S01E03_StandardWeek': 'STANDARD CASHOUT',
  'WT_S09_S02E01_StandardWeek': 'STANDARD CASHOUT',
  'WT_S09_S02E02_StandardWeek': 'STANDARD CASHOUT',
  'WT_S09_S02E03_SuperJumpRerun': 'VERTIGO!',
  'WT_S09_S03E01_StandardWeek': 'STANDARD CASHOUT',
  'WT_S09_S03E02_ConcurrentGSEs_Hackout_OrbitalLasers': 'ORBITAL BREACH',
  973907767: 'STRIKE A POSE',
  863388693: '..::[N]::..',
  375377587: 'STANDARD CASHOUT',
  465304560: 'PROTOCOL: XPOSE',
  472521555: 'RISK & REWARD',
  202759954: 'OPENING WEEK',
  262477207: 'RUSHDOWN',
  146323197: 'OPENING WEEK',
  146663231: 'STANDARD CASHOUT',
  961176664: 'HEAD HUNTER',
  205691223: 'OPENING WEEK',
  950590405: 'DEAD GO TOXIC',
  812906781: 'STANDARD CASHOUT',
  796922784: 'STANDARD CASHOUT',
  232142677: 'ARENA DEBUT',
};
// Ids that ran other weeks than their `E01-03` form says.
const WT_WEEK_SPANS = {
  'WorldTour_S4_Stop4Event1_24_Players_Cashout': [1, 2],
  'WT_S06_S04E01-03_SponsorShowdown': [1],
};
// Ids no key file names, and ids reused across seasons (keyed `id:season`), placed by the
// week their first rounds fall in: every other week of the calendar has its own named id.
const wtWeek = (season, stop, week) => ({ season, stop, from: week, to: week, theme: null });
const WT_IDS = {
  520946128: { season: 3, event: 1 },
  '425956530:3': { season: 3, event: 2 },
  973907767: wtWeek(5, 2, 3),
  863388693: wtWeek(5, 4, 2),
  375377587: wtWeek(7, 1, 2),
  465304560: wtWeek(7, 1, 3),
  472521555: wtWeek(7, 3, 3),
  202759954: wtWeek(8, 2, 1),
  262477207: wtWeek(8, 2, 3),
  146323197: wtWeek(8, 3, 1),
  146663231: wtWeek(8, 3, 2),
  961176664: wtWeek(8, 3, 3),
  205691223: wtWeek(8, 4, 1),
  950590405: wtWeek(8, 4, 3),
  812906781: wtWeek(9, 1, 1),
  796922784: wtWeek(9, 1, 2),
  232142677: wtWeek(11, 1, 1),
};
const WT_NAME_FORMS = [
  [/^WT_S(\d+)_S(\d+)E(\d+)(?:-(\d+))?_(.+)$/, (m) => ({ season: +m[1], stop: +m[2], from: +m[3], to: +(m[4] ?? m[3]), theme: m[5] })],
  [/^WorldTour_S(\d+)_Stop(\d+)Event(\d+)_/, (m) => ({ season: +m[1], stop: +m[2], from: +m[3], to: +m[3], theme: null })],
  [/^WorldTour_S(\d+)Event(\d+)_/, (m) => ({ season: +m[1], event: +m[2] })],
];
const own = (o, k) => (k != null && Object.hasOwn(o, k) ? o[k] : null);
const parseWtName = (name) => {
  for (const [re, f] of WT_NAME_FORMS) {
    const m = re.exec(name || '');
    if (m) return f(m);
  }
  return null;
};
const humanTheme = (t) => t.split('_').map((p) => p.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z]{2,})/g, '$1 $2')).join(', ');
const weeksLabel = (w) => (w.length > 1 ? `Weeks ${w[0]} to ${w[w.length - 1]}` : `Week ${w[0]}`);

// A reused id only counts for the season its name, or a curated entry, gives.
export const worldTourEvent = (scenarioId, season, keys = STATIC_KEYS) => {
  if (season == null) return null;
  const id = String(scenarioId);
  const internal = keys.scenario(id)?.internalName ?? null;
  let p = parseWtName(internal);
  if (!p || p.season !== season) {
    const c = own(WT_IDS, `${id}:${season}`) ?? own(WT_IDS, id);
    p = c && c.season === season ? c : null;
  }
  if (!p) return null;
  if (p.event != null) {
    const ev = worldTourStop(season, p.event);
    return { season, stop: null, event: p.event, weeks: [], stopName: ev?.name ?? null, sponsors: ev?.sponsors ?? [], weekName: null, weekNameSource: null, internal, label: [`Event ${p.event}`, ev?.name].filter(Boolean).join(' · ') };
  }
  let weeks = own(WT_WEEK_SPANS, internal);
  if (!weeks) {
    weeks = [];
    for (let w = p.from; w <= p.to; w++) weeks.push(w);
  }
  const stop = worldTourStop(season, p.stop);
  const curated = own(WT_WEEKS, internal) ?? own(WT_WEEKS, id) ?? null;
  const weekName = curated ?? (p.theme ? humanTheme(p.theme) : null);
  return {
    season,
    stop: p.stop,
    event: null,
    weeks,
    stopName: stop?.name ?? null,
    sponsors: stop?.sponsors ?? [],
    weekName,
    weekNameSource: curated ? 'wiki' : weekName ? 'export' : null,
    internal,
    label: [`Stop ${p.stop}`, weeks.length ? weeksLabel(weeks) : null, weekName].filter(Boolean).join(' · '),
  };
};
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
// A season's stop (Season 3: event) by number, with its sponsors and dates.
export const worldTourStop = (season, n) => {
  const s = n != null ? WT_STOPS[season]?.[n - 1] : null;
  return s ? { name: s[0], sponsors: s[1], startMs: dayMs(s[2]), endMs: dayMs(s[3]) } : null;
};

// From Season 9 every season's stops reuse these five ids, in this order (dated by
// the stops each export reached before it was requested).
export const WT_STOP_IDS = { 754316888: 1, 883498882: 2, 858581427: 3, 958846313: 4, 419510279: 5 };

// Sponsor ids are named nowhere in the export: solved from each season's sponsors and the
// ids seasons share, confirmed by a player. VOLPE is the one id first seen in Season 9.
const SPONSORS = {
  '-712450515': 'ISEUL-T',
  318896507: 'VAIIYA',
  '-23170714': 'CNS',
  694448565: 'HOLTOW',
  1789104437: 'TRENTILA',
  '-36016083': 'ENGIMO',
  '-1229618176': 'DISSUN',
  '-234554384': 'OSPUZE',
  '-1450283644': 'ALFA ACTA',
  '-1916700347': 'VOLPE',
};
export const sponsorName = (id) => (Object.hasOwn(SPONSORS, String(id)) ? SPONSORS[String(id)] : null);

// Seasons 6 to 8 only (thefinals.wiki/wiki/Quickplay). Gold 1 is the top.
export const QUICKPLAY_BADGES = [
  { ...WORLD_TOUR_BADGES[0], steps: [50, 100, 150, 200] },
  { ...WORLD_TOUR_BADGES[1], steps: [300, 400, 500, 600] },
  { ...WORLD_TOUR_BADGES[2], steps: [775, 950, 1125, 1300] },
];
export const quickplayBadge = (score) => ladderBadge(QUICKPLAY_BADGES, score);

// Scorecard tiers, best first, in the ladder's league colours. The export only has a
// number (Level 0..4, 0 best); the league names are how the game shows them, from the
// owner's memory of the in-game medals rather than from anything in the data.
export const SCORE_TIERS = [
  { name: 'Ruby', bg: 'bg-red-600', text: 'text-red-500' },
  { name: 'Diamond', bg: 'bg-blue-400', text: 'text-blue-400' },
  { name: 'Platinum', bg: 'bg-cyan-300', text: 'text-cyan-300' },
  { name: 'Gold', bg: 'bg-yellow-400', text: 'text-yellow-400' },
  { name: 'Silver', bg: 'bg-gray-300', text: 'text-gray-300' },
];

// Top-level categories used for the match-history mode filter
export const MODE_CATEGORIES = ['Ranked', 'World Tour', 'Casual', 'LTM', 'Other'];

// The named modes players actually care about in the current rotation — used to
// label the Career mode breakdown / pie and the Matches mode filter. Everything
// not one of these (older casual modes, the various LTMs, the practice range,
// unknown scenarios) collapses into "Other".
export const CAREER_MODE_GROUPS = ['Ranked', 'World Tour', 'Quick Cash', 'Team Deathmatch', 'Power Shift', 'Point Break'];

// Map a classified mode (from classifyMode) to one of the CAREER_MODE_GROUPS or
// "Other". Ranked / World Tour are whole categories; the rest key off the mode
// label. "Quick Cash" = the casual Cashout mode. Ranked Cashout and
// the World Tour cashout tournament are their own buckets.
export const careerModeGroup = (mode) => {
  if (!mode) return 'Other';
  if (mode.category === 'Ranked') return 'Ranked';
  if (mode.category === 'World Tour') return 'World Tour';
  switch (mode.label) {
    case 'Power Shift':
      return 'Power Shift';
    case 'Team Deathmatch':
      return 'Team Deathmatch';
    case 'Point Break':
      return 'Point Break';
    case 'Quick Cash':
      return 'Quick Cash';
    default:
      return 'Other';
  }
};

// Confirmed ScenarioID -> mode. teams = max squads in a lobby (from LeaderboardPosition)
export const SCENARIO_MODES = {
  '498553443': { label: 'Ranked Cashout', category: 'Ranked', teams: 4 },
  '164312917': { label: 'Quick Cash', category: 'Casual', teams: 3 },
  '758421811': { label: 'Bank It', category: 'Casual', teams: 4 },
  '545190106': { label: 'Power Shift', category: 'Casual', teams: 2 },
  '418401773': { label: 'Team Deathmatch', category: 'Casual', teams: 2 },
  '157494085': { label: 'Head2Head', category: 'Casual', teams: 2 },
  '184486584': { label: 'Point Break', category: 'Casual', teams: 2 }, // Point Break
  '211556165': { label: 'Point Break', category: 'Casual', teams: 2 }, // Point Break — Arena Debut LTM (Starlight Hollow), S10
  '686266668': { label: 'Terminal Attack', category: 'Casual', teams: 2 }, // attack/defend, S2 era
  // S3's ranked playlist was Terminal Attack, and this is its id (NOT 531991356).
  // Across 8 exports: 2 teams, 0 revives over 1,182 rounds (Dbnos is 0 in EVERY
  // mode in every export, so it discriminates nothing — don't cite it), MatchIDs only
  // {0-0, 1-0} so it never draws a third round and cannot be an 8-team bracket,
  // and it exists only 2024-06-13..2024-09-25. Decisive: the S3 ranked rating's
  // lastTournamentPlayed points at one of ITS tournaments in 6 of 6 exports that
  // have one, and completedMatches (which counts TOURNAMENTS, not rounds —
  // calibrated on 498553443) tracks its count, never 531991356's.
  '296178816': { label: 'Ranked Terminal Attack', category: 'Ranked', teams: 2 },
  // Post-S3 casual Terminal Attack: same 2-team / 0-revive / single-"0-0" shape as
  // 686266668, which ends 2024-06-12 the day before this starts (S3 launch). Runs
  // to 2025-08-28, long past S3. Proof it is not ranked: one export played two of
  // its tournaments inside the S3 window while its S3 ranked rating stayed at
  // completedMatches 0 with an empty lastTournamentPlayed.
  '531991356': { label: 'Terminal Attack', category: 'Casual', teams: 2 },
  // Limited-time modes.
  '639859186': { label: 'Blast Off!', category: 'LTM', teams: 2 }, // Bernal "Fog"
  // 152796620 (Heavy Hitters / Heaven or Else) is split by arena in classifyMode — both share this id.
  '905608807': { label: 'Super Cashball', category: 'LTM', teams: 2 }, // confirmed
  '473424892': { label: 'Steal the Spotlight', category: 'LTM', teams: 12 }, // confirmed — old big-lobby LTM
  '805886560': { label: 'Ghoul Rush', category: 'LTM', teams: 11 }, // confirmed — Halloween LTM (aka Haunted Harvest)
  '420165069': { label: 'Smoking Guns', category: 'LTM', teams: 4 }, // confirmed — Monaco-only LTM
  '704866484': { label: 'Close Quarters', category: 'LTM', teams: 2 }, // confirmed — P.E.A.C.E. Center LTM
  // Bunny Bash = a Power Shift event LTM that recurs. S2 (267894133, Horizon-only)
  // and S6+ (597953832, returns S10) — verified by the S6→gap→S10 date pattern + maps.
  '267894133': { label: 'Bunny Bash', category: 'LTM', teams: 2 }, // confirmed — S2
  '597953832': { label: 'Bunny Bash', category: 'LTM', teams: 2 }, // confirmed, data-verified — S6+
  // Seasons 1 and 2 ran two bracket playlists side by side. Embark names 787538704
  // "RankedTournament" (4 rounds) and 377270267 "Tournament" (3 rounds, unranked).
  '787538704': { label: 'Ranked Cashout', category: 'Ranked', teams: 4 },
  '377270267': { label: 'Tournament', category: 'Casual', teams: 4 },
  '106717113': { label: 'Snowball Blitz', category: 'LTM', teams: 2 }, // confirmed — winter event, Monaco + Snowball weapon
  // A few S3–S5 World Tour ids (the rest live in WORLD_TOUR_SCENARIOS below).
  '211390302': { label: 'World Tour', category: 'World Tour', teams: 4 },
  '970363916': { label: 'World Tour', category: 'World Tour', teams: 4 },
  '425956530': { label: 'World Tour', category: 'World Tour', teams: 4 },
  '496014728': { label: 'World Tour', category: 'World Tour', teams: 4 },
};

// World Tour = the seasonal casual TOURNAMENT (4-team bracket). Ranked has used
// the single persistent ScenarioID 498553443 every season since S4, and in S3 it
// was Terminal Attack on 296178816 (498553443 has a matching Jul-Aug 2024 hole),
// so EVERY OTHER 4-team 100%-tournament ScenarioID (from the S3 launch on) is
// a per-season World Tour event. Keyed explicitly here — NOT a heuristic. (The
// 2-/3-team tournaments and 11-/12-team modes are deliberately excluded; they're
// the still-unidentified ones.)
const WORLD_TOUR_SCENARIOS = new Set([
  '520946128', '598537342', '201724873', '572258369', '741843420', '408400623', '896067198', '732865891',
  '380601982', '540904715', '704216536', '517351037', '372967157', '525513529', '785620432', '198101066',
  '791733099', '326545039', '134128679', '974012321', '202759954', '308426432', '950590405', '269727098',
  '375377587', '972819353', '251023268', '146323197', '987755586', '973907767', '465304560', '976473257',
  '858837033', '917842285', '803397762', '897735170', '994677702', '416583905', '578592227', '709035454',
  '790343144', '146663231', '526555163', '657258550', '648075701', '776552271', '907722781', '722407850',
  '619195988', '516835794', '328125031', '503132740', '769062689', '159466872', '572195019', '796922784',
  '863388693',
  // Confirmed 4-team acrossa
  '852907964', '294854036', '405873674', '960388364', '262477207', '472521555', '812906781', '961176664',
  '688748083', '193786221', '205691223', '961608855', '609953292', '769621951',
  '232142677', // Season 11's opening week on Galaxy Estates, the one weekly id after Update 9.8.0
]);

// Embark's scenario names (key file `Name`) -> the mode as players know it. Outranks
// SCENARIO_MODES: several ids there were fingerprinted from play patterns, this is proof.
const EMBARK_SCENARIOS = {
  QuickCash: { label: 'Quick Cash', category: 'Casual', teams: 3 },
  RankedTournament: { label: 'Ranked Cashout', category: 'Ranked', teams: 4 },
  WorldTournament: { label: 'World Tour', category: 'World Tour', teams: 4 },
  PushVillage: { label: 'Point Break', category: 'Casual', teams: 2 },
  HeavyHitters: { label: 'Heavy Hitters', category: 'LTM', teams: 2 },
  Dragonfall: { label: 'Dragonfall', category: 'LTM', teams: null },
  // New-player onboarding lobbies against bots (FTUE = first-time user experience).
  CashoutBotsSolo: { label: 'Cashout vs bots', category: 'Other', teams: null, bots: true },
  CashoutBotsSoloFTUE: { label: 'Cashout vs bots', category: 'Other', teams: null, bots: true },
  Tournament: { label: 'Tournament', category: 'Casual', teams: 4 },
  SingleRoundCashout: { label: 'Single Round Cashout', category: 'Casual', teams: 4 },
  SoloBankIt: { label: 'Solo Bank It', category: 'Casual', teams: null },
  Practice: { label: 'Practice Range', category: 'Other', teams: null, practice: true },
};

export const scenarioFromKey = (key) => {
  if (Object.hasOwn(EMBARK_SCENARIOS, key.name)) return { ...EMBARK_SCENARIOS[key.name], translated: true };
  return { label: key.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2'), category: 'Other', teams: null, translated: false };
};

// Maps that, by themselves, identify a Limited-Time Mode
const LTM_MAPS = {
  HeavyHitters: 'Heaven or Else',
  CashBall: 'Cashball',
};

/**
 * Best-effort classification of a single RoundStat.Data into a mode + category.
 * Returns { label, category, teams, confirmed }.
 */
export const classifyMode = (data, keys = STATIC_KEYS) => {
  if (!data) return { label: 'Unknown', category: 'Other', teams: null, confirmed: false };
  const scenarioId = String(data.ScenarioID);

  // Heavy Hitters & Heaven or Else share ScenarioID 152796620; the arena tells them
  // apart. _02 only: the S11 Heavy Hitters return plays on HeavyHitters_03 (Relay Grid).
  if (scenarioId === '152796620') {
    const onHeavenOrElse = /^DA_MV_HeavyHitters_02(_|$)/.test(data.MapVariant || '');
    return { label: onHeavenOrElse ? 'Heaven or Else' : 'Heavy Hitters', category: 'LTM', teams: 2, confirmed: true };
  }

  const key = keys.scenario(scenarioId);
  const viaKey = key ? scenarioFromKey(key) : null;
  if (viaKey?.translated) {
    return { label: viaKey.label, category: viaKey.category, teams: viaKey.teams, confirmed: true, ...(viaKey.bots ? { bots: true } : {}), ...(viaKey.practice ? { practice: true } : {}) };
  }

  // Without hasOwn a "constructor" id spreads a function into the mode, which
  // renders as a blank label while still flagged confirmed.
  if (Object.hasOwn(SCENARIO_MODES, scenarioId)) return { ...SCENARIO_MODES[scenarioId], confirmed: true };
  if (WORLD_TOUR_SCENARIOS.has(scenarioId)) return { label: 'World Tour', category: 'World Tour', teams: 4, confirmed: true };
  // Named by Embark, not translated yet. Still beats the map heuristics below.
  if (viaKey) return { label: viaKey.label, category: viaKey.category, teams: viaKey.teams, confirmed: true };

  const { map } = parseMapVariant(data.MapVariant);
  const cond = parseCondition(data.EnvironmentalCondition);
  const hasTournament = data.TournamentID != null && data.TournamentID !== '';
  const teams = typeof data.LeaderboardPosition === 'number' ? data.LeaderboardPosition : null;

  // Map-based LTM detection (independent of scenario id).
  if (map && Object.hasOwn(LTM_MAPS, map)) return { label: LTM_MAPS[map], category: 'LTM', teams, confirmed: false };
  if (map === 'Bernal' && cond === 'Fog') return { label: 'Blast Off!', category: 'LTM', teams, confirmed: false };
  if (map === 'Monaco' && /Winter/i.test(cond || '')) return { label: 'Snowball Blitz', category: 'LTM', teams, confirmed: false };
  if (map === 'Forest') return { label: 'Team Deathmatch', category: 'Casual', teams, confirmed: false }; // P.E.A.C.E. Center
  if (map === 'Village') return { label: 'Point Break', category: 'Casual', teams, confirmed: false }; // Starlight Hollow
  if (map === 'Playground') return { label: 'Practice Range', category: 'Other', teams, confirmed: false };

  // Bracket-format but not a confirmed ranked scenario -> World Tour (per docs,
  // short-window 100%-tournament ids are World Tour variants).
  if (hasTournament) return { label: 'Tournament (World Tour)', category: 'World Tour', teams, confirmed: false };

  return { label: `Mode ${data.ScenarioID ?? '?'}`, category: 'Other', teams, confirmed: false };
};

// --- Tournament bracket stage decoding ------------------------------------
// CRITICAL: MatchID's first number — which is ALWAYS identical to the Tier
// field — is ROUNDS-REMAINING, not the round number. Verified across every
// sample export: each TournamentWon round is MatchID "0-x" / Tier 0, and the
// bracket counts DOWN to the final. So for the standard 3-round ranked bracket
//   rounds-remaining:   2   ->   1   ->   0
//   stage:           Round 1   Round 2   Final
// Older / World Tour formats can add a "3" (an extra earlier round). The
// furthest stage a player reached is therefore the MINIMUM rounds-remaining.
export const roundsRemaining = (matchId) => {
  if (matchId == null) return null;
  const n = parseInt(String(matchId).split('-')[0], 10);
  return Number.isFinite(n) ? n : null;
};

// Human label for one bracket round, given its rounds-remaining value and the
// deepest value seen in that tournament (i.e. the first round the player
// played). rr 0 is always the Final; the rest count up from the start.
export const stageLabel = (rr, maxRR) => {
  if (rr == null) return '—';
  if (rr === 0) return 'Final';
  if (maxRR == null || maxRR < rr) return rr === 1 ? 'Semifinal' : `Round (rr ${rr})`;
  return `Round ${maxRR - rr + 1}`;
};

// Teams in a stage's lobby. The Final is a 1v1 (2 teams); every qualifying
// round is a 4-team lobby. (Confirmed: only the Final shows positions 1–2.)
export const stageTeams = (rr) => (rr === 0 ? 2 : 4);

// A FINALS ranked tournament is an 8-team bracket:
//   Round 1 (rr 2) — two parallel 4-team lobbies; top 2 of each advance.
//   Round 2 (rr 1) — one 4-team lobby of the 4 survivors; top 2 advance.
//   Final   (rr 0) — 1v1; winner 1st, loser 2nd.
// Overall placement out of 8 = the furthest round reached (MIN rounds-remaining)
// + the lobby position there. The two Round-1 lobbies run in parallel and are
// not cross-ranked, so a Round-1 exit resolves only to a tied range.
export const TOURNAMENT_SIZE = 8;
export function tournamentPlacement(furthestRR, posThere, hasPrelim = false, tournamentWon = false) {
  if (furthestRR == null) return null;
  // Deeper, non-standard brackets (a round with rr >= 3) aren't an 8-team draw,
  // so don't fabricate an "of 8" placement for them.
  if (hasPrelim || furthestRR > 2) return null;
  const of = TOURNAMENT_SIZE;
  // The Final is a 1v1, so the RESULT alone fixes the placement — recover it even
  // when that round logged no LeaderboardPosition (a handful of Finals record the
  // 0 "not populated" sentinel, and dropping them loses an exact 1st/2nd).
  if (furthestRR === 0) {
    const place = posThere ?? (tournamentWon ? 1 : 2);
    return { label: place === 1 ? '1st' : '2nd', of, place };
  }
  if (posThere == null) return null;
  if (furthestRR === 1) {
    // Reached Round 2 but not the Final -> eliminated 3rd/4th (top 2 advanced).
    if (posThere >= 3) return { label: posThere === 3 ? '3rd' : '4th', of, place: posThere };
    return { label: 'Top 2 — advanced', of, place: null }; // won R2 but no Final round recorded
  }
  // furthestRR === 2 -> eliminated in Round 1.
  if (posThere === 3) return { label: '5th–6th', of, place: null };
  if (posThere >= 4) return { label: '7th–8th', of, place: null };
  return { label: 'Top 2 — advanced', of, place: null }; // won R1 but no later round recorded
}
