import { getLeagueInfo } from "../utils/leagueUtils";

const CACHE_KEY = 'leaderboard_cache';
const AUTH_TOKEN = 'not-secret';
const isDev = process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
const API_URL = isDev ? 'http://localhost:8787' : 'https://ogclub-lb.qhgk96y9s7.workers.dev';

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

const logDataSource = (source, info) => {
  const styles = {
    clientCache: 'color: #4CAF50; font-weight: bold',
    kvCache: 'color: #2196F3; font-weight: bold',
    'kv-cache-fallback': 'color: #9C27B0; font-weight: bold',
    'client-cache-emergency': 'color: #f44336; font-weight: bold'
  };

  const now = Date.now();
  const age = info.timestamp ? Math.floor((now - info.timestamp) / 1000) : 'N/A';

  console.group('Leaderboard Data Fetch');
  console.log(`%cSource: ${source}`, styles[source.toLowerCase().replace('-', '')] || '');
  console.log('Timestamp:', new Date(info.timestamp).toLocaleString());
  console.log('Cache Age:', `${age}s`);
  console.log('TTL Remaining:', `${info.remainingTtl}s`);
  console.log('Response Time:', `${info.responseTime}ms`);
  console.groupEnd();
};

export const fetchLeaderboardData = async () => {
  try {
    const cachedData = getCachedData();

    if (cachedData && !cachedData.isStale) {
      if (cachedData.source === 'kv-cache-fallback') {
        logDataSource('Client-Cache-Fallback', {
          timestamp: cachedData.timestamp,
          remainingTtl: cachedData.remainingTtl,
          responseTime: 0
        });
        return {
          data: transformData(cachedData.data),
          source: 'client-cache-fallback',
          timestamp: cachedData.timestamp,
          remainingTtl: cachedData.remainingTtl
        };
      }
      
      logDataSource('Client-Cache', {
        timestamp: cachedData.timestamp,
        remainingTtl: cachedData.remainingTtl,
        responseTime: 0
      });
      return {
        data: transformData(cachedData.data),
        source: 'client-cache',
        timestamp: cachedData.timestamp,
        remainingTtl: cachedData.remainingTtl
      };
    }

    const startTime = Date.now();
    const response = await fetch(`${API_URL}/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: AUTH_TOKEN })
    });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const result = await response.json();
    const responseTime = Date.now() - startTime;
    
    if (!result.data) {
      throw new Error('No data received from API');
    }

    const transformedData = transformData(result.data);
    
    logDataSource(result.source, {
      timestamp: result.timestamp,
      remainingTtl: result.remainingTtl,
      responseTime
    });

    setCacheData(
      result.data, 
      result.timestamp, 
      result.remainingTtl || 120, 
      result.source
    );

    return {
      data: transformedData,
      source: result.source,
      timestamp: result.timestamp,
      remainingTtl: result.remainingTtl || 120
    };

  } catch (error) {
    const cachedData = getCachedData();
    if (cachedData) {
      logDataSource('Client-Cache-Emergency', {
        timestamp: cachedData.timestamp,
        remainingTtl: 120,
        responseTime: 0
      });
      return {
        data: transformData(cachedData.data),
        source: 'client-cache-emergency',
        timestamp: cachedData.timestamp,
        remainingTtl: 120
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