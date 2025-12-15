import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLeaderboardData } from '../services/lb-api';
import { processLeaderboardData } from '../utils/dataProcessing';
import { clearCacheStartingWith } from '../services/idbCache';

const MAX_ACCEPTABLE_AGE = 35 * 60; // 35 minutes in seconds
const MAX_STALE_AGE_FOR_ERROR = 60 * 60; // 60 minutes
// The backend caches for 20 mins. If lastCheck is > 25 mins, the backend is likely failing to reach Embark.
const MAX_HEARTBEAT_AGE = 25 * 60; 

const RETRY_DELAY_MS = 2 * 60 * 1000; // 2 minutes
const GRAPH_CACHE_PREFIX = 'graph_cache_';

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

export const useLeaderboard = (clubMembersData, autoRefresh) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    clubMembers: [],
    topClubs: [],
    unknownMembers: [],
    globalLeaderboard: [],
    lastUpdated: null
  });
  const [toastMessage, setToastMessage] = useState(null);
  const [cacheExpiresAt, setCacheExpiresAt] = useState(0);
  
  // Refs
  const initialLoadTriggered = useRef(false);
  const initialLoadDone = useRef(false);
  const lastGlobalLeaderboard = useRef([]);
  const lastTimestampRef = useRef(null);
  const clubMembersDataRef = useRef(clubMembersData);
  
  // Track mount status to prevent setting state on unmounted components
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    clubMembersDataRef.current = clubMembersData;
  }, [clubMembersData]);

  const refreshData = useCallback(async (isInitialLoad = false) => {
    if (!isMounted.current) return;

    // Only show "loading" toast on manual/auto refreshes, not the initial page load.
    if (!isInitialLoad) { 
      setToastMessage({
        title: 'Refreshing',
        message: 'Refreshing leaderboard data...',
        type: 'loading',
        timestamp: Date.now(),
        duration: Infinity,
        showCloseButton: false
      });
    }
    
    try {
      const rawData = await fetchLeaderboardData();
      if (!isMounted.current) return;
      if (!rawData?.data) {
        throw new Error('Invalid data received from API.');
      }

      // Check if this is a fresh update (timestamp is newer than what we have). (skips clearing on new load)
      if (lastTimestampRef.current && rawData.timestamp > lastTimestampRef.current) {
         try {
             await clearCacheStartingWith(GRAPH_CACHE_PREFIX);
         } catch (clearErr) {
             console.warn("Failed to clear graph cache:", clearErr);
         }
      }
      lastTimestampRef.current = rawData.timestamp;

      setCacheExpiresAt(rawData.expiresAt || 0); // This triggers the next auto-refresh.
      lastGlobalLeaderboard.current = rawData.data;
      
      const processedData = processLeaderboardData(rawData.data, clubMembersDataRef.current || []);

      setData({ ...processedData, lastUpdated: rawData.timestamp });
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
        setToastMessage(getToastConfig(
          rawData.source, 
          rawData.timestamp, 
          rawData.lastCheck, 
          rawData.remainingTtl
        ));
      }
      
    } catch (err) {
      if (!isMounted.current) return;
      
      console.error('Error in refreshData:', err);
      setError('Failed to load leaderboard data. Will retry automatically.');
      setToastMessage({
        message: 'Failed to connect. Will retry automatically.',
        type: 'error',
        timestamp: Date.now(),
        showMeta: true,
        ttl: RETRY_DELAY_MS / 1000
      });
      // On failure, schedule the next retry by setting expiresAt.
      // The auto-refresh useEffect will pick this up and call refreshData again.
      setCacheExpiresAt(Date.now() + RETRY_DELAY_MS);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        if (isInitialLoad) {
          initialLoadDone.current = true;
        }
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (initialLoadTriggered.current) return;
    initialLoadTriggered.current = true;
    refreshData(true);
  }, [refreshData]);

  // Auto-refresh timer logic (and retry-on-error handler)
  useEffect(() => {
    if (!autoRefresh || !cacheExpiresAt || !initialLoadDone.current) {
      return;
    }

    const now = Date.now();
    // Add a small random buffer (2-6 seconds) to prevent all clients from refreshing at the exact same time
    const buffer = (Math.random() * 4000) + 2000;
    const delay = cacheExpiresAt > now ? cacheExpiresAt - now + buffer : buffer;

    const timer = setTimeout(() => {
      // Re-check autoRefresh state inside timeout in case it was toggled off while waiting
      if (autoRefresh && isMounted.current) refreshData(false);
    }, delay);

    return () => clearTimeout(timer);
  }, [autoRefresh, cacheExpiresAt, refreshData]);


  // Update processed data when club members data arrives after the initial load
  useEffect(() => {
    if (initialLoadDone.current && clubMembersData?.length > 0 && lastGlobalLeaderboard.current.length > 0) {
      const processedData = processLeaderboardData(lastGlobalLeaderboard.current, clubMembersData);
      if (isMounted.current) {
        setData(prev => ({ ...processedData, lastUpdated: prev.lastUpdated }));
      }
    }
  }, [clubMembersData]);

  return {
    ...data,
    loading,
    error,
    refreshData,
    toastMessage,
    setToastMessage,
  };
};