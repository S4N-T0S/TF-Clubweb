import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Swords, Trophy, MapPin, ChevronDown, Crosshair, X,
  Sun, Moon, Sunset, CloudFog, CloudLightning, CloudRain, Wind, Snowflake, Sparkles,
} from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Badge, EmptyState, Note, PageJump } from '../components/ui';
import { WeaponFilterModal } from '../components/WeaponFilterModal';
import { Pagination } from '../../components/Pagination';
import { careerModeGroup, CAREER_MODE_GROUPS } from '../lib/gameMeta';
import { resolveWeapon } from '../lib/weapons';
import { num, decimal, duration, dateTime, ordinal, cash } from '../lib/format';

// A small fixed page size so a whole page is visible without scrolling.
const PER_PAGE = 8;
// Reserve height for a full page so short pages (e.g. the last one) don't
// collapse and shift the controls above the list.
const ROW_PX = 78;
// Drop-shadow applied to text that sits over a map photo, for legibility.
const OVER_PHOTO = { textShadow: '0 1px 3px rgba(0,0,0,0.85)' };

const categoryTone = {
  Ranked: 'yellow',
  'World Tour': 'purple',
  Casual: 'blue',
  LTM: 'emerald',
  Other: 'gray',
};

// One recognizable map photo as the card background. `focus` (object-position)
// frames the shot; the dark overlay keeps foreground text legible. `null` src
// just renders nothing (the plain card shows).
const MapBg = ({ src, focus = '50% 40%', overlay = 'bg-gray-900/72' }) =>
  src ? (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: focus }} />
      <div className={`absolute inset-0 ${overlay}`} />
    </div>
  ) : null;

// Time/weather modifier shown as an icon instead of swapping the whole photo.
const COND_ICON = {
  day: Sun, night: Moon, sunset: Sunset, fog: CloudFog,
  storm: CloudLightning, rain: CloudRain, sandstorm: Wind, snow: Snowflake, event: Sparkles,
};
const ConditionTag = ({ type, label, className = '' }) => {
  if (!label) return null;
  const Icon = COND_ICON[type];
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      {label}
    </span>
  );
};

// One item you got kills with (weapon, gadget or spec). The wiki icons carry a
// light in-game "card" backdrop, so we show them as small rounded tiles — that
// reads as a deliberate weapon card rather than a white box on the dark UI.
const KillTile = ({ it }) => (
  <li className="flex items-center gap-2.5 text-xs">
    <span className="w-9 h-9 rounded-md overflow-hidden bg-linear-to-b from-gray-300 to-gray-400 ring-1 ring-black/25 flex items-center justify-center shrink-0">
      {it.icon ? (
        <img src={it.icon} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[8px] text-gray-700 text-center leading-tight px-0.5">{it.name}</span>
      )}
    </span>
    <span className="flex-1 min-w-0">
      <span className="text-gray-100 block truncate">{it.name}</span>
      {it.type && it.type !== 'Weapon' && it.type !== 'Event' && (
        <span className="text-[10px] text-gray-500 uppercase tracking-wide">{it.type}</span>
      )}
    </span>
    <span className="text-white font-semibold tabular-nums">{it.kills}</span>
  </li>
);

// Hover (or tap) the K/D to see what you got kills with — for a single round or
// a whole match. Rendered in a portal so the card's overflow-hidden / rounded
// corners can't clip it.
const KillsTooltip = ({ items, label, children }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.top });
  };
  // Dismiss on scroll / resize / outside tap (the fixed tooltip would otherwise
  // float away on scroll, and a tap-opened one needs an outside-tap to close).
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  return (
    <div
      ref={ref}
      className="cursor-help"
      onMouseEnter={() => {
        place();
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        place();
        setOpen((o) => !o);
      }}
    >
      {children}
      {open &&
        pos &&
        createPortal(
          <div
            style={{ position: 'fixed', left: pos.x, top: pos.y - 10, transform: 'translate(-50%, -100%)', zIndex: 60 }}
            className="pointer-events-none w-60 rounded-xl bg-gray-900/98 border border-gray-700 shadow-2xl p-3"
          >
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">{label}</p>
            {items?.length ? (
              <ul className="space-y-1.5">
                {items.map((it) => (
                  <KillTile key={it.id} it={it} />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">No kills recorded.</p>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

// One bracket round inside an expanded tournament. The map is constant across a
// tournament (shown once on the card), so a round highlights what VARIES: the
// time/weather, the layout, the weapon used, placement, cashout and combat.
const RoundRow = ({ r }) => (
  <div className="relative flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-950/35">
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
        <span>{r.stageLabel}</span>
        {r.tournamentWon && (
          <Badge tone="yellow">
            <Trophy className="w-3 h-3 inline -mt-0.5 mr-0.5" />Won
          </Badge>
        )}
        {r.backfill && <span className="text-[10px] font-normal text-gray-400">joined in progress</span>}
        {r.disconnected && <span className="text-[10px] font-normal text-red-300">disconnected</span>}
      </div>
      <div className="text-xs text-gray-300 mt-0.5 flex items-center gap-2 flex-wrap">
        <ConditionTag type={r.condType} label={r.condition} />
        {r.layout && <span className="text-gray-400">· {r.layout.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>}
      </div>
    </div>
    <div className="flex items-center gap-4 sm:gap-6 shrink-0 text-right">
      <div className="w-16">
        <p className="text-[10px] uppercase text-gray-400">Place</p>
        <p className={`text-sm font-semibold ${r.roundWon ? 'text-emerald-300' : 'text-gray-100'}`}>
          {r.position != null ? `${ordinal(r.position)} / ${r.stageTeams}` : '—'}
        </p>
      </div>
      <div className="w-20">
        <p className="text-[10px] uppercase text-gray-400">Cashout</p>
        <p className="text-sm font-semibold text-white">{cash(r.currency)}</p>
      </div>
      <KillsTooltip items={r.weaponKills} label="Killed with">
        <div className="w-14">
          <p className="text-[10px] uppercase text-gray-400">K / D</p>
          <p className="text-sm font-semibold text-gray-100 tabular-nums underline decoration-dotted decoration-gray-500 underline-offset-2">
            {r.kills}/{r.deaths}
          </p>
        </div>
      </KillsTooltip>
    </div>
  </div>
);

const MatchCard = ({ m, expanded, onToggle }) => {
  const tone = categoryTone[m.mode?.category] || 'gray';
  const expandable = m.isTournament;
  const mapName = m.mapName || m.map?.display;

  return (
    <div className="relative bg-gray-800 rounded-xl overflow-hidden">
      {/* One map photo behind the whole card — it stretches to fill the taller
          expanded card, so opening a tournament reveals a bigger picture. */}
      <MapBg src={m.mapImage} focus={m.mapFocus} />
      <div className="relative" style={m.mapImage ? OVER_PHOTO : undefined}>
        {/* Header (clickable for tournaments) */}
        <div
          className={`group ${expandable ? 'cursor-pointer' : ''}`}
          onClick={expandable ? onToggle : undefined}
          role={expandable ? 'button' : undefined}
          tabIndex={expandable ? 0 : undefined}
          aria-expanded={expandable ? expanded : undefined}
          onKeyDown={
            expandable
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle();
                  }
                }
              : undefined
          }
        >
          <div className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${expandable ? 'group-hover:bg-white/5' : ''}`}>
            {/* Mode + context */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-semibold">{m.mode?.label}</span>
                <Badge tone={tone}>{m.mode?.category}</Badge>
                {!m.mode?.confirmed && <span className="text-[10px] text-gray-400">heuristic</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-300 mt-1 flex-wrap">
                <span>{dateTime(m.start)}</span>
                {mapName && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {mapName}
                  </span>
                )}
                {/* For single-round matches the time/weather is fixed, so show it here. */}
                {!m.isTournament && m.condition && <ConditionTag type={m.rounds[0]?.condType} label={m.condition} />}
                {m.durationMs != null && <span>{duration(m.durationMs)}</span>}
                {m.archetypes?.length > 0 && <span>{m.archetypes.join(' / ')}</span>}
              </div>
            </div>

            {/* Result */}
            <div className="sm:text-right shrink-0">
              {m.isTournament && m.isBracket ? (
                // 8-team bracket (Ranked Cashout / World Tour)
                <div className="flex sm:flex-col items-center sm:items-end gap-2">
                  <div className="flex items-center gap-2">
                    {m.tournamentWon && (
                      <Badge tone="yellow">
                        <Trophy className="w-3 h-3 inline -mt-0.5 mr-0.5" />Won
                      </Badge>
                    )}
                    {m.placement ? (
                      <span className="text-sm font-semibold text-white">
                        {m.placement.label}
                        {m.placement.of ? ` of ${m.placement.of}` : ''}
                      </span>
                    ) : (
                      <span className="text-sm text-white">{m.stageReachedLabel || 'Tournament'}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-300">
                    {m.stageReachedLabel ? `Reached ${m.stageReachedLabel}` : `${m.rounds.length} rounds`}
                  </span>
                  <span className="text-xs text-gray-300">
                    {m.rounds.length} round{m.rounds.length !== 1 ? 's' : ''} · {cash(m.currency)}
                  </span>
                </div>
              ) : (
                // Win/loss result: a single-round casual match, OR a 2-team
                // multi-round match that isn't a bracket (e.g. Terminal Attack).
                <div className="flex sm:flex-col items-center sm:items-end gap-2">
                  {m.won ? <Badge tone="emerald">Win</Badge> : <Badge tone="gray">Loss</Badge>}
                  {m.finalPlacement != null && (
                    <span className="text-xs text-gray-300">
                      {ordinal(m.finalPlacement)}
                      {m.teams ? ` of ${m.teams}` : ''}
                    </span>
                  )}
                  {m.isTournament ? (
                    <span className="text-xs text-gray-300">
                      {m.rounds.length} round{m.rounds.length !== 1 ? 's' : ''} · {cash(m.currency)}
                    </span>
                  ) : (
                    m.currency > 0 && <span className="text-xs text-gray-300">{cash(m.currency)}</span>
                  )}
                </div>
              )}
            </div>

            {/* K/D block — hover/tap for the weapons used across the match */}
            <KillsTooltip items={m.weaponKills} label="Weapons used">
              <div className="flex gap-4 sm:gap-5 shrink-0 sm:border-l sm:border-white/15 sm:pl-5">
                <div className="text-center">
                  <p className="text-[10px] uppercase text-gray-300">Kills</p>
                  <p className="text-lg font-bold text-white">{m.kills}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase text-gray-300">Deaths</p>
                  <p className="text-lg font-bold text-white">{m.deaths}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase text-gray-300">K/D</p>
                  <p className="text-lg font-bold text-emerald-300 underline decoration-dotted decoration-white/40 underline-offset-4">{decimal(m.kd)}</p>
                </div>
              </div>
            </KillsTooltip>

            {/* Expand affordance (tournaments only) */}
            {expandable && (
              <ChevronDown
                className={`w-5 h-5 text-gray-200 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            )}
          </div>
        </div>

        {/* Per-round breakdown */}
        {expandable && expanded && (
          <div className="border-t border-white/10 px-3 py-3 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-300 px-1 mb-1">
              {mapName ? `${mapName} · ` : ''}{m.rounds.length} round{m.rounds.length !== 1 ? 's' : ''} · total cashout {cash(m.currency)}
            </p>
            {m.rounds.map((r, i) => (
              <RoundRow key={r.matchId ? `${r.matchId}-${i}` : i} r={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const MatchesPage = () => {
  const { model } = useVaultData();
  const { matches } = model;
  const [filter, setFilter] = useState('All'); // mode group, or 'All'
  const [weaponSel, setWeaponSel] = useState(() => new Set()); // content-ids to require a kill with
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1); // 1-based, matches the shared Pagination
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Match counts per named mode group (drives the tabs + their counts).
  const groupCounts = useMemo(() => {
    const c = {};
    for (const m of matches) {
      const g = careerModeGroup(m.mode);
      c[g] = (c[g] || 0) + 1;
    }
    return c;
  }, [matches]);

  // Mode group AND weapon selection (a match passes the weapon filter if it has
  // a kill with ANY selected item — weaponKills only lists items that got kills).
  const filtered = useMemo(
    () =>
      matches.filter((m) => {
        if (filter !== 'All' && careerModeGroup(m.mode) !== filter) return false;
        if (weaponSel.size > 0 && !(m.weaponKills || []).some((wk) => weaponSel.has(wk.id))) return false;
        return true;
      }),
    [matches, filter, weaponSel]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PER_PAGE;
  const slice = filtered.slice(startIndex, startIndex + PER_PAGE);

  const tabs = ['All', ...CAREER_MODE_GROUPS.filter((g) => groupCounts[g]), ...(groupCounts.Other ? ['Other'] : [])];
  const setTab = (t) => {
    setFilter(t);
    setPage(1);
  };

  const toggleWeapon = (id) => {
    setWeaponSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPage(1);
  };
  const clearWeapons = () => {
    setWeaponSel(new Set());
    setPage(1);
  };
  const selectedWeapons = useMemo(() => [...weaponSel].map((id) => ({ id, name: resolveWeapon(id).name })), [weaponSel]);

  return (
    <div className="animate-fade-in-up">
      <PageHeader icon={Swords} title="Match history" subtitle={`${num(matches.length)} matches · ${num(model.meta.roundCount)} rounds`} />

      {/* Filters: mode group + weapon */}
      <div className="mb-3 space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tb) => {
            const count = tb === 'All' ? matches.length : groupCounts[tb] || 0;
            const active = filter === tb;
            return (
              <button
                key={tb}
                onClick={() => setTab(tb)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {tb} <span className="opacity-60">{num(count)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setModalOpen(true)}
            className={`inline-flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              weaponSel.size ? 'bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-500/40' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Crosshair className="w-4 h-4" />
            Filter by weapon
            {weaponSel.size > 0 && (
              <span className="bg-emerald-600 text-white text-[10px] font-bold rounded-full px-1.5 leading-5">{weaponSel.size}</span>
            )}
          </button>
          {selectedWeapons.map((w) => (
            <span key={w.id} className="inline-flex items-center gap-1 bg-gray-800 text-gray-200 text-xs rounded-full pl-2.5 pr-1 py-1">
              {w.name}
              <button
                onClick={() => toggleWeapon(w.id)}
                aria-label={`Remove ${w.name}`}
                className="p-0.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-700"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {weaponSel.size > 0 && (
            <button onClick={clearWeapons} className="text-xs text-gray-400 hover:text-white">
              Clear weapons
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Swords} title="No matches with these filters">
          {weaponSel.size > 0
            ? 'No matches here have a kill with the selected weapon(s). Try removing a weapon or switching mode.'
            : null}
        </EmptyState>
      ) : (
        <>
          {/* Fixed min-height reserves a full page of rows, so the pager below
              sits at the same spot on every page (incl. a short last page). */}
          <div className="space-y-2" style={{ minHeight: PER_PAGE * ROW_PX }}>
            {slice.map((m) => (
              <MatchCard key={m.id} m={m} expanded={expanded.has(m.id)} onToggle={() => toggle(m.id)} />
            ))}
          </div>

          {/* Bottom pager: page info + jump on the left, buttons bottom-right.
              Buttons are right-aligned so changing the left text never moves them. */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <PageJump totalPages={totalPages} onJump={setPage} />
            <div className="flex-1">
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={startIndex + PER_PAGE}
                totalItems={filtered.length}
                onPageChange={(p) => setPage(p)}
                variant="compact"
              />
            </div>
          </div>
        </>
      )}

      <Note>
        Filter by mode, or by weapon to find the rounds where you got a kill with a specific item — a gun, a Mine, a Jump
        Pad, a Defibrillator, anything that can score (the export records kills per item). Ranked Cashout is an 8-team
        tournament — click any tournament to see its rounds. The bracket is Round 1 (two parallel 4-team lobbies, top 2
        advance) → Round 2 (4 teams, top 2 advance) → a 1v1 Final. Placement is derived from the furthest round you reached
        and your finish there; Round-1 exits resolve to a tied range (5th–6th or 7th–8th) because the two lobbies run in
        parallel. Each card’s photo is the arena; the icon by each round marks the time/weather. Per-round “Cashout” is the
        in-match cash you banked. Mode labels marked “heuristic” are inferred from structure, not a confirmed ScenarioID.
      </Note>

      {modalOpen && (
        <WeaponFilterModal selected={weaponSel} onToggle={toggleWeapon} onClear={clearWeapons} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
};
