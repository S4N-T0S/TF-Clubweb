import { API, ApiError, logApiCall } from "./apiService";
import { currentSeasonKey, SEASONS } from "../services/historicalDataService";
import { getCacheItem, setCacheItem } from "./idbCache";

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
    const cached = await getCacheItem(cacheKey);
    if (cached) {
      logApiCall('Client Cache', {
        groupName: `Events (Season: ${effectiveSeasonKey})`,
        timestamp: cached.data.timestamp,
        remainingTtl: Math.floor((cached.expiresAt - Date.now()) / 1000),
        responseTime: 0,
      });
      // The cached item's data is already structured correctly.
      return { 
        ...cached.data, 
        data: cached.data.data.map(transformEventData), 
        expiresAt: cached.expiresAt,
        timestamp: cached.data.timestamp * 1000,
      };
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

    const cacheControl = response.headers.get('Cache-Control');
    let clientCacheTtl;

    // For older seasons, set a static 30-minute cache. For the current season, respect the API's header.
    if (effectiveSeasonKey !== currentSeasonKey) {
      clientCacheTtl = 30 * 60; // 30 minutes in seconds
    } else {
      clientCacheTtl = parseCacheControl(cacheControl);
    }
    
    // Use the new cache service with the determined TTL
    await setCacheItem(cacheKey, result, clientCacheTtl);
    const expiresAt = Date.now() + clientCacheTtl * 1000;

    logApiCall(result.source || 'Direct', {
      groupName: `Events (Season: ${effectiveSeasonKey})`,
      responseTime,
      timestamp: result.timestamp,
      remainingTtl: clientCacheTtl,
    });

    return {
      ...result,
      data: result.data.map(transformEventData), // Transform data for consistency
      expiresAt,
      timestamp: result.timestamp * 1000,
    };

  } catch (error) {
    // Log the error unless it's a custom ApiError we've already handled.
    if (!(error instanceof ApiError)) {
        console.error(`Failed to fetch events for season ${effectiveSeasonKey}:`, error);
    }
    throw error; // Re-throw to be handled by the calling component
  }
};