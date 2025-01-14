import { useState } from 'react';
import { Users, Trophy, StarsIcon, RefreshCw, Search } from 'lucide-react';
import PlayerSearchModal from './PlayerSearchModal';

export const DashboardHeader = ({ 
  isTopClan, 
  unknownMembers, 
  view, 
  setView, 
  onRefresh, 
  isRefreshing 
}) => {
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-white">OG Club Dashboard</h1>
          <p className={`text-xl font-semibold ${isTopClan ? 'text-green-400' : 'text-red-400'}`}>
            {isTopClan ? 'OG is on top! 🏆' : 'OG is not on top :('}
          </p>
          {view === 'members' && unknownMembers.length > 0 && (
            <p className="text-yellow-400 text-sm mt-2">
              {unknownMembers.length} member(s) in top 10k not found in clublist.
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
          <ViewButton
            active={view === 'members'}
            onClick={() => setView('members')}
            icon={<Users className="w-4 h-4" />}
            text="OG Members"
          />
          <ViewButton
            active={view === 'clans'}
            onClick={() => setView('clans')}
            icon={<Trophy className="w-4 h-4" />}
            text="Top Clubs"
          />
          <ViewButton
            active={view === 'global'}
            onClick={() => setView('global')}
            icon={<StarsIcon className="w-4 h-4" />}
            text="Global"
          />
          <button
            onClick={() => setIsSearchModalOpen(true)}
            className="px-4 py-2 rounded-lg flex items-center justify-center gap-2 
              bg-gray-700 text-gray-300 hover:bg-gray-600 w-full sm:w-auto"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 
              bg-gray-700 text-gray-300 hover:bg-gray-600 w-full sm:w-auto
              ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <PlayerSearchModal 
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
      />
    </>
  );
};

const ViewButton = ({ active, onClick, icon, text }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 ${
      active 
        ? 'bg-blue-600 text-white' 
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    } w-full sm:w-auto`}
  >
    {icon}
    {text}
  </button>
);