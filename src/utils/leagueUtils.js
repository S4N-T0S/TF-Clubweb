export const getLeagueInfo = (leagueNumber, league = null) => {
    const leagueData = {
      0: { name: "Unranked", style: 'text-gray-600' },
      1: { name: "Bronze 4", style: 'text-amber-700' },
      2: { name: "Bronze 3", style: 'text-amber-700' },
      3: { name: "Bronze 2", style: 'text-amber-700' },
      4: { name: "Bronze 1", style: 'text-amber-700' },
      5: { name: "Silver 4", style: 'text-gray-300' },
      6: { name: "Silver 3", style: 'text-gray-300' },
      7: { name: "Silver 2", style: 'text-gray-300' },
      8: { name: "Silver 1", style: 'text-gray-300' },
      9: { name: "Gold 4", style: 'text-yellow-400' },
      10: { name: "Gold 3", style: 'text-yellow-400' },
      11: { name: "Gold 2", style: 'text-yellow-400' },
      12: { name: "Gold 1", style: 'text-yellow-400' },
      13: { name: "Platinum 4", style: 'text-cyan-300' },
      14: { name: "Platinum 3", style: 'text-cyan-300' },
      15: { name: "Platinum 2", style: 'text-cyan-300' },
      16: { name: "Platinum 1", style: 'text-cyan-300' },
      17: { name: "Diamond 4", style: 'text-blue-400' },
      18: { name: "Diamond 3", style: 'text-blue-400' },
      19: { name: "Diamond 2", style: 'text-blue-400' },
      20: { name: "Diamond 1", style: 'text-blue-400' },
      21: { name: "Ruby", style: 'text-red-600' }
    };
  
    if (leagueNumber !== undefined && leagueNumber !== null) {
      return leagueData[leagueNumber] || { name: 'Unknown', style: 'text-gray-600' };
    }
  
    if (league) {
      const baseLeague = league.split(' ')[0];
      const leagueStyles = {
        'Bronze': 'text-amber-700',
        'Silver': 'text-gray-300',
        'Gold': 'text-yellow-400',
        'Platinum': 'text-cyan-300',
        'Diamond': 'text-blue-400',
        'Ruby': 'text-red-600',
        'Unranked': 'text-gray-600'
      };
      return {
        name: league,
        style: leagueStyles[baseLeague] || 'text-gray-600'
      };
    }
  
    return { name: 'Unknown', style: 'text-gray-600' };
  };