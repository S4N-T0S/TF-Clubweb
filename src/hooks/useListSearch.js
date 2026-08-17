import { useDeferredValue, useMemo, useRef, useState } from 'react';

// Substring search over a list, matching on whatever strings `fields` pulls off
// a row. The field itself lives in src/vault/components/ListSearch.jsx.
//
// Haystacks are cached per row, so a keystroke costs only the substring test —
// these lists run to a few thousand rows. Which means `fields` has to be pure:
// whatever it closes over on a row's first read is what sticks.
const makeHaystack = (fieldsRef) => {
  const cache = new WeakMap();
  return (row) => {
    let hay = cache.get(row);
    if (hay === undefined) {
      hay = fieldsRef.current(row).filter(Boolean).join(' ').toLowerCase();
      cache.set(row, hay);
    }
    return hay;
  };
};

// `onQueryChange` runs after every edit, so callers can drop back to page 1.
export const useListSearch = (items, fields, onQueryChange) => {
  const [query, setQuery] = useState('');
  // Filter off the deferred value so the keystroke lands first and the scan
  // runs at low priority. Costs nothing on a normal list; keeps typing smooth
  // on a CS PDF that failed to parse, where the whole document collapses into
  // one ticket row and its haystack is the entire transcript.
  const deferredQuery = useDeferredValue(query);

  // Refs, so an inline arrow at the call site doesn't bust the memo and rebuild
  // the cache every render.
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const changedRef = useRef(onQueryChange);
  changedRef.current = onQueryChange;

  const haystack = useMemo(() => makeHaystack(fieldsRef), []);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    // Same array back, not a copy — an idle search shouldn't invalidate
    // whatever memoises on it downstream.
    if (!needle) return items;
    // Dev-only tripwire for the purity rule above. Nothing in the linter can
    // see through the ref, so without this, adding something like a formatted
    // date to a `fields` list would just return stale results forever.
    if (import.meta.env.DEV && items.length) {
      const row = items[0];
      const fresh = fieldsRef.current(row).filter(Boolean).join(' ').toLowerCase();
      if (fresh !== haystack(row)) {
        console.warn('useListSearch: `fields` is not pure — cached haystacks are stale.', { row, fresh, cached: haystack(row) });
      }
    }
    return items.filter((row) => haystack(row).includes(needle));
  }, [items, deferredQuery, haystack]);

  const update = (next) => {
    setQuery(next);
    // Clamping alone leaves you mid-list in results whose first page you never saw.
    changedRef.current?.();
  };

  return { query, setQuery: update, filtered };
};
