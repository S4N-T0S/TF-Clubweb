import { API } from "./api";

export const fetchPlayerGraphData = async (embarkId) => {
  try {
    const startTime = Date.now();
    const response = await fetch(`${API.BASE_URL}/graph`, {
      method: API.METHOD,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        token: API.AUTH_TOKEN,
        embarkId
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
    console.log('Embark ID:', embarkId);
    console.log('Data Points:', result.data.length);
    console.log('Response Time:', `${responseTime}ms`);
    console.groupEnd();

    return {
      data: result.data,
      embarkId: result.embarkId,
      responseTime
    };

  } catch (error) {
    console.error('Failed to fetch graph data:', error);
    throw error;
  }
};