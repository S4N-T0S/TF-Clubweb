import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { FavoritesContextProps } from '../types/propTypes';

const FavoritesContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};

export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('playerFavorites')) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('playerFavorites', JSON.stringify(favorites));
  }, [favorites]);

  // Function to find player by platform username
  const findPlayerByPlatform = (leaderboardPlayer, favoritePlayer) => {
    if (favoritePlayer.xboxName && leaderboardPlayer.xboxName === favoritePlayer.xboxName) return true;
    if (favoritePlayer.psnName && leaderboardPlayer.psnName === favoritePlayer.psnName) return true;
    if (favoritePlayer.steamName && leaderboardPlayer.steamName === favoritePlayer.steamName) return true;
    return false;
  };

  const getFavoriteWithFallback = useCallback((favorite, leaderboard) => {
    // Try to find by exact name first
    let player = leaderboard.find(p => p.name === favorite.name);
    
    if (player) {
      return player; // Found by EmbarkID, no flags needed
    }

    if (!player) {
      // Try Xbox name first
      if (favorite.xboxName) {
        player = leaderboard.find(p => p.xboxName === favorite.xboxName);
        if (player) {
          return { ...player, foundViaFallback: true };
        }
      }
      
      // Try PSN name if Xbox name not found
      if (favorite.psnName) {
        player = leaderboard.find(p => p.psnName === favorite.psnName);
        if (player) {
          return { ...player, foundViaFallback: true };
        }
      }
      
      // Try Steam name last
      if (favorite.steamName) {
        player = leaderboard.find(p => p.steamName === favorite.steamName);
        if (player) {
          return { ...player, foundViaFallback: true };
        }
      }
    }
    
    if (!player) {
      // Create fallback player object with warning styling
      return {
        ...favorite,
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

  const getFavoritesWithFallback = useCallback((leaderboard) => {
    return favorites
      .map(favorite => getFavoriteWithFallback(favorite, leaderboard))
      .sort((a, b) => a.rank - b.rank);
  }, [favorites, getFavoriteWithFallback]);

  const addFavorite = useCallback((player) => {
    setFavorites(prev => {
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

  const removeFavorite = useCallback((playerNameOrObject) => {
    setFavorites(prev => prev.filter(favorite => {
      // If playerNameOrObject is a string (embark ID), use direct comparison [Redundant, just passing object now but keeping this here why not]
      if (typeof playerNameOrObject === 'string') {
        return favorite.name !== playerNameOrObject;
      }
      
      // If it's a player object, check both embark ID and platform usernames
      const nameMatch = favorite.name === playerNameOrObject.name;
      const platformMatch = findPlayerByPlatform(playerNameOrObject, favorite);
      
      // Remove if either name or platform matches
      return !nameMatch && !platformMatch;
    }));
  }, []);

  const isFavorite = useCallback((playerNameOrObject) => {
    if (typeof playerNameOrObject === 'string') { // [Redundant, just passing object now but keeping this here why not]
      return favorites.some(p => p.name === playerNameOrObject);
    }
    return favorites.some(p => 
      p.name === playerNameOrObject.name || 
      findPlayerByPlatform(playerNameOrObject, p)
    );
  }, [favorites]);

  return (
    <FavoritesContext.Provider value={{
      favorites,
      addFavorite,
      removeFavorite,
      isFavorite,
      getFavoritesWithFallback
    }}>
      {children}
    </FavoritesContext.Provider>
  );
};

FavoritesProvider.propTypes = FavoritesContextProps;