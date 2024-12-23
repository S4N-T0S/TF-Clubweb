import { leagueNumberToName } from "../utils/leagueNumbertoName";

export const fetchLeaderboardData = async () => {
  try {
    const response = await fetch('/api/leaderboard/s5');
    if (!response.ok) {
      throw new Error('Failed to fetch leaderboard data');
    }

    const text = await response.text();
    const match = text.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
    
    if (!match) {
      throw new Error('Failed to find data in response');
    }

    const jsonData = JSON.parse(match[1]);
    const rawData = jsonData.props.pageProps.entries;

    const transformedData = rawData.map(entry => ({
      rank: entry[1],
      change: entry[2],
      name: entry[3] || 'Unknown#0000',
      steamName: entry[6] || null,
      psnName: entry[7] || null,
      xboxName: entry[8] || null,
      clubTag: entry[12] || null,
      leagueNumber: entry[4],
      league: leagueNumberToName(entry[4]),
      rankScore: entry[5]
    }));

    return {
      data: transformedData,
      source: 'embark',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    throw new Error('Failed to fetch leaderboard data');
  }
};