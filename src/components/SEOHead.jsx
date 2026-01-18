import { Helmet } from 'react-helmet-async';
import { SEOHeadProps } from '../types/propTypes';

export const SEOHead = ({ 
  view, 
  searchModalState, 
  graphModalState,
  membersModalOpen,
  eventsModalOpen,
  infoModalOpen
}) => {
  // Default / Hub Metadata
  let title = 'OG Club Dashboard';
  let description = 'The Finals OG Club Dashboard. Track The Finals players in real time. View graphs, clubs, historical seasons, name changes and ban events.';
  let keywords = 'THE FINALS OG CLUB, PLAYER STATS, TOP CLUBS, TOP PLAYERS, LEADERBOARDS, GRAPHS, CHARTS, TRACKING, THE FINALS';

  // 1. Priority: Graph Modal
  if (graphModalState && graphModalState.isOpen) {
    if (graphModalState.compareIds && graphModalState.compareIds.length > 0) {
      const names = [graphModalState.embarkId, ...graphModalState.compareIds].join(' vs ');
      const seasonText = graphModalState.seasonId ? `(Season ${graphModalState.seasonId})` : '';
      title = `Comparison: ${names} ${seasonText} | OG Club`;
      description = `Compare The Finals rank history and stats for ${names} on the OG Club Dashboard.`;
      keywords = `${names}, comparison, rank graph, stats, the finals, rank charts`;
    } else {
      const name = graphModalState.embarkId || 'Player';
      const seasonText = graphModalState.seasonId ? `(Season ${graphModalState.seasonId})` : '';
      title = `${name} Graph ${seasonText} | OG Club`;
      description = `View detailed rank progression and score history for ${name} in The Finals.`;
      keywords = `${name}, ${name} stats, rank graph, the finals tracker, rank charts, the finals`;
    }
  } 
  // 2. Priority: History/Search Modal
  else if (searchModalState && searchModalState.isOpen && searchModalState.initialSearch) {
    const name = searchModalState.initialSearch;
    title = `${name} History | OG Club`;
    description = `Deep dive into ${name}'s leaderboard history, rank changes, and club affiliation.`;
    keywords = `${name}, ${name} history, player stats, embark id, search tool, the finals, history`;
  }
  // 3. Priority: Members Modal
  else if (membersModalOpen) {
    title = 'Club Members | OG Club';
    description = 'View the list of verified OG Club members, their current ranks, and status.';
    keywords = 'OG members, club roster, verified players, the finals clan';
  }
  // 4. Priority: Events Modal
  else if (eventsModalOpen) {
    title = 'Live Events | OG Club';
    description = 'Track recent bans, name changes, club changes, and significant rank movements in The Finals.';
    keywords = 'ban waves, name changes, the finals bans, live events, rank updates, the finals name change';
  }
  // 5. Priority: Info Modal
  else if (infoModalOpen) {
    title = 'Information | OG Club';
    description = 'Learn more about the OG Club Dashboard, methodology, and features.';
    keywords = 'about og club, faq, methodology, features, api details';
  }
  // 6. Priority: Main Views (Background)
  else {
    switch (view) {
      case 'clubs':
        title = 'Top Clubs | OG Club';
        description = 'Leaderboard of the top performing clubs in The Finals based on aggregate score.';
        keywords = 'top clubs, clan leaderboard, best clubs, the finals teams';
        break;
      case 'global': // Leaderboard
        title = 'Ranked Leaderboard | OG Club';
        description = 'Live leaderboard for The Finals. Track top 10000 players, score cutoffs, and rank distribution. Graphing and historical data available.';
        keywords = 'the finals tracker, the finals leaderboard, ranked leaderboard, top players, player stats, historical ranks, seasonal data';
        break;
      case 'hub':
      default:
        // Keeps the default variables defined at the top
        break;
    }
  }

  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />

      {/* Open Graph (Social Media) */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      
      {/* Twitter */}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
};

SEOHead.propTypes = SEOHeadProps;