export const processLeaderboardData = (rawData, clubMembers) => {
  // Find Ruby cutoff score
  const rubyPlayers = rawData.filter(player => player.leagueNumber === 21); // Ruby League remember to change if API changes
  const rubyCutoff = rubyPlayers.length > 0 ? rubyPlayers.reduce((lowest, player) => 
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
      memberCount: data.members
    }))
    .sort((a, b) => b.totalScore - a.totalScore)
    //.slice(0, 15);

  const ogMembersInLeaderboard = rawData.filter(player => 
    player?.clubTag === 'OG'
  );

  const { matchedMembers, unknownMembers, matchedClubMembers } = processOGMembers(ogMembersInLeaderboard, clubMembers);
  const unrankedMembers = getUnrankedMembers(matchedClubMembers, clubMembers);
  const finalClubMembers = [...matchedMembers, ...unrankedMembers];

  return {
    clubMembers: finalClubMembers,
    rankedClubMembers: ogMembersInLeaderboard,
    isTopClub: topClubs[0]?.tag === 'OG',
    topClubs,
    unknownMembers,
    globalLeaderboard,
    rubyCutoff
  };
};

const processOGMembers = (ogMembersInLeaderboard, clubMembers) => {
  const matchedClubMembers = new Set();
  const unknownMembers = [];

  const matchedMembers = ogMembersInLeaderboard.map(apiMember => {
    const clubMember = clubMembers.find(member => 
      member.embarkId.toLowerCase() === apiMember.name.toLowerCase()
    );

    if (clubMember) {
      matchedClubMembers.add(clubMember.embarkId);
    } else {
      unknownMembers.push(apiMember);
    }

    return {
      ...apiMember,
      discord: clubMember?.discord || null
    };
  });

  return { matchedMembers, unknownMembers, matchedClubMembers };
};

const getUnrankedMembers = (matchedClubMembers, clubMembers) => {
  return clubMembers
    .filter(member => !matchedClubMembers.has(member.embarkId))
    .map(member => ({
      name: member.embarkId,
      discord: member.discord,
      rankScore: 0,
      league: 'Unranked',
      notInLeaderboard: true
    }));
};