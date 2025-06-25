import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLeaderboardData } from '../services/lb-api';
import { processLeaderboardData } from '../utils/dataProcessing';

const MAX_ACCEPTABLE_AGE = 15 * 60; // 15 minutes in seconds, aligned with backend
const MAX_STALE_AGE_FOR_ERROR = 45 * 60; // 45 minutes, beyond this is an error

export const useLeaderboard = (clubMembersData) => {
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
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const initialLoadDone = useRef(false);
  const lastGlobalLeaderboard = useRef([]);

  const hasDataChanged = useCallback((oldData, newData) => {
    if (!oldData.globalLeaderboard.length || !newData.globalLeaderboard.length) {
      return true;
    }
    const oldTopScores = oldData.globalLeaderboard.slice(0, 5000).map(p => p.rankScore);
    const newTopScores = newData.globalLeaderboard.slice(0, 5000).map(p => p.rankScore);
    if (oldTopScores.some((score, i) => score !== newTopScores[i])) return true;
    
    return oldData.isTopClub !== newData.isTopClub;
  }, []);

  const getDataAge = useCallback((timestamp) => {
    if (!timestamp) return Infinity;
    return Math.floor((Date.now() - timestamp) / 1000);
  }, []);

  const getToastConfig = useCallback((source, isRefreshing, timestamp, ttl) => {
    if (isRefreshing) {
      return {
        title: 'Refreshing',
        message: 'Refreshing leaderboard data...',
        type: 'loading',
        timestamp: Date.now(),
        duration: Infinity, // Keep showing until refresh completes
        showCloseButton: false
      };
    }
  
    const dataAge = getDataAge(timestamp);
    const isStale = dataAge > MAX_ACCEPTABLE_AGE;
    const isVeryStale = dataAge > MAX_STALE_AGE_FOR_ERROR;
  
    if (source === 'client-cache-emergency') {
        return {
          message: 'Unable to connect to server, using emergency cache.',
          type: 'error',
          timestamp,
          showMeta: true,
          ttl
        };
    }
    
    if (isVeryStale) {
      return {
        message: 'Leaderboard is significantly out of date.',
        type: 'error',
        timestamp,
        showMeta: true,
        ttl
      };
    }

    if (isStale) {
      return {
        message: 'Leaderboard is using cached data.',
        type: 'warning',
        timestamp,
        showMeta: true,
        ttl
      };
    }

    // If we reach here, data is considered fresh.
    return {
      message: 'Everything is up to date.',
      type: 'success',
      timestamp,
      showMeta: true,
      duration: 3000,
      ttl
    };
  }, [getDataAge]);

  const refreshData = useCallback(async (isInitialLoad = false) => {
    setIsRefreshing(true);
    setToastMessage(getToastConfig(null, true));
    
    try {
      const rawData = await fetchLeaderboardData();
      
      if (!rawData?.data) {
        throw new Error('Invalid data received from API.');
      }

      lastGlobalLeaderboard.current = rawData.data;
      const processedData = processLeaderboardData(rawData.data, clubMembersData || []);
      const hasChanged = !isInitialLoad && hasDataChanged(data, processedData);
      
      setData(processedData);
      setError(null);
      
      setToastMessage(getToastConfig(
        rawData.source,
        false,
        rawData.timestamp,
        rawData.remainingTtl
      ));
      
      if (hasChanged || isInitialLoad) {
        setLastUpdateTime(new Date());
      }
    } catch (err) {
      console.error('Error in refreshData:', err);
      setError('Failed to load leaderboard data. Please try again later.');
      setToastMessage({
        message: 'Failed to load leaderboard data.',
        type: 'error',
        timestamp: Date.now()
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [clubMembersData, data, getToastConfig, hasDataChanged]);

  // Initial load
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      refreshData(true);
    }
  }, [refreshData]);

  // Update processed data when club members data arrives
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
    lastUpdateTime,
  };
};