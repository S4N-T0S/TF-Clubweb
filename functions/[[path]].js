/* global HTMLRewriter */

/**
 * Cloudflare Pages Function for Edge SEO (Dynamic Rendering)
 * Intercepts crawler requests and injects the correct metadata using HTMLRewriter.
 */

// urlHandler.js
const URL_HASH_REPLACEMENT = '+';
const COMPARE_SEPARATOR = '&';
const BASE_URL = 'https://ogclub.s4nt0s.eu';
// src/components/SEOHead.jsx and the static tags in index.html.
const OG_IMAGE_BASE = 'https://api.ogclub.s4nt0s.eu';

// Current/latest season
const CURRENT_SEASON_NUM = 11;
const CURRENT_SEASON_KEY = `S${CURRENT_SEASON_NUM}`;
const FALLBACK_SEASON_ID = String(CURRENT_SEASON_NUM);

// Slug -> display name for spray-pattern weapon pages.
// Kept in sync with SEOHead.jsx and src/data/recoil/weapons.json.
const WEAPON_NAMES = {
  '93r': '93R', 'arn-220': 'ARN-220', 'h-plus-infuser': 'H+ INFUSER', 'lh1': 'LH1',
  'm11': 'M11', 'v9s': 'V9S', 'xp-54': 'XP-54', 'akm': 'AKM', 'cb-01-repeater': 'CB-01 REPEATER',
  'chimera-xb': 'CHIMERA-XB', 'famas': 'FAMAS', 'fcar': 'FCAR', 'p90': 'P90', 'pike-556': 'PIKE-556',
  'r-357': 'R .357', 'bfr-titan': 'BFR TITAN', 'lewis-gun': 'LEWIS GUN', 'm60': 'M60', 'shak-50': 'SHAK-50',
};

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
 * Encodes an Embark ID for use inside an /og/ image path (mirrors id-api.js):
 * percent-encode, then swap the '#' back to the URL-safe '+'.
 */
function encodeForPath(s) {
  return encodeURIComponent(s).replace(/%23/g, URL_HASH_REPLACEMENT);
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
    url: '', // Computed at the end
    image: '', // Dynamic per-page card, defaulted at the end
    imageAlt: ''
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

    // Dynamic rank-score card render
    if (parsed.main) {
      const ogSeason = seasonId && /^\d{1,2}$/.test(seasonId) ? seasonId : FALLBACK_SEASON_ID;
      const namesPath = [parsed.main, ...parsed.compare].map(encodeForPath).join(COMPARE_SEPARATOR);
      meta.image = `${OG_IMAGE_BASE}/og/graph/${ogSeason}/${namesPath}.png`;
      meta.imageAlt = `Rank score graph for ${[parsed.main, ...parsed.compare].join(' vs ')} in THE FINALS`;
    }

    // SEO Fix: Mirroring SEOHead.jsx legacy graph route to new graph route
    if (seasonId && !canonicalPath.includes(`/${seasonId}/`)) {
       const urlSafeId = canonicalPath.split('/').pop();
       canonicalPath = `/graph/${seasonId}/${urlSafeId}`;
    }
  } else if (baseRoute === 'history' && parts.length > 1) {
    const name = parseUsername(parts.slice(1).join('/'));
    meta.title = `${name} History | THE FINALS Tracker`;
    meta.description = `View ${name}'s complete leaderboard history across all seasons of The Finals. Track rank progression, league placement, linked platform accounts, and club affiliations.`;
    meta.keywords = `${name}, ${name} history, ${name} stats, embark id, player search, the finals tracker, rank history, leaderboard history`;

    // Dynamic cross-season card render
    if (name !== 'Player') {
      meta.image = `${OG_IMAGE_BASE}/og/history/${encodeForPath(name)}.png`;
      meta.imageAlt = `${name}'s cross-season rank history in THE FINALS`;
    }
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
    const rawSeason = url.searchParams.get('season');
    const rawPage = url.searchParams.get('page');

    // Only canonicalise a real, non-current club season (S5..S9).
    let validSeason = null;
    let seasonText = '';
    const clubNum = rawSeason && /^S[1-9]\d*$/.test(rawSeason) ? parseInt(rawSeason.slice(1), 10) : null;
    if (clubNum !== null && clubNum >= 5 && clubNum <= CURRENT_SEASON_NUM && rawSeason !== CURRENT_SEASON_KEY) {
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

    meta.title = `Top Clubs${seasonText}${pageText} | THE FINALS Tracker`;
    meta.description = `Leaderboard of the top performing clubs in The Finals${seasonText} based on aggregate score${pageText}.`;
    meta.keywords = 'top clubs, clan leaderboard, best clubs, the finals teams';
    if (validSeason) meta.keywords += `, ${validSeason.toLowerCase()} clubs`;

    const canonicalParams = new URLSearchParams();
    if (validSeason) canonicalParams.set('season', validSeason);
    if (validPage) canonicalParams.set('page', validPage.toString());
    const q = canonicalParams.toString();
    if (q) canonicalSearch = `?${q}`;
  } else if (baseRoute === 'spray-patterns') {
    const slug = parts.length > 1 ? parts[1].toLowerCase() : null;
    const weaponName = slug ? WEAPON_NAMES[slug] : null;
    if (weaponName) {
      meta.title = `${weaponName} Spray Pattern & Recoil | THE FINALS Tracker`;
      meta.description = `Interactive ${weaponName} spray pattern and recoil control guide for The Finals. See the true-to-scale recoil pattern and practice countering it shot by shot.`;
      meta.keywords = `${weaponName} recoil, ${weaponName} spray pattern, ${weaponName} the finals, recoil control, the finals weapons`;
      meta.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'OG Club Dashboard', item: `${BASE_URL}/hub` },
          { '@type': 'ListItem', position: 2, name: 'Spray Patterns & Recoil Guide', item: `${BASE_URL}/spray-patterns` },
          { '@type': 'ListItem', position: 3, name: `${weaponName} Spray Pattern & Recoil`, item: `${BASE_URL}/spray-patterns/${slug}` },
        ],
      };
    } else {
      meta.title = 'Spray Patterns & Recoil Guide | THE FINALS Tracker';
      meta.description = 'Interactive THE FINALS spray patterns and recoil control guides, from pistols and SMGs to rifles and LMGs. Compare true-to-scale recoil and practice shot by shot.';
      meta.keywords = 'the finals spray patterns, the finals recoil, recoil control, spray pattern, weapon guide, the finals weapons';
      // Mirror the client redirect: unknown weapon slugs canonicalise to the base page.
      if (slug) canonicalPath = '/spray-patterns';
      meta.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'THE FINALS Spray Patterns & Recoil Guides',
        itemListElement: Object.entries(WEAPON_NAMES).map(([weaponSlug, name], i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${name} Spray Pattern & Recoil`,
          url: `${BASE_URL}/spray-patterns/${weaponSlug}`,
        })),
      };
    }
  } else if (baseRoute === 'leaderboard') {
    const rawSeason = url.searchParams.get('season');
    const rawPage = url.searchParams.get('page');
    const rawSearch = url.searchParams.get('search');

    let seasonText = '';
    let isHistorical = false;
    let validSeason = null;

    // Only canonicalise a real, non-current season.
    if (rawSeason && /^(ALL|OB|S[1-9]\d*)$/.test(rawSeason) && rawSeason !== CURRENT_SEASON_KEY) {
      const num = rawSeason[0] === 'S' ? parseInt(rawSeason.slice(1), 10) : null;
      const seasonExists = rawSeason === 'ALL' || rawSeason === 'OB' || (num >= 1 && num <= CURRENT_SEASON_NUM);
      if (seasonExists) {
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
  } else if (baseRoute === 'gdpr-vault') {
    meta.title = 'Your Data Vault — Offline GDPR Explorer | THE FINALS Tracker';
    meta.description = 'Load the GDPR / Subject Access Request data export Embark emailed you and explore it as a private, readable dashboard — match history, weapons, loadouts, career and account status. Fully offline: everything is parsed in your browser and nothing is ever uploaded.';
    meta.keywords = 'the finals gdpr, the finals data request, sar export, embark data export, the finals match history, the finals data vault, offline, privacy, the finals tracker';
    canonicalPath = '/gdpr-vault';
    meta.image = `${OG_IMAGE_BASE}/og/vault.png`;
    meta.imageAlt = 'Your Data Vault — turn your THE FINALS GDPR export into a private, offline dashboard';
  } else {
    // Resolves root to /hub mirroring SEOHead.jsx
    if (canonicalPath === '/') canonicalPath = '/hub';
  }

  // Construct final canonical URL matching SEOHead.jsx
  const cleanPath = canonicalPath.endsWith('/') && canonicalPath.length > 1
    ? canonicalPath.slice(0, -1)
    : canonicalPath;

  meta.url = `${BASE_URL}${cleanPath}${canonicalSearch}`;

  // Every page carries a card; routes without a bespoke one use the site card.
  if (!meta.image) {
    meta.image = `${OG_IMAGE_BASE}/og/home.png`;
    meta.imageAlt = meta.title;
  }

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
    element.append(`<meta name="twitter:title" content="${escapeHTML(this.meta.title)}" />\n`, { html: true });
    element.append(`<meta name="twitter:description" content="${escapeHTML(this.meta.description)}" />\n`, { html: true });
    if (this.meta.jsonLd) {
      // <-escape so no `</script>` sequence can appear inside the JSON.
      const json = JSON.stringify(this.meta.jsonLd).replace(/</g, '\\u003c');
      element.append(`<script type="application/ld+json">${json}</script>\n`, { html: true });
    }
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
    } else if (['og:image', 'twitter:image'].includes(name)) {
      element.setAttribute('content', this.meta.image);
    } else if (name === 'og:image:alt') {
      element.setAttribute('content', this.meta.imageAlt);
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