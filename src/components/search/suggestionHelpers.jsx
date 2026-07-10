// Shared presentation helpers for player-search suggestions, used by BOTH the
// GlobalView autofill dropdown (IdentityAutofill) and the SearchModal result
// cards. Kept in their own module so the component files only export components

import { getLeagueIndexForFilter } from '../../utils/leagueUtils';
import { SEASONS } from '../../services/historicalDataService';

// Why a suggestion appeared when it didn't match the typed name.
export const MATCH_VIA_LABELS = { steam: 'Steam', psn: 'PSN', xbox: 'Xbox', club: 'Club' };

// Season id -> config, for era checks on suggestions.
const SEASON_BY_ID = new Map(
  Object.values(SEASONS).filter((s) => s.id !== undefined).map((s) => [s.id, s])
);

const TIERS = [
  { name: 'Bronze', textColor: 'text-amber-700' },
  { name: 'Silver', textColor: 'text-gray-300' },
  { name: 'Gold', textColor: 'text-yellow-400' },
  { name: 'Platinum', textColor: 'text-cyan-300' },
  { name: 'Diamond', textColor: 'text-[#60a5fa]' },
  { name: 'Ruby', textColor: 'text-red-600' },
];

// Coarse league tier for a suggestion, or null when none can be derived honestly.
// Gated on the season having Ruby (S3+): earlier seasons scored on different
// scales, and top-500 didn't mean Ruby before the league existed.
export const tierForSuggestion = (s, rubyReleased = true) => {
  const season = SEASON_BY_ID.get(s.latestSeasonId);
  if (!season?.hasRuby) return null;
  const rubyOk = season.isCurrent ? rubyReleased : true;
  const index = getLeagueIndexForFilter(s.latestRank ?? null, s.latestRankScore ?? null, rubyOk);
  return index === null ? null : TIERS[index];
};

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
