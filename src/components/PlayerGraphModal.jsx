import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Plus, Search } from 'lucide-react';
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
import { PlayerGraphModalProps, ComparePlayerSearchProps } from '../types/propTypes';

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

const createTooltip = (chart) => {
  const tooltipEl = document.createElement('div');
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
  
  return tooltipEl;
};

const getOrCreateTooltip = (chart) => {
  let tooltipEl = chart.canvas.parentNode.querySelector('div.rank-tooltip');
  if (!tooltipEl) {
    tooltipEl = createTooltip(chart);
  }
  return tooltipEl;
};

const TIME_RANGES = {
  '24H': 24 * 60 * 60 * 1000,
  '7D': 7 * 24 * 60 * 60 * 1000,
  'MAX': Infinity
};

const COMPARISON_COLORS = [
  'rgba(255, 159, 64, 0.8)',  // Orange
  'rgba(75, 192, 192, 0.8)',  // Teal
  'rgba(153, 102, 255, 0.8)', // Purple
  'rgba(255, 99, 132, 0.8)',  // Pink
  'rgba(54, 162, 235, 0.8)'   // Blue
];

// Constants for time intervals - moved outside component
const MINUTES_15 = 15 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const TWO_HOURS = 2 * 60 * 60 * 1000;
const CACHE_DURATION = 5 * 60 * 1000; // cache for reopenning modal
const MAX_COMPARISONS = 5;

const ComparePlayerSearch = ({ onSelect, mainPlayerId, globalLeaderboard, onClose, comparisonData }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPlayers, setFilteredPlayers] = useState([]);

  useEffect(() => {
    const filtered = globalLeaderboard
      .filter(player => 
        player.name !== mainPlayerId && 
        !Array.from(comparisonData.keys()).includes(player.name) &&
        (player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (player.clubTag && `[${player.clubTag}]`.toLowerCase().includes(searchTerm.toLowerCase())))
      )
      .slice(0, 50);
    setFilteredPlayers(filtered);
  }, [searchTerm, mainPlayerId, globalLeaderboard, comparisonData]);

  return (
    <div className="absolute right-0 top-12 w-96 bg-gray-800 rounded-lg shadow-lg p-4 z-50">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Add Player to Compare</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div className="relative mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search players..."
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
          autoFocus
        />
        <Search className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
      </div>

      <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
        {filteredPlayers.map((player) => (
          <div
            key={player.name}
            className="flex items-center justify-between p-2 hover:bg-gray-700 rounded-lg cursor-pointer"
            onClick={() => onSelect(player)}
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-400">#{player.rank}</span>
              <span className="text-white">
                {player.clubTag ? `[${player.clubTag}] ` : ''}{player.name}
              </span>
            </div>
            <Plus className="w-5 h-5 text-gray-400 hover:text-white" />
          </div>
        ))}
      </div>
    </div>
  );
};

const PlayerGraphModal = ({ isOpen, onClose, playerId, isClubView = false, globalLeaderboard = [], onSwitchToGlobal }) => {
  const [data, setData] = useState(null);
  const [comparisonData, setComparisonData] = useState(new Map());
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24H');
  const [viewWindow, setViewWindow] = useState(null);
  const [showCompareSearch, setShowCompareSearch] = useState(false);
  const modalRef = useRef(null);
  const chartRef = useRef(null);
  const dataCache = useRef(null);
  const [showCompareHint, setShowCompareHint] = useState(true);

  // Add useEffect for managing body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Reset state when modal is opened with new player
  useEffect(() => {
    if (isOpen) {
      setShowCompareHint(true);
      setSelectedTimeRange('24H');
      if (dataCache.current?.playerId !== playerId) {
        dataCache.current = null;
        setData(null);
        setError(null);
        setViewWindow(null);
      }
    }
  }, [isOpen, playerId]);

  // Temporary hint shown when comparison feature has been added
  useEffect(() => {
    if (showCompareHint) {
      const timer = setTimeout(() => {
        setShowCompareHint(false);
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [showCompareHint]);

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
      const datasetIndex = tooltip.dataPoints[0].datasetIndex;
      const dataPoint = tooltip.dataPoints[0].raw.raw;
      
      const tableRoot = tooltipEl.querySelector('table');
  
      // Clear previous tooltip content
      while (tableRoot.firstChild) {
        tableRoot.firstChild.remove();
      }
  
      // Add player name if in comparison mode (more than one dataset)
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
  
      // Add title (timestamp)
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
  
      // Add score
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
        // Get the correct dataset based on the datasetIndex
        const dataset = datasetIndex === 0 ? data : Array.from(comparisonData.values())[datasetIndex - 1].data;
        const dataIndex = dataset.findIndex(d => d.timestamp.getTime() === dataPoint.timestamp.getTime());
        
        if (dataIndex > 0) {
          const previousScore = dataset[dataIndex - 1].rankScore;
          const scoreChange = score - previousScore;
          const scoreChangeText = document.createElement('span');
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
  
      // Add rank label
      const rankRow = document.createElement('tr');
      rankRow.style.borderWidth = 0;
      const rankCell = document.createElement('td');
      rankCell.style.borderWidth = 0;
      rankCell.style.fontSize = '14px';
      rankCell.style.fontWeight = 'bold';
      rankCell.style.paddingTop = '4px';
      
      // Create rank container for flex layout
      const rankContainer = document.createElement('div');
      rankContainer.style.display = 'flex';
      rankContainer.style.alignItems = 'center';
      rankContainer.style.gap = '6px';
      
      // Add rank change arrow if needed
      if (!dataPoint.isInterpolated && !dataPoint.isExtrapolated) {
        // Get the correct dataset based on the datasetIndex
        const dataset = datasetIndex === 0 ? data : Array.from(comparisonData.values())[datasetIndex - 1].data;
        const dataIndex = dataset.findIndex(d => d.timestamp.getTime() === dataPoint.timestamp.getTime());
        
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
  
      // Rank label
      rankContainer.appendChild(document.createTextNode(rank.label));
      
      // Hexagon
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
  
    // Display, position, and set styles for tooltip
    tooltipEl.style.opacity = 1;
    tooltipEl.style.left = positionX + tooltip.caretX + 'px';
    tooltipEl.style.top = positionY + tooltip.caretY + 'px';
    tooltipEl.style.font = tooltip.options.bodyFont.string;
    tooltipEl.style.boxShadow = '0 2px 12px 0 rgba(0,0,0,0.4)';
  }, [data, comparisonData]);

  const calculateViewWindow = useCallback((data, range) => {
    if (!data?.length) return null;
  
    const now = new Date();
    const endTime = new Date(now + TWO_HOURS);
    const timeRangeMs = TIME_RANGES[range];
    
    if (range === 'MAX') {
      return { min: data[0].timestamp, max: endTime };
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

  // Now we can define loadComparisonData after interpolateDataPoints
  const loadComparisonData = useCallback(async (comparePlayerId) => {
    try {
      const result = await fetchPlayerGraphData(comparePlayerId);
      if (!result.data?.length) return null;
      
      const parsedData = result.data.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
      
      const interpolatedData = interpolateDataPoints(parsedData);
      return interpolatedData;
    } catch (error) {
      console.error(`Failed to load comparison data for ${comparePlayerId}:`, error);
      return null;
    }
  }, [interpolateDataPoints]);

  const handleAddComparison = useCallback(async (player) => {
    if (comparisonData.size >= MAX_COMPARISONS) {
      return;
    }
    const newData = await loadComparisonData(player.name);
    if (newData) {
      setComparisonData(prev => {
        const colorIndex = prev.size;
        return new Map(prev).set(player.name, {
          data: newData,
          color: COMPARISON_COLORS[colorIndex]
        });
      });
    }
    setShowCompareSearch(false);
  }, [loadComparisonData, comparisonData]);

  const removeComparison = useCallback((playerId) => {
    setComparisonData(prev => {
      const next = new Map(prev);
      next.delete(playerId);
      return next;
    });
  }, []);

  const getDynamicYAxisDomain = useCallback((dataMin, dataMax, data, timeWindow, customTimeRange = null) => {
    if (!data?.length) return [0, 50000];
    
    // Helper function to filter data points within time range and find nearest points
    const getVisibleAndNearestData = (dataset) => {
      if (customTimeRange) {
        // Get points within the range for zoom/pan operation
        const visiblePoints = dataset.filter(d => 
          d.timestamp >= customTimeRange.min && 
          d.timestamp <= customTimeRange.max
        );
  
        // If no points in range, find nearest points before and after
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
        // For predefined time windows (24H, 7D, MAX)
        const now = new Date();
        const windowStart = new Date(now - TIME_RANGES[timeWindow]);
        return timeWindow === 'MAX' 
          ? dataset 
          : dataset.filter(d => d.timestamp >= windowStart);
      }
    };
  
    // Get chart instance to check dataset visibility
    const chart = chartRef.current;
    
    // Get visible data points for main player if dataset is visible
    let visibleData = [];
    if (!chart || chart.getDatasetMeta(0).visible !== false) {
      visibleData = getVisibleAndNearestData(data);
    }
    
    // Get visible data points for comparison players if their datasets are visible
    const comparisonVisibleData = Array.from(comparisonData.entries())
      // eslint-disable-next-line no-unused-vars
      .map(([_, { data: compareData }], index) => {
        if (!chart || chart.getDatasetMeta(index + 1).visible !== false) {
          return getVisibleAndNearestData(compareData);
        }
        return [];
      })
      .flat();
    
    // Combine all visible data points
    const allVisibleData = [...visibleData, ...comparisonVisibleData];
    
    // If no visible data points in range
    if (!allVisibleData.length) {
      let lastKnownScore;
      const rangeStart = customTimeRange?.min || 
        (timeWindow === 'MAX' ? data[0].timestamp : new Date(new Date() - TIME_RANGES[timeWindow]));
      
      // Find the last score before the visible range across all visible datasets
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
      
      // If no previous score found, use the first available score from visible datasets
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
  
      // Create a buffer of 10% above and below the last known score
      const buffer = Math.round(lastKnownScore * 0.1);
      return [
        Math.max(0, lastKnownScore - buffer),
        lastKnownScore + buffer
      ];
    }
    
    // Calculate min and max across all visible data points
    const minScore = Math.min(...allVisibleData.map(d => d.rankScore));
    const maxScore = Math.max(...allVisibleData.map(d => d.rankScore));
    
    // If min and max are the same
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
  }, [comparisonData, chartRef]);  


  const getHighlightedPeriodAnnotation = useCallback((customTimeRange = null) => {
    if (!data?.length) return null;

    // RS Adjustment Period 1 S5
    const startTime = new Date('2025-01-14T14:45:00');
    const endTime = new Date('2025-01-14T16:30:00');
    
    // Only show the highlight if it's within the visible range
    const min = customTimeRange?.min || viewWindow?.min;
    const max = customTimeRange?.max || viewWindow?.max;
    
    if (!min || !max || 
        (endTime < min) || 
        (startTime > max)) {
      return null;
    }
  
    // Check for data points in both main dataset and comparison datasets
    const hasDataPoints = (() => {
      // Check main dataset if it exists
      if (data?.some(point => {
        const timestamp = point.timestamp;
        return timestamp >= startTime && timestamp <= endTime;
      })) {
        return true;
      }
  
      // Check comparison datasets
      return Array.from(comparisonData.values()).some(({ data: compareData }) => 
        compareData.some(point => {
          const timestamp = point.timestamp;
          return timestamp >= startTime && timestamp <= endTime;
        })
      );
    })();
    
    // Don't show the highlight if there are no nearby data points in any dataset
    if (!hasDataPoints) {
      return null;
    }
  
    // Calculate the width of the highlighted period in the current view
    const totalViewDuration = max - min;
    const highlightDuration = endTime - startTime;
    const highlightWidthRatio = highlightDuration / totalViewDuration;
  
    // Show label if the highlighted period takes up more than 10% of the visible area
    const showLabel = highlightWidthRatio > 0.1;
  
    return {
      type: 'box',
      xMin: startTime,
      xMax: endTime,
      backgroundColor: 'rgba(255, 193, 7, 0.1)',
      borderColor: 'rgba(255, 193, 7, 0.5)',
      borderWidth: 0,
      drawTime: 'beforeDatasetsDraw',
      label: {
        content: 'RS Adjustments',
        display: showLabel,
        position: {
          x: 'center',  // Center the label horizontally in the box
          y: 'start'    // Place at the top of the box
        },
        color: '#FFC107',
        font: {
          size: 11
        },
        padding: {
          top: 4,
          bottom: 4
        }
      }
    };
  }, [data, comparisonData, viewWindow?.max, viewWindow?.min]);

  const getRankAnnotations = useCallback((customTimeRange = null) => {
    if (!data) return [];
    
    const [minDomain, maxDomain] = getDynamicYAxisDomain(
      Math.min(...data.map(d => d.rankScore)),
      Math.max(...data.map(d => d.rankScore)),
      data,
      selectedTimeRange,
      customTimeRange
    );
    
    const annotations = RANKS
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

    // Add the highlighted period annotation if it exists
    const highlightAnnotation = getHighlightedPeriodAnnotation(customTimeRange);
    if (highlightAnnotation) {
      annotations.push(highlightAnnotation);
    }

    return annotations;
  }, [data, getDynamicYAxisDomain, selectedTimeRange, getHighlightedPeriodAnnotation]);

  const loadData = useCallback(async () => {
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
        setError('No data available for this player, they may have recently changed their embarkId.');
        return;
      }
      
      if (result.data.length === 1) {
        setError('Not enough data points to display graph, player has probably recently changed their embarkId.');
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
            let timeRange = {
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
            let timeRange = {
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
        onClick: (evt, item, legend) => {
          // Call the default legend click handler using the Chart import
          const chart = chartRef.current;
          if (!chart) return;
          
          // Use Chart.defaults for the default behavior
          ChartJS.defaults.plugins.legend.onClick(evt, item, legend);
          
          // Wait for next tick to ensure dataset visibility is updated
          setTimeout(() => {
            // Recalculate Y axis domain based on visible datasets
            const [newMin, newMax] = getDynamicYAxisDomain(
              Math.min(...data.map(d => d.rankScore)),
              Math.max(...data.map(d => d.rankScore)),
              data,
              selectedTimeRange
            );
            
            // Update the chart's Y axis
            chart.options.scales.y.min = newMin;
            chart.options.scales.y.max = newMax;
            
            // Update rank annotations
            chart.options.plugins.annotation.annotations = getRankAnnotations();
            
            // Update the chart
            chart.update();
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
      pointRadius: 2,
      borderWidth: 2,
      tension: 0.01
    }))]
  } : null, [data, playerId, comparisonData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div ref={modalRef} className="bg-[#1a1f2e] rounded-lg p-6 w-full max-w-[80vw] max-h-[95vh] overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">{playerId} - Graph</h2>
            {data && (
              <p className="text-sm text-gray-400 mt-1">
                Data available from {data[0].timestamp.toLocaleDateString('en-GB')} to {new Date().toLocaleDateString('en-GB')}
              </p>
            )}
          </div>
          {isClubView && (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-blue-400">
                      Comparing available with club members only
                    </p>
                    <button
                      onClick={() => {
                        onClose();
                        onSwitchToGlobal(playerId);
                      }}
                      className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-full transition-colors"
                    >
                      Switch to Global View
                    </button>
                  </div>
                )}
          <div className="flex gap-2 items-center relative">
            {comparisonData.size < MAX_COMPARISONS && (
            <div className="relative">
              <button 
                onClick={() => setShowCompareSearch(true)}
                className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white relative transition-all duration-200 group"
                title="Compare with another player"
              >
                <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
                {showCompareHint && (
                  <div className="absolute -top-2 -right-2 w-5 h-5 bg-blue-500 rounded-full animate-pulse" />
                )}
              </button>
              {showCompareHint && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-xs py-1 px-2 rounded fade-out">
                  Try comparing players!
                </div>
              )}
            </div>
            )}
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
            
            {showCompareSearch && (
            <ComparePlayerSearch
              onSelect={handleAddComparison}
              mainPlayerId={playerId}
              globalLeaderboard={globalLeaderboard}
              comparisonData={comparisonData}
              onClose={() => setShowCompareSearch(false)}
            />
          )}
          </div>
        </div>

        {comparisonData.size > 0 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {Array.from(comparisonData.entries()).map(([compareId, { color }]) => (
              <div 
                key={compareId}
                className="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-1"
              >
                <span className="text-sm" style={{ color: color }}>{compareId}</span>
                <button
                  onClick={() => removeComparison(compareId)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="h-[calc(85vh-140px)] w-full">
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

PlayerGraphModal.propTypes = PlayerGraphModalProps;
ComparePlayerSearch.propTypes = ComparePlayerSearchProps;

export default PlayerGraphModal;