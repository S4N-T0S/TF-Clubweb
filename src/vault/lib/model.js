// Build the view-models the pages consume from raw parsed records.
// Runs ONCE after parsing; results are memoised in the provider.
import { resolveWeapon } from './weapons';
import { archetypeLabel, classifyMode, careerModeGroup, CAREER_MODE_GROUPS, parseMapVariant, parseCondition, roundsRemaining, stageLabel, stageTeams, tournamentPlacement } from './gameMeta';
import { resolveMap, resolveLtmBackground, conditionType } from './maps';
import { resolveDlc, steamAppUrl, STEAM_BASE_GAME_ID } from './economy';
import { buildRatings } from './ratings';

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
const flatLabel = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const SPENDER_KEY_RE = /^is[_-]?spender$/i;
const truthyFlag = (v) => v === true || v === 1 || v === '1' || /^(true|yes)$/i.test(String(v ?? ''));

function scanKeysForSpender(obj, source) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of Object.keys(obj)) {
    if (SPENDER_KEY_RE.test(k)) return { value: truthyFlag(obj[k]), found: true, source };
  }
  return null;
}

// The flag's real home is the AUDIT trail: it rides along in the snake_case
// `ProfileUpdated`/`2`/`3` profile snapshots, NOT the persistence Profile (which
// usually omits it). Those snapshots are versioned and repeat over the account's
// life, and the flag is NOT sticky — it flips false when the email loses verified
// status — so take the latest one (by logtime) that carries it = current value.
function detectSpenderFromAudit(auditByType) {
  if (!auditByType) return null;
  let best = null; // { ms, value }
  for (const type of ['ProfileUpdated3', 'ProfileUpdated2', 'ProfileUpdated']) {
    for (const r of auditByType[type] || []) {
      const hit = scanKeysForSpender(r, 'audit');
      if (!hit) continue;
      const ms = toMs(r.logtime);
      if (!best || (ms ?? -Infinity) >= (best.ms ?? -Infinity)) best = { ms, value: hit.value };
    }
  }
  return best ? { value: best.value, found: true, source: 'audit' } : null;
}

function detectSpender(byType, auditByType) {
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
  // Not in persistence anywhere — fall back to the audit profile snapshots.
  return detectSpenderFromAudit(auditByType) || { value: null, found: false, source: null };
}

// identity / ban / linked accounts
function buildIdentity(byType, auditByType) {
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
    spender: detectSpender(byType, auditByType),
  };
}

// An account can carry SEVERAL Restriction records over its lifetime, so we
// surface them all. `active` = ongoing to our knowledge (permanent, or an EndsAt
// still in the future) AND not since cancelled; the Career/landing banner uses
// that one, while the Account page lists the full history.
//
// `CancelReason` + `CancelledAt` (e.g. Embark support lifting a ban for
// "Player contact" / "Incorrect restriction" / "Goodwill") mean the restriction
// was REVERSED — it no longer applies even when it had no end date, so a
// cancelled restriction never counts as active.
function buildBans(byType) {
  const nowMs = Date.now();
  const all = (byType.Restriction || [])
    .map((r) => {
      const endsAt = r.EndsAt ?? null;
      const endsMs = toMs(endsAt);
      const cancelledAt = r.CancelledAt ?? null;
      const cancelReason = r.CancelReason ?? null;
      const cancelled = cancelledAt != null || cancelReason != null; // lifted by support
      const permanent = endsAt == null; // no EndsAt => open-ended (per schema docs)
      return {
        reason: r.Reason ?? 'Unknown',
        startsAt: r.StartsAt ?? r.CreatedAt ?? null,
        createdAt: r.CreatedAt ?? null,
        endsAt,
        cancelledAt,
        cancelReason,
        cancelled,
        permanent,
        active: !cancelled && (permanent || (endsMs != null && endsMs > nowMs)),
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
    cancelledCount: all.filter((b) => b.cancelled).length, // how many were lifted
  };
}

// Resolve a linked account to a display handle + clickable profile URL.
// Shapes (confirmed from samples unless noted):
//   steam   -> ThirdPartyUserID is a SteamID64; name is the display name
//   twitch  -> LastSeenAccountName is "uid#name"; link uses the name part
//   xbox    -> "gamertag#tag"; display keeps it, URL drops the '#'
//   discord -> "name#0" is the legacy no-discriminator form; show just the name.
//   psn     -> psnprofiles.com/?psnId=<name>
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
      return { handle: n, url: n ? `https://psnprofiles.com/?psnId=${n}` : null };
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

// --- Embark accounts -------------------------------------------------------
// An export can WRAP MULTIPLE Embark accounts
function buildAccounts(byType) {
  const users = byType.EmbarkUser || [];
  const profiles = byType.Profile || [];
  const mk = (p, u) => ({
    embarkUserId: u?.EmbarkUserID ?? null,
    displayName: p?.DisplayName ?? null,
    discriminator: p?.DisplayNameDiscriminator ?? null,
    fullName: p?.DisplayName != null ? `${p.DisplayName}#${p.DisplayNameDiscriminator ?? '????'}` : null,
    email: p?.Email ?? null,
    emailVerifiedAt: p?.EmailVerifiedAt ?? null,
    countryCode: p?.CountryCode ?? null,
    createdAt: p?.CreatedAt ?? u?.CreatedAt ?? null,
    createdMs: toMs(p?.CreatedAt) ?? toMs(u?.CreatedAt),
  });
  // Normally one Profile per EmbarkUser; pair by nearest CreatedAt.
  const list = (profiles.length ? profiles : users).map((rec) => {
    if (!profiles.length) return mk(null, rec); // EmbarkUser-only (rare)
    const pMs = toMs(rec.CreatedAt);
    let user = null;
    let diff = Infinity;
    for (const u of users) {
      const d = Math.abs((toMs(u.CreatedAt) ?? 0) - (pMs ?? 0));
      if (d < diff) { diff = d; user = u; }
    }
    return mk(rec, user);
  });
  return list.sort((a, b) => (a.createdMs ?? 0) - (b.createdMs ?? 0)); // oldest first
}

// Attribute a ProfileUpdated event to one account. Its `created_msts` IS the
// account's creation time (matches Profile.CreatedAt), so it's the reliable key
// when present — essential while two accounts overlap in time. Older-schema events
// omit it; fall back to "the account current at logtime" (the most-recently-created
// account that already existed then), safe because those events predate later ones.
function attributeAccount(accounts, createdMsts, logMs) {
  if (accounts.length <= 1) return accounts[0] || null;
  if (createdMsts != null) {
    let best = accounts[0];
    let diff = Infinity;
    for (const a of accounts) {
      const d = Math.abs((a.createdMs ?? 0) - createdMsts);
      if (d < diff) { diff = d; best = a; }
    }
    return best;
  }
  let chosen = accounts[0];
  for (const a of accounts) if ((a.createdMs ?? 0) <= (logMs ?? Infinity)) chosen = a;
  return chosen;
}

// Collect EVERY distinct email Embark has on file, across ALL sources: persistence
// Profile(s), the audit `ProfileUpdated*` + `EmailCollectedProfileStore2` `email`
// fields, and the addresses embedded in the SES send/delivery logs
// (`AwsSesEvent.mail`, `EmailStatus.delivery` — nested-JSON strings). Captures
// emails you've CHANGED AWAY from, and recovers the address when one file redacts
// it but another doesn't. Embark's own sending addresses are filtered out.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SYSTEM_EMAIL_RE = /@embark\.email\b|amazonses|@sentry|noreply|no-reply|donotreply|do-not-reply/i;
const isRealEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && /[A-Za-z0-9]/.test(e.split('@')[0]) && !SYSTEM_EMAIL_RE.test(e);

function collectEmails(byType, auditByType) {
  const found = new Map(); // lowercased -> { email, sources:Set, count }
  const add = (raw, source) => {
    if (typeof raw !== 'string') return;
    const e = raw.trim();
    if (!isRealEmail(e)) return;
    const key = e.toLowerCase();
    let rec = found.get(key);
    if (!rec) found.set(key, (rec = { email: e, sources: new Set(), count: 0 }));
    rec.sources.add(source);
    rec.count += 1;
  };
  for (const p of byType.Profile || []) add(p.Email, 'profile');
  const A = auditByType || {};
  for (const t of ['ProfileUpdated', 'ProfileUpdated2', 'ProfileUpdated3', 'EmailCollectedProfileStore2']) {
    for (const r of A[t] || []) add(r.email, 'audit');
  }
  // Addresses embedded in the SES nested-JSON blobs — regex them out (don't full-parse).
  for (const r of A.AwsSesEvent || []) {
    const m = typeof r.mail === 'string' ? r.mail.match(EMAIL_RE) : null;
    if (m) for (const e of m) add(e, 'sent');
  }
  for (const r of A.EmailStatus || []) {
    const blob = [r.delivery, r.bounce, r.complaint].filter((v) => typeof v === 'string').join(' ');
    const m = blob.match(EMAIL_RE);
    if (m) for (const e of m) add(e, 'sent');
  }
  return [...found.values()]
    .map((r) => ({ email: r.email, sources: [...r.sources], count: r.count }))
    .sort((a, b) => b.count - a.count);
}

// --- name history ---------------------------------------------------------
const NUMERIC_PROVIDER = { 8: 'steam', 3: 'xbox' }; // confirmed; PSN/others TBD (no sample yet)

// Collapse a time-ordered [{name, ms}] list into consecutive-name spans.
function nameSpans(events) {
  events.sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0));
  const spans = [];
  for (const e of events) {
    const last = spans[spans.length - 1];
    if (last && last.name === e.name) {
      if (e.ms != null) last.lastMs = e.ms;
      last.count += 1;
    } else {
      spans.push({ name: e.name, firstMs: e.ms, lastMs: e.ms, count: 1 });
    }
  }
  return spans;
}

function buildEmbarkNameHistory(auditByType, accounts) {
  // Merge all ProfileUpdated schema generations, attributing each event to its
  // account via created_msts (so two merged accounts don't read as one renaming).
  const perAccount = new Map(); // key -> { account, events }
  for (const type of ['ProfileUpdated', 'ProfileUpdated2', 'ProfileUpdated3']) {
    for (const r of (auditByType || {})[type] || []) {
      const name = r.display_name;
      if (name == null || name === '') continue;
      const disc = r.display_name_discriminator;
      const ms = toMs(r.logtime);
      const account = attributeAccount(accounts, r.created_msts ?? null, ms);
      const key = account?.embarkUserId ?? account?.createdMs ?? '_';
      let bucket = perAccount.get(key);
      if (!bucket) perAccount.set(key, (bucket = { account, events: [] }));
      bucket.events.push({ name: disc != null && disc !== '' ? `${name}#${disc}` : name, ms });
    }
  }
  const accts = [...perAccount.values()]
    .map(({ account, events }) => {
      const spans = nameSpans(events);
      return {
        embarkUserId: account?.embarkUserId ?? null,
        label: account?.fullName ?? spans[spans.length - 1]?.name ?? null,
        createdAt: account?.createdAt ?? null,
        spans,
        changed: spans.length > 1,
        current: spans[spans.length - 1] || null,
      };
    })
    .sort((a, b) => (a.spans[0]?.firstMs ?? 0) - (b.spans[0]?.firstMs ?? 0));
  return { has: accts.length > 0, multi: accts.length > 1, accounts: accts };
}

function buildPlatformNameHistory(raw) {
  const rows = raw.audit?.byType?.AccountNameAudit2 || [];
  const idToProvider = new Map();
  for (const t of raw.persistence?.byType?.ThirdPartyUser || []) {
    if (t.ThirdPartyUserID != null) idToProvider.set(String(t.ThirdPartyUserID), t.ThirdPartyProviderID || null);
  }
  const byAccount = new Map(); // third_party_user_id -> { provider, events }
  for (const r of rows) {
    const name = r.last_seen_account_name || null;
    if (!name) continue;
    const uid = r.third_party_user_id != null ? String(r.third_party_user_id) : `pid:${r.third_party_provider_id}`;
    const provider =
      idToProvider.get(uid) ||
      NUMERIC_PROVIDER[r.third_party_provider_id] ||
      (r.third_party_provider_id != null ? `provider-${r.third_party_provider_id}` : 'unknown');
    let acc = byAccount.get(uid);
    if (!acc) byAccount.set(uid, (acc = { uid, provider, events: [] }));
    acc.events.push({ name, ms: toMs(r.logtime) });
  }
  return [...byAccount.values()]
    .map((a) => {
      const spans = nameSpans(a.events);
      return { provider: a.provider, uid: a.uid, spans, changed: spans.length > 1, current: spans[spans.length - 1] || null, firstMs: spans[0]?.firstMs ?? null };
    })
    .sort((a, b) => (b.current?.lastMs ?? 0) - (a.current?.lastMs ?? 0)); // most-recent account first
}

function buildNameHistory(raw, accounts) {
  const embark = buildEmbarkNameHistory(raw.audit?.byType, accounts);
  const platforms = buildPlatformNameHistory(raw);
  return { embark, platforms, hasPlatform: platforms.length > 0, has: embark.has || platforms.length > 0 };
}

// --- inventory counts by type (persistence `InventoryItem`) ----------------
// InventoryItem rows carry NO item id (inherent to the export), so individual
// cosmetics can't be listed — only counted by Type. We report the number of
// items per category plus the summed Amount (which differs from the count only
// for stackables like Currency).
const INVENTORY_LABELS = {
  CustomizationItem: 'Customizations',
  WeaponSkin: 'Weapon skins',
  WeaponCharm: 'Weapon charms',
  WeaponSticker: 'Weapon stickers',
  WeaponAttachment: 'Weapon attachments',
  PlayerCardCustomization: 'Player-card customizations',
  PlayerCard: 'Player cards',
  AnimationCustomization: 'Animations',
  Spray: 'Sprays',
  Emoticon: 'Emotes',
  ClansCustomization: 'Club customizations',
  BattlePass: 'Battle passes',
  GameItem: 'Game items',
  Currency: 'Currencies',
  Quest: 'Quests / contracts',
  Archetype: 'Builds',
  ContestantPack: 'Contestant packs',
  Loadout: 'Loadout slots',
  Fame: 'Fame',
  Sanction: 'Sanctions',
  PersistentEntity: 'Persistent entities',
};
const humanizeType = (t) => INVENTORY_LABELS[t] || t.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

function buildInventory(byType) {
  const rows = byType.InventoryItem || [];
  const map = new Map();
  for (const it of rows) {
    const type = it.Type || 'Unknown';
    let rec = map.get(type);
    if (!rec) map.set(type, (rec = { type, label: humanizeType(type), count: 0, amount: 0 }));
    rec.count += 1;
    rec.amount += typeof it.Amount === 'number' ? it.Amount : 0;
  }
  const categories = [...map.values()].sort((a, b) => b.count - a.count);
  return {
    has: rows.length > 0,
    total: rows.length,
    totalAmount: categories.reduce((s, r) => s + r.amount, 0),
    categories,
  };
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
    const ltmBg = resolveLtmBackground(d.ScenarioID); // LTM-specific background by gamemode id (overrides the map photo)
    const cond = parseCondition(d.EnvironmentalCondition);
    const variant = pmap.variant && pmap.variant !== 'Base' ? pmap.variant : null;
    const layout = variant && flatLabel(variant) !== flatLabel(cond) ? variant : null;
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
      mapVariant: d.MapVariant ?? null, // raw codename (e.g. DA_MV_LasVegas_02_Sunset) — kept for the debug copy
      mapName: rmap.name, // precise map name (Skyway Stadium, Horizon, …) or null
      // LTM background (keyed by gamemode/ScenarioID) takes priority over the map photo.
      mapImage: ltmBg?.image ?? rmap.image, // one bundled background photo, or null
      mapFocus: ltmBg?.focus ?? rmap.focus, // object-position for cropping the wide photo
      mapZoom: ltmBg?.zoom ?? rmap.zoom, // 1 = cover; <1 zooms out (blurred fill), >1 zooms in
      layout, // non-default layout, unless it merely restates the weather/lighting
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
    m.mapZoom = rep?.mapZoom ?? 1;
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
      avgDamage: s.rounds ? s.damage / s.rounds : 0,
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

// --- personal records (career bests) --------------------------------------
// Single-game (per-round) bests for kills / damage / revives / cashout, plus a
// match-level "biggest payday" = the tournament with the highest TOTAL cash.
// Each record carries the context that makes it a story: the mode it happened in
// (a 62-kill game is a high-respawn LTM, not ranked), the precise map and the
// date. ALL modes count — the mode label explains the big outliers. A record is
// null when there's nothing to show (e.g. an account with zero revives) so the
// page can omit empty cards.
function roundContext(r) {
  return {
    mode: r.mode?.label || null,
    category: r.mode?.category || null,
    mapName: r.mapName || r.map?.display || null,
    date: r.start ?? toMs(r.createdAt),
    weapon: r.weapon?.name || null,
  };
}

function bestRound(rounds, field) {
  let best = null;
  for (const r of rounds) {
    const v = r[field] || 0;
    if (v > 0 && (best == null || v > (best[field] || 0))) best = r;
  }
  return best ? { value: best[field], ...roundContext(best) } : null;
}

// Longest consecutive run of won / lost ROUNDS. `RoundWon` is a per-round flag
// defined across every mode, so this works everywhere (a tournament round win =
// placing 1st in that lobby). Rounds are ordered chronologically here so the
// streak is robust even if the caller's array order changes.
function bestStreaks(rounds) {
  const ordered = [...rounds].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  let bestWin = 0, bestLoss = 0, curWin = 0, curLoss = 0, winEnd = null, lossEnd = null;
  for (const r of ordered) {
    if (r.roundWon) {
      curWin += 1;
      curLoss = 0;
      if (curWin > bestWin) { bestWin = curWin; winEnd = r; }
    } else {
      curLoss += 1;
      curWin = 0;
      if (curLoss > bestLoss) { bestLoss = curLoss; lossEnd = r; }
    }
  }
  return {
    winStreak: bestWin > 1 ? { value: bestWin, date: winEnd.start ?? toMs(winEnd.createdAt) } : null,
    lossStreak: bestLoss > 1 ? { value: bestLoss, date: lossEnd.start ?? toMs(lossEnd.createdAt) } : null,
  };
}

function buildRecords(rounds, matches) {
  // Most cash in one MATCH = the tournament (multi-round match) with the highest
  // TOTAL cash. The best SINGLE round of cash is its own record, so restrict this
  // to real tournaments to avoid the two cards duplicating each other.
  let payday = null;
  for (const m of matches) {
    if (!m.isTournament) continue;
    if (m.currency > 0 && (payday == null || m.currency > payday.currency)) payday = m;
  }
  return {
    kills: bestRound(rounds, 'kills'),
    deaths: bestRound(rounds, 'deaths'),
    damage: bestRound(rounds, 'damage'),
    revives: bestRound(rounds, 'revives'),
    cashout: bestRound(rounds, 'currency'),
    payday: payday
      ? {
          value: payday.currency,
          mode: payday.mode?.label || null,
          category: payday.mode?.category || null,
          mapName: payday.mapName || payday.map?.display || null,
          date: payday.start,
          won: payday.tournamentWon || payday.won || false,
          rounds: payday.rounds.length,
        }
      : null,
    ...bestStreaks(rounds),
  };
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
// A real IP
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

  // Device fingerprints. The audit's `tamper_id` is namespaced by the SOURCE of
  // the fingerprint — `Tpm:` (TPM module), `Fmw:` (firmware/UEFI), `Usn:` (disk
  // volume serial); older clients logged a bare GUID. ONE physical machine can
  // present several of these (one per method, and the method changes across
  // client updates), so counting distinct strings over-counts machines. Dedupe
  // WITHIN each method, then estimate machines as the largest single hardware
  // method count — NOT the sum, and NOT "TPM" specifically.
  const fpByMethod = new Map(); // method -> Set(hash)
  for (const l of raw.audit?.byType?.ClientUserLoginDetails || []) {
    const tid = l?.tamper_id;
    if (!tid || typeof tid !== 'string') continue;
    const c = tid.indexOf(':');
    const method = c > 0 ? tid.slice(0, c).toLowerCase() : 'legacy';
    const hash = c > 0 ? tid.slice(c + 1) : tid;
    if (!hash) continue;
    let set = fpByMethod.get(method);
    if (!set) fpByMethod.set(method, (set = new Set()));
    set.add(hash);
  }
  const FP_LABEL = { tpm: 'TPM', fmw: 'Firmware', usn: 'Disk serial', legacy: 'Legacy ID' };
  const HARDWARE_METHODS = new Set(['tpm', 'fmw', 'usn']);
  const fingerprintMethods = [...fpByMethod.entries()]
    .map(([key, set]) => ({ key, label: FP_LABEL[key] || key, distinct: set.size, hardware: HARDWARE_METHODS.has(key) }))
    .sort((a, b) => Number(b.hardware) - Number(a.hardware) || b.distinct - a.distinct);
  const hardwareCounts = fingerprintMethods.filter((m) => m.hardware).map((m) => m.distinct);
  const legacyCounts = fingerprintMethods.filter((m) => !m.hardware).map((m) => m.distinct);
  // Best estimate of distinct PHYSICAL machines: the largest count from any one
  // hardware method. Legacy GUIDs are a looser fallback (they can change on
  // reinstall), used only when no hardware fingerprint is present.
  const machineEstimate = hardwareCounts.length
    ? Math.max(...hardwareCounts)
    : legacyCounts.length
      ? Math.max(...legacyCounts)
      : 0;

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
    // Device-fingerprint summary (see comment above). `machineEstimate` replaces
    // the old "distinct TPM ids" count, which conflated fingerprint methods.
    machineEstimate,
    fingerprintMethods,
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

// --- email delivery / open / click tracking (audit SES events) ------------
// Embark's mail (marketing season/event blasts + transactional verify/change
// notices) is sent through Amazon SES, and the SAR audit keeps SES's per-message
// event stream: `AwsSesEvent` (Send → Delivery → Open → Click, the current
// system) and the older `EmailStatus` (delivery-only). Each row carries a
// nested-JSON `mail` blob (subject, recipient, send time, marketing topic, SES
// tags) plus an event-specific blob — `open`/`click` hold the timestamp, the
// reader's userAgent/IP and (for clicks) the exact link followed. We unify them
// per `messageId` into one timeline per email, so a player can see precisely
// which emails they were sent, which they opened (and how many times), and what
// they clicked — i.e. the engagement data a marketing team normally sees.
const sesJson = (s) => {
  if (typeof s !== 'string') return null;
  try { return JSON.parse(s); } catch { return null; }
};

// Turn a raw email userAgent into a short, friendly label. Email "opens" are
// detected when the client loads a 1px tracking pixel; webmail providers proxy
// that fetch (so the recorded IP is theirs, not the reader's) — flag those.
const prettyUserAgent = (ua) => {
  if (!ua) return null;
  if (/GoogleImageProxy|ggpht/i.test(ua)) return 'Gmail (image proxy)';
  if (/YahooMailProxy/i.test(ua)) return 'Yahoo Mail (proxy)';
  if (/Outlook|Microsoft Office/i.test(ua)) return 'Outlook';
  const os = /Windows/i.test(ua) ? 'Windows'
    : /iPhone|iPad|iPod|iOS/i.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Android/i.test(ua) ? 'Android'
    : /Linux/i.test(ua) ? 'Linux' : null;
  const br = /Edg[/A]/i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /Firefox/i.test(ua) ? 'Firefox'
    : /Chrome|CriOS/i.test(ua) ? 'Chrome'
    : /Safari/i.test(ua) ? 'Safari' : null;
  if (br && os) return `${br} on ${os}`;
  return br || os || 'Unknown client';
};

const cleanSesIp = (ip) => (typeof ip === 'string' && ip && !/REDACT|\[/.test(ip) ? ip : null);

// Marketing blasts go through the "email-scheduler" SES identity and carry a
// List-Unsubscribe topic; everything else (verify-email, email-change) is
// transactional account/security mail with no marketing topic or scheduler tag.
const categorizeEmail = (topic, caller) => {
  if (topic && /_ARC\b/i.test(topic)) return 'marketing_arc';
  if (topic && /(MARKETING|PROMO|NEWS)/i.test(topic)) return 'marketing';
  if (caller && /scheduler|marketing/i.test(caller)) return 'marketing';
  return 'account';
};

function buildEmailTracking(auditByType) {
  const A = auditByType || {};
  const ses = A.AwsSesEvent || [];
  const legacy = A.EmailStatus || [];
  if (ses.length === 0 && legacy.length === 0) return { has: false, emails: [], stats: null, trackingAvailable: false };

  const byId = new Map();
  const touch = (mid) => {
    let e = byId.get(mid);
    if (!e) byId.set(mid, (e = { messageId: mid, subject: null, sender: null, recipient: null, topic: null, caller: null, tracked: false, sentMs: null, deliveredMs: null, opens: [], clicks: [], bounced: false, complained: false }));
    return e;
  };
  const ingestMail = (blob) => {
    const m = sesJson(blob);
    if (!m || !m.messageId) return null;
    const e = touch(m.messageId);
    const subj = m.commonHeaders?.subject || (Array.isArray(m.headers) ? m.headers.find((h) => h.name === 'Subject')?.value : null) || null;
    if (subj && !e.subject) e.subject = subj;
    if (m.source && !e.sender) e.sender = m.source;
    if (Array.isArray(m.destination) && m.destination[0] && !e.recipient) e.recipient = m.destination[0];
    const tags = m.tags || {};
    if (!e.caller && tags['ses:caller-identity']?.[0]) e.caller = tags['ses:caller-identity'][0];
    if (!e.topic && Array.isArray(m.headers)) {
      const lu = m.headers.find((h) => h.name === 'List-Unsubscribe');
      const t = lu?.value?.match(/topics=([A-Za-z_]+)/);
      if (t) e.topic = t[1];
    }
    const ts = toMs(m.timestamp); // the original SEND time (identical on every event of a message)
    if (ts != null && (e.sentMs == null || ts < e.sentMs)) e.sentMs = ts;
    return e;
  };

  for (const r of ses) {
    const e = ingestMail(r.mail);
    if (!e) continue;
    e.tracked = true; // came from the SES event stream → open/click tracking was active
    const lt = toMs(r.logtime);
    switch (r.event_type) {
      case 'Delivery': { const d = sesJson(r.delivery); if (e.deliveredMs == null) e.deliveredMs = toMs(d?.timestamp) ?? lt; break; }
      case 'Open': { const o = sesJson(r.open); e.opens.push({ ms: toMs(o?.timestamp) ?? lt, device: prettyUserAgent(o?.userAgent), ip: cleanSesIp(o?.ipAddress) }); break; }
      case 'Click': { const c = sesJson(r.click); e.clicks.push({ ms: toMs(c?.timestamp) ?? lt, link: c?.link || null, device: prettyUserAgent(c?.userAgent), ip: cleanSesIp(c?.ipAddress) }); break; }
      case 'Bounce': e.bounced = true; break;
      case 'Complaint': e.complained = true; break;
      default: break; // 'Send' has no extra payload
    }
  }
  for (const r of legacy) {
    const e = ingestMail(r.mail);
    if (!e) continue;
    const lt = toMs(r.logtime);
    if (r.notification_type === 'Bounce') e.bounced = true;
    else if (r.notification_type === 'Complaint') e.complained = true;
    else if (e.deliveredMs == null) { const d = sesJson(r.delivery); e.deliveredMs = toMs(d?.timestamp) ?? lt; }
  }

  const emails = [...byId.values()]
    .map((e) => {
      e.opens.sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0));
      e.clicks.sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0));
      return {
        ...e,
        category: categorizeEmail(e.topic, e.caller),
        delivered: e.deliveredMs != null || e.opens.length > 0 || e.clicks.length > 0,
        openCount: e.opens.length,
        clickCount: e.clicks.length,
        firstOpenMs: e.opens[0]?.ms ?? null,
        lastOpenMs: e.opens[e.opens.length - 1]?.ms ?? null,
      };
    })
    .sort((a, b) => (b.sentMs ?? 0) - (a.sentMs ?? 0)); // newest first

  const opened = emails.filter((e) => e.openCount > 0);
  const clicked = emails.filter((e) => e.clickCount > 0);
  const deliveredCount = emails.filter((e) => e.delivered).length;
  const trackedCount = emails.filter((e) => e.tracked).length; // emails that COULD be open-tracked
  const totalOpens = emails.reduce((s, e) => s + e.openCount, 0);
  const totalClicks = emails.reduce((s, e) => s + e.clickCount, 0);
  const mostOpened = opened.reduce((best, e) => (!best || e.openCount > best.openCount ? e : best), null);
  const byCategory = {};
  for (const e of emails) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  const times = emails.map((e) => e.sentMs).filter((v) => v != null);
  const recipients = [...new Set(emails.map((e) => e.recipient).filter(Boolean))];
  const openDenom = trackedCount || deliveredCount || emails.length;

  const stats = {
    total: emails.length,
    delivered: deliveredCount,
    tracked: trackedCount,
    opened: opened.length,
    clicked: clicked.length,
    totalOpens,
    totalClicks,
    openRate: openDenom ? opened.length / openDenom : 0,
    clickRate: openDenom ? clicked.length / openDenom : 0,
    firstMs: times.length ? Math.min(...times) : null,
    lastMs: times.length ? Math.max(...times) : null,
    mostOpened: mostOpened ? { subject: mostOpened.subject, count: mostOpened.openCount } : null,
    byCategory,
    recipients,
  };
  return { has: true, emails, stats, trackingAvailable: ses.length > 0 };
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

  // "Data as of" date, so users don't mistake a snapshot for live data. The SAR
  // README filename carries the request date (parsed in ingest.js); the data
  // itself can run slightly past it, so the displayed date is whichever is later
  // — the request date or the player's last recorded activity.
  const requestedAtMs = toMs(raw.readme?.requestedAtMs ?? null);
  let asOfMs = requestedAtMs;
  let asOfSource = requestedAtMs != null ? 'request' : null;
  if (lastActivity != null && (requestedAtMs == null || lastActivity > requestedAtMs)) {
    asOfMs = lastActivity;
    asOfSource = 'activity';
  }
  const snapshot = {
    requestedAtMs: requestedAtMs ?? null,
    requestId: raw.readme?.requestId ?? null,
    requestLabel: raw.readme?.label ?? null,
    lastActivityMs: lastActivity,
    asOfMs: asOfMs ?? null,
    asOfSource, // 'request' | 'activity' | null
  };

  const accounts = buildAccounts(byType);

  return {
    identity: buildIdentity(byType, raw.audit?.byType),
    accounts,
    multiAccount: accounts.length > 1,
    emails: collectEmails(byType, raw.audit?.byType),
    ban: buildBans(byType),
    linkedAccounts: buildLinkedAccounts(byType),
    nameHistory: buildNameHistory(raw, accounts),
    inventory: buildInventory(byType),
    career: buildCareer(byType),
    ratings: buildRatings(byType),
    matches,
    modeBreakdown: buildModeBreakdown(matches),
    careerModes: buildCareerModes(matches),
    breakdowns: buildBreakdowns(rounds),
    records: buildRecords(rounds, matches),
    weapons,
    weaponsByArchetype,
    economy: buildEconomy(byType),
    antiCheat: buildAntiCheat(raw),
    reports: buildReports(raw),
    emailTracking: buildEmailTracking(raw.audit?.byType),
    meta: {
      roundCount,
      matchCount: matches.length,
      tournamentsPlayed,
      tournamentsWon,
      counts: raw.persistence.counts,
      lastActivity,
      snapshot,
      hasAudit: !!raw.audit,
      hasEos: raw.eos.anticheat.length > 0,
      hasAnybrain: (raw.anybrain.os?.length || raw.anybrain.sessions?.length || 0) > 0,
      hasDenuvo: raw.denuvo.length > 0,
    },
  };
}
