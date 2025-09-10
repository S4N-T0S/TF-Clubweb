import { API, ApiError, logApiCall } from "./apiService";
import { currentSeasonKey, SEASONS } from "../services/historicalDataService";
import { getStoredCacheItem, setStoredCacheItem } from "./localStorageManager";

const getCacheKey = (seasonKey) => `events_cache_${seasonKey || currentSeasonKey}`;

const parseCacheControl = (header) => {
    if (!header) return 60; // Default to 60 seconds if no header
    const maxAgeMatch = header.match(/max-age=(\d+)/);
    return maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 60;
};

const transformEventData = (event) => {
  return {
    ...event,
    // Ensure timestamps are JS Date objects for easier use in components
    startTimestamp: new Date(event.start_timestamp * 1000),
    endTimestamp: event.end_timestamp ? new Date(event.end_timestamp * 1000) : null,
  };
};

export const fetchRecentEvents = async (forceRefresh = false, seasonKey = null) => {
  const effectiveSeasonKey = seasonKey || currentSeasonKey;
  const cacheKey = getCacheKey(effectiveSeasonKey);
  
  if (!forceRefresh) {
    const cached = getStoredCacheItem(cacheKey);
    if (cached) {
      logApiCall('Client Cache', {
        groupName: `Events (Season: ${effectiveSeasonKey})`,
        timestamp: cached.data.timestamp,
        remainingTtl: Math.floor((cached.expiresAt - Date.now()) / 1000),
        responseTime: 0,
      });
      // The cached item's data is already structured correctly.
      return { ...cached.data, data: cached.data.data.map(transformEventData), expiresAt: cached.expiresAt };
    }
  }

  try {
    const startTime = Date.now();
    // Use native fetch to access response headers for caching logic.
    // Endpoint is /events for current season, and /events/{X} for historical.
    const season = SEASONS[effectiveSeasonKey];
    const endpoint = `/events/${season.id}`;
    const response = await fetch(`${API.BASE_URL}${endpoint}`);

    if (!response.ok) {
      let errorDetails = `Request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetails = errorData.message || errorData.error || JSON.stringify(errorData);

      } catch (_err) {
        errorDetails = await response.text();
      }
      throw new ApiError(`API Error on ${endpoint}: ${errorDetails}`, response.status, errorDetails);
    }

    const result = await response.json();
    const responseTime = Date.now() - startTime;
    
    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Invalid events data received from API');
    }

    // Use Cache-Control header to set the client cache duration.
    const cacheControl = response.headers.get('Cache-Control');
    const maxAge = parseCacheControl(cacheControl);
    
    // Use the new centralized cache setter
    setStoredCacheItem(cacheKey, result, maxAge);
    const expiresAt = Date.now() + maxAge * 1000;

    logApiCall(result.source || 'Direct', {
      groupName: `Events (Season: ${effectiveSeasonKey})`,
      responseTime,
      timestamp: result.timestamp,
      remainingTtl: maxAge,
    });

    return {
      ...result,
      data: result.data.map(transformEventData), // Transform data for consistency
      expiresAt,
    };

  } catch (error) {
    // Log the error unless it's a custom ApiError we've already handled.
    if (!(error instanceof ApiError)) {
        console.error(`Failed to fetch events for season ${effectiveSeasonKey}:`, error);
    }
    throw error; // Re-throw to be handled by the calling component
  }
};