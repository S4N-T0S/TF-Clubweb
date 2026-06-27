import { useState, useCallback, useRef } from 'react';

// Max toasts visible at once. Beyond this we drop the oldest non-keyed (transient)
// toast so status slots (keyed, e.g. the leaderboard status) are never evicted.
const MAX_TOASTS = 5;

// Central toast store. Toasts STACK by default; pass a `key` to claim a single slot
// that replaces itself in place (used by the leaderboard "Refreshing -> result" flow
// so it never piles up). Returns the toast's id (or its key for keyed toasts).
export const useToasts = () => {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismissToast = useCallback((idOrKey) => {
    setToasts(prev => prev.filter(t => t.id !== idOrKey && t.slotKey !== idOrKey));
  }, []);

  const pushToast = useCallback((opts) => {
    if (!opts || (opts.message == null && opts.title == null)) return null;
    const id = ++idRef.current;
    // Pull `key` off the options into `slotKey`, so it never gets spread into JSX as
    // React's reserved `key` prop (ToastStack assigns the React key explicitly).
    const { key: slotKey, ...rest } = opts;
    const toast = { timestamp: Date.now(), ...rest, id, slotKey };

    setToasts(prev => {
      // Keyed slot: replace the existing same-key toast in place (keeps stack position).
      if (toast.slotKey != null) {
        const i = prev.findIndex(t => t.slotKey === toast.slotKey);
        if (i !== -1) {
          const next = [...prev];
          next[i] = toast;
          return next;
        }
      }
      let next = [...prev, toast];
      // Cap: drop the oldest transient (non-keyed) toasts first.
      if (next.length > MAX_TOASTS) {
        let toDrop = next.length - MAX_TOASTS;
        next = next.filter(t => (toDrop > 0 && t.slotKey == null ? (toDrop--, false) : true));
        // If everything left is keyed and we're still over, drop from the front.
        if (next.length > MAX_TOASTS) next = next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });

    return toast.slotKey != null ? toast.slotKey : id;
  }, []);

  return { toasts, pushToast, dismissToast };
};
