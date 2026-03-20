/* global HTMLRewriter */

/**
 * Cloudflare Pages Function for Edge SEO (Dynamic Rendering)
 * Intercepts crawler requests and injects the correct metadata using HTMLRewriter.
 */

// urlHandler.js
const URL_HASH_REPLACEMENT = '+';
const COMPARE_SEPARATOR = '&';

const BOT_USER_AGENTS = /bot|crawler|spider|crawling|facebookexternalhit|twitterbot|discordbot|whatsapp|skype|slack|line|vkshare|telegram|applebot|bingbot/i;

/**
 * Parses a single username, converting the URL-safe format back to the standard format.
 */
function parseUsername(urlUsername) {
  if (!urlUsername) return '';
  try {
    const decoded = decodeURIComponent(urlUsername);
    return decoded.split(URL_HASH_REPLACEMENT).join('#');
  } catch (_e) {
    return urlUsername.split(URL_HASH_REPLACEMENT).join('#');
  }
}

/**
 * Parses a combined URL string into main and comparison usernames.
 */
function parseMultipleUsernames(urlString) {
  if (!urlString) return { main: '', compare:[] };
  const parts = urlString.split(COMPARE_SEPARATOR);
  const main = parseUsername(parts[0]);
  const compare = parts.slice(1).map(parseUsername).filter(Boolean);
  return { main, compare };
}

/**
 * Generates the SEO metadata based on the current requested pathname.
 * SEOHead.jsx.
 */
function generateMetadata(url) {
  const path = url.pathname;
  
  let meta = {
    title: 'OG Club Dashboard',
    description: 'The Finals OG Club Dashboard. Track The Finals players in real time. View graphs, clubs, historical seasons, name changes and ban events.',
    keywords: 'THE FINALS OG CLUB, PLAYER STATS, TOP CLUBS, TOP PLAYERS, LEADERBOARDS, GRAPHS, CHARTS, TRACKING, THE FINALS',
    url: url.href
  };

  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return meta;

  const baseRoute = parts[0];

  if (baseRoute === 'graph') {
    let seasonId = null;
    let graphStr = '';

    if (parts.length >= 3) {
      seasonId = parts[1];
      graphStr = parts.slice(2).join('/');
    } else if (parts.length === 2) {
      graphStr = parts[1];
    }

    const parsed = parseMultipleUsernames(graphStr);
    const seasonText = seasonId ? `(Season ${seasonId})` : '';

    if (parsed.compare.length > 0) {
      const names =[parsed.main, ...parsed.compare].join(' vs ');
      meta.title = `Comparison: ${names} ${seasonText} | OG Club`.trim();
      meta.description = `Compare The Finals rank history and stats for ${names} on the OG Club Dashboard.`;
      meta.keywords = `${names}, comparison, rank graph, stats, the finals, rank charts`;
    } else {
      const name = parsed.main || 'Player';
      meta.title = `${name} Graph ${seasonText} | OG Club`.trim();
      meta.description = `View detailed rank progression and score history for ${name} in The Finals.`;
      meta.keywords = `${name}, ${name} stats, rank graph, the finals tracker, rank charts, the finals`;
    }
  } else if (baseRoute === 'history' && parts.length > 1) {
    const name = parseUsername(parts.slice(1).join('/'));
    meta.title = `${name} History | OG Club`;
    meta.description = `Deep dive into ${name}'s leaderboard history, rank changes, and club affiliation.`;
    meta.keywords = `${name}, ${name} history, player stats, embark id, search tool, the finals, history`;
  } else if (baseRoute === 'members') {
    meta.title = 'Club Members | OG Club';
    meta.description = 'View the list of verified OG Club members, their current ranks, and status.';
    meta.keywords = 'OG members, club roster, verified players, the finals clan';
  } else if (baseRoute === 'events') {
    meta.title = 'Live Events | OG Club';
    meta.description = 'Track recent bans, name changes, club changes, and significant rank movements in The Finals.';
    meta.keywords = 'ban waves, name changes, the finals bans, live events, rank updates, the finals name change';
  } else if (baseRoute === 'info') {
    meta.title = 'Information | OG Club';
    meta.description = 'Learn more about the OG Club Dashboard, methodology, and features.';
    meta.keywords = 'about og club, faq, methodology, features, api details';
  } else if (baseRoute === 'clubs') {
    meta.title = 'Top Clubs | OG Club';
    meta.description = 'Leaderboard of the top performing clubs in The Finals based on aggregate score.';
    meta.keywords = 'top clubs, clan leaderboard, best clubs, the finals teams';
  } else if (baseRoute === 'leaderboard') {
    meta.title = 'Ranked Leaderboard | OG Club';
    meta.description = 'Live leaderboard for The Finals. Track top 10000 players, score cutoffs, and rank distribution. Graphing and historical data available.';
    meta.keywords = 'the finals tracker, the finals leaderboard, ranked leaderboard, top players, player stats, historical ranks, seasonal data';
  }

  return meta;
}

class TitleHandler {
  constructor(meta) {
    this.meta = meta;
  }
  element(element) {
    element.setInnerContent(this.meta.title);
  }
}

class MetaHandler {
  constructor(meta) {
    this.meta = meta;
  }
  element(element) {
    const name = element.getAttribute('name') || element.getAttribute('property');
    
    if (['description', 'og:description', 'twitter:description'].includes(name)) {
      element.setAttribute('content', this.meta.description);
    } else if (['og:title', 'twitter:title'].includes(name)) {
      element.setAttribute('content', this.meta.title);
    } else if (name === 'keywords') {
      element.setAttribute('content', this.meta.keywords);
    } else if (name === 'og:url') {
      element.setAttribute('content', this.meta.url);
    }
  }
}

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const userAgent = request.headers.get('User-Agent') || '';

  // Ignore asset requests or anything with a file extension
  if (url.pathname.startsWith('/assets') || url.pathname.includes('.')) {
    return next();
  }

  const isBot = BOT_USER_AGENTS.test(userAgent);
  
  // Fetch the static file from Clownflare Pages
  const response = await next();

  const contentType = response.headers.get('Content-Type') || '';
  
  // If it's a standard user or not an HTML response, return the original payload unchanged
  if (!isBot || !contentType.includes('text/html')) {
    return response;
  }

  const meta = generateMetadata(url);

  // Stream the HTML through our rewriter to swap the tags for crawlers
  return new HTMLRewriter()
    .on('title', new TitleHandler(meta))
    .on('meta', new MetaHandler(meta))
    .transform(response);
}