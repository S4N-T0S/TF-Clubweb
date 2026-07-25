import { Link } from 'react-router-dom';

// Shared club tag chip with Embark-official awareness. Official tags render as
// a teal chip (mirrors Embark's own pill; teal isn't theme-remapped like blue)
// with the org name in a native title tooltip. Non-official tags keep the
// caller's existing classes untouched, so legacy sites look exactly as before.
//
// className           - structural classes applied in both states (margins, text size...).
// unofficialClassName - the site's colour/bg/padding classes for the plain state.
// withNativeTitle     - pass false when wrapping the chip in the CSS <Tooltip>,
//                       so the browser title doesn't double up.
//
// officialClubName must be uuid-derived (API fields or their serve-time
// decorations) — never looked up by tag, which is ambiguous (org TS vs
// player-club TS).
export const ClubTag = ({
  tag,
  officialClubName = null,
  href = null,
  onClick = null,
  className = '',
  unofficialClassName = '',
  withNativeTitle = true,
}) => {
  const isOfficial = !!officialClubName;
  const interactive = !!(href || onClick);
  const officialClasses = `bg-teal-500/15 border border-teal-500/40 text-teal-300 px-1.5 py-0.5 rounded-sm font-medium${
    interactive ? ' hover:text-teal-200 cursor-pointer' : ''
  }`;
  const classes = `${isOfficial ? officialClasses : unofficialClassName} ${className}`.trim();
  const tooltip = isOfficial && withNativeTitle ? `Official club: ${officialClubName}` : undefined;
  const ariaLabel = isOfficial ? `${tag} — official club: ${officialClubName}` : undefined;

  if (href) {
    return (
      <Link to={href} onClick={onClick} className={classes} title={tooltip} aria-label={ariaLabel}>
        [{tag}]
      </Link>
    );
  }
  return (
    <span onClick={onClick} className={classes} title={tooltip} aria-label={ariaLabel}>
      [{tag}]
    </span>
  );
};
