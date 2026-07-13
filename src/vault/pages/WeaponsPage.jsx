import { useMemo, useState } from 'react';
import { ChevronDown, Crosshair, Sparkles } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Badge, EmptyState, Note } from '../components/ui';
import { ALL_WEAPONS } from '../lib/weapons';
import { num, date } from '../lib/format';

const FILTERS = ['All', 'Light', 'Medium', 'Heavy', 'Global'];
const archTone = { Light: 'blue', Medium: 'emerald', Heavy: 'red', Global: 'gray', Unknown: 'gray' };

// Sections shown within a class tab, in display order.
const TYPE_SECTIONS = [
  { type: 'Weapon', label: 'Weapons' },
  { type: 'Spec', label: 'Specializations' },
  { type: 'Gadget', label: 'Gadgets' },
  { type: 'Event', label: 'Event items' },
  { type: 'Unknown', label: 'Unrecognised items' },
];

// Medal colours for the top three; muted grey after that.
const rankClass = (i) => (i === 0 ? 'text-yellow-300' : i === 1 ? 'text-gray-200' : i === 2 ? 'text-amber-600' : 'text-gray-500');

const WeaponThumb = ({ w, size = 'w-12 h-12' }) =>
  w.icon ? (
    <span className={`${size} rounded-lg overflow-hidden bg-linear-to-b from-gray-300 to-gray-400 ring-1 ring-black/25 shrink-0`}>
      <img src={w.icon} alt="" className="w-full h-full object-cover" />
    </span>
  ) : (
    <span className={`${size} rounded-lg bg-gray-700 ring-1 ring-black/25 grid place-items-center shrink-0`}>
      <Crosshair className="w-5 h-5 text-gray-500" />
    </span>
  );

const ymOf = (ms) => {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const ymLabel = (ym) => {
  const y = Math.floor(ym / 12);
  const m = ym % 12;
  return new Date(Date.UTC(y, m, 1)).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

// Kills-per-month sparkline for the drilldown (hand-rolled, like every vault chart).
const KillSpark = ({ series }) => {
  if (!series || series.length < 2) return null;
  const max = Math.max(1, ...series.map((p) => p.v));
  const pts = series.map((p, i) => `${((i / (series.length - 1)) * 316 + 2).toFixed(1)},${(46 - (p.v / max) * 40).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 320 48" className="w-full h-12" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#34d399" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const WeaponsPage = () => {
  const { model } = useVaultData();
  const { weapons, rounds } = model;
  const [filter, setFilter] = useState('All');
  const [expanded, setExpanded] = useState(null);

  const totalKills = useMemo(() => weapons.reduce((s, w) => s + w.kills, 0), [weapons]);
  const usedKnown = useMemo(() => weapons.filter((w) => !w.unknown).length, [weapons]);

  // Full arsenal = every item you killed with (incl. unrecognised ids) + every
  // known item you never scored a kill with (kills: 0, shown dimmed).
  const fullList = useMemo(() => {
    const killed = new Set(weapons.map((w) => w.id));
    return [...weapons, ...ALL_WEAPONS.filter((w) => !killed.has(w.id)).map((w) => ({ ...w, kills: 0 }))];
  }, [weapons]);

  const list = useMemo(
    () => (filter === 'All' ? fullList : fullList.filter((w) => w.archetype === filter)),
    [fullList, filter]
  );

  // Rank by kills within the current tab (killed items only; 0-kill items are unranked).
  const killedInFilter = useMemo(() => list.filter((w) => w.kills > 0).sort((a, b) => b.kills - a.kills), [list]);
  const rankById = useMemo(() => new Map(killedInFilter.map((w, i) => [w.id, i])), [killedInFilter]);

  const sections = useMemo(
    () =>
      TYPE_SECTIONS.map(({ type, label }) => {
        const items = list
          .filter((w) => (w.type || 'Unknown') === type)
          .sort((a, b) => b.kills - a.kills || a.name.localeCompare(b.name));
        return { type, label, items, maxKills: Math.max(1, ...items.map((w) => w.kills)) };
      }).filter((s) => s.items.length > 0),
    [list]
  );

  // Show off the icons with a top-3 podium, then the sectioned list below.
  const podium = killedInFilter.slice(0, 3);

  // Your rarest kill credits — the fun tail the top of the list never shows.
  const rarest = useMemo(
    () => (weapons.length > 8 ? weapons.slice(-6).reverse() : []),
    [weapons]
  );

  // Per-weapon drilldown, computed on demand from the normalized rounds
  // (weaponKills is kills-only, so "rounds used" = rounds with >=1 kill).
  const detail = useMemo(() => {
    if (!expanded || !rounds?.length) return null;
    const byMonth = new Map();
    const modes = new Map();
    let first = null;
    let last = null;
    let used = 0;
    for (const r of rounds) {
      const hit = r.weaponKills?.length ? r.weaponKills.find((k) => k.id === expanded) : null;
      if (!hit) continue;
      used++;
      const t = r.start ?? r.end ?? 0;
      if (t) {
        if (first == null) first = t;
        last = t;
        const ym = ymOf(t);
        byMonth.set(ym, (byMonth.get(ym) || 0) + hit.kills);
      }
      const label = r.mode?.label || 'Unknown';
      modes.set(label, (modes.get(label) || 0) + hit.kills);
    }
    if (!used) return { used: 0 };
    const series = [];
    if (byMonth.size) {
      const keys = [...byMonth.keys()];
      const min = Math.min(...keys);
      const max = Math.max(...keys);
      for (let ym = min; ym <= max; ym++) series.push({ ym, v: byMonth.get(ym) || 0 });
    }
    const topMode = [...modes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { used, first, last, series, topMode };
  }, [expanded, rounds]);

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        icon={Crosshair}
        title="Weapons"
        subtitle={`${num(totalKills)} eliminations · kills with ${usedKnown} of ${ALL_WEAPONS.length} known items`}
      />

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {totalKills === 0 ? (
        <EmptyState icon={Crosshair} title="No weapon kills recorded" />
      ) : (
        <>
          {/* Top-3 podium — bigger icons for most-used weapons */}
          {podium.length >= 3 && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {podium.map((w, i) => (
                <div
                  key={w.id}
                  className="relative bg-gray-800 rounded-xl p-4 flex flex-col items-center text-center ring-1 ring-inset ring-white/5"
                >
                  <span className={`absolute top-2 left-2.5 text-xs font-bold ${rankClass(i)}`}>#{i + 1}</span>
                  <WeaponThumb w={w} size="w-16 h-16" />
                  <p className={`mt-2 text-sm font-semibold truncate max-w-full ${w.unknown ? 'text-gray-500 italic' : 'text-white'}`}>{w.name}</p>
                  <p className="text-lg font-bold text-emerald-400 tabular-nums leading-tight">{num(w.kills)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">eliminations</p>
                </div>
              ))}
            </div>
          )}

          {/* Rarest kill credits */}
          {filter === 'All' && rarest.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-3 mb-4 ring-1 ring-inset ring-white/5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" /> Rarest kill credits
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {rarest.map((w) => (
                  <div key={w.id} className="bg-gray-900/60 rounded-lg p-2 flex items-center gap-2 min-w-0">
                    <WeaponThumb w={w} size="w-8 h-8" />
                    <div className="min-w-0">
                      <p className={`text-xs font-medium truncate ${w.unknown ? 'text-gray-500 italic' : 'text-gray-200'}`}>{w.name}</p>
                      <p className="text-[11px] text-gray-500 tabular-nums">{num(w.kills)} {w.kills === 1 ? 'kill' : 'kills'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sectioned arsenal list */}
          {sections.map((sec) => (
            <div key={sec.type} className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{sec.label}</p>
              <div className="space-y-1.5">
                {sec.items.map((w) => {
                  const rank = rankById.get(w.id);
                  const isOpen = expanded === w.id;
                  const dead = w.kills === 0;
                  return (
                    <div key={w.id} className={`bg-gray-800 rounded-xl overflow-hidden ${dead ? 'opacity-55' : ''}`}>
                      <button
                        type="button"
                        disabled={dead}
                        onClick={() => setExpanded(isOpen ? null : w.id)}
                        className={`w-full text-left p-2.5 pr-3 flex items-center gap-3 ${dead ? 'cursor-default' : 'hover:bg-gray-700/40 transition-colors'}`}
                      >
                        <span className={`w-6 text-center text-sm font-bold ${dead ? 'text-gray-600' : rankClass(rank)}`}>
                          {dead ? '–' : rank + 1}
                        </span>
                        <WeaponThumb w={w} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold truncate ${w.unknown ? 'text-gray-500 italic' : dead ? 'text-gray-400' : 'text-white'}`}>{w.name}</span>
                            <Badge tone={archTone[w.archetype] || 'gray'}>{w.archetype}</Badge>
                          </div>
                          {dead ? (
                            <p className="mt-1 text-[11px] text-gray-500 italic">no kills recorded</p>
                          ) : (
                            <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${(w.kills / sec.maxKills) * 100}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0 w-14">
                          <span className={`block font-bold tabular-nums leading-none ${dead ? 'text-gray-500' : 'text-white'}`}>{num(w.kills)}</span>
                          <span className="text-[10px] text-gray-500">kills</span>
                        </div>
                        {!dead && (
                          <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        )}
                      </button>
                      {isOpen && detail && (
                        <div className="border-t border-white/10 bg-gray-900/40 px-4 py-3">
                          {detail.used === 0 ? (
                            <p className="text-xs text-gray-500">No per-round usage found for this item.</p>
                          ) : (
                            <>
                              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400 mb-2">
                                <span>
                                  First kill <span className="text-gray-200">{detail.first ? date(detail.first) : '—'}</span>
                                </span>
                                <span>
                                  Last kill <span className="text-gray-200">{detail.last ? date(detail.last) : '—'}</span>
                                </span>
                                <span>
                                  Killing rounds <span className="text-gray-200 tabular-nums">{num(detail.used)}</span>
                                </span>
                                {detail.topMode && (
                                  <span>
                                    Most kills in <span className="text-gray-200">{detail.topMode}</span>
                                  </span>
                                )}
                              </div>
                              {detail.series?.length >= 2 ? (
                                <>
                                  <KillSpark series={detail.series} />
                                  <div className="flex justify-between text-[10px] text-gray-500">
                                    <span>{ymLabel(detail.series[0].ym)}</span>
                                    <span>kills per month</span>
                                    <span>{ymLabel(detail.series[detail.series.length - 1].ym)}</span>
                                  </div>
                                </>
                              ) : (
                                <p className="text-[11px] text-gray-500">All kills fall in a single month.</p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      <Note>
        Kills are summed from every round’s <code>KillsPerItem</code>. The export records kills only — there is no
        per-weapon K/D, damage or accuracy (deaths aren’t attributed to a weapon; those stats live on the in-game career
        screen). Dimmed rows are items you’ve never scored a kill credit with; click any other row for its kill history.
        For real K/D by class, map and mode see the Breakdown page.
      </Note>
    </div>
  );
};
