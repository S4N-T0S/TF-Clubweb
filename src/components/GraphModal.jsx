/*
This file is highly commented because of how annoying it is to deal with, it was my first time
working with chart.js so it's not coded in the best way possible, so I need all these comments
to keep up with it's logic. I'm sorry for the mess.
*/

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Plus, Camera, SlidersHorizontal, UserPen, Gavel, ChevronsUpDown, Users } from 'lucide-react';
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
import { GraphModalProps, ComparePlayerModalProps, GraphSettingsModalProps, FilterToggleButtonProps } from '../types/propTypes';
import { useModal } from '../context/ModalProvider';
import { usePlayerGraphData } from '../hooks/usePlayerGraphData';
import { useChartConfig } from '../hooks/useChartConfig';
import { LoadingDisplay } from './LoadingDisplay';
import { SearchBar } from './SearchBar';
import { getStoredGraphSettings, setStoredGraphSettings } from '../services/localStorageManager';
import { SEASONS, getSeasonLeaderboard } from '../services/historicalDataService';

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
  FORMAT: {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }
};

// Time ranges for graph view
TIME.RANGES = {
  '24H': TIME.DAY,
  '7D': TIME.WEEK,
  'MAX': Infinity
};

const FilterToggleButton = ({ label, isActive, onClick, Icon, textColorClass, activeBorderClass }) => {
    const baseClasses = "flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors w-full border";
    const dynamicClasses = isActive
        ? `${activeBorderClass || 'border-blue-500'} bg-gray-700`
        : 'border-transparent bg-gray-700 hover:bg-gray-600';

    return (
        <button
            onClick={onClick}
            className={`${baseClasses} ${dynamicClasses}`}
        >
            {Icon && <Icon className={`w-4 h-4 ${textColorClass}`} />}
            <span className={textColorClass}>{label}</span>
        </button>
    );
};

const GraphSettingsModal = ({ settings, onSettingsChange, onClose, hasAnyEvents }) => {
  // Stabilize options with useMemo to prevent re-renders in useModal.
  const modalOptions = useMemo(() => ({ type: 'nested' }), []);
  const { modalRef } = useModal(true, onClose, modalOptions);
  const handleFilterChange = (key, value) => {
      onSettingsChange(prev => ({ ...prev, [key]: value }));
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in-fast">
      <div ref={modalRef} className="bg-gray-800 rounded-lg p-6 max-w-sm w-full border border-gray-600 shadow-xl relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Graph Event Settings</h3>
          <button onClick={onClose} aria-label="Close settings" className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        {!hasAnyEvents ? (
          <div className="p-4 text-center text-gray-400 text-sm">No events found in the current datasets.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FilterToggleButton label="Name" Icon={UserPen} isActive={settings.showNameChange} onClick={() => handleFilterChange('showNameChange', !settings.showNameChange)} textColorClass="text-indigo-400" activeBorderClass="border-indigo-400" />
            <FilterToggleButton label="Clubs" Icon={Users} isActive={settings.showClubChange} onClick={() => handleFilterChange('showClubChange', !settings.showClubChange)} textColorClass="text-teal-400" activeBorderClass="border-teal-400" />
            <FilterToggleButton label="Scores" Icon={ChevronsUpDown} isActive={settings.showRsAdjustment} onClick={() => handleFilterChange('showRsAdjustment', !settings.showRsAdjustment)} textColorClass="text-yellow-400" activeBorderClass="border-yellow-400" />
            <FilterToggleButton label="Bans" Icon={Gavel} isActive={settings.showSuspectedBan} onClick={() => handleFilterChange('showSuspectedBan', !settings.showSuspectedBan)} textColorClass="text-red-500" activeBorderClass="border-red-500" />
          </div>
        )}
        <div className="mt-5 pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-400 text-center mb-3">
            The settings button turns green to indicate that one or more event types are hidden from the graph.
          </p>
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-1">
              <div className="p-2 rounded-lg flex items-center bg-gray-700 text-gray-300">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <span className="text-xs text-gray-400">Default</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="p-2 rounded-lg flex items-center bg-green-600 text-white">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <span className="text-xs text-gray-400">Filtered</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 text-center italic mt-4">
          Learn more about events by clicking the information button on the events view page.
        </p>
      </div>
    </div>
  );
};

const ComparePlayerModal = ({ onSelect, mainEmbarkId, leaderboard, onClose, comparisonData, mainPlayerLastDataPoint, currentSeasonLabel, isMobile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPlayers, setFilteredPlayers] = useState([]);
  const searchInputRef = useRef(null);

  // Re-implement autoFocus since we are now using a component
  useEffect(() => {
    if (!isMobile && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isMobile]);
  
  // Stabilize options with useMemo to prevent re-renders in useModal.
  const modalOptions = useMemo(() => ({ type: 'nested' }), []);
  const { modalRef: modalContentRef } = useModal(true, onClose, modalOptions);

  // Find main player's score from leaderboard
  const getClosestPlayers = useCallback(() => {
    const mainPlayer = leaderboard.find(p => p.name === mainEmbarkId);

    // Get all valid players (not the main player and not already in comparison)
    const validPlayers = leaderboard.filter(player =>
      player.name !== mainEmbarkId &&
      !Array.from(comparisonData.keys()).includes(player.name)
    );

    let sortedPlayers;

    if (mainPlayer) {
      // Player is on the leaderboard, sort by rank distance
      const mainRank = mainPlayer.rank;
      sortedPlayers = validPlayers
        .map(player => ({ ...player, distance: Math.abs(player.rank - mainRank) }))
        .sort((a, b) => a.distance - b.distance);

    } else if (mainPlayerLastDataPoint) {
      // Player not on leaderboard, sort by rankScore distance to last known score
      const lastKnownScore = mainPlayerLastDataPoint.rankScore;
      sortedPlayers = validPlayers
        .map(player => ({ ...player, distance: Math.abs(player.rankScore - lastKnownScore) }))
        .sort((a, b) => a.distance - b.distance);

    } else {
      return []; // No main player on leaderboard and no graph data available.
    }

    // Take the 50 closest players and sort them by rank
    return sortedPlayers
      .slice(0, 50)
      .sort((a, b) => a.rank - b.rank); // Final sort by rank ascending
  }, [mainEmbarkId, leaderboard, comparisonData, mainPlayerLastDataPoint]);

  useEffect(() => {
    if (searchTerm) {
      // If there's a search term, filter by name/club tag
      const filtered = leaderboard
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
  }, [searchTerm, mainEmbarkId, leaderboard, comparisonData, getClosestPlayers]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in-fast">
      <div ref={modalContentRef} className="bg-gray-800 rounded-lg w-full max-w-xl lg:max-w-3xl border border-gray-600 shadow-xl relative flex flex-col max-h-[70dvh]">
        <header className="p-6 pb-4 flex-shrink-0 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white">
            Add Player to Compare
            <span className="text-base font-normal text-gray-400 ml-2">({currentSeasonLabel})</span>
          </h3>
          <button onClick={onClose} aria-label="Close comparisons" className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="px-6 pt-2 flex-shrink-0">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search players by name or club tag..."
            searchInputRef={searchInputRef}
          />
        </div>
        <div className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-800 px-6 pt-2 pb-6">
          {filteredPlayers.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">No matching players found.</div>
          ) : (
            filteredPlayers.map((player) => {
              const mainPlayer = leaderboard.find(p => p.name === mainEmbarkId);
              const baseScore = mainPlayer?.rankScore ?? mainPlayerLastDataPoint?.rankScore;
              const scoreDiff = baseScore !== undefined ? player.rankScore - baseScore : 0;
              return (
                <div
                  key={player.name}
                  className="flex items-center justify-between p-3 hover:bg-gray-700/50 rounded-xl cursor-pointer transition-colors duration-150 group"
                  onClick={() => onSelect(player)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-400 w-10 flex-shrink-0">#{player.rank}</span>
                    <span className="text-white truncate">
                      {player.clubTag && <span className="text-blue-300 font-medium">[{player.clubTag}] </span>}
                      {player.name}
                    </span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md flex-shrink-0 ${scoreDiff > 0 ? 'bg-green-900/40 text-green-400' : scoreDiff < 0 ? 'bg-red-900/40 text-red-400' : 'bg-gray-600/40 text-gray-300'}`}>
                      {scoreDiff > 0 ? '↑' : scoreDiff < 0 ? '↓' : '~'} {Math.abs(scoreDiff).toLocaleString()}
                    </span>
                  </div>
                  <Plus className="w-5 h-5 text-gray-400 group-hover:text-white flex-shrink-0 transition-colors" />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

const GraphModal = ({ isOpen, onClose, embarkId, compareIds = [], seasonId, isClubView = false, globalLeaderboard = [], onSwitchToGlobal, isMobile }) => {
  const { modalRef, isActive } = useModal(isOpen, onClose);
  const chartRef = useRef(null);

  // UI State
  const [currentSeasonId, setCurrentSeasonId] = useState(seasonId);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24H');
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showCompareHint, setShowCompareHint] = useState(true);
  const [showZoomHint, setShowZoomHint] = useState(true);
  const [notifScreenshot, setNotifScreenshot] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const ssdropdownRef = useRef(null);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const seasonDropdownRef = useRef(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [eventSettings, setEventSettings] = useState(getStoredGraphSettings);

  const [comparisonLeaderboard, setComparisonLeaderboard] = useState([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(true);

  // When modal is opened for a different player or base season, reset local state
  useEffect(() => {
    if (isOpen) {
      setCurrentSeasonId(seasonId);
    }
  }, [isOpen, seasonId]);

  const seasonConfig = useMemo(() => {
    return Object.values(SEASONS).find(s => s.id === currentSeasonId);
  }, [currentSeasonId]);
  const isHistoricalSeason = useMemo(() => seasonConfig && !seasonConfig.isCurrent, [seasonConfig]);

  // Persist settings when they change
  useEffect(() => {
    setStoredGraphSettings(eventSettings);
  }, [eventSettings]);

  const areFiltersActive = useMemo(() => {
    // Filters are active if any event type is turned off (not the default state).
    return !eventSettings.showNameChange || !eventSettings.showClubChange || !eventSettings.showRsAdjustment || !eventSettings.showSuspectedBan;
  }, [eventSettings]);

  // Custom hook for data fetching and management
  const {
    data,
    events,
    mainPlayerGameCount,
    mainPlayerAvailableSeasons,
    comparisonData,
    loading,
    error,
    addComparison,
    removeComparison,
    switchSeason,
    mainPlayerCurrentId,
  } = usePlayerGraphData(isOpen, embarkId, compareIds, seasonId, eventSettings);

  // Handler for zoom/pan to hide hint
  const handleZoomPan = useCallback(() => {
    if (showZoomHint) {
      setShowZoomHint(false);
    }
  }, [showZoomHint]);

  // Custom hook for Chart.js configuration
  const { chartOptions, chartData } = useChartConfig({
    data,
    events,
    comparisonData,
    embarkId: mainPlayerCurrentId || embarkId,
    selectedTimeRange,
    chartRef,
    onZoomPan: handleZoomPan,
    eventSettings,
    seasonId: currentSeasonId,
  });

  useEffect(() => {
    // This effect addresses a timing issue in Chart.js where label positions
    // might not update correctly on initial load or after a time range change.
    // By forcing a second update after a short delay, we ensure the chart's
    // internal scales and coordinates are fully synchronized before the final render.
    if (chartRef.current) {
      const timer = setTimeout(() => {
        if (chartRef.current) {
          // Use 'none' to prevent re-running animations, which could look jerky.
          chartRef.current.update('none');
        }
      }, 75); // A small delay for the initial render to complete.
      return () => clearTimeout(timer);
    }
    // By including chartData, this effect now also runs on the initial data load,
    // fixing the issue where annotation labels might not appear until the first zoom/pan.
  }, [selectedTimeRange, eventSettings, chartData]);

  useEffect(() => {
    if (!isOpen) return;
    setIsLeaderboardLoading(true);

    const seasonKey = Object.keys(SEASONS).find(key => SEASONS[key].id === currentSeasonId);

    if (isClubView) {
      // isClubView is always current season, globalLeaderboard prop contains rankedClubMembers
      setComparisonLeaderboard(globalLeaderboard);
    } else if (seasonKey && !SEASONS[seasonKey].isCurrent) {
      // Historical season
      const { leaderboard } = getSeasonLeaderboard(seasonKey);
      setComparisonLeaderboard(leaderboard);
    } else {
      // Current season global view
      setComparisonLeaderboard(globalLeaderboard);
    }
    setIsLeaderboardLoading(false);
  }, [isOpen, currentSeasonId, isClubView, globalLeaderboard]);


  const displayedEmbarkId = mainPlayerCurrentId || embarkId;

  // --- Stabilized Callbacks for Nested Modals ---
  const handleSelectPlayer = useCallback((player) => {
      addComparison(player);
      setShowCompareModal(false);
  }, [addComparison]);

  const handleCloseCompareModal = useCallback(() => {
      setShowCompareModal(false);
  }, []);

  const handleCloseSettingsModal = useCallback(() => {
      setShowSettingsModal(false);
  }, []);

  const handleSeasonChange = useCallback((newSeasonId) => {
    if (newSeasonId !== currentSeasonId) {
      setCurrentSeasonId(newSeasonId);
      switchSeason(newSeasonId);
    }
    setShowSeasonDropdown(false);
  }, [currentSeasonId, switchSeason]);


  const hasAnyEvents = useMemo(() => {
    if (events?.some(e => ['NAME_CHANGE', 'CLUB_CHANGE', 'RS_ADJUSTMENT', 'SUSPECTED_BAN'].includes(e.event_type))) {
      return true;
    }
    if (comparisonData.size > 0) {
      for (const compare of comparisonData.values()) {
        if (compare.events?.some(e => ['NAME_CHANGE', 'CLUB_CHANGE', 'RS_ADJUSTMENT', 'SUSPECTED_BAN'].includes(e.event_type))) {
          return true;
        }
      }
    }
    return false;
  }, [events, comparisonData]);

  // Function to determine the appropriate default time range based on actual game data points
  const determineDefaultTimeRange = useCallback((data) => {
    if (!data?.length) return '24H';

    const seasonConfig = Object.values(SEASONS).find(s => s.id === currentSeasonId);
    const seasonEndDate = seasonConfig?.endTimestamp ? new Date(seasonConfig.endTimestamp * 1000) : null;
    const now = seasonEndDate || new Date();

    const last24Hours = new Date(now - TIME.DAY);
    const last7Days = new Date(now - TIME.WEEK);

    const pointsIn24H = data.filter(point =>
      point.scoreChanged && // Only count actual game points (score changed), not tracking or synthetic points.
      !point.isInterpolated && !point.isExtrapolated &&
      point.timestamp >= last24Hours
    ).length;

    if (pointsIn24H >= 2) return '24H';

    const pointsIn7D = data.filter(point =>
      point.scoreChanged && // Only count actual game points (score changed), not tracking or synthetic points.
      !point.isInterpolated && !point.isExtrapolated &&
      point.timestamp >= last7Days
    ).length;

    if (pointsIn7D >= 2) return '7D';

    return 'MAX';
  }, [currentSeasonId]);

  // Set default time range when data loads
  useEffect(() => {
    if (data) {
      if (isHistoricalSeason) {
        setSelectedTimeRange('MAX');
      } else {
        const defaultRange = determineDefaultTimeRange(data);
        setSelectedTimeRange(defaultRange);
      }
    }
  }, [data, determineDefaultTimeRange, isHistoricalSeason]);

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
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(event.target)) {
        setShowSeasonDropdown(false);
      }
    };
    if (showDropdown || showSeasonDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showDropdown, showSeasonDropdown]);

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

  const { seasonKey, currentSeasonLabel } = useMemo(() => {
    const key = Object.keys(SEASONS).find(k => SEASONS[k].id === currentSeasonId);
    if (!key) return { seasonKey: '', currentSeasonLabel: '' };

    return {
      seasonKey: key,
      currentSeasonLabel: SEASONS[key].label,
    };
  }, [currentSeasonId]);

  if (!isOpen || !embarkId) return null;

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4`}>
      <div
        ref={modalRef}
        className={`
          bg-[#1a1f2e] rounded-lg p-6 w-full overflow-hidden grid grid-rows-[auto_1fr] gap-4
          transition-transform duration-75 ease-out
          ${isMobile ? 'max-w-[95dvw] h-[95dvh]' : 'max-w-[80dvw] h-[85dvh]'}
          ${isActive ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}
        `}
      >
        {showCompareModal && !isLeaderboardLoading && (
          <ComparePlayerModal
            onSelect={handleSelectPlayer}
            mainEmbarkId={displayedEmbarkId}
            leaderboard={comparisonLeaderboard}
            onClose={handleCloseCompareModal}
            comparisonData={comparisonData}
            mainPlayerLastDataPoint={data?.[data.length - 1]}
            currentSeasonLabel={currentSeasonLabel}
            isMobile={isMobile}
          />
        )}
        {showSettingsModal && (
            <GraphSettingsModal
                settings={eventSettings}
                onSettingsChange={setEventSettings}
                onClose={handleCloseSettingsModal}
                hasAnyEvents={hasAnyEvents}
            />
        )}
        <div>
          <div className={`${isMobile ? 'flex flex-col gap-2' : 'flex justify-between items-center gap-4'}`}>
            <div className={`${isMobile ? 'w-full' : ''}`}>
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2.5 ${isMobile ? 'min-w-0' : ''}`}>
                  <h2 className={`font-bold text-white truncate ${isMobile ? 'text-lg' : 'text-xl'}`}>
                    {displayedEmbarkId}
                  </h2>
                  <div ref={seasonDropdownRef} className="relative group flex-shrink-0">
                    <button
                      onClick={() => setShowSeasonDropdown(p => !p)}
                      disabled={loading || mainPlayerAvailableSeasons.length <= 1}
                      className="flex items-center gap-1.5 bg-gray-700 text-blue-300 text-xs font-semibold px-2 py-1 rounded-md disabled:opacity-70 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
                      title="Switch season"
                    >
                      <span>{isMobile ? seasonKey : currentSeasonLabel}</span>
                      {mainPlayerAvailableSeasons.length > 1 && <ChevronsUpDown className="w-3 h-3"/>}
                    </button>
                    {showSeasonDropdown && (
                      <div className="absolute top-full left-0 mt-2 w-max min-w-full bg-gray-800 border border-gray-600 rounded-md shadow-lg z-20 animate-fade-in-fast overflow-hidden">
                        {mainPlayerAvailableSeasons
                          .sort((a,b) => b.id - a.id)
                          .map(season => (
                          <button
                            key={season.id}
                            onClick={() => handleSeasonChange(season.id)}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors flex flex-col items-start ${currentSeasonId === season.id ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-700'}`}
                          >
                            <span className="font-medium">{season.name}</span>
                            <span className={`text-[11px] mt-0.5 ${currentSeasonId === season.id ? 'text-blue-200' : 'text-gray-400'}`}>
                                as {season.embarkId}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {data && mainPlayerGameCount > 0 && (
                    <div className="relative group flex-shrink-0">
                      <div className="bg-gray-700 text-gray-300 text-xs font-medium px-2 py-1 rounded-md cursor-help">
                        {mainPlayerGameCount} games
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[80vw] sm:max-w-[250px] bg-gray-900 text-white text-center text-xs rounded py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20 shadow-lg border border-gray-700 whitespace-normal">
                        {GAME_COUNT_TOOLTIP}
                      </div>
                    </div>
                  )}
                </div>
                {isMobile && (
                  <button
                    onClick={onClose}
                    aria-label="Close modal"
                    className="p-2 hover:bg-gray-700 rounded-lg flex-shrink-0"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                )}
              </div>
              {data && (
                <p className="text-sm text-gray-400 mt-1 truncate">
                  {!isMobile ? 'Data available between ' : 'MAX: '} {`${new Date(data[0].timestamp).toLocaleString(undefined, TIME.FORMAT)} - ${new Date(data[data.length - 1].timestamp).toLocaleString(undefined, TIME.FORMAT)}`}
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
            <div className={`relative flex flex-col ${isMobile ? 'w-full' : 'flex-shrink min-w-0'}`}>
              <div className={`flex items-center flex-wrap ${isMobile ? 'w-full justify-between' : 'justify-end gap-2'}`}>
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
                 <button
                    onClick={() => setShowSettingsModal(true)}
                    className={`p-2 rounded-lg transition-colors ${
                      areFiltersActive 
                        ? 'bg-green-600 text-white hover:bg-green-500' 
                        : 'hover:bg-gray-700 text-gray-400 hover:text-white'
                    }`}
                    title="Event Settings"
                >
                    <SlidersHorizontal className="w-5 h-5" />
                </button>
                {comparisonData.size < MAX_COMPARISONS && (
                  <div className="relative">
                    <button
                      onClick={() => setShowCompareModal(true)}
                      className={`p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white relative transition-all duration-200 group
                        ${isMobile ? 'mr-4' : ''}`}
                      title="Compare with another player"
                      aria-label="Compare with another player"
                      disabled={isLeaderboardLoading}
                    >
                      <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
                      {showCompareHint && (
                        <div className="absolute -bottom-2 -right-2 w-5 h-5 bg-blue-500 rounded-full animate-pulse" />
                      )}

                      {showCompareHint && (
                        <div className={`absolute top-full mt-2 whitespace-nowrap bg-gray-800 text-white text-xs py-1 px-2 rounded fade-out pointer-events-none
                          ${isMobile ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
                          Try comparing!
                        </div>
                      )}
                    </button>
                  </div>
                )}
                <div className={`flex gap-2 bg-gray-800 rounded-lg p-1 ${isMobile ? 'flex-1 justify-center ml-2' : ''}`}>
                  {Object.keys(TIME.RANGES).map((range) => (
                    <button
                      key={range}
                      aria-pressed={selectedTimeRange === range}
                      onClick={() => !isHistoricalSeason && setSelectedTimeRange(range)}
                      disabled={isHistoricalSeason}
                      title={isHistoricalSeason ? 'Disabled for historical seasons' : 'Select time range'}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        selectedTimeRange === range
                          ? 'bg-gray-600 text-white'
                          : 'text-gray-400'
                      } ${isHistoricalSeason
                          ? 'cursor-not-allowed'
                          : 'hover:text-white hover:bg-gray-700'
                      } ${isMobile ? 'flex-1' : ''}`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
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
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[80vw] sm:max-w-[250px] bg-gray-900 text-white text-center text-xs rounded py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20 shadow-lg border border-gray-700 whitespace-normal">
                          {GAME_COUNT_TOOLTIP}
                        </div>
                      </div>
                    )
                  )}

                  <button
                    onClick={() => removeComparison(compareId)}
                    title={`Remove ${compareId}`}
                    aria-label={`Remove ${compareId}`}
                    className="text-gray-400 hover:text-white flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="relative w-full min-h-0 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingDisplay variant="component" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-gray-400">{error}</div>
          ) : (
            <>
              {showZoomHint && (
                <div
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800 bg-opacity-90 text-white px-4 py-2 rounded-lg transition-opacity duration-300 cursor-pointer z-10 animate-fadeIn shadow-lg"
                  onClick={() => setShowZoomHint(false)}
                  style={{ backdropFilter: 'blur(2px)' }}
                >
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
ComparePlayerModal.propTypes = ComparePlayerModalProps;
GraphSettingsModal.propTypes = GraphSettingsModalProps;
FilterToggleButton.propTypes = FilterToggleButtonProps;

export default GraphModal;