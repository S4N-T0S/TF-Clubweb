const CACHE_DURATION = 10 * 60; // 10 minutes in seconds
const AUTH_TOKEN = 'not-secret';

export async function onRequestPost({ params, request, env }) {
  try {
    const startTime = Date.now();
    const body = await request.json();
    if (!body || body.token !== AUTH_TOKEN) {
      return new Response('Unauthorized', { status: 403 });
    }

    const targetPath = params.path?.join('/') || '';
    let cachedData = null;
    let cacheTimestamp = null;
    
    if (env?.current_leaderboard) {
      cachedData = await env.current_leaderboard.get('leaderboard_data', { type: 'json' });
      cacheTimestamp = await env.current_leaderboard.get('leaderboard_timestamp');
    }

    const now = Date.now();
    const timestamp = cacheTimestamp ? parseInt(cacheTimestamp) : null;
    const age = timestamp ? (now - timestamp) / 1000 : Infinity;
    const isStale = age >= CACHE_DURATION;

    if (isStale || !cachedData) {
      try {
        const targetUrl = `https://id.embark.games/the-finals/leaderboards/${targetPath}`;
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
        });

        const html = await response.text();
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
        
        if (!match) {
          throw new Error('Failed to find data in response');
        }

        const jsonData = JSON.parse(match[1]);
        const leaderboardData = jsonData.props.pageProps.entries;
        const newTimestamp = Date.now();

        if (env?.current_leaderboard) {
          await env.current_leaderboard.put('leaderboard_data', JSON.stringify(leaderboardData));
          await env.current_leaderboard.put('leaderboard_timestamp', newTimestamp.toString());
        }

        return new Response(JSON.stringify({
          data: leaderboardData,
          source: 'embark',
          timestamp: newTimestamp,
          cacheDuration: CACHE_DURATION,
          remainingTtl: CACHE_DURATION,
          responseTime: Date.now() - startTime,
          debugInfo: {
            dataSource: 'Embark API',
            responseTime: Date.now() - startTime,
            kvStatus: env?.current_leaderboard ? 'available' : 'not configured'
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
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch data',
      details: error.message,
      stack: error.stack,
      debugInfo: {
        dataSource: 'Error',
        error: error.message,
        stack: error.stack,
        kvStatus: env?.current_leaderboard ? 'available' : 'not configured'
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