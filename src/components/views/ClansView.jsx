import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { Pagination } from '../Pagination';
import { BackToTop } from '../BackToTop';
import { useSwipe } from '../../hooks/useSwipe';
import { ClansViewProps } from '../../types/propTypes';
import { SortButton } from '../SortButton';

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
    filteredItems,
    sortConfig,
    handleSort
  } = usePagination(rankedClans, 15);

  useSwipe(
    () => currentPage < totalPages && handlePageChange(currentPage + 1),
    () => currentPage > 1 && handlePageChange(currentPage - 1)
  );

  return (
    <div>
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search through clubs..."
      />
      <div className="table-container">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-gray-700">
              <th className="px-4 py-2 text-left text-gray-300">
                <div className="flex items-center">
                  Rank
                  <SortButton
                    field="originalRank"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                  />
                </div>
              </th>
              <th className="px-4 py-2 text-left text-gray-300">
                <div className="flex items-center">
                  Club
                  <SortButton
                    field="tag"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                  />
                </div>
              </th>
              <th className="px-4 py-2 text-left text-gray-300">
                <div className="flex items-center">
                  Members in Top10k
                  <SortButton
                    field="memberCount"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                  />
                </div>
              </th>
              <th className="px-4 py-2 text-left text-gray-300">
                <div className="flex items-center">
                  Total Score
                  <SortButton
                    field="totalScore"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((clan) => (
              <tr
                key={clan.tag}
                className={`border-t border-gray-700 ${
                  clan.tag === 'OG' ? 'bg-blue-900 bg-opacity-20' : 'hover:bg-gray-700'
                }`}
              >
                <td className="px-4 py-2 text-gray-300">
                  #{clan.originalRank.toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <span
                    className="text-gray-300 hover:text-blue-400 cursor-pointer"
                    onClick={() => onClanClick(clan.tag)}
                  >
                    [{clan.tag}]
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-300">
                  {clan.memberCount.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-gray-300">
                  {clan.totalScore.toLocaleString()}
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
    </div>
  );
};

ClansView.propTypes = ClansViewProps;