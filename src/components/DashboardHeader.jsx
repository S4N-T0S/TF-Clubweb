import { useState, useEffect } from 'react';
import { Users, Trophy, Globe, RefreshCw, FileSearch, Star } from 'lucide-react';
import { DashboardHeaderProps, ViewButtonProps } from '../types/propTypes';
import { useFavorites } from '../context/FavoritesContext';

const ViewButton = ({ active, onClick, icon, text }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap text-base ${
      active 
        ? 'bg-blue-600 text-white' 
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    } w-full sm:w-auto min-w-[100px]`}
  >
    {icon}
    <span className="hidden sm:inline">{text}</span>
  </button>
);

export const DashboardHeader = ({ 
  currentSeason,
  selectedSeason,
  isTopClan,
  unknownMembers,
  view,
  setView,
  onRefresh,
  isRefreshing,
  onOpenSearch,
  isMobile,
  showFavorites,
  setShowFavorites,
  updateToastMessage
}) => {
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
  const { favorites } = useFavorites();

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

  const FavoritesButton = () => {
    const isGlobalView = view === 'global';
    const hasNoFavorites = favorites.length === 0;
    const isHistoricalSeason = selectedSeason !== currentSeason;
  
    // Effect to disable favorites mode when no favorites remain [bugfix]
    useEffect(() => {
      if ((hasNoFavorites && showFavorites) || isHistoricalSeason) {
        setShowFavorites(false);
      }
    }, [hasNoFavorites, isHistoricalSeason]);
  
    return (
      <button
        onClick={() => {
          if (!isGlobalView) {
            updateToastMessage('Switch to Global view to use favorites.', 'info');
            return;
          }
          
          if (isHistoricalSeason) {
            updateToastMessage('Favorites are disabled in historical seasons', 'info');
            return;
          }

          if (hasNoFavorites) {
            updateToastMessage(
              isMobile 
                ? 'No favorites yet!\nLong-press on a player to add them to favorites. You can also swipe to switch pages.' 
                : 'No favorites yet!\nClick the star next to a player to add them to favorites.',
              'info'
            );
            return;
          }
          
          setShowFavorites(!showFavorites);
        }}
        className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 
          ${showFavorites && !isHistoricalSeason 
            ? 'bg-yellow-500 text-white' 
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} 
          w-full sm:w-auto ${!isGlobalView || hasNoFavorites || isHistoricalSeason ? 'opacity-50' : ''}`}
      >
        <Star className={`w-4 h-4 ${showFavorites && !isHistoricalSeason ? 'fill-current' : ''}`} />
      </button>
    );
  };

  return (
    <>
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 w-full">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2">
            <h1 className="text-2xl lg:text-3xl font-bold text-white whitespace-nowrap">OG Club Dashboard</h1>
            {isTopClan && (
            <p className="text-xl font-semibold text-green-400 whitespace-nowrap">
              OG is on top! 🏆
            </p>
            )}
            {view === 'members' && unknownMembers && unknownMembers.length > 0 && (
            <p className={`text-sm ${unknownMembers.length < 10 ? 'text-yellow-400' : 'text-red-400'}`}>
              {unknownMembers.length < 10 
                ? `${unknownMembers.length} member(s) in top 10k not found in clublist.`
                : 'Failed to load an asset, refreshing the page will likely fix this.'}
            </p>
          )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {!isMobile ? (
              <div className="flex items-center gap-2 flex-nowrap">
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
                <FavoritesButton />
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
            ) : (
              <div className="flex justify-end gap-2 w-full">
                <FavoritesButton />
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