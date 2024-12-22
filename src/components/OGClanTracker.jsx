import { useState, useEffect } from 'react';
import { Loader2, Check, X, Users, Trophy, Diamond, StarsIcon, StarHalf, Stars, Lightbulb, RefreshCw, ChevronUp, ChevronDown, Search } from 'lucide-react';
import ogClanMembers from './clanMembers';

const Hexagon = ({ className }) => (
  <svg 
    viewBox="0 0 24 24" 
    className={`w-5 h-5 ${className}`}
  >
    <path
      d="M12 2L22 8.5V15.5L12 22L2 15.5V8.5L12 2Z"
      fill="currentColor"
    />
  </svg>
);

const getLeagueStyle = (league, rank) => {
  const leagueColors = {
    'Bronze': 'text-amber-700',
    'Silver': 'text-gray-300',
    'Gold': 'text-yellow-400',
    'Platinum': 'text-cyan-300',
    'Diamond': 'text-blue-400',
    'Ruby': 'text-red-600',
    'Unranked': 'text-gray-600'
  };

  const baseLeague = league ? league.split(' ')[0] : 'Unranked';
  return leagueColors[baseLeague] || leagueColors['Unranked'];
};

const LeagueDisplay = ({ league, score, rank }) => {
  const leagueStyle = getLeagueStyle(league, rank);
  const displayLeague = (league || 'Unranked');
  
  return (
    <td className="px-4 py-2 text-center">
      <div className="flex items-center justify-center gap-2">
        <Hexagon className={leagueStyle} />
        <div className="flex flex-col text-center">
          <span className="text-sm font-medium text-gray-200">{displayLeague}</span>
          <span className="text-xs text-gray-400">{score.toLocaleString()}</span>
        </div>
      </div>
    </td>
  );
};

const PriorRubyDisplay = ({ isPriorRuby }) => {
  if (isPriorRuby) {
    return (
      <div className="flex justify-center items-center">
        <Check className="w-4 h-4 text-green-400 opacity-50" />
      </div>
    );
  }
  return <span className="text-gray-500">💀</span>;
};

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

const SearchBar = ({ value, onChange }) => (
  <div className="relative mb-4">
    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <Search className="h-5 w-5 text-gray-400" />
    </div>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search players or club tags! Or even both e.g: [OG] ttvscruy"
      className="w-full pl-10 pr-4 py-2 border rounded-lg bg-gray-700 border-gray-600 text-gray-200 focus:outline-none focus:border-blue-500"
    />
  </div>
);

const OGClanTracker = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clanMembers, setClanMembers] = useState([]);
  const [isTopClan, setIsTopClan] = useState(false);
  const [topClans, setTopClans] = useState([]);
  const [view, setView] = useState('members');
  const [unknownMembers, setUnknownMembers] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [globalLeaderboard, setGlobalLeaderboard] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const itemsPerPage = 50;
  const totalMembers = ogClanMembers.length;

  useEffect(() => {
    fetchLeaderboardData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const fetchLeaderboardData = async () => {
    setIsRefreshing(true);
    try {
      const timestamp = new Date().getTime();
      const response = await fetch('https://api.the-finals-leaderboard.com/v1/leaderboard/s5/crossplay?nocache=' + timestamp);
      if (!response.ok) throw new Error('Failed to fetch leaderboard data');
      const responseData = await response.json();
      
      if (!responseData.data || !Array.isArray(responseData.data)) {
        throw new Error('Invalid data format received from API');
      }
      
      // Process global leaderboard data
      const processedGlobalData = responseData.data.map(player => ({
        ...player,
        displayName: player.clubTag ? `[${player.clubTag}] ${player.name}` : player.name
      }));
      setGlobalLeaderboard(processedGlobalData);
      
      // Process clan scores
      const clanScores = new Map();
      responseData.data.forEach(player => {
        if (player && player.clubTag) {
          clanScores.set(
            player.clubTag,
            {
              score: (clanScores.get(player.clubTag)?.score || 0) + (player.rankScore || 0),
              members: (clanScores.get(player.clubTag)?.members || 0) + 1
            }
          );
        }
      });

      const sortedClans = Array.from(clanScores.entries())
        .map(([tag, data]) => ({
          tag,
          totalScore: data.score,
          memberCount: data.members
        }))
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 15);
      
      setTopClans(sortedClans);

      const ogMembersInLeaderboard = responseData.data.filter(player => 
        player && player.clubTag === 'OG'
      );

      const matchedClanMembers = new Set();
      const unknownOGMembers = [];

      const processedApiMembers = ogMembersInLeaderboard.map(apiMember => {
        const clanMember = ogClanMembers.find(member => 
          member.embarkId.toLowerCase() === apiMember.name.toLowerCase()
        );

        if (clanMember) {
          matchedClanMembers.add(clanMember.embarkId);
        } else {
          unknownOGMembers.push(apiMember);
        }

        return {
          ...apiMember,
          discord: clanMember?.discord || null
        };
      });

      setUnknownMembers(unknownOGMembers);

      const unrankedMembers = ogClanMembers
        .filter(member => !matchedClanMembers.has(member.embarkId))
        .map(member => ({
          name: member.embarkId,
          discord: member.discord,
          rankScore: 0,
          league: 'Unranked',
          notInLeaderboard: true
        }));

      const allMembers = [...processedApiMembers, ...unrankedMembers];

      setClanMembers(allMembers);
      setIsTopClan(sortedClans[0]?.tag === 'OG');
      setLoading(false);
    } catch (err) {
      console.error('Error details:', err);
      setError(err.message);
      setLoading(false);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter global leaderboard based on search
  const filteredLeaderboard = globalLeaderboard.filter(player =>
    player.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate pagination
  const totalPages = Math.ceil(filteredLeaderboard.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = filteredLeaderboard.slice(startIndex, endIndex);

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    window.scrollTo(0, 0);
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center p-8 bg-gray-800 rounded-lg shadow-xl">
          <p className="text-red-400 text-xl">Error: {error}</p>
          <button 
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchLeaderboardData();
            }}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900">
        <Loader2 className="w-16 h-16 animate-spin text-blue-500" />
        <p className="mt-4 text-lg text-gray-300">Loading club data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2 text-white">OG Club Dashboard</h1>
              <p className={`text-xl font-semibold ${isTopClan ? 'text-green-400' : 'text-red-400'}`}>
                {isTopClan ? 'OG is on top! 🏆' : 'OG is not on top :('}
              </p>
              {unknownMembers.length > 0 && (
                <p className="text-yellow-400 text-sm mt-2">
                  {unknownMembers.length} member(s) in top 10k not found in clanMembers.js
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
              <button
                onClick={() => setView('members')}
                className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 ${
                  view === 'members' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } w-full sm:w-auto`}
              >
                <Users className="w-4 h-4" />
                Members
              </button>
              <button
                onClick={() => setView('clans')}
                className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 ${
                  view === 'clans' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } w-full sm:w-auto`}
              >
                <Trophy className="w-4 h-4" />
                Top Clubs
              </button>
              <button
                onClick={() => setView('global')}
                className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 ${
                  view === 'global' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } w-full sm:w-auto`}
              >
                <StarsIcon className="w-4 h-4" />
                Global
              </button>
              <button
                onClick={fetchLeaderboardData}
                disabled={isRefreshing}
                className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 
                  bg-gray-700 text-gray-300 hover:bg-gray-600 w-full sm:w-auto
                  ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {view === 'members' ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-700">
                    <th className="px-4 py-2 text-left text-gray-300">Rank</th>
                    <th className="px-4 py-2 text-left text-gray-300">Player</th>
                    <th className="group relative px-4 py-2 text-left text-gray-300">
                      DL?
                      <div className="absolute hidden group-hover:block bg-gray-800 text-white p-2 rounded shadow-lg mt-1 left-0 z-10">
                        Discord Linked
                      </div>
                    </th>
                    <th className="px-4 py-2 text-left text-gray-300">League & Score</th>
                    <th className="group relative px-4 py-2 text-center text-gray-300">
                      PR?
                      <div className="absolute hidden group-hover:block bg-gray-800 text-white p-2 rounded shadow-lg mt-1 right-0 z-10">
                        Prior Ruby?
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clanMembers
                    .sort((a, b) => b.rankScore - a.rankScore)
                    .map((member) => {
                      const clanMemberInfo = ogClanMembers.find(m => 
                        m.embarkId.toLowerCase() === member.name.toLowerCase() ||
                        (m.discord && m.discord.toLowerCase() === member.discord?.toLowerCase())
                      );

                      return (
                        <tr 
                          key={member.name} 
                          className={`border-t border-gray-700 ${
                            member.notInLeaderboard 
                              ? 'bg-red-900 bg-opacity-20' 
                              : 'hover:bg-gray-700'
                          }`}
                        >
                          <td className="px-4 py-2 text-gray-300">
                            {member.notInLeaderboard ? '-' : `#${member.rank}`}
                          </td>
                          <td className={`px-4 py-2 ${member.notInLeaderboard ? 'text-red-400' : 'text-gray-300'}`}>
                            {member.name}
                          </td>
                          <td className="px-4 py-2 text-gray-300">
                            <div className="group relative">
                              {member.discord ? (
                                <Check className="w-4 h-4 text-green-400 cursor-pointer" />
                              ) : (
                                <X className="w-4 h-4 text-red-400" />
                              )}
                              {member.discord && (
                                <div className="absolute hidden group-hover:block bg-gray-800 text-white p-2 rounded shadow-lg -mt-2 left-0 z-10">
                                  <div className="flex flex-col">
                                    <span>{member.discord}</span>
                                    <span className="text-xs text-gray-400">(Discord username)</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <LeagueDisplay 
                            league={member.league} 
                            score={member.rankScore} 
                            rank={member.rank}
                          />
                          <td className="px-4 py-2 text-center">
                            <PriorRubyDisplay isPriorRuby={clanMemberInfo?.pruby} />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : view === 'clans' ? (
            <div className="overflow-x-auto">
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
                  {topClans.map((clan, index) => (
                    <tr 
                      key={clan.tag}
                      className={`border-t border-gray-700 ${
                        clan.tag === 'OG' 
                          ? 'bg-blue-900 bg-opacity-20' 
                          : 'hover:bg-gray-700'
                      }`}
                    >
                      <td className="px-4 py-2 text-gray-300">#{index + 1}</td>
                      <td className="px-4 py-2 text-gray-300">{clan.tag}</td>
                      <td className="px-4 py-2 text-gray-300">{clan.memberCount}</td>
                      <td className="px-4 py-2 text-gray-300">{clan.totalScore.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            // Global Leaderboard View
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
                      <td className="px-4 py-2 text-gray-300">{player.displayName}</td>
                      <LeagueDisplay 
                        league={player.league} 
                        score={player.rankScore} 
                        rank={player.rank}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Pagination */}
              <div className="mt-4 flex justify-between items-center">
                <div className="text-sm text-gray-400">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredLeaderboard.length)} of {filteredLeaderboard.length} results
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
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
                    onClick={() => handlePageChange(currentPage + 1)}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OGClanTracker;