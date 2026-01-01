import { apiFetch, ApiError, logApiCall, calculateClientCacheTtl } from "./apiService";
import { currentSeasonKey, SEASONS } from "../services/historicalDataService";
import { getCacheItem, setCacheItem } from "./idbCache";

const getCacheKey = (seasonKey) => `events_cache_${seasonKey || currentSeasonKey}`;

const transformEventData = (event, seasonKey) => {
  return {
    ...event,
    seasonKey: seasonKey, // Attach source season for context-aware actions
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
      });
      // The cached item's data is already structured correctly.
      return { 
        ...cached.data, 
        data: cached.data.data.map(e => transformEventData(e, effectiveSeasonKey)), 
        expiresAt: cached.expiresAt,
        timestamp: cached.data.timestamp * 1000,
      };
    }
  }

  try {
    // Endpoint is /events/{X} for historical seasons.
    const season = SEASONS[effectiveSeasonKey];
    const endpoint = `/events/${season.id}`;

    // Use the updated apiFetch to get both data and headers.
    const { data: result, headers } = await apiFetch(endpoint, { returnHeaders: true });
    
    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Invalid events data received from API');
    }

    // Use new centralized TTL calculator.
    const ttlForCache = calculateClientCacheTtl(headers, 30, `events (Season ${effectiveSeasonKey})`);
    
    // Use the new cache service with the TTL derived from the Expires header
    await setCacheItem(cacheKey, result, ttlForCache);

    logApiCall(result.source || 'Direct', {
      groupName: `Events (Season: ${effectiveSeasonKey})`,
      timestamp: result.timestamp,
      remainingTtl: ttlForCache,
    });

    return {
      ...result,
      data: result.data.map(e => transformEventData(e, effectiveSeasonKey)), // Transform data for consistency
      expiresAt: Date.now() + (ttlForCache * 1000),
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

export const fetchAllSeasonsEvents = async (forceRefresh = false) => {
  // Identify all seasons that support events, excluding the 'ALL' aggregate key if it exists conceptually
  const validSeasons = Object.keys(SEASONS).filter(key => 
    SEASONS[key].hasEvents && !SEASONS[key].isAggregate
  );

  try {
    // Execute fetches in parallel.
    // NOTE: Historical seasons will likely hit the IDB cache instantly. 
    // Only the current season is likely to hit the API network.
    const resultsPromises = validSeasons.map(key => 
      fetchRecentEvents(forceRefresh, key)
        .then(res => ({ ...res, seasonKey: key })) // Attach key to result wrapper for identification
        .catch(err => {
          console.warn(`Failed to fetch events for subset season ${key} in aggregate view:`, err);
          return { data: [], expiresAt: 0, seasonKey: key }; // Fail gracefully for individual seasons
        })
    );

    const results = await Promise.all(resultsPromises);

    // Flatten all data arrays
    const allEvents = results.flatMap(r => r.data);

    // We only want the UI to auto-refresh based on the *Current Season's* lifecycle.
    
    const currentSeasonResult = results.find(r => r.seasonKey === currentSeasonKey);
    
    let aggregateExpiresAt;

    if (currentSeasonResult && currentSeasonResult.expiresAt > Date.now()) {
      // Scenario A: Current season fetched successfully. use its expiry.
      aggregateExpiresAt = currentSeasonResult.expiresAt;
    } else {
      // Scenario B: Current season failed (expiresAt is 0/undefined), set a short "Error Retry" TTL of 30 seconds.
      aggregateExpiresAt = Date.now() + 30000;
    }

    return {
      data: allEvents,
      expiresAt: aggregateExpiresAt,
      timestamp: Date.now(), // Timestamp of the aggregation
    };
  } catch (error) {
    console.error('Failed to aggregate all season events:', error);
    throw error;
  }
};