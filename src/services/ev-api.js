import { API, ApiError, logApiCall } from "./apiService";

const CACHE_KEY = 'events_cache';

const parseCacheControl = (header) => {
    if (!header) return 60; // Default to 60 seconds if no header
    const maxAgeMatch = header.match(/max-age=(\d+)/);
    return maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 60;
};

const getCachedEvents = () => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    try {
        const { data, expiresAt } = JSON.parse(cached);
        if (Date.now() < expiresAt) {
            return { data, expiresAt };
        }
        localStorage.removeItem(CACHE_KEY);
        return null;
    } catch {
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
};

const setCachedEvents = (data, maxAge) => {
    const expiresAt = Date.now() + maxAge * 1000;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, expiresAt }));
    return expiresAt;
};

const transformEventData = (event) => {
  return {
    ...event,
    // Ensure timestamps are JS Date objects for easier use in components
    startTimestamp: new Date(event.start_timestamp * 1000),
    endTimestamp: event.end_timestamp ? new Date(event.end_timestamp * 1000) : null,
  };
};

export const fetchRecentEvents = async (forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = getCachedEvents();
    if (cached) {
      logApiCall('Client Cache', {
        groupName: 'Recent Events',
        timestamp: cached.data.timestamp,
        remainingTtl: Math.floor((cached.expiresAt - Date.now()) / 1000),
        responseTime: 0,
      });
      // Correctly return both the cached data and the expiration time
      return { ...cached.data, data: cached.data.data.map(transformEventData), expiresAt: cached.expiresAt };
    }
  }

  try {
    const startTime = Date.now();
    // Use native fetch to access response headers for caching logic.
    const response = await fetch(`${API.BASE_URL}/events`);

    if (!response.ok) {
      let errorDetails = `Request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetails = errorData.message || errorData.error || JSON.stringify(errorData);

      // eslint-disable-next-line no-unused-vars
      } catch (_err) {
        errorDetails = await response.text();
      }
      throw new ApiError(`API Error on /events: ${errorDetails}`, response.status, errorDetails);
    }

    const result = await response.json();
    const responseTime = Date.now() - startTime;
    
    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Invalid events data received from API');
    }

    // Use Cache-Control header to set the client cache duration.
    const cacheControl = response.headers.get('Cache-Control');
    const maxAge = parseCacheControl(cacheControl);
    const expiresAt = setCachedEvents(result, maxAge);

    logApiCall(result.source || 'Direct', {
      groupName: 'Recent Events',
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
        console.error('Failed to fetch recent events:', error);
    }
    throw error; // Re-throw to be handled by the calling component
  }
};