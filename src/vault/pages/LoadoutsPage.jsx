import { Layers } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, Badge, Note } from '../components/ui';
import { archetypeLabel } from '../lib/gameMeta';
import { num, hours, decimal } from '../lib/format';

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

export const LoadoutsPage = () => {
  const { model } = useVaultData();
  const usage = useClassUsage(model);

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

      <Note>
        The export doesn’t store loadout configurations — <code>InventoryItem</code> records carry no item IDs, so exact
        saved loadouts can’t be reconstructed. This page approximates your loadouts from how much you played each class
        and which weapons you actually got kills with.
      </Note>
    </div>
  );
};
