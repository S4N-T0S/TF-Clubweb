// Shared presentational primitives for the vault pages.
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

// A small explanatory note for the heuristic / not-in-export caveats
export const Note = ({ children }) => (
  <p className="text-xs text-gray-500 italic mt-3 border-l-2 border-gray-700 pl-3">{children}</p>
);

// Lightweight hover/focus tooltip (CSS only — no portal needed for short labels in non-clipping spots like a page header). Opens below by default so it never collides with the banner above the content.
// Promoted to a shared component (src/components/Tooltip.jsx) for the official-club chip; re-exported here so vault imports keep working unchanged.
export { Tooltip } from '../../components/Tooltip';
