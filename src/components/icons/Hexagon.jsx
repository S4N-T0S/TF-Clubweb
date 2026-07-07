// Callers pass className for colour AND size. The default is only a fallback:
// Tailwind cannot merge conflicting w-* utilities (the larger wins by sheet
// order), so a baked-in size would silently override every caller's size.
export const Hexagon = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
  >
    <path
      d="M12 2L22 8.5V15.5L12 22L2 15.5V8.5L12 2Z"
      fill="currentColor"
    />
  </svg>
);
