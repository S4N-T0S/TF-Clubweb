export const getLeagueStyle = (league, rank) => {
  const leagueColors = {
    'Bronze': 'text-amber-700',
    'Silver': 'text-gray-300',
    'Gold': 'text-yellow-400',
    'Platinum': 'text-cyan-300',
    'Diamond': 'text-blue-400',
    'Ruby': 'text-red-600',
    'Unranked': 'text-gray-600'
  };

  const baseLeague = league ? league.split(' ')[0] : 'Unranked';
  return leagueColors[baseLeague] || leagueColors['Unranked'];
};