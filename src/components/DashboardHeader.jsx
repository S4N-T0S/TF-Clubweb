import { useState, useEffect } from 'react';
import { Users, Trophy, Globe, RefreshCw, FileSearch } from 'lucide-react';
import { DashboardHeaderProps, ViewButtonProps } from '../types/propTypes';


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

export const DashboardHeader = ({ 
  isTopClan,
  unknownMembers,
  view,
  setView,
  onRefresh,
  isRefreshing,
  onOpenSearch,
  isMobile
}) => {
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);

  useEffect(() => {
    if (!isMobile) return;

    const handleScroll = () => {
      const scrollPosition = window.innerHeight + window.scrollY;
      const documentHeight = document.documentElement.scrollHeight;
      
      // Check if scrolled within 100 pixels of the bottom
      setIsScrolledToBottom(scrollPosition >= documentHeight - 100);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

  const handleMobileViewChange = (newView) => {
    setView(newView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-2">
            {!isMobile ? (
              <>
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
              </>
            ) : (
              <div className="flex justify-end gap-2 w-full">
                <button
                  onClick={onOpenSearch}
                  className="px-4 py-2 rounded-lg flex items-center justify-center gap-2 
                    bg-gray-700 text-gray-300 hover:bg-gray-600"
                >
                  <FileSearch className="w-4 h-4" />
                </button>
                <button
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 
                    bg-gray-700 text-gray-300 hover:bg-gray-600
                    ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isMobile && !isScrolledToBottom && (
  <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 z-50">
    <div className="flex justify-around py-3">
      <button 
        onClick={() => handleMobileViewChange('members')}
        className={`flex flex-col items-center justify-center w-14 h-6 ${
          view === 'members' ? 'text-blue-400' : 'text-gray-400'
        }`}
      >
        <Users className="w-6 h-6" />
      </button>
      <button 
        onClick={() => handleMobileViewChange('clans')}
        className={`flex flex-col items-center justify-center w-14 h-6 ${
          view === 'clans' ? 'text-blue-400' : 'text-gray-400'
        }`}
      >
        <Trophy className="w-6 h-6" />
      </button>
      <button 
        onClick={() => handleMobileViewChange('global')}
        className={`flex flex-col items-center justify-center w-14 h-6 ${
          view === 'global' ? 'text-blue-400' : 'text-gray-400'
        }`}
      >
        <Globe className="w-6 h-6" />
      </button>
    </div>
  </div>
)}
    </>
  );
};

DashboardHeader.propTypes = DashboardHeaderProps;
ViewButton.propTypes = ViewButtonProps;