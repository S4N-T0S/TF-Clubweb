import { useEffect, useState, useRef, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Clock, X, Loader2, Info } from 'lucide-react';
import { formatTimeAgo } from '../utils/timeUtils';

const formatTtl = (ttl, type) => {
  // Handle cases where TTL has expired or is zero.
  if (ttl <= 0) {
    if (type === 'success') {
      return 'Checking for update...';
    }
    // Logic to handle the user-facing cooldown message for stale data warnings and errors.
    // This tells the user when they can try fetching fresh data again.
    if (type === 'warning' || type === 'error') {
      return 'Trying again in 2 minutes';
    }
    // A sensible fallback for other types, though unlikely to be used with a zero TTL.
    return 'Retrying...';
  }

  // If TTL is positive, calculate remaining minutes.
  // We convert ttl from seconds to milliseconds for the function.
  const minutes = Math.ceil(ttl / 60);
  const minuteText = minutes === 1 ? '1 minute' : `${minutes} minutes`;

  if (type === 'success') {
    return `Will check for update in ${minuteText}`;
  }
  return `Trying again in ${minuteText}`;
};

// Map of toast types to their default properties
const TOAST_TYPE_CONFIG = {
  loading: {
    icon: Loader2,
    iconClassName: 'animate-spin',
    bar: 'bg-blue-500',
    iconChip: 'bg-blue-500/10',
    iconColor: 'text-blue-400'
  },
  success: {
    icon: CheckCircle2,
    bar: 'bg-emerald-500',
    iconChip: 'bg-emerald-500/10',
    iconColor: 'text-emerald-400'
  },
  error: {
    icon: AlertCircle,
    bar: 'bg-red-500',
    iconChip: 'bg-red-500/10',
    iconColor: 'text-red-400'
  },
  warning: {
    icon: AlertCircle,
    bar: 'bg-amber-500',
    iconChip: 'bg-amber-500/10',
    iconColor: 'text-amber-400'
  },
  info: {
    icon: Info,
    bar: 'bg-blue-500',
    iconChip: 'bg-blue-500/10',
    iconColor: 'text-blue-400'
  },
  default: {
    icon: Clock,
    bar: 'bg-blue-500',
    iconChip: 'bg-blue-500/10',
    iconColor: 'text-blue-400'
  }
};

const textSizeClasses = {
  small: 'text-xs',
  normal: 'text-sm',
  large: 'text-base',
  xlarge: 'text-lg'
};

// A single toast card. Presentational: positioning + stacking are owned by ToastStack.
// It plays its own enter/leave animation and, when its timer elapses (or it is closed),
// asks the parent to remove it via onDismiss(id) so the stack re-flows.
const Toast = ({
  id,
  message,
  type = 'info',
  timestamp,
  showMeta = false,
  ttl,
  title,
  icon: CustomIcon,
  textSize = 'normal',
  duration = 2500,
  showCloseButton,
  isMobile,
  onClose,
  onDismiss
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const closingRef = useRef(false);
  const effectiveShowClose = showCloseButton ?? isMobile;

  // Enter animation on mount, and re-arm whenever a keyed slot is REPLACED in place
  // (same React key, new `id`): reset the closing latch and re-show, so a replacement
  // that lands during the previous content's leave animation can't get stuck invisible.
  useEffect(() => {
    closingRef.current = false;
    const raf = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [id]);

  // Play the leave animation, then remove from the stack after the transition.
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsVisible(false);
    if (onClose) onClose();
    setTimeout(() => onDismiss && onDismiss(id), 300);
  }, [id, onClose, onDismiss]);

  // Auto-dismiss after the duration (Infinity keeps it until replaced/closed).
  useEffect(() => {
    if (duration === Infinity) return;
    const timer = setTimeout(close, duration);
    return () => clearTimeout(timer);
  }, [duration, close]);

  // Get toast configuration based on type
  const toastConfig = TOAST_TYPE_CONFIG[type] || TOAST_TYPE_CONFIG.default;

  // Allow override of default icon with custom icon
  const IconComponent = CustomIcon || toastConfig.icon;

  if (!message && !title) return null;

  // Get CSS classes based on configuration
  const textSizeClass = textSizeClasses[textSize] || textSizeClasses.normal;

  return (
    <div
      data-toast-container="true"
      className={`pointer-events-auto transition-all duration-300 ease-out ${
        isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'
      } max-w-[90vw] sm:max-w-sm w-auto`}
    >
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gray-800/95 backdrop-blur-sm shadow-xl shadow-black/40 min-w-40">
        <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${toastConfig.bar}`} />

        <div className="flex items-center gap-3 p-4 pl-5">
          <div className={`shrink-0 rounded-lg p-1.5 ${toastConfig.iconChip}`}>
            <IconComponent className={`w-5 h-5 ${toastConfig.iconColor} ${toastConfig.iconClassName || ''}`} />
          </div>

          <div className="flex-1 min-w-0 break-anywhere">
            {title && (
              <p className={`font-semibold text-gray-100 ${textSizeClass} mb-0.5`}>{title}</p>
            )}
            <p className={`${!title ? 'font-medium' : ''} text-gray-200 ${textSizeClass} wrap-break-word`}>
              {message}
            </p>
            {showMeta && (timestamp || typeof ttl === 'number') ? (
              <div className="mt-1.5 space-y-0.5">
                {timestamp && (
                  <p className="text-gray-400 text-xs">Last updated {formatTimeAgo(timestamp)}</p>
                )}
                {typeof ttl === 'number' && (
                  <p className="text-gray-400 text-xs">{formatTtl(ttl, type)}</p>
                )}
              </div>
            ) : null}
          </div>

          {effectiveShowClose && (
            <button
              onClick={close}
              className="text-gray-400 hover:text-white rounded-lg hover:bg-white/10 shrink-0 p-1 self-center flex items-center transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toast;

/* How to show a toast
 * -------------------
 * Toasts now STACK. Trigger one with the `showToast` callback that App threads to the
 * views/modals, or with `pushToast` from the useToasts store directly. Pass a plain
 * options object — every field below is optional except `message` (or `title`):
 *
 *   showToast({
 *     // --- content ---
 *     message: "Your changes have been saved successfully!", // main body text (required unless `title` is set)
 *     title: "Changes Saved",      // optional bold line above the message
 *     type: "success",             // 'success' | 'error' | 'warning' | 'info' | 'loading' | 'default'
 *                                  //   -> sets the colour scheme + default icon. Defaults to 'info'.
 *     icon: SaveIcon,              // optional lucide-react icon, overrides the type's default icon
 *
 *     // --- layout / lifetime ---
 *     position: "top-right",       // which screen corner this toast stacks in (ToastStack owns positioning):
 *                                  //   'top-right' (default) | 'top-left' | 'bottom-right' |
 *                                  //   'bottom-left' | 'top-center' | 'bottom-center'
 *     duration: 5000,              // ms before auto-dismiss. Use Infinity to keep it until replaced/closed.
 *                                  //   Defaults to 2500.
 *     textSize: "normal",          // 'small' | 'normal' | 'large' | 'xlarge'
 *     showCloseButton: true,       // force the X button. Defaults to true on mobile, false on desktop.
 *
 *     // --- "meta" footer (used by the leaderboard status toasts) ---
 *     showMeta: true,              // when true, shows the "Last updated ..." / TTL footer below the message
 *     timestamp: Date.now(),       // drives the "Last updated X ago" line. Auto-stamped by pushToast if omitted.
 *     ttl: 600,                    // seconds; renders a "Will check again in N minutes" countdown line
 *
 *     // --- stacking control ---
 *     key: "leaderboard",          // optional SLOT key. Toasts WITHOUT a key stack as separate cards.
 *                                  //   Toasts that share a key REPLACE each other in place (one slot) —
 *                                  //   e.g. the leaderboard "Refreshing -> up to date" flow. Dismiss a
 *                                  //   keyed slot with dismissToast("leaderboard").
 *
 *     // --- callback ---
 *     onClose: () => {},           // fired once when the toast closes (timeout or manual)
 *   });
 *
 * Note: `id`, `slotKey` and `onDismiss` are injected by the toast store / ToastStack —
 * callers never pass those. `pushToast` returns the toast's id (or its `key` for keyed
 * slots) so it can be dismissed early with dismissToast(idOrKey).
 */
