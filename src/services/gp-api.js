import { apiFetch, logApiCall, API } from "./apiService";
import { getStoredCacheItem, setStoredCacheItem } from "./localStorageManager";

const CACHE_TTL_SECONDS = 60; // 1 minute TTL on client-side cache

export const fetchGraphData = async (embarkId, seasonId = null) => {
  // A unique key for caching, including the season
  const cacheKey = `graph_cache_${seasonId ? `${embarkId}@${seasonId}` : embarkId}`;

  // Check for a valid, non-expired cache entry.
  const cachedEntry = getStoredCacheItem(cacheKey);
  if (cachedEntry) {
    logApiCall('Client Cache', {
      groupName: 'Player Graph',
      embarkId,
      timestamp: cachedEntry.data.timestamp,
      remainingTtl: Math.floor((cachedEntry.expiresAt - Date.now()) / 1000),
      responseTime: 0,
    });
    // Return the data property of the cached entry.
    return cachedEntry.data;
  }

  try {
    const startTime = Date.now();
    const body = {
      token: API.AUTH_TOKEN,
      embarkId,
    };
    if (seasonId) {
      body.seasonId = seasonId;
    }

    const result = await apiFetch('/graph', {
      method: 'POST',
      body,
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!result.data) {
      throw new Error('No graph data received from API');
    }

    logApiCall(result.source || 'Direct', {
      groupName: 'Player Graph',
      embarkId,
      responseTime,
      timestamp: result.timestamp
    });
    
    // Store the new result with an expiration timestamp using the centralized manager.
    setStoredCacheItem(cacheKey, result, CACHE_TTL_SECONDS);
    
    // Return the fresh data from the API call.
    return result;

  } catch (error) {
    console.error(`Failed to fetch graph data for ${embarkId}:`, error);
    // Re-throw the original error to be handled by the component
    throw error;
  }
};