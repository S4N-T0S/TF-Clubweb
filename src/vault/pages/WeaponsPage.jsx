import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Crosshair, ArrowDown, ArrowUp } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, EmptyState, Note } from '../components/ui';
import { ListSearch, SearchEcho } from '../components/ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import { ALL_WEAPONS } from '../lib/weapons';
import { num, compact, date, pct } from '../lib/format';

const FILTERS = ['All', 'Light', 'Medium', 'Heavy', 'Global'];
const archTone = { Light: 'blue', Medium: 'emerald', Heavy: 'red', Global: 'gray', Unknown: 'gray' };

// Sections shown within a class tab, in display order.
const TYPE_SECTIONS = [
  { type: 'Weapon', label: 'Weapons' },
  { type: 'Spec', label: 'Specializations' },
  { type: 'Gadget', label: 'Gadgets' },
  { type: 'Event', label: 'Event items' },
  { type: 'Other', label: 'Other' },
  { type: 'Unknown', label: 'Unrecognised items' },
];

// One row per item, every figure on it. The grid template depends on which sources the
// export has (Tailwind only sees literal class strings), and the metric columns appear
// by container width: the page column is about 992px beside the sidebar, 343px on a phone.
const GRID = {
  k: 'grid grid-cols-[26px_40px_minmax(0,1fr)_20px] @2xl:grid-cols-[28px_48px_minmax(0,1fr)_96px_20px] items-center gap-x-3',
  kd: 'grid grid-cols-[26px_40px_minmax(0,1fr)_20px] @2xl:grid-cols-[28px_48px_minmax(0,1fr)_88px_88px_20px] @4xl:grid-cols-[28px_48px_minmax(0,1fr)_104px_104px_20px] items-center gap-x-3',
  km: 'grid grid-cols-[26px_40px_minmax(0,1fr)_20px] @2xl:grid-cols-[28px_48px_minmax(0,1fr)_88px_84px_20px] @4xl:grid-cols-[28px_48px_minmax(0,1fr)_104px_100px_20px] items-center gap-x-3',
  kdm: 'grid grid-cols-[26px_40px_minmax(0,1fr)_20px] @2xl:grid-cols-[28px_48px_minmax(0,1fr)_88px_88px_84px_20px] @4xl:grid-cols-[28px_48px_minmax(0,1fr)_104px_104px_100px_20px] items-center gap-x-3',
};

// Presence, not value: a mastered item at level 0 with 0 XP still has a row.
const SORTS = {
  Kills: { get: (w) => w.kills, has: (w) => w.kills > 0, bar: true, label: 'Sort by kills' },
  Damage: { get: (w) => w.damage, has: (w) => w.damage > 0, bar: true, label: 'Sort by damage' },
  Mastery: { get: (w) => w.mastery?.xp ?? 0, has: (w) => w.mastery != null, bar: false, label: 'Sort by mastery XP' },
};

// Medal colours for the top three of a descending sort; muted grey otherwise.
const rankClass = (i, asc) => (asc ? 'text-gray-400' : i === 0 ? 'text-yellow-300' : i === 1 ? 'text-gray-200' : i === 2 ? 'text-amber-600' : 'text-gray-500');

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
const monthSeries = (byMonth) => {
  if (!byMonth.size) return [];
  const keys = [...byMonth.keys()];
  const min = Math.min(...keys);
  const max = Math.max(...keys);
  const series = [];
  for (let ym = min; ym <= max; ym++) series.push({ ym, v: byMonth.get(ym) || 0 });
  return series;
};

// Per-month sparkline for the drilldown (hand-rolled, like every vault chart).
const Spark = ({ series, stroke = '#34d399' }) => {
  if (!series || series.length < 2) return null;
  const max = Math.max(1, ...series.map((p) => p.v));
  const pts = series.map((p, i) => `${((i / (series.length - 1)) * 316 + 2).toFixed(1)},${(46 - (p.v / max) * 40).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 320 48" className="w-full h-12" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const DetailBlock = ({ title, stats, series, caption, stroke }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">{title}</p>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs mb-2">
      {stats.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-gray-400">{label}</dt>
          <dd className="text-gray-200 tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
    {series.length >= 2 ? (
      <>
        <Spark series={series} stroke={stroke} />
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>{ymLabel(series[0].ym)}</span>
          <span>{caption}</span>
          <span>{ymLabel(series[series.length - 1].ym)}</span>
        </div>
      </>
    ) : (
      <p className="text-[11px] text-gray-500">All of it falls in a single month.</p>
    )}
  </div>
);

const MetricCell = ({ value, caption, bar }) => (
  <div className="hidden @2xl:block text-right">
    <span className="block font-semibold tabular-nums text-white leading-none">{value}</span>
    {bar != null && (
      <span className="block mt-1 h-0.75 bg-gray-700 rounded-full overflow-hidden">
        <span className="block h-full bg-emerald-500/70 rounded-full" style={{ width: `${Math.max(2, bar)}%` }} />
      </span>
    )}
    <span className="hidden @4xl:block mt-0.5 text-[10px] text-gray-500 tabular-nums">{caption}</span>
  </div>
);

const rounds = (n) => `in ${num(n)} round${n === 1 ? '' : 's'}`;

export const WeaponsPage = () => {
  const { model } = useVaultData();
  const { weapons, damage, mastery } = model;
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('Kills');
  const [asc, setAsc] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const searchRef = useRef(null);

  const cols = damage.has ? (mastery.has ? 'kdm' : 'kd') : mastery.has ? 'km' : 'k';
  const sortable = ['Kills', ...(damage.has ? ['Damage'] : []), ...(mastery.has ? ['Mastery'] : [])];
  const pickSort = (s) => {
    if (s === sort) setAsc((v) => !v);
    else {
      setSort(s);
      setAsc(false);
    }
  };

  const totalKills = useMemo(() => weapons.reduce((s, w) => s + w.kills, 0), [weapons]);
  const usedKnown = useMemo(() => weapons.filter((w) => w.kills > 0 && !w.unknown && w.type !== 'Other').length, [weapons]);
  const topDamage = useMemo(() => weapons.reduce((b, w) => (w.damage > (b?.damage ?? 0) ? w : b), null), [weapons]);

  // Every item with a kill or damage, every known item with neither (dimmed), and every
  // mastered item that has never scored either: one list for every sort.
  const fullList = useMemo(() => {
    const masteryById = new Map(mastery.items.map((m) => [m.id, m]));
    const seen = new Set(weapons.map((w) => w.id));
    const base = [
      ...weapons,
      ...ALL_WEAPONS.filter((w) => !seen.has(w.id)).map((w) => {
        const m = masteryById.get(w.id);
        return { ...w, kills: 0, killRounds: 0, damage: 0, damageRounds: 0, mastery: m ? { level: m.level, xp: m.xp } : null };
      }),
    ];
    for (const w of base) seen.add(w.id);
    return [...base, ...mastery.items.filter((m) => !seen.has(m.id)).map((m) => ({ ...m, mastery: { level: m.level, xp: m.xp } }))];
  }, [weapons, mastery.items]);

  const list = useMemo(() => (filter === 'All' ? fullList : fullList.filter((w) => w.archetype === filter)), [fullList, filter]);
  const { query, setQuery, filtered: shown } = useListSearch(list, (w) => [w.name, w.type, w.archetype, w.id], () => setExpanded(null));

  const S = SORTS[sort];
  // Rows without a value for the sorted metric sink to the end of their section in both
  // directions; rank and bar are scoped to the section so a gadget is never "#41".
  const sections = useMemo(
    () =>
      TYPE_SECTIONS.map(({ type, label }) => {
        const items = shown
          .filter((w) => (w.type || 'Unknown') === type)
          .sort((a, b) => {
            const ha = S.has(a);
            const hb = S.has(b);
            if (ha !== hb) return ha ? -1 : 1;
            return (asc ? -1 : 1) * (S.get(b) - S.get(a)) || a.name.localeCompare(b.name);
          });
        const rank = new Map();
        let i = 0;
        for (const w of items) if (S.has(w)) rank.set(w.id, i++);
        return {
          type,
          label,
          items,
          rank,
          max: Math.max(1, ...items.map((w) => S.get(w))),
          kills: items.reduce((s, w) => s + w.kills, 0),
          damage: items.reduce((s, w) => s + w.damage, 0),
        };
      }).filter((s) => s.items.length > 0),
    [shown, S, asc]
  );

  // Your rarest kill credits within the current class, the tail a sorted top never shows.
  const rarest = useMemo(() => {
    const killed = list.filter((w) => w.kills > 0).sort((a, b) => b.kills - a.kills);
    return killed.length > 8 ? killed.slice(-6).reverse() : [];
  }, [list]);
  // Id 0 is unattributed damage, not an item, so it never counts as "never a kill".
  const damageOnly = useMemo(() => list.filter((w) => w.damage > 0 && !w.kills && w.id !== '0').sort((a, b) => b.damage - a.damage), [list]);
  const masteryOnly = useMemo(() => list.filter((w) => w.mastery && !w.kills && !w.damage).length, [list]);
  const damageOnlyAll = useMemo(() => fullList.filter((w) => w.damage > 0 && !w.kills && w.id !== '0').length, [fullList]);

  // Per-item drilldown, computed on demand from the normalized rounds: kills and damage
  // each get their own history, since an item can have either without the other.
  const detail = useMemo(() => {
    const all = model.rounds;
    if (!expanded || !all?.length) return null;
    const killsByMonth = new Map();
    const damageByMonth = new Map();
    const modes = new Map();
    const k = { rounds: 0, first: null, last: null };
    const d = { rounds: 0, first: null, last: null, total: 0 };
    for (const r of all) {
      if (r.uncounted) continue;
      const hit = r.weaponKills?.length ? r.weaponKills.find((x) => x.id === expanded) : null;
      const dmgHit = hit && hit.damage != null ? hit : r.damageOnly ? r.damageOnly.find((x) => x.id === expanded) : null;
      const dmg = dmgHit ? dmgHit.damage || 0 : 0;
      if (!hit && !dmg) continue;
      const t = r.start ?? r.end ?? 0;
      if (hit) {
        k.rounds++;
        if (t) {
          if (k.first == null) k.first = t;
          k.last = t;
          killsByMonth.set(ymOf(t), (killsByMonth.get(ymOf(t)) || 0) + hit.kills);
        }
        const label = r.mode?.label || 'Unknown';
        modes.set(label, (modes.get(label) || 0) + hit.kills);
      }
      if (dmg > 0) {
        d.rounds++;
        d.total += dmg;
        if (t) {
          if (d.first == null) d.first = t;
          d.last = t;
          damageByMonth.set(ymOf(t), (damageByMonth.get(ymOf(t)) || 0) + dmg);
        }
      }
    }
    return {
      kills: k.rounds ? { ...k, series: monthSeries(killsByMonth), topMode: [...modes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null } : null,
      damage: d.rounds ? { ...d, series: monthSeries(damageByMonth), perRound: d.total / d.rounds, share: damage.total ? d.total / damage.total : null } : null,
    };
  }, [expanded, model.rounds, damage.total]);

  const subtitle = damage.has && mastery.has
    ? 'Kills, damage and mastery for every item on record'
    : damage.has ? 'Kills and damage for every item on record'
      : mastery.has ? 'Kills and mastery for every item on record'
        : 'Kill credits for every item on record';

  const cards = [
    { label: 'Eliminations', value: num(totalKills), sub: weapons[0]?.kills > 0 ? `Most with ${weapons[0].name} (${num(weapons[0].kills)})` : undefined },
    ...(damage.has ? [{ label: 'Damage by item', value: compact(damage.total), sub: topDamage ? `Most with ${topDamage.name} (${compact(topDamage.damage)})` : undefined }] : []),
    { label: 'Items with a kill', value: `${usedKnown} of ${ALL_WEAPONS.length}`, sub: damageOnlyAll > 0 ? `${num(damageOnlyAll)} more did damage but never a kill` : 'Known weapons, gadgets and specializations' },
    ...(mastery.has ? [{ label: 'Items with a mastery level', value: num(mastery.count), sub: mastery.items[0] ? `Most XP on ${mastery.items[0].name}, level ${mastery.items[0].level}` : undefined }] : []),
  ];

  const filtering = filter !== 'All' || query.trim();
  const mobileLine = (w) => {
    const parts = [['Kills', `${num(w.kills)} kills`], ...(damage.has ? [['Damage', `${compact(w.damage)} dmg`]] : []), ...(mastery.has && w.mastery ? [['Mastery', `Lv ${w.mastery.level}`]] : [])];
    return parts.map(([key, text], i) => (
      <span key={key} className={key === sort ? 'text-gray-200' : 'text-gray-500'}>
        {i > 0 && <span className="text-gray-600"> · </span>}
        {text}
      </span>
    ));
  };

  return (
    <div className="@container animate-fade-in-up">
      <PageHeader icon={Crosshair} title="Weapons" subtitle={subtitle}>
        <ListSearch
          value={query}
          onChange={setQuery}
          placeholder="Search item, class or type…"
          matched={shown.length}
          total={list.length}
          className="w-full sm:w-64"
          inputRef={searchRef}
        />
      </PageHeader>

      {weapons.length === 0 && !mastery.has ? (
        <EmptyState icon={Crosshair} title="No weapon kills recorded" />
      ) : (
        <>
          <div className={`grid grid-cols-2 ${cards.length > 2 ? 'lg:grid-cols-4' : ''} gap-4 mb-4`}>
            {cards.map((c) => (
              <StatCard key={c.label} label={c.label} value={c.value} sub={c.sub} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setExpanded(null);
                }}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
            {filtering && (
              <span className="ml-auto text-[11px] text-gray-500 tabular-nums">
                Showing {num(shown.length)} of {num(fullList.length)} items
              </span>
            )}
          </div>

          {(rarest.length > 0 || damageOnly.length > 0 || masteryOnly > 0) && (
            <div className={`grid gap-4 mb-5 ${rarest.length > 0 && (damageOnly.length > 0 || masteryOnly > 0) ? 'lg:grid-cols-2' : ''}`}>
              {rarest.length > 0 && (
                <Panel title="Rarest kill credits">
                  <div className="grid sm:grid-cols-2 gap-2">
                    {rarest.map((w) => (
                      <div key={w.id} className="bg-gray-900/50 rounded-lg p-2 flex items-center gap-2 min-w-0">
                        <WeaponThumb w={w} size="w-8 h-8" />
                        <div className="min-w-0">
                          <p className={`text-xs truncate ${w.unknown ? 'text-gray-500 italic' : 'text-gray-200'}`}>{w.name}</p>
                          <p className="text-[11px] text-gray-500 tabular-nums">{num(w.kills)} {w.kills === 1 ? 'kill' : 'kills'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
              {(damageOnly.length > 0 || masteryOnly > 0) && (
                <Panel title="Never a kill">
                  {damageOnly.length > 0 && (
                    <>
                      <p className="text-xs text-gray-500 mb-2">Items that did damage in a round but never took a kill credit.</p>
                      <ul className="space-y-1.5">
                        {damageOnly.slice(0, 6).map((w) => (
                          <li key={w.id} className="flex items-center gap-2 text-xs">
                            <WeaponThumb w={w} size="w-6 h-6" />
                            <span className={`flex-1 min-w-0 truncate ${w.unknown ? 'text-gray-500 italic' : 'text-gray-200'}`}>{w.name}</span>
                            <span className="text-gray-300 tabular-nums">{compact(w.damage)} dmg</span>
                            <span className="text-gray-500 tabular-nums w-24 text-right">{rounds(w.damageRounds)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {masteryOnly > 0 && (
                    <p className={`text-xs text-gray-500 ${damageOnly.length ? 'mt-3' : ''}`}>
                      {num(masteryOnly)} {masteryOnly === 1 ? 'item has' : 'items have'} a mastery level but no kills or damage recorded. They are in the list below with their level.
                    </p>
                  )}
                </Panel>
              )}
            </div>
          )}

          {sortable.length > 1 && (
            <div className="@2xl:hidden flex items-center gap-2 mb-2">
              <span className="text-[11px] uppercase tracking-wider text-gray-500">Sort</span>
              {sortable.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickSort(s)}
                  aria-pressed={sort === s}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium inline-flex items-center gap-1 ${sort === s ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                >
                  {s}
                  {sort === s && (asc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                </button>
              ))}
            </div>
          )}

          {sections.length === 0 ? (
            <EmptyState icon={Crosshair} title={query.trim() ? `Nothing matches “${query.trim()}”` : 'Nothing recorded for this class'} />
          ) : (
            <>
              <div className={`${GRID[cols]} hidden @2xl:grid sticky top-0 z-10 bg-gray-900 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-gray-500`}>
                <span>
                  <span className="sr-only">Rank</span>
                </span>
                <span />
                <span>Item</span>
                {sortable.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => pickSort(s)}
                    aria-pressed={sort === s}
                    aria-label={SORTS[s].label}
                    className={`text-right inline-flex items-center justify-end gap-1 uppercase tracking-wider ${sort === s ? 'text-emerald-300' : 'hover:text-gray-300'}`}
                  >
                    {s}
                    {sort === s && (asc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </button>
                ))}
                <span>
                  <span className="sr-only">Details</span>
                </span>
              </div>

              {sections.map((sec) => (
                <div key={sec.type} className="mb-4">
                  <div className={`${GRID[cols]} px-2.5 pt-3 pb-1 text-[11px] uppercase tracking-wider text-gray-500`}>
                    <span />
                    <span />
                    <span className="truncate">
                      {sec.label} <span className="text-gray-600">· {num(sec.items.length)} {sec.items.length === 1 ? 'item' : 'items'}</span>
                    </span>
                    <span className="hidden @2xl:block text-right tabular-nums">{num(sec.kills)}</span>
                    {damage.has && <span className="hidden @2xl:block text-right tabular-nums">{compact(sec.damage)}</span>}
                    {mastery.has && <span className="hidden @2xl:block" />}
                    <span />
                  </div>
                  <div className="space-y-1.5">
                    {sec.items.map((w) => {
                      const rank = sec.rank.get(w.id);
                      const dead = !w.kills && !w.damage && !w.mastery;
                      const isOpen = expanded === w.id;
                      const bar = (key) => (sort === key && S.bar ? (S.get(w) / sec.max) * 100 : null);
                      return (
                        <div key={w.id} className={`bg-gray-800 rounded-xl overflow-hidden ${dead ? 'opacity-55' : ''}`}>
                          <button
                            type="button"
                            disabled={dead}
                            aria-expanded={isOpen}
                            onClick={() => setExpanded(isOpen ? null : w.id)}
                            className={`w-full text-left p-2.5 ${GRID[cols]} ${dead ? 'cursor-default' : 'hover:bg-gray-700/40 transition-colors'}`}
                          >
                            <span className={`text-center text-sm font-bold ${rank == null ? 'text-gray-600' : rankClass(rank, asc)}`}>{rank == null ? '–' : rank + 1}</span>
                            <WeaponThumb w={w} size="w-10 h-10 @2xl:w-12 @2xl:h-12" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`font-semibold truncate ${w.unknown ? 'text-gray-500 italic' : dead ? 'text-gray-400' : 'text-white'}`}>{w.name}</span>
                                <Badge tone={archTone[w.archetype] || 'gray'}>{w.archetype}</Badge>
                              </div>
                              <p className="@2xl:hidden mt-0.5 text-[11px] tabular-nums">
                                {dead ? <span className="italic text-gray-500">nothing recorded</span> : mobileLine(w)}
                              </p>
                            </div>
                            <MetricCell value={num(w.kills)} caption={rounds(w.killRounds)} bar={bar('Kills')} />
                            {damage.has && <MetricCell value={compact(w.damage)} caption={rounds(w.damageRounds)} bar={bar('Damage')} />}
                            {mastery.has && (
                              <div className="hidden @2xl:block text-right">
                                {w.mastery ? (
                                  <>
                                    <Badge tone="indigo">Lv {w.mastery.level}</Badge>
                                    <span className="block mt-1 text-[10px] text-gray-500 tabular-nums">{num(w.mastery.xp)} XP</span>
                                  </>
                                ) : (
                                  <span className="text-gray-600">–</span>
                                )}
                              </div>
                            )}
                            {dead ? <span /> : <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                          </button>
                          {isOpen && (
                            <div className="border-t border-white/10 bg-gray-900/40 px-4 py-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              {detail?.kills && (
                                <DetailBlock
                                  title="Kills"
                                  stats={[
                                    ['First kill', detail.kills.first ? date(detail.kills.first) : '—'],
                                    ['Last kill', detail.kills.last ? date(detail.kills.last) : '—'],
                                    ['Killing rounds', num(detail.kills.rounds)],
                                    ...(detail.kills.topMode ? [['Most kills in', detail.kills.topMode]] : []),
                                  ]}
                                  series={detail.kills.series}
                                  caption="kills per month"
                                />
                              )}
                              {detail?.damage && (
                                <DetailBlock
                                  title="Damage"
                                  stats={[
                                    ['First damage', detail.damage.first ? date(detail.damage.first) : '—'],
                                    ['Last damage', detail.damage.last ? date(detail.damage.last) : '—'],
                                    ['Damage rounds', num(detail.damage.rounds)],
                                    ['Damage per round', num(Math.round(detail.damage.perRound))],
                                    ...(detail.damage.share != null ? [['Share of your damage', pct(detail.damage.share)]] : []),
                                  ]}
                                  series={detail.damage.series}
                                  caption="damage per month"
                                  stroke="#fb923c"
                                />
                              )}
                              {w.mastery && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Mastery</p>
                                  <p className="text-sm text-gray-200">Level {w.mastery.level}</p>
                                  <p className="text-xs text-gray-400 tabular-nums">{num(w.mastery.xp)} XP</p>
                                  <p className="text-[11px] text-gray-500 mt-1.5">
                                    Shown as the export records it. Embark adds new mastery levels at some season starts, so there is no maximum to measure this against.
                                  </p>
                                </div>
                              )}
                              {!detail?.kills && !detail?.damage && (
                                <p className="text-xs text-gray-500">
                                  {w.id === '0'
                                    ? 'Kills and damage your export didn’t attribute to any item.'
                                    : w.unknown
                                      ? 'This id isn’t in the vault’s item table and your export’s key file doesn’t name it.'
                                      : 'No kills or damage on record for this item.'}
                                </p>
                              )}
                              {(detail?.kills || detail?.damage) && w.id === '0' && (
                                <p className="text-xs text-gray-500 sm:col-span-2 lg:col-span-3">Kills and damage your export didn’t attribute to any item.</p>
                              )}
                              {(detail?.kills || detail?.damage) && w.unknown && (
                                <p className="text-xs text-gray-500 sm:col-span-2 lg:col-span-3">This id isn’t in the vault’s item table and your export’s key file doesn’t name it.</p>
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
          {query.trim() && <SearchEcho value={query} onClear={() => setQuery('')} focusRef={searchRef} />}
        </>
      )}

      <Note>
        {damage.has || mastery.has ? (
          <>
            Kills are summed from every round’s <code>KillsPerItem</code>
            {damage.has ? (
              <>
                , damage from <code>DamagePerItem</code>. Per-item damage leaves a small remainder unattributed, so it sits a little below the damage total on Career.
                {damage.rounds < damage.totalRounds && <> Damage is recorded on {num(damage.rounds)} of your {num(damage.totalRounds)} rounds.</>}
              </>
            ) : (
              '.'
            )}{' '}
            Round counts are rounds where the item got a kill or did damage, not rounds it was equipped; Loadouts has that. “No item recorded” collects what the
            export credits to no item.{' '}
            {mastery.has && (
              <>
                Mastery level and XP come from the <code>RankBucket</code> progression rows, shown as recorded. The export gives no XP thresholds and Embark adds
                levels at some season starts, so there is no progress bar and no maximum. A dash in Mastery means the export has no mastery row for that item.{' '}
              </>
            )}
            Dimmed rows have nothing recorded. Bars compare an item with the largest value in its section. Deaths are not attributed to a weapon, so there is no
            per-weapon K/D; the Breakdown page has K/D by class, map and mode.
          </>
        ) : (
          <>
            Kills are summed from every round’s <code>KillsPerItem</code>. This export generation records no per-weapon damage or mastery, and deaths are not
            attributed to a weapon, so there is no per-weapon K/D. Dimmed rows never scored a kill credit.
          </>
        )}
      </Note>
    </div>
  );
};
