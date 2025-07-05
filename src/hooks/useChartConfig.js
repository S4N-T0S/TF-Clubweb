import { useMemo, useCallback } from 'react';
import { Chart as ChartJS } from 'chart.js';
import { SEASONS } from '../services/historicalDataService';

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

const NEW_LOGIC_TIMESTAMP_S = 1750436334;
const NEW_LOGIC_TIMESTAMP_MS = NEW_LOGIC_TIMESTAMP_S * 1000;

// Create Image objects for custom point styles
const nameChangeIcon = new Image(16, 16);
nameChangeIcon.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>');

const clubChangeIcon = new Image(16, 16);
clubChangeIcon.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>');

/**
 * Helper to safely get an RS_ADJUSTMENT event from a point context.
 * @param {import('chart.js').ScriptableContext<'line'>} ctx The chart context.
 * @returns {object | null} The event object or null.
 */
const getRsEvent = (ctx) => {
    const pointData = ctx.raw?.raw;
    if (pointData?.events && !pointData.isInterpolated && !pointData.isExtrapolated) {
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
 * Helper to check for multiple event types on a non-synthetic point.
 * @param {import('chart.js').ScriptableContext<'line'>} ctx The chart context.
 * @param {string[]} eventTypes Array of event types to check for.
 * @returns {boolean} True if the point has any of the specified events.
 */
const hasAnyVisibleEvent = (ctx, eventTypes) => {
    const pointData = ctx.raw?.raw;
    if (!pointData || pointData.isInterpolated || pointData.isExtrapolated || pointData.isStaircasePoint || pointData.isGapBridge) {
        return false;
    }
    if (!pointData.events) return false;
    return pointData.events.some(e => eventTypes.includes(e.event_type));
};

/**
 * Determines the direction of score change for a new-logic data point.
 * @param {import('chart.js').ScriptableContext<'line'>} ctx The chart context.
 * @returns {'up' | 'down' | 'same' | 'first' | null}
 */
const getNewLogicPointDirection = (ctx) => {
  // The chart context might not be fully available on the first pass
  if (!ctx.chart?.data?.datasets || !ctx.raw?.raw) {
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
    opacity: 1,
    pointerEvents: 'none',
    position: 'absolute',
    transform: 'translate(-50%, -100%)',
    transition: 'all 0.15s ease-out',
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

const getBorderColor = (ctx, defaultColor = '#FAF9F6') => {
    if (!ctx.p0?.raw?.raw || !ctx.p1?.raw?.raw) return defaultColor;
    
    const p0 = ctx.p0.raw.raw;
    const p1 = ctx.p1.raw.raw;

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

const getBorderDash = (ctx) => {
    if (!ctx.p0?.raw?.raw) return undefined;
    const p0 = ctx.p0.raw.raw;
    const p1 = ctx.p1?.raw?.raw;

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
  chartRef,
  onZoomPan,
  showEvents,
  seasonId,
}) => {

  const seasonConfig = useMemo(() => Object.values(SEASONS).find(s => s.id === seasonId), [seasonId]);
  const seasonEndDate = useMemo(() => seasonConfig?.endTimestamp ? new Date(seasonConfig.endTimestamp * 1000) : null, [seasonConfig]);

  const getPointRadius = useCallback((ctx) => {
    const pointData = ctx.raw?.raw;
    if (!ctx.chart || !pointData) return 3;

    // Make event icon points visible and large
    if (showEvents && hasAnyVisibleEvent(ctx, ['NAME_CHANGE', 'CLUB_CHANGE'])) {
        return 10;
    }

    const rsEvent = getRsEvent(ctx);
    if (showEvents && rsEvent) return 6; // Bigger radius for star

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
      return initialSize - (initialSize * 2/3);
    } else {
      const zoomRatio = (timeRange - TIME.DAY) / (TIME.WEEK - TIME.DAY);
      return initialSize - ((initialSize * 2/3) * zoomRatio);
    }
  }, [showEvents]);

  const externalTooltipHandler = useCallback((context) => {
    const { chart, tooltip } = context;

    if (tooltip.dataPoints?.[0]?.raw?.raw) {
      const pointData = tooltip.dataPoints[0].raw.raw;
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
        const tooltipEl = chart.canvas.parentNode.querySelector('div.rank-tooltip');
        if (tooltipEl) tooltipEl.style.opacity = 0;
        return;
      }
    }

    const tooltipEl = getOrCreateTooltip(chart);
  
    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = 0;
      return;
    }
  
    if (tooltip.body) {
      const titleLines = tooltip.title || [];
      const bodyLines = tooltip.body.map(b => b.lines);
      const score = parseInt(bodyLines[0][0].split(': ')[1].replace(/[^\d]/g, ''));
      const rank = getRankFromScore(score);
      const datasetIndex = tooltip.dataPoints[0].datasetIndex;
      const dataPoint = tooltip.dataPoints[0].raw.raw;
      const rsEvent = dataPoint.events?.find(e => e.event_type === 'RS_ADJUSTMENT');
        
      while (tooltipEl.firstChild) {
        tooltipEl.firstChild.remove();
      }

      const tableRoot = document.createElement('table');
      tableRoot.style.margin = '0px';
      tooltipEl.appendChild(tableRoot);

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

      if (rsEvent) {
        const details = rsEvent.details;
        
        const hrRow = document.createElement('tr');
        const hrCell = document.createElement('td');
        hrCell.colSpan = 2;
        hrCell.innerHTML = '<hr style="border-color: #4b5563; margin: 8px 0;" />';
        hrRow.appendChild(hrCell);
        tableRoot.appendChild(hrRow);
        
        const eventTitleRow = document.createElement('tr');
        eventTitleRow.innerHTML = '<td colspan="2" style="font-weight: bold; font-size: 13px; color: #facc15; padding-bottom: 4px;">RS Adjustment</td>';
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
  
    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
  
    tooltipEl.style.opacity = 1;
    tooltipEl.style.left = positionX + tooltip.caretX + 'px';
    tooltipEl.style.top = positionY + tooltip.caretY + 'px';
    tooltipEl.style.font = tooltip.options.bodyFont.string;
    tooltipEl.style.boxShadow = '0 2px 12px 0 rgba(0,0,0,0.4)';
  }, []);

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
    if (!data?.length) return null;
  
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

  const calculateYAxisStepSize = useCallback((min, max) => {
    const range = max - min || 1;
    const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    const targetTicks = 5;
    
    const fallbackStep = Math.ceil(range / targetTicks);
    return niceSteps.find(step => {
      const numTicks = range / step;
      return numTicks >= targetTicks && numTicks <= targetTicks * 2;
    }) || fallbackStep;
  }, []);

  const getDynamicYAxisDomain = useCallback((data, timeWindow, customTimeRange = null) => {
    if (!data?.length) return [0, 50000];
    
    const getVisibleAndNearestData = (dataset) => {
      if (customTimeRange) {
        const visiblePoints = dataset.filter(d => 
          d.timestamp >= customTimeRange.min && 
          d.timestamp <= customTimeRange.max
        );
  
        if (visiblePoints.length === 0) {
          const lastPointBefore = dataset.reduce((nearest, point) => {
            if (point.timestamp < customTimeRange.min && 
                (!nearest || point.timestamp > nearest.timestamp)) {
              return point;
            }
            return nearest;
          }, null);
  
          const firstPointAfter = dataset.reduce((nearest, point) => {
            if (point.timestamp > customTimeRange.max && 
                (!nearest || point.timestamp < nearest.timestamp)) {
              return point;
            }
            return nearest;
          }, null);
  
          return [lastPointBefore, firstPointAfter].filter(Boolean);
        }
  
        return visiblePoints;
      } else {
        const now = new Date();
        const windowStart = new Date(now - TIME.RANGES[timeWindow]);
        return timeWindow === 'MAX' 
          ? dataset 
          : dataset.filter(d => d.timestamp >= windowStart);
      }
    };
  
    const chart = chartRef.current;
    
    let visibleData = [];
    if (!chart || chart.getDatasetMeta(0).visible !== false) {
      visibleData = getVisibleAndNearestData(data);
    }
    
    const comparisonVisibleData = Array.from(comparisonData.entries())
      // eslint-disable-next-line no-unused-vars
      .map(([_, { data: compareData }], index) => {
        if (!chart || chart.getDatasetMeta(index + 1).visible !== false) {
          return getVisibleAndNearestData(compareData);
        }
        return [];
      })
      .flat();
    
    const allVisibleData = [...visibleData, ...comparisonVisibleData];
    
    if (!allVisibleData.length) {
      let lastKnownScore;
      const rangeStart = customTimeRange?.min || 
        (timeWindow === 'MAX' ? data[0].timestamp : new Date(new Date() - TIME.RANGES[timeWindow]));
      
      const allDatasets = [
        chart?.getDatasetMeta(0).visible !== false ? data : [],
        ...Array.from(comparisonData.entries())
          .filter((_, index) => chart?.getDatasetMeta(index + 1).visible !== false)
          // eslint-disable-next-line no-unused-vars
          .map(([_, { data: compareData }]) => compareData)
      ];
  
      for (const dataset of allDatasets) {
        for (let i = dataset.length - 1; i >= 0; i--) {
          if (dataset[i].timestamp <= rangeStart) {
            if (!lastKnownScore || dataset[i].rankScore > lastKnownScore) {
              lastKnownScore = dataset[i].rankScore;
            }
            break;
          }
        }
      }
      
      if (lastKnownScore === undefined) {
        const visibleScores = [
          chart?.getDatasetMeta(0).visible !== false ? data[0].rankScore : -Infinity,
          ...Array.from(comparisonData.entries())
            .filter((_, index) => chart?.getDatasetMeta(index + 1).visible !== false)
            // eslint-disable-next-line no-unused-vars
            .map(([_, { data: compareData }]) => compareData[0].rankScore)
        ].filter(score => score !== -Infinity);
  
        lastKnownScore = Math.max(...visibleScores);
      }
  
      const buffer = Math.round(lastKnownScore * 0.1);
      return [
        Math.max(0, lastKnownScore - buffer),
        lastKnownScore + buffer
      ];
    }
    
    const minScore = Math.min(...allVisibleData.map(d => d.rankScore));
    const maxScore = Math.max(...allVisibleData.map(d => d.rankScore));
    
    if (minScore === maxScore || (maxScore - minScore) < 10) {
      const buffer = Math.max(10, Math.round(minScore * 0.01));
      return [
        Math.max(0, minScore - buffer),
        maxScore + buffer
      ];
    }
    
    const padding = Math.round((maxScore - minScore) * 0.10);
    return [Math.max(0, minScore - padding), maxScore + padding];
  }, [comparisonData, chartRef]);

  const getEventAnnotations = useCallback((viewWindow, yDomain) => {
    if (!showEvents || !viewWindow || !yDomain) return [];
    const annotations = [];

    const processPlayerDataset = (playerData, playerEvents, playerName) => {
        if (!playerData) return;

        // Handle point-based events by iterating through the data points
        playerData.forEach(point => {
            if (point.isInterpolated || point.isExtrapolated || point.isStaircasePoint || point.isGapBridge || !point.events) {
                return;
            }

            point.events.forEach(event => {
                if (event.event_type === 'NAME_CHANGE' || event.event_type === 'CLUB_CHANGE') {
                    let labelContent = [];
                    if (event.event_type === 'NAME_CHANGE') {
                         labelContent = [`Name Change:`, `${event.details.old_name} → ${event.details.new_name}`];
                    } else { // CLUB_CHANGE
                        const oldClub = event.details.old_club ? `[${event.details.old_club}]` : 'No Club';
                        const newClub = event.details.new_club ? `[${event.details.new_club}]` : 'No Club';
                        labelContent = ['Club Change:', `${oldClub} → ${newClub}`];
                    }

                    annotations.push({
                        type: 'label',
                        id: `label-point-event-${event.event_id}`, // Unique ID from event
                        xValue: point.timestamp,
                        yValue: point.rankScore,
                        content: labelContent,
                        font: { size: 11 },
                        color: event.event_type === 'NAME_CHANGE' ? "#818cf8" : '#2dd4bf',
                        backgroundColor: 'rgba(30, 41, 59, 0.85)',
                        yAdjust: 25,
                        padding: 6,
                        borderRadius: 4,
                    });
                }
            });
        });

        // Handle time-range based events by iterating through the event list
        if (playerEvents) {
            playerEvents.forEach(event => {
                if (event.event_type === 'SUSPECTED_BAN') {
                    const eventTimestamp = event.start_timestamp * 1000;
                    const xMax = event.end_timestamp ? event.end_timestamp * 1000 : viewWindow.max;
                    annotations.push({
                        id: `sb-event-${event.event_id}`,
                        type: 'box',
                        xMin: eventTimestamp,
                        xMax: xMax,
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        borderColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 1,
                        label: {
                            content: `Suspected Ban (${playerName})`,
                            display: true,
                            position: 'start',
                            color: 'rgba(255, 150, 150, 0.9)',
                            font: { size: 12, weight: 'bold' },
                        }
                    });
                }
            });
        }
    };
    
    // Process for main player
    processPlayerDataset(data, events, embarkId);

    // Process for comparison players
    comparisonData.forEach((compare, id) => {
        processPlayerDataset(compare.data, compare.events, id);
    });

    return annotations;
  }, [data, events, comparisonData, embarkId, showEvents]);

  const getRankAnnotations = useCallback((customTimeRange = null) => {
    if (!data) return [];
    
    const [minDomain, maxDomain] = getDynamicYAxisDomain(
      data,
      selectedTimeRange,
      customTimeRange
    );
    
    return RANKS
      .filter(rank => rank.y >= minDomain && rank.y <= maxDomain)
      .map(rank => ({
        type: 'line',
        yMin: rank.y,
        yMax: rank.y,
        borderColor: rank.color,
        borderWidth: 1.5,
        borderDash: [2, 2],
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
  }, [data, getDynamicYAxisDomain, selectedTimeRange]);

  const updateDynamicAxes = useCallback((chart) => {
    if (!chart || !data) return;

    const timeRange = {
      min: chart.scales.x.min,
      max: chart.scales.x.max
    };

    const tooltipEl = chart.canvas.parentNode.querySelector('div.rank-tooltip');
    if (tooltipEl) {
      const currentTimeRange = timeRange.max - timeRange.min;
      if (currentTimeRange > TIME.SEVENTY_TWO_HOURS) {
        tooltipEl.style.opacity = 0;
      }
    }

    const [newMin, newMax] = getDynamicYAxisDomain(
      data,
      selectedTimeRange,
      timeRange
    );
    
    chart.options.scales.y.min = newMin;
    chart.options.scales.y.max = newMax;
    
    chart.options.scales.y.ticks.stepSize = calculateYAxisStepSize(newMin, newMax);
    
    const rankAnnotations = getRankAnnotations(timeRange);
    const eventAnnotations = getEventAnnotations(timeRange, { min: newMin, max: newMax });
    chart.options.plugins.annotation.annotations = [...rankAnnotations, ...eventAnnotations];

  }, [data, selectedTimeRange, getDynamicYAxisDomain, calculateYAxisStepSize, getRankAnnotations, getEventAnnotations]);

  const chartOptions = useMemo(() => {
    if (!data) return null;

    const { min: overallMin, max: overallMax } = overallTimeDomain;

    const [initialMinY, initialMaxY] = getDynamicYAxisDomain(data, selectedTimeRange);
    const yDomain = { min: initialMinY, max: initialMaxY };
    const rankAnnotations = getRankAnnotations(null);
    const eventAnnotations = getEventAnnotations(viewWindow, yDomain);

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
            callback: function(value) {
              const date = new Date(value);
              return date.toLocaleDateString(undefined, TIME.FORMAT);
            }
          },
          min: viewWindow?.min,
          max: viewWindow?.max
        },
        y: {
          min: initialMinY,
          max: initialMaxY,
          grid: { color: '#2a3042' },
          ticks: {
            color: '#cecfd3',
            callback: value => Math.round(value).toLocaleString(),
            stepSize: calculateYAxisStepSize(initialMinY, initialMaxY),
            maxTicksLimit: 15,
          },
        }
      },
      plugins: {
        zoom: {
          limits: {
            x: {
              min: overallMin ? new Date(overallMin.getTime() - TIME.TWO_HOURS) : undefined,
              max: overallMax ? new Date(overallMax.getTime() + TIME.TWO_HOURS) : undefined,
              minRange: 5 * TIME.HOUR
            }
          },
          pan: {
            enabled: true,
            mode: 'x',
            modifierKey: null,
            onPanStart: onZoomPan,
            onPan: (ctx) => updateDynamicAxes(ctx.chart)
          },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x',
            onZoomStart: onZoomPan,
            onZoom: (ctx) => updateDynamicAxes(ctx.chart),
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
            ChartJS.defaults.plugins.legend.onClick(evt, item, legend);
            setTimeout(() => {
              updateDynamicAxes(legend.chart);
              legend.chart.update();
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
  }, [data, viewWindow, getDynamicYAxisDomain, getRankAnnotations, getEventAnnotations, selectedTimeRange, externalTooltipHandler, calculateYAxisStepSize, updateDynamicAxes, onZoomPan, overallTimeDomain]);

  const getPointStyle = useCallback((ctx) => {
    if (showEvents) {
      if (hasVisibleEvent(ctx, 'NAME_CHANGE')) return nameChangeIcon;
      if (hasVisibleEvent(ctx, 'CLUB_CHANGE')) return clubChangeIcon;
      const rsEvent = getRsEvent(ctx);
      if (rsEvent) return 'star';
    }
    const direction = getNewLogicPointDirection(ctx);
    return (direction === 'up' || direction === 'down') ? 'triangle' : 'circle';
  }, [showEvents]);

  const getPointRotation = useCallback((ctx) => {
    if (showEvents && (hasVisibleEvent(ctx, 'NAME_CHANGE') || hasVisibleEvent(ctx, 'CLUB_CHANGE'))) {
      return 0;
    }
    const direction = getNewLogicPointDirection(ctx);
    return direction === 'down' ? 180 : 0;
  }, [showEvents]);

  const getPointBackgroundColor = useCallback((ctx, color) => {
    if (showEvents) {
      const rsEvent = getRsEvent(ctx);
      if (rsEvent) return '#facc15';
    }
    if (ctx.raw.raw?.isExtrapolated || ctx.raw.raw?.isInterpolated) return '#7d7c7b';
    const direction = getNewLogicPointDirection(ctx);
    if (direction === 'up') return '#10B981';
    if (direction === 'down') return '#EF4444';
    return color;
  }, [showEvents]);

  const getPointBorderColor = useCallback((ctx, color) => {
    if (showEvents) {
      const rsEvent = getRsEvent(ctx);
      if (rsEvent) return '#facc15';
    }
    if (ctx.raw.raw?.isExtrapolated || ctx.raw.raw?.isInterpolated) return '#8a8988';
    const direction = getNewLogicPointDirection(ctx);
    if (direction === 'up' || direction === 'down') return '#FAF9F6';
    return color;
  }, [showEvents]);

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
        borderColor: (ctx) => getBorderColor(ctx, '#FAF9F6'),
        borderWidth: 2,
        borderDash: getBorderDash,
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
        borderColor: (ctx) => getBorderColor(ctx, color),
        borderWidth: 2,
        borderDash: getBorderDash,
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
  } : null, [data, embarkId, comparisonData, getPointRadius, getPointStyle, getPointRotation, getPointBackgroundColor, getPointBorderColor]);

  return { chartOptions, chartData };
};