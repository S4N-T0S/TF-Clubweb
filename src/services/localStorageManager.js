// A generic, robust getter for JSON-parsed localStorage items.
const getStoredJsonItem = (key, defaultValue, validator) => {
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

// --- Specific Getters and Setters ---

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