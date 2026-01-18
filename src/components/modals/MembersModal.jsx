import { memo, useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, ShieldAlert, CheckCircle, UserX, Users, LineChart, UserPlus } from 'lucide-react';
import { fetchClubMembers } from '../../services/mb-api';
import { calculateMemberStatus } from '../../utils/dataProcessing';
import { useModal } from '../../context/ModalProvider';
import { LoadingDisplay } from '../LoadingDisplay';
import { SearchBar } from '../SearchBar';
import { getLeagueInfo } from '../../utils/leagueUtils';
import { Hexagon } from '../icons/Hexagon';
import { MembersModalProps, MemberRowProps, StatusBadgeProps } from '../../types/propTypes';

const StatusBadge = ({ status }) => {
  switch (status) {
    case 'verified':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900 text-green-300 border border-green-700 whitespace-nowrap"><CheckCircle className="w-3 h-3 mr-1" /> Verified</span>;
    case 'wrong_tag':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-900 text-red-300 border border-red-700 whitespace-nowrap"><ShieldAlert className="w-3 h-3 mr-1" /> Leaver</span>;
    case 'unranked':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-900 text-yellow-300 border border-yellow-700 whitespace-nowrap"><UserX className="w-3 h-3 mr-1" /> Unranked</span>;
    case 'new_member':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-900 text-emerald-200 border border-emerald-600 whitespace-nowrap"><UserPlus className="w-3 h-3 mr-1" /> Newb</span>;
    default:
      return null;
  }
};

StatusBadge.propTypes = StatusBadgeProps;

const MemberRow = ({ member, onGraphOpen, onSearch }) => {
  const { style } = member.leagueNumber ? getLeagueInfo(member.leagueNumber) : { style: 'text-gray-500' };

  return (
    <div className={`p-3 rounded-lg bg-gray-700/50 hover:bg-gray-700 transition-colors flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border border-gray-600/50 
      ${member.status === 'wrong_tag' ? 'border-l-4 border-l-red-500' : ''}
      ${member.status === 'unranked' ? 'border-l-4 border-l-yellow-500' : ''}
      ${member.status === 'verified' ? 'border-l-4 border-l-green-500' : ''}
      ${member.status === 'new_member' ? 'border-l-4 border-l-emerald-400' : ''}
    `}>
      <div className="flex items-center gap-3 overflow-hidden w-full sm:w-auto">
         <div className="relative flex-shrink-0">
             <Hexagon className={`w-8 h-8 ${style}`} />
             <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-900">
                 {member.leagueNumber ? (member.leagueNumber > 4 ? ' ' : '') : '?'}
             </div>
         </div>
         <div className="flex flex-col min-w-0 w-full">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span 
                    className="font-semibold text-white truncate hover:text-blue-400 cursor-pointer"
                    onClick={() => onSearch(member.name)}
                >
                    {member.name}
                </span>
                <StatusBadge status={member.status} />
            </div>
            <span className="text-xs text-gray-400">
                {member.rank ? `Rank #${member.rank.toLocaleString()}` : 'Not on Leaderboard'} • {member.rankScore?.toLocaleString() ?? 0} RS
            </span>
         </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button 
            onClick={() => onGraphOpen(member.name)}
            className="p-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-gray-300 hover:text-white transition-colors"
            title="View Graph"
        >
            <LineChart className="w-4 h-4" />
        </button>
        <button 
            onClick={() => onSearch(member.name)}
            className="p-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-gray-300 hover:text-white transition-colors"
            title="Search History"
        >
            <Search className="w-4 h-4" />
        </button>
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
        setLoading(true);
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
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div 
        ref={modalRef} 
        className={`bg-gray-900 rounded-lg w-full flex flex-col shadow-2xl overflow-hidden relative transition-transform duration-75 ease-out
          ${isMobile ? 'max-w-[95vw] h-[90dvh]' : 'max-w-4xl h-[85dvh]'}
          ${isActive ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}
        `}
      >
        <header className="flex-shrink-0 bg-gray-800 p-4 border-b border-gray-700 flex items-center justify-between">
           <div className="flex items-center gap-2">
                <Users className="w-6 h-6 text-blue-400" />
                <h2 className="text-xl font-bold text-white">OG Club Membership</h2>
           </div>
           <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full">
              <X className="w-5 h-5" />
           </button>
        </header>

        <div className="flex-shrink-0 p-4 bg-gray-800 border-b border-gray-700 space-y-4">
           {/* Stats Cards */}
           <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button onClick={() => setFilter('all')} className={`p-2 rounded-lg border flex flex-col items-center justify-center ${filter === 'all' ? 'bg-gray-700 border-gray-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                 <div className="text-xs text-gray-400">Total</div>
                 <div className="text-lg font-bold text-white">{stats.total}</div>
              </button>
              <button onClick={() => setFilter('verified')} className={`p-2 rounded-lg border flex flex-col items-center justify-center ${filter === 'verified' ? 'bg-green-900/30 border-green-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                 <div className="text-xs text-green-400">Verified</div>
                 <div className="text-lg font-bold text-green-300">{stats.verified}</div>
              </button>
              <button onClick={() => setFilter('wrong_tag')} className={`p-2 rounded-lg border flex flex-col items-center justify-center ${filter === 'wrong_tag' ? 'bg-red-900/30 border-red-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                 <div className="text-xs text-red-400">Leavers</div>
                 <div className="text-lg font-bold text-red-300">{stats.wrong_tag}</div>
              </button>
              <button onClick={() => setFilter('unranked')} className={`p-2 rounded-lg border flex flex-col items-center justify-center ${filter === 'unranked' ? 'bg-yellow-900/30 border-yellow-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                 <div className="text-xs text-yellow-400">Unranked</div>
                 <div className="text-lg font-bold text-yellow-300">{stats.unranked}</div>
              </button>
              <button onClick={() => setFilter('new_member')} className={`p-2 rounded-lg border flex flex-col items-center justify-center ${filter === 'new_member' ? 'bg-emerald-900/30 border-emerald-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                 <div className="text-xs text-emerald-400">Newbs</div>
                 <div className="text-lg font-bold text-emerald-300">{stats.new_member}</div>
              </button>
           </div>
           
           <SearchBar 
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search members..."
           />
        </div>

        <div ref={scrollContainerRef} className="flex-grow overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
           {loading ? (
             <LoadingDisplay variant="component" />
           ) : filteredMembers.length === 0 ? (
             <div className="text-center text-gray-500 mt-8">No members found matching your criteria.</div>
           ) : (
             <div className="flex flex-col gap-2">
                {filteredMembers.map((member, idx) => (
                    <MemberRow 
                        key={`${member.name}-${idx}`} 
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

MembersModal.propTypes = MembersModalProps;
MemberRow.propTypes = MemberRowProps;

export default memo(MembersModal);