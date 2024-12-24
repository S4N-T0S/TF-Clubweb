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
    //console.log('Starting refresh', { isInitialLoad });
    setIsRefreshing(true);
    
    try {
      const rawData = await fetchLeaderboardData();
      //console.log('Received data from API:', rawData);
      
      if (!rawData?.data) {
        //console.error('Invalid data received:', rawData);
        throw new Error('Invalid data received from API');
      }

      const processedData = processLeaderboardData(rawData.data);
      /*console.log('Processed data:', { 
        globalLeaderboardLength: processedData.globalLeaderboard.length,
        source: rawData.source 
      });*/

      const hasChanged = !isInitialLoad && hasDataChanged(data, processedData);
      
      setData(processedData);
      setDataSource(rawData.source);
      setError(null);
      
      if (!isInitialLoad) {
        if (rawData.source.includes('fallback')) {
          setToastMessage({
            message: "Using cached data - API temporarily unavailable",
            type: 'error'
          });
        } else {
          setToastMessage({
            message: hasChanged ? "Leaderboard updated" : `No updates yet (${rawData.source})`,
            type: hasChanged ? 'success' : 'info'
          });
        }
      }
      
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