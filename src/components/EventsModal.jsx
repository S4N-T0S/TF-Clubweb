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
import { getStoredEventsSettings, setStoredEventsSettings } from '../services/localStorageManager';
import { UserPen, Gavel, ChevronsUpDown, Users, X, RefreshCw, SlidersHorizontal, Info } from 'lucide-react';
import { EventsModalProps, FilterToggleButtonProps, EventsModal_InfoPopupProps } from '../types/propTypes';

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

// Helper component for the information pop-up
const EventInfoPopup = ({ onClose }) => {
  // Now destructure `modalRef` from `useModal` and pass an option to mark it as nested.
  // This prevents the main EventsModal from fading out when this popup is open.
  const { modalRef: infoModalRef } = useModal(true, onClose, { type: 'nested' }); 

  return (
    <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center z-20 p-4">
      <div ref={infoModalRef} className="bg-gray-800 rounded-lg p-6 max-w-lg w-full border border-gray-600 shadow-xl relative animate-fade-in-fast">
        <h3 className="text-lg font-bold text-white mb-4">About The Events Feed</h3>
        <p className="text-gray-400 mb-4 text-sm">
          This feed highlights major changes on the current ranked leaderboard.
          While we aim for accuracy, please note that all events are generated automatically and may not be 100% precise.
          Additionally, since we only track changes within the ranked leaderboard, events outside of it will not appear here.
        </p>
        <div className="space-y-3 text-sm">
          <div>
            <strong className="text-indigo-400 flex items-center gap-2"><UserPen className="w-4 h-4" /> Name Change:</strong>
            <p className="text-gray-400 ml-8">Tracks when a player changes their in-game name.</p>
          </div>
          <div>
            <strong className="text-red-500 flex items-center gap-2"><Gavel className="w-4 h-4" /> Suspected Ban:</strong>
            <p className="text-gray-400 ml-8">Occurs when a player disappears from the leaderboard entirely, which is often an indication of a ban. This is an inference, not a confirmation. The event is updated if the player reappears, which can happen if a ban is reverted or they reclaim a leaderboard spot after a large Rank Score loss.</p>
          </div>
          <div>
            <strong className="text-yellow-400 flex items-center gap-2"><ChevronsUpDown className="w-4 h-4" /> Rank Score Adjustment:</strong>
            <p className="text-gray-400 ml-8">Monitors significant gains or losses in a player&apos;s Rank Score (RS), including players falling off the leaderboard entirely due to a RS adjustment.</p>
          </div>
          <div>
            <strong className="text-teal-400 flex items-center gap-2"><Users className="w-4 h-4" /> Club Event:</strong>
            <p className="text-gray-400 ml-8">Records when a player joins, leaves, or changes their club affiliation.</p>
          </div>
        </div>
        <button onClick={onClose} className="absolute top-3 right-3 p-1 text-gray-400 hover:text-white rounded-full">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
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
        case 'CLUB_CHANGE': return { rank: d.rank, score: d.rank_score };
        default: return { rank: null, score: null };
    }
};

const isQueryInEvent = (event, query) => {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return true;

    const d = event.details;

    // Collect all relevant names and club tags from the event.
    const eventNames = [ event.current_embark_id, d.old_name, d.new_name, d.last_known_name, d.name ].filter(Boolean).map(n => n.toLowerCase());
    const eventClubTags = [ d.club_tag, d.old_club_tag, d.new_club_tag, d.last_known_club_tag, d.old_club, d.new_club ].filter(Boolean).map(t => t.toLowerCase());

    // Handle exclusive club tag searches like `[tag]`
    const clubSearchMatch = lowerQuery.match(/^\[(.*?)\]$/);
    if (clubSearchMatch) {
        const tagQuery = clubSearchMatch[1];
        return eventClubTags.some(tag => tag.includes(tagQuery));
    }
    
    // For combined or general searches, construct all possible searchable strings.
    const fullSearchableStrings = new Set();
    eventNames.forEach(name => {
        // Add the name by itself
        fullSearchableStrings.add(name);
        // Add all combinations of "[tag] name"
        eventClubTags.forEach(tag => {
            fullSearchableStrings.add(`[${tag}] ${name}`);
        });
    });

    // Also add club tags by themselves to be searchable
    eventClubTags.forEach(tag => fullSearchableStrings.add(`[${tag}]`));

    return Array.from(fullSearchableStrings).some(s => s.includes(lowerQuery));
};


export const EventsModal = ({ isOpen, onClose, isMobile, onPlayerSearch, onClubClick, onGraphOpen, showToast }) => {
  // `useModal` now also returns `isActive`, which handles animation state internally based on the modal stack.
  const { modalRef, isTopModal, isActive } = useModal(isOpen, onClose);
  const scrollContainerRef = useRef(null); // Ref for the scrollable content area
  const scrollPositionRef = useRef(0); // Ref to store the scroll position
  const hasInitialized = useRef(false);
  const [events, setEvents] = useState([]);
  const eventsRef = useRef(events); // Create a ref to hold the current events
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cacheExpiresAt, setCacheExpiresAt] = useState(0);
  const [isAnimatingRefresh, setIsAnimatingRefresh] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const initialSettings = getStoredEventsSettings();
  
  // States with persistence
  const [autoRefresh, setAutoRefresh] = useState(initialSettings.autoRefresh);
  const [isFilterSectionExpanded, setIsFilterSectionExpanded] = useState(initialSettings.isFilterSectionExpanded);
  const [filters, setFilters] = useState({
    searchQuery: '',
    minLeague: 0, // 0=Bronze, 1=Silver, ..., 5=Ruby
    showNameChange: true,
    showSuspectedBan: true,
    showRsAdjustment: true,
    showClubChange: true,
    ...initialSettings.filters,
  });

  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
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
    setStoredEventsSettings(settings);
  }, [autoRefresh, isFilterSectionExpanded, minLeague, showNameChange, showSuspectedBan, showRsAdjustment, showClubChange]);

  const loadEvents = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    // Use ref to get current events without adding to dependency array
    const oldEventsMap = new Map(eventsRef.current.map(e => [e.id, JSON.stringify(e)]));

    try {
      const result = await fetchRecentEvents(forceRefresh);
      const newEvents = result.data;
      setEvents(newEvents);
      setCacheExpiresAt(result.expiresAt || 0);
      setError(null);
      if (forceRefresh) {
        // Check for new or updated events to provide a more informative toast.
        let newEventCount = 0;
        let updatedEventCount = 0;

        newEvents.forEach(newEvent => {
          if (!oldEventsMap.has(newEvent.id)) {
            newEventCount++;
          } else {
            // Compare stringified versions to detect changes.
            if (oldEventsMap.get(newEvent.id) !== JSON.stringify(newEvent)) {
              updatedEventCount++;
            }
          }
        });
        
        if (newEventCount > 0 || updatedEventCount > 0) {
          const parts = [];
          if (newEventCount > 0) {
            parts.push(`${newEventCount} new event${newEventCount > 1 ? 's' : ''}`);
          }
          if (updatedEventCount > 0) {
            parts.push(`${updatedEventCount} updated event${updatedEventCount > 1 ? 's' : ''}`);
          }
          const message = `Events feed updated with ${parts.join(' and ')}.`;
          showToast({ message, type: 'success' });
        }
      }
    } catch (_err) {
      setError('Failed to load recent events.');
      showToast({ message: 'Could not fetch recent events.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  
  const forceLoadWithAnimation = useCallback(async () => {
    setIsAnimatingRefresh(true);
    
    // Create a promise that resolves after a minimum duration.
    const minAnimationPromise = new Promise(resolve => setTimeout(resolve, 1000)); // 1000ms minimum spin time

    try {
      // Wait for both the data fetch and the minimum animation time to complete.
      await Promise.all([loadEvents(true), minAnimationPromise]);
    } catch (err) {
      // Errors will be caught and handled by loadEvents, but we catch here to ensure finally is always reached.
      console.error("Error during forced event load:", err);
    }
    finally {
      setIsAnimatingRefresh(false);
    }
  }, [loadEvents]);

  // Restoring scroll position when the modal becomes active again.
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    if (isActive) {
      const timer = setTimeout(() => {
        scrollContainer.scrollTo({ top: scrollPositionRef.current, behavior: 'auto' });
      }, 50);
      return () => clearTimeout(timer);
    } else {
      scrollPositionRef.current = scrollContainer.scrollTop;
    }
  }, [isActive]);

  // Checks the `hasInitialized` ref to ensure it only runs ONCE per mount.
  useEffect(() => {
    // The `key` prop from App.jsx ensures this component is brand new on a "fresh" open.
    // When it mounts, `hasInitialized.current` is false, so this block runs.
    if (isOpen && !hasInitialized.current) {
        handleFilterChange('searchQuery', '');
        loadEvents(false);
        // Then set the flag to true, so subsequent re-renders of this same instance
        // (e.g., when a child modal opens) will not re-trigger this logic.
        hasInitialized.current = true;
    }
  }, [isOpen, loadEvents, handleFilterChange]);

  // Auto-refresh timer: sets when modal opens, clears when it closes.
  useEffect(() => {
    // Only refresh if this is the top-most modal.
    if (!isOpen || !isTopModal || !autoRefresh || !cacheExpiresAt) {
      return; // Do nothing if modal is closed, not on top, auto-refresh is off, or no expiry time.
    }

    const now = Date.now();
    const delay = cacheExpiresAt > now ? cacheExpiresAt - now : 0;
    
    const timer = setTimeout(() => {
      // Double check in case state changed
      if (isOpen && isTopModal && autoRefresh) forceLoadWithAnimation();
    }, delay + 1000);

    // This cleanup function is crucial. It runs when the component unmounts
    // or when any of its dependencies (like `isOpen` or `isTopModal`) change.
    return () => {
        clearTimeout(timer);
    };
  }, [isOpen, isTopModal, autoRefresh, cacheExpiresAt, forceLoadWithAnimation]);

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
    // Sort events by their most recent timestamp (endTimestamp or startTimestamp)
    const sortedEvents = [...events].sort((a, b) => {
        const timeA = a.endTimestamp || a.startTimestamp;
        const timeB = b.endTimestamp || b.startTimestamp;
        return timeB - timeA; // Sort descending
    });
      
    return sortedEvents.filter(event => {
      if (
        (event.event_type === 'NAME_CHANGE' && !filters.showNameChange) ||
        (event.event_type === 'SUSPECTED_BAN' && !filters.showSuspectedBan) ||
        (event.event_type === 'RS_ADJUSTMENT' && !filters.showRsAdjustment) ||
        (event.event_type === 'CLUB_CHANGE' && !filters.showClubChange)
      ) return false;
      
      const { rank, score } = getRankInfoFromEvent(event);
      // For some events (like old Club Changes), rank/score might not be available.
      // If null, leagueIndex will also be null.
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

  // Effect to reset page to 1 and scroll to top when filters change.
  useEffect(() => {
    // On filter change, we want to go back to the first page of results.
    handlePageChange(1);

    // We also want to scroll the modal content back to the top.
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
    
    // This effect should only run when a filter is changed by the user.
    // handlePageChange is not included as a dependency because it can change
    // when data is refreshed, which would undesirably reset the page.
    // We also don't include currentPage because we want this to trigger
    // the reset, not react to page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.searchQuery,
    filters.minLeague,
    filters.showNameChange,
    filters.showSuspectedBan,
    filters.showRsAdjustment,
    filters.showClubChange,
  ]);

  const { slideDirection, showIndicator } = useSwipe(
    () => currentPage < totalPages && handlePageChange(currentPage + 1),
    () => currentPage > 1 && handlePageChange(currentPage - 1),
    { 
      isSwipeActive: isTopModal, // Only allow swipe on the top-most modal
      targetRef: scrollContainerRef,
    }
  );

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 ${!isTopModal ? 'pointer-events-none' : ''}`}>
      <div 
        ref={modalRef} 
        className={`bg-gray-900 rounded-lg w-full flex flex-col shadow-2xl overflow-hidden relative transition-transform duration-75 ease-out
          ${isMobile ? 'max-w-[95vw] h-[90dvh]' : 'max-w-[60vw] h-[85dvh]'}
          ${isActive ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}
          `}
      >
        {showInfo && <EventInfoPopup onClose={() => setShowInfo(false)} />}
        
        <header className="flex-shrink-0 bg-gray-800 p-4 border-b border-gray-700 flex items-center">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <button
                    onClick={toggleAutoRefresh}
                    className={`p-2 rounded-full transition-colors ${autoRefresh ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                    title={autoRefresh ? 'Auto-refresh is ON' : 'Auto-refresh is OFF'}
                >
                    <RefreshCw className={`w-5 h-5 ${isAnimatingRefresh ? 'animate-spin' : ''}`} />
                </button>
                <button
                    onClick={() => setShowInfo(true)}
                    className="p-2 rounded-full bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors"
                    title="About Event Types"
                >
                    <Info className="w-5 h-5" />
                </button>
              </div>
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
                            <FilterToggleButton label="Name" Icon={UserPen} isActive={filters.showNameChange} onClick={() => handleFilterChange('showNameChange', !filters.showNameChange)} textColorClass="text-indigo-400" activeBorderClass="border-indigo-400" />
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

            {loading && events.length === 0 ? <LoadingDisplay variant="component" /> :
             error ? <ErrorDisplay error={error} onRetry={forceLoadWithAnimation} variant="component" /> :
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
                  variant="component"
                />
            </footer>
        }
      </div>
    </div>
  );
};

EventsModal.propTypes = EventsModalProps;
FilterToggleButton.propTypes = FilterToggleButtonProps;
EventInfoPopup.propTypes = EventsModal_InfoPopupProps;

export default EventsModal;