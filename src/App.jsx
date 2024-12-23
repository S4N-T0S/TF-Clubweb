import { useState } from 'react';
import { useLeaderboard } from './hooks/useLeaderboard';
import { MembersView } from './components/views/MembersView';
import { ClansView } from './components/views/ClansView';
import { GlobalView } from './components/views/GlobalView';
import { ErrorDisplay } from './components/ErrorDisplay';
import { LoadingDisplay } from './components/LoadingDisplay';
import { DashboardHeader } from './components/DashboardHeader';
import Toast from './components/Toast';
import ogClanMembers from './data/clanMembers';

const App = () => {
  const [view, setView] = useState('members');
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
    setToastMessage
  } = useLeaderboard();

  if (error) return <ErrorDisplay error={error} onRetry={refreshData} />;
  if (loading) return <LoadingDisplay />;

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      {toastMessage && (
        <Toast 
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
        />
      )}
      <div className="max-w-7xl mx-auto">
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
            />
          )}
          {view === 'clans' && <ClansView topClans={topClans} />}
          {view === 'global' && <GlobalView globalLeaderboard={globalLeaderboard} />}
        </div>
      </div>
    </div>
  );
};

export default App;