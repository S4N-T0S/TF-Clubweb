export const getLeagueInfo = (leagueNumber) => {
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
      21: { name: "Ruby", style: 'text-red-600' } // Ruby League remember to change if API changes (in dataProcessing.js)
    };
  
    if (leagueNumber !== undefined && leagueNumber !== null) {
      return leagueData[leagueNumber] || { name: 'Unknown', style: 'text-gray-600' };
    }
  
    return { name: 'Unknown', style: 'text-gray-600' };
  };

/**
 * Converts a player's rank and score into a numerical league index for filtering.
 * @param {number | null} rank - The player's numerical rank.
 * @param {number | null} score - The player's rank score.
 * @returns {number | null} A numerical index (0-5) or null if unrankable.
 * 0: Bronze, 1: Silver, 2: Gold, 3: Platinum, 4: Diamond, 5: Ruby
 */
export const getLeagueIndexForFilter = (rank, score) => {
  // Ruby is top 500, which overrides any score.
  if (rank !== null && rank > 0 && rank <= 500) {
    return 5; // 5 = Ruby
  }

  // Score-based leagues
  if (score === null || score === undefined) {
    return null; // Cannot determine league from score
  }
  if (score >= 40000) return 4; // 4 = Diamond
  if (score >= 30000) return 3; // 3 = Platinum
  if (score >= 20000) return 2; // 2 = Gold
  if (score >= 10000) return 1; // 1 = Silver
  // Anything with a score below that is Bronze
  if (score >= 0) return 0; // 0 = Bronze

  return null; // Default case if score is negative or invalid
};