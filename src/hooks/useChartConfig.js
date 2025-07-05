import { useMemo, useCallback } from 'react';
import { Chart as ChartJS } from 'chart.js';

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


export const useChartConfig = ({
  data,
  comparisonData,
  embarkId,
  selectedTimeRange,
  chartRef,
  onZoomPan,
}) => {

  const getPointRadius = useCallback((ctx) => {
    if (!ctx.chart) return 3;
    const timeRange = ctx.chart.scales.x.max - ctx.chart.scales.x.min;
    if ((ctx.raw?.raw?.isInterpolated || ctx.raw?.raw?.isExtrapolated) && timeRange > TIME.SEVENTY_TWO_HOURS) {
      return 0;
    }
    const initialSize = (ctx.raw?.raw?.isInterpolated || ctx.raw?.raw?.isExtrapolated) ? 2.6 : 3;
    if (timeRange <= TIME.DAY) {
      return initialSize;
    } else if (timeRange >= TIME.WEEK) {
      return initialSize - (initialSize * 2/3);
    } else {
      const zoomRatio = (timeRange - TIME.DAY) / (TIME.WEEK - TIME.DAY);
      return initialSize - ((initialSize * 2/3) * zoomRatio);
    }
  }, []);

  const externalTooltipHandler = useCallback((context) => {
    const { chart, tooltip } = context;

    if (tooltip.dataPoints?.[0]?.raw?.raw) {
      const timeRange = chart.scales.x.max - chart.scales.x.min;
      const isHiddenPoint = (tooltip.dataPoints[0].raw.raw.isInterpolated || 
                            tooltip.dataPoints[0].raw.raw.isExtrapolated) && 
                            timeRange > TIME.SEVENTY_TWO_HOURS;
      
      if (isHiddenPoint) {
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
      
      if (!dataPoint.isInterpolated && !dataPoint.isExtrapolated) {
        const dataIndex = tooltip.dataPoints[0].dataIndex;
        const dataset = chart.data.datasets[datasetIndex].data.map(d => d.raw);
        
        if (dataIndex > 0) {
          const previousScore = dataset[dataIndex - 1].rankScore;
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
      
      if (!dataPoint.isInterpolated && !dataPoint.isExtrapolated) {
        const dataIndex = tooltip.dataPoints[0].dataIndex;
        const dataset = chart.data.datasets[datasetIndex].data.map(d => d.raw);
        
        if (dataIndex > 0) {
          const previousScore = dataset[dataIndex - 1].rankScore;
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
  
    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
  
    tooltipEl.style.opacity = 1;
    tooltipEl.style.left = positionX + tooltip.caretX + 'px';
    tooltipEl.style.top = positionY + tooltip.caretY + 'px';
    tooltipEl.style.font = tooltip.options.bodyFont.string;
    tooltipEl.style.boxShadow = '0 2px 12px 0 rgba(0,0,0,0.4)';
  }, []);

  const calculateViewWindow = useCallback((data, range) => {
    if (!data?.length) return null;
  
    const now = new Date();
    const endTime = new Date(now + TIME.TWO_HOURS);
    const timeRangeMs = TIME.RANGES[range];
    
    if (range === 'MAX') {
      return { min: data[0].timestamp, max: endTime };
    }
    
    const viewMin = new Date(now - timeRangeMs);
    return { min: viewMin, max: endTime };
  }, []);

  const viewWindow = useMemo(() => calculateViewWindow(data, selectedTimeRange), [data, selectedTimeRange, calculateViewWindow]);

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
    
    chart.options.plugins.annotation.annotations = getRankAnnotations(timeRange);

  }, [data, selectedTimeRange, getDynamicYAxisDomain, calculateYAxisStepSize, getRankAnnotations]);

  const chartOptions = useMemo(() => {
    if (!data) return null;

    const [initialMinY, initialMaxY] = getDynamicYAxisDomain(data, selectedTimeRange);

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
              min: new Date(data[0].timestamp - TIME.TWO_HOURS),
              max: new Date(data[data.length - 1].timestamp + TIME.TWO_HOURS),
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
          annotations: getRankAnnotations()
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
  }, [data, viewWindow, getDynamicYAxisDomain, getRankAnnotations, selectedTimeRange, externalTooltipHandler, calculateYAxisStepSize, updateDynamicAxes, onZoomPan]);

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
        borderColor: ctx => {
          if (!ctx.p0?.raw || !ctx.p1?.raw) return '#FAF9F6';
          if (ctx.p0.raw.isExtrapolated || ctx.p1.raw.isExtrapolated) return '#FAF9F6';
          if (ctx.p0.raw.isInterpolated || ctx.p1.raw.isInterpolated) return '#FAF9F6';
          const curr = ctx.p0.parsed.y;
          const next = ctx.p1.parsed.y;
          return next > curr ? '#10B981' : next < curr ? '#EF4444' : '#FAF9F6';
        },
        borderWidth: 2, // this function is currently a placeholder in case needed in future (if updated check comparedata borderwidth too)
        borderDash: ctx => {
          if (!ctx.p0?.raw.raw || !ctx.p1?.raw.raw) return undefined;
          return (ctx.p0.raw.raw.isExtrapolated || ctx.p1.raw.raw.isExtrapolated) ? [5, 5] : undefined;
        }
      },
      pointBackgroundColor: ctx => {
        if (ctx.raw.raw?.isExtrapolated) return '#7d7c7b';
        if (ctx.raw.raw?.isInterpolated) return '#7d7c7b';
        return '#FAF9F6';
      },
      pointBorderColor: ctx => {
        if (ctx.raw.raw?.isExtrapolated) return '#8a8988';
        if (ctx.raw.raw?.isInterpolated) return '#8a8988';
        return '#FAF9F6';
      },
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
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: color,
      pointBorderColor: color,
      pointRadius: getPointRadius,
      pointHoverRadius: ctx => getPointRadius(ctx) * 1.5,
      borderWidth: 2, // if updated, check segment function above
      tension: 0.01
    }))]
  } : null, [data, embarkId, comparisonData, getPointRadius]);

  return { chartOptions, chartData };
};