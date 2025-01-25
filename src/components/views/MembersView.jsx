import { Check, UserSearch, LineChart } from 'lucide-react';
import { LeagueDisplay } from '../LeagueDisplay';
import { BackToTop } from '../BackToTop';
import { PlatformIcons } from "../icons/Platforms";
import { MembersViewProps, MemberRowProps, PriorRubyDisplayProps } from '../../types/propTypes';

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

const MemberRow = ({ 
  member, 
  onSearchClick, 
  onGraphClick, 
  clanMembersData, 
  isMobile 
}) => {
  const [username, discriminator] = member.name.split('#');
  const clanMemberInfo = clanMembersData?.find(m => 
    m.embarkId.toLowerCase() === member.name.toLowerCase() ||
    (m.discord && m.discord.toLowerCase() === member.discord?.toLowerCase())
  );

  // Mobile row rendering
  if (isMobile) {
    return (
      <div 
        className={`flex flex-col gap-2 p-4 border-b border-gray-700 bg-gray-800 rounded-lg shadow-sm 
        active:bg-gray-750 active:scale-[0.99] transition-all duration-150 ease-in-out ${
          member.notInLeaderboard 
            ? 'bg-red-900 bg-opacity-20' 
            : ''
        }`}
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
            {member.discord && (
              <div className="text-[11px] text-gray-400 mt-1 flex flex-wrap gap-1.5">
                <span className="flex items-center gap-1 bg-gray-700 rounded px-1.5 py-0.5">
                  <PlatformIcons.Discord className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[150px]">{member.discord}</span>
                </span>
              </div>
            )}
          </div>
          <div className="flex-shrink-0">
            <LeagueDisplay 
              league={member.league} 
              score={member.rankScore} 
              rank={member.rank}
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
      className={`border-t border-gray-700 ${
        member.notInLeaderboard 
          ? 'bg-red-900 bg-opacity-20' 
          : 'hover:bg-gray-700'
      }`}
    >
      <td className="px-4 py-2 text-gray-300">
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
          {member.discord && (
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-3">
              <span className="flex items-center">
                <PlatformIcons.Discord />
                {member.discord}
              </span>
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-center">
        <PriorRubyDisplay isPriorRuby={clanMemberInfo?.pruby} />
      </td>
      <LeagueDisplay 
        league={member.league} 
        score={member.rankScore} 
        rank={member.rank}
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
  clanMembers,
  totalMembers,
  onPlayerSearch,
  clanMembersData,
  onGraphOpen,
  isMobile
}) => {

  return (
    <div>
      <div className="table-container">
        {isMobile ? (
          <div>
            {clanMembers
              .sort((a, b) => b.rankScore - a.rankScore)
              .map((member) => (
                <MemberRow 
                  key={member.name} 
                  member={member} 
                  onSearchClick={onPlayerSearch}
                  onGraphClick={onGraphOpen}
                  clanMembersData={clanMembersData}
                  isMobile={true}
                />
              ))
            }
          </div>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-gray-700">
                <th className="px-4 py-2 text-left text-gray-300">Rank</th>
                <th className="px-4 py-2 text-left text-gray-300">Player</th>
                <th className="px-4 py-2 text-center text-gray-300">Prior Ruby</th>
                <th className="px-4 py-2 text-center text-gray-300">League</th>
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
                    onGraphClick={onGraphOpen}
                    clanMembersData={clanMembersData}
                    isMobile={false}
                  />
                ))
              }
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-4 text-sm text-gray-400">
        <p>Total Members: {totalMembers.toLocaleString()}/{(50).toLocaleString()}</p>
      </div>
      <BackToTop isMobile={isMobile} />
    </div>
  );
};

MembersView.propTypes = MembersViewProps;
MemberRow.propTypes = MemberRowProps;
PriorRubyDisplay.propTypes = PriorRubyDisplayProps;