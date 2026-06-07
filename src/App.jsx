import { useParams, useNavigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useLeaderboard } from './hooks/useLeaderboard';
import { useVersionCheck } from './hooks/useVersionCheck';
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
import { UpdateModal } from './components/modals/UpdateModal';
import Toast from './components/Toast';
import { getStoredTab, setStoredTab, cleanupDeprecatedCache } from './services/localStorageManager';
import { ModalProvider } from './context/ModalProvider';
import { SEASONS, currentSeasonKey } from './services/historicalDataService';
import { cleanupExpiredCacheItems } from './services/idbCache';
import { SEOHead } from './components/SEOHead';

// Lazy load
const GraphModal = lazy(() => import('./components/modals/GraphModal')); //big
const InfoModal = lazy(() => import('./components/modals/InfoModal')); //unused and bigish
const SprayPatternsView = lazy(() => import('./components/views/SprayPatternsView').then(m => ({ default: m.SprayPatternsView })));

const ModalPortal = ({ children }) => {
  return createPortal(children, document.body);
};

const App = () => {
  const isMobile = useMobileDetect() || false;
  const navigate = useNavigate();
  const location = useLocation();
  const { graph, season: seasonIdFromUrl, history, weapon: weaponSlug } = useParams();
  
  // Check for frontend updates every 5 minutes
  const updateAvailable = useVersionCheck(5 * 60 * 1000);

  // --> Global View State
  const [view, setView] = useState(() => {
    const path = location.pathname;
    if (path.startsWith('/leaderboard')) return 'global';
    if (path.startsWith('/clubs')) return 'clubs';
    if (path.startsWith('/hub')) return 'hub';
    if (path.startsWith('/spray-patterns')) return 'spray';
    return getStoredTab();
  });

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
  // The view/modal a stacked overlay (graph/history) was opened on top of.
  // Carried in history state so browser Back/Forward restore it correctly.
  const background = location.state?.background || '';

  // Memoize these states to prevent unnecessary re-calculations
  const modalStates = useMemo(() => ({
    isMembersOpen: location.pathname.startsWith('/members') || (isOverlayModalPath && background.startsWith('/members')),
    isEventsOpen: location.pathname.startsWith('/events') || (isOverlayModalPath && background.startsWith('/events')),
    isGraphOpen: !!graph && !!graphEmbarkId,
    isSearchOpen: location.pathname.startsWith('/history'),
    isInfoOpen: location.pathname.startsWith('/info')
  }), [location.pathname, isOverlayModalPath, background, graph, graphEmbarkId]);

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
  const [showFavourites, setShowFavourites] = useState(false);

  // URL-synced season (?season=S8, ?season=ALL). Absent / invalid -> current.
  // Writing `currentSeason` deletes the param so clean URLs stay clean.
  // Frozen when off /leaderboard (e.g. modal overlay at /events) so the
  // background leaderboard doesn't reset to current season while obscured.
  const [searchParams, setSearchParams] = useSearchParams();
  const isOnLeaderboard = location.pathname.startsWith('/leaderboard');
  const frozenSeasonRef = useRef(currentSeason);
  const selectedSeasonLive = useMemo(() => {
    const s = searchParams.get('season');
    if (!s) return currentSeason;
    if (s === 'ALL') return 'ALL';
    return SEASONS[s] ? s : currentSeason;
  }, [searchParams, currentSeason]);
  if (isOnLeaderboard) frozenSeasonRef.current = selectedSeasonLive;
  const selectedSeason = isOnLeaderboard ? selectedSeasonLive : frozenSeasonRef.current;
  const setSelectedSeason = useCallback((next, { resetPage = false } = {}) => {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      if (!next || next === currentSeason) n.delete('season');
      else n.set('season', next);
      if (resetPage) n.delete('page');
      return n;
    }, { replace: true });
  }, [setSearchParams, currentSeason]);

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
      // Default to /hub if something goes wrong
      navigate(routeMap[stored] || '/hub', { replace: true });
      return;
    }
    // Sync 'view' state with current URL
    if (path.startsWith('/hub')) setView('hub');
    else if (path.startsWith('/leaderboard')) setView('global');
    else if (path.startsWith('/clubs')) setView('clubs');
    else if (path.startsWith('/spray-patterns')) setView('spray');
    // Note: Modals (like /graph) do not change the background view
  }, [location.pathname, navigate]);

  // Update localstorage whenever view changes
  useEffect(() => {
    if (['hub', 'clubs', 'global'].includes(view)) {
      setStoredTab(view);
    }
  }, [view]);

  // Reset favourites view when leaving the leaderboard. Season is URL-driven
  // so no manual reset needed — navigating to /clubs via <Link> drops the query.
  useEffect(() => {
    if (view !== 'global') {
      setShowFavourites(false);
    }
  }, [view]);

  // --> Handlers

  const showToast = useCallback((toastOptions) => {
    setToastMessage({
      timestamp: Date.now(),
      ...toastOptions
    });
  }, [setToastMessage]);

  const openModal = useCallback((newPath) => {
    // Push a browser history entry so Back/Forward work. Remember the
    // current location (path + search) as the background, so stacked overlays
    // (e.g. a graph opened from the events modal) keep what's underneath, and
    // closing restores ?page=N etc.
    navigate(newPath, { state: { background: location.pathname + location.search } });
  }, [location.pathname, location.search, navigate]);

  const closeModal = useCallback(() => {
    // If this overlay was opened on top of a background view within this session,
    // that background is the previous history entry — go back to it so the URL,
    // scroll and state restore naturally (and browser Back does the same thing).
    // Without a background (deep link, or a manual URL edit that reloaded the page)
    // there may be unrelated/stale modal entries behind us, so jump straight home
    // instead of walking back through them one by one.
    if (location.state?.background) navigate(-1);
    else navigate('/', { replace: true });
  }, [navigate, location.state]);

  const closeAllModals = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  const handleClubClick = useCallback((clubTag, seasonKey = null) => {
    seasonKey = seasonKey || currentSeason;
    // Close all modals and reset history before changing view.
    // Build the full /leaderboard URL (search + optional season) in one go so
    // the destination is shareable and only one history entry is written.
    closeAllModals();
    const params = new URLSearchParams();
    params.set('search', `[${clubTag}]`);
    if (seasonKey && seasonKey !== currentSeason) params.set('season', seasonKey);
    navigate(`/leaderboard?${params.toString()}`, { replace: true });

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
        <UpdateModal isVisible={updateAvailable} />

        <SEOHead
          view={view}
          weaponSlug={weaponSlug}
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
              {view === 'spray' && (
                <Suspense fallback={<LoadingDisplay variant="component" />}>
                  <SprayPatternsView />
                </Suspense>
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
            <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><LoadingDisplay variant="component" /></div>}>
              <InfoModal
                key={`info-${modalKeys.info}`}
                isOpen={isInfoOpen}
                onClose={closeModal}
                isMobile={isMobile}
              />
            </Suspense>
          )}

          {isMembersOpen && (
            <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><LoadingDisplay variant="component" /></div>}>
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
            <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><LoadingDisplay variant="component" /></div>}>
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
            <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><LoadingDisplay variant="component" /></div>}>
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
            <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><LoadingDisplay variant="component" /></div>}>
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
                showToast={showToast}
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