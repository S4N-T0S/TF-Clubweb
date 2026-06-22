import { memo, useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, Search, ShieldAlert, CheckCircle, UserX, Users, LineChart, UserPlus } from 'lucide-react';
import { fetchClubMembers } from '../../services/mb-api';
import { calculateMemberStatus } from '../../utils/dataProcessing';
import { useModal } from '../../context/ModalProvider';
import { LoadingDisplay } from '../LoadingDisplay';
import { SearchBar } from '../SearchBar';
import { getLeagueInfo } from '../../utils/leagueUtils';
import { Hexagon } from '../icons/Hexagon';
import { buildGraphHref, buildHistoryHref } from '../../utils/modalHrefs';
import { currentSeasonKey } from '../../services/historicalDataService';

const StatusBadge = ({ status }) => {
  switch (status) {
    case 'verified':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-green-900 text-green-300 border border-green-700 whitespace-nowrap"><CheckCircle className="w-3 h-3 mr-1" /> Verified</span>;
    case 'wrong_tag':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-red-900 text-red-300 border border-red-700 whitespace-nowrap"><ShieldAlert className="w-3 h-3 mr-1" /> Leaver</span>;
    case 'unranked':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-yellow-900 text-yellow-300 border border-yellow-700 whitespace-nowrap"><UserX className="w-3 h-3 mr-1" /> Unranked</span>;
    case 'new_member':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-emerald-900 text-emerald-200 border border-emerald-600 whitespace-nowrap"><UserPlus className="w-3 h-3 mr-1" /> Newb</span>;
    default:
      return null;
  }
};

const MemberRow = ({ member, onGraphOpen, onSearch }) => {
  const { style } = member.leagueNumber ? getLeagueInfo(member.leagueNumber) : { style: 'text-gray-500' };

  return (
    <div className={`p-2.5 sm:p-3 rounded-lg bg-gray-700/50 hover:bg-gray-700 transition-colors flex flex-row items-center gap-3 justify-between border border-gray-600/50
      ${member.status === 'wrong_tag' ? 'border-l-4 border-l-red-500' : ''}
      ${member.status === 'unranked' ? 'border-l-4 border-l-yellow-500' : ''}
      ${member.status === 'verified' ? 'border-l-4 border-l-green-500' : ''}
      ${member.status === 'new_member' ? 'border-l-4 border-l-emerald-400' : ''}
    `}>
      <div className="flex items-center gap-2.5 sm:gap-3 overflow-hidden min-w-0 flex-1">
         <div className="relative shrink-0">
             <Hexagon className={`w-8 h-8 ${style}`} />
             <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-900">
                 {member.leagueNumber ? (member.leagueNumber > 4 ? ' ' : '') : '?'}
             </div>
         </div>
         <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-x-2 min-w-0">
                {(() => {
                  const historyHref = buildHistoryHref(member.name);
                  const cls = "font-semibold text-white truncate hover:text-blue-400 cursor-pointer min-w-0";
                  return historyHref ? (
                    <Link
                      to={historyHref}
                      onClick={(e) => { e.preventDefault(); onSearch(member.name); }}
                      className={cls}
                    >
                      {member.name}
                    </Link>
                  ) : (
                    <span
                      className={cls}
                      onClick={() => onSearch(member.name)}
                    >
                      {member.name}
                    </span>
                  );
                })()}
                <span className="shrink-0"><StatusBadge status={member.status} /></span>
            </div>
            <span className="text-xs text-gray-400 truncate">
                {member.rank ? `Rank #${member.rank.toLocaleString()}` : 'Not on Leaderboard'} • {member.rankScore?.toLocaleString() ?? 0} RS
            </span>
         </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {(() => {
          const graphHref = buildGraphHref(member.name, currentSeasonKey);
          const iconClass = "p-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-gray-300 hover:text-white transition-colors";
          return graphHref ? (
            <Link
              to={graphHref}
              onClick={(e) => { e.preventDefault(); onGraphOpen(member.name); }}
              className={iconClass}
              title="View Graph"
              aria-label={`View graph for ${member.name}`}
            >
              <LineChart className="w-4 h-4" />
            </Link>
          ) : (
            <button
              onClick={() => onGraphOpen(member.name)}
              className={iconClass}
              title="View Graph"
            >
              <LineChart className="w-4 h-4" />
            </button>
          );
        })()}
        {(() => {
          const historyHref = buildHistoryHref(member.name);
          const iconClass = "p-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-gray-300 hover:text-white transition-colors";
          return historyHref ? (
            <Link
              to={historyHref}
              onClick={(e) => { e.preventDefault(); onSearch(member.name); }}
              className={iconClass}
              title="Search History"
              aria-label={`Search history for ${member.name}`}
            >
              <Search className="w-4 h-4" />
            </Link>
          ) : (
            <button
              onClick={() => onSearch(member.name)}
              className={iconClass}
              title="Search History"
            >
              <Search className="w-4 h-4" />
            </button>
          );
        })()}
      </div>
    </div>
  );
};

export const MembersModal = ({ isOpen, onClose, globalLeaderboard, onGraphOpen, onPlayerSearch, isMobile }) => {
  const { modalRef, isActive } = useModal(isOpen, onClose);
  const scrollContainerRef = useRef(null);
  const scrollPositionRef = useRef(0);
  
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all, verified, wrong_tag, unranked, newb
  const [stats, setStats] = useState({ total: 0, verified: 0, wrong_tag: 0, unranked: 0, new_member: 0 });

  // 1. Data Loading Effect
  useEffect(() => {
    if (isOpen && globalLeaderboard.length > 0) {
      const loadData = async () => {
        // We intentionally do NOT call setLoading(true) here. 
        // It is initialized to true on mount. By not setting it to true on 
        // subsequent updates, we prevent the UI from flashing and resetting 
        // the scroll position when the globalLeaderboard auto-refreshes.
        try {
          const spreadsheetData = await fetchClubMembers();
          const processedMembers = calculateMemberStatus(globalLeaderboard, spreadsheetData);

          setMembers(processedMembers);
          setStats({
            total: processedMembers.length,
            verified: processedMembers.filter(m => m.status === 'verified').length,
            wrong_tag: processedMembers.filter(m => m.status === 'wrong_tag').length,
            unranked: processedMembers.filter(m => m.status === 'unranked').length,
            new_member: processedMembers.filter(m => m.status === 'new_member').length,
          });
        } catch (error) {
          console.error("Failed to load members:", error);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [isOpen, globalLeaderboard]); // Re-run if global leaderboard updates while open

  // 2. Scroll Preservation Effect
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    if (isActive) {
      // Restore position
      const timer = setTimeout(() => {
        scrollContainer.scrollTo({ top: scrollPositionRef.current, behavior: 'auto' });
      }, 50);
      return () => clearTimeout(timer);
    } else {
      // Save position
      scrollPositionRef.current = scrollContainer.scrollTop;
    }
  }, [isActive]);

  // 3. Scroll Reset Effect
  // When the user changes the filter or search query, reset scroll.
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
      scrollPositionRef.current = 0;
    }
  }, [filter, searchQuery]);

  const filteredMembers = useMemo(() => {
    const result = members.filter(member => {
        const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filter === 'all' || member.status === filter;
        return matchesSearch && matchesFilter;
    });

    // Ensure strictly sorted by Rank. Unranked (null/0) goes to bottom.
    return result.sort((a, b) => {
        const rankA = a.rank || Infinity;
        const rankB = b.rank || Infinity;
        return rankA - rankB;
    });
  }, [members, searchQuery, filter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div 
        ref={modalRef} 
        className={`bg-gray-900 rounded-lg w-full flex flex-col shadow-2xl overflow-hidden relative transition-transform duration-75 ease-out
          ${isMobile ? 'max-w-[95vw] h-[90dvh]' : 'max-w-4xl h-[85dvh]'}
          ${isActive ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}
        `}
      >
        <header className="shrink-0 bg-gray-800 p-3 sm:p-4 border-b border-gray-700 flex items-center justify-between">
           <div className="flex items-center gap-2">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                <h2 className="text-lg sm:text-xl font-bold text-white">OG Club Membership</h2>
           </div>
           <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full">
              <X className="w-5 h-5" />
           </button>
        </header>

        <div className="shrink-0 p-3 sm:p-4 bg-gray-800 border-b border-gray-700 space-y-3 sm:space-y-4">
           {/* Stat filter chips */}
           <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              <button onClick={() => setFilter('all')} className={`p-1.5 sm:p-2 rounded-lg border flex flex-col items-center justify-center ${filter === 'all' ? 'bg-gray-700 border-gray-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                 <div className="text-[10px] sm:text-xs text-gray-400 leading-tight">Total</div>
                 <div className="text-base sm:text-lg font-bold text-white leading-tight">{stats.total}</div>
              </button>
              <button onClick={() => setFilter('verified')} className={`p-1.5 sm:p-2 rounded-lg border flex flex-col items-center justify-center ${filter === 'verified' ? 'bg-green-900/30 border-green-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                 <div className="text-[10px] sm:text-xs text-green-400 leading-tight">Verified</div>
                 <div className="text-base sm:text-lg font-bold text-green-300 leading-tight">{stats.verified}</div>
              </button>
              <button onClick={() => setFilter('wrong_tag')} className={`p-1.5 sm:p-2 rounded-lg border flex flex-col items-center justify-center ${filter === 'wrong_tag' ? 'bg-red-900/30 border-red-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                 <div className="text-[10px] sm:text-xs text-red-400 leading-tight">Leavers</div>
                 <div className="text-base sm:text-lg font-bold text-red-300 leading-tight">{stats.wrong_tag}</div>
              </button>
              <button onClick={() => setFilter('unranked')} className={`p-1.5 sm:p-2 rounded-lg border flex flex-col items-center justify-center ${filter === 'unranked' ? 'bg-yellow-900/30 border-yellow-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                 <div className="text-[10px] sm:text-xs text-yellow-400 leading-tight">Unranked</div>
                 <div className="text-base sm:text-lg font-bold text-yellow-300 leading-tight">{stats.unranked}</div>
              </button>
              <button onClick={() => setFilter('new_member')} className={`p-1.5 sm:p-2 rounded-lg border flex flex-col items-center justify-center ${filter === 'new_member' ? 'bg-emerald-900/30 border-emerald-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                 <div className="text-[10px] sm:text-xs text-emerald-400 leading-tight">Newbs</div>
                 <div className="text-base sm:text-lg font-bold text-emerald-300 leading-tight">{stats.new_member}</div>
              </button>
           </div>
           
           <SearchBar 
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search members..."
           />
        </div>

        <div ref={scrollContainerRef} className="grow overflow-y-auto p-3 sm:p-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
           {loading ? (
             <LoadingDisplay variant="component" />
           ) : filteredMembers.length === 0 ? (
             <div className="text-center text-gray-500 mt-8">No members found matching your criteria.</div>
           ) : (
             <div className="flex flex-col gap-2">
                {filteredMembers.map((member) => (
                    <MemberRow 
                        key={member.name}
                        member={member}
                        onGraphOpen={onGraphOpen}
                        onSearch={onPlayerSearch}
                    />
                ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default memo(MembersModal);