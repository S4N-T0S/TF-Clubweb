// --- START OF FILE idbCache.js.txt ---

// --- IndexedDB Caching Service ---

const DB_NAME = 'ogclub-cache-db';
const STORE_NAME = 'api-cache';
const DB_VERSION = 2; // Bump version due to data structure change.

// IMPROVEMENT: Add a version for the data structure itself.
// Change this if you ever alter the shape of the data being cached (e.g., in lb-api's transformData).
const CACHE_STRUCTURE_VERSION = '1.1.0'; // 1.1.0: officialClubName added to leaderboard/identity shapes

// Sanity ceiling on a stored expiry, well above the longest TTL any caller asks for (1 hour).
// Callers arm their auto-refresh timers from expiresAt, and a nonsense value that outlives the
// tab would otherwise be re-read on every reload and never repaired.
const MAX_CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000;

// open() reports 'blocked' (no success, no error) when an upgrade is pending and another tab
// still holds the old connection. Every caller awaits initDB, so an unsettled promise stalls
// the whole app; this bounds the wait even for stalls the events don't cover.
const DB_OPEN_TIMEOUT_MS = 5000;

let dbPromise = null;
// Guards the handle against late callbacks from an attempt we already abandoned.
let dbGeneration = 0;

const initDB = () => {
  if (dbPromise) {
    return dbPromise;
  }

  const generation = ++dbGeneration;
  // Drop the cached handle so the next call reopens. Without this a single transient failure
  // would disable caching for the rest of the session. Wired to open failures and to the
  // connection's own close/versionchange events only: a handle that dies between those events
  // and the next db.transaction() call still throws InvalidStateError into each caller's catch.
  const invalidate = () => {
    if (dbGeneration === generation) dbPromise = null;
  };

  let request;
  try {
    request = indexedDB.open(DB_NAME, DB_VERSION);
  } catch (error) {
    // Storage can be unavailable outright (blocked site data, some private modes).
    console.error("IndexedDB unavailable:", error);
    return Promise.reject(error); // Deliberately not cached, so the next call retries.
  }

  dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      invalidate();
      reject(error);
    };

    timeoutId = setTimeout(() => {
      fail(new Error(`IndexedDB open timed out after ${DB_OPEN_TIMEOUT_MS}ms`));
    }, DB_OPEN_TIMEOUT_MS);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      fail(event.target.error || new Error("IndexedDB error"));
    };

    // Another tab is holding the previous version open. Fail fast so callers fall back to the
    // network instead of waiting for that tab to close.
    request.onblocked = () => {
      console.warn("IndexedDB upgrade blocked by another tab. Continuing without cache.");
      fail(new Error("IndexedDB upgrade blocked"));
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
      // Note: If we need to add indexes in the future, do it here based on DB version.
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      if (settled) {
        // Already timed out or rejected. Close, or this connection blocks the next upgrade.
        db.close();
        return;
      }
      settled = true;
      clearTimeout(timeoutId);

      // Release the connection when another tab needs to upgrade, otherwise its open() sits
      // in 'blocked' until this tab is closed.
      db.onversionchange = () => {
        db.close();
        invalidate();
      };
      db.onclose = invalidate;

      resolve(db);
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

    // `return await`: without it the inner rejection escapes the enclosing catch below.
    return await new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      // A transaction can abort without the request firing onerror, which would leave this
      // promise unsettled.
      transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
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

        // Emergency and stale-fallback reads are checked first on purpose. They only run once
        // the network has already failed, where outdated data beats no data, so neither the
        // expiry nor the sanity check below may reject them.
        if (ignoreExpiration) {
          resolve(result); // Returns the full object { key, data, expiresAt, version }
          return;
        }

        const now = Date.now();
        if (!Number.isFinite(result.expiresAt) || result.expiresAt > now + MAX_CACHE_LIFETIME_MS) {
          console.warn(`Cache entry "${key}" has an implausible expiry (${result.expiresAt}). Discarding.`);
          resolve(null);
          return;
        }

        if (now < result.expiresAt) {
          resolve(result);
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
    // The commit is deliberately not awaited: callers await this from their fetch path, and a
    // transaction that never settles would hang it. QuotaExceededError aborts asynchronously
    // though, so put() returns fine and only this event reveals the write was dropped.
    transaction.onabort = () => {
      console.error(`Cache write for "${key}" was dropped:`, transaction.error);
    };
    transaction.objectStore(STORE_NAME).put(item);
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
 * Clears all cache items where the key starts with the provided prefix.
 * Used to invalidate all graph data when leaderboard updates.
 * @param {string} prefix The string prefix to match (e.g., 'graph_cache_')
 */
export const clearCacheStartingWith = async (prefix) => {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Use IDBKeyRange to only iterate keys starting with the prefix.
    // \uffff is the last printable unicode character, creating a bound for the prefix.
    // This makes the operation O(M) (where M is matching items) rather than O(N) (all items).
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
    const request = store.openCursor(range);

    // `return await`: without it the inner rejection escapes the enclosing catch below.
    return await new Promise((resolve, reject) => {
      let deletedCount = 0;
      transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          // Iteration complete
          if (deletedCount > 0) {
            console.log(`[Cache] Invalidated ${deletedCount} items with prefix "${prefix}".`);
          }
          resolve();
        }
      };
      request.onerror = (event) => {
        console.error("Error clearing cache by prefix:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error(`Error in clearCacheStartingWith("${prefix}"):`, error);
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
        } else if (!Number.isFinite(item.expiresAt) || item.expiresAt > now + MAX_CACHE_LIFETIME_MS) {
          // Same rule getCacheItem applies. Without it a poisoned row holds quota forever and
          // warns on every read, since only a successful overwrite would otherwise clear it.
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