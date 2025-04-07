import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { FavouritesContextProps } from '../types/propTypes';

const FavouritesContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useFavourites = () => {
  const context = useContext(FavouritesContext);
  if (!context) {
    throw new Error('useFavourites must be used within a FavouritesProvider');
  }
  return context;
};

export const FavouritesProvider = ({ children }) => {
  const [Favourites, setFavourites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('playerFavourites')) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('playerFavourites', JSON.stringify(Favourites));
  }, [Favourites]);

  // Function to find player by platform username
  const findPlayerByPlatform = (leaderboardPlayer, FavouritePlayer) => {
    if (FavouritePlayer.xboxName && leaderboardPlayer.xboxName === FavouritePlayer.xboxName) return true;
    if (FavouritePlayer.psnName && leaderboardPlayer.psnName === FavouritePlayer.psnName) return true;
    if (FavouritePlayer.steamName && leaderboardPlayer.steamName === FavouritePlayer.steamName) return true;
    return false;
  };

  const getFavouriteWithFallback = useCallback((Favourite, leaderboard) => {
    // Try to find by exact name first
    let player = leaderboard.find(p => p.name === Favourite.name);
    
    if (player) {
      return player; // Found by EmbarkID, no flags needed
    }

    if (!player) {
      // Try Xbox name first
      if (Favourite.xboxName) {
        player = leaderboard.find(p => p.xboxName === Favourite.xboxName);
        if (player) {
          return { ...player, foundViaFallback: true };
        }
      }
      
      // Try PSN name if Xbox name not found
      if (Favourite.psnName) {
        player = leaderboard.find(p => p.psnName === Favourite.psnName);
        if (player) {
          return { ...player, foundViaFallback: true };
        }
      }
      
      // Try Steam name last
      if (Favourite.steamName) {
        player = leaderboard.find(p => p.steamName === Favourite.steamName);
        if (player) {
          return { ...player, foundViaFallback: true };
        }
      }
    }
    
    if (!player) {
      // Create fallback player object with warning styling
      return {
        ...Favourite,
        clubTag: null,
        rank: 99999,
        change: 0,
        rankScore: 0,
        leagueNumber: 0,
        league: 'Unknown',
        notFound: true
      };
    }
    
    return player;
  }, []);

  const getFavouritesWithFallback = useCallback((leaderboard) => {
    return Favourites
      .map(Favourite => getFavouriteWithFallback(Favourite, leaderboard))
      .sort((a, b) => a.rank - b.rank);
  }, [Favourites, getFavouriteWithFallback]);

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

  const removeFavourite = useCallback((playerNameOrObject) => {
    setFavourites(prev => prev.filter(Favourite => {
      // If playerNameOrObject is a string (embark ID), use direct comparison [Redundant, just passing object now but keeping this here why not]
      if (typeof playerNameOrObject === 'string') {
        return Favourite.name !== playerNameOrObject;
      }
      
      // If it's a player object, check both embark ID and platform usernames
      const nameMatch = Favourite.name === playerNameOrObject.name;
      const platformMatch = findPlayerByPlatform(playerNameOrObject, Favourite);
      
      // Remove if either name or platform matches
      return !nameMatch && !platformMatch;
    }));
  }, []);

  const isFavourite = useCallback((playerNameOrObject) => {
    if (typeof playerNameOrObject === 'string') { // [Redundant, just passing object now but keeping this here why not]
      return Favourites.some(p => p.name === playerNameOrObject);
    }
    return Favourites.some(p => 
      p.name === playerNameOrObject.name || 
      findPlayerByPlatform(playerNameOrObject, p)
    );
  }, [Favourites]);

  return (
    <FavouritesContext.Provider value={{
      Favourites,
      addFavourite,
      removeFavourite,
      isFavourite,
      getFavouritesWithFallback
    }}>
      {children}
    </FavouritesContext.Provider>
  );
};

FavouritesProvider.propTypes = FavouritesContextProps;