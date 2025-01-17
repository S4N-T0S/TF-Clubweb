import { Users, Trophy, Globe, RefreshCw, FileSearch } from 'lucide-react';
import { DashboardHeaderProps, ViewButtonProps } from '../types/propTypes';

export const DashboardHeader = ({ 
  isTopClan, 
  unknownMembers, 
  view, 
  setView, 
  onRefresh, 
  isRefreshing,
  onOpenSearch 
}) => {
  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-white">OG Club Dashboard</h1>
          {isTopClan && (
          <p className="text-xl font-semibold text-green-400">
            OG is on top! 🏆
          </p>
          )}
          {view === 'members' && unknownMembers && unknownMembers.length > 0 ? (
            unknownMembers.length < 10 ? (
              <p className="text-yellow-400 text-sm mt-2">
                {unknownMembers.length} member(s) in top 10k not found in clublist.
              </p>
            ) : unknownMembers.length > 10 ? (
              <p className="text-red-400 text-sm mt-2">
                Failed to load an asset, refreshing the page will likely fix this.
              </p>
            ) : null
          ) : null }
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
            icon={<Globe className="w-4 h-4" />}
            text="Global"
          />
          <button
            onClick={onOpenSearch}
            className="px-4 py-2 rounded-lg flex items-center justify-center gap-2 
              bg-gray-700 text-gray-300 hover:bg-gray-600 w-full sm:w-auto"
          >
            <FileSearch className="w-4 h-4" />
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

DashboardHeader.propTypes = DashboardHeaderProps;
ViewButton.propTypes = ViewButtonProps;