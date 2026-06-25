// Shared presentation helpers for player-search suggestions, used by BOTH the
// GlobalView autofill dropdown (IdentityAutofill) and the SearchModal result
// cards. Kept in their own module so the component files only export components

// Why a suggestion appeared when it didn't match the typed name.
export const MATCH_VIA_LABELS = { steam: 'Steam', psn: 'PSN', xbox: 'Xbox', club: 'Club' };

// Season pill for a suggestion (OB has id 0, which is falsy — handle explicitly).
export const seasonPill = (id) => (id == null ? '' : id === 0 ? 'OB · ' : `S${id} · `);

// The single honest rank token
export const rankToken = (s) => {
  if (s.latestRank) return `#${s.latestRank.toLocaleString()}`;
  if (s.latestRankScore) return `${s.latestRankScore.toLocaleString()} RS`;
  return 'Unranked';
};

// Wrap the matched substring in a highlight so it's obvious WHY a row appeared
export const renderHighlighted = (text, term) => {
  if (!text) return text;
  const t = (term || '').trim();
  if (!t) return text;
  const idx = text.toLowerCase().indexOf(t.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-blue-300 font-medium">{text.slice(idx, idx + t.length)}</span>
      {text.slice(idx + t.length)}
    </>
  );
};
