import { useState, useEffect, useRef } from 'react';
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

const ranks = [
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

const PlayerGraphModal = ({ isOpen, onClose, playerId }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewWindow, setViewWindow] = useState(null);
  const modalRef = useRef(null);
  const chartRef = useRef(null);

  const calculateViewWindow = (data) => {
    if (!data || data.length === 0) return null;

    const endTime = data[data.length - 1].timestamp;
    const startTime = data[0].timestamp;
    const timeRange = endTime - startTime;
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;

    let viewMin;
    if (timeRange <= oneDayMs) {
      viewMin = startTime;
    } else if (timeRange <= sevenDaysMs) {
      viewMin = new Date(endTime - oneDayMs);
    } else {
      viewMin = new Date(endTime - sevenDaysMs);
    }

    return { min: viewMin, max: endTime };
  };

  const interpolateDataPoints = (rawData) => {
    if (!rawData || rawData.length < 2) return rawData;
    
    const interpolatedData = [];
    const TEN_MINUTES = 10 * 60 * 1000; // 10 minutes in milliseconds
    
    for (let i = 0; i < rawData.length - 1; i++) {
      const currentPoint = rawData[i];
      const nextPoint = rawData[i + 1];
      
      // Add the current point
      interpolatedData.push(currentPoint);
      
      // Calculate time difference
      const timeDiff = nextPoint.timestamp - currentPoint.timestamp;
      
      // If gap is more than 10 minutes, add interpolated points
      if (timeDiff > TEN_MINUTES) {
        // Add point just before the change (using current score)
        interpolatedData.push({
          ...currentPoint,
          timestamp: new Date(nextPoint.timestamp - TEN_MINUTES),
          isInterpolated: true
        });
      }
    }
    
    // Add the last point
    interpolatedData.push(rawData[rawData.length - 1]);
    
    return interpolatedData;
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPlayerGraphData(playerId);
      if (!result.data || result.data.length === 0) {
        setError('No data available for this player');
        return;
      }
      const parsedData = result.data.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
      
      // Interpolate the data points
      const interpolatedData = interpolateDataPoints(parsedData);
      setData(interpolatedData);
      const window = calculateViewWindow(interpolatedData);
      setViewWindow(window);
    } catch (err) {
      setError('Failed to load player history');
    } finally {
      setLoading(false);
    }
  };

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
  }, [isOpen, onClose, playerId]);

  const resetZoom = () => {
    if (data) {
      const window = calculateViewWindow(data);
      setViewWindow(window);
    }
    if (chartRef.current) {
      chartRef.current.resetZoom();
    }
  };

  const getDynamicYAxisDomain = (dataMin, dataMax) => {
    const DIAMOND_1_THRESHOLD = 47500;
    const BUFFER_ABOVE_MAX = 1000;

    const minRankThreshold = ranks.reduce((prev, curr) => {
      return (curr.y <= dataMin && curr.y > prev) ? curr.y : prev;
    }, 0);

    let maxYValue;
    if (dataMax > DIAMOND_1_THRESHOLD) {
      maxYValue = dataMax + BUFFER_ABOVE_MAX;
    } else {
      maxYValue = ranks.reduce((prev, curr) => {
        return (curr.y >= dataMax && curr.y < prev) ? curr.y : prev;
      }, DIAMOND_1_THRESHOLD);
    }

    const ranksArray = ranks.map(rank => rank.y);
    const lowerIndex = Math.max(0, ranksArray.indexOf(minRankThreshold));
    
    return [ranksArray[lowerIndex], maxYValue];
  };

  const getRankAnnotations = () => {
    if (!data) return [];
    
    const minScore = Math.min(...data.map(d => d.rankScore));
    const maxScore = Math.max(...data.map(d => d.rankScore));
    const [minDomain, maxDomain] = getDynamicYAxisDomain(minScore, maxScore);
    
    return ranks
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
  };

  const chartOptions = data ? {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'hour',
          displayFormats: {
            hour: 'HH:mm'
          }
        },
        grid: {
          color: '#2a3042'
        },
        ticks: {
          color: '#4a5568'
        },
        min: viewWindow?.min,
        max: viewWindow?.max,
        bounds: 'data'
      },
      y: {
        min: getDynamicYAxisDomain(
          Math.min(...data.map(d => d.rankScore)),
          Math.max(...data.map(d => d.rankScore))
        )[0],
        max: getDynamicYAxisDomain(
          Math.min(...data.map(d => d.rankScore)),
          Math.max(...data.map(d => d.rankScore))
        )[1],
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
        pan: {
          enabled: true,
          mode: 'x'
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true
          },
          mode: 'x',
        },
        limits: {
          x: {
            minRange: 1000 * 60 * 60,
            min: data[0]?.timestamp,
            max: data[data.length - 1]?.timestamp
          }
        }
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
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
          },
          label: context => `Score: ${context.parsed.y.toLocaleString()}`
        }
      }
    }
  } : null;

  const chartData = data ? {
    labels: data.map(d => d.timestamp),
    datasets: [{
      label: 'Rank Score',
      data: data.map(d => ({
        x: d.timestamp,
        y: d.rankScore,
        raw: d // Include the full data point for interpolation checking
      })),
      segment: {
        borderColor: ctx => {
          // First verify we have valid context points
          if (!ctx.p0?.raw || !ctx.p1?.raw) return '#FAF9F6';
          
          // Check for interpolated points
          if (ctx.p0.raw.isInterpolated || ctx.p1.raw.isInterpolated) {
            return '#FAF9F6';
          }
          
          const curr = ctx.p0.parsed.y;
          const next = ctx.p1.parsed.y;
          return next > curr ? '#10B981' : next < curr ? '#EF4444' : '#FAF9F6';
        },
        borderWidth: ctx => {
          // First verify we have valid context points
          if (!ctx.p0?.raw || !ctx.p1?.raw) return 2;

          const curr = ctx.p0.parsed.y;
          const next = ctx.p1.parsed.y;
          const isInterpolated = ctx.p0.raw.isInterpolated || ctx.p1.raw.isInterpolated;
          const isEqual = curr === next;
          
          // Check for interpolated points
          if (isInterpolated || isEqual) {
            return 1.5;
          }
          return 2;
        }
      },
      pointBackgroundColor: ctx => ctx.raw?.isInterpolated ? 'transparent' : '#FAF9F6',
      pointRadius: ctx => ctx.raw?.isInterpolated ? 0 : 3,
      tension: 0  // Set tension to 0 for all lines to make them straight
    }]
  } : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div ref={modalRef} className="bg-[#1a1f2e] rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">{playerId} - Rank History</h2>
            {data && (
              <p className="text-sm text-gray-400 mt-1">
                Data from {data[0].timestamp.toLocaleDateString()} to {data[data.length - 1].timestamp.toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={resetZoom}
              className="px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 rounded-lg"
            >
              Reset Zoom
            </button>
            <button 
              onClick={onClose}
              className="sm:hidden p-2 hover:bg-gray-700 rounded-lg"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
  
        <div className="h-[500px] w-full">
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