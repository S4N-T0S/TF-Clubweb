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
const FALLBACK_SEASON_ID = '10';

const BOT_USER_AGENTS = /bot|crawler|spider|crawling|facebookexternalhit|meta-external|chatgpt|perplexity|anthropic|claude-web|cohere|googleother|google-inspectiontool|slurp|qwantify|whatsapp|skype|slack|line|vkshare|telegram/i;
const STATIC_ASSET_REGEX = /\.(js|css|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|mp4|webm|json|md|xml|webmanifest|txt|map)$/i;

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
  let canonicalSearch = '';
  
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
    const rawSeason = url.searchParams.get('season');
    const rawPage = url.searchParams.get('page');
    const rawSearch = url.searchParams.get('search');

    let seasonText = '';
    let isHistorical = false;
    let validSeason = null;

    // Strictly validate season format (e.g. ALL, OB, S1, S10)
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

    meta.title = `${searchTitlePrefix}Ranked Leaderboard${seasonText}${pageText} | THE FINALS Tracker`;
    
    let descBase = isHistorical ? `historical leaderboard for The Finals${seasonText}` : 'live leaderboard for The Finals';
    
    // Capitalise the first letter if it is the start of the sentence
    if (!validSearch) {
        descBase = descBase.charAt(0).toUpperCase() + descBase.slice(1);
    }
    
    meta.description = `${searchDesc}${descBase}${pageText}. Track top 10000 players, score cutoffs, and rank distribution. Graphing and historical data available.`;
    
    meta.keywords = 'the finals tracker, the finals leaderboard, ranked leaderboard, top players, player stats, historical ranks, seasonal data';
    if (validSeason && validSeason !== 'ALL') {
      meta.keywords += `, ${validSeason.toLowerCase()} leaderboard`;
    }

    if (validSearch) {
      const cleanSearch = validSearch.replace(/[[\]]/g, '');
      if (validSearch.startsWith('[')) {
        meta.keywords += `, ${cleanSearch} club, ${cleanSearch} clan, top ${cleanSearch} players`;
      } else {
        meta.keywords += `, search ${cleanSearch}, ${cleanSearch} players`;
      }
    }

    const canonicalParams = new URLSearchParams();
    if (validSearch) canonicalParams.set('search', validSearch);
    if (validSeason) canonicalParams.set('season', validSeason);
    if (validPage) canonicalParams.set('page', validPage.toString());
    const q = canonicalParams.toString();
    if (q) canonicalSearch = `?${q}`;
  } else {
    // Resolves root to /hub mirroring SEOHead.jsx
    if (canonicalPath === '/') canonicalPath = '/hub';
  }

  // Construct final canonical URL matching SEOHead.jsx
  const cleanPath = canonicalPath.endsWith('/') && canonicalPath.length > 1 
    ? canonicalPath.slice(0, -1) 
    : canonicalPath;
    
  meta.url = `${BASE_URL}${cleanPath}${canonicalSearch}`;

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

  // Ignore asset requests or anything with a pre-known static asset
  if (url.pathname.startsWith('/assets') || STATIC_ASSET_REGEX.test(url.pathname)) {
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