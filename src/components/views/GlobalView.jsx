import { ChevronUp, ChevronDown, UserSearch, LineChart, Star, StarOff, X, Search, Gavel, UserPen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePagination } from '../../hooks/usePagination';
import { SearchBar } from '../SearchBar';
import { IdentityAutofill } from '../search/IdentityAutofill';
import { LeagueDisplay } from '../LeagueDisplay';
import { Pagination } from '../Pagination';
import { BackToTop } from '../BackToTop';
import { useSwipe } from '../../hooks/useSwipe';
import { useEffect, useRef, useState, useMemo } from 'react';
import { PlatformLink } from "../icons/PlatformLink";
import { SortButton } from '../SortButton';
import { Hexagon } from '../icons/Hexagon';
import { useModal } from '../../context/ModalProvider';
import { useOnHold } from '../../hooks/useOnHold';
import { SEASONS, getSeasonLeaderboard, getAllSeasonsLeaderboard } from '../../services/historicalDataService';
import { useFavouritesManager } from '../../hooks/useFavouritesManager';
import { fetchIdentity } from '../../services/id-api';
import { buildHistoryHref, buildGraphHref, buildClubSearchHref } from '../../utils/modalHrefs';
import { getStoredGlobalViewSettings, setStoredGlobalViewSettings } from '../../services/localStorageManager';

// Favourites self-repair pacing
const MAX_PER_PASS = 8;
const IDENTITY_GAP_MS = 750;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Newest season (highest seasonId) in an /identity profile.
const newestSeason = (profile) => {
  if (!profile?.seasons?.length) return null;
  return profile.seasons.reduce((a, b) => (b.seasonId > (a?.seasonId ?? -Infinity) ? b : a), null);
};

// Turn an /identity lookup (for a stale favourite, queried by its stored Embark ID)
// into a repair decision. We trust identity's canonical data, never a colliding
// leaderboard row, so this is collision-safe for the yellow case too.
//   'offline' -> connection failure: do nothing, retry next cycle.
//   null      -> 404 (not in S5-live backend): count as a failed attempt, no rewrite.
//   canonical === stored name -> no rename; flag a latest-season suspected ban if any.
//   canonical !== stored name -> rename to canonical + that profile's newest links.
// Resolve a stale favourite (one not in the live leaderboard) against /identity. Identity
// supplies the canonical Embark ID, ban state, and the current platform handles for
// DISPLAY only — handles are never used to MATCH a favourite (matching is Embark-ID-only,
// so collisions can't happen). For an on-board player the free reconcile later overrides
// the handles with the authoritative live-leaderboard row.
//   'offline' -> connection failure: do nothing, retry next cycle.
//   null      -> 404 (not in S5-live backend): count as a failed attempt, no rewrite.
//   canonical === stored name -> no rename; flag a latest-season suspected ban if any.
//   canonical !== stored name -> rename to the canonical Embark ID.
const interpretIdentity = (profile, fav) => {
  if (profile === 'offline') return { attempted: false };
  if (!profile) return { attempted: true, rename: null, suspectedBan: false, links: null };

  const canonical = profile.embarkId;
  const newest = newestSeason(profile);
  const bannedLatest = (newest?.eventCounts?.SUSPECTED_BAN || 0) > 0;
  // Display handles from the newest season. null => the profile had no season data, so the
  // caller preserves the existing handles rather than wiping them.
  const links = newest
    ? {
        steamName: newest.platformNames?.steam || '',
        psnName: newest.platformNames?.psn || '',
        xboxName: newest.platformNames?.xbox || '',
      }
    : null;

  if (!canonical || canonical.toLowerCase() === (fav.name || '').toLowerCase()) {
    return { attempted: true, rename: null, suspectedBan: bannedLatest, banSeasonId: newest?.seasonId, links };
  }

  return { attempted: true, rename: { name: canonical }, suspectedBan: false, links };
};

const NoResultsMessage = ({ selectedSeason, onSeasonChange, inFavourites, onExitFavourites }) => (
  <div className="p-6 text-center text-gray-400">
    {inFavourites ? (
      <span>
        None of your favourites match your search.<br />
        <span
          className="text-blue-400 cursor-pointer hover:underline"
          onClick={onExitFavourites}
        >
          Search all of {SEASONS[selectedSeason]?.label || selectedSeason}
        </span> instead.
      </span>
    ) : selectedSeason === 'ALL' ? (
      'No results found for your search query.'
    ) : (
      <span>
        No results found in {SEASONS[selectedSeason]?.label || selectedSeason}.<br />
        Switch the season filter to <span
          className="text-blue-400 cursor-pointer hover:underline"
          onClick={() => onSeasonChange('ALL')}
        >
          All Seasons
        </span> for older seasons.
      </span>
    )}
  </div>
);

const RankChangeDisplay = ({ change }) => {
  if (!change || change === 0) return null;
  
  const isPositive = change > 0;
  return (
    <div className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
      <span className="text-sm">{Math.abs(change).toLocaleString()}</span>
      {isPositive ? (
        <ChevronUp className="w-4 h-4" />
      ) : (
        <ChevronDown className="w-4 h-4" />
      )}
    </div>
  );
};

const RubyCutoffIndicator = ({ cutoff, onCutoffClick }) => {
  if (!cutoff) return null;

  return (
    <div 
      className={`fixed top-14 md:top-16 left-4 md:left-6 z-30 bg-gray-800/95 shadow-lg px-3 py-1.5 rounded-full border border-red-500/20 backdrop-blur-xs cursor-pointer hover:border-red-500/40 transition-colors`}
      onClick={onCutoffClick}
    >
      <div className="flex items-center gap-2 select-none">
        <Hexagon className={'w-3 h-3 text-red-600 animate-pulse'} />
        <span className="text-red-400 text-sm font-medium">
          {cutoff.toLocaleString()} RS
        </span>
      </div>
    </div>
  );
};

const PlayerRow = ({ player, onSearchClick, onClubClick, onGraphClick, isMobile, selectedSeason, isFavourite, addFavourite, removeFavourite }) => {
  const [username, discriminator] = player.name.split('#');
  const { isHolding, holdProps, ref } = useOnHold(() => {
    if (isFavourite(player)) {
      removeFavourite(player);
    } else {
      addFavourite(player);
    }
  });

  const isGraphableSeason = selectedSeason === 'ALL'
    ? SEASONS[player.season]?.isGraphable
    : SEASONS[selectedSeason]?.isGraphable;

  const seasonToGraph = selectedSeason === 'ALL' ? player.season : selectedSeason;
  const isCurrentSeason = SEASONS[seasonToGraph]?.isCurrent;

  const isFav = isFavourite(player);
  const animationClasses = isCurrentSeason && isMobile && isHolding
    ? isFav
      ? 'animate-unfavourite-fill'
      : 'animate-favourite-fill'
    : '';

  const getBackgroundClass = () => {
    if (!isCurrentSeason) return '';
    if (player.suspectedBan) return 'bg-red-950/70!';
    if (player.notFound) return 'bg-red-900/50!';
    if (isFav) return 'bg-yellow-600/20!';
    return '';
  };

  const banBadge = player.suspectedBan ? (
    <span
      title={`Suspected ban${player.suspectedBanSeasonId ? ` · last seen S${player.suspectedBanSeasonId}` : ''}. They left the leaderboard with ban-shaped activity. Remove this favourite, or wait — it clears if they reappear (a rename or an unban).`}
      className="inline-flex shrink-0"
    >
      <Gavel className="w-4 h-4 text-red-400" />
    </span>
  ) : null;

  // Desktop Favourite button handler
  const handleFavouriteClick = () => {
    if (isFav) {
      removeFavourite(player);
    } else {
      addFavourite(player);
    }
  };
  
  // Mobile row rendering
  if (isMobile) {
    return (
      <div 
        ref={isCurrentSeason ? ref : null} className={`player-row flex flex-col gap-2 p-4 border-b border-gray-700 bg-gray-800 rounded-lg shadow-xs active:bg-gray-750 
          active:scale-[0.99] transition-all duration-150 ease-in-out ${getBackgroundClass()} ${animationClasses}`}
        {...(isCurrentSeason ? holdProps : {})}
        >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-gray-300 font-bold w-24">
              {selectedSeason === 'ALL' ? 
                SEASONS[player.season]?.label : 
                `#${player.rank.toLocaleString()}`
              }
            </span>
            {selectedSeason === 'ALL' ? (
              <span className="flex items-center gap-1 text-gray-400 text-sm">#{player.rank.toLocaleString()}</span>
            ) : (
              <RankChangeDisplay change={player.change} />
            )}
          </div>
          {isGraphableSeason ? (() => {
            const graphHref = buildGraphHref(player.name, seasonToGraph);
            return graphHref ? (
              <Link
                to={graphHref}
                onClick={(e) => { e.preventDefault(); onGraphClick(player.name, seasonToGraph); }}
                aria-label={`View graph for ${player.name}`}
              >
                <LineChart className="w-5 h-5 text-gray-400 hover:text-blue-400 cursor-pointer" />
              </Link>
            ) : (
              <LineChart
                className="w-5 h-5 text-gray-400 hover:text-blue-400 cursor-pointer"
                onClick={() => onGraphClick(player.name, seasonToGraph)}
              />
            );
          })() : (
            <span title="Not available for this season">
              <LineChart className="w-5 h-5 text-gray-500/60 mx-auto cursor-not-allowed" />
            </span>
          )}
        </div>
        <div className="flex justify-between items-start">
          <div className="flex flex-col min-w-0 flex-1 mr-3">
            <div className="flex flex-col">
              {player.clubTag && (
                <Link
                  to={buildClubSearchHref(player.clubTag, selectedSeason)}
                  onClick={(e) => { e.preventDefault(); onClubClick(player.clubTag); }}
                  className="self-start bg-gray-700 px-1.5 py-0.5 rounded-sm text-blue-400 hover:text-blue-300 cursor-pointer mb-1"
                >
                  [{player.clubTag}]
                </Link>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-300 truncate">
                  {username}
                  {discriminator && <span className="text-gray-500">#{discriminator}</span>}
                </span>
                {(() => {
                  const historyHref = buildHistoryHref(player.name);
                  return historyHref ? (
                    <Link
                      to={historyHref}
                      onClick={(e) => { e.preventDefault(); onSearchClick(player.name); }}
                      aria-label={`Search history for ${player.name}`}
                      className="shrink-0"
                    >
                      <UserSearch className="w-6 h-6 p-1 text-gray-400 hover:text-blue-400 cursor-pointer rounded-full hover:bg-gray-700 transition-colors" />
                    </Link>
                  ) : (
                    <UserSearch
                      className="shrink-0 w-6 h-6 p-1 text-gray-400 hover:text-blue-400 cursor-pointer rounded-full hover:bg-gray-700 transition-colors"
                      onClick={() => onSearchClick(player.name)}
                    />
                  );
                })()}
                {banBadge}
              </div>
            </div>
            {(player.steamName || player.psnName || player.xboxName) && (
              <div className="text-[11px] text-gray-400 mt-1 flex flex-wrap gap-1.5">
                {player.steamName && (
                  <span className="flex items-center gap-1 bg-gray-700 rounded-sm px-1.5 py-0.5">
                    <PlatformLink platform="steam" name={player.steamName} className="w-3 h-3" />
                    <span className="truncate max-w-30">{player.steamName}</span>
                  </span>
                )}
                {player.psnName && (
                  <span className="flex items-center gap-1 bg-gray-700 rounded-sm px-1.5 py-0.5">
                    <PlatformLink platform="psn" name={player.psnName} className="w-3 h-3" />
                    <span className="truncate max-w-30">{player.psnName}</span>
                  </span>
                )}
                {player.xboxName && (
                  <span className="flex items-center gap-1 bg-gray-700 rounded-sm px-1.5 py-0.5">
                    <PlatformLink platform="xbox" name={player.xboxName} className="w-3 h-3" />
                    <span className="truncate max-w-30">{player.xboxName}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="shrink-0 mt-auto">
            <LeagueDisplay 
              league={player.league}
              score={player.rankScore}
              leagueNumber={player.leagueNumber}
              isMobile={isMobile}
            />
          </div>
        </div>
      </div>
    );
  }
  
  // Desktop row rendering (original)
  return (
    <tr ref={ref} key={player.name} className={`border-t border-gray-700 hover:bg-gray-700 ${getBackgroundClass()}`}>
      <td className="px-4 py-2 text-gray-300 text-start">
        {selectedSeason === 'ALL' ? 
          SEASONS[player.season]?.label : 
          `#${player.rank.toLocaleString()}`
        }
      </td>
      <td className="px-4 py-2 w-24">
        <div className="flex items-center justify-center gap-2">
          {selectedSeason === 'ALL' ? (
            <span className="flex items-center gap-1 text-gray-400 text-sm">#{player.rank.toLocaleString()}</span>
          ) : isCurrentSeason ? (
            <RankChangeDisplay change={player.change} />
          ) : (
            <span title="Disabled for historical seasons">
              <X className="w-4 h-4 text-gray-500 mx-auto" />
            </span>
          )}
        </div>
      </td>
      <td className="py-2 pr-0 pl-2 w-8">
        {isCurrentSeason ? (
          <button 
            onClick={handleFavouriteClick}
            className="hover:scale-110 transition-transform flex items-center justify-center"
          >
            {isFav ? (
              <span title="Remove player from favourites">
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              </span>
            ) : (
              <span title="Add player to favourites">
                <Star className="w-5 h-5 text-gray-400 hover:text-yellow-500" />
              </span>
            )}
          </button>
        ) : (
          <span title="Disabled for historical seasons">
            <StarOff className="w-5 h-5 text-gray-500/60 mx-auto cursor-not-allowed" />
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            {player.clubTag ? (
              <span className="text-gray-300">
                <Link
                  to={buildClubSearchHref(player.clubTag, selectedSeason)}
                  onClick={(e) => { e.preventDefault(); onClubClick(player.clubTag); }}
                  className="bg-gray-700 px-1 py-0.5 rounded-sm text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  [{player.clubTag}]
                </Link>
                {` ${username}`}
                {discriminator && <span className="text-gray-500">#{discriminator}</span>}
              </span>
            ) : (
              <span className="text-gray-300">
                {username}
                {discriminator && <span className="text-gray-500">#{discriminator}</span>}
              </span>
            )}
            {(() => {
              const historyHref = buildHistoryHref(player.name);
              return historyHref ? (
                <Link
                  to={historyHref}
                  onClick={(e) => { e.preventDefault(); onSearchClick(player.name); }}
                  aria-label={`Search history for ${player.name}`}
                  className="inline-flex"
                >
                  <UserSearch className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer" />
                </Link>
              ) : (
                <UserSearch
                  className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer"
                  onClick={() => onSearchClick(player.name)}
                />
              );
            })()}
            {banBadge}
          </div>
          {(player.steamName || player.psnName || player.xboxName) && (
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-3">
              {player.steamName && (
                <span className="flex items-center">
                  <PlatformLink platform="steam" name={player.steamName} />
                  {player.steamName}
                </span>
              )}
              {player.psnName && (
                <span className="flex items-center">
                  <PlatformLink platform="psn" name={player.psnName} />
                  {player.psnName}
                </span>
              )}
              {player.xboxName && (
                <span className="flex items-center">
                  <PlatformLink platform="xbox" name={player.xboxName} />
                  {player.xboxName}
                </span>
              )}
            </div>
          )}
        </div>
      </td>
      <LeagueDisplay 
        league={player.league} 
        score={player.rankScore} 
        leagueNumber={player.leagueNumber}
        isMobile={isMobile}
      />
      <td className="px-4 py-2 text-center">
        {isGraphableSeason ? (() => {
          const graphHref = buildGraphHref(player.name, seasonToGraph);
          return graphHref ? (
            <Link
              to={graphHref}
              onClick={(e) => { e.preventDefault(); onGraphClick(player.name, seasonToGraph); }}
              aria-label={`View graph for ${player.name}`}
              className="inline-flex mx-auto"
            >
              <LineChart className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer" />
            </Link>
          ) : (
            <LineChart
              className="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer mx-auto"
              onClick={() => onGraphClick(player.name, seasonToGraph)}
            />
          );
        })() : (
          <span title="Not available for this season">
            <LineChart className="w-4 h-4 text-gray-500/60 mx-auto cursor-not-allowed" />
          </span>
        )}
      </td>
    </tr>
  );
};

const FavouritesButton = ({ favourites, selectedSeason, currentSeason, showFavourites, setShowFavourites, showToast, isMobile }) => {
  const hasFavourites = favourites.length > 0;
  const isHistoricalSeason = selectedSeason !== currentSeason;

  const isDisabled = !hasFavourites || isHistoricalSeason;
  const isActive = showFavourites && !isHistoricalSeason;
  const buttonClass = `
    px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 h-10.5
    whitespace-nowrap
    ${isActive ? 'bg-yellow-500 text-yellow-950' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}
    ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
  `;

  // This effect ensures the Favourites view is disabled if the conditions for it are no longer met.
  useEffect(() => {
    if (isHistoricalSeason || !hasFavourites) {
      setShowFavourites(false);
    }
  }, [isHistoricalSeason, hasFavourites, setShowFavourites]);

  const handleClick = () => {
    if (isDisabled) {
      if (isHistoricalSeason) {
        showToast({
          message: 'Favourites are disabled in historical seasons.',
          type: 'warning',
          icon: Star,
          duration: 2000
        });
      } else if (!hasFavourites) {
        showToast({
          title: `No Favourites yet!`,
          message: isMobile
            ? 'Long-press on a player to Favourite them. You can also swipe to switch pages.'
            : 'Click the star next to a player to Favourite them.',
          type: 'info',
          icon: Star,
          duration: 4000
        });
      }
      return;
    }
    
    setShowFavourites(!showFavourites);
  };

  // The button is not truly disabled, allowing the onClick to fire and show a toast.
  return (
    <button
      onClick={handleClick}
      className={buttonClass}
      aria-label={`Toggle Favourites${hasFavourites ? `, ${favourites.length} saved` : ''}`}
    >
      <Star className={`w-5 h-5 ${isActive ? 'fill-current' : ''}`} />
      {hasFavourites && (
        <span className="text-sm font-semibold">{favourites.length}</span>
      )}
    </button>
  );
};

export const GlobalView = ({
  currentSeason,
  selectedSeason,
  setSelectedSeason,
  globalLeaderboard,
  currentRubyCutoff,
  onPlayerSearch,
  onGraphOpen,
  isMobile,
  lastLeaderboardUpdate,
  showFavourites,
  setShowFavourites,
  showToast
}) => {
  const [isCurrentSeason, setIsCurrentSeason] = useState(currentSeason === selectedSeason);
  const { isModalOpen } = useModal();
  const searchInputRef = useRef(null);

  const [crossSeason, setCrossSeason] = useState(() => getStoredGlobalViewSettings().crossSeasonSearch);
  const toggleCrossSeason = () => {
    const next = !crossSeason;
    setCrossSeason(next);
    setStoredGlobalViewSettings({ crossSeasonSearch: next });
    // Turning it on: focus the search bar so suggestions appear straight away
    if (next) searchInputRef.current?.focus();
  };
  const enableCrossSeason = () => {
    setCrossSeason(true);
    setStoredGlobalViewSettings({ crossSeasonSearch: true });
    searchInputRef.current?.focus();
  };
  const autofillActive = crossSeason && !showFavourites;
  const viewContainerRef = useRef(null);
  const {
    favourites,
    addFavourite,
    removeFavourite,
    isFavourite,
    getFavouritesWithFallback,
    computeFreeReconcile,
    applyReconcilePatches,
    selectStaleCandidates,
    commitIdentityResult,
  } = useFavouritesManager();
  
  const { slideDirection, showIndicator } = useSwipe(
    () => currentPage < totalPages && handlePageChange(currentPage + 1),
    () => currentPage > 1 && handlePageChange(currentPage - 1),
    {
      enableIndicator: true,
      onSwipeStart: () => {
        // Optional callback
      },
      onSwipeEnd: () => {
        // Optional callback
      },
      isSwipeActive: !isModalOpen,
      targetRef: viewContainerRef,
    }
  );

  // Live comparison to check if we viewing currentseason
  useEffect(() => {
    setIsCurrentSeason(currentSeason === selectedSeason);
  }, [currentSeason, selectedSeason]);

  // Update the season selection handler. Uses setSelectedSeason's atomic
  // resetPage option so season + page are written in one setSearchParams call.
  // Calling resetPage() separately would race (two hooks, same stale prev).
  const handleSeasonChange = (e) => {
    const newSeason = typeof e === 'string' ? e : e.target.value;
    setSelectedSeason(newSeason, { resetPage: true });
    resetSort();
    
    // Clear search when changing seasons - Don't for now.
    // setSearchQuery('');
  
    // New toast for All Seasons
    if (newSeason === 'ALL') {
      showToast({
        title: 'All Seasons',
        message: 'This mode should only be used for searching purposes.',
        type: 'info',
        duration: 3000
      });
    }
  };

  // Get data based on selected season and memoize it to prevent expensive recalculations
  // when the component re-renders (e.g., when a modal opens).
  const historicalLeaderboard = useMemo(() => {
    if (selectedSeason === 'ALL') {
      return getAllSeasonsLeaderboard(globalLeaderboard).leaderboard;
    }
    if (isCurrentSeason) {
      return globalLeaderboard;
    }
    return getSeasonLeaderboard(selectedSeason).leaderboard;
  }, [selectedSeason, isCurrentSeason, globalLeaderboard]);

  // Disable Favourites when not in current season
  useEffect(() => {
    if (!isCurrentSeason && showFavourites) {
      setShowFavourites(false);
    }
  }, [isCurrentSeason, showFavourites, setShowFavourites]);

  // Define custom sorters to pass to the pagination hook.
  const customSorters = useMemo(() => {
    // Precompute season -> chronological index ONCE
    const seasonRank = new Map(
      Object.entries(SEASONS)
        .filter(([, season]) => season.id !== undefined && !season.isAggregate)
        .sort(([, sA], [, sB]) => sA.id - sB.id)
        .map(([key], index) => [key, index])
    );
    return {
      season: (a, b, direction) => {
        // Unknown seasons fall back to -1
        const comparison = (seasonRank.get(a.season) ?? -1) - (seasonRank.get(b.season) ?? -1);
        return direction === 'asc' ? comparison : -comparison;
      }
    };
  }, []);

  const {
    searchQuery,
    setSearchQuery,
    currentItems,
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    handlePageChange,
    filteredItems,
    sortConfig,
    handleSort,
    scrollToIndex,
    resetSort,
    resetPage,
    buildPageHref,
  } = usePagination(
    (isCurrentSeason && showFavourites)
      ? getFavouritesWithFallback(historicalLeaderboard)
      : historicalLeaderboard,
    isMobile ? 25 : 50,
    isMobile,
    { customSorters, urlSync: true, basePath: '/leaderboard' }
  );

  // Reset to page 1 whenever showFavourites toggles. Without this, switching
  // from page 3 of the full leaderboard into favourites view would leave you
  // on an empty page 3 of your tiny favourites list. Uses a ref-based prev
  // check so the effect is a no-op on first mount (preserves ?page= deep links).
  const prevShowFavouritesRef = useRef(showFavourites);
  useEffect(() => {
    if (prevShowFavouritesRef.current !== showFavourites) {
      prevShowFavouritesRef.current = showFavourites;
      resetPage();
    }
  }, [showFavourites, resetPage]);

  // Favourites self-repair
  // Both effects are lazy: current season only, while the Favourites tab is open, and
  // only with a loaded leaderboard.

  // 1. Free reconcile (sync, no API): heal drifted platform links for favourites still
  //    present under their exact Embark ID, and clear ban/throttle bookkeeping when one
  //    reappears. Idempotent -> converges in <=2 passes, no loop.
  useEffect(() => {
    if (!isCurrentSeason || !showFavourites) return;
    if (!globalLeaderboard?.length) return;
    const patches = computeFreeReconcile(globalLeaderboard);
    if (!patches.length) return;
    applyReconcilePatches(patches);
    for (const p of patches) {
      if (p.banJustCleared) {
        showToast({
          title: 'Back on the board',
          message: `${p.name} is back on the leaderboard.`,
          type: 'success',
          icon: Star,
          duration: 4000,
        });
      }
    }
  }, [isCurrentSeason, showFavourites, globalLeaderboard, favourites, computeFreeReconcile, applyReconcilePatches, showToast]);

  // 2. Identity reconcile for stale (yellow/red) favourites: at most ONE pass per
  //    leaderboard cycle (kills toggle-spam; persisted so a reload can't re-trigger it),
  //    sequential and client-paced to respect the nginx identity rate limit. The effect
  //    keys on the cycle TIMESTAMP (a primitive), not the leaderboard array/object: a
  //    same-cycle no-op refresh yields new refs but the same timestamp, and re-running
  //    would needlessly abort an in-flight pass.
  useEffect(() => {
    if (!isCurrentSeason || !showFavourites) return;
    if (!globalLeaderboard?.length) return;
    const cycleTs = lastLeaderboardUpdate?.timestamp;
    if (!cycleTs) return;
    if (getStoredGlobalViewSettings().lastFavReconcileCycleTs === cycleTs) return;

    const candidates = selectStaleCandidates(globalLeaderboard, Date.now()).slice(0, MAX_PER_PASS);
    if (!candidates.length) return;

    // Claim this cycle up-front (persisted) so a tab toggle / reload can't start a 2nd pass.
    setStoredGlobalViewSettings({ lastFavReconcileCycleTs: cycleTs });

    let cancelled = false;
    (async () => {
      for (let i = 0; i < candidates.length; i++) {
        if (cancelled) return;
        const fav = candidates[i];
        if (i > 0) await sleep(IDENTITY_GAP_MS); // pace under the nginx identity limit
        if (cancelled) return; // bail if the view unmounted during the pacing wait

        let profile;
        try { profile = await fetchIdentity(fav.name); }
        catch { profile = 'offline'; }
        if (cancelled) return;

        const result = interpretIdentity(profile, fav);
        if (result.attempted === false) continue; // offline: leave for next cycle
        const wasBan = !!fav.suspectedBan;
        commitIdentityResult(fav, result);

        if (result.rename) {
          showToast({
            title: 'Favourite renamed',
            message: `${fav.name} is now ${result.rename.name}`,
            type: 'info',
            icon: UserPen,
            duration: 5000,
          });
        } else if (result.suspectedBan && !wasBan) {
          showToast({
            title: 'Suspected ban',
            message: `${fav.name} left the leaderboard with ban-shaped activity.`,
            type: 'warning',
            icon: Gavel,
            duration: 6000,
          });
        } else if (!result.suspectedBan && wasBan) {
          showToast({
            title: 'No longer flagged',
            message: `${fav.name} is no longer flagged as a suspected ban.`,
            type: 'success',
            icon: Star,
            duration: 4000,
          });
        }
      }
    })();
    return () => { cancelled = true; };
    // Depend on the cycle TIMESTAMP, not globalLeaderboard/lastLeaderboardUpdate (whose
    // refs churn within a cycle and would abort the pass). selectStaleCandidates +
    // favourites are omitted too: the per-cycle gate is the re-run guard, and reacting to
    // favourites (which each commit mutates) would cancel the in-flight pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentSeason, showFavourites, lastLeaderboardUpdate?.timestamp, commitIdentityResult, showToast]);

  const handleLocalClubClick = (clubTag) => {
    // Writes ?search=[TAG] to the URL via usePagination's url-synced setter.
    setSearchQuery(`[${clubTag}]`);

    const message = /\d/.test(selectedSeason) 
      ? `Searching in Season ${selectedSeason.slice(1)}.` 
      : `Searching in ${selectedSeason}.`;

    showToast({
      title: `Club Search: ${clubTag}`,
      message: message,
      type: 'info',
      duration: 2500
    });
  };

  const handleCutoffClick = () => {
    setSearchQuery('');

    setTimeout(() => {
      scrollToIndex(500);
    }, 125);
  };

  useEffect(() => {
    if (!searchQuery && searchInputRef.current && !isMobile) {
      searchInputRef.current.focus();
    }
    // Only run on mount-ish: focus when the view opens without a pre-filled search.
    // Re-running on every keystroke would steal focus back from other inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  return (
    <div ref={viewContainerRef}>
      <div className="flex flex-col sm:flex-row gap-2 mb-4 items-stretch sm:items-center">
        <div className="flex-1 relative">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            searchInputRef={searchInputRef}
            scopeActive={autofillActive}
            onScopeToggle={showFavourites ? undefined : toggleCrossSeason}
            scopeTitleOn="Cross-season search is on: suggestions from every season appear as you type. Click to turn off."
            scopeTitleOff="Cross-season search is off: only this list is filtered. Click to also search every season."
            scopeLabel="Toggle cross-season search"
          />
          {autofillActive && (
            <IdentityAutofill
              query={searchQuery}
              inputRef={searchInputRef}
              onSelect={onPlayerSearch}
              currentSeasonData={globalLeaderboard}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <FavouritesButton
            favourites={favourites}
            selectedSeason={selectedSeason}
            currentSeason={currentSeason}
            showFavourites={showFavourites}
            setShowFavourites={setShowFavourites}
            showToast={showToast}
            isMobile={isMobile}
          />
          <div className="relative flex-1 sm:flex-none sm:w-48">
            <select
              value={selectedSeason}
              onChange={handleSeasonChange}
              className={`appearance-none w-full bg-gray-700 text-gray-200 rounded-lg pl-4 pr-10 py-1.5 border cursor-pointer ${
                selectedSeason !== currentSeason ? 'border-blue-500 border-2' : 'border-gray-600'
              } focus:ring-2 focus:ring-blue-500 focus-visible:ring-blue-500 focus-visible:border-blue-500 focus-visible:outline-hidden text-sm h-10.5`}
            >
              {Object.entries(SEASONS).reverse().map(([key, season]) =>
                key !== 'ALL' && (
                  <option key={key} value={key}>{season.label}</option>
                )
              )}
              <option value="ALL">All Seasons</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>
      </div>
      {!showFavourites && isCurrentSeason && currentRubyCutoff && (
        <RubyCutoffIndicator cutoff={currentRubyCutoff} onCutoffClick={handleCutoffClick} />
      )}
      <div className="page-transition-container">
      <div className={`page-content ${slideDirection}`} key={currentPage}>
      <div className="table-container">
      {isMobile ? (
        <div>
          {currentItems.length === 0 ? (
            <NoResultsMessage
              selectedSeason={selectedSeason}
              onSeasonChange={handleSeasonChange}
              inFavourites={isCurrentSeason && showFavourites}
              onExitFavourites={() => setShowFavourites(false)}
            />
          ) : (
            currentItems.map((player, index) => (
              <PlayerRow
                key={`${player.rank}-${player.name}-${index}`}
                player={player}
                onSearchClick={onPlayerSearch}
                onClubClick={handleLocalClubClick}
                onGraphClick={onGraphOpen}
                isMobile={true}
                selectedSeason={selectedSeason}
                isFavourite={isFavourite}
                addFavourite={addFavourite}
                removeFavourite={removeFavourite}
              />
            ))
          )}
        </div>
      ) : (
          <div className="overflow-hidden rounded-lg">
            <table className="w-full min-w-160 rounded-lg">
              <thead>
                <tr className="bg-gray-700">
                  <th className="px-4 py-2 text-center text-gray-300 w-24">
                    <div className="flex items-center justify-center">
                      {selectedSeason === 'ALL' ? 'Season' : 'Rank'}
                      <SortButton
                        field={selectedSeason === 'ALL' ? 'season' : 'rank'}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-2 text-left text-gray-300 w-24">
                    <div className="flex items-center justify-center">
                    {selectedSeason === 'ALL' ? 'Rank' : 'Change'}
                      <SortButton
                        field={selectedSeason === 'ALL' ? 'rank' : 'change'}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    </div>
                  </th>
                  <th className="py-2 pr-0 pl-2 w-8"></th>
                  <th className="px-4 py-2 text-left text-gray-300">
                    <div className="flex items-center">
                      Player
                      <SortButton
                        field="name"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-2 text-center text-gray-300">
                    <div className="flex items-center justify-center">
                      League
                      <SortButton
                        field="score"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-2 text-center text-gray-300">Graph</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan="6">
                      <NoResultsMessage
                        selectedSeason={selectedSeason}
                        onSeasonChange={handleSeasonChange}
                        inFavourites={isCurrentSeason && showFavourites}
                        onExitFavourites={() => setShowFavourites(false)}
                      />
                    </td>
                  </tr>
                ) : (
                  currentItems.map((player, index) => (
                    <PlayerRow 
                      key={`${player.rank}-${player.name}-${index}`}
                      player={player}
                      onSearchClick={onPlayerSearch}
                      onClubClick={handleLocalClubClick}
                      onGraphClick={onGraphOpen}
                      isMobile={false}
                      selectedSeason={selectedSeason}
                      isFavourite={isFavourite}
                      addFavourite={addFavourite}
                      removeFavourite={removeFavourite}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      <div className={`page-number-indicator ${showIndicator ? 'visible' : 'hidden'}`}>
        Page {currentPage}/{totalPages}
      </div>
      </div>
      {searchQuery.trim().length >= 2 && !crossSeason && !showFavourites && (
        <div className="flex justify-center my-3">
          <button
            onClick={enableCrossSeason}
            className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors text-center"
          >
            <Search className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Looking for someone not in this list? <span className="text-gray-300">Search every tracked player</span></span>
          </button>
        </div>
      )}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        startIndex={startIndex}
        endIndex={endIndex}
        totalItems={filteredItems.length}
        onPageChange={handlePageChange}
        buildPageHref={buildPageHref}
      />
      <BackToTop isMobile={isMobile} />
    </div>
  );
};
