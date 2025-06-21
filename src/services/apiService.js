// --- Configuration ---
const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

export const API = {
  BASE_URL: isDev ? 'http://localhost:3000' : 'https://api.ogclub.s4nt0s.eu',
  AUTH_TOKEN: 'not-secret',
};

// --- Custom Error Class for API Failures ---
export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// --- Central Fetch Function ---
export async function apiFetch(endpoint, options = {}) {
  const url = `${API.BASE_URL}${endpoint}`;
  const config = {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorDetails = `Request failed with status ${response.status}`;
    try {
      // Try to parse a JSON error response from the backend
      const errorData = await response.json();
      errorDetails = errorData.message || errorData.error || JSON.stringify(errorData);
    // eslint-disable-next-line no-unused-vars
    } catch (_e) {
      // Fallback if the error response isn't JSON
      errorDetails = await response.text();
    }
    throw new ApiError(
      `API Error on ${endpoint}: ${errorDetails}`, 
      response.status, 
      errorDetails
    );
  }

  return response.json();
}

// --- Generic Fetch with Retry (for non-API resources like Google Sheets) ---
export async function fetchWithRetry(url, retryCount = 1, retryDelay = 50) {
  for (let attempt = 1; attempt <= retryCount + 1; attempt++) {
    try {
      const response = await fetch(url);
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

  console.groupCollapsed(`API Call: ${info.groupName || 'Data Fetch'}`);
  console.log(`%cSource: ${source}`, styles[source.toLowerCase().replace(/[- ]/g, '')] || 'color: white');
  if (info.embarkId) console.log('Embark ID:', info.embarkId);
  if (timestamp) console.log('Timestamp:', new Date(timestamp).toLocaleString());
  if (age !== 'N/A') console.log('Cache Age:', `${age}s`);
  if (info.remainingTtl) console.log('TTL Remaining:', `${info.remainingTtl}s`);
  console.log('Response Time:', `${info.responseTime}ms`);
  console.groupEnd();
};