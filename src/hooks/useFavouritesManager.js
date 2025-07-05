import { useState, useCallback, useEffect } from 'react';
import { getStoredFavourites, setStoredFavourites } from '../services/localStorageManager';

// Helper function to find a player by platform username
const findPlayerByPlatform = (leaderboardPlayer, favouritePlayer) => {
  if (favouritePlayer.xboxName && leaderboardPlayer.xboxName === favouritePlayer.xboxName) return true;
  if (favouritePlayer.psnName && leaderboardPlayer.psnName === favouritePlayer.psnName) return true;
  if (favouritePlayer.steamName && leaderboardPlayer.steamName === favouritePlayer.steamName) return true;
  return false;
};

// Custom hook to manage player favourites logic
export const useFavouritesManager = () => {
  const [favourites, setFavourites] = useState(getStoredFavourites);

  useEffect(() => {
    setStoredFavourites(favourites);
  }, [favourites]);

  const addFavourite = useCallback((player) => {
    setFavourites(prev => {
      const exists = prev.some(p => p.name === player.name);
      if (exists) return prev;
      return [...prev, {
        name: player.name,
        steamName: player.steamName,
        psnName: player.psnName,
        xboxName: player.xboxName,
        addedAt: Date.now()
      }];
    });
  }, []);

  const removeFavourite = useCallback((playerObject) => {
    setFavourites(prev => prev.filter(favourite => {
      const nameMatch = favourite.name === playerObject.name;
      const platformMatch = findPlayerByPlatform(playerObject, favourite);
      return !nameMatch && !platformMatch;
    }));
  }, []);

  const isFavourite = useCallback((playerObject) => {
    return favourites.some(p => 
      p.name === playerObject.name || 
      findPlayerByPlatform(playerObject, p)
    );
  }, [favourites]);

  const getFavouriteWithFallback = useCallback((favourite, leaderboard) => {
    let player = leaderboard.find(p => p.name === favourite.name);
    
    if (player) return player;

    if (favourite.xboxName) {
      player = leaderboard.find(p => p.xboxName === favourite.xboxName);
      if (player) return { ...player, foundViaFallback: true };
    }
    
    if (favourite.psnName) {
      player = leaderboard.find(p => p.psnName === favourite.psnName);
      if (player) return { ...player, foundViaFallback: true };
    }
    
    if (favourite.steamName) {
      player = leaderboard.find(p => p.steamName === favourite.steamName);
      if (player) return { ...player, foundViaFallback: true };
    }
    
    return {
      ...favourite,
      clubTag: null,
      rank: 99999,
      change: 0,
      rankScore: 0,
      leagueNumber: 0,
      league: 'Unknown',
      notFound: true
    };
  }, []);

  const getFavouritesWithFallback = useCallback((leaderboard) => {
    return favourites
      .map(favourite => getFavouriteWithFallback(favourite, leaderboard))
      .sort((a, b) => a.rank - b.rank);
  }, [favourites, getFavouriteWithFallback]);
  
  return {
    favourites,
    addFavourite,
    removeFavourite,
    isFavourite,
    getFavouritesWithFallback
  };
};