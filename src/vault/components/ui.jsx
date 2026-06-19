// Shared presentational primitives for the vault pages.
import { useState } from 'react';

export const PageHeader = ({ icon: Icon, title, subtitle, children }) => (
  <div className="flex items-start justify-between gap-4 mb-5">
    <div className="flex items-center gap-3">
      {Icon && <Icon className="w-7 h-7 text-emerald-400" />}
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

export const Panel = ({ title, children, className = '' }) => (
  <section className={`bg-gray-800 rounded-xl p-5 ${className}`}>
    {title && <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">{title}</h2>}
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

// A small explanatory note for the heuristic / not-in-export caveats
export const Note = ({ children }) => (
  <p className="text-xs text-gray-500 italic mt-3 border-l-2 border-gray-700 pl-3">{children}</p>
);

// Lightweight hover/focus tooltip (CSS only — no portal needed for short labels in non-clipping spots like a page header). Opens below by default so it never collides with the banner above the content
export const Tooltip = ({ label, children, className = '', side = 'bottom' }) => (
  <span className={`relative inline-flex group ${className}`} tabIndex={0}>
    {children}
    <span
      role="tooltip"
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 w-64 max-w-[80vw] rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-xs font-normal normal-case tracking-normal leading-relaxed text-gray-200 shadow-xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ${
        side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
      }`}
    >
      {label}
    </span>
  </span>
);

// Jump-to-page box, styled to match the shared Pagination controls
export const PageJump = ({ totalPages, onJump }) => {
  const [val, setVal] = useState('');
  const go = () => {
    const n = parseInt(val, 10);
    if (Number.isFinite(n)) onJump(Math.min(Math.max(1, n), totalPages));
    setVal('');
  };
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <span>Jump to</span>
      <input
        type="number"
        min={1}
        max={totalPages}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        placeholder="#"
        className="w-16 bg-gray-700 text-white rounded-sm px-2 py-1 text-center outline-none focus:ring-1 focus:ring-emerald-500"
      />
      <button onClick={go} className="px-3 py-1 rounded-sm bg-gray-700 text-gray-300 hover:bg-gray-600">
        Go
      </button>
    </div>
  );
};
