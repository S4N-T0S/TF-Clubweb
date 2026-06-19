import { useMemo, useState } from 'react';
import { BarChart3, ArrowUp, ArrowDown } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Badge, Note, EmptyState } from '../components/ui';
import { num, decimal, pct, hours } from '../lib/format';

const categoryTone = { Ranked: 'yellow', 'World Tour': 'purple', Casual: 'blue', LTM: 'emerald', Other: 'gray' };

// Column definitions shared by all three tables (Maps / Modes / Classes).
const COLUMNS = [
  { key: 'label', label: 'Name', numeric: false },
  { key: 'rounds', label: 'Rounds', numeric: true, fmt: (r) => num(r.rounds) },
  { key: 'kd', label: 'K/D', numeric: true, fmt: (r) => decimal(r.kd), accent: true },
  { key: 'avgKills', label: 'Avg K', numeric: true, fmt: (r) => decimal(r.avgKills, 1) },
  { key: 'highestKills', label: 'Best', numeric: true, fmt: (r) => num(r.highestKills) },
  { key: 'winRate', label: 'Round Win%', numeric: true, fmt: (r) => pct(r.winRate) },
  { key: 'timeMs', label: 'Playtime', numeric: true, fmt: (r) => hours(r.timeMs) },
];

const StatTable = ({ rows, showCategory }) => {
  const [sort, setSort] = useState({ field: 'rounds', dir: 'desc' });

  const sorted = useMemo(() => {
    const arr = [...rows];
    const { field, dir } = sort;
    arr.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av || 0) - (bv || 0);
      return dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort]);

  const toggle = (field) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: field === 'label' ? 'asc' : 'desc' }));

  return (
    <div className="table-container bg-gray-800 rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => toggle(c.key)}
                className={`py-2.5 px-3 font-medium cursor-pointer select-none hover:text-white whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}
              >
                <span className="inline-flex items-center gap-1">
                  {c.numeric && sort.field === c.key && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  {c.label}
                  {!c.numeric && sort.field === c.key && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key} className="border-b border-gray-700/40 last:border-0 hover:bg-gray-700/30">
              {COLUMNS.map((c) => (
                <td key={c.key} className={`py-2.5 px-3 ${c.numeric ? 'text-right tabular-nums' : 'text-left'} ${c.accent ? 'text-emerald-400 font-semibold' : 'text-white'}`}>
                  {c.key === 'label' ? (
                    <span className="flex items-center gap-2">
                      {r.label}
                      {showCategory && r.category && <Badge tone={categoryTone[r.category] || 'gray'}>{r.category}</Badge>}
                    </span>
                  ) : (
                    c.fmt(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const TABS = [
  { key: 'byMap', label: 'Maps' },
  { key: 'byMode', label: 'Modes' },
  { key: 'byArchetype', label: 'Classes' },
];

export const BreakdownPage = () => {
  const { model } = useVaultData();
  const [tab, setTab] = useState('byMap');
  const rows = model.breakdowns[tab] || [];

  return (
    <div className="animate-fade-in-up">
      <PageHeader icon={BarChart3} title="Breakdown" subtitle="K/D, best kills, win rate and playtime per map, mode and class" />

      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="No data for this breakdown" />
      ) : (
        <StatTable rows={rows} showCategory={tab === 'byMode'} />
      )}

      <Note>
        Computed per-round, so K/D here is real per map / mode / class. Per-<em>weapon</em> K/D is not possible — the
        export records weapon kills but never per-weapon deaths. “Round Win%” counts rounds flagged won (tournament
        placement is on the Matches page).
      </Note>
    </div>
  );
};
