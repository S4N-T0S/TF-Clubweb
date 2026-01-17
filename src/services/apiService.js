// --- Configuration ---
const useLocalApi = import.meta.env.MODE === 'dev_local';

export const API = {
  BASE_URL: useLocalApi ? 'http://localhost:3000' : 'https://api.ogclub.s4nt0s.eu',
  AUTH_TOKEN: 'not-secret',
};

// --- Custom Error Class for API Failures ---
export class ApiError extends Error {
  constructor(message, status, details, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.data = data;
  }
}

/**
 * Calculates a safe client-side TTL (Time To Live) in seconds based on an API response's 'Expires' header.
 * If the header is missing, invalid, or in the past, it returns a specified fallback TTL.
 *
 * @param {Headers} headers - The Headers object from the fetch response.
 * @param {number} fallbackTtlSeconds - The default TTL in seconds to use if the header is unusable.
 * @param {string} [logContext=''] - Optional context for warning logs (e.g., 'leaderboard', 'events').
 * @returns {number} The calculated TTL in seconds, guaranteed to be at least 1.
 */
export const calculateClientCacheTtl = (headers, fallbackTtlSeconds, logContext = '') => {
  const expiresHeader = headers.get('Expires');

  // Get expiry time from header, if it exists and is valid.
  const headerExpiresAtMs = expiresHeader && !isNaN(new Date(expiresHeader))
    ? new Date(expiresHeader).getTime()
    : null;

  let finalTtl;
  // Check if the header-derived expiry time is valid and in the future.
  if (headerExpiresAtMs && headerExpiresAtMs > Date.now()) {
    finalTtl = Math.floor((headerExpiresAtMs - Date.now()) / 1000);
  } else {
    // If header is missing, invalid, or in the past, use the fallback.
    if (headerExpiresAtMs) { // Log a warning only if we are overriding a stale header from the server.
      const contextMsg = logContext ? ` for ${logContext}` : '';
      console.warn(`Received an already-expired response${contextMsg}. Using fallback TTL of ${fallbackTtlSeconds}s.`);
    }
    finalTtl = fallbackTtlSeconds;
  }

  // Ensure the TTL is a positive integer. Caching for 0s is pointless.
  return Math.max(1, finalTtl);
};

// --- Central Fetch Function ---
export async function apiFetch(endpoint, options = {}) {
  const url = `${API.BASE_URL}${endpoint}`;
  
  // Destructure our custom option to prevent it from being passed to the native fetch function.
  const { returnHeaders, ...fetchOptions } = options;

  // Only add if we have a body to send
  const headers = {};
  if (fetchOptions.body) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    method: 'GET',
    ...fetchOptions,
    headers: {
      ...headers,
      ...fetchOptions.headers, // Allow overriding headers if needed
    },
  };

  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorDetails = `Request failed with status ${response.status}`;
    let errorData = null;
    try {
      // Try to parse a JSON error response from the backend
      errorData = await response.json();
      errorDetails = errorData.message || errorData.error || JSON.stringify(errorData);
    } catch (_e) {
      // Fallback if the error response isn't JSON
      errorDetails = await response.text();
    }
    
    throw new ApiError(
      `API Error on ${endpoint}: ${errorDetails}`, 
      response.status, 
      errorDetails,
      errorData
    );
  }
  
  // If the caller has requested headers, return an object with both data and headers.
  if (returnHeaders) {
    return {
      data: await response.json(),
      headers: response.headers,
    };
  }

  // The default behavior remains the same for backward compatibility.
  return response.json();
}

// --- Generic Fetch with Retry (for non-API resources like Google Sheets) ---
export async function fetchWithRetry(url, retryCount = 1, retryDelay = 50) {
  for (let attempt = 1; attempt <= retryCount + 1; attempt++) {
    try {
      const response = await fetch(url, {cache: 'reload'});
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      if (attempt === retryCount + 1) {
        throw new Error(`Failed to fetch after ${retryCount + 1} attempts: ${error.message}`);
      }
      console.warn(`Attempt ${attempt} failed for ${url}, retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

// --- Standardized API Call Logger ---
export const logApiCall = (source, info) => {
  const styles = {
    clientCache: 'color: #4CAF50; font-weight: bold', // Green
    sessionCache: 'color: #FFC107; font-weight: bold', // Amber
    kvCache: 'color: #2196F3; font-weight: bold', // Blue
    'kv-cache-fallback': 'color: #9C27B0; font-weight: bold', // Purple
    'client-cache-emergency': 'color: #f44336; font-weight: bold', // Red
    direct: 'color: #00BCD4; font-weight: bold', // Cyan
  };

  const now = Date.now();
  const timestamp = info.timestamp ? (String(info.timestamp).length > 10 ? info.timestamp : info.timestamp * 1000) : null;
  const age = timestamp ? Math.floor((now - timestamp) / 1000) : 'N/A';
  const lastCheck = info.lastCheck ? (String(info.lastCheck).length > 10 ? info.lastCheck : info.lastCheck * 1000) : null;
  const heartbeatAge = lastCheck ? Math.floor((now - lastCheck) / 1000) : 'N/A';

  console.groupCollapsed(`API Call: ${info.groupName || 'Data Fetch'}`);
  console.log(`%cSource: ${source}`, styles[source.toLowerCase().replace(/[- ]/g, '')] || 'color: white');
  if (info.embarkId) console.log('Embark ID:', info.embarkId);
  if (info.seasonId) console.log('Season ID:', info.seasonId);
  
  if (timestamp) {
    console.log('Data Timestamp:', new Date(timestamp).toLocaleString());
    if (age !== 'N/A') console.log('Data Age:', `${age}s`);
  }
  
  if (lastCheck) {
    console.log('Heartbeat Check:', new Date(lastCheck).toLocaleString());
    if (heartbeatAge !== 'N/A') console.log('Heartbeat Age:', `${heartbeatAge}s`);
  }

  if (info.remainingTtl) console.log('TTL Remaining:', `${info.remainingTtl}s`);
  console.groupEnd();
};