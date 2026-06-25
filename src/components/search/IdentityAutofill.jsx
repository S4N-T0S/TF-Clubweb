import { useState, useEffect, useRef, useCallback } from 'react';
import { Users } from 'lucide-react';
import { searchAllPlayers } from '../../services/historicalDataService';
import { parseSearchQuery } from '../../utils/searchUtils';
import { MATCH_VIA_LABELS, seasonPill, rankToken, renderHighlighted } from './suggestionHelpers';

/**
 * The shared cross-season autofill dropdown. Owns the debounced searchIdentities
 * call, the stale-response guard, keyboard navigation, and the suggestion-row
 * grammar, so the SAME experience can mount under the SearchModal input AND the
 * GlobalView SearchBar (breaking the autofill silo). It binds to whatever input
 * `inputRef` points at, so it never needs the parent input to forward keydown —
 * which is why it works with the shared SearchBar without changing its contract.
 *
 * Selection always emits the FULL embarkId the API returns (suggestion.name), so
 * callers can safely route it through /history (which rejects partial queries).
 *
 * @param {string} query - the live value of the bound input.
 * @param {object} inputRef - ref to the input element to bind focus/keys to.
 * @param {(name:string)=>void} onSelect - called with a full embarkId on pick.
 * @param {(()=>void)} [onSubmitRaw] - Enter with no suggestions (e.g. run a raw search).
 * @param {Array|null} [currentSeasonData] - optional offline fallback list.
 * @param {string} [groupLabel] - heading shown above the suggestions.
 */
export const IdentityAutofill = ({
  query,
  inputRef,
  onSelect,
  onSubmitRaw,
  currentSeasonData = null,
  groupLabel = 'Matching players',
  suppressQuery = '',
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const [matchTerm, setMatchTerm] = useState(''); // the substring to highlight in rows

  const debounceRef = useRef(null);
  const blurTimerRef = useRef(null);
  const latestQueryRef = useRef('');
  // Refs mirror state/props so the input listeners (attached once) always read
  // the latest values without re-binding on every render.
  const suggestionsRef = useRef([]);
  const selectedIndexRef = useRef(-1);
  const onSelectRef = useRef(onSelect);
  const onSubmitRawRef = useRef(onSubmitRaw);
  suggestionsRef.current = suggestions;
  selectedIndexRef.current = selectedIndex;
  onSelectRef.current = onSelect;
  onSubmitRawRef.current = onSubmitRaw;

  const select = useCallback((s) => {
    if (!s) return;
    setSelectedIndex(-1);
    onSelectRef.current?.(s.name);
  }, []);

  // Debounced, stale-guarded suggestion fetch. Truly ALL-SEASONS: the API search
  // (S5-live) is merged with a client-side search over the bundled static JSON
  // (OB-S9 + the live season), deduped by name with the API preferred. Works
  // offline too (the client half needs no network).
  useEffect(() => {
    const q = (query || '').trim();
    if (q.length < 2 || !isFocused || q === (suppressQuery || '').trim()) {
      setSuggestions([]);
      setSelectedIndex(-1);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      latestQueryRef.current = q;
      const merged = await searchAllPlayers(q, currentSeasonData, 8);
      if (latestQueryRef.current !== q) return; // user kept typing
      const parsed = parseSearchQuery(q);
      setMatchTerm(parsed.nameQuery || parsed.clubQuery || q);
      setSuggestions(merged);
      setSelectedIndex(-1);
    }, 200);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, currentSeasonData, isFocused, suppressQuery]);

  // Bind focus + keyboard navigation to the external input. Attaching natively
  // (rather than via a parent onKeyDown prop) lets this work with the shared
  // SearchBar untouched. Listeners are attached once; callbacks read from refs.
  useEffect(() => {
    const el = inputRef?.current;
    if (!el) return;

    // Capture the already-focused state on mount: when this component is mounted
    // lazily (e.g. the GlobalView toggle was just switched on while the input is
    // focused), the 'focus' event has already fired and won't fire again.
    setIsFocused(document.activeElement === el);

    // Cancel any pending blur-close so a quick re-focus keeps the list visible.
    const onFocus = () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); setIsFocused(true); };
    // Delay so a click on a suggestion (which blurs the input) still registers.
    const onBlur = () => { blurTimerRef.current = setTimeout(() => setIsFocused(false), 150); };
    const onKeyDown = (e) => {
      const sugs = suggestionsRef.current;
      if (e.key === 'Enter') {
        if (sugs.length) {
          e.preventDefault();
          const idx = selectedIndexRef.current;
          select(idx >= 0 ? sugs[idx] : sugs[0]);
        } else if (onSubmitRawRef.current) {
          onSubmitRawRef.current();
        }
        return;
      }
      if (!sugs.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % sugs.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i <= 0 ? sugs.length - 1 : i - 1));
      } else if (e.key === 'Escape') {
        setSuggestions([]);
        setSelectedIndex(-1);
      }
    };

    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKeyDown);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, [inputRef, select]);

  if (!isFocused || suggestions.length === 0) return null;

  return (
    <div className="absolute z-20 w-full bg-gray-700 rounded-lg shadow-lg max-h-72 overflow-y-auto mt-1 border border-gray-600 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-500">
      <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-blue-400 flex items-center gap-1.5 select-none">
        <Users className="w-3.5 h-3.5" />
        {groupLabel}
      </div>
      {suggestions.map((s, index) => (
        <button
          key={`${s.name}-${index}`}
          // preventDefault on mousedown keeps the input focused (so the dropdown
          // doesn't blur-close before the click lands); onClick does the select,
          // which also works for keyboard activation.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => select(s)}
          className={`w-full px-4 py-2 text-left hover:bg-gray-600 flex justify-between items-center gap-2
            ${index === selectedIndex ? 'bg-gray-600' : ''}`}
        >
          <span className="min-w-0">
            <span className="text-white truncate block">{renderHighlighted(s.name, matchTerm)}</span>
            {s.matchedVia && s.matchedVia !== 'embark' && s.matchedValue && (
              <span className="text-xs text-gray-400 truncate block">
                {MATCH_VIA_LABELS[s.matchedVia] || s.matchedVia}: {renderHighlighted(s.matchedValue, matchTerm)}
              </span>
            )}
          </span>
          <span className="text-gray-400 text-sm whitespace-nowrap">
            {seasonPill(s.latestSeasonId)}{rankToken(s)}
          </span>
        </button>
      ))}
    </div>
  );
};
