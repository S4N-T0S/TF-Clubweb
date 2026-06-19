// Build the view-models the pages consume from raw parsed records.
// Runs ONCE after parsing; results are memoised in the provider.
import { resolveWeapon } from './weapons';
import { archetypeLabel, classifyMode, careerModeGroup, CAREER_MODE_GROUPS, parseMapVariant, parseCondition, roundsRemaining, stageLabel, stageTeams, tournamentPlacement } from './gameMeta';
import { resolveMap, conditionType } from './maps';
import { resolveDlc, steamAppUrl, STEAM_BASE_GAME_ID } from './economy';

// timestamp helpers (export mixes ISO-8601 strings and epoch-ms)
const toMs = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    if (/^\d{12,}$/.test(v)) return Number(v); // epoch-ms as string
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
};
const div = (a, b) => (b ? a / b : 0);

// Embark stamps a backend "is_spender" marker (whether the account has ever
// spent real money) and — oddly — it can ride along in the SAR export. It isn't
// in a fixed place across schema generations, so look in the likely homes:
// the Profile, the EmbarkUser, and the BucketObject KV store (both as an
// ObjectKey and inside a nested-JSON Value blob like player_career). Returns
// { value: bool|null, found, source } — value is null when the flag is absent.
const SPENDER_KEY_RE = /^is[_-]?spender$/i;
const truthyFlag = (v) => v === true || v === 1 || v === '1' || /^(true|yes)$/i.test(String(v ?? ''));

function scanKeysForSpender(obj, source) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of Object.keys(obj)) {
    if (SPENDER_KEY_RE.test(k)) return { value: truthyFlag(obj[k]), found: true, source };
  }
  return null;
}

function detectSpender(byType) {
  const direct =
    scanKeysForSpender((byType.Profile || [])[0], 'profile') ||
    scanKeysForSpender((byType.EmbarkUser || [])[0], 'account');
  if (direct) return direct;

  for (const b of byType.BucketObject || []) {
    if (typeof b?.ObjectKey === 'string' && SPENDER_KEY_RE.test(b.ObjectKey)) {
      return { value: truthyFlag(b.Value), found: true, source: 'bucket' };
    }
    // Some values are nested JSON (the schema notes "parse twice"); only bother
    // when the raw text actually mentions a spender flag.
    if (typeof b?.Value === 'string' && /spender/i.test(b.Value)) {
      let v = b.Value;
      for (let i = 0; i < 2 && typeof v === 'string'; i++) {
        try {
          v = JSON.parse(v);
        } catch {
          break;
        }
      }
      const hit = scanKeysForSpender(v, 'bucket');
      if (hit) return hit;
    }
  }
  return { value: null, found: false, source: null };
}

// identity / ban / linked accounts
function buildIdentity(byType) {
  const user = (byType.EmbarkUser || [])[0] || {};
  const profile = (byType.Profile || [])[0] || {};
  return {
    embarkUserId: user.EmbarkUserID ?? null,
    accountCreatedAt: user.CreatedAt || profile.CreatedAt || null,
    displayName: profile.DisplayName ?? null,
    discriminator: profile.DisplayNameDiscriminator ?? null,
    fullName:
      profile.DisplayName != null
        ? `${profile.DisplayName}#${profile.DisplayNameDiscriminator ?? '????'}`
        : null,
    email: profile.Email ?? null,
    emailVerifiedAt: profile.EmailVerifiedAt ?? null,
    dateOfBirth: profile.DateOfBirth ?? null,
    countryCode: profile.CountryCode ?? null,
    tosVersionSeen: profile.TOSVersionSeen ?? null,
    isPlaytester: profile.IsPlaytester ?? null,
    profileUpdatedAt: profile.UpdatedAt ?? null,
    spender: detectSpender(byType),
  };
}

// An account can carry SEVERAL Restriction records over its lifetime, so we
// surface them all. `active` = ongoing to our knowledge (permanent, or an EndsAt
// still in the future); the Career/landing banner uses that one, while the
// Account page lists the full history.
function buildBans(byType) {
  const nowMs = Date.now();
  const all = (byType.Restriction || [])
    .map((r) => {
      const endsAt = r.EndsAt ?? null;
      const endsMs = toMs(endsAt);
      const permanent = endsAt == null; // no EndsAt => permanent (per schema docs)
      return {
        reason: r.Reason ?? 'Unknown',
        startsAt: r.StartsAt ?? r.CreatedAt ?? null,
        createdAt: r.CreatedAt ?? null,
        endsAt,
        permanent,
        active: permanent || (endsMs != null && endsMs > nowMs),
      };
    })
    .sort((a, b) => (toMs(b.startsAt) ?? 0) - (toMs(a.startsAt) ?? 0)); // newest first

  const active = all.find((b) => b.active) || null;
  return {
    restricted: all.length > 0, // any restriction on record (past or present)
    hasActive: !!active, // an ongoing restriction exists
    active, // the ongoing restriction (or null) — for Career/landing display
    all, // full lifetime history — for the Account page
    count: all.length,
  };
}

// Resolve a linked account to a display handle + clickable profile URL.
// Shapes (confirmed from samples unless noted):
//   steam   -> ThirdPartyUserID is a SteamID64; name is the display name
//   twitch  -> LastSeenAccountName is "uid#name"; link uses the name part
//   xbox    -> "gamertag#tag"; display keeps it, URL drops the '#'
//   discord -> "name#0" is the legacy no-discriminator form; show just the name.
//   psn     -> psnprofiles.com/<name>
//   epic    -> fortnitetracker.com/profile/all/<name>
//   nexon   -> exists; representation unknown (email or username) 
function linkInfo(provider, name, id) {
  const n = name || '';
  switch (provider) {
    case 'steam':
      return { handle: n, url: id ? `https://steamcommunity.com/profiles/${id}` : null };
    case 'twitch': {
      const handle = n.includes('#') ? n.split('#').pop() : n;
      return { handle, url: handle ? `https://twitch.tv/${handle}` : null };
    }
    case 'xbox':
      return { handle: n, url: n ? `https://xboxgamertag.com/search/${n.replace(/#/g, '')}` : null };
    case 'psn':
      return { handle: n, url: n ? `https://psnprofiles.com/${n}` : null };
    case 'epic':
    case 'epicgames':
      return { handle: n, url: n ? `https://fortnitetracker.com/profile/all/${n}` : null };
    case 'discord':
      return { handle: /#0$/.test(n) ? n.replace(/#0$/, '') : n, url: null };
    default:
      return { handle: n, url: null }; // nexon and any future provider: display only
  }
}

function buildLinkedAccounts(byType) {
  return (byType.ThirdPartyUser || []).map((t) => {
    const provider = t.ThirdPartyProviderID ?? 'unknown';
    const name = t.LastSeenAccountName ?? null;
    const id = t.ThirdPartyUserID ?? null;
    return { provider, name, id, ...linkInfo(provider, name, id), enabled: t.Enabled ?? null, createdAt: t.CreatedAt ?? null };
  });
}

// --- career (aggregated across ALL RoundStatSummary snapshots) ------------
// An export can carry SEVERAL RoundStatSummary snapshots. They are DISJOINT
// epochs (successive stat-storage generations), NOT running cumulative totals:
// on real exports each snapshot's RoundsPlayed sum to the exact RoundStat record
// count. So lifetime = the per-bucket SUM across every snapshot.
//
// The previous "pick the newest snapshot by UpdatedAt" approach silently dropped
// data whenever the most recent epoch was small — e.g. a 68-round snapshot
// reporting ranked=0 hid 263 ranked rounds held in an earlier, larger snapshot,
// which surfaced as "0 ranked games played".
const SUMMARY_COUNTERS = [
  'Kills', 'Deaths', 'DamageDone', 'Dbnos', 'Respawns', 'RevivesDone',
  'RoundsPlayed', 'RoundsWon', 'TournamentsPlayed', 'TournamentsWon',
  'TotalCashOut', 'TotalTimePlayed', 'Disconnects',
];

function aggregateBucket(buckets) {
  const out = {};
  for (const f of SUMMARY_COUNTERS) out[f] = buckets.reduce((a, b) => a + (b?.[f] ?? 0), 0);
  // HighestFameAmount is a peak, not a counter -> take the max across epochs.
  out.HighestFameAmount = buckets.reduce((a, b) => Math.max(a, b?.HighestFameAmount ?? 0), 0);
  // Rates are derived -> recompute from the summed counters (can't average rates).
  out.RoundWinRate = out.RoundsPlayed ? out.RoundsWon / out.RoundsPlayed : null;
  out.TournamentWinRate = out.TournamentsPlayed ? out.TournamentsWon / out.TournamentsPlayed : null;
  // TimePlayedByArchetype is a per-archetype map -> merge by key.
  const arch = {};
  for (const b of buckets) for (const k in b?.TimePlayedByArchetype || {}) arch[k] = (arch[k] || 0) + (b.TimePlayedByArchetype[k] || 0);
  out.TimePlayedByArchetype = Object.keys(arch).length ? arch : null;
  return out;
}

function buildCareer(byType) {
  const summaries = byType.RoundStatSummary || [];
  const pluck = (key) => aggregateBucket(summaries.map((s) => s.Data?.[key]).filter(Boolean));
  const total = pluck('total');
  const casual = pluck('casual');
  const ranked = pluck('ranked');

  const wrap = (b) => ({
    kills: b.Kills ?? 0,
    deaths: b.Deaths ?? 0,
    damage: b.DamageDone ?? 0,
    revives: b.RevivesDone ?? 0,
    respawns: b.Respawns ?? 0,
    roundsPlayed: b.RoundsPlayed ?? 0,
    roundsWon: b.RoundsWon ?? 0,
    roundWinRate: b.RoundWinRate ?? null,
    tournamentsPlayed: b.TournamentsPlayed ?? 0,
    tournamentsWon: b.TournamentsWon ?? 0,
    tournamentWinRate: b.TournamentWinRate ?? null,
    totalCashOut: b.TotalCashOut ?? 0,
    timePlayedMs: b.TotalTimePlayed ?? 0,
    disconnects: b.Disconnects ?? 0,
    highestFame: b.HighestFameAmount ?? 0,
    timeByArchetype: b.TimePlayedByArchetype || null,
    kd: div(b.Kills ?? 0, b.Deaths ?? 0),
  });

  // RankBucket carries XP/Rank standings (ambiguous scope; surfaced raw).
  const ranks = (byType.RankBucket || []).map((rb) => ({ xp: rb.XP ?? null, rank: rb.Rank ?? null }));

  // Newest snapshot timestamp, purely for the "as of" display.
  const updatedAt = summaries.reduce(
    (mx, s) => {
      const t = toMs(s.UpdatedAt);
      return t != null && t > mx.t ? { t, raw: s.UpdatedAt } : mx;
    },
    { t: -Infinity, raw: null }
  ).raw;

  return {
    hasSummary: summaries.length > 0,
    updatedAt,
    total: wrap(total),
    casual: wrap(casual),
    ranked: wrap(ranked),
    // total > casual + ranked; the remainder is World Tour + LTM + practice.
    // Surface both its rounds AND its playtime so the three buckets visibly add
    // up to the headline total (otherwise total hours look inflated vs ranked+casual).
    otherRoundsPlayed: Math.max(0, total.RoundsPlayed - casual.RoundsPlayed - ranked.RoundsPlayed),
    otherTimePlayedMs: Math.max(0, total.TotalTimePlayed - casual.TotalTimePlayed - ranked.TotalTimePlayed),
    ranks,
  };
}

// --- matches: group rounds, aggregate weapons (single pass) ---------------
function newMatch(r, isTournament) {
  return {
    id: isTournament ? `T:${r.tournamentId}` : `R:${r.start ?? r.createdAt}:${r.scenarioId}:${r.squadId ?? ''}`,
    isTournament,
    tournamentId: r.tournamentId,
    mode: r.mode,
    map: r.map,
    condition: r.condition,
    start: r.start ?? toMs(r.createdAt),
    end: r.end ?? toMs(r.createdAt),
    rounds: [],
    kills: 0,
    deaths: 0,
    dbnos: 0,
    revives: 0,
    damage: 0,
    currency: 0,
    fame: 0,
    archetypes: new Set(),
    squadName: r.squadName ?? null,
    // Bracket stage is encoded as rounds-remaining (see gameMeta): the furthest
    // round reached is the MINIMUM, the first round played is the MAXIMUM.
    furthestRR: Infinity,
    maxRR: -Infinity,
    finalPlacement: r.position ?? null,
    teams: r.position ?? null,
    tournamentWon: false,
    won: false,
    disconnected: false,
  };
}

function addRound(m, r) {
  m.rounds.push(r);
  m.kills += r.kills;
  m.deaths += r.deaths;
  m.dbnos += r.dbnos;
  m.revives += r.revives;
  m.damage += r.damage;
  m.currency += r.currency;
  m.fame += r.fame;
  if (r.archetype && r.archetype !== '—') m.archetypes.add(r.archetype);
  if (r.start != null) m.start = Math.min(m.start ?? r.start, r.start);
  if (r.end != null) m.end = Math.max(m.end ?? r.end, r.end);
  if (r.position != null) m.teams = Math.max(m.teams ?? 0, r.position);
  // The furthest stage reached (the MIN rounds-remaining) defines the headline
  // placement; the MAX is the first round played (used to label the stages).
  if (r.rr != null) {
    if (r.rr > m.maxRR) m.maxRR = r.rr;
    if (r.rr <= m.furthestRR) {
      m.furthestRR = r.rr;
      if (r.position != null) m.finalPlacement = r.position;
    }
  }
  if (r.tournamentWon) m.tournamentWon = true;
  if (r.roundWon) m.won = true;
  if (r.disconnected) m.disconnected = true;
}

function buildMatchesAndWeapons(byType) {
  const rawRounds = byType.RoundStat || [];

  const weaponTotals = new Map(); // id -> kills
  const weaponsByArch = { Light: new Map(), Medium: new Map(), Heavy: new Map(), Unknown: new Map() };

  const normalized = new Array(rawRounds.length);
  for (let i = 0; i < rawRounds.length; i++) {
    const d = rawRounds[i].Data || {};
    const archetype = archetypeLabel(d.CharacterArchetype);
    const pmap = parseMapVariant(d.MapVariant);
    const rmap = resolveMap(d.MapVariant); // precise name + one bg photo + crop focus
    const cond = parseCondition(d.EnvironmentalCondition);
    const kpi = d.KillsPerItem || {};
    // Per-round weapon usage. KillsPerItem is kills-only (an item appears only
    // if it got a kill), so this is "what you killed with", not your loadout —
    // but the primary gun gets kills ~99% of rounds, so the top Weapon is a
    // reliable "weapon used". Gadgets/specs are tracked but kept out of the
    // headline pick (they'd be misleading as a loadout).
    let topWeapon = null; // best item of type Weapon/Event
    let topAny = null; // best item of any type (fallback for gadget-only rounds)
    const weaponKills = [];
    for (const id in kpi) {
      const k = kpi[id] || 0;
      weaponTotals.set(id, (weaponTotals.get(id) || 0) + k);
      const bucket = weaponsByArch[archetype] || weaponsByArch.Unknown;
      bucket.set(id, (bucket.get(id) || 0) + k);
      const w = resolveWeapon(id);
      const rec = { id, kills: k, name: w.name, slug: w.slug, icon: w.icon, type: w.type };
      weaponKills.push(rec);
      if (!topAny || k > topAny.kills) topAny = rec;
      if ((w.type === 'Weapon' || w.type === 'Event') && (!topWeapon || k > topWeapon.kills)) topWeapon = rec;
    }
    weaponKills.sort((a, b) => b.kills - a.kills);
    normalized[i] = {
      createdAt: rawRounds[i].CreatedAt,
      start: toMs(d.StartTime),
      end: toMs(d.EndTime),
      kills: d.Kills || 0,
      deaths: d.Deaths || 0,
      dbnos: d.Dbnos || 0,
      revives: d.RevivesDone || 0,
      damage: d.DamageDone || 0,
      currency: d.Currency || 0,
      fame: d.FameAmount || 0,
      archetype,
      map: pmap,
      mapName: rmap.name, // precise map name (Skyway Stadium, Horizon, …) or null
      mapImage: rmap.image, // one bundled background photo per map, or null
      mapFocus: rmap.focus, // object-position for cropping the wide photo
      layout: pmap.variant && pmap.variant !== 'Base' ? pmap.variant : null, // non-default layout
      condition: cond,
      condType: conditionType(cond), // time/weather icon family

      scenarioId: d.ScenarioID,
      tier: d.Tier,
      tournamentId: d.TournamentID != null && d.TournamentID !== '' ? String(d.TournamentID) : null,
      matchId: d.MatchID,
      rr: roundsRemaining(d.MatchID), // bracket stage as rounds-remaining
      tournamentWon: !!d.TournamentWon,
      roundWon: !!d.RoundWon,
      position: typeof d.LeaderboardPosition === 'number' ? d.LeaderboardPosition : null,
      backfill: !!d.IsBackfill,
      disconnected: !!d.Disconnected,
      squadName: d.SquadName ?? null,
      squadId: d.SquadID ?? null,
      mode: classifyMode(d),
      weapon: topWeapon || topAny || null, // primary weapon used this round (kills-based)
      weaponKills, // all items that got a kill this round, desc — for the "also killed with" line
    };
  }

  normalized.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

  // Group into matches.
  const matches = [];
  const tourneyIndex = new Map();
  for (const r of normalized) {
    if (r.tournamentId) {
      let m = tourneyIndex.get(r.tournamentId);
      if (!m) {
        m = newMatch(r, true);
        tourneyIndex.set(r.tournamentId, m);
        matches.push(m);
      }
      addRound(m, r);
    } else {
      const m = newMatch(r, false);
      addRound(m, r);
      matches.push(m);
    }
  }

  // finalise
  for (const m of matches) {
    m.kd = div(m.kills, m.deaths);
    m.durationMs = m.end != null && m.start != null ? Math.max(0, m.end - m.start) : null;
    m.archetypes = [...m.archetypes];
    // `teams` from the data is the max LeaderboardPosition SEEN — but a winner
    // only ever sees their own position (1), giving a bogus "of 1". Fall back to
    // the mode's canonical lobby size so e.g. a Terminal Attack / TDM win reads
    // "1st of 2", not "1st of 1".
    m.teams = Math.max(m.teams || 0, m.mode?.teams || 0) || null;
    for (const r of m.rounds) r.kd = div(r.kills, r.deaths);
    // Aggregate kill-credits across the whole match (for the K/D hover tooltip).
    const agg = new Map();
    for (const r of m.rounds) {
      for (const wk of r.weaponKills || []) {
        const e = agg.get(wk.id);
        if (e) e.kills += wk.kills;
        else agg.set(wk.id, { ...wk });
      }
    }
    m.weaponKills = [...agg.values()].sort((a, b) => b.kills - a.kills);
    if (m.isTournament) {
      const maxRR = Number.isFinite(m.maxRR) ? m.maxRR : null;
      const furthestRR = Number.isFinite(m.furthestRR) ? m.furthestRR : null;
      // A real 8-team bracket has qualifying rounds (some round with rr >= 1). A
      // 2-team single-match tournament — e.g. Terminal Attack, every round
      // MatchID "0-0" — is NOT a bracket, so it must not get an "of 8" placement.
      const isBracket = maxRR != null && maxRR >= 1;
      m.isBracket = isBracket;
      m.rounds.sort((a, b) => (b.rr ?? -1) - (a.rr ?? -1) || (a.start ?? 0) - (b.start ?? 0));
      if (isBracket) {
        const hasPrelim = maxRR >= 3; // deeper than the 8-team draw
        for (const r of m.rounds) {
          r.stageLabel = stageLabel(r.rr, maxRR);
          r.stageTeams = stageTeams(r.rr);
        }
        m.stageReachedLabel = stageLabel(furthestRR, maxRR);
        m.placement = tournamentPlacement(furthestRR, m.finalPlacement, hasPrelim);
      } else {
        // Sequential rounds (e.g. attack/defend) + a simple win/loss result.
        m.rounds.forEach((r, i) => {
          r.stageLabel = `Round ${i + 1}`;
          r.stageTeams = m.teams || 2;
        });
        m.stageReachedLabel = null;
        m.placement = null;
        m.won = m.tournamentWon || m.finalPlacement === 1;
      }
    } else {
      m.isBracket = false;
      m.stageReachedLabel = null;
      m.placement = null;
    }
    // The map is constant within a tournament, so any round gives the card's
    // photo / precise name; prefer a round that actually has bundled art.
    const rep = m.rounds.find((r) => r.mapImage) || m.rounds[0];
    m.mapName = rep?.mapName || null;
    m.mapImage = rep?.mapImage || null;
    m.mapFocus = rep?.mapFocus || '50% 40%';
  }
  matches.sort((a, b) => (b.start ?? 0) - (a.start ?? 0)); // newest first

  // Weapon view-models.
  const weapons = [...weaponTotals.entries()]
    .map(([id, kills]) => ({ id, kills, ...resolveWeapon(id) }))
    .sort((a, b) => b.kills - a.kills);

  const weaponsByArchetype = {};
  for (const arch of ['Light', 'Medium', 'Heavy']) {
    weaponsByArchetype[arch] = [...weaponsByArch[arch].entries()]
      .map(([id, kills]) => ({ id, kills, ...resolveWeapon(id) }))
      .sort((a, b) => b.kills - a.kills);
  }

  return { matches, weapons, weaponsByArchetype, roundCount: rawRounds.length, rounds: normalized };
}

// --- per-map / per-mode / per-class stat breakdowns -----------------------
// Computed from per-round fields. NB: per-WEAPON K/D is impossible (the export
// has per-weapon kills but no per-weapon deaths), so weapon stats stay kills-only.
function emptyStat(key, label, extra = {}) {
  return { key, label, rounds: 0, kills: 0, deaths: 0, damage: 0, wins: 0, highestKills: 0, timeMs: 0, ...extra };
}
function accStat(s, r) {
  s.rounds += 1;
  s.kills += r.kills;
  s.deaths += r.deaths;
  s.damage += r.damage;
  if (r.roundWon) s.wins += 1;
  if (r.kills > s.highestKills) s.highestKills = r.kills;
  if (r.end != null && r.start != null && r.end > r.start) s.timeMs += r.end - r.start;
}
function finalizeStats(map) {
  return [...map.values()]
    .map((s) => ({
      ...s,
      kd: s.deaths ? s.kills / s.deaths : s.kills,
      winRate: s.rounds ? s.wins / s.rounds : 0,
      avgKills: s.rounds ? s.kills / s.rounds : 0,
    }))
    .sort((a, b) => b.rounds - a.rounds);
}

function buildBreakdowns(rounds) {
  const byMap = new Map();
  const byMode = new Map();
  const byArchetype = new Map();

  for (const r of rounds) {
    // Prefer the precise name from maps.js (Fangwai City, Fortune Stadium, …);
    // fall back to the generic gameMeta codename only for unmapped variants.
    const mapKey = r.mapName || r.map?.display;
    if (mapKey) {
      if (!byMap.has(mapKey)) byMap.set(mapKey, emptyStat(mapKey, mapKey));
      accStat(byMap.get(mapKey), r);
    }
    const modeKey = r.mode?.label || 'Unknown';
    if (!byMode.has(modeKey)) byMode.set(modeKey, emptyStat(modeKey, modeKey, { category: r.mode?.category || 'Other' }));
    accStat(byMode.get(modeKey), r);

    const archKey = r.archetype && r.archetype !== '—' ? r.archetype : 'Unknown';
    if (!byArchetype.has(archKey)) byArchetype.set(archKey, emptyStat(archKey, archKey));
    accStat(byArchetype.get(archKey), r);
  }

  return { byMap: finalizeStats(byMap), byMode: finalizeStats(byMode), byArchetype: finalizeStats(byArchetype) };
}

// --- mode breakdown (counts per category, for the match filter) -----------
function buildModeBreakdown(matches) {
  const byCategory = {};
  const byLabel = {};
  for (const m of matches) {
    const cat = m.mode?.category || 'Other';
    const label = m.mode?.label || 'Unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    byLabel[label] = (byLabel[label] || 0) + 1;
  }
  return { byCategory, byLabel };
}

// --- career by game mode (for the Career pie + per-mode cards) -------------
// Aggregated from match history (the only per-mode source — the RoundStatSummary
// buckets are ranked/casual/total only). One match = one "session"; rounds,
// kills, win rate and playtime are summed from that match's rounds. Modes are
// folded into the named CAREER_MODE_GROUPS (+ Other) the player recognises.
function buildCareerModes(matches) {
  const groups = new Map();
  for (const m of matches) {
    const key = careerModeGroup(m.mode);
    let s = groups.get(key);
    if (!s) {
      s = { key, label: key, matches: 0, rounds: 0, kills: 0, deaths: 0, wins: 0, timeMs: 0, cash: 0 };
      groups.set(key, s);
    }
    s.matches += 1;
    for (const r of m.rounds) {
      s.rounds += 1;
      s.kills += r.kills;
      s.deaths += r.deaths;
      if (r.roundWon) s.wins += 1;
      if (r.end != null && r.start != null && r.end > r.start) s.timeMs += r.end - r.start;
      s.cash += r.currency || 0;
    }
  }
  // Stable display order (the named groups first, then Other), known modes only.
  const order = [...CAREER_MODE_GROUPS, 'Other'];
  return order
    .map((k) => groups.get(k))
    .filter(Boolean)
    .map((s) => ({
      ...s,
      kd: s.deaths ? s.kills / s.deaths : s.kills,
      winRate: s.rounds ? s.wins / s.rounds : 0,
      avgKills: s.rounds ? s.kills / s.rounds : 0,
    }));
}

// --- purchases / economy --------------------------------------------------
// Three persistence record types cover money/purchases: TransactionLog (every
// grant/purchase — no item id, usually no price), HardCurrencyLog (the premium
// "Multibucks" currency ledger, carrying a running balance), and the flat Steam
// DLC ownership rows (bucketed as `SteamDLC` by the parser). Real-money (fiat)
// spend is the TransactionLog subset with Source "realmoneytransaction", which
// alone carries PricePoint / CurrencyCode / LocalizedPrice.
function tally(rows, field) {
  const m = new Map();
  for (const r of rows) {
    const k = r[field] || 'unknown';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

// Premium-currency rows carry only the post-event running balance, not a signed
// delta, and same-timestamp events can arrive out of order in the file.
// Reconstruct the true chronological order by chaining balances: each row's
// (balance − signedQty) must equal the previous row's balance. (Verified to
// chain cleanly on real data.) `unknown`/earned/bought/gifted are inflows,
// `spent` an outflow.
const ledgerSign = (r) => (r.logType === 'spent' ? -1 : 1);

function chainGroup(group, anchor) {
  const pool = [...group];
  const out = [];
  let prev = anchor;
  while (pool.length) {
    let idx = prev != null ? pool.findIndex((r) => r.balance != null && r.balance - ledgerSign(r) * r.quantity === prev) : -1;
    if (idx < 0) {
      if (prev == null && out.length === 0) {
        // No anchor (the very first events): the head is the row no other leads into.
        const bals = new Set(pool.map((r) => r.balance));
        idx = pool.findIndex((r) => r.balance != null && !bals.has(r.balance - ledgerSign(r) * r.quantity));
        if (idx < 0) idx = 0;
      } else {
        // Chain broke (gap / ambiguous) — append the rest by balance, best-effort.
        pool.sort((a, b) => (a.balance ?? 0) - (b.balance ?? 0));
        out.push(...pool);
        break;
      }
    }
    const [r] = pool.splice(idx, 1);
    out.push(r);
    if (r.balance != null) prev = r.balance;
  }
  return out;
}

// Order ascending chronologically and attach the real signed `delta` (balance
// change) to each row, so the displayed amount always equals the balance step.
function orderLedger(rows) {
  const sorted = [...rows].sort((a, b) => {
    if (a.ms == null && b.ms == null) return 0;
    if (a.ms == null) return 1;
    if (b.ms == null) return -1;
    return a.ms - b.ms;
  });
  const out = [];
  let prev = null;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j].ms === sorted[i].ms) j++;
    const group = j - i === 1 ? [sorted[i]] : chainGroup(sorted.slice(i, j), prev);
    for (const r of group) {
      r.delta = prev != null && r.balance != null ? r.balance - prev : ledgerSign(r) * r.quantity;
      out.push(r);
      if (r.balance != null) prev = r.balance;
    }
    i = j;
  }
  return out;
}

function buildEconomy(byType) {
  // Full grant/purchase feed (newest first). GameStorePurchasedAt is when the
  // purchase happened; fall back to CreatedAt for non-store grants. createdMs is
  // the backend grant time, used to link fiat purchases to what they granted.
  const transactions = (byType.TransactionLog || [])
    .map((t) => ({
      type: t.TransactionType ?? 'unknown',
      state: t.State ?? 'unknown',
      source: t.Source ?? 'unknown',
      store: t.GameStore ?? null,
      ms: toMs(t.GameStorePurchasedAt ?? t.CreatedAt),
      createdMs: toMs(t.CreatedAt),
      purchasedAt: t.GameStorePurchasedAt ?? t.CreatedAt ?? null,
      pricePoint: typeof t.PricePoint === 'number' ? t.PricePoint : null,
      currency: t.CurrencyCode ?? null,
      country: t.Country ?? null,
      localizedPrice: t.LocalizedPrice ?? null,
      granted: t.State === 'granted',
      isFiat: t.Source === 'realmoneytransaction',
      contents: null,
    }))
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0));

  const grantedCount = transactions.filter((t) => t.granted).length;

  // Raw Multibucks ledger rows (for totals, linking, and chronological ordering).
  const rawLedger = (byType.HardCurrencyLog || []).map((h) => ({
    logType: h.LogType ?? 'unknown',
    quantity: typeof h.Quantity === 'number' ? h.Quantity : 0,
    balance: typeof h.NewUserTotalBalance === 'number' ? h.NewUserTotalBalance : null,
    ms: toMs(h.CreatedAt ?? h.UpdatedAt),
    createdAt: h.CreatedAt ?? h.UpdatedAt ?? null,
  }));

  // Steam DLC ownership — rows are duplicated (≈4× per DLC), so dedup on DLCID
  // and keep the earliest CreatedAt as the "owned since" date.
  const dlcMap = new Map();
  for (const d of byType.SteamDLC || []) {
    const id = d.DLCID;
    if (id == null) continue;
    const ms = toMs(d.CreatedAt);
    const rec = dlcMap.get(id) || { dlcId: id, ownedSinceMs: Infinity, copies: 0 };
    rec.copies += 1;
    if (ms != null && ms < rec.ownedSinceMs) rec.ownedSinceMs = ms;
    dlcMap.set(id, rec);
  }
  const dlc = [...dlcMap.values()]
    .map((d) => ({ ...d, ownedSinceMs: Number.isFinite(d.ownedSinceMs) ? d.ownedSinceMs : null, ...resolveDlc(d.dlcId) }))
    .sort((a, b) => (a.ownedSinceMs ?? 0) - (b.ownedSinceMs ?? 0));

  // Link each real-money purchase to what it granted. The backend stamps the
  // fiat tx, the Multibucks "bought" ledger row and any Steam DLC row with the
  // SAME CreatedAt (verified exact on real data; DLC packs bundle Multibucks),
  // so match within a small window. Lets us show *what* a charge actually bought.
  const boughtEvents = rawLedger.filter((l) => l.logType === 'bought' && l.ms != null);
  const LINK_TOL = 2000; // ms
  for (const t of transactions) {
    if (!t.isFiat || t.createdMs == null) continue;
    const mb = boughtEvents.find((b) => Math.abs(b.ms - t.createdMs) <= LINK_TOL);
    const dlcs = dlc.filter((d) => d.ownedSinceMs != null && Math.abs(d.ownedSinceMs - t.createdMs) <= LINK_TOL);
    if (mb || dlcs.length) t.contents = { mb: mb ? mb.quantity : null, dlcs: dlcs.map((d) => ({ dlcId: d.dlcId, name: d.name, url: d.url })) };
  }

  // Real-money (fiat) spend. IMPORTANT: PricePoint is Valve's *base* price tier
  // (≈ USD/EUR list price), NOT the amount actually charged. For a PLN wallet,
  // PricePoint 4.99 was billed PLN 20.95 — and most rows have no LocalizedPrice.
  // So the only true local amount is LocalizedPrice (when present); the summed
  // PricePoint total is an approximate USD-list estimate, never the real local
  // spend. CurrencyCode is the wallet currency and does NOT scale PricePoint.
  const fiat = transactions.filter((t) => t.isFiat);
  const fiatGranted = fiat.filter((t) => t.granted && t.pricePoint != null);
  const spendBaseTotal = fiatGranted.reduce((s, t) => s + t.pricePoint, 0);
  const walletCurrencies = [...new Set(fiatGranted.map((t) => t.currency).filter(Boolean))];
  const anyLocalized = fiat.some((t) => t.localizedPrice);

  // Reconstruct true chronological order (+ per-row delta), then present newest
  // first for the table; the chart uses one point per timestamp (net balance).
  const orderedAsc = orderLedger(rawLedger);
  const ledger = [...orderedAsc].reverse();
  let currentBalance = null;
  for (let i = orderedAsc.length - 1; i >= 0; i--) {
    if (orderedAsc[i].balance != null) {
      currentBalance = orderedAsc[i].balance;
      break;
    }
  }
  const balanceSeries = [];
  for (let i = 0; i < orderedAsc.length; i++) {
    const r = orderedAsc[i];
    if (r.ms == null || r.balance == null) continue;
    const next = orderedAsc[i + 1];
    if (!next || next.ms !== r.ms) balanceSeries.push({ ms: r.ms, balance: r.balance });
  }

  // Multibucks in/out from the reconstructed deltas (the ACTUAL balance change
  // per event), grouped by LogType. Using deltas — not the raw Quantity field —
  // means the categories RECONCILE (total in − out = current balance − start)
  // and an occasional `unknown` OUTFLOW (a correction) is routed to "out" rather
  // than miscounted as an inflow.
  const mb = { earned: 0, bought: 0, gifted: 0, other: 0, out: 0 };
  for (const r of orderedAsc) {
    const d = r.delta || 0;
    if (d > 0) mb[r.logType === 'earned' || r.logType === 'bought' || r.logType === 'gifted' ? r.logType : 'other'] += d;
    else if (d < 0) mb.out += -d;
  }
  mb.inTotal = mb.earned + mb.bought + mb.gifted + mb.other;
  mb.startBalance = orderedAsc[0] && orderedAsc[0].balance != null && orderedAsc[0].delta != null ? orderedAsc[0].balance - orderedAsc[0].delta : 0;

  // Limited-time store offer windows shown to the player (impressions, NOT
  // confirmed purchases). Absent from some exports.
  const offers = (byType.OfferTransaction || [])
    .map((o) => ({
      ms: toMs(o.StartedTime),
      startedAt: o.StartedTime ?? null,
      durationSec: typeof o.DurationInSeconds === 'number' ? o.DurationInSeconds : null,
      completed: !!o.IsCompleted,
    }))
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0));

  return {
    has: transactions.length > 0 || ledger.length > 0 || dlc.length > 0,
    transactions,
    transactionCount: transactions.length,
    grantedCount,
    bySource: tally(transactions, 'source'),
    byStore: tally(transactions, 'store'),
    fiat,
    fiatGranted,
    fiatGrantedCount: fiatGranted.length,
    fiatFailedCount: fiat.length - fiatGranted.length,
    spendBaseTotal,
    walletCurrencies,
    anyLocalized,
    ledger,
    mb,
    currentBalance,
    balanceSeries,
    dlc,
    baseGameUrl: steamAppUrl(STEAM_BASE_GAME_ID),
    offers,
  };
}

// --- anti-cheat / sessions / hardware signals -----------------------------
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
// A real IP, not a donor redaction placeholder ("[REDACTED]", "CLEAN", …).
const isRealIp = (s) => typeof s === 'string' && (IPV4_RE.test(s) || (s.includes(':') && /^[0-9a-f:]+$/i.test(s) && s.length >= 3));
const ipVersion = (s) => (s.includes(':') ? 6 : 4);

const RETENTION = {
  EOS: 'EOS keeps a windowed snapshot of recent sessions.',
  Anybrain: 'Anybrain logs begin at the integration go-live (2025-07-24).',
  Denuvo: 'Denuvo keeps a rolling ~6-month window ending at the ban (active platform).',
};

// Flatten every anti-cheat source into one comparable session list.
function collectSessions(raw) {
  const sessions = [];
  for (const ac of raw.eos.anticheat) {
    for (const s of ac?.sessions || []) {
      sessions.push({
        source: 'EOS',
        start: toMs(s.timeStart),
        end: toMs(s.timeEnd),
        os: s.eacClient?.OperatingSystem || null,
        ip: s.eacClient?.ClientIP || null,
        build: s.gameClient?.ClientBuildTime || null,
        platform: null,
      });
    }
  }
  for (const r of raw.anybrain.sessions || []) {
    sessions.push({ source: 'Anybrain', start: toMs(r.sessionStart), end: toMs(r.sessionEnd), os: null, ip: r.ipAddress || null, build: null, platform: null });
  }
  for (const d of raw.denuvo) {
    const platform = d?.gameInfos?.[0]?.name || null;
    for (const s of d?.sessionInfos || []) {
      sessions.push({ source: 'Denuvo', start: toMs(s.start), end: toMs(s.end), os: null, ip: null, build: null, platform });
    }
  }
  for (const s of sessions) s.durationMs = s.start != null && s.end != null && s.end > s.start ? s.end - s.start : null;
  sessions.sort((a, b) => (b.start ?? 0) - (a.start ?? 0)); // newest first
  return sessions;
}

// Weekly session counts across the whole range — drives the activity strip.
function buildActivity(sessions) {
  const times = sessions.map((s) => s.start).filter((t) => t != null);
  if (!times.length) return [];
  const WEEK = 7 * 86_400_000;
  let min = Infinity;
  let max = -Infinity;
  for (const t of times) {
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const startWk = Math.floor(min / WEEK);
  const n = Math.min(600, Math.floor(max / WEEK) - startWk + 1);
  const buckets = new Array(n).fill(0);
  for (const t of times) {
    const i = Math.floor(t / WEEK) - startWk;
    if (i >= 0 && i < n) buckets[i]++;
  }
  return buckets.map((count, i) => ({ ms: (startWk + i) * WEEK, count }));
}

function buildAntiCheat(raw) {
  const kicks = [];
  for (const ac of raw.eos.anticheat) if (Array.isArray(ac?.kicks)) kicks.push(...ac.kicks);

  const sessions = collectSessions(raw);
  const countBy = (name) => sessions.filter((s) => s.source === name).length;

  // Per-source active range + count, for the retention display.
  const sources = ['EOS', 'Anybrain', 'Denuvo']
    .map((name) => {
      const ss = sessions.filter((s) => s.source === name);
      if (!ss.length) return null;
      const starts = ss.map((s) => s.start).filter((t) => t != null);
      const ends = ss.map((s) => s.end ?? s.start).filter((t) => t != null);
      return {
        name,
        count: ss.length,
        firstMs: starts.length ? Math.min(...starts) : null,
        lastMs: ends.length ? Math.max(...ends) : null,
        note: RETENTION[name],
      };
    })
    .filter(Boolean);

  // Unique real IPs (redaction placeholders are counted separately, not mapped).
  const ipMap = new Map();
  let redactedIpCount = 0;
  for (const s of sessions) {
    if (!s.ip) continue;
    if (!isRealIp(s.ip)) {
      redactedIpCount++;
      continue;
    }
    let rec = ipMap.get(s.ip);
    if (!rec) {
      rec = { ip: s.ip, version: ipVersion(s.ip), count: 0, firstMs: Infinity, lastMs: -Infinity, sources: new Set() };
      ipMap.set(s.ip, rec);
    }
    rec.count++;
    rec.sources.add(s.source);
    if (s.start != null) {
      rec.firstMs = Math.min(rec.firstMs, s.start);
      rec.lastMs = Math.max(rec.lastMs, s.start);
    }
  }
  const ips = [...ipMap.values()]
    .map((r) => ({ ...r, sources: [...r.sources], firstMs: Number.isFinite(r.firstMs) ? r.firstMs : null, lastMs: Number.isFinite(r.lastMs) ? r.lastMs : null }))
    .sort((a, b) => b.count - a.count);

  const eosOses = [...new Set(sessions.filter((s) => s.source === 'EOS' && s.os).map((s) => s.os))];
  const anybrainOses = [...new Set((raw.anybrain.os || []).map((r) => r.name).filter(Boolean))];
  const resolutions = [...new Set((raw.anybrain.screens || []).map((r) => (r.width && r.height ? `${r.width}×${r.height}` : null)).filter(Boolean))];

  const tamperIds = new Set();
  for (const l of raw.audit?.byType?.ClientUserLoginDetails || []) if (l?.tamper_id) tamperIds.add(l.tamper_id);

  return {
    kicks,
    kickCount: kicks.length,
    sessions,
    sessionCounts: { eos: countBy('EOS'), anybrain: countBy('Anybrain'), denuvo: countBy('Denuvo') },
    eosSessionCount: countBy('EOS'), // back-compat with the Account page
    anybrainSessionCount: countBy('Anybrain'),
    sources,
    activity: buildActivity(sessions),
    ips,
    redactedIpCount,
    operatingSystems: [...new Set([...eosOses, ...anybrainOses])],
    resolutions,
    distinctTamperIds: tamperIds.size,
    denuvoPlatforms: raw.denuvo.length,
  };
}

// --- player reports (audit `PlayerReport` events) -------------------------
// Reports the subject FILED against other players. Embark anonymises who was
// reported (target origin_uuid is blank), but keeps the reason and the free-text
// note. This is NOT an action against the subject's own account — the ban
// history covers that.
function buildReports(raw) {
  const rows = raw.audit?.byType?.PlayerReport || [];
  const reports = rows
    .map((r) => ({
      ms: toMs(r.logtime),
      loggedAt: r.logtime ?? null,
      reason: r.reason || 'Unknown',
      message: r.message || null,
      target: r.target_client?.origin_uuid || null,
    }))
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0)); // newest first
  const byReason = {};
  for (const r of reports) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  return { count: reports.length, reports, byReason };
}

/** Build the full set of view-models from parsed raw records. */
export function buildModel(raw) {
  const byType = raw.persistence.byType;

  const { matches, weapons, weaponsByArchetype, roundCount, rounds } = buildMatchesAndWeapons(byType);
  const lastActivity = matches.reduce((mx, m) => Math.max(mx, m.end ?? m.start ?? 0), 0) || null;

  // True tournament counts = DISTINCT tournaments (grouped by TournamentID), not
  // the RoundStatSummary's `TournamentsPlayed`, which actually counts tournament
  // *rounds* (verified on redacted: summary 5216 ≈ 5261 tournament rounds, but only
  // 2665 distinct tournaments). Wins match either way (one TournamentWon round
  // per won tournament). So derive both from the grouped matches.
  let tournamentsPlayed = 0;
  let tournamentsWon = 0;
  for (const m of matches) {
    if (m.isTournament) tournamentsPlayed++;
    if (m.tournamentWon) tournamentsWon++;
  }

  return {
    identity: buildIdentity(byType),
    ban: buildBans(byType),
    linkedAccounts: buildLinkedAccounts(byType),
    career: buildCareer(byType),
    matches,
    modeBreakdown: buildModeBreakdown(matches),
    careerModes: buildCareerModes(matches),
    breakdowns: buildBreakdowns(rounds),
    weapons,
    weaponsByArchetype,
    economy: buildEconomy(byType),
    antiCheat: buildAntiCheat(raw),
    reports: buildReports(raw),
    meta: {
      roundCount,
      matchCount: matches.length,
      tournamentsPlayed,
      tournamentsWon,
      counts: raw.persistence.counts,
      lastActivity,
      hasAudit: !!raw.audit,
      hasEos: raw.eos.anticheat.length > 0,
      hasAnybrain: (raw.anybrain.os?.length || raw.anybrain.sessions?.length || 0) > 0,
      hasDenuvo: raw.denuvo.length > 0,
    },
  };
}
