import { useParams, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useLeaderboard } from './hooks/useLeaderboard';
import { ClubsView } from './components/views/ClubsView';
import { GlobalView } from './components/views/GlobalView';
import { HubView } from './components/views/HubView';
import { ErrorDisplay } from './components/ErrorDisplay';
import { LoadingDisplay } from './components/LoadingDisplay';
import { DashboardHeader } from './components/DashboardHeader';
import { safeParseUsernameFromUrl, formatUsernameForUrl, parseMultipleUsernamesFromUrl, formatMultipleUsernamesForUrl } from './utils/urlHandler';
import { useMobileDetect } from './hooks/useMobileDetect';
import { MembersModal } from './components/modals/MembersModal';
import SearchModal from './components/modals/SearchModal';
import GraphModal from './components/modals/GraphModal';
import EventsModal from './components/modals/EventsModal';
import InfoModal from './components/modals/InfoModal';
import Toast from './components/Toast';
import { getStoredTab, setStoredTab, cleanupDeprecatedCache } from './services/localStorageManager';
import { ModalProvider } from './context/ModalProvider';
import { SEASONS, currentSeasonKey } from './services/historicalDataService';
import { cleanupExpiredCacheItems } from './services/idbCache';
import { SEOHead } from './components/SEOHead';

const App = () => {
  const isMobile = useMobileDetect() || false;
  const navigate = useNavigate();
  const location = useLocation();
  const { graph, season: seasonIdFromUrl, history } = useParams();
  const [modalHistory, setModalHistory] = useState([]);
  
  // State for view selection.
  const [view, setView] = useState(() => {
    const path = location.pathname;
    if (path.startsWith('/leaderboard')) return 'global';
    if (path.startsWith('/clubs')) return 'clubs';
    if (path.startsWith('/hub')) return 'hub';
    
    return getStoredTab();
  });
  
  const autoRefresh = true;
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
    isMobile
  });
  
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [membersModalKey, setMembersModalKey] = useState(null);

  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [showFavourites, setShowFavourites] = useState(false);

  const currentSeason = currentSeasonKey;
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);
  const {
    topClubs,
    globalLeaderboard,
    currentRubyCutoff,
    loading,
    error,
    refreshData,
    toastMessage,
    setToastMessage,
    lastUpdated
  } = useLeaderboard(autoRefresh);

  // Run cache cleanup on initial application load
  useEffect(() => {
    cleanupDeprecatedCache();
    cleanupExpiredCacheItems();
  }, []);

  const showToast = useCallback((toastOptions) => {
    setToastMessage({
      timestamp: Date.now(), // required for index/unique
      ...toastOptions
    });
  }, [setToastMessage]);

  // Handle Root Path Redirect & View Switching
  useEffect(() => {
    const path = location.pathname;

    // 1. If at root '/', instantly redirect to the stored preference URL
    if (path === '/') {
      const stored = getStoredTab();
      const routeMap = {
        'hub': '/hub',
        'global': '/leaderboard',
        'clubs': '/clubs'
      };
      // Default to /leaderboard if something goes wrong, though getStoredTab defaults to 'global'
      navigate(routeMap[stored] || '/leaderboard', { replace: true });
      return;
    }
    
    // 2. Sync 'view' state with current URL
    if (path.startsWith('/hub')) {
      setView('hub');
    } else if (path.startsWith('/leaderboard')) {
      setView('global');
    } else if (path.startsWith('/clubs')) {
      setView('clubs');
    }
    // Note: Modals (like /graph) do not change the background view
  }, [location.pathname, navigate]);

  // Handle URL-based Modal State for Members
  useEffect(() => {
    const path = location.pathname;
    const isOverlayModalPath = path.startsWith('/graph') || path.startsWith('/history');
    
    const lastPath = modalHistory.length > 0 ? modalHistory[modalHistory.length - 1] : '/';
    
    // Keep Members modal open if:
    // 1. We are explicitly at /members
    // 2. OR we are at an overlay path (like graph) AND the previous path was members
    const shouldMembersBeOpen = path.startsWith('/members') || (isOverlayModalPath && lastPath.startsWith('/members'));

    if (shouldMembersBeOpen) {
      setMembersModalOpen(true);
      // Ensure we have a valid key if opening via URL
      setMembersModalKey(prev => prev || Date.now());
    } else {
      setMembersModalOpen(false);
    }
  }, [location.pathname, modalHistory]);


  // Update localstorage whenever view changes
  useEffect(() => {
    if (['hub', 'clubs', 'global'].includes(view)) {
      setStoredTab(view);
    }
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
  
    navigate('/leaderboard', { replace: true });
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
  }, [closeAllModals, currentSeason, showToast, navigate]);


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

  const handleMembersModalOpen = useCallback(() => {
    setMembersModalKey(Date.now());
    openModal('/members');
  }, [openModal]);
  const handleMembersModalClose = useCallback(() => closeModal(), [closeModal]);

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
          prev.isMobile !== isMobile ||
          prev.seasonId !== seasonId;

        if (!hasChanged) {
          return prev; // No changes needed, return the existing state.
        }
        
        return {
          isOpen: true,
          embarkId: main,
          compareIds: compare,
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

  if (error) return (
    <ErrorDisplay 
      error={error} 
      // Force refresh (bypass IDB read + browser cache reload)
      onRetry={() => refreshData(true, true)} 
    />
  );

  return (
    <div className="min-h-screen bg-gray-900 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
      <ModalProvider>
        <SEOHead 
          view={view}
          searchModalState={searchModalState}
          graphModalState={graphModalState}
          membersModalOpen={membersModalOpen}
          eventsModalOpen={eventsModalOpen}
          infoModalOpen={location.pathname.startsWith('/info')}
        />

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
        
        {/* Main Content: Conditionally rendered based on loading state*/}
        {loading ? (
          <LoadingDisplay />
        ) : (
          <div className="max-w-7xl mx-auto p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6">
              <DashboardHeader
                view={view}
                onOpenEvents={handleEventsModalOpen}
                onOpenSearch={() => handleSearchModalOpen()}
                onOpenInfo={handleInfoModalOpen}
                onOpenMembers={handleMembersModalOpen}
                isMobile={isMobile}
              />

              {view === 'hub' && (
                <HubView />
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
        )}

        {/* Modals: Rendered OUTSIDE the loading conditional so they persist across loading states */}
        <InfoModal
          isOpen={location.pathname.startsWith('/info')}
          onClose={handleInfoModalClose}
          isMobile={isMobile}
        />

        <MembersModal 
           key={membersModalKey}
           isOpen={membersModalOpen}
           onClose={handleMembersModalClose}
           globalLeaderboard={globalLeaderboard}
           onGraphOpen={(embarkId) => handleGraphModalOpen(embarkId)}
           onPlayerSearch={(name) => handleSearchModalOpen(name)}
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
          isLeaderboardLoading={loading}
        />

        {graphModalState.isOpen && (
          <GraphModal
            isOpen={graphModalState.isOpen}
            onClose={handleGraphModalClose}
            embarkId={graphModalState.embarkId}
            compareIds={graphModalState.compareIds}
            seasonId={graphModalState.seasonId}
            globalLeaderboard={globalLeaderboard}
            currentRubyCutoff={currentRubyCutoff}
            isMobile={graphModalState.isMobile}
            lastLeaderboardUpdate={lastUpdated}
          />
        )}
        <Outlet />
      </ModalProvider>
    </div>
  );
};

export default App;