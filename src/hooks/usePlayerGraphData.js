import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchGraphData } from '../services/gp-api';
import { formatMultipleUsernamesForUrl } from '../utils/urlHandler';

// Constants
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
  HOUR: 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
};
TIME.MINUTES_15 = 15 * TIME.MINUTE;
const GAP_THRESHOLD = 2 * TIME.HOUR;
const NEW_LOGIC_TIMESTAMP_S = 1750436334;
const NEW_LOGIC_TIMESTAMP_MS = NEW_LOGIC_TIMESTAMP_S * 1000;


// Processes legacy data points using the old interpolation method.
const legacy_interpolateDataPoints = (rawData, isFinalSegment = true) => {
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
    
    if (isFinalSegment) {
        const lastPoint = rawData[rawData.length - 1];
        const timeToNow = now - lastPoint.timestamp;
        
        if (timeToNow > TIME.MINUTES_15) {
          interpolatedData.push({
            ...lastPoint,
            timestamp: new Date(now),
            isInterpolated: true
          });
        }
    }
    
    return interpolatedData;
};

// Processes the full dataset, applying legacy or new logic based on timestamp.
const processGraphData = (rawData) => {
    if (!rawData?.length) return [];

    const parsedData = rawData.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp * 1000)
    })).sort((a, b) => a.timestamp - b.timestamp);

    const legacyPoints = parsedData.filter(p => p.timestamp.getTime() < NEW_LOGIC_TIMESTAMP_MS);
    const newPoints = parsedData.filter(p => p.timestamp.getTime() >= NEW_LOGIC_TIMESTAMP_MS);

    const legacyScoreChanged = legacyPoints.filter(p => p.scoreChanged);
    const hasNewData = newPoints.length > 0;
    const processedLegacy = legacy_interpolateDataPoints(legacyScoreChanged, !hasNewData);

    if (!hasNewData) {
        return processedLegacy;
    }

    // Build the final array for the new period, handling gaps and staircases
    const processedNew = [];
    if (newPoints.length > 0) {
        for (let i = 0; i < newPoints.length; i++) {
            const previous = i > 0 ? newPoints[i - 1] : null;
            const current = newPoints[i];

            if (previous) {
                const timeDiff = current.timestamp - previous.timestamp;

                // A. Handle Gaps (> 2 hours)
                if (timeDiff > GAP_THRESHOLD) {
                    // Mark the last real point before the gap to make the line from it dashed.
                    const lastAddedPoint = processedNew[processedNew.length - 1];
                    if (lastAddedPoint) {
                        lastAddedPoint.isFollowedByGap = true;
                    }
                    
                    // Add a synthetic "bridge" point. It has the *previous* point's score
                    // and a timestamp just before the current point. This creates the
                    // horizontal dashed line across the gap.
                    processedNew.push({
                        ...previous,
                        timestamp: new Date(current.timestamp.getTime() - TIME.MINUTES_15),
                        isGapBridge: true,
                        scoreChanged: false,
                    });
                }
                // B. Handle back-to-back games (staircase)
                else if (previous.scoreChanged && current.scoreChanged) {
                    // Add a synthetic point to create the staircase step.
                    processedNew.push({
                        ...previous,
                        timestamp: new Date(current.timestamp.getTime() - TIME.MINUTES_15),
                        isStaircasePoint: true,
                        scoreChanged: false,
                    });
                }
            }

            // Add the actual current point from the raw new data
            processedNew.push(current);
        }
    }

    let combined = [...processedLegacy, ...processedNew];
    
    // Handle gap between legacy and new data
    if (legacyScoreChanged.length > 0 && newPoints.length > 0) {
        const lastLegacyScoreChangedPoint = legacyScoreChanged[legacyScoreChanged.length - 1];
        const firstNewPoint = newPoints[0];
        if (firstNewPoint.timestamp - lastLegacyScoreChangedPoint.timestamp > GAP_THRESHOLD) {
            // Find the original point in the combined array to flag it
            const pointToFlag = combined.find(p => 
                p.timestamp.getTime() === lastLegacyScoreChangedPoint.timestamp.getTime() && 
                !p.isInterpolated && !p.isExtrapolated && !p.isStaircasePoint
            );
            if (pointToFlag) pointToFlag.isFollowedByGap = true;
        }
    }
    
    // Handle final interpolation to 'now' for the new data period
    if (hasNewData) {
        const now = new Date();
        const lastRealPoint = newPoints[newPoints.length - 1];
        if (now - lastRealPoint.timestamp > TIME.MINUTES_15) {
            combined.push({
                ...lastRealPoint,
                timestamp: now,
                isInterpolated: true,
                scoreChanged: false,
            });
        }
    }

    return combined;
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
      const gameCount = activeData.length + RANKED_PLACEMENTS;
      
      const processedData = processGraphData(result.data);
      if (processedData.length < 2) return null;

      return { data: processedData, gameCount };
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
      
      if (activeData.length === 0) {
        setError('No games with rank score changes have been recorded for this player.');
        setLoading(false);
        return;
      }
      
      const processedData = processGraphData(result.data);

      if (processedData.length < 2) {
        setError('Not enough data points to display a meaningful graph.');
        setLoading(false);
        return;
      }
  
      setMainPlayerGameCount(activeData.length + RANKED_PLACEMENTS);
      setData(processedData);
      
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