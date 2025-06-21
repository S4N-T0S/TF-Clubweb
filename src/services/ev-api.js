import { apiFetch, logApiCall } from "./apiService";

const transformEventData = (event) => {
  return {
    ...event,
    // Ensure timestamps are JS Date objects for easier use in components
    startTimestamp: new Date(event.start_timestamp * 1000),
    endTimestamp: event.end_timestamp ? new Date(event.end_timestamp * 1000) : null,
  };
};

export const fetchRecentEvents = async (limit = 100) => {
  // The backend endpoint doesn't currently use the limit, but this makes the frontend ready if it does.
  const endpoint = `/events?limit=${limit}`;

  try {
    const startTime = Date.now();
    const result = await apiFetch(endpoint);
    const responseTime = Date.now() - startTime;
    
    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Invalid events data received from API');
    }

    logApiCall('Direct', {
      groupName: 'Recent Events',
      responseTime,
    });

    return {
      ...result,
      data: result.data.map(transformEventData), // Transform data for consistency
    };

  } catch (error) {
    console.error('Failed to fetch recent events:', error);
    throw error; // Re-throw to be handled by the calling component
  }
};