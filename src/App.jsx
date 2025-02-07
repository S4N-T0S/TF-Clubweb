import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLeaderboard } from './hooks/useLeaderboard';
import { MembersView } from './components/views/MembersView';
import { ClansView } from './components/views/ClansView';
import { GlobalView } from './components/views/GlobalView';
import { ErrorDisplay } from './components/ErrorDisplay';
import { LoadingDisplay } from './components/LoadingDisplay';
import { DashboardHeader } from './components/DashboardHeader';
import { fetchClanMembers } from './services/mb-api';
import { safeParseUsernameFromUrl, formatUsernameForUrl, parseMultipleUsernamesFromUrl, formatMultipleUsernamesForUrl } from './utils/urlHandler';
import { useMobileDetect } from './hooks/useMobileDetect';
import PlayerSearchModal from './components/PlayerSearchModal';
import PlayerGraphModal from './components/PlayerGraphModal';
import Toast from './components/Toast';
import { FavoritesProvider } from './context/FavoritesContext';
import { ModalProvider } from './context/ModalContext';

// No clue why I was using cookie before
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
  const [clanMembersData, setClanMembersData] = useState([]);
  const [clanMembersLoading, setClanMembersLoading] = useState(true);
  const [showFavorites, setShowFavorites] = useState(false);

  const {
    clanMembers,
    rankedClanMembers,
    isTopClan,
    topClans,
    unknownMembers,
    globalLeaderboard,
    rubyCutoff,
    loading,
    error,
    isRefreshing,
    refreshData,
    toastMessage,
    setToastMessage,
  } = useLeaderboard(clanMembersData);

  // Load clan members data once on page load
  const toastMessageRef = useRef(setToastMessage);
  useEffect(() => {
    const loadClanMembers = async () => {
      try {
        const members = await fetchClanMembers();
        setClanMembersData(members);
      } catch (error) {
        console.error('Failed to load clan members:', error);
        toastMessageRef.current({
          message: 'Failed to load clan members data',
          type: 'error'
        });
      } finally {
        setClanMembersLoading(false);
      }
    };

    loadClanMembers();
  }, []);

  const updateToastMessage = (message, type = 'info') => {
    setToastMessage({
      message,
      type,
      timestamp: Date.now(),
      ttl: 10 * 60,
    });
  };

  // Update localstorage whenever view changes
  useEffect(() => {
    setStoredTab(view);
  }, [view]);

  const handleClanClick = (clanTag) => {
    setGlobalSearchQuery(`[${clanTag}]`);
    setView('global');
  };

  // Handle search modal open/close
  const handleSearchModalClose = () => {
    setSearchModalState({ isOpen: false, initialSearch: '', isMobile });
    navigate('/');
  };

  const handleSearchModalOpen = (initialSearch = '') => {
    setSearchModalState({ isOpen: true, initialSearch, isMobile });
    if (initialSearch) {
      navigate(`/history/${formatUsernameForUrl(initialSearch)}`);
    }
  };

  // Handle search submission
  const handleSearchSubmit = (query) => {
    window.history.replaceState(null, '', `/history/${query}`);
  };

  // Handle graph modal close
  const handleGraphModalClose = () => {
    setGraphModalState({ isOpen: false, playerId: null, compareIds: [], isClubView: false, isMobile });
    navigate('/');
  };

  // Handle graph modal open/close
  const handleGraphModalOpen = useCallback((playerId, compareIds = []) => {
    const urlString = formatMultipleUsernamesForUrl(playerId, compareIds);
    navigate(`/graph/${urlString}`);
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
  if (loading || clanMembersLoading) return <LoadingDisplay />;

  return (
    <div className="min-h-screen bg-gray-900 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
      <FavoritesProvider>
        <ModalProvider>
          {toastMessage && (
            <Toast 
              message={toastMessage.message}
              type={toastMessage.type}
              timestamp={toastMessage.timestamp}
              ttl={toastMessage.ttl}
            />
          )}
          <div className="max-w-7xl mx-auto p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6">
              <DashboardHeader
                isTopClan={isTopClan}
                unknownMembers={unknownMembers}
                view={view}
                setView={setView}
                onRefresh={() => refreshData(false)}
                isRefreshing={isRefreshing}
                onOpenSearch={() => handleSearchModalOpen()}
                isMobile={isMobile}
                showFavorites={showFavorites}
                setShowFavorites={setShowFavorites}
                updateToastMessage={updateToastMessage}
              />

              {view === 'members' && (
                <MembersView 
                  clanMembers={clanMembers} 
                  totalMembers={clanMembersData.length} 
                  onPlayerSearch={(name) => handleSearchModalOpen(name)}
                  clanMembersData={clanMembersData} // Pass clan members data to members view
                  onGraphOpen={(playerId) => handleGraphModalOpen(playerId)}
                  isMobile={isMobile}
                />
              )}
              {view === 'clans' && (
                <ClansView 
                  topClans={topClans} 
                  onClanClick={handleClanClick}
                  isMobile={isMobile}
                />
              )}
              {view === 'global' && (
                <GlobalView 
                  globalLeaderboard={globalLeaderboard}
                  rubyCutoff={rubyCutoff}
                  onPlayerSearch={(name) => handleSearchModalOpen(name)}
                  searchQuery={globalSearchQuery}
                  setSearchQuery={setGlobalSearchQuery}
                  onGraphOpen={(playerId) => handleGraphModalOpen(playerId)}
                  isMobile={isMobile}
                  showFavorites={showFavorites}
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
          />

          {graphModalState.playerId && (
            <PlayerGraphModal
              isOpen={graphModalState.isOpen}
              onClose={handleGraphModalClose}
              playerId={graphModalState.playerId}
              compareIds={graphModalState.compareIds}
              isClubView={graphModalState.isClubView}
              globalLeaderboard={graphModalState.isClubView ? rankedClanMembers : globalLeaderboard}
              onSwitchToGlobal={() => setView('global')}
              isMobile={graphModalState.isMobile}
            />
          )}
          <Outlet />
        </ModalProvider>
      </FavoritesProvider>
    </div>
  );
};

export default App;