import ogClanMembers from '../data/clanMembers';

export const processLeaderboardData = (rawData) => {
  // Process global leaderboard data
  const globalLeaderboard = rawData.map(player => ({
    ...player,
    displayName: player.clubTag ? `[${player.clubTag}] ${player.name}` : player.name
  }));

  // Process clan scores
  const clanScores = new Map();
  rawData.forEach(player => {
    if (player?.clubTag) {
      const existing = clanScores.get(player.clubTag) || { score: 0, members: 0 };
      clanScores.set(player.clubTag, {
        score: existing.score + (player.rankScore || 0),
        members: existing.members + 1
      });
    }
  });

  const topClans = Array.from(clanScores.entries())
    .map(([tag, data]) => ({
      tag,
      totalScore: data.score,
      memberCount: data.members
    }))
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 20);

  const ogMembersInLeaderboard = rawData.filter(player => 
    player?.clubTag === 'OG'
  );

  const { matchedMembers, unknownMembers, matchedClanMembers } = processOGMembers(ogMembersInLeaderboard);
  const unrankedMembers = getUnrankedMembers(matchedClanMembers);
  const clanMembers = [...matchedMembers, ...unrankedMembers];

  return {
    clanMembers,
    isTopClan: topClans[0]?.tag === 'OG',
    topClans,
    unknownMembers,
    globalLeaderboard
  };
};

const processOGMembers = (ogMembersInLeaderboard) => {
  const matchedClanMembers = new Set();
  const unknownMembers = [];

  const matchedMembers = ogMembersInLeaderboard.map(apiMember => {
    const clanMember = ogClanMembers.find(member => 
      member.embarkId.toLowerCase() === apiMember.name.toLowerCase()
    );

    if (clanMember) {
      matchedClanMembers.add(clanMember.embarkId);
    } else {
      unknownMembers.push(apiMember);
    }

    return {
      ...apiMember,
      discord: clanMember?.discord || null
    };
  });

  return { matchedMembers, unknownMembers, matchedClanMembers };
};

const getUnrankedMembers = (matchedClanMembers) => {
  return ogClanMembers
    .filter(member => !matchedClanMembers.has(member.embarkId))
    .map(member => ({
      name: member.embarkId,
      discord: member.discord,
      rankScore: 0,
      league: 'Unranked',
      notInLeaderboard: true
    }));
};