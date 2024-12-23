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

  const hasDataChanged = (oldData, newData) => {
    const oldTopScores = oldData.globalLeaderboard.slice(0, 5000).map(p => p.rankScore);
    const newTopScores = newData.globalLeaderboard.slice(0, 5000).map(p => p.rankScore);
    if (oldTopScores.some((score, i) => score !== newTopScores[i])) return true;
    
    return oldData.isTopClan !== newData.isTopClan;
  };

  const refreshData = async (isInitialLoad = false) => {
    setIsRefreshing(true);
    try {
      const rawData = await fetchLeaderboardData();
      const processedData = processLeaderboardData(rawData.data);
      
      const hasChanged = !isInitialLoad && hasDataChanged(data, processedData);
      
      setData(processedData);
      setError(null);
      
      if (!isInitialLoad) {
        setToastMessage({
          message: hasChanged
            ? "Leaderboard updated" 
            : "No leaderboard updates yet",
          type: hasChanged ? 'success' : 'info'
        });
      }
      
      if (hasChanged || isInitialLoad) {
        setLastUpdateTime(new Date());
      }
    } catch (err) {
      console.error('Error details:', err);
      setError(err.message);
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
    lastUpdateTime
  };
};