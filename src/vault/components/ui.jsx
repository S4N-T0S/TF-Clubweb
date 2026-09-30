// Shared presentational primitives for the vault pages.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TIP_MARGIN = 8;
const TIP_GAP = 10;

// Hover (or tap) a figure to see what is behind it. Rendered in a portal so a card's
// overflow-hidden or a table container's overflow-x cannot clip it. The card is
// measured once it is in the DOM and placed from its real size: above the trigger
// when it fits there, else below, else on the side with more room, always inside
// the viewport and scrolling when taller than it. `width` sizes the card; `label`
// names the trigger for screen readers.
export const HoverTip = ({ tip, width = 240, label, className = '', children }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const card = useRef(null);
  const hover = useRef(false);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      const c = card.current;
      if (!r || !c) return;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const w = c.offsetWidth;
      const h = Math.min(c.offsetHeight, vh - 2 * TIP_MARGIN);
      const roomAbove = r.top - TIP_GAP - TIP_MARGIN;
      const roomBelow = vh - r.bottom - TIP_GAP - TIP_MARGIN;
      const above = h <= roomAbove ? true : h <= roomBelow ? false : roomAbove >= roomBelow;
      const y = above ? r.top - TIP_GAP - h : r.bottom + TIP_GAP;
      setPos({
        x: Math.min(Math.max(r.left + r.width / 2 - w / 2, TIP_MARGIN), Math.max(TIP_MARGIN, vw - TIP_MARGIN - w)),
        y: Math.min(Math.max(y, TIP_MARGIN), Math.max(TIP_MARGIN, vh - TIP_MARGIN - h)),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, width]);

  // Dismiss on page scroll, outside tap or Escape: the fixed card would otherwise
  // float away on scroll, and a tap-opened one needs a way to close. Scrolling the
  // card itself keeps it open.
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onScroll = (e) => {
      if (!card.current?.contains(e.target)) close();
    };
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !card.current?.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Hover opens for a mouse only. A tap or a keyboard activation toggles; a click
  // while the mouse is already over the trigger keeps the card it opened.
  const toggle = () => setOpen((o) => !o);
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={label}
      className={`cursor-help ${className}`}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        hover.current = true;
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return;
        hover.current = false;
        setOpen(false);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (hover.current) setOpen(true);
        else toggle();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={card}
            style={{
              position: 'fixed',
              left: pos?.x ?? 0,
              top: pos?.y ?? 0,
              width,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'calc(100dvh - 16px)',
              visibility: pos ? 'visible' : 'hidden',
              zIndex: 90,
            }}
            className="overflow-y-auto overscroll-contain rounded-xl bg-gray-900/98 border border-gray-700 shadow-2xl p-3"
            onClick={(e) => e.stopPropagation()}
          >
            {tip}
          </div>,
          document.body
        )}
    </div>
  );
};

export const PageHeader = ({ icon: Icon, title, subtitle, children, mobileCenter = false }) => (
  <div
    className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-5 ${
      mobileCenter ? 'items-center sm:items-start' : ''
    }`}
  >
    <div className={`flex items-center gap-3 ${mobileCenter ? 'text-center sm:text-left' : ''}`}>
      {Icon && <Icon className="w-7 h-7 text-emerald-400 shrink-0" />}
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

// `action` takes a list's search field: beside the title on desktop, its own
// full-width row underneath on mobile.
export const Panel = ({ title, action, children, className = '' }) => (
  <section className={`bg-gray-800 rounded-xl p-5 ${className}`}>
    {(title || action) && (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-3">
        {title && <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex-1 min-w-0">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

export const StatCard = ({ label, value, sub, accent = 'text-white' }) => (
  <div className="bg-gray-800 rounded-xl p-4">
    <p className="text-[11px] uppercase tracking-wider text-gray-500">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
    {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
  </div>
);

export const Badge = ({ children, tone = 'gray' }) => {
  const tones = {
    gray: 'bg-gray-700 text-gray-300',
    emerald: 'bg-emerald-500/20 text-emerald-300',
    blue: 'bg-blue-500/20 text-blue-300',
    yellow: 'bg-yellow-500/20 text-yellow-300',
    red: 'bg-red-500/20 text-red-300',
    purple: 'bg-purple-500/20 text-purple-300',
    indigo: 'bg-indigo-500/20 text-indigo-300',
    fuchsia: 'bg-fuchsia-500/20 text-fuchsia-300',
  };
  return (
    <span className={`inline-flex items-center justify-center gap-1 align-middle text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${tones[tone] || tones.gray}`}>
      {children}
    </span>
  );
};

export const EmptyState = ({ icon: Icon, title, children }) => (
  <div className="bg-gray-800/40 border border-dashed border-gray-700 rounded-xl p-8 text-center">
    {Icon && <Icon className="w-8 h-8 text-gray-600 mx-auto mb-2" />}
    <p className="text-sm font-semibold text-gray-300">{title}</p>
    {children && <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">{children}</p>}
  </div>
);

// Pill switch for folding set-aside rows back into a list.
export const TogglePill = ({ on, onChange, icon: Icon, controls, children }) => (
  <button
    type="button"
    onClick={() => onChange(!on)}
    aria-pressed={on}
    aria-controls={controls}
    className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
      on ? 'border-purple-500/50 bg-purple-500/15 text-purple-200' : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-200'
    }`}
  >
    {Icon && <Icon className="w-3.5 h-3.5" />}
    {children}
  </button>
);

// A small explanatory note for the heuristic / not-in-export caveats
export const Note = ({ children }) => (
  <p className="text-xs text-gray-500 italic mt-3 border-l-2 border-gray-700 pl-3">{children}</p>
);

// Lightweight hover/focus tooltip (CSS only — no portal needed for short labels in non-clipping spots like a page header). Opens below by default so it never collides with the banner above the content.
// Promoted to a shared component (src/components/Tooltip.jsx) for the official-club chip; re-exported here so vault imports keep working unchanged.
export { Tooltip } from '../../components/Tooltip';
