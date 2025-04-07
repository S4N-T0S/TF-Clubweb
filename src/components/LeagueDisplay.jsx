import { Hexagon } from './icons/Hexagon';
import { getLeagueInfo } from '../utils/leagueUtils';
import { LeagueDisplayProps } from '../types/propTypes';

export const LeagueDisplay = ({ league, score, leagueNumber, isMobile }) => {
  const { style } = getLeagueInfo(leagueNumber, league);
  const displayLeague = (league || 'Unranked');
  
  const content = (
    <div className="flex items-center justify-center gap-2">
      <Hexagon className={style} />
      <div className="flex flex-col text-center">
        <span className="text-sm font-medium text-gray-200">{displayLeague}</span>
        {score !== undefined && score !== null && score !== 0 && (
          <span className="text-xs text-gray-400">{score.toLocaleString()}</span>
        )}
      </div>
    </div>
  );

  // If in mobile view, render as a div, otherwise as a table cell
  return isMobile ? (
    <div className="flex items-center justify-end">
      {content}
    </div>
  ) : (
    <td className="px-4 py-2 text-center">
      {content}
    </td>
  );
};

LeagueDisplay.propTypes = LeagueDisplayProps;