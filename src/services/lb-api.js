import { getLeagueInfo } from "../utils/leagueUtils";
import { apiFetch, logApiCall } from "./apiService";

const CACHE_KEY = 'leaderboard_cache';

const getCachedData = () => {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return null;

  try {
    const { data, timestamp, expiresAt, source } = JSON.parse(cached);
    const now = Date.now();
    
    if (now < expiresAt) {
      return {
        data,
        timestamp,
        remainingTtl: Math.floor((expiresAt - now) / 1000),
        source
      };
    }
    
    return {
      data,
      timestamp,
      isStale: true,
      source
    };
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
};

const setCacheData = (data, timestamp, expiresAt, source) => {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    data,
    timestamp,
    expiresAt,
    source
  }));
};

const transformData = (rawData) => {
  return rawData.map(entry => {
    const transformed = {
      rank: entry.rank,
      change: entry.change,
      name: entry.name || 'Unknown#0000',
      steamName: entry.steamName || null,
      psnName: entry.psnName || null,
      xboxName: entry.xboxName || null,
      clubTag: entry.clubTag || null,
      leagueNumber: entry.leagueNumber,
      league: getLeagueInfo(entry.leagueNumber).name,
      rankScore: entry.rankScore
    };
    return transformed;
  });
};

export const fetchLeaderboardData = async () => {
  try {
    const cachedData = getCachedData();

    // 1. Check for fresh client cache
    if (cachedData && !cachedData.isStale) {
      const source = cachedData.source === 'kv-cache-fallback' ? 'client-cache-fallback' : 'client-cache';
      
      logApiCall(source, {
        groupName: 'Leaderboard',
        timestamp: cachedData.timestamp,
        remainingTtl: cachedData.remainingTtl,
        responseTime: 0
      });
      return {
        data: transformData(cachedData.data),
        source,
        timestamp: cachedData.timestamp,
        remainingTtl: cachedData.remainingTtl
      };
    }

    // 2. Fetch from the network
    const startTime = Date.now();
    const result = await apiFetch('/leaderboard');
    const responseTime = Date.now() - startTime;
    
    if (!result.data) {
      throw new Error('No data in API response');
    }

    const transformedData = transformData(result.data);
    
    const timestampMs = result.timestamp * 1000;
    const expiresAtMs = result.expiresAt * 1000;
    const remainingTtl = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));

    logApiCall(result.source, {
      groupName: 'Leaderboard',
      timestamp: result.timestamp,
      remainingTtl: remainingTtl,
      responseTime
    });

    setCacheData(result.data, timestampMs, expiresAtMs, result.source);

    return {
      data: transformedData,
      source: result.source,
      timestamp: timestampMs,
      remainingTtl: remainingTtl
    };

  } catch (error) {
    // 3. Fallback to emergency cache on network failure
    console.error("Leaderboard fetch failed, checking for emergency cache.", error);
    const cachedData = getCachedData();
    if (cachedData) {
      logApiCall('client-cache-emergency', { // This one was already correct
        groupName: 'Leaderboard',
        timestamp: cachedData.timestamp,
        remainingTtl: 120, // Assign a default TTL for emergency data
        responseTime: 0
      });
      return {
        data: transformData(cachedData.data),
        source: 'client-cache-emergency',
        timestamp: cachedData.timestamp,
        remainingTtl: 120
      };
    }
    
    // 4. If all fails, throw the error
    throw error;
  }
};