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
const COMBINE_EVENT_WINDOW_MS = 60 * 60 * 1000; // Combine club/name changes within 1 hour


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

  // --- Event Combination Logic ---
  let finalEvents = [];

  // Only combine events if BOTH filters are active.
  if (eventSettings.showNameChange && eventSettings.showClubChange) {
    const nameChanges = events.filter(e => e.event_type === 'NAME_CHANGE');
    const clubChanges = events.filter(e => e.event_type === 'CLUB_CHANGE');
    const otherEvents = events.filter(e => e.event_type !== 'NAME_CHANGE' && e.event_type !== 'CLUB_CHANGE');

    const consumedClubChanges = new Set(); // Keep track of club changes that have been merged

    nameChanges.forEach(nameChange => {
      // Find the closest club change within the time window that hasn't been consumed yet
      let bestMatch = null;
      let minDiff = COMBINE_EVENT_WINDOW_MS;

      clubChanges.forEach(clubChange => {
        if (consumedClubChanges.has(clubChange)) return;

        const timeDiff = Math.abs(nameChange.start_timestamp - clubChange.start_timestamp) * 1000;
        if (timeDiff <= minDiff) {
          minDiff = timeDiff;
          bestMatch = clubChange;
        }
      });

      if (bestMatch) {
        // We found a pair, create a combined event
        const combinedEvent = {
          event_type: 'COMBINED_CHANGE',
          start_timestamp: Math.min(nameChange.start_timestamp, bestMatch.start_timestamp),
          details: {
            old_name: nameChange.details.old_name,
            new_name: nameChange.details.new_name,
            old_club: bestMatch.details.old_club,
            new_club: bestMatch.details.new_club,
          },
          event_id: `combined-${Math.min(nameChange.start_timestamp, bestMatch.start_timestamp)}`
        };
        finalEvents.push(combinedEvent);
        // Mark the club change as consumed so it can't be paired with another name change
        consumedClubChanges.add(bestMatch);
      } else {
        // This name change has no corresponding club change, add it back as is
        finalEvents.push(nameChange);
      }
    });

    // Add back any club changes that were not consumed
    clubChanges.forEach(clubChange => {
      if (!consumedClubChanges.has(clubChange)) {
        finalEvents.push(clubChange);
      }
    });

    // Add all other event types back into the list
    finalEvents.push(...otherEvents);
  } else {
    // If one or both are disabled, do not combine events.
    // They will be handled as individual NAME_CHANGE or CLUB_CHANGE events.
    finalEvents = [...events];
  }
  // --- End Event Combination Logic ---

  const parsedData = rawData.map(item => ({
    ...item,
    timestamp: new Date(item.timestamp * 1000)
  })).sort((a, b) => a.timestamp - b.timestamp);

  // Attach point-specific events using the new `finalEvents` array
  finalEvents.forEach(event => {
    if (!['RS_ADJUSTMENT', 'NAME_CHANGE', 'CLUB_CHANGE', 'COMBINED_CHANGE'].includes(event.event_type)) {
      return;
    }

    // SKIP off-leaderboard adjustments here, inject them as new points later.
    if (event.event_type === 'RS_ADJUSTMENT' && event.details?.is_off_leaderboard) return;

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

    // For RS_ADJUSTMENT, only attach to points where the score actually changed.
    if (event.event_type === 'RS_ADJUSTMENT' && closestPoint && !closestPoint.scoreChanged) return;

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
        const timeDiff = current.timestamp.getTime() - previous.timestamp.getTime();

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
          // Determine the timestamp for our synthetic point.
          let syntheticTimestamp;

          if (timeDiff >= TIME.MINUTES_15) {
            // It's safe to use the original 15-minute step for the aesthetic.
            syntheticTimestamp = new Date(current.timestamp.getTime() - TIME.MINUTES_15);
          } else if (timeDiff >= TIME.MINUTE * 5) {
            // The games are too close together. To prevent criss-crossing,
            // the step must end just before the next point.
            syntheticTimestamp = new Date(current.timestamp.getTime() - TIME.MINUTE * 4);
          } else {
            // The games are extremely close together (e.g. 1-2 minutes).
            // In this case, we place the synthetic point exactly halfway
            // between the two points to ensure a clean step without overlap.
            syntheticTimestamp = new Date(previous.timestamp.getTime() - 1);
          }

          // Add a synthetic point to create the staircase step.
          processedNew.push({
            ...previous,
            timestamp: syntheticTimestamp,
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

  // Inject Off-Leaderboard RS Adjustment Points
  // These are handled separately because they represent a state where the player is NOT on the leaderboard
  const offLeaderboardRsEvents = events.filter(e => e.event_type === 'RS_ADJUSTMENT' && e.details?.is_off_leaderboard);
  
  if (offLeaderboardRsEvents.length > 0) {
    // Sort events to insert them in order
    offLeaderboardRsEvents.sort((a, b) => a.start_timestamp - b.start_timestamp);

    offLeaderboardRsEvents.forEach(event => {
        const eventTs = event.start_timestamp * 1000;
        // Calculate estimated score: Old Score - Minimum Loss
        const estimatedScore = event.details.old_score - event.details.minimum_loss;
        
        let insertionIndex = combined.findIndex(p => p.timestamp.getTime() >= eventTs);
        if (insertionIndex === -1) insertionIndex = combined.length;

        // Cleanup Gap artifacts: If this event occurred during a Gap, must remove the "Gap Bridge".
        // The Bridge point (which holds the OLD score) causes the graph to draw a line back up to the old score,
        // conflicting with the fact that the player dropped off the leaderboard here.
        const prevPoint = combined[insertionIndex - 1];
        if (prevPoint && prevPoint.isFollowedByGap) {
             // 1. Remove the gap flag from the previous point, so draw a direct line (Solid Red) to the Event.
             prevPoint.isFollowedByGap = false;

             // 2. Check if the NEXT point is a synthetic Gap Bridge.
             // Since Bridge points are usually inserted just before the next real point (at the end of the gap),
             // 'insertionIndex' will typically point to the Bridge if the Event happened earlier in the gap.
             const nextPoint = combined[insertionIndex];
             if (nextPoint && nextPoint.isGapBridge) {
                 combined.splice(insertionIndex, 1);
                 // Removed the element at insertionIndex, so the "real" next point is now at this index.
                 // Don't increment insertionIndex.
             }
        }
        
        const syntheticPoint = {
            rankScore: estimatedScore,
            league: 0, // Unknown/Off-Leaderboard
            rank: null, // Unknown/Off-Leaderboard
            timestamp: new Date(eventTs),
            isInterpolated: true,
            scoreChanged: true,
            isRsAdjustmentAnchor: true, // Special flag for the Chart config to render this specifically
            events: [event]
        };

        // 3. Determine if a dashed line is needed AFTER this synthetic point.
        // If there is still a large time gap between the Event and the next real point (B),
        // mark this synthetic point as followed by a gap.
        const nextRealPoint = combined[insertionIndex]; // This is 'B' (or whatever was after the bridge)
        if (nextRealPoint) {
            const timeDiff = nextRealPoint.timestamp.getTime() - eventTs;
            if (timeDiff > GAP_THRESHOLD) {
                syntheticPoint.isFollowedByGap = true;
            }
        }
        
        combined.splice(insertionIndex, 0, syntheticPoint);
    });
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
          isRsAdjustmentAnchor: false,
          events: isActiveBanAnchor ? newPointBase.events : [],
        });
      }
    }
  }

  return combined;
};


export const usePlayerGraphData = (isOpen, embarkId, initialCompareIds, seasonId, eventSettings) => {
  // --- STATE MANAGEMENT REFACTOR ---
  // State for PROCESSED data, which is passed to the chart
  const [data, setData] = useState(null);
  const [comparisonData, setComparisonData] = useState(new Map());

  // State for RAW data fetched from the API
  const [mainPlayerRaw, setMainPlayerRaw] = useState({ data: [], events: [] });
  const [comparisonRaws, setComparisonRaws] = useState(new Map());

  // Other hook state
  const [events, setEvents] = useState([]);
  const [mainPlayerCurrentId, setMainPlayerCurrentId] = useState(embarkId);
  const [mainPlayerGameCount, setMainPlayerGameCount] = useState(0);
  const [mainPlayerAvailableSeasons, setMainPlayerAvailableSeasons] = useState([]);
  const [error, setError] = useState(null);
  const [errorAvailableSeasons, setErrorAvailableSeasons] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentSeasonId, setCurrentSeasonId] = useState(seasonId);

  const isLoadingRef = useRef(false);
  const loadedCompareIdsRef = useRef(new Set());
  const shouldFollowUrlRef = useRef(true);

  const getSeasonEndDate = useCallback((sId) => {
    const seasonConfig = Object.values(SEASONS).find(s => s.id === sId);
    return seasonConfig?.endTimestamp ? seasonConfig.endTimestamp * 1000 : null;
  }, []);

  // This effect re-processes data whenever raw data or settings change.
  // This is the core of the fix, as it separates processing from fetching.
  useEffect(() => {
    if (!mainPlayerRaw.data) {
        return; // Wait for raw data to be fetched
    }
    
    // Don't show loader for simple filter changes, only for new data
    // setLoading(true); 

    const seasonEndDate = getSeasonEndDate(currentSeasonId);

    // Process main player data
    const processedMain = processGraphData(
        mainPlayerRaw.data,
        mainPlayerRaw.events,
        seasonEndDate,
        eventSettings
    );
    if (processedMain.length < 2 && mainPlayerRaw.data.length > 0) {
        setError('Not enough data points to display a meaningful graph.');
    } else if (mainPlayerRaw.data.length > 0) {
        setError(null); // Clear previous errors if we have data now
    }
    setData(processedMain);
    setEvents(mainPlayerRaw.events);

    // Process comparison data
    const newComparisonMap = new Map();
    Array.from(comparisonRaws.entries()).forEach(([id, rawValue], index) => {
        const processedCompare = processGraphData(
            rawValue.data,
            rawValue.events,
            seasonEndDate,
            eventSettings
        );
        
        if (processedCompare.length >= 2) {
             newComparisonMap.set(id, {
                data: processedCompare,
                color: COMPARISON_COLORS[index],
                gameCount: rawValue.gameCount,
                events: rawValue.events,
                availableSeasons: rawValue.availableSeasons,
            });
        }
    });

    setComparisonData(newComparisonMap);
    // setLoading(false);
  }, [mainPlayerRaw, comparisonRaws, eventSettings, currentSeasonId, getSeasonEndDate]);


  const loadComparisonData = useCallback(async (compareId, targetSeasonId) => {
    try {
      const result = await fetchGraphData(compareId, targetSeasonId);
      if (!result.data?.length) return null;

      const activeData = result.data.filter(item => item.scoreChanged);
      const gameCount = activeData.length + RANKED_PLACEMENTS;

      // Return RAW data; processing is handled by the useEffect
      return { data: result.data, gameCount, events: result.events, currentEmbarkId: result.currentEmbarkId, availableSeasons: result.availableSeasons };
    } catch (error) {
      console.error(`Failed to load comparison data for ${compareId}:`, error);
      return null;
    }
  }, []);

  const addComparison = useCallback(async (player) => {
    if (comparisonRaws.size >= MAX_COMPARISONS || player.name === mainPlayerCurrentId || comparisonRaws.has(player.name)) {
      return;
    }

    shouldFollowUrlRef.current = false;

    const loadedResult = await loadComparisonData(player.name, currentSeasonId);
    if (loadedResult) {
      const { data: rawData, gameCount, events: newEvents, availableSeasons, currentEmbarkId } = loadedResult;
      const finalId = currentEmbarkId || player.name;

      setComparisonRaws(prev => {
        const next = new Map(prev);
        next.set(finalId, {
          data: rawData,
          gameCount,
          events: newEvents,
          availableSeasons,
        });

        loadedCompareIdsRef.current.add(finalId);

        const currentCompares = Array.from(next.keys());
        const urlString = formatMultipleUsernamesForUrl(mainPlayerCurrentId, currentCompares);
        window.history.replaceState(null, '', `/graph/${currentSeasonId}/${urlString}`);

        return next;
      });
    }
  }, [loadComparisonData, comparisonRaws, mainPlayerCurrentId, currentSeasonId]);

  const removeComparison = useCallback((compareEmbarkId) => {
    shouldFollowUrlRef.current = false;

    setComparisonRaws(prev => {
      const next = new Map(prev);
      next.delete(compareEmbarkId);
      loadedCompareIdsRef.current.delete(compareEmbarkId);

      const currentCompares = Array.from(next.keys());
      const urlString = formatMultipleUsernamesForUrl(mainPlayerCurrentId, currentCompares);
      window.history.replaceState(null, '', `/graph/${currentSeasonId}/${urlString}`);

      return next;
    });
  }, [mainPlayerCurrentId, currentSeasonId]);

  const loadMainData = useCallback(async (targetEmbarkId, targetSeasonId) => {
    setLoading(true);
    setError(null);
    setErrorAvailableSeasons(null);

    try {
      const result = await fetchGraphData(targetEmbarkId, targetSeasonId);

      if (result.currentEmbarkId) {
        setMainPlayerCurrentId(result.currentEmbarkId);
      }

      if (!result.data?.length) {
        setError('No data available for this player, they may have recently changed their embarkId.');
        setMainPlayerRaw({ data: [], events: [] });
        return;
      }

      const activeData = result.data.filter(item => item.scoreChanged);

      if (activeData.length === 0) {
        setError('No games with rank score changes have been recorded for this player.');
        setMainPlayerRaw({ data: [], events: [] });
        return;
      }
      
      setMainPlayerGameCount(activeData.length + RANKED_PLACEMENTS);
      setMainPlayerAvailableSeasons(result.availableSeasons);
      
      // Set raw data, which will trigger the processing useEffect
      setMainPlayerRaw({ data: result.data, events: result.events });

    } catch (error) {
      // Check for specific 404 with available seasons
      if (error.status === 404 && error.data?.availableSeasons && Array.isArray(error.data.availableSeasons)) {
        setErrorAvailableSeasons(error.data.availableSeasons);
        setError(`Player not found in this season.`); // Generic message, UI will prefer errorAvailableSeasons
      } else {
        setError(error.details || error.message);
      }
      setMainPlayerRaw({ data: [], events: [] });
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && embarkId && seasonId) {
      // Reset state for new player
      setData(null);
      setError(null);
      setErrorAvailableSeasons(null);
      setEvents([]);
      setMainPlayerCurrentId(embarkId);
      setMainPlayerGameCount(0);
      setMainPlayerAvailableSeasons([]);
      setComparisonData(new Map());
      setMainPlayerRaw({ data: null, events: [] }); // Use null to indicate not yet fetched
      setComparisonRaws(new Map());
      setCurrentSeasonId(seasonId); // Reset internal season state
      loadedCompareIdsRef.current.clear();
      shouldFollowUrlRef.current = true;
      isLoadingRef.current = false;

      loadMainData(embarkId, seasonId);
    }
  }, [isOpen, embarkId, seasonId, loadMainData]);

  useEffect(() => {
    const loadedIds = loadedCompareIdsRef.current;
    const shouldFollowUrl = shouldFollowUrlRef.current;
    let isLoading = isLoadingRef.current;

    const loadInitialComparisons = async () => {
      if (!isOpen || isLoading || !shouldFollowUrl || !mainPlayerCurrentId) {
        return;
      }

      // Start with a unique list of IDs from the URL. We won't filter the main player yet,
      // as their name might have changed. We'll handle all de-duplication after fetching.
      const uniqueCompareIds = initialCompareIds?.length
        ? [...new Set(initialCompareIds)]
        : [];

      // If there's nothing to load from the URL, and we have no comparisons, we're done.
      if (uniqueCompareIds.length === 0 && comparisonRaws.size === 0) {
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

        const newRawComparisons = new Map();
        // The set of loaded IDs starts with the main player's current ID to avoid adding them as a comparison.
        const loadedEmbarkIds = new Set([mainPlayerCurrentId]);
        const finalCompareIds = [];

        // Process all results to build a sanitized list of comparisons.
        for (const { result } of results) {
          if (!result || !result.currentEmbarkId) continue;

          const { currentEmbarkId } = result;

          // Check for duplicates (including main player) and max comparison limit.
          if (!loadedEmbarkIds.has(currentEmbarkId) && newRawComparisons.size < MAX_COMPARISONS) {
            loadedEmbarkIds.add(currentEmbarkId);
            finalCompareIds.push(currentEmbarkId);

            newRawComparisons.set(currentEmbarkId, {
              data: result.data,
              gameCount: result.gameCount,
              events: result.events,
              availableSeasons: result.availableSeasons,
            });
            loadedIds.add(currentEmbarkId);
          }
        }

        const currentComparisonKeys = Array.from(comparisonRaws.keys()).sort();
        const newComparisonKeys = Array.from(newRawComparisons.keys()).sort();

        // If the final set of players is identical to what's already loaded, we don't need to set state.
        // This prevents re-renders and re-fetches if the only change was resolving an old name in the URL.
        if (JSON.stringify(currentComparisonKeys) !== JSON.stringify(newComparisonKeys)) {
          setComparisonRaws(newRawComparisons);
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
  }, [isOpen, initialCompareIds, comparisonRaws, loadComparisonData, mainPlayerCurrentId, currentSeasonId]);

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

    const compareIdsFromState = Array.from(comparisonRaws.keys());
    const urlString = formatMultipleUsernamesForUrl(mainPlayerCurrentId, compareIdsFromState);
    const newUrl = `/graph/${currentSeasonId}/${urlString}`;

    if (window.location.pathname !== newUrl) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [isOpen, embarkId, currentSeasonId, mainPlayerCurrentId, comparisonRaws]);

  const switchSeason = useCallback(async (newSeasonId) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoading(true);
    setError(null);
    setErrorAvailableSeasons(null);
    setCurrentSeasonId(newSeasonId); // Update season ID first
    
    // Reset raw data to null. 
    setMainPlayerRaw({ data: null, events: [] }); 
    setData(null);

    try {
      // 1. Fetch main player for the new season using the season-specific embark ID
      const mainPlayerSeasonInfo = mainPlayerAvailableSeasons.find(s => s.id === newSeasonId);
      // Fallback: If no availableSeasons populated (e.g. initial load failed),
      // we try with the current ID.
      const mainPlayerIdForNewSeason = mainPlayerSeasonInfo ? mainPlayerSeasonInfo.embarkId : mainPlayerCurrentId;

      const mainPlayerResult = await fetchGraphData(mainPlayerIdForNewSeason, newSeasonId);

      if (mainPlayerResult.data?.length) {
        // Set raw data, processing will be handled by the useEffect
        setMainPlayerRaw({ data: mainPlayerResult.data, events: mainPlayerResult.events });
        setMainPlayerGameCount(mainPlayerResult.data.filter(i => i.scoreChanged).length + RANKED_PLACEMENTS);
        setMainPlayerCurrentId(mainPlayerResult.currentEmbarkId);
        setMainPlayerAvailableSeasons(mainPlayerResult.availableSeasons);
      } else {
        setMainPlayerRaw({ data: [], events: [] }); // Clear data
        throw new Error(`Player has no data for the selected season.`);
      }

      // 2. Filter and re-fetch comparison players using their season-specific embark IDs
      const newComparisonRawMap = new Map();
      const promises = [];
      const currentCompares = Array.from(comparisonRaws.values());

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
            newComparisonRawMap.set(key, {
              data: result.data,
              gameCount: result.gameCount,
              events: result.events,
              availableSeasons: result.availableSeasons,
            });
          }
        }
      });
      
      // 3. Update comparison raw state, which will trigger re-processing
      setComparisonRaws(newComparisonRawMap);
      
      // 4. Update URL with the new main player ID and filtered comparison IDs
      const urlString = formatMultipleUsernamesForUrl(mainPlayerResult.currentEmbarkId, finalCompareIds);
      window.history.replaceState(null, '', `/graph/${newSeasonId}/${urlString}`);

    } catch (err) {
        // If switching seasons fails, check for specific 404 available seasons again
        if (err.status === 404 && err.data?.availableSeasons && Array.isArray(err.data.availableSeasons)) {
            setErrorAvailableSeasons(err.data.availableSeasons);
            setError(`Player not found in this season.`);
        } else {
            setError(err.details || `Failed to switch season: ${err.message}`);
        }
        setData(null);
        setMainPlayerRaw({ data: [], events: [] });
        setComparisonRaws(new Map());
    } finally {
        setLoading(false);
        isLoadingRef.current = false;
    }
  }, [mainPlayerAvailableSeasons, comparisonRaws, loadComparisonData, mainPlayerCurrentId]);

  return {
    data,
    events,
    mainPlayerCurrentId,
    mainPlayerGameCount,
    mainPlayerAvailableSeasons,
    comparisonData,
    loading,
    error,
    errorAvailableSeasons,
    addComparison,
    removeComparison,
    switchSeason,
  };
};