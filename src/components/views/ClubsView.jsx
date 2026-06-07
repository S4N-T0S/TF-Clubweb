import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { Pagination } from '../Pagination';
import { BackToTop } from '../BackToTop';
import { useSwipe } from '../../hooks/useSwipe';
import { SortButton } from '../SortButton';
import { useRef, useMemo } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { useModal } from '../../context/ModalProvider';
import { buildClubSearchHref } from '../../utils/modalHrefs';
import { SEASONS, currentSeasonKey, getSeasonClubs } from '../../services/historicalDataService';

const NoResultsMessage = () => {
  return (
    <div className="p-6 text-center text-gray-400">
      <p>No clubs found for your search query.</p>
      <p className="mt-2">Try searching for a club tag with brackets (e.g., [OG]) in the Global View.</p>
    </div>
  );
};

const ClubRow = ({ club, onClubClick, isMobile, selectedSeason }) => {
  // Mobile row rendering
  if (isMobile) {
    return (
      <div
        className="flex flex-col gap-2 p-4 border-b border-gray-700 bg-gray-800 rounded-lg shadow-xs
        active:bg-gray-750 active:scale-[0.99] transition-all duration-150 ease-in-out"
      >
        <div className="flex justify-between items-center">
          <span className="text-gray-300 font-bold">
            #{club.originalRank.toLocaleString()}
          </span>
          <Link
            to={buildClubSearchHref(club.tag, selectedSeason)}
            onClick={(e) => { e.preventDefault(); onClubClick(club.tag, selectedSeason); }}
            className={`hover:text-blue-400 cursor-pointer ${club.tag === 'OG' ? 'text-blue-500' : 'text-gray-300'}`}
          >
            [{club.tag}]
          </Link>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-gray-400">Members in Top 10k</div>
          <div className="text-gray-300 font-semibold">
            {club.memberCount.toLocaleString()}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-gray-400">Avg Score</div>
          <div className="text-gray-300 font-semibold">
            {Math.round(club.averageScore).toLocaleString()}
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
        club.tag === 'OG' ? 'bg-blue-900/20' : 'hover:bg-gray-700'
      }`}
    >
      <td className="px-4 py-2 text-gray-300">
        #{club.originalRank.toLocaleString()}
      </td>
      <td className="px-4 py-2">
        <Link
          to={buildClubSearchHref(club.tag, selectedSeason)}
          onClick={(e) => { e.preventDefault(); onClubClick(club.tag, selectedSeason); }}
          className={`hover:text-blue-400 cursor-pointer ${club.tag === 'OG' ? 'text-blue-500' : 'text-gray-300'}`}
        >
          [{club.tag}]
        </Link>
      </td>
      <td className="px-4 py-2 text-gray-300">
        {club.memberCount.toLocaleString()}
      </td>
      <td className="px-4 py-2 text-gray-300">
        {Math.round(club.averageScore).toLocaleString()}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const isOnClubs = location.pathname.startsWith('/clubs');
  const frozenSeasonRef = useRef(currentSeasonKey);
  const selectedSeasonLive = useMemo(() => {
    const s = searchParams.get('season');
    if (!s) return currentSeasonKey;
    return SEASONS[s]?.hasClubs ? s : currentSeasonKey;
  }, [searchParams]);
  if (isOnClubs) frozenSeasonRef.current = selectedSeasonLive;
  const selectedSeason = isOnClubs ? selectedSeasonLive : frozenSeasonRef.current;
  const isCurrentSeason = selectedSeason === currentSeasonKey;

  // Season + page reset go in one atomic setSearchParams call — two separate
  // updates would race on the same stale params (see usePagination/App notes).
  const handleSeasonChange = (e) => {
    const next = e.target.value;
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      if (!next || next === currentSeasonKey) n.delete('season');
      else n.set('season', next);
      n.delete('page'); // new season -> back to page 1
      return n;
    }, { replace: true });
  };

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

  // Top clubs for the selected season. The current season uses the live
  // aggregate passed from App; historical seasons are computed from static JSON.
  // Ranks are assigned after sorting so each season is numbered from #1.
  const rankedClubs = useMemo(() => {
    const source = isCurrentSeason ? topClubs : getSeasonClubs(selectedSeason);
    return source.map((club, index) => ({ ...club, originalRank: index + 1 }));
  }, [isCurrentSeason, selectedSeason, topClubs]);

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
    buildPageHref,
  } = usePagination(rankedClubs, isMobile ? 15 : 15, false, { urlSync: true, basePath: '/clubs' }); // Same items on mobile or desktop, but just added for future ref.

  return (
    <div ref={viewContainerRef}>
      <div className="flex flex-col sm:flex-row gap-2 mb-4 items-stretch sm:items-center">
        <div className="flex-1">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search through clubs..."
            searchInputRef={searchInputRef}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedSeason}
            onChange={handleSeasonChange}
            aria-label="Select season"
            className={`w-full sm:w-48 bg-gray-700 text-gray-200 rounded-lg px-4 py-1.5 border ${
              selectedSeason !== currentSeasonKey ? 'border-blue-500 border-2' : 'border-gray-600'
            } focus:ring-2 focus:ring-blue-500 focus-visible:ring-blue-500 focus-visible:border-blue-500 focus-visible:outline-hidden shrink-0 text-sm h-10.5`}
          >
            {/* Seasons before S5 predate clubs — shown but disabled. 'ALL' is disabled */}
            {Object.entries(SEASONS).reverse().map(([key, season]) =>
              key !== 'ALL' && (
                <option key={key} value={key} disabled={!season.hasClubs}>
                  {season.label}{season.hasClubs ? '' : ' (no clubs)'}
                </option>
              )
            )}
          </select>
        </div>
      </div>
      <div className="page-transition-container">
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
                  selectedSeason={selectedSeason}
                />
              ))
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg">
            <table className="w-full min-w-160 rounded-lg">
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
                      Avg Score
                      <SortButton
                        field="averageScore"
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
                    <td colSpan="5">
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
                      selectedSeason={selectedSeason}
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
        buildPageHref={buildPageHref}
      />
      <BackToTop isMobile={isMobile} />
    </div>
  );
};
