/*
This file is highly commented because of how annoying it is to deal with, it was my first time
working with chart.js so it's not coded in the best way possible, so I need all these comments
to keep up with it's logic. I'm sorry for the mess.
*/

import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Plus, Settings, UserPen, Gavel, ChevronsUpDown, Users, AlertTriangle, RefreshCcw, Info, Trophy, Flame, TrendingUp, TrendingDown, Calendar, Activity, Zap, Star, Hash, Gem } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import { useModal } from '../../context/ModalProvider';
import { usePlayerGraphData } from '../../hooks/usePlayerGraphData';
import { useChartConfig } from '../../hooks/useChartConfig';
import { useVisibility } from '../../hooks/useVisibility';
import { LoadingDisplay } from '../LoadingDisplay';
import { SearchBar } from '../SearchBar';
import { getStoredGraphSettings, setStoredGraphSettings } from '../../services/localStorageManager';
import { SEASONS, getSeasonLeaderboard } from '../../services/historicalDataService';
import { filterPlayerByQuery } from '../../utils/searchUtils';
import { formatTimeAgo } from '../../utils/timeUtils';

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

const FilterToggleButton = ({ label, isActive, onClick, Icon, textColorClass, activeBorderClass, disabled = false, title }) => {
  const baseClasses = "grow sm:grow-0 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all w-full border";
  const dynamicClasses = disabled
    ? 'border-gray-800 bg-gray-800/20 opacity-40 cursor-not-allowed'
    : isActive
      ? `${activeBorderClass || 'border-blue-500'} bg-gray-800/80 shadow-inner`
      : 'border-gray-700 bg-gray-800/30 hover:bg-gray-700/50 opacity-60 hover:opacity-100 grayscale-[0.5]';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={`${baseClasses} ${dynamicClasses}`}
    >
      {Icon && <Icon className={`w-4 h-4 ${disabled ? 'text-gray-500' : isActive ? textColorClass : 'text-gray-400'}`} />}
      <span className={disabled ? 'text-gray-500 font-medium' : isActive ? textColorClass : 'text-gray-400 font-medium'}>{label}</span>
    </button>
  );
};

const LiveUpdateBadge = ({ lastLeaderboardUpdate, startDateStr }) => {
  const [, setTick] = useState(0);
  const isVisible = useVisibility();

  useEffect(() => {
    if (!isVisible) return;

    // Update every minute to keep the "time ago" string smoothly ticking
    const interval = setInterval(() => setTick(t => t + 1), 60000);

    return () => clearInterval(interval);
  }, [isVisible]);

  const ts = lastLeaderboardUpdate.timestamp;
  const lc = lastLeaderboardUpdate.lastCheck || ts; // fallback if check is missing

  const now = Date.now();
  const tsAgeMs = now - ts;
  const lcAgeMs = now - lc;

  // Logic Thresholds
  const twentyMins = 20 * 60 * 1000;
  const fortyFiveMins = 45 * 60 * 1000;
  const twoHours = 2 * 60 * 60 * 1000;

  let dotColor = 'bg-emerald-500';
  let dotShadow = 'shadow-[0_0_4px_rgba(16,185,129,0.8)]';
  let statusMsg = 'This represents when the leaderboard last updated. Everything auto updates, you do not need to refresh.';

  if (lcAgeMs >= fortyFiveMins) {
    dotColor = 'bg-rose-500';
    dotShadow = 'shadow-[0_0_4px_rgba(244,63,94,0.8)]';
    statusMsg = 'Server connection is unstable. Please contact an admin if this persists. Everything auto updates.';
  } else if (tsAgeMs >= twoHours || lcAgeMs >= twentyMins) {
    dotColor = 'bg-orange-500';
    dotShadow = 'shadow-[0_0_4px_rgba(249,115,22,0.8)]';
    statusMsg = 'The leaderboard has not changed recently or data is slightly delayed. Everything auto updates.';
  }

  // Use formatTimeAgo from timeUtils.js
  const rawAgoStr = formatTimeAgo(ts, true);
  const agoStr = rawAgoStr.charAt(0).toUpperCase() + rawAgoStr.slice(1);

  return (
    <>
      <span className="text-gray-400">{startDateStr}</span>
      <span className="text-gray-600 text-xs mt-0.5">to</span>
      <span className="relative group inline-flex items-center">
        <span className="cursor-help inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-gray-700 bg-gray-800/80 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${dotShadow}`}></span>
          {agoStr}
        </span>
        <span className="absolute top-full left-0 mt-2 w-max max-w-[80vw] sm:max-w-62.5 bg-gray-900 text-white text-left text-xs rounded-sm py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-30 shadow-lg border border-gray-700 whitespace-normal">
          {statusMsg}
        </span>
      </span>
    </>
  );
};

const PlayerStatsModal = ({ stats, gameCount, playerName, onClose }) => {
  const modalOptions = useMemo(() => ({ type: 'nested' }), []);
  const { modalRef } = useModal(true, onClose, modalOptions);

  // If there are no stats, show a helpful empty state instead of returning null
  if (!stats) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in-fast">
        <div ref={modalRef} className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full border border-gray-700 shadow-2xl relative flex flex-col items-center text-center">
          <button onClick={onClose} aria-label="Close stats" className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors bg-gray-700/50 hover:bg-gray-700 p-1.5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
          
          <div className="mb-4 mt-2">
            <div className="p-4 bg-gray-900/80 rounded-full border border-gray-700 shadow-inner">
              <Info className="w-8 h-8 text-blue-400 opacity-80" />
            </div>
          </div>
          
          <h3 className="text-xl font-bold text-white mb-2 w-full truncate px-4">
            {playerName ? `${playerName}'s Stats` : 'Seasonal Statistics'}
          </h3>
          
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">
            We haven&apos;t tracked enough games for this player in this season to generate meaningful statistics.
          </p>
          
          <button onClick={onClose} className="w-full px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl transition-all active:scale-95 border border-gray-600 shadow-xs">
            Close
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const [y, m, d] = dateStr.split('-');
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatChange = (change) => {
    if (change > 0) return `+${change.toLocaleString()}`;
    return change.toLocaleString();
  };

  const getValueColor = (val) => {
    if (val > 0) return 'text-emerald-400';
    if (val < 0) return 'text-rose-400';
    return 'text-white';
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in-fast">
      <div ref={modalRef} className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700 shadow-2xl relative">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2 truncate pr-4">
            <Activity className="w-5 h-5 text-blue-400 shrink-0" />
            <span className="truncate">{playerName ? `${playerName}'s Stats` : 'Seasonal Statistics'}</span>
          </h3>
          <button onClick={onClose} aria-label="Close stats" className="text-gray-400 hover:text-white transition-colors bg-gray-700/50 hover:bg-gray-700 p-1.5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Hero Stat: Win Rate */}
          <div className="bg-linear-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/30 p-4 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm font-medium mb-1 flex items-center gap-1.5"><Trophy className="w-4 h-4"/> Win Rate (+RS)</p>
              <p className="text-3xl font-bold text-white">{stats.winrate}%</p>
            </div>
            <div className="text-right">
              <p className="text-blue-200/70 text-xs mb-1">Total Tracked</p>
              <p className="text-xl font-semibold text-white">{gameCount} <span className="text-sm font-normal text-gray-400">games</span></p>
            </div>
          </div>

          {/* Grid for Wins/Losses */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800/80 border border-gray-700 p-3 rounded-xl shadow-inner">
              <p className="text-gray-400 text-xs font-medium mb-1 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-400"/> Games Won</p>
              <p className="text-xl font-bold text-emerald-400">{stats.wins}</p>
            </div>
            <div className="bg-gray-800/80 border border-gray-700 p-3 rounded-xl shadow-inner">
              <p className="text-gray-400 text-xs font-medium mb-1 flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 text-rose-400"/> Games Lost</p>
              <p className="text-xl font-bold text-rose-400">{stats.losses}</p>
            </div>
          </div>

          {/* Grid for Streaks */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800/80 border border-gray-700 p-3 rounded-xl shadow-inner">
              <p className="text-gray-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-orange-400"/> Best Streak</p>
              <p className="text-lg font-bold text-white">{stats.maxWinStreak} <span className="text-xs font-normal text-gray-500">wins</span></p>
            </div>
            <div className="bg-gray-800/80 border border-gray-700 p-3 rounded-xl shadow-inner">
              <p className="text-gray-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-red-400"/> Worst Streak</p>
              <p className="text-lg font-bold text-white">{stats.maxLossStreak} <span className="text-xs font-normal text-gray-500">losses</span></p>
            </div>
          </div>

          {/* Days Active */}
          <div className="bg-gray-800/80 border border-gray-700 p-3.5 rounded-xl shadow-inner flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/> Days Active</p>
              <p className="text-lg font-bold text-white">{stats.daysActiveCount} <span className="text-sm font-normal text-gray-500">of {stats.totalSeasonDays}</span></p>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center justify-center h-10 px-3 rounded-lg bg-gray-700/50 border border-gray-600">
                <span className="text-sm font-bold text-gray-300">{stats.daysActivePercent}%</span>
              </div>
            </div>
          </div>

          {/* Best/Worst Day */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-900/10 border border-emerald-500/20 p-3 rounded-xl">
              <p className="text-emerald-400/80 text-xs font-medium mb-1">Best Day</p>
              {stats.bestDay ? (
                <>
                  <p className={`text-lg font-bold ${getValueColor(stats.bestDay.change)}`}>{formatChange(stats.bestDay.change)}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{formatDate(stats.bestDay.date)}</p>
                </>
              ) : <p className="text-gray-600 text-sm">N/A</p>}
            </div>
            <div className="bg-rose-900/10 border border-rose-500/20 p-3 rounded-xl">
              <p className="text-rose-400/80 text-xs font-medium mb-1">Worst Day</p>
              {stats.worstDay ? (
                <>
                  <p className={`text-lg font-bold ${getValueColor(stats.worstDay.change)}`}>{formatChange(stats.worstDay.change)}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{formatDate(stats.worstDay.date)}</p>
                </>
              ) : <p className="text-gray-600 text-sm">N/A</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GraphErrorView = ({ error, availableSeasons, onSwitchSeason, targetSeasonId }) => {
  // Determine the error context. If availableSeasons exist, it's a "Not found in this season" error.
  const isSeasonMismatch = availableSeasons && availableSeasons.length > 0;

  // Helper to get season name from ID
  const getSeasonName = (id) => {
    const season = Object.values(SEASONS).find(s => s.id === id);
    return season ? season.label : `Season ${id}`;
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#1a1f2e] z-10 animate-fade-in-fast p-6">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl border border-gray-700 max-w-lg w-full text-center">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-gray-700 rounded-full">
            <AlertTriangle className="w-10 h-10 text-yellow-500" />
          </div>
        </div>

        <h3 className="text-xl font-bold text-white mb-2">
          {isSeasonMismatch ? 'EmbarkId Not Found in this Season' : 'Unable to Load Graph'}
        </h3>

        <div className="text-gray-400 mb-6 text-sm">
          {isSeasonMismatch ? (
            <div className="inline-flex flex-wrap justify-center items-center gap-1">
              <span>
                We couldn&apos;t find tracked data for the requested EmbarkId in {getSeasonName(targetSeasonId)}. However, similar data was found.
              </span>
              <div className="relative group inline-flex items-center">
                <Info className="w-4 h-4 text-gray-500 hover:text-blue-400 cursor-help transition-colors" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-gray-900 text-white text-xs rounded-md py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none shadow-lg border border-gray-700 z-50 text-center leading-relaxed">
                  Due to tracking limitations, these suggestions have an extremely small chance of referring to different players than the one originally requested.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-700"></div>
                </div>
              </div>
            </div>
          ) : (
            error || "An unexpected error occurred while loading the data. Please try again later or contact an administrator."
          )}
        </div>

        {isSeasonMismatch && (
          <div className="animate-fadeIn">
            <p className="text-sm text-gray-300 font-semibold mb-3">Available Data:</p>
            <div className="flex flex-wrap gap-2 justify-center max-h-37.5 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 pr-1">
              {availableSeasons
                .sort((a, b) => b.id - a.id) // Sort descending
                .map((season, index) => (
                  <button
                    key={`${season.id}-${season.embarkId}-${index}`}
                    onClick={() => onSwitchSeason(season.id, season.embarkId)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors flex flex-col items-center gap-0.5 min-w-30"
                  >
                    <span>{getSeasonName(season.id)}</span>
                    <span className="text-blue-200 text-[10px] opacity-90">{season.embarkId}</span>
                  </button>
                ))
              }
            </div>
          </div>
        )}

        {!isSeasonMismatch && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
            >
              <RefreshCcw className="w-4 h-4" />
              Reload Page
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const getMiniEventConfig = (event) => {
  const d = event.details || {};
  switch (event.event_type) {
    case 'NAME_CHANGE':
      return { Icon: UserPen, colorClass: 'text-indigo-400', text: `Name changed from ${d.old_name} to ${d.new_name}` };
    case 'CLUB_CHANGE': {
      let text = "Changed club";
      if (d.new_club && d.old_club) text = `Changed club from [${d.old_club}] to [${d.new_club}]`;
      else if (d.new_club) text = `Joined [${d.new_club}]`;
      else if (d.old_club) text = `Left [${d.old_club}]`;
      return { Icon: Users, colorClass: 'text-teal-400', text };
    }
    case 'RS_ADJUSTMENT': {
      if (d.is_off_leaderboard) {
        return { Icon: TrendingDown, colorClass: 'text-red-400', text: `Fell off leaderboard (Min. -${d.minimum_loss.toLocaleString()} RS)` };
      }
      const isLoss = d.change < 0;
      return {
        Icon: isLoss ? TrendingDown : TrendingUp,
        colorClass: isLoss ? 'text-red-400' : 'text-green-400',
        text: `RS Adjustment (${d.change > 0 ? '+' : ''}${d.change.toLocaleString()} RS)`
      };
    }
    case 'SUSPECTED_BAN':
      if (event.end_timestamp) {
        return { Icon: Gavel, colorClass: 'text-green-400', text: `Reappeared on leaderboard` };
      }
      return { Icon: Gavel, colorClass: 'text-red-500', text: `Suspected Ban` };
    case 'COMBINED_CHANGE': {
      const oldStr = `${d.old_club ? `[${d.old_club}] ` : ''}${d.old_name}`;
      const newStr = `${d.new_club ? `[${d.new_club}] ` : ''}${d.new_name}`;
      return { Icon: Zap, colorClass: 'text-purple-400', text: `Changed from ${oldStr} to ${newStr}` };
    }
    default:
      return { Icon: Info, colorClass: 'text-gray-400', text: 'Unknown Event' };
  }
};

const GraphSettingsModal = ({ settings, onSettingsChange, onClose, mainEvents, comparisonData, mainPlayerId, seasonSupportsRank = false }) => {
  const modalOptions = useMemo(() => ({ type: 'nested' }), []);
  const { modalRef } = useModal(true, onClose, modalOptions);

  const handleFilterChange = (key, value) => {
    onSettingsChange(prev => ({ ...prev, [key]: value }));
  };

  const visibleEvents = useMemo(() => {
    let all = [];
    if (mainEvents) all.push(...mainEvents.map(e => ({ ...e, _player: mainPlayerId })));
    if (comparisonData) {
      for (const [id, data] of comparisonData.entries()) {
        if (data.events) all.push(...data.events.map(e => ({ ...e, _player: id })));
      }
    }

    return all.filter(e => {
      if (e.event_type === 'NAME_CHANGE' && !settings.showNameChange) return false;
      if (e.event_type === 'CLUB_CHANGE' && !settings.showClubChange) return false;
      if (e.event_type === 'RS_ADJUSTMENT' && !settings.showRsAdjustment) return false;
      if (e.event_type === 'SUSPECTED_BAN' && !settings.showSuspectedBan) return false;
      if (e.event_type === 'COMBINED_CHANGE' && (!settings.showNameChange && !settings.showClubChange)) return false;

      return true;
    }).sort((a, b) => b.start_timestamp - a.start_timestamp);
  }, [mainEvents, comparisonData, mainPlayerId, settings]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in-fast">
      <div ref={modalRef} className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700 shadow-2xl relative flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-400" />
            Graph Settings
          </h3>
          <button onClick={onClose} aria-label="Close settings" className="text-gray-400 hover:text-white transition-colors bg-gray-700/50 hover:bg-gray-700 p-1.5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* --- Display: chart metric & indicator lines --- */}
        <div className="mb-5 shrink-0">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2.5">Display</h4>

          {/* Metric toggle (Rank Score vs Rank) — only seasons that track per-snapshot rank (S7+) */}
          {seasonSupportsRank && (
            <div className="grid grid-cols-2 gap-2 mb-3 p-1 bg-gray-900/50 rounded-xl border border-gray-700">
              <button
                onClick={() => handleFilterChange('displayMode', 'rankScore')}
                aria-pressed={settings.displayMode !== 'rank'}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  settings.displayMode !== 'rank'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <Star className="w-4 h-4" />
                Rank Score
              </button>
              <button
                onClick={() => handleFilterChange('displayMode', 'rank')}
                aria-pressed={settings.displayMode === 'rank'}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  settings.displayMode === 'rank'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <Hash className="w-4 h-4" />
                Rank
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FilterToggleButton label="Ruby Line" Icon={Trophy} isActive={settings.showRubyLine} onClick={() => handleFilterChange('showRubyLine', !settings.showRubyLine)} textColorClass="text-red-400" activeBorderClass="border-red-500/50" />
            <FilterToggleButton
              label="Leagues"
              Icon={Gem}
              isActive={settings.showLeagueLines}
              onClick={() => handleFilterChange('showLeagueLines', !settings.showLeagueLines)}
              textColorClass="text-blue-400"
              activeBorderClass="border-blue-500/50"
              disabled={seasonSupportsRank && settings.displayMode === 'rank'}
              title={seasonSupportsRank && settings.displayMode === 'rank' ? 'League thresholds are rank-score based and are hidden in Rank view.' : undefined}
            />
          </div>
        </div>

        {/* --- Events: which timeline events appear on the chart --- */}
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2.5 shrink-0">Events</h4>
        <div className="grid grid-cols-2 gap-3 mb-5 shrink-0">
          <FilterToggleButton label="Names" Icon={UserPen} isActive={settings.showNameChange} onClick={() => handleFilterChange('showNameChange', !settings.showNameChange)} textColorClass="text-indigo-400" activeBorderClass="border-indigo-500/50" />
          <FilterToggleButton label="Clubs" Icon={Users} isActive={settings.showClubChange} onClick={() => handleFilterChange('showClubChange', !settings.showClubChange)} textColorClass="text-teal-400" activeBorderClass="border-teal-500/50" />
          <FilterToggleButton label="Scores" Icon={ChevronsUpDown} isActive={settings.showRsAdjustment} onClick={() => handleFilterChange('showRsAdjustment', !settings.showRsAdjustment)} textColorClass="text-yellow-400" activeBorderClass="border-yellow-500/50" />
          <FilterToggleButton label="Bans" Icon={Gavel} isActive={settings.showSuspectedBan} onClick={() => handleFilterChange('showSuspectedBan', !settings.showSuspectedBan)} textColorClass="text-red-400" activeBorderClass="border-red-500/50" />
        </div>

        <div className="flex-1 min-h-55 flex flex-col bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden shadow-inner">
          <div className="px-4 py-2.5 border-b border-gray-700 bg-gray-800/50 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-300">Visible Events Log</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{visibleEvents.length}</span>
          </div>
          <div className="p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent flex-1 space-y-2">
            {visibleEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2 py-8">
                <Info className="w-8 h-8 opacity-20" />
                <span className="text-sm text-gray-400">No events match your filters.</span>
              </div>
            ) : (
              visibleEvents.map((event, i) => {
                const config = getMiniEventConfig(event);
                return (
                  <div key={i} className="flex gap-3 items-start p-2.5 rounded-lg bg-gray-800/40 hover:bg-gray-800/80 border border-gray-700/30 hover:border-gray-600 transition-all">
                    <div className={`mt-0.5 p-1.5 rounded-md bg-gray-900 border border-gray-700/50 ${config.colorClass}`}>
                      <config.Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-xs font-bold text-gray-200 truncate pr-2">{event._player}</span>
                        <span className="text-[10px] text-gray-500 shrink-0 font-medium">
                          {new Date(event.start_timestamp * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[13px] text-gray-400 leading-snug wrap-break-word">
                        {config.text}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4 shrink-0">
          Hidden event types will not appear on the graph or in this log.
        </p>
      </div>
    </div>
  );
};

const ComparePlayerModal = ({ onSelect, mainEmbarkId, leaderboard, onClose, comparisonData, mainPlayerLastDataPoint, seasonKey, currentSeasonLabel, isMobile }) => {
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
      // If there's a search term, filter using the advanced logic
      const filtered = leaderboard
        .filter(player =>
          player.name !== mainEmbarkId &&
          !Array.from(comparisonData.keys()).includes(player.name) &&
          filterPlayerByQuery(player, searchTerm)
        )
        .slice(0, 50);
      setFilteredPlayers(filtered);
    } else {
      // If no search term, show closest players
      setFilteredPlayers(getClosestPlayers());
    }
  }, [searchTerm, mainEmbarkId, leaderboard, comparisonData, getClosestPlayers]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in-fast">
      <div ref={modalContentRef} className="bg-gray-800 rounded-2xl w-full max-w-xl lg:max-w-3xl border border-gray-700 shadow-2xl relative flex flex-col max-h-[75dvh]">
        <div className="p-6 pb-4 shrink-0 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Compare Players
            <span className="text-sm font-medium text-gray-500 ml-1">({isMobile ? seasonKey : currentSeasonLabel})</span>
          </h3>
          <button onClick={onClose} aria-label="Close comparisons" className="text-gray-400 hover:text-white transition-colors bg-gray-700/50 hover:bg-gray-700 p-1.5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 shrink-0 bg-gray-900/30 border-b border-gray-700/50">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search players by name or club tag..."
            searchInputRef={searchInputRef}
          />
        </div>

        <div className="grow overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent p-4 space-y-1">
          {filteredPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500 space-y-2">
              <Info className="w-8 h-8 opacity-20" />
              <span className="text-sm text-gray-400">No matching players found.</span>
            </div>
          ) : (
            filteredPlayers.map((player) => {
              const mainPlayer = leaderboard.find(p => p.name === mainEmbarkId);
              const baseScore = mainPlayer?.rankScore ?? mainPlayerLastDataPoint?.rankScore;
              const scoreDiff = baseScore !== undefined ? player.rankScore - baseScore : 0;
              return (
                <div
                  key={player.name}
                  className="flex items-center justify-between p-3 hover:bg-gray-700/80 rounded-xl cursor-pointer transition-all duration-200 group border border-transparent hover:border-gray-500/50 hover:shadow-lg hover:-translate-y-0.5"
                  onClick={() => onSelect(player)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-gray-500 font-medium w-10 shrink-0 text-right pr-2">#{player.rank}</span>
                    <span className="text-gray-200 font-medium truncate">
                      {player.clubTag && (
                        <span className={`text-blue-400 mr-1 ${isMobile ? 'hidden' : ''}`}>[{player.clubTag}]</span>
                      )}
                      {player.name}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 shadow-xs
                        ${scoreDiff > 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        scoreDiff < 0 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          'bg-gray-600/30 text-gray-400 border border-gray-600/50'}`}>
                      {scoreDiff > 0 ? '↑' : scoreDiff < 0 ? '↓' : '~'} {Math.abs(scoreDiff).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-gray-700/0 group-hover:bg-blue-500/20 transition-colors">
                    <Plus className="w-5 h-5 text-gray-500 group-hover:text-blue-400 shrink-0 transition-colors" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

const GraphModal = ({ isOpen, onClose, embarkId, compareIds = [], seasonId, globalLeaderboard = [], currentRubyCutoff, isMobile, lastLeaderboardUpdate, showToast }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { modalRef, isActive } = useModal(isOpen, onClose);
  const chartRef = useRef(null);
  const hasSetInitialTimeRangeRef = useRef(false);
  // Keep the latest history state available without rebinding handleUrlChange.
  const locationStateRef = useRef(location.state);
  locationStateRef.current = location.state;

  // UI State
  const [currentSeasonId, setCurrentSeasonId] = useState(seasonId);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24H');
  const [eventSettings, setEventSettings] = useState(getStoredGraphSettings);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showCompareHint, setShowCompareHint] = useState(!eventSettings.hasOpenedCompareModal);
  const [showSettingsHint, setShowSettingsHint] = useState(!eventSettings.hasOpenedGraphSettings);
  const [showZoomHint, setShowZoomHint] = useState(true);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const seasonDropdownRef = useRef(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [statsPlayerId, setStatsPlayerId] = useState(null);

  const [comparisonLeaderboard, setComparisonLeaderboard] = useState([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(true);

  // When modal is opened for a different player or base season, reset local state
  useEffect(() => {
    if (isOpen) {
      setCurrentSeasonId(seasonId);
      hasSetInitialTimeRangeRef.current = false; // Reset the flag
    }
  }, [isOpen, seasonId]);

  const seasonConfig = useMemo(() => {
    return Object.values(SEASONS).find(s => s.id === currentSeasonId);
  }, [currentSeasonId]);
  const isHistoricalSeason = useMemo(() => seasonConfig && !seasonConfig.isCurrent, [seasonConfig]);

  const RANK_MODE_MIN_SEASON_ID = 7;
  const seasonSupportsRank = currentSeasonId >= RANK_MODE_MIN_SEASON_ID;
  const effectiveDisplayMode = (eventSettings.displayMode === 'rank' && seasonSupportsRank) ? 'rank' : 'rankScore';

  // Persist settings when they change
  useEffect(() => {
    setStoredGraphSettings(eventSettings);
  }, [eventSettings]);

  const areFiltersActive = useMemo(() => {
    // Filters-settings are active if any event type is turned off (not the default state). Aside from view mode.
    return !eventSettings.showNameChange || !eventSettings.showClubChange || !eventSettings.showRsAdjustment || !eventSettings.showSuspectedBan
      || !eventSettings.showRubyLine || !eventSettings.showLeagueLines;
  }, [eventSettings]);

  // Callback to update the URL using React Router.
  // Preserve the existing history state (notably `background`) so closing the
  // modal still returns to whatever view it was opened on top of, even after a
  // name-normalisation redirect replaces the URL.
  const handleUrlChange = useCallback((url) => {
    navigate(url, { replace: true, state: locationStateRef.current });
  }, [navigate]);

  // Custom hook for data fetching and management
  const {
    data,
    events,
    mainPlayerGameCount,
    mainPlayerStats,
    mainPlayerAvailableSeasons,
    comparisonData,
    loading,
    error,
    errorAvailableSeasons,
    addComparison,
    removeComparison,
    switchSeason,
    mainPlayerCurrentId,
    refreshGraph,
  } = usePlayerGraphData(
    isOpen,
    embarkId,
    compareIds,
    seasonId,
    eventSettings,
    handleUrlChange
  );

  const mainPlayerWinrate = mainPlayerStats?.winrate || null;

  // Watch for leaderboard updates to auto-refresh the graph
  const currentTimestamp = lastLeaderboardUpdate?.timestamp;
  const prevUpdateRef = useRef(currentTimestamp);

  useEffect(() => {
    // If the modal is open, and we receive a NEW timestamp that is different from the previous one...
    // AND we are not looking at a historical season (which doesn't receive live updates)
    if (isOpen && !isHistoricalSeason && currentTimestamp && prevUpdateRef.current !== currentTimestamp) {
      // Check if we are transitioning from "No Data" to "Data".
      // Since the GraphModal mounts and fetches its own data independently, we don't need to 'refresh' 
      // just because the background app finished loading. We only want to refresh on SUBSEQUENT updates.
      const isInitialLoad = !prevUpdateRef.current;
      if (!isInitialLoad) {
        console.log("Leaderboard updated (live), refreshing graph...");
        refreshGraph();
      }
    }
    prevUpdateRef.current = currentTimestamp;
  }, [currentTimestamp, isOpen, refreshGraph, isHistoricalSeason]);

  // Handler for zoom/pan to hide hint
  const handleZoomPan = useCallback(() => {
    if (showZoomHint) {
      setShowZoomHint(false);
    }
  }, [showZoomHint]);

  // Determine the correct ruby cutoff to display based on the currently viewed season.
  const rubyCutoffForChart = useMemo(() => {
    if (!seasonConfig || !seasonConfig.hasRuby) {
      return undefined; // No ruby rank for this season
    }
    // If it's the current season, use the dynamic prop.
    // Otherwise, use the static historical value from the SEASONS object.
    return seasonConfig.isCurrent ? currentRubyCutoff : seasonConfig.rubyCutoff;
  }, [seasonConfig, currentRubyCutoff]);

  // Custom hook for Chart.js configuration
  const { chartOptions, chartData } = useChartConfig({
    data,
    events,
    comparisonData,
    embarkId: mainPlayerCurrentId || embarkId,
    selectedTimeRange,
    setSelectedTimeRange,
    chartRef,
    onZoomOrPan: handleZoomPan,
    eventSettings,
    seasonId: currentSeasonId,
    rubyCutoff: rubyCutoffForChart,
    mainPlayerWinrate,
    displayMode: effectiveDisplayMode,
  });

  useEffect(() => {
    if (!isOpen) return;
    setIsLeaderboardLoading(true);

    const seasonKeyForLeaderboard = Object.keys(SEASONS).find(key => SEASONS[key].id === currentSeasonId);

    if (seasonKeyForLeaderboard && !SEASONS[seasonKeyForLeaderboard].isCurrent) {
      // Historical season
      const { leaderboard } = getSeasonLeaderboard(seasonKeyForLeaderboard);
      setComparisonLeaderboard(leaderboard);
    } else {
      // Current season global view
      setComparisonLeaderboard(globalLeaderboard);
    }
    setIsLeaderboardLoading(false);
  }, [isOpen, currentSeasonId, globalLeaderboard]);


  const displayedEmbarkId = mainPlayerCurrentId || embarkId;

  // --- Stabilized Callbacks for Nested Modals ---
  const handleSelectPlayer = useCallback((player) => {
    addComparison(player);
    setShowCompareModal(false);
  }, [addComparison]);

  const handleCloseCompareModal = useCallback(() => {
    setShowCompareModal(false);
  }, []);

  const handleOpenCompareModal = useCallback(() => {
    setShowCompareModal(true);
    if (!eventSettings.hasOpenedCompareModal) {
      setEventSettings(prev => ({ ...prev, hasOpenedCompareModal: true }));
      setShowCompareHint(false);
    }
  }, [eventSettings.hasOpenedCompareModal]);

  const handleOpenSettingsModal = useCallback(() => {
    setShowSettingsModal(true);
    if (!eventSettings.hasOpenedGraphSettings) {
      setEventSettings(prev => ({ ...prev, hasOpenedGraphSettings: true }));
      setShowSettingsHint(false);
    }
  }, [eventSettings.hasOpenedGraphSettings]);

  const handleCloseSettingsModal = useCallback(() => {
    setShowSettingsModal(false);
  }, []);

  const handleCloseStatsModal = useCallback(() => {
    setStatsPlayerId(null);
  }, []);

  const handleSeasonChange = useCallback((newSeasonId, specificEmbarkId = null) => {
    // Prevent reloading if selecting the current season and player
    const isSameSeason = newSeasonId === currentSeasonId;
    const isSamePlayer = !specificEmbarkId || specificEmbarkId === displayedEmbarkId;

    if (isSameSeason && isSamePlayer) {
      setShowSeasonDropdown(false);
      return;
    }

    setCurrentSeasonId(newSeasonId);
    switchSeason(newSeasonId, specificEmbarkId);
    hasSetInitialTimeRangeRef.current = false; // Reset the flag
    setShowSeasonDropdown(false);
  }, [currentSeasonId, switchSeason, displayedEmbarkId]);


  // Function to determine the appropriate default time range based on actual game data points
  const determineDefaultTimeRange = useCallback((data) => {
    if (!data?.length) return '24H';

    // Barely-tracked players (under half a day of history) read best fully zoomed out.
    const firstPoint = data[0];
    const lastPoint = data[data.length - 1];
    const dataDuration = lastPoint.timestamp.getTime() - firstPoint.timestamp.getTime();
    if (dataDuration < (TIME.DAY / 2)) return 'MAX';

    // Reference "now": the season end for historical seasons, otherwise the wall clock.
    const now = seasonConfig?.endTimestamp ? new Date(seasonConfig.endTimestamp * 1000) : new Date();

    // A real observation carries none of the pipeline's synthetic flags. Ban anchors and the
    // final interpolation already set isInterpolated, so they're covered by these checks too.
    const isRealPoint = (p) =>
      !p.isInterpolated && !p.isExtrapolated && !p.isStaircasePoint &&
      !p.isGapBridge && !p.isEventAnchor && !p.isRsAdjustmentAnchor;

    const isRankMode = effectiveDisplayMode === 'rank';
    let lastChangeTime = null;

    if (isRankMode) {
      // Last time the player's actual rank differed from the previous real observation.
      let prevRank = null;
      for (const p of data) {
        if (!isRealPoint(p) || typeof p.rank !== 'number' || p.rank <= 0) continue;
        if (prevRank !== null && p.rank !== prevRank) lastChangeTime = p.timestamp.getTime();
        prevRank = p.rank;
      }
    } else {
      // Last real rank-score change (an actual game the player played).
      for (const p of data) {
        if (p.scoreChanged && isRealPoint(p)) lastChangeTime = p.timestamp.getTime();
      }
    }

    // No real movement of the active metric in the whole dataset → show everything.
    if (lastChangeTime === null) return 'MAX';

    const age = now.getTime() - lastChangeTime;
    if (age <= TIME.DAY) return '24H';
    if (age <= TIME.WEEK) return '7D';
    return 'MAX';
  }, [seasonConfig, effectiveDisplayMode]);

  // Set default time range when data loads.
  // Guard on data?.length, not just data: during loading `data` is briefly an empty array, which
  // is truthy and would otherwise lock the ref to the empty-data default ('24H') before the real
  // points arrive — freezing the view at 24H even for players whose last game was days ago.
  useEffect(() => {
    if (data?.length && !hasSetInitialTimeRangeRef.current) {
      if (isHistoricalSeason) {
        setSelectedTimeRange('MAX');
      } else {
        setSelectedTimeRange(determineDefaultTimeRange(data));
      }
      // Mark that we've set the initial range
      hasSetInitialTimeRangeRef.current = true;
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
    if (showSettingsHint) {
      const timer = setTimeout(() => setShowSettingsHint(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showSettingsHint]);

  useEffect(() => {
    if (showZoomHint) {
      const timer = setTimeout(() => setShowZoomHint(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [showZoomHint]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(event.target)) {
        setShowSeasonDropdown(false);
      }
    };
    if (showSeasonDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showSeasonDropdown]);

  const { seasonKey, currentSeasonLabel } = useMemo(() => {
    const key = Object.keys(SEASONS).find(k => SEASONS[k].id === currentSeasonId);
    if (!key) return { seasonKey: '', currentSeasonLabel: '' };

    return {
      seasonKey: key,
      currentSeasonLabel: SEASONS[key].label,
    };
  }, [currentSeasonId]);

  // If the user has 'rank' display persisted but lands on a season that can't support it
  // (older than S7), we transparently fall back to rank score (via effectiveDisplayMode)
  // and tell them once per unsupported season why. The preference itself is kept intact.
  const rankToastShownForSeasonRef = useRef(null);
  useEffect(() => {
    if (seasonSupportsRank) {
      // Back on a supported season — re-arm the notice for any future unsupported one.
      rankToastShownForSeasonRef.current = null;
      return;
    }
    if (eventSettings.displayMode === 'rank' && rankToastShownForSeasonRef.current !== currentSeasonId) {
      rankToastShownForSeasonRef.current = currentSeasonId;
      showToast({
        message: `Rank view isn't available for ${currentSeasonLabel} — showing rank score instead.`,
        type: 'info',
        duration: 5000,
      });
    }
  }, [seasonSupportsRank, eventSettings.displayMode, currentSeasonId, currentSeasonLabel, showToast]);

  if (!isOpen || !embarkId) return null;

  return (
    <div className={`fixed inset-0 bg-[#0f121b]/80 backdrop-blur-xs flex items-center justify-center z-50 ${isMobile ? 'p-0' : 'p-4'}`}>
      <div
        ref={modalRef}
        className={`
          bg-[#1a1f2e] rounded-lg w-full overflow-hidden grid grid-rows-[auto_1fr]
          transition-transform duration-75 ease-out
          ${isMobile ? 'w-full h-full max-w-none rounded-none p-2 gap-2' : 'max-w-[80dvw] h-[85dvh] p-6 gap-4'}
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
            seasonKey={seasonKey}
            currentSeasonLabel={currentSeasonLabel}
            isMobile={isMobile}
          />
        )}
        {showSettingsModal && (
          <GraphSettingsModal
            settings={eventSettings}
            onSettingsChange={setEventSettings}
            onClose={handleCloseSettingsModal}
            mainEvents={events}
            comparisonData={comparisonData}
            mainPlayerId={displayedEmbarkId}
            seasonSupportsRank={seasonSupportsRank}
          />
        )}
        {statsPlayerId && (
          <PlayerStatsModal
            stats={statsPlayerId === displayedEmbarkId ? mainPlayerStats : comparisonData.get(statsPlayerId)?.stats}
            gameCount={statsPlayerId === displayedEmbarkId ? mainPlayerGameCount : comparisonData.get(statsPlayerId)?.gameCount}
            playerName={statsPlayerId}
            onClose={handleCloseStatsModal}
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
                  <div ref={seasonDropdownRef} className="relative group shrink-0">
                    <button
                      onClick={() => setShowSeasonDropdown(p => !p)}
                      disabled={loading || mainPlayerAvailableSeasons.length <= 1}
                      className={`flex items-center gap-1.5 bg-gray-700 border border-gray-600 shadow-xs text-blue-300 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all duration-200 
                        ${(loading || mainPlayerAvailableSeasons.length <= 1) ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-600 hover:border-gray-500 hover:shadow-md hover:-translate-y-px'}`}
                      title="Switch season"
                    >
                      <span>{isMobile ? seasonKey : currentSeasonLabel}</span>
                      {mainPlayerAvailableSeasons.length > 1 && <ChevronsUpDown className="w-3 h-3"/>}
                    </button>
                    {showSeasonDropdown && (
                      <div className="absolute top-full left-0 mt-2 w-max min-w-full bg-gray-800 border border-gray-600 rounded-md shadow-lg z-20 animate-fade-in-fast overflow-hidden">
                        {mainPlayerAvailableSeasons
                          .sort((a,b) => b.id - a.id)
                          .map((season, index) => (
                            <button
                              key={`${season.id}-${season.embarkId}-${index}`}
                              onClick={() => handleSeasonChange(season.id, season.embarkId)}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors flex flex-col items-start ${currentSeasonId === season.id && season.embarkId === displayedEmbarkId ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-700'}`}
                            >
                              <span className="font-medium">{season.name}</span>
                              <span className={`text-[11px] mt-0.5 ${currentSeasonId === season.id && season.embarkId === displayedEmbarkId ? 'text-blue-200' : 'text-gray-400'}`}>
                                as {season.embarkId}
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                {isMobile && (
                  <button
                    onClick={onClose}
                    aria-label="Close modal"
                    className="p-2 hover:bg-gray-700 rounded-lg shrink-0"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                )}
              </div>
              {data && data.length > 0 && !error && (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-400 mt-1">
                  {mainPlayerGameCount > 0 && (
                    <>
                      <div className="relative group inline-flex items-center">
                        <span className="text-gray-300 font-medium cursor-help border-b border-dotted border-gray-500 hover:border-gray-400 transition-colors">
                          {mainPlayerGameCount.toLocaleString()} Games
                        </span>
                        <div className="absolute top-full left-0 mt-2 w-max max-w-[80vw] sm:max-w-62.5 bg-gray-900 text-white text-left text-xs rounded-sm py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-30 shadow-lg border border-gray-700 whitespace-normal">
                          {GAME_COUNT_TOOLTIP}
                        </div>
                      </div>
                      <span className="text-gray-600">•</span>
                      {mainPlayerWinrate !== null && (
                        <>
                          <button
                            onClick={() => setStatsPlayerId(displayedEmbarkId)}
                            className={`font-medium transition-colors border-b border-dotted cursor-pointer ${
                              parseFloat(mainPlayerWinrate) > 50 ? 'text-green-400 border-green-500/50 hover:border-green-400' :
                              parseFloat(mainPlayerWinrate) < 50 ? 'text-red-400 border-red-500/50 hover:border-red-400' :
                              'text-orange-400 border-orange-500/50 hover:border-orange-400'
                            }`}
                            title="Click to view Seasonal Stats"
                          >
                            {mainPlayerWinrate}% WR*
                          </button>
                          <span className="text-gray-600">•</span>
                        </>
                      )}
                    </>
                  )}
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {(() => {
                      const start = data[0].timestamp;
                      const end = data[data.length - 1].timestamp;
                      const currentYear = new Date().getFullYear();
                      const needsYear = start.getFullYear() !== currentYear || end.getFullYear() !== currentYear;
                      const opts = { day: 'numeric', month: 'short' };
                      if (needsYear) opts.year = 'numeric';
                      const startDateStr = start.toLocaleDateString(undefined, opts);

                      // If it's a live season and we have update data
                      if (!isHistoricalSeason && lastLeaderboardUpdate) {
                        return <LiveUpdateBadge lastLeaderboardUpdate={lastLeaderboardUpdate} startDateStr={startDateStr} />;
                      }
                      // Fallback for historical seasons
                      return `${startDateStr} - ${end.toLocaleDateString(undefined, opts)}`;
                    })()}
                  </span>
                </div>
              )}
            </div>
            <div className={`relative flex flex-col ${isMobile ? 'w-full' : 'shrink min-w-0'}`}>
              <div className={`flex items-center flex-wrap ${isMobile ? 'w-full justify-between gap-2' : 'justify-end gap-2'}`}>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={handleOpenSettingsModal}
                      disabled={!!error}
                      className={`p-2 rounded-lg transition-colors ${
                        error ? 'text-gray-600 cursor-not-allowed' :
                        areFiltersActive
                          ? 'bg-green-700 text-white hover:bg-green-600'
                          : 'hover:bg-gray-700 text-gray-400 hover:text-white'
                      }`}
                      title="Graph Settings"
                    >
                      <Settings className={`w-5 h-5 ${!error && effectiveDisplayMode === 'rank' ? 'text-amber-400' : ''}`} />
                    </button>
                    {showSettingsHint && !error && (
                      <>
                        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 rounded-full animate-pulse z-30 pointer-events-none ring-2 ring-gray-900" />
                        <div className={`absolute bottom-full mb-2 whitespace-nowrap bg-gray-800 text-white text-xs py-1 px-2 rounded fade-out pointer-events-none z-30
                          ${isMobile ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
                          New settings!
                        </div>
                      </>
                    )}
                  </div>
                  {comparisonData.size < MAX_COMPARISONS && !error && (
                    <div className="relative">
                      <button
                        onClick={handleOpenCompareModal}
                        className={`p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white relative transition-all duration-200 group`}
                        title="Compare with another player"
                        aria-label="Compare with another player"
                        disabled={isLeaderboardLoading}
                      >
                        <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
                        {showCompareHint && (
                          <div className="absolute -bottom-2 -right-2 w-5 h-5 bg-blue-500 rounded-full animate-pulse z-30" />
                        )}

                        {showCompareHint && (
                          <div className={`absolute top-full mt-2 whitespace-nowrap bg-gray-800 text-white text-xs py-1 px-2 rounded fade-out pointer-events-none z-30
                            ${isMobile ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
                            Try comparing!
                          </div>
                        )}
                      </button>
                    </div>
                  )}
                </div>
                <div className={`flex gap-2 bg-gray-800 rounded-lg p-1 ${isMobile ? 'flex-1 justify-center' : ''}`}>
                  {Object.keys(TIME.RANGES).map((range) => (
                    <button
                      key={range}
                      aria-pressed={selectedTimeRange === range}
                      onClick={() => !isHistoricalSeason && setSelectedTimeRange(range)}
                      disabled={isHistoricalSeason || !!error}
                      title={isHistoricalSeason ? 'Disabled for historical seasons' : 'Select time range'}
                      className={`px-3 py-1 text-sm rounded-md transition-all duration-200 ${
                        selectedTimeRange === range
                          ? 'bg-blue-600/90 text-white shadow-xs ring-1 ring-blue-500/50'
                          : 'text-gray-400'
                      } ${isHistoricalSeason || !!error
                          ? 'cursor-not-allowed opacity-50'
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

          {comparisonData.size > 0 && !error && (
            <div className={`flex gap-2 mt-4 ${
              isMobile
                ? 'flex-wrap max-h-25 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600'
                : 'flex-wrap'
            }`}>
              {Array.from(comparisonData.entries()).map(([compareId, { color, gameCount }]) => (
                <div
                  key={compareId}
                  className={`flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-1
                    ${isMobile ? 'flex-basis-[140px]' : 'whitespace-nowrap'}`}
                >
                  <button
                    onClick={() => setStatsPlayerId(compareId)}
                    className="text-sm truncate transition-colors hover:brightness-125 hover:underline cursor-pointer"
                    style={{ color: color }}
                    title={`View ${compareId}'s stats`}
                  >
                    {compareId}
                  </button>

                  {gameCount > 0 && (
                    isMobile ? (
                      <span className="text-gray-400 text-xs">({gameCount})</span>
                    ) : (
                      <div className="relative group inline-flex items-center">
                        <span className="text-gray-400 text-xs cursor-help">({gameCount})</span>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[80vw] sm:max-w-62.5 bg-gray-900 text-white text-center text-xs rounded-sm py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-30 shadow-lg border border-gray-700 whitespace-normal">
                          {GAME_COUNT_TOOLTIP}
                        </div>
                      </div>
                    )
                  )}

                  <button
                    onClick={() => removeComparison(compareId)}
                    title={`Remove ${compareId}`}
                    aria-label={`Remove ${compareId}`}
                    className="text-gray-400 hover:text-white shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="relative w-full min-h-0 min-w-0">
          {isOpen && chartData && chartOptions && !error && <Line ref={chartRef} data={chartData} options={chartOptions} />}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1a1f2e] z-20 animate-fade-in-fast">
              <LoadingDisplay variant="component" />
            </div>
          )}
          {error && !loading && (
            <GraphErrorView
              error={error}
              availableSeasons={errorAvailableSeasons}
              onSwitchSeason={handleSeasonChange}
              targetSeasonId={currentSeasonId}
            />
          )}
          {!loading && !error && showZoomHint && (
            <div
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800/90 text-white px-4 py-2 rounded-lg transition-opacity duration-300 cursor-pointer z-10 animate-fadeIn shadow-lg"
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
        </div>
      </div>
    </div>
  );
};

export default memo(GraphModal);