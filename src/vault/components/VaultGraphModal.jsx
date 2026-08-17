import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronsUpDown, ShieldCheck, Settings, FlaskConical } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { useVaultModal } from '../hooks/useVaultModal';
import { useMobileDetect } from '../../hooks/useMobileDetect';
import { availablePresets, presetWindow, seasonNameEvents, DEFAULT_GRAPH_SETTINGS } from '../lib/rankChart';
import { VaultRankChart } from './VaultRankChart';
import { VaultGraphSettings } from './VaultGraphSettings';
import { VaultMatchModal } from './VaultMatchModal';
import { Badge } from './ui';
import { date, num } from '../lib/format';

// The season's whole rated history as an interactive graph, rebuilt from the
// per-match RankUpdate log in the user's own export. Mirrors the leaderboard's
// GraphModal in layout, but takes the vault's emerald accent and states where
// its numbers came from, so it isn't mistaken for the live graph.
export const VaultGraphModal = ({ season, seasons, onSeasonChange, onClose, nameHistory, tournaments, matchesByTournament, note, settings, onSettingsChange }) => {
  const { isActive } = useVaultModal(onClose);
  const isMobile = useMobileDetect();
  // The preview runs the real pipeline over a fictional export, so the badge has
  // to say so, as the rest of the vault does.
  const { isSample } = useVaultData();
  const [presetKey, setPresetKey] = useState('season');
  // Bumped on every pill press, including a press of the already-active one:
  // otherwise the control a zoomed-in user reaches for to get back to the
  // default view does nothing.
  const [resetNonce, setResetNonce] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [openMatch, setOpenMatch] = useState(null);
  const seasonRef = useRef(null);

  const handlePointClick = (point) => {
    const match = point?.tid ? matchesByTournament?.get(point.tid) : null;
    // A point with no match behind it — a tournament the round log never
    // recorded — does nothing rather than opening an empty card.
    if (!match) return;
    setOpenMatch(match);
  };

  const curve = season.curve;
  const presets = useMemo(() => availablePresets(curve), [curve]);
  const viewWindow = useMemo(() => presetWindow(curve, presetKey), [curve, presetKey]);
  const nameEvents = useMemo(() => seasonNameEvents(nameHistory, curve), [nameHistory, curve]);
  const adjustmentCount = useMemo(() => curve.filter((p) => p.type !== 'NORMAL').length, [curve]);

  // Green gear when something is being hidden, as on the leaderboard.
  const filtersActive = useMemo(
    () => Object.keys(DEFAULT_GRAPH_SETTINGS).some((k) => settings[k] !== DEFAULT_GRAPH_SETTINGS[k]),
    [settings]
  );

  // A new season is a new axis: a carried-over "last 7 days" would frame a
  // stretch of time that meant something else in the season before.
  useEffect(() => {
    setPresetKey('season');
  }, [season.seasonId]);

  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(t);
  }, [showHint]);

  // Both events: touchstart alone misses a desktop click, mousedown alone misses
  // a tap that never becomes one.
  useEffect(() => {
    if (!seasonOpen) return;
    const onDown = (e) => {
      if (seasonRef.current && !seasonRef.current.contains(e.target)) setSeasonOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [seasonOpen]);

  const titleId = `vault-graph-${season.seasonId}`;
  const switchable = seasons.length > 1;
  const ordered = useMemo(() => [...seasons].sort((a, b) => (b.seasonN ?? -1) - (a.seasonN ?? -1)), [seasons]);
  // "Season 11" has room on desktop; the mobile header gets the compact "S11".
  const seasonName = (s) => (s.seasonN != null ? `Season ${s.seasonN}` : s.seasonLabel);

  return createPortal(
    <div
      className={`modal-overlay ${isActive ? 'is-active' : ''} fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-70 p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="absolute inset-0" onClick={onClose} />
      {/* bg-gray-800, not gray-900: the AMOLED theme collapses 900/950 to true
          black, so the panel would vanish into the page there. The two grid rows
          are header and chart, and only the chart row flexes. */}
      <div className="modal-box relative w-full bg-gray-800 border border-white/10 shadow-2xl overflow-hidden grid grid-rows-[auto_1fr] h-full max-w-none rounded-none p-3 gap-3 sm:h-[85dvh] sm:max-w-[80dvw] sm:rounded-lg sm:p-6 sm:gap-4">
        {openMatch && <VaultMatchModal match={openMatch} onClose={() => setOpenMatch(null)} />}

        {showSettings && (
          <VaultGraphSettings
            settings={settings}
            onChange={onSettingsChange}
            onClose={() => setShowSettings(false)}
            nameEventCount={nameEvents.length}
            adjustmentCount={adjustmentCount}
          />
        )}

        <div className={isMobile ? 'flex flex-col gap-2' : 'flex justify-between items-center gap-4'}>
          {/* Left: title, season pill, provenance */}
          <div className={isMobile ? 'w-full min-w-0' : 'min-w-0'}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <h2 id={titleId} className={`font-bold text-white truncate ${isMobile ? 'text-lg' : 'text-xl'}`}>
                  RankScore
                </h2>

                <div ref={seasonRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setSeasonOpen((v) => !v)}
                    disabled={!switchable}
                    aria-expanded={seasonOpen}
                    title={switchable ? 'Switch season' : 'This export has one season of match-by-match history'}
                    className={`flex items-center gap-1.5 bg-gray-700 border border-gray-600 shadow-xs text-emerald-300 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all duration-200 ${
                      switchable ? 'hover:bg-gray-600 hover:border-gray-500 hover:shadow-md hover:-translate-y-px' : 'opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <span>{isMobile ? season.seasonLabel : seasonName(season)}</span>
                    {switchable && <ChevronsUpDown className="w-3 h-3" />}
                  </button>
                  {seasonOpen && (
                    <div className="absolute top-full left-0 mt-2 w-max min-w-full bg-gray-800 border border-gray-600 rounded-md shadow-lg z-20 overflow-hidden max-h-64 overflow-y-auto">
                      {ordered.map((s) => (
                        <button
                          key={s.seasonId}
                          type="button"
                          onClick={() => {
                            setSeasonOpen(false);
                            if (s.seasonId !== season.seasonId) onSeasonChange(s.seasonId);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors flex flex-col items-start ${
                            s.seasonId === season.seasonId ? 'bg-emerald-600 text-white' : 'text-gray-200 hover:bg-gray-700'
                          }`}
                        >
                          <span className="font-medium">{seasonName(s)}</span>
                          {/* s.matches, not curve.length: the curve also holds
                              rollback rows, so counting them here contradicts the
                              "N rated matches" line in the header for the same season. */}
                          <span className={`text-[11px] mt-0.5 ${s.seasonId === season.seasonId ? 'text-emerald-100' : 'text-gray-400'}`}>
                            {num(s.matches)} rated matches
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {isSample ? (
                  <Badge tone="yellow">
                    <FlaskConical className="w-3 h-3" />
                    Sample data
                  </Badge>
                ) : (
                  <Badge tone="emerald">
                    <ShieldCheck className="w-3 h-3" />
                    From your export
                  </Badge>
                )}
              </div>

              {/* Desktop closes by clicking outside; on mobile the sheet is
                  full-bleed, so there's nowhere outside to click and it keeps an X. */}
              {isMobile && (
                <button onClick={onClose} aria-label="Close graph" className="p-2 hover:bg-gray-700 rounded-lg shrink-0">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-400 mt-1">
              <span className="text-gray-300 font-medium">{num(season.matches)} rated matches</span>
              <span className="text-gray-600">•</span>
              <span>
                {date(curve[0].ms)} - {date(curve[curve.length - 1].ms)}
              </span>
              <span className="text-gray-600">•</span>
              <span>{isSample ? 'from a fictional match log' : 'from your match log'}</span>
            </div>
            {/* Rare, but worth the room: it's the one case where the season
                table and this graph end on different numbers. */}
            {note && <p className="hidden sm:block text-[11px] text-gray-500 italic mt-1">{note}</p>}
          </div>

          {/* Right: settings gear + time-range pills */}
          <div className={`relative flex flex-col ${isMobile ? 'w-full' : 'shrink min-w-0'}`}>
            <div className={`flex items-center flex-wrap ${isMobile ? 'w-full justify-between gap-2' : 'justify-end gap-2'}`}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  title="Graph Settings"
                  // Distinct from the dialog it opens, which is labelled "Graph
                  // settings": two nodes sharing one accessible name read as
                  // the same control.
                  aria-label="Open graph settings"
                  className={`p-2 rounded-lg transition-colors ${
                    filtersActive ? 'bg-green-700 text-white hover:bg-green-600' : 'hover:bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
              <div className={`flex gap-2 bg-gray-800 rounded-lg p-1 ${isMobile ? 'flex-1 justify-center' : ''}`}>
                {presets.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      if (p.disabled) return;
                      setPresetKey(p.key);
                      setResetNonce((n) => n + 1);
                    }}
                    disabled={p.disabled}
                    title={p.title}
                    aria-pressed={presetKey === p.key}
                    className={`px-3 py-1 text-sm rounded-md transition-all duration-200 ${
                      presetKey === p.key ? 'bg-emerald-600/90 text-white shadow-xs ring-1 ring-emerald-500/50' : 'text-gray-400'
                    } ${p.disabled ? 'cursor-not-allowed opacity-50' : 'hover:text-white hover:bg-gray-700'} ${isMobile ? 'flex-1' : ''}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* min-h-0/min-w-0: without them the 1fr row takes the canvas's own size
            and the chart grows the modal instead of fitting inside it. */}
        <div className="relative w-full min-h-0 min-w-0">
          <VaultRankChart
            season={season}
            nameEvents={nameEvents}
            tournaments={tournaments}
            settings={settings}
            viewWindow={viewWindow}
            // The season is in the key too: a zoom left over from the season
            // before means nothing on the next one's axis.
            resetKey={`${season.seasonId}:${presetKey}:${resetNonce}`}
            onInteract={() => setShowHint(false)}
            onPointClick={handlePointClick}
            isMobile={isMobile}
          />

          {/* Zoom/pan hint, as on the leaderboard graph. */}
          {showHint && (
            <div
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800/90 text-white px-4 py-2 rounded-lg transition-opacity duration-300 cursor-pointer z-10 animate-fadeIn shadow-lg"
              onClick={() => setShowHint(false)}
              style={{ backdropFilter: 'blur(2px)' }}
            >
              <div className="flex flex-col items-center gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>{isMobile ? 'Pinch to zoom' : 'Mouse wheel to zoom'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                  <span>{isMobile ? 'Touch and drag to pan' : 'Click and drag to pan'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
