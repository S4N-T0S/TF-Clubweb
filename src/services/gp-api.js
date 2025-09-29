import { apiFetch, logApiCall, API } from "./apiService";
import { getCacheItem, setCacheItem } from "./idbCache";

const CACHE_TTL_SECONDS = 60; // 1 minute TTL on client-side cache

export const fetchGraphData = async (embarkId, seasonId = null) => {
  // A unique key for caching, including the season
  const cacheKey = `graph_cache_${seasonId ? `${embarkId}@${seasonId}` : embarkId}`;

  // Check for a valid, non-expired cache entry.
  const cachedEntry = await getCacheItem(cacheKey);
  if (cachedEntry) {
    const cachedData = cachedEntry.data;
    logApiCall('Client Cache', {
      groupName: 'Player Graph',
      embarkId,
      timestamp: cachedData.timestamp,
      remainingTtl: Math.floor((cachedEntry.expiresAt - Date.now()) / 1000),
    });
    // Return the data property of the cached entry, converting timestamp to ms.
    return { ...cachedData, timestamp: cachedData.timestamp * 1000 };
  }

  try {
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
    
    if (!result.data) {
      throw new Error('No graph data received from API');
    }

    logApiCall(result.source || 'Direct', {
      groupName: 'Player Graph',
      embarkId,
      timestamp: result.timestamp
    });
    
    // Store the new result with an expiration timestamp using the new cache service.
    await setCacheItem(cacheKey, result, CACHE_TTL_SECONDS);
    
    // Return the fresh data from the API call, converting timestamp to ms.
    return { ...result, timestamp: result.timestamp * 1000 };

  } catch (error) {
    console.error(`Failed to fetch graph data for ${embarkId}:`, error);
    // Re-throw the original error to be handled by the component
    throw error;
  }
};