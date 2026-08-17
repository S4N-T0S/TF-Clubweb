// Opt-in text search for the vault's paginated lists. State and filtering live
// in useListSearch (src/hooks/useListSearch.js); this file is just the chrome.
//
// The field goes in the list's own header row — a Panel `action` slot or a
// PageHeader child — and never in the pager, which unmounts as soon as a list
// fits on one page. A search that worked would take its own box off screen.
//
// Lists with nothing worth searching (a four-value enum, a dozen rows) just
// don't get one. Nothing else about them changes.
import { useRef } from 'react';
import { Search, X } from 'lucide-react';
import { num } from '../lib/format';

// Flex rather than absolute positioning, so the live count can come and go
// without any padding arithmetic.
//
// The focus ring is inset because an outset one paints 1px past the border box:
// on Matches the field is a PageHeader child spanning the full width of <main>,
// which is overflow-x-clip, so both side slivers get shaved off. A Panel's
// padding would hide that, but this gets dropped anywhere.
export const ListSearch = ({
  value,
  onChange,
  placeholder = 'Search…',
  matched,
  total,
  className = '',
  inputRef,
}) => {
  const ownRef = useRef(null);
  const ref = inputRef || ownRef;
  const filtering = value.trim().length > 0;
  return (
    <div
      className={`flex items-center gap-2 bg-gray-700 rounded-lg px-2.5 py-1.5 ring-1 ring-inset ring-transparent focus-within:ring-emerald-500 transition-shadow ${className}`}
    >
      <Search className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        // What gets typed here is chat fragments, IP addresses, ticket wording.
        // Chrome and Edge ship what you type in a text input off to their
        // spellcheck servers, which is not what "entirely on your own device"
        // promises.
        spellCheck={false}
        className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-gray-500 outline-hidden"
      />
      {/* Decorative: the same number is announced as a sentence below. Marking
          it up as a live region announced "3/1,204" on every keystroke. */}
      {filtering && (
        <span className="text-[11px] tabular-nums text-emerald-300 shrink-0" aria-hidden="true">
          {num(matched)}/{num(total)}
        </span>
      )}
      {filtering && (
        <button
          type="button"
          // The button unmounts the moment it does its job, so hand focus back
          // to the input rather than letting it fall to <body>.
          onClick={() => { onChange(''); ref.current?.focus(); }}
          aria-label="Clear search"
          className="shrink-0 p-0.5 rounded-sm text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {/* Mounted whether or not a search is running: a live region inserted at
          the same time as its text doesn't get announced, which would lose the
          first result count — the one that tells you the search worked. */}
      <span className="sr-only" role="status">
        {filtering ? `${num(matched)} of ${num(total)} match ${value.trim()}` : ''}
      </span>
    </div>
  );
};

// Footer companion for the long lists: by the bottom of a few thousand rows the
// search box is long off screen, so this answers "why is this list short?"
// where you actually land. Renders nothing when idle, so the usual pager row is
// untouched.
// `focusRef` is the search input this chip clears. Clearing unmounts the chip,
// so focus has to go somewhere or it lands on <body> and the next Tab restarts
// from the top of the page. preventScroll keeps the viewport where the user
// left it instead of yanking them back up to the field.
export const SearchEcho = ({ value, onClear, focusRef }) => {
  const q = value.trim();
  if (!q) return null;
  return (
    <span className="inline-flex items-center gap-1.5 self-start sm:self-auto max-w-full bg-emerald-600/20 text-emerald-300 rounded-full pl-3 pr-1 py-1 text-xs">
      <span className="shrink-0">Filtering</span>
      <span className="text-white font-medium min-w-0 truncate">“{q}”</span>
      <button
        type="button"
        onClick={() => { onClear(); focusRef?.current?.focus({ preventScroll: true }); }}
        aria-label="Clear search"
        className="shrink-0 p-1 rounded-full hover:bg-white/10 hover:text-white transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
};
