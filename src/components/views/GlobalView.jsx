import { ChevronUp, ChevronDown, UserSearch, LineChart } from 'lucide-react';
import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { LeagueDisplay } from '../LeagueDisplay';
import { Pagination } from '../Pagination';
import { BackToTop } from '../BackToTop';
import { useSwipe } from '../../hooks/useSwipe';
import { useEffect, useRef } from 'react';
import { useMobileDetect } from '../../hooks/useMobileDetect';
import PlayerGraphModal from '../PlayerGraphModal';
import { GlobalViewProps, RankChangeDisplayProps } from '../../types/propTypes';

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

export const GlobalView = ({ 
  globalLeaderboard, 
  onPlayerSearch, 
  searchQuery: initialSearchQuery, 
  setSearchQuery: setGlobalSearchQuery,
  graphModal,
  setGraphModal 
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
    filteredItems
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
            <th className="px-4 py-2 text-left text-gray-300">Rank</th>
            <th className="px-4 py-2 text-left text-gray-300">Change</th>
            <th className="px-4 py-2 text-left text-gray-300">Player</th>
            <th className="px-4 py-2 text-center text-gray-300">League & Score</th>
            <th className="px-4 py-2 text-center text-gray-300">Graph</th>
          </tr>
        </thead>
        <tbody>
          {currentItems.map((player) => (
            <tr key={player.name} className="border-t border-gray-700 hover:bg-gray-700">
              <td className="px-4 py-2 text-gray-300">#{player.rank.toLocaleString()}</td>
              <td className="px-4 py-2">
                <RankChangeDisplay change={player.change} />
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  {player.clubTag ? (
                    <span className="text-gray-300">
                      <span 
                        className="text-gray-300 hover:text-blue-400 cursor-pointer"
                        onClick={() => handleClanClick(player.clubTag)}
                      >
                        [{player.clubTag}]
                      </span>
                      {` ${player.name}`}
                    </span>
                  ) : (
                    <span className="text-gray-300">{player.name}</span>
                  )}
                  <UserSearch 
                    className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer" 
                    onClick={() => onPlayerSearch(player.name)}
                  />
                </div>
              </td>
              <LeagueDisplay 
                league={player.league} 
                score={player.rankScore.toLocaleString()} 
                rank={player.rank}
              />
              <td className="px-4 py-2 text-center">
                <LineChart
                  className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer mx-auto"
                  onClick={() => setGraphModal({ isOpen: true, playerId: player.name })}
                />
              </td>
            </tr>
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
      
      {graphModal?.playerId && (
        <PlayerGraphModal
          isOpen={graphModal.isOpen}
          onClose={() => setGraphModal({ isOpen: false, playerId: null })}
          playerId={graphModal.playerId}
          isClubView={false}
          globalLeaderboard={globalLeaderboard}
        />
      )}
    </div>
  );
};

GlobalView.propTypes = GlobalViewProps;
RankChangeDisplay.propTypes = RankChangeDisplayProps;