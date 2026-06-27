import { useState, useCallback, useEffect } from 'react';
import { getStoredFavourites, setStoredFavourites } from '../services/localStorageManager';

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
      // Dedupe by Embark ID
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
    setFavourites(prev => prev.filter(favourite => favourite.name !== playerObject.name));
  }, []);

  const isFavourite = useCallback((playerObject) => {
    return favourites.some(p => p.name === playerObject.name);
  }, [favourites]);

  const getFavouriteWithFallback = useCallback((favourite, leaderboard) => {
    // Match by Embark ID only. If the exact ID isn't in the live leaderboard the player
    // has renamed, been banned, or dropped off — the identity pass resolves which. We
    // never fall back to platform-handle matching (handles aren't unique).
    const player = leaderboard.find(p => p.name === favourite.name);
    if (player) return player;

    // Red stub. Spreads ...favourite, so any suspectedBan flag stored on the record flows
    // through for the row to style.
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
  //      stored platform handles drifted -> overwrite the handles from the live row (the
  //      authoritative source while on-board). Also clears stale red/ban bookkeeping when
  //      a player reappears.
  //   2. IDENTITY (async): a favourite NOT in the live leaderboard (renamed / banned /
  //      dropped off) -> ask /identity who they are now (via the helpers below +
  //      interpretIdentity in GlobalView). Throttled per-record + once per leaderboard
  //      cycle. Identity supplies the Embark ID, ban state, and display handles; the
  //      Embark ID is the ONLY thing ever used to MATCH (handles are display-only).

  // Pure. Returns links-only / clear patches for favourites present under their exact
  // Embark ID. Only emits a patch when a value genuinely differs, so re-running after
  // applying is a no-op (idempotency contract -> no render loop).
  const computeFreeReconcile = useCallback((leaderboard) => {
    const patches = [];
    for (const fav of favourites) {
      const row = leaderboard.find(p => p.name === fav.name);
      if (!row) continue; // not in LB -> handled by the identity path

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
  // in the live leaderboard (renamed / banned / dropped off) AND due per the backoff.
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
      // Refresh the DISPLAY handles from identity (matching stays Embark-ID-only, so this
      // only affects the values shown on the row). For an on-board player the free
      // reconcile overrides these with the live leaderboard row; for an off-board one
      // identity is the only available source. null => no season data, so keep as-is.
      const syncLinks = (target) => {
        if (result.links) {
          target.steamName = result.links.steamName;
          target.psnName = result.links.psnName;
          target.xboxName = result.links.xboxName;
        }
      };

      // Rename: rewrite the Embark ID (+ refresh display handles) and drop throttle/ban
      // state. Dedupe by Embark ID against any other favourite that now resolves to the
      // same player.
      if (result.rename) {
        const merged = {
          ...f,
          name: result.rename.name,
          renamedFrom: f.name,
          previousNames: [...(f.previousNames || []), f.name].slice(-5),
          lastRenamedAt: now,
        };
        syncLinks(merged);
        delete merged.identityCheckCount;
        delete merged.lastIdentityCheckAt;
        delete merged.suspectedBan;
        delete merged.suspectedBanSeasonId;
        delete merged.suspectedBanAt;

        const deduped = prev.filter((o, i) => i === idx || o.name !== merged.name);
        return deduped.map(o => (favKey(o) === key ? merged : o));
      }

      // No rename: refresh display handles, stamp the throttle, and apply the
      // suspected-ban transition.
      const merged = {
        ...f,
        lastIdentityCheckAt: now,
        identityCheckCount: Math.min((f.identityCheckCount || 0) + 1, MAX_CHECK_COUNT),
      };
      syncLinks(merged);
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
