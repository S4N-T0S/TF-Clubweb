import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { Pagination } from '../Pagination';
import { BackToTop } from '../BackToTop';
import { useSwipe } from '../../hooks/useSwipe';
import { ClubsViewProps, ClubRowProps, NoResultsMessageProps } from '../../types/propTypes';
import { SortButton } from '../SortButton';
import { useRef } from 'react';
import { useModal } from '../../context/ModalProvider';

const NoResultsMessage = () => {
  return (
    <div className="p-6 text-center text-gray-400">
      <p>No clubs found for your search query.</p>
      <p className="mt-2">Try searching for a club tag with brackets (e.g., [OG]) in the Global View.</p>
    </div>
  );
};

const ClubRow = ({ club, onClubClick, isMobile }) => {
  // Mobile row rendering
  if (isMobile) {
    return (
      <div 
        className="flex flex-col gap-2 p-4 border-b border-gray-700 bg-gray-800 rounded-lg shadow-sm 
        active:bg-gray-750 active:scale-[0.99] transition-all duration-150 ease-in-out"
      >
        <div className="flex justify-between items-center">
          <span className="text-gray-300 font-bold">
            #{club.originalRank.toLocaleString()}
          </span>
          <span
          className={`hover:text-blue-400 cursor-pointer ${club.tag === 'OG' ? 'text-blue-500' : 'text-gray-300'}`}
          onClick={() => onClubClick(club.tag)}
        >
            [{club.tag}]
          </span>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-gray-400">Members in Top 10k</div>
          <div className="text-gray-300 font-semibold">
            {club.memberCount.toLocaleString()}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-gray-400">Total Score</div>
          <div className="text-gray-300 font-semibold">
            {club.totalScore.toLocaleString()}
          </div>
        </div>
      </div>
    );
  }
  
  // Desktop row rendering
  return (
    <tr
      key={club.tag}
      className={`border-t border-gray-700 ${
        club.tag === 'OG' ? 'bg-blue-900 bg-opacity-20' : 'hover:bg-gray-700'
      }`}
    >
      <td className="px-4 py-2 text-gray-300">
        #{club.originalRank.toLocaleString()}
      </td>
      <td className="px-4 py-2">
        <span
          className={`hover:text-blue-400 cursor-pointer ${club.tag === 'OG' ? 'text-blue-500' : 'text-gray-300'}`}
          onClick={() => onClubClick(club.tag)}
        >
          [{club.tag}]
        </span>
      </td>
      <td className="px-4 py-2 text-gray-300">
        {club.memberCount.toLocaleString()}
      </td>
      <td className="px-4 py-2 text-gray-300">
        {club.totalScore.toLocaleString()}
      </td>
    </tr>
  );
};

export const ClubsView = ({ topClubs, onClubClick, isMobile }) => {
  const { isModalOpen } = useModal();
  const searchInputRef = useRef(null);
  const viewContainerRef = useRef(null);
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
      },
      isSwipeActive: !isModalOpen,
      targetRef: viewContainerRef,
    }
  );

  // Pre-process club to add original rank
  const rankedClubs = topClubs.map((club, index) => ({
    ...club,
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
  } = usePagination(rankedClubs, isMobile ? 15 : 15); // Same items on mobile or desktop, but just added for future ref.

  return (
    <div ref={viewContainerRef}>
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search through clubs..."
        searchInputRef={searchInputRef}
      />
      <div className="page-transition-container mt-4">
      <div className={`page-content ${slideDirection}`} key={currentPage}>
      <div className="table-container">
        {isMobile ? (
          <div>
            {currentItems.length === 0 ? (
              <NoResultsMessage />
            ) : (
              currentItems.map((club) => (
                <ClubRow 
                  key={club.tag}
                  club={club}
                  onClubClick={onClubClick}
                  isMobile={true}
                />
              ))
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg">
            <table className="w-full min-w-[640px] rounded-lg">
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
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan="4">
                      <NoResultsMessage />
                    </td>
                  </tr>
                ) : (
                  currentItems.map((club) => (
                    <ClubRow 
                      key={club.tag}
                      club={club}
                      onClubClick={onClubClick}
                      isMobile={false}
                    />
                  ))
                )}
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

ClubsView.propTypes = ClubsViewProps;
ClubRow.propTypes = ClubRowProps;
NoResultsMessage.propTypes = NoResultsMessageProps;