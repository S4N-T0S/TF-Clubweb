export const processLeaderboardData = (rawData) => {
  // Find Ruby cutoff score
  const rubyPlayers = rawData.filter(player => player.leagueNumber === 21); // Ruby League remember to change if API changes
  const currentRubyCutoff = rubyPlayers.length > 0 ? rubyPlayers.reduce((lowest, player) => // Either returns RS of lowest ruby player or false if no ruby players
    player.rankScore < lowest ? player.rankScore : lowest,
    Infinity
  ) : false;

  // Process global leaderboard data
  const globalLeaderboard = rawData.map(player => ({
    ...player,
    displayName: player.clubTag ? `[${player.clubTag}] ${player.name}` : player.name
  }));

  // Process club scores
  const clubScores = new Map();
  rawData.forEach(player => {
    if (player?.clubTag) {
      const existing = clubScores.get(player.clubTag) || { score: 0, members: 0 };
      clubScores.set(player.clubTag, {
        score: existing.score + (player.rankScore || 0),
        members: existing.members + 1
      });
    }
  });

  const topClubs = Array.from(clubScores.entries())
    .map(([tag, data]) => ({
      tag,
      totalScore: data.score,
      memberCount: data.members,
      averageScore: data.members > 0 ? data.score / data.members : 0
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  return {
    topClubs,
    globalLeaderboard,
    currentRubyCutoff
  };
};

/**
 * Calculates member status by comparing Spreadsheet data vs Global Leaderboard data.
 * Statuses:
 * - Verified (Normal): In Spreadsheet AND In Leaderboard with OG tag.
 * - Wrong Tag (Red): In Spreadsheet AND In Leaderboard BUT has different/no tag.
 * - Unranked (Yellow): In Spreadsheet BUT NOT in Leaderboard.
 * - Newbs (Light Green): NOT in Spreadsheet BUT In Leaderboard with OG tag.
 */
export const calculateMemberStatus = (globalLeaderboard, spreadsheetMembers) => {
  const processedMembers = [];
  
  // Create a map of leaderboard players by Embark ID (lowercase) for fast lookup
  const leaderboardMap = new Map();
  const ogTagInLeaderboard = [];

  globalLeaderboard.forEach(p => {
    const key = p.name.toLowerCase();
    leaderboardMap.set(key, p);
    if (p.clubTag === 'OG') {
      ogTagInLeaderboard.push(p);
    }
  });

  // Track which leaderboard OG members are actually in the spreadsheet
  const foundSpreadsheetIds = new Set();

  // 1. Iterate through Spreadsheet Members (The source of truth)
  spreadsheetMembers.forEach(sheetMember => {
    const key = sheetMember.embarkId.toLowerCase();
    const lbData = leaderboardMap.get(key);

    if (!lbData) {
      // Case: Unranked / Unknown (Yellow)
      processedMembers.push({
        ...sheetMember,
        name: sheetMember.embarkId,
        status: 'unranked',
        rankScore: 0,
        league: 'Unranked',
        rank: null
      });
    } else {
      // Found in Leaderboard
      foundSpreadsheetIds.add(key);
      
      if (lbData.clubTag === 'OG') {
        // Case: Verified (Normal)
        processedMembers.push({
          ...lbData,
          discord: sheetMember.discord,
          status: 'verified'
        });
      } else {
        // Case: Wrong Tag (Red) - In LB but left club or changed tag
        processedMembers.push({
          ...lbData,
          discord: sheetMember.discord,
          status: 'wrong_tag'
        });
      }
    }
  });

  // 2. Find Newbs (Light Green)
  // Users in Leaderboard with OG tag, but NOT in the Spreadsheet
  ogTagInLeaderboard.forEach(lbMember => {
    const key = lbMember.name.toLowerCase();
    if (!foundSpreadsheetIds.has(key)) {
      processedMembers.push({
        ...lbMember,
        status: 'new_member'
      });
    }
  });

  // Sort by Rank by default.
  // Players without a rank (Unranked) go to the bottom.
  return processedMembers.sort((a, b) => {
    const rankA = a.rank || Infinity;
    const rankB = b.rank || Infinity;
    return rankA - rankB;
  });
};