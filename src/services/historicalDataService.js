import S1Data from '../data/S1/S1-merged.json';
import S2Data from '../data/S2/S2-merged.json';
import S3Data from '../data/S3/S3-crossplay.json';
import S4Data from '../data/S4/S4-crossplay.json';
import OBData from '../data/Betas/OB-crossplay.json';
import { fetchLeaderboardData } from './lb-api';

const SEASONS = {
  S1: { data: S1Data, label: 'Season 1', hasRankScore: true, scoreKey: 'fame' },
  S2: { data: S2Data, label: 'Season 2', hasRankScore: false },
  S3: { data: S3Data, label: 'Season 3', hasRankScore: true, scoreKey: 'rankScore' },
  S4: { data: S4Data, label: 'Season 4', hasRankScore: true, scoreKey: 'rankScore' },
  OB: { data: OBData, label: 'Open Beta', hasRankScore: true, scoreKey: 'fame' }
};

const findPlayerInSeason = (season, searchQuery, searchType = 'embarkId') => {
  const { data: { data = [] } } = season;
  
  return data.filter(player => {
    if (searchType === 'embarkId') {
      return player.name?.toLowerCase() === searchQuery.toLowerCase();
    }
    if (searchType === 'steam') {
      return player.steamName === searchQuery;
    }
    if (searchType === 'psn') {
      return player.psnName === searchQuery;
    }
    if (searchType === 'xbox') {
      return player.xboxName === searchQuery;
    }
    return false;
  });
};

const findPlayerInCurrentSeason = (data, searchQuery, searchType = 'embarkId') => {
  return data.filter(player => {
    if (searchType === 'embarkId') {
      return player.name?.toLowerCase() === searchQuery.toLowerCase();
    }
    if (searchType === 'steam') {
      return player.steamName === searchQuery;
    }
    if (searchType === 'psn') {
      return player.psnName === searchQuery;
    }
    if (searchType === 'xbox') {
      return player.xboxName === searchQuery;
    }
    return false;
  });
};

const processResults = (results, seasonConfig, searchType, originalEmbarkId) => {
  return results.map(result => {
    const isOriginalEmbarkId = result.name?.toLowerCase() === originalEmbarkId.toLowerCase();
    const showRank = searchType === 'embarkId' || 
                    searchType === 'steam' || 
                    (result.name && isOriginalEmbarkId);

    return {
      season: seasonConfig.label,
      rank: result.rank,
      league: result.league,
      score: seasonConfig.hasRankScore ? result[seasonConfig.scoreKey] : undefined,
      name: result.name || '',
      steamName: result.steamName || '',
      psnName: result.psnName || '',
      xboxName: result.xboxName || '',
      foundViaSteamName: searchType === 'steam' && (!result.name || result.name.toLowerCase() !== originalEmbarkId.toLowerCase()),
      isTop500: showRank && (result.rank <= 500) && ['Season 1', 'Season 2', 'Open Beta'].includes(seasonConfig.label)
    };
  });
};

export const searchPlayerHistory = async (embarkId, cachedS5Data = null) => {
  const allResults = new Map();
  const platformNames = {
    steam: new Set(),
    psn: new Set(),
    xbox: new Set()
  };

  // Get current season data - use cached data if available
  const currentSeasonData = cachedS5Data ? { data: cachedS5Data } : await fetchLeaderboardData();
  const currentConfig = { label: 'Season 5', hasRankScore: true, scoreKey: 'rankScore' };

  // First pass: Search by Embark ID and collect ALL platform names
  // Include current season
  const currentEmbarkResults = findPlayerInCurrentSeason(currentSeasonData.data, embarkId, 'embarkId');
  currentEmbarkResults.forEach(result => {
    if (result.steamName) platformNames.steam.add(result.steamName);
    if (result.psnName) platformNames.psn.add(result.psnName);
    if (result.xboxName) platformNames.xbox.add(result.xboxName);
    
    const resultKey = `${currentConfig.label}-${result.name}-${result.steamName}-${result.psnName}-${result.xboxName}`;
    if (!allResults.has(resultKey)) {
      allResults.set(resultKey, processResults([result], currentConfig, 'embarkId', embarkId)[0]);
    }
  });

  // Historical seasons
  for (const [seasonKey, seasonConfig] of Object.entries(SEASONS)) {
    const embarkResults = findPlayerInSeason(seasonConfig, embarkId, 'embarkId');
    
    embarkResults.forEach(result => {
      if (result.steamName) platformNames.steam.add(result.steamName);
      if (result.psnName) platformNames.psn.add(result.psnName);
      if (result.xboxName) platformNames.xbox.add(result.xboxName);
      
      const resultKey = `${seasonConfig.label}-${result.name}-${result.steamName}-${result.psnName}-${result.xboxName}`;
      if (!allResults.has(resultKey)) {
        allResults.set(resultKey, processResults([result], seasonConfig, 'embarkId', embarkId)[0]);
      }
    });
  }

  // Second pass: Search for each platform name
  const searchPlatformNames = async (names, type) => {
    // Search current season
    for (const name of names) {
      const currentResults = findPlayerInCurrentSeason(currentSeasonData.data, name, type);
      currentResults.forEach(result => {
        const resultKey = `${currentConfig.label}-${result.name}-${result.steamName}-${result.psnName}-${result.xboxName}`;
        if (!allResults.has(resultKey)) {
          allResults.set(resultKey, processResults([result], currentConfig, type, embarkId)[0]);
        }
      });
    }

    // Search historical seasons
    for (const name of names) {
      for (const [seasonKey, seasonConfig] of Object.entries(SEASONS)) {
        const results = findPlayerInSeason(seasonConfig, name, type);
        results.forEach(result => {
          const resultKey = `${seasonConfig.label}-${result.name}-${result.steamName}-${result.psnName}-${result.xboxName}`;
          if (!allResults.has(resultKey)) {
            allResults.set(resultKey, processResults([result], seasonConfig, type, embarkId)[0]);
          }
        });
      }
    }
  };

  await Promise.all([
    searchPlatformNames(platformNames.steam, 'steam'),
    searchPlatformNames(platformNames.psn, 'psn'),
    searchPlatformNames(platformNames.xbox, 'xbox')
  ]);

  // Sort results by season
  const seasonOrder = ['Open Beta', 'Season 1', 'Season 2', 'Season 3', 'Season 4', 'Season 5'];
  return Array.from(allResults.values()).sort((a, b) => 
    seasonOrder.indexOf(a.season) - seasonOrder.indexOf(b.season)
  );
};