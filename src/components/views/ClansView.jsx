import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { Pagination } from '../Pagination';
import { BackToTop } from '../BackToTop';
import { useSwipe } from '../../hooks/useSwipe';
import { useMobileDetect } from '../../hooks/useMobileDetect';
import { ClansViewProps, ClanRowProps } from '../../types/propTypes';
import { SortButton } from '../SortButton';
import { useRef } from 'react';

const ClanRow = ({ clan, onClanClick, isMobile }) => {
  // Mobile row rendering
  if (isMobile) {
    return (
      <div 
        className="flex flex-col gap-2 p-4 border-b border-gray-700 bg-gray-800 rounded-lg shadow-sm 
        active:bg-gray-750 active:scale-[0.99] transition-all duration-150 ease-in-out"
      >
        <div className="flex justify-between items-center">
          <span className="text-gray-300 font-bold">
            #{clan.originalRank.toLocaleString()}
          </span>
          <span 
            className={`text-gray-300 hover:text-blue-400 cursor-pointer ${
              clan.tag === 'OG' ? 'text-blue-500' : ''
            }`}
            onClick={() => onClanClick(clan.tag)}
          >
            [{clan.tag}]
          </span>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-gray-400">Members in Top 10k</div>
          <div className="text-gray-300 font-semibold">
            {clan.memberCount.toLocaleString()}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-gray-400">Total Score</div>
          <div className="text-gray-300 font-semibold">
            {clan.totalScore.toLocaleString()}
          </div>
        </div>
      </div>
    );
  }
  
  // Desktop row rendering
  return (
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
  );
};

export const ClansView = ({ topClans, onClanClick }) => {
  const searchInputRef = useRef(null);
  const isMobile = useMobileDetect();

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
  } = usePagination(rankedClans, isMobile ? 15 : 15); // Same items on mobile or desktop, but just added for future ref.

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
        searchInputRef={searchInputRef}
      />
      <div className="table-container">
        {isMobile ? (
          <div>
            {currentItems.map((clan) => (
              <ClanRow 
                key={clan.tag}
                clan={clan}
                onClanClick={onClanClick}
                isMobile={true}
              />
            ))}
          </div>
        ) : (
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
                <ClanRow 
                  key={clan.tag}
                  clan={clan}
                  onClanClick={onClanClick}
                  isMobile={false}
                />
              ))}
            </tbody>
          </table>
        )}
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
ClanRow.propTypes = ClanRowProps;