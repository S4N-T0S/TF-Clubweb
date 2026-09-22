import { useMemo, useRef, useState } from 'react';
import { Panel, StatCard, Badge, Note } from './ui';
import { ListSearch, SearchEcho } from './ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import { Pagination } from '../../components/Pagination';
import { num, date } from '../lib/format';

const PER_PAGE = 15;
const ARCH_TONE = { Light: 'blue', Medium: 'emerald', Heavy: 'red' };

const Names = ({ names }) =>
  names.length === 0 ? (
    <span className="text-gray-600">none</span>
  ) : (
    names.map((n, i) => (
      <span key={i}>
        {i > 0 && ', '}
        {n ?? <span className="text-gray-600">item not found in this export</span>}
      </span>
    ))
  );

// Named inventory (2026-09+ exports). Older exports only know item types and keep
// the count grid in PurchasesPage.
export const InventoryBrowser = ({ inventory }) => {
  const { items, packs, categories } = inventory;
  const [type, setType] = useState('All');
  const [page, setPage] = useState(1);
  const searchRef = useRef(null);

  const chips = useMemo(() => categories.filter((c) => items.some((it) => it.type === c.type)), [categories, items]);
  const inType = useMemo(() => (type === 'All' ? items : items.filter((it) => it.type === type)), [items, type]);
  const { query, setQuery, filtered: shown } = useListSearch(inType, (it) => [it.name, it.label], () => setPage(1));

  const totalPages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PER_PAGE;
  const slice = shown.slice(start, start + PER_PAGE);
  const showAmount = useMemo(() => inType.some((it) => it.amount > 1), [inType]);
  const outfits = packs.filter((p) => p.slots.length || p.spray.length || p.emotes.length);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Items you own" value={num(items.length)} />
        <StatCard label="Categories" value={num(chips.length)} />
        <StatCard label="Collecting since" value={date(inventory.firstMs)} sub="oldest item on record" />
      </div>

      {outfits.length > 0 && (
        <Panel title={`Saved outfits (${num(outfits.length)})`}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {outfits.map((p) => (
              <div key={p.id} className="bg-gray-900/50 rounded-lg p-3 min-w-0">
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="truncate">{p.title}</span>
                  {p.archetype && <Badge tone={ARCH_TONE[p.archetype] || 'gray'}>{p.archetype}</Badge>}
                </p>
                <dl className="mt-2 space-y-1 text-xs">
                  {[...p.slots, { label: 'Spray', names: p.spray }, { label: 'Emote wheel', names: p.emotes }].map((s) => (
                    <div key={s.label} className="flex gap-2">
                      <dt className="text-gray-500 w-28 shrink-0">{s.label}</dt>
                      <dd className="text-gray-300 min-w-0 wrap-break-word">
                        <Names names={s.names} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <Note>The weapons and gadgets saved with each of these are on the Loadouts page.</Note>
        </Panel>
      )}

      <Panel
        title={`Items you own (${num(items.length)})`}
        action={
          <ListSearch
            value={query}
            onChange={setQuery}
            placeholder="Search item or category…"
            matched={shown.length}
            total={inType.length}
            className="w-full sm:w-72"
            inputRef={searchRef}
          />
        }
      >
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {[{ type: 'All', label: 'All', count: items.length }, ...chips].map((c) => (
            <button
              key={c.type}
              onClick={() => {
                setType(c.type);
                setPage(1);
              }}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                type === c.type ? 'bg-emerald-600 text-white' : 'bg-gray-900/60 text-gray-400 hover:text-white'
              }`}
            >
              {c.label} <span className="opacity-70 tabular-nums">{num(c.count)}</span>
            </button>
          ))}
        </div>

        <div className="table-container" style={totalPages > 1 ? { minHeight: PER_PAGE * 38 } : undefined}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 px-3 font-medium">Item</th>
                <th className="text-left py-2 px-3 font-medium">Category</th>
                {showAmount && <th className="text-right py-2 px-3 font-medium">Amount</th>}
                <th className="text-left py-2 px-3 font-medium">Acquired</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((it, i) => (
                <tr key={start + i} className="border-b border-gray-700/40 last:border-0">
                  <td className={`py-2 px-3 ${it.internal ? 'font-mono text-xs text-gray-500' : 'text-gray-200'}`}>{it.name}</td>
                  <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{it.label}</td>
                  {showAmount && <td className="py-2 px-3 text-right tabular-nums text-gray-300">{it.amount > 1 ? num(it.amount) : ''}</td>}
                  <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{date(it.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {query.trim() && shown.length === 0 && <p className="text-sm text-gray-500 py-3">No items match “{query.trim()}”.</p>}

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <SearchEcho value={query} onClear={() => setQuery('')} focusRef={searchRef} />
          {shown.length > 0 && (
            <div className="flex-1">
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                startIndex={start}
                endIndex={start + PER_PAGE}
                totalItems={shown.length}
                onPageChange={setPage}
                edgeScroll={false}
                variant="compact"
              />
            </div>
          )}
        </div>

        <Note>
          Names and dates come from your <code>InventoryItem</code> records. Some are Embark’s internal labels rather than
          what the game shows, for example “Type {'{0}'}” or “HoverCar_01”, and those are set in grey monospace.
        </Note>
      </Panel>
    </>
  );
};
