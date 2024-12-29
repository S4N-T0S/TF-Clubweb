import { useState, useEffect } from 'react';
import { fetchLeaderboardData } from '../services/lb-api';
import { processLeaderboardData } from '../utils/dataProcessing';

const MAX_ACCEPTABLE_AGE = 30 * 60; // 30 minutes in seconds

export const useLeaderboard = () => {
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

  const hasDataChanged = (oldData, newData) => {
    if (!oldData.globalLeaderboard.length || !newData.globalLeaderboard.length) {
      return true;
    }
    const oldTopScores = oldData.globalLeaderboard.slice(0, 5000).map(p => p.rankScore);
    const newTopScores = newData.globalLeaderboard.slice(0, 5000).map(p => p.rankScore);
    if (oldTopScores.some((score, i) => score !== newTopScores[i])) return true;
    
    return oldData.isTopClan !== newData.isTopClan;
  };

  const getDataAge = (timestamp) => {
    if (!timestamp) return Infinity;
    return Math.floor((Date.now() - timestamp) / 1000);
  };

  const getToastConfig = (source, isRefreshing, timestamp, ttl) => {
    if (isRefreshing) {
      return {
        message: 'Refreshing leaderboard data...',
        type: 'loading'
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
  };

  const refreshData = async (isInitialLoad = false) => {
    setIsRefreshing(true);
    setToastMessage(getToastConfig(null, true));
    
    try {
      const rawData = await fetchLeaderboardData();
      
      if (!rawData?.data) {
        throw new Error('Invalid data received from API');
      }

      const processedData = processLeaderboardData(rawData.data);
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
  };

  useEffect(() => {
    refreshData(true);
  }, []);

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