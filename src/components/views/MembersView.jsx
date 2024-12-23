import { Check, X, Search } from 'lucide-react'; // Added Search import
import { LeagueDisplay } from '../LeagueDisplay';
import ogClanMembers from '../../data/clanMembers';

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

const MemberRow = ({ member, onSearchClick }) => { // Added onSearchClick prop
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
    </tr>
  );
};

export const MembersView = ({ clanMembers, totalMembers, onPlayerSearch }) => { // Added onPlayerSearch prop
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
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
            .map((member) => (
              <MemberRow 
                key={member.name} 
                member={member} 
                onSearchClick={onPlayerSearch}
              />
            ))}
        </tbody>
      </table>
      <div className="mt-4 text-sm text-gray-400">
        <p>Total Members: {totalMembers}/50</p>
      </div>
    </div>
  );
};