import { useState, useEffect } from 'react';
import { Users, Trophy, Globe, RefreshCw, FileSearch, Zap } from 'lucide-react';
import { DashboardHeaderProps, ViewButtonProps } from '../types/propTypes';

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
  isTopClub,
  unknownMembers,
  view,
  setView,
  onToggleAutoRefresh,
  autoRefresh,
  isRefreshing,
  onOpenSearch,
  onOpenEvents,
  isMobile
}) => {
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
  const [isAnimatingZap, setIsAnimatingZap] = useState(true);

  useEffect(() => {
    // Stop the animation after it has run for 8 seconds on page load.
    const timer = setTimeout(() => {
      setIsAnimatingZap(false);
    }, 8000); 

    return () => clearTimeout(timer);
  }, []);

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
      {isAnimatingZap && (
        <style>{`
          @keyframes zap-wipe-animation {
            from {
              mask-position: 0% 150%;
            }
            to {
              mask-position: 0% -50%;
            }
          }
          @keyframes zap-glow-animation {
            0%, 100% {
              filter: drop-shadow(0 0 1px rgba(255, 251, 235, 0.3));
            }
            50% {
              filter: drop-shadow(0 0 5px rgba(250, 204, 21, 1));
            }
          }
          .animate-zap-charge {
            /* The gradient creates a sharp, bright line for the wipe effect */
            mask-image: linear-gradient(to top, transparent 0%, black 25%, black 35%, transparent 50%);
            mask-size: 100% 200%;
            animation: 
              zap-wipe-animation 0.8s cubic-bezier(0.6, 0, 0.4, 1) infinite,
              zap-glow-animation 0.8s cubic-bezier(0.6, 0, 0.4, 1) infinite;
          }
        `}</style>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 w-full">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2">
            <h1 className="text-2xl lg:text-3xl font-bold text-white whitespace-nowrap">OG Club Dashboard</h1>
            {isTopClub && (
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
                  active={view === 'clubs'}
                  onClick={() => setView('clubs')}
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
                  onClick={onOpenEvents}
                  className="relative px-4 py-2 rounded-lg flex items-center justify-center bg-gray-700 text-gray-300 hover:bg-gray-600 w-full sm:w-auto"
                >
                  {/* Base icon, changes to yellow during anim */}
                  <Zap className={`relative w-4 h-4 transition-colors duration-500 ${isAnimatingZap ? 'text-yellow-400' : ''}`} />
                  {/* Animated overlay*/}
                  {isAnimatingZap && (
                    <Zap className="absolute w-4 h-4 text-amber-200 animate-zap-charge" />
                  )}
                </button>
                <button
                  onClick={onOpenSearch}
                  className="px-4 py-2 rounded-lg flex items-center justify-center gap-2 
                    bg-gray-700 text-gray-300 hover:bg-gray-600 w-full sm:w-auto"
                >
                  <FileSearch className="w-4 h-4" />
                </button>
                <button
                  onClick={onToggleAutoRefresh}
                  title={autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
                  className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 w-full sm:w-auto transition-colors
                    ${autoRefresh 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }
                    ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            ) : (
              <div className="flex justify-end gap-2 w-full">
                <button
                  onClick={onOpenEvents}
                  className="relative px-4 py-2 rounded-lg flex items-center justify-center bg-gray-700 text-gray-300 hover:bg-gray-600"
                >
                  {/* Base icon, changes to yellow during anim */}
                  <Zap className={`relative w-4 h-4 transition-colors duration-500 ${isAnimatingZap ? 'text-yellow-400' : ''}`} />
                   {/* Animated overlay*/}
                  {isAnimatingZap && (
                    <Zap className="absolute w-4 h-4 text-amber-200 animate-zap-charge" />
                  )}
                </button>
                <button
                  onClick={onOpenSearch}
                  className="px-4 py-2 rounded-lg flex items-center justify-center gap-2 
                    bg-gray-700 text-gray-300 hover:bg-gray-600"
                >
                  <FileSearch className="w-4 h-4" />
                </button>
                <button
                  onClick={onToggleAutoRefresh}
                  title={autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
                  className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors
                    ${autoRefresh 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }
                    ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={isRefreshing}
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
              onClick={() => handleMobileViewChange('clubs')}
              className={`flex flex-col items-center justify-center w-14 h-6 ${
                view === 'clubs' ? 'text-blue-400' : 'text-gray-400'
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