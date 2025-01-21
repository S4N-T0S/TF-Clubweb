import { ChevronUp, ChevronDown, UserSearch, LineChart, } from 'lucide-react';
import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { LeagueDisplay } from '../LeagueDisplay';
import { Pagination } from '../Pagination';
import { BackToTop } from '../BackToTop';
import { useSwipe } from '../../hooks/useSwipe';
import { useEffect, useRef } from 'react';
import { useMobileDetect } from '../../hooks/useMobileDetect';
import { GlobalViewProps, GlobalPlayerRowProps, RankChangeDisplayProps } from '../../types/propTypes';
import { PlatformIcons } from "../icons/Platforms";
import { SortButton } from '../SortButton';

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

const PlayerRow = ({ player, onSearchClick, onClanClick, onGraphClick }) => {
  const [username, discriminator] = player.name.split('#');
  
  return (
    <tr key={player.name} className="border-t border-gray-700 hover:bg-gray-700">
      <td className="px-4 py-2 text-gray-300">#{player.rank.toLocaleString()}</td>
      <td className="px-4 py-2">
        <RankChangeDisplay change={player.change} />
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
  onPlayerSearch,
  searchQuery: initialSearchQuery,
  setSearchQuery: setGlobalSearchQuery,
  onGraphOpen
}) => {
  const searchInputRef = useRef(null);
  const isMobile = useMobileDetect();

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
    handleSort
  } = usePagination(globalLeaderboard, 50);

  useSwipe(
    () => currentPage < totalPages && handlePageChange(currentPage + 1),
    () => currentPage > 1 && handlePageChange(currentPage - 1)
  );

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
      <div className="table-container">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-gray-700">
              <th className="px-4 py-2 text-left text-gray-300">
                <div className="flex items-center">
                  Rank
                  <SortButton
                    field="rank"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                  />
                </div>
              </th>
              <th className="px-4 py-2 text-left text-gray-300">
                <div className="flex items-center">
                  Change
                  <SortButton
                    field="change"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                  />
                </div>
              </th>
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
              />
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        startIndex={startIndex}
        endIndex={endIndex}
        totalItems={filteredItems.length}
        onPageChange={handlePageChange}
      />
      <BackToTop />
    </div>
  );
};

GlobalView.propTypes = GlobalViewProps;
PlayerRow.propTypes = GlobalPlayerRowProps;
RankChangeDisplay.propTypes = RankChangeDisplayProps;