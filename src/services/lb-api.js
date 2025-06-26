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
        expiresAt,
        remainingTtl: Math.floor((expiresAt - now) / 1000),
        source
      };
    }
    
    return {
      data,
      timestamp,
      expiresAt,
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
        remainingTtl: cachedData.remainingTtl,
        expiresAt: cachedData.expiresAt,
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
    let expiresAtMs = result.expiresAt * 1000;
    let remainingTtl;

    // If the data source is a fallback, override the expiry to force a retry in 2 minutes.
    // This prevents a stale 'expiresAt' from the fallback from halting the auto-refresh loop.
    if (result.source === 'kv-cache-fallback') {
      expiresAtMs = Date.now() + 120 * 1000;
    }

    remainingTtl = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));

    logApiCall(result.source, {
      groupName: 'Leaderboard',
      timestamp: result.timestamp,
      remainingTtl: remainingTtl,
      responseTime
    });

    // Store data in client cache with the potentially overridden expiry time.
    setCacheData(result.data, timestampMs, expiresAtMs, result.source);

    return {
      data: transformedData,
      source: result.source,
      timestamp: timestampMs,
      remainingTtl: remainingTtl,
      expiresAt: expiresAtMs,
    };

  } catch (error) {
    // 3. Fallback to emergency cache on network failure
    console.error("Leaderboard fetch failed, checking for emergency cache.", error);
    const cachedData = getCachedData();
    if (cachedData) {
      const source = 'client-cache-emergency';
      const remainingTtl = 120; // 2 minutes (RETRY_DELAY_MS - edit in conjunction)
      const newExpiresAt = Date.now() + remainingTtl * 1000;

      logApiCall(source, {
        groupName: 'Leaderboard',
        timestamp: cachedData.timestamp,
        remainingTtl,
        responseTime: 0
      });
      return {
        data: transformData(cachedData.data),
        source,
        timestamp: cachedData.timestamp,
        remainingTtl,
        expiresAt: newExpiresAt,
      };
    }
    
    // 4. If all fails, throw the error
    throw error;
  }
};