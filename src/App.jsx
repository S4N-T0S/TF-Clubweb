import { useParams, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useLeaderboard } from './hooks/useLeaderboard';
import { MembersView } from './components/views/MembersView';
import { ClubsView } from './components/views/ClubsView';
import { GlobalView } from './components/views/GlobalView';
import { ErrorDisplay } from './components/ErrorDisplay';
import { LoadingDisplay } from './components/LoadingDisplay';
import { DashboardHeader } from './components/DashboardHeader';
import { fetchClubMembers } from './services/mb-api';
import { safeParseUsernameFromUrl, formatUsernameForUrl, parseMultipleUsernamesFromUrl, formatMultipleUsernamesForUrl } from './utils/urlHandler';
import { useMobileDetect } from './hooks/useMobileDetect';
import SearchModal from './components/SearchModal';
import GraphModal from './components/GraphModal';
import EventsModal from './components/EventsModal';
import InfoModal from './components/InfoModal';
import Toast from './components/Toast';
import { getStoredTab, setStoredTab, getStoredAutoRefresh, setStoredAutoRefresh, cleanupDeprecatedCache } from './services/localStorageManager';
import { ModalProvider } from './context/ModalProvider';
import { SEASONS, currentSeasonKey } from './services/historicalDataService';
import { cleanupExpiredCacheItems } from './services/idbCache';

const App = () => {
  const isMobile = useMobileDetect() || false;
  const navigate = useNavigate();
  const location = useLocation();
  const { graph, season: seasonIdFromUrl, history } = useParams();
  const [modalHistory, setModalHistory] = useState([]);
  const [view, setView] = useState(getStoredTab);
  const [autoRefresh, setAutoRefresh] = useState(getStoredAutoRefresh);
  const [eventsModalOpen, setEventsModalState] = useState(false);
  const [eventsModalKey, setEventsModalKey] = useState(null);
  const [searchModalState, setSearchModalState] = useState({ 
    isOpen: false, 
    initialSearch: '',
    isMobile
  });
  const [graphModalState, setGraphModalState] = useState({
    isOpen: false,
    embarkId: null,
    compareIds: [],
    seasonId: null,
    isClubView: false,
    isMobile
  });
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [clubMembersData, setClubMembersData] = useState([]);
  const [clubMembersLoading, setClubMembersLoading] = useState(true);
  const [showFavourites, setShowFavourites] = useState(false);

  const currentSeason = currentSeasonKey;;
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);
  const {
    clubMembers,
    rankedClubMembers,
    topClubs,
    unknownMembers,
    globalLeaderboard,
    currentRubyCutoff,
    loading,
    error,
    isRefreshing,
    refreshData,
    toastMessage,
    setToastMessage,
  } = useLeaderboard(clubMembersData, autoRefresh);

  // Run cache cleanup on initial application load
  useEffect(() => {
    cleanupDeprecatedCache();
    cleanupExpiredCacheItems();
  }, []);

  // Save auto-refresh setting to storage when it changes
  useEffect(() => {
    setStoredAutoRefresh(autoRefresh);
  }, [autoRefresh]);

  const showToast = useCallback((toastOptions) => {
    setToastMessage({
      timestamp: Date.now(), // required for index/unique
      ...toastOptions
    });
  }, [setToastMessage]);

  const handleToggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => {
        const nextState = !prev;
        showToast({
            message: `Dashboard Auto-Update turned ${nextState ? 'ON' : 'OFF'}.`,
            type: nextState ? 'success' : 'info'
        });
        // When turning auto-refresh ON, trigger an immediate refresh after a short delay.
        // The delay gives the user time to read the confirmation toast.
        if (nextState) {
          setTimeout(() => {
            refreshData(false);
          }, 2500);
        }
        return nextState;
    });
  }, [refreshData, showToast]);

  // Load club members data once on page load
  useEffect(() => {
    const loadClubMembers = async () => {
      try {
        const members = await fetchClubMembers();
        setClubMembersData(members);
      } catch (error) {
        console.error('Failed to load club members:', error);
        showToast({
          message: 'Failed to load club members data',
          type: 'error'
        });
      } finally {
        setClubMembersLoading(false);
      }
    };

    loadClubMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // This effect must only run once on mount.

  // Update localstorage whenever view changes
  useEffect(() => {
    setStoredTab(view);
  }, [view]);

  // Reset states when view changes
  useEffect(() => {
    if (view !== 'global') {
      setSelectedSeason(currentSeason);
      setShowFavourites(false);
    }
  }, [view, currentSeason]);

  // --- Modal Navigation Handlers (Memoized) ---
  const openModal = useCallback((newPath) => {
    // Push the current path to our manual history stack before navigating
    setModalHistory(prev => [...prev, location.pathname]);
    // Replace the URL, so the browser's back button doesn't just cycle through modals
    navigate(newPath, { replace: true });
  }, [location.pathname, navigate]);

  const closeModal = useCallback(() => {
    // Pop the last path from our manual history stack
    const newHistory = [...modalHistory];
    const lastPath = newHistory.pop() || '/'; // Default to root if history is empty
    setModalHistory(newHistory);
    // Navigate back to the previous view
    navigate(lastPath, { replace: true });
  }, [modalHistory, navigate]);

  const closeAllModals = useCallback(() => {
    setModalHistory([]);
    navigate('/', { replace: true });
  }, [navigate]);

  const handleClubClick = useCallback((clubTag, seasonKey = null) => {
    seasonKey = seasonKey || currentSeason;
    // Close all modals and reset history before changing view
    closeAllModals();
  
    setView('global');
    setGlobalSearchQuery(`[${clubTag}]`);
    setSelectedSeason(seasonKey);
  
    const message = /\d/.test(seasonKey) 
      ? `Searching in Season ${seasonKey.slice(1)}.` 
      : `Searching in ${seasonKey}.`;
    
    // Using the new modular toast system
    showToast({
      title: `Club Search: ${clubTag}`,
      message: message,
      type: 'info',
      textSize: 'normal',
      duration: 3500
    });
  }, [closeAllModals, currentSeason, showToast]);


  // --- Modal-specific Open/Close Handlers ---
  const handleEventsModalOpen = useCallback(() => {
    // When opening the events modal fresh, set a new key.
    // This forces React to create a new instance of the modal, resetting its state.
    setEventsModalKey(Date.now()); 
    openModal('/events');
  }, [openModal]);
  const handleEventsModalClose = useCallback(() => closeModal(), [closeModal]);
  
  const handleSearchModalOpen = useCallback((initialSearch = '') => {
    const path = `/history${initialSearch ? `/${formatUsernameForUrl(initialSearch)}` : ''}`;
    // If the search modal is already open with the same search term, do nothing to prevent unnecessary navigation.
    if (location.pathname.startsWith('/history') && history === formatUsernameForUrl(initialSearch)) {
      return;
    }
    openModal(path);
  }, [openModal, location.pathname, history]);
  const handleSearchModalClose = useCallback(() => closeModal(), [closeModal]);

  const handleInfoModalOpen = useCallback(() => openModal('/info'), [openModal]);
  const handleInfoModalClose = useCallback(() => closeModal(), [closeModal]);

  // Handle search submission
  const handleSearchSubmit = (query) => {
    navigate(`/history/${query}`, { replace: true });
  };
  
  const handleGraphModalOpen = useCallback((embarkId, compareIds = [], seasonKey = null) => {
    // If no seasonKey is provided, default to the current season.
    const effectiveSeasonKey = seasonKey || currentSeason;
    const seasonId = SEASONS[effectiveSeasonKey]?.id;

    if (seasonId === undefined || seasonId === null) {
        console.error(`Could not find a valid season ID for key: ${effectiveSeasonKey}`);
        showToast({ message: `Cannot open graph for season ${effectiveSeasonKey}. No data available.`, type: 'error' });
        return;
    }

    const urlString = formatMultipleUsernamesForUrl(embarkId, compareIds);
    // Use the seasonId in the URL
    openModal(`/graph/${seasonId}/${urlString}`);
  }, [openModal, currentSeason, showToast]);
  const handleGraphModalClose = useCallback(() => closeModal(), [closeModal]);

  // Handle URL parameters on mount
  useEffect(() => {
    if (graph) {
      const { main, compare } = parseMultipleUsernamesFromUrl(graph);
      if (!main) {
        navigate('/');
        return;
      }
      
      const isClubView = view === 'members';
      const currentSeasonId = SEASONS[currentSeason].id;
      const seasonId = seasonIdFromUrl ? parseInt(seasonIdFromUrl, 10) : currentSeasonId;
      
      if (isNaN(seasonId)) {
        console.error("Invalid season ID in URL");
        navigate('/'); // Or show an error
        return;
      }
  
      // Update the modal state only if the necessary props have changed.
      // This prevents re-renders and potential flickering when other state updates.
      setGraphModalState(prev => {
        const hasChanged = 
          !prev.isOpen ||
          prev.embarkId !== main || 
          JSON.stringify(prev.compareIds) !== JSON.stringify(compare) ||
          prev.isClubView !== isClubView ||
          prev.isMobile !== isMobile ||
          prev.seasonId !== seasonId;

        if (!hasChanged) {
          return prev; // No changes needed, return the existing state.
        }
        
        return {
          isOpen: true,
          embarkId: main,
          compareIds: compare,
          isClubView: isClubView,
          isMobile,
          seasonId: seasonId,
        };
      });
    } else {
      // When graph param is removed from URL, ensure modal state is closed.
      setGraphModalState(prev => prev.isOpen ? { ...prev, isOpen: false, seasonId: null } : prev);
    }
  }, [graph, seasonIdFromUrl, navigate, view, isMobile, currentSeason]);

  // Full control the search modal's state based on the URL
  useEffect(() => {
    const isHistoryPath = location.pathname.startsWith('/history');
    const parsedSearch = history ? safeParseUsernameFromUrl(history) : '';

    if (isHistoryPath) {
      setSearchModalState({ isOpen: true, initialSearch: parsedSearch, isMobile });
    } else {
      setSearchModalState({ isOpen: false, initialSearch: '', isMobile });
    }
  }, [location.pathname, history, isMobile]);


  // --- URL-driven Modal State ---
  useEffect(() => {
    const path = location.pathname;
    
    // Check if the current path is for a modal that can be opened from the Events modal.
    const isOverlayModalPath = path.startsWith('/history') || path.startsWith('/graph');

    // The modal history tells us where we came from.
    const lastPath = modalHistory.length > 0 ? modalHistory[modalHistory.length - 1] : '/';

    // The Events modal should be considered "open" if:
    // 1. The user is directly on the /events path.
    // 2. The user has opened an overlay modal (like search or graph) *from* the /events path.
    const shouldEventsBeOpen = 
      path.startsWith('/events') || 
      (isOverlayModalPath && lastPath.startsWith('/events'));

    setEventsModalState(shouldEventsBeOpen);
  }, [location.pathname, modalHistory]);

  if (error) return <ErrorDisplay error={error} onRetry={() => refreshData(true)} />;
  if (loading || clubMembersLoading) return <LoadingDisplay />;

  return (
    <div className="min-h-screen bg-gray-900 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
      <ModalProvider>
        {toastMessage && (
          <Toast 
            message={toastMessage.message}
            type={toastMessage.type}
            timestamp={toastMessage.timestamp}
            showMeta={toastMessage.showMeta}
            ttl={toastMessage.ttl}
            title={toastMessage.title}
            icon={toastMessage.icon}
            textSize={toastMessage.textSize || 'normal'}
            position={toastMessage.position || 'top-right'}
            duration={toastMessage.duration || 2500}
            showCloseButton={toastMessage.showCloseButton}
            isMobile={isMobile}
            onClose={toastMessage.onClose}
          />
        )}
        <div className="max-w-7xl mx-auto p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6">
            <DashboardHeader
              unknownMembers={unknownMembers}
              view={view}
              setView={setView}
              onToggleAutoRefresh={handleToggleAutoRefresh}
              autoRefresh={autoRefresh}
              isRefreshing={isRefreshing}
              onOpenEvents={handleEventsModalOpen}
              onOpenSearch={() => handleSearchModalOpen()}
              onOpenInfo={handleInfoModalOpen}
              isMobile={isMobile}
            />

            {view === 'members' && (
              <MembersView 
                clubMembers={clubMembers} 
                totalMembers={clubMembersData.length} 
                onPlayerSearch={(name) => handleSearchModalOpen(name)}
                clubMembersData={clubMembersData} // Pass club members data to members view
                onGraphOpen={(embarkId) => handleGraphModalOpen(embarkId)}
                setView={setView}
                setGlobalSearchQuery={setGlobalSearchQuery}
                isMobile={isMobile}
              />
            )}
            {view === 'clubs' && (
              <ClubsView 
                topClubs={topClubs} 
                onClubClick={handleClubClick}
                isMobile={isMobile}
              />
            )}
            {view === 'global' && (
              <GlobalView 
                currentSeason={currentSeason}
                selectedSeason={selectedSeason}
                setSelectedSeason={setSelectedSeason}
                globalLeaderboard={globalLeaderboard}
                currentRubyCutoff={currentRubyCutoff}
                onPlayerSearch={(name) => handleSearchModalOpen(name)}
                searchQuery={globalSearchQuery}
                setSearchQuery={setGlobalSearchQuery}
                onGraphOpen={(embarkId, seasonKey) => handleGraphModalOpen(embarkId, [], seasonKey)}
                isMobile={isMobile}
                showFavourites={showFavourites}
                setShowFavourites={setShowFavourites}
                showToast={showToast}
              />
            )}
          </div>
        </div>

        <InfoModal
          isOpen={location.pathname.startsWith('/info')}
          onClose={handleInfoModalClose}
          isMobile={isMobile}
        />

        <EventsModal
          key={eventsModalKey}
          isOpen={eventsModalOpen}
          onClose={handleEventsModalClose}
          isMobile={isMobile}
          onPlayerSearch={handleSearchModalOpen}
          onClubClick={handleClubClick}
          onGraphOpen={(embarkId, seasonKey) => handleGraphModalOpen(embarkId, [], seasonKey)}
          showToast={showToast}
        />

        <SearchModal 
          isOpen={searchModalState.isOpen}
          onClose={handleSearchModalClose}
          initialSearch={searchModalState.initialSearch}
          currentSeasonData={globalLeaderboard}
          onSearch={handleSearchSubmit}
          isMobile={isMobile}
          onClubClick={handleClubClick}
        />

        {graphModalState.isOpen && (
          <GraphModal
            isOpen={graphModalState.isOpen}
            onClose={handleGraphModalClose}
            embarkId={graphModalState.embarkId}
            compareIds={graphModalState.compareIds}
            seasonId={graphModalState.seasonId}
            isClubView={graphModalState.isClubView}
            globalLeaderboard={graphModalState.isClubView ? rankedClubMembers : globalLeaderboard}
            onSwitchToGlobal={() => setView('global')}
            currentRubyCutoff={currentRubyCutoff}
            isMobile={graphModalState.isMobile}
          />
        )}
        <Outlet />
      </ModalProvider>
    </div>
  );
};

export default App;