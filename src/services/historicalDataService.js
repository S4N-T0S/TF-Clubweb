import { getLeagueInfo } from '../utils/leagueUtils';
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
  S5: { id: 5, data: S5Data, label: 'Season 5', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1735429827, endTimestamp: 1742498648, rubyCutoff: 49750, hasEvents: true },
  S6: { id: 6, data: S6Data, label: 'Season 6', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1742502488, endTimestamp: 1749721922, rubyCutoff: 50347, hasEvents: true },
  S7: { id: 7, data: S7Data, label: 'Season 7', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1749734705, endTimestamp: 1757514600, rubyCutoff: 51701, hasEvents: true },
  S8: { id: 8, data: S8Data, label: 'Season 8', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1757516400, endTimestamp: 1765375200, rubyCutoff: 52044, hasEvents: true },
  S9: { id: 9, data: S9Data, label: 'Season 9', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1765382400, endTimestamp: 1774535400, rubyCutoff: 54132, hasEvents: true },
  S10: { id: 10, data: null, label: 'Season 10', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1774535400, endTimestamp: null, rubyCutoff: null, hasEvents: true, isCurrent: true }
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