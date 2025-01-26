import { ChevronUp, ChevronDown, UserSearch, LineChart, Star, StarOff } from 'lucide-react';
import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { LeagueDisplay } from '../LeagueDisplay';
import { Pagination } from '../Pagination';
import { BackToTop } from '../BackToTop';
import { useSwipe } from '../../hooks/useSwipe';
import { useEffect, useRef } from 'react';
import { GlobalViewProps, GlobalPlayerRowProps, RankChangeDisplayProps, RubyCutoffIndicatorProps } from '../../types/propTypes';
import { PlatformIcons } from "../icons/Platforms";
import { SortButton } from '../SortButton';
import { Hexagon } from '../icons/Hexagon';
import { useFavorites } from '../../context/FavoritesContext';
import { useOnHold } from '../../hooks/useOnHold';

const RankChangeDisplay = ({ change }) => {
  if (!change || change === 0) return null;
  
  const isPositive = change > 0;
  return (
    <div className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
      <span className="text-sm">{Math.abs(change).toLocaleString()}</span>
      {isPositive ? (
        <ChevronUp className="w-4 h-4" />
      ) : (
        <ChevronDown className="w-4 h-4" />
      )}
    </div>
  );
};

const RubyCutoffIndicator = ({ cutoff, onCutoffClick }) => {
  if (!cutoff) return null;

  return (
    <div 
      className={`fixed top-6 left-6 z-50 bg-gray-800/95 shadow-lg px-3 py-1.5 rounded-full border border-red-500/20 backdrop-blur-sm cursor-pointer hover:border-red-500/40 transition-colors`}
      onClick={onCutoffClick}
    >
      <div className="flex items-center gap-2 select-none">
        <Hexagon className={'w-3 h-3 text-red-600 animate-pulse'} />
        <span className="text-red-400 text-sm font-medium">
          {cutoff.toLocaleString()} RS
        </span>
      </div>
    </div>
  );
};

const PlayerRow = ({ player, onSearchClick, onClanClick, onGraphClick, isMobile }) => {
  const [username, discriminator] = player.name.split('#');
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { isHolding, holdProps, ref } = useOnHold(() => {
    if (isFavorite(player) || player.foundViaFallback) {
      removeFavorite(player);
    } else {
      addFavorite(player);
    }
  });
  const isFav = isFavorite(player);
  const animationClasses = isMobile && isHolding
    ? isFav || player.foundViaFallback 
      ? 'animate-unfavorite-fill'
      : 'animate-favorite-fill'
    : '';

  const getBackgroundClass = () => {
    if (player.notFound) return '!bg-red-900/50';
    if (player.foundViaFallback) return '!bg-amber-800/30';
    if (isFav) return '!bg-yellow-600/20';
    return '';
  };
  
  // Desktop favorite button handler
  const handleFavoriteClick = () => {
    if (isFav || player.foundViaFallback) {
      removeFavorite(player);
    } else {
      addFavorite(player);
    }
  };
  
  // Mobile row rendering
  if (isMobile) {
    return (
      <div 
        ref={ref} className={`player-row flex flex-col gap-2 p-4 border-b border-gray-700 bg-gray-800 rounded-lg shadow-sm active:bg-gray-750 
          active:scale-[0.99] transition-all duration-150 ease-in-out ${getBackgroundClass()} ${animationClasses}`}
        {...holdProps}
        >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-gray-300 font-bold w-24">#{player.rank.toLocaleString()}</span>
            <RankChangeDisplay change={player.change} />
          </div>
          <LineChart
            className="w-5 h-5 text-gray-400 hover:text-blue-400 cursor-pointer"
            onClick={() => onGraphClick(player.name)}
          />
        </div>
        <div className="flex justify-between items-start">
          <div className="flex flex-col min-w-0 flex-1 mr-3">
            <div className="flex flex-col">
              {player.clubTag && (
                <span 
                  className="self-start bg-gray-700 px-1.5 py-0.5 rounded text-blue-400 hover:text-blue-300 cursor-pointer mb-1"
                  onClick={() => onClanClick(player.clubTag)}
                >
                  [{player.clubTag}]
                </span>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-300 truncate">
                  {username}
                  <span className="text-gray-500">#{discriminator}</span>
                </span>
                <UserSearch 
                  className="flex-shrink-0 w-6 h-6 p-1 text-gray-400 hover:text-blue-400 cursor-pointer rounded-full hover:bg-gray-700 transition-colors" 
                  onClick={() => onSearchClick(player.name)}
                />
              </div>
            </div>
            {(player.steamName || player.psnName || player.xboxName) && (
              <div className="text-[11px] text-gray-400 mt-1 flex flex-wrap gap-1.5">
                {player.steamName && (
                  <span className="flex items-center gap-1 bg-gray-700 rounded px-1.5 py-0.5">
                    <PlatformIcons.Steam className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate max-w-[120px]">{player.steamName}</span>
                  </span>
                )}
                {player.psnName && (
                  <span className="flex items-center gap-1 bg-gray-700 rounded px-1.5 py-0.5">
                    <PlatformIcons.PSN className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate max-w-[120px]">{player.psnName}</span>
                  </span>
                )}
                {player.xboxName && (
                  <span className="flex items-center gap-1 bg-gray-700 rounded px-1.5 py-0.5">
                    <PlatformIcons.Xbox className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate max-w-[120px]">{player.xboxName}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex-shrink-0">
            <LeagueDisplay 
              league={player.league} 
              score={player.rankScore} 
              rank={player.rank}
              isMobile={isMobile}
            />
          </div>
        </div>
      </div>
    );
  }
  
  // Desktop row rendering (original)
  return (
    <tr ref={ref} key={player.name} className={`border-t border-gray-700 hover:bg-gray-700 ${getBackgroundClass()}`}>
      <td className="px-4 py-2 text-gray-300 text-start">#{player.rank.toLocaleString()}</td>
      <td className="px-4 py-2 w-24">
        <div className="flex items-center justify-center gap-2">
          <RankChangeDisplay change={player.change} />
        </div>
      </td>
      <td className="py-2 pr-0 pl-2 w-8">
        <button 
          onClick={handleFavoriteClick}
          className="hover:scale-110 transition-transform flex items-center justify-center"
        >
          {isFav || player.foundViaFallback ? (
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
          ) : (
            <StarOff className="w-5 h-5 text-gray-400 hover:text-yellow-500" />
          )}
        </button>
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            {player.clubTag ? (
              <span className="text-gray-300">
                <span 
                  className="bg-gray-700 px-1 py-0.5 rounded text-blue-400 hover:text-blue-300 cursor-pointer"
                  onClick={() => onClanClick(player.clubTag)}
                >
                  [{player.clubTag}]
                </span>
                {` ${username}`}
                <span className="text-gray-500">#{discriminator}</span>
              </span>
            ) : (
              <span className="text-gray-300">
                {username}
                <span className="text-gray-500">#{discriminator}</span>
              </span>
            )}
            <UserSearch 
              className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer" 
              onClick={() => onSearchClick(player.name)}
            />
          </div>
          {(player.steamName || player.psnName || player.xboxName) && (
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-3">
              {player.steamName && (
                <span className="flex items-center">
                  <PlatformIcons.Steam />
                  {player.steamName}
                </span>
              )}
              {player.psnName && (
                <span className="flex items-center">
                  <PlatformIcons.PSN />
                  {player.psnName}
                </span>
              )}
              {player.xboxName && (
                <span className="flex items-center">
                  <PlatformIcons.Xbox />
                  {player.xboxName}
                </span>
              )}
            </div>
          )}
        </div>
      </td>
      <LeagueDisplay 
        league={player.league} 
        score={player.rankScore} 
        rank={player.rank}
        isMobile={isMobile}
      />
      <td className="px-4 py-2 text-center">
        <LineChart
          className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer mx-auto"
          onClick={() => onGraphClick(player.name)}
        />
      </td>
    </tr>
  );
};

export const GlobalView = ({ 
  globalLeaderboard,
  rubyCutoff,
  onPlayerSearch,
  searchQuery: initialSearchQuery,
  setSearchQuery: setGlobalSearchQuery,
  onGraphOpen,
  isMobile,
  showFavorites,
  setShowFavorites
}) => {
  const searchInputRef = useRef(null);
  const { favorites, getFavoritesWithFallback } = useFavorites();
  const { slideDirection, showIndicator } = useSwipe(
    () => currentPage < totalPages && handlePageChange(currentPage + 1),
    () => currentPage > 1 && handlePageChange(currentPage - 1),
    {
      enableIndicator: true,
      onSwipeStart: () => {
        // Optional callback
      },
      onSwipeEnd: () => {
        // Optional callback
      }
    }
  );

  const {
    searchQuery,
    setSearchQuery,
    currentItems,
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    handlePageChange,
    filteredItems,
    sortConfig,
    handleSort,
    scrollToIndex
  } = usePagination(
    showFavorites 
      ? getFavoritesWithFallback(globalLeaderboard)
      : globalLeaderboard,
    isMobile ? 25 : 50,
    isMobile
  );

  useEffect(() => {
    if (showFavorites && favorites.length === 0) {
      // Assuming you have a toast context/function
      //showToast({
      //  message: 'No favorites yet! Long-press on a player to add them to favorites.',
      //  type: 'info'
      //});
      setShowFavorites(false);
    }
  }, [showFavorites, favorites.length, setShowFavorites]);

  // Don't show ruby cutoff in favorites mode
  const shouldShowRubyCutoff = !showFavorites && rubyCutoff;

  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
      setGlobalSearchQuery('');
    }
  }, [initialSearchQuery, setSearchQuery, setGlobalSearchQuery]);

  const handleClanClick = (clubTag) => {
    setSearchQuery('');
    setGlobalSearchQuery(`[${clubTag}]`);
  };

  const handleCutoffClick = () => {
    setSearchQuery('');

    setTimeout(() => {
      scrollToIndex(500);
    }, 125);
  };

  useEffect(() => {
    if (!initialSearchQuery && searchInputRef.current && !isMobile) {
      searchInputRef.current.focus();
    }
  }, [initialSearchQuery, isMobile]);

  return (
    <div>
      <SearchBar 
        value={searchQuery} 
        onChange={setSearchQuery} 
        searchInputRef={searchInputRef}
      />
      {shouldShowRubyCutoff && (
        <RubyCutoffIndicator cutoff={rubyCutoff} onCutoffClick={handleCutoffClick} />
      )}
      <div className="page-transition-container">
      <div className={`page-content ${slideDirection}`} key={currentPage}>
      <div className="table-container">
        {isMobile ? (
          <div>
            {currentItems.map((player) => (
              <PlayerRow 
                key={player.name}
                player={player}
                onSearchClick={onPlayerSearch}
                onClanClick={handleClanClick}
                onGraphClick={onGraphOpen}
                isMobile={true}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg">
            <table className="w-full min-w-[640px] rounded-lg">
              <thead>
                <tr className="bg-gray-700">
                  <th className="px-4 py-2 text-center text-gray-300 w-24">
                    <div className="flex items-center justify-center">
                      Rank
                      <SortButton
                        field="rank"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-2 text-left text-gray-300 w-24">
                    <div className="flex items-center justify-center">
                      Change
                      <SortButton
                        field="change"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    </div>
                  </th>
                  <th className="py-2 pr-0 pl-2 w-8"></th>
                  <th className="px-4 py-2 text-left text-gray-300">
                    <div className="flex items-center">
                      Player
                      <SortButton
                        field="name"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-2 text-center text-gray-300">
                    <div className="flex items-center justify-center">
                      League
                      <SortButton
                        field="score"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-2 text-center text-gray-300">Graph</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map((player) => (
                  <PlayerRow 
                    key={player.name}
                    player={player}
                    onSearchClick={onPlayerSearch}
                    onClanClick={handleClanClick}
                    onGraphClick={onGraphOpen}
                    isMobile={false}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      <div className={`page-number-indicator ${showIndicator ? 'visible' : 'hidden'}`}>
        Page {currentPage}/{totalPages}
      </div>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        startIndex={startIndex}
        endIndex={endIndex}
        totalItems={filteredItems.length}
        onPageChange={handlePageChange}
      />
      <BackToTop isMobile={isMobile} />
    </div>
  );
};

GlobalView.propTypes = GlobalViewProps;
PlayerRow.propTypes = GlobalPlayerRowProps;
RankChangeDisplay.propTypes = RankChangeDisplayProps;
RubyCutoffIndicator.propTypes = RubyCutoffIndicatorProps;