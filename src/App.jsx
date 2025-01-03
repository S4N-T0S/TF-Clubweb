import { useState, useEffect } from 'react';
import { useLeaderboard } from './hooks/useLeaderboard';
import { MembersView } from './components/views/MembersView';
import { ClansView } from './components/views/ClansView';
import { GlobalView } from './components/views/GlobalView';
import { ErrorDisplay } from './components/ErrorDisplay';
import { LoadingDisplay } from './components/LoadingDisplay';
import { DashboardHeader } from './components/DashboardHeader';
import Toast from './components/Toast';
import PlayerSearchModal from './components/PlayerSearchModal';
import ogClanMembers from './data/clanMembers';

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

  const [view, setView] = useState(() => getCookie('dashboard_tab') || 'global');
  const [searchModalState, setSearchModalState] = useState({ 
    isOpen: false, 
    initialSearch: '' 
  });
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  
  const {
    clanMembers,
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
  } = useLeaderboard();

  // Update cookie whenever view changes
  useEffect(() => {
    setTabCookie(view);
  }, [view]);

  const handleClanClick = (clanTag) => {
    setGlobalSearchQuery(`[${clanTag}]`);
    setView('global');
  };

  // If we're on pages.dev, return null to prevent rendering
  if (typeof window !== 'undefined' && window.location.hostname.includes('pages.dev')) {
    return null;
  }

  if (error) return <ErrorDisplay error={error} onRetry={refreshData} />;
  if (loading) return <LoadingDisplay />;

  return (
    <div className="min-h-screen bg-gray-900 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
      {toastMessage && (
        <Toast 
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
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
          />

            {view === 'members' && (
              <MembersView 
                clanMembers={clanMembers} 
                totalMembers={ogClanMembers.length} 
                onPlayerSearch={(name) => setSearchModalState({ isOpen: true, initialSearch: name })}
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
                onPlayerSearch={(name) => setSearchModalState({ isOpen: true, initialSearch: name })}
                searchQuery={globalSearchQuery}
                setSearchQuery={setGlobalSearchQuery}
              />
            )}
        </div>
      </div>
      
      <PlayerSearchModal 
        isOpen={searchModalState.isOpen}
        onClose={() => setSearchModalState({ isOpen: false, initialSearch: '' })}
        initialSearch={searchModalState.initialSearch}
        cachedS5Data={globalLeaderboard}
      />
    </div>
  );
};

export default App;