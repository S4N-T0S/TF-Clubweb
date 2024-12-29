import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from 'recharts';
import { fetchPlayerGraphData } from '../services/gp-api';

const PlayerGraphModal = ({ isOpen, onClose, playerId }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const modalRef = useRef(null);

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
  }, [isOpen, playerId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetchPlayerGraphData(playerId);
      console.log('Raw data:', result.data); // Debug log
      
      if (!result.data || result.data.length === 0) {
        setError('No data available for this player');
        return;
      }
      
      setData(result.data);
    } catch (err) {
      console.error('Load data error:', err);
      setError('Failed to load player history');
    } finally {
      setLoading(false);
    }
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

  const CustomDot = (props) => {
    const { cx, cy, payload, index } = props;
    if (!cx || !cy || !props.data) return null;
  
    let color = '#FFFFFF';
    if (index < props.data.length - 1) {
      const nextScore = props.data[index + 1].rankScore;
      color = nextScore > payload.rankScore ? '#10B981' :
              nextScore < payload.rankScore ? '#EF4444' : '#FFFFFF';
    }
  
    return <circle cx={cx} cy={cy} r={3} fill={color} />;
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
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg">
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
  />
<YAxis
  dataKey="rankScore"
  domain={[dataMin => Math.floor(dataMin * 0.95), dataMax => Math.ceil(dataMax * 1.05)]}
  tickFormatter={formatYAxis}
  stroke="#4a5568"
  tick={{ fill: '#4a5568', fontSize: 12 }}
/>

  <Tooltip content={<CustomTooltip />} />
  <Line
  type="step"
  dataKey="rankScore"
  stroke="#FFFFFF"
  strokeWidth={1.5}
  dot={{ fill: '#FFFFFF', r: 3 }}
  connectNulls
  stepSize={2}
/>
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