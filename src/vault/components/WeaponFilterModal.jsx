import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Check } from 'lucide-react';
import { ALL_WEAPONS } from '../lib/weapons';
import { Badge } from './ui';

// Archetype display order + tone 
const ARCH_ORDER = ['Light', 'Medium', 'Heavy', 'Global'];
const ARCH_TONE = { Light: 'blue', Medium: 'emerald', Heavy: 'red', Global: 'gray' };

// A pick-tile for one weapon/gadget/spec
const WeaponTile = ({ w, on, onToggle }) => (
  <button
    type="button"
    onClick={() => onToggle(w.id)}
    aria-pressed={on}
    className={`relative flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${
      on ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-500'
    }`}
  >
    <span className="w-8 h-8 rounded-md overflow-hidden bg-linear-to-b from-gray-300 to-gray-400 ring-1 ring-black/25 flex items-center justify-center shrink-0">
      {w.icon ? (
        <img src={w.icon} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[7px] text-gray-700 text-center leading-tight px-0.5">{w.name}</span>
      )}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-xs text-gray-100 truncate">{w.name}</span>
      {w.type !== 'Weapon' && <span className="block text-[9px] uppercase tracking-wide text-gray-500">{w.type}</span>}
    </span>
    {on && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
  </button>
);

// Full-screen weapon picker. `selected` is a Set of content-ids
export const WeaponFilterModal = ({ selected, onToggle, onClear, onClose }) => {
  const [q, setQ] = useState('');

  const byArch = useMemo(() => {
    const groups = {};
    for (const w of ALL_WEAPONS) (groups[w.archetype] ||= []).push(w);
    return groups;
  }, []);

  const term = q.trim().toLowerCase();
  const matches = (w) => !term || w.name.toLowerCase().includes(term);

  return createPortal(
    <div className="fixed inset-0 z-70 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Filter matches by weapon">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl sm:mx-4 max-h-[85vh] bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-700 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-semibold">Filter by weapon</h2>
            <p className="text-xs text-gray-400">Show only matches where you got a kill with the items you pick.</p>
          </div>
          {selected.size > 0 && (
            <button onClick={onClear} className="text-xs text-gray-400 hover:text-white whitespace-nowrap">
              Clear ({selected.size})
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-700 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search weapons, gadgets, specializations…"
              className="w-full bg-gray-800 text-white rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 space-y-5">
          {ARCH_ORDER.map((arch) => {
            const items = (byArch[arch] || []).filter(matches);
            if (!items.length) return null;
            return (
              <div key={arch}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge tone={ARCH_TONE[arch] || 'gray'}>{arch === 'Global' ? 'Shared' : arch}</Badge>
                  <span className="text-xs text-gray-500">{items.length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {items.map((w) => (
                    <WeaponTile key={w.id} w={w} on={selected.has(w.id)} onToggle={onToggle} />
                  ))}
                </div>
              </div>
            );
          })}
          {ARCH_ORDER.every((a) => !(byArch[a] || []).some(matches)) && (
            <p className="text-sm text-gray-500 text-center py-6">No items match “{q}”.</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 flex justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
