import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchRecentEvents } from '../services/ev-api';
import { usePagination } from '../hooks/usePagination';
import { useSwipe } from '../hooks/useSwipe';
import { useModal } from '../context/ModalProvider';
import { SearchBar } from './SearchBar';
import { Pagination } from './Pagination';
import { LoadingDisplay } from './LoadingDisplay';
import { ErrorDisplay } from './ErrorDisplay';
import { EventCard } from './EventCard';
import { LeagueRangeSlider } from './LeagueRangeSlider';
import { getLeagueIndexForFilter } from '../utils/leagueUtils';
import { UserCheck, Gavel, ChevronsUpDown, Users, X, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { EventsModalProps, FilterToggleButtonProps } from '../types/propTypes';

// Key for storing settings in localStorage
const EVENTS_MODAL_SETTINGS_KEY = 'eventsModalSettings';

// Helper component for filter buttons, now with enhanced styling capabilities.
const FilterToggleButton = ({ label, isActive, onClick, Icon, colorClass, textColorClass, activeBorderClass }) => {
    // Base classes to ensure consistent sizing and prevent layout shifts on state change.
    const baseClasses = "flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors w-full border";

    // New style: for event type filters with persistent colored text.
    if (textColorClass) {
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
    }

    // Original style: for rank filters, where the background changes on activation.
    const dynamicClasses = isActive 
        ? (colorClass || 'bg-blue-600 text-white border-transparent') 
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-transparent';
    
    return (
        <button
            onClick={onClick}
            className={`${baseClasses} ${dynamicClasses}`}
        >
            {Icon && <Icon className="w-4 h-4" />}
            <span>{label}</span>
        </button>
    );
};

const getRankInfoFromEvent = (event) => {
    const d = event.details;
    switch(event.event_type) {
        case 'NAME_CHANGE': return { rank: d.rank, score: d.rank_score };
        case 'SUSPECTED_BAN': return { rank: d.last_known_rank, score: d.last_known_rank_score };
        case 'RS_ADJUSTMENT': {
            // For score drops (including falling off leaderboard), filter by the player's old rank.
            // For score gains, filter by their new rank. This is more intuitive for users.
            const isLoss = d.is_off_leaderboard || (d.change && d.change < 0);
            if (isLoss) {
                return { rank: d.old_rank, score: d.old_score };
            }
            return { rank: d.new_rank, score: d.new_score };
        }
        default: return { rank: null, score: null };
    }
};

const isQueryInEvent = (event, query) => {
    const d = event.details;
    let lowerQuery = query.toLowerCase();
    
    if (lowerQuery.startsWith('[')) {
        lowerQuery = lowerQuery.replace(/[[]]/g, '');
        if (lowerQuery === '') return true;
        
        const clubTags = [ d.club_tag, d.old_club_tag, d.new_club_tag, d.last_known_club_tag, d.old_club, d.new_club ].filter(Boolean);
        return clubTags.some(tag => tag.toLowerCase().includes(lowerQuery));
    }
    
    const names = [ event.current_embark_id, d.old_name, d.new_name, d.last_known_name, d.name ].filter(Boolean);
    return names.some(name => name.toLowerCase().includes(lowerQuery));
};


export const EventsModal = ({ isOpen, onClose, isMobile, onPlayerSearch, onClubClick, onGraphOpen, showToast }) => {
  const modalRef = useModal(isOpen, onClose);
  const scrollContainerRef = useRef(null); // Ref for the scrollable content area
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cacheExpiresAt, setCacheExpiresAt] = useState(0);
  const [isAnimatingRefresh, setIsAnimatingRefresh] = useState(false);
  
  // States with persistence
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isFilterSectionExpanded, setIsFilterSectionExpanded] = useState(true);
  const [filters, setFilters] = useState({
    searchQuery: '',
    minLeague: 0, // 0=Bronze, 1=Silver, ..., 5=Ruby
    showNameChange: true,
    showSuspectedBan: true,
    showRsAdjustment: true,
    showClubChange: true,
  });

  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Load settings from localStorage on initial mount
  useEffect(() => {
    const savedSettingsJSON = localStorage.getItem(EVENTS_MODAL_SETTINGS_KEY);
    if (savedSettingsJSON) {
      try {
        const savedSettings = JSON.parse(savedSettingsJSON);
        const { autoRefresh: savedAutoRefresh, filters: savedFilters, isFilterSectionExpanded: savedExpanded } = savedSettings;

        if (typeof savedAutoRefresh === 'boolean') {
          setAutoRefresh(savedAutoRefresh);
        }
        if (savedFilters) {
          // Exclude old/obsolete filter keys by destructuring them out.
          // eslint-disable-next-line no-unused-vars
          const { rankRange, rankFilter, ...validFilters } = savedFilters;
          setFilters(prev => ({ ...prev, ...validFilters }));
        }
        if (typeof savedExpanded === 'boolean') {
          setIsFilterSectionExpanded(savedExpanded);
        }
      } catch (error) {
        console.error('Error parsing events modal settings from localStorage:', error);
        localStorage.removeItem(EVENTS_MODAL_SETTINGS_KEY);
      }
    }
  }, []);

  // Save settings to localStorage whenever they change (except for search query)
  const { minLeague, showNameChange, showSuspectedBan, showRsAdjustment, showClubChange } = filters;
  useEffect(() => {
    const settings = {
      autoRefresh,
      isFilterSectionExpanded,
      filters: {
        minLeague,
        showNameChange,
        showSuspectedBan,
        showRsAdjustment,
        showClubChange,
      },
    };
    localStorage.setItem(EVENTS_MODAL_SETTINGS_KEY, JSON.stringify(settings));
  }, [autoRefresh, isFilterSectionExpanded, minLeague, showNameChange, showSuspectedBan, showRsAdjustment, showClubChange]);

  const loadEvents = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const result = await fetchRecentEvents(forceRefresh);
      setEvents(result.data);
      setCacheExpiresAt(result.expiresAt || 0);
      setError(null);
      if (forceRefresh) {
        showToast({ message: 'Events feed has been updated.', type: 'success' });
      }
    // eslint-disable-next-line no-unused-vars
    } catch (err) {
      setError('Failed to load recent events.');
      showToast({ message: 'Could not fetch recent events.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  
  const forceLoadWithAnimation = useCallback(async () => {
    setIsAnimatingRefresh(true);
    try {
      await loadEvents(true);
    } finally {
      // Use a timeout to ensure the spin is visible for at least a moment.
      setTimeout(() => setIsAnimatingRefresh(false), 2000);
    }
  }, [loadEvents]);

  // Fetch on open and clear search query
  useEffect(() => {
    if (isOpen) {
        handleFilterChange('searchQuery', '');
        loadEvents(false);
    }
  }, [isOpen, loadEvents, handleFilterChange]);

  // Auto-refresh timer: sets when modal opens, clears when it closes.
  useEffect(() => {
    if (!isOpen || !autoRefresh || !cacheExpiresAt) {
      return; // Do nothing if modal is closed, auto-refresh is off, or no expiry time.
    }

    const now = Date.now();
    const delay = cacheExpiresAt > now ? cacheExpiresAt - now : 0;
    
    const timer = setTimeout(() => {
      if (isOpen && autoRefresh) { // Double check in case state changed
          //console.log('[EventsModal Refresh] Conditions met. Triggering force load with animation.');
          forceLoadWithAnimation();
      } else {
          //console.log('[EventsModal Refresh] Conditions NOT met. Aborting refresh.');
      }
    }, delay + 1000);

    // This cleanup function is crucial. It runs when the component unmounts
    // or when any of its dependencies (like `isOpen`) change.
    return () => {
        //console.log('[EventsModal Refresh] Cleaning up timer.');
        clearTimeout(timer);
    };
  }, [isOpen, autoRefresh, cacheExpiresAt, forceLoadWithAnimation]);

  const toggleAutoRefresh = () => {
    const nextState = !autoRefresh;
    setAutoRefresh(nextState);
    showToast({
        message: `Events Auto-Update turned ${nextState ? 'on' : 'off'}.`,
        type: nextState ? 'success' : 'info'
    });
  };

  const toggleFilterSection = () => setIsFilterSectionExpanded(prev => !prev);

  const areFiltersActive = useMemo(() => {
    return (
      filters.minLeague > 0 ||
      !filters.showNameChange ||
      !filters.showSuspectedBan ||
      !filters.showRsAdjustment ||
      !filters.showClubChange
    );
  }, [filters]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (
        (event.event_type === 'NAME_CHANGE' && !filters.showNameChange) ||
        (event.event_type === 'SUSPECTED_BAN' && !filters.showSuspectedBan) ||
        (event.event_type === 'RS_ADJUSTMENT' && !filters.showRsAdjustment) ||
        (event.event_type === 'CLUB_CHANGE' && !filters.showClubChange)
      ) return false;
      
      const { rank, score } = getRankInfoFromEvent(event);
      const leagueIndex = getLeagueIndexForFilter(rank, score);
      
      // Filter by minimum league. If filter is active (minLeague > 0), hide events
      // that are unranked (leagueIndex is null) or below the minimum league.
      if (filters.minLeague > 0 && (leagueIndex === null || leagueIndex < filters.minLeague)) {
        return false;
      }
      
      if (filters.searchQuery && !isQueryInEvent(event, filters.searchQuery)) return false;

      return true;
    });
  }, [events, filters]);
  
  const { currentItems, currentPage, totalPages, startIndex, endIndex, handlePageChange, filteredItems } = usePagination(filteredEvents, isMobile ? 10 : 15, isMobile);

  const { slideDirection, showIndicator } = useSwipe(
    () => currentPage < totalPages && handlePageChange(currentPage + 1),
    () => currentPage > 1 && handlePageChange(currentPage - 1),
    { isSwipeActive: isOpen }
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div 
        ref={modalRef} 
        className={`bg-gray-900 rounded-lg w-full flex flex-col shadow-2xl overflow-hidden 
          ${isMobile ? 'max-w-[95vw] h-[90vh]' : 'max-w-[60vw] h-[85vh]'}`}
      >
        <header className="flex-shrink-0 bg-gray-800 p-4 border-b border-gray-700 flex items-center">
            <div className="flex-1">
                <button
                    onClick={toggleAutoRefresh}
                    className={`p-2 rounded-full transition-colors ${autoRefresh ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                    title={autoRefresh ? 'Auto-refresh is ON' : 'Auto-refresh is OFF'}
                >
                    <RefreshCw className={`w-5 h-5 ${isAnimatingRefresh ? 'animate-spin' : ''}`} />
                </button>
            </div>
            <h2 className="flex-shrink-0 text-xl font-bold text-white">{autoRefresh ? 'Live ' : ''}Events Feed</h2>
            <div className="flex-1 flex justify-end">
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full">
                    <X className="w-5 h-5" />
                </button>
            </div>
        </header>

        <div ref={scrollContainerRef} className="flex-grow overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
          <div className="flex-shrink-0 mb-4">
            <fieldset className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div className={`flex gap-2 items-center ${isFilterSectionExpanded ? 'mb-4' : ''}`}>
                <div className="flex-grow">
                  <SearchBar value={filters.searchQuery} onChange={(val) => handleFilterChange('searchQuery', val)} placeholder="Search by name, or club tag e.g. [OG]" />
                </div>
                <button
                  onClick={toggleFilterSection}
                  className={`flex-shrink-0 h-10 px-3 rounded-lg flex items-center transition-colors ${
                    areFiltersActive 
                      ? 'bg-green-600 text-white hover:bg-green-500' 
                      : 'text-gray-300 bg-gray-700 hover:bg-gray-600'
                  }`}
                  title={isFilterSectionExpanded ? 'Hide Filters' : 'Show Filters'}
                >
                  <SlidersHorizontal className="w-5 h-5" />
                </button>
              </div>

              {isFilterSectionExpanded && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Event Types</label>
                        <div className="grid grid-cols-2 gap-2">
                            <FilterToggleButton label="Name" Icon={UserCheck} isActive={filters.showNameChange} onClick={() => handleFilterChange('showNameChange', !filters.showNameChange)} textColorClass="text-indigo-400" activeBorderClass="border-indigo-400" />
                            <FilterToggleButton label="Bans" Icon={Gavel} isActive={filters.showSuspectedBan} onClick={() => handleFilterChange('showSuspectedBan', !filters.showSuspectedBan)} textColorClass="text-red-500" activeBorderClass="border-red-500" />
                            <FilterToggleButton label="Scores" Icon={ChevronsUpDown} isActive={filters.showRsAdjustment} onClick={() => handleFilterChange('showRsAdjustment', !filters.showRsAdjustment)} textColorClass="text-yellow-400" activeBorderClass="border-yellow-400" />
                            <FilterToggleButton label="Clubs" Icon={Users} isActive={filters.showClubChange} onClick={() => handleFilterChange('showClubChange', !filters.showClubChange)} textColorClass="text-teal-400" activeBorderClass="border-teal-400" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Player Rank</label>
                        <LeagueRangeSlider 
                          value={filters.minLeague}
                          onChange={(value) => handleFilterChange('minLeague', value)}
                        />
                    </div>
                </div>
              )}
            </fieldset>
          </div>

            {loading && events.length === 0 ? <LoadingDisplay /> :
             error ? <ErrorDisplay error={error} onRetry={forceLoadWithAnimation} /> :
             <div className="page-transition-container">
                <div className={`page-content ${slideDirection}`} key={currentPage}>
                    <div className="flex flex-col gap-2">
                        {currentItems.length > 0 ? (
                            currentItems.map((event) => <EventCard key={event.id} event={event} onPlayerSearch={onPlayerSearch} onClubClick={onClubClick} onGraphOpen={onGraphOpen} isMobile={isMobile} />)
                        ) : (
                            <div className="text-center text-gray-400 p-8 bg-gray-800 rounded-lg">No events match your current filters.</div>
                        )}
                    </div>
                </div>
                {/* Page number indicator for swipe actions */}
                <div className={`page-number-indicator ${showIndicator ? 'visible' : 'hidden'}`}>
                    Page {currentPage}/{totalPages}
                </div>
             </div>
            }
        </div>

        {filteredItems.length > 0 && 
            <footer className="flex-shrink-0 p-2 border-t border-gray-700 bg-gray-800">
                <Pagination 
                  currentPage={currentPage} 
                  totalPages={totalPages} 
                  startIndex={startIndex} 
                  endIndex={endIndex} 
                  totalItems={filteredItems.length} 
                  onPageChange={handlePageChange} 
                  scrollRef={scrollContainerRef}
                  className="mt-0"
                />
            </footer>
        }
      </div>
    </div>
  );
};

EventsModal.propTypes = EventsModalProps;
FilterToggleButton.propTypes = FilterToggleButtonProps;

export default EventsModal;