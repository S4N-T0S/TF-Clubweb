import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLeaderboardData } from '../services/lb-api';
import { processLeaderboardData } from '../utils/dataProcessing';

const MAX_ACCEPTABLE_AGE = 30 * 60; // 30 minutes in seconds
const MAX_STALE_AGE_FOR_ERROR = 60 * 60; // 60 minutes, beyond this is an error
const RETRY_DELAY_MS = 2 * 60 * 1000; // 2 minutes

export const useLeaderboard = (clubMembersData, autoRefresh) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    clubMembers: [],
    isTopClub: false,
    topClubs: [],
    unknownMembers: [],
    globalLeaderboard: []
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [cacheExpiresAt, setCacheExpiresAt] = useState(0);
  const initialLoadTriggered = useRef(false);
  const initialLoadDone = useRef(false);
  const lastGlobalLeaderboard = useRef([]);

  const clubMembersDataRef = useRef(clubMembersData);
  useEffect(() => {
    clubMembersDataRef.current = clubMembersData;
  }, [clubMembersData]);

  const getDataAge = useCallback((timestamp) => {
    if (!timestamp) return Infinity;
    return Math.floor((Date.now() - timestamp) / 1000);
  }, []);

  const getToastConfig = useCallback((source, timestamp, ttl) => {
    const isStale = getDataAge(timestamp) > MAX_ACCEPTABLE_AGE;
    const isVeryStale = getDataAge(timestamp) > MAX_STALE_AGE_FOR_ERROR;

    if (source === 'client-cache-emergency' || isVeryStale) {
      return {
        message: 'Unable to connect to server, using emergency cache.',
        type: 'error',
        timestamp,
        showMeta: true,
        ttl
      };
    }

    if (source.includes('fallback') || source.includes('stale') || isStale) {
      return {
        message: 'Leaderboard is using cached data.',
        type: 'warning',
        timestamp,
        showMeta: true,
        ttl
      };
    }

    // If we reach here, data is fresh from a primary source.
    return {
      message: 'Leaderboard is up to date.',
      type: 'success',
      timestamp,
      showMeta: true,
      duration: 3000,
      ttl
    };
  }, [getDataAge]);

  const refreshData = useCallback(async (isInitialLoad = false) => {
    setIsRefreshing(true);
    
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
      
      if (!rawData?.data) {
        throw new Error('Invalid data received from API.');
      }

      setCacheExpiresAt(rawData.expiresAt || 0); // This triggers the next auto-refresh.
      lastGlobalLeaderboard.current = rawData.data;
      const processedData = processLeaderboardData(rawData.data, clubMembersDataRef.current || []);

      setData(processedData);
      setError(null);
      
      // --- REFINED TOAST LOGIC ---
      const isVeryStale = getDataAge(rawData.timestamp) > MAX_STALE_AGE_FOR_ERROR;
      const isEmergency = rawData.source === 'client-cache-emergency';

      let shouldShowToast = false;
      if (isInitialLoad) {
        // On initial load, only show a toast for critical issues.
        shouldShowToast = isEmergency || isVeryStale;
      } else {
        // On subsequent refreshes, always show a toast to provide feedback.
        shouldShowToast = true;
      }

      if (shouldShowToast) {
        setToastMessage(getToastConfig(rawData.source, rawData.timestamp, rawData.remainingTtl));
      }
      
    } catch (err) {
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
      setLoading(false);
      setIsRefreshing(false);
      if (isInitialLoad) {
        initialLoadDone.current = true;
      }
    }
  }, [getToastConfig, getDataAge]);

  // Initial load
  useEffect(() => {
    if (initialLoadTriggered.current) return;
    initialLoadTriggered.current = true;
    refreshData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (autoRefresh) refreshData(false);
    }, delay);

    return () => clearTimeout(timer);
  }, [autoRefresh, cacheExpiresAt, refreshData]);


  // Update processed data when club members data arrives after the initial load
  useEffect(() => {
    if (initialLoadDone.current && clubMembersData?.length > 0 && lastGlobalLeaderboard.current.length > 0) {
      const processedData = processLeaderboardData(lastGlobalLeaderboard.current, clubMembersData);
      setData(processedData);
    }
  }, [clubMembersData]);

  return {
    ...data,
    loading,
    error,
    isRefreshing,
    refreshData,
    toastMessage,
    setToastMessage,
  };
};