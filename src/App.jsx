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

const App = () => {
  const [view, setView] = useState('members');
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
    dataSource,
    timestamp,
    remainingTtl
  } = useLeaderboard();

  useEffect(() => {
    if (['kv-cache-fallback', 'client-cache-fallback', 'client-cache-emergency'].includes(dataSource)) {
      setToastMessage({
        message: 'Using cached data - API temporarily unavailable',
        type: 'error',
        timestamp: timestamp,
        ttl: remainingTtl
      });
    } else if (isRefreshing && ['kv-cache', 'client-cache'].includes(dataSource)) {
      setToastMessage({
        message: 'Using cached data while refreshing',
        type: 'error',
        timestamp: timestamp,
        ttl: remainingTtl
      });
    }
  }, [dataSource, timestamp, remainingTtl, isRefreshing, setToastMessage]);

  const handleClanClick = (clanTag) => {
    setGlobalSearchQuery(`[${clanTag}]`);
    setView('global');
  };

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

          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
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