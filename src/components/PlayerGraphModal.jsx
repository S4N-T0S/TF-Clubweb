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
  
    if (!visibleData.length) return [0, 50000];
  
    const minScore = Math.min(...visibleData.map(d => d.rankScore));
    const maxScore = Math.max(...visibleData.map(d => d.rankScore));
    
    const padding = Math.round((maxScore - minScore) * 0.01);
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
        borderWidth: 1,
        borderDash: [2, 2],
        label: {
          content: rank.label,
          display: true,
          position: 'right',
          color: rank.color,
          font: {
            size: 11
          },
          padding: {
            left: 10
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

  const chartOptions = useMemo(() => data ? {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
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
          color: '#4a5568',
          maxRotation: 45,
          minRotation: 45,
          autoSkip: true,
          maxTicksLimit: 20,
          padding: 8,
          align: 'end'
        },
        min: viewWindow?.min,
        max: viewWindow?.max
      },
      y: {
        // The min/max will be updated dynamically during zoom/pan
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
          color: '#4a5568',
          callback: value => value.toLocaleString()
        }
      }
    },
    plugins: {
      zoom: {
        limits: {
          x: {
            min: new Date(data[0].timestamp - TWO_HOURS),
            max: new Date(data[data.length - 1].timestamp + TWO_HOURS),
            minRange: 5 * 60 * 60 * 1000 // Minimum 5 hour range
          }
        },
        pan: {
          enabled: true,
          mode: 'x',
          modifierKey: null,
          onPan: function(ctx) {
            // Get the current view window after panning
            const timeRange = {
              min: ctx.chart.scales.x.min,
              max: ctx.chart.scales.x.max
            };
            
            // Update Y axis bounds
            const [newMin, newMax] = getDynamicYAxisDomain(
              Math.min(...data.map(d => d.rankScore)),
              Math.max(...data.map(d => d.rankScore)),
              data,
              selectedTimeRange,
              timeRange
            );
            
            ctx.chart.options.scales.y.min = newMin;
            ctx.chart.options.scales.y.max = newMax;
            
            // Update rank annotations
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
            // Get the current view window after zooming
            const timeRange = {
              min: ctx.chart.scales.x.min,
              max: ctx.chart.scales.x.max
            };
            
            // Update Y axis bounds
            const [newMin, newMax] = getDynamicYAxisDomain(
              Math.min(...data.map(d => d.rankScore)),
              Math.max(...data.map(d => d.rankScore)),
              data,
              selectedTimeRange,
              timeRange
            );
            
            ctx.chart.options.scales.y.min = newMin;
            ctx.chart.options.scales.y.max = newMax;
            
            // Update rank annotations
            ctx.chart.options.plugins.annotation.annotations = getRankAnnotations(timeRange);
          }
        },
      },
      annotation: {
        annotations: getRankAnnotations()
      },
      tooltip: {
        backgroundColor: '#1f2937',
        titleColor: '#9ca3af',
        bodyColor: '#FAF9F6',
        titleFont: {
          size: 12
        },
        bodyFont: {
          size: 14,
          weight: 'bold'
        },
        padding: 12,
        callbacks: {
          title: contexts => {
            const date = new Date(contexts[0].parsed.x);
            return date.toLocaleString([], {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
          },
          label: context => `Score: ${context.parsed.y.toLocaleString()}`
        }
      },
      legend: {
        labels: {
          color: '#ffffff',
          boxWidth: 15,
          padding: 15,
          usePointStyle: false
        }
      }
    }
  } : null, [data, viewWindow, getDynamicYAxisDomain, getRankAnnotations, selectedTimeRange]);

  const chartData = useMemo(() => data ? {
    labels: data.map(d => d.timestamp),
    datasets: [{
      label: `${playerId}`,
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
          const isExtrapolated = ctx.p0.raw.isExtrapolated || ctx.p1.raw.isExtrapolated;
          const isInterpolated = ctx.p0.raw.isInterpolated || ctx.p1.raw.isInterpolated;
          const isEqual = curr === next;
          
          if (isExtrapolated) {
            return 1;  // Thinner line for extrapolated data
          }
          
          if (isInterpolated || isEqual) {
            return 1.5;
          }
          return 2;
        },
        borderDash: ctx => {
          if (!ctx.p0?.raw || !ctx.p1?.raw) return undefined;
          return (ctx.p0.raw.isExtrapolated || ctx.p1.raw.isExtrapolated) ? [5, 5] : undefined;
        }
      },
      borderColor: '#FAF9F6',
      backgroundColor: '#FAF9F6',
      pointBackgroundColor: ctx => {
        if (ctx.raw?.isExtrapolated) return 'transparent';
        if (ctx.raw?.isInterpolated) return 'transparent';
        return '#FAF9F6';
      },
      pointRadius: ctx => {
        if (ctx.raw?.isExtrapolated) return 0;
        if (ctx.raw?.isInterpolated) return 0;
        return 3;
      },
      tension: 0
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