import OBData from '../data/Betas/OB-crossplay.json';
import S1Data from '../data/S1/S1-merged.json';
import S2Data from '../data/S2/S2-merged.json';
import S3Data from '../data/S3/S3-crossplay.json';
import S4Data from '../data/S4/S4-crossplay.json';
import S5Data from '../data/S5/S5-crossplay.json';

const SEASONS = {
  OB: { data: OBData, label: 'Open Beta', hasRuby: false, hasRankScore: true, scoreKey: 'fame' },
  S1: { data: S1Data, label: 'Season 1', hasRuby: false, hasRankScore: true, scoreKey: 'fame' },
  S2: { data: S2Data, label: 'Season 2', hasRuby: false, hasRankScore: false },
  S3: { data: S3Data, label: 'Season 3', hasRuby: true, hasRankScore: true, scoreKey: 'rankScore' },
  S4: { data: S4Data, label: 'Season 4', hasRuby: true, hasRankScore: true, scoreKey: 'rankScore' },
  S5: { data: S5Data, label: 'Season 5', hasRuby: true, hasRankScore: true, scoreKey: 'rankScore' },
  S6: { data: null, label: 'Season 6', hasRuby: true, hasRankScore: true, scoreKey: 'rankScore', isCurrent: true }
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

const processResult = (result, seasonConfig, searchType, originalEmbarkId) => ({
  season: seasonConfig.label,
  rank: result.rank,
  league: result.league,
  score: seasonConfig.hasRankScore ? result[seasonConfig.scoreKey] : undefined,
  name: result.name || '',
  steamName: result.steamName || '',
  psnName: result.psnName || '',
  xboxName: result.xboxName || '',
  foundViaSteamName: searchType === 'steam' && (!result.name || result.name.toLowerCase() !== originalEmbarkId.toLowerCase()),
  isTop500: (result.rank <= 500) && !seasonConfig.hasRuby
});

const getSeasonData = async (season, currentSeasonData) => {
  if (season.isCurrent && !season.data) {
    season.data = { data: currentSeasonData };
  }
  return season.data?.data || [];
};

export const searchPlayerHistory = async (embarkId, currentSeasonData = null) => {
  const allResults = new Map();
  const platformNames = { steam: new Set(), psn: new Set(), xbox: new Set() };

  // Process all seasons including current
  for (const [, seasonConfig] of Object.entries(SEASONS)) {
    const currentsSeason = await getSeasonData(seasonConfig, currentSeasonData);
    
    // Search by Embark ID and collect platform names
    const embarkResults = filterPlayers(currentsSeason, embarkId, 'embarkId');
    
    embarkResults.forEach(result => {
      if (result.steamName) platformNames.steam.add(result.steamName);
      if (result.psnName) platformNames.psn.add(result.psnName);
      if (result.xboxName) platformNames.xbox.add(result.xboxName);
      
      const resultKey = `${seasonConfig.label}-${result.name}-${result.steamName}-${result.psnName}-${result.xboxName}`;
      if (!allResults.has(resultKey)) {
        allResults.set(resultKey, processResult(result, seasonConfig, 'embarkId', embarkId));
      }
    });
  }

  // Search by platform names across all seasons
  const searchPlatformNames = async (names, type) => {
    for (const [, seasonConfig] of Object.entries(SEASONS)) {
      const currentsSeason = await getSeasonData(seasonConfig, currentSeasonData);
      
      for (const name of names) {
        const platformResults = filterPlayers(currentsSeason, name, type);
        
        platformResults.forEach(result => {
          const resultKey = `${seasonConfig.label}-${result.name}-${result.steamName}-${result.psnName}-${result.xboxName}`;
          if (!allResults.has(resultKey)) {
            allResults.set(resultKey, processResult(result, seasonConfig, type, embarkId));
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
  const seasonOrder = ['Open Beta', 'Season 1', 'Season 2', 'Season 3', 'Season 4', 'Season 5', 'Season 6'];
  return Array.from(allResults.values()).sort((a, b) => 
    seasonOrder.indexOf(a.season) - seasonOrder.indexOf(b.season)
  );
};