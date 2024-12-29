import { Check, X, Search, LineChart } from 'lucide-react';
import { LeagueDisplay } from '../LeagueDisplay';
import { BackToTop } from '../BackToTop';
import { useSwipe } from '../../hooks/useSwipe';
import ogClanMembers from '../../data/clanMembers';
import { useState } from 'react';
import PlayerGraphModal from '../PlayerGraphModal';

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

const MemberRow = ({ member, onSearchClick, onGraphClick }) => {
  const clanMemberInfo = ogClanMembers.find(m => 
    m.embarkId.toLowerCase() === member.name.toLowerCase() ||
    (m.discord && m.discord.toLowerCase() === member.discord?.toLowerCase())
  );

  return (
    <tr 
      className={`border-t border-gray-700 ${
        member.notInLeaderboard 
          ? 'bg-red-900 bg-opacity-20' 
          : 'hover:bg-gray-700'
      }`}
    >
      <td className="px-4 py-2 text-gray-300">
        {member.notInLeaderboard ? '-' : `#${member.rank}`}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <span className={member.notInLeaderboard ? 'text-red-400' : 'text-gray-300'}>
            {member.name}
          </span>
          <Search 
            className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer" 
            onClick={() => onSearchClick(member.name)}
          />
        </div>
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

export const MembersView = ({ clanMembers, totalMembers, onPlayerSearch }) => {
  const [graphModal, setGraphModal] = useState({ isOpen: false, playerId: null });
  
  useSwipe(
    () => window.scrollBy({ left: 100, behavior: 'smooth' }),
    () => window.scrollBy({ left: -100, behavior: 'smooth' })
  );

  return (
    <div>
      <div className="table-container">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-gray-700">
              <th className="px-4 py-2 text-left text-gray-300">Rank</th>
              <th className="px-4 py-2 text-left text-gray-300">Player</th>
              <th className="group relative px-4 py-2 text-left text-gray-300">
                DL?
                <div className="absolute hidden group-hover:block bg-gray-800 text-white p-2 rounded shadow-lg mt-1 left-0 z-10">
                  Discord Linked?
                </div>
              </th>
              <th className="px-4 py-2 text-center text-gray-300">League & Score</th>
              <th className="group relative px-4 py-2 text-center text-gray-300">
                PR?
                <div className="absolute hidden group-hover:block bg-gray-800 text-white p-2 rounded shadow-lg mt-1 right-0 z-10">
                  Prior Ruby?
                </div>
              </th>
              <th className="px-4 py-2 text-center text-gray-300">Graph</th>
            </tr>
          </thead>
          <tbody>
            {clanMembers
              .sort((a, b) => b.rankScore - a.rankScore)
              .map((member) => (
                <MemberRow 
                  key={member.name} 
                  member={member} 
                  onSearchClick={onPlayerSearch}
                  onGraphClick={(playerId) => setGraphModal({ isOpen: true, playerId })}
                />
              ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-sm text-gray-400">
        <p>Total Members: {totalMembers}/50</p>
      </div>
      <BackToTop />
      
      <PlayerGraphModal
        isOpen={graphModal.isOpen}
        onClose={() => setGraphModal({ isOpen: false, playerId: null })}
        playerId={graphModal.playerId}
      />
    </div>
  );
};