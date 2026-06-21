import { useMemo, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Badge, EmptyState, Note } from '../components/ui';
import { num } from '../lib/format';

const FILTERS = ['All', 'Light', 'Medium', 'Heavy', 'Global'];
const archTone = { Light: 'blue', Medium: 'emerald', Heavy: 'red', Global: 'gray', Unknown: 'gray' };

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

export const WeaponsPage = () => {
  const { model } = useVaultData();
  const { weapons } = model;
  const [filter, setFilter] = useState('All');

  const list = useMemo(
    () => (filter === 'All' ? weapons : weapons.filter((w) => w.archetype === filter)),
    [weapons, filter]
  );
  const maxKills = list[0]?.kills || 1;
  const totalKills = useMemo(() => weapons.reduce((s, w) => s + w.kills, 0), [weapons]);

  // Show off the icons with a top-3 podium, then the full ranked list below.
  const podium = list.slice(0, 3);

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        icon={Crosshair}
        title="Weapons"
        subtitle={`${num(totalKills)} eliminations across ${weapons.length} items`}
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

      {list.length === 0 ? (
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

          {/* Full ranked list */}
          <div className="space-y-1.5">
            {list.map((w, i) => (
              <div key={w.id} className="bg-gray-800 rounded-xl p-2.5 pr-3 flex items-center gap-3">
                <span className={`w-6 text-center text-sm font-bold ${rankClass(i)}`}>{i + 1}</span>
                <WeaponThumb w={w} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold truncate ${w.unknown ? 'text-gray-500 italic' : 'text-white'}`}>{w.name}</span>
                    <Badge tone={archTone[w.archetype] || 'gray'}>{w.archetype}</Badge>
                    {w.type !== 'Weapon' && <span className="text-[10px] uppercase tracking-wide text-gray-500">{w.type}</span>}
                  </div>
                  <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${(w.kills / maxKills) * 100}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0 w-14">
                  <span className="block text-white font-bold tabular-nums leading-none">{num(w.kills)}</span>
                  <span className="text-[10px] text-gray-500">kills</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Note>
        Kills are summed from every round’s <code>KillsPerItem</code>. The export records kills only — there is no
        per-weapon K/D, damage or accuracy (deaths aren’t attributed to a weapon; those stats live on the in-game career
        screen). For real K/D by class, map and mode see the Breakdown page.
      </Note>
    </div>
  );
};
