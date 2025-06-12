import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
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
import PlayerSearchModal from './components/PlayerSearchModal';
import PlayerGraphModal from './components/PlayerGraphModal';
import Toast from './components/Toast';
import { FavouritesProvider } from './context/FavouritesContext';
import { ModalProvider } from './context/ModalContext';

// Storing last view selection in localStorage.
const getStoredTab = () => {
  return localStorage.getItem('dashboard_tab') || 'global';
};

const setStoredTab = (tab) => {
  localStorage.setItem('dashboard_tab', tab);
};

const App = () => {
  const isMobile = useMobileDetect() || false;
  const navigate = useNavigate();
  const { graph, history } = useParams();
  const [view, setView] = useState(() => getStoredTab());
  const [searchModalState, setSearchModalState] = useState({ 
    isOpen: false, 
    initialSearch: '',
    isMobile
  });
  const [graphModalState, setGraphModalState] = useState({
    isOpen: false,
    playerId: null,
    compareIds: [],
    isClubView: false,
    isMobile
  });
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [clubMembersData, setClubMembersData] = useState([]);
  const [clubMembersLoading, setClubMembersLoading] = useState(true);
  const [showFavourites, setShowFavourites] = useState(false);

  const currentSeason = 'S7';
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);
  const {
    clubMembers,
    rankedClubMembers,
    isTopClub,
    topClubs,
    unknownMembers,
    globalLeaderboard,
    rubyCutoff,
    loading,
    error,
    isRefreshing,
    refreshData,
    toastMessage,
    setToastMessage,
  } = useLeaderboard(clubMembersData);

  // Load club members data once on page load
  const toastMessageRef = useRef(setToastMessage);
  useEffect(() => {
    const loadClubMembers = async () => {
      try {
        const members = await fetchClubMembers();
        setClubMembersData(members);
      } catch (error) {
        console.error('Failed to load club members:', error);
        toastMessageRef.current({
          message: 'Failed to load club members data',
          type: 'error'
        });
      } finally {
        setClubMembersLoading(false);
      }
    };

    loadClubMembers();
  }, []);

  const showToast = (toastOptions) => {
    setToastMessage({
      timestamp: Date.now(), // required for index/unique
      ...toastOptions
    });
  };

  // Update localstorage whenever view changes
  useEffect(() => {
    setStoredTab(view);
  }, [view]);

  // Reset selected season when view changes off global
  useEffect(() => {
    if (view !== 'global') {
      setSelectedSeason(currentSeason);
    }
  }, [view, currentSeason]);

  const handleClubClick = (clubTag, seasonKey = null) => {
    seasonKey = seasonKey || currentSeason; // Mutate seasonKey if null
    // Reset URL to root and close modals
    handleSearchModalClose();
    handleGraphModalClose();
  
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
  };

  // Handle search modal open/close
  const handleSearchModalClose = () => {
    setSearchModalState({ isOpen: false, initialSearch: '', isMobile });
    navigate('/', { replace: true });
  };

  const handleSearchModalOpen = (initialSearch = '') => {
    setSearchModalState({ isOpen: true, initialSearch, isMobile });
    if (initialSearch) {
      navigate(`/history/${formatUsernameForUrl(initialSearch)}`, { replace: true });
    }
  };

  // Handle search submission
  const handleSearchSubmit = (query) => {
    window.history.replaceState(null, '', `/history/${query}`);
  };

  // Handle graph modal close
  const handleGraphModalClose = () => {
    setGraphModalState({ isOpen: false, playerId: null, compareIds: [], isClubView: false, isMobile });
    navigate('/', { replace: true });
  };

  // Handle graph modal open/close
  const handleGraphModalOpen = useCallback((playerId, compareIds = []) => {
    const urlString = formatMultipleUsernamesForUrl(playerId, compareIds);
    navigate(`/graph/${urlString}`, { replace: true });
  }, [navigate]);

  // Handle URL parameters on mount
  useEffect(() => {
    if (graph) {
      const { main, compare } = parseMultipleUsernamesFromUrl(graph);
      if (!main) {
        navigate('/');
        return;
      }
  
      setGraphModalState(prev => {
        // Important: Check if we really need to update the state
        if (
          prev.isOpen && 
          prev.playerId === main && 
          JSON.stringify(prev.compareIds) === JSON.stringify(compare) &&
          prev.isClubView === (view === 'members') &&
          prev.isMobile === isMobile
        ) {
          return prev; // Return previous state if nothing changed
        }
        
        return {
        isOpen: true,
        playerId: main,
        compareIds: compare,
        isClubView: (view === 'members'),
        isMobile
        };
      });
    }
  }, [graph, navigate, view, isMobile]);

  useEffect(() =>  {
    if (history) {
      const parsed = safeParseUsernameFromUrl(history);
      if (parsed) {
        setSearchModalState({ isOpen: true, initialSearch: parsed, isMobile });
      } else {
        navigate('/');
        return;
      }
    }
  }, [history, navigate, isMobile]);

  if (error) return <ErrorDisplay error={error} onRetry={refreshData} />;
  if (loading || clubMembersLoading) return <LoadingDisplay />;

  return (
    <div className="min-h-screen bg-gray-900 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
      <FavouritesProvider>
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
                currentSeason={currentSeason}
                selectedSeason={selectedSeason}
                isTopClub={isTopClub}
                unknownMembers={unknownMembers}
                view={view}
                setView={setView}
                onRefresh={() => refreshData(false)}
                isRefreshing={isRefreshing}
                onOpenSearch={() => handleSearchModalOpen()}
                isMobile={isMobile}
                showFavourites={showFavourites}
                setShowFavourites={setShowFavourites}
                showToast={showToast}
              />

              {view === 'members' && (
                <MembersView 
                  clubMembers={clubMembers} 
                  totalMembers={clubMembersData.length} 
                  onPlayerSearch={(name) => handleSearchModalOpen(name)}
                  clubMembersData={clubMembersData} // Pass club members data to members view
                  onGraphOpen={(playerId) => handleGraphModalOpen(playerId)}
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
                  rubyCutoff={rubyCutoff}
                  onPlayerSearch={(name) => handleSearchModalOpen(name)}
                  searchQuery={globalSearchQuery}
                  setSearchQuery={setGlobalSearchQuery}
                  onGraphOpen={(playerId) => handleGraphModalOpen(playerId)}
                  isMobile={isMobile}
                  showFavourites={showFavourites}
                  setShowFavourites={setShowFavourites}
                  showToast={showToast}
                />
              )}
            </div>
          </div>

          <PlayerSearchModal 
            isOpen={searchModalState.isOpen}
            onClose={handleSearchModalClose}
            initialSearch={searchModalState.initialSearch}
            currentSeasonData={globalLeaderboard}
            onSearch={handleSearchSubmit}
            isMobile={isMobile}
            onClubClick={handleClubClick}
          />

          {graphModalState.playerId && (
            <PlayerGraphModal
              isOpen={graphModalState.isOpen}
              onClose={handleGraphModalClose}
              playerId={graphModalState.playerId}
              compareIds={graphModalState.compareIds}
              isClubView={graphModalState.isClubView}
              globalLeaderboard={graphModalState.isClubView ? rankedClubMembers : globalLeaderboard}
              onSwitchToGlobal={() => setView('global')}
              isMobile={graphModalState.isMobile}
            />
          )}
          <Outlet />
        </ModalProvider>
      </FavouritesProvider>
    </div>
  );
};

export default App;