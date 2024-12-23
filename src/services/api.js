export const fetchLeaderboardData = async () => {
  const response = await fetch("https://api.the-finals-leaderboard.com/v1/leaderboard/s5/crossplay");
  if (!response.ok) throw new Error('Failed to fetch leaderboard data');
  const data = await response.json();
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid data format received from API');
  }
  return data;
};