import { getLeagueInfo } from "../utils/leagueUtils";
import { apiFetch, logApiCall } from "./apiService";
import { getCacheItem, setCacheItem } from "./idbCache";

const CACHE_KEY = 'leaderboard_cache';

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
    // 1. Check for fresh client cache from IndexedDB
    const cachedEntry = await getCacheItem(CACHE_KEY);

    if (cachedEntry) {
      const cachePayload = cachedEntry.data; // The full API response is in the 'data' property
      const source = cachePayload.source === 'kv-cache-fallback' ? 'client-cache-fallback' : 'client-cache';
      const remainingTtl = Math.floor((cachedEntry.expiresAt - Date.now()) / 1000);
      
      logApiCall(source, {
        groupName: 'Leaderboard',
        timestamp: cachePayload.timestamp,
        remainingTtl,
        responseTime: 0
      });
      return {
        data: transformData(cachePayload.data),
        source,
        timestamp: cachePayload.timestamp * 1000,
        remainingTtl,
        expiresAt: cachedEntry.expiresAt,
      };
    }

    // 2. Fetch from the network
    const startTime = Date.now();
    // Use the updated apiFetch to get both data and headers
    const { data: result, headers } = await apiFetch('/leaderboard', { returnHeaders: true });
    const responseTime = Date.now() - startTime;
    
    if (!result.data) {
      throw new Error('No data in API response');
    }

    const transformedData = transformData(result.data);
    const timestampMs = result.timestamp * 1000;

    // Read the 'Expires' header to determine cache lifetime.
    const expiresHeader = headers.get('Expires');
    // If header exists and is a valid date, use it. Otherwise, default to a short 2-minute cache.
    const expiresAtMs = expiresHeader && !isNaN(new Date(expiresHeader)) 
      ? new Date(expiresHeader).getTime() 
      : Date.now() + 120 * 1000;
    
    const remainingTtl = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));

    logApiCall(result.source, {
      groupName: 'Leaderboard',
      timestamp: result.timestamp,
      remainingTtl: remainingTtl,
      responseTime
    });

    // Store the entire API result in the client cache with the calculated TTL.
    await setCacheItem(CACHE_KEY, result, remainingTtl);

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
    // Use the new getter with ignoreExpiration to get stale data if it exists.
    const emergencyCache = await getCacheItem(CACHE_KEY, { ignoreExpiration: true });
    if (emergencyCache && emergencyCache.data) {
      const cachePayload = emergencyCache.data;
      const source = 'client-cache-emergency';
      const remainingTtl = 120; // 2 minutes (RETRY_DELAY_MS - edit in conjunction)
      const newExpiresAt = Date.now() + remainingTtl * 1000;

      logApiCall(source, {
        groupName: 'Leaderboard',
        timestamp: cachePayload.timestamp,
        remainingTtl,
        responseTime: 0
      });
      return {
        data: transformData(cachePayload.data),
        source,
        timestamp: cachePayload.timestamp * 1000,
        remainingTtl,
        expiresAt: newExpiresAt,
      };
    }
    
    // 4. If all fails, throw the error
    throw error;
  }
};