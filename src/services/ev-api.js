import { apiFetch, ApiError, logApiCall } from "./apiService";
import { currentSeasonKey, SEASONS } from "../services/historicalDataService";
import { getCacheItem, setCacheItem } from "./idbCache";

const getCacheKey = (seasonKey) => `events_cache_${seasonKey || currentSeasonKey}`;

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
    // Endpoint is /events/{X} for historical seasons.
    const season = SEASONS[effectiveSeasonKey];
    const endpoint = `/events/${season.id}`;

    // Use the updated apiFetch to get both data and headers.
    const { data: result, headers } = await apiFetch(endpoint, { returnHeaders: true });
    const responseTime = Date.now() - startTime;
    
    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Invalid events data received from API');
    }

    // Read the 'Expires' header to determine cache lifetime.
    const expiresHeader = headers.get('Expires');
    // If header exists and is a valid date, use it. Otherwise, default to a short 60s cache.
    const expiresAt = expiresHeader && !isNaN(new Date(expiresHeader)) 
      ? new Date(expiresHeader).getTime() 
      : Date.now() + 60 * 1000;

    const clientCacheTtl = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    
    // Use the new cache service with the TTL derived from the Expires header
    await setCacheItem(cacheKey, result, clientCacheTtl);

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