// --- IndexedDB Caching Service ---

const DB_NAME = 'ogclub-cache-db';
const STORE_NAME = 'api-cache';
const DB_VERSION = 2; // Bump version due to data structure change.

// IMPROVEMENT: Add a version for the data structure itself.
// Change this if you ever alter the shape of the data being cached (e.g., in lb-api's transformData).
const CACHE_STRUCTURE_VERSION = '1.0.0';

let dbPromise = null;

const initDB = () => {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject("IndexedDB error");
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
      // Note: If we need to add indexes in the future, do it here based on DB version.
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
  return dbPromise;
};

/**
 * Retrieves a cached item from IndexedDB if it's fresh and matches the current data structure version.
 * @param {string} key The key for the item.
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.ignoreExpiration=false] If true, returns the item even if it's stale.
 * @returns {Promise<object|null>} The cached data object or null if not found, expired, or version mismatch.
 */
export const getCacheItem = async (key, { ignoreExpiration = false } = {}) => {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        // Check cache structure version to prevent bugs from outdated data formats.
        if (result.version !== CACHE_STRUCTURE_VERSION) {
          console.warn(`Cache mismatch for key "${key}". Expected v${CACHE_STRUCTURE_VERSION}, found v${result.version}. Discarding.`);
          // The cleanup job will eventually remove this item.
          resolve(null);
          return;
        }

        if (ignoreExpiration || Date.now() < result.expiresAt) {
          resolve(result); // Returns the full object { key, data, expiresAt, version }
        } else {
          // Do not perform a delete here. It's inefficient.
          resolve(null);
        }
      };
    });
  } catch (error) {
    console.error(`Error reading "${key}" from IndexedDB:`, error);
    return null;
  }
};

/**
 * Stores an item in IndexedDB with a "Time To Live" in seconds.
 * @param {string} key The key for the item.
 * @param {any} data The JSON-serializable value to store.
 * @param {number} ttlSeconds The number of seconds until the cache item expires.
 */
export const setCacheItem = async (key, data, ttlSeconds) => {
  if (typeof ttlSeconds !== 'number' || ttlSeconds <= 0) {
    console.error(`Invalid TTL provided for key "${key}". Must be a positive number.`);
    return;
  }

  const item = {
    key: key,
    data: data,
    expiresAt: Date.now() + ttlSeconds * 1000,
    version: CACHE_STRUCTURE_VERSION,
  };

  try {
    const db = await initDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(item);
  } catch (error) {
    console.error(`Error writing "${key}" to IndexedDB:`, error);
  }
};

/**
 * Removes a specific item from the cache.
 * @param {string} key The key of the item to remove.
 */
export const clearCacheItem = async (key) => {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(key);
  } catch (error) {
    console.error(`Error clearing item "${key}" from IndexedDB:`, error);
  }
};

/**
 * Scans the cache and removes all expired items.
 * Should be run once on application startup.
 */
export const cleanupExpiredCacheItems = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const now = Date.now();

    request.onsuccess = event => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        let shouldDelete = false;

        if (item.version !== CACHE_STRUCTURE_VERSION) {
          shouldDelete = true;
        } else if (item.expiresAt < now) {
          shouldDelete = true;
        }

        if (shouldDelete) {
          store.delete(cursor.primaryKey);
        }
        
        cursor.continue();
      } else {
        console.log("IndexedDB cache cleanup complete.");
      }
    };
    request.onerror = event => {
        console.error("Error during IndexedDB cursor cleanup:", event.target.error);
    }
  } catch (error) {
    console.error("Error during IndexedDB cleanup:", error);
  }
};