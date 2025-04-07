/*
This file is highly commented because of how annoying it is to deal with, it was my first time
working with chart.js so it's not coded in the best way possible, so I need all these comments
to keep up with it's logic. I'm sorry for the mess.
*/

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Plus, Search, Camera } from 'lucide-react';
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
import { formatMultipleUsernamesForUrl } from '../utils/urlHandler';
import { PlayerGraphModalProps, ComparePlayerSearchProps } from '../types/propTypes';
import { useModal } from '../context/ModalContext';

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
  Object.assign(tooltipEl.style, {
    background: '#1f2937',
    borderRadius: '8px', // softer rounded corners
    border: '1px solid #374151', // subtle border
    color: '#FAF9F6',
    opacity: 1,
    pointerEvents: 'none',
    position: 'absolute',
    transform: 'translate(-50%, -100%)', // position above cursor
    transition: 'all 0.15s ease-out', // smoother transition
    padding: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)' // deeper shadow
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

const COMPARISON_COLORS = [
  'rgba(255, 159, 64, 0.8)',  // Orange
  'rgba(153, 102, 255, 0.8)', // Purple
  'rgba(255, 99, 132, 0.8)',  // Pink
  'rgba(75, 163, 53, 0.8)', // Green
  'rgba(191, 102, 76, 0.8)',  // Terracotta
];

// Consolidate all time-related constants
const TIME = {
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000
};

// Misc
TIME.MINUTES_15 = 15 * TIME.MINUTE; // 15 minutes delay ~ between data points
TIME.TWO_HOURS = 2 * TIME.HOUR; // supposed to be for view window but I think it's bugged
TIME.SEVENTY_TWO_HOURS = 72 * TIME.HOUR; // for extrapolation visibility

// Time format for tooltips and such.
TIME.FORMAT = {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
};

// Time ranges for graph view
TIME.RANGES = {
  '24H': TIME.DAY,
  '7D': TIME.WEEK,
  'MAX': Infinity
};

// Display format times for x-axis
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
}
const MAX_COMPARISONS = 5;

const ComparePlayerSearch = ({ onSelect, mainPlayerId, globalLeaderboard, onClose, comparisonData, className = '' }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPlayers, setFilteredPlayers] = useState([]);
  const searchRef = useRef(null);

  // Find main player's score from leaderboard
  const getClosestPlayers = useCallback(() => {
    const mainPlayer = globalLeaderboard.find(p => p.name === mainPlayerId);
    if (!mainPlayer) return [];
  
    const mainRank = mainPlayer.rank;
    
    // Get all valid players (not the main player and not already in comparison)
    const validPlayers = globalLeaderboard.filter(player => 
      player.name !== mainPlayerId && 
      !Array.from(comparisonData.keys()).includes(player.name)
    );
    
    // Sort all valid players by the absolute difference from main player's rank
    const sortedByDistance = validPlayers
      .map(player => ({
        ...player,
        distance: Math.abs(player.rank - mainRank)
      }))
      .sort((a, b) => a.distance - b.distance);
  
    // Take the 50 closest players
    return sortedByDistance
      .slice(0, 50)
      .sort((a, b) => a.rank - b.rank); // Final sort by rank ascending
  }, [mainPlayerId, globalLeaderboard, comparisonData]);

  useEffect(() => {
    if (searchTerm) {
      // If there's a search term, filter by name/club tag
      const filtered = globalLeaderboard
        .filter(player => 
          player.name !== mainPlayerId && 
          !Array.from(comparisonData.keys()).includes(player.name) &&
          (player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           (player.clubTag && `[${player.clubTag}]`.toLowerCase().includes(searchTerm.toLowerCase())))
        )
        .slice(0, 50);
      setFilteredPlayers(filtered);
    } else {
      // If no search term, show closest players
      setFilteredPlayers(getClosestPlayers());
    }
  }, [searchTerm, mainPlayerId, globalLeaderboard, comparisonData, getClosestPlayers]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div ref={searchRef} className={`absolute right-0 top-12 w-96 bg-gray-800 rounded-lg shadow-lg p-4 z-50 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Add Player to Compare</h3>
        <button onClick={onClose} aria-label="Close comparisons" className="text-gray-400 hover:text-white sm:hidden">
          <X className="w-5 h-5 text-gray-400" />
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

      <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-800 scrollbar-thumb-rounded-full scrollbar-w-1.5 hover:scrollbar-thumb-gray-500">
        {filteredPlayers.length === 0 && (
          <div className="p-4 text-center text-gray-400 text-sm">
            No matching players found
            <div className="mt-1 text-xs">Try a different search term</div>
          </div>
        )}
        {filteredPlayers.map((player) => {
          const mainPlayer = globalLeaderboard.find(p => p.name === mainPlayerId);
          const scoreDiff = mainPlayer ? player.rankScore - mainPlayer.rankScore : 0;
     
          return (
            <div
              key={player.name}
              className="flex items-center justify-between p-3 hover:bg-gray-700/50 rounded-xl cursor-pointer transition-colors duration-150 group"
              onClick={() => onSelect(player)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-400 flex-shrink-0">#{player.rank}</span>
                <span className="text-white truncate">
                {player.clubTag && (
                  <span className="text-blue-300 font-medium">[{player.clubTag}] </span>
                )}{player.name}
                </span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md flex-shrink-0
                  ${scoreDiff > 0 ? 'bg-green-900/40 text-green-400' :
                  scoreDiff < 0 ? 'bg-red-900/40 text-red-400' :
                  'bg-gray-600/40 text-gray-300'}`}>
                    {scoreDiff > 0 ? '↑' : '↓'} {Math.abs(scoreDiff).toLocaleString()}
                </span>
              </div>
              <Plus className="w-5 h-5 text-gray-400 hover:text-white flex-shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PlayerGraphModal = ({ isOpen, onClose, playerId, compareIds = [], isClubView = false, globalLeaderboard = [], onSwitchToGlobal, isMobile }) => {
  const { setIsModalOpen, modalRef, setOnClose } = useModal();
  const [data, setData] = useState(null);
  const [comparisonData, setComparisonData] = useState(new Map());
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24H');
  const [viewWindow, setViewWindow] = useState(null);
  const [showCompareSearch, setShowCompareSearch] = useState(false);
  const chartRef = useRef(null);

  // Hints&Notifs&Dropdowns for features
  const [showCompareHint, setShowCompareHint] = useState(true);
  const [showZoomHint, setShowZoomHint] = useState(true);
  const [notifScreenshot, setNotifScreenshot] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const ssdropdownRef = useRef(null);

  // Add loading ref specifically to fix multiple api requests on URL fetch
  const isLoadingRef = useRef(false);
  const loadedCompareIdsRef = useRef(new Set());
  const shouldFollowUrlRef = useRef(true);

  // Detect if modal is open, if so do conditionals.
  useEffect(() => {
    if (isOpen) {
      setIsModalOpen(isOpen);
      setOnClose(() => onClose);
    }
  
    return () => {
      setIsModalOpen(false);
      setOnClose(null);
    };
  }, [isOpen, onClose, setIsModalOpen, setOnClose]);

  // Reset state when modal is opened with new player
  useEffect(() => {
    if (isOpen) {
      setData(null);
      setError(null);
      setViewWindow(null);
    }
  }, [isOpen]);

  // Temporary hint shown when comparison feature has been added
  useEffect(() => {
    if (showCompareHint) {
      const timer = setTimeout(() => {
        setShowCompareHint(false);
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [showCompareHint]);

  useEffect(() => {
    if (showZoomHint) {
      const timer = setTimeout(() => {
        setShowZoomHint(false);
      }, 6000); // Show for 6 seconds
  
      return () => clearTimeout(timer);
    }
  }, [showZoomHint]);

  // Convuluted method to remove dropdown in case of clicking outside of it...
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ssdropdownRef.current && !ssdropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
  
    // Add event listener when dropdown is shown
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
  
    // Clean up event listener
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showDropdown]);

  const handleZoomPanRef = useRef(() => {
    if (showZoomHint) {
      setShowZoomHint(false);
    }
  });

  // Function to determine the appropriate default time range based on data points
  const determineDefaultTimeRange = useCallback((data) => {
    if (!data?.length) return '24H';

    const now = new Date();
    const last24Hours = new Date(now - TIME.DAY);
    const last7Days = new Date(now - TIME.WEEK);

    // Count data points in last 24 hours
    const pointsIn24H = data.filter(point => 
      !point.isInterpolated && !point.isExtrapolated && 
      point.timestamp >= last24Hours
    ).length;

    if (pointsIn24H >= 2) return '24H';

    // Count data points in last 7 days
    const pointsIn7D = data.filter(point => 
      !point.isInterpolated && !point.isExtrapolated && 
      point.timestamp >= last7Days
    ).length;

    if (pointsIn7D >= 2) return '7D';

    return 'MAX';
  }, []);

  const getPointRadius = useCallback((ctx) => {
    if (!ctx.chart) return 3;  // Default size if chart context is not available
    
    // Get the current view range in milliseconds
    const timeRange = ctx.chart.scales.x.max - ctx.chart.scales.x.min;
    
    // If this is an interpolated/extrapolated point, hide it (including hover state) when zoomed out past 72 hours
    if ((ctx.raw?.raw?.isInterpolated || ctx.raw?.raw?.isExtrapolated) && timeRange > TIME.SEVENTY_TWO_HOURS) {
      return 0;  // This will prevent both the point and its hover state from showing
    }
    
    // Set initial point size based on whether it's interpolated/extrapolated
    const initialSize = (ctx.raw?.raw?.isInterpolated || ctx.raw?.raw?.isExtrapolated) ? 2.6 : 3;
    
    if (timeRange <= TIME.DAY) {
      // Maximum size when zoomed in a lot
      return initialSize;
    } else if (timeRange >= TIME.WEEK) {
      // Minimum size when zoomed out a lot
      return initialSize - (initialSize * 2/3);  // Reduces by same proportion as regular points
    } else {
      // Linear interpolation between sizes based on zoom level
      const zoomRatio = (timeRange - TIME.DAY) / (TIME.WEEK - TIME.DAY);
      return initialSize - ((initialSize * 2/3) * zoomRatio);  // Scale down proportionally
    }
  }, []);

  const externalTooltipHandler = useCallback((context) => {
    const { chart, tooltip } = context;

    // If the point is interpolated/extrapolated and should be invisible based on zoom level,
    // don't show the tooltip
    if (tooltip.dataPoints?.[0]?.raw?.raw) {
      const timeRange = chart.scales.x.max - chart.scales.x.min;
      const isHiddenPoint = (tooltip.dataPoints[0].raw.raw.isInterpolated || 
                            tooltip.dataPoints[0].raw.raw.isExtrapolated) && 
                            timeRange > TIME.SEVENTY_TWO_HOURS;
      
      if (isHiddenPoint) {
        return;  // Exit early without showing tooltip
      }
    }

    const tooltipEl = getOrCreateTooltip(chart);
  
    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = 0;
      return;
    }
  
    // Set Text
    if (tooltip.body) {
      const titleLines = tooltip.title || [];
      const bodyLines = tooltip.body.map(b => b.lines);
      // Parse the score using a locale-independent method
      const score = parseInt(bodyLines[0][0].split(': ')[1].replace(/[^\d]/g, ''));
      const rank = getRankFromScore(score);
      const datasetIndex = tooltip.dataPoints[0].datasetIndex;
      const dataPoint = tooltip.dataPoints[0].raw.raw;
        
      // Clear previous tooltip
      while (tooltipEl.firstChild) {
        tooltipEl.firstChild.remove();
      }

      // Create fresh table
      const tableRoot = document.createElement('table');
      tableRoot.style.margin = '0px';
      tooltipEl.appendChild(tableRoot);

      // Compact corner rank badge
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
        rankBadge.style.backgroundColor = '#3b82f6'; // blue instead of gray
        rankBadge.style.color = '#ffffff';
        rankBadge.style.fontSize = '11px';
        rankBadge.style.fontWeight = 'bold';
        rankBadge.style.padding = '3px 8px';
        rankBadge.style.borderRadius = '4px 0 4px 0';
        rankBadge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
        rankBadge.textContent = `#${dataPoint.rank.toLocaleString()}`;
      
        tooltipEl.appendChild(rankBadge);
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
  
      // Add score with locale-independent parsing and formatting
      const scoreRow = document.createElement('tr');
      scoreRow.style.borderWidth = 0;
      const scoreCell = document.createElement('td');
      scoreCell.style.borderWidth = 0;
      scoreCell.style.fontSize = '14px';
      scoreCell.style.fontWeight = 'bold';
      scoreCell.style.paddingTop = '4px';
      
      const scoreContainer = document.createElement('div');
      // Use the player's locale now that the regex is updated
      scoreContainer.appendChild(document.createTextNode(`Score: ${score.toLocaleString()}`));
      
      if (!dataPoint.isInterpolated && !dataPoint.isExtrapolated) {
        const dataset = datasetIndex === 0 ? data : Array.from(comparisonData.values())[datasetIndex - 1].data;
        const dataIndex = dataset.findIndex(d => d.timestamp.getTime() === dataPoint.timestamp.getTime());
        
        if (dataIndex > 0) {
          // Ensure locale-independent parsing for previous score
          const previousScore = dataset[dataIndex - 1].rankScore;
          const scoreChange = score - previousScore;
          const scoreChangeText = document.createElement('span');
          scoreChangeText.style.fontWeight = '600';
          scoreChangeText.style.marginLeft = '4px';
          scoreChangeText.style.fontSize = '12px';
          scoreChangeText.style.color = scoreChange > 0 ? '#10B981' : scoreChange < 0 ? '#EF4444' : '#9ca3af';
          // Use the player's locale now that the regex is updated
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
    const endTime = new Date(now + TIME.TWO_HOURS);
    const timeRangeMs = TIME.RANGES[range];
    
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
    const sevenDaysAgo = new Date(now - TIME.WEEK);
    
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
        timestamp: new Date(rawData[0].timestamp - TIME.MINUTES_15),
        isExtrapolated: true
      });
    }
    
    // Original interpolation logic
    for (let i = 0; i < rawData.length - 1; i++) {
      const currentPoint = rawData[i];
      const nextPoint = rawData[i + 1];
      
      interpolatedData.push(currentPoint);
      
      const timeDiff = nextPoint.timestamp - currentPoint.timestamp;
      
      if (timeDiff > TIME.MINUTES_15) {
        interpolatedData.push({
          ...currentPoint,
          timestamp: new Date(nextPoint.timestamp - TIME.MINUTES_15),
          isInterpolated: true
        });
      }
    }
    
    interpolatedData.push(rawData[rawData.length - 1]);
    
    const lastPoint = rawData[rawData.length - 1];
    const timeToNow = now - lastPoint.timestamp;
    
    if (timeToNow > TIME.MINUTES_15) {
      interpolatedData.push({
        ...lastPoint,
        timestamp: new Date(now),
        isInterpolated: true
      });
    }
    
    return interpolatedData;
  }, []);

  // Now we can define loadComparisonData after interpolateDataPoints
  const loadComparisonData = useCallback(async (compareId) => {
    try {
      const result = await fetchPlayerGraphData(compareId);
      if (!result.data?.length) return null;
      
      const parsedData = result.data.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
      
      return interpolateDataPoints(parsedData);
    } catch (error) {
      console.error(`Failed to load comparison data for ${compareId}:`, error);
      return null;
    }
  }, [interpolateDataPoints]);

  const handleAddComparison = useCallback(async (player) => {
    if (comparisonData.size >= MAX_COMPARISONS) {
      return;
    }
    
    // Stop following URL compareIds after manual addition
    shouldFollowUrlRef.current = false;
    
    const newData = await loadComparisonData(player.name);
    if (newData) {
      setComparisonData(prev => {
        const next = new Map(prev);
        next.set(player.name, {
          data: newData,
          color: COMPARISON_COLORS[next.size]
        });
        
        loadedCompareIdsRef.current.add(player.name);
        
        // Update URL with new comparison
        const currentCompares = Array.from(next.keys());
        const urlString = formatMultipleUsernamesForUrl(playerId, currentCompares);
        window.history.replaceState(null, '', `/graph/${urlString}`);
        
        return next;
      });
    }
    setShowCompareSearch(false);
  }, [loadComparisonData, comparisonData.size, playerId]);

  const removeComparison = useCallback((comparePlayerId) => {
    // Stop following URL compareIds after manual removal
    shouldFollowUrlRef.current = false;
    
    setComparisonData(prev => {
      const next = new Map(prev);
      next.delete(comparePlayerId);
      loadedCompareIdsRef.current.delete(comparePlayerId);
      
      // Reassign colors to maintain order
      const entries = Array.from(next.entries());
      entries.forEach(([id], index) => {
        next.set(id, {
          ...next.get(id),
          color: COMPARISON_COLORS[index]
        });
      });
      
      // Update URL after removal
      const currentCompares = Array.from(next.keys());
      const urlString = formatMultipleUsernamesForUrl(playerId, currentCompares);
      window.history.replaceState(null, '', `/graph/${urlString}`);
      
      return next;
    });
  }, [playerId]);


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
        const windowStart = new Date(now - TIME.RANGES[timeWindow]);
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
        (timeWindow === 'MAX' ? data[0].timestamp : new Date(new Date() - TIME.RANGES[timeWindow]));
      
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
    if (minScore === maxScore || (maxScore - minScore) < 10) {
      const buffer = Math.max(10, Math.round(minScore * 0.01)); // At least 10
      return [
        Math.max(0, minScore - buffer),
        maxScore + buffer
      ];
    }
    
    // Normal case with multiple different points
    const padding = Math.round((maxScore - minScore) * 0.10);
    return [Math.max(0, minScore - padding), maxScore + padding];
  }, [comparisonData, chartRef]);

  /* - Not currently in use, Embark switched to often changing people's RS without any method to track without other systems in place which are out of scope for this project right now.
  const getHighlightedPeriodAnnotation = useCallback((customTimeRange = null) => {
    if (!data?.length) return null;

    // RS Adjustment Period 1 S5
    const startTime = Date.UTC(2025, 0, 14, 14, 45, 0); // 2025-01-14T14:45:00Z
    const endTime = Date.UTC(2025, 0, 14, 16, 30, 0);   // 2025-01-14T16:30:00Z
    
    // Create Date objects from UTC timestamps (Time was set wrongly last time not accounting for locale timezone)
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    
    // Only show the highlight if it's within the visible range
    const min = customTimeRange?.min || viewWindow?.min;
    const max = customTimeRange?.max || viewWindow?.max;
    
    if (!min || !max || 
        (endDate < min) || 
        (startDate > max)) {
      return null;
    }
  
    // Check for data points in both main dataset and comparison datasets
    const hasDataPoints = (() => {
      // Check main dataset if it exists
      if (data?.some(point => {
        const timestamp = point.timestamp;
        return timestamp >= startDate && timestamp <= endDate;
      })) {
        return true;
      }
  
      // Check comparison datasets
      return Array.from(comparisonData.values()).some(({ data: compareData }) => 
        compareData.some(point => {
          const timestamp = point.timestamp;
          return timestamp >= startDate && timestamp <= endDate;
        })
      );
    })();
    
    // Don't show the highlight if there are no nearby data points in any dataset
    if (!hasDataPoints) {
      return null;
    }
  
    // Calculate the width of the highlighted period in the current view
    const totalViewDuration = max - min;
    const highlightDuration = endDate - startDate;
    const highlightWidthRatio = highlightDuration / totalViewDuration;
  
    // Show label if the highlighted period takes up more than 10% of the visible area
    const showLabel = highlightWidthRatio > 0.1;
  
    return {
      type: 'box',
      xMin: startDate,
      xMax: endDate,
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
  */

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

    /* - Line 923 for explanation
    // Add the highlighted period annotation if it exists
    const highlightAnnotation = getHighlightedPeriodAnnotation(customTimeRange);
    if (highlightAnnotation) {
      annotations.push(highlightAnnotation);
    }
    */

    return annotations;
  }, [data, getDynamicYAxisDomain, selectedTimeRange, /* getHighlightedPeriodAnnotation */]);

  const loadData = useCallback(async () => {
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
      setData(interpolatedData);
      
      // Set time range based on loaded data
      const defaultRange = determineDefaultTimeRange(interpolatedData);
      setSelectedTimeRange(defaultRange);
      const window = calculateViewWindow(interpolatedData, defaultRange);
      setViewWindow(window);
    } catch (error) {
      setError(`Failed to load player history: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [playerId, calculateViewWindow, interpolateDataPoints, determineDefaultTimeRange]);

  // Load data now, after init
  useEffect(() => {
    if (isOpen && playerId) {
      loadData();
    }
  }, [isOpen, playerId, loadData]);

  // Separate effect for handling time range changes
  useEffect(() => {
    if (data) {
      const window = calculateViewWindow(data, selectedTimeRange);
      setViewWindow(window);
      chartRef.current?.resetZoom();
    }
  }, [selectedTimeRange, data, calculateViewWindow]);

  // Get Comparisons from URL if any
  useEffect(() => {
    // Capture ref values at the start of the effect
    const loadedIds = loadedCompareIdsRef.current;
    const shouldFollowUrl = shouldFollowUrlRef.current;
    let isLoading = isLoadingRef.current;

    const loadInitialComparisons = async () => {
      // Skip if we shouldn't follow URL anymore or other conditions aren't met
      if (!isOpen || !compareIds?.length || !globalLeaderboard || 
          isLoading || !shouldFollowUrl) {
        return;
      }

      // Check if we already have exactly these comparisons
      const currentCompareIds = Array.from(comparisonData.keys());
      if (JSON.stringify(currentCompareIds) === JSON.stringify(compareIds)) {
        return;
      }

      isLoading = true;
      isLoadingRef.current = true;
      
      try {
        const newComparisons = new Map();
        
        for (const [index, compareId] of compareIds.entries()) {
          if (newComparisons.size >= MAX_COMPARISONS) break;
          
          const comparisonResult = await loadComparisonData(compareId);
          
          if (comparisonResult) {
            newComparisons.set(compareId, {
              data: comparisonResult,
              color: COMPARISON_COLORS[index]
            });
            loadedIds.add(compareId);
          }
        }
        
        if (newComparisons.size > 0) {
          setComparisonData(newComparisons);
        }
      } finally {
        isLoading = false;
        isLoadingRef.current = false;
      }
    };

    loadInitialComparisons();
    
    // Cleanup function uses captured values
    return () => {
      if (!isOpen) {
        loadedIds.clear();
        shouldFollowUrlRef.current = true; // Reset when modal closes
        isLoadingRef.current = false;
      }
    };
  }, [isOpen, compareIds, globalLeaderboard, comparisonData, loadComparisonData]);

  // Adjusted calculateYAxisStepSize function
  const calculateYAxisStepSize = useCallback((min, max) => {
    const range = max - min || 1;
    const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    const targetTicks = 5;
    
    // If no nice step found, use range/targetTicks rounded up to nearest nice step
    const fallbackStep = Math.ceil(range / targetTicks);
    return niceSteps.find(step => {
      const numTicks = range / step;
      return numTicks >= targetTicks && numTicks <= targetTicks * 2;
    }) || fallbackStep;
  }, []);

  const handleScreenshot = async (withBackground = true) => {
    const canvas = chartRef.current?.canvas;
    if (!canvas) return;
 
    try {
      // Create temporary canvas
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');
     
      // Set dimensions
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
     
      if (withBackground) {
        // Fill background
        ctx.fillStyle = '#1a1f2e';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      }
     
      // Draw original chart
      ctx.drawImage(canvas, 0, 0);
     
      // Add watermark
      ctx.save();
      ctx.globalAlpha = 0.15; // visible but still transparent
      ctx.font = 'bold 24px Arial';
      ctx.fillStyle = 'white';
     
      // Position watermark based on device type
      const watermarkText = 'https://ogclub.s4nt0s.eu';
      const textMetrics = ctx.measureText(watermarkText);
      
      ctx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
      
      if (isMobile) {
        // Better positioning for mobile
        ctx.translate(tempCanvas.width / 8, tempCanvas.height / 4);
      }
      
      ctx.rotate(-Math.PI / 6); // Slight diagonal angle
      ctx.fillText(watermarkText, -textMetrics.width / 2, 0);
      ctx.restore();
     
      // Convert to blob
      const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
     
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
     
      setNotifScreenshot(true);
      setTimeout(() => setNotifScreenshot(false), 1000);
      
      // Close dropdown after screenshot is taken
      setShowDropdown(false);
    } catch (err) {
      console.error('Failed to copy chart:', err);
      alert('Screenshot failed, please report this error.')
    }
  };

  const chartOptions = useMemo(() => data ? {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        type: 'time',
        time: {
          displayFormats: TIME.DISPLAY_FORMATS,
          // Ensure Chart.js knows to interpret timestamps as UTC
          parser: 'yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'',
          // Display in local timezone
          tooltipFormat: 'd MMM yyyy HH:mm',
          unit: 'hour',
          adapters: {
            date: {
              locale: Intl.DateTimeFormat().resolvedOptions().locale
            }
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
          align: 'end',
          callback: function(value) {
            // The value is already a timestamp in local time
            const date = new Date(value);
            return date.toLocaleDateString(undefined, TIME.FORMAT);
          }
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
          callback: value => Math.round(value).toLocaleString(),
          stepSize: calculateYAxisStepSize(
            data.length > 0 ? getDynamicYAxisDomain(
              Math.min(...data.map(d => d.rankScore)),
              Math.max(...data.map(d => d.rankScore)),
              data,
              selectedTimeRange
            )[0] : 0,
            data.length > 0 ? getDynamicYAxisDomain(
              Math.min(...data.map(d => d.rankScore)),
              Math.max(...data.map(d => d.rankScore)),
              data,
              selectedTimeRange
            )[1] : 100000
          ),
          maxTicksLimit: 15, // Limiting to 15 Y axis ticks
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
          onPanStart: handleZoomPanRef.current,
          onPan: function(ctx) {
            let timeRange = {
              min: ctx.chart.scales.x.min,
              max: ctx.chart.scales.x.max
            };

            // Hide tooltip if it's showing an interpolated/extrapolated point
            const tooltipEl = ctx.chart.canvas.parentNode.querySelector('div.rank-tooltip');
            if (tooltipEl) {
              const currentTimeRange = timeRange.max - timeRange.min;
              if (currentTimeRange > TIME.SEVENTY_TWO_HOURS) {
                tooltipEl.style.opacity = 0;
              }
            }

            const [newMin, newMax] = getDynamicYAxisDomain(
              Math.min(...data.map(d => d.rankScore)),
              Math.max(...data.map(d => d.rankScore)),
              data,
              selectedTimeRange,
              timeRange
            );
            
            ctx.chart.options.scales.y.min = newMin;
            ctx.chart.options.scales.y.max = newMax;
            
            // Recalculate step size
            ctx.chart.options.scales.y.ticks.stepSize = calculateYAxisStepSize(newMin, newMax);
            
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
          onZoomStart: handleZoomPanRef.current,
          onZoom: function(ctx) {
            let timeRange = {
              min: ctx.chart.scales.x.min,
              max: ctx.chart.scales.x.max
            };

            // Hide tooltip if it's showing an interpolated/extrapolated point
            const tooltipEl = ctx.chart.canvas.parentNode.querySelector('div.rank-tooltip');
            if (tooltipEl) {
              const currentTimeRange = timeRange.max - timeRange.min;
              if (currentTimeRange > TIME.SEVENTY_TWO_HOURS) {
                tooltipEl.style.opacity = 0;
              }
            }

            const [newMin, newMax] = getDynamicYAxisDomain(
              Math.min(...data.map(d => d.rankScore)),
              Math.max(...data.map(d => d.rankScore)),
              data,
              selectedTimeRange,
              timeRange
            );
            
            ctx.chart.options.scales.y.min = newMin;
            ctx.chart.options.scales.y.max = newMax;
            
            // Recalculate stepSize
            ctx.chart.options.scales.y.ticks.stepSize = calculateYAxisStepSize(newMin, newMax);
            
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
        position: 'nearest',
        callbacks: {
          title: (tooltipItems) => {
            // Format the timestamp in local timezone
            const date = new Date(tooltipItems[0].raw.x);
            return date.toLocaleString(undefined, TIME.FORMAT);
          }
        }
      },
      legend: {
        onClick: (evt, item, legend) => {
          const chart = chartRef.current;
          if (!chart) return;
        
          // Execute default legend visibility toggling first
          ChartJS.defaults.plugins.legend.onClick(evt, item, legend);
        
          setTimeout(() => {
            const xScale = chart.scales.x;
            const currentTimeWindow = { min: xScale.min, max: xScale.max };
        
            // Early exit if no visible datasets
            const visibleDatasets = chart.data.datasets.filter((_, index) => 
              chart.getDatasetMeta(index).visible
            );
            if (visibleDatasets.length === 0) return;
        
            // Collect scores from ALL visible points in current view window
            let allVisibleScores = [];
            chart.data.datasets.forEach((dataset, index) => {
              if (chart.getDatasetMeta(index).visible) {
                const visiblePoints = dataset.data.filter(d => 
                  d.x >= currentTimeWindow.min && 
                  d.x <= currentTimeWindow.max
                );
                allVisibleScores.push(...visiblePoints.map(d => d.raw?.rankScore).filter(Number.isFinite));
              }
            });
        
            // Handle empty visible scores (use current Y-axis range as fallback)
            const [newMin, newMax] = allVisibleScores.length > 0
              ? [
                  Math.min(...allVisibleScores),
                  Math.max(...allVisibleScores)
                ]
              : [
                  chart.options.scales.y.min,
                  chart.options.scales.y.max
                ];
        
            // Get padded Y-axis domain (using existing buffer logic)
            const [paddedMin, paddedMax] = getDynamicYAxisDomain(
              newMin,
              newMax,
              data,
              selectedTimeRange,
              currentTimeWindow
            );
        
            // Always update axis bounds
            chart.options.scales.y.min = paddedMin;
            chart.options.scales.y.max = paddedMax;
        
            // Update remaining chart properties
            chart.options.scales.y.ticks.stepSize = calculateYAxisStepSize(paddedMin, paddedMax);
            chart.options.plugins.annotation.annotations = getRankAnnotations(currentTimeWindow);
            chart.update();
          }, 0); // <-- 0ms timeout ensures this runs after visibility toggles
        },
        labels: {
          color: '#ffffff',
          boxWidth: 15,
          padding: 15,
          usePointStyle: true
        }
      }
    }
  } : null, [data, viewWindow, getDynamicYAxisDomain, getRankAnnotations, selectedTimeRange, externalTooltipHandler, calculateYAxisStepSize]);

  const chartData = useMemo(() => data ? {
    labels: data.map(d => d.timestamp),
    datasets: [{
      label: ` ${playerId}`,
      data: data.map(d => ({
          x: d.timestamp,
          y: d.rankScore,
          raw: {
            ...d,
            timestamp: d.timestamp,
            rankScore: d.rankScore,
            rank: d.rank,
        }
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
        borderWidth: ctx => { // this function is currently a placeholder in case needed in future (if updated check comparedata borderwidth too)
          if (!ctx.p0?.raw || !ctx.p1?.raw) return 2;
  
          const curr = ctx.p0.parsed.y;
          const next = ctx.p1.parsed.y;
          const isExtrapolated = ctx.p0.raw.raw.isExtrapolated || ctx.p1.raw.raw.isExtrapolated;
          const isInterpolated = ctx.p0.raw.raw.isInterpolated || ctx.p1.raw.raw.isInterpolated;
          const isEqual = curr === next;
          
          if (isExtrapolated) {
            return 2;   // Thinner line for extrapolated data
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
  } : null, [data, playerId, comparisonData, getPointRadius]);

  if (!isOpen || !playerId) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div ref={modalRef} className={`bg-[#1a1f2e] rounded-lg p-6 w-full overflow-hidden
        ${isMobile ? 'max-w-[95vw] max-h-[98vh]' : 'max-w-[80vw] max-h-[95vh]'}`}>
        <div className={`${isMobile ? 'flex flex-col gap-2' : 'flex justify-between items-center gap-4'} mb-4`}>
          <div className={`${isMobile ? 'w-full' : ''}`}>
            <div className="flex items-center justify-between">
              <h2 className={`font-bold text-white ${isMobile ? 'text-lg truncate max-w-[200px]' : 'text-xl'}`}>
                {playerId}
              </h2>
              {isMobile && (
                <button 
                  onClick={onClose}
                  aria-label="Close modal"
                  className="p-2 hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>
            {data && (
              <p className="text-sm text-gray-400 mt-1 truncate">
                {!isMobile ? 'Data available between ' : 'MAX: '} {`${new Date(data[0].timestamp).toLocaleDateString(undefined, TIME.FORMAT)} - ${new Date().toLocaleDateString(undefined, TIME.FORMAT)}`}
              </p>
            )}
          </div>
          {isClubView && (
            <div className={`flex-1 flex justify-center ${isMobile ? 'flex-col' : 'items-center'} gap-2`}>
              <p className="text-sm text-blue-400 truncate">
                Comparing available with club members only
              </p>
              <button
                onClick={() => onSwitchToGlobal()}
                className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-full transition-colors whitespace-nowrap"
              >
                Switch to Global View
              </button>
            </div>
          )}
          <div className={`relative flex flex-col ${isMobile ? 'w-full' : 'w-auto'}`}>
            <div className={`flex items-center ${isMobile ? 'w-full justify-between mb-2' : 'w-full justify-end gap-2'}`}>
              <div className="relative" ref={ssdropdownRef}>
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white relative"
                  title="Screenshot options"
                >
                  <Camera className="w-5 h-5" />
                  {notifScreenshot && (
                    <div
                      className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-xs py-1 px-2 rounded-md shadow-lg animate-fadeIn pointer-events-none"
                      onClick={(e) => e.stopPropagation()} // stop accidental clicks from triggering another screenshot
                    >
                      Screenshot copied! 📋
                    </div>
                  )}
                </button>
              
                {showDropdown && (
                  <div className={`absolute ${isMobile ? 'top-full mt-2 left-0' : 'right-0 mt-2'} w-48 bg-gray-800 rounded-md shadow-lg z-10`}>
                    <div className="py-1">
                      <button
                        onClick={() => handleScreenshot(true)}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                      >
                        With background
                      </button>
                      <button
                        onClick={() => handleScreenshot(false)}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                      >
                        Without background
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {comparisonData.size < MAX_COMPARISONS && (
                <div className="relative">
                  <button 
                    onClick={() => setShowCompareSearch(true)}
                    className={`p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white relative transition-all duration-200 group
                      ${isMobile ? 'mr-4' : ''}`}
                    title="Compare with another player"
                  >
                    <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
                    {showCompareHint && (
                      <div className="absolute -top-2 -right-2 w-5 h-5 bg-blue-500 rounded-full animate-pulse" />
                    )}
                  </button>
                  {showCompareHint && (
                    <div className={`absolute -top-8 whitespace-nowrap bg-gray-800 text-white text-xs py-1 px-2 rounded fade-out
                      ${isMobile ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
                      Try comparing players!
                    </div>
                  )}
                </div>
              )}
              <div className={`flex gap-2 bg-gray-800 rounded-lg p-1 ${isMobile ? 'flex-1 justify-center ml-2' : 'justify-end'}`}>
                {Object.keys(TIME.RANGES).map((range) => (
                  <button
                    key={range}
                    aria-pressed={selectedTimeRange === range}
                    onClick={() => setSelectedTimeRange(range)}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      selectedTimeRange === range
                        ? 'bg-gray-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                    } ${isMobile ? 'flex-1' : ''}`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>

            {showCompareSearch && (
              <ComparePlayerSearch
                onSelect={handleAddComparison}
                mainPlayerId={playerId}
                globalLeaderboard={globalLeaderboard}
                comparisonData={comparisonData}
                onClose={() => setShowCompareSearch(false)}
                className={`${isMobile 
                  ? 'absolute left-0 right-0 top-full mt-2 w-full max-w-[95vw] mx-auto' 
                  : 'absolute right-0 top-12 w-96'}`}
              />
            )}
          </div>
        </div>

        {comparisonData.size > 0 && (
          <div className={`flex gap-2 mb-4 ${
            isMobile 
              ? 'flex-wrap max-h-[100px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600' 
              : 'flex-wrap'
          }`}>
            {Array.from(comparisonData.entries()).map(([compareId, { color }]) => (
              <div 
                key={compareId}
                className={`flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-1 
                  ${isMobile ? 'flex-basis-[140px]' : 'whitespace-nowrap'}`}
              >
                <span className="text-sm truncate" style={{ color: color }}>{compareId}</span>
                <button
                  onClick={() => removeComparison(compareId)}
                  className="text-gray-400 hover:text-white flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={`w-full ${isMobile ? 'h-[calc(80vh-180px)]' : 'h-[calc(90vh-170px)]'}`}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-gray-400">{error}</div>
          ) : (
            <>
              {showZoomHint && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                                bg-gray-800 bg-opacity-90 text-white px-4 py-2 rounded-lg 
                                transition-opacity duration-300 cursor-pointer z-10 animate-fadeIn shadow-lg"
                                onClick={() => setShowZoomHint(false)} style={{ backdropFilter: 'blur(2px)' }}>
                  <div className="flex flex-col items-center gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M12 4v16m8-8H4" />
                      </svg>
                      <span>{isMobile ? 'Pinch to zoom' : 'Mouse wheel to zoom'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                      <span>{isMobile ? 'Touch and drag to pan' : 'Click and drag to pan'}</span>
                    </div>
                  </div>
                </div>
              )}
              <Line ref={chartRef} data={chartData} options={chartOptions} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

PlayerGraphModal.propTypes = PlayerGraphModalProps;
ComparePlayerSearch.propTypes = ComparePlayerSearchProps;

export default PlayerGraphModal;