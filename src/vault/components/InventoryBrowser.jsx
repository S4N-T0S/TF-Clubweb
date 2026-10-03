import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel, StatCard, Note } from './ui';
import { ListSearch, SearchEcho } from './ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import { Pagination } from '../../components/Pagination';
import { num, date } from '../lib/format';
import { VAULT_BASE } from '../../constants';

const PER_PAGE = 15;

// Named inventory (2026-09+ exports) on Purchases: the counts, and the rows that are not cosmetics.
// Cosmetics and saved contestants are on the Collection page. Older exports keep the count grid in PurchasesPage.
export const InventoryBrowser = ({ inventory }) => {
  const { items: all, categories } = inventory;
  const items = useMemo(() => all.filter((it) => !it.klass), [all]);
  const [type, setType] = useState('All');
  const [page, setPage] = useState(1);
  const searchRef = useRef(null);

  const allTypes = useMemo(() => categories.filter((c) => all.some((it) => it.type === c.type)).length, [categories, all]);
  const chips = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      const c = m.get(it.type);
      if (c) c.count += 1;
      else m.set(it.type, { type: it.type, label: it.label, count: 1 });
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [items]);
  const inType = useMemo(() => (type === 'All' ? items : items.filter((it) => it.type === type)), [items, type]);
  const { query, setQuery, filtered: shown } = useListSearch(inType, (it) => [it.name, it.label], () => setPage(1));

  const totalPages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PER_PAGE;
  const slice = shown.slice(start, start + PER_PAGE);
  const showAmount = useMemo(() => inType.some((it) => it.amount !== 1), [inType]);
  const collection = <Link to={`${VAULT_BASE}/collection`} className="text-emerald-400 hover:underline">Collection page</Link>;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Items you own" value={num(all.length)} />
        <StatCard label="Categories" value={num(allTypes)} />
        <StatCard label="Collecting since" value={date(inventory.firstMs)} sub="oldest item on record" />
      </div>

      {items.length === 0 ? (
        <Note>Every named item in this export is a cosmetic. They are on the {collection}, with your saved contestants.</Note>
      ) : (
        <Panel
          title={`Other items you own (${num(items.length)})`}
          action={
            <ListSearch value={query} onChange={setQuery} placeholder="Search item or category…" matched={shown.length} total={inType.length} className="w-full sm:w-72" inputRef={searchRef} />
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
                    {showAmount && <td className="py-2 px-3 text-right tabular-nums text-gray-300">{it.amount !== 1 ? num(it.amount) : ''}</td>}
                    <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{it.before ? `by ${date(it.ms)}` : date(it.ms)}</td>
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
                <Pagination currentPage={safePage} totalPages={totalPages} startIndex={start} endIndex={start + PER_PAGE} totalItems={shown.length} onPageChange={setPage} edgeScroll={false} variant="compact" />
              </div>
            )}
          </div>

          <Note>
            Names and dates come from your <code>InventoryItem</code> records.
            {items.some((it) => it.internal) && ' Some are Embark’s internal labels rather than what the game shows, and those are set in grey monospace.'}
            {items.some((it) => it.before) && ' A date marked “by” is the earliest time the row was written, because a later migration replaced its creation date.'}
            {inventory.copies?.rows > 0 &&
              ` Preview builds keep their own copy of the inventory, so ${num(inventory.copies.rows)} rows from ${num(inventory.copies.blocks)} preview ${inventory.copies.blocks === 1 ? 'copy' : 'copies'} are left out.`}
            {' '}Your cosmetics and your saved contestants are on the {collection}.
          </Note>
        </Panel>
      )}
    </>
  );
};
