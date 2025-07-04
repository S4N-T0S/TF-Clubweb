import {
  UserCheck,
  Users,
  Gavel,
  ArrowRight, // Changed from ArrowRightLeft for clarity
  Info,
  LineChart,
  Zap,
  TrendingUp,   // Added for RS adjustments
  TrendingDown, // Added for RS adjustments
} from 'lucide-react';
import { formatTimeAgo, formatDuration } from '../utils/timeUtils';
import { EventCardProps, EventCard_PlayerNameProps, EventCard_ClubTagProps } from '../types/propTypes';

// Helper component for clickable player names
const PlayerName = ({ name, onPlayerSearch }) => (
  <span
    className="font-semibold text-gray-300 hover:text-blue-400 cursor-pointer"
    onClick={(e) => {
      e.stopPropagation();
      onPlayerSearch(name);
    }}
  >
    {name}
  </span>
);

// Helper component for clickable club tags
const ClubTag = ({ tag, onClubClick }) => (
  <span
    className="font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
    onClick={(e) => {
      e.stopPropagation();
      onClubClick(tag);
    }}
  >
    [{tag}]
  </span>
);

const getEventConfig = (event) => {
  const { event_type, details, endTimestamp } = event;
  switch (event_type) {
    case 'NAME_CHANGE':
      return { Icon: UserCheck, title: 'Name Change', colorClass: 'text-blue-400' };
    case 'SUSPECTED_BAN':
      // If the event is resolved (player reappeared), change the icon and title.
      if (endTimestamp) {
        return { Icon: UserCheck, title: 'Player Reappeared', colorClass: 'text-green-400' };
      }
      return { Icon: Gavel, title: 'Suspected Ban', colorClass: 'text-red-500' };
    case 'RS_ADJUSTMENT': {
      const isLoss = details.is_off_leaderboard || (details.change && details.change < 0);
      return {
        Icon: isLoss ? TrendingDown : TrendingUp,
        title: 'Rank Score Adjustment',
        colorClass: isLoss ? 'text-red-400' : 'text-green-400',
      };
    }
    case 'CLUB_CHANGE':
      return { Icon: Users, title: 'Club Event', colorClass: 'text-teal-400' };
    default:
      return { Icon: Zap, title: 'Unknown Event', colorClass: 'text-gray-400' };
  }
};

const renderEventDetails = (event, onPlayerSearch, onClubClick, isMobile, colorClass) => {
  const { details: d, event_type } = event;

  switch (event_type) {
    case 'NAME_CHANGE':
      if (isMobile) {
        return (
          <div className="text-gray-400 leading-relaxed space-y-1">
            <div>
              <span className="text-gray-500 text-sm">From:</span>{' '}
              {d.old_club_tag && <ClubTag tag={d.old_club_tag} onClubClick={onClubClick} />}{' '}
              <PlayerName name={d.old_name} onPlayerSearch={onPlayerSearch} />
            </div>
            <div>
              <span className="text-gray-500 text-sm">To:</span>{' '}
              {d.new_club_tag && <ClubTag tag={d.new_club_tag} onClubClick={onClubClick} />}{' '}
              <PlayerName name={d.new_name} onPlayerSearch={onPlayerSearch} />
            </div>
            <p className="text-sm text-gray-500 pt-1">
              Rank #{d.rank?.toLocaleString()} ({d.rank_score?.toLocaleString() ?? 'N/A'} RS)
            </p>
          </div>
        );
      }
      return (
        <div className="text-gray-400 leading-relaxed">
          {d.old_club_tag && <ClubTag tag={d.old_club_tag} onClubClick={onClubClick} />}{' '}
          <PlayerName name={d.old_name} onPlayerSearch={onPlayerSearch} />
          <ArrowRight className={`w-4 h-4 inline-block mx-2 ${colorClass}`} />
          {d.new_club_tag && <ClubTag tag={d.new_club_tag} onClubClick={onClubClick} />}{' '}
          <PlayerName name={d.new_name} onPlayerSearch={onPlayerSearch} />
          <p className="text-sm text-gray-500 mt-1">
            Rank #{d.rank?.toLocaleString()} ({d.rank_score?.toLocaleString() ?? 'N/A'} RS)
          </p>
        </div>
      );

    case 'SUSPECTED_BAN':
      // Case for resolved ban (player reappeared)
      if (event.endTimestamp) {
        const durationMs = event.endTimestamp - event.startTimestamp;
        const durationString = formatDuration(durationMs);

        // A shared component for the detailed stats of the disappearance/reappearance.
        const reappearanceDetails = (
          <div className="text-sm text-gray-500 pl-2 border-l-2 border-gray-600 space-y-0.5 mt-1">
            <p>
              <span className="font-semibold text-gray-400">Disappeared at:</span> Rank #{d.last_known_rank.toLocaleString()} ({d.last_known_rank_score.toLocaleString()} RS)
            </p>
            {d.reappeared_at_rank != null && (
              <p>
                <span className="font-semibold text-gray-400">Reappeared at:</span> Rank #{d.reappeared_at_rank.toLocaleString() ?? 'N/A'} ({d.reappeared_at_rank_score?.toLocaleString() ?? 'N/A'} RS)
              </p>
            )}
            {durationString && (
              <p>
                  <span className="font-semibold text-gray-400">Duration:</span> Gone for {durationString}
              </p>
            )}
          </div>
        );

        // Handle the case where the player reappeared with a new name.
        if (d.reappeared_as_name) {
          if (isMobile) {
            return (
              <div className="text-gray-400 leading-relaxed space-y-1">
                <div>
                  <span className="text-gray-500 text-sm">Was:</span>{' '}
                  {d.last_known_club_tag && <ClubTag tag={d.last_known_club_tag} onClubClick={onClubClick} />}{' '}
                  <PlayerName name={d.last_known_name} onPlayerSearch={onPlayerSearch} />
                </div>
                <div>
                  <span className="text-gray-500 text-sm">Reappeared as:</span>{' '}
                  <PlayerName name={d.reappeared_as_name} onPlayerSearch={onPlayerSearch} />
                </div>
                {reappearanceDetails}
              </div>
            );
          }
          return (
            <div className="text-gray-400 leading-relaxed">
              {d.last_known_club_tag && <ClubTag tag={d.last_known_club_tag} onClubClick={onClubClick} />}{' '}
              <PlayerName name={d.last_known_name} onPlayerSearch={onPlayerSearch} />
              <span> has reappeared on the leaderboard as </span>
              <PlayerName name={d.reappeared_as_name} onPlayerSearch={onPlayerSearch} />.
              {reappearanceDetails}
            </div>
          );
        }

        // Default case for reappearance without a name change.
        return (
          <div className="text-gray-400 leading-relaxed space-y-1">
            <div>
              {d.last_known_club_tag && <ClubTag tag={d.last_known_club_tag} onClubClick={onClubClick} />}{' '}
              <PlayerName name={event.current_embark_id} onPlayerSearch={onPlayerSearch} />
              <span> has reappeared on the leaderboard.</span>
            </div>
            {reappearanceDetails}
          </div>
        );
      }
      // Default case for an active suspected ban
      return (
        <div className="text-gray-400 leading-relaxed">
          {d.last_known_club_tag && <><ClubTag tag={d.last_known_club_tag} onClubClick={onClubClick} /> </>}
          <PlayerName name={d.last_known_name} onPlayerSearch={onPlayerSearch} />
          <span> has disappeared from the leaderboard.</span>
          <p className="text-sm text-gray-500 mt-1">
            Last seen at Rank #{d.last_known_rank?.toLocaleString()} ({d.last_known_rank_score.toLocaleString()} RS)
          </p>
        </div>
      );

    case 'RS_ADJUSTMENT': {
      if (d.is_off_leaderboard) {
        return (
          <div className="text-gray-400 leading-relaxed">
            {d.club_tag && <ClubTag tag={d.club_tag} onClubClick={onClubClick} />}{' '}
            <PlayerName name={d.name} onPlayerSearch={onPlayerSearch} />
            <span> fell off the leaderboard from Rank #{d.old_rank?.toLocaleString()} ({d.old_score.toLocaleString()} RS). </span>
            <span className="font-semibold text-red-400">Lost at least {d.minimum_loss.toLocaleString()} RS.</span>
          </div>
        );
      }
      const changeClass = d.change > 0 ? 'text-green-400' : 'text-red-400';
      return (
        <div className="text-gray-400 leading-relaxed">
          {d.club_tag && <ClubTag tag={d.club_tag} onClubClick={onClubClick} />}{' '}
          <PlayerName name={d.name} onPlayerSearch={onPlayerSearch} />
          <span> had a rank score adjustment of </span>
          <span className={`font-semibold ${changeClass}`}>
            {d.change > 0 ? '+' : ''}{d.change.toLocaleString()} RS
          </span>.
          <p className="text-sm text-gray-500 mt-1">
            #{d.old_rank?.toLocaleString() ?? 'N/A'} ({d.old_score?.toLocaleString() ?? 'N/A'} RS) → #{d.new_rank?.toLocaleString() ?? 'N/A'} ({d.new_score?.toLocaleString() ?? 'N/A'} RS)
          </p>
        </div>
      );
    }
    case 'CLUB_CHANGE': {
      // Mobile view for a full club change (from one to another)
      if (isMobile && d.old_club && d.new_club) {
        return (
            <div className="text-gray-400 leading-relaxed">
                <div>
                    <PlayerName name={d.name} onPlayerSearch={onPlayerSearch} />
                    <span> changed clubs.</span>
                </div>
                <div className="space-y-1 mt-2">
                    <div>
                        <span className="text-gray-500 text-sm">From:</span>{' '}
                        <ClubTag tag={d.old_club} onClubClick={onClubClick} />
                    </div>
                    <div>
                        <span className="text-gray-500 text-sm">To:</span>{' '}
                        <ClubTag tag={d.new_club} onClubClick={onClubClick} />
                    </div>
                </div>
            </div>
        );
      }
       
      // Default view for desktop, or mobile join/leave events.
      // Use an IIFE to handle conditional rendering and avoid the 'no-case-declarations' error.
      return (
        <div className="text-gray-400 leading-relaxed">
            <PlayerName name={d.name} onPlayerSearch={onPlayerSearch} />
            {(() => {
              if (d.new_club && !d.old_club) {
                return <><span> joined </span><ClubTag tag={d.new_club} onClubClick={onClubClick} />.</>;
              }
              if (!d.new_club && d.old_club) {
                  return <><span> left </span><ClubTag tag={d.old_club} onClubClick={onClubClick} />.</>;
              }
              return <>
                  <span> changed club from </span>
                  {d.old_club ? <ClubTag tag={d.old_club} onClubClick={onClubClick} /> : <span className="italic">no club</span>}
                  <span> to </span>
                  {d.new_club ? <ClubTag tag={d.new_club} onClubClick={onClubClick} /> : <span className="italic">no club</span>}.
              </>;
            })()}
        </div>
      );
    }

    default:
      return <p className="text-gray-500">Unknown event type: {event_type}</p>;
  }
};

export const EventCard = ({ event, onPlayerSearch, onClubClick, onGraphOpen, isMobile = false }) => {
  const { Icon, title, colorClass } = getEventConfig(event);
  const isMassClubChange = event.event_type === 'CLUB_CHANGE' && event.details.is_mass_change;

  return (
    <div className="relative bg-gray-800 rounded-lg p-4 flex items-start gap-4 border-b border-gray-700">
      {/* Top-left Event Icon */}
      <div className="flex-shrink-0 mt-1">
        <Icon className={`w-6 h-6 ${colorClass}`} />
      </div>

      <div className="flex-grow min-w-0">
        {/* Header: Title and Graph Icon */}
        <div className="flex justify-between items-start mb-1">
          <h3 className={`font-bold text-lg ${colorClass} pr-2`}>{title}</h3>
          <LineChart
            className="w-5 h-5 text-gray-400 hover:text-blue-400 cursor-pointer flex-shrink-0"
            onClick={() => onGraphOpen(event.current_embark_id)}
          />
        </div>
        
        {/* Event Details Content */}
        <div className="break-words mb-2">
            {renderEventDetails(event, onPlayerSearch, onClubClick, isMobile, colorClass)}
        </div>

        {/* Footer: Timestamp aligned to the right */}
        <div className="flex justify-end">
          {event.event_type === 'SUSPECTED_BAN' && event.endTimestamp ? (
            <span className="text-sm text-gray-500 text-right">
                {formatTimeAgo(event.startTimestamp)} → {formatTimeAgo(event.endTimestamp)}
            </span>
          ) : (
            <span className="text-sm text-gray-500">{formatTimeAgo(event.startTimestamp)}</span>
          )}
        </div>
      </div>
      
      {/* Absolutely positioned Mass Change Info Icon (bottom-left) */}
      {isMassClubChange && (
        <div className="absolute bottom-4 left-4 group">
          <Info className="w-4 h-4 text-yellow-400 cursor-help" />
          <span className="absolute hidden group-hover:block bg-gray-900 text-white px-2 py-1 rounded text-xs bottom-full mb-2 left-0 z-50 w-56 border border-gray-600 shadow-lg">
              This was part of a coordinated club tag change, likely initiated by the club owner or Embark.
          </span>
        </div>
      )}
    </div>
  );
};

EventCard.propTypes = EventCardProps;
ClubTag.propTypes = EventCard_ClubTagProps;
PlayerName.propTypes =EventCard_PlayerNameProps;