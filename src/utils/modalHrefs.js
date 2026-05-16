// Builders for the SPA modal URLs that App.jsx routes recognise.
// Used so onClick-style modal openers can be wrapped in <Link to={...}> for
// SEO/accessibility/right-click-open-in-new-tab benefits, while normal clicks
// still go through their existing handlers (with e.preventDefault()) so the
// modalHistory back-stack logic in App.jsx remains intact.
//
// Each builder returns null when the input can't be encoded into a valid URL
// (e.g. an Embark ID with a malformed discriminator). Callers should fall back
// to a plain non-Link element in that case.

import { formatUsernameForUrl } from './urlHandler';
import { SEASONS, currentSeasonKey } from '../services/historicalDataService';

// /history/<name>
export const buildHistoryHref = (name) => {
  try {
    return `/history/${formatUsernameForUrl(name)}`;
  } catch {
    return null;
  }
};

// /graph/<seasonId>/<name>
export const buildGraphHref = (name, seasonKey) => {
  const seasonId = SEASONS[seasonKey]?.id;
  if (seasonId === undefined || seasonId === null) return null;
  try {
    return `/graph/${seasonId}/${formatUsernameForUrl(name)}`;
  } catch {
    return null;
  }
};

// /leaderboard?search=[TAG]&season=<key> — for clickable club tags across the app.
// seasonKey is optional; omitted / null / the current season renders as just
// ?search= (kept clean). 'ALL' and past seasons (S1..S9) add &season= so that
// right-click-open-in-new-tab and copy-link preserve the intended season.
export const buildClubSearchHref = (tag, seasonKey = null) => {
  if (!tag) return null;
  const params = new URLSearchParams();
  params.set('search', `[${tag}]`);
  if (seasonKey && seasonKey !== currentSeasonKey && (seasonKey === 'ALL' || SEASONS[seasonKey])) {
    params.set('season', seasonKey);
  }
  return `/leaderboard?${params.toString()}`;
};
