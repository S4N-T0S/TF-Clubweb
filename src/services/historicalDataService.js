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

const processResult = (result, seasonConfig, searchType, originalEmbarkId, seasonKey) => ({
  season: seasonConfig.label,
  seasonKey: seasonKey,
  rank: result.rank,
  league: result.league || getLeagueInfo(result.leagueNumber).name,
  score: seasonConfig.hasRankScore ? result.rankScore : undefined,
  clubTag: result.clubTag || '',
  name: result.name || 'Unknown#0000',
  steamName: result.steamName || '',
  psnName: result.psnName || '',
  xboxName: result.xboxName || '',
  foundViaSteamName: searchType === 'steam' && (!result.name || result.name.toLowerCase() !== originalEmbarkId.toLowerCase()),
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

export const searchPlayerHistory = async (embarkId, currentSeasonData = null) => {
  const allResults = new Map();
  const platformNames = { steam: new Set(), psn: new Set(), xbox: new Set() };

  // Process all seasons including current
  for (const [seasonKey, seasonConfig] of Object.entries(SEASONS)) {
    const currentSeasonPlayers = getSeasonData(seasonConfig, currentSeasonData);
    
    // Search by Embark ID and collect platform names
    const embarkResults = filterPlayers(currentSeasonPlayers, embarkId, 'embarkId');
    
    embarkResults.forEach(result => {
      if (result.steamName) platformNames.steam.add(result.steamName);
      if (result.psnName) platformNames.psn.add(result.psnName);
      if (result.xboxName) platformNames.xbox.add(result.xboxName);
      
      const resultKey = `${seasonConfig.label}-${result.name}-${result.steamName}-${result.psnName}-${result.xboxName}`;
      if (!allResults.has(resultKey)) {
        allResults.set(resultKey, processResult(result, seasonConfig, 'embarkId', embarkId, seasonKey));
      }
    });
  }

  // Search by platform names across all seasons
  const searchPlatformNames = async (names, type) => {
    for (const [seasonKey, seasonConfig] of Object.entries(SEASONS)) {
      const currentSeasonPlayers = getSeasonData(seasonConfig, currentSeasonData);
      
      for (const name of names) {
        const platformResults = filterPlayers(currentSeasonPlayers, name, type);
        
        platformResults.forEach(result => {
          const resultKey = `${seasonConfig.label}-${result.name}-${result.steamName}-${result.psnName}-${result.xboxName}`;
          if (!allResults.has(resultKey)) {
            allResults.set(resultKey, processResult(result, seasonConfig, type, embarkId, seasonKey));
          }
        });
      }
    }
  };

  await Promise.all([
    searchPlatformNames(platformNames.psn, 'psn'),
    searchPlatformNames(platformNames.xbox, 'xbox'),
    searchPlatformNames(platformNames.steam, 'steam') // Steam last to prioritize other results, bugfix for unecessary UI warning
  ]);

  // Sort results by season
  const seasonOrder = Object.values(SEASONS)
    .filter(s => s.label && s.id !== undefined && !s.isAggregate)
    .sort((a, b) => a.id - b.id)
    .map(s => s.label);
  
  return Array.from(allResults.values()).sort((a, b) => 
    seasonOrder.indexOf(a.season) - seasonOrder.indexOf(b.season)
  );
};