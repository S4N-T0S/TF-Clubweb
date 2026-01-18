import { useParams, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useLeaderboard } from './hooks/useLeaderboard';
import { ClubsView } from './components/views/ClubsView';
import { GlobalView } from './components/views/GlobalView';
import { HubView } from './components/views/HubView';
import { ErrorDisplay } from './components/ErrorDisplay';
import { LoadingDisplay } from './components/LoadingDisplay';
import { DashboardHeader } from './components/DashboardHeader';
import { safeParseUsernameFromUrl, formatUsernameForUrl, parseMultipleUsernamesFromUrl, formatMultipleUsernamesForUrl } from './utils/urlHandler';
import { useMobileDetect } from './hooks/useMobileDetect';
import SearchModal from './components/modals/SearchModal';
import EventsModal from './components/modals/EventsModal';
import MembersModal from './components/modals/MembersModal';
import Toast from './components/Toast';
import { getStoredTab, setStoredTab, cleanupDeprecatedCache } from './services/localStorageManager';
import { ModalProvider } from './context/ModalProvider';
import { SEASONS, currentSeasonKey } from './services/historicalDataService';
import { cleanupExpiredCacheItems } from './services/idbCache';
import { SEOHead } from './components/SEOHead';

// Lazy load
const GraphModal = lazy(() => import('./components/modals/GraphModal')); //big
const InfoModal = lazy(() => import('./components/modals/InfoModal')); //unused and bigish

const ModalPortal = ({ children }) => {
  return createPortal(children, document.body);
};

const App = () => {
  const isMobile = useMobileDetect() || false;
  const navigate = useNavigate();
  const location = useLocation();
  const { graph, season: seasonIdFromUrl, history } = useParams();
  
  // --> Global View State
  const [view, setView] = useState(() => {
    const path = location.pathname;
    if (path.startsWith('/leaderboard')) return 'global';
    if (path.startsWith('/clubs')) return 'clubs';
    if (path.startsWith('/hub')) return 'hub';
    return getStoredTab();
  });
  
  const [modalHistory, setModalHistory] = useState([]);
  
  // --> Derived Modal Data
  
  // Graph Data
  const { main: graphEmbarkId, compare: graphCompareIds } = useMemo(() => 
    graph ? parseMultipleUsernamesFromUrl(graph) : { main: null, compare: [] }, 
  [graph]);

  const graphSeasonId = useMemo(() => {
    if (!seasonIdFromUrl) return SEASONS[currentSeasonKey]?.id;
    return parseInt(seasonIdFromUrl, 10) || SEASONS[currentSeasonKey]?.id;
  }, [seasonIdFromUrl]);

  // Search Data
  const initialSearchQuery = history ? safeParseUsernameFromUrl(history) : '';

  // --> Stacked Modal Logic
  
  const isOverlayModalPath = location.pathname.startsWith('/graph') || location.pathname.startsWith('/history');
  const lastPath = modalHistory.length > 0 ? modalHistory[modalHistory.length - 1] : '/';

  // Memoize these states to prevent unnecessary re-calculations
  const modalStates = useMemo(() => ({
    isMembersOpen: location.pathname.startsWith('/members') || (isOverlayModalPath && lastPath.startsWith('/members')),
    isEventsOpen: location.pathname.startsWith('/events') || (isOverlayModalPath && lastPath.startsWith('/events')),
    isGraphOpen: !!graph && !!graphEmbarkId,
    isSearchOpen: location.pathname.startsWith('/history'),
    isInfoOpen: location.pathname.startsWith('/info')
  }), [location.pathname, isOverlayModalPath, lastPath, graph, graphEmbarkId]);

  const { isMembersOpen, isEventsOpen, isGraphOpen, isSearchOpen, isInfoOpen } = modalStates;

  // --> Modal Keys
  // - New Key = Hard Reset
  // - Same Key = Persist
  const [modalKeys, setModalKeys] = useState({
    graph: 0,
    search: 0,
    members: 0,
    events: 0,
    info: 0
  });

  // --> Data Loading
  const autoRefresh = true;
  const currentSeason = currentSeasonKey;
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [showFavourites, setShowFavourites] = useState(false);

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

  // --> Effects

  // Run cache cleanup on initial application load
  useEffect(() => {
    cleanupDeprecatedCache();
    cleanupExpiredCacheItems();
  }, []);

  // Handle Root Path Redirect & View Switching
  useEffect(() => {
    const path = location.pathname;
    // If at root '/', instantly redirect to the stored preference URL
    if (path === '/') {
      const stored = getStoredTab();
      const routeMap = { 'hub': '/hub', 'global': '/leaderboard', 'clubs': '/clubs' };
      // Default to /leaderboard if something goes wrong
      navigate(routeMap[stored] || '/leaderboard', { replace: true });
      return;
    }
    // Sync 'view' state with current URL
    if (path.startsWith('/hub')) setView('hub');
    else if (path.startsWith('/leaderboard')) setView('global');
    else if (path.startsWith('/clubs')) setView('clubs');
    // Note: Modals (like /graph) do not change the background view
  }, [location.pathname, navigate]);

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

  // --> Handlers

  const showToast = useCallback((toastOptions) => {
    setToastMessage({
      timestamp: Date.now(),
      ...toastOptions
    });
  }, [setToastMessage]);

  const openModal = useCallback((newPath) => {
    setModalHistory(prev => [...prev, location.pathname]);
    // Small timeout ensures the State update (History) is processed 
    // before the Router update (Location) hits. This prevents premature unmounting.
    setTimeout(() => {
        navigate(newPath, { replace: true });
    }, 10);
  }, [location.pathname, navigate]);

  const closeModal = useCallback(() => {
    // Pop the last path from our manual history stack
    const newHistory = [...modalHistory];
    const previousPath = newHistory.pop() || '/'; // Default to root if history is empty
    
    // 1. Navigate back to the "Background" modal. 
    // Since it's already open, this is seamless.
    navigate(previousPath, { replace: true });
    
    // 2. Delay the history update slightly.
    // This allows React Router to update `location.pathname` to the new path (e.g., /members)
    // BEFORE we remove /members from the history stack. This prevents flash unmounts.
    setTimeout(() => {
        setModalHistory(newHistory);
    }, 20);
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
    
    showToast({
      title: `Club Search: ${clubTag}`,
      message: message,
      type: 'info',
      duration: 3500
    });
  }, [closeAllModals, currentSeason, showToast, navigate]);

  // --> Modal Open Handlers with Key Logic

  // Helper to generate a new key for a modal ONLY if we are opening it fresh.
  const refreshKey = useCallback((modalName) => {
    setModalKeys(prev => ({ ...prev, [modalName]: Date.now() }));
  }, []);

  const handleEventsModalOpen = useCallback(() => {
    refreshKey('events');
    openModal('/events');
  }, [openModal, refreshKey]);

  const handleInfoModalOpen = useCallback(() => {
    refreshKey('info');
    openModal('/info');
  }, [openModal, refreshKey]);

  const handleMembersModalOpen = useCallback(() => {
    refreshKey('members');
    openModal('/members');
  }, [openModal, refreshKey]);

  const handleSearchModalOpen = useCallback((initialSearch = '') => {
    // Only refresh key if we aren't ALREADY in the search modal.
    // This keeps the modal alive if the user is just updating the query via URL.
    if (!location.pathname.startsWith('/history')) {
      refreshKey('search');
    }
    const path = `/history${initialSearch ? `/${formatUsernameForUrl(initialSearch)}` : ''}`;
    // If the search modal is already open with the same search term, do nothing to prevent unnecessary navigation.
    if (location.pathname.startsWith('/history') && history === formatUsernameForUrl(initialSearch)) return;
    openModal(path);
  }, [openModal, location.pathname, history, refreshKey]);

  const handleSearchSubmit = useCallback((query) => {
    navigate(`/history/${query}`, { replace: true });
  }, [navigate]);
  
  const handleGraphModalOpen = useCallback((embarkId, compareIds = [], seasonKey = null) => {
    // If no seasonKey is provided, default to the current season.
    const effectiveSeasonKey = seasonKey || currentSeason;
    const seasonId = SEASONS[effectiveSeasonKey]?.id;

    if (seasonId === undefined || seasonId === null) {
        showToast({ message: `Cannot open graph for season ${effectiveSeasonKey}. No data available.`, type: 'error' });
        return;
    }

    // Only refresh key if we aren't ALREADY in the graph modal.
    // This prevents re-mounting/flickering when switching seasons or adding comparisons.
    if (!location.pathname.startsWith('/graph')) {
      refreshKey('graph');
    }

    const urlString = formatMultipleUsernamesForUrl(embarkId, compareIds);
    openModal(`/graph/${seasonId}/${urlString}`);
  }, [openModal, currentSeason, showToast, location.pathname, refreshKey]);

  // --> 8. Render

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
          searchModalState={{ isOpen: isSearchOpen, initialSearch: initialSearchQuery }}
          graphModalState={{ isOpen: isGraphOpen, embarkId: graphEmbarkId, compareIds: graphCompareIds, seasonId: graphSeasonId }}
          membersModalOpen={isMembersOpen}
          eventsModalOpen={isEventsOpen}
          infoModalOpen={isInfoOpen}
        />

        {toastMessage && (
          <Toast 
            {...toastMessage}
            onClose={toastMessage.onClose}
            isMobile={isMobile}
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

        {/* Modals: Rendered OUTSIDE the loading conditional */}
        <ModalPortal>
            {isInfoOpen && (
                <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"><LoadingDisplay variant="component" /></div>}>
                    <InfoModal
                        key={`info-${modalKeys.info}`}
                        isOpen={isInfoOpen}
                        onClose={closeModal}
                        isMobile={isMobile}
                    />
                </Suspense>
            )}

            {isMembersOpen && (
                <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"><LoadingDisplay variant="component" /></div>}>
                    <MembersModal 
                        key={`members-${modalKeys.members}`}
                        isOpen={isMembersOpen}
                        onClose={closeModal}
                        globalLeaderboard={globalLeaderboard}
                        onGraphOpen={(embarkId) => handleGraphModalOpen(embarkId)}
                        onPlayerSearch={(name) => handleSearchModalOpen(name)}
                        isMobile={isMobile}
                    />
                </Suspense>
            )}

            {isEventsOpen && (
                <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"><LoadingDisplay variant="component" /></div>}>
                    <EventsModal
                        key={`events-${modalKeys.events}`}
                        isOpen={isEventsOpen}
                        onClose={closeModal}
                        isMobile={isMobile}
                        onPlayerSearch={handleSearchModalOpen}
                        onClubClick={handleClubClick}
                        onGraphOpen={(embarkId, seasonKey) => handleGraphModalOpen(embarkId, [], seasonKey)}
                        showToast={showToast}
                    />
                </Suspense>
            )}

            {isSearchOpen && (
                <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"><LoadingDisplay variant="component" /></div>}>
                    <SearchModal 
                        key={`search-${modalKeys.search}`}
                        isOpen={isSearchOpen}
                        onClose={closeModal}
                        initialSearch={initialSearchQuery}
                        currentSeasonData={globalLeaderboard}
                        onSearch={handleSearchSubmit}
                        isMobile={isMobile}
                        onClubClick={handleClubClick}
                        isLeaderboardLoading={loading}
                    />
                </Suspense>
            )}

            {isGraphOpen && (
                <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"><LoadingDisplay variant="component" /></div>}>
                    <GraphModal
                        key={`graph-${modalKeys.graph}`}
                        isOpen={isGraphOpen}
                        onClose={closeModal}
                        embarkId={graphEmbarkId}
                        compareIds={graphCompareIds}
                        seasonId={graphSeasonId}
                        globalLeaderboard={globalLeaderboard}
                        currentRubyCutoff={currentRubyCutoff}
                        isMobile={isMobile}
                        lastLeaderboardUpdate={lastUpdated}
                    />
                </Suspense>
            )}
        </ModalPortal>

        <Outlet />
      </ModalProvider>
    </div>
  );
};

export default App;