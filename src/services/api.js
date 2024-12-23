import { getLeagueInfo } from "../utils/leagueUtils";

const CACHE_KEY = 'leaderboard_cache';
const AUTH_TOKEN = 'not-secret';
const isDev = process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';

const fetchEmbarkDataDirectly = async () => {
  const response = await fetch('/api/leaderboard/s5', {
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

  return JSON.parse(match[1]).props.pageProps.entries;
};

const getCachedData = () => {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return null;

  try {
    const { data, timestamp, expiresAt, source } = JSON.parse(cached);
    const now = Date.now();
    
    if (now < expiresAt) {
      return {
        data,
        timestamp,
        remainingTtl: Math.floor((expiresAt - now) / 1000),
        source
      };
    }
    
    return {
      data,
      timestamp,
      isStale: true,
      source
    };
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
};

const setCacheData = (data, timestamp, remainingTtl, source) => {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    data,
    timestamp,
    expiresAt: Date.now() + (remainingTtl * 1000),
    source
  }));
};

const logDebugInfo = (source, info) => {
  const styles = {
    clientCache: 'color: #4CAF50; font-weight: bold',
    kvCache: 'color: #2196F3; font-weight: bold',
    embark: 'color: #FF9800; font-weight: bold',
    error: 'color: #f44336; font-weight: bold',
    'kv-cache-fallback': 'color: #9C27B0; font-weight: bold'
  };

  console.group('Leaderboard Data Fetch');
  console.log(`%cSource: ${source}`, styles[source.toLowerCase().replace('-', '')] || '');
  console.log('Info:', info);
  console.groupEnd();
};

export const fetchLeaderboardData = async () => {
  try {
    const cachedData = getCachedData();

    if (cachedData && !cachedData.isStale) {
      if (cachedData.source === 'kv-cache-fallback') {
        logDebugInfo('Client-Cache-Fallback', { ttlRemaining: cachedData.remainingTtl });
        return {
          data: transformData(cachedData.data),
          source: 'client-cache-fallback',
          timestamp: cachedData.timestamp,
          remainingTtl: cachedData.remainingTtl
        };
      }
      
      logDebugInfo('Client-Cache', { ttlRemaining: cachedData.remainingTtl });
      return {
        data: transformData(cachedData.data),
        source: 'client-cache',
        timestamp: cachedData.timestamp,
        remainingTtl: cachedData.remainingTtl
      };
    }

    let rawData, source, timestamp, remainingTtl;

    if (isDev) {
      try {
        rawData = await fetchEmbarkDataDirectly();
        source = 'embark-direct';
        timestamp = Date.now();
        remainingTtl = 600;
      } catch (error) {
        if (cachedData) {
          return {
            data: transformData(cachedData.data),
            source: 'client-cache-fallback',
            timestamp: cachedData.timestamp,
            remainingTtl: 300
          };
        }
        throw error;
      }
    } else {
      const response = await fetch('/api/leaderboard/s5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: AUTH_TOKEN })
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const result = await response.json();
      rawData = result.data;
      source = result.source;
      timestamp = result.timestamp;
      remainingTtl = result.remainingTtl || 300;
      
      logDebugInfo(result.source, result.debugInfo);
    }

    if (!rawData) {
      throw new Error('No data received from API');
    }

    const transformedData = transformData(rawData);
    
    if (source !== 'client-cache') {
      setCacheData(rawData, timestamp, remainingTtl, source);
    }

    return {
      data: transformedData,
      source,
      timestamp,
      remainingTtl
    };

  } catch (error) {
    const cachedData = getCachedData();
    if (cachedData) {
      return {
        data: transformData(cachedData.data),
        source: 'client-cache-emergency',
        timestamp: cachedData.timestamp,
        remainingTtl: 300
      };
    }
    
    throw error;
  }
};

const transformData = (rawData) => {
  return rawData.map(entry => ({
    rank: entry[1],
    change: entry[2],
    name: entry[3] || 'Unknown#0000',
    steamName: entry[6] || null,
    psnName: entry[7] || null,
    xboxName: entry[8] || null,
    clubTag: entry[12] || null,
    leagueNumber: entry[4],
    league: getLeagueInfo(entry[4]).name,
    rankScore: entry[5]
  }));
};