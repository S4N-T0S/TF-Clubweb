import { UserSearch, LineChart } from 'lucide-react';
import { LeagueDisplay } from '../LeagueDisplay';
import { BackToTop } from '../BackToTop';
import { PlatformIcons } from "../icons/Platforms";
import { MembersViewProps, MemberRowProps, MembersNoResultsProps } from '../../types/propTypes';
import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { Pagination } from '../Pagination';
import { SortButton } from '../SortButton';
import { useRef } from 'react';
import { useSwipe } from '../../hooks/useSwipe';
import { useModal } from '../../context/ModalProvider';

const MembersNoResults = ({ searchQuery, onSwitchToGlobalSearch }) => (
  <div className="p-6 text-center text-gray-400">
    <p>No OG club members found for your search query: &quot;{searchQuery}&quot;</p>
    <p className="mt-2">
      Perhaps you meant to search the global leaderboard?{' '}
      <span
        className="text-blue-400 cursor-pointer hover:underline"
        onClick={onSwitchToGlobalSearch}
        aria-label={`Search for ${searchQuery} in Global View`}
      >
        Search for &quot;{searchQuery}&quot; in Global View.
      </span>
    </p>
  </div>
);

const MemberRow = ({ 
  member, 
  onSearchClick, 
  onGraphClick, 
  clubMembersData,
  isMobile 
}) => {
  const [username, discriminator] = member.name.split('#');
  
  // Check if member is in OG club on the leaderboard but not found in the club member list asset.
  const inOgNotInCsv = clubMembersData && !clubMembersData.find(m => 
    m.embarkId.toLowerCase() === member.name.toLowerCase()
  );

  // Background class for row to indicate status
  const getBackgroundClass = () => {
    if (member.notInLeaderboard) return 'bg-red-900 bg-opacity-20';
    if (inOgNotInCsv) return '!bg-yellow-600/20';
    return '';
  };

  // Mobile row rendering
  if (isMobile) {
    return (
      <div 
        className={`flex flex-col gap-2 p-4 border-b border-gray-700 bg-gray-800 rounded-lg shadow-sm 
        active:bg-gray-750 active:scale-[0.99] transition-all duration-150 ease-in-out ${getBackgroundClass()}`}
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className={`font-bold ${member.notInLeaderboard ? 'text-red-400' : 'text-gray-300'}`}>
              {member.notInLeaderboard ? '-' : `#${member.rank.toLocaleString()}`}
            </span>
          </div>
          {!member.notInLeaderboard && (
            <LineChart
              className="w-5 h-5 text-gray-400 hover:text-blue-400 cursor-pointer flex-shrink-0"
              onClick={() => onGraphClick(member.name)}
            />
          )}
        </div>
        <div className="flex justify-between items-start">
          <div className="flex flex-col min-w-0 flex-1 mr-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`truncate ${member.notInLeaderboard ? 'text-red-400' : 'text-gray-300'}`}>
                {username}
                <span className={`${member.notInLeaderboard ? 'text-red-400' : 'text-gray-500'}`}>#{discriminator}</span>
              </span>
              <UserSearch 
                className="flex-shrink-0 w-6 h-6 p-1 text-gray-400 hover:text-blue-400 cursor-pointer rounded-full hover:bg-gray-700 transition-colors" 
                onClick={() => onSearchClick(member.name)}
              />
            </div>
            {(member.steamName || member.psnName || member.xboxName) && (
              <div className="text-[11px] text-gray-400 mt-1 flex flex-wrap gap-1.5">
                {member.steamName && (
                  <span className="flex items-center gap-1 bg-gray-700 rounded px-1.5 py-0.5">
                    <PlatformIcons.Steam className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate max-w-[120px]">{member.steamName}</span>
                  </span>
                )}
                {member.psnName && (
                  <span className="flex items-center gap-1 bg-gray-700 rounded px-1.5 py-0.5">
                    <PlatformIcons.PSN className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate max-w-[120px]">{member.psnName}</span>
                  </span>
                )}
                {member.xboxName && (
                  <span className="flex items-center gap-1 bg-gray-700 rounded px-1.5 py-0.5">
                    <PlatformIcons.Xbox className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate max-w-[120px]">{member.xboxName}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 mt-auto">
            <LeagueDisplay 
              league={member.league}
              score={member.rankScore}
              leagueNumber={member.leagueNumber}
              isMobile={isMobile}
            />
          </div>
        </div>
      </div>
    );
  }

  // Desktop row rendering
  return (
    <tr 
      className={`border-t border-gray-700 ${getBackgroundClass()} ${
        !member.notInLeaderboard && !inOgNotInCsv ? 'hover:bg-gray-700' : ''
      }`}
    >
      <td className="pl-4 pr-8 py-2 text-gray-300">
        {member.notInLeaderboard ? '-' : `#${member.rank.toLocaleString()}`}
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className={member.notInLeaderboard ? 'text-red-400' : 'text-gray-300'}>
              {`${username}`}
              <span className={member.notInLeaderboard ? 'text-red-400' : 'text-gray-500'}>#{discriminator}</span>
            </span>
            <UserSearch 
              className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer" 
              onClick={() => onSearchClick(member.name)}
            />
          </div>
          {(member.steamName || member.psnName || member.xboxName) && (
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-3">
              {member.steamName && (
                <span className="flex items-center">
                  <PlatformIcons.Steam className="w-3 h-3 flex-shrink-0 mr-1" />
                  {member.steamName}
                </span>
              )}
              {member.psnName && (
                <span className="flex items-center">
                  <PlatformIcons.PSN className="w-3 h-3 flex-shrink-0 mr-1" />
                  {member.psnName}
                </span>
              )}
              {member.xboxName && (
                <span className="flex items-center">
                  <PlatformIcons.Xbox className="w-3 h-3 flex-shrink-0 mr-1" />
                  {member.xboxName}
                </span>
              )}
            </div>
          )}
        </div>
      </td>
      <LeagueDisplay 
        league={member.league}
        score={member.rankScore}
        leagueNumber={member.leagueNumber}
        isMobile={isMobile}
      />
      <td className="px-4 py-2 text-center">
        {!member.notInLeaderboard && (
          <LineChart
            className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer mx-auto"
            onClick={() => onGraphClick(member.name)}
          />
        )}
      </td>
    </tr>
  );
};

export const MembersView = ({ 
  clubMembers,
  totalMembers,
  onPlayerSearch,
  clubMembersData,
  onGraphOpen,
  isMobile,
  setView,
  setGlobalSearchQuery
}) => {
  const searchInputRef = useRef(null);
  const { isModalOpen } = useModal();
  const viewContainerRef = useRef(null);
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
  } = usePagination(clubMembers, isMobile ? 25 : 50, isMobile);

  const { slideDirection, showIndicator } = useSwipe(
    () => currentPage < totalPages && handlePageChange(currentPage + 1),
    () => currentPage > 1 && handlePageChange(currentPage - 1),
    { isSwipeActive: !isModalOpen, targetRef: viewContainerRef }
  );

  const handleSwitchToGlobalSearch = () => {
    setView('global');
    setGlobalSearchQuery(searchQuery);
  };

  return (
    <div ref={viewContainerRef}>
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search through members..."
        searchInputRef={searchInputRef}
      />
      <div className="page-transition-container mt-4">
        <div className={`page-content ${slideDirection}`} key={currentPage}>
          <div className="table-container">
            {isMobile ? (
              <div className="flex flex-col gap-2">
                {filteredItems.length === 0 && searchQuery ? (
                  <MembersNoResults searchQuery={searchQuery} onSwitchToGlobalSearch={handleSwitchToGlobalSearch} />
                ) : (
                  currentItems.map((member) => (
                    <MemberRow 
                      key={member.name} 
                      member={member} 
                      onSearchClick={onPlayerSearch}
                      onGraphClick={onGraphOpen}
                      clubMembersData={clubMembersData}
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
                      <th className="pl-4 pr-8 py-2 text-left text-gray-300 w-24">
                        <div className="flex items-center">
                            Rank
                            <SortButton field="rank" sortConfig={sortConfig} onSort={handleSort} />
                        </div>
                      </th>
                      <th className="px-4 py-2 text-left text-gray-300">
                        <div className="flex items-center">
                            Player
                            <SortButton field="name" sortConfig={sortConfig} onSort={handleSort} />
                        </div>
                      </th>
                      <th className="px-4 py-2 text-center text-gray-300 w-48">
                        <div className="flex items-center justify-center">
                            League
                            <SortButton field="score" sortConfig={sortConfig} onSort={handleSort} />
                        </div>
                      </th>
                      <th className="px-4 py-2 text-center text-gray-300 w-24">Graph</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 && searchQuery ? (
                      <tr>
                        <td colSpan="4">
                           <MembersNoResults searchQuery={searchQuery} onSwitchToGlobalSearch={handleSwitchToGlobalSearch} />
                        </td>
                      </tr>
                    ) : (
                      currentItems.map((member) => (
                        <MemberRow 
                          key={member.name} 
                          member={member} 
                          onSearchClick={onPlayerSearch}
                          onGraphClick={onGraphOpen}
                          clubMembersData={clubMembersData}
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

      {!isMobile && (
        <div className="mt-4 text-sm text-right text-gray-400">
          <p>Total Members: {totalMembers.toLocaleString()}/{(100).toLocaleString()}</p>
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        startIndex={startIndex}
        endIndex={endIndex}
        totalItems={filteredItems.length}
        onPageChange={handlePageChange}
      />

      {isMobile && (
        <div className="mt-4 text-sm text-center text-gray-400">
          <p>Total Members: {totalMembers.toLocaleString()}/{(100).toLocaleString()}</p>
        </div>
      )}

      <BackToTop isMobile={isMobile} />
    </div>
  );
};

MembersView.propTypes = MembersViewProps;
MemberRow.propTypes = MemberRowProps;
MembersNoResults.propTypes = MembersNoResultsProps;