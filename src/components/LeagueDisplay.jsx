import { Hexagon } from './icons/Hexagon';
import { getLeagueInfo } from '../utils/leagueUtils';
import { LeagueDisplayProps } from '../types/propTypes';
import { useMobileDetect } from '../hooks/useMobileDetect';

export const LeagueDisplay = ({ league, score, leagueNumber }) => {
  const { style } = getLeagueInfo(leagueNumber, league);
  const displayLeague = (league || 'Unranked');
  const isMobile = useMobileDetect();
  
  const content = (
    <div className="flex items-center justify-center gap-2">
      <Hexagon className={style} />
      <div className="flex flex-col text-center">
        <span className="text-sm font-medium text-gray-200">{displayLeague}</span>
        <span className="text-xs text-gray-400">{score.toLocaleString()}</span>
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