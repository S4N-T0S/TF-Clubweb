import { apiFetch, calculateClientCacheTtl, logApiCall, ApiError } from "./apiService";
import { getCacheItem, setCacheItem } from "./idbCache";

// 20 minute fallback TTL, realistically the ttl will be decided by the backend
const CACHE_TTL_SECONDS = 1200;

// Keep in sync with the prefix cleared in useLeaderboard.js
export const IDENTITY_CACHE_PREFIX = 'identity_cache_';

// Encode a value for an identity URL path
const encodeForPath = (s) => encodeURIComponent(s).replace(/%23/g, '+');

/**
 * Fetches a player's full cross-season identity profile from GET /identity.
 * Returns null when the player has no data in our backend (S5-live) so callers
 * can fall back to the client-side BFS over the static JSON snapshots.
 *
 * @param {string} embarkId - Any embark id the player has used.
 * @returns {Promise<object|null>} The profile payload, or null if not found.
 */
export const fetchIdentity = async (embarkId) => {
  const cacheKey = `${IDENTITY_CACHE_PREFIX}${embarkId?.toLowerCase()}`;

  const cachedEntry = await getCacheItem(cacheKey);
  if (cachedEntry) {
    logApiCall('Client Cache', {
      groupName: 'Player Identity',
      embarkId,
      remainingTtl: Math.floor((cachedEntry.expiresAt - Date.now()) / 1000),
    });
    return cachedEntry.data;
  }

  try {
    const endpoint = `/identity/${encodeForPath(embarkId)}`;
    const { data, headers } = await apiFetch(endpoint, { returnHeaders: true });

    logApiCall('Direct', { groupName: 'Player Identity', embarkId });

    const ttl = calculateClientCacheTtl(headers, CACHE_TTL_SECONDS, 'identity');
    await setCacheItem(cacheKey, data, ttl);
    return data;
  } catch (error) {
    // A thrown ApiError means we DID reach the backend and it answered with an HTTP
    // status (404/405 = this id simply isn't in our S5-live data) — that is NOT
    // "offline", so swallow it and let the caller fall back to the client BFS.
    // Anything else (a failed fetch: no network, DNS, CORS) means the backend was
    // unreachable — rethrow so resolveIdentity can flag the whole result as offline.
    if (!(error instanceof ApiError)) throw error;
    if (error.status !== 404 && error.status !== 405) {
      console.warn(`Identity profile fetch failed for ${embarkId} (status ${error.status}).`);
    }
    return null;
  }
};

/**
 * Cross-season username autofill via GET /identity/search. Degrades to an empty
 * list on any failure so the caller can fall back to its local suggestions.
 *
 * @param {string} q - The partial name typed by the user (min 2 chars).
 * @param {number} [limit=10] - Max suggestions to return (capped server-side).
 * @returns {Promise<Array<{name:string, latestSeasonId:number|null, latestRankScore:number|null, latestRank:number|null}>>}
 */
export const searchIdentities = async (q, limit = 10) => {
  const query = (q || '').replace(/[/\\]/g, '').trim();
  if (query.length < 2) return [];

  try {
    // The server returns a fixed-size set; we slice to the caller's limit
    const endpoint = `/identity/search/${encodeForPath(query)}`;
    const result = await apiFetch(endpoint);
    const results = Array.isArray(result?.results) ? result.results : [];
    return results.slice(0, limit);
  } catch (error) {
    // Autofill is non-critical; degrade silently to the local fallback. Network/
    // CORS errors and 404/405 (undeployed endpoint) are expected; only warn on
    // genuinely unexpected API statuses (e.g. 5xx).
    if (error instanceof ApiError && error.status !== 404 && error.status !== 405) {
      console.warn(`Identity autofill failed for "${query}" (status ${error.status}).`);
    }
    return [];
  }
};
