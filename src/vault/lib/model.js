// Build the view-models the pages consume from raw parsed records.
// Runs ONCE after parsing; results are memoised in the provider.
import { resolveWeapon } from './weapons';
import { ARCHETYPES, archetypeLabel, classifyMode, careerModeGroup, CAREER_MODE_GROUPS, parseMapVariant, parseCondition, roundsRemaining, stageLabel, stageTeams, tournamentPlacement, worldTourBadge, worldTourTier, quickplayBadge, worldTourEvent, worldTourStop, WT_STOP_IDS, sponsorName } from './gameMeta';
import { resolveMap, resolveLtmBackground, conditionType } from './maps';
import { resolveDlc, steamAppUrl, STEAM_BASE_GAME_ID, localAmount } from './economy';
import { buildRealms, REALM, classifyRoundStat, ROUND_KIND, tenancyLabel, previewRounds } from './realms';
import { buildRatings } from './ratings';
import { createKeys, cleanName } from './keys';
import { withKeySeasons } from './seasons';

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

// Season number of a record: Embark's SeasonID where it has one (2026-09+ rounds), else the date.
const seasonResolver = (keys) => {
  const starts = withKeySeasons(keys.seasons());
  return (seasonId, ms) => {
    const k = seasonId != null ? keys.season(seasonId) : null;
    if (k) return k.n;
    if (ms == null) return null;
    let n = null;
    for (const s of starts) if (s.startMs <= ms) n = s.n;
    return n;
  };
};
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
function buildBans(byType, auditByType) {
  const nowMs = Date.now();
  const auditRows = (re) => Object.keys(auditByType || {}).filter((t) => re.test(t)).flatMap((t) => auditByType[t] || []);
  const created = auditRows(/^TenancyUserRestrictionCreated\d*$/);
  const viaTool = auditRows(/^PlayerViewAddTenancyUserRestriction\d*$/);
  // 2026-09+: two audit rows written at the restriction instant. Matched on time and
  // reason, since `restriction_id` exceeds 2^53 and does not survive JSON.parse.
  const auditFor = (reason, ms) => {
    if (ms == null) return null;
    const near = (rows) => rows.find((a) => a?.reason === reason && Math.abs((toMs(a.logtime) ?? Infinity) - ms) <= 60e3) || null;
    const c = near(created);
    const v = near(viaTool);
    if (!c && !v) return null;
    const endsAtMs = c?.ends_at_ms ?? v?.ends_at_ms;
    const tenancy = c?.tenancy ?? v?.tenancy ?? null;
    return {
      source: c?.source ?? (v ? 'PLAYER_VIEW' : null),
      permanent: typeof endsAtMs === 'number' ? endsAtMs === 0 : null,
      endsMs: typeof endsAtMs === 'number' && endsAtMs > 0 ? endsAtMs : null,
      steamGameBan: typeof v?.issue_steam_game_ban === 'boolean' ? v.issue_steam_game_ban : null,
      tenancy,
      scope: tenancy === 'discovery-live' ? 'THE FINALS live game' : tenancy ? tenancyLabel(tenancy) : null,
      ms: toMs(c?.logtime ?? v?.logtime),
    };
  };
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
        audit: auditFor(r.Reason, toMs(r.CreatedAt ?? r.StartsAt)),
      };
    })
    .sort((a, b) => (toMs(b.startsAt) ?? 0) - (toMs(a.startsAt) ?? 0)); // newest first

  // Sign-ins refused because of a restriction (2026-09+).
  const blockedSignIns = (byType.RestrictedLogin || [])
    .map((l) => ({ ms: toMs(l.CreatedAt), game: l.Game ?? null, provider: l.ThirdPartyProvider ?? null, ip: l.IPAddress ?? null, grantType: l.GrantType ?? null }))
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0));

  const active = all.find((b) => b.active) || null;
  return {
    restricted: all.length > 0, // any restriction on record (past or present)
    hasActive: !!active, // an ongoing restriction exists
    active, // the ongoing restriction (or null) — for Career/landing display
    all, // full lifetime history — for the Account page
    count: all.length,
    cancelledCount: all.filter((b) => b.cancelled).length, // how many were lifted
    blockedSignIns,
  };
}

// Matchmaking cooldowns for leaving a tournament, separate from restrictions. Three shapes:
// the detail on the inventory row (2026-09+), a top-level `Sanction` record (some older
// exports), or an inventory row with a timestamp only, which equals the latest sanction's
// time (checked on two accounts).
const SANCTION_LABELS = { tournament_abandon: 'Left a tournament' };
function buildSanctions(byType, rounds) {
  const items = [];
  const stubs = [];
  const item = (kind, tier, atMs, durationSec, endsMs, wholeAccount, source) => ({
    kind,
    label: kind && Object.hasOwn(SANCTION_LABELS, kind) ? SANCTION_LABELS[kind] : null,
    tier: Number.isInteger(tier) ? tier : null,
    atMs,
    durationSec: Number.isFinite(durationSec) ? durationSec : null,
    endsMs: endsMs ?? (atMs != null && Number.isFinite(durationSec) ? atMs + durationSec * 1000 : null),
    wholeAccount: typeof wholeAccount === 'boolean' ? wholeAccount : null,
    source,
  });
  for (const it of byType.InventoryItem || []) {
    if (it?.Type !== 'Sanction') continue;
    const s = it.Properties?.Sanction;
    if (s && typeof s === 'object') items.push(item(s.Type ?? null, s.Tier, toMs(s.TimeOfSanction) ?? toMs(it.UpdatedAt), s.DurationSeconds, null, null, 'inventory'));
    else stubs.push(toMs(it.UpdatedAt));
  }
  for (const s of byType.Sanction || []) {
    const atMs = toMs(s.CreatedAt);
    const endsMs = toMs(s.ExpiresAt);
    const kind = typeof s.Reason === 'string' ? s.Reason.replace(/^SANCTION_REASON_/, '').toLowerCase() : null;
    items.push(item(kind, s.Tier, atMs, atMs != null && endsMs != null ? (endsMs - atMs) / 1000 : null, endsMs, s.AppliesToWholeAccount, 'record'));
  }
  for (const ms of stubs) {
    if (ms == null || items.some((x) => x.atMs != null && Math.abs(x.atMs - ms) < 60e3)) continue;
    items.push(item(null, null, ms, null, null, null, 'stub'));
  }
  if (!items.length) return null;
  // The tournament round in progress when the sanction was issued, if the log has it.
  for (const x of items) {
    if (x.atMs == null) continue;
    const r = rounds.find((r) => r.tournamentId && r.start != null && r.end != null && r.start <= x.atMs && x.atMs <= r.end + 2000);
    x.round = r ? { start: r.start, mode: r.mode?.label ?? null, tournamentId: r.tournamentId, abandoned: r.abandoned } : null;
  }
  items.sort((a, b) => (b.atMs ?? 0) - (a.atMs ?? 0));
  return { has: true, latestMs: items[0].atMs, items };
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
  // Addresses embedded in the SES blobs: regex them out (don't full-parse). The
  // blobs are nested-JSON strings up to 2026-08 and plain objects since.
  const blobText = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? JSON.stringify(v) : '');
  for (const r of A.AwsSesEvent || []) {
    const m = blobText(r.mail).match(EMAIL_RE);
    if (m) for (const e of m) add(e, 'sent');
  }
  for (const r of A.EmailStatus || []) {
    // The trimmed form keeps the recipient on `mail` alone.
    const blob = [typeof r.mail === 'object' ? r.mail : null, r.delivery, r.bounce, r.complaint].map(blobText).join(' ');
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

// The name that was in effect at `ms`, from a span list.
const nameInEffectAt = (spans, ms) => {
  let name = null;
  for (const s of spans || []) {
    if (s.firstMs == null || s.firstMs > ms) break;
    name = s.name;
  }
  return name;
};

// Tolerance for tying an admin rename row to the exact instant it describes.
// The one real sample pairs them 13ms apart; 2s is slack for clock skew between
// the two writers without reaching across to a genuinely separate rename.
const ADMIN_PAIR_MS = 2000;

// Renames as dated EVENTS, for marking on a time axis. `spans[].firstMs` can't
// do that job: it's the first time the audit log happened to mention the new
// name, and ProfileUpdated rows are sparse enough that it lands days late. Two
// records date a rename exactly:
//   * ProfileUpdated2/3 `display_name_updated_msts` — the instant itself. Rows
//     repeat it (one sample's 21 rows carry 7 distinct values), so these dedupe
//     on the TIMESTAMP, never on the name: the field means "at T the name became
//     this", and the same name can be adopted twice.
//   * PlayerViewUpdateProfile — an admin-initiated rename, and the only record
//     naming what the player renamed AWAY from. It carries no discriminator and
//     no created_msts, so it can't be attributed to an account by itself.
// Spans still cover the rest (every v1-era rename), flagged `sighting` so the UI
// hedges instead of asserting a date the export didn't record.
function buildNameChangeEvents(auditByType, accounts, embarkAccounts) {
  const A = auditByType || {};

  const exact = new Map(); // ms -> event
  for (const type of ['ProfileUpdated2', 'ProfileUpdated3']) {
    for (const r of A[type] || []) {
      const ms = toMs(r.display_name_updated_msts);
      const name = r.display_name;
      if (ms == null || name == null || name === '') continue;
      const logMs = toMs(r.logtime);
      const prev = exact.get(ms);
      if (prev && (prev.logMs ?? Infinity) <= (logMs ?? Infinity)) continue; // keep the earliest witness
      const disc = r.display_name_discriminator;
      const account = attributeAccount(accounts, r.created_msts ?? null, logMs);
      exact.set(ms, {
        ms,
        to: disc != null && disc !== '' ? `${name}#${disc}` : name,
        accountKey: account?.embarkUserId ?? account?.createdMs ?? '_',
        logMs,
      });
    }
  }

  const admin = [];
  for (const r of A.PlayerViewUpdateProfile || []) {
    const ms = toMs(r.logtime);
    if (ms == null || !r.updated_display_name) continue;
    admin.push({ ms, from: r.old_display_name || null, to: r.updated_display_name });
  }

  const unclaimed = new Set(exact.values());
  const out = [];

  for (const acct of embarkAccounts) {
    const key = acct.embarkUserId ?? acct.createdMs ?? '_';
    for (let i = 1; i < acct.spans.length; i++) {
      const prev = acct.spans[i - 1];
      const span = acct.spans[i];
      // The instant behind this transition names the span's own name and falls
      // between the two sightings. Latest such wins: a name adopted twice has an
      // instant per adoption, and the nearer one is this span's.
      let hit = null;
      for (const e of unclaimed) {
        if (e.to !== span.name) continue;
        if (span.firstMs != null && e.ms > span.firstMs) continue;
        if (prev.firstMs != null && e.ms <= prev.firstMs) continue;
        if (!hit || e.ms > hit.ms) hit = e;
      }
      if (hit) unclaimed.delete(hit);
      out.push({
        ms: hit ? hit.ms : span.firstMs,
        from: prev.name,
        to: span.name,
        source: hit ? 'exact' : 'sighting',
        accountKey: key,
      });
    }
  }

  // An instant with no span boundary either caught a rename the sightings missed
  // or is a re-stamp of a name that didn't change: one sample advances the field
  // twice while display_name AND the discriminator stay identical (Xorog#3439 ->
  // Xorog#3439). Keep only the first kind — a marker for the second points at
  // nothing.
  for (const e of unclaimed) {
    const acct = embarkAccounts.find((a) => (a.embarkUserId ?? a.createdMs ?? '_') === e.accountKey) ?? embarkAccounts[0];
    const current = nameInEffectAt(acct?.spans, e.ms);
    if (current === e.to) continue;
    out.push({ ms: e.ms, from: current, to: e.to, source: 'exact', accountKey: e.accountKey });
  }

  out.sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0));

  // Admin rows only enrich: spans usually supply a better `from` because they
  // keep the discriminator, which PlayerViewUpdateProfile drops.
  const usedAdmin = new Set();
  for (const ev of out) {
    if (ev.ms == null) continue;
    const pair = admin.find((a) => !usedAdmin.has(a) && Math.abs(a.ms - ev.ms) <= ADMIN_PAIR_MS);
    if (!pair) continue;
    usedAdmin.add(pair);
    if (!ev.from && pair.from) ev.from = pair.from;
  }
  // A lone admin row is a rename nothing else recorded. Only usable when there's
  // one account, since the row carries nothing to attribute it with.
  if (embarkAccounts.length === 1) {
    for (const a of admin) {
      if (usedAdmin.has(a)) continue;
      // PlayerViewUpdateProfile logs an admin edit to the profile, not a rename
      // specifically, so it can carry an unchanged name when some other field
      // was the thing edited. Same rule as the exact-instant path above: no
      // visible change, no marker.
      if (a.from === a.to) continue;
      out.push({ ms: a.ms, from: a.from, to: a.to, source: 'admin', accountKey: embarkAccounts[0].embarkUserId ?? embarkAccounts[0].createdMs ?? '_' });
    }
    out.sort((x, y) => (x.ms ?? 0) - (y.ms ?? 0));
  }

  return out.filter((ev) => ev.ms != null);
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
    // 2026-09+ exports name the provider (`third_party_provider_name: "xbox"`) where older ones numbered it.
    const uid = r.third_party_user_id != null ? String(r.third_party_user_id) : `pid:${r.third_party_provider_name ?? r.third_party_provider_id}`;
    const provider =
      idToProvider.get(uid) ||
      (typeof r.third_party_provider_name === 'string' && r.third_party_provider_name) ||
      (Object.hasOwn(NUMERIC_PROVIDER, r.third_party_provider_id) ? NUMERIC_PROVIDER[r.third_party_provider_id] : null) ||
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
  const auditByType = raw.audit?.byType;
  const embark = buildEmbarkNameHistory(auditByType, accounts);
  const platforms = buildPlatformNameHistory(raw);
  return {
    embark: { ...embark, changes: buildNameChangeEvents(auditByType, accounts, embark.accounts) },
    platforms,
    hasPlatform: platforms.length > 0,
    has: embark.has || platforms.length > 0,
  };
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
  PersistentEntity: 'Persistent entities',
};
// hasOwn on the export-keyed tables in this file: an InventoryItem Type of
// "__proto__" would otherwise return Object.prototype, and React throws when an
// object reaches it as a child ("constructor" returns a function and renders blank).
const humanizeType = (t) => (Object.hasOwn(INVENTORY_LABELS, t) ? INVENTORY_LABELS[t] : t.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));

// Some names are Embark's internal labels, not what the game shows ("Type {0}", "HoverCar_01").
const INTERNAL_NAME_RE = /[{}_]|^(Default|Premium)$/;
const PACK_SLOT_LABELS = { IntroPose: 'Intro pose', VictoryPose: 'Victory pose', OutfitPack: 'Outfit', ObjectiveSticker: 'Objective sticker', PlayerCard: 'Player card' };

function buildInventory(byType, keys) {
  // A sanction is not an owned item (Account shows it), and its CreatedAt is not when it happened.
  const rows = (byType.InventoryItem || []).filter((it) => it && it.Type !== 'Sanction');
  const map = new Map();
  // 2026-09+ rows are named; older ones carry a type and nothing else.
  const items = [];
  const byInstance = new Map();
  let firstMs = null;
  for (const it of rows) {
    const type = it.Type || 'Unknown';
    let rec = map.get(type);
    if (!rec) map.set(type, (rec = { type, label: humanizeType(type), count: 0, amount: 0 }));
    rec.count += 1;
    rec.amount += typeof it.Amount === 'number' ? it.Amount : 0;
    const name = cleanName(it.Name);
    if (it.InstanceID != null) byInstance.set(it.InstanceID, it);
    if (!name) continue;
    const ms = toMs(it.CreatedAt);
    if (ms != null && (firstMs == null || ms < firstMs)) firstMs = ms;
    items.push({ name, type, label: rec.label, amount: typeof it.Amount === 'number' ? it.Amount : 1, ms, internal: INTERNAL_NAME_RE.test(name) });
  }
  items.sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0) || a.name.localeCompare(b.name));

  // Saved contestant packs reference other inventory rows by InstanceID. An id this
  // export does not cover resolves to null and is shown as such, never dropped.
  const nameOf = (id) => cleanName(byInstance.get(id)?.Name) || null;
  const gear = (ids) =>
    (Array.isArray(ids) ? ids : []).map((id) => {
      const row = byInstance.get(id);
      if (!row || row.GameAssetID == null) return { id: String(id), name: null, icon: null, type: null };
      const w = resolveWeapon(row.GameAssetID, keys);
      return { id: String(id), name: w.unknown ? cleanName(row.Name) : w.name, icon: w.icon, type: w.type };
    });
  const packs = [];
  // The `Loadout` row names the pack that was selected when the export was made.
  const activePackId = rows.find((it) => it.Properties?.Loadout?.SelectedContestantPackItemID)?.Properties.Loadout.SelectedContestantPackItemID ?? null;
  for (const it of rows) {
    const p = it.Properties?.ContestantPack;
    if (!p || typeof p !== 'object') continue;
    packs.push({
      id: String(it.InstanceID ?? packs.length),
      active: activePackId != null && it.InstanceID === activePackId,
      title: cleanName(p.Title) || 'Untitled build',
      archetype: nameOf(p.ArchetypeItemID),
      equipped: gear(p.FirstHandItemIDs),
      reserve: gear(p.ReservedItemIDs),
      // PlayerCard and OutfitPack point at container rows with no name of their own.
      slots: (Array.isArray(p.Slots) ? p.Slots : [])
        .filter((s) => s?.SlotName !== 'PlayerCard' && s?.SlotName !== 'OutfitPack')
        .map((s) => ({ label: Object.hasOwn(PACK_SLOT_LABELS, s.SlotName) ? PACK_SLOT_LABELS[s.SlotName] : String(s.SlotName), names: (s.ItemIDs || []).map(nameOf) })),
      spray: p.SprayItemID ? [nameOf(p.SprayItemID)] : [],
      emotes: (Array.isArray(p.EmoteWheelItemIDs) ? p.EmoteWheelItemIDs : []).map(nameOf),
    });
  }
  const classRank = (a) => { const i = ['Light', 'Medium', 'Heavy'].indexOf(a); return i < 0 ? 3 : i; };
  packs.sort((a, b) => classRank(a.archetype) - classRank(b.archetype) || a.title.localeCompare(b.title, undefined, { numeric: true }));

  const categories = [...map.values()].sort((a, b) => b.count - a.count);
  return {
    has: rows.length > 0,
    total: rows.length,
    totalAmount: categories.reduce((s, r) => s + r.amount, 0),
    categories,
    hasNames: items.length > 0,
    items,
    firstMs,
    packs,
  };
}

// --- friends, blocks and club (counts and dates: the export never names anyone) ---
function buildSocial(byType) {
  const range = (rows) => {
    let first = null;
    let last = null;
    for (const r of rows) {
      const t = toMs(r.CreatedAt);
      if (t == null) continue;
      if (first == null || t < first) first = t;
      if (last == null || t > last) last = t;
    }
    return { firstMs: first, lastMs: last };
  };
  const friends = byType.Friend || [];
  const blocked = byType.BlockedPlayer || [];
  const membership = (byType.ClanMembership || [])[0] || null;
  const stats = [...(byType.ClanStats || [])].sort((a, b) => (toMs(b.UpdatedAt) ?? 0) - (toMs(a.UpdatedAt) ?? 0))[0] || null;
  const timeline = byType.ClanTimelineMessage || [];
  const invites = byType.ClanInvite || [];
  const sent = friends.filter((f) => f.Direction === 'sent').length;
  const received = friends.filter((f) => f.Direction === 'received').length;
  const tl = range(timeline);
  // The current membership's start: it equals the latest TYPE_MEMBER_JOINED event to the
  // microsecond on both exports that have one. Earlier joins mean the player left and rejoined.
  const memberSinceMs = toMs(membership?.CreatedAt);
  // A club log row is a type, a time and the club; no author, target or text.
  const eventTypes = new Map();
  const joinsMs = [];
  for (const t of timeline) {
    const type = typeof t.PayloadType === 'string' && t.PayloadType ? t.PayloadType : 'TYPE_UNSPECIFIED';
    eventTypes.set(type, (eventTypes.get(type) || 0) + 1);
    const ms = toMs(t.CreatedAt);
    // A join of some other club is not a rejoin of this one (both name and tag differ).
    const otherClub = membership != null && t.ClanName != null && t.ClanName !== membership.ClanName && t.ClanTag !== membership.ClanTag;
    if (type === 'TYPE_MEMBER_JOINED' && ms != null && !otherClub) joinsMs.push(ms);
  }
  joinsMs.sort((a, b) => a - b);
  const eventLabel = (type) => {
    const s = type.replace(/^TYPE_/, '').toLowerCase().replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  return {
    has: friends.length > 0 || blocked.length > 0 || !!membership || !!stats || timeline.length > 0 || invites.length > 0,
    // Some older rows have no Direction, so the split is only shown when it adds up.
    friends: { total: friends.length, sent, received, directionKnown: friends.length > 0 && sent + received === friends.length, ...range(friends) },
    blocked: { total: blocked.length, ...range(blocked) },
    club: membership
      ? { name: membership.ClanName ?? null, tag: membership.ClanTag ?? null, role: membership.Role ?? null, memberSinceMs, lastLoginMs: toMs(membership.LastLoggedInAt) }
      : null,
    questsCompleted: stats && typeof stats.QuestsCompleted === 'number' ? stats.QuestsCompleted : null,
    clubEvents: timeline.length
      ? { total: timeline.length, byType: [...eventTypes.entries()].map(([type, count]) => ({ type, label: eventLabel(type), count })).sort((a, b) => b.count - a.count), joinsMs, ...tl }
      : null,
    clubInvites: invites.length
      ? { sent: invites.filter((i) => i.Direction === 'sent').length, received: invites.filter((i) => i.Direction === 'received').length, ...range(invites) }
      : null,
  };
}

// --- career (aggregated across ALL RoundStatSummary snapshots) ------------
// An export can carry SEVERAL RoundStatSummary records: one per tenancy the account
// played on (the live game and each preview build), with no tenancy field. They are
// disjoint, NOT running cumulative totals: on real exports their RoundsPlayed sum to
// at most the RoundStat record count. So lifetime = the per-bucket SUM across the
// live ones (the preview builds' are removed before this, see liveSummaries).
// The summed total can sit slightly UNDER the record count (0 to 219 rounds
// across the sample exports) because Embark counts a multi-round Ranked
// Terminal Attack series once while the log stores every round; the whole
// shortfall is in tournament rounds. Never the other way round.
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
  const arch = Object.create(null); // archetype keys are raw export data
  for (const b of buckets) for (const k in b?.TimePlayedByArchetype || {}) arch[k] = (arch[k] || 0) + (b.TimePlayedByArchetype[k] || 0);
  out.TimePlayedByArchetype = Object.keys(arch).length ? arch : null;
  return out;
}

// Embark's lifetime totals count practice-range rounds (one export's live summary equals its log
// exactly with 9 of them in it), so their logged stats come back out of `total`.
function withoutRounds(b, rounds) {
  if (!rounds.length) return b;
  const out = { ...b, TimePlayedByArchetype: b.TimePlayedByArchetype ? Object.assign(Object.create(null), b.TimePlayedByArchetype) : null };
  for (const r of rounds) {
    const ms = r.end != null && r.start != null && r.end > r.start ? r.end - r.start : 0;
    out.Kills -= r.kills;
    out.Deaths -= r.deaths;
    out.Dbnos -= r.dbnos;
    out.DamageDone -= r.damage;
    out.RevivesDone -= r.revives;
    out.RoundsPlayed -= 1;
    if (r.roundWon) out.RoundsWon -= 1;
    out.TotalCashOut -= r.currency;
    out.TotalTimePlayed -= ms;
    if (r.disconnected) out.Disconnects -= 1;
    const key = Object.keys(ARCHETYPES).find((k) => ARCHETYPES[k] === r.archetype);
    if (key && out.TimePlayedByArchetype?.[key] != null) out.TimePlayedByArchetype[key] = Math.max(0, out.TimePlayedByArchetype[key] - ms);
  }
  for (const f of SUMMARY_COUNTERS) out[f] = Math.max(0, out[f]);
  out.RoundWinRate = out.RoundsPlayed ? out.RoundsWon / out.RoundsPlayed : null;
  out.TournamentWinRate = out.TournamentsPlayed ? out.TournamentsWon / out.TournamentsPlayed : null;
  return out;
}

function buildCareer(byType, keys, summaries, practiceRounds) {
  const pluck = (key) => aggregateBucket(summaries.map((s) => s.Data?.[key]).filter(Boolean));
  const total = summaries.length ? withoutRounds(pluck('total'), practiceRounds) : pluck('total');
  const casual = summaries.length ? withoutRounds(pluck('casual'), practiceRounds) : pluck('casual');
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

  // RankBucket carries XP/Rank standings (ambiguous scope; surfaced raw). Rows the key
  // file files under a track (item mastery, battle pass, career rank) are read elsewhere.
  const ranks = (byType.RankBucket || []).filter((rb) => rb.BucketID == null || !keys.mastery(rb.BucketID)).map((rb) => ({ xp: rb.XP ?? null, rank: rb.Rank ?? null }));
  // 2026-09+ rows name their track (`BucketID`); the key file's "Career rank" one is
  // the account level. Older rows have no BucketID, so theirs stays unknown.
  let level = null;
  for (const rb of byType.RankBucket || []) {
    if (rb.BucketID == null || keys.mastery(rb.BucketID)?.category !== 'Career rank') continue;
    if (typeof rb.Rank === 'number' && (!level || rb.Rank > level.rank)) level = { rank: rb.Rank, xp: rb.XP ?? null };
  }

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
    // The rest of `total` is World Tour from Seasons 3 to 8, which 2026-09+ exports also
    // carry as a `worldTour` bucket.
    otherRoundsPlayed: Math.max(0, total.RoundsPlayed - casual.RoundsPlayed - ranked.RoundsPlayed),
    otherTimePlayedMs: Math.max(0, total.TotalTimePlayed - casual.TotalTimePlayed - ranked.TotalTimePlayed),
    ranks,
    level,
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
    abandoned: false,
    preview: r.preview,
    uncounted: r.uncounted,
    ...(r.wtEvent ? { wtEvent: r.wtEvent } : {}),
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
    if (r.rr < m.furthestRR) {
      // A deeper round OWNS the headline placement, so reset even when its own
      // position is unknown. Keeping a shallower round's number would report it
      // against the deeper stage — a Final that was reached and LOST reading
      // "1st of 8" off the round before it.
      m.furthestRR = r.rr;
      m.finalPlacement = r.position ?? null;
    } else if (r.rr === m.furthestRR && r.position != null) {
      m.finalPlacement = r.position;
    }
  }
  if (r.tournamentWon) m.tournamentWon = true;
  if (r.roundWon) m.won = true;
  if (r.disconnected) m.disconnected = true;
  if (r.abandoned) m.abandoned = true;
}

function buildMatchesAndWeapons(byType, keys, preview) {
  // parse.js already buckets ARC Raiders' identically-named records separately,
  // but re-check here: `byType` is also built by hand (sampleData, harnesses),
  // and one unfiltered ARC row becomes a phantom match that always reads as a loss.
  const all = byType.RoundStat || [];
  const rawRounds = [];
  // In the export but not read yet. Counted so an ARC view needn't re-derive the split.
  let otherGameRounds = (byType.ArcRoundStat || []).length;
  let unknownRounds = (byType.UnknownRoundStat || []).length;
  for (const r of all) {
    const kind = classifyRoundStat(r);
    if (kind === ROUND_KIND.FINALS) rawRounds.push(r);
    else if (kind === ROUND_KIND.ARC) otherGameRounds++;
    else unknownRounds++;
  }

  const weaponTotals = new Map(); // id -> kills
  const killRounds = new Map(); // id -> rounds with >= 1 kill
  // 2026-09+ `DamagePerItem`: per-item damage, including items that never killed.
  const damageTotals = new Map(); // id -> damage
  const damageRounds = new Map(); // id -> rounds with damage
  let damageRoundCount = 0;
  let damageFirstMs = null;
  // One record per item id, shared by every round that equipped it.
  const loadoutItems = new Map();
  const loadoutItem = (id) => {
    let it = loadoutItems.get(id);
    if (!it) {
      const w = resolveWeapon(id, keys);
      loadoutItems.set(id, (it = { id: String(id), name: w.name, slug: w.slug, icon: w.icon, type: w.type, archetype: w.archetype }));
    }
    return it;
  };
  const LOADOUT_ORDER = { Spec: 0, Weapon: 1 };
  const weaponsByArch = { Light: new Map(), Medium: new Map(), Heavy: new Map(), Unknown: new Map() };
  const seasonAt = seasonResolver(keys);
  const launchMs = new Map(keys.seasons().map((k) => [k.n, k.startMs]));
  const wtEvents = new Map();
  const wtEventOf = (scenarioId, season) => {
    const k = `${scenarioId}:${season}`;
    if (!wtEvents.has(k)) wtEvents.set(k, worldTourEvent(scenarioId, season, keys));
    return wtEvents.get(k);
  };

  const normalized = new Array(rawRounds.length);
  let countedRoundCount = 0;
  for (let i = 0; i < rawRounds.length; i++) {
    const d = rawRounds[i].Data || {};
    const roundId = rawRounds[i].RoundID != null ? String(rawRounds[i].RoundID) : null; // 2026-09+
    const archetype = archetypeLabel(d.CharacterArchetype);
    const pmap = parseMapVariant(d.MapVariant);
    const rmap = resolveMap(d.MapVariant, keys); // precise name + one bg photo + crop focus
    const ltmBg = resolveLtmBackground(d.ScenarioID); // LTM-specific background by gamemode id (overrides the map photo)
    const cond = parseCondition(d.EnvironmentalCondition);
    // Embark's layout name where the key file has one ("Up Down Left Right"), else the codename's.
    const keyLayout = keys.map(d.MapVariant)?.variant;
    const variant = keyLayout
      ? (keyLayout === 'Standard issue' ? null : keyLayout)
      : pmap.variant && !/^Base(_\d+)?$/.test(pmap.variant) ? pmap.variant.replace(/([a-z])([A-Z])/g, '$1 $2') : null;
    const layout = variant && flatLabel(variant) !== flatLabel(cond) ? variant : null;
    const kpi = d.KillsPerItem || {};
    const dpi = d.DamagePerItem && typeof d.DamagePerItem === 'object' ? d.DamagePerItem : null;
    const startMs = toMs(d.StartTime);
    const mode = classifyMode(d, keys);
    let wtEvent = null;
    if (mode.category === 'World Tour') {
      const n = seasonAt(rawRounds[i].SeasonID, startMs);
      wtEvent = wtEventOf(d.ScenarioID, n);
      // Dated seasons start at midnight, launches hours later: a launch-morning round is the old season's.
      if (!wtEvent && rawRounds[i].SeasonID == null && n != null && startMs < (launchMs.get(n) ?? -Infinity)) wtEvent = wtEventOf(d.ScenarioID, n - 1);
    }
    // Preview-build and practice rounds stay in match history but count towards nothing else.
    const previewLabel = preview.labelOf(roundId, startMs);
    const uncounted = previewLabel ? 'preview' : mode.practice ? 'practice' : null;
    if (!uncounted) countedRoundCount++;
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
      if (!uncounted) {
        weaponTotals.set(id, (weaponTotals.get(id) || 0) + k);
        if (k > 0) killRounds.set(id, (killRounds.get(id) || 0) + 1);
        const bucket = weaponsByArch[archetype] || weaponsByArch.Unknown;
        bucket.set(id, (bucket.get(id) || 0) + k);
      }
      const w = resolveWeapon(id, keys);
      const rec = { id, kills: k, damage: dpi ? Math.round(dpi[id] || 0) : null, name: w.name, slug: w.slug, icon: w.icon, type: w.type };
      weaponKills.push(rec);
      if (!topAny || k > topAny.kills) topAny = rec;
      if ((w.type === 'Weapon' || w.type === 'Event') && (!topWeapon || k > topWeapon.kills)) topWeapon = rec;
    }
    weaponKills.sort((a, b) => b.kills - a.kills || (b.damage ?? 0) - (a.damage ?? 0));
    // Items that did damage without a kill this round (grenades, mines, the second gun).
    let damageOnly = null;
    if (dpi) {
      damageOnly = [];
      let any = false;
      for (const id in dpi) {
        const dmg = Math.round(dpi[id] || 0);
        if (dmg <= 0) continue;
        any = true;
        if (!uncounted) {
          damageTotals.set(id, (damageTotals.get(id) || 0) + dpi[id]);
          damageRounds.set(id, (damageRounds.get(id) || 0) + 1);
        }
        if (Object.hasOwn(kpi, id)) continue;
        const w = resolveWeapon(id, keys);
        damageOnly.push({ id, damage: dmg, name: w.name, slug: w.slug, icon: w.icon, type: w.type });
      }
      damageOnly.sort((a, b) => b.damage - a.damage);
      if (any && !uncounted) {
        damageRoundCount++;
        if (startMs != null && (damageFirstMs == null || startMs < damageFirstMs)) damageFirstMs = startMs;
      }
    }
    // 2026-09+ only. ONE snapshot of what was equipped: players swap items from their
    // reserve mid-round, so kills often come from items that are not in it.
    const loadoutIds = Array.isArray(d.LoadoutItemAssetIDs) ? d.LoadoutItemAssetIDs.filter((id) => id) : [];
    const loadout = loadoutIds.length
      ? loadoutIds.map(loadoutItem).sort((a, b) => (LOADOUT_ORDER[a.type] ?? 2) - (LOADOUT_ORDER[b.type] ?? 2))
      : null;
    // 2026-09+ `PlacedAt` is the final placement and agrees with every win;
    // `LeaderboardPosition` swaps 2nd and 3rd on about one casual round in ten.
    // PlacedAt 0 means the player abandoned, so the team's standing is kept instead.
    const placedAt = typeof d.PlacedAt === 'number' && d.PlacedAt > 0 ? d.PlacedAt : null;
    // 2026-09+, and only for rounds from 5 March 2026. Metric ids differ per mode but
    // Embark's key file gives them shared names, so rounds are comparable by name.
    // `Level` is a grade where 0 is the TOP: score and level correlate at -0.73 to
    // -0.91 on every metric, with clean cut-offs (Quick Cash damage 3,500 / 2,100 /
    // 1,100 / 250). Embark's README reads as if higher were better; it is not.
    // Shown as tier 1 (best) to 5. Before Season 10 every Score is 0 while the Level is
    // real, so those keep their tiers with `score: null`; a card at the bottom tier on
    // every metric with no score is an abandoned round and is dropped.
    let scorecard = null;
    if (Array.isArray(d.Scorecards) && d.Scorecards.length) {
      const entries = [];
      for (const s of d.Scorecards) {
        const name = keys.item(s?.GameAssetID)?.name;
        if (!name || !Number.isFinite(s.Score) || !Number.isInteger(s.Level)) continue;
        entries.push({ name, score: s.Score, tier: Math.min(5, Math.max(1, s.Level + 1)) });
      }
      const scored = entries.some((e) => e.score > 0);
      if (scored || entries.some((e) => e.tier < 5)) {
        scorecard = scored ? entries : entries.map((e) => ({ ...e, score: null }));
        scorecard.sort((a, b) => scorecardRank(a.name) - scorecardRank(b.name));
      }
    }
    normalized[i] = {
      createdAt: rawRounds[i].CreatedAt,
      roundId,
      seasonId: rawRounds[i].SeasonID != null ? String(rawRounds[i].SeasonID) : null, // 2026-09+
      preview: previewLabel ? { label: previewLabel } : null,
      uncounted, // 'preview' | 'practice' | null
      finalsStage: d.IsWorldTourFinals === true, // Season 3's World Tour Finals stage (2026-09+ exports)
      start: startMs,
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
      // 0 means "not populated", not 0th — real placements are 1..12. It lands
      // mostly on no-result rounds (all 34 in the older donor exports are
      // RoundWon false / Currency 0), but a newer-generation export also carries
      // it on a WON final, so read nothing into it beyond "unknown". Normalise to
      // null so every consumer's `!= null` guard renders "—" instead of "0th".
      position: placedAt ?? (typeof d.LeaderboardPosition === 'number' && d.LeaderboardPosition > 0 ? d.LeaderboardPosition : null),
      backfill: !!d.IsBackfill,
      disconnected: !!d.Disconnected,
      abandoned: !!d.Abandoned, // left and did not come back (2026-09+)
      squadName: d.SquadName ?? null,
      squadId: d.SquadID ?? null,
      mode,
      ...(wtEvent ? { wtEvent } : {}), // World Tour stop and week, when known
      weapon: topWeapon || topAny || null, // primary weapon used this round (kills-based)
      weaponKills, // all items that got a kill this round, desc — for the "also killed with" line
      damageOnly, // items that did damage but got no kill this round (2026-09+), or null
      loadout, // [spec, weapon, gadgets…] on record for the round, or null
      scorecard, // [{ name, score (null = not recorded), tier }] (tier 1 = best) or null
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
        if (!e) agg.set(wk.id, { ...wk });
        else {
          e.kills += wk.kills;
          if (wk.damage != null) e.damage = (e.damage ?? 0) + wk.damage;
        }
      }
    }
    // Damage-only items likewise; one that killed in another round of the match folds
    // into its kill entry instead.
    let dmgAgg = null;
    for (const r of m.rounds) {
      if (!r.damageOnly) continue;
      dmgAgg ??= new Map();
      for (const it of r.damageOnly) {
        const k = agg.get(it.id);
        if (k) k.damage = (k.damage ?? 0) + it.damage;
        else {
          const e = dmgAgg.get(it.id);
          if (e) e.damage += it.damage;
          else dmgAgg.set(it.id, { ...it });
        }
      }
    }
    m.weaponKills = [...agg.values()].sort((a, b) => b.kills - a.kills || (b.damage ?? 0) - (a.damage ?? 0));
    m.damageOnly = dmgAgg ? [...dmgAgg.values()].sort((a, b) => b.damage - a.damage) : null;
    if (m.isTournament) {
      const maxRR = Number.isFinite(m.maxRR) ? m.maxRR : null;
      const furthestRR = Number.isFinite(m.furthestRR) ? m.furthestRR : null;
      // An 8-team bracket qualifies through 4-team lobbies, so a mode we KNOW is
      // 2-team is a single match or a short series and must never get an "of 8"
      // placement, even when it records two rounds (S3's Ranked Terminal Attack
      // does, and was rendering as "2nd of 8" off a 1v1). Gate on the confirmed
      // classification, NOT on m.teams: that is max(observed, declared), so one
      // stray LeaderboardPosition would re-enable the bracket, and for an
      // unclassified scenario it collapses to the round's own position — which
      // reads 1 exactly when the player won every round, i.e. it would silently
      // demote real brackets on any season id we haven't keyed yet.
      const knownSeries = m.mode?.confirmed && m.mode.teams != null && m.mode.teams < 3;
      const isBracket = !knownSeries && maxRR != null && maxRR >= 1;
      m.isBracket = isBracket;
      m.rounds.sort((a, b) => (b.rr ?? -1) - (a.rr ?? -1) || (a.start ?? 0) - (b.start ?? 0));
      if (isBracket) {
        const hasPrelim = maxRR >= 3; // deeper than the 8-team draw
        for (const r of m.rounds) {
          r.stageLabel = stageLabel(r.rr, maxRR);
          r.stageTeams = stageTeams(r.rr);
        }
        m.stageReachedLabel = stageLabel(furthestRR, maxRR);
        m.placement = tournamentPlacement(furthestRR, m.finalPlacement, hasPrelim, m.tournamentWon);
      } else {
        // Sequential rounds (e.g. attack/defend) + a simple win/loss result.
        m.rounds.forEach((r, i) => {
          r.stageLabel = `Round ${i + 1}`;
          r.stageTeams = m.teams || 2;
        });
        m.stageReachedLabel = null;
        m.placement = null;
        // A win needs the series to have actually FINISHED. In a two-game series
        // LeaderboardPosition 1 on the first game means "won game 1", not the
        // match: the corpus has 42 tournaments in exactly that state that go on
        // to lose, so an abandoned series stopping there must not read as a win.
        // A SINGLE-round match with no rounds-remaining encoding has no series to
        // finish, so its own position IS the result. Multi-round must not take
        // that path: addRound only touches finalPlacement when rr is set, so it
        // would still be holding round one's number.
        const finished = furthestRR === 0 || (furthestRR == null && m.rounds.length === 1);
        // Keep any win addRound already established from RoundWon — this is a
        // refinement, not a replacement. Overwriting discards direct evidence and
        // turned an all-rounds-won match into a Loss.
        m.won = m.won || m.tournamentWon || (finished && m.finalPlacement === 1);
        // Same reason the win can't be trusted: an abandoned series has a game-1
        // position, not a match placement. Leaving it set renders the card's own
        // contradiction, a "Loss" badge beside "1st of 2".
        if (!finished) m.finalPlacement = null;
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

  // Weapon view-models: every item with a kill, plus (2026-09+) every item with damage.
  const weaponIds = new Set([...weaponTotals.keys(), ...damageTotals.keys()]);
  const weapons = [...weaponIds]
    .map((id) => ({
      id,
      kills: weaponTotals.get(id) || 0,
      killRounds: killRounds.get(id) || 0,
      damage: Math.round(damageTotals.get(id) || 0),
      damageRounds: damageRounds.get(id) || 0,
      mastery: null, // filled in by buildMastery
      ...resolveWeapon(id, keys),
    }))
    .sort((a, b) => b.kills - a.kills || b.damage - a.damage);
  let damageTotal = 0;
  for (const v of damageTotals.values()) damageTotal += v;
  const damage = { has: damageRoundCount > 0, rounds: damageRoundCount, totalRounds: countedRoundCount, firstMs: damageFirstMs, total: Math.round(damageTotal) };

  const weaponsByArchetype = {};
  for (const arch of ['Light', 'Medium', 'Heavy']) {
    weaponsByArchetype[arch] = [...weaponsByArch[arch].entries()]
      .map(([id, kills]) => ({ id, kills, ...resolveWeapon(id, keys) }))
      .sort((a, b) => b.kills - a.kills);
  }

  return { matches, weapons, weaponsByArchetype, damage, roundCount: rawRounds.length, rounds: normalized, otherGameRounds, unknownRounds };
}

// A preview build's own RoundStatSummary is updated as its last round ends, so it is the
// summary whose UpdatedAt falls within a few seconds of a preview round's end.
const SUMMARY_END_TOL_MS = 10e3;
function liveSummaries(summaries, rounds) {
  const ends = rounds.filter((r) => r.uncounted === 'preview' && r.end != null).map((r) => r.end);
  if (!ends.length) return { live: summaries, preview: 0 };
  const live = summaries.filter((s) => {
    const t = toMs(s.UpdatedAt);
    return t == null || !ends.some((e) => Math.abs(e - t) <= SUMMARY_END_TOL_MS);
  });
  return { live, preview: summaries.length - live.length };
}

// --- item mastery (2026-09+ `RankBucket` rows the key file files under "Item mastery") ---
// One row per weapon, gadget or specialization the player has levelled: the level and
// XP the export gives, nothing derived (thresholds and the top level are not in the
// data). Covers items that never score a kill, which is the only place they get a number.
function buildMastery(byType, keys, weapons) {
  const byId = new Map();
  for (const rb of byType.RankBucket || []) {
    if (rb.BucketID == null) continue;
    const m = keys.mastery(rb.BucketID);
    if (m?.category !== 'Item mastery' || m.assetId == null) continue;
    const level = Number.isInteger(rb.Rank) ? rb.Rank : null;
    const xp = typeof rb.XP === 'number' ? rb.XP : null;
    if (level == null && xp == null) continue;
    const id = String(m.assetId);
    const prev = byId.get(id);
    if (prev && prev.xp >= (xp ?? 0)) continue;
    const w = resolveWeapon(id, keys);
    byId.set(id, { id, name: w.unknown && m.name ? m.name : w.name, slug: w.slug, icon: w.icon, type: w.type, archetype: w.archetype, level: level ?? 0, xp: xp ?? 0, kills: 0, damage: 0 });
  }
  const levelCounts = new Map();
  let maxLevel = 0;
  for (const it of byId.values()) {
    levelCounts.set(it.level, (levelCounts.get(it.level) || 0) + 1);
    if (it.level > maxLevel) maxLevel = it.level;
  }
  for (const w of weapons) {
    const it = byId.get(w.id);
    if (!it) continue;
    it.kills = w.kills;
    it.damage = w.damage;
    w.mastery = { level: it.level, xp: it.xp };
  }
  const items = [...byId.values()].sort((a, b) => b.xp - a.xp || b.level - a.level || a.name.localeCompare(b.name));
  return {
    has: items.length > 0,
    count: items.length,
    maxLevel,
    levelCounts: [...levelCounts.entries()].sort((a, b) => a[0] - b[0]).map(([level, n]) => ({ level, n })),
    items,
  };
}

// --- per-round scorecards (2026-09+ `Data.Scorecards`) ---------------------
const SCORECARD_ORDER = ['Damage', 'Eliminations', 'KDR', 'Support', 'Objective', 'Revives', 'KillStreak', 'Assists'];
const scorecardRank = (name) => {
  const i = SCORECARD_ORDER.indexOf(name);
  return i < 0 ? SCORECARD_ORDER.length : i;
};

// Rounds are grouped by which metrics they carry: objective modes score Objective
// and Revives where deathmatch modes score KillStreak and Assists, and averaging
// across the two would describe neither.
function buildScorecards(rounds) {
  const groups = new Map();
  let count = 0;
  let unscored = 0;
  let firstMs = null;
  for (const r of rounds) {
    if (!r.scorecard) continue;
    count++;
    if (r.scorecard[0].score == null) unscored++;
    if (r.start != null && (firstMs == null || r.start < firstMs)) firstMs = r.start;
    const key = r.scorecard.map((m) => m.name).join('|');
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, rounds: 0, metrics: new Map() }));
    g.rounds++;
    for (const m of r.scorecard) {
      let e = g.metrics.get(m.name);
      if (!e) g.metrics.set(m.name, (e = { name: m.name, rounds: 0, scoredRounds: 0, sum: 0, bestScore: null, tierCounts: [0, 0, 0, 0, 0] }));
      e.rounds++;
      if (m.score != null) {
        e.scoredRounds++;
        e.sum += m.score;
        if (e.bestScore == null || m.score > e.bestScore) e.bestScore = m.score;
      }
      e.tierCounts[m.tier - 1]++;
    }
  }
  const out = [...groups.values()]
    .sort((a, b) => b.rounds - a.rounds || a.key.localeCompare(b.key))
    .map((g) => ({
      key: g.key,
      label: g.metrics.has('KillStreak') || g.metrics.has('Assists') ? 'Deathmatch modes' : g.metrics.has('Objective') ? 'Objective modes' : 'Other modes',
      rounds: g.rounds,
      // tierCounts[0] is tier 1, the best. Average and best cover scored rounds only.
      metrics: [...g.metrics.values()].map((e) => ({
        name: e.name,
        rounds: e.rounds,
        scoredRounds: e.scoredRounds,
        avgScore: e.scoredRounds ? e.sum / e.scoredRounds : null,
        bestScore: e.bestScore,
        tierCounts: e.tierCounts,
      })),
    }));
  return { has: count > 0, rounds: count, unscoredRounds: unscored, totalRounds: rounds.length, firstMs, groups: out };
}

// --- equipped loadouts (2026-09+ `LoadoutItemAssetIDs`) --------------------
// Per class: how often each item was in the recorded loadout and how those rounds
// went, plus the most-played full builds. `coverage` is the share of kills made
// with an item that was in that round's snapshot, so the page can say how far the
// snapshot is from everything the player actually used.
const LOADOUT_CLASSES = ['Light', 'Medium', 'Heavy'];
function buildLoadouts(rounds) {
  const classes = Object.fromEntries(LOADOUT_CLASSES.map((c) => [c, { rounds: 0, wins: 0, items: new Map(), builds: new Map() }]));
  let count = 0;
  let firstMs = null;
  let kills = 0;
  let killsInLoadout = 0;
  for (const r of rounds) {
    if (!r.loadout) continue;
    count++;
    if (r.start != null && (firstMs == null || r.start < firstMs)) firstMs = r.start;
    for (const wk of r.weaponKills) {
      if (wk.id === '0') continue;
      kills += wk.kills;
      if (r.loadout.some((it) => it.id === wk.id)) killsInLoadout += wk.kills;
    }
    const c = classes[r.archetype];
    if (!c) continue;
    c.rounds++;
    if (r.roundWon) c.wins++;
    for (const it of r.loadout) {
      let e = c.items.get(it.id);
      if (!e) c.items.set(it.id, (e = { ...it, rounds: 0, wins: 0 }));
      e.rounds++;
      if (r.roundWon) e.wins++;
    }
    const key = r.loadout.map((it) => it.id).sort().join('|');
    let b = c.builds.get(key);
    if (!b) c.builds.set(key, (b = { key, items: r.loadout, rounds: 0, wins: 0 }));
    b.rounds++;
    if (r.roundWon) b.wins++;
  }
  const byClass = {};
  for (const name of LOADOUT_CLASSES) {
    const c = classes[name];
    const items = [...c.items.values()]
      .map((e) => ({ ...e, pickRate: div(e.rounds, c.rounds), winRate: div(e.wins, e.rounds) }))
      .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name));
    byClass[name] = {
      rounds: c.rounds,
      winRate: div(c.wins, c.rounds),
      specs: items.filter((e) => e.type === 'Spec'),
      weapons: items.filter((e) => e.type === 'Weapon' || e.type === 'Event'),
      gadgets: items.filter((e) => e.type !== 'Spec' && e.type !== 'Weapon' && e.type !== 'Event'),
      distinctBuilds: c.builds.size,
      builds: [...c.builds.values()]
        .filter((b) => b.rounds > 1)
        .sort((a, b) => b.rounds - a.rounds || a.key.localeCompare(b.key))
        .slice(0, 3)
        .map((b) => ({ ...b, winRate: div(b.wins, b.rounds) })),
    };
  }
  return { has: count > 0, rounds: count, totalRounds: rounds.length, firstMs, coverage: kills ? killsInLoadout / kills : null, byClass };
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

function buildRecords(allRounds, allMatches) {
  // Bot lobbies (new-player onboarding) would set records nobody earned against players.
  const rounds = allRounds.filter((r) => !r.mode?.bots);
  const matches = allMatches.filter((m) => !m.mode?.bots);
  // Most cash in one MATCH = the tournament (multi-round match) with the highest
  // TOTAL cash. The best SINGLE round of cash is its own record, so restrict this
  // to real tournaments to avoid the two cards duplicating each other.
  let payday = null;
  for (const m of matches) {
    if (!m.isTournament) continue;
    if (m.currency > 0 && (payday == null || m.currency > payday.currency)) payday = m;
  }
  return {
    botsExcluded: allRounds.length - rounds.length,
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

// 2026-09+ `TransactionLog.Items`: what a grant handed over (positive amounts) and
// what it cost (negative: Multibucks, or an event currency). Battle passes come
// through as the internal names "Premium" / "Default" and are labelled by type.
const ITEM_TYPE_LABELS = {
  CustomizationItem: 'Outfit item', WeaponSkin: 'Weapon skin', WeaponCharm: 'Weapon charm', WeaponSticker: 'Weapon sticker',
  WeaponAttachment: 'Weapon attachment', PlayerCardCustomization: 'Player card', PlayerCard: 'Player card', AnimationCustomization: 'Animation',
  Spray: 'Spray', Emoticon: 'Emote', ClansCustomization: 'Club customization', BattlePass: 'Battle pass', GameItem: 'Game item', Currency: 'Currency',
};
function transactionItems(rows, keys) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const granted = [];
  const cost = [];
  for (const it of rows) {
    if (!it || typeof it !== 'object') continue;
    const amount = typeof it.Amount === 'number' ? it.Amount : 0;
    if (amount === 0) continue;
    const id = it.GameAssetID != null ? String(it.GameAssetID) : null;
    const k = id != null ? keys.item(id) : null;
    let name = cleanName(it.Name) || k?.name || (id != null ? `Item ${id}` : 'Unknown item');
    if (amount < 0) {
      cost.push({ id, name, amount: -amount });
      continue;
    }
    const type = k?.itemType || null;
    let internal = INTERNAL_NAME_RE.test(name);
    if (type === 'BattlePass') {
      name = k?.subType && k.subType !== 'Default' ? `Battle Pass (${k.subType})` : 'Battle Pass';
      internal = false;
    }
    const label = type ? (Object.hasOwn(ITEM_TYPE_LABELS, type) ? ITEM_TYPE_LABELS[type] : type.replace(/([a-z0-9])([A-Z])/g, '$1 $2')) : null;
    granted.push({ id, name, label, amount, internal, currency: type === 'Currency' });
  }
  if (!granted.length && !cost.length) return null;
  return { granted, cost };
}

function buildEconomy(byType, auditByType, keys) {
  // Full grant/purchase feed (newest first). GameStorePurchasedAt is when the
  // purchase happened; fall back to CreatedAt for non-store grants. createdMs is
  // the backend grant time, used to link fiat purchases to what they granted.
  const allTransactions = (byType.TransactionLog || [])
    .map((t) => ({
      items: transactionItems(t.Items, keys),
      type: t.TransactionType ?? 'unknown',
      state: t.State ?? 'unknown',
      source: t.Source ?? 'unknown',
      store: t.GameStore ?? null,
      ms: toMs(t.GameStorePurchasedAt ?? t.CreatedAt),
      createdMs: toMs(t.CreatedAt),
      purchasedAt: t.GameStorePurchasedAt ?? t.CreatedAt ?? null,
      pricePoint: Number.isFinite(t.PricePoint) ? t.PricePoint : null,
      currency: t.CurrencyCode ?? null,
      country: t.Country ?? null,
      localizedPrice: t.LocalizedPrice ?? null,
      granted: t.State === 'granted',
      isFiat: t.Source === 'realmoneytransaction',
      contents: null,
    }))
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0));

  // Raw Multibucks ledger rows (for totals, linking, and chronological ordering).
  const rawLedger = (byType.HardCurrencyLog || []).map((h) => ({
    logType: h.LogType ?? 'unknown',
    quantity: typeof h.Quantity === 'number' ? h.Quantity : 0,
    balance: typeof h.NewUserTotalBalance === 'number' ? h.NewUserTotalBalance : null,
    ms: toMs(h.CreatedAt ?? h.UpdatedAt),
    createdAt: h.CreatedAt ?? h.UpdatedAt ?? null,
  }));

  // Split live-game records from season-playtest / other-Embark-game records before
  // anything is totalled — see lib/realms.js.
  const orderedAsc = orderLedger(rawLedger);
  const realms = buildRealms(orderedAsc, auditByType);
  orderedAsc.forEach((r, i) => {
    const c = realms.ledgerRealms[i];
    r.realm = c.realm;
    r.realmLabel = c.label;
    r.isLive = c.realm === REALM.LIVE;
  });
  for (const t of allTransactions) {
    // Classify on createdMs — when the backend WROTE the row — not on `ms`, which
    // is GameStorePurchasedAt and points back to the original store purchase. A
    // playtest re-issues your existing entitlements, so those rows carry a real
    // purchase date from months earlier while being written during the playtest.
    const c = realms.realmAt(t.createdMs ?? t.ms);
    t.realm = c.realm;
    t.realmLabel = c.label;
    t.isLive = c.realm === REALM.LIVE;
  }

  // Everything below counts the live game only; the off-live rows stay in the
  // feed (this is the user's own data — it is shown and badged, never dropped).
  const transactions = allTransactions.filter((t) => t.isLive);
  const testTransactions = allTransactions.filter((t) => !t.isLive);
  const grantedCount = transactions.filter((t) => t.granted).length;

  // Steam DLC ownership. Each DLC repeats as identical rows (4 to 9 copies seen), so
  // dedup on DLCID and keep the earliest CreatedAt as the "owned since" date.
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
  // Two purchases can be granted in the same second — export 00 bought the Season 7
  // Ultimate Battle Pass Bundle and Starter Pack 28 MICROSECONDS apart. The export is
  // precise enough to tell them apart (each charge, its `bought` row and its DLC row
  // share an exact CreatedAt), so match exactly first and only fall back to the window
  // when nothing lines up. Claimed rows are consumed, so one grant can never be
  // reported against two charges — that showed both purchases as "1,150 Multibucks +
  // both DLCs" when one of them actually granted 1,000.
  const boughtEvents = rawLedger.filter((l) => l.logType === 'bought' && l.ms != null);
  const LINK_TOL = 2000; // ms
  const usedMb = new Set();
  const usedDlc = new Set();
  const claim = (pool, used, at, keyOf) => {
    const free = pool.filter((x) => !used.has(x) && keyOf(x) != null);
    return free.find((x) => keyOf(x) === at) ?? free.find((x) => Math.abs(keyOf(x) - at) <= LINK_TOL) ?? null;
  };
  // Exact matches first across ALL charges, so a near-miss can't steal a row that is
  // some other charge's exact partner.
  for (const pass of ['exact', 'window']) {
    for (const t of allTransactions) {
      if (!t.isFiat || t.createdMs == null) continue;
      if (t.contents && t.contents.mb != null && t.contents.dlcs.length) continue;
      const mb = t.contents?.mb != null ? null
        : (pass === 'exact'
          ? boughtEvents.find((b) => !usedMb.has(b) && b.ms === t.createdMs)
          : claim(boughtEvents, usedMb, t.createdMs, (b) => b.ms));
      const dlcs = dlc.filter((d) => !usedDlc.has(d) && d.ownedSinceMs != null &&
        (pass === 'exact' ? d.ownedSinceMs === t.createdMs : Math.abs(d.ownedSinceMs - t.createdMs) <= LINK_TOL));
      if (!mb && !dlcs.length) continue;
      if (mb) usedMb.add(mb);
      // Remember which charge claimed each DLC row (used below to date it).
      for (const d of dlcs) { usedDlc.add(d); d.claimedBy = t; }
      t.contents = {
        mb: mb ? mb.quantity : (t.contents?.mb ?? null),
        dlcs: [...(t.contents?.dlcs ?? []), ...dlcs.map((d) => ({ dlcId: d.dlcId, name: d.name, url: d.url }))],
      };
    }
  }

  // Real-money (fiat) spend. IMPORTANT: PricePoint is Valve's *base* price tier
  // (≈ USD/EUR list price), NOT the amount actually charged. For a PLN wallet,
  // PricePoint 4.99 was billed PLN 20.95 — and most rows have no LocalizedPrice.
  // So the only true local amount is LocalizedPrice (when present); the summed
  // PricePoint total is an approximate USD-list estimate, never the real local
  // spend. CurrencyCode is the wallet currency and does NOT scale PricePoint.
  // Deliberately NOT realm-filtered: a Steam charge happens on Steam, so the server a
  // row was written from says nothing about whether money changed hands, and a real
  // purchase made during a preview would be dropped. What a playtest produces is
  // RE-GRANTS of things already owned, which the dedupe below removes on their own
  // evidence. Verified: dedupe alone gives identical totals on all four exports.
  const fiat = allTransactions.filter((t) => t.isFiat);

  // A re-provisioning server writes a fresh row carrying the ORIGINAL
  // GameStorePurchasedAt, so one charge gets counted again months later. Identify a
  // charge by (purchase instant + price) and keep only its first grant.
  //
  // The time gap matters: one checkout can legitimately hold two different items at
  // the same price, and those are granted in the same instant, whereas a re-grant
  // lands much later.
  const REGRANT_MIN_GAP = 3600e3; // 1h
  const firstGrantOf = new Map();
  const fiatGranted = [];
  const fiatUnpriced = [];
  let duplicateChargeCount = 0;
  let duplicateChargeTotal = 0;
  for (const t of [...fiat].sort((a, b) => (a.createdMs ?? 0) - (b.createdMs ?? 0))) {
    if (!t.granted) continue;
    if (t.pricePoint == null) { fiatUnpriced.push(t); continue; }
    const key = `${t.purchasedAt ?? t.createdMs}|${t.pricePoint}`;
    const first = firstGrantOf.get(key);
    // No CreatedAt means no usable time gap, so the rule can't be applied — keep the
    // row rather than let a missing timestamp read as "months apart" and delete it.
    if (first != null && t.createdMs != null && Math.abs(t.createdMs - first) >= REGRANT_MIN_GAP) {
      t.duplicateOfEarlierCharge = true;
      duplicateChargeCount++;
      duplicateChargeTotal += t.pricePoint;
      continue;
    }
    if (first == null && t.createdMs != null) firstGrantOf.set(key, t.createdMs);
    fiatGranted.push(t);
  }
  const spendBaseTotal = fiatGranted.reduce((s, t) => s + t.pricePoint, 0);

  // What the store actually charged, for the purchases that record it. Whether a row
  // records it depends on the STORE, not the export generation (Microsoft rows nearly
  // always do, Steam rows rarely), so the totals never travel without their count.
  // Built on `fiatGranted`, so failed attempts and repeat grants are already out. One
  // total per currency: never added together, never converted, never paired with
  // PricePoint. A price with no CurrencyCode stays uncounted, because its currency
  // cannot be told from the symbol.
  const chargedBy = new Map();
  let unchargedBaseTotal = 0;
  for (const t of fiatGranted) {
    const amount = t.currency ? localAmount(t.localizedPrice) : null;
    if (amount == null) {
      unchargedBaseTotal += t.pricePoint;
      continue;
    }
    let c = chargedBy.get(t.currency);
    if (!c) chargedBy.set(t.currency, (c = { currency: t.currency, cents: 0, count: 0 }));
    c.cents += Math.round(amount * 100);
    c.count++;
  }
  const chargedCurrencies = [...chargedBy.values()].map((c) => ({ currency: c.currency, total: c.cents / 100, count: c.count })).sort((a, b) => b.count - a.count);
  const chargedCount = chargedCurrencies.reduce((s, c) => s + c.count, 0);
  const charged = { byCurrency: chargedCurrencies, count: chargedCount, uncharged: fiatGranted.length - chargedCount, unchargedBaseTotal };

  // Is a DLC row's timestamp the purchase date or a later re-record? Matching a charge is
  // not enough — a preview re-grants the entitlement AND rewrites the DLC row in the same
  // instant, so they line up while carrying a purchase date months old. Require a first
  // grant written promptly after it. Measured lags: genuine DLC 0.0-1.0d, re-records 92d+,
  // and 3.5/7.1d for the ARC Raiders base game (a free title that links to whichever
  // charge is nearest). 2 days sits in the empty band and treats those two alike.
  const RERECORD_LAG = 2 * 24 * 3600e3;
  for (const d of dlc) {
    const t = d.claimedBy;
    const prompt = !!t && !t.duplicateOfEarlierCharge &&
      t.ms != null && d.ownedSinceMs != null && Math.abs(d.ownedSinceMs - t.ms) <= RERECORD_LAG;
    d.dateIsPurchase = prompt;
    // Which reason, so the page can state the true one: nothing ties this row to a
    // charge, or something does but the row was written long after it.
    d.dateNote = prompt ? null : (t ? 'rerecord' : 'unlinked');
    delete d.claimedBy;
  }
  const walletCurrencies = [...new Set(fiatGranted.map((t) => t.currency).filter(Boolean))];
  const anyLocalized = fiat.some((t) => t.localizedPrice);

  // Named contents (2026-09+). A charge's granted list joins the timestamp-linked
  // Multibucks and DLC; the Multibucks line in the list also fills `mb` when no
  // ledger row was linked.
  let itemRows = 0;
  const mbSpends = [];
  for (const t of allTransactions) {
    if (!t.items) continue;
    itemRows++;
    if (t.isFiat) {
      const mbLine = t.items.granted.find((g) => g.currency && /multibucks/i.test(g.name));
      t.contents = { mb: t.contents?.mb ?? (mbLine ? mbLine.amount : null), dlcs: t.contents?.dlcs ?? [], items: t.items.granted };
    }
    const mbCost = t.items.cost.find((c) => /multibucks/i.test(c.name));
    if (mbCost && t.isLive) mbSpends.push({ ms: t.ms, createdMs: t.createdMs, mb: mbCost.amount, source: t.source, items: t.items.granted, claimed: false });
  }
  const topMbSpends = [...mbSpends].sort((a, b) => b.mb - a.mb || (b.ms ?? 0) - (a.ms ?? 0)).slice(0, 8).map((s) => ({ ms: s.ms, mb: s.mb, source: s.source, items: s.items }));

  // Stubbed-store rows written off-live. Rows that survived into `fiatGranted` are
  // EXCLUDED: fiat is no longer realm-filtered, so an off-live row can legitimately be
  // counted in the spend total, and calling it "set aside" would contradict the money.
  const counted = new Set(fiatGranted);
  const testFiat = testTransactions.filter((t) => t.isFiat && !counted.has(t));

  // Present newest first for the table; the chart uses one point per timestamp.
  const liveAsc = orderedAsc.filter((r) => r.isLive);
  const ledger = [...liveAsc].reverse();
  const ledgerAll = [...orderedAsc].reverse();

  // A "spent" ledger row and the store purchase it paid for carry the same amount
  // and are written together, so each spend can say what it bought.
  if (mbSpends.length) {
    mbSpends.sort((a, b) => (a.createdMs ?? 0) - (b.createdMs ?? 0));
    for (const r of orderedAsc) {
      r.items = null;
      if (r.logType !== 'spent' || r.ms == null) continue;
      const hit = mbSpends.find((s) => !s.claimed && s.mb === r.quantity && s.createdMs != null && Math.abs(s.createdMs - r.ms) <= LINK_TOL);
      if (!hit) continue;
      hit.claimed = true;
      r.items = hit.items;
    }
  }

  // `orderLedger` measured each delta against the previous row in the FILE, which
  // straddles realm boundaries (a playtest's first row reads as a +49,750 inflow, and
  // the row resuming live as a −55,275 spend). Re-measure within each wallet.
  const remeasure = (rows) => {
    let prev = null;
    for (const r of rows) {
      r.delta = prev != null && r.balance != null ? r.balance - prev : ledgerSign(r) * r.quantity;
      if (r.balance != null) prev = r.balance;
    }
  };
  remeasure(liveAsc);
  for (const s of realms.sessions) remeasure(orderedAsc.slice(s.firstIndex, s.lastIndex + 1));

  let currentBalance = null;
  for (let i = liveAsc.length - 1; i >= 0; i--) {
    if (liveAsc[i].balance != null) {
      currentBalance = liveAsc[i].balance;
      break;
    }
  }
  const balanceSeries = [];
  for (let i = 0; i < liveAsc.length; i++) {
    const r = liveAsc[i];
    if (r.ms == null || r.balance == null) continue;
    const next = liveAsc[i + 1];
    if (!next || next.ms !== r.ms) balanceSeries.push({ ms: r.ms, balance: r.balance });
  }

  // Multibucks in/out from the reconstructed deltas (the ACTUAL balance change
  // per event), grouped by LogType. Using deltas — not the raw Quantity field —
  // means the categories RECONCILE (total in − out = current balance − start)
  // and an occasional `unknown` OUTFLOW (a correction) is routed to "out" rather
  // than miscounted as an inflow.
  const tallyMb = (rows) => {
    const m = { earned: 0, bought: 0, gifted: 0, other: 0, out: 0 };
    for (const r of rows) {
      const d = r.delta || 0;
      if (d > 0) m[r.logType === 'earned' || r.logType === 'bought' || r.logType === 'gifted' ? r.logType : 'other'] += d;
      else if (d < 0) m.out += -d;
    }
    m.inTotal = m.earned + m.bought + m.gifted + m.other;
    return m;
  };
  const mb = tallyMb(liveAsc);
  mb.startBalance = liveAsc[0] && liveAsc[0].balance != null && liveAsc[0].delta != null ? liveAsc[0].balance - liveAsc[0].delta : 0;
  const mbTest = tallyMb(orderedAsc.filter((r) => !r.isLive));

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
    has: allTransactions.length > 0 || ledgerAll.length > 0 || dlc.length > 0,
    transactions,
    transactionsAll: allTransactions,
    transactionCount: transactions.length,
    grantedCount,
    bySource: tally(transactions, 'source'),
    byStore: tally(transactions, 'store'),
    fiat,
    fiatGranted,
    // These four partition the fiat rows shown in the table, so the panel's counts
    // always add up: granted+priced / granted-but-no-price / not granted / deduped.
    fiatGrantedCount: fiatGranted.length,
    fiatUnpricedCount: fiatUnpriced.length,
    fiatFailedCount: fiat.filter((t) => !t.granted).length,
    duplicateChargeCount,
    duplicateChargeTotal,
    spendBaseTotal,
    charged,
    walletCurrencies,
    anyLocalized,
    hasItems: itemRows > 0,
    itemRows,
    mbSpendsNamed: mbSpends.length,
    topMbSpends,
    ledger,
    ledgerAll,
    mb,
    currentBalance,
    balanceSeries,
    dlc,
    baseGameUrl: steamAppUrl(STEAM_BASE_GAME_ID),
    offers,
    // `sessions`/`windows` = what was REMOVED from the figures above.
    // `gaps`/`anomalies` = what is still IN them but couldn't be accounted for.
    realms: {
      has: realms.has,
      sessions: realms.sessions,
      windows: realms.windows,
      auditHadTenancy: realms.auditHadTenancy,
      // Balance changes with no matching row; absorbed by the row they land on.
      gaps: realms.gaps,
      // Beyond what the live game can produce — usually a playtest both signals
      // missed, so the totals are an upper bound rather than a fact.
      anomalies: realms.anomalies,
    },
    testTransactionCount: testTransactions.length,
    testFiatCount: testFiat.length,
    testLedgerCount: orderedAsc.length - liveAsc.length,
    mbTest,
  };
}

// --- anti-cheat / sessions / hardware signals -----------------------------
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
// A real IP
const isRealIp = (s) => typeof s === 'string' && (IPV4_RE.test(s) || (s.includes(':') && /^[0-9a-f:]+$/i.test(s) && s.length >= 3));
const ipVersion = (s) => (s.includes(':') ? 6 : 4);

const RETENTION = {
  EOS: 'Holds about the year before the export was requested, and can end months before your last match.',
  Anybrain: 'Anybrain logs begin at the integration go-live (2025-07-24).',
  Denuvo: 'Embark rolled Denuvo out in stages from September to November 2025, so it starts on different dates on different accounts.',
  Logins: 'Backend account sign-ins (token grants), kept for the whole account lifetime.',
};

// Which game a Denuvo product name or a sign-in's `UserLogin.Game` belongs to. `discovery`
// and `pioneer` are Embark's codenames for THE FINALS and ARC Raiders.
const gameOfProduct = (name) => (/^the finals/i.test(name || '') ? 'THE FINALS' : /^arc raiders/i.test(name || '') ? 'ARC Raiders' : null);
const gameOfSignIn = (g) => (/^(the finals|discovery)/i.test(g || '') ? 'THE FINALS' : /^(arc raiders|pioneer)/i.test(g || '') ? 'ARC Raiders' : null);
const DENUVO_SIGNIN_MS = 15 * 60e3;

// A Denuvo file naming one product covers only that product. The newer single file names
// both games and says nothing per session, so a session takes the game of the nearest
// sign-in within 15 minutes, or none.
function denuvoAttributor(raw) {
  const signIns = (raw.persistence?.byType?.UserLogin || [])
    .map((l) => ({ ms: toMs(l.CreatedAt), game: gameOfSignIn(l.Game) }))
    .filter((l) => l.ms != null && l.game)
    .sort((a, b) => a.ms - b.ms);
  return (ms) => {
    if (ms == null || !signIns.length) return null;
    let lo = 0;
    let hi = signIns.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (signIns[mid].ms < ms) lo = mid + 1;
      else hi = mid;
    }
    let best = null;
    for (const s of [signIns[lo - 1], signIns[lo]]) {
      if (s && Math.abs(s.ms - ms) <= DENUVO_SIGNIN_MS && (!best || Math.abs(s.ms - ms) < Math.abs(best.ms - ms))) best = s;
    }
    return best?.game ?? null;
  };
}

// EOS ships one archive per product user id, ARC Raiders' beside THE FINALS'. Its linked-
// accounts file names the product; without one, the audit logs the id under a game's tenancy.
const EOS_PRODUCTS = { b5adc328432e4883a396eba3d9c05133: 'THE FINALS', '9e8b37541e614575b4de303d2c2e44cf': 'ARC Raiders' };
function eosGames(raw) {
  const byPuid = new Map();
  for (const la of raw.eos.linkedAccounts || []) {
    if (la?.productUserId && Object.hasOwn(EOS_PRODUCTS, la.productId ?? '')) byPuid.set(la.productUserId, EOS_PRODUCTS[la.productId]);
  }
  for (const type of ['EOSProductUserId', 'EosProductUserID']) {
    for (const r of raw.audit?.byType?.[type] || []) {
      const game = gameOfSignIn(r?.tenancy);
      if (r?.product_user_id && game && !byPuid.has(r.product_user_id)) byPuid.set(r.product_user_id, game);
    }
  }
  return byPuid;
}

// Flatten every anti-cheat source into one comparable session list.
function collectSessions(raw) {
  const sessions = [];
  const eosGame = raw.eos.anticheat.length ? eosGames(raw) : null;
  for (const ac of raw.eos.anticheat) {
    const game = eosGame.get(ac?.productUserId) ?? null;
    for (const s of ac?.sessions || []) {
      sessions.push({
        source: 'EOS',
        start: toMs(s.timeStart),
        end: toMs(s.timeEnd),
        os: s.eacClient?.OperatingSystem || null,
        ip: s.eacClient?.ClientIP || null,
        build: s.gameClient?.ClientBuildTime || null,
        platform: null,
        game,
      });
    }
  }
  for (const r of raw.anybrain.sessions || []) {
    sessions.push({ source: 'Anybrain', start: toMs(r.sessionStart), end: toMs(r.sessionEnd), os: null, ip: r.ipAddress || null, build: null, platform: null });
  }
  let attribute = null;
  for (const d of raw.denuvo) {
    const products = (Array.isArray(d?.gameInfos) ? d.gameInfos : []).map((g) => g?.name).filter(Boolean);
    const single = products.length <= 1;
    if (!single) attribute ??= denuvoAttributor(raw);
    for (const s of d?.sessionInfos || []) {
      const start = toMs(s.start);
      const game = single ? gameOfProduct(products[0]) : attribute(start);
      const platform = single ? products[0] || null : products.find((p) => gameOfProduct(p) === game) || null;
      const attribution = single ? (products[0] ? 'file' : null) : game ? 'signin' : null;
      sessions.push({ source: 'Denuvo', start, end: toMs(s.end), os: null, ip: null, build: null, platform, game, attribution });
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
  const denuvoProducts = [...new Set(raw.denuvo.flatMap((d) => (Array.isArray(d?.gameInfos) ? d.gameInfos : []).map((g) => g?.name).filter(Boolean)))];
  const denuvoSessions = sessions.filter((s) => s.source === 'Denuvo');
  const denuvo = raw.denuvo.length
    ? {
        products: denuvoProducts,
        sessions: denuvoSessions.length,
        attributed: denuvoSessions.filter((s) => s.attribution === 'signin').length,
        unattributed: denuvoSessions.filter((s) => !s.attribution).length,
        multiProduct: raw.denuvo.some((d) => Array.isArray(d?.gameInfos) && d.gameInfos.length > 1),
      }
    : null;

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
  // Backend account logins (persistence `UserLogin`: {CreatedAt, GrantType,
  // IPAddress}) — point events, not sessions, so they enrich the IP/location
  // data and get their own source row but stay OUT of the session list and the
  // activity strip (no double counting). Donor exports carry these redacted;
  // a real export has actual addresses covering the whole account lifetime.
  const loginRows = raw.persistence?.byType?.UserLogin || [];
  const grantTally = new Map();
  const gameTally = new Map();
  const loginIpSet = new Set();
  let loginFirst = Infinity;
  let loginLast = -Infinity;
  for (const l of loginRows) {
    const t = toMs(l.CreatedAt);
    if (t != null) {
      if (t < loginFirst) loginFirst = t;
      if (t > loginLast) loginLast = t;
    }
    const g = typeof l.GrantType === 'string' && l.GrantType ? l.GrantType : 'unknown';
    grantTally.set(g, (grantTally.get(g) || 0) + 1);
    if (typeof l.Game === 'string' && l.Game) gameTally.set(l.Game, (gameTally.get(l.Game) || 0) + 1);
    const ip = l.IPAddress;
    if (!ip) continue;
    if (!isRealIp(ip)) {
      redactedIpCount++;
      continue;
    }
    loginIpSet.add(ip);
    let rec = ipMap.get(ip);
    if (!rec) {
      rec = { ip, version: ipVersion(ip), count: 0, firstMs: Infinity, lastMs: -Infinity, sources: new Set() };
      ipMap.set(ip, rec);
    }
    rec.count++;
    rec.sources.add('Logins');
    if (t != null) {
      rec.firstMs = Math.min(rec.firstMs, t);
      rec.lastMs = Math.max(rec.lastMs, t);
    }
  }
  const logins = {
    count: loginRows.length,
    firstMs: Number.isFinite(loginFirst) ? loginFirst : null,
    lastMs: Number.isFinite(loginLast) ? loginLast : null,
    grantTypes: [...grantTally.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    byGame: [...gameTally.entries()].map(([game, count]) => ({ game, count })).sort((a, b) => b.count - a.count), // 2026-09+
    distinctIps: loginIpSet.size,
  };
  if (logins.count > 0) {
    sources.push({ name: 'Logins', count: logins.count, firstMs: logins.firstMs, lastMs: logins.lastMs, unit: 'logins', note: RETENTION.Logins });
  }

  const ips = [...ipMap.values()]
    .map((r) => ({ ...r, sources: [...r.sources], firstMs: Number.isFinite(r.firstMs) ? r.firstMs : null, lastMs: Number.isFinite(r.lastMs) ? r.lastMs : null }))
    .sort((a, b) => b.count - a.count);

  const eosOses = [...new Set(sessions.filter((s) => s.source === 'EOS' && s.os).map((s) => s.os))];
  const anybrainOses = [...new Set((raw.anybrain.os || []).map((r) => r.name).filter(Boolean))];
  const resolutions = [...new Set((raw.anybrain.screens || []).map((r) => (r.width && r.height ? `${r.width}×${r.height}` : null)).filter(Boolean))];

  // Anybrain input-device fingerprint (peripherals.csv): each row
  // is a Windows device-instance ID like `HID\VID_046D&PID_C08B&MI_01&COL02`.
  // One physical device yields several rows (one per USB interface / HID
  // collection), so group by vendor:product id. Vendor/product NAMES are not
  // resolved here — the Sessions page lazy-loads /vault/usb-ids.json.gz for that
  const periMap = new Map(); // 'VID:PID' -> device
  for (const r of raw.anybrain.peripherals || []) {
    const m = /^(?:HID|USB)\\VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(r.peripheral || '');
    if (!m) continue;
    const vid = m[1].toUpperCase();
    const pid = m[2].toUpperCase();
    const key = `${vid}:${pid}`;
    let d = periMap.get(key);
    if (!d) periMap.set(key, (d = { id: key, vid, pid, interfaces: 0 }));
    d.interfaces += 1;
  }
  const peripherals = [...periMap.values()].sort((a, b) => a.id.localeCompare(b.id));

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
    .map(([key, set]) => ({ key, label: Object.hasOwn(FP_LABEL, key) ? FP_LABEL[key] : key, distinct: set.size, hardware: HARDWARE_METHODS.has(key) }))
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
    logins,
    redactedIpCount,
    operatingSystems: [...new Set([...eosOses, ...anybrainOses])],
    resolutions,
    peripherals,
    console: buildConsole(raw.audit?.byType),
    // Device-fingerprint summary (see comment above). `machineEstimate` replaces
    // the old "distinct TPM ids" count, which conflated fingerprint methods.
    machineEstimate,
    fingerprintMethods,
    denuvoPlatforms: denuvoProducts.length,
    denuvo,
    eos: eosSummary(sessions),
  };
}

const eosSummary = (sessions) => {
  const byGame = new Map();
  for (const s of sessions) if (s.source === 'EOS') byGame.set(s.game, (byGame.get(s.game) || 0) + 1);
  if (!byGame.size) return null;
  return { sessions: [...byGame.values()].reduce((a, n) => a + n, 0), byGame: [...byGame].map(([game, count]) => ({ game, count })).sort((a, b) => b.count - a.count) };
};

// --- console device facts (audit `XboxTokenClaims*`, console players only) ----
const CONSOLE_TYPES = { Scarlett: 'Xbox Series X|S', XboxOne: 'Xbox One' };
function buildConsole(auditByType) {
  const A = auditByType || {};
  const rows = Object.keys(A).filter((t) => /^XboxTokenClaims/.test(t)).flatMap((t) => A[t] || []);
  if (!rows.length) return null;
  const devices = new Map();
  for (const r of rows) {
    const key = r.device_id || r.device_pairwise_id || 'unknown';
    let d = devices.get(key);
    if (!d) devices.set(key, (d = { deviceId: r.device_id || null, type: r.device_type || null, records: 0, firstMs: null, lastMs: null, gamertags: new Set(), modernTags: new Set(), classicTags: new Set(), ageGroups: new Set(), countries: new Set(), privileges: new Set() }));
    d.records++;
    const t = toMs(r.logtime);
    if (t != null) {
      if (d.firstMs == null || t < d.firstMs) d.firstMs = t;
      if (d.lastMs == null || t > d.lastMs) d.lastMs = t;
    }
    const tag = r.gamer_tag_modern ? `${r.gamer_tag_modern}${r.gamer_tag_modern_suffix ? `#${r.gamer_tag_modern_suffix}` : ''}` : null;
    if (tag) d.gamertags.add(tag);
    if (r.gamer_tag_modern) d.modernTags.add(r.gamer_tag_modern);
    if (r.gamer_tag_classic) d.classicTags.add(r.gamer_tag_classic);
    if (r.age_group) d.ageGroups.add(r.age_group);
    if (r.country) d.countries.add(r.country);
    if (typeof r.privileges === 'string') for (const code of r.privileges.split(/\s+/)) if (code) d.privileges.add(code);
  }
  return {
    records: rows.length,
    licenceChecks: (A.ThirdPartyLicenseAssociationUpdated || []).length,
    devices: [...devices.values()]
      .map((d) => ({
        deviceId: d.deviceId,
        type: d.type,
        typeLabel: (d.type && Object.hasOwn(CONSOLE_TYPES, d.type) && CONSOLE_TYPES[d.type]) || d.type || 'Console',
        records: d.records,
        firstMs: d.firstMs,
        lastMs: d.lastMs,
        gamertags: [...d.gamertags],
        classicTags: [...d.classicTags].filter((t) => !d.modernTags.has(t)),
        ageGroups: [...d.ageGroups],
        countries: [...d.countries],
        privileges: [...d.privileges].sort((a, b) => Number(a) - Number(b)),
      }))
      .sort((a, b) => b.records - a.records),
  };
}

// --- player reports (audit `PlayerReport` events) -------------------------
// Reports the subject FILED against other players. Embark anonymises who was
// reported (target origin_uuid is blank), but keeps the reason and the free-text
// note. This is NOT an action against the subject's own account — the ban
// history covers that.
// --- support: in-game chat + customer-service PDF ---------------------------
// Chat lives in audit `ChatMessageSent` (raw + profanity-filtered text; a type
// newer exports carry). The CS_extracted_data.pdf is the only source for support
// tickets; it stays raw bytes here and the Support page lazy-parses it via
// lib/cs.js (pdfjs). Its older layout also duplicates the chat (censored only);
// the newer "Customer Support Data Export" layout carries tickets alone.
const CHAT_CHANNELS = { pl: 'Lobby', party: 'Party', squad: 'Squad', clan: 'Club' }; // squad/clan: 2026-09+ exports
export const chatChannelLabel = (ch) => (Object.hasOwn(CHAT_CHANNELS, ch) ? CHAT_CHANNELS[ch] : ch || 'Chat');

// Automated moderation verdicts (2026-09+ audit `ModerationDecisionPII`). Every chat
// verdict lands within 100 ms of one of the player's own messages, three per message:
// one advisory check, then two enforcing ones. `enforced` is fixed by the check's
// position and says nothing per message, so only `flagged` is kept. On the export this
// was verified on, a flagged message is exactly one the game filtered in chat.
const MODERATION_CALLS = { 'squad-chat-message': 'squad', 'party-chat-message': 'party', 'clan-chat-message': 'clan', 'clan-name': null };
const MODERATION_JOIN_MS = 2000;
function buildModeration(rows, chat) {
  if (!rows?.length) return null;
  const verdicts = rows.map((v) => ({ ms: toMs(v.logtime), call: v.call_name || '?', flagged: v.flagged === true })).filter((v) => v.ms != null);
  if (!verdicts.length) return null;
  let fromMs = Infinity;
  let toMs_ = -Infinity;
  for (const v of verdicts) {
    if (v.ms < fromMs) fromMs = v.ms;
    if (v.ms > toMs_) toMs_ = v.ms;
  }
  // chat is sorted by ms ascending; binary search the nearest message.
  const nearest = (ms) => {
    let lo = 0;
    let hi = chat.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (chat[mid].ms < ms) lo = mid + 1;
      else hi = mid;
    }
    let best = null;
    for (const i of [lo - 1, lo]) {
      const c = chat[i];
      if (c && Math.abs(c.ms - ms) <= MODERATION_JOIN_MS && (!best || Math.abs(c.ms - ms) < Math.abs(best.ms - ms))) best = c;
    }
    return best;
  };
  const channels = new Map();
  const channelOf = (call) => (Object.hasOwn(MODERATION_CALLS, call) ? MODERATION_CALLS[call] : call.replace(/-chat-message$/, ''));
  const nameChecks = { count: 0, flagged: 0, ms: null };
  const other = new Map();
  let unmatched = 0;
  let flaggedVerdicts = 0;
  for (const v of verdicts) {
    if (v.flagged) flaggedVerdicts++;
    if (v.call === 'clan-name') {
      nameChecks.count++;
      if (v.flagged) nameChecks.flagged++;
      if (nameChecks.ms == null || v.ms < nameChecks.ms) nameChecks.ms = v.ms;
      continue;
    }
    if (!/-chat-message$/.test(v.call)) {
      const o = other.get(v.call) || { name: v.call, count: 0, flagged: 0 };
      o.count++;
      if (v.flagged) o.flagged++;
      other.set(v.call, o);
      continue;
    }
    const c = nearest(v.ms);
    if (!c) {
      unmatched++;
      continue;
    }
    if (!c.moderation) c.moderation = { checks: 0, flagged: false };
    c.moderation.checks++;
    if (v.flagged) c.moderation.flagged = true;
    const ch = channelOf(v.call);
    const e = channels.get(ch) || { channel: ch, label: chatChannelLabel(ch), messages: new Set(), flagged: new Set() };
    e.messages.add(c);
    if (v.flagged) e.flagged.add(c);
    channels.set(ch, e);
  }
  let messagesChecked = 0;
  const checksHist = new Map();
  const flagged = [];
  for (const c of chat) {
    if (!c.moderation) continue;
    messagesChecked++;
    checksHist.set(c.moderation.checks, (checksHist.get(c.moderation.checks) || 0) + 1);
    if (c.moderation.flagged) flagged.push({ ms: c.ms, channel: c.channel, text: c.text, censored: c.censored });
  }
  flagged.reverse();
  let checksPerMessage = 0;
  let top = 0;
  for (const [n, count] of checksHist) if (count > top) { top = count; checksPerMessage = n; }
  return {
    has: true,
    fromMs,
    toMs: toMs_,
    verdicts: verdicts.length,
    messagesChecked,
    checksPerMessage,
    flaggedMessages: flagged.length,
    flaggedVerdicts,
    channels: [...channels.values()].map((e) => ({ channel: e.channel, label: e.label, messages: e.messages.size, flagged: e.flagged.size })).sort((a, b) => b.messages - a.messages),
    nameChecks: nameChecks.count ? nameChecks : null,
    other: [...other.values()],
    unmatched,
    flagged,
  };
}

// Inbox messages that carry no Title, by MessageName.
const INBOX_KINDS = {
  DiscoveryRankUpdateMessage: 'rankUpdate',
  DiscoveryGiftMessage: 'gift',
  ReportedUserBannedMessage: 'reportedBan',
  SharedFriendRequestMessage: 'friendRequest',
  DiscoveryRankWelcomeMessage: 'rankWelcome',
  PioneerCompensationMessage: 'compensation',
};

function buildSupport(raw, keys) {
  const rows = raw.audit?.byType?.ChatMessageSent || [];
  const chat = rows
    .map((c) => {
      const text = c.message ?? c.purified_message ?? '';
      const censored = c.purified_message ?? text;
      return {
        ms: toMs(c.logtime),
        iso: c.logtime ?? null,
        channel: c.room_type || '?',
        roomId: c.room_id || null,
        text,
        censored,
        wasCensored: c.purified === true || text !== censored,
        source: 'audit',
        moderation: null, // { checks, flagged } once buildModeration has joined the verdicts
      };
    })
    .filter((c) => c.ms != null)
    .sort((a, b) => a.ms - b.ms);
  const pdf = raw.customerSupport || null;
  const preParsed = raw.customerSupportParsed || null; // sample data injects the parsed shape directly
  // In-game inbox (2026-09+). One-way messages; both of Embark's games share the table.
  const P = raw.persistence?.byType || {};
  const isFinals = (game) => !game || game === 'THE FINALS';
  const messages = (P.InboxMessage || [])
    .map((m) => {
      const pl = m.Payload && typeof m.Payload === 'object' ? m.Payload : {};
      const rewards = [pl.compensationId, ...(Array.isArray(pl.attachments) ? pl.attachments.map((a) => a?.compensation?.id) : [])].filter(Boolean);
      // `rsChange` arrives as a string ("798").
      const rs = pl.rsChange != null && pl.rsChange !== '' ? Number(pl.rsChange) : NaN;
      const gifts = Array.isArray(pl.receivedGameAssetIds)
        ? pl.receivedGameAssetIds.map((id) => {
            const k = keys.item(id);
            const type = k?.itemType || null;
            const name = type === 'BattlePass' ? (k.subType && k.subType !== 'Default' ? `Battle Pass (${k.subType})` : 'Battle Pass') : k?.name ?? null;
            return { id: String(id), name, label: type && Object.hasOwn(ITEM_TYPE_LABELS, type) ? ITEM_TYPE_LABELS[type] : null };
          })
        : null;
      return {
        ms: toMs(m.CreatedAt),
        game: m.Game || null,
        finals: isFinals(m.Game),
        title: m.Title || null,
        body: m.Body || null,
        buttonLabel: m.ButtonLabel || null,
        messageName: m.MessageName || null,
        kind: Object.hasOwn(INBOX_KINDS, m.MessageName) ? INBOX_KINDS[m.MessageName] : m.Title ? 'text' : 'other',
        rsChange: Number.isFinite(rs) ? rs : null,
        reason: typeof pl.reason === 'string' ? pl.reason : null,
        gifts,
        adjustment: null, // the ranked revert a weekly rank update reports, joined in buildModel
        rewards: [...new Set(rewards)],
        season: pl.season ?? null,
        sourceType: pl.sourceType ?? null,
        seen: m.Seen !== false,
        favorited: m.Favorited === true,
      };
    })
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0));
  const notices = (P.InboxGlobalMessage || [])
    .map((m) => ({ ms: toMs(m.PublishedAt ?? m.CreatedAt), expiresMs: toMs(m.ExpiredAt), game: m.Game || null, finals: isFinals(m.Game), messageName: m.MessageName || null, seen: m.Seen !== false, deleted: m.Deleted === true }))
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0));
  const inbox = { has: messages.length > 0 || notices.length > 0, messages, notices };
  const moderation = buildModeration(raw.audit?.byType?.ModerationDecisionPII, chat);
  return {
    inbox,
    moderation,
    hasAny: chat.length > 0 || !!pdf || !!preParsed || inbox.has,
    chat,
    pdf,
    preParsed,
    anchorFallbackMs: toMs(raw.readme?.requestedAtMs ?? null),
  };
}

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
  const byReason = Object.create(null); // report reasons are raw export data
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
//
// Since 2026-09 the blobs are plain snake_cased objects with no sender, headers or
// SES tags, so those emails can no longer be told apart by category.
const sesJson = (s) => {
  if (s && typeof s === 'object' && !Array.isArray(s)) {
    return { ...s, messageId: s.messageId ?? s.message_id, userAgent: s.userAgent ?? s.user_agent, ipAddress: s.ipAddress ?? s.ip_address };
  }
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
const categorizeEmail = (topic, caller, sender) => {
  if (!topic && !caller && !sender) return 'other'; // a trimmed 2026-09+ blob: nothing to tell by
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
    const subj = m.commonHeaders?.subject || (Array.isArray(m.headers) ? m.headers.find((h) => h.name === 'Subject')?.value : null) || m.subject || null;
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
        category: categorizeEmail(e.topic, e.caller, e.sender),
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
// --- World Tour record ---------------------------------------------------------
// S3 and S4-S8 scored World Tour tournaments only, S9+ every mode (all stored on today's
// point scale). S3's points ladder stopped at Gold 1; its Emerald came from tournament wins in
// the Finals stage (`IsWorldTourFinals`), which S3's FinalsWon equals exactly (3.10.0: Emerald 4
// at 3 wins, Emerald 1 at 63). FinalsWon counts different things by era, so each season records
// which log count, if any, reproduces it.
const WT_SYSTEM = (n) => (n == null || n < 3 ? null : n === 3 ? 's3' : n <= 8 ? 'tournaments' : 'allModes');
// `TotalWorldTourEvents` = Season 3 events + Season 4 to 8 stops with a World Tour tournament
// + Season 9+ stops with `sponsor_journey` fans (any mode), exact on every export that has it.
function buildWorldTour(summaries, keys, matches, journey, seasonAt) {
  const seasons = new Map();
  const s3Unlabelled = new Set();
  let totalEvents = null;
  let streak = null;
  let hasSummary = false;
  const seasonEntry = (seasonId, n, create = true) => {
    const key = n != null ? `n:${n}` : seasonId;
    let e = seasons.get(key);
    if (!e && create) {
      seasons.set(key, (e = {
        seasonId, n, label: n != null ? `Season ${n}` : 'Unknown season', badgeScore: null, finalsWon: null, rounds: 0, tournaments: 0, tournamentsWon: 0,
        finalsStageRounds: 0,
        logCounts: { finalsStageWins: 0, tournamentsWon: 0, roundsWon: 0 }, // World Tour + Ranked
        stops: new Map(),
        unlabelled: { tournaments: 0, rounds: 0 },
      }));
    }
    return e;
  };
  const stopEntry = (e, stop, event, key) => {
    let s = e.stops.get(key);
    if (!s) {
      const meta = worldTourStop(e.n, stop ?? event);
      e.stops.set(key, (s = {
        stop, event, stopName: meta?.name ?? null, sponsors: meta?.sponsors ?? [], startMs: meta?.startMs ?? null, endMs: meta?.endMs ?? null,
        weeks: new Map(), tournaments: 0, tournamentsWon: 0, rounds: 0, fans: null,
      }));
    }
    return s;
  };
  for (const s of summaries) {
    const wt = s.Data?.worldTour;
    if (!wt || typeof wt !== 'object') continue;
    hasSummary = true;
    if (typeof wt.TotalWorldTourEvents === 'number') totalEvents = Math.max(totalEvents ?? 0, wt.TotalWorldTourEvents);
    const stats = wt.SeasonalStats && typeof wt.SeasonalStats === 'object' ? wt.SeasonalStats : {};
    for (const id in stats) {
      const v = stats[id];
      if (!v || typeof v !== 'object') continue;
      const e = seasonEntry(String(id), seasonAt(id, null));
      if (typeof v.BadgeScore === 'number') e.badgeScore = Math.max(e.badgeScore ?? 0, v.BadgeScore);
      if (typeof v.FinalsWon === 'number') e.finalsWon = Math.max(e.finalsWon ?? 0, v.FinalsWon);
    }
    const streaks = s.Data?.total?.WinStreakPerMatchmakingScenario;
    if (streaks && typeof streaks === 'object') {
      for (const id in streaks) {
        const v = streaks[id];
        if (!v || typeof v !== 'object' || classifyMode({ ScenarioID: id }, keys).category !== 'World Tour') continue;
        const ms = toMs(v.LastWin);
        if (!streak || (ms ?? 0) > (streak.lastWinMs ?? 0)) streak = { streak: typeof v.Streak === 'number' ? v.Streak : 0, lastWinMs: ms };
      }
    }
  }
  // World Tour first (it creates a season's row), then Ranked, which only adds counts.
  for (const category of ['World Tour', 'Ranked']) {
    for (const m of matches) {
      if (m.mode?.category !== category) continue;
      const r0 = m.rounds[0];
      const n = (category === 'World Tour' ? m.wtEvent?.season : null) ?? seasonAt(r0?.seasonId, m.start);
      if (n != null && n < 3) continue; // World Tour began in Season 3
      const e = seasonEntry(r0?.seasonId ?? null, n, category === 'World Tour');
      if (!e) continue;
      if (category === 'World Tour') {
        e.rounds += m.rounds.length;
        e.tournaments++;
        if (m.tournamentWon) e.tournamentsWon++;
        e.finalsStageRounds += m.rounds.filter((r) => r.finalsStage).length;
        if (m.rounds.some((r) => r.tournamentWon && r.finalsStage)) e.logCounts.finalsStageWins++;
        const ev = m.wtEvent;
        if (ev) {
          const s = stopEntry(e, ev.stop, ev.event, ev.event != null ? `e${ev.event}` : `s${ev.stop}`);
          let w = null;
          if (ev.weeks.length) {
            const wk = ev.weeks.join('-');
            w = s.weeks.get(wk);
            if (!w) s.weeks.set(wk, (w = { weeks: ev.weeks, weekName: ev.weekName, weekNameSource: ev.weekNameSource, tournaments: 0, tournamentsWon: 0, rounds: 0 }));
          }
          for (const x of w ? [s, w] : [s]) {
            x.tournaments++;
            if (m.tournamentWon) x.tournamentsWon++;
            x.rounds += m.rounds.length;
          }
        } else {
          e.unlabelled.tournaments++;
          e.unlabelled.rounds += m.rounds.length;
          if (n === 3) s3Unlabelled.add(String(r0?.scenarioId));
        }
      }
      if (m.tournamentWon) e.logCounts.tournamentsWon++;
      e.logCounts.roundsWon += m.rounds.filter((r) => r.roundWon).length;
    }
  }
  // Season 9 on: fans earned during each stop, any mode.
  const fansBySeason = journey?.gainedFans && typeof journey.gainedFans === 'object' ? journey.gainedFans : {};
  for (const sid in fansBySeason) {
    const n = seasonAt(sid, null);
    const stops = fansBySeason[sid];
    if (n == null || n < 9 || !stops || typeof stops !== 'object') continue;
    for (const stopId in stops) {
      const fans = Number(stops[stopId]) || 0;
      if (fans <= 0) continue;
      const stop = Object.hasOwn(WT_STOP_IDS, stopId) ? WT_STOP_IDS[stopId] : null;
      const s = stopEntry(seasonEntry(String(sid), n), stop, null, stop != null ? `s${stop}` : `x${stopId}`);
      s.fans = (s.fans ?? 0) + fans;
    }
  }
  if (!hasSummary && !seasons.size) return null;

  const bySeason = [];
  for (const e of seasons.values()) {
    e.system = WT_SYSTEM(e.n);
    e.stops = [...e.stops.values()]
      .map((s) => ({ ...s, weeks: [...s.weeks.values()].sort((a, b) => (a.weeks[0] ?? 99) - (b.weeks[0] ?? 99)) }))
      .sort((a, b) => (a.event ?? a.stop ?? 99) - (b.event ?? b.stop ?? 99));
    if (e.n != null && e.n >= 3) {
      const count = e.n >= 9 ? e.stops.filter((s) => s.fans > 0).length : e.n === 3 ? e.stops.length + s3Unlabelled.size : e.stops.length;
      if (count > 0) bySeason.push({ n: e.n, count, source: e.n >= 9 ? 'fans' : 'log' });
    }
    const fw = e.finalsWon;
    const c = e.logCounts;
    if (e.n === 3) {
      // Emerald 3 and 2 were never published, so between 3 and 62 wins the level is unknown.
      const wins = fw ?? c.finalsStageWins;
      e.badge = wins >= 63 ? { ...worldTourTier('Emerald', 1), basis: 'finalsWins' }
        : wins >= 3 ? { ...worldTourTier('Emerald'), basis: 'finalsWins' }
        : e.finalsStageRounds > 0 ? { ...worldTourTier('Gold', 1), basis: 'finalsStage' }
        : null;
    } else {
      const b = e.n != null && e.n >= 4 ? worldTourBadge(e.badgeScore) : null;
      e.badge = b ? { ...b, basis: 'points' } : null;
    }
    e.finalsWonMatch = !(fw > 0) ? null
      : e.n === 3 && c.finalsStageWins === fw ? 'finalsStageWins'
      : c.tournamentsWon === fw ? 'tournamentsWon'
      : c.roundsWon === fw ? 'roundsWon'
      : null;
  }
  bySeason.sort((a, b) => a.n - b.n);
  const fromLog = bySeason.filter((b) => b.source === 'log').reduce((a, b) => a + b.count, 0);
  const fromFans = bySeason.filter((b) => b.source === 'fans').reduce((a, b) => a + b.count, 0);
  return {
    has: true,
    hasSummary,
    totalEvents,
    events: { counted: fromLog + fromFans, fromLog, fromFans, bySeason },
    streak,
    seasons: [...seasons.values()].sort((a, b) => (b.n ?? -1) - (a.n ?? -1)),
  };
}

// `player_career` (Seasons 4 to 8) and `sponsor_journey` (9 on) repeat per preview build and per
// account in one export, and the live main copy holds the most fans.
const fanSum = (o) => Object.values(o && typeof o === 'object' ? o : {}).reduce((a, f) => a + (Number(f) || 0), 0);
function readSponsorRecords(byType) {
  const best = {};
  for (const row of byType.BucketObject || []) {
    const key = row?.ObjectKey;
    if (key !== 'player_career' && key !== 'sponsor_journey') continue;
    let v = row.Value;
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v);
      } catch {
        continue;
      }
    }
    if (!v || typeof v !== 'object') continue;
    const fans = key === 'player_career'
      ? (Array.isArray(v.seasonalRecords) ? v.seasonalRecords : []).reduce((a, r) => a + (Number(r?.totalFans) || 0), 0)
      : Object.values(v.sponsorProgress && typeof v.sponsorProgress === 'object' ? v.sponsorProgress : {}).reduce((a, p) => a + fanSum(p?.fansPerSeason), 0);
    if (!best[key] || fans > best[key].fans) best[key] = { value: v, fans };
  }
  return { career: best.player_career?.value ?? null, journey: best.sponsor_journey?.value ?? null };
}

function buildSponsors({ career, journey }, keys) {
  if (!career && !journey) return null;
  const seasonN = (id) => keys.season(id)?.n ?? null;
  const isSponsor = (id) => id != null && String(id) !== '0';
  const named = (id) => ({ id: String(id), name: sponsorName(id) });
  const tracks = new Map();
  const track = (id) => {
    let t = tracks.get(id);
    if (!t) tracks.set(id, (t = { ...named(id), level: null, nextLevelProgress: null, fans: 0, seasons: [], signed: false }));
    return t;
  };
  const progress = journey?.sponsorProgress && typeof journey.sponsorProgress === 'object' ? journey.sponsorProgress : {};
  for (const id in progress) {
    const p = progress[id];
    if (!isSponsor(id) || !p || typeof p !== 'object') continue;
    const t = track(String(id));
    t.level = Number.isFinite(p.sponsorLevel) ? p.sponsorLevel : null;
    t.nextLevelProgress = Number.isFinite(p.nextLevelProgress) ? p.nextLevelProgress : null;
    const per = p.fansPerSeason && typeof p.fansPerSeason === 'object' ? p.fansPerSeason : {};
    for (const sid in per) {
      const fans = Number(per[sid]) || 0;
      if (fans <= 0) continue;
      t.seasons.push({ n: seasonN(sid), seasonId: String(sid), fans });
      t.fans += fans;
    }
  }

  const seasons = new Map();
  for (const r of Array.isArray(career?.seasonalRecords) ? career.seasonalRecords : []) {
    const n = seasonN(r?.seasonId);
    if (n == null) continue;
    const selected = isSponsor(r.selectedSponsor) ? named(r.selectedSponsor) : null;
    const fans = Number(r.totalFans) || 0;
    const level = Number.isFinite(r.sponsorLevel) ? r.sponsorLevel : null;
    seasons.set(n, { n, seasonId: String(r.seasonId), era: 'career', selected, level, fans, bySponsor: selected ? [{ ...selected, fans }] : [], stopCount: null });
    // An export from before Season 9 has no journey record, so its tracks come from here.
    if (!journey && selected) {
      const t = track(selected.id);
      t.fans += fans;
      t.seasons.push({ n, seasonId: String(r.seasonId), fans });
      if (level != null) t.level = Math.max(t.level ?? 0, level);
    }
  }
  const fromCareer = new Set(seasons.keys());
  for (const t of tracks.values()) {
    t.seasons.sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
    for (const s of t.seasons) {
      if (s.n == null || fromCareer.has(s.n)) continue;
      let e = seasons.get(s.n);
      if (!e) seasons.set(s.n, (e = { n: s.n, seasonId: s.seasonId, era: s.n >= 9 ? 'journey' : 'career', selected: null, level: null, fans: 0, bySponsor: [], stopCount: s.n >= 9 ? 0 : null }));
      e.fans += s.fans;
      e.bySponsor.push({ id: t.id, name: t.name, fans: s.fans });
    }
  }
  const gained = journey?.gainedFans && typeof journey.gainedFans === 'object' ? journey.gainedFans : {};
  for (const sid in gained) {
    const e = seasons.get(seasonN(sid));
    if (e?.era === 'journey') e.stopCount = Object.values(gained[sid] || {}).filter((f) => Number(f) > 0).length;
  }
  for (const e of seasons.values()) e.bySponsor.sort((a, b) => b.fans - a.fans);
  const signed = isSponsor(journey?.signedSponsor) ? named(journey.signedSponsor) : null;
  if (signed && tracks.has(signed.id)) tracks.get(signed.id).signed = true;
  // Some exports hold tracks at level 0 with no fans at all.
  const shown = [...tracks.values()].filter((t) => t.signed || t.fans > 0 || t.level > 0);
  const list = [...seasons.values()].sort((a, b) => b.n - a.n);
  return {
    has: shown.length > 0 || list.length > 0,
    signed,
    totalFans: list.reduce((a, e) => a + e.fans, 0),
    sponsors: shown.sort((a, b) => b.fans - a.fans),
    seasons: list,
  };
}

// --- Quickplay badge, Seasons 6 to 8 (2026-09+ `RoundStatSummary.Data.scores`) -------
// A separate ladder that never fed World Tour. The wiki's per-result points do not
// rebuild the stored scores from the log, so only the score and its tier are shown.
function buildQuickplay(summaries, keys) {
  const bySeason = new Map();
  for (const s of summaries) {
    const qp = s.Data?.scores?.QuickPlayScore;
    if (!qp || typeof qp !== 'object') continue;
    for (const id in qp) {
      const v = qp[id];
      if (typeof v === 'number' && Number.isFinite(v) && !(bySeason.get(id) >= v)) bySeason.set(id, v);
    }
  }
  if (!bySeason.size) return null;
  const seasons = [...bySeason.entries()]
    .map(([seasonId, score]) => {
      const n = keys.season(seasonId)?.n ?? null;
      return { seasonId, n, label: n != null ? `Season ${n}` : 'Unknown season', score, badge: quickplayBadge(score) };
    })
    .sort((a, b) => (b.n ?? -1) - (a.n ?? -1));
  return { has: true, seasons };
}

// A weekly rank-update message reports one ranked revert: the amounts are equal and the
// message follows within a week (4 of 4 on the export checked). Sums are not attempted.
const RANK_NOTICE_WINDOW_MS = 7 * 86_400_000;
function linkRankNotices(adjustments, inbox) {
  if (!adjustments?.rows.length || !inbox?.messages.length) return;
  const free = adjustments.rows.filter((r) => r.type === 'REVERT');
  for (const m of [...inbox.messages].sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0))) {
    if (m.kind !== 'rankUpdate' || m.reason !== 'DISCOVERY_RANK_UPDATE_REASON_WEEKLY_SUMMARY' || m.rsChange == null || m.ms == null) continue;
    const i = free.findIndex((r) => r.rs === m.rsChange && m.ms > r.adjustedMs && m.ms - r.adjustedMs <= RANK_NOTICE_WINDOW_MS);
    if (i < 0) continue;
    const [r] = free.splice(i, 1);
    r.notifiedMs = m.ms;
    m.adjustment = { adjustedMs: r.adjustedMs, rs: r.rs, key: r.key };
  }
}

export function buildModel(raw) {
  const byType = raw.persistence.byType;
  const keys = createKeys(raw.keys?.byType);

  const preview = previewRounds(raw.audit?.byType);
  const { matches, weapons, weaponsByArchetype, damage, roundCount, rounds, otherGameRounds, unknownRounds } = buildMatchesAndWeapons(byType, keys, preview);
  // Everything but the match list counts only these.
  const countedRounds = rounds.filter((r) => !r.uncounted);
  const countedMatches = matches.filter((m) => !m.uncounted);
  const summaries = liveSummaries(byType.RoundStatSummary || [], rounds);
  const sponsorRecords = readSponsorRecords(byType);
  const mastery = buildMastery(byType, keys, weapons);
  const lastActivity = matches.reduce((mx, m) => Math.max(mx, m.end ?? m.start ?? 0), 0) || null;

  // Joined here, not at render: the match list runs to thousands of rows.
  // Tournaments played before the log existed stay unstamped.
  const ratings = buildRatings(byType, keys);
  if (ratings.rankedTournaments.size > 0) {
    for (const m of matches) {
      if (!m.isTournament || !m.tournamentId) continue;
      const ru = ratings.rankedTournaments.get(m.tournamentId);
      if (ru) m.rankUpdate = ru;
    }
  }

  // True tournament counts = DISTINCT tournaments (grouped by TournamentID), not
  // the RoundStatSummary's `TournamentsPlayed`, which actually counts tournament
  // *rounds* (verified on redacted: summary 5216 ≈ 5261 tournament rounds, but only
  // 2665 distinct tournaments). Wins match either way (one TournamentWon round
  // per won tournament). So derive both from the grouped matches.
  let tournamentsPlayed = 0;
  let tournamentsWon = 0;
  for (const m of countedMatches) {
    if (m.isTournament) tournamentsPlayed++;
    if (m.tournamentWon) tournamentsWon++;
  }
  const support = buildSupport(raw, keys);
  linkRankNotices(ratings.adjustments, support.inbox);

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
    ban: buildBans(byType, raw.audit?.byType),
    sanctions: buildSanctions(byType, rounds),
    linkedAccounts: buildLinkedAccounts(byType),
    nameHistory: buildNameHistory(raw, accounts),
    inventory: buildInventory(byType, keys),
    social: buildSocial(byType),
    career: buildCareer(byType, keys, summaries.live, rounds.filter((r) => r.uncounted === 'practice')),
    ratings,
    matches,
    rounds, // chronological normalized rounds, preview and practice ones included (`uncounted`)
    modeBreakdown: buildModeBreakdown(matches),
    careerModes: buildCareerModes(countedMatches),
    breakdowns: buildBreakdowns(countedRounds),
    loadouts: buildLoadouts(countedRounds),
    scorecards: buildScorecards(countedRounds),
    records: buildRecords(countedRounds, countedMatches),
    weapons,
    weaponsByArchetype,
    damage,
    mastery,
    worldTour: buildWorldTour(summaries.live, keys, countedMatches, sponsorRecords.journey, seasonResolver(keys)),
    quickplay: buildQuickplay(summaries.live, keys),
    sponsors: buildSponsors(sponsorRecords, keys),
    economy: buildEconomy(byType, raw.audit?.byType, keys),
    antiCheat: buildAntiCheat(raw),
    reports: buildReports(raw),
    support,
    emailTracking: buildEmailTracking(raw.audit?.byType),
    seasons: withKeySeasons(keys.seasons()), // for the time-axis markers
    meta: {
      roundCount,
      matchCount: matches.length,
      // ARC Raiders rows, and rows of unrecognised shape. Excluded from every figure above.
      otherGameRounds,
      unknownRounds,
      // In match history only: rounds played on a preview build or the practice range, and
      // the preview builds' own summaries (left out of Career totals).
      uncounted: {
        previewRounds: rounds.filter((r) => r.uncounted === 'preview').length,
        practiceRounds: rounds.filter((r) => r.uncounted === 'practice').length,
        previewSummaries: summaries.preview,
      },
      tournamentsPlayed,
      tournamentsWon,
      counts: raw.persistence.counts,
      // 2026-09+ export: carries data the older one lacked (item names, loadouts, per-weapon damage).
      exportV2: !!raw.persistence.gamePrefixed,
      lastActivity,
      snapshot,
      hasAudit: !!raw.audit,
      hasEos: raw.eos.anticheat.length > 0,
      hasAnybrain: (raw.anybrain.os?.length || raw.anybrain.sessions?.length || 0) > 0,
      hasDenuvo: raw.denuvo.length > 0,
    },
  };
}
