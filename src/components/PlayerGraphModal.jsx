import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Brush, Label} from 'recharts';
import { fetchPlayerGraphData } from '../services/gp-api';

const PlayerGraphModal = ({ isOpen, onClose, playerId }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const modalRef = useRef(null);

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

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPlayerGraphData(playerId);
      if (!result.data || result.data.length === 0) {
        setError('No data available for this player');
        return;
      }
      setData(result.data);
    } catch (err) {
      setError('Failed to load player history');
    } finally {
      setLoading(false);
    }
  };

  const getDynamicYAxisDomain = (dataMin, dataMax) => {
    const DIAMOND_1_THRESHOLD = 47500;
    const BUFFER_ABOVE_MAX = 2500;

    // Find the nearest rank threshold below the data range
    const minRankThreshold = ranks.reduce((prev, curr) => {
      return (curr.y <= dataMin && curr.y > prev) ? curr.y : prev;
    }, 0);

    // For scores above Diamond 1, use a dynamic buffer
    let maxYValue;
    if (dataMax > DIAMOND_1_THRESHOLD) {
      maxYValue = dataMax + BUFFER_ABOVE_MAX;
    } else {
      // For scores within rank thresholds, find the next rank up
      maxYValue = ranks.reduce((prev, curr) => {
        return (curr.y >= dataMax && curr.y < prev) ? curr.y : prev;
      }, DIAMOND_1_THRESHOLD);
    }

    // Show 1-2 ranks below the current range
    const ranksArray = ranks.map(rank => rank.y);
    const lowerIndex = Math.max(0, ranksArray.indexOf(minRankThreshold));
    
    return [ranksArray[lowerIndex], maxYValue];
  };

  const formatXAxis = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const formatYAxis = (value) => {
    return value.toLocaleString();
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900 border border-gray-800 p-3 rounded shadow-lg">
          <p className="text-gray-400 text-sm">{new Date(label).toLocaleString()}</p>
          <p className="text-white font-medium">
            Score: {formatYAxis(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  const getSegmentColor = (current, next) => {
    if (!next) return '#FFFFFF';
    return next.rankScore > current.rankScore ? '#10B981' : 
           next.rankScore < current.rankScore ? '#EF4444' : '#FFFFFF';
  };

  const CustomDot = ({ cx, cy, payload, index }) => {
    const nextEntry = data[index + 1];
    const color = getSegmentColor(payload, nextEntry);
    
    return (
      <circle 
        cx={cx} 
        cy={cy} 
        r={3} 
        fill={color}
        key={`dot-${index}`}
      />
    );
  };

  const getReferenceLines = () => {
    if (!data) return null;
    
    // Get the current visible data range
    const visibleData = data.map(d => d.rankScore);
    const [minDomain, maxDomain] = getDynamicYAxisDomain(Math.min(...visibleData), Math.max(...visibleData));
    
    // Only return reference lines within the visible range
    return ranks
      .filter(rank => rank.y >= minDomain && rank.y <= maxDomain)
      .map((rank) => (
        <ReferenceLine
          key={rank.label}
          y={rank.y}
          stroke={rank.color}
          strokeDasharray="2 2"
          label={<Label value={rank.label} fill={rank.color} />}
        />
      ));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div ref={modalRef} className="bg-[#1a1f2e] rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">{playerId} - Rank History</h2>
            <p className="text-sm text-gray-400 mt-1">
              {data && `Data from ${new Date(data[0].timestamp).toLocaleDateString()} to ${new Date(data[data.length - 1].timestamp).toLocaleDateString()}`}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="sm:hidden p-2 hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="h-[500px]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-gray-400">{error}</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 20, right: 30, left: 60, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3042" />
                <XAxis 
                  dataKey="timestamp"
                  stroke="#4a5568"
                  tick={{ fill: '#4a5568', fontSize: 12 }}
                  tickFormatter={formatXAxis}
                />
                <YAxis
                  dataKey="rankScore"
                  domain={data ? getDynamicYAxisDomain(
                    Math.min(...data.map(d => d.rankScore)),
                    Math.max(...data.map(d => d.rankScore))
                  ) : [0, 0]}
                  tickFormatter={formatYAxis}
                  stroke="#4a5568"
                  tick={{ fill: '#4a5568', fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="rankScore"
                  dot={<CustomDot />}
                  stroke="#9ca3af"
                  strokeWidth={2}
                  connectNulls
                  fill="#9ca3af"
                />
                {getReferenceLines()}
                <Brush
                  dataKey="timestamp"
                  height={30}
                  stroke="#4a5568"
                  fill="#1a1f2e"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerGraphModal;