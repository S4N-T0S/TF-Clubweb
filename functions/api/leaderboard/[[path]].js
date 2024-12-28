import { createClient } from '@libsql/client/web';

const CACHE_DURATION = 10 * 60;
const AUTH_TOKEN = 'not-secret';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const ALLOWED_ORIGINS = [
  'https://ogclub.pages.dev',
  'https://preview.ogclub.pages.dev',
  'http://localhost:8787',
  'http://localhost:5173'
];

const isDev = () => {
  try {
    return process.env.NODE_ENV === 'development';
  } catch {
    return false;
  }
};

const logger = {
  log: (...args) => isDev() && console.log(...args),
  error: (...args) => isDev() && console.error(...args),
  group: (...args) => isDev() && console.group(...args),
  groupEnd: () => isDev() && console.groupEnd()
};

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
});

// Handle OPTIONS requests for CORS
function handleOptions(request) {
  const origin = request.headers.get('Origin');
  
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response(null, { status: 403 });
  }

  if (origin !== null &&
      request.headers.get('Access-Control-Request-Method') !== null &&
      request.headers.get('Access-Control-Request-Headers') !== null) {
    // Handle CORS preflight request
    return new Response(null, {
      headers: corsHeaders(origin)
    });
  }
  // Handle standard OPTIONS request
  return new Response(null, {
    headers: {
      'Allow': 'GET, POST, OPTIONS',
    }
  });
}

// Main request handler
export default {
  // Handle scheduled events
  async scheduled(event, env, ctx) {
    await onScheduled(event, env, ctx);
  },

  // Handle HTTP requests
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    if (request.method === 'GET') {
      await onScheduled('1', env, '1');
    }

    if (request.method === 'POST') {
      return onRequestPost({request, env, origin });
    }

    return new Response('Method not allowed', { 
      status: 405,
      headers: {
        ...corsHeaders(origin),
        'Allow': 'POST, OPTIONS'
      }
    });
  }
};

async function connectToTurso(env) {
  return createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(operation, retries = MAX_RETRIES) {
  let lastError;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await sleep(RETRY_DELAY * Math.pow(2, attempt));
      }
    }
  }
  
  throw lastError;
}

async function updatePlayerStats(db, players) {
  const timestamp = new Date().toISOString();
  
  // Prepare batch statements for player_stats
  const statsUpdates = players.map(player => ({
    sql: `INSERT INTO player_stats (player_id, last_known_rank, last_updated)
          VALUES (?, ?, ?)
          ON CONFLICT (player_id)
          DO UPDATE SET last_known_rank = ?, last_updated = ?`,
    args: [
      String(player.name),
      parseInt(player.rankScore),
      timestamp,
      parseInt(player.rankScore),
      timestamp
    ]
  }));

  // Prepare batch statements for rank_history
  const historyInserts = players.map(player => ({
    sql: `INSERT INTO rank_history (player_id, rank_score, recorded_at)
          VALUES (?, ?, ?)`,
    args: [
      String(player.name),
      parseInt(player.rankScore),
      timestamp
    ]
  }));

  try {
    // Execute all queries in a single batch
    await db.batch([...statsUpdates, ...historyInserts]);
  } catch (error) {
    logger.error('Failed to update database:', error);
    logger.error('Error details:', {
      message: error.message,
      cause: error.cause,
      stack: error.stack
    });
    throw error;
  }
}

async function detectRankChanges(currentData, cachedData) {
  if (!cachedData) return [];

  const cachedRanks = new Map(
    cachedData.map(player => [player.name, parseInt(player.rankScore)])
  );

  const playersToUpdate = currentData.filter(player => {
    const cachedRank = cachedRanks.get(player.name);
    const currentRank = parseInt(player.rankScore);
    
    // Track if either:
    // 1. Player is new to the leaderboard (cachedRank === undefined)
    // 2. Player's rank has changed
    return cachedRank === undefined || currentRank !== cachedRank;
  });

  return playersToUpdate;
}

async function transformLeaderboardData(entries) {
  return entries.map(entry => ({
    rank: parseInt(entry[1]),
    change: parseInt(entry[2]),
    name: String(entry[3] || 'Unknown#0000'),
    steamName: entry[6] ? String(entry[6]) : null,
    psnName: entry[7] ? String(entry[7]) : null,
    xboxName: entry[8] ? String(entry[8]) : null,
    clubTag: entry[12] ? String(entry[12]) : null,
    leagueNumber: parseInt(entry[4]),
    rankScore: parseInt(entry[5])
  }));
}

// Shared function to handle rank updates and KV management
async function processLeaderboardUpdate(env, isScheduledTask = false) {
  const startTime = Date.now();
  let debugInfo = {};
  
  try {
    // Get existing KV data
    const cachedData = await env.pv_current_leaderboard.get('leaderboard_data', { type: 'json' });
    const cacheTimestamp = await env.pv_current_leaderboard.get('leaderboard_timestamp');
    
    // Calculate cache age and check if it's stale
    const now = Date.now();
    const timestamp = cacheTimestamp ? parseInt(cacheTimestamp) : null;
    const age = timestamp ? (now - timestamp) / 1000 : Infinity;
    const isStale = age >= CACHE_DURATION;

    // If cache exists and isn't stale, return cached data
    if (cachedData && !isStale) {
      logger.log('Using fresh cache data');
      return {
        data: cachedData,
        source: 'kv-cache',
        timestamp,
        cacheDuration: CACHE_DURATION,
        remainingTtl: CACHE_DURATION - age,
        responseTime: Date.now() - startTime,
        debugInfo: isDev() ? {
          dataSource: 'KV Cache',
          age: Math.round(age),
          responseTime: Date.now() - startTime
        } : undefined
      };
    }

    // Skip database updates if no cache exists and it's a scheduled task
    if (!cachedData && isScheduledTask) {
      logger.log('No KV cache found. Skipping scheduled update process.');
      return {
        error: 'No cached data available',
        debugInfo: isDev() ? {
          dataSource: 'Skipped - No Cache',
          responseTime: Date.now() - startTime
        } : undefined
      };
    }

    // Fetch new data from Embark
    const response = await fetch('https://id.embark.games/the-finals/leaderboards/s5', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const html = await response.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
    
    if (!match) {
      throw new Error('Failed to find data in response');
    }

    const jsonData = JSON.parse(match[1]);
    const currentData = await transformLeaderboardData(jsonData.props.pageProps.entries);

    // Only process database updates if we have cached data to compare against
    if (cachedData) {
      const db = await connectToTurso(env);
      const playersToUpdate = await detectRankChanges(currentData, cachedData);
      
      console.log(`Detected ${playersToUpdate.length} players to update (rank changes + new entries)`);
      
      if (playersToUpdate.length > 0) {
        await withRetry(() => updatePlayerStats(db, playersToUpdate));
        logger.log('Successfully updated Turso database with rank changes and new entries');
      }
      
      debugInfo = isDev() ? {
        dataSource: 'Embark API + DB Update',
        changesDetected: playersToUpdate.length,
        responseTime: Date.now() - startTime
      } : undefined;
    }

    // Always update KV cache with new data
    const newTimestamp = Date.now();
    await env.pv_current_leaderboard.put('leaderboard_data', JSON.stringify(currentData));
    await env.pv_current_leaderboard.put('leaderboard_timestamp', newTimestamp.toString());
    
    return {
      data: currentData,
      source: 'embark',
      timestamp: newTimestamp,
      cacheDuration: CACHE_DURATION,
      remainingTtl: CACHE_DURATION,
      responseTime: Date.now() - startTime,
      debugInfo
    };
    
  } catch (error) {
    logger.error('Update process failed:', error);
    throw error;
  }
}

// Modified onScheduled to use shared logic
export async function onScheduled(event, env, ctx) {
  try {
    await processLeaderboardUpdate(env, true);
  } catch (error) {
    logger.error('Scheduled task failed:', error);
  }
}

// Modified onRequestPost to use shared logic
export async function onRequestPost({request, env, origin }) {
  try {
    const body = await request.json();
    if (!body || body.token !== AUTH_TOKEN) {
      return new Response('Unauthorized', { status: 403 });
    }

    let result;
    try {
      result = await processLeaderboardUpdate(env, false);
    } catch (error) {
      // If the update process fails, try to use stale cache as fallback
      const cachedData = await env.pv_current_leaderboard.get('leaderboard_data', { type: 'json' });
      const cacheTimestamp = await env.pv_current_leaderboard.get('leaderboard_timestamp');
      
      if (cachedData) {
        return new Response(JSON.stringify({
          data: cachedData,
          source: 'kv-cache-fallback',
          timestamp: parseInt(cacheTimestamp),
          cacheDuration: CACHE_DURATION,
          remainingTtl: 0,
          responseTime: Date.now() - startTime,
          error: error.message,
          debugInfo: isDev() ? {
            dataSource: 'KV Cache Fallback',
            error: error.message,
            responseTime: Date.now() - startTime
          } : undefined
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin)
          }
        });
      }
      throw error;
    }

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin),
        'Cache-Control': `max-age=${CACHE_DURATION}`
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch data',
      details: error.message,
      debugInfo: isDev() ? {
        dataSource: 'Error',
        error: error.message,
        kvStatus: env?.pv_current_leaderboard ? 'available' : 'not configured'
      } : undefined
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin),
      },
    });
  }
}