// _worker.js (place this in functions directory for Cloudflare Pages)
export async function onRequest(context) {
    const url = new URL(context.request.url);
    
    // Only proxy requests to /api/leaderboard/*
    if (!url.pathname.startsWith('/api/leaderboard')) {
      return new Response('Not Found', { status: 404 });
    }
    
    // Transform the request path to match the target API
    const targetPath = url.pathname.replace(/^\/api\/leaderboard/, '');
    const targetUrl = `https://id.embark.games/the-finals/leaderboards${targetPath}`;
    
    try {
      const response = await fetch(targetUrl, {
        method: context.request.method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
  
      // Create a new response with CORS headers
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Content-Type': response.headers.get('Content-Type') || 'text/html',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch data' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }