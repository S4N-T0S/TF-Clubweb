const isDev = process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
const API_URL = isDev ? 'http://localhost:8787' : 'https://ogclub-lb.qhgk96y9s7.workers.dev';
const AUTH_TOKEN = 'not-secret';

export const fetchPlayerGraphData = async (playerId) => {
  try {
    const startTime = Date.now();
    const response = await fetch(`${API_URL}/graph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        token: AUTH_TOKEN,
        playerId
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    const responseTime = Date.now() - startTime;
    
    if (!result.data) {
      throw new Error('No graph data received from API');
    }

    console.group('Player Graph Data Fetch');
    console.log('Player ID:', playerId);
    console.log('Data Points:', result.data.length);
    console.log('Response Time:', `${responseTime}ms`);
    console.groupEnd();

    return {
      data: result.data,
      playerId: result.playerId,
      responseTime
    };

  } catch (error) {
    console.error('Failed to fetch graph data:', error);
    throw error;
  }
};