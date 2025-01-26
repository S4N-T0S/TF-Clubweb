import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLeaderboardData } from '../services/lb-api';
import { processLeaderboardData } from '../utils/dataProcessing';

const MAX_ACCEPTABLE_AGE = 30 * 60; // 30 minutes in seconds

export const useLeaderboard = (clanMembersData) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    clanMembers: [],
    isTopClan: false,
    topClans: [],
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
    
    return oldData.isTopClan !== newData.isTopClan;
  }, []);

  const getDataAge = useCallback((timestamp) => {
    if (!timestamp) return Infinity;
    return Math.floor((Date.now() - timestamp) / 1000);
  }, []);

  const getToastConfig = useCallback((source, isRefreshing, timestamp, ttl) => {
    if (isRefreshing) {
      return {
        message: 'Refreshing leaderboard data...',
        type: 'loading',
        timestamp: Date.now()
      };
    }

    const dataAge = getDataAge(timestamp);
    const isDataTooOld = dataAge > MAX_ACCEPTABLE_AGE;

    switch (source) {
      case 'kv-cache':
      case 'client-cache':
        return {
          message: 'Everything is up to date.',
          type: 'success',
          timestamp,
          ttl
        };
      case 'kv-cache-fallback':
      case 'client-cache-fallback':
        return {
          message: isDataTooOld 
            ? 'Leaderboard is significantly out of date.' 
            : 'Leaderboard is using cached data.',
          type: 'warning',
          timestamp,
          ttl
        };
      case 'client-cache-emergency':
        return {
          message: 'Unable to connect to server, using emergency cache',
          type: 'error',
          timestamp,
          ttl
        };
      default:
        return {
          message: `Data source: ${source}`,
          type: 'info',
          timestamp,
          ttl
        };
    }
  }, [getDataAge]);

  const refreshData = useCallback(async (isInitialLoad = false) => {
    setIsRefreshing(true);
    setToastMessage(getToastConfig(null, true));
    
    try {
      const rawData = await fetchLeaderboardData();
      
      if (!rawData?.data) {
        throw new Error('Invalid data received from API');
      }

      lastGlobalLeaderboard.current = rawData.data;
      const processedData = processLeaderboardData(rawData.data, clanMembersData || []);
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
        message: 'Failed to load leaderboard data',
        type: 'error'
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [clanMembersData, data, getToastConfig, hasDataChanged]);

  // Initial load
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      refreshData(true);
    }
  }, [refreshData]);

  // Update processed data when clan members data arrives
  useEffect(() => {
    if (initialLoadDone.current && clanMembersData?.length > 0 && lastGlobalLeaderboard.current.length > 0) {
      const processedData = processLeaderboardData(lastGlobalLeaderboard.current, clanMembersData);
      setData(processedData);
    }
  }, [clanMembersData]);

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