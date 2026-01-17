import { fetchWithRetry } from './apiService';
import { getCacheItem, setCacheItem } from './idbCache';

// Storing club members in a google sheets to reduce pointless commits on GitHub.
const CLUB_MEMBERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9bH84oHf5vPtElxeJyS4n4oHDPe7cm-_zYkFF0aX4ELf2rq37X6G6QEmrRvmnD16Afb7anaB2AVzC/pub?output=csv';
const CACHE_KEY = 'club_members_sheet';
const CACHE_TTL = 60 * 60; // 1 hour

function parseCsvData(csvText) {
  return csvText
    .split('\n')
    .slice(1) // Skip header row
    .filter(Boolean)
    .map(row => {
      const [embarkId] = row.split(',');
      return {
        embarkId: embarkId?.trim() || null,
        //discord: discord?.trim() || null -- Discord Link Removed.
      };
    })
    .filter(player => player.embarkId !== null && player.embarkId !== ''); // Filter out entries where embarkId is null or empty
};

export async function fetchClubMembers() {
  try {
    // Try to get data from cache first
    const cached = await getCacheItem(CACHE_KEY);
    if (cached) {
      return cached.data;
    }

    // If not cached, fetch from network
    const csvText = await fetchWithRetry(CLUB_MEMBERS_CSV_URL);
    const data = parseCsvData(csvText);
    
    // Store in cache
    await setCacheItem(CACHE_KEY, data, CACHE_TTL);
    
    return data;
  } catch (error) {
    console.error('Error fetching club members:', error);
    // If fetch fails, try to return stale cache if available
    const staleCache = await getCacheItem(CACHE_KEY, { ignoreExpiration: true });
    if (staleCache) {
        console.warn('Returning stale club members data due to fetch error.');
        return staleCache.data;
    }
    return [];
  }
};