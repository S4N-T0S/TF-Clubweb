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

export const SEASONS = {
  ALL: { label: 'All Seasons', isAggregate: true },
  OB: { id: 0, data: OBData, label: 'Open Beta', hasRuby: false, hasRankScore: true, isGraphable: false },
  S1: { id: 1, data: S1Data, label: 'Season 1', hasRuby: false, hasRankScore: true, isGraphable: false },
  S2: { id: 2, data: S2Data, label: 'Season 2', hasRuby: false, hasRankScore: false, isGraphable: false },
  S3: { id: 3, data: S3Data, label: 'Season 3', hasRuby: true, hasRankScore: true, isGraphable: false, rubyCutoff: 63929 },
  S4: { id: 4, data: S4Data, label: 'Season 4', hasRuby: true, hasRankScore: true, isGraphable: false, rubyCutoff: 46543 },
  S5: { id: 5, data: S5Data, label: 'Season 5', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1735429827, endTimestamp: 1742498648, rubyCutoff: 49750 },
  S6: { id: 6, data: S6Data, label: 'Season 6', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1742502488, endTimestamp: 1749721922, rubyCutoff: 50347 },
  S7: { id: 7, data: S7Data, label: 'Season 7', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1749734705, endTimestamp: 1757514600, rubyCutoff: 51701, hasEvents: true },
  S8: { id: 8, data: S8Data, label: 'Season 8', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1757516400, endTimestamp: 1765375200, rubyCutoff: 52044, hasEvents: true },
  S9: { id: 9, data: null, label: 'Season 9', hasRuby: true, hasRankScore: true, isGraphable: true, startTimestamp: 1765382400, endTimestamp: null, rubyCutoff: null, hasEvents: true, isCurrent: true}
};

export const currentSeasonKey = Object.keys(SEASONS).find(key => SEASONS[key].isCurrent);

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

const filterPlayers = (players, searchQuery, searchType) => {
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
  
  while (searchQueue.length > 0) {
    const { type, value, isWeakChain } = searchQueue.shift();
    
    const checkValue = type === 'embarkId' ? value.toLowerCase() : value;
    
    if (visited[type].has(checkValue)) continue;
    visited[type].add(checkValue);

    for (const [seasonKey, seasonConfig] of Object.entries(SEASONS)) {
      const currentSeasonPlayers = getSeasonData(seasonConfig, currentSeasonData);
      
      if (!currentSeasonPlayers) continue;

      const matches = filterPlayers(currentSeasonPlayers, value, type);
      
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
  
  return Array.from(allResults.values()).sort((a, b) => 
    seasonOrder.indexOf(a.season) - seasonOrder.indexOf(b.season)
  );
};