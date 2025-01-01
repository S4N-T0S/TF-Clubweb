import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';
import { fetchPlayerGraphData } from '../services/gp-api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  annotationPlugin,
  zoomPlugin
);

// Move constants outside component to prevent recreation on each render
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

const getRankFromScore = (score) => {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (score >= RANKS[i].y) {
      return RANKS[i];
    }
  }
  return RANKS[0];
};

const getOrCreateTooltip = (chart) => {
  let tooltipEl = chart.canvas.parentNode.querySelector('div.rank-tooltip');

  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'rank-tooltip';
    tooltipEl.style.background = '#1f2937';
    tooltipEl.style.borderRadius = '3px';
    tooltipEl.style.color = '#FAF9F6';
    tooltipEl.style.opacity = 1;
    tooltipEl.style.pointerEvents = 'none';
    tooltipEl.style.position = 'absolute';
    tooltipEl.style.transform = 'translate(-50%, 0)';
    tooltipEl.style.transition = 'all .1s ease';
    tooltipEl.style.padding = '12px';

    const table = document.createElement('table');
    table.style.margin = '0px';

    tooltipEl.appendChild(table);
    chart.canvas.parentNode.appendChild(tooltipEl);
  }

  return tooltipEl;
};

const TIME_RANGES = {
  '24H': 24 * 60 * 60 * 1000,
  '7D': 7 * 24 * 60 * 60 * 1000,
  'MAX': Infinity
};

// Constants for time intervals
const MINUTES_15 = 15 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const TWO_HOURS = 2 * 60 * 60 * 1000;

const PlayerGraphModal = ({ isOpen, onClose, playerId }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24H');
  const [viewWindow, setViewWindow] = useState(null);
  const modalRef = useRef(null);
  const chartRef = useRef(null);
  const dataCache = useRef(null);

  // Reset state when modal is opened with new player
  useEffect(() => {
    if (isOpen) {
      setSelectedTimeRange('24H');
      if (dataCache.current?.playerId !== playerId) {
        dataCache.current = null;
        setData(null);
        setError(null);
        setViewWindow(null);
      }
    }
  }, [isOpen, playerId]);

  const externalTooltipHandler = useCallback((context) => {
    const { chart, tooltip } = context;
    const tooltipEl = getOrCreateTooltip(chart);

    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = 0;
      return;
    }

    // Set Text
    if (tooltip.body) {
      const titleLines = tooltip.title || [];
      const bodyLines = tooltip.body.map(b => b.lines);
      const score = parseInt(bodyLines[0][0].split(': ')[1].replace(/,/g, ''));
      const rank = getRankFromScore(score);

      const tableRoot = tooltipEl.querySelector('table');

      // Clear previous tooltip content
      while (tableRoot.firstChild) {
        tableRoot.firstChild.remove();
      }

      // Add title
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

      // Add score with hexagon
      const scoreRow = document.createElement('tr');
      scoreRow.style.borderWidth = 0;
      const scoreCell = document.createElement('td');
      scoreCell.style.borderWidth = 0;
      scoreCell.style.fontSize = '14px';
      scoreCell.style.fontWeight = 'bold';
      scoreCell.style.paddingTop = '4px';
      
      // Create hexagon SVG
      const hexagonSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      hexagonSvg.setAttribute('viewBox', '0 0 24 24');
      hexagonSvg.style.width = '14px';
      hexagonSvg.style.height = '14px';
      hexagonSvg.style.display = 'inline-block';
      hexagonSvg.style.verticalAlign = 'middle';
      hexagonSvg.style.marginRight = '8px';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M12 2L22 8.5V15.5L12 22L2 15.5V8.5L12 2Z');
      path.setAttribute('fill', rank.color);

      scoreCell.appendChild(document.createTextNode(`Score: ${score.toLocaleString()}`));
      scoreRow.appendChild(scoreCell);
      tableRoot.appendChild(scoreRow);

      // Add rank
      const rankRow = document.createElement('tr');
      rankRow.style.borderWidth = 0;
      const rankCell = document.createElement('td');
      rankCell.style.borderWidth = 0;
      rankCell.style.fontSize = '14px';
      rankCell.style.fontWeight = 'bold';
      rankCell.style.paddingTop = '4px';
      rankCell.style.position = 'relative'; // Ensure parent container is relative
          
      const rankText = document.createTextNode(`Rank: ${rank.label}`);
      hexagonSvg.appendChild(path);
          
      // Adjust hexagonSvg to be at the bottom-right of the tooltip box
      hexagonSvg.style.position = 'absolute';
      hexagonSvg.style.bottom = '4';
      hexagonSvg.style.right = '0';
          
      rankCell.appendChild(rankText);
      rankCell.appendChild(hexagonSvg);
      rankRow.appendChild(rankCell);
      tableRoot.appendChild(rankRow);
    }

    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;

    // Display, position, and set styles for tooltip
    tooltipEl.style.opacity = 1;
    tooltipEl.style.left = positionX + tooltip.caretX + 'px';
    tooltipEl.style.top = positionY + tooltip.caretY + 'px';
    tooltipEl.style.font = tooltip.options.bodyFont.string;
    tooltipEl.style.boxShadow = '0 2px 12px 0 rgba(0,0,0,0.4)';
  }, []);

  const calculateViewWindow = useCallback((data, range) => {
    if (!data?.length) return null;

    const now = new Date();
    const endTime = now;
    const timeRangeMs = TIME_RANGES[range];
    
    if (range === 'MAX') {
      return { min: data[0].timestamp, max: now };
    }
    
    const viewMin = new Date(now - timeRangeMs);
    return { min: viewMin, max: endTime };
  }, []);

  const interpolateDataPoints = useCallback((rawData) => {
    if (!rawData?.length || rawData.length < 2) return rawData;
    
    const interpolatedData = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now - SEVEN_DAYS);
    
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
        timestamp: new Date(rawData[0].timestamp - MINUTES_15),
        isExtrapolated: true
      });
    }
    
    // Original interpolation logic
    for (let i = 0; i < rawData.length - 1; i++) {
      const currentPoint = rawData[i];
      const nextPoint = rawData[i + 1];
      
      interpolatedData.push(currentPoint);
      
      const timeDiff = nextPoint.timestamp - currentPoint.timestamp;
      
      if (timeDiff > MINUTES_15) {
        interpolatedData.push({
          ...currentPoint,
          timestamp: new Date(nextPoint.timestamp - MINUTES_15),
          isInterpolated: true
        });
      }
    }
    
    interpolatedData.push(rawData[rawData.length - 1]);
    
    const lastPoint = rawData[rawData.length - 1];
    const timeToNow = now - lastPoint.timestamp;
    
    if (timeToNow > MINUTES_15) {
      interpolatedData.push({
        ...lastPoint,
        timestamp: new Date(now),
        isInterpolated: true
      });
    }
    
    return interpolatedData;
  }, []);

  const getDynamicYAxisDomain = useCallback((dataMin, dataMax, data, timeWindow, customTimeRange = null) => {
    if (!data?.length) return [0, 50000];
    
    let visibleData;
    if (customTimeRange) {
      // For zoom/pan operations, use the custom time range
      visibleData = data.filter(d => 
        d.timestamp >= customTimeRange.min && 
        d.timestamp <= customTimeRange.max
      );
    } else {
      // For predefined time windows (24H, 7D, MAX)
      const now = new Date();
      const windowStart = new Date(now - TIME_RANGES[timeWindow]);
      visibleData = timeWindow === 'MAX' 
        ? data 
        : data.filter(d => d.timestamp >= windowStart);
    }
  
    // If no data points in visible range, use the last known score before the visible range
    if (!visibleData.length) {
      let lastKnownScore;
      const rangeStart = customTimeRange?.min || (timeWindow === 'MAX' ? data[0].timestamp : new Date(new Date() - TIME_RANGES[timeWindow]));
      
      // Find the last score before the visible range
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].timestamp <= rangeStart) {
          lastKnownScore = data[i].rankScore;
          break;
        }
      }
      
      // If no previous score found, use the first available score
      if (lastKnownScore === undefined) {
        lastKnownScore = data[0].rankScore;
      }
  
      // Create a buffer of 10% above and below the last known score
      const buffer = Math.round(lastKnownScore * 0.1);
      return [
        Math.max(0, lastKnownScore - buffer),
        lastKnownScore + buffer
      ];
    }
    
    // If min and max are the same (single point or all same values)
    const minScore = Math.min(...visibleData.map(d => d.rankScore));
    const maxScore = Math.max(...visibleData.map(d => d.rankScore));
    
    if (minScore === maxScore) {
      const buffer = Math.round(minScore * 0.1);
      return [
        Math.max(0, minScore - buffer),
        maxScore + buffer
      ];
    }
    
    // Normal case with multiple different points
    const padding = Math.round((maxScore - minScore) * 0.10);
    return [Math.max(0, minScore - padding), maxScore + padding];
  }, []);


  const getRankAnnotations = useCallback((customTimeRange = null) => {
    if (!data) return [];
    
    const [minDomain, maxDomain] = getDynamicYAxisDomain(
      Math.min(...data.map(d => d.rankScore)),
      Math.max(...data.map(d => d.rankScore)),
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

  const loadData = useCallback(async () => {
    // If we have cached data for this player and it's less than 5 minutes old, use it
    const CACHE_DURATION = 5 * 60 * 1000;
    if (
      dataCache.current?.playerId === playerId && 
      Date.now() - dataCache.current.timestamp < CACHE_DURATION
    ) {
      setData(dataCache.current.data);
      const window = calculateViewWindow(dataCache.current.data, selectedTimeRange);
      setViewWindow(window);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await fetchPlayerGraphData(playerId);
      if (!result.data?.length) {
        setError('No data available for this player');
        return;
      }
      
      if (result.data.length === 1) {
        setError('Not enough data points to display graph');
        return;
      }
  
      const parsedData = result.data.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
      
      const interpolatedData = interpolateDataPoints(parsedData);
      
      // Cache the data
      dataCache.current = {
        playerId,
        data: interpolatedData,
        timestamp: Date.now()
      };
      
      setData(interpolatedData);
      const window = calculateViewWindow(interpolatedData, selectedTimeRange);
      setViewWindow(window);
    } catch (error) {
      setError(`Failed to load player history: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [playerId, calculateViewWindow, interpolateDataPoints, selectedTimeRange]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      loadData();
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, loadData]);

  // Separate effect for handling time range changes
  useEffect(() => {
    if (data) {
      const window = calculateViewWindow(data, selectedTimeRange);
      setViewWindow(window);
      chartRef.current?.resetZoom();
    }
  }, [selectedTimeRange, data, calculateViewWindow]);

  const calculateYAxisTicks = useCallback((min, max) => {
    const range = max - min;
    const targetTicks = 20; // Aim for 20 ticks to ensure we get at least 15
    
    // Calculate initial step size
    let step = range / targetTicks;
    
    // Round step to a nice number while preserving tick density
    const magnitude = Math.pow(10, Math.floor(Math.log10(step)));
    let normalized = step / magnitude;
    
    // Find the closest nice number while maintaining target tick count
    if (normalized <= 1) normalized = 1;
    else if (normalized <= 2) normalized = 2;
    else if (normalized <= 2.5) normalized = 2.5;
    else if (normalized <= 5) normalized = 5;
    else normalized = 10;
    
    step = normalized * magnitude;
    
    // Generate tick values
    const ticks = [];
    // Start slightly below min to ensure we get enough ticks
    let tick = Math.floor(min / step) * step;
    
    // Generate extra ticks to ensure we hit our target
    while (tick <= max + step) { // Add a small buffer
      if (tick >= min - step) { // Include one tick below min
        ticks.push(tick);
      }
      tick += step;
    }
    
    // If we still don't have enough ticks, reduce the step size
    if (ticks.length < 15) {
      // Recursively try with a smaller target step size
      return calculateYAxisTicks(min, max, targetTicks + 5);
    }
    
    return ticks;
  }, []);

  const chartOptions = useMemo(() => data ? {
    responsive: true,
    maintainAspectRatio: false,
    animation: true,
    scales: {
      x: {
        type: 'time',
        time: {
          displayFormats: {
            millisecond: 'dd MMM HH:mm',
            second: 'dd MMM HH:mm',
            minute: 'dd MMM HH:mm',
            hour: 'dd MMM HH:mm',
            day: 'dd MMM',
            week: 'dd MMM',
            month: 'MMM yyyy',
            quarter: 'MMM yyyy',
            year: 'yyyy'
          }
        },
        grid: {
          color: '#2a3042'
        },
        ticks: {
          color: '#cecfd3',
          maxRotation: 69,
          minRotation: 69,
          autoSkip: true,
          maxTicksLimit: 20,
          padding: 4,
          align: 'end'
        },
        min: viewWindow?.min,
        max: viewWindow?.max
      },
      y: {
        min: data.length > 0 ? getDynamicYAxisDomain(
          Math.min(...data.map(d => d.rankScore)),
          Math.max(...data.map(d => d.rankScore)),
          data,
          selectedTimeRange
        )[0] : 0,
        max: data.length > 0 ? getDynamicYAxisDomain(
          Math.min(...data.map(d => d.rankScore)),
          Math.max(...data.map(d => d.rankScore)),
          data,
          selectedTimeRange
        )[1] : 50000,
        grid: {
          color: '#2a3042'
        },
        ticks: {
          color: '#cecfd3',
          callback: value => value.toLocaleString(),
          // Generate rounded ticks based on the current min/max values
          afterBuildTicks: (axis) => {
            axis.ticks = calculateYAxisTicks(axis.min, axis.max).map(value => ({
              value: value
            }));
          }
        }
      }
    },
    plugins: {
      zoom: {
        limits: {
          x: {
            min: new Date(data[0].timestamp - TWO_HOURS),
            max: new Date(data[data.length - 1].timestamp + TWO_HOURS),
            minRange: 5 * 60 * 60 * 1000
          }
        },
        pan: {
          enabled: true,
          mode: 'x',
          modifierKey: null,
          onPan: function(ctx) {
            const timeRange = {
              min: ctx.chart.scales.x.min,
              max: ctx.chart.scales.x.max
            };
            
            const [newMin, newMax] = getDynamicYAxisDomain(
              Math.min(...data.map(d => d.rankScore)),
              Math.max(...data.map(d => d.rankScore)),
              data,
              selectedTimeRange,
              timeRange
            );
            
            ctx.chart.options.scales.y.min = newMin;
            ctx.chart.options.scales.y.max = newMax;
            
            // Force recalculation of Y-axis ticks
            ctx.chart.options.scales.y.ticks.afterBuildTicks = (axis) => {
              axis.ticks = calculateYAxisTicks(newMin, newMax).map(value => ({
                value: value
              }));
            };
            
            ctx.chart.options.plugins.annotation.annotations = getRankAnnotations(timeRange);
          }
        },
        zoom: {
          wheel: {
            enabled: true
          },
          pinch: {
            enabled: true
          },
          mode: 'x',
          onZoom: function(ctx) {
            const timeRange = {
              min: ctx.chart.scales.x.min,
              max: ctx.chart.scales.x.max
            };
            
            const [newMin, newMax] = getDynamicYAxisDomain(
              Math.min(...data.map(d => d.rankScore)),
              Math.max(...data.map(d => d.rankScore)),
              data,
              selectedTimeRange,
              timeRange
            );
            
            ctx.chart.options.scales.y.min = newMin;
            ctx.chart.options.scales.y.max = newMax;
            
            // Force recalculation of Y-axis ticks
            ctx.chart.options.scales.y.ticks.afterBuildTicks = (axis) => {
              axis.ticks = calculateYAxisTicks(newMin, newMax).map(value => ({
                value: value
              }));
            };
            
            ctx.chart.options.plugins.annotation.annotations = getRankAnnotations(timeRange);
          }
        },
      },
      annotation: {
        annotations: getRankAnnotations()
      },
      tooltip: {
        enabled: false,
        external: externalTooltipHandler,
        position: 'nearest'
      },
      legend: {
        labels: {
          color: '#ffffff',
          boxWidth: 15,
          padding: 15,
          usePointStyle: true
        }
      }
    }
  } : null, [data, viewWindow, getDynamicYAxisDomain, getRankAnnotations, selectedTimeRange, externalTooltipHandler, calculateYAxisTicks]);

  const chartData = useMemo(() => data ? {
    labels: data.map(d => d.timestamp),
    datasets: [{
      label: ` ${playerId}`,
      data: data.map(d => ({
          x: d.timestamp,
          y: d.rankScore,
          raw: d
      })),
      segment: {
        borderColor: ctx => {
          if (!ctx.p0?.raw || !ctx.p1?.raw) return '#FAF9F6';
          
          // Check for extrapolated points
          if (ctx.p0.raw.isExtrapolated || ctx.p1.raw.isExtrapolated) {
            return '#FAF9F6';
          }
          
          // Check for interpolated points
          if (ctx.p0.raw.isInterpolated || ctx.p1.raw.isInterpolated) {
            return '#FAF9F6';
          }
          
          const curr = ctx.p0.parsed.y;
          const next = ctx.p1.parsed.y;
          return next > curr ? '#10B981' : next < curr ? '#EF4444' : '#FAF9F6';
        },
        borderWidth: ctx => {
          if (!ctx.p0?.raw || !ctx.p1?.raw) return 2;
  
          const curr = ctx.p0.parsed.y;
          const next = ctx.p1.parsed.y;
          const isExtrapolated = ctx.p0.raw.raw.isExtrapolated || ctx.p1.raw.raw.isExtrapolated;
          const isInterpolated = ctx.p0.raw.raw.isInterpolated || ctx.p1.raw.raw.isInterpolated;
          const isEqual = curr === next;
          
          if (isExtrapolated) {
            return 2;  // Thinner line for extrapolated data
          }
          
          if (isInterpolated || isEqual) {
            return 2;
          }
          return 2;
        },
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
      pointRadius: ctx => {
        if (ctx.raw.raw?.isExtrapolated) return 3;
        if (ctx.raw.raw?.isInterpolated) return 3;
        return 3;
      },
      tension: 0.01
    }]
  } : null, [data, playerId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div ref={modalRef} className="bg-[#1a1f2e] rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">{playerId} - Rank History</h2>
            {data && (
              <p className="text-sm text-gray-400 mt-1">
                Data from {data[0].timestamp.toLocaleDateString()} to {new Date().toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex gap-2 bg-gray-800 rounded-lg p-1">
              {Object.keys(TIME_RANGES).map((range) => (
                <button
                  key={range}
                  onClick={() => setSelectedTimeRange(range)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    selectedTimeRange === range
                      ? 'bg-gray-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
            <button 
              onClick={onClose}
              className="sm:hidden p-2 hover:bg-gray-700 rounded-lg"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
  
        <div className="h-[600px] w-full">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-gray-400">{error}</div>
          ) : (
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerGraphModal;