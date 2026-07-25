// Lightweight hover/focus tooltip (CSS only — no portal needed for short labels
// in non-clipping spots like a page header or modal hero). Opens below by
// default so it never collides with content above. Promoted from the vault
// sub-app (src/vault/components/ui.jsx re-exports from here) for use on the
// official-club hero chip; prefer native title="" in table rows, where the
// .table-container overflow clips absolutely positioned tooltips.
export const Tooltip = ({ label, children, className = '', side = 'bottom', align = 'center' }) => (
  <span className={`relative inline-flex group ${className}`} tabIndex={0}>
    {children}
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-50 w-max max-w-[16rem] rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-xs font-normal normal-case tracking-normal leading-relaxed text-gray-200 shadow-xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ${
        side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
      } ${
        // 'start' anchors the tooltip's left edge to the trigger (grows right),
        // for triggers near a clipping container's left edge; 'end' mirrors it.
        align === 'start' ? 'left-0' : align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2'
      }`}
    >
      {label}
    </span>
  </span>
);
