import { Helmet } from 'react-helmet-async';
import { useLocation, useSearchParams } from 'react-router-dom';
import { SEOHeadProps } from '../types/propTypes';

const BASE_URL = 'https://ogclub.s4nt0s.eu';

export const SEOHead = ({ 
  view, 
  searchModalState, 
  graphModalState,
  membersModalOpen,
  eventsModalOpen,
  infoModalOpen
}) => {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Default / Hub Metadata
  let title = 'THE FINALS Tracker Dashboard';
  let description = 'The Finals OG Club Dashboard. Track The Finals players in real time. View graphs, clubs, historical seasons, name changes and ban events.';
  let keywords = 'THE FINALS OG CLUB, PLAYER STATS, TOP CLUBS, TOP PLAYERS, LEADERBOARDS, GRAPHS, CHARTS, TRACKING, THE FINALS';
  let canonicalPath = location.pathname;
  let canonicalSearch = '';

  // 1. Priority: Graph Modal
  if (graphModalState && graphModalState.isOpen) {
    if (graphModalState.compareIds && graphModalState.compareIds.length > 0) {
      const names = [graphModalState.embarkId, ...graphModalState.compareIds].join(' vs ');
      const seasonText = graphModalState.seasonId ? `(Season ${graphModalState.seasonId})` : '';
      title = `Comparison: ${names} ${seasonText} | THE FINALS Tracker`;
      description = `Compare The Finals rank history and stats for ${names} on the OG Club Dashboard.`;
      keywords = `${names}, comparison, rank graph, stats, the finals, rank charts`;
    } else {
      const name = graphModalState.embarkId || 'Player';
      const seasonText = graphModalState.seasonId ? `(Season ${graphModalState.seasonId})` : '';
      title = `${name} Graph ${seasonText} | THE FINALS Tracker`;
      description = `View detailed rank progression and score history for ${name} in The Finals.`;
      keywords = `${name}, ${name} stats, rank graph, the finals tracker, rank charts, the finals`;
    }

    // SEO Fix: Force the legacy `/graph/:graph` route to point to the new `/graph/:season/:graph` route
    if (graphModalState.seasonId && !canonicalPath.includes(`/${graphModalState.seasonId}/`)) {
       // If URL is /graph/x&a&b, this pops 'x&a&b' and formats it properly as /graph/9/x&a&b
       const urlSafeId = canonicalPath.split('/').pop();
       canonicalPath = `/graph/${graphModalState.seasonId}/${urlSafeId}`;
    }
  } 
  // 2. Priority: History/Search Modal
  else if (searchModalState && searchModalState.isOpen && searchModalState.initialSearch) {
    const name = searchModalState.initialSearch;
    title = `${name} History | THE FINALS Tracker`;
    description = `View ${name}'s complete leaderboard history across all seasons of The Finals. Track rank progression, league placement, linked platform accounts, and club affiliations.`;
    keywords = `${name}, ${name} history, ${name} stats, embark id, player search, the finals tracker, rank history, leaderboard history`;
  }
  // 3. Priority: Members Modal
  else if (membersModalOpen) {
    title = 'Club Members | THE FINALS Tracker';
    description = 'View the list of verified OG Club members, their current ranks, and status.';
    keywords = 'OG members, club roster, verified players, the finals clan';
  }
  // 4. Priority: Events Modal
  else if (eventsModalOpen) {
    title = 'Live Events | THE FINALS Tracker';
    description = 'Track recent bans, name changes, club changes, and significant rank movements in The Finals.';
    keywords = 'ban waves, name changes, the finals bans, live events, rank updates, the finals name change';
  }
  // 5. Priority: Info Modal
  else if (infoModalOpen) {
    title = 'Information | THE FINALS Tracker';
    description = 'Learn more about the OG Club Dashboard, methodology, and features.';
    keywords = 'about og club, faq, methodology, features, api details';
  }
  // 6. Priority: Main Views (Background)
  else {
    switch (view) {
      case 'clubs':
        title = 'Top Clubs | THE FINALS Tracker';
        description = 'Leaderboard of the top performing clubs in The Finals based on aggregate score.';
        keywords = 'top clubs, clan leaderboard, best clubs, the finals teams';
        break;
      case 'global': { // Leaderboard
          const rawSeason = searchParams.get('season');
          const rawPage = searchParams.get('page');
          const rawSearch = searchParams.get('search');

          let seasonText = '';
          let isHistorical = false;
          let validSeason = null;

          // Strictly validate season format
          if (rawSeason && /^(ALL|OB|S[1-9]\d*)$/.test(rawSeason)) {
            validSeason = rawSeason;
            if (validSeason === 'ALL') {
              seasonText = ' (All Seasons)';
              isHistorical = true;
            } else if (validSeason === 'OB') {
              seasonText = ' (Open Beta)';
              isHistorical = true;
            } else {
              seasonText = ` (Season ${validSeason.substring(1)})`;
              isHistorical = true;
            }
          }

          const pageNum = parseInt(rawPage, 10);
          let validPage = null;
          let pageText = '';

          // Ensure page is a valid number > 1
          if (!isNaN(pageNum) && pageNum > 1) {
            validPage = pageNum;
            pageText = ` - Page ${validPage}`;
          }

          let validSearch = null;
          let searchTitlePrefix = '';
          let searchDesc = '';

          if (rawSearch && rawSearch.trim() !== '') {
            validSearch = rawSearch.trim().substring(0, 50);
            
            if (validSearch.startsWith('[')) {
              // Extract the tag name without brackets
              const cleanTag = validSearch.replace(/[[\]]/g, '');
              searchTitlePrefix = `Club [${cleanTag}] - `;
              searchDesc = `Viewing players in club [${cleanTag}] on the `;
            } else {
              searchTitlePrefix = `Search: ${validSearch} - `;
              searchDesc = `Viewing search results for "${validSearch}" on the `;
            }
          }

          title = `${searchTitlePrefix}Ranked Leaderboard${seasonText}${pageText} | THE FINALS Tracker`;
          
          let descBase = isHistorical ? `historical leaderboard for The Finals${seasonText}` : 'live leaderboard for The Finals';
          
          // Capitalise the first letter if it is the start of the sentence
          if (!validSearch) {
              descBase = descBase.charAt(0).toUpperCase() + descBase.slice(1);
          }
          
          description = `${searchDesc}${descBase}${pageText}. Track top 10000 players, score cutoffs, and rank distribution. Graphing and historical data available.`;
          keywords = 'the finals tracker, the finals leaderboard, ranked leaderboard, top players, player stats, historical ranks, seasonal data';

          if (validSeason && validSeason !== 'ALL') {
            keywords += `, ${validSeason.toLowerCase()} leaderboard`;
          }
          
          if (validSearch) {
            const cleanSearch = validSearch.replace(/[[\]]/g, '');
            if (validSearch.startsWith('[')) {
              keywords += `, ${cleanSearch} club, ${cleanSearch} clan, top ${cleanSearch} players`;
            } else {
              keywords += `, search ${cleanSearch}, ${cleanSearch} players`;
            }
          }

          const canonicalParams = new URLSearchParams();
          if (validSearch) canonicalParams.set('search', validSearch);
          if (validSeason) canonicalParams.set('season', validSeason);
          if (validPage) canonicalParams.set('page', validPage.toString());
          const q = canonicalParams.toString();
          if (q) canonicalSearch = `?${q}`;

          break;
        }
      case 'hub':
      default:
        // Resolves the root `/` to point to `/hub`
        if (canonicalPath === '/') canonicalPath = '/hub'; 
        break;
    }
  }

  // Construct the final full URL.
  // Remove trailing slashes to unify /events/ and /events
  const cleanPath = canonicalPath.endsWith('/') && canonicalPath.length > 1 
    ? canonicalPath.slice(0, -1) 
    : canonicalPath;
    
  const canonicalUrl = `${BASE_URL}${cleanPath}${canonicalSearch}`;

  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />

      {/* Clean canonical urls */}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph (Social Media) */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {/* Updates og:url to ensure Discord unfurls the exact page */}
      <meta property="og:url" content={canonicalUrl} />
      
      {/* Twitter */}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
};

SEOHead.propTypes = SEOHeadProps;