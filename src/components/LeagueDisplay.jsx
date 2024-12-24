import { Hexagon } from './icons/Hexagon';
import { getLeagueInfo } from '../utils/leagueUtils';

export const LeagueDisplay = ({ league, score, rank, leagueNumber }) => {
  const { style } = getLeagueInfo(leagueNumber, league);
  const displayLeague = (league || 'Unranked');
  
  return (
    <td className="px-4 py-2 text-center">
      <div className="flex items-center justify-center gap-2">
        <Hexagon className={style} />
        <div className="flex flex-col text-center">
          <span className="text-sm font-medium text-gray-200">{displayLeague}</span>
          <span className="text-xs text-gray-400">{score.toLocaleString()}</span>
        </div>
      </div>
    </td>
  );
};