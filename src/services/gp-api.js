import { apiFetch, logApiCall, API } from "./apiService";

// Use a Map for session-level caching. It's cleared on page refresh.
const graphCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL on client-side cache

export const fetchPlayerGraphData = async (embarkId, seasonId = null) => {
  // A unique key for caching, including the season
  const cacheKey = seasonId ? `${embarkId}@${seasonId}` : embarkId;

  // Check for a valid, non-expired cache entry.
  if (graphCache.has(cacheKey)) {
    const cachedEntry = graphCache.get(cacheKey);
    if (Date.now() < cachedEntry.expiresAt) {
      logApiCall('Session Cache', {
        groupName: 'Player Graph',
        embarkId,
        responseTime: 0,
      });
      // Return the data property of the cached entry.
      return cachedEntry.data;
    }
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

    logApiCall('Direct', {
      groupName: 'Player Graph',
      embarkId,
      responseTime,
    });
    
    // Store the new result with an expiration timestamp.
    const cacheEntry = {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    graphCache.set(cacheKey, cacheEntry);
    
    // Return the fresh data from the API call.
    return result;

  } catch (error) {
    console.error(`Failed to fetch graph data for ${embarkId}:`, error);
    // Re-throw the original error to be handled by the component
    throw error;
  }
};