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
  349883189: 11,
};

// seasonId → { n, label }. Falls back to "the season live at createdMs" for any
// future/unknown id (date of the player's real first game that season).
export function resolveSeason(seasonId, createdMs) {
  // hasOwn, not a bare lookup: seasonId comes from the export, so a key like
  // "constructor" would otherwise resolve to an inherited Object property and
  // put a function into seasonN.
  const known = Object.hasOwn(RANKED_SEASON_IDS, seasonId) ? RANKED_SEASON_IDS[seasonId] : RANKED_SEASON_IDS[Number(seasonId)];
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
    // Arrays are objects — without this an array Value synthesises a whole season
    // row out of the ObjectKey's id suffix.
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
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
// A season mid-engine-swap logs TWO ranked records; only one was the live ladder:
//   S2  — OpenSkillRankedRating live; IVKRankedRating is a shadow (few matches,
//         leagueRankIndex/rankPoints never assigned).
//   S3  — reversed: IVKRankedRating live, OpenSkillRankedRating the shadow.
//   S4+ — IVKRankedTournamentRating* only.
// The S3 shadow kept accumulating on the S2 point scale while S3's tier table
// sits 30k lower, so reading it lands up to 8 divisions high (measured 0-8 over
// the 6 exports that log both; the 0 is a player who never placed), saturating at
// Diamond 1 for the strongest. Verified against src/data/S3: the live IVK
// record's rankPoints equals the published rankScore.
const OPENSKILL_LAST_LIVE_SEASON = 2;

// Each family was live in a bounded window, so bound it in BOTH directions: a
// row outside its own window can only be a stray or a merged second account.
// Unknown season => only the tournament family can be trusted, since it is the
// one family that was live in every season it appears in.
const familyPriority = (ratingId, seasonN) => {
  if (/^OpenSkillRankedRating/.test(ratingId)) return seasonN != null && seasonN <= OPENSKILL_LAST_LIVE_SEASON ? 3 : 2;
  if (/^IVKRankedRating/.test(ratingId)) return seasonN === OPENSKILL_LAST_LIVE_SEASON + 1 ? 3 : 2;
  if (/^IVKRankedTournamentRating/.test(ratingId)) return seasonN == null || seasonN > OPENSKILL_LAST_LIVE_SEASON + 1 ? 4 : 2;
  return 0;
};
// Below this, the record is a parallel shadow rather than the season's ladder.
const LIVE_ENGINE_PRIORITY = 3;

function buildRanked(records) {
  const ranked = records.filter((r) => r.isRanked && r.seasonId);
  const groups = new Map();
  for (const r of ranked) {
    if (!groups.has(r.seasonId)) groups.set(r.seasonId, []);
    groups.get(r.seasonId).push(r);
  }

  // Resolve every group's season FIRST, because two different seasonIds cannot be
  // the same season and a hard-mapped id is authoritative. Mapped ids claim their
  // number up front; only then may an unmapped id be date-guessed, and only into a
  // number nobody has claimed. Without this, a new season's id (S12 before the
  // tables are updated) date-falls-back onto the newest known season and produces
  // two rows with the same label, so the headline card quotes one season's rank
  // under the other's name. Date-guessing prefers the earliest PLAYED record (the
  // player's real first game); 0-match rows are a weak hint — roughly half land
  // before the season opens and merged exports carry a second account's rows
  // mid-season — so they are used only as a fallback, and the claim check in pass
  // B below stops a bad guess from duplicating a real season.
  const earliest = (list) => list.reduce((m, r) => (r.createdMs != null && (m == null || r.createdMs < m) ? r.createdMs : m), null);
  const resolvedSeason = new Map();
  const claimed = new Set();
  // Exact keys first, THEN ones that only match via the Number() coercion in
  // resolveSeason ("0762104396", " 762104396", "7.62104396e8" all reach S2). Both
  // form their own group, and claiming is first-come, so without this ordering the
  // canonical id loses its own season whenever a twin happens to sit above it in
  // the file.
  const byExactness = [...groups.keys()].sort(
    (a, b) => Number(Object.hasOwn(RANKED_SEASON_IDS, b)) - Number(Object.hasOwn(RANKED_SEASON_IDS, a)) || String(a).localeCompare(String(b)),
  );
  for (const seasonId of byExactness) {
    const mapped = resolveSeason(seasonId, null);
    // Claim-check pass A too: two ids that both map to one number would otherwise
    // BOTH keep it, which is the duplicate this whole two-pass structure prevents.
    if (mapped && !claimed.has(mapped.n)) {
      resolvedSeason.set(seasonId, mapped);
      claimed.add(mapped.n);
    }
  }
  // Order the guesses by date, not by however the rows happened to sit in the
  // file: when two unmapped ids want the same free season the earlier one should
  // win, and the result must not depend on export row order.
  const pending = [...groups]
    .filter(([seasonId]) => !resolvedSeason.has(seasonId))
    .map(([seasonId, recs]) => ({ seasonId, at: earliest(recs.filter((r) => r.matches > 0)) ?? earliest(recs) }))
    // seasonId is the tie-break so equal (or absent) dates can't fall back to
    // file order, which is what "must not depend on row order" actually requires.
    .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || String(a.seasonId).localeCompare(String(b.seasonId)));
  for (const { seasonId, at } of pending) {
    const guess = resolveSeason(seasonId, at);
    const free = guess && !claimed.has(guess.n);
    if (free) claimed.add(guess.n);
    resolvedSeason.set(seasonId, free ? guess : null);
  }

  let seedsDropped = 0;
  const seasons = [];
  for (const [seasonId, recs] of groups) {
    const played = recs.filter((r) => r.matches > 0);
    const season = resolvedSeason.get(seasonId) ?? null;
    const seasonN = season?.n ?? null;

    // Among the engines that actually played, take the highest-priority one;
    // if none played (only seeds), keep the highest-priority seed so the season
    // still shows as "Unranked / didn't play".
    const pool = played.length ? played : recs;
    const maxPrio = Math.max(...pool.map((r) => familyPriority(r.ratingId, seasonN)));
    const fam = pool.filter((r) => familyPriority(r.ratingId, seasonN) === maxPrio);
    fam.sort((a, b) => b.matches - a.matches || (b.updatedMs ?? 0) - (a.updatedMs ?? 0));
    const rep = fam[0];
    // Only count genuinely EMPTY dropped rows here — the note this feeds calls
    // them placeholders, and a dropped shadow has real matches on it.
    seedsDropped += recs.filter((r) => r !== rep && r.matches === 0).length;

    const peakIndex = Math.max(rep.peakIndex || 0, rep.rankIndex || 0);
    // A shadow can't be trusted in EITHER direction: its rank reads high (S3's
    // runs on the S2 point scale) and its rank 0 would assert "Unranked" for a
    // season the player did rank in. So trust only the live engine — except when
    // the record shows no play AND no rank at all, where there is nothing to get
    // wrong and "Didn't play" beats withholding a season that was never played.
    const neverPlayed = rep.matches === 0 && peakIndex === 0;
    // familyPriority already handles an unknown season: it scores both S2/S3-era
    // families below LIVE_ENGINE_PRIORITY there, since neither can vouch for a
    // season we can't place, and only the tournament family (live in every season
    // it appears in) stays trusted.
    const rankReliable = neverPlayed || familyPriority(rep.ratingId, seasonN) >= LIVE_ENGINE_PRIORITY;
    seasons.push({
      seasonId,
      seasonN: season?.n ?? null,
      seasonLabel: season?.label ?? `#${seasonId}`,
      engine: rep.engine,
      engineLabel: rep.engine === 'openskill' ? 'OpenSkill' : 'IVK',
      ratingId: rep.ratingId,
      // rankPoints = mu*10 = the published rankScore, but only from S3, where IVK
      // became the live engine. An S2-era IVK row is a shadow on its own scale,
      // so gate on the season too. The ladder was also rescaled at S4: S3 ran
      // 2500 points per division to Platinum 4 (30000) then 5000 above it, where
      // S4+ is a flat 2500 — so RP is not comparable across that boundary.
      rpReliable: rankReliable && rep.engine === 'ivk' && seasonN != null && seasonN > OPENSKILL_LAST_LIVE_SEASON,
      rankReliable,
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
  // Headline cards quote only seasons with a trusted rank.
  const trusted = playedSeasons.filter((s) => s.rankReliable);
  // "Latest" = the highest SEASON NUMBER, which is structural. Only a season we
  // could not place falls back to a timestamp, and only to decide whether it sits
  // after the numbered ones — otherwise it would sort to the end (seasonN ?? 99)
  // and masquerade as the current rank. Do NOT rank the numbered seasons by date:
  // `updatedMs` is a last-WRITE time, bulk writes stamp up to 24 rows with one
  // identical value in these exports, and one export wrote its S3 row 12 days
  // after its S4 row already existed.
  const playedAt = (s) => s.updatedMs ?? s.createdMs ?? 0;
  let newest = null;
  for (const s of trusted) if (s.seasonN != null && (!newest || s.seasonN > newest.seasonN)) newest = s;
  for (const s of trusted) if (s.seasonN == null && (!newest || playedAt(s) > playedAt(newest))) newest = s;

  let peak = null;
  for (const s of seasons) if (s.rankReliable && s.peakIndex > 0 && (!peak || s.peakIndex > peak.peakIndex)) peak = s;

  return {
    seasons,
    played: playedSeasons.length > 0,
    peak, // season object whose peak was the highest ever, or null
    latest: newest,
    withheld: seasons.filter((s) => !s.rankReliable).length,
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
    // hasOwn: ratingId comes from the export, so a bare lookup on "constructor"
    // returns an inherited function and blanks the label (same hazard as the
    // seasonId lookup in resolveSeason).
    const meta = (Object.hasOwn(IVK_META, r.ratingId) && IVK_META[r.ratingId]) || { label: r.ratingId.replace(/^IVK/, '').replace(/Rating$/, ''), desc: 'Hidden matchmaking rating.' };
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
    const meta = (Object.hasOwn(OS_META, r.ratingId) && OS_META[r.ratingId]) || { label: r.ratingId.replace(/^OpenSkill/, '').replace(/Rating$/, ''), desc: 'OpenSkill skill estimate.' };
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
