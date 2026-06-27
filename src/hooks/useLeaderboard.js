import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLeaderboardData } from '../services/lb-api';
import { processLeaderboardData } from '../utils/dataProcessing';
import { clearCacheStartingWith } from '../services/idbCache';
import { useVisibility } from './useVisibility';

const MAX_ACCEPTABLE_AGE = 35 * 60; // 35 minutes in seconds
const MAX_STALE_AGE_FOR_ERROR = 60 * 60; // 60 minutes
// The backend caches for 20 mins. If lastCheck is > 25 mins, the backend is likely failing to reach Embark.
const MAX_HEARTBEAT_AGE = 25 * 60; 

const RETRY_DELAY_MS = 2 * 60 * 1000; // 2 minutes
const GRAPH_CACHE_PREFIX = 'graph_cache_';
const IDENTITY_CACHE_PREFIX = 'identity_cache_';

// Watchdog (safety net)
const WATCHDOG_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes of zero refresh activity
const WATCHDOG_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes watchdog check interval

const getDataAge = (timestamp) => {
  if (!timestamp) return Infinity;
  return Math.floor((Date.now() - timestamp) / 1000);
};

const getToastConfig = (source, timestamp, lastCheck, ttl) => {
  const dataAge = getDataAge(timestamp);
  const heartbeatAge = getDataAge(lastCheck);
  
  const isDataStale = dataAge > MAX_ACCEPTABLE_AGE;
  const isDataVeryStale = dataAge > MAX_STALE_AGE_FOR_ERROR;
  
  // If the backend has successfully checked recently (within 25 mins), 
  // the system is healthy even if the leaderboard data itself hasn't changed.
  const isBackendHealthy = heartbeatAge < MAX_HEARTBEAT_AGE;

  // 1. Critical Failure: System is using emergency cache (network down)
  if (source === 'client-cache-emergency') {
    return {
      message: 'Unable to connect to server, using emergency cache. (Contact admin)',
      type: 'error',
      timestamp,
      showMeta: true,
      ttl
    };
  }

  // 2. Backend Failure: Data is old AND the backend hasn't checked in recently.
  // This implies the backend is running but failing to fetch from Embark, or is down.
  if (isDataVeryStale && !isBackendHealthy) {
    return {
      message: 'Leaderboard data is stale (Server unreachable, contact admin)',
      type: 'error',
      timestamp,
      showMeta: true,
      ttl
    };
  }

  // 3. Quiet State: Data is old, BUT backend checked recently.
  // This means the leaderboard simply hasn't changed (e.g. slow hours).
  if (isDataVeryStale && isBackendHealthy) {
    return {
      message: 'No recent rank changes detected. Still waiting on Embark.',
      type: 'info',
      timestamp,
      showMeta: true,
      ttl
    };
  }

  // 4. Client Cache / Standard Stale Warning
  if (source.includes('fallback') || source.includes('stale') || isDataStale) {
    return {
      message: 'Leaderboard is using cached data.',
      type: 'warning',
      timestamp,
      showMeta: true,
      ttl
    };
  }

  // 5. Success
  return {
    message: 'Leaderboard is up to date.',
    type: 'success',
    timestamp,
    showMeta: true,
    duration: 3000,
    ttl
  };
};

export const useLeaderboard = (autoRefresh, pushToast, dismissToast) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isVisible = useVisibility();
  const [data, setData] = useState({
    topClubs: [],
    globalLeaderboard: [],
    currentRubyCutoff: false,
    lastUpdated: null
  });
  const [cacheExpiresAt, setCacheExpiresAt] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Refs
  const initialLoadTriggered = useRef(false);
  const initialLoadDone = useRef(false);
  const lastTimestampRef = useRef(null);
  // Timestamp of the last COMPLETED refresh attempt (success or failure)
  const lastActivityRef = useRef(Date.now());
  // True while a refresh is in flight, so the watchdog never stacks a second one
  const isRefreshingRef = useRef(false);
  
  // Track mount status to prevent setting state on unmounted components
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refreshData = useCallback(async (isInitialLoad = false, forceRefresh = false) => {
    if (!isMounted.current) return;

    // Only show "loading" toast on manual/auto refreshes, not the initial page load.
    if (!isInitialLoad) {
      pushToast({
        key: 'leaderboard',
        title: 'Refreshing',
        message: 'Refreshing leaderboard data...',
        type: 'loading',
        duration: Infinity,
        showCloseButton: false
      });
    }

    // Set immediately before the try so the finally always clears it (no stuck flag)
    isRefreshingRef.current = true; // Guards the watchdog against overlapping refreshes.

    try {
      const rawData = await fetchLeaderboardData(forceRefresh);
      if (!isMounted.current) return;
      if (!rawData?.data) {
        throw new Error('Invalid data received from API.');
      }

      // Check if this is a fresh update (timestamp is newer than what we have). (skips clearing on new load)
      if (lastTimestampRef.current && rawData.timestamp > lastTimestampRef.current) {
         try {
             // Identity profiles include the live current-season slice, so they
             // are invalidated on the same refresh as the graph cache.
             await Promise.all([
               clearCacheStartingWith(GRAPH_CACHE_PREFIX),
               clearCacheStartingWith(IDENTITY_CACHE_PREFIX),
             ]);
         } catch (clearErr) {
             console.warn("Failed to clear graph/identity cache:", clearErr);
         }
      }
      lastTimestampRef.current = rawData.timestamp;

      setCacheExpiresAt(rawData.expiresAt || 0); // This triggers the next auto-refresh.
      
      const processedData = processLeaderboardData(rawData.data);

      setData({
        ...processedData,
        lastUpdated: {
          timestamp: rawData.timestamp,
          lastCheck: rawData.lastCheck
        }
      });
      setError(null);
      
      // --- REFINED TOAST LOGIC --
      const age = getDataAge(rawData.timestamp);
      const isVeryStale = age > MAX_STALE_AGE_FOR_ERROR;
      const isEmergency = rawData.source === 'client-cache-emergency';

      let shouldShowToast = false;
      if (isInitialLoad) {
        // On initial load, only show a toast for critical issues OR if data is old.
        shouldShowToast = isEmergency || isVeryStale;
      } else {
        // On subsequent refreshes, always show a toast to provide feedback.
        shouldShowToast = true;
      }

      if (shouldShowToast) {
        pushToast({
          key: 'leaderboard',
          ...getToastConfig(
            rawData.source,
            rawData.timestamp,
            rawData.lastCheck,
            rawData.remainingTtl
          )
        });
      } else {
        dismissToast('leaderboard');
      }
      
    } catch (err) {
      if (!isMounted.current) return;
      
      console.error('Error in refreshData:', err);
      setError('Failed to load leaderboard data. Will retry automatically.');
      pushToast({
        key: 'leaderboard',
        message: 'Failed to connect. Will retry automatically.',
        type: 'error',
        showMeta: true,
        ttl: RETRY_DELAY_MS / 1000
      });
      // On failure, schedule the next retry by setting expiresAt.
      // The auto-refresh useEffect will pick this up and call refreshData again.
      setCacheExpiresAt(Date.now() + RETRY_DELAY_MS);
    } finally {
      // These run on EVERY outcome so the loop can never be left without a pending
      // reschedule, and so the watchdog always sees fresh activity.
      isRefreshingRef.current = false;
      lastActivityRef.current = Date.now();
      if (isMounted.current) {
        setLoading(false);
        if (isInitialLoad) {
          initialLoadDone.current = true;
        }
        // Always re-arm the auto-refresh effect, even if setCacheExpiresAt above was a
        // no-op (identical value). This is what keeps the self-rescheduling loop alive.
        setRefreshNonce((n) => n + 1);
      }
    }
  }, [pushToast, dismissToast]);

  // Initial load
  useEffect(() => {
    if (initialLoadTriggered.current) return;
    initialLoadTriggered.current = true;
    refreshData(true);
  }, [refreshData]);

  // Auto-refresh timer logic (and retry-on-error handler)
  useEffect(() => {
    if (!autoRefresh || !cacheExpiresAt || !initialLoadDone.current || !isVisible) {
      return;
    }

    const now = Date.now();
    let delay;

    if (cacheExpiresAt > now) {
      // Future expiration: Add a small random buffer (2-6 seconds) to prevent all 
      // clients from refreshing at the exact same time when the cache naturally expires.
      const buffer = (Math.random() * 4000) + 2000;
      delay = (cacheExpiresAt - now) + buffer;
    } else {
      // Cache already expired (e.g., user just tabbed back in after a long time).
      // Fetch immediately without a buffer so the user doesn't see stale data.
      delay = 0;
    }

    const timer = setTimeout(() => {
      // Re-check autoRefresh state inside timeout in case it was toggled off while waiting
      if (autoRefresh && isMounted.current) {
        // If we currently have an error, we assume the previous fetch failed.
        // Therefore, we force this automatic retry to bypass the browser cache (true).
        // If we are healthy (no error), we allow standard caching (false).
        const shouldForce = !!error;
        refreshData(false, shouldForce);
      }
    }, delay);

    return () => clearTimeout(timer);
    // refreshNonce is included so this effect re-runs (and reschedules) after every
    // refresh, even when cacheExpiresAt happens to be unchanged.
  }, [autoRefresh, cacheExpiresAt, refreshData, error, isVisible, refreshNonce]);

  // Watchdog: a last-resort safety net that forces a refresh if the loop above ever
  // goes completely silent. It measures LIVENESS (time since the last refresh attempt),
  // not data freshness, so:
  //  - An ongoing outage does NOT keep tripping it: each failed attempt updates
  //    lastActivityRef and the error path already reschedules a 2-min retry, so the
  //    normal loop (not the watchdog) drives retries and the watchdog stays dormant.
  //  - It fires at most once per stall, then goes quiet once activity resumes.
  // It only runs while visible (the loop is intentionally paused when hidden)
  useEffect(() => {
    if (!autoRefresh || !isVisible) return;

    // Becoming visible starts a fresh window; time spent hidden (loop paused) must not
    // count against the watchdog.
    lastActivityRef.current = Date.now();

    const intervalId = setInterval(() => {
      if (!isMounted.current || isRefreshingRef.current) return;
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs > WATCHDOG_THRESHOLD_MS) {
        console.warn(
          `[Leaderboard] Watchdog: no refresh activity for ${Math.round(idleMs / 60000)} min, forcing one.`
        );
        refreshData(false, true);
      }
    }, WATCHDOG_CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [autoRefresh, isVisible, refreshData]);

  return {
    ...data,
    loading,
    error,
    refreshData,
  };
};