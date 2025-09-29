// A generic, robust getter for JSON-parsed localStorage items.
export const getStoredJsonItem = (key, defaultValue, validator) => {
  try {
    const storedValue = localStorage.getItem(key);
    if (storedValue === null) {
      return defaultValue;
    }
    
    const parsedValue = JSON.parse(storedValue);
    
    // The validator function confirms the data is in the expected format.
    if (validator && !validator(parsedValue)) {
      // If validation fails, remove the corrupt item and return default.
      localStorage.removeItem(key);
      return defaultValue;
    }
    
    return parsedValue;
  } catch (error) {
    console.error(`Error reading "${key}" from localStorage:`, error);
    // If parsing fails, remove the corrupt item and return default.
    localStorage.removeItem(key);
    return defaultValue;
  }
};

// A generic setter for JSON-parsed localStorage items.
const setStoredJsonItem = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing "${key}" to localStorage:`, error);
  }
};

// --- Specific Getters and Setters for User Settings ---

// View Tab (stores a simple string, not JSON)
const LAST_TAB_KEY = 'dashboard_tab';
const VALID_TABS = ['members', 'clubs', 'global'];
export const getStoredTab = () => {
    try {
        const storedTab = localStorage.getItem(LAST_TAB_KEY);
        // If the stored tab is not one of the valid options, default to 'global'.
        return storedTab && VALID_TABS.includes(storedTab) ? storedTab : 'global';
    } catch (error) {
        console.error(`Error reading "${LAST_TAB_KEY}" from localStorage:`, error);
        return 'global';
    }
};
export const setStoredTab = (tab) => {
    try {
        localStorage.setItem(LAST_TAB_KEY, tab);
    } catch (error) {
        console.error(`Error writing "${LAST_TAB_KEY}" to localStorage:`, error);
    }
};

// Auto-Refresh (stores a boolean)
const AUTO_REFRESH_KEY = 'dashboard_autoRefresh';
const isBoolean = (value) => typeof value === 'boolean';
export const getStoredAutoRefresh = () => getStoredJsonItem(AUTO_REFRESH_KEY, true, isBoolean);
export const setStoredAutoRefresh = (value) => setStoredJsonItem(AUTO_REFRESH_KEY, value);

// Graph Modal Settings
const GRAPH_MODAL_SETTINGS_KEY = 'graphModalSettings';
// Validator for graph settings to ensure data integrity.
const areValidGraphSettings = (value) => {
    if (typeof value !== 'object' || value === null) return false;
    const hasNameChange = typeof value.showNameChange === 'boolean';
    const hasClubChange = typeof value.showClubChange === 'boolean';
    const hasRsAdjustment = typeof value.showRsAdjustment === 'boolean';
    const hasSuspectedBan = typeof value.showSuspectedBan === 'boolean';
    return hasNameChange && hasClubChange && hasRsAdjustment && hasSuspectedBan;
};
const defaultGraphSettings = {
    showNameChange: true,
    showClubChange: true,
    showRsAdjustment: true,
    showSuspectedBan: true,
};
export const getStoredGraphSettings = () => getStoredJsonItem(GRAPH_MODAL_SETTINGS_KEY, defaultGraphSettings, areValidGraphSettings);
export const setStoredGraphSettings = (value) => setStoredJsonItem(GRAPH_MODAL_SETTINGS_KEY, value);

// Favourites (stores an array of objects)
const FAVOURITES_KEY = 'playerFavourites';
// Validator checks if the stored value is an array of objects with a 'name' property.
const areValidFavourites = (value) => 
  Array.isArray(value) && 
  value.every(item => typeof item === 'object' && item !== null && 'name' in item);
export const getStoredFavourites = () => getStoredJsonItem(FAVOURITES_KEY, [], areValidFavourites);
export const setStoredFavourites = (value) => setStoredJsonItem(FAVOURITES_KEY, value);

// Events Modal Settings
const EVENTS_MODAL_SETTINGS_KEY = 'eventsModalSettings';
// Validator for event settings to ensure data integrity.
const areValidEventSettings = (value) => {
    if (typeof value !== 'object' || value === null) return false;
    const hasAutoRefresh = typeof value.autoRefresh === 'boolean';
    const hasExpanded = typeof value.isFilterSectionExpanded === 'boolean';
    const hasFilters = typeof value.filters === 'object' && value.filters !== null;
    // Check for a specific key within filters to be more robust
    return hasAutoRefresh && hasExpanded && hasFilters && 'minLeague' in value.filters;
};
const defaultEventSettings = {
    autoRefresh: true,
    isFilterSectionExpanded: true,
    filters: {
        minLeague: 0,
        showNameChange: true,
        showSuspectedBan: true,
        showRsAdjustment: true,
        showClubChange: true,
    }
};
export const getStoredEventsSettings = () => getStoredJsonItem(EVENTS_MODAL_SETTINGS_KEY, defaultEventSettings, areValidEventSettings);
export const setStoredEventsSettings = (value) => setStoredJsonItem(EVENTS_MODAL_SETTINGS_KEY, value);

// Deprecated Cache Cleanup
const DEPRECATED_CACHE_CLEANUP_FLAG = 'v2_storage_cleanup_complete';
/**
 * A one-time utility to remove old cache data from localStorage after the
 * migration to IndexedDB. It uses a flag to ensure it only ever runs once
 * per user, making it "safe" to call on every app startup.
 */
export const cleanupDeprecatedCache = () => {
  // 1. Check if the cleanup has already been performed. If so, do nothing.
  if (localStorage.getItem(DEPRECATED_CACHE_CLEANUP_FLAG)) {
    return;
  }

  console.log("Performing one-time cleanup of deprecated localStorage cache...");

  const keysToRemove = [];
  // 2. Iterate through all keys in localStorage to find deprecated cache items.
  // We do this safely by not modifying the collection while iterating over it.
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('graph_cache_') ||
      key.startsWith('events_cache_') ||
      key === 'leaderboard_cache'
    )) {
      keysToRemove.push(key);
    }
  }

  // 3. Remove all the identified keys.
  if (keysToRemove.length > 0) {
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log(`Removed deprecated localStorage key: ${key}`);
      } catch (error) {
        console.error(`Failed to remove deprecated key "${key}":`, error);
      }
    });
  }

  // 4. Set the flag to prevent this function from ever running again.
  try {
    localStorage.setItem(DEPRECATED_CACHE_CLEANUP_FLAG, 'true');
    console.log("Deprecated localStorage cache cleanup complete.");
  } catch (error) {
    console.error("Failed to set storage cleanup completion flag:", error);
  }
};