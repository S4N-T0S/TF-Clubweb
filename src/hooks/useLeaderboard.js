import { useState, useEffect } from 'react';
import { fetchLeaderboardData } from '../services/api';
import { processLeaderboardData } from '../utils/dataProcessing';

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
  const [dataSource, setDataSource] = useState(null);

  const hasDataChanged = (oldData, newData) => {
    if (!oldData.globalLeaderboard.length || !newData.globalLeaderboard.length) {
      return true;
    }
    const oldTopScores = oldData.globalLeaderboard.slice(0, 5000).map(p => p.rankScore);
    const newTopScores = newData.globalLeaderboard.slice(0, 5000).map(p => p.rankScore);
    if (oldTopScores.some((score, i) => score !== newTopScores[i])) return true;
    
    return oldData.isTopClan !== newData.isTopClan;
  };

  const refreshData = async (isInitialLoad = false) => {
    setIsRefreshing(true);
    
    try {
      const rawData = await fetchLeaderboardData();
      
      if (!rawData?.data) {
        throw new Error('Invalid data received from API');
      }

      const processedData = processLeaderboardData(rawData.data);
      const hasChanged = !isInitialLoad && hasDataChanged(data, processedData);
      
      setData(processedData);
      setDataSource(rawData.source);
      setError(null);
      
      const isUsingFallback = rawData.source.includes('fallback');
      const message = isUsingFallback 
        ? 'Unable to retrieve new data, using cached data' 
        : `Data source: ${rawData.source}`;

      setToastMessage({
        message,
        type: isUsingFallback ? 'error' : 'info',
        timestamp: rawData.timestamp,
        ttl: rawData.remainingTtl
      });
      
      if (hasChanged || isInitialLoad) {
        setLastUpdateTime(new Date());
      }
    } catch (err) {
      console.error('Error in refreshData:', err);
      setError('Failed to load leaderboard data. Please try again later.');
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
    dataSource
  };
};