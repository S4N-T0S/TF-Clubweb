import { createClient } from '@libsql/client/web';
//test
const CACHE_DURATION = 10 * 60; // 10 minutes in seconds
const AUTH_TOKEN = 'not-secret';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// Handle OPTIONS requests for CORS
function handleOptions(request) {
  if (request.headers.get('Origin') !== null &&
      request.headers.get('Access-Control-Request-Method') !== null &&
      request.headers.get('Access-Control-Request-Headers') !== null) {
    // Handle CORS preflight request
    return new Response(null, {
      headers: corsHeaders
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
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Extract path parameters
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/').filter(segment => segment);
    const params = { path: pathSegments.slice(2) }; // Remove 'api' and 'leaderboard' from path

    if (request.method === 'POST') {
      return onRequestPost({ params, request, env });
    }

    return new Response('Method not allowed', { 
      status: 405,
      headers: {
        ...corsHeaders,
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
      player.id,
      player.rankScore,
      timestamp,
      player.rankScore,
      timestamp
    ]
  }));

  // Prepare batch statements for rank_history
  const historyInserts = players.map(player => ({
    sql: `INSERT INTO rank_history (player_id, rank_score, recorded_at)
          VALUES (?, ?, ?)`,
    args: [player.id, player.rankScore, timestamp]
  }));

  try {
    await db.batch([...statsUpdates, ...historyInserts]);
  } catch (error) {
    console.error('Failed to update database:', error);
    throw error;
  }
}

async function detectRankChanges(currentData, cachedData) {
  if (!cachedData) return currentData;

  const cachedRanks = new Map(
    cachedData.map(player => [player.name, player.rankScore])
  );

  return currentData.filter(player => {
    const cachedRank = cachedRanks.get(player.name);
    return !cachedRank || cachedRank !== player.rankScore;
  });
}

async function transformLeaderboardData(entries) {
  return entries.map(entry => ({
    rank: entry[1],
    change: entry[2],
    name: entry[3] || 'Unknown#0000',
    steamName: entry[6] || null,
    psnName: entry[7] || null,
    xboxName: entry[8] || null,
    clubTag: entry[12] || null,
    leagueNumber: entry[4],
    rankScore: entry[5]
  }));
}

export async function onScheduled(event, env, ctx) {
  try {
    const db = await connectToTurso(env);
    
    // Fetch current leaderboard data from KV
    const cachedData = await env.pv_current_leaderboard.get('leaderboard_data', { type: 'json' });
    
    // Fetch new data from the API
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
    
    // Detect rank changes
    const changedPlayers = await detectRankChanges(currentData, cachedData);
    
    if (changedPlayers.length > 0) {
      // Update database with new ranks
      await withRetry(() => updatePlayerStats(db, changedPlayers));
    }

    // Update KV cache
    await env.pv_current_leaderboard.put('leaderboard_data', JSON.stringify(currentData));
    await env.pv_current_leaderboard.put('leaderboard_timestamp', Date.now().toString());
    
  } catch (error) {
    console.error('Scheduled task failed:', error);
  }
}

export async function onRequestPost({ params, request, env }) {
  try {
    const startTime = Date.now();
    const body = await request.json();
    if (!body || body.token !== AUTH_TOKEN) {
      return new Response('Unauthorized', { status: 403 });
    }

    let cachedData = null;
    let cacheTimestamp = null;
    
    if (env?.pv_current_leaderboard) {
      cachedData = await env.pv_current_leaderboard.get('leaderboard_data', { type: 'json' });
      cacheTimestamp = await env.pv_current_leaderboard.get('leaderboard_timestamp');
    }

    const now = Date.now();
    const timestamp = cacheTimestamp ? parseInt(cacheTimestamp) : null;
    const age = timestamp ? (now - timestamp) / 1000 : Infinity;
    const isStale = age >= CACHE_DURATION;

    if (isStale || !cachedData) {
      try {
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
        
        // Update KV cache
        await env.pv_current_leaderboard.put('leaderboard_data', JSON.stringify(currentData));
        const newTimestamp = Date.now();
        await env.pv_current_leaderboard.put('leaderboard_timestamp', newTimestamp.toString());

        return new Response(JSON.stringify({
          data: currentData,
          source: 'embark',
          timestamp: newTimestamp,
          cacheDuration: CACHE_DURATION,
          remainingTtl: CACHE_DURATION,
          responseTime: Date.now() - startTime,
          debugInfo: {
            dataSource: 'Embark API',
            responseTime: Date.now() - startTime,
            kvStatus: env?.pv_current_leaderboard ? 'available' : 'not configured'
          }
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': `max-age=${CACHE_DURATION}`
          }
        });
      } catch (error) {
        if (cachedData) {
          // Fallback to stale KV cache if API request fails
          return new Response(JSON.stringify({
            data: cachedData,
            source: 'kv-cache-fallback',
            timestamp,
            cacheDuration: CACHE_DURATION,
            remainingTtl: 0,
            responseTime: Date.now() - startTime,
            error: error.message,
            debugInfo: {
              dataSource: 'KV Cache Fallback',
              error: error.message,
              responseTime: Date.now() - startTime
            }
          }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type'
            }
          });
        }
        throw error;
      }
    }

    return new Response(JSON.stringify({
      data: cachedData,
      source: 'kv-cache',
      timestamp,
      cacheDuration: CACHE_DURATION,
      remainingTtl: Math.max(0, CACHE_DURATION - age),
      responseTime: Date.now() - startTime,
      debugInfo: {
        dataSource: 'KV Cache',
        age: Math.round(age),
        responseTime: Date.now() - startTime
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': `max-age=${CACHE_DURATION}`
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch data',
      details: error.message,
      debugInfo: {
        dataSource: 'Error',
        error: error.message,
        kvStatus: env?.pv_current_leaderboard ? 'available' : 'not configured'
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}