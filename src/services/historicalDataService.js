import { getLeagueInfo } from '../utils/leagueUtils';
import { aggregateClubs } from '../utils/dataProcessing';
import { parseSearchQuery, matchesParsedPlayer } from '../utils/searchUtils';
import { fetchIdentity, searchIdentities } from './id-api';
import OBData from '../data/Betas/OB-crossplay.json';
import S1Data from '../data/S1/S1-merged.json';
import S2Data from '../data/S2/S2-merged.json';
import S3Data from '../data/S3/S3-crossplay.json';
import S4Data from '../data/S4/S4-crossplay.json';
import S5Data from '../data/S5/S5-crossplay.json';
import S6Data from '../data/S6/S6-crossplay.json';
import S7Data from '../data/S7/S7-crossplay.json';
import S8Data from '../data/S8/S8-crossplay.json';
import S9Data from '../data/S9/S9-crossplay.json';

export const SEASONS = {
  ALL: { label: 'All Seasons', isAggregate: true },
  OB: { id: 0, data: OBData, label: 'Open Beta', hasRuby: false, hasRankScore: true, isGraphable: false },
  S1: { id: 1, data: S1Data, label: 'Season 1', hasRuby: false, hasRankScore: true, isGraphable: false },
  S2: { id: 2, data: S2Data, label: 'Season 2', hasRuby: false, hasRankScore: false, isGraphable: false },
  S3: { id: 3, data: S3Data, label: 'Season 3', hasRuby: true, hasRankScore: true, isGraphable: false, rubyCutoff: 63929 },
  S4: { id: 4, data: S4Data, label: 'Season 4', hasRuby: true, hasRankScore: true, isGraphable: false, rubyCutoff: 46543 },
  S5: { id: 5, data: S5Data, label: 'Season 5', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1735429827, endTimestamp: 1742498648, rubyCutoff: 49750, hasClubs: true, hasEvents: true }, // Our service began tracking 2 weeks into the season. Season Started 2024-12-12
  S6: { id: 6, data: S6Data, label: 'Season 6', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1742502488, endTimestamp: 1749721922, rubyCutoff: 50347, hasClubs: true, hasEvents: true },
  S7: { id: 7, data: S7Data, label: 'Season 7', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1749734705, endTimestamp: 1757514600, rubyCutoff: 51701, hasClubs: true, hasEvents: true },
  S8: { id: 8, data: S8Data, label: 'Season 8', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1757516400, endTimestamp: 1765375200, rubyCutoff: 52044, hasClubs: true, hasEvents: true },
  S9: { id: 9, data: S9Data, label: 'Season 9', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1765382400, endTimestamp: 1774535400, rubyCutoff: 54132, hasClubs: true, hasEvents: true },
  S10: { id: 10, data: null, label: 'Season 10', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1774535400, endTimestamp: null, rubyCutoff: null, hasClubs: true, hasEvents: true, isCurrent: true }
};

export const currentSeasonKey = Object.keys(SEASONS).find(key => SEASONS[key].isCurrent); // Reminder: update CF worker when season changes

// Known outages of Embark's ranked leaderboard servers. (end of outage timestamp)
export const SERVER_DOWNTIMES = [
  { timestamp: 1780571955, durationHours: 45 },
  { timestamp: 1773393510, durationHours: 17 },
  { timestamp: 1773905836, durationHours: 45 },
  { timestamp: 1773331350, durationHours: 21 },
  { timestamp: 1757948908, durationHours: 7 },
  { timestamp: 1755986731, durationHours: 19 },
  { timestamp: 1751716380, durationHours: 8 },
  { timestamp: 1750666711, durationHours: 8 },
  { timestamp: 1745520973, durationHours: 7 },
  { timestamp: 1744895294, durationHours: 14 },
  { timestamp: 1743936731, durationHours: 8 },
];

export const getSeasonLeaderboard = (seasonKey) => {
  const season = SEASONS[seasonKey];
  if (!season || !season.data) return { leaderboard: [] };

  const leaderboard = season.data.data
    .map(player => ({
      rank: player.rank,
      change: 0, // No need to pass this
      name: player.name || 'Unknown#0000',
      steamName: player.steamName || null,
      psnName: player.psnName || null,
      xboxName: player.xboxName || null,
      clubTag: player.clubTag || null,
      leagueNumber: player.leagueNumber !== undefined ? player.leagueNumber : 0,
      league: getLeagueInfo(player.leagueNumber).name,
      rankScore: player.rankScore || 0
    }))
    // Filter entries with no valid names
    .filter(player => 
      !(player.name === 'Unknown#0000' && 
        !player.steamName && 
        !player.psnName && 
        !player.xboxName)
    );

  return { leaderboard };
};

// Top clubs for a historical season, aggregated from that season's leaderboard.
// The current season has no static data (data: null) — callers pass the live
// `topClubs` instead. Returns [] for seasons before clubs existed (pre-S5).
export const getSeasonClubs = (seasonKey) => {
  const season = SEASONS[seasonKey];
  if (!season || !season.hasClubs || !season.data) return [];
  return aggregateClubs(getSeasonLeaderboard(seasonKey).leaderboard);
};

export const getAllSeasonsLeaderboard = (currentSeasonData) => {
  const allData = Object.entries(SEASONS)
    // Filter out 'ALL' and the current season (as it's passed in fresh)
    .filter(([key, season]) => key !== 'ALL' && !season.isCurrent && season.data)
    .flatMap(([key]) => {
      const seasonData = getSeasonLeaderboard(key).leaderboard;
      return seasonData.map(p => ({ ...p, season: key }));
    });

  return {
    leaderboard: [
      ...allData,
      ...(currentSeasonData || []).map(p => ({ ...p, season: currentSeasonKey }))
    ]
  };
};

const filterPlayers = (players, searchQuery, searchType, ambiguousXbox) => {
  // Xbox accounts can be shared between players (commonly for cross-account
  // rewards), so if the queried Xbox name has 2+ bearers in this season's
  // leaderboard, refuse to match on it at all — anyone "linked" through
  // it would just be a random co-holder.
  if (searchType === 'xbox' && ambiguousXbox?.has(searchQuery)) return [];

  const query = searchQuery.toLowerCase();
  return players.filter(player => {
    switch(searchType) {
      case 'embarkId': return player.name?.toLowerCase() === query;
      case 'steam': return player.steamName === searchQuery;
      case 'psn': return player.psnName === searchQuery;
      case 'xbox': return player.xboxName === searchQuery;
      default: return false;
    }
  });
};

const processResult = (result, seasonConfig, originalEmbarkId, seasonKey, isWeakLink) => ({
  season: seasonConfig.label,
  seasonKey: seasonKey,
  rank: result.rank,
  league: result.league || getLeagueInfo(result.leagueNumber).name,
  leagueNumber: result.leagueNumber,
  score: seasonConfig.hasRankScore ? result.rankScore : undefined,
  clubTag: result.clubTag || '',
  name: result.name || 'Unknown#0000',
  steamName: result.steamName || '',
  psnName: result.psnName || '',
  xboxName: result.xboxName || '',
  foundViaSteamName: isWeakLink && (!result.name || result.name.toLowerCase() !== originalEmbarkId.toLowerCase()),
  isTop500: (result.rank <= 500) && !seasonConfig.hasRuby
});

const getSeasonData = (season, currentSeasonData) => {
  if (season.isCurrent) {
    // For the current season, always use the fresh data passed from the main app state.
    // This prevents using stale data from a mutated global SEASONS object.
    return currentSeasonData || [];
  }
  // For historical seasons, use the statically imported JSON data.
  return season.data?.data || [];
};

export const searchPlayerHistory = async (initialEmbarkId, currentSeasonData = null) => {
  const allResults = new Map();
  
  // Track visited identifiers to prevent infinite loops and re-searches.
  const visited = {
    embarkId: new Set(),
    steam: new Set(),
    psn: new Set(),
    xbox: new Set()
  };

  // Queue for Breadth-First Search (BFS).
  // 'isWeakChain' tracks if we are currently traversing a path dependent on a Steam link.
  const searchQueue = [{ type: 'embarkId', value: initialEmbarkId, isWeakChain: false }];

  // Per-season set of Xbox names with 2+ bearers in the full leaderboard.
  // Precomputed once so the BFS can cheaply skip ambiguous Xbox links and
  // the post-processing can reuse the same map for anchor logic.
  const ambiguousXboxBySeason = new Map();
  for (const [seasonKey, seasonConfig] of Object.entries(SEASONS)) {
    const players = getSeasonData(seasonConfig, currentSeasonData);
    if (!players || players.length === 0) continue;
    const counts = new Map();
    for (const p of players) {
      if (!p.xboxName) continue;
      counts.set(p.xboxName, (counts.get(p.xboxName) || 0) + 1);
    }
    const amb = new Set();
    for (const [name, count] of counts) {
      if (count > 1) amb.add(name);
    }
    if (amb.size > 0) ambiguousXboxBySeason.set(seasonKey, amb);
  }

  while (searchQueue.length > 0) {
    const { type, value, isWeakChain } = searchQueue.shift();
    
    const checkValue = type === 'embarkId' ? value.toLowerCase() : value;
    
    if (visited[type].has(checkValue)) continue;
    visited[type].add(checkValue);

    for (const [seasonKey, seasonConfig] of Object.entries(SEASONS)) {
      const currentSeasonPlayers = getSeasonData(seasonConfig, currentSeasonData);
      
      if (!currentSeasonPlayers) continue;

      const matches = filterPlayers(currentSeasonPlayers, value, type, ambiguousXboxBySeason.get(seasonKey));
      
      for (const player of matches) {
        const resultKey = `${seasonConfig.label}-${player.name}-${player.steamName}-${player.psnName}-${player.xboxName}`;
        
        // Logic to determine if this specific finding is "Weak" (needs warning).
        // 1. System arrived here via a previous weak link (isWeakChain = true)
        // 2. OR system arrived here specifically via Steam (the current step is the weak link)
        // 3. AND the Embark ID does not match the original search (which would "heal" the chain)
        
        const isSteamStep = type === 'steam';
        const isOriginalIdentity = player.name && player.name.toLowerCase() === initialEmbarkId.toLowerCase();
        
        const isResultWeak = (isWeakChain || isSteamStep) && !isOriginalIdentity;

        // If result exists, we only overwrite if the new finding is 'Stronger' (not weak) than the old one.
        const existing = allResults.get(resultKey);
        
        if (!existing || (existing.foundViaSteamName && !isResultWeak)) {
          allResults.set(resultKey, processResult(player, seasonConfig, initialEmbarkId, seasonKey, isResultWeak));

          if (player.name) {
             const nextVal = player.name;
             if (!visited.embarkId.has(nextVal.toLowerCase())) {
               searchQueue.push({ type: 'embarkId', value: nextVal, isWeakChain: isResultWeak });
             }
          }
          
          if (player.psnName && !visited.psn.has(player.psnName)) {
            searchQueue.push({ type: 'psn', value: player.psnName, isWeakChain: isResultWeak });
          }
          
          if (player.xboxName && !visited.xbox.has(player.xboxName)) {
            searchQueue.push({ type: 'xbox', value: player.xboxName, isWeakChain: isResultWeak });
          }

          // Steam last to prioritize other results, bugfix for unecessary UI warning
          if (player.steamName && !visited.steam.has(player.steamName)) {
            searchQueue.push({ type: 'steam', value: player.steamName, isWeakChain: isResultWeak });
          }
        }
      }
    }
  }
  
  // Sort results by season
  const seasonOrder = Object.values(SEASONS)
    .filter(s => s.label && s.id !== undefined && !s.isAggregate)
    .sort((a, b) => a.id - b.id)
    .map(s => s.label);

  const results = Array.from(allResults.values()).sort((a, b) =>
    seasonOrder.indexOf(a.season) - seasonOrder.indexOf(b.season)
  );

  // Mark "superseded" matches in three phases:
  //   A. Anchors. Build anchor rows in three layers of decreasing
  //      reliability — each layer can pull in extra known identifiers for
  //      the next:
  //        1. Embark name == searched ID (Embark IDs are unique)
  //        2. PSN name matches one collected from layer 1 (PSN unique)
  //        3. Xbox name matches one collected from layers 1-2 (ambiguous
  //           Xbox names were already filtered out of the BFS).
  //   B. Initial supersession. Inside the [min..max] anchor range, any
  //      non-anchor row is noise — the user IS identified in surrounding
  //      seasons, so a row here that can't be tied back is a different
  //      player. Also flag rows sharing an ambiguous Xbox with the user
  //      as a safety net.
  //   C. Propagation. A flagged row's unique identifiers (Embark name,
  //      PSN, non-ambiguous Xbox) belong to a known-different player, so
  //      any other row carrying those is that same player — even outside
  //      the anchor range. Walk the graph until stable.
  const initialIdLower = initialEmbarkId.toLowerCase();
  const anchors = new Set();
  const knownPsn = new Set();
  const knownXbox = new Set();

  // Layer 1: Embark name
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.name && r.name.toLowerCase() === initialIdLower) {
      anchors.add(i);
      if (r.psnName) knownPsn.add(r.psnName);
      if (r.xboxName) knownXbox.add(r.xboxName);
    }
  }
  // Layer 2: PSN
  for (let i = 0; i < results.length; i++) {
    if (anchors.has(i)) continue;
    const r = results[i];
    if (r.psnName && knownPsn.has(r.psnName)) {
      anchors.add(i);
      if (r.xboxName) knownXbox.add(r.xboxName);
    }
  }

  // Layer 3: Xbox, skipping seasons where the Xbox name is ambiguous
  for (let i = 0; i < results.length; i++) {
    if (anchors.has(i)) continue;
    const r = results[i];
    if (r.xboxName && knownXbox.has(r.xboxName)) {
      if (ambiguousXboxBySeason.get(r.seasonKey)?.has(r.xboxName)) continue;
      anchors.add(i);
    }
  }

  // Confirmed range across all anchors
  let minConfirmedId = Infinity;
  let maxConfirmedId = -Infinity;
  for (const i of anchors) {
    const id = SEASONS[results[i].seasonKey]?.id;
    if (id === undefined) continue;
    if (id < minConfirmedId) minConfirmedId = id;
    if (id > maxConfirmedId) maxConfirmedId = id;
  }

  // Flag superseded
  for (let i = 0; i < results.length; i++) {
    if (anchors.has(i)) continue;
    const r = results[i];
    const id = SEASONS[r.seasonKey]?.id;
    if (id === undefined) continue;

    // (a) Any non-anchor row inside the confirmed range. We already know
    // who the user is in these seasons (via Embark/PSN/Xbox anchors), so
    // anything else here is a different player — even if the BFS reached
    // it through a chain that didn't end up flagged as Steam-weak.
    if (
      minConfirmedId !== Infinity &&
      id >= minConfirmedId &&
      id <= maxConfirmedId
    ) {
      r.supersededByDirectMatch = true;
      continue;
    }

    // (b) Outside the confirmed range, but shares the user's Xbox in a
    // season where that Xbox is held by multiple players — can't use it
    // as a confirmation signal, so flag the row.
    if (
      r.xboxName &&
      knownXbox.has(r.xboxName) &&
      ambiguousXboxBySeason.get(r.seasonKey)?.has(r.xboxName)
    ) {
      r.supersededByDirectMatch = true;
    }
  }

  // Phase C: propagate supersession through unique identifiers. Build
  // identifier→rows lookup maps (Xbox entries only when non-ambiguous in
  // their season — that's the only case where the name uniquely identifies
  // its owner). Then BFS from every initially-flagged row, marking any
  // neighbour that isn't an anchor.
  const byEmbark = new Map();
  const byPsn = new Map();
  const byXbox = new Map();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.name) {
      const k = r.name.toLowerCase();
      let arr = byEmbark.get(k);
      if (!arr) { arr = []; byEmbark.set(k, arr); }
      arr.push(i);
    }
    if (r.psnName) {
      let arr = byPsn.get(r.psnName);
      if (!arr) { arr = []; byPsn.set(r.psnName, arr); }
      arr.push(i);
    }
    if (r.xboxName && !ambiguousXboxBySeason.get(r.seasonKey)?.has(r.xboxName)) {
      let arr = byXbox.get(r.xboxName);
      if (!arr) { arr = []; byXbox.set(r.xboxName, arr); }
      arr.push(i);
    }
  }

  const propQueue = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].supersededByDirectMatch) propQueue.push(i);
  }
  while (propQueue.length > 0) {
    const i = propQueue.shift();
    const r = results[i];
    const buckets = [];
    if (r.name) {
      const arr = byEmbark.get(r.name.toLowerCase());
      if (arr) buckets.push(arr);
    }
    if (r.psnName) {
      const arr = byPsn.get(r.psnName);
      if (arr) buckets.push(arr);
    }
    if (r.xboxName && !ambiguousXboxBySeason.get(r.seasonKey)?.has(r.xboxName)) {
      const arr = byXbox.get(r.xboxName);
      if (arr) buckets.push(arr);
    }
    for (const arr of buckets) {
      for (const j of arr) {
        if (anchors.has(j)) continue;
        if (results[j].supersededByDirectMatch) continue;
        results[j].supersededByDirectMatch = true;
        propQueue.push(j);
      }
    }
  }

  return results;
};

// Maps a backend season id (5-live) back to our SEASONS key (e.g. 5 -> 'S5').
const SEASON_ID_TO_KEY = Object.fromEntries(
  Object.entries(SEASONS)
    .filter(([, v]) => !v.isAggregate && v.id !== undefined)
    .map(([k, v]) => [v.id, k])
);

// Picks the client-BFS row that best represents the searched player for a
// season: a non-superseded row whose embark name matches, else any
// non-superseded row, else the first row.
const pickPrimaryClientRow = (rows, embarkId) => {
  if (!rows || rows.length === 0) return null;
  const lower = embarkId?.toLowerCase();
  return (
    rows.find((r) => !r.supersededByDirectMatch && r.name && r.name.toLowerCase() === lower) ||
    rows.find((r) => !r.supersededByDirectMatch) ||
    rows[0]
  );
};

// Direct lookup of an embark name in a closed season's final JSON snapshot — used
// when the BFS chain didn't reach the season. If the name is in the snapshot, that
// IS the authoritative final standing (the BFS just failed to link it). Returns a
// row shaped like a client-BFS row, or null when the name genuinely isn't there.
const findInSeasonSnapshot = (seasonKey, embarkId) => {
  const rows = SEASONS[seasonKey]?.data?.data;
  if (!rows || !embarkId) return null;
  const lower = embarkId.toLowerCase();
  const p = rows.find((x) => x.name && x.name.toLowerCase() === lower);
  if (!p) return null;
  return {
    rank: p.rank,
    leagueNumber: p.leagueNumber !== undefined ? p.leagueNumber : 0,
    league: getLeagueInfo(p.leagueNumber).name,
    score: SEASONS[seasonKey].hasRankScore ? (p.rankScore || 0) : undefined,
    clubTag: p.clubTag || '',
    name: p.name,
    steamName: p.steamName || '',
    psnName: p.psnName || '',
    xboxName: p.xboxName || '',
  };
};

/**
 * Merges an /identity API profile with the client BFS results over the static
 * JSON snapshots, producing rows in the same shape the SearchModal cards render.
 *
 * Precedence: the API is authoritative for S5-live linkage, event counts and
 * platform names. The JSON snapshot wins for the final
 * rank/league/club of CLOSED seasons, where it is the authoritative end
 * standing and heals S5's unreliable last-seen rank. OB-S4 comes solely from the
 * client BFS. Falls back to the raw client results when no profile is available.
 *
 * @param {object|null} apiProfile - The GET /identity payload, or null.
 * @param {Array<object>} clientResults - Rows from searchPlayerHistory.
 * @returns {Array<object>} Merged rows for rendering.
 */
export const mergeIdentityWithHistory = (apiProfile, clientResults, currentSeasonData = null) => {
  if (!apiProfile || !Array.isArray(apiProfile.seasons) || apiProfile.seasons.length === 0) {
    return clientResults;
  }

  // Is this exact name currently in the live top-10k? Used to tell a genuinely
  // live current-season position from a STALE last-seen one the API still holds
  // for a player who dropped off the live leaderboard a long time ago.
  const isLiveNow = (embarkId) => {
    if (!currentSeasonData || !embarkId) return false;
    const lower = embarkId.toLowerCase();
    return currentSeasonData.some((p) => p.name && p.name.toLowerCase() === lower);
  };

  // Group client rows by season key (the BFS can return several per season).
  const clientBySeasonKey = new Map();
  for (const row of clientResults) {
    if (!clientBySeasonKey.has(row.seasonKey)) clientBySeasonKey.set(row.seasonKey, []);
    clientBySeasonKey.get(row.seasonKey).push(row);
  }

  const merged = [];
  const apiSeasonKeys = new Set();

  for (const apiS of apiProfile.seasons) {
    const key = SEASON_ID_TO_KEY[apiS.seasonId];
    if (!key) continue;
    apiSeasonKeys.add(key);

    const seasonConfig = SEASONS[key];
    const isCurrent = !!seasonConfig?.isCurrent;
    // The client BFS chain can MISS a closed season (a renamer whose platform
    // names also changed breaks the link) even though the player is right there in
    // that season's snapshot. So fall back to a DIRECT name lookup in the snapshot:
    // a linkage gap is not a fall-off, and the snapshot is the authoritative final
    // standing if the name is in it. A genuine absence (truly fell off) stays null.
    const jsonRow = pickPrimaryClientRow(clientBySeasonKey.get(key), apiS.embarkId)
      || (isCurrent ? null : findInSeasonSnapshot(key, apiS.embarkId));
    // The JSON snapshot is the authoritative final standing for closed seasons.
    const useJson = !!jsonRow && !isCurrent;

    const rank = useJson ? jsonRow.rank : apiS.rank;
    const leagueNumber = useJson ? jsonRow.leagueNumber : apiS.leagueNumber;
    const score = useJson ? jsonRow.score : apiS.rankScore;
    const clubTag = isCurrent
      ? (apiS.clubTag || jsonRow?.clubTag || '')
      : (jsonRow?.clubTag || apiS.clubTag || '');

    merged.push({
      season: seasonConfig?.label || apiS.name,
      seasonKey: key,
      rank: rank ?? null,
      leagueNumber,
      league: getLeagueInfo(leagueNumber).name,
      score: score ?? undefined,
      clubTag,
      name: apiS.embarkId || jsonRow?.name || '',
      // Platforms: API value first (most complete in modern seasons), JSON fills gaps.
      steamName: apiS.platformNames?.steam || jsonRow?.steamName || '',
      psnName: apiS.platformNames?.psn || jsonRow?.psnName || '',
      xboxName: apiS.platformNames?.xbox || jsonRow?.xboxName || '',
      isTop500: !!(rank && rank <= 500 && !seasonConfig?.hasRuby),
      // Whether `rank` is an authoritative end-of-season standing (from the JSON
      // snapshot) or merely the last position the API saw before the player
      // dropped below the tracked top-10k. For a CLOSED season, useJson === false
      // means there is no final-snapshot row for them — i.e. they fell off mid/
      // late season and we do NOT know their true final standing. The UI uses
      // this to say "Last seen #X" instead of a misleading "Final #X".
      rankIsFinal: useJson,
      // For the current season only: is the player ACTUALLY in the live top-10k
      // right now? false => the API's rank is a stale last-seen value (they fell
      // off the live board), so the UI must not call it "live".
      liveTracked: isCurrent ? isLiveNow(apiS.embarkId) : undefined,
      // Profile enrichments from the API.
      eventCounts: apiS.eventCounts || {},
      nameChangeCount: Math.max(0, (apiS.nameHistory?.length || 1) - 1),
      // A season the API confirms in the QUERY'S OWN cluster is database-confirmed
      // truth, so the client BFS's heuristic "linked via Steam" warnings don't
      // apply (a renamer's seasons are always steam-bridged by the BFS, which would
      // otherwise paint every season yellow). The warnings only survive for seasons
      // pulled from a DIFFERENT cluster via a cross-cluster bridge (apiS.bridged),
      // or for client-BFS-only seasons (OB-S4, handled in the loop below).
      foundViaSteamName: apiS.bridged ? (jsonRow?.foundViaSteamName || false) : false,
      supersededByDirectMatch: apiS.bridged ? (jsonRow?.supersededByDirectMatch || false) : false,
    });
  }

  // Seasons the API does not cover (OB-S4, plus any it missed) come straight from
  // the client BFS, i.e. from the JSON final-standing snapshot — so their rank is
  // an authoritative final standing.
  for (const row of clientResults) {
    if (!apiSeasonKeys.has(row.seasonKey)) merged.push({ ...row, rankIsFinal: true });
  }

  // Ascending by season id to match the existing card order.
  merged.sort((a, b) => (SEASONS[a.seasonKey]?.id ?? 0) - (SEASONS[b.seasonKey]?.id ?? 0));
  return merged;
};

// Combine several /identity profiles for the SAME player into one
export const combineProfiles = (profiles) => {
  const valid = profiles.filter((p) => p && Array.isArray(p.seasons) && p.seasons.length);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];

  const seasonById = new Map();
  for (const p of valid) {
    for (const s of p.seasons) {
      if (!seasonById.has(s.seasonId)) seasonById.set(s.seasonId, s); // first profile wins
    }
  }
  // Seasons present in the FIRST profile are the query's own cluster (trusted);
  // any season only contributed by a later, bridge-pulled cluster is `bridged` so
  // the merge can keep a weak-link warning on it.
  const primarySeasonIds = new Set((valid[0].seasons || []).map((s) => s.seasonId));
  const seasons = [...seasonById.values()]
    .map((s) => ({ ...s, bridged: !primarySeasonIds.has(s.seasonId) }))
    .sort((a, b) => b.seasonId - a.seasonId); // descending
  const newestSeason = seasons[0];
  const oldestSeason = seasons[seasons.length - 1];

  // Union platform aliases across every profile.
  const platformAliases = { steam: [], psn: [], xbox: [] };
  const seenAlias = { steam: new Set(), psn: new Set(), xbox: new Set() };
  for (const p of valid) {
    for (const plat of ['steam', 'psn', 'xbox']) {
      for (const name of (p.platformAliases?.[plat] || [])) {
        if (name && !seenAlias[plat].has(name)) { seenAlias[plat].add(name); platformAliases[plat].push(name); }
      }
    }
  }

  // Recompute the aggregate from the union (best tracked across all seasons).
  let peakRank = null;
  let peakRankScore = null;
  for (const s of seasons) {
    if (typeof s.rank === 'number' && s.rank > 0 && (!peakRank || s.rank < peakRank.rank)) {
      peakRank = { rank: s.rank, seasonId: s.seasonId };
    }
    if (typeof s.rankScore === 'number' && s.rankScore > 0 && (!peakRankScore || s.rankScore > peakRankScore.rankScore)) {
      peakRankScore = { rankScore: s.rankScore, seasonId: s.seasonId };
    }
  }

  return {
    embarkId: newestSeason.embarkId,
    oldestAlias: oldestSeason.nameHistory?.[0]?.name || oldestSeason.embarkId,
    platformAliases,
    aggregate: { seasonsPlayed: seasons.length, peakRank, peakRankScore },
    seasons,
  };
};

/**
 * Full cross-season identity resolution. A single /identity call can be
 * incomplete when the backend failed to backlink a rename, so we:
 *   1. fetch the queried alias,
 *   2. run the client BFS (which bridges fragmented clusters via platform names),
 *   3. re-query the API on the NEWEST alias the BFS/API surfaced but we haven't
 *      tried yet (an embark id is unique, so this safely pulls that name's own,
 *      possibly forward-linked, cluster),
 * repeating (bounded) until no new alias appears. Then every profile is combined
 * and merged with the BFS rows. Degrades to the pure client BFS when the API has
 * nothing. Returns { profile, results } for the hero + timeline.
 */
export const resolveIdentity = async (query, currentSeasonData = null, { offline = false } = {}) => {
  const EARLIEST_API_SEASON = 5; // the backend has no data before Season 5
  const queried = new Set();
  const profiles = [];

  // offline = "old mode": skip every API call and resolve purely from the bundled
  // static JSON via the client BFS (works with no network). fetchProfile no-ops, so
  // profiles stays empty, combineProfiles returns null, and the merge falls through
  // to the client BFS results.
  let sawConnectionError = false; // a live fetch failed because the backend was unreachable
  const fetchProfile = async (alias) => {
    if (offline || !alias) return;
    const key = alias.toLowerCase();
    if (queried.has(key)) return;
    queried.add(key);
    let p = null;
    try { p = await fetchIdentity(alias); } catch { sawConnectionError = true; p = null; }
    if (p && Array.isArray(p.seasons) && p.seasons.length) profiles.push(p);
  };

  const haveSeason = (id) => profiles.some((p) => p.seasons.some((s) => s.seasonId === id));

  // 1. The queried alias's own cluster.
  await fetchProfile(query);

  // 2. Client BFS bridges fragmented clusters via platform names; seed with the
  //    oldest alias we know so it reaches the furthest-back static snapshot.
  const firstSeed = profiles[0]?.oldestAlias || query;
  let clientResults = await searchPlayerHistory(firstSeed, currentSeasonData);

  // 3. The per-season name from the API profiles + the (non-superseded) BFS rows.
  const bySeason = new Map();
  for (const p of profiles) for (const s of p.seasons) if (s.embarkId) bySeason.set(s.seasonId, s.embarkId);
  for (const r of clientResults) {
    if (r.supersededByDirectMatch) continue; // never chase a known-different player
    const id = SEASONS[r.seasonKey]?.id;
    if (id !== undefined && r.name && r.name !== 'Unknown#0000') bySeason.set(id, r.name);
  }

  // 4. Exactly two targeted extra queries — the NEWEST alias (pulls a forward-
  //    linked cluster the backend failed to backlink) and the OLDEST API-era alias
  //    (>= S5; pulls an earlier cluster). Each is skipped when our cluster already
  //    covers that season, and when the alias was already fetched — so a fully
  //    backlinked player makes zero extra calls. An embark id is unique, so a query
  //    on it can only return that exact player's cluster.
  const apiEra = [...bySeason.entries()].filter(([id]) => id >= EARLIEST_API_SEASON).sort((a, b) => a[0] - b[0]);
  if (apiEra.length) {
    const [newestId, newestAlias] = apiEra[apiEra.length - 1];
    const [oldestId, oldestAlias] = apiEra[0];
    if (!haveSeason(newestId)) await fetchProfile(newestAlias); // forward
    if (!haveSeason(oldestId)) await fetchProfile(oldestAlias); // backward
  }

  // 5. Combine; re-run the BFS once only if a pulled cluster pushed the oldest alias further back (so the static snapshots before it are reached too)
  const combined = combineProfiles(profiles);
  const finalSeed = combined?.oldestAlias || query;
  if (finalSeed.toLowerCase() !== firstSeed.toLowerCase()) {
    clientResults = await searchPlayerHistory(finalSeed, currentSeasonData);
  }

  const results = mergeIdentityWithHistory(combined, clientResults, currentSeasonData);
  const isOffline = offline || sawConnectionError || (typeof navigator !== 'undefined' && navigator.onLine === false);
  return { profile: combined, results, offline: isOffline };
};

// ---------------------------------------------------------------------------
// Client-side all-seasons autofill. The /identity/search backend only covers
// S5-live; this searches the bundled static JSON (OB-S9 + the live current
// season) so the autofill is TRULY all-seasons once merged + deduped with the
// API. Matches the same fields as the API (embark/steam/psn/xbox/club) via the
// shared bracket-aware matcher.
// ---------------------------------------------------------------------------
let _autofillIndex = null;
let _autofillIndexKey = null;
const getAutofillIndex = (currentSeasonData) => {
  if (_autofillIndex && _autofillIndexKey === currentSeasonData) return _autofillIndex;
  const all = getAllSeasonsLeaderboard(currentSeasonData).leaderboard;
  const byName = new Map();
  for (const p of all) {
    if (!p.name || p.name === 'Unknown#0000') continue;
    const seasonId = SEASONS[p.season]?.id ?? -1;
    const prev = byName.get(p.name);
    if (!prev || seasonId > prev.seasonId) {
      byName.set(p.name, {
        name: p.name,
        seasonId,
        rank: p.rank || null,
        rankScore: p.rankScore || null,
        steamName: p.steamName || '',
        psnName: p.psnName || '',
        xboxName: p.xboxName || '',
        clubTag: p.clubTag || '',
      });
    }
  }
  _autofillIndex = [...byName.values()];
  _autofillIndexKey = currentSeasonData;
  return _autofillIndex;
};

export const searchClientPlayers = (query, currentSeasonData = null, limit = 12) => {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const parsed = parseSearchQuery(q);
  const nq = parsed.nameQuery;
  const out = [];
  for (const e of getAutofillIndex(currentSeasonData)) {
    if (!matchesParsedPlayer(e, parsed)) continue;

    let matchedVia = 'embark';
    let matchedValue = null;
    if (nq) {
      if (e.name.toLowerCase().includes(nq)) matchedVia = 'embark';
      else if (e.steamName && e.steamName.toLowerCase().includes(nq)) { matchedVia = 'steam'; matchedValue = e.steamName; }
      else if (e.psnName && e.psnName.toLowerCase().includes(nq)) { matchedVia = 'psn'; matchedValue = e.psnName; }
      else if (e.xboxName && e.xboxName.toLowerCase().includes(nq)) { matchedVia = 'xbox'; matchedValue = e.xboxName; }
      else if (e.clubTag && e.clubTag.toLowerCase().includes(nq)) { matchedVia = 'club'; matchedValue = e.clubTag; }
    } else if (parsed.clubQuery !== null) {
      matchedVia = 'club';
      matchedValue = e.clubTag || null;
    }

    out.push({
      name: e.name,
      latestSeasonId: e.seasonId >= 0 ? e.seasonId : null,
      latestRank: e.rank,
      latestRankScore: e.rankScore,
      matchedVia,
      matchedValue,
      _startsWith: nq ? e.name.toLowerCase().startsWith(nq) : false,
      _seasonId: e.seasonId,
    });
  }
  // Prefix matches first, then most recent season.
  out.sort((a, b) => (b._startsWith ? 1 : 0) - (a._startsWith ? 1 : 0) || b._seasonId - a._seasonId);
  return out.slice(0, limit);
};

// The full all-seasons player search: the API (S5-live) merged with the client
// JSON search (OB-S9 + live), deduped by name with the API preferred. One source
// of truth for both the GlobalView autofill dropdown and the SearchModal result
// cards. Degrades to client-only when the API is unreachable.
export const searchAllPlayers = async (query, currentSeasonData = null, limit = 8) => {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  let apiResults = [];
  try { apiResults = await searchIdentities(q, limit); } catch { apiResults = []; }
  const clientResults = searchClientPlayers(q, currentSeasonData, 12);
  const seen = new Set();
  const merged = [];
  for (const r of [...apiResults, ...clientResults]) {
    const k = r.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(r);
  }
  return merged.slice(0, limit);
};