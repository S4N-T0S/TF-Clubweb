import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { Chart as ChartJS } from 'chart.js';
import { SEASONS, SERVER_DOWNTIMES } from '../services/historicalDataService';
import { formatDuration } from '../utils/timeUtils';

// Constants from GraphModal
const RANKS = [
  { label: 'Bronze 4', y: 0, color: '#b45309' },
  { label: 'Bronze 3', y: 2500, color: '#b45309' },
  { label: 'Bronze 2', y: 5000, color: '#b45309' },
  { label: 'Bronze 1', y: 7500, color: '#b45309' },
  { label: 'Silver 4', y: 10000, color: '#d1d5db' },
  { label: 'Silver 3', y: 12500, color: '#d1d5db' },
  { label: 'Silver 2', y: 15000, color: '#d1d5db' },
  { label: 'Silver 1', y: 17500, color: '#d1d5db' },
  { label: 'Gold 4', y: 20000, color: '#facc15' },
  { label: 'Gold 3', y: 22500, color: '#facc15' },
  { label: 'Gold 2', y: 25000, color: '#facc15' },
  { label: 'Gold 1', y: 27500, color: '#facc15' },
  { label: 'Platinum 4', y: 30000, color: '#67e8f9' },
  { label: 'Platinum 3', y: 32500, color: '#67e8f9' },
  { label: 'Platinum 2', y: 35000, color: '#67e8f9' },
  { label: 'Platinum 1', y: 37500, color: '#67e8f9' },
  { label: 'Diamond 4', y: 40000, color: '#60a5fa' },
  { label: 'Diamond 3', y: 42500, color: '#60a5fa' },
  { label: 'Diamond 2', y: 45000, color: '#60a5fa' },
  { label: 'Diamond 1', y: 47500, color: '#60a5fa' }
];

const TIME = {
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000
};
TIME.TWO_HOURS = 2 * TIME.HOUR;
TIME.SEVENTY_TWO_HOURS = 72 * TIME.HOUR;

TIME.RANGES = {
  '24H': TIME.DAY,
  '7D': TIME.WEEK,
  'MAX': Infinity
};

TIME.FORMAT = {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
};

TIME.DISPLAY_FORMATS = {
  millisecond: 'dd MMM HH:mm',
  second: 'dd MMM HH:mm',
  minute: 'dd MMM HH:mm',
  hour: 'd MMM HH:mm',
  day: 'dd MMM',
  week: 'dd MMM',
  month: 'MMM yyyy',
  quarter: 'MMM yyyy',
  year: 'yyyy'
};

const NEW_LOGIC_TIMESTAMP_MS = 1750436334 * 1000;
const SERVER_DOWNTIME_BY_MS = new Map(SERVER_DOWNTIMES.map(d => [d.timestamp * 1000, d]));

// Create Image objects for custom point styles
const nameChangeIcon = new Image(16, 16);
nameChangeIcon.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 15H7a4 4 0 0 0-4 4v2"/><path d="M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><circle cx="10" cy="7" r="4"/></svg>');
const clubChangeIcon = new Image(16, 16);
clubChangeIcon.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></svg>');
const gavelIcon = new Image(16, 16);
gavelIcon.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>');
const unbanIcon = new Image(16, 16);
unbanIcon.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(24, 0) scale(-1, 1)"><path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></g></svg>');

const starSvgForRs = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>';
const rsUpIcon = new Image(16, 16);
rsUpIcon.src = 'data:image/svg+xml;base64,' + btoa(starSvgForRs.replace('currentColor', '#4ade80'));
const rsDownIcon = new Image(16, 16);
rsDownIcon.src = 'data:image/svg+xml;base64,' + btoa(starSvgForRs.replace('currentColor', '#ef4444'));
const unexpectedReappearanceIcon = new Image(16, 16);
unexpectedReappearanceIcon.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>');

/**
 * Helper to safely get an RS_ADJUSTMENT event from a point context.
 * @param {import('chart.js').ScriptableContext<'line'>} ctx The chart context.
 * @returns {object | null} The event object or null.
 */
const getRsEvent = (ctx) => {
  const pointData = ctx.raw?.raw;
  if (pointData?.events && !pointData.isInterpolated && !pointData.isExtrapolated && !pointData.isStaircasePoint && !pointData.isGapBridge) {
    return pointData.events.find(e => e.event_type === 'RS_ADJUSTMENT');
  }
  return null;
};

/**
 * Returns the server-downtime entry whose poll timestamp matches this point exactly, else null.
 * Matched on the precise timestamp — synthetic points (staircase/bridge/interpolation) are
 * minute-offset and so never collide with it.
 * @param {object} point A processed data point.
 * @returns {{timestamp: number, durationHours?: number} | null}
 */
const getServerDowntime = (point) => SERVER_DOWNTIME_BY_MS.get(point?.timestamp?.getTime()) || null;

// Upper bound on the visible window for the downtime icon to render.
const DOWNTIME_ICON_MAX_SPAN = TIME.WEEK * 2;

/**
 * True when the outage's catch-up actually moved this player's displayed metric — score in score
 * view, rank in rank view. A neutral point means the player didn't play across the outage, so
 * there's nothing to explain and we suppress the marker. Mirrors the no-change "tracking point"
 * rule used for normal dot/tooltip visibility.
 * @param {{rankChanged?: boolean, raw?: {scoreChanged?: boolean}} | undefined} wrapper Plotted-point wrapper (ctx.raw / dataPoints[].raw).
 * @param {boolean} isRankMode Whether the chart is in rank view.
 * @returns {boolean}
 */
const downtimePointChanged = (wrapper, isRankMode) =>
  isRankMode ? wrapper?.rankChanged === true : !!wrapper?.raw?.scoreChanged;

/**
 * Decides how a server-downtime point should be marked, given the current zoom. Both states still
 * get the hover tooltip; this only governs the on-chart marker.
 *   'icon' — view is tight enough (≤ DOWNTIME_ICON_MAX_SPAN) for the full alert icon, where the
 *            outage gap is wide enough on screen to read.
 *   'dot'  — zoomed out past that (e.g. a historical season's locked MAX view): a small coloured
 *            dot, just enough of a cue to invite a hover without the big icon dominating.
 *   null   — not a downtime point, or neutral (the player didn't play across the outage).
 * @param {import('chart.js').ScriptableContext<'line'>} ctx The chart context.
 * @param {boolean} isRankMode Whether the chart is in rank view.
 * @returns {'icon' | 'dot' | null}
 */
const getDowntimeMarker = (ctx, isRankMode) => {
  if (!getServerDowntime(ctx?.raw?.raw)) return null;
  if (!downtimePointChanged(ctx?.raw, isRankMode)) return null;
  const xScale = ctx?.chart?.scales?.x;
  if (!xScale) return 'icon'; // scales not ready yet — default to the full marker
  return (xScale.max - xScale.min) <= DOWNTIME_ICON_MAX_SPAN ? 'icon' : 'dot';
};

/**
 * Helper to check for a specific event type on a non-synthetic point.
 * @param {import('chart.js').ScriptableContext<'line'>} ctx The chart context.
 * @param {string} eventType The event type to check for.
 * @returns {boolean} True if the point has the specified event.
 */
const hasVisibleEvent = (ctx, eventType) => {
  const pointData = ctx.raw?.raw;
  if (!pointData || pointData.isInterpolated || pointData.isExtrapolated || pointData.isStaircasePoint || pointData.isGapBridge) {
    return false;
  }
  return pointData.events?.some(e => e.event_type === eventType);
};

const getRankFromScore = (score) => {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (score >= RANKS[i].y) {
      return RANKS[i];
    }
  }
  return RANKS[0];
};

const createTooltip = (chart) => {
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'rank-tooltip';
  Object.assign(tooltipEl.style, {
    background: 'rgba(31, 41, 55, 0.85)', // Transparent gray-800
    backdropFilter: 'blur(8px)',          // Glass effect
    WebkitBackdropFilter: 'blur(8px)',    // Safari support
    borderRadius: '8px',
    border: '1px solid rgba(75, 85, 99, 0.4)', // Softer gray border
    color: '#FAF9F6',
    opacity: 0,
    pointerEvents: 'none',
    position: 'absolute',
    transition: 'opacity 0.15s ease-out, left 0.1s ease-out, top 0.1s ease-out',
    padding: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
  });

  tooltipEl.appendChild(document.createElement('table'));
  chart.canvas.parentNode.appendChild(tooltipEl);
  return tooltipEl;
};

const getOrCreateTooltip = (chart) => {
  let tooltipEl = chart.canvas.parentNode.querySelector('div.rank-tooltip');
  if (!tooltipEl) {
    tooltipEl = createTooltip(chart);
  }
  return tooltipEl;
};

const getBorderColor = (ctx, defaultColor = '#FAF9F6', eventSettings = {}, isRank = false) => {
  if (!ctx.p0?.raw?.raw || !ctx.p1?.raw?.raw) return defaultColor;

  const p0 = ctx.p0.raw.raw;
  const p1 = ctx.p1.raw.raw;

  if (eventSettings.showSuspectedBan) {
    // Unexpected reappearance path is orange/yellow.
    if (p0.isFollowedByUnexpectedReappearance) {
      return '#facc15'; // yellow-400
    }
    // Regular ban paths are red.
    if (p0.isBanStartAnchor) {
      const banEvent = p0.events?.find(e => e.event_type === 'SUSPECTED_BAN');
      if (banEvent) {
        // Dashed red line during a completed ban
        if (p1.isBanEndAnchor) return '#EF4444'; // red
        // Dashed red line for an ongoing ban (to 'now')
        if (!banEvent.end_timestamp && p1.isFinalInterpolation) return '#EF4444'; // red
      }
    }
  }

  // A segment ending at a gap bridge is the horizontal part of a gap. Color it white.
  if (p1.isGapBridge) return defaultColor;

  if (p0.isExtrapolated || p1.isExtrapolated || p1.isStaircasePoint) return defaultColor;

  // Rank mode: colour each segment by whether rank improved or worsened between its two
  // endpoints, mirroring the score-mode convention (green = good).
  if (isRank) {
    const a = p0.rank;
    const b = p1.rank;
    if (typeof a !== 'number' || typeof b !== 'number') return defaultColor;
    if (b < a) return '#10B981';
    if (b > a) return '#EF4444';
    return defaultColor;
  }

  // New data logic: color based on destination point's status
  if (p1.timestamp.getTime() >= NEW_LOGIC_TIMESTAMP_MS) {
    if (p1.scoreChanged) {
      const curr = ctx.p0.parsed.y;
      const next = ctx.p1.parsed.y;
      return next > curr ? '#10B981' : next < curr ? '#EF4444' : defaultColor;
    }
    return defaultColor; // It's a tracking point, line is default color
  }

  // Legacy data logic: color if destination is not an interpolated point
  if (p1.isInterpolated) return defaultColor;

  const curr = ctx.p0.parsed.y;
  const next = ctx.p1.parsed.y;
  if (curr === next) return defaultColor;
  return next > curr ? '#10B981' : '#EF4444';
};

const getBorderDash = (ctx, eventSettings = {}) => {
  if (!ctx.p0?.raw?.raw) return undefined;
  const p0 = ctx.p0.raw.raw;
  const p1 = ctx.p1?.raw?.raw;

  if (eventSettings.showSuspectedBan) {
    if (p0.isFollowedByUnexpectedReappearance) {
      return [5, 5];
    }
    if (p0.isBanStartAnchor && p1) {
      const banEvent = p0.events?.find(e => e.event_type === 'SUSPECTED_BAN');
      if (banEvent) {
        if (p1.isBanEndAnchor) return [5, 5];
        if (!banEvent.end_timestamp && p1.isFinalInterpolation) return [5, 5];
      }
    }
  }

  if (p0.isFollowedByGap) return [5, 5];
  if (p0.isExtrapolated || (p1 && p1.isExtrapolated)) return [5, 5];

  return undefined;
};

// Binary search to find the index of the first point >= minTime
const findStartIndex = (data, minTime) => {
  let left = 0;
  let right = data.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (data[mid].timestamp >= minTime) {
      result = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return result === -1 ? data.length : result;
};

// Binary search to find the index of the last point <= maxTime
const findEndIndex = (data, maxTime) => {
  let left = 0;
  let right = data.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (data[mid].timestamp <= maxTime) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return result === -1 ? -1 : result;
};

export const useChartConfig = ({
  data,
  events,
  comparisonData,
  embarkId,
  selectedTimeRange,
  setSelectedTimeRange,
  chartRef,
  onZoomOrPan,
  eventSettings,
  seasonId,
  rubyCutoff,
  mainPlayerWinrate,
  displayMode = 'rankScore',
  isMobile = false,
}) => {

  // 'rank' plots true leaderboard rank on an inverted axis (#1 at the top); 'rankScore'
  // is the original rank-score view. The caller only passes 'rank' for supported seasons.
  const isRankMode = displayMode === 'rank';

  const seasonConfig = useMemo(() => Object.values(SEASONS).find(s => s.id === seasonId), [seasonId]);
  const seasonEndDate = useMemo(() => seasonConfig?.endTimestamp ? new Date(seasonConfig.endTimestamp * 1000) : null, [seasonConfig]);
  const isHistoricalSeason = useMemo(() => seasonConfig && !seasonConfig.isCurrent, [seasonConfig]);

  const [manualViewWindow, setManualViewWindow] = useState(null);
  const [isManuallyZoomed, setIsManuallyZoomed] = useState(false);
  const rafRef = useRef(null);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    // When the user clicks a time range button (24H, 7D, MAX), reset manual zoom.
    // This should not run when `selectedTimeRange` is cleared to null by zooming/panning.
    if (selectedTimeRange) {
      setIsManuallyZoomed(false);
      setManualViewWindow(null);
    }
  }, [selectedTimeRange]);

  useEffect(() => {
    // When the season changes, always reset manual zoom state.
    setIsManuallyZoomed(false);
    setManualViewWindow(null);
  }, [seasonId]);

  const handleChartUpdate = useCallback((chart) => {
    // If a frame is already pending, skip this update
    if (rafRef.current) return;

    rafRef.current = requestAnimationFrame(() => {
      setManualViewWindow({ min: chart.scales.x.min, max: chart.scales.x.max });
      if (onZoomOrPan) onZoomOrPan();
      rafRef.current = null;
    });
  }, [onZoomOrPan]);

  const getPointRadius = useCallback((ctx) => {
    const pointData = ctx.raw?.raw;
    if (!ctx.chart || !pointData) return 3;

    const downtimeMarker = getDowntimeMarker(ctx, isRankMode);
    if (downtimeMarker === 'icon') return 8;
    if (downtimeMarker === 'dot') return 4;

    if (eventSettings.showSuspectedBan && pointData.isUnexpectedReappearance) return 8;

    // Make the ban anchor icons visible and large if enabled
    if (eventSettings.showSuspectedBan && (pointData.isBanStartAnchor || pointData.isBanEndAnchor)) return 8;

    // Make event icon points visible and large if enabled
    if ((eventSettings.showNameChange || eventSettings.showClubChange) && hasVisibleEvent(ctx, 'COMBINED_CHANGE')) return 8;
    if (eventSettings.showNameChange && hasVisibleEvent(ctx, 'NAME_CHANGE')) return 8;
    if (eventSettings.showClubChange && hasVisibleEvent(ctx, 'CLUB_CHANGE')) return 8;

    const rsEvent = getRsEvent(ctx);
    if (eventSettings.showRsAdjustment && rsEvent) return 8;
    if (eventSettings.showRsAdjustment && pointData.isRsAdjustmentAnchor) return 8; // adjusted off lb

    // Hide synthetic staircase, gap bridge, and final interpolated points
    if (pointData.isStaircasePoint || pointData.isGapBridge || pointData.isFinalInterpolation) {
      return 0;
    }

    // Decide which non-event points are noteworthy enough to draw a hoverable dot.
    // Rank view keys off rank changes (tagged in buildPoints); score view keys off score
    // changes, hiding new-logic "tracking" points where only other players moved.
    if (isRankMode) {
      if (ctx.raw.rankChanged === false && !pointData.isInterpolated && !pointData.isExtrapolated) {
        return 0;
      }
    } else if (pointData.timestamp.getTime() >= NEW_LOGIC_TIMESTAMP_MS && !pointData.scoreChanged) {
      if (!pointData.isInterpolated && !pointData.isExtrapolated) {
        return 0;
      }
    }

    const timeRange = ctx.chart.scales.x.max - ctx.chart.scales.x.min;
    if ((pointData.isInterpolated || pointData.isExtrapolated) && timeRange > TIME.SEVENTY_TWO_HOURS) {
      return 0;
    }

    // Rank mode draws a single clean line, so no up/down triangle sizing.
    const direction = isRankMode ? null : (ctx.raw?.direction ?? null);
    const isTriangle = direction === 'up' || direction === 'down';

    const initialSize = (pointData.isInterpolated || pointData.isExtrapolated) ? 2.6 : (isTriangle ? 4.5 : 3);
    if (timeRange <= TIME.DAY) {
      return initialSize;
    } else if (timeRange >= TIME.WEEK) {
      return initialSize - (initialSize * 2 / 3);
    } else {
      const zoomRatio = (timeRange - TIME.DAY) / (TIME.WEEK - TIME.DAY);
      return initialSize - ((initialSize * 2 / 3) * zoomRatio);
    }
  }, [eventSettings, isRankMode]);

  const externalTooltipHandler = useCallback((context) => {
    const { chart, tooltip } = context;
    const tooltipEl = getOrCreateTooltip(chart);

    // Guard against stale datasetIndex when a dataset is removed. If the tooltip tries
    // to render for a non-existent dataset, hide it and bail to prevent a crash.
    const datasetIndexFromTooltip = tooltip.dataPoints?.[0]?.datasetIndex;
    if (datasetIndexFromTooltip !== undefined && chart.data.datasets[datasetIndexFromTooltip] === undefined) {
      tooltipEl.style.opacity = 0;
      return;
    }

    const pointData = tooltip.dataPoints?.[0]?.raw?.raw;
    const downtime = getServerDowntime(pointData);
    // Only treat it as a downtime point if the catch-up actually moved this player's metric; a
    // neutral point (player didn't play across the outage) has nothing to explain.
    const isDowntime = !!downtime && downtimePointChanged(tooltip.dataPoints?.[0]?.raw, isRankMode);

    if (pointData) {
      // Hide tooltips for certain synthetic points, but always show them for ban/unban event anchors.
      const isBanPoint = eventSettings.showSuspectedBan && (pointData.isBanStartAnchor || pointData.isBanEndAnchor || pointData.isUnexpectedReappearance);
      // Also always show tooltip for RS Adjustment anchors
      const isRsAnchor = eventSettings.showRsAdjustment && pointData.isRsAdjustmentAnchor;

      if (!isBanPoint && !isRsAnchor && !isDowntime) {
        const timeRange = chart.scales.x.max - chart.scales.x.min;
        const isHiddenInterpolatedPoint = (pointData.isInterpolated || pointData.isExtrapolated) &&
          timeRange > TIME.SEVENTY_TWO_HOURS;

        // Mirror the dot-visibility rule (getPointRadius/buildPoints): in rank view a point
        // with no rank change carries no tooltip; in score view a no-score-change tracking
        // point carries none.
        const wrapper = tooltip.dataPoints?.[0]?.raw;
        const isHiddenTrackingPoint = isRankMode
          ? (wrapper?.rankChanged === false && !pointData.isInterpolated && !pointData.isExtrapolated)
          : (pointData.timestamp.getTime() >= NEW_LOGIC_TIMESTAMP_MS &&
            !pointData.scoreChanged &&
            !pointData.isInterpolated &&
            !pointData.isExtrapolated);

        const isStaircase = pointData.isStaircasePoint;
        const isGapBridge = pointData.isGapBridge;

        if (isHiddenInterpolatedPoint || isHiddenTrackingPoint || isStaircase || isGapBridge) {
          tooltipEl.style.opacity = 0;
          return;
        }
      }
    }

    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = 0;
      return;
    }

    const banEvent = pointData?.events?.find(e => e.event_type === 'SUSPECTED_BAN');
    const isBanStart = pointData && eventSettings.showSuspectedBan && pointData.isBanStartAnchor && banEvent;
    const isBanEnd = pointData && eventSettings.showSuspectedBan && pointData.isBanEndAnchor && banEvent && banEvent.end_timestamp;
    const isUnexpected = pointData && eventSettings.showSuspectedBan && pointData.isUnexpectedReappearance;

    // Check for RS Adjustment Event (either regular or off-leaderboard anchor)
    const rsEvent = pointData?.events?.find(e => e.event_type === 'RS_ADJUSTMENT');
    const isRsAdjustment = eventSettings.showRsAdjustment && rsEvent;

    const hasEventToShow = isBanStart || isBanEnd || isUnexpected || isRsAdjustment || isDowntime;
    const hasScoreContent = !!tooltip.body;

    if (hasScoreContent || hasEventToShow) {
      const titleLines = tooltip.title || [];
      const datasetIndex = tooltip.dataPoints[0].datasetIndex;
      const dataPoint = tooltip.dataPoints[0].raw.raw;

      while (tooltipEl.firstChild) {
        tooltipEl.firstChild.remove();
      }

      // Reset to content-driven width on each rebuild
      tooltipEl.style.width = 'auto';

      const tableRoot = document.createElement('table');
      tableRoot.style.margin = '0px';
      tooltipEl.appendChild(tableRoot);

      if (hasScoreContent) {
        // Always derive the displayed score from the raw point, not the tooltip body — in
        // rank mode the plotted y value is the rank, so parsing the body would be wrong.
        const score = Math.round(dataPoint.rankScore);
        const rank = getRankFromScore(score);
        // Score mode shows the numeric rank as a corner badge (the body has no rank position).
        // Rank mode omits it — the "Rank #prev → #curr" row above already carries that, badge
        // would just duplicate the current rank.
        if (
          !isRankMode &&
          dataPoint?.rank !== null &&
          Number.isInteger(dataPoint?.rank) &&
          !dataPoint.isExtrapolated &&
          !dataPoint.isInterpolated
        ) {
          const rankBadge = document.createElement('div');
          rankBadge.style.position = 'absolute';
          rankBadge.style.right = '-6px';
          rankBadge.style.top = '-6px';
          rankBadge.style.backgroundColor = '#3b82f6';
          rankBadge.style.color = '#ffffff';
          rankBadge.style.fontSize = '11px';
          rankBadge.style.fontWeight = 'bold';
          rankBadge.style.padding = '3px 8px';
          rankBadge.style.borderRadius = '4px 0 4px 0';
          rankBadge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
          rankBadge.textContent = `#${dataPoint.rank.toLocaleString()}`;

          tooltipEl.appendChild(rankBadge);
        }

        if (chart.data.datasets.length > 1) {
          const playerNameRow = document.createElement('tr');
          playerNameRow.style.borderWidth = 0;
          const playerNameCell = document.createElement('th');
          playerNameCell.style.borderWidth = 0;
          playerNameCell.style.color = '#ffffff';
          playerNameCell.style.fontSize = '14px';
          playerNameCell.style.fontWeight = 'bold';
          playerNameCell.style.paddingTop = '-20px';
          const playerNameRaw = chart.data.datasets[datasetIndex].label.trim();
          const cleanPlayerName = playerNameRaw.replace(/\s*\([\d.]+%\s*WR\)/i, '');
          const playerText = document.createTextNode(cleanPlayerName);
          playerNameCell.appendChild(playerText);
          playerNameRow.appendChild(playerNameCell);
          tableRoot.appendChild(playerNameRow);
        }

        const headerRow = document.createElement('tr');
        headerRow.style.borderWidth = 0;
        const headerCell = document.createElement('th');
        headerCell.style.borderWidth = 0;
        headerCell.style.color = '#9ca3af';
        headerCell.style.fontSize = '12px';
        const headerText = document.createTextNode(titleLines[0]);
        headerCell.appendChild(headerText);
        headerRow.appendChild(headerCell);
        tableRoot.appendChild(headerRow);

        // Rank-mode headline: the leaderboard position as a before → after transition. This
        // surfaces rank shifts even when the player's own score didn't change (e.g. another
        // player overtook them) — the score-centric rows below can't convey that on their own.
        if (isRankMode && Number.isInteger(dataPoint?.rank) && dataPoint.rank > 0 &&
          !dataPoint.isExtrapolated && !dataPoint.isInterpolated) {
          const currentRank = dataPoint.rank;
          const dataIndex = tooltip.dataPoints[0].dataIndex;
          const dataset = chart.data.datasets[datasetIndex].data;

          // Walk back to the most recent point at a *different* rank — the position we moved from.
          let prevRank = null;
          for (let i = dataIndex - 1; i >= 0; i--) {
            const r = dataset[i]?.raw?.rank;
            if (typeof r === 'number' && r > 0 && r !== currentRank) { prevRank = r; break; }
          }

          const posRow = document.createElement('tr');
          posRow.style.borderWidth = 0;
          const posCell = document.createElement('td');
          posCell.style.borderWidth = 0;
          posCell.style.fontSize = '14px';
          posCell.style.fontWeight = 'bold';
          posCell.style.paddingTop = '4px';

          const posContainer = document.createElement('div');
          posContainer.style.display = 'flex';
          posContainer.style.alignItems = 'center';
          posContainer.style.gap = '5px';

          const label = document.createElement('span');
          label.style.color = '#9ca3af';
          label.style.fontWeight = '600';
          label.textContent = 'Rank';
          posContainer.appendChild(label);

          if (prevRank !== null) {
            const improved = currentRank < prevRank; // smaller rank number is better
            const color = improved ? '#10B981' : '#EF4444';

            const prevSpan = document.createElement('span');
            prevSpan.style.color = '#9ca3af';
            prevSpan.textContent = `#${prevRank.toLocaleString()}`;
            posContainer.appendChild(prevSpan);

            const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            arrowSvg.setAttribute('width', '13');
            arrowSvg.setAttribute('height', '13');
            arrowSvg.setAttribute('viewBox', '0 0 24 24');
            arrowSvg.setAttribute('fill', 'none');
            arrowSvg.setAttribute('stroke', color);
            arrowSvg.setAttribute('stroke-width', '2.5');
            arrowSvg.setAttribute('stroke-linecap', 'round');
            arrowSvg.setAttribute('stroke-linejoin', 'round');
            arrowSvg.style.flexShrink = '0';
            arrowSvg.style.display = 'block';
            // On the inverted rank axis an improvement (smaller number) moves UP toward #1.
            arrowSvg.innerHTML = improved
              ? '<path d="M12 19V5M5 12l7-7 7 7"/>'
              : '<path d="M12 5v14M5 12l7 7 7-7"/>';
            posContainer.appendChild(arrowSvg);

            const currSpan = document.createElement('span');
            currSpan.style.color = color;
            currSpan.textContent = `#${currentRank.toLocaleString()}`;
            posContainer.appendChild(currSpan);
          } else {
            const currSpan = document.createElement('span');
            currSpan.textContent = `#${currentRank.toLocaleString()}`;
            posContainer.appendChild(currSpan);
          }

          posCell.appendChild(posContainer);
          posRow.appendChild(posCell);
          tableRoot.appendChild(posRow);
        }

        const scoreRow = document.createElement('tr');
        scoreRow.style.borderWidth = 0;
        const scoreCell = document.createElement('td');
        scoreCell.style.borderWidth = 0;
        scoreCell.style.fontSize = '14px';
        scoreCell.style.fontWeight = 'bold';
        scoreCell.style.paddingTop = '4px';

        const scoreContainer = document.createElement('div');
        scoreContainer.appendChild(document.createTextNode(`Score: ${score.toLocaleString()}`));

        if (dataPoint.scoreChanged && !rsEvent) { // Don't show regular change if it's an adjustment event
          const previousScore = tooltip.dataPoints[0].raw.prevScore ?? null;

          if (previousScore !== null) {
            const scoreChange = score - previousScore;
            const scoreChangeText = document.createElement('span');
            scoreChangeText.style.fontWeight = '600';
            scoreChangeText.style.marginLeft = '4px';
            scoreChangeText.style.fontSize = '12px';
            scoreChangeText.style.color = scoreChange > 0 ? '#10B981' : scoreChange < 0 ? '#EF4444' : '#9ca3af';
            scoreChangeText.textContent = `(${scoreChange > 0 ? '+' : ''}${scoreChange.toLocaleString()})`;
            scoreContainer.appendChild(scoreChangeText);
          }
        }

        scoreCell.appendChild(scoreContainer);
        scoreRow.appendChild(scoreCell);
        tableRoot.appendChild(scoreRow);

        const rankRow = document.createElement('tr');
        rankRow.style.borderWidth = 0;
        const rankCell = document.createElement('td');
        rankCell.style.borderWidth = 0;
        rankCell.style.fontSize = '14px';
        rankCell.style.fontWeight = 'bold';
        rankCell.style.paddingTop = '4px';

        const rankContainer = document.createElement('div');
        rankContainer.style.display = 'flex';
        rankContainer.style.alignItems = 'center';
        rankContainer.style.gap = '6px';

        if (dataPoint.scoreChanged) {
          const previousScore = tooltip.dataPoints[0].raw.prevScore ?? null;

          if (previousScore !== null) {
            const previousRank = getRankFromScore(previousScore);
            const rankIndex = RANKS.findIndex(r => r.label === rank.label);
            const previousRankIndex = RANKS.findIndex(r => r.label === previousRank.label);

            if (rankIndex !== previousRankIndex) {
              const isRankUp = rankIndex > previousRankIndex;
              const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              arrowSvg.setAttribute('width', '14');
              arrowSvg.setAttribute('height', '14');
              arrowSvg.setAttribute('viewBox', '0 0 24 24');
              arrowSvg.setAttribute('fill', 'none');
              arrowSvg.setAttribute('stroke', isRankUp ? '#10B981' : '#EF4444');
              arrowSvg.setAttribute('stroke-width', '2');
              arrowSvg.setAttribute('stroke-linecap', 'round');
              arrowSvg.setAttribute('stroke-linejoin', 'round');
              arrowSvg.style.display = 'block';
              arrowSvg.style.flexShrink = '0';
              arrowSvg.style.marginTop = '0';
              arrowSvg.style.marginBottom = '0';

              arrowSvg.innerHTML = isRankUp
                ? '<path d="M12 19V5M5 12l7-7 7 7"/>'
                : '<path d="M12 5v14M5 12l7 7 7-7"/>';

              rankContainer.appendChild(arrowSvg);
            }
          }
        }

        rankContainer.appendChild(document.createTextNode(rank.label));

        const hexagonSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        hexagonSvg.setAttribute('width', '14');
        hexagonSvg.setAttribute('height', '14');
        hexagonSvg.setAttribute('viewBox', '0 0 24 24');
        hexagonSvg.style.marginLeft = '0';
        hexagonSvg.style.flexShrink = '0';
        hexagonSvg.style.display = 'block';

        const hexPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hexPath.setAttribute('d', 'M12 2L22 8.5V15.5L12 22L2 15.5V8.5L12 2Z');
        hexPath.setAttribute('fill', rank.color);
        hexagonSvg.appendChild(hexPath);
        rankContainer.appendChild(hexagonSvg);

        rankCell.appendChild(rankContainer);
        rankRow.appendChild(rankCell);
        tableRoot.appendChild(rankRow);
      }

      if (isRsAdjustment) {
        const details = rsEvent.details;

        const hrRow = document.createElement('tr');
        const hrCell = document.createElement('td');
        hrCell.colSpan = 2;
        hrCell.innerHTML = '<hr style="border-color: #4b5563; margin: 8px 0;" />';
        hrRow.appendChild(hrCell);
        tableRoot.appendChild(hrRow);

        // DIFFERENTIATE BETWEEN ON-LEADERBOARD AND OFF-LEADERBOARD EVENTS
        if (details.is_off_leaderboard) {
          const eventTitleRow = document.createElement('tr');
          eventTitleRow.innerHTML = `<td colspan="2" style="font-weight: bold; font-size: 13px; color: #facc15; padding-bottom: 4px;">RS Adjustment<br>(Off Leaderboard)</td>`;
          tableRoot.appendChild(eventTitleRow);

          const eventChangeRow = document.createElement('tr');
          const changeColor = '#EF4444';
          eventChangeRow.innerHTML = `<td colspan="2" style="font-size: 12px;">Min. Loss: <span style="font-weight: bold; color: ${changeColor};">-${details.minimum_loss.toLocaleString()}</span></td>`;
          tableRoot.appendChild(eventChangeRow);

          const infoRow = document.createElement('tr');
          infoRow.innerHTML = `<td colspan="2" style="font-size: 11px; color: #9ca3af; padding-top: 4px;">Player fell off the ranked leaderboard.</td>`;
          tableRoot.appendChild(infoRow);
        } else {
          // Standard RS Adjustment logic
          const eventTitleRow = document.createElement('tr');
          const titleColor = details.change > 0 ? '#4ade80' : '#f87171';
          eventTitleRow.innerHTML = `<td colspan="2" style="font-weight: bold; font-size: 13px; color: ${titleColor}; padding-bottom: 4px;">RS Adjustment</td>`;
          tableRoot.appendChild(eventTitleRow);

          const eventChangeRow = document.createElement('tr');
          const change = details.change;
          const changeColor = change > 0 ? '#10B981' : '#EF4444';
          eventChangeRow.innerHTML = `<td colspan="2" style="font-size: 12px;">Change: <span style="font-weight: bold; color: ${changeColor};">${change > 0 ? '+' : ''}${change.toLocaleString()}</span></td>`;
          tableRoot.appendChild(eventChangeRow);

          const eventScoreRow = document.createElement('tr');
          eventScoreRow.innerHTML = `<td colspan="2" style="font-size: 12px;">Score: ${details.old_score.toLocaleString()} → <span style="font-weight: bold;">${details.new_score.toLocaleString()}</span></td>`;
          tableRoot.appendChild(eventScoreRow);
        }
      }

      // Suspected Ban Event
      if (isBanStart) {
        if (hasScoreContent || isRsAdjustment) {
          const hrRow = document.createElement('tr');
          const hrCell = document.createElement('td');
          hrCell.colSpan = 2;
          hrCell.innerHTML = '<hr style="border-color: #4b5563; margin: 8px 0;" />';
          hrRow.appendChild(hrCell);
          tableRoot.appendChild(hrRow);
        }
        const titleRow = document.createElement('tr');
        titleRow.innerHTML = `<td colspan="2" style="font-weight: bold; font-size: 13px; color: #ef4444; padding-bottom: 4px;">Suspected Ban</td>`;
        tableRoot.appendChild(titleRow);

        const dateRow = document.createElement('tr');
        const date = new Date(banEvent.start_timestamp * 1000);
        dateRow.innerHTML = `<td colspan="2" style="font-size: 12px; color: #9ca3af;">Started: ${date.toLocaleString(undefined, TIME.FORMAT)}</td>`;
        tableRoot.appendChild(dateRow);
      }

      // Player Reappeared Event
      if (isBanEnd) {
        if (hasScoreContent || isRsAdjustment || isBanStart) {
          const hrRow = document.createElement('tr');
          const hrCell = document.createElement('td');
          hrCell.colSpan = 2;
          hrCell.innerHTML = '<hr style="border-color: #4b5563; margin: 8px 0;" />';
          hrRow.appendChild(hrCell);
          tableRoot.appendChild(hrRow);
        }
        const titleRow = document.createElement('tr');
        titleRow.innerHTML = `<td colspan="2" style="font-weight: bold; font-size: 13px; color: #4ade80; padding-bottom: 4px;">Player Reappeared</td>`;
        tableRoot.appendChild(titleRow);

        const dateRow = document.createElement('tr');
        const date = new Date(banEvent.end_timestamp * 1000);
        dateRow.innerHTML = `<td colspan="2" style="font-size: 12px; color: #9ca3af; padding-bottom: 4px;">Ended: ${date.toLocaleString(undefined, TIME.FORMAT)}</td>`;
        tableRoot.appendChild(dateRow);

        const durationMs = (banEvent.end_timestamp - banEvent.start_timestamp) * 1000;
        const durationRow = document.createElement('tr');
        durationRow.innerHTML = `<td colspan="2" style="font-size: 12px; color: #9ca3af;">Duration: ${formatDuration(durationMs)}</td>`;
        tableRoot.appendChild(durationRow);
      }

      // Unexpected Reappearance Event
      if (isUnexpected) {
        if (hasScoreContent || isRsAdjustment || isBanStart || isBanEnd) {
          const hrRow = document.createElement('tr');
          const hrCell = document.createElement('td');
          hrCell.colSpan = 2;
          hrCell.innerHTML = '<hr style="border-color: #4b5563; margin: 8px 0;" />';
          hrRow.appendChild(hrCell);
          tableRoot.appendChild(hrRow);
        }
        const titleRow = document.createElement('tr');
        titleRow.innerHTML = `<td colspan="2" style="font-weight: bold; font-size: 13px; color: #facc15; padding-bottom: 4px;">Unexpected Reappearance</td>`;
        tableRoot.appendChild(titleRow);

        const descRow = document.createElement('tr');
        const summary = "Reappeared during a suspected ban, likely due to an RS adjustment that temporarily dropped them off the leaderboard (we thought it was a ban).";
        descRow.innerHTML = `<td colspan="2" style="font-size: 12px; color: #9ca3af; white-space: normal;">${summary}</td>`;
        tooltipEl.style.width = '220px'; // good enough...
        tableRoot.appendChild(descRow);
      }

      // Server Downtime marker
      if (isDowntime) {
        if (hasScoreContent || isRsAdjustment || isBanStart || isBanEnd || isUnexpected) {
          const hrRow = document.createElement('tr');
          const hrCell = document.createElement('td');
          hrCell.colSpan = 2;
          hrCell.innerHTML = '<hr style="border-color: #4b5563; margin: 8px 0;" />';
          hrRow.appendChild(hrCell);
          tableRoot.appendChild(hrRow);
        }
        const titleRow = document.createElement('tr');
        titleRow.innerHTML = `<td colspan="2" style="font-weight: bold; font-size: 13px; color: #facc15; padding-bottom: 4px;">Server Downtime</td>`;
        tableRoot.appendChild(titleRow);

        const descRow = document.createElement('tr');
        const durationText = downtime.durationHours ? `~${downtime.durationHours}h of downtime` : 'a period of downtime';
        const summary = `Follows ${durationText} on Embark's servers. A score change here is the catch-up after the outage, not a single game.`;
        descRow.innerHTML = `<td colspan="2" style="font-size: 12px; color: #9ca3af; white-space: normal;">${summary}</td>`;
        tooltipEl.style.width = '220px';
        tableRoot.appendChild(descRow);
      }
    } else {
      tooltipEl.style.opacity = 0;
      return;
    }

    // --- New Positioning Logic ---
    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
    const tooltipWidth = tooltipEl.offsetWidth;
    const tooltipHeight = tooltipEl.offsetHeight;
    const chartWidth = chart.width;

    // Horizontal position: Center by default, but shift if it clips the edges.
    let left = positionX + tooltip.caretX - (tooltipWidth / 2);
    if (left < 5) { // Check left boundary
      left = 5;
    }
    if (left + tooltipWidth > chartWidth - 5) { // Check right boundary
      left = chartWidth - tooltipWidth - 5;
    }

    // Vertical position: Place above the point by default. If it clips the top, place it below.
    let top = positionY + tooltip.caretY - tooltipHeight - 10; // 10px gap above
    if (top < 5) {
      top = positionY + tooltip.caretY + 15; // 15px gap below
    }

    tooltipEl.style.opacity = 1;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
    tooltipEl.style.transform = 'none'; // Position is now calculated manually.
    tooltipEl.style.font = tooltip.options.bodyFont.string;
  }, [eventSettings, isRankMode]);

  const overallTimeDomain = useMemo(() => {
    if (!data?.length) return { min: null, max: null };

    let minTimestamp = data[0].timestamp.getTime();
    let maxTimestamp = data[data.length - 1].timestamp.getTime();

    if (comparisonData.size > 0) {
      for (const { data: compareData } of comparisonData.values()) {
        if (compareData?.length > 0) {
          // The data is pre-sorted, so [0] is the earliest
          // and [length-1] is the latest for that dataset.
          minTimestamp = Math.min(minTimestamp, compareData[0].timestamp.getTime());
          maxTimestamp = Math.max(maxTimestamp, compareData[compareData.length - 1].timestamp.getTime());
        }
      }
    }

    return {
      min: new Date(minTimestamp),
      max: new Date(maxTimestamp)
    };
  }, [data, comparisonData]);

  const calculateViewWindow = useCallback((data, range, timeDomain) => {
    if (!data?.length || !TIME.RANGES[range]) return null;

    const now = seasonEndDate || new Date();

    // Determine right-side padding based on range to prevent points hugging the edge.
    // 24H: ~1.2 hours padding. 7D: ~8 hours padding.
    let rightPadding = TIME.HOUR;
    if (range === '24H') rightPadding = TIME.HOUR * 1.25;
    if (range === '7D') rightPadding = TIME.HOUR * 8;

    const endTime = new Date(now.getTime() + rightPadding);
    const timeRangeMs = TIME.RANGES[range];

    if (range === 'MAX') {
      const start = timeDomain.min || data[0].timestamp;
      const domainMax = timeDomain.max || data[data.length - 1].timestamp;

      const duration = domainMax.getTime() - start.getTime();

      // If data spans less than 2 days, use dynamic padding to center/fit the data nicely
      // rather than forcing a large 12h buffer which pushes sparse data to the right.
      if (duration < TIME.DAY * 2) {
        // Use 2 hours or 20% of duration (whichever is larger) as padding.
        // This matches the zoom limits (min - 2h) closer, preventing a "snap" effect on interaction.
        const padding = Math.max(TIME.TWO_HOURS, duration * 0.2);

        const min = new Date(start.getTime() - padding);
        const max = new Date(domainMax.getTime() + padding);

        return { min, max };
      }

      // For larger datasets, standard logic: Start - 12H to End + Padding
      const min = new Date(start.getTime() - (TIME.DAY / 2));
      return { min, max: endTime };
    }

    const viewMin = new Date(now.getTime() - timeRangeMs);

    // Clamp to the same bounds the zoom plugin enforces (data domain ± 2h; see `limits.x`).
    // When a player's history is younger than the selected range, the naive window
    // (now − range … now + padding) reaches past the data on the left — and a little past it on
    // the right. On first paint that renders as dead space with the line shoved toward the
    // centre/right; the instant the user pans or zooms, the plugin snaps the view to these
    // limits and it visibly jumps left. Matching the limits here makes the initial view
    // identical to the post-interaction one, so there's no snap.
    let min = viewMin.getTime();
    let max = endTime.getTime();
    if (timeDomain?.min) min = Math.max(min, timeDomain.min.getTime() - TIME.TWO_HOURS);
    if (timeDomain?.max) max = Math.min(max, timeDomain.max.getTime() + TIME.TWO_HOURS);
    return { min: new Date(min), max: new Date(max) };
  }, [seasonEndDate]);

  const viewWindow = useMemo(() => calculateViewWindow(data, selectedTimeRange, overallTimeDomain), [data, selectedTimeRange, calculateViewWindow, overallTimeDomain]);

  const calculateYAxisBounds = useCallback((data, timeRange) => {
    // Metric-aware: rank mode bounds the axis on true rank (floor 1, smaller = better),
    // score mode on rank score (floor 0). getMetricVal returns null for points that carry
    // no meaningful value for the active metric (null-rank, or score-only synthetics).
    const fallbackBounds = isRankMode
      ? { min: 1, max: 1000, stepSize: 100, floorTick: 1 }
      : { min: 0, max: 50000, stepSize: 10000, floorTick: null };
    const getMetricVal = (d) => {
      if (!d) return null;
      if (isRankMode) {
        if (d.isStaircasePoint || d.isGapBridge) return null;
        return (typeof d.rank === 'number' && !Number.isNaN(d.rank) && d.rank > 0) ? d.rank : null;
      }
      return (typeof d.rankScore === 'number' && !Number.isNaN(d.rankScore)) ? d.rankScore : null;
    };

    if (!data?.length || !timeRange?.min) return fallbackBounds;

    const getVisibleAndNearestData = (dataset) => {
      const startIdx = findStartIndex(dataset, timeRange.min);
      const endIdx = findEndIndex(dataset, timeRange.max);

      if (startIdx > endIdx) {
        // No visible points in window
        const lastPointBefore = startIdx > 0 ? dataset[startIdx - 1] : null;
        const firstPointAfter = endIdx < dataset.length - 1 ? dataset[endIdx + 1] : null;
        return [lastPointBefore, firstPointAfter].filter(Boolean);
      }

      // Return the slice of visible data
      // slice end is exclusive, so we add 1
      return dataset.slice(startIdx, endIdx + 1);
    };

    const chart = chartRef.current;

    let visibleData = [];
    if (!chart || chart.getDatasetMeta(0).visible !== false) {
      visibleData = getVisibleAndNearestData(data);
    }

    const comparisonVisibleData = Array.from(comparisonData.entries())
      .map(([_, { data: compareData }], index) => {
        if (!chart || chart.getDatasetMeta(index + 1).visible !== false) {
          return getVisibleAndNearestData(compareData);
        }
        return [];
      })
      .flat();

    const allVisibleData = [...visibleData, ...comparisonVisibleData];
    const visibleMetricVals = allVisibleData.map(getMetricVal).filter(v => v !== null);

    let minVal, maxVal;

    if (!visibleMetricVals.length) {
      let lastKnownVal;
      const rangeStart = timeRange.min;

      const allDatasets = [
        chart?.getDatasetMeta(0).visible !== false ? data : [],
        ...Array.from(comparisonData.entries())
          .filter((_, index) => chart?.getDatasetMeta(index + 1).visible !== false)
          .map(([_, { data: compareData }]) => compareData)
      ];

      // Per dataset, the most recent valid value at or before the window start. Rank prefers
      // the smallest (best) value, score the largest — each metric's "leading edge".
      for (const dataset of allDatasets) {
        for (let i = dataset.length - 1; i >= 0; i--) {
          if (dataset[i].timestamp <= rangeStart) {
            const v = getMetricVal(dataset[i]);
            if (v !== null) {
              if (lastKnownVal === undefined || (isRankMode ? v < lastKnownVal : v > lastKnownVal)) {
                lastKnownVal = v;
              }
              break;
            }
          }
        }
      }

      if (lastKnownVal === undefined) {
        // Deep fallback: first valid value from the start of each visible dataset.
        const firstVals = allDatasets
          .map(ds => {
            for (let i = 0; i < ds.length; i++) {
              const v = getMetricVal(ds[i]);
              if (v !== null) return v;
            }
            return undefined;
          })
          .filter(v => v !== undefined);
        lastKnownVal = firstVals.length > 0 ? (isRankMode ? Math.min(...firstVals) : Math.max(...firstVals)) : undefined;
      }

      if (lastKnownVal === undefined) {
        return fallbackBounds;
      }

      minVal = lastKnownVal;
      maxVal = lastKnownVal;
    } else {
      // Single pass instead of Math.min/max(...spread): in MAX view visibleMetricVals can hold
      // every point across all datasets, and spreading a large array as call args risks a
      // "Maximum call stack size exceeded" RangeError.
      minVal = visibleMetricVals[0];
      maxVal = visibleMetricVals[0];
      for (let i = 1; i < visibleMetricVals.length; i++) {
        const v = visibleMetricVals[i];
        if (v < minVal) minVal = v;
        else if (v > maxVal) maxVal = v;
      }
    }

    // Snug, well-spaced bounds
    // Pick a "nice" tick step (1/2/5 × 10ⁿ) aiming for ~9 gridlines across the data range.
    const niceStep = (axisSpan) => {
      const rough = axisSpan / 9;
      const mag = Math.pow(10, Math.floor(Math.log10(rough)));
      const r = rough / mag;
      let s;
      if (r > 5) s = 10 * mag;
      else if (r > 2.5) s = 5 * mag;
      else if (r > 1) s = 2 * mag;
      else s = mag;
      return isRankMode ? Math.max(1, Math.round(s)) : s;
    };

    if (isRankMode) {
      // Reversed axis: best (smallest) rank sits at the top, worst (largest) at the bottom.
      const best = minVal;
      const worst = maxVal;

      // Flat line (e.g. held #1 all week): centre the value with breathing room either side.
      if (worst - best < 1) {
        const flatSpan = Math.max(10, Math.round(best * 0.25));
        return {
          min: best - flatSpan,
          max: best + flatSpan,
          stepSize: niceStep(flatSpan * 2),
          floorTick: Math.max(1, Math.round(best)),
        };
      }

      const span = worst - best;
      const stepSize = niceStep(span);
      // A touch of give above the best rank so #1 never sits flush against the top edge.
      const topGive = Math.max(span * 0.03, 1.5);
      // A little room past the worst rank, then round the bottom out to a clean step.
      const botGrace = Math.max(span * 0.02, 1);
      const min = best - topGive; // may dip below 1 — pure headroom, no tick is drawn there
      let max = Math.ceil((worst + botGrace) / stepSize) * stepSize;
      if (max <= worst) max += stepSize;
      // The best rank is forced as a tick (clamped to the #1 floor); afterBuildTicks drops the
      // impossible sub-#1 ticks the headroom would otherwise create.
      return { min, max, stepSize, floorTick: Math.max(1, Math.round(best)) };
    }

    // Score mode: higher is better and the axis is not reversed. Give room above the top score
    // and below the bottom score, floored at 0, rounding both edges out to clean steps.
    let low = minVal;
    let high = maxVal;
    if (high - low < 1) {
      const flatSpan = Math.max(500, Math.round(high * 0.05));
      low -= flatSpan;
      high += flatSpan;
    }
    const sSpan = high - low;
    const sStep = niceStep(sSpan);
    const sGrace = Math.max(sSpan * 0.05, sStep * 0.5);
    const sMax = Math.ceil((high + sGrace) / sStep) * sStep;
    const sMin = Math.max(0, Math.floor((low - sGrace) / sStep) * sStep);
    return { min: sMin, max: sMax > sMin ? sMax : sMin + sStep, stepSize: sStep, floorTick: null };
  }, [comparisonData, chartRef, isRankMode]);

  // Memoized array (not a callback): chartOptions rebuilds every animation frame during pan/zoom
  // because handleChartUpdate updates manualViewWindow per frame. Returning a stable, memoized
  // array means this O(all-points) event scan runs only when its inputs change, not per frame —
  // and the annotation plugin keys off each annotation's `id`, so stable identity is desirable.
  const eventAnnotations = useMemo(() => {
    const annotations = [];

    const processPlayerDataset = (playerData, playerEvents, _playerName, datasetIndex) => {
      if (!playerData) return;

      // Handle point-based events (name/club changes)
      playerData.forEach(point => {
        if (point.isInterpolated || point.isExtrapolated || point.isStaircasePoint || point.isGapBridge || !point.events) {
          return;
        }
        // In rank mode a point with no real rank has no position on the inverted axis.
        if (isRankMode && (typeof point.rank !== 'number' || point.rank <= 0)) {
          return;
        }

        point.events.forEach(event => {
          let labelContent = [];
          let color = '';
          let shouldShow = false;

          if (event.event_type === 'COMBINED_CHANGE') {
            if (eventSettings.showNameChange) {
              const oldClubText = event.details.old_club ? `[${event.details.old_club}] ` : '';
              const newClubText = event.details.new_club ? `[${event.details.new_club}] ` : '';
              labelContent = ['Name & Club Change:', `${oldClubText}${event.details.old_name} → ${newClubText}${event.details.new_name}`];
              color = "#818cf8";
              shouldShow = true;
            } else if (eventSettings.showClubChange) {
              const oldClub = event.details.old_club ? `[${event.details.old_club}]` : 'No Club';
              const newClub = event.details.new_club ? `[${event.details.new_club}]` : 'No Club';
              labelContent = ['Club Change:', `${oldClub} → ${newClub}`];
              color = '#2dd4bf';
              shouldShow = true;
            }
          } else if (event.event_type === 'NAME_CHANGE' && eventSettings.showNameChange) {
            labelContent = [`Name Change:`, `${event.details.old_name} → ${event.details.new_name}`];
            color = "#818cf8";
            shouldShow = true;
          } else if (event.event_type === 'CLUB_CHANGE' && eventSettings.showClubChange) {
            const oldClub = event.details.old_club ? `[${event.details.old_club}]` : 'No Club';
            const newClub = event.details.new_club ? `[${event.details.new_club}]` : 'No Club';
            labelContent = ['Club Change:', `${oldClub} → ${newClub}`];
            color = '#2dd4bf';
            shouldShow = true;
          }

          if (shouldShow) {
            const eventId = event.event_id || `${event.event_type}-${point.timestamp.getTime()}`;
            annotations.push({
              type: 'label',
              id: `label-point-event-${eventId}`,
              // The `display` property lets the plugin manage visibility internally.
              display: (ctx) => {
                if (!ctx.element?.options) {
                  return true;
                }
                const { chart } = ctx;
                if (!chart.scales?.x || !chart.scales?.y) return true;

                // Check if the associated dataset is visible before rendering the annotation.
                if (!chart.isDatasetVisible(datasetIndex)) {
                  return false;
                }

                const xValue = ctx.element.options.xValue;
                // Use the chart's live scale min/max to determine visibility.
                return xValue >= chart.scales.x.min && xValue <= chart.scales.x.max;
              },
              xValue: point.timestamp,
              yValue: isRankMode ? point.rank : point.rankScore,
              content: labelContent,
              font: {
                // Scriptable font size adapts to the current zoom level.
                size: (ctx) => {
                  const baseFontSize = 11;
                  const chart = ctx.chart;
                  // Guard against calls before the chart is fully initialized.
                  if (!chart || !chart.scales.x || chart.scales.x.min === undefined) return baseFontSize;

                  const viewDuration = chart.scales.x.max - chart.scales.x.min;

                  if (viewDuration <= TIME.DAY * 3) return baseFontSize;
                  if (viewDuration <= TIME.WEEK * 2) return baseFontSize - 1;
                  return Math.max(8, baseFontSize - 2);
                }
              },
              color: color,
              backgroundColor: 'rgba(30, 41, 59, 0.85)',
              yAdjust: 25,
              xAdjust: (ctx) => {
                // Clipping logic remains the same and will now be stable.
                if (!ctx.chart?.scales?.x || !ctx.element?.options) return 0;
                const chart = ctx.chart;
                const scale = chart.scales.x;
                const xPixel = scale.getPixelForValue(ctx.element.options.xValue);
                const chartRight = scale.getPixelForValue(scale.max);
                const chartLeft = scale.getPixelForValue(scale.min);
                const labelHalfWidth = 90;
                if (xPixel + labelHalfWidth > chartRight) return chartRight - (xPixel + labelHalfWidth) - 5;
                if (xPixel - labelHalfWidth < chartLeft) return chartLeft - (xPixel - labelHalfWidth) + 5;
                return 0;
              },
              padding: 6,
              borderRadius: 4,
            });
          }
        });
      });

      // Handle time-range based events
      if (playerEvents) {
        playerEvents.forEach(event => {
          if (event.event_type === 'SUSPECTED_BAN') {
            // No longer creating box annotations for bans.
            // This is now visualized with icons on the data line.
            return;
          }
          // Keep this structure for any other future time-range events.
        });
      }
    };

    // Main player is dataset at index 0
    processPlayerDataset(data, events, embarkId, 0);

    // Comparison players are subsequent datasets
    Array.from(comparisonData.entries()).forEach(([id, compare], index) => {
      processPlayerDataset(compare.data, compare.events, id, index + 1);
    });

    return annotations;
  }, [data, events, comparisonData, embarkId, eventSettings, isRankMode]);

  const rankAnnotations = useMemo(() => {
    if (!data) return [];

    // Create annotations for ALL ranks and ruby line, but control their visibility dynamically.
    // This makes the returned array stable, preventing the plugin from resetting.
    // League threshold lines are rank-score values with no rank-axis equivalent, so they only
    // appear in score mode — and only while the user keeps them enabled.
    const annotations = (!isRankMode && eventSettings.showLeagueLines)
      ? RANKS.map(rank => ({
        type: 'line',
        drawTime: 'beforeDatasetsDraw',
        id: `rank-line-${rank.label.replace(' ', '-')}`,
        yMin: rank.y,
        yMax: rank.y,
        borderColor: rank.color,
        borderWidth: 1.5,
        borderDash: [2, 2],
        // Use the 'display' property to let the plugin handle visibility.
        display: (ctx) => {
          const yAxis = ctx.chart.scales.y;
          // Only display if the rank is within the current y-axis view.
          return rank.y >= yAxis.min && rank.y <= yAxis.max;
        },
        label: {
          content: rank.label,
          display: true,
          position: 'center',
          color: rank.color,
          font: {
            size: 11
          },
          padding: {
            left: 8,
            right: 8
          }
        }
      }))
      : [];

    const seasonConfig = Object.values(SEASONS).find(s => s.id === seasonId);
    const hasRuby = seasonConfig && seasonConfig.hasRuby;

    // Ruby cutoff: in rank mode it's a fixed line at rank #500 (the top-500 boundary); in
    // score mode it's the dynamic/historical rank-score threshold. Either way, user-toggleable.
    if (hasRuby && eventSettings.showRubyLine) {
      const rubyY = isRankMode ? 500 : (typeof rubyCutoff === 'number' ? rubyCutoff : null);
      if (rubyY !== null) {
        annotations.push({
          type: 'line',
          drawTime: 'beforeDatasetsDraw',
          id: 'rank-line-ruby',
          yMin: rubyY,
          yMax: rubyY,
          borderColor: '#dc2626',
          borderWidth: 1.5,
          borderDash: [2, 2],
          // Also control the Ruby line's visibility dynamically.
          display: (ctx) => {
            const yAxis = ctx.chart.scales.y;
            return rubyY >= yAxis.min && rubyY <= yAxis.max;
          },
          label: {
            content: 'Ruby',
            display: true,
            position: 'center',
            color: '#dc2626',
            font: {
              size: 11
            },
            padding: {
              left: 8,
              right: 8
            }
          }
        });
      }
    }

    return annotations;
  }, [data, seasonId, rubyCutoff, isRankMode, eventSettings]);

  const chartOptions = useMemo(() => {
    if (!data) return null;

    const { min: overallMin, max: overallMax } = overallTimeDomain;

    // The 'viewWindow' from props is our starting point (e.g., last 7 days from button).
    // The 'manualViewWindow' is the state updated by user zoom/pan.
    // We decide which one is currently active.
    const activeViewWindow = isManuallyZoomed && manualViewWindow ? manualViewWindow : viewWindow;

    const { min: initialMinY, max: initialMaxY, stepSize: initialStepSize, floorTick: initialFloorTick } = calculateYAxisBounds(data, activeViewWindow);

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      transitions: {
        active: {
          animation: {
            duration: 0
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            displayFormats: TIME.DISPLAY_FORMATS,
            tooltipFormat: 'd MMM yyyy HH:mm',
            unit: 'hour',
            adapters: {
              date: {
                locale: Intl.DateTimeFormat().resolvedOptions().locale
              }
            }
          },
          grid: { color: '#2a3042' },
          ticks: {
            color: '#cecfd3',
            maxRotation: isMobile ? 55 : 69,
            minRotation: isMobile ? 55 : 69,
            autoSkip: true,
            maxTicksLimit: isMobile ? 7 : 20,
            padding: 4,
            align: 'end',
            callback: function (value) {
              const date = new Date(value);
              const options = { ...TIME.FORMAT };
              if (isHistoricalSeason) {
                options.year = 'numeric';
              }
              return date.toLocaleString(undefined, options);
            }
          },
          min: activeViewWindow?.min,
          max: activeViewWindow?.max
        },
        y: {
          min: initialMinY,
          max: initialMaxY,
          reverse: isRankMode, // rank mode plots an inverted axis so #1 sits at the top
          grid: { color: '#2a3042' },
          ticks: {
            color: '#cecfd3',
            callback: value => isRankMode ? `#${Math.round(value).toLocaleString()}` : Math.round(value).toLocaleString(),
            stepSize: initialStepSize,
            maxTicksLimit: 15,
          },
          // Rank axis can sit slightly above #1 for headroom; strip the impossible (<#1) ticks
          // that headroom creates and guarantee the best-rank floor tick stays visible.
          afterBuildTicks: isRankMode ? (axis) => {
            let ticks = axis.ticks.filter(t => t.value >= 1);
            if (initialFloorTick != null && !ticks.some(t => Math.round(t.value) === initialFloorTick)) {
              ticks.push({ value: initialFloorTick, major: false });
            }
            const seen = new Set();
            axis.ticks = ticks
              .filter(t => { const k = Math.round(t.value); if (seen.has(k)) return false; seen.add(k); return true; })
              .sort((a, b) => a.value - b.value);
          } : undefined,
        }
      },
      plugins: {
        zoom: {
          limits: {
            x: {
              min: overallMin ? overallMin.getTime() - TIME.TWO_HOURS : undefined,
              max: overallMax ? overallMax.getTime() + TIME.TWO_HOURS : undefined,
              minRange: 5 * TIME.HOUR
            }
          },
          pan: {
            enabled: true,
            mode: 'x',
            modifierKey: null,
            onPanStart: () => {
              setIsManuallyZoomed(true);
              if (onZoomOrPan) onZoomOrPan();
            },
            onPan: (ctx) => handleChartUpdate(ctx.chart),
            onPanComplete: () => {
              setSelectedTimeRange(null);
            }
          },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x',
            onZoomStart: () => {
              setIsManuallyZoomed(true);
              if (onZoomOrPan) onZoomOrPan();
            },
            onZoom: (ctx) => handleChartUpdate(ctx.chart),
            onZoomComplete: () => {
              setSelectedTimeRange(null);
            }
          },
        },
        annotation: {
          annotations: [...rankAnnotations, ...eventAnnotations]
        },
        tooltip: {
          enabled: false,
          external: externalTooltipHandler,
          position: 'nearest',
          callbacks: {
            title: (tooltipItems) => {
              const date = new Date(tooltipItems[0].raw.x);
              return date.toLocaleString(undefined, TIME.FORMAT);
            }
          }
        },
        legend: {
          onClick: (evt, item, legend) => {
            // Run the default behavior
            ChartJS.defaults.plugins.legend.onClick(evt, item, legend);
            // Then, trigger a state update to force a Y-axis recalculation
            setTimeout(() => {
              const chart = legend.chart;
              setIsManuallyZoomed(true); // Engage manual mode to use the current zoom level
              setManualViewWindow({ min: chart.scales.x.min, max: chart.scales.x.max });
            }, 0);
          },
          labels: {
            color: '#ffffff',
            boxWidth: 15,
            padding: 15,
            usePointStyle: true
          }
        }
      }
    };
  }, [
    data,
    viewWindow,
    isManuallyZoomed,
    manualViewWindow,
    calculateYAxisBounds,
    rankAnnotations,
    eventAnnotations,
    externalTooltipHandler,
    overallTimeDomain,
    onZoomOrPan,
    setSelectedTimeRange,
    handleChartUpdate,
    isHistoricalSeason,
    isRankMode,
    isMobile
  ]);

  const getPointStyle = useCallback((ctx) => {
    const pointData = ctx.raw?.raw;
    if (eventSettings.showSuspectedBan) {
      if (pointData?.isUnexpectedReappearance) return unexpectedReappearanceIcon;
      if (pointData?.isBanStartAnchor) return gavelIcon;
      if (pointData?.isBanEndAnchor) return unbanIcon;
    }
    if (hasVisibleEvent(ctx, 'COMBINED_CHANGE')) {
      if (eventSettings.showNameChange) return nameChangeIcon;
      if (eventSettings.showClubChange) return clubChangeIcon;
    }
    if (eventSettings.showNameChange && hasVisibleEvent(ctx, 'NAME_CHANGE')) return nameChangeIcon;
    if (eventSettings.showClubChange && hasVisibleEvent(ctx, 'CLUB_CHANGE')) return clubChangeIcon;
    if (eventSettings.showRsAdjustment) {
      const rsEvent = getRsEvent(ctx);
      if (rsEvent) {
        return rsEvent.details.change > 0 ? rsUpIcon : rsDownIcon;
      }
      // Handle anchor points for off-leaderboard adjustments
      if (pointData?.isRsAdjustmentAnchor) {
        return rsDownIcon;
      }
    }
    const downtimeMarker = getDowntimeMarker(ctx, isRankMode);
    if (downtimeMarker === 'icon') return unexpectedReappearanceIcon;
    if (downtimeMarker === 'dot') return 'circle';
    const direction = isRankMode ? null : (ctx.raw?.direction ?? null);
    return (direction === 'up' || direction === 'down') ? 'triangle' : 'circle';
  }, [eventSettings, isRankMode]);

  const getPointRotation = useCallback((ctx) => {

    const pointData = ctx.raw?.raw;
    // Events with custom directional icons (name, club, RS adjustment) should not be rotated.
    if ((eventSettings.showNameChange && hasVisibleEvent(ctx, 'NAME_CHANGE')) ||
      (eventSettings.showClubChange && hasVisibleEvent(ctx, 'CLUB_CHANGE')) ||
      (hasVisibleEvent(ctx, 'COMBINED_CHANGE')) ||
      (eventSettings.showSuspectedBan && (pointData?.isUnexpectedReappearance || pointData?.isBanStartAnchor || pointData?.isBanEndAnchor)) ||
      (eventSettings.showRsAdjustment && getRsEvent(ctx)) || (eventSettings.showRsAdjustment && pointData?.isRsAdjustmentAnchor) ||
      getDowntimeMarker(ctx, isRankMode)) {
      return 0;
    }

    // For regular score change points (which use a triangle), rotate it if the score went down.
    const direction = isRankMode ? null : (ctx.raw?.direction ?? null);
    return direction === 'down' ? 180 : 0;
  }, [eventSettings, isRankMode]);

  const getPointBackgroundColor = useCallback((ctx, color) => {
    if (getDowntimeMarker(ctx, isRankMode) === 'dot') return '#facc15';
    if (ctx.raw?.raw?.isExtrapolated || ctx.raw?.raw?.isInterpolated) return '#7d7c7b';
    const direction = isRankMode ? null : (ctx.raw?.direction ?? null);
    if (direction === 'up') return '#10B981';
    if (direction === 'down') return '#EF4444';
    return color;
  }, [isRankMode]);

  const getPointBorderColor = useCallback((ctx, color) => {
    if (getDowntimeMarker(ctx, isRankMode) === 'dot') return '#facc15';
    if (ctx.raw?.raw?.isExtrapolated || ctx.raw?.raw?.isInterpolated) return '#8a8988';
    const direction = isRankMode ? null : (ctx.raw?.direction ?? null);
    if (direction === 'up' || direction === 'down') return '#FAF9F6';
    return color;
  }, [isRankMode]);

  // Map a processed-data array to chart points for the active metric. Score mode plots
  // rankScore for every point; rank mode plots true rank and drops points that have no
  // rank position (null/≤0) or exist purely for score aesthetics (staircase/gap bridge) —
  // with one exception: off-leaderboard RS adjustments are kept (anchored to the last known
  // rank) so their marker still appears.
  const buildPoints = useCallback((points) => {
    if (!points) return [];
    if (!isRankMode) {
      // Precompute each point's score `direction` and `prevScore` in a single pass. The per-point
      // scriptable options (radius/style/rotation/colours) and the tooltip read these in O(1).
      // They used to recompute direction by scanning backwards for the prior score-changed point —
      // O(n) per point, re-run on every draw/hover/zoom/pan, i.e. O(n²) per frame.
      let previousScore = null;
      const result = new Array(points.length);
      for (let i = 0; i < points.length; i++) {
        const d = points[i];
        let direction = null;
        if (d.scoreChanged && d.timestamp.getTime() >= NEW_LOGIC_TIMESTAMP_MS) {
          direction = previousScore === null
            ? 'first'
            : (d.rankScore > previousScore ? 'up' : d.rankScore < previousScore ? 'down' : 'same');
        }
        result[i] = { x: d.timestamp, y: d.rankScore, raw: d, direction, prevScore: d.scoreChanged ? previousScore : null };
        if (d.scoreChanged) previousScore = d.rankScore;
      }
      return result;
    }
    // Rank view plots true rank and tags each plotted point with whether its rank differs
    // from the previously plotted one. Dot/tooltip visibility keys off `rankChanged` so the
    // chart marks RANK changes — including shifts on "tracking" points caused purely by other
    // players moving — rather than rank-score changes. `prevScore` is the last plotted
    // score-changed point's rank score, precomputed for the tooltip's score-delta row.
    let previousRank = null;
    let previousScore = null;
    let inFalloff = false;
    const result = [];
    for (const d of points) {
      if (d.isStaircasePoint || d.isGapBridge) continue;

      if (typeof d.rank === 'number' && d.rank > 0) {
        const rankChanged = previousRank === null || d.rank !== previousRank;
        result.push({ x: d.timestamp, y: d.rank, raw: d, rankChanged, prevScore: previousScore });
        previousRank = d.rank;
        if (d.scoreChanged) previousScore = d.rankScore;
        inFalloff = false;
        continue;
      }

      // Off-leaderboard RS adjustment: the player has no tracked rank at this moment (the
      // penalty dropped them below the leaderboard), so this point would normally be filtered
      // out and the orange adjustment marker would vanish in rank view. Anchor it to the last
      // known rank so the icon still renders on the line; the point's own isFollowedByGap
      // styling then conveys that the player fell off afterwards. previousRank is deliberately
      // NOT advanced — their true rank after the penalty is unknown, so later points keep
      // comparing against the last position the player actually held.
      if (d.isRsAdjustmentAnchor && previousRank !== null) {
        result.push({ x: d.timestamp, y: previousRank, raw: d, rankChanged: false, prevScore: previousScore });
        if (d.scoreChanged) previousScore = d.rankScore;
        inFalloff = true;
        continue;
      }

      // Final interpolation to 'now' trailing an off-leaderboard fall-off. It inherits the
      // adjustment's null rank, so it'd be dropped here — and with it the dashed isFollowedByGap
      // segment (drawn from the RS anchor to this point) that conveys the player fell off the
      // leaderboard. Anchor it to the same last known rank so that segment has an endpoint and
      // renders. It draws no dot of its own (getPointRadius hides isFinalInterpolation), so this
      // only restores the trailing dash — matching score mode.
      if (inFalloff && d.isFinalInterpolation && previousRank !== null) {
        result.push({ x: d.timestamp, y: previousRank, raw: d, rankChanged: false, prevScore: previousScore });
        inFalloff = false;
        continue;
      }
    }
    return result;
  }, [isRankMode]);

  const chartData = useMemo(() => data ? {
    labels: data.map(d => d.timestamp),
    datasets: [{
      label: comparisonData.size > 0 && mainPlayerWinrate !== null
        ? ` ${embarkId} (${mainPlayerWinrate}% WR)`
        : ` ${embarkId}`,
      normalized: true,
      data: buildPoints(data),
      segment: {
        borderColor: (ctx) => getBorderColor(ctx, '#FAF9F6', eventSettings, isRankMode),
        borderWidth: 2,
        borderDash: (ctx) => getBorderDash(ctx, eventSettings),
      },
      pointStyle: getPointStyle,
      pointRotation: getPointRotation,
      pointBackgroundColor: (ctx) => getPointBackgroundColor(ctx, '#FAF9F6'),
      pointBorderColor: (ctx) => getPointBorderColor(ctx, '#FAF9F6'),
      pointBorderWidth: 0.9,
      pointRadius: getPointRadius,
      pointHoverRadius: ctx => getPointRadius(ctx) * 1.5,
      tension: 0.01
    },
    ...Array.from(comparisonData.entries()).map(([compareId, { data: compareData, color, winrate }]) => ({
      label: winrate !== null ? ` ${compareId} (${winrate}% WR)` : ` ${compareId}`,
      normalized: true,
      data: buildPoints(compareData),
      segment: {
        borderColor: (ctx) => getBorderColor(ctx, color, eventSettings, isRankMode),
        borderWidth: 2,
        borderDash: (ctx) => getBorderDash(ctx, eventSettings),
      },
      pointStyle: getPointStyle,
      pointRotation: getPointRotation,
      pointBackgroundColor: (ctx) => getPointBackgroundColor(ctx, color),
      pointBorderColor: (ctx) => getPointBorderColor(ctx, color),
      pointBorderWidth: 0.9,
      pointRadius: getPointRadius,
      pointHoverRadius: ctx => getPointRadius(ctx) * 1.5,
      tension: 0.01
    }))]
  } : null, [data, embarkId, comparisonData, eventSettings, getPointRadius, getPointStyle, getPointRotation, getPointBackgroundColor, getPointBorderColor, mainPlayerWinrate, buildPoints, isRankMode]);

  return { chartOptions, chartData };
};