// --- IndexedDB Caching Service ---

const DB_NAME = 'ogclub-cache-db';
const STORE_NAME = 'api-cache';
const DB_VERSION = 1;

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
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
  return dbPromise;
};

/**
 * Retrieves a cached item from IndexedDB if it hasn't expired.
 * @param {string} key The key for the item.
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.ignoreExpiration=false] If true, returns the item even if it's stale.
 * @returns {Promise<object|null>} The cached data object or null if not found or expired.
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

        if (ignoreExpiration || Date.now() < result.value.expiresAt) {
          resolve(result.value); // Returns the full object { data, expiresAt }
        } else {
          // Item has expired, remove it in a new transaction
          clearCacheItem(key);
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
 * @param {any} value The JSON-serializable value to store.
 * @param {number} ttlSeconds The number of seconds until the cache item expires.
 */
export const setCacheItem = async (key, value, ttlSeconds) => {
  if (typeof ttlSeconds !== 'number' || ttlSeconds <= 0) {
    console.error(`Invalid TTL provided for key "${key}". Must be a positive number.`);
    return;
  }

  const item = {
    key: key,
    value: {
      data: value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    }
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
        if (cursor.value.value.expiresAt < now) {
          store.delete(cursor.primaryKey);
        }
        cursor.continue();
      } else {
        console.log("IndexedDB cache cleanup complete.");
      }
    };
  } catch (error) {
    console.error("Error during IndexedDB cleanup:", error);
  }
};