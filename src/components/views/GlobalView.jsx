import { ChevronUp, ChevronDown, Search } from 'lucide-react';
import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { LeagueDisplay } from '../LeagueDisplay';
import { useEffect } from 'react';

const RankChangeDisplay = ({ change }) => {
  if (!change || change === 0) return null;
  
  const isPositive = change > 0;
  return (
    <div className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
      <span className="text-sm">{Math.abs(change)}</span>
      {isPositive ? (
        <ChevronUp className="w-4 h-4" />
      ) : (
        <ChevronDown className="w-4 h-4" />
      )}
    </div>
  );
};

const Pagination = ({ 
  currentPage, 
  totalPages, 
  startIndex, 
  endIndex, 
  totalItems, 
  onPageChange 
}) => (
  <div className="mt-4 flex justify-between items-center">
    <div className="text-sm text-gray-400">
      Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems} results
    </div>
    <div className="flex gap-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={`px-3 py-1 rounded ${
          currentPage === 1 
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        Previous
      </button>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={`px-3 py-1 rounded ${
          currentPage === totalPages 
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        Next
      </button>
    </div>
  </div>
);

export const GlobalView = ({ globalLeaderboard, onPlayerSearch, searchQuery: initialSearchQuery, setSearchQuery: setGlobalSearchQuery }) => {
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

  // Update local search when global search changes
  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
      setGlobalSearchQuery(''); // Clear the global search after applying it
    }
  }, [initialSearchQuery]);

  return (
    <div className="overflow-x-auto">
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <table className="w-full">
        <thead>
          <tr className="bg-gray-700">
            <th className="px-4 py-2 text-left text-gray-300">Rank</th>
            <th className="px-4 py-2 text-left text-gray-300">Change</th>
            <th className="px-4 py-2 text-left text-gray-300">Player</th>
            <th className="px-4 py-2 text-left text-gray-300">League & Score</th>
          </tr>
        </thead>
        <tbody>
          {currentItems.map((player) => (
            <tr key={player.name} className="border-t border-gray-700 hover:bg-gray-700">
              <td className="px-4 py-2 text-gray-300">#{player.rank}</td>
              <td className="px-4 py-2">
                <RankChangeDisplay change={player.change} />
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-300">{player.displayName}</span>
                  <Search 
                    className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer" 
                    onClick={() => onPlayerSearch(player.name)}
                  />
                </div>
              </td>
              <LeagueDisplay 
                league={player.league} 
                score={player.rankScore} 
                rank={player.rank}
              />
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        startIndex={startIndex}
        endIndex={endIndex}
        totalItems={filteredItems.length}
        onPageChange={handlePageChange}
      />
    </div>
  );
};