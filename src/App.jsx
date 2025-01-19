import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useLeaderboard } from './hooks/useLeaderboard';
import { MembersView } from './components/views/MembersView';
import { ClansView } from './components/views/ClansView';
import { GlobalView } from './components/views/GlobalView';
import { ErrorDisplay } from './components/ErrorDisplay';
import { LoadingDisplay } from './components/LoadingDisplay';
import { DashboardHeader } from './components/DashboardHeader';
import Toast from './components/Toast';
import PlayerSearchModal from './components/PlayerSearchModal';
import PlayerGraphModal from './components/PlayerGraphModal';
import { fetchClanMembers } from './services/mb-api';
import { safeParseUsernameFromUrl, formatUsernameForUrl } from './utils/urlHandler';

// Cookie helper functions
const getCookie = (name) => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
};

const setTabCookie = (tab) => {
  // Set cookie with 1 week expiration
  const oneWeek = 7 * 24 * 60 * 60;
  document.cookie = `dashboard_tab=${tab}; max-age=${oneWeek}; path=/; SameSite=Strict`;
};

const App = () => {
  // Early return if on pages.dev domain
  useEffect(() => {
    if (window.location.hostname.includes('pages.dev')) {
      window.location.replace('https://ogclub.s4nt0s.eu');
      return;
    }
  }, []);

  const navigate = useNavigate();
  const { graph, history } = useParams();

  const [view, setView] = useState(() => getCookie('dashboard_tab') || 'global');
  const [searchModalState, setSearchModalState] = useState({ 
    isOpen: false, 
    initialSearch: '' 
  });
  const [graphModalState, setGraphModalState] = useState({
    isOpen: false,
    playerId: null,
    isClubView: false
  });
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [clanMembersData, setClanMembersData] = useState([]);
  const [clanMembersLoading, setClanMembersLoading] = useState(true);

  const {
    clanMembers,
    rankedClanMembers,
    isTopClan,
    topClans,
    unknownMembers,
    globalLeaderboard,
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

  // Handle URL parameters on mount
  useEffect(() => {
    if (graph) {
      const parsed = safeParseUsernameFromUrl(graph);
      if (parsed) {
        setView('global');
        setGraphModalState({ 
          isOpen: true, 
          playerId: graph,
          isClubView: false 
        });
      } else {
        navigate('/');
      }
    }
    if (history) {
      const parsed = safeParseUsernameFromUrl(history);
      if (parsed) {
        setSearchModalState({ isOpen: true, initialSearch: parsed });
      } else {
        navigate('/');
      }
    }
  }, [graph, history, navigate]);

  // Update cookie whenever view changes
  useEffect(() => {
    setTabCookie(view);
  }, [view]);

  const handleClanClick = (clanTag) => {
    setGlobalSearchQuery(`[${clanTag}]`);
    setView('global');
  };

  // Handle search modal open/close
  const handleSearchModalOpen = (initialSearch = '') => {
    setSearchModalState({ isOpen: true, initialSearch });
    if (initialSearch) {
      navigate(`/history/${formatUsernameForUrl(initialSearch)}`);
    }
  };

  const handleSearchModalClose = () => {
    setSearchModalState({ isOpen: false, initialSearch: '' });
    navigate('/');
  };

  // Handle graph modal open/close
  const handleGraphModalOpen = (playerId, isClubView = false) => {
    setGraphModalState({ isOpen: true, playerId, isClubView });
    navigate(`/graph/${playerId}`);
  };

  const handleGraphModalClose = () => {
    setGraphModalState({ isOpen: false, playerId: null, isClubView: false });
    navigate('/');
  };

  // Handle search submission
  const handleSearchSubmit = (query) => {
    navigate(`/history/${query}`);
  };

  // If we're on pages.dev, return null to prevent rendering
  if (typeof window !== 'undefined' && window.location.hostname.includes('pages.dev')) {
    return null;
  }

  if (error) return <ErrorDisplay error={error} onRetry={refreshData} />;
  if (loading || clanMembersLoading) return <LoadingDisplay />;

  return (
    <div className="min-h-screen bg-gray-900 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
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
          />

          {view === 'members' && (
            <MembersView 
              clanMembers={clanMembers} 
              totalMembers={clanMembersData.length} 
              onPlayerSearch={(name) => handleSearchModalOpen(name)}
              clanMembersData={clanMembersData} // Pass clan members data to members view
              onGraphOpen={(playerId) => handleGraphModalOpen(playerId, true)}
            />
          )}
          {view === 'clans' && (
            <ClansView 
              topClans={topClans} 
              onClanClick={handleClanClick}
            />
          )}
          {view === 'global' && (
            <GlobalView 
              globalLeaderboard={globalLeaderboard} 
              onPlayerSearch={(name) => handleSearchModalOpen(name)}
              searchQuery={globalSearchQuery}
              setSearchQuery={setGlobalSearchQuery}
              onGraphOpen={(playerId) => handleGraphModalOpen(playerId, false)}
            />
          )}
        </div>
      </div>
      
      <PlayerSearchModal 
        isOpen={searchModalState.isOpen}
        onClose={handleSearchModalClose}
        initialSearch={searchModalState.initialSearch}
        cachedS5Data={globalLeaderboard}
        onSearch={handleSearchSubmit}
      />

      {graphModalState.playerId && (
        <PlayerGraphModal
          isOpen={graphModalState.isOpen}
          onClose={handleGraphModalClose}
          playerId={graphModalState.playerId}
          isClubView={graphModalState.isClubView}
          globalLeaderboard={graphModalState.isClubView ? rankedClanMembers : globalLeaderboard}
        />
      )}
      <Outlet />
    </div>
  );
};

export default App;