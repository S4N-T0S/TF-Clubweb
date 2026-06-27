import { useState, useCallback, useEffect } from 'react';
import { getStoredFavourites, setStoredFavourites } from '../services/localStorageManager';

// Helper function to find a player by platform username
const findPlayerByPlatform = (leaderboardPlayer, favouritePlayer) => {
  if (favouritePlayer.xboxName && leaderboardPlayer.xboxName === favouritePlayer.xboxName) return true;
  if (favouritePlayer.psnName && leaderboardPlayer.psnName === favouritePlayer.psnName) return true;
  if (favouritePlayer.steamName && leaderboardPlayer.steamName === favouritePlayer.steamName) return true;
  return false;
};

// Stable identity for a favourite record. `addedAt` never changes across renames
const favKey = (f) => (f && f.addedAt != null ? `t:${f.addedAt}` : `n:${f?.name}`);

// Per-record exponential backoff for the /identity check of a stale (yellow/red)
// favourite. Index = identityCheckCount. Eager first check, then back off so a player
// who has quit / dropped off isn't hammered. We NEVER give up: the schedule plateaus at
// a weekly poll, so a long-gone favourite is still re-checked ~once a week forever (it
// only stops when the user removes it, or the player reappears / is found renamed).
const RED_BACKOFF_MS = [
  0,                        // attempt 0: eager
  60 * 60 * 1000,           // 1h
  6 * 60 * 60 * 1000,       // 6h
  24 * 60 * 60 * 1000,      // 24h
  3 * 24 * 60 * 60 * 1000,  // 3 days
  7 * 24 * 60 * 60 * 1000,  // 7 days (steady-state floor — keeps polling forever)
];
// identityCheckCount is capped at this so it never overflows; once here, the weekly
// floor applies indefinitely.
const MAX_CHECK_COUNT = RED_BACKOFF_MS.length;

const strEq = (a, b) => (a || '') === (b || '');

// Custom hook to manage player favourites logic
export const useFavouritesManager = () => {
  const [favourites, setFavourites] = useState(getStoredFavourites);

  useEffect(() => {
    setStoredFavourites(favourites);
  }, [favourites]);

  const addFavourite = useCallback((player) => {
    setFavourites(prev => {
      // Dedupe by Embark ID OR a shared platform handle, so the same player can't be
      // added twice (and a later reconcile won't have to merge a near-duplicate).
      const exists = prev.some(p => p.name === player.name || findPlayerByPlatform(player, p));
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

    // Spreads ...favourite, so any suspectedBan flag stored on the record flows into
    // the red stub for the row to style.
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

  // Self-repair
  // Driven from GlobalView effects in two halves:
  //   1. FREE (sync, no API): a favourite still present under its exact Embark ID whose
  //      stored platform links drifted -> overwrite the links from the live row. Also
  //      clears stale red/ban bookkeeping when a player reappears.
  //   2. IDENTITY (async): a favourite that is NOT an exact match (yellow/red) -> ask
  //      /identity who they are now (via the helpers below + interpretIdentity in
  //      GlobalView). Throttled per-record + once per leaderboard cycle.

  // Pure. Returns links-only / clear patches for favourites present under their exact
  // Embark ID. Only emits a patch when a value genuinely differs, so re-running after
  // applying is a no-op (idempotency contract -> no render loop).
  const computeFreeReconcile = useCallback((leaderboard) => {
    const patches = [];
    for (const fav of favourites) {
      const row = leaderboard.find(p => p.name === fav.name);
      if (!row) continue; // yellow/red -> handled by the identity path

      const patch = {};
      if (!strEq(fav.steamName, row.steamName)) patch.steamName = row.steamName || '';
      if (!strEq(fav.psnName, row.psnName)) patch.psnName = row.psnName || '';
      if (!strEq(fav.xboxName, row.xboxName)) patch.xboxName = row.xboxName || '';

      // Present again => any prior "stale" bookkeeping is obsolete.
      if (fav.identityCheckCount != null) patch.identityCheckCount = undefined;
      if (fav.lastIdentityCheckAt != null) patch.lastIdentityCheckAt = undefined;
      let banJustCleared = false;
      if (fav.suspectedBan) {
        patch.suspectedBan = undefined;
        patch.suspectedBanSeasonId = undefined;
        patch.suspectedBanAt = undefined;
        banJustCleared = true;
      }

      if (Object.keys(patch).length) {
        patches.push({ key: favKey(fav), patch, banJustCleared, name: fav.name });
      }
    }
    return patches;
  }, [favourites]);

  // Apply a batch of patches keyed by favKey. An `undefined` patch value deletes the
  // field. Re-checks equality against the current record (a stale patch becomes a no-op)
  // and bails the whole setState if nothing actually changed.
  const applyReconcilePatches = useCallback((patches) => {
    if (!patches || !patches.length) return;
    const byKey = new Map(patches.map(p => [p.key, p.patch]));
    setFavourites(prev => {
      let changed = false;
      const next = prev.map(f => {
        const patch = byKey.get(favKey(f));
        if (!patch) return f;
        const merged = { ...f };
        let localChanged = false;
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) {
            if (k in merged) { delete merged[k]; localChanged = true; }
          } else if (merged[k] !== v) {
            merged[k] = v; localChanged = true;
          }
        }
        if (localChanged) { changed = true; return merged; }
        return f;
      });
      return changed ? next : prev;
    });
  }, []);

  // Pure. Favourites that warrant an /identity call right now: not an exact-name match
  // in the live leaderboard (i.e. yellow or red) AND due per the backoff schedule.
  const selectStaleCandidates = useCallback((leaderboard, now) => {
    const isDue = (fav) => {
      const n = fav.identityCheckCount || 0;
      if (n === 0) return true;
      const wait = RED_BACKOFF_MS[Math.min(n, RED_BACKOFF_MS.length - 1)];
      return (now - (fav.lastIdentityCheckAt || 0)) >= wait;
    };
    return favourites.filter(fav => {
      if (leaderboard.some(p => p.name === fav.name)) return false; // green exact-match
      return isDue(fav);
    });
  }, [favourites]);

  // Apply one /identity outcome (see interpretIdentity in GlobalView for the result
  // shape). Always a functional update so it sees fresh state inside the sequential
  // loop. Toast decisions are made by the caller from the result + the candidate's prior
  // state, so this does not need to return transition flags.
  const commitIdentityResult = useCallback((fav, result) => {
    if (!result || result.attempted === false) return; // offline -> no-op, retry next cycle
    const key = favKey(fav);
    setFavourites(prev => {
      const idx = prev.findIndex(f => favKey(f) === key);
      if (idx === -1) return prev;
      const f = prev[idx];
      const now = Date.now();

      // Rename: rewrite name + links from the authoritative identity, drop throttle/ban,
      // and dedupe against any other favourite that is now the same player.
      if (result.rename) {
        const links = result.rename.links || {};
        const merged = {
          ...f,
          name: result.rename.name,
          steamName: links.steamName || '',
          psnName: links.psnName || '',
          xboxName: links.xboxName || '',
          renamedFrom: f.name,
          previousNames: [...(f.previousNames || []), f.name].slice(-5),
          lastRenamedAt: now,
        };
        delete merged.identityCheckCount;
        delete merged.lastIdentityCheckAt;
        delete merged.suspectedBan;
        delete merged.suspectedBanSeasonId;
        delete merged.suspectedBanAt;

        const deduped = prev.filter((o, i) => {
          if (i === idx) return true;
          const samePlayer = o.name === merged.name || findPlayerByPlatform(merged, o);
          return !samePlayer;
        });
        return deduped.map(o => (favKey(o) === key ? merged : o));
      }

      // No rename: stamp the throttle and apply the suspected-ban transition.
      const merged = {
        ...f,
        lastIdentityCheckAt: now,
        identityCheckCount: Math.min((f.identityCheckCount || 0) + 1, MAX_CHECK_COUNT),
      };
      if (result.suspectedBan && !f.suspectedBan) {
        merged.suspectedBan = true;
        merged.suspectedBanSeasonId = result.banSeasonId;
        merged.suspectedBanAt = now;
      } else if (!result.suspectedBan && f.suspectedBan) {
        delete merged.suspectedBan;
        delete merged.suspectedBanSeasonId;
        delete merged.suspectedBanAt;
      }
      const next = [...prev];
      next[idx] = merged;
      return next;
    });
  }, []);

  return {
    favourites,
    addFavourite,
    removeFavourite,
    isFavourite,
    getFavouritesWithFallback,
    computeFreeReconcile,
    applyReconcilePatches,
    selectStaleCandidates,
    commitIdentityResult,
  };
};
