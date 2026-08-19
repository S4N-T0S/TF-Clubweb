import { apiFetch, ApiError, logApiCall, calculateClientCacheTtl } from "./apiService";
import { currentSeasonKey, SEASONS } from "../services/historicalDataService";
import { getCacheItem, setCacheItem } from "./idbCache";

const getCacheKey = (seasonKey) => `events_cache_${seasonKey || currentSeasonKey}`;

// The events view groups, sorts and searches the whole multi-season feed eagerly, so a row it
// cannot handle takes down the view even if it is never paginated into sight. Rows that fail
// this check are dropped before they are cached, otherwise a reload just replays the poison.
const isValidEventRow = (event) =>
  !!event &&
  typeof event === 'object' &&
  typeof event.event_type === 'string' &&
  Number.isFinite(event.start_timestamp);

const transformEventData = (event, seasonKey) => {
  if (!isValidEventRow(event)) return null;

  return {
    ...event,
    // Renderers and filters destructure details unconditionally, so it must be an object.
    details: (event.details && typeof event.details === 'object') ? event.details : {},
    seasonKey: seasonKey, // Attach source season for context-aware actions
    // Ensure timestamps are JS Date objects for easier use in components
    startTimestamp: new Date(event.start_timestamp * 1000),
    // `> 0` keeps epoch 0 meaning "unresolved", matching the raw-field truthiness checks the
    // graph hooks still apply. Number.isFinite additionally rejects the NaN and string cases
    // that truthiness let through as an Invalid Date.
    endTimestamp: Number.isFinite(event.end_timestamp) && event.end_timestamp > 0
      ? new Date(event.end_timestamp * 1000)
      : null,
  };
};

// Also guards the cache-read paths, which can still hold rows written before this validation.
const transformEvents = (rows, seasonKey) =>
  (Array.isArray(rows) ? rows : [])
    .map((event) => transformEventData(event, seasonKey))
    .filter(Boolean);

export const fetchRecentEvents = async (forceRefresh = false, seasonKey = null) => {
  const effectiveSeasonKey = seasonKey || currentSeasonKey;
  const cacheKey = getCacheKey(effectiveSeasonKey);
  
  // 1. Check for fresh client cache from IndexedDB
  // Skip this step if forceRefresh is true
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
        data: transformEvents(cached.data.data, effectiveSeasonKey),
        expiresAt: cached.expiresAt,
        timestamp: cached.data.timestamp * 1000,
      };
    }
  }

  try {
    // Endpoint is /events/{X} for historical seasons.
    const season = SEASONS[effectiveSeasonKey];
    const endpoint = `/events/${season.id}`;

    // 2. Fetch from Network
    // If forceRefresh is true, we use 'reload' to bypass the browser's HTTP cache.
    const fetchOptions = { 
        returnHeaders: true,
        cache: forceRefresh ? 'reload' : 'default'
    };

    // Use the updated apiFetch to get both data and headers.
    const { data: result, headers } = await apiFetch(endpoint, fetchOptions);
    
    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Invalid events data received from API');
    }

    // Use new centralized TTL calculator.
    const ttlForCache = calculateClientCacheTtl(headers, 30, `events (Season ${effectiveSeasonKey})`);

    // Cache the raw rows that passed validation, never the untouched response.
    const validRows = result.data.filter(isValidEventRow);
    if (validRows.length !== result.data.length) {
      console.warn(`Dropped ${result.data.length - validRows.length} malformed event row(s) for season ${effectiveSeasonKey}.`);
    }

    // Use the new cache service with the TTL derived from the Expires header
    await setCacheItem(cacheKey, { ...result, data: validRows }, ttlForCache);

    logApiCall(result.source || 'Direct', {
      groupName: `Events (Season: ${effectiveSeasonKey})`,
      timestamp: result.timestamp,
      remainingTtl: ttlForCache,
    });

    return {
      ...result,
      data: transformEvents(validRows, effectiveSeasonKey), // Transform data for consistency
      expiresAt: Date.now() + (ttlForCache * 1000),
      timestamp: result.timestamp * 1000,
    };

  } catch (error) {
    // Log the error unless it's a custom ApiError we've already handled.
    if (!(error instanceof ApiError)) {
        console.error(`Failed to fetch events for season ${effectiveSeasonKey}:`, error);
    }
    
    // If network fails (even on forceRefresh), try to return stale cache if it exists.
    const staleCache = await getCacheItem(cacheKey, { ignoreExpiration: true });
    if (staleCache) {
        console.warn(`Returning stale event cache for season ${effectiveSeasonKey} due to network error.`);
        return {
            ...staleCache.data,
            data: transformEvents(staleCache.data.data, effectiveSeasonKey),
            expiresAt: Date.now() + 30000, // Short TTL for stale data
            timestamp: staleCache.data.timestamp * 1000,
        };
    }

    throw error; // Re-throw if no fallback is possible
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
        .then(res => ({ ...res, seasonKey: key, success: true })) // Attach key to result wrapper for identification
        .catch(err => {
          console.warn(`Failed to fetch events for subset season ${key} in aggregate view:`, err);
          return { data: [], expiresAt: 0, seasonKey: key, success: false }; // Fail gracefully for individual seasons
        })
    );

    const results = await Promise.all(resultsPromises);
    
    // Identify failed seasons to report back to UI
    const failedSeasons = results.filter(r => !r.success).map(r => r.seasonKey);

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
      failedSeasons // Pass this up so the UI can display a toast
    };
  } catch (error) {
    console.error('Failed to aggregate all season events:', error);
    throw error;
  }
};