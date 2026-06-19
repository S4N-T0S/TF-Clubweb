// Game metadata + classifiers for RoundStat records

// CharacterArchetype -> class label.
export const ARCHETYPES = {
  DA_Archetype_Small: 'Light',
  DA_Archetype_Medium: 'Medium',
  DA_Archetype_Heavy: 'Heavy',
};
export const archetypeLabel = (raw) => ARCHETYPES[raw] || (raw ? 'Unknown' : '—');

// Internal map codename -> display name
export const MAP_NAMES = {
  Monaco: 'Monaco',
  Seoul: 'Seoul',
  LasVegas: 'Las Vegas',
  Kyoto: 'Kyoto',
  Arena: 'Arena (Stadium)',
  Bernal: 'Bernal',
  BayCity: 'Bay City',
  Forest: 'Forest (TDM)',
  Village: 'Village (TDM)',
  Playground: 'Practice Range',
  HeavyHitters: 'Heavy Hitters',
  CashBall: 'Cashball',
};

// Parse "DA_MV_Seoul_01_Base" -> { map: 'Seoul', variant: 'Base', display }
export const parseMapVariant = (mv) => {
  if (!mv) return { map: null, variant: null, display: '—' };
  const m = /^DA_MV_([A-Za-z]+)_(\d+)_?(.*)$/.exec(mv);
  if (!m) return { map: mv, variant: null, display: mv };
  const code = m[1];
  const variant = m[3] || 'Base';
  return { map: code, variant, display: MAP_NAMES[code] || code };
};

// Parse "DA_EC_Arena_01_Night" or bare "Night" -> a friendly condition string
export const parseCondition = (ec) => {
  if (!ec) return null;
  if (!ec.startsWith('DA_EC_')) return ec; // older bare format e.g. "Night"
  const parts = ec.split('_');
  return parts[parts.length - 1] || ec;
};

// Top-level categories used for the match-history mode filter
export const MODE_CATEGORIES = ['Ranked', 'World Tour', 'Casual', 'LTM', 'Other'];

// The named modes players actually care about in the current rotation — used to
// label the Career mode breakdown / pie and the Matches mode filter. Everything
// not one of these (older casual modes, the various LTMs, the practice range,
// unknown scenarios) collapses into "Other".
export const CAREER_MODE_GROUPS = ['Ranked', 'World Tour', 'Cash Out', 'Team Deathmatch', 'Power Shift', 'Point Break'];

// Map a classified mode (from classifyMode) to one of the CAREER_MODE_GROUPS or
// "Other". Ranked / World Tour are whole categories; the rest key off the mode
// label. "Cash Out" = the casual Cashout mode (Quick Cash); Ranked Cashout and
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
      return 'Cash Out';
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
  // TENTATIVE 184486584 looks like TDM
  // (2-team, S9-S10, respawn-heavy 1492 vs only 313 revives, ~11 kills/round).
  // Possibly a seasonal TDM variant; NOT yet wiki-confirmed.
  '184486584': { label: 'Team Deathmatch', category: 'Casual', teams: 2 },
  '157494085': { label: 'Head2Head', category: 'Casual', teams: 2 },
  '211556165': { label: 'Point Break', category: 'Casual', teams: 2 }, // Starlight Hollow, S10
  '686266668': { label: 'Terminal Attack', category: 'Casual', teams: 2 }, // attack/defend (user-confirmed)
  '531991356': { label: 'Ranked Terminal Attack', category: 'Ranked', teams: 2 }, // S3's ranked was Terminal Attack — verified: 0 revives, 0 defib kills, single 2-team "0-0" match (no bracket), fills the Jul-Aug 2024 gap in Ranked Cashout
  // Limited-time modes.
  '639859186': { label: 'Blast Off!', category: 'LTM', teams: 2 }, // Bernal "Fog"
  '152796620': { label: 'Heavy Hitters', category: 'LTM', teams: 2 }, // on the Playground/HeavyHitters arena
  '905608807': { label: 'Super Cashball', category: 'LTM', teams: 2 }, // user
  '473424892': { label: 'Steal the Spotlight', category: 'LTM', teams: 12 }, // user — old big-lobby LTM
  '805886560': { label: 'Ghoul Rush', category: 'LTM', teams: 11 }, // user — Halloween LTM (aka Haunted Harvest)
  '420165069': { label: 'Smoking Guns', category: 'LTM', teams: 4 }, // user — Monaco-only LTM
  '704866484': { label: 'Close Quarters', category: 'LTM', teams: 2 }, // user — P.E.A.C.E. Center LTM
  // Bunny Bash = a Power Shift event LTM that recurs. S2 (267894133, Horizon-only)
  // and S6+ (597953832, returns S10) — verified by the S6→gap→S10 date pattern + maps.
  '267894133': { label: 'Bunny Bash', category: 'LTM', teams: 2 }, // user — S2
  '597953832': { label: 'Bunny Bash', category: 'LTM', teams: 2 }, // user-hypothesis, data-verified — S6+
  '787538704': { label: 'Ranked (S1)', category: 'Ranked', teams: 4 }, // pre-World-Tour ranked
  '377270267': { label: 'Ranked (S1)', category: 'Ranked', teams: 4 }, // pre-World-Tour ranked
  '106717113': { label: 'Snowball Blitz', category: 'LTM', teams: 2 }, // user — winter event, Monaco + Snowball weapon
  // A few S3–S5 World Tour ids (the rest live in WORLD_TOUR_SCENARIOS below).
  '296178816': { label: 'World Tour', category: 'World Tour', teams: 4 },
  '211390302': { label: 'World Tour', category: 'World Tour', teams: 4 },
  '970363916': { label: 'World Tour', category: 'World Tour', teams: 4 },
  '425956530': { label: 'World Tour', category: 'World Tour', teams: 4 },
  '496014728': { label: 'World Tour', category: 'World Tour', teams: 4 },
};

// World Tour = the seasonal casual TOURNAMENT (4-team bracket). Ranked has used
// the single persistent ScenarioID 498553443 every season since S3, so EVERY
// OTHER 4-team 100%-tournament ScenarioID (from the S3 launch, 2024-06-13, on) is
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
]);

// Maps that, by themselves, identify a Limited-Time Mode.
const LTM_MAPS = {
  HeavyHitters: 'Heavy Hitters',
  CashBall: 'Cashball',
};

/**
 * Best-effort classification of a single RoundStat.Data into a mode + category.
 * Returns { label, category, teams, confirmed }.
 */
export const classifyMode = (data) => {
  if (!data) return { label: 'Unknown', category: 'Other', teams: null, confirmed: false };

  const known = SCENARIO_MODES[String(data.ScenarioID)];
  if (known) return { ...known, confirmed: true };
  if (WORLD_TOUR_SCENARIOS.has(String(data.ScenarioID))) return { label: 'World Tour', category: 'World Tour', teams: 4, confirmed: true };

  const { map } = parseMapVariant(data.MapVariant);
  const cond = parseCondition(data.EnvironmentalCondition);
  const hasTournament = data.TournamentID != null && data.TournamentID !== '';
  const teams = typeof data.LeaderboardPosition === 'number' ? data.LeaderboardPosition : null;

  // Map-based LTM detection (independent of scenario id).
  if (map && LTM_MAPS[map]) return { label: LTM_MAPS[map], category: 'LTM', teams, confirmed: false };
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
export function tournamentPlacement(furthestRR, posThere, hasPrelim = false) {
  if (posThere == null || furthestRR == null) return null;
  // Deeper, non-standard brackets (a round with rr >= 3) aren't an 8-team draw,
  // so don't fabricate an "of 8" placement for them.
  if (hasPrelim || furthestRR > 2) return null;
  const of = TOURNAMENT_SIZE;
  if (furthestRR === 0) return { label: posThere === 1 ? '1st' : '2nd', of, place: posThere };
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
