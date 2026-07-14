import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, LineChart } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, EmptyState, Note } from '../components/ui';
import { careerModeGroup, CAREER_MODE_GROUPS } from '../lib/gameMeta';
import { SEASONS, seasonsInRange } from '../lib/seasons';
import { num } from '../lib/format';

const MODE_TABS = ['All modes', ...CAREER_MODE_GROUPS, 'Other'];
const WEEK_MS = 7 * 24 * 3600 * 1000;

// A bucket below this many rounds renders hollow: too few rounds to read as form.
const GRAINS = [
  { key: 'month', label: 'Monthly', lowSample: 50 },
  { key: 'week', label: 'Weekly', lowSample: 15 },
  { key: 'season', label: 'Season', lowSample: 50 },
];

const bucketOf = (ms, grain) => {
  if (grain === 'week') {
    const k = Math.floor(ms / WEEK_MS);
    return { key: k, start: k * WEEK_MS };
  }
  if (grain === 'season') {
    let s = SEASONS[0];
    for (const x of SEASONS) if (x.startMs <= ms) s = x;
    return { key: s.n, start: s.startMs, label: s.label };
  }
  const d = new Date(ms);
  return { key: d.getUTCFullYear() * 12 + d.getUTCMonth(), start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) };
};

const bucketLabel = (b, grain) =>
  b.label ??
  new Date(b.start).toLocaleDateString(undefined, grain === 'week'
    ? { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }
    : { month: 'short', year: '2-digit', timeZone: 'UTC' });

// Every metric here is per-round-normalized so months with different playtime
// compare fairly. All are higher-is-better except volume, which is neutral.
const METRICS = [
  { key: 'kd', label: 'K/D ratio', calc: (b) => (b.deaths ? b.kills / b.deaths : b.kills), fmt: (v) => v.toFixed(2) },
  { key: 'kpr', label: 'Kills / round', calc: (b) => b.kills / b.rounds, fmt: (v) => v.toFixed(1) },
  { key: 'win', label: 'Round win rate', calc: (b) => (100 * b.wins) / b.rounds, fmt: (v) => `${Math.round(v)}%` },
  { key: 'dmg', label: 'Damage / round', calc: (b) => b.damage / b.rounds, fmt: (v) => num(Math.round(v)) },
  { key: 'rev', label: 'Revives / round', calc: (b) => b.revives / b.rounds, fmt: (v) => v.toFixed(1) },
  { key: 'vol', label: 'Rounds played', calc: (b) => b.rounds, fmt: (v) => num(Math.round(v)), neutral: true },
];

const ZERO = { rounds: 0, kills: 0, deaths: 0, wins: 0, damage: 0, revives: 0 };
const NO_ROUNDS = [];
const mergeBuckets = (arr) =>
  arr.reduce((a, b) => ({
    rounds: a.rounds + b.rounds, kills: a.kills + b.kills, deaths: a.deaths + b.deaths,
    wins: a.wins + b.wins, damage: a.damage + b.damage, revives: a.revives + b.revives,
  }), ZERO);

const DeltaChip = ({ delta, neutral }) => {
  if (delta == null || !Number.isFinite(delta)) return null;
  const up = delta >= 0.5;
  const down = delta <= -0.5;
  const cls = neutral || (!up && !down)
    ? 'text-gray-300 bg-gray-700/60'
    : up ? 'text-emerald-300 bg-emerald-600/15' : 'text-red-300 bg-red-600/15';
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full tabular-nums ${cls}`}>
      <Icon className="w-3 h-3" />
      {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
    </span>
  );
};

const Spark = ({ pts }) => {
  if (pts.length < 2) return <div className="h-10" />;
  const vs = pts.map((p) => p.v);
  const min = Math.min(...vs);
  const span = Math.max(...vs) - min || 1;
  const line = pts.map((p, i) => `${((i / (pts.length - 1)) * 100).toFixed(2)},${(90 - ((p.v - min) / span) * 80).toFixed(2)}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-10">
      <polyline points={line} fill="none" stroke="#34d399" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

// The expanded explorer chart: SVG lines in percent space (strokes non-scaling,
// like the Purchases BalanceChart), season markers and data dots as HTML overlays
// so nothing distorts under preserveAspectRatio="none".
const Explorer = ({ metric, buckets, grain, lowSample, lifetime }) => {
  const pts = buckets.map((b) => ({ start: b.start, v: metric.calc(b), n: b.rounds, label: bucketLabel(b, grain) }));
  if (pts.length < 2) {
    return <Note>Not enough {grain === 'season' ? 'seasons' : grain + 's'} with rounds in this mode to draw a trend.</Note>;
  }
  const lifetimeVal = lifetime.rounds ? (metric.key === 'vol' ? lifetime.rounds / pts.length : metric.calc(lifetime)) : null;
  const minT = pts[0].start;
  const spanT = pts[pts.length - 1].start - minT || 1;
  const vs = pts.map((p) => p.v);
  let min = Math.min(...vs, lifetimeVal ?? Infinity);
  let max = Math.max(...vs, lifetimeVal ?? -Infinity);
  if (min === max) { min -= 1; max += 1; }
  const X = (t) => ((t - minT) / spanT) * 100;
  const Y = (v) => 88 - ((v - min) / (max - min)) * 76;
  const line = pts.map((p) => `${X(p.start).toFixed(2)},${Y(p.v).toFixed(2)}`).join(' ');
  const roll = pts.map((p, i) => {
    const w = pts.slice(Math.max(0, i - 3), i + 1);
    return `${X(p.start).toFixed(2)},${Y(w.reduce((s, q) => s + q.v, 0) / w.length).toFixed(2)}`;
  }).join(' ');
  const seasonMarks = grain === 'season' ? [] : seasonsInRange(minT, pts[pts.length - 1].start);

  return (
    <div>
      <div className="relative h-56 bg-gray-900/50 rounded-lg">
        {seasonMarks.map((s) => (
          <div key={s.n} className="absolute top-0 bottom-0 border-l border-dashed border-gray-600/50" style={{ left: `${X(s.startMs)}%` }}>
            <span className="absolute top-0.5 left-1 text-[10px] text-gray-500">{s.label}</span>
          </div>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {lifetimeVal != null && (
            <line x1="0" x2="100" y1={Y(lifetimeVal).toFixed(2)} y2={Y(lifetimeVal).toFixed(2)} stroke="#fbbf24" strokeWidth="1" strokeDasharray="1 4" vectorEffect="non-scaling-stroke" opacity="0.65" />
          )}
          <polyline points={roll} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" opacity="0.7" />
          <polyline points={line} fill="none" stroke="#34d399" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {pts.map((p) => (
          <span
            key={p.start}
            title={`${p.label} · ${metric.fmt(p.v)} · ${num(p.n)} ${p.n === 1 ? 'round' : 'rounds'}${p.n < lowSample ? ' (low sample)' : ''}`}
            className={`absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 ${p.n < lowSample ? 'bg-gray-900 ring-2 ring-emerald-400/90' : 'bg-emerald-400'}`}
            style={{ left: `${X(p.start)}%`, top: `${Y(p.v)}%` }}
          />
        ))}
        <span className="absolute left-1.5 top-0.5 text-[10px] text-gray-500 tabular-nums">{metric.fmt(max)}</span>
        <span className="absolute left-1.5 bottom-0.5 text-[10px] text-gray-500 tabular-nums">{metric.fmt(min)}</span>
        {lifetimeVal != null && metric.key !== 'vol' && (
          <span className="absolute right-1.5 text-[10px] text-amber-300/90 tabular-nums" style={{ top: `calc(${Y(lifetimeVal).toFixed(2)}% - 14px)` }}>
            lifetime {metric.fmt(lifetimeVal)}
          </span>
        )}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-500">
        <span>{pts[0].label}</span>
        <span className="hidden sm:inline">
          <span className="text-emerald-400">━</span> per {grain === 'season' ? 'season' : grain} · <span className="text-gray-400">┅</span> 4-{grain} average ·
          <span className="inline-block w-2 h-2 rounded-full bg-gray-900 ring-2 ring-emerald-400/90 align-middle mx-1" /> under {lowSample} rounds
        </span>
        <span>{pts[pts.length - 1].label}</span>
      </div>
    </div>
  );
};

export const TrendsPage = () => {
  const { model } = useVaultData();
  const rounds = model.rounds ?? NO_ROUNDS;
  const [modePick, setModePick] = useState(null);
  const [grainKey, setGrainKey] = useState('month');
  const [metricKey, setMetricKey] = useState('kd');
  const grain = GRAINS.find((g) => g.key === grainKey) || GRAINS[0];

  // Default tab = the mode group you actually play the most.
  const defaultMode = useMemo(() => {
    const counts = new Map();
    for (const r of rounds) {
      const g = careerModeGroup(r.mode);
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    let best = 'All modes';
    let bx = 0;
    for (const [g, c] of counts) if (c > bx) { bx = c; best = g; }
    return best;
  }, [rounds]);
  const mode = modePick ?? defaultMode;

  const buckets = useMemo(() => {
    const map = new Map();
    for (const r of rounds) {
      if (mode !== 'All modes' && careerModeGroup(r.mode) !== mode) continue;
      const t = r.start ?? r.end;
      if (!t) continue;
      const b = bucketOf(t, grain.key);
      let e = map.get(b.key);
      if (!e) {
        e = { ...ZERO, key: b.key, start: b.start, label: b.label };
        map.set(b.key, e);
      }
      e.rounds += 1;
      e.kills += r.kills || 0;
      e.deaths += r.deaths || 0;
      e.wins += r.roundWon ? 1 : 0;
      e.damage += r.damage || 0;
      e.revives += r.revives || 0;
    }
    return [...map.values()].sort((a, b) => a.start - b.start);
  }, [rounds, mode, grain.key]);

  const lifetime = useMemo(() => mergeBuckets(buckets), [buckets]);

  // Card value = your last 3 active buckets merged; delta vs the 3 before that.
  const cards = useMemo(
    () =>
      METRICS.map((m) => {
        const pts = buckets.map((b) => ({ v: m.calc(b) }));
        const val = (arr) => {
          if (!arr.length) return null;
          const v = m.calc(mergeBuckets(arr));
          return m.key === 'vol' ? v / arr.length : v;
        };
        const recent = val(buckets.slice(-3));
        const prev = val(buckets.slice(-6, -3));
        const delta = recent != null && prev ? ((recent - prev) / prev) * 100 : null;
        return { ...m, pts, recent, delta };
      }),
    [buckets]
  );

  const metric = METRICS.find((m) => m.key === metricKey) || METRICS[0];

  return (
    <div className="animate-fade-in-up">
      <PageHeader icon={LineChart} title="Trends" subtitle="How your game has changed over time, per mode" />

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          {MODE_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setModePick(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === t ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0">
          {GRAINS.map((g) => (
            <button
              key={g.key}
              onClick={() => setGrainKey(g.key)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                grainKey === g.key ? 'bg-gray-700 text-white' : 'bg-gray-800/60 text-gray-400 hover:text-white'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {buckets.length === 0 ? (
        <EmptyState icon={LineChart} title="No rounds in this mode" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {cards.map((c) => (
              <button
                key={c.key}
                onClick={() => setMetricKey(metricKey === c.key ? null : c.key)}
                className={`text-left bg-gray-800 rounded-xl p-3 transition-shadow ring-inset ${
                  metricKey === c.key ? 'ring-2 ring-emerald-500/80' : 'ring-1 ring-white/5 hover:ring-white/15'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-400">{c.label}</span>
                  <DeltaChip delta={c.delta} neutral={c.neutral} />
                </div>
                <p className="text-xl font-bold text-white tabular-nums mt-0.5">{c.recent != null ? c.fmt(c.recent) : '—'}</p>
                <Spark pts={c.pts} />
              </button>
            ))}
          </div>

          {metric && metricKey && (
            <div className="bg-gray-800 rounded-xl p-4 ring-1 ring-inset ring-white/5 mb-4">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-white">
                  {metric.label} <span className="text-gray-500 font-normal">· {mode} · {grain.label.toLowerCase()}</span>
                </p>
              </div>
              <Explorer metric={metric} buckets={buckets} grain={grain.key} lowSample={grain.lowSample} lifetime={lifetime} />
            </div>
          )}
        </>
      )}

      <Note>
        Card values are your last 3 active {grain.key === 'season' ? 'seasons' : grain.key + 's'} merged, compared against
        the 3 before. Hollow dots mark buckets under {grain.lowSample} rounds — treat those swings as noise, not form.
        Modes are kept separate on purpose: a Team Deathmatch round yields far more kills than a Cashout round, so the
        blended “All modes” view shifts whenever your mode mix does.
      </Note>
    </div>
  );
};
