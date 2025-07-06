import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchGraphData } from '../services/gp-api';
import { formatMultipleUsernamesForUrl } from '../utils/urlHandler';
import { SEASONS } from '../services/historicalDataService';

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
};
TIME.MINUTES_15 = 15 * TIME.MINUTE;
const GAP_THRESHOLD = 2 * TIME.HOUR;
const NEW_LOGIC_TIMESTAMP_MS = 1750436334 * 1000;


// Processes legacy data points using the old interpolation method.
const legacy_interpolateDataPoints = (rawData, isFinalSegment = true, seasonEndDate = null) => {
  if (!rawData?.length || rawData.length < 2) return rawData;

  const interpolatedData = [];
  const now = seasonEndDate ? new Date(seasonEndDate) : new Date();

  // Original interpolation logic for stairs
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
        timestamp: now,
        isInterpolated: true,
        isFinalInterpolation: true,
      });
    }
  }

  return interpolatedData;
};

// Processes the full dataset, applying legacy or new logic based on timestamp.
const processGraphData = (rawData, events = [], seasonEndDate = null, eventSettings = {}) => {
  if (!rawData?.length) return [];

  const parsedData = rawData.map(item => ({
    ...item,
    timestamp: new Date(item.timestamp * 1000)
  })).sort((a, b) => a.timestamp - b.timestamp);

  // Attach point-specific events (RS_ADJUSTMENT, NAME_CHANGE, CLUB_CHANGE) to the closest data points
  events.forEach(event => {
    if (event.event_type !== 'RS_ADJUSTMENT' && event.event_type !== 'NAME_CHANGE' && event.event_type !== 'CLUB_CHANGE') {
      return;
    }

    const eventTimestamp = event.start_timestamp * 1000;
    let closestPoint = null;
    let minDiff = Infinity;

    // Find the closest point in time
    parsedData.forEach(point => {
      const diff = Math.abs(point.timestamp.getTime() - eventTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = point;
      }
    });

    // Attach event if a close enough point is found (within 5 mins)
    // For RS_ADJUSTMENT, only attach to points where the score actually changed.
    if (event.event_type === 'RS_ADJUSTMENT' && !closestPoint.scoreChanged) return;

    if (closestPoint && minDiff < 5 * TIME.MINUTE) {
      if (!closestPoint.events) {
        closestPoint.events = [];
      }
      closestPoint.events.push(event);
    }
  });

  const legacyPoints = parsedData.filter(p => p.timestamp.getTime() < NEW_LOGIC_TIMESTAMP_MS);
  const newPoints = parsedData.filter(p => p.timestamp.getTime() >= NEW_LOGIC_TIMESTAMP_MS);

  const legacyScoreChanged = legacyPoints.filter(p => p.scoreChanged);
  const hasNewData = newPoints.length > 0;
  const processedLegacy = legacy_interpolateDataPoints(legacyScoreChanged, !hasNewData, seasonEndDate);

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

  // Inject synthetic points for all ban events if enabled in settings
  const banEvents = events.filter(e => e.event_type === 'SUSPECTED_BAN');
  if (eventSettings.showSuspectedBan && banEvents.length > 0) {
    banEvents.sort((a, b) => a.start_timestamp - b.start_timestamp); // Process chronologically

    banEvents.forEach(event => {
      const banStartTs = event.start_timestamp * 1000;
      let insertionIndex = combined.findIndex(p => p.timestamp.getTime() > banStartTs);
      if (insertionIndex === -1) {
        insertionIndex = combined.length;
      }

      let lastKnownPoint = null;
      for (let i = insertionIndex - 1; i >= 0; i--) {
        const p = combined[i];
        if (!p.isBanStartAnchor && !p.isBanEndAnchor) {
          lastKnownPoint = p;
          break;
        }
      }

      if (lastKnownPoint) {
        // The ban event we are adding will visually represent any subsequent data gap.
        // Therefore, we must remove the `isFollowedByGap` flag from the last point
        // before the ban to ensure the line leading to the ban start icon is solid.
        if (lastKnownPoint.isFollowedByGap) {
          lastKnownPoint.isFollowedByGap = false;
        }

        // Create a clean start point, not inheriting any flags from lastKnownPoint.
        const banStartPoint = {
          rankScore: lastKnownPoint.rankScore,
          league: lastKnownPoint.league,
          rank: lastKnownPoint.rank,
          timestamp: new Date(banStartTs),
          isInterpolated: true,
          scoreChanged: false,
          isBanStartAnchor: true,
          events: [event],
        };
        combined.splice(insertionIndex, 0, banStartPoint);

        if (event.end_timestamp) {
          const banEndTs = event.end_timestamp * 1000;

          // Try to find the actual data point that marks the player's reappearance.
          // An "actual" point is not synthetic (interpolated, gap bridge, etc.).
          const reappearanceIndex = combined.findIndex((p, idx) =>
            idx > insertionIndex && // Must be after the ban start anchor
            p.timestamp.getTime() >= banEndTs &&
            !p.isInterpolated &&
            !p.isGapBridge &&
            !p.isStaircasePoint
          );

          if (reappearanceIndex !== -1) {
            // If we found the reappearance point, attach the unban info to it.
            const pointToModify = combined[reappearanceIndex];
            pointToModify.isBanEndAnchor = true;
            if (!pointToModify.events) {
              pointToModify.events = [];
            }
            pointToModify.events.push(event);

            // Remove any gap bridge points that are now obsolete because they
            // fall within the completed ban period. This allows the chart to
            // draw a single, correctly styled line for the ban.
            // Iterate backwards to safely use splice.
            for (let i = reappearanceIndex - 1; i > insertionIndex; i--) {
              if (combined[i].isGapBridge) {
                combined.splice(i, 1);
              }
            }
          } else {
            // Fallback for when no data point is found after the unban timestamp.
            let endInsertionIndex = combined.findIndex((p, idx) => idx > insertionIndex && p.timestamp.getTime() > banEndTs);
            if (endInsertionIndex === -1) {
              endInsertionIndex = combined.length;
            }

            const banEndPoint = {
              rankScore: lastKnownPoint.rankScore,
              league: lastKnownPoint.league,
              rank: lastKnownPoint.rank,
              timestamp: new Date(banEndTs),
              isInterpolated: true,
              scoreChanged: false,
              isBanEndAnchor: true,
              events: [event],
            };
            combined.splice(endInsertionIndex, 0, banEndPoint);

            // Also remove gap bridges in this fallback case.
            for (let i = endInsertionIndex - 1; i > insertionIndex; i--) {
              if (combined[i].isGapBridge) {
                combined.splice(i, 1);
              }
            }
          }
        }
      }
    });
  }


  // Handle final interpolation to 'now'
  const now = seasonEndDate ? new Date(seasonEndDate) : new Date();
  if (combined.length > 0) {
    const lastPoint = combined[combined.length - 1];

    const isActiveBanAnchor = lastPoint.isBanStartAnchor && lastPoint.events?.some(e => e.event_type === 'SUSPECTED_BAN' && !e.end_timestamp);
    const timeToNow = now - lastPoint.timestamp;

    // Draw a line to 'now' if there's an active ban or a normal long gap in data
    if (isActiveBanAnchor || (!lastPoint.isBanStartAnchor && !lastPoint.isBanEndAnchor && timeToNow > GAP_THRESHOLD)) {
      if (!isActiveBanAnchor) {
        // It's a normal gap to 'now', not a ban, so flag for a white dashed line.
        lastPoint.isFollowedByGap = true;
      }

      // Base for the new point. If it's an active ban, we create a clean object to avoid
      // spreading unwanted flags like `isBanStartAnchor`. Otherwise, we use the last point.
      const newPointBase = isActiveBanAnchor ? {
        rankScore: lastPoint.rankScore,
        league: lastPoint.league,
        rank: lastPoint.rank,
        events: lastPoint.events,
      } : lastPoint;

      combined.push({
        ...newPointBase,
        timestamp: now,
        isInterpolated: true,
        isFinalInterpolation: true,
        scoreChanged: false,
        // Explicitly ensure the 'now' point is never an anchor itself.
        isBanStartAnchor: false,
        isBanEndAnchor: false,
      });
    }
  }

  return combined;
};


export const usePlayerGraphData = (isOpen, embarkId, initialCompareIds, seasonId, eventSettings) => {
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [mainPlayerCurrentId, setMainPlayerCurrentId] = useState(embarkId);
  const [mainPlayerGameCount, setMainPlayerGameCount] = useState(0);
  const [comparisonData, setComparisonData] = useState(new Map());
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const isLoadingRef = useRef(false);
  const loadedCompareIdsRef = useRef(new Set());
  const shouldFollowUrlRef = useRef(true);

  const seasonConfig = Object.values(SEASONS).find(s => s.id === seasonId);
  const seasonEndDate = seasonConfig?.endTimestamp ? seasonConfig.endTimestamp * 1000 : null;

  const loadComparisonData = useCallback(async (compareId) => {
    try {
      const result = await fetchGraphData(compareId, seasonId);
      if (!result.data?.length) return null;

      const activeData = result.data.filter(item => item.scoreChanged);
      const gameCount = activeData.length + RANKED_PLACEMENTS;

      const processedData = processGraphData(result.data, result.events, seasonEndDate, eventSettings);
      if (processedData.length < 2) return null;

      return { data: processedData, gameCount, events: result.events };
    } catch (error) {
      console.error(`Failed to load comparison data for ${compareId}:`, error);
      return null;
    }
  }, [seasonId, seasonEndDate, eventSettings]);

  const addComparison = useCallback(async (player) => {
    if (comparisonData.size >= MAX_COMPARISONS) {
      return;
    }

    shouldFollowUrlRef.current = false;

    const loadedResult = await loadComparisonData(player.name);
    if (loadedResult) {
      const { data: newData, gameCount: newGameCount, events: newEvents } = loadedResult;
      setComparisonData(prev => {
        const next = new Map(prev);
        next.set(player.name, {
          data: newData,
          color: COMPARISON_COLORS[next.size],
          gameCount: newGameCount,
          events: newEvents,
        });

        loadedCompareIdsRef.current.add(player.name);

        const currentCompares = Array.from(next.keys());
        const urlString = formatMultipleUsernamesForUrl(mainPlayerCurrentId, currentCompares);
        window.history.replaceState(null, '', `/graph/${seasonId}/${urlString}`);

        return next;
      });
    }
  }, [loadComparisonData, comparisonData.size, mainPlayerCurrentId, seasonId]);

  const removeComparison = useCallback((compareEmbarkId) => {
    shouldFollowUrlRef.current = false;

    setComparisonData(prev => {
      const next = new Map(prev);
      next.delete(compareEmbarkId);
      loadedCompareIdsRef.current.delete(compareEmbarkId);

      const entries = Array.from(next.entries());
      // Re-map to update colors correctly after removal
      const updatedMap = new Map();
      entries.forEach(([id, value], index) => {
        updatedMap.set(id, {
          ...value,
          color: COMPARISON_COLORS[index]
        });
      });

      const currentCompares = Array.from(updatedMap.keys());
      const urlString = formatMultipleUsernamesForUrl(mainPlayerCurrentId, currentCompares);
      window.history.replaceState(null, '', `/graph/${seasonId}/${urlString}`);

      return updatedMap;
    });
  }, [mainPlayerCurrentId, seasonId]);

  const loadMainData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGraphData(embarkId, seasonId);

      if (result.currentEmbarkId) {
        setMainPlayerCurrentId(result.currentEmbarkId);
      }

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

      const processedData = processGraphData(result.data, result.events, seasonEndDate, eventSettings);

      if (processedData.length < 2) {
        setError('Not enough data points to display a meaningful graph.');
        setLoading(false);
        return;
      }

      setMainPlayerGameCount(activeData.length + RANKED_PLACEMENTS);
      setData(processedData);
      setEvents(result.events);

    } catch (error) {
      setError(`Failed to load player history: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [embarkId, seasonId, seasonEndDate, eventSettings]);

  useEffect(() => {
    if (isOpen && embarkId && seasonId) {
      // Reset state for new player
      setData(null);
      setError(null);
      setEvents([]);
      setMainPlayerCurrentId(embarkId);
      setMainPlayerGameCount(0);
      setComparisonData(new Map());
      loadedCompareIdsRef.current.clear();
      shouldFollowUrlRef.current = true;
      isLoadingRef.current = false;

      loadMainData();
    }
  }, [isOpen, embarkId, seasonId, loadMainData]);

  useEffect(() => {
    const loadedIds = loadedCompareIdsRef.current;
    const shouldFollowUrl = shouldFollowUrlRef.current;
    let isLoading = isLoadingRef.current;

    const loadInitialComparisons = async () => {
      if (!isOpen || !initialCompareIds?.length ||
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
              events: comparisonResult.events,
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
  }, [isOpen, initialCompareIds, comparisonData, loadComparisonData]);

  useEffect(() => {
    // This effect updates the URL if a name change was detected on load.
    // It's designed to prevent flickering by waiting for initial compares to finish loading.
    if (!isOpen || !mainPlayerCurrentId || mainPlayerCurrentId === embarkId) {
      return; // Only run if modal is open and a name change was detected.
    }

    // isLoadingRef.current is true while initial comparison players are being fetched.
    // We wait for that process to finish (by re-running when comparisonData updates) before touching the URL.
    if (isLoadingRef.current) {
      return;
    }

    const compareIdsFromState = Array.from(comparisonData.keys());
    const urlString = formatMultipleUsernamesForUrl(mainPlayerCurrentId, compareIdsFromState);
    const newUrl = `/graph/${seasonId}/${urlString}`;

    if (window.location.pathname !== newUrl) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [isOpen, embarkId, seasonId, mainPlayerCurrentId, comparisonData]);

  return {
    data,
    events,
    mainPlayerCurrentId,
    mainPlayerGameCount,
    comparisonData,
    loading,
    error,
    addComparison,
    removeComparison,
  };
};