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

  // Separate ban events to process them robustly.
  const completedBanEvents = events.filter(e => e.event_type === 'SUSPECTED_BAN' && e.end_timestamp);
  const activeBan = events.find(e => e.event_type === 'SUSPECTED_BAN' && !e.end_timestamp);

  if (eventSettings.showSuspectedBan) {
    // 1. Process all COMPLETED bans first.
    if (completedBanEvents.length > 0) {
      completedBanEvents.sort((a, b) => a.start_timestamp - b.start_timestamp);
      completedBanEvents.forEach(event => {
        const banStartTs = event.start_timestamp * 1000;
        let insertionIndex = combined.findIndex(p => p.timestamp.getTime() > banStartTs);
        if (insertionIndex === -1) { insertionIndex = combined.length; }

        let lastKnownPoint = null;
        for (let i = insertionIndex - 1; i >= 0; i--) {
          if (!combined[i].isBanStartAnchor && !combined[i].isBanEndAnchor) {
            lastKnownPoint = combined[i];
            break;
          }
        }

        if (lastKnownPoint) {
          if (lastKnownPoint.isFollowedByGap) { lastKnownPoint.isFollowedByGap = false; }
          const banStartPoint = {
            rankScore: lastKnownPoint.rankScore, league: lastKnownPoint.league, rank: lastKnownPoint.rank,
            timestamp: new Date(banStartTs), isInterpolated: true, scoreChanged: false, isBanStartAnchor: true, events: [event],
          };
          combined.splice(insertionIndex, 0, banStartPoint);

          const banEndTs = event.end_timestamp * 1000;
          const reappearanceIndex = combined.findIndex((p, idx) =>
            idx > insertionIndex && p.timestamp.getTime() >= banEndTs && !p.isInterpolated && !p.isGapBridge && !p.isStaircasePoint
          );

          if (reappearanceIndex !== -1) {
            const pointToModify = combined[reappearanceIndex];
            pointToModify.isBanEndAnchor = true;
            if (!pointToModify.events) { pointToModify.events = []; }
            pointToModify.events.push(event);
            for (let i = reappearanceIndex - 1; i > insertionIndex; i--) {
              if (combined[i].isGapBridge) { combined.splice(i, 1); }
            }
          } else {
            let endInsertionIndex = combined.findIndex((p, idx) => idx > insertionIndex && p.timestamp.getTime() > banEndTs);
            if (endInsertionIndex === -1) { endInsertionIndex = combined.length; }
            const banEndPoint = {
              rankScore: lastKnownPoint.rankScore, league: lastKnownPoint.league, rank: lastKnownPoint.rank,
              timestamp: new Date(banEndTs), isInterpolated: true, scoreChanged: false, isBanEndAnchor: true, events: [event],
            };
            combined.splice(endInsertionIndex, 0, banEndPoint);
            for (let i = endInsertionIndex - 1; i > insertionIndex; i--) {
              if (combined[i].isGapBridge) { combined.splice(i, 1); }
            }
          }
        }
      });
    }

    // 2. Process the single ACTIVE ban (if it exists) LAST.
    if (activeBan) {
      const banStartTs = activeBan.start_timestamp * 1000;
      let insertionIndex = combined.findIndex(p => p.timestamp.getTime() >= banStartTs);
      if (insertionIndex === -1) { insertionIndex = combined.length; }

      let lastKnownPoint = null;
      for (let i = insertionIndex - 1; i >= 0; i--) {
        const p = combined[i];
        if (!p.isBanStartAnchor && !p.isBanEndAnchor && !p.isUnexpectedReappearance) {
          lastKnownPoint = p;
          break;
        }
      }

      if (lastKnownPoint) {
        if (lastKnownPoint.isFollowedByGap) { lastKnownPoint.isFollowedByGap = false; }
        const banStartPoint = {
          rankScore: lastKnownPoint.rankScore, league: lastKnownPoint.league, rank: lastKnownPoint.rank,
          timestamp: new Date(banStartTs), isInterpolated: true, scoreChanged: false, isBanStartAnchor: true, events: [activeBan],
        };

        const reappearanceIndex = combined.findIndex((p, idx) =>
          idx >= insertionIndex && p.scoreChanged && !p.isInterpolated
        );

        if (reappearanceIndex !== -1) {
          // Case A: Unexpected reappearance found.
          const pointToModify = combined[reappearanceIndex];
          pointToModify.isUnexpectedReappearance = true;
          if (!pointToModify.events) { pointToModify.events = []; }
          pointToModify.events.push(activeBan);
          banStartPoint.isFollowedByUnexpectedReappearance = true;
          combined.splice(insertionIndex, reappearanceIndex - insertionIndex);
          combined.splice(insertionIndex, 0, banStartPoint);
        } else {
          // Case B: No reappearance. Ban is ongoing.
          combined.splice(insertionIndex);
          combined.push(banStartPoint);
        }
      }
    }
  }

  // Handle final interpolation to 'now'
  const now = seasonEndDate ? new Date(seasonEndDate) : new Date();
  if (combined.length > 0) {
    const lastPoint = combined[combined.length - 1];

    if (lastPoint.isUnexpectedReappearance) {
      // If the last point is an unexpected return, draw a dashed orange line to 'now'.
      lastPoint.isFollowedByUnexpectedReappearance = true; // Signals line style
      const newPointBase = {
        rankScore: lastPoint.rankScore, league: lastPoint.league,
        rank: lastPoint.rank, events: lastPoint.events,
      };
      combined.push({
        ...newPointBase,
        timestamp: now, isInterpolated: true, isFinalInterpolation: true,
        scoreChanged: false, isBanStartAnchor: false, isBanEndAnchor: false,
        isUnexpectedReappearance: false, // The 'now' point is not the event itself
      });
    } else {
      // Original logic for normal gaps and standard active bans
      const isActiveBanAnchor = lastPoint.isBanStartAnchor && lastPoint.events?.some(e => e.event_type === 'SUSPECTED_BAN' && !e.end_timestamp);
      const timeToNow = now - lastPoint.timestamp;

      if (isActiveBanAnchor || (!lastPoint.isBanStartAnchor && !lastPoint.isBanEndAnchor && timeToNow > GAP_THRESHOLD)) {
        if (!isActiveBanAnchor) {
          lastPoint.isFollowedByGap = true;
        }
        const newPointBase = isActiveBanAnchor ? {
          rankScore: lastPoint.rankScore, league: lastPoint.league, rank: lastPoint.rank, events: lastPoint.events,
        } : lastPoint;
        combined.push({
          ...newPointBase,
          timestamp: now, isInterpolated: true, isFinalInterpolation: true,
          scoreChanged: false, isBanStartAnchor: false, isBanEndAnchor: false,
        });
      }
    }
  }

  return combined;
};


export const usePlayerGraphData = (isOpen, embarkId, initialCompareIds, seasonId, eventSettings) => {
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [mainPlayerCurrentId, setMainPlayerCurrentId] = useState(embarkId);
  const [mainPlayerGameCount, setMainPlayerGameCount] = useState(0);
  const [mainPlayerAvailableSeasons, setMainPlayerAvailableSeasons] = useState([]);
  const [comparisonData, setComparisonData] = useState(new Map());
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Internal state to track the currently viewed season, initialized with the prop.
  const [currentSeasonId, setCurrentSeasonId] = useState(seasonId);

  const isLoadingRef = useRef(false);
  const loadedCompareIdsRef = useRef(new Set());
  const shouldFollowUrlRef = useRef(true);

  const getSeasonEndDate = useCallback((sId) => {
    const seasonConfig = Object.values(SEASONS).find(s => s.id === sId);
    return seasonConfig?.endTimestamp ? seasonConfig.endTimestamp * 1000 : null;
  }, []);

  const loadComparisonData = useCallback(async (compareId, targetSeasonId) => {
    try {
      const result = await fetchGraphData(compareId, targetSeasonId);
      if (!result.data?.length) return null;

      const activeData = result.data.filter(item => item.scoreChanged);
      const gameCount = activeData.length + RANKED_PLACEMENTS;

      const targetSeasonEndDate = getSeasonEndDate(targetSeasonId);
      const processedData = processGraphData(result.data, result.events, targetSeasonEndDate, eventSettings);
      if (processedData.length < 2) return null;

      return { data: processedData, gameCount, events: result.events, currentEmbarkId: result.currentEmbarkId, availableSeasons: result.availableSeasons };
    } catch (error) {
      console.error(`Failed to load comparison data for ${compareId}:`, error);
      return null;
    }
  }, [eventSettings, getSeasonEndDate]);

  const addComparison = useCallback(async (player) => {
    if (comparisonData.size >= MAX_COMPARISONS || player.name === mainPlayerCurrentId || comparisonData.has(player.name)) {
      return;
    }

    shouldFollowUrlRef.current = false;

    const loadedResult = await loadComparisonData(player.name, currentSeasonId);
    if (loadedResult) {
      const { data: newData, gameCount: newGameCount, events: newEvents, availableSeasons: newAvailableSeasons } = loadedResult;
      setComparisonData(prev => {
        const next = new Map(prev);
        next.set(player.name, {
          data: newData,
          color: COMPARISON_COLORS[next.size],
          gameCount: newGameCount,
          events: newEvents,
          availableSeasons: newAvailableSeasons,
        });

        loadedCompareIdsRef.current.add(player.name);

        const currentCompares = Array.from(next.keys());
        const urlString = formatMultipleUsernamesForUrl(mainPlayerCurrentId, currentCompares);
        window.history.replaceState(null, '', `/graph/${currentSeasonId}/${urlString}`);

        return next;
      });
    }
  }, [loadComparisonData, comparisonData, mainPlayerCurrentId, currentSeasonId]);

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
      window.history.replaceState(null, '', `/graph/${currentSeasonId}/${urlString}`);

      return updatedMap;
    });
  }, [mainPlayerCurrentId, currentSeasonId]);

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

      const seasonEndDate = getSeasonEndDate(seasonId);
      const processedData = processGraphData(result.data, result.events, seasonEndDate, eventSettings);

      if (processedData.length < 2) {
        setError('Not enough data points to display a meaningful graph.');
        setLoading(false);
        return;
      }

      setMainPlayerGameCount(activeData.length + RANKED_PLACEMENTS);
      setData(processedData);
      setEvents(result.events);
      setMainPlayerAvailableSeasons(result.availableSeasons);

    } catch (error) {
      setError(`Failed to load player history: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [embarkId, seasonId, eventSettings, getSeasonEndDate]);

  useEffect(() => {
    if (isOpen && embarkId && seasonId) {
      // Reset state for new player
      setData(null);
      setError(null);
      setEvents([]);
      setMainPlayerCurrentId(embarkId);
      setMainPlayerGameCount(0);
      setMainPlayerAvailableSeasons([]);
      setComparisonData(new Map());
      setCurrentSeasonId(seasonId); // Reset internal season state
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
      if (!isOpen || isLoading || !shouldFollowUrl) {
        return;
      }

      // Start with a unique list of IDs from the URL. We won't filter the main player yet,
      // as their name might have changed. We'll handle all de-duplication after fetching.
      const uniqueCompareIds = initialCompareIds?.length
        ? [...new Set(initialCompareIds)]
        : [];

      // If there's nothing to load from the URL, and we have no comparisons, we're done.
      if (uniqueCompareIds.length === 0 && comparisonData.size === 0) {
        return;
      }

      isLoading = true;
      isLoadingRef.current = true;

      try {
        // Fetch all comparison players' data in parallel to wait for all results before processing.
        const promises = uniqueCompareIds.map(id =>
          loadComparisonData(id, currentSeasonId).then(result => ({
            requestedId: id,
            result,
          }))
        );
        const results = await Promise.all(promises);

        const newComparisons = new Map();
        // The set of loaded IDs starts with the main player's current ID to avoid adding them as a comparison.
        const loadedEmbarkIds = new Set([mainPlayerCurrentId]);
        const finalCompareIds = [];

        // Process all results to build a sanitized list of comparisons.
        for (const { result } of results) {
          if (!result || !result.currentEmbarkId) continue;

          const { currentEmbarkId } = result;

          // Check for duplicates (including main player) and max comparison limit.
          if (!loadedEmbarkIds.has(currentEmbarkId) && newComparisons.size < MAX_COMPARISONS) {
            loadedEmbarkIds.add(currentEmbarkId);
            finalCompareIds.push(currentEmbarkId);

            newComparisons.set(currentEmbarkId, {
              data: result.data,
              gameCount: result.gameCount,
              events: result.events,
              availableSeasons: result.availableSeasons,
              color: COMPARISON_COLORS[newComparisons.size],
            });
            loadedIds.add(currentEmbarkId);
          }
        }

        const currentComparisonKeys = Array.from(comparisonData.keys()).sort();
        const newComparisonKeys = Array.from(newComparisons.keys()).sort();

        // If the final set of players is identical to what's already loaded, we don't need to set state.
        // This prevents re-renders and re-fetches if the only change was resolving an old name in the URL.
        if (JSON.stringify(currentComparisonKeys) !== JSON.stringify(newComparisonKeys)) {
          setComparisonData(newComparisons);
        }

        // Always ensure the URL is up-to-date with the correct, sanitized list of player IDs.
        const urlString = formatMultipleUsernamesForUrl(mainPlayerCurrentId, newComparisonKeys);
        const newUrl = `/graph/${currentSeasonId}/${urlString}`;
        if (window.location.pathname !== newUrl) {
          window.history.replaceState(null, '', newUrl);
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
  }, [isOpen, initialCompareIds, comparisonData, loadComparisonData, mainPlayerCurrentId, currentSeasonId]);

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
    const newUrl = `/graph/${currentSeasonId}/${urlString}`;

    if (window.location.pathname !== newUrl) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [isOpen, embarkId, currentSeasonId, mainPlayerCurrentId, comparisonData]);

  const switchSeason = useCallback(async (newSeasonId) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch main player for the new season using the season-specific embark ID
      const mainPlayerSeasonInfo = mainPlayerAvailableSeasons.find(s => s.id === newSeasonId);
      if (!mainPlayerSeasonInfo) {
        throw new Error("Season information not found for main player.");
      }
      const mainPlayerIdForNewSeason = mainPlayerSeasonInfo.embarkId;
      const mainPlayerResult = await fetchGraphData(mainPlayerIdForNewSeason, newSeasonId);

      if (mainPlayerResult.data?.length) {
        const seasonEndDate = getSeasonEndDate(newSeasonId);
        const processedMainData = processGraphData(mainPlayerResult.data, mainPlayerResult.events, seasonEndDate, eventSettings);
        setData(processedMainData);
        setEvents(mainPlayerResult.events);
        setMainPlayerGameCount(mainPlayerResult.data.filter(i => i.scoreChanged).length + RANKED_PLACEMENTS);
        setMainPlayerCurrentId(mainPlayerResult.currentEmbarkId);
        setMainPlayerAvailableSeasons(mainPlayerResult.availableSeasons);
      } else {
        throw new Error(`Player has no data for the selected season.`);
      }

      // 2. Filter and re-fetch comparison players using their season-specific embark IDs
      const newComparisonMap = new Map();
      const promises = [];
      const currentCompares = Array.from(comparisonData.values());

      for (const compareValue of currentCompares) {
        const seasonInfo = compareValue.availableSeasons?.find(s => s.id === newSeasonId);
        if (seasonInfo) {
          const embarkIdForNewSeason = seasonInfo.embarkId;
          promises.push(
            loadComparisonData(embarkIdForNewSeason, newSeasonId).then(result => ({ id: embarkIdForNewSeason, result }))
          );
        }
      }

      const results = await Promise.all(promises);
      const finalCompareIds = [];

      results.forEach(({ id, result }) => {
        if (result && result.data?.length) {
          const key = result.currentEmbarkId || id;
          if (!finalCompareIds.includes(key)) {
            finalCompareIds.push(key);
            newComparisonMap.set(key, {
              data: result.data,
              gameCount: result.gameCount,
              events: result.events,
              availableSeasons: result.availableSeasons,
              color: '' // Placeholder, will be re-colored next
            });
          }
        }
      });
      
      // 3. Update comparison state with new data and re-assigned colors
      const recoloredComparisons = new Map();
      Array.from(newComparisonMap.entries()).forEach(([id, value], index) => {
        recoloredComparisons.set(id, { ...value, color: COMPARISON_COLORS[index] });
      });
      setComparisonData(recoloredComparisons);
      
      // 4. Update the internal season state to the new season ID
      setCurrentSeasonId(newSeasonId);

      // 5. Update URL with the new main player ID and filtered comparison IDs
      const urlString = formatMultipleUsernamesForUrl(mainPlayerResult.currentEmbarkId, finalCompareIds);
      window.history.replaceState(null, '', `/graph/${newSeasonId}/${urlString}`);

    } catch (err) {
        setError(`Failed to switch season: ${err.message}`);
        setData(null);
        setEvents([]);
        setComparisonData(new Map());
    } finally {
        setLoading(false);
        isLoadingRef.current = false;
    }
  }, [mainPlayerAvailableSeasons, comparisonData, loadComparisonData, eventSettings, getSeasonEndDate]);

  return {
    data,
    events,
    mainPlayerCurrentId,
    mainPlayerGameCount,
    mainPlayerAvailableSeasons,
    comparisonData,
    loading,
    error,
    addComparison,
    removeComparison,
    switchSeason,
  };
};