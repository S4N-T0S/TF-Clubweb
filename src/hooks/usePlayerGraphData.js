import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchGraphData } from '../services/gp-api';
import { formatMultipleUsernamesForUrl } from '../utils/urlHandler';

// Constants from GraphModal
const RANKED_PLACEMENTS = 4;
const MAX_COMPARISONS = 5;
const COMPARISON_COLORS = [
  'rgba(255, 159, 64, 0.8)',  // Orange
  'rgba(153, 102, 255, 0.8)', // Purple
  'rgba(255, 99, 132, 0.8)',  // Pink
  'rgba(75, 163, 53, 0.8)', // Green
  'rgba(191, 102, 76, 0.8)',  // Terracotta
];
const TIME = {
  MINUTE: 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
};
TIME.MINUTES_15 = 15 * TIME.MINUTE;

// Helper function moved from GraphModal
const interpolateDataPoints = (rawData) => {
    if (!rawData?.length || rawData.length < 2) return rawData;
    
    const interpolatedData = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now - TIME.WEEK);
    
    // Add extrapolation point at 7 days ago if first data point is more recent
    if (rawData[0].timestamp > sevenDaysAgo) {
      interpolatedData.push({
        ...rawData[0],
        timestamp: sevenDaysAgo,
        isExtrapolated: true
      });
      
      // Add point just before the first real data point
      interpolatedData.push({
        ...rawData[0],
        timestamp: new Date(rawData[0].timestamp - TIME.MINUTES_15),
        isExtrapolated: true
      });
    }
    
    // Original interpolation logic
    for (let i = 0; i < rawData.length - 1; i++) {
      const currentPoint = rawData[i];
      const nextPoint = rawData[i + 1];
      
      interpolatedData.push(currentPoint);
      
      const timeDiff = nextPoint.timestamp - currentPoint.timestamp;
      
      if (timeDiff > TIME.MINUTES_15) {
        interpolatedData.push({
          ...currentPoint,
          timestamp: new Date(nextPoint.timestamp - TIME.MINUTES_15),
          isInterpolated: true
        });
      }
    }
    
    interpolatedData.push(rawData[rawData.length - 1]);
    
    const lastPoint = rawData[rawData.length - 1];
    const timeToNow = now - lastPoint.timestamp;
    
    if (timeToNow > TIME.MINUTES_15) {
      interpolatedData.push({
        ...lastPoint,
        timestamp: new Date(now),
        isInterpolated: true
      });
    }
    
    return interpolatedData;
};

export const usePlayerGraphData = (isOpen, embarkId, initialCompareIds, globalLeaderboard) => {
  const [data, setData] = useState(null);
  const [mainPlayerGameCount, setMainPlayerGameCount] = useState(0);
  const [comparisonData, setComparisonData] = useState(new Map());
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const isLoadingRef = useRef(false);
  const loadedCompareIdsRef = useRef(new Set());
  const shouldFollowUrlRef = useRef(true);

  const loadComparisonData = useCallback(async (compareId) => {
    try {
      const result = await fetchGraphData(compareId);
      if (!result.data?.length) return null;
      
      const activeData = result.data.filter(item => item.scoreChanged);
      if (!activeData.length) return null;

      const gameCount = activeData.length + RANKED_PLACEMENTS;
      const parsedData = activeData.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp * 1000)
      }));
      
      const interpolatedData = interpolateDataPoints(parsedData);
      return { data: interpolatedData, gameCount };
    } catch (error) {
      console.error(`Failed to load comparison data for ${compareId}:`, error);
      return null;
    }
  }, []);

  const addComparison = useCallback(async (player) => {
    if (comparisonData.size >= MAX_COMPARISONS) {
      return;
    }
    
    shouldFollowUrlRef.current = false;
    
    const loadedResult = await loadComparisonData(player.name);
    if (loadedResult) {
      const { data: newData, gameCount: newGameCount } = loadedResult;
      setComparisonData(prev => {
        const next = new Map(prev);
        next.set(player.name, {
          data: newData,
          color: COMPARISON_COLORS[next.size],
          gameCount: newGameCount,
        });
        
        loadedCompareIdsRef.current.add(player.name);
        
        const currentCompares = Array.from(next.keys());
        const urlString = formatMultipleUsernamesForUrl(embarkId, currentCompares);
        window.history.replaceState(null, '', `/graph/${urlString}`);
        
        return next;
      });
    }
  }, [loadComparisonData, comparisonData.size, embarkId]);

  const removeComparison = useCallback((compareEmbarkId) => {
    shouldFollowUrlRef.current = false;
    
    setComparisonData(prev => {
      const next = new Map(prev);
      next.delete(compareEmbarkId);
      loadedCompareIdsRef.current.delete(compareEmbarkId);
      
      const entries = Array.from(next.entries());
      entries.forEach(([id, {data, gameCount}], index) => {
        next.set(id, {
          data,
          gameCount,
          color: COMPARISON_COLORS[index]
        });
      });
      
      const currentCompares = Array.from(next.keys());
      const urlString = formatMultipleUsernamesForUrl(embarkId, currentCompares);
      window.history.replaceState(null, '', `/graph/${urlString}`);
      
      return next;
    });
  }, [embarkId]);

  const loadMainData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGraphData(embarkId);

      if (!result.data?.length) {
        setError('No data available for this player, they may have recently changed their embarkId.');
        setLoading(false);
        return;
      }
      
      const activeData = result.data.filter(item => item.scoreChanged);
      
      if (!activeData.length) {
        setError('No games with rank score changes have been recorded for this player.');
        setLoading(false);
        return;
      }
      
      if (activeData.length < 2) {
        setError('Not enough data points with score changes to display a meaningful graph.');
        setLoading(false);
        return;
      }
  
      setMainPlayerGameCount(activeData.length + RANKED_PLACEMENTS);

      const parsedData = activeData.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp * 1000)
      }));
      
      const interpolatedData = interpolateDataPoints(parsedData);
      setData(interpolatedData);
      
    } catch (error) {
      setError(`Failed to load player history: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [embarkId]);

  useEffect(() => {
    if (isOpen && embarkId) {
      // Reset state for new player
      setData(null);
      setError(null);
      setMainPlayerGameCount(0);
      setComparisonData(new Map());
      loadedCompareIdsRef.current.clear();
      shouldFollowUrlRef.current = true;
      isLoadingRef.current = false;

      loadMainData();
    }
  }, [isOpen, embarkId, loadMainData]);

  useEffect(() => {
    const loadedIds = loadedCompareIdsRef.current;
    const shouldFollowUrl = shouldFollowUrlRef.current;
    let isLoading = isLoadingRef.current;

    const loadInitialComparisons = async () => {
      if (!isOpen || !initialCompareIds?.length || !globalLeaderboard || 
          isLoading || !shouldFollowUrl) {
        return;
      }

      const currentCompareIds = Array.from(comparisonData.keys());
      if (JSON.stringify(currentCompareIds) === JSON.stringify(initialCompareIds)) {
        return;
      }

      isLoading = true;
      isLoadingRef.current = true;
      
      try {
        const newComparisons = new Map();
        
        for (const [index, compareId] of initialCompareIds.entries()) {
          if (newComparisons.size >= MAX_COMPARISONS) break;
          
          const comparisonResult = await loadComparisonData(compareId);
          
          if (comparisonResult) {
            newComparisons.set(compareId, {
              data: comparisonResult.data,
              gameCount: comparisonResult.gameCount,
              color: COMPARISON_COLORS[index]
            });
            loadedIds.add(compareId);
          }
        }
        
        if (newComparisons.size > 0) {
          setComparisonData(newComparisons);
        }
      } finally {
        isLoading = false;
        isLoadingRef.current = false;
      }
    };

    loadInitialComparisons();
    
    return () => {
      if (!isOpen) {
        loadedIds.clear();
        shouldFollowUrlRef.current = true;
        isLoadingRef.current = false;
      }
    };
  }, [isOpen, initialCompareIds, globalLeaderboard, comparisonData, loadComparisonData]);

  return {
    data,
    mainPlayerGameCount,
    comparisonData,
    loading,
    error,
    addComparison,
    removeComparison,
  };
};