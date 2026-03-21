/* global HTMLRewriter */

/**
 * Cloudflare Pages Function for Edge SEO (Dynamic Rendering)
 * Intercepts crawler requests and injects the correct metadata using HTMLRewriter.
 */

// urlHandler.js
const URL_HASH_REPLACEMENT = '+';
const COMPARE_SEPARATOR = '&';
const BASE_URL = 'https://ogclub.s4nt0s.eu';

// Default to a fallback season for legacy URLs
const FALLBACK_SEASON_ID = '9';

const BOT_USER_AGENTS = /bot|crawler|spider|crawling|facebookexternalhit|twitterbot|discordbot|whatsapp|skype|slack|line|vkshare|telegram|applebot|bingbot/i;

/**
 * Sanitise HTML
 */
function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, match => {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return escapeMap[match];
  });
}

/**
 * Validates an Embark ID to prevent nonsensical or malicious inputs.
 * Mirrors the logic from urlHandler.isValidEmbarkId.
 */
function isValidEmbarkId(id) {
  if (!id || typeof id !== 'string') return false;
  
  const parts = id.split('#');
  if (parts.length !== 2) return false;
  
  const [name, discriminator] = parts;
  
  // Must have a strictly 4-digit discriminator
  if (!/^\d{4}$/.test(discriminator)) return false;
  
  // Name validation (alphanumeric, dots, dashes, underscores)
  if (!/^(?=.*[\p{L}0-9])[\p{L}0-9._-]+$/u.test(name)) return false;
  
  return true;
}

/**
 * Parses a single username, converting the URL-safe format back to the standard format.
 * Includes format validation to prevent rendering invalid or malicious strings.
 */
function parseUsername(urlUsername) {
  if (!urlUsername) return '';
  try {
    const decoded = decodeURIComponent(urlUsername);
    const reconstructed = decoded.split(URL_HASH_REPLACEMENT).join('#');
    return isValidEmbarkId(reconstructed) ? reconstructed : 'Player';
  } catch (_e) {
    const reconstructed = urlUsername.split(URL_HASH_REPLACEMENT).join('#');
    return isValidEmbarkId(reconstructed) ? reconstructed : 'Player';
  }
}

/**
 * Parses a combined URL string into main and comparison usernames.
 */
function parseMultipleUsernames(urlString) {
  if (!urlString) return { main: '', compare:[] };
  const parts = urlString.split(COMPARE_SEPARATOR);
  
  const main = parseUsername(parts[0]);
  
  const compare = parts.slice(1)
    .map(parseUsername)
    .filter(name => name !== 'Player' && Boolean(name)); // Filter out invalid comparison names
    
  return { main: main !== 'Player' ? main : '', compare };
}

/**
 * Generates the SEO metadata based on the current requested pathname.
 * SEOHead.jsx.
 */
function generateMetadata(url) {
  const path = url.pathname;
  let canonicalPath = path;
  
  let meta = {
    title: 'THE FINALS Tracker Dashboard',
    description: 'The Finals OG Club Dashboard. Track The Finals players in real time. View graphs, clubs, historical seasons, name changes and ban events.',
    keywords: 'THE FINALS OG CLUB, PLAYER STATS, TOP CLUBS, TOP PLAYERS, LEADERBOARDS, GRAPHS, CHARTS, TRACKING, THE FINALS',
    url: '' // Computed at the end
  };

  const parts = path.split('/').filter(Boolean);
  const baseRoute = parts.length > 0 ? parts[0] : '';

  if (baseRoute === 'graph') {
    let seasonId = null;
    let graphStr = '';

    if (parts.length >= 3) {
      seasonId = parts[1];
      graphStr = parts.slice(2).join('/');
    } else if (parts.length === 2) {
      graphStr = parts[1];
      seasonId = FALLBACK_SEASON_ID;
    }

    const parsed = parseMultipleUsernames(graphStr);
    const seasonText = seasonId ? `(Season ${seasonId})` : '';

    if (parsed.compare.length > 0) {
      const names = [parsed.main || 'Player', ...parsed.compare].join(' vs ');
      meta.title = `Comparison: ${names} ${seasonText} | THE FINALS Tracker`.trim();
      meta.description = `Compare The Finals rank history and stats for ${names} on the OG Club Dashboard.`;
      meta.keywords = `${names}, comparison, rank graph, stats, the finals, rank charts`;
    } else {
      const name = parsed.main || 'Player';
      meta.title = `${name} Graph ${seasonText} | THE FINALS Tracker`.trim();
      meta.description = `View detailed rank progression and score history for ${name} in The Finals.`;
      meta.keywords = `${name}, ${name} stats, rank graph, the finals tracker, rank charts, the finals`;
    }

    // SEO Fix: Mirroring SEOHead.jsx legacy graph route to new graph route
    if (seasonId && !canonicalPath.includes(`/${seasonId}/`)) {
       const urlSafeId = canonicalPath.split('/').pop();
       canonicalPath = `/graph/${seasonId}/${urlSafeId}`;
    }
  } else if (baseRoute === 'history' && parts.length > 1) {
    const name = parseUsername(parts.slice(1).join('/'));
    meta.title = `${name} History | THE FINALS Tracker`;
    meta.description = `Deep dive into ${name}'s leaderboard history, rank changes, and club affiliation.`;
    meta.keywords = `${name}, ${name} history, player stats, embark id, search tool, the finals, history`;
  } else if (baseRoute === 'members') {
    meta.title = 'Club Members | THE FINALS Tracker';
    meta.description = 'View the list of verified OG Club members, their current ranks, and status.';
    meta.keywords = 'OG members, club roster, verified players, the finals clan';
  } else if (baseRoute === 'events') {
    meta.title = 'Live Events | THE FINALS Tracker';
    meta.description = 'Track recent bans, name changes, club changes, and significant rank movements in The Finals.';
    meta.keywords = 'ban waves, name changes, the finals bans, live events, rank updates, the finals name change';
  } else if (baseRoute === 'info') {
    meta.title = 'Information | THE FINALS Tracker';
    meta.description = 'Learn more about the OG Club Dashboard, methodology, and features.';
    meta.keywords = 'about og club, faq, methodology, features, api details';
  } else if (baseRoute === 'clubs') {
    meta.title = 'Top Clubs | THE FINALS Tracker';
    meta.description = 'Leaderboard of the top performing clubs in The Finals based on aggregate score.';
    meta.keywords = 'top clubs, clan leaderboard, best clubs, the finals teams';
  } else if (baseRoute === 'leaderboard') {
    meta.title = 'Ranked Leaderboard | THE FINALS Tracker';
    meta.description = 'Live leaderboard for The Finals. Track top 10000 players, score cutoffs, and rank distribution. Graphing and historical data available.';
    meta.keywords = 'the finals tracker, the finals leaderboard, ranked leaderboard, top players, player stats, historical ranks, seasonal data';
  } else {
    // Resolves root to /hub mirroring SEOHead.jsx
    if (canonicalPath === '/') canonicalPath = '/hub';
  }

  // Construct final canonical URL matching SEOHead.jsx
  const cleanPath = canonicalPath.endsWith('/') && canonicalPath.length > 1 
    ? canonicalPath.slice(0, -1) 
    : canonicalPath;
    
  meta.url = `${BASE_URL}${cleanPath}`;

  return meta;
}

// Appends missing tags dynamically
class HeadHandler {
  constructor(meta) {
    this.meta = meta;
  }
  element(element) {
    element.append(`<meta property="og:url" content="${escapeHTML(this.meta.url)}" />\n`, { html: true });
    element.append(`<link rel="canonical" href="${escapeHTML(this.meta.url)}" />\n`, { html: true });
    element.append(`<meta name="twitter:card" content="summary" />\n`, { html: true });
    element.append(`<meta name="twitter:title" content="${escapeHTML(this.meta.title)}" />\n`, { html: true });
    element.append(`<meta name="twitter:description" content="${escapeHTML(this.meta.description)}" />\n`, { html: true });
  }
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
    
    if (['description', 'og:description'].includes(name)) {
      element.setAttribute('content', this.meta.description);
    } else if (name === 'og:title') {
      element.setAttribute('content', this.meta.title);
    } else if (name === 'keywords') {
      element.setAttribute('content', this.meta.keywords);
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
    .on('head', new HeadHandler(meta))
    .on('title', new TitleHandler(meta))
    .on('meta', new MetaHandler(meta))
    .transform(response);
}