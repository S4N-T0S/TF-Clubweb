import { getLeagueInfo } from "../utils/leagueUtils";

const CACHE_KEY = 'leaderboard_cache';
const AUTH_TOKEN = 'not-secret';

const getCachedData = () => {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return null;

  try {
    const { data, timestamp, expiresAt } = JSON.parse(cached);
    
    if (Date.now() < expiresAt) {
      return {
        data,
        timestamp,
        remainingTtl: Math.floor((expiresAt - Date.now()) / 1000)
      };
    }
    
    localStorage.removeItem(CACHE_KEY);
    return null;
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
};

const setCacheData = (data, timestamp, remainingTtl) => {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    data,
    timestamp,
    expiresAt: Date.now() + (remainingTtl * 1000)
  }));
};

const logDebugInfo = (source, info) => {
  const styles = {
    clientCache: 'color: #4CAF50; font-weight: bold',
    kvCache: 'color: #2196F3; font-weight: bold',
    embark: 'color: #FF9800; font-weight: bold',
    error: 'color: #f44336; font-weight: bold'
  };

  console.group('Leaderboard Data Fetch');
  console.log(`%cSource: ${source}`, styles[source.toLowerCase().replace('-', '')]);
  
  if (info.ttlRemaining) {
    console.log(`TTL Remaining: ${info.ttlRemaining}s`);
  }
  if (info.responseTime) {
    console.log(`Response Time: ${info.responseTime}ms`);
  }
  if (info.error) {
    console.error('Error:', info.error);
    console.error('Stack:', info.stack);
  }
  console.groupEnd();
};

export const fetchLeaderboardData = async () => {
  try {
    const cachedData = getCachedData();
    if (cachedData) {
      logDebugInfo('Client-Cache', { ttlRemaining: cachedData.remainingTtl });
      return {
        data: transformData(cachedData.data),
        source: 'client-cache',
        timestamp: cachedData.timestamp,
        remainingTtl: cachedData.remainingTtl
      };
    }

    const startTime = Date.now();
    const response = await fetch('/api/leaderboard/s5', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: AUTH_TOKEN
      })
    });

    if (!response.ok) {
      throw new Error(`Worker returned ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }

    logDebugInfo(result.source, result.debugInfo);
    
    const transformedData = transformData(result.data);
    setCacheData(result.data, result.timestamp, result.remainingTtl);

    return {
      data: transformedData,
      source: result.source,
      timestamp: result.timestamp,
      remainingTtl: result.remainingTtl
    };
  } catch (error) {
    logDebugInfo('Error', { error: error.message, stack: error.stack });
    throw new Error('Failed to fetch leaderboard data');
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