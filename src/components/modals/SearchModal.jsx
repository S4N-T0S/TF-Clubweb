import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, ChevronUp, ChevronDown, AlertTriangle, ArrowRight, LineChart, Info, Gavel, Users, ChevronsUpDown, Hash, UserPen, TrendingDown, UserSearch, WifiOff } from 'lucide-react';
import { resolveIdentity, searchAllPlayers, SEASONS } from '../../services/historicalDataService';
import { parseSearchQuery } from '../../utils/searchUtils';
import { Hexagon } from '../icons/Hexagon';
import { PlatformLink } from '../icons/PlatformLink';
import { PlatformIcons } from '../icons/Platforms';
import { getLeagueInfo } from '../../utils/leagueUtils';
import { isValidEmbarkId, formatUsernameForUrl } from '../../utils/urlHandler';
import { useModal } from '../../context/ModalProvider';
import { LoadingDisplay } from '../LoadingDisplay';
import { buildClubSearchHref, buildGraphHref } from '../../utils/modalHrefs';
import { getStoredSearchSettings, setStoredSearchSettings } from '../../services/localStorageManager';
import { renderHighlighted, rankToken, seasonPill, MATCH_VIA_LABELS, tierForSuggestion } from '../search/suggestionHelpers';

// Per-season event tallies surfaced by the identity API, mapped to the same icon +
// colour vocabulary the graph/events use. NAME_CHANGE is intentionally absent:
// renames are shown via the rename arc / the derived rename count.
// /identity gives only COUNTS, not the per-event is_off_leaderboard / ban-resolution
// flags, so each tally links to the graph for the real detail. A SUSPECTED_BAN is
// surfaced prominently (bans should be obvious) but kept worded as "suspected":
// the count can include renames that resemble bans, so the graph is where it is
// confirmed (see the graph's removeRenameResolvedBans guard).
const EVENT_CONFIG = {
  SUSPECTED_BAN: { Icon: Gavel, color: 'text-red-400', label: 'suspected ban' },
  RS_ADJUSTMENT: { Icon: ChevronsUpDown, color: 'text-yellow-400', label: 'RS adjustment' },
  CLUB_CHANGE: { Icon: Users, color: 'text-teal-400', label: 'club change' },
  CLUB_RENAME: { Icon: Hash, color: 'text-indigo-400', label: 'club rename' },
};

// Compact "26 Mar" date for within-season rename timestamps (unix seconds).
const formatShortDate = (unixSeconds) =>
  new Date(unixSeconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// The honest rank line. Rank is never the headline — it is always smaller and
// lower-contrast than the rank score, and it always declares its provenance.
const RankLine = ({ row, season }) => {
  if (!row.rank || row.rank <= 0) {
    return <span className="text-gray-500">rank unavailable this season</span>;
  }
  const isCurrent = !!season?.isCurrent;

  // Genuinely live: the current season AND still in the live top-10k right now.
  if (isCurrent && row.liveTracked !== false) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-gray-400"
        title="Currently in the live top-10k; standings move until the season ends."
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        Currently #{row.rank.toLocaleString()}
      </span>
    );
  }

  // Fell off: a CLOSED season with no final-snapshot standing (left the tracked
  // top-10k before season end), OR the current season but no longer in the live
  // top-10k (the API only holds a stale last-seen rank — e.g. dropped off ages
  // ago). Either way we do NOT know where they finished. If a suspected ban
  // exists that season, the ban badge already explains it, so drop the "fell
  // below top 10k" cause (which implies a gradual slide).
  const fellOff = (isCurrent && row.liveTracked === false) || (!isCurrent && row.rankIsFinal === false);
  if (fellOff) {
    const banned = (row.eventCounts?.SUSPECTED_BAN || 0) > 0;
    return (
      <span
        className="inline-flex items-center gap-1.5 text-amber-400/90"
        title={banned
          ? 'We last saw this player at this position before they left the tracked leaderboard. This is their last seen rank, not a final standing.'
          : 'We last saw this player at this position before they dropped below the tracked top ~10,000. This is their last seen rank, not a final standing.'}
      >
        <TrendingDown className="w-3.5 h-3.5 shrink-0" />
        Last seen #{row.rank.toLocaleString()}{banned ? '' : ' · fell below top 10k'}
      </span>
    );
  }

  return (
    <span className="text-gray-400" title="Final standing from this season's leaderboard snapshot.">
      Final #{row.rank.toLocaleString()}{row.isTop500 ? ' · top 500' : ''}
    </span>
  );
};

const SeasonNode = ({ row, isFirst, isLast, onClubClick, onGraphOpen, profileSeason, expanded, onToggleExpand }) => {
  const season = SEASONS[row.seasonKey];
  const isGraphable = !!season?.isGraphable;
  const { name: leagueName, style } = getLeagueInfo(row.leagueNumber);
  const hasScore = row.score !== undefined && row.score !== null && row.score !== 0;
  const seasonPill = season?.id === 0 ? 'OB' : season ? `S${season.id}` : row.season;
  const graphHref = isGraphable ? buildGraphHref(row.name, row.seasonKey) : null;

  const eventEntries = Object.entries(row.eventCounts || {}).filter(([, c]) => c > 0);
  const banCount = row.eventCounts?.SUSPECTED_BAN || 0;
  // Ban is hoisted into the header (it must be obvious); the rest stay as chips.
  const nonBanEvents = eventEntries.filter(([type]) => type !== 'SUSPECTED_BAN');
  const hasPlatforms = !!(row.steamName || row.psnName || row.xboxName);
  const hasExpandDetail = hasPlatforms || (profileSeason?.nameHistory?.length > 1);

  const single = isFirst && isLast;
  const lineCls = single ? 'hidden' : isFirst ? 'top-3.5 bottom-0' : isLast ? 'top-0 h-3.5' : 'top-0 bottom-0';
  const weakRing = row.supersededByDirectMatch
    ? 'ring-1 ring-red-500/60 bg-red-900/10'
    : row.foundViaSteamName
      ? 'ring-1 ring-yellow-500/50'
      : '';

  return (
    <div className={`grid grid-cols-[2.75rem_1fr] gap-1 rounded-lg ${weakRing ? `${weakRing} px-2 py-1` : ''}`}>
      <div className="relative flex justify-center pt-1">
        <span className={`absolute w-0.5 bg-gray-600 left-1/2 -translate-x-1/2 ${lineCls}`} />
        <Hexagon className={`w-5 h-5 relative z-10 ${row.supersededByDirectMatch ? 'text-gray-600' : style}`} />
      </div>

      <div className="pb-3 min-w-0">
        <div className="flex items-start justify-between gap-3">
          {/* Left: season, club, name, league and the rank provenance line */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-blue-400 text-sm font-medium">{seasonPill}</span>
              {row.clubTag && (
                <Link
                  to={buildClubSearchHref(row.clubTag, row.seasonKey)}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClubClick(row.clubTag, row.seasonKey); }}
                  className="bg-gray-600 px-1.5 py-0.5 rounded-sm text-blue-400 hover:text-blue-300 text-xs shrink-0"
                >
                  [{row.clubTag}]
                </Link>
              )}
              {row.name && row.name !== 'Unknown#0000' && (
                <span className="inline-flex items-center gap-1.5 text-white font-medium min-w-0" title="Embark ID used this season">
                  <PlatformIcons.Embark className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                  <span className="truncate">{row.name}</span>
                </span>
              )}
              {banCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 bg-red-500/15 border border-red-500/40 text-red-300 px-2 py-0.5 rounded text-xs font-medium shrink-0"
                  title="Activity consistent with a ban this season."
                >
                  <Gavel className="w-3.5 h-3.5" />
                  Suspected ban{banCount > 1 ? ` ×${banCount}` : ''}
                </span>
              )}
            </div>

            <div className="text-sm text-gray-300 mt-0.5">{leagueName}</div>

            <div className="text-xs mt-0.5"><RankLine row={row} season={season} /></div>

            {!row.name && row.rank ? (
              <div className="flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs text-red-400">Platform-specific leaderboard rank</span>
              </div>
            ) : null}

            {(row.supersededByDirectMatch || row.foundViaSteamName) && (
              <div className="flex items-start gap-1.5 mt-1.5 text-xs">
                <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-px ${row.supersededByDirectMatch ? 'text-red-400' : 'text-yellow-400'}`} />
                <span className={row.supersededByDirectMatch ? 'text-red-300' : 'text-yellow-300'}>
                  {row.supersededByDirectMatch
                    ? 'May be a different player: this Embark ID was directly confirmed in the surrounding seasons, so this season was likely someone else.'
                    : 'Linked only by a shared Steam name, which is not unique, so this could be a different player.'}
                </span>
              </div>
            )}
          </div>

          {/* Right: rank score and the per-season controls */}
          <div className="shrink-0 text-right">
            {season?.hasRankScore === false ? (
              <div className="text-xs text-gray-500">No rank score</div>
            ) : hasScore ? (
              <div className="text-lg font-medium text-white leading-tight">
                {row.score.toLocaleString()}<span className="text-xs text-gray-400 font-normal"> RS</span>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2 mt-1.5">
              {graphHref && (
                <Link
                  to={graphHref}
                  onClick={(e) => { e.preventDefault(); onGraphOpen(row.name, row.seasonKey); }}
                  aria-label={`View graph for ${row.name} in ${season?.label}`}
                  className="-m-1 p-1"
                >
                  <LineChart className="w-5 h-5 text-gray-400 hover:text-blue-400 cursor-pointer" />
                </Link>
              )}
              {hasExpandDetail && (
                <button
                  onClick={onToggleExpand}
                  aria-label={expanded ? 'Hide season detail' : 'Show season detail'}
                  className="-m-1 p-1 text-gray-400 hover:text-gray-200"
                >
                  {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>
        </div>

        {(nonBanEvents.length > 0 || row.nameChangeCount > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {row.nameChangeCount > 0 && (
              <button
                onClick={onToggleExpand}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-sm bg-gray-700 text-gray-300 hover:bg-gray-600"
                title="Show the names used this season"
              >
                <UserPen className="w-3 h-3 text-indigo-400" />
                {row.nameChangeCount} rename{row.nameChangeCount === 1 ? '' : 's'}
              </button>
            )}
            {nonBanEvents.map(([type, count]) => {
              const cfg = EVENT_CONFIG[type] || { Icon: Info, color: 'text-gray-400', label: type.toLowerCase().replace(/_/g, ' ') };
              const Icon = cfg.Icon;
              return (
                <span
                  key={type}
                  title="Open the season graph for detail."
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-sm bg-gray-700 text-gray-300"
                >
                  <Icon className={`w-3 h-3 ${cfg.color}`} />
                  {count} {cfg.label}{count === 1 ? '' : 's'}
                </span>
              );
            })}
          </div>
        )}

        {expanded && (
          <div className="mt-2 pt-2 border-t border-gray-600 space-y-2">
            {hasPlatforms ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-300">
                {row.steamName && (
                  <span className="flex items-center"><PlatformLink platform="steam" name={row.steamName} />{row.steamName}</span>
                )}
                {row.psnName && (
                  <span className="flex items-center"><PlatformLink platform="psn" name={row.psnName} />{row.psnName}</span>
                )}
                {row.xboxName && (
                  <span className="flex items-center"><PlatformLink platform="xbox" name={row.xboxName} />{row.xboxName}</span>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">No linked platforms recorded this season.</p>
            )}
            {profileSeason?.nameHistory?.length > 1 && (
              <div className="text-xs">
                <div className="text-gray-500 mb-1">Name changes this season</div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  {profileSeason.nameHistory.map((h, idx) => (
                    <span key={`${h.name}-${idx}`} className="inline-flex items-center gap-1.5">
                      {idx > 0 && <ArrowRight className="w-3 h-3 text-gray-600 shrink-0" />}
                      <span className="text-gray-300">{h.name}</span>
                      {idx > 0 && h.start ? <span className="text-gray-500">{formatShortDate(h.start)}</span> : null}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// The profile-level header. States identity ONCE so season rows never repeat it.
const IdentityHero = ({ hero, onClubClick }) => (
  <div className="mb-4">
    <div className="flex items-center gap-2 flex-wrap">
      {hero.latestClub && (
        <Link
          to={buildClubSearchHref(hero.latestClub.tag, hero.latestClub.seasonKey)}
          onClick={(e) => { e.preventDefault(); onClubClick(hero.latestClub.tag, hero.latestClub.seasonKey); }}
          className="bg-gray-700 px-2 py-0.5 rounded-sm text-blue-400 hover:text-blue-300 text-base shrink-0"
        >
          [{hero.latestClub.tag}]
        </Link>
      )}
      <h1 className="text-2xl font-bold text-white wrap-break-word leading-tight min-w-0">{hero.embarkId}</h1>
    </div>

    <div className="grid grid-cols-3 gap-2 mt-3">
      <div className="bg-gray-700 rounded-lg px-3 py-2 min-w-0">
        <div className="text-xs text-gray-400">Peak league</div>
        <div className="text-base sm:text-lg font-medium text-white truncate flex items-center gap-1.5">
          {hero.peakLeague
            ? <><Hexagon className={`w-5 h-5 ${getLeagueInfo(hero.peakLeague.leagueNumber).style}`} /><span className="truncate">{hero.peakLeague.name}</span></>
            : <span className="text-gray-500 text-sm">Unranked</span>}
        </div>
        {hero.peakLeague?.seasonLabel && <div className="text-[11px] text-gray-500 truncate">{hero.peakLeague.seasonLabel}</div>}
      </div>
      <div className="bg-gray-700 rounded-lg px-3 py-2 min-w-0">
        <div className="text-xs text-gray-400 flex items-center gap-1">
          Best position
          <span title="Embark only publishes the top ~10,000, so this is a floor, not a ceiling."><Info className="w-3 h-3 text-gray-500" /></span>
        </div>
        <div className="text-base sm:text-lg font-medium text-gray-100 truncate">
          {hero.peakRank ? `#${hero.peakRank.rank.toLocaleString()}` : <span className="text-gray-500 text-sm">Not ranked</span>}
        </div>
        {hero.peakRank?.seasonLabel && <div className="text-[11px] text-gray-500 truncate">{hero.peakRank.seasonLabel}</div>}
      </div>
      <div className="bg-gray-700 rounded-lg px-3 py-2 min-w-0">
        <div className="text-xs text-gray-400">Seasons tracked</div>
        <div className="text-base sm:text-lg font-medium text-white">{hero.seasonsPlayed}</div>
      </div>
    </div>

    {hero.platformChips.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-3">
        {[...hero.platformChips].sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0)).map(({ platform, name, current }, i) => (
          <span
            key={`${platform}-${name}-${i}`}
            title={current ? 'Current handle' : 'Previously used handle'}
            className={`flex items-center bg-gray-700 rounded-sm px-2 py-0.5 text-sm ${current ? 'text-gray-300' : 'text-gray-500 opacity-70'}`}
          >
            <PlatformLink platform={platform} name={name} className="w-3.5 h-3.5" />
            {name}
          </span>
        ))}
      </div>
    )}
  </div>
);

const SearchModal = ({ isOpen, onClose, initialSearch, currentSeasonData, onSearch, isMobile, onClubClick, onGraphOpen, isLeaderboardLoading, isCovered }) => {
  const { modalRef, isActive, requestClose } = useModal(isOpen, onClose);
  const [searchState, setSearchState] = useState({
    query: '',
    loadedQuery: '', // the query whose profile is currently shown (suppresses autofill)
    results: [],
    profile: null,
    isSearching: false,
    error: '',
    isOffline: false, // the shown profile came from the bundled-only "offline" resolve
  });
  const [hideSuperseded, setHideSuperseded] = useState(() => getStoredSearchSettings().hideSupersededMatches);
  const [expandedIndices, setExpandedIndices] = useState(() => new Set());
  const inputRef = useRef(null);

  // Result-card suggestions shown IN the modal body (not a dropdown) while the
  // user is typing a query that hasn't been opened into a profile yet.
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const suggestTimerRef = useRef(null);
  const latestSuggestQueryRef = useRef('');

  // Used to prevent re-running search on same prop; key change handles full reset.
  const [hasProcessedInitial, setHasProcessedInitial] = useState(false);

  const toggleSuperseded = () => {
    // Filtering superseded rows in/out changes displayRows' length, which would
    // shift the positional expanded indices onto the wrong nodes; close all panels.
    setExpandedIndices(new Set());
    setHideSuperseded((prev) => {
      const next = !prev;
      setStoredSearchSettings({ hideSupersededMatches: next });
      return next;
    });
  };

  const handleSearch = useCallback(async (queryInput, skipUrlUpdate = false) => {
    const query = queryInput.trim();

    if (!isValidEmbarkId(query)) {
      setSearchState((prev) => ({
        ...prev,
        error: 'Please enter a valid Embark ID (must include # followed by 4 numbers)',
        isSearching: false,
      }));
      return;
    }

    // Mark this query as the loaded one up-front so the autofill suppresses itself
    // for it immediately (no dropdown flash while the profile loads or after a pick).
    setSearchState((prev) => ({ ...prev, isSearching: true, error: '', loadedQuery: query }));
    setExpandedIndices(new Set());

    try {
      // Resolve the full cross-season identity. A single /identity call can be
      // incomplete: when the backend failed to backlink a rename it returns only a
      // season-only cluster. resolveIdentity lets the
      // client BFS bridge clusters via platform names and re-queries the API on the
      // newest discovered alias to pull the forward-linked seasons the first query
      // missed, then combines + merges. Degrades to the pure client BFS if the API
      // has nothing.
      const { profile, results, offline } = await resolveIdentity(query, currentSeasonData);

      setSearchState((prev) => ({ ...prev, results, profile, isSearching: false, query, isOffline: offline }));

      if (!skipUrlUpdate) {
        onSearch(formatUsernameForUrl(query));
      }
    } catch {
      setSearchState((prev) => ({ ...prev, error: 'Failed to search player history', isSearching: false }));
    }
  }, [currentSeasonData, onSearch]);

  const handleInputChange = (e) => {
    setSearchState((prev) => ({ ...prev, query: e.target.value, error: '' }));
  };

  const handleSelectSuggestion = useCallback((name) => {
    setSearchState((prev) => ({ ...prev, query: name }));
    handleSearch(name);
  }, [handleSearch]);

  // "Old mode": resolve purely from the bundled static JSON (no API). Offered as a
  // retry when the live lookup fails (no connection / server down).
  const handleOfflineSearch = useCallback(async () => {
    const query = searchState.query.trim();
    if (!isValidEmbarkId(query)) {
      setSearchState((prev) => ({ ...prev, error: 'Please enter a valid Embark ID (must include # followed by 4 numbers)' }));
      return;
    }
    setSearchState((prev) => ({ ...prev, isSearching: true, error: '', loadedQuery: query }));
    setExpandedIndices(new Set());
    try {
      const { profile, results, offline } = await resolveIdentity(query, currentSeasonData, { offline: true });
      setSearchState((prev) => ({ ...prev, results, profile, isSearching: false, query, isOffline: offline }));
    } catch {
      setSearchState((prev) => ({ ...prev, error: 'Offline search failed', isSearching: false }));
    }
  }, [searchState.query, currentSeasonData]);

  useEffect(() => {
    if (isOpen && initialSearch && !hasProcessedInitial) {
      // Wait if the leaderboard is still loading; the effect re-runs when it ends.
      if (isLeaderboardLoading) {
        setSearchState((prev) => ({ ...prev, query: initialSearch }));
        return;
      }
      setHasProcessedInitial(true);
      setSearchState((prev) => ({ ...prev, query: initialSearch }));
      handleSearch(initialSearch, true); // true = skip URL update
    }
  }, [isOpen, initialSearch, handleSearch, isLeaderboardLoading, hasProcessedInitial]);

  // Map the raw profile's seasons by season id so a node can show that season's
  // nameHistory on expand (the merged rows only keep a derived rename count).
  const profileSeasonsById = useMemo(() => {
    const m = new Map();
    if (searchState.profile?.seasons) {
      for (const s of searchState.profile.seasons) m.set(s.seasonId, s);
    }
    return m;
  }, [searchState.profile]);

  // The hero. Prefers the API profile (aggregate, oldestAlias, platformAliases);
  // when there is none (OB-S4-only players, or the API was down) it derives every
  // field from the trusted client-BFS rows so the header still works.
  const heroData = useMemo(() => {
    const results = searchState.results;
    if (!results || results.length === 0) return null;

    const trusted = results.filter((r) => !r.supersededByDirectMatch);
    const base = trusted.length ? trusted : results;

    // Peaks, season count and latest club ALWAYS derive from the displayed rows so
    // the hero matches the timeline — important now that a profile can be stitched
    // from several clusters whose per-cluster aggregates would disagree.
    // Peak position and peak LEAGUE (not peak rank score: pre-S3/S4 used a totally
    // different score scale — thousands — so a max rank score is meaningless; the
    // league/division is the only signal comparable across every season).
    let peakRank = null;
    let peakLeague = null;
    for (const r of base) {
      if (r.rank && r.rank > 0 && (!peakRank || r.rank < peakRank.rank)) {
        peakRank = { rank: r.rank, seasonLabel: SEASONS[r.seasonKey]?.label };
      }
      const ln = r.leagueNumber;
      if (typeof ln === 'number' && ln > 0) {
        const better = !peakLeague
          || ln > peakLeague.leagueNumber
          || (ln === peakLeague.leagueNumber && r.rank && (!peakLeague.rank || r.rank < peakLeague.rank));
        if (better) peakLeague = { leagueNumber: ln, name: getLeagueInfo(ln).name, seasonLabel: SEASONS[r.seasonKey]?.label, rank: r.rank || null };
      }
    }
    const seasonsPlayed = new Set(base.map((r) => r.seasonKey)).size;
    const latestClubRow = [...base].reverse().find((r) => r.clubTag);
    const latestClub = latestClubRow ? { tag: latestClubRow.clubTag, seasonKey: latestClubRow.seasonKey } : null;

    // The newest season's platform names are the player's CURRENT handles; any
    // other alias is a previous one (dimmed in the hero so it's clear which is live).
    const newestRow = base[base.length - 1];
    const currentPlat = {
      steam: newestRow?.steamName || null,
      psn: newestRow?.psnName || null,
      xbox: newestRow?.xboxName || null,
    };
    const chips = [];
    const seen = new Set();
    const addChips = (platform, names) => {
      for (const n of names) {
        const k = `${platform}:${n}`;
        if (n && !seen.has(k)) { seen.add(k); chips.push({ platform, name: n, current: n === currentPlat[platform] }); }
      }
    };

    const profile = searchState.profile;
    if (profile) {
      const pa = profile.platformAliases || {};
      addChips('steam', pa.steam || []);
      addChips('psn', pa.psn || []);
      addChips('xbox', pa.xbox || []);
      // Fall back to row-derived aliases if the profile carried none.
      if (chips.length === 0) {
        addChips('steam', [...new Set(base.map((r) => r.steamName).filter(Boolean))]);
        addChips('psn', [...new Set(base.map((r) => r.psnName).filter(Boolean))]);
        addChips('xbox', [...new Set(base.map((r) => r.xboxName).filter(Boolean))]);
      }
      return {
        embarkId: profile.embarkId || base[base.length - 1]?.name || searchState.query,
        oldestAlias: profile.oldestAlias,
        seasonsPlayed,
        peakLeague,
        peakRank,
        latestClub,
        platformChips: chips,
      };
    }

    // Degraded path (no API profile): everything from the client BFS rows.
    addChips('steam', [...new Set(base.map((r) => r.steamName).filter(Boolean))]);
    addChips('psn', [...new Set(base.map((r) => r.psnName).filter(Boolean))]);
    addChips('xbox', [...new Set(base.map((r) => r.xboxName).filter(Boolean))]);
    const newest = [...base].reverse().find((r) => r.name && r.name !== 'Unknown#0000');
    const oldest = base.find((r) => r.name && r.name !== 'Unknown#0000');
    return {
      embarkId: newest?.name || searchState.query,
      oldestAlias: oldest?.name,
      seasonsPlayed,
      peakLeague,
      peakRank,
      latestClub,
      platformChips: chips,
    };
  }, [searchState.results, searchState.profile, searchState.query]);

  // While the user types a query that isn't the currently-opened one, fetch the
  // matching players and show them as result cards in the body (replacing the old
  // dropdown). Skipped during an active resolve and once a query is "opened".
  useEffect(() => {
    const q = searchState.query.trim();
    const onLoaded = !!searchState.loadedQuery.trim() && q === searchState.loadedQuery.trim();
    if (searchState.isSearching || onLoaded || q.length < 2) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    setSuggestLoading(true);
    suggestTimerRef.current = setTimeout(async () => {
      latestSuggestQueryRef.current = q;
      const res = await searchAllPlayers(q, currentSeasonData, 12);
      if (latestSuggestQueryRef.current !== q) return; // user kept typing
      setSuggestions(res);
      setSuggestLoading(false);
    }, 200);
    return () => { if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current); };
  }, [searchState.query, searchState.loadedQuery, searchState.isSearching, currentSeasonData]);

  if (!isOpen) return null;

  const supersededCount = searchState.results.filter((r) => r.supersededByDirectMatch).length;
  const visibleResults = hideSuperseded
    ? searchState.results.filter((r) => !r.supersededByDirectMatch)
    : searchState.results;
  // Newest season first (merged rows arrive ascending by season id).
  const displayRows = [...visibleResults].reverse();

  // Body mode. The input value (query) drives it: when it matches the opened
  // query we show that profile (or a "no records" note); otherwise we're in
  // search mode and show result cards for what's being typed.
  const trimmedQ = searchState.query.trim();
  const loadedQ = searchState.loadedQuery.trim();
  const onLoadedQuery = !!loadedQ && trimmedQ === loadedQ;
  const hasProfile = searchState.results.length > 0;
  const showProfile = onLoadedQuery && hasProfile;
  const showNoRecords = onLoadedQuery && !hasProfile;
  const showCards = !onLoadedQuery && trimmedQ.length >= 2;
  const showHelp = !onLoadedQuery && trimmedQ.length < 2;
  const cardMatchTerm = parseSearchQuery(trimmedQ).nameQuery || trimmedQ;
  const isBusy = searchState.isSearching || (isLeaderboardLoading && initialSearch && !hasProfile);

  return (
    <div className={`modal-overlay ${isActive ? 'is-active' : ''} fixed inset-0 bg-black/75 items-center justify-center z-50 p-4 ${isCovered ? 'hidden' : 'flex'}`}>
      <div
        ref={modalRef}
        className={`modal-box bg-gray-900 rounded-lg border border-white/10 w-full flex flex-col shadow-2xl overflow-hidden relative
          ${isMobile ? 'max-w-[95dvw] h-[90dvh]' : 'max-w-[60dvw] h-[85dvh]'}`}
      >
        {/* Header band */}
        <header className="shrink-0 bg-gray-800 p-3 sm:p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserSearch className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
            <h2 className="text-lg sm:text-xl font-bold text-white">Player history</h2>
          </div>
          <button
            onClick={requestClose}
            title="Close search"
            aria-label="Close search"
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Search band */}
        <div className="shrink-0 p-3 sm:p-4 bg-gray-800 border-b border-gray-700">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={searchState.query}
                disabled={isLeaderboardLoading}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  if (suggestions.length > 0) handleSelectSuggestion(suggestions[0].name);
                  else handleSearch(searchState.query);
                }}
                placeholder="Search any name, club or platform, or enter an Embark ID"
                autoComplete="off"
                className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white
                  ${searchState.error ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'}
                  ${isMobile ? 'text-base' : ''}`}
              />
            </div>
            <button
              onClick={() => handleSearch(searchState.query)}
              disabled={searchState.isSearching || isLeaderboardLoading}
              title="Search"
              aria-label="Search"
              className="px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
            >
              <Search className={`w-5 h-5 ${searchState.isSearching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {searchState.error && (
            <div className="mt-3 p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400">
              <div>{searchState.error}</div>
              {isValidEmbarkId(searchState.query.trim()) && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    onClick={() => handleSearch(searchState.query)}
                    className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200"
                  >
                    Retry
                  </button>
                  <button
                    onClick={handleOfflineSearch}
                    className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200"
                  >
                    Search offline (history only)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="grow overflow-y-auto min-h-0 p-3 sm:p-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
          {searchState.isOffline && !isBusy && (
            <div className="mb-3 flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-sm">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Operating offline. Showing bundled top 10k finishes only; live ranks and cross-season identity links may be incomplete.</span>
            </div>
          )}
          {isBusy ? (
            <div className="h-full min-h-37.5 flex items-center justify-center">
              <LoadingDisplay variant="component" />
            </div>
          ) : showProfile ? (
            <>
              {heroData && <IdentityHero hero={heroData} onClubClick={onClubClick} />}

              {supersededCount > 0 && (
                <div className="mb-3 p-3 bg-gray-800 rounded-lg flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm text-gray-300">
                    {hideSuperseded
                      ? `Hiding ${supersededCount} likely-unrelated match${supersededCount === 1 ? '' : 'es'} from seasons where this Embark ID was directly confirmed.`
                      : `Showing ${supersededCount} likely-unrelated match${supersededCount === 1 ? '' : 'es'} (red outline).`}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={hideSuperseded} onChange={toggleSuperseded} className="w-4 h-4 cursor-pointer" />
                    <span className="text-sm text-gray-300">Smart filter</span>
                  </label>
                </div>
              )}

              {displayRows.length > 0 && (
                <div className="flex flex-col">
                  {displayRows.map((row, i) => (
                    <SeasonNode
                      key={`${row.seasonKey}-${row.name}-${i}`}
                      row={row}
                      isFirst={i === 0}
                      isLast={i === displayRows.length - 1}
                      onClubClick={onClubClick}
                      onGraphOpen={onGraphOpen}
                      profileSeason={profileSeasonsById.get(SEASONS[row.seasonKey]?.id)}
                      expanded={expandedIndices.has(i)}
                      onToggleExpand={() => setExpandedIndices((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })}
                    />
                  ))}
                </div>
              )}
            </>
          ) : showNoRecords ? (
            <div className="p-6 text-center text-gray-400">
              <p className="text-gray-300 mb-1">No tracked records found for &ldquo;{searchState.loadedQuery}&rdquo;.</p>
              <p className="text-sm">This player may never have reached the tracked top ~10,000, or they use a different Embark ID. Try one of their other aliases.</p>
            </div>
          ) : showCards ? (
            suggestions.length > 0 ? (
              <div className="flex flex-col gap-2">
                {suggestions.map((s, i) => {
                  const tier = tierForSuggestion(s);
                  return (
                    <button
                      key={`${s.name}-${i}`}
                      onClick={() => handleSelectSuggestion(s.name)}
                      className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-3 flex items-center justify-between gap-3 border border-gray-700/60 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="text-white font-medium truncate block">{renderHighlighted(s.name, cardMatchTerm)}</span>
                        {s.matchedVia && s.matchedVia !== 'embark' && s.matchedValue && (
                          <span className="text-xs text-gray-400 truncate block">
                            {MATCH_VIA_LABELS[s.matchedVia] || s.matchedVia}: {renderHighlighted(s.matchedValue, cardMatchTerm)}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 text-gray-400 text-sm whitespace-nowrap shrink-0">
                        {seasonPill(s.latestSeasonId)}
                        {tier && (
                          <span title={tier.name} className="inline-flex">
                            <Hexagon className={`w-3.5 h-3.5 ${tier.textColor}`} />
                            <span className="sr-only">{tier.name}</span>
                          </span>
                        )}
                        {rankToken(s)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : suggestLoading ? (
              <div className="h-full min-h-37.5 flex items-center justify-center">
                <LoadingDisplay variant="component" />
              </div>
            ) : (
              <div className="p-6 text-center text-gray-400">
                No players found matching &ldquo;{trimmedQ}&rdquo;.
              </div>
            )
          ) : showHelp ? (
            <div className="p-4 bg-gray-800 rounded-lg text-gray-300 text-sm">
              Look up a player&rsquo;s full ranked history across every tracked season. Start typing an Embark ID,
              Steam, PSN or Xbox name, or a club tag, then pick a result below. Linked accounts and renames are
              resolved automatically. Records before Season 5 are reconstructed from community leaderboard snapshots.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default memo(SearchModal);
