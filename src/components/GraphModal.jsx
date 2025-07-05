/*
This file is highly commented because of how annoying it is to deal with, it was my first time
working with chart.js so it's not coded in the best way possible, so I need all these comments
to keep up with it's logic. I'm sorry for the mess.
*/

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { GraphModalProps, ComparePlayerSearchProps } from '../types/propTypes';
import { useModal } from '../context/ModalProvider';
import { usePlayerGraphData } from '../hooks/usePlayerGraphData';
import { useChartConfig } from '../hooks/useChartConfig';

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
const GAME_COUNT_TOOLTIP = "Estimated games played from tracked data. This count may not be 100% accurate due to events like rank score adjustments, username changes and games whilst placed under 10k in the leaderboard.";
const MAX_COMPARISONS = 5;

// Consolidate all time-related constants
const TIME = {
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
};

// Time ranges for graph view
TIME.RANGES = {
  '24H': TIME.DAY,
  '7D': TIME.WEEK,
  'MAX': Infinity
};

// Time format for tooltips and such.
TIME.FORMAT = {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
};

const ComparePlayerSearch = ({ onSelect, mainEmbarkId, globalLeaderboard, onClose, comparisonData, className = '' }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPlayers, setFilteredPlayers] = useState([]);
  const searchRef = useRef(null);

  // Find main player's score from leaderboard
  const getClosestPlayers = useCallback(() => {
    const mainPlayer = globalLeaderboard.find(p => p.name === mainEmbarkId);
    if (!mainPlayer) return [];
  
    const mainRank = mainPlayer.rank;
    
    // Get all valid players (not the main player and not already in comparison)
    const validPlayers = globalLeaderboard.filter(player => 
      player.name !== mainEmbarkId && 
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
  }, [mainEmbarkId, globalLeaderboard, comparisonData]);

  useEffect(() => {
    if (searchTerm) {
      // If there's a search term, filter by name/club tag
      const filtered = globalLeaderboard
        .filter(player => 
          player.name !== mainEmbarkId && 
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
  }, [searchTerm, mainEmbarkId, globalLeaderboard, comparisonData, getClosestPlayers]);

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
          const mainPlayer = globalLeaderboard.find(p => p.name === mainEmbarkId);
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

const GraphModal = ({ isOpen, onClose, embarkId, compareIds = [], isClubView = false, globalLeaderboard = [], onSwitchToGlobal, isMobile }) => {
  const { modalRef, isActive } = useModal(isOpen, onClose);
  const chartRef = useRef(null);
  
  // UI State
  const [selectedTimeRange, setSelectedTimeRange] = useState('24H');
  const [showCompareSearch, setShowCompareSearch] = useState(false);
  const [showCompareHint, setShowCompareHint] = useState(true);
  const [showZoomHint, setShowZoomHint] = useState(true);
  const [notifScreenshot, setNotifScreenshot] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const ssdropdownRef = useRef(null);

  // Custom hook for data fetching and management
  const {
    data,
    mainPlayerGameCount,
    comparisonData,
    loading,
    error,
    addComparison,
    removeComparison,
  } = usePlayerGraphData(isOpen, embarkId, compareIds, globalLeaderboard);

  // Function to determine the appropriate default time range based on data points
  const determineDefaultTimeRange = useCallback((data) => {
    if (!data?.length) return '24H';

    const now = new Date();
    const last24Hours = new Date(now - TIME.DAY);
    const last7Days = new Date(now - TIME.WEEK);

    const pointsIn24H = data.filter(point => 
      !point.isInterpolated && !point.isExtrapolated && 
      point.timestamp >= last24Hours
    ).length;

    if (pointsIn24H >= 2) return '24H';

    const pointsIn7D = data.filter(point => 
      !point.isInterpolated && !point.isExtrapolated && 
      point.timestamp >= last7Days
    ).length;

    if (pointsIn7D >= 2) return '7D';

    return 'MAX';
  }, []);

  // Set default time range when data loads
  useEffect(() => {
    if (data) {
      const defaultRange = determineDefaultTimeRange(data);
      setSelectedTimeRange(defaultRange);
    }
  }, [data, determineDefaultTimeRange]);

  // Handler for zoom/pan to hide hint
  const handleZoomPan = useCallback(() => {
    if (showZoomHint) {
      setShowZoomHint(false);
    }
  }, [showZoomHint]);

  // Custom hook for Chart.js configuration
  const { chartOptions, chartData } = useChartConfig({
    data,
    comparisonData,
    embarkId,
    selectedTimeRange,
    chartRef,
    onZoomPan: handleZoomPan,
  });

  // UI Effects for hints and dropdowns
  useEffect(() => {
    if (showCompareHint) {
      const timer = setTimeout(() => setShowCompareHint(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showCompareHint]);

  useEffect(() => {
    if (showZoomHint) {
      const timer = setTimeout(() => setShowZoomHint(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [showZoomHint]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ssdropdownRef.current && !ssdropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showDropdown]);

  const handleScreenshot = async (withBackground = true) => {
    const canvas = chartRef.current?.canvas;
    if (!canvas) return;
 
    try {
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');
     
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
     
      if (withBackground) {
        ctx.fillStyle = '#1a1f2e';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      }
     
      ctx.drawImage(canvas, 0, 0);
     
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.font = 'bold 24px Arial';
      ctx.fillStyle = 'white';
     
      const watermarkText = 'https://ogclub.s4nt0s.eu';
      const textMetrics = ctx.measureText(watermarkText);
      
      ctx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
      
      if (isMobile) {
        ctx.translate(tempCanvas.width / 8, tempCanvas.height / 4);
      }
      
      ctx.rotate(-Math.PI / 6);
      ctx.fillText(watermarkText, -textMetrics.width / 2, 0);
      ctx.restore();
     
      const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
     
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
     
      setNotifScreenshot(true);
      setTimeout(() => setNotifScreenshot(false), 1000);
      
      setShowDropdown(false);
    } catch (err) {
      console.error('Failed to copy chart:', err);
      alert('Screenshot failed, please report this error.')
    }
  };

  if (!isOpen || !embarkId) return null;

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4`}>
      <div ref={modalRef} className={`bg-[#1a1f2e] rounded-lg p-6 w-full overflow-hidden grid grid-rows-[auto_1fr] gap-4 transition-transform duration-75 ease-out
        ${isMobile ? 'max-w-[95vw] h-[95vh]' : 'max-w-[80vw] h-[85vh]'}
        ${isActive ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}
        `}>
        <div>
          <div className={`${isMobile ? 'flex flex-col gap-2' : 'flex justify-between items-center gap-4'}`}>
            <div className={`${isMobile ? 'w-full' : ''}`}>
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2.5 ${isMobile ? 'min-w-0' : ''}`}>
                  <h2 className={`font-bold text-white truncate ${isMobile ? 'text-lg' : 'text-xl'}`}>
                    {embarkId}
                  </h2>
                  {data && mainPlayerGameCount > 0 && (
                    <div className="relative group flex-shrink-0">
                      <div className="bg-gray-700 text-gray-300 text-xs font-medium px-2 py-1 rounded-md cursor-help">
                        {mainPlayerGameCount} games
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[250px] bg-gray-900 text-white text-center text-xs rounded py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20 shadow-lg border border-gray-700 whitespace-normal">
                        {GAME_COUNT_TOOLTIP}
                      </div>
                    </div>
                  )}
                </div>
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
              <div className={`flex items-center ${isMobile ? 'w-full justify-between' : 'w-full justify-end gap-2'}`}>
                <div className="relative" ref={ssdropdownRef}>
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white relative"
                    title="Screenshot options"
                    aria-haspopup="true"
                    aria-expanded={showDropdown}
                  >
                    <Camera className="w-5 h-5" />
                    {notifScreenshot && (
                      <div
                        className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-xs py-1 px-2 rounded-md shadow-lg animate-fadeIn pointer-events-none"
                        onClick={(e) => e.stopPropagation()}
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
                      aria-label="Compare with another player"
                    >
                      <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
                      {showCompareHint && (
                        <div className="absolute -bottom-2 -right-2 w-5 h-5 bg-blue-500 rounded-full animate-pulse" />
                      )}

                      {showCompareHint && (
                        <div className={`absolute top-full mt-2 whitespace-nowrap bg-gray-800 text-white text-xs py-1 px-2 rounded fade-out pointer-events-none
                          ${isMobile ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
                          Try comparing players!
                        </div>
                      )}
                    </button>
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
                  onSelect={addComparison}
                  mainEmbarkId={embarkId}
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
            <div className={`flex gap-2 mt-4 ${
              isMobile 
                ? 'flex-wrap max-h-[100px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600' 
                : 'flex-wrap'
            }`}>
              {Array.from(comparisonData.entries()).map(([compareId, { color, gameCount }]) => (
                <div 
                  key={compareId}
                  className={`flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-1 
                    ${isMobile ? 'flex-basis-[140px]' : 'whitespace-nowrap'}`}
                >
                  <span className="text-sm truncate" style={{ color: color }}>{compareId}</span>
                  
                  {gameCount > 0 && (
                    isMobile ? (
                      <span className="text-gray-400 text-xs">({gameCount})</span>
                    ) : (
                      <div className="relative group">
                        <span className="text-gray-400 text-xs cursor-help">({gameCount})</span>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[250px] bg-gray-900 text-white text-center text-xs rounded py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20 shadow-lg border border-gray-700 whitespace-normal">
                          {GAME_COUNT_TOOLTIP}
                        </div>
                      </div>
                    )
                  )}

                  <button
                    onClick={() => removeComparison(compareId)}
                    title={`Remove ${compareId} from comparison`}
                    aria-label={`Remove ${compareId} from comparison`}
                    className="text-gray-400 hover:text-white flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="relative w-full min-h-0">
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
              {chartData && chartOptions && <Line ref={chartRef} data={chartData} options={chartOptions} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

GraphModal.propTypes = GraphModalProps;
ComparePlayerSearch.propTypes = ComparePlayerSearchProps;

export default GraphModal;