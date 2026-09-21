import { useState } from 'react';
import { Layers } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, Badge, Note } from '../components/ui';
import { ItemIcon } from '../components/MatchParts';
import { archetypeLabel } from '../lib/gameMeta';
import { num, hours, decimal, date } from '../lib/format';

const archTone = { Light: 'blue', Medium: 'emerald', Heavy: 'red' };

// Derive a class-usage split: prefer the summary's TimePlayedByArchetype,
// otherwise fall back to per-class kill share from weaponsByArchetype.
// Per-class K/D comes from the per-round breakdown.
function useClassUsage(model) {
  const kdByArch = Object.fromEntries(model.breakdowns.byArchetype.map((s) => [s.label, s]));
  const withStats = (r) => ({ ...r, kd: kdByArch[r.arch]?.kd, highestKills: kdByArch[r.arch]?.highestKills });

  const byArchMs = model.career.total.timeByArchetype;
  if (byArchMs && Object.keys(byArchMs).length) {
    const rows = Object.entries(byArchMs).map(([raw, ms]) => ({ arch: archetypeLabel(raw), ms }));
    const total = rows.reduce((s, r) => s + (r.ms || 0), 0) || 1;
    return { unit: 'time', rows: rows.map((r) => withStats({ ...r, share: (r.ms || 0) / total })).sort((a, b) => b.ms - a.ms) };
  }
  const rows = ['Light', 'Medium', 'Heavy'].map((arch) => ({
    arch,
    kills: (model.weaponsByArchetype[arch] || []).reduce((s, w) => s + w.kills, 0),
  }));
  const total = rows.reduce((s, r) => s + r.kills, 0) || 1;
  return { unit: 'kills', rows: rows.map((r) => withStats({ ...r, share: r.kills / total })).sort((a, b) => b.kills - a.kills) };
}

// Win rate over a handful of rounds is noise, so it is withheld below this.
const MIN_ROUNDS_FOR_WIN_RATE = 10;
const pct0 = (v) => `${Math.round(v * 100)}%`;

const EquippedRow = ({ it }) => (
  <li className="flex items-center gap-2.5">
    <ItemIcon it={it} className="w-8 h-8" />
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-white truncate">{it.name}</span>
        <span className="text-xs text-gray-400 tabular-nums shrink-0">{num(it.rounds)}</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mt-1">
        <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${Math.max(2, it.pickRate * 100)}%` }} />
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5">
        {pct0(it.pickRate)} of rounds
        {it.rounds >= MIN_ROUNDS_FOR_WIN_RATE && <span className="text-gray-400"> · {pct0(it.winRate)} won</span>}
      </p>
    </div>
  </li>
);

const EquippedLoadouts = ({ loadouts }) => {
  const classes = ['Light', 'Medium', 'Heavy'].filter((c) => loadouts.byClass[c].rounds > 0);
  const [picked, setPicked] = useState(null);
  const cls = classes.includes(picked) ? picked : [...classes].sort((a, b) => loadouts.byClass[b].rounds - loadouts.byClass[a].rounds)[0];
  if (!cls) return null;
  const c = loadouts.byClass[cls];
  const columns = [
    { title: 'Specialization', items: c.specs },
    { title: 'Weapon', items: c.weapons },
    { title: 'Gadgets', items: c.gadgets },
  ];
  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {classes.map((name) => (
          <button
            key={name}
            onClick={() => setPicked(name)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              name === cls ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {name}
          </button>
        ))}
        <span className="shrink-0 text-xs text-gray-500 ml-1">
          {num(c.rounds)} rounds · {pct0(c.winRate)} won
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {columns.map((col) => (
          <Panel key={col.title} title={col.title} className="p-4!">
            {col.items.length === 0 ? (
              <p className="text-xs text-gray-500">Nothing recorded.</p>
            ) : (
              <ul className="space-y-3">
                {col.items.map((it) => (
                  <EquippedRow key={it.id} it={it} />
                ))}
              </ul>
            )}
          </Panel>
        ))}
      </div>

      {c.builds.length > 0 && (
        <Panel title={`Most-played ${cls} builds`}>
          <ul className="space-y-3">
            {c.builds.map((b) => (
              <li key={b.key} className="flex items-center gap-3 flex-wrap">
                <span className="flex gap-1.5">
                  {b.items.map((it) => (
                    <ItemIcon key={it.id} it={it} className="w-9 h-9 sm:w-10 sm:h-10" />
                  ))}
                </span>
                <span className="text-xs text-gray-400 min-w-0 flex-1">
                  <span className="text-gray-200 block truncate">{b.items.map((it) => it.name).join(' · ')}</span>
                  {num(b.rounds)} rounds
                  {b.rounds >= MIN_ROUNDS_FOR_WIN_RATE && ` · ${pct0(b.winRate)} won`}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-3">
            {num(c.distinctBuilds)} different {cls} builds on record.
          </p>
        </Panel>
      )}
    </>
  );
};

const Gear = ({ label, items }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">{label}</p>
    <div className="flex gap-1.5 flex-wrap">
      {items.map((it) => (it.name ? <ItemIcon key={it.id} it={it} /> : <span key={it.id} className="text-xs text-gray-600">item not found in this export</span>))}
    </div>
    <p className="text-xs text-gray-400 mt-1.5">{items.map((it) => it.name).filter(Boolean).join(' · ')}</p>
  </div>
);

export const LoadoutsPage = () => {
  const { model } = useVaultData();
  const usage = useClassUsage(model);
  const { loadouts } = model;
  const builds = model.inventory.packs.filter((p) => p.equipped.length || p.reserve.length);

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader icon={Layers} title="Loadouts" subtitle="How you played each class" />

      <Panel title={usage.unit === 'time' ? 'Class usage (by playtime)' : 'Class usage (by kill share)'}>
        <div className="space-y-3">
          {usage.rows.map((r) => (
            <div key={r.arch} className="flex items-center gap-3">
              <span className="w-16 text-sm text-white">{r.arch}</span>
              <div className="flex-1 h-2.5 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${r.share * 100}%` }} />
              </div>
              <span className="w-44 text-right text-xs text-gray-400">
                {(r.share * 100).toFixed(1)}%{usage.unit === 'time' ? ` · ${hours(r.ms)}` : ` · ${num(r.kills)} kills`}
                {r.kd != null && <span className="text-emerald-400"> · K/D {decimal(r.kd)}</span>}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      {builds.length > 0 && (
        <Panel title={`Saved builds (${num(builds.length)})`}>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {builds.map((p) => (
              <div key={p.id} className="bg-gray-900/50 rounded-lg p-3 space-y-3 min-w-0">
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="truncate">{p.title}</span>
                  {p.archetype && <Badge tone={archTone[p.archetype] || 'gray'}>{p.archetype}</Badge>}
                  {p.active && <Badge tone="yellow">Selected</Badge>}
                </p>
                {p.equipped.length > 0 && <Gear label="Equipped" items={p.equipped} />}
                {p.reserve.length > 0 && <Gear label="Reserve" items={p.reserve} />}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">The builds saved on your account when the export was made, with the reserve you can swap in during a match.</p>
        </Panel>
      )}

      {loadouts.has && <EquippedLoadouts loadouts={loadouts} />}

      {!loadouts.has && (
        <div className="grid lg:grid-cols-3 gap-4">
          {['Light', 'Medium', 'Heavy'].map((arch) => {
            const weapons = (model.weaponsByArchetype[arch] || []).filter((w) => w.type === 'Weapon' || w.type === 'Spec').slice(0, 6);
            return (
              <Panel key={arch} title={`Top ${arch} weapons`} className="p-4!">
                {weapons.length === 0 ? (
                  <p className="text-xs text-gray-500">No recorded kills on this class.</p>
                ) : (
                  <ol className="space-y-2">
                    {weapons.map((w, i) => (
                      <li key={w.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="text-gray-500 w-4">{i + 1}</span>
                          <span className="text-white">{w.name}</span>
                          {w.type === 'Spec' && <Badge tone="purple">Spec</Badge>}
                        </span>
                        <span className="text-gray-400 tabular-nums">{num(w.kills)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="mt-3 pt-2 border-t border-gray-700">
                  <Badge tone={archTone[arch]}>{arch}</Badge>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Note>
        {loadouts.has
          ? `Your export records one loadout per round, for ${num(loadouts.rounds)} of your ${num(loadouts.totalRounds)} rounds${loadouts.firstMs ? ` (from ${date(loadouts.firstMs)})` : ''}. It is a single snapshot: you can swap items from your reserve during a match, so it is not everything you used.${loadouts.coverage != null ? ` ${pct0(loadouts.coverage)} of your kills in those rounds came from an item in the recorded loadout.` : ''} Win rates are shown from ${MIN_ROUNDS_FOR_WIN_RATE} rounds up, and say how those rounds went, not that the item caused it.`
          : 'The export doesn’t store loadout configurations — InventoryItem records carry no item IDs, so exact saved loadouts can’t be reconstructed. This page approximates your loadouts from how much you played each class and which weapons you actually got kills with.'}
      </Note>
    </div>
  );
};
