import { getLeagueInfo } from "../utils/leagueUtils";

const CACHE_KEY = 'leaderboard_cache';
const AUTH_TOKEN = 'not-secret';

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

    const response = await fetch('/api/leaderboard/s5', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: AUTH_TOKEN })
    });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const result = await response.json();
    
    if (!result.data) {
      throw new Error('No data received from API');
    }

    const transformedData = transformData(result.data);
    
    // Handle kv-cache-fallback source specifically
    if (result.source === 'kv-cache-fallback') {
      logDebugInfo('KV-Cache-Fallback', result.debugInfo);
      // Store with a shorter TTL for fallback data
      setCacheData(result.data, result.timestamp, 300, result.source);
    } else {
      logDebugInfo(result.source, result.debugInfo);
      setCacheData(result.data, result.timestamp, result.remainingTtl || 300, result.source);
    }

    return {
      data: transformedData,
      source: result.source,
      timestamp: result.timestamp,
      remainingTtl: result.remainingTtl || 300
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
  return rawData.map(entry => {
    const transformed = {
      rank: entry.rank,
      change: entry.change,
      name: entry.name || 'Unknown#0000',
      steamName: entry.steamName || null,
      psnName: entry.psnName || null,
      xboxName: entry.xboxName || null,
      clubTag: entry.clubTag || null,
      leagueNumber: entry.leagueNumber,
      league: getLeagueInfo(entry.leagueNumber).name,
      rankScore: entry.rankScore
    };
    return transformed;
  });
};