import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { Pagination } from '../Pagination';
import { BackToTop } from '../BackToTop';
import { useSwipe } from '../../hooks/useSwipe';

export const ClansView = ({ topClans, onClanClick }) => {
  // Pre-process clans to add original rank
  const rankedClans = topClans.map((clan, index) => ({
    ...clan,
    originalRank: index + 1
  }));

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
  } = usePagination(rankedClans, 15, 'tag');

  useSwipe(
    () => currentPage < totalPages && handlePageChange(currentPage + 1),
    () => currentPage > 1 && handlePageChange(currentPage - 1)
  );

  return (
    <div className="overflow-x-auto">
      <SearchBar 
        value={searchQuery} 
        onChange={setSearchQuery} 
        placeholder="Search through clubs..."
      />
      <table className="w-full">
        <thead>
          <tr className="bg-gray-700">
            <th className="px-4 py-2 text-left text-gray-300">Rank</th>
            <th className="px-4 py-2 text-left text-gray-300">Club</th>
            <th className="px-4 py-2 text-left text-gray-300">Members in Top10k</th>
            <th className="px-4 py-2 text-left text-gray-300">Total Score</th>
          </tr>
        </thead>
        <tbody>
          {currentItems.map((clan) => (
            <tr 
              key={clan.tag}
              className={`border-t border-gray-700 ${
                clan.tag === 'OG' 
                  ? 'bg-blue-900 bg-opacity-20' 
                  : 'hover:bg-gray-700'
              }`}
            >
              <td className="px-4 py-2 text-gray-300">#{clan.originalRank}</td>
              <td className="px-4 py-2">
                <span 
                  className="text-gray-300 hover:text-blue-400 cursor-pointer"
                  onClick={() => onClanClick(clan.tag)}
                >
                  [{clan.tag}]
                </span>
              </td>
              <td className="px-4 py-2 text-gray-300">{clan.memberCount}</td>
              <td className="px-4 py-2 text-gray-300">{clan.totalScore.toLocaleString()}</td>
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
      <BackToTop />
    </div>
  );
};