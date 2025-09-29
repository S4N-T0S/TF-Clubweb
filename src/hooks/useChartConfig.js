import { useMemo, useCallback, useState, useEffect } from 'react';
import { Chart as ChartJS } from 'chart.js';
import { SEASONS } from '../services/historicalDataService';
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
  if (pointData?.events && !pointData.isInterpolated && !pointData.isExtrapolated && !pointData.isStaircasePoint) {
    return pointData.events.find(e => e.event_type === 'RS_ADJUSTMENT');
  }
  return null;
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

/**
 * Determines the direction of score change for a new-logic data point.
 * @param {import('chart.js').ScriptableContext<'line'>} ctx The chart context.
 * @returns {'up' | 'down' | 'same' | 'first' | null}
 */
const getNewLogicPointDirection = (ctx) => {
  // The chart context might not be fully available on the first pass, or datasetIndex could be stale.
  if (!ctx.chart?.data?.datasets || !ctx.raw?.raw || !ctx.chart.data.datasets[ctx.datasetIndex]) {
    return null;
  }

  const pointData = ctx.raw.raw;
  const datasetIndex = ctx.datasetIndex;
  const dataIndex = ctx.dataIndex;

  if (pointData.timestamp.getTime() >= NEW_LOGIC_TIMESTAMP_MS && pointData.scoreChanged) {
    const dataset = ctx.chart.data.datasets[datasetIndex].data;
    const currentScore = pointData.rankScore;

    let previousScore = null;
    for (let i = dataIndex - 1; i >= 0; i--) {
      if (dataset[i].raw?.scoreChanged) {
        previousScore = dataset[i].raw.rankScore;
        break;
      }
    }

    if (previousScore !== null) {
      const scoreChange = currentScore - previousScore;
      if (scoreChange > 0) return 'up';
      if (scoreChange < 0) return 'down';
      return 'same';
    }
    return 'first'; // First game point, no previous to compare to
  }

  return null; // Not a new-logic, score-changed point
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
    background: '#1f2937',
    borderRadius: '8px',
    border: '1px solid #374151',
    color: '#FAF9F6',
    opacity: 0,
    pointerEvents: 'none',
    position: 'absolute',
    transition: 'opacity 0.15s ease-out',
    padding: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
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

const getBorderColor = (ctx, defaultColor = '#FAF9F6', eventSettings = {}) => {
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
}) => {

  const seasonConfig = useMemo(() => Object.values(SEASONS).find(s => s.id === seasonId), [seasonId]);
  const seasonEndDate = useMemo(() => seasonConfig?.endTimestamp ? new Date(seasonConfig.endTimestamp * 1000) : null, [seasonConfig]);

  const [manualViewWindow, setManualViewWindow] = useState(null);
  const [isManuallyZoomed, setIsManuallyZoomed] = useState(false);

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


  const getPointRadius = useCallback((ctx) => {
    const pointData = ctx.raw?.raw;
    if (!ctx.chart || !pointData) return 3;

    if (eventSettings.showSuspectedBan && pointData.isUnexpectedReappearance) return 8;

    // Make the ban anchor icons visible and large if enabled
    if (eventSettings.showSuspectedBan && (pointData.isBanStartAnchor || pointData.isBanEndAnchor)) return 8;

    // Make event icon points visible and large if enabled
    if ((eventSettings.showNameChange || eventSettings.showClubChange) && hasVisibleEvent(ctx, 'COMBINED_CHANGE')) return 8;
    if (eventSettings.showNameChange && hasVisibleEvent(ctx, 'NAME_CHANGE')) return 8;
    if (eventSettings.showClubChange && hasVisibleEvent(ctx, 'CLUB_CHANGE')) return 8;

    const rsEvent = getRsEvent(ctx);
    if (eventSettings.showRsAdjustment && rsEvent) return 8;

    // Hide synthetic staircase, gap bridge, and final interpolated points
    if (pointData.isStaircasePoint || pointData.isGapBridge || pointData.isFinalInterpolation) {
      return 0;
    }

    // Hide points for tracking data in the new system (unless interpolated)
    if (pointData.timestamp.getTime() >= NEW_LOGIC_TIMESTAMP_MS && !pointData.scoreChanged) {
      if (!pointData.isInterpolated && !pointData.isExtrapolated) {
        return 0;
      }
    }

    const timeRange = ctx.chart.scales.x.max - ctx.chart.scales.x.min;
    if ((pointData.isInterpolated || pointData.isExtrapolated) && timeRange > TIME.SEVENTY_TWO_HOURS) {
      return 0;
    }

    const direction = getNewLogicPointDirection(ctx);
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
  }, [eventSettings]);

  const externalTooltipHandler = useCallback((context) => {
    const { chart, tooltip } = context;
    const tooltipEl = getOrCreateTooltip(chart);

    // Reset width to auto at the beginning of every render.
    // This allows tooltips to be naturally sized by their content by default.
    tooltipEl.style.width = 'auto';

    // Guard against stale datasetIndex when a dataset is removed. If the tooltip tries
    // to render for a non-existent dataset, hide it and bail to prevent a crash.
    const datasetIndexFromTooltip = tooltip.dataPoints?.[0]?.datasetIndex;
    if (datasetIndexFromTooltip !== undefined && chart.data.datasets[datasetIndexFromTooltip] === undefined) {
      tooltipEl.style.opacity = 0;
      return;
    }

    const pointData = tooltip.dataPoints?.[0]?.raw?.raw;

    if (pointData) {
      // Hide tooltips for certain synthetic points, but always show them for ban/unban event anchors.
      const isBanPoint = eventSettings.showSuspectedBan && (pointData.isBanStartAnchor || pointData.isBanEndAnchor || pointData.isUnexpectedReappearance);
      if (!isBanPoint) {
        const timeRange = chart.scales.x.max - chart.scales.x.min;
        const isHiddenInterpolatedPoint = (pointData.isInterpolated || pointData.isExtrapolated) &&
          timeRange > TIME.SEVENTY_TWO_HOURS;

        const isHiddenTrackingPoint = pointData.timestamp.getTime() >= NEW_LOGIC_TIMESTAMP_MS &&
          !pointData.scoreChanged &&
          !pointData.isInterpolated &&
          !pointData.isExtrapolated;

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
    const hasEventToShow = isBanStart || isBanEnd || isUnexpected;
    const hasScoreContent = !!tooltip.body;

    if (hasScoreContent || hasEventToShow) {
      const titleLines = tooltip.title || [];
      const bodyLines = tooltip.body.map(b => b.lines);
      const datasetIndex = tooltip.dataPoints[0].datasetIndex;
      const dataPoint = tooltip.dataPoints[0].raw.raw;
      const rsEvent = dataPoint.events?.find(e => e.event_type === 'RS_ADJUSTMENT');

      while (tooltipEl.firstChild) {
        tooltipEl.firstChild.remove();
      }

      const tableRoot = document.createElement('table');
      tableRoot.style.margin = '0px';
      tooltipEl.appendChild(tableRoot);

      if (hasScoreContent) {
        const score = parseInt(bodyLines[0][0].split(': ')[1].replace(/[^\d]/g, ''));
        const rank = getRankFromScore(score);
        if (
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
          const playerName = chart.data.datasets[datasetIndex].label.trim();
          const playerText = document.createTextNode(playerName);
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
          const dataIndex = tooltip.dataPoints[0].dataIndex;
          const dataset = chart.data.datasets[datasetIndex].data;

          let previousScore = null;
          for (let i = dataIndex - 1; i >= 0; i--) {
            if (dataset[i].raw.scoreChanged) {
              previousScore = dataset[i].raw.rankScore;
              break;
            }
          }

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
          const dataIndex = tooltip.dataPoints[0].dataIndex;
          const dataset = chart.data.datasets[datasetIndex].data;

          let previousScore = null;
          for (let i = dataIndex - 1; i >= 0; i--) {
            if (dataset[i].raw.scoreChanged) {
              previousScore = dataset[i].raw.rankScore;
              break;
            }
          }

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

      if (eventSettings.showRsAdjustment && rsEvent) {
        const details = rsEvent.details;

        const hrRow = document.createElement('tr');
        const hrCell = document.createElement('td');
        hrCell.colSpan = 2;
        hrCell.innerHTML = '<hr style="border-color: #4b5563; margin: 8px 0;" />';
        hrRow.appendChild(hrCell);
        tableRoot.appendChild(hrRow);

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

      // Suspected Ban Event
      if (isBanStart) {
        if (hasScoreContent || (eventSettings.showRsAdjustment && rsEvent)) {
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
        if (hasScoreContent || (eventSettings.showRsAdjustment && rsEvent) || isBanStart) {
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
        if (hasScoreContent || (eventSettings.showRsAdjustment && rsEvent) || isBanStart || isBanEnd) {
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
  }, [eventSettings]);

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

  const calculateViewWindow = useCallback((data, range, overallMinTimestamp) => {
    if (!data?.length || !TIME.RANGES[range]) return null;

    const now = seasonEndDate || new Date();
    const endTime = new Date(now.getTime() + TIME.HOUR);
    const timeRangeMs = TIME.RANGES[range];

    if (range === 'MAX') {
      const min = overallMinTimestamp || data[0].timestamp;
      return { min, max: endTime };
    }

    const viewMin = new Date(now.getTime() - timeRangeMs);
    return { min: viewMin, max: endTime };
  }, [seasonEndDate]);

  const viewWindow = useMemo(() => calculateViewWindow(data, selectedTimeRange, overallTimeDomain.min), [data, selectedTimeRange, calculateViewWindow, overallTimeDomain.min]);

  const calculateYAxisBounds = useCallback((data, timeRange) => {
    if (!data?.length || !timeRange?.min) return { min: 0, max: 50000, stepSize: 10000 };

    const getVisibleAndNearestData = (dataset) => {
      const visiblePoints = dataset.filter(d =>
        d.timestamp >= timeRange.min &&
        d.timestamp <= timeRange.max
      );

      if (visiblePoints.length === 0) {
        const lastPointBefore = dataset.reduce((nearest, point) => {
          if (point.timestamp < timeRange.min &&
            (!nearest || point.timestamp > nearest.timestamp)) {
            return point;
          }
          return nearest;
        }, null);

        const firstPointAfter = dataset.reduce((nearest, point) => {
          if (point.timestamp > timeRange.max &&
            (!nearest || point.timestamp < nearest.timestamp)) {
            return point;
          }
          return nearest;
        }, null);

        return [lastPointBefore, firstPointAfter].filter(Boolean);
      }

      return visiblePoints;
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

    let minScore, maxScore;

    if (!allVisibleData.length) {
      let lastKnownScore;
      const rangeStart = timeRange.min;

      const allDatasets = [
        chart?.getDatasetMeta(0).visible !== false ? data : [],
        ...Array.from(comparisonData.entries())
          .filter((_, index) => chart?.getDatasetMeta(index + 1).visible !== false)
          .map(([_, { data: compareData }]) => compareData)
      ];

      for (const dataset of allDatasets) {
        for (let i = dataset.length - 1; i >= 0; i--) {
          if (dataset[i].timestamp <= rangeStart) {
            if (lastKnownScore === undefined || dataset[i].rankScore > lastKnownScore) {
              lastKnownScore = dataset[i].rankScore;
            }
            break;
          }
        }
      }

      if (lastKnownScore === undefined) {
        const visibleScores = [
          chart?.getDatasetMeta(0).visible !== false ? data[0]?.rankScore : undefined,
          ...Array.from(comparisonData.entries())
            .filter((_, index) => chart?.getDatasetMeta(index + 1).visible !== false)
            .map(([_, { data: compareData }]) => compareData[0]?.rankScore)
        ].filter(score => score !== undefined);

        lastKnownScore = visibleScores.length > 0 ? Math.max(...visibleScores) : undefined;
      }

      if (lastKnownScore === undefined) {
        return { min: 0, max: 50000, stepSize: 10000 };
      }

      minScore = lastKnownScore;
      maxScore = lastKnownScore;
    } else {
      minScore = Math.min(...allVisibleData.map(d => d.rankScore));
      maxScore = Math.max(...allVisibleData.map(d => d.rankScore));
    }

    if (minScore === maxScore) {
      const buffer = Math.max(20, Math.round(minScore * 0.02) || 500);
      minScore -= buffer;
      maxScore += buffer;
    }

    const range = maxScore - minScore;
    const padding = Math.max(range * 0.1, 20);
    const paddedMin = Math.max(0, minScore - padding);
    const paddedMax = maxScore + padding;
    const paddedRange = paddedMax - paddedMin;

    if (paddedRange <= 0) {
      const stepSize = Math.round(paddedMax * 0.1) || 100;
      const newMin = Math.max(0, Math.floor((paddedMin - stepSize) / stepSize) * stepSize);
      const newMax = Math.ceil((paddedMax + stepSize) / stepSize) * stepSize;
      return { min: newMin, max: newMax || stepSize, stepSize };
    }

    const targetTicks = 8;
    const roughStep = paddedRange / targetTicks;

    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const residual = roughStep / magnitude;

    let stepSize;
    if (residual > 5) {
      stepSize = 10 * magnitude;
    } else if (residual > 2.5) {
      stepSize = 5 * magnitude;
    } else if (residual > 1) {
      stepSize = 2 * magnitude;
    } else {
      stepSize = magnitude;
    }

    const newMin = Math.floor(paddedMin / stepSize) * stepSize;
    const newMax = Math.ceil(paddedMax / stepSize) * stepSize;

    if (newMin === newMax) {
      return { min: newMin - stepSize, max: newMax + stepSize, stepSize };
    }

    return { min: newMin, max: newMax, stepSize };
  }, [comparisonData, chartRef]);

  const getEventAnnotations = useCallback(() => {
    const annotations = [];

    const processPlayerDataset = (playerData, playerEvents, _playerName, datasetIndex) => {
      if (!playerData) return;

      // Handle point-based events (name/club changes)
      playerData.forEach(point => {
        if (point.isInterpolated || point.isExtrapolated || point.isStaircasePoint || point.isGapBridge || !point.events) {
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
              yValue: point.rankScore,
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
  }, [data, events, comparisonData, embarkId, eventSettings]);

  const getRankAnnotations = useCallback(() => {
    if (!data) return [];

    // Create annotations for ALL ranks and ruby line, but control their visibility dynamically.
    // This makes the returned array stable, preventing the plugin from resetting.
    const annotations = RANKS
      .map(rank => ({
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
      }));

      const seasonConfig = Object.values(SEASONS).find(s => s.id === seasonId);

      if (seasonConfig && seasonConfig.hasRuby && typeof rubyCutoff === 'number') {
          annotations.push({
              type: 'line',
              drawTime: 'beforeDatasetsDraw',
              id: 'rank-line-ruby',
              yMin: rubyCutoff,
              yMax: rubyCutoff,
              borderColor: '#dc2626',
              borderWidth: 1.5,
              borderDash: [2, 2],
              // Also control the Ruby line's visibility dynamically.
              display: (ctx) => {
                const yAxis = ctx.chart.scales.y;
                return rubyCutoff >= yAxis.min && rubyCutoff <= yAxis.max;
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

      return annotations;
  }, [data, seasonId, rubyCutoff]);

  const chartOptions = useMemo(() => {
    if (!data) return null;

    const { min: overallMin, max: overallMax } = overallTimeDomain;

    // The 'viewWindow' from props is our starting point (e.g., last 7 days from button).
    // The 'manualViewWindow' is the state updated by user zoom/pan.
    // We decide which one is currently active.
    const activeViewWindow = isManuallyZoomed && manualViewWindow ? manualViewWindow : viewWindow;

    const { min: initialMinY, max: initialMaxY, stepSize: initialStepSize } = calculateYAxisBounds(data, activeViewWindow);
    const rankAnnotations = getRankAnnotations();
    const eventAnnotations = getEventAnnotations();

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
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
            maxRotation: 69,
            minRotation: 69,
            autoSkip: true,
            maxTicksLimit: 20,
            padding: 4,
            align: 'end',
            callback: function (value) {
              const date = new Date(value);
              return date.toLocaleString(undefined, TIME.FORMAT);
            }
          },
          min: activeViewWindow?.min,
          max: activeViewWindow?.max
        },
        y: {
          min: initialMinY,
          max: initialMaxY,
          grid: { color: '#2a3042' },
          ticks: {
            color: '#cecfd3',
            callback: value => Math.round(value).toLocaleString(),
            stepSize: initialStepSize,
            maxTicksLimit: 15,
          },
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
            onPan: (ctx) => {
              setManualViewWindow({ min: ctx.chart.scales.x.min, max: ctx.chart.scales.x.max });
            },
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
            onZoom: (ctx) => {
              setManualViewWindow({ min: ctx.chart.scales.x.min, max: ctx.chart.scales.x.max });
            },
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
    getRankAnnotations, 
    getEventAnnotations, 
    externalTooltipHandler, 
    overallTimeDomain,
    onZoomOrPan,
    setSelectedTimeRange
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
    }
    const direction = getNewLogicPointDirection(ctx);
    return (direction === 'up' || direction === 'down') ? 'triangle' : 'circle';
  }, [eventSettings]);

  const getPointRotation = useCallback((ctx) => {

    const pointData = ctx.raw?.raw;
    // Events with custom directional icons (name, club, RS adjustment) should not be rotated.
    if ((eventSettings.showNameChange && hasVisibleEvent(ctx, 'NAME_CHANGE')) ||
        (eventSettings.showClubChange && hasVisibleEvent(ctx, 'CLUB_CHANGE')) ||
        (hasVisibleEvent(ctx, 'COMBINED_CHANGE')) ||
        (eventSettings.showSuspectedBan && (pointData?.isUnexpectedReappearance || pointData?.isBanStartAnchor || pointData?.isBanEndAnchor)) ||
        (eventSettings.showRsAdjustment && getRsEvent(ctx))) {
      return 0;
    }

    // For regular score change points (which use a triangle), rotate it if the score went down.
    const direction = getNewLogicPointDirection(ctx);
    return direction === 'down' ? 180 : 0;
  }, [eventSettings]);

  const getPointBackgroundColor = useCallback((ctx, color) => {
    if (ctx.raw.raw?.isExtrapolated || ctx.raw.raw?.isInterpolated) return '#7d7c7b';
    const direction = getNewLogicPointDirection(ctx);
    if (direction === 'up') return '#10B981';
    if (direction === 'down') return '#EF4444';
    return color;
  }, []);

  const getPointBorderColor = useCallback((ctx, color) => {
    if (ctx.raw.raw?.isExtrapolated || ctx.raw.raw?.isInterpolated) return '#8a8988';
    const direction = getNewLogicPointDirection(ctx);
    if (direction === 'up' || direction === 'down') return '#FAF9F6';
    return color;
  }, []);

  const chartData = useMemo(() => data ? {
    labels: data.map(d => d.timestamp),
    datasets: [{
      label: ` ${embarkId}`,
      data: data.map(d => ({
        x: d.timestamp,
        y: d.rankScore,
        raw: d
      })),
      segment: {
        borderColor: (ctx) => getBorderColor(ctx, '#FAF9F6', eventSettings),
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
    ...Array.from(comparisonData.entries()).map(([compareId, { data: compareData, color }]) => ({
      label: ` ${compareId}`,
      data: compareData.map(d => ({
        x: d.timestamp,
        y: d.rankScore,
        raw: d
      })),
      segment: {
        borderColor: (ctx) => getBorderColor(ctx, color, eventSettings),
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
  } : null, [data, embarkId, comparisonData, eventSettings, getPointRadius, getPointStyle, getPointRotation, getPointBackgroundColor, getPointBorderColor]);

  return { chartOptions, chartData };
};