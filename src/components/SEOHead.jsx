import { Helmet } from 'react-helmet-async';
import { useLocation, useSearchParams } from 'react-router-dom';
import { SEASONS, currentSeasonKey } from '../services/historicalDataService';
import { isValidEmbarkId } from '../utils/urlHandler';
import { SITE_URL } from '../constants';

// Encode an Embark ID for an /og/ image path (mirrors id-api.js encodeForPath).
const encodeForPath = (s) => encodeURIComponent(s).replace(/%23/g, '+');

// functions/[[path]].js and the static tags in index.html.
const OG_IMAGE_BASE = 'https://api.ogclub.s4nt0s.eu';

// Slug -> display name for spray-pattern weapon pages. Kept in sync with
// functions/[[path]].js (edge SEO) and src/data/recoil/weapons.json.
const WEAPON_NAMES = {
  '93r': '93R', 'arn-220': 'ARN-220', 'h-plus-infuser': 'H+ INFUSER', 'lh1': 'LH1',
  'm11': 'M11', 'v9s': 'V9S', 'xp-54': 'XP-54', 'akm': 'AKM', 'cb-01-repeater': 'CB-01 REPEATER',
  'chimera-xb': 'CHIMERA-XB', 'famas': 'FAMAS', 'fcar': 'FCAR', 'p90': 'P90', 'pike-556': 'PIKE-556',
  'r-357': 'R .357', 'bfr-titan': 'BFR TITAN', 'lewis-gun': 'LEWIS GUN', 'm60': 'M60', 'shak-50': 'SHAK-50',
};

export const SEOHead = ({
  view,
  weaponSlug,
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
  // Dynamic social card, rendered at the edge by functions/og/[[path]].js
  let ogImage = null;
  let ogImageAlt = null;

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

    if (isValidEmbarkId(graphModalState.embarkId)) {
      const names = [graphModalState.embarkId, ...(graphModalState.compareIds || []).filter(isValidEmbarkId)];
      const ogSeason = graphModalState.seasonId ?? currentSeasonKey.substring(1);
      ogImage = `${OG_IMAGE_BASE}/og/graph/${ogSeason}/${names.map(encodeForPath).join('&')}.png`;
      ogImageAlt = `Rank score graph for ${names.join(' vs ')} in THE FINALS`;
    }
  }
  // 2. Priority: History/Search Modal
  else if (searchModalState && searchModalState.isOpen && searchModalState.initialSearch) {
    const name = searchModalState.initialSearch;
    title = `${name} History | THE FINALS Tracker`;
    description = `View ${name}'s complete leaderboard history across all seasons of The Finals. Track rank progression, league placement, linked platform accounts, and club affiliations.`;
    keywords = `${name}, ${name} history, ${name} stats, embark id, player search, the finals tracker, rank history, leaderboard history`;

    if (isValidEmbarkId(name)) {
      ogImage = `${OG_IMAGE_BASE}/og/history/${encodeForPath(name)}.png`;
      ogImageAlt = `${name}'s cross-season rank history in THE FINALS`;
    }
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
      case 'clubs': {
        const rawSeason = searchParams.get('season');
        const rawPage = searchParams.get('page');

        // Only canonicalise a real, non-current club season (S5..S9).
        let validSeason = null;
        let seasonText = '';
        if (rawSeason && /^S[1-9]\d*$/.test(rawSeason) && SEASONS[rawSeason]?.hasClubs && rawSeason !== currentSeasonKey) {
          validSeason = rawSeason;
          seasonText = ` (Season ${validSeason.substring(1)})`;
        }

        const pageNum = parseInt(rawPage, 10);
        let validPage = null;
        let pageText = '';
        if (!isNaN(pageNum) && pageNum > 1) {
          validPage = pageNum;
          pageText = ` - Page ${validPage}`;
        }

        title = `Top Clubs${seasonText}${pageText} | THE FINALS Tracker`;
        description = `Leaderboard of the top performing clubs in The Finals${seasonText} based on aggregate score${pageText}.`;
        keywords = 'top clubs, clan leaderboard, best clubs, the finals teams';
        if (validSeason) keywords += `, ${validSeason.toLowerCase()} clubs`;

        const canonicalParams = new URLSearchParams();
        if (validSeason) canonicalParams.set('season', validSeason);
        if (validPage) canonicalParams.set('page', validPage.toString());
        const q = canonicalParams.toString();
        if (q) canonicalSearch = `?${q}`;
        break;
      }
      case 'spray': {
        const weaponName = weaponSlug ? WEAPON_NAMES[weaponSlug.toLowerCase()] : null;
        if (weaponName) {
          title = `${weaponName} Spray Pattern & Recoil | THE FINALS Tracker`;
          description = `Interactive ${weaponName} spray pattern and recoil control guide for The Finals. See the true-to-scale recoil pattern and practice countering it shot by shot.`;
          keywords = `${weaponName} recoil, ${weaponName} spray pattern, ${weaponName} the finals, recoil control, the finals weapons`;
        } else {
          title = 'Spray Patterns & Recoil Guide | THE FINALS Tracker';
          description = 'Interactive THE FINALS spray patterns and recoil control guides for every weapon. Compare true-to-scale recoil and practice the patterns shot by shot.';
          keywords = 'the finals spray patterns, the finals recoil, recoil control, spray pattern, weapon guide, the finals weapons';
        }
        break;
      }
      case 'global': { // Leaderboard
          const rawSeason = searchParams.get('season');
          const rawPage = searchParams.get('page');
          const rawSearch = searchParams.get('search');

          let seasonText = '';
          let isHistorical = false;
          let validSeason = null;

          // Only canonicalise season params that name a real, non-current season.
          if (rawSeason && /^(ALL|OB|S[1-9]\d*)$/.test(rawSeason) && SEASONS[rawSeason] && rawSeason !== currentSeasonKey) {
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
    
  const canonicalUrl = `${SITE_URL}${cleanPath}${canonicalSearch}`;

  if (!ogImage) {
    ogImage = `${OG_IMAGE_BASE}/og/home.png`;
    ogImageAlt = title;
  }

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
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={ogImageAlt} />

      {/* Twitter */}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
};
