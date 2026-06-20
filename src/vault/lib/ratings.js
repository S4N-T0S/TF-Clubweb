// Hidden matchmaking / skill ratings, parsed from the persistence `BucketObject`
// key-value store. THE FINALS keeps two parallel rating systems per playlist:
//
//   * IVK*        — the "productised" numbers. For ranked these carry the league
//                   rank + RankPoints you actually saw in-game (rankPoints = mu*10);
//                   for casual/World Tour they're a single hidden skill number.
//   * OpenSkill*  — the underlying Bayesian model (TrueSkill-style): `mu` = the
//                   estimated skill, `sigma` = how unsure the system still is.
//
// Each rating lives in a `BucketObject` whose `Value` is a JSON *string* holding
// { ratingId, mu, sigma, seasonId, completedMatches, leagueRankIndex,
//   highestLeagueRankIndex, rankPoints, ... }. ObjectKeys carry a `_<seasonId>`
// suffix for per-season ranked ratings.
//
import { SEASONS } from './seasons';

// --- league rank tiers -----------------------------------------------------
// leagueRankIndex 0..21 → Bronze..Ruby. This MIRRORS the main app's
// src/utils/leagueUtils.js LEAGUE_DATA (kept as a local copy so the lazy vault
// chunk stays independent of the leaderboard app — edit both if the ladder
// changes). Colours are the hex equivalents of those Tailwind text classes so
// they can be used in SVG fills too.
const TIERS = [
  { name: 'Bronze', min: 1, max: 4, color: '#b45309', text: 'text-amber-700' },
  { name: 'Silver', min: 5, max: 8, color: '#d1d5db', text: 'text-gray-300' },
  { name: 'Gold', min: 9, max: 12, color: '#facc15', text: 'text-yellow-400' },
  { name: 'Platinum', min: 13, max: 16, color: '#67e8f9', text: 'text-cyan-300' },
  { name: 'Diamond', min: 17, max: 20, color: '#60a5fa', text: 'text-blue-400' },
  { name: 'Ruby', min: 21, max: 21, color: '#dc2626', text: 'text-red-600' },
];
const UNRANKED = { name: 'Unranked', color: '#6b7280', text: 'text-gray-500' };

export const RANK_TIERS = TIERS;

// Resolve a leagueRankIndex to a rich rank descriptor. Within a tier, division 1
// is the TOP and 4 the bottom (so the index counts up: Bronze 4 → Bronze 1 →
// Silver 4 → …), matching THE FINALS' in-game ranks.
export function leagueInfo(idx) {
  if (idx == null || idx <= 0) {
    return { idx: 0, name: 'Unranked', tierName: 'Unranked', division: null, color: UNRANKED.color, text: UNRANKED.text, ranked: false };
  }
  const tier = TIERS.find((t) => idx >= t.min && idx <= t.max) || TIERS[TIERS.length - 1];
  const division = tier.min === tier.max ? null : tier.max - idx + 1;
  return {
    idx,
    name: division ? `${tier.name} ${division}` : tier.name,
    tierName: tier.name,
    division,
    color: tier.color,
    text: tier.text,
    ranked: true,
  };
}

// Compact label for the chart ("D1", "P2", "G4", "Ruby", "—").
export function leagueAbbrev(idx) {
  if (idx == null || idx <= 0) return '—';
  const info = leagueInfo(idx);
  if (info.tierName === 'Ruby') return 'Ruby';
  return `${info.tierName[0]}${info.division}`;
}

// --- season resolution -----------------------------------------------------
// Ranked rating seasonIds are opaque global numbers, but they're STABLE across
// players, so the verified ones are hard-mapped. (A rating's CreatedAt can be a
// backfilled migration date rather than the real season start, so date-matching
// alone would misfile the migration "seed" rows — the explicit map avoids that.)
const RANKED_SEASON_IDS = {
  762104396: 2,
  751146294: 3,
  814189767: 4,
  483101830: 5,
  279111264: 6,
  607580158: 7,
  607608768: 8,
  825209376: 9,
  965777394: 10,
};

// seasonId → { n, label }. Falls back to "the season live at createdMs" for any
// future/unknown id (date of the player's real first game that season).
export function resolveSeason(seasonId, createdMs) {
  const known = RANKED_SEASON_IDS[seasonId] ?? RANKED_SEASON_IDS[Number(seasonId)];
  if (known != null) {
    const s = SEASONS.find((x) => x.n === known);
    return s ? { n: s.n, label: s.label } : { n: known, label: `S${known}` };
  }
  if (createdMs != null) {
    let best = null;
    for (const s of SEASONS) if (s.startMs <= createdMs && (!best || s.startMs > best.startMs)) best = s;
    if (best) return { n: best.n, label: best.label };
  }
  return null;
}

// --- raw record parsing ----------------------------------------------------
const RATING_KEY_RE = /^(IVK|OpenSkill)/;
const toMs = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (/^\d{12,}$/.test(String(v))) return Number(v);
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const numOr = (v, d = null) => (typeof v === 'number' && Number.isFinite(v) ? v : v != null && v !== '' && Number.isFinite(+v) ? +v : d);

function parseRatingRecords(byType) {
  const out = [];
  for (const b of byType.BucketObject || []) {
    const key = b?.ObjectKey;
    if (typeof key !== 'string' || !RATING_KEY_RE.test(key)) continue;
    let v;
    try {
      v = JSON.parse(b.Value);
    } catch {
      continue;
    }
    if (!v || typeof v !== 'object') continue;
    const ratingId = typeof v.ratingId === 'string' && v.ratingId ? v.ratingId : key.replace(/_\d+$/, '');
    let seasonId = v.seasonId != null && v.seasonId !== '' ? String(v.seasonId) : null;
    if (!seasonId) {
      const m = key.match(/_(\d+)$/);
      if (m) seasonId = m[1];
    }
    out.push({
      objectKey: key,
      ratingId,
      engine: /^OpenSkill/.test(ratingId) ? 'openskill' : 'ivk',
      isRanked: /Ranked/.test(ratingId),
      seasonId,
      mu: numOr(v.mu),
      sigma: numOr(v.sigma),
      matches: numOr(v.completedMatches, 0),
      rankIndex: numOr(v.leagueRankIndex, 0),
      peakIndex: numOr(v.highestLeagueRankIndex, 0),
      rankPoints: numOr(v.rankPoints, 0),
      sincePromotion: numOr(v.countSincePromotion, 0),
      isReturning: !!v.isReturning,
      createdMs: toMs(b.CreatedAt),
      updatedMs: toMs(b.UpdatedAt),
    });
  }
  return out;
}

// --- ranked, per season ----------------------------------------------------
// The ranked engine changed over time: S2-S3 used OpenSkillRankedRating, S4+ the
// IVKRankedTournamentRating family (IVKRankedRating was a brief S2-S3 shadow).
// When more than one engine logged a season, prefer the authoritative one.
const familyPriority = (ratingId) =>
  /^IVKRankedTournamentRating/.test(ratingId) ? 3 : /^OpenSkillRankedRating/.test(ratingId) ? 2 : /^IVKRankedRating/.test(ratingId) ? 1 : 0;

function buildRanked(records) {
  const ranked = records.filter((r) => r.isRanked && r.seasonId);
  const groups = new Map();
  for (const r of ranked) {
    if (!groups.has(r.seasonId)) groups.set(r.seasonId, []);
    groups.get(r.seasonId).push(r);
  }

  let seedsDropped = 0;
  const seasons = [];
  for (const [seasonId, recs] of groups) {
    // Among the engines that actually played, take the highest-priority one;
    // if none played (only seeds), keep the highest-priority seed so the season
    // still shows as "Unranked / didn't play".
    const played = recs.filter((r) => r.matches > 0);
    const pool = played.length ? played : recs;
    const maxPrio = Math.max(...pool.map((r) => familyPriority(r.ratingId)));
    const fam = pool.filter((r) => familyPriority(r.ratingId) === maxPrio);
    fam.sort((a, b) => b.matches - a.matches || (b.updatedMs ?? 0) - (a.updatedMs ?? 0));
    const rep = fam[0];
    seedsDropped += recs.length - 1; // every non-representative row (migration seed / 2nd account)

    const season = resolveSeason(seasonId, rep.createdMs);
    const peakIndex = Math.max(rep.peakIndex || 0, rep.rankIndex || 0);
    seasons.push({
      seasonId,
      seasonN: season?.n ?? null,
      seasonLabel: season?.label ?? `#${seasonId}`,
      engine: rep.engine,
      engineLabel: rep.engine === 'openskill' ? 'OpenSkill' : 'IVK',
      ratingId: rep.ratingId,
      // RankPoints is only the genuine in-game ranked score for the S4+ IVK
      // tournament system (rankPoints = mu*10, same scale as the live ladder).
      // S2-S3 stored an OpenSkill internal score / experimental Terminal-Attack
      // value on a different scale (e.g. 87k, far above the real ~50k ceiling),
      // so RP from those seasons is NOT shown.
      rpReliable: /^IVKRankedTournamentRating/.test(rep.ratingId),
      rankIndex: rep.rankIndex || 0,
      peakIndex,
      rank: leagueInfo(rep.rankIndex || 0),
      peak: leagueInfo(peakIndex),
      rankPoints: rep.rankPoints || 0,
      matches: rep.matches || 0,
      mu: rep.mu,
      createdMs: rep.createdMs,
      updatedMs: rep.updatedMs,
      played: rep.matches > 0,
    });
  }

  seasons.sort((a, b) => (a.seasonN ?? 99) - (b.seasonN ?? 99) || (a.createdMs ?? 0) - (b.createdMs ?? 0));
  const playedSeasons = seasons.filter((s) => s.played);

  let peak = null;
  for (const s of seasons) if (s.peakIndex > 0 && (!peak || s.peakIndex > peak.peakIndex)) peak = s;

  return {
    seasons,
    played: playedSeasons.length > 0,
    peak, // season object whose peak was the highest ever, or null
    latest: playedSeasons.length ? playedSeasons[playedSeasons.length - 1] : null,
    seedsDropped,
  };
}

// --- hidden MMR (IVK, non-ranked playlists) --------------------------------
const IVK_META = {
  IVKCasualRating: { label: 'Casual', desc: 'Skill rating used to match you in casual modes (Quick Cash, Bank It, Power Shift…).' },
  IVKWorldTourRating: { label: 'World Tour', desc: 'Skill rating used for World Tour tournaments.' },
  IVKCasualAttackDefendRating: { label: 'Terminal Attack', desc: 'Skill rating for the casual attack-and-defend mode.' },
};
const IVK_ORDER = ['IVKCasualRating', 'IVKWorldTourRating', 'IVKCasualAttackDefendRating'];

// Keep the best record per ratingId: most matches wins (drops 0-match migration
// seeds and a merged second account's untouched ratings), newest as tiebreak.
function dedupeByRatingId(records) {
  const byId = new Map();
  for (const r of records) {
    const cur = byId.get(r.ratingId);
    if (!cur || r.matches > cur.matches || (r.matches === cur.matches && (r.updatedMs ?? 0) > (cur.updatedMs ?? 0))) byId.set(r.ratingId, r);
  }
  return byId;
}

function buildHiddenMmr(records) {
  const byId = dedupeByRatingId(records.filter((r) => r.engine === 'ivk' && !r.isRanked));
  const list = [...byId.values()].map((r) => {
    const meta = IVK_META[r.ratingId] || { label: r.ratingId.replace(/^IVK/, '').replace(/Rating$/, ''), desc: 'Hidden matchmaking rating.' };
    return { ratingId: r.ratingId, label: meta.label, desc: meta.desc, mu: r.mu, matches: r.matches, updatedMs: r.updatedMs, createdMs: r.createdMs };
  });
  list.sort((a, b) => {
    const ia = IVK_ORDER.indexOf(a.ratingId);
    const ib = IVK_ORDER.indexOf(b.ratingId);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.matches - a.matches;
  });
  return list;
}

// --- OpenSkill model (advanced) --------------------------------------------
const OS_META = {
  OpenSkillRating: { label: 'Overall (legacy)', desc: 'The original blended skill estimate from the first seasons.' },
  OpenSkillCasualRating: { label: 'Casual', desc: 'OpenSkill estimate for casual modes.' },
  OpenSkillTournamentRating: { label: 'Tournament', desc: 'OpenSkill estimate for tournament play.' },
  OpenSkillV2CasualRating: { label: 'Casual (v2)', desc: 'The reworked OpenSkill v2 casual estimate.' },
  OpenSkillCasualAttackDefendRating: { label: 'Terminal Attack', desc: 'OpenSkill estimate for the attack-and-defend mode.' },
  OpenSkillV2CasualAttackDefendRating: { label: 'Terminal Attack (v2)', desc: 'OpenSkill v2 estimate for the attack-and-defend mode.' },
};
const OS_ORDER = [
  'OpenSkillRating',
  'OpenSkillCasualRating',
  'OpenSkillV2CasualRating',
  'OpenSkillTournamentRating',
  'OpenSkillCasualAttackDefendRating',
  'OpenSkillV2CasualAttackDefendRating',
];

function buildOpenSkill(records) {
  const byId = dedupeByRatingId(records.filter((r) => r.engine === 'openskill' && !r.isRanked));
  const list = [...byId.values()].map((r) => {
    const meta = OS_META[r.ratingId] || { label: r.ratingId.replace(/^OpenSkill/, '').replace(/Rating$/, ''), desc: 'OpenSkill skill estimate.' };
    return {
      ratingId: r.ratingId,
      label: meta.label,
      desc: meta.desc,
      mu: r.mu,
      sigma: r.sigma,
      matches: r.matches,
      updatedMs: r.updatedMs,
      // OpenSkill's "conservative" rank score = mu − 3σ (what ladders sort on).
      conservative: r.mu != null && r.sigma != null ? r.mu - 3 * r.sigma : null,
    };
  });
  list.sort((a, b) => {
    const ia = OS_ORDER.indexOf(a.ratingId);
    const ib = OS_ORDER.indexOf(b.ratingId);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return list;
}

// --- public entry ----------------------------------------------------------
export function buildRatings(byType) {
  const records = parseRatingRecords(byType);
  const ranked = buildRanked(records);
  const hiddenMmr = buildHiddenMmr(records);
  const openSkill = buildOpenSkill(records);
  return {
    has: ranked.seasons.length > 0 || hiddenMmr.length > 0 || openSkill.length > 0,
    ranked,
    hiddenMmr,
    openSkill,
    recordCount: records.length,
  };
}
