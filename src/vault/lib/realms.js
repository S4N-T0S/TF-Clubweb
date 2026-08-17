// Separates LIVE-game records from records made on a server that isn't the live game.
// The SAR export mixes them with no per-record marker, which corrupts every economy
// total (worst measured: Multibucks inflow 290% too high, peak balance 16x too high).
//
// What leaks in:
//   1. Season preview playtests — a build run in the days before a season ships. It
//      seeds a throwaway wallet (10,000 or 50,000 on the accounts seen) and stubs the
//      store, and writes it all to the same HardCurrencyLog / TransactionLog as live.
//   2. ARC Raiders — one Embark account covers both titles, so its playtest rows
//      (tenancy `pioneer-*`) land in a THE FINALS export too. It also writes its
//      per-raid stats under the same `RoundStat` type; see `classifyRoundStat`.
//
// Two independent signals, both needed:
//   A. `tenancy` on AUDIT records. Embark's own realm label — exact, but the audit
//      file is sometimes truncated to a few KB and then lists nothing. High precision,
//      low recall; never sufficient alone.
//   B. Balance-chain arithmetic on HardCurrencyLog. Each row's balance minus its
//      signed quantity must equal the previous row's balance. A playtest wallet breaks
//      that chain, runs its own, then the live chain resumes at EXACTLY the balance it
//      was parked at. That reconnection is the proof it was a different wallet rather
//      than missing data. Complete for currency rows, but carries no realm name.
//
// Currency rows are off-live if EITHER signal says so, and (A) also names them — but
// only (A)'s THE FINALS preview windows may classify (see `classifying`). Both are
// needed: (A) is missing from truncated exports, (B) misses a wallet seeded at zero.
// Transaction rows have no chain, so they use the union of (A) windows and (B) spans.
//
// The cardinal rule: never remove a row without proof. A tenancy label from Embark's own
// audit is proof; so is a chain that reconnects, since that shows where the live balance
// returns to. Anything unproven stays counted and is reported (`gaps`, `anomalies`).

// --- tenancy -------------------------------------------------------------
export const REALM = {
  LIVE: 'live',
  PLAYTEST: 'playtest',   // THE FINALS season preview build
  OTHER_GAME: 'othergame', // ARC Raiders (shares the Embark account)
  OTHER: 'other',          // a non-live tenancy we don't have a name for
};

// `pioneer` is Embark's codename for ARC Raiders, `discovery` for THE FINALS.
export function classifyTenancy(tenancy) {
  if (!tenancy || tenancy === 'discovery-live') return REALM.LIVE;
  if (tenancy.startsWith('pioneer')) return REALM.OTHER_GAME;
  if (tenancy.startsWith('discovery')) return REALM.PLAYTEST;
  return REALM.OTHER;
}

// e.g. `discovery-s9-preview-event` -> "S9 preview playtest"
export function tenancyLabel(tenancy) {
  if (!tenancy) return 'Unknown server';
  if (tenancy === 'discovery-live') return 'Live game';
  const season = tenancy.match(/discovery-s(\d+)-/i);
  if (season) return `S${season[1]} preview playtest`;
  if (tenancy === 'pioneer-live') return 'ARC Raiders';
  if (tenancy === 'pioneer-tt2') return 'ARC Raiders Tech Test 2';
  if (tenancy === 'pioneer-serverslam') return 'ARC Raiders Server Slam';
  if (tenancy.startsWith('pioneer')) return 'ARC Raiders playtest';
  return tenancy;
}

// --- RoundStat: THE FINALS round vs ARC Raiders stat event ----------------
// A leak that has nothing to do with tenancy. Both titles write
// `{"RoundStat": {...}}` into the same export, with unrelated payloads:
//
//   THE FINALS   {"RoundStat":{"CreatedAt":…,"Data":{Kills,RoundWon,ScenarioID,…}}}
//   ARC Raiders  {"RoundStat":{"EventID":100,"TargetID":995408715,"Amount":5,"CreatedAt":…}}
//
// ARC's rows are per-raid stat counters (median 19 per raid, 25 EventID kinds
// over 112 TargetIDs), not matches. Carrying no `Data`, they read as `RoundWon`
// undefined (a loss) with no `TournamentID` (a standalone match), so one heavy
// ARC player's 354 raids surfaced as 7,390 phantom losses.
//
// Both kinds are matched positively. "Not ARC-shaped" would let a future ARC
// schema that grows a `Data` field become match history again; "no Data" would
// mis-file a truncated FINALS row. Matching neither is UNKNOWN: kept, never
// counted, in line with this module's rule that nothing is dropped without
// proof of what it is.
export const ROUND_KIND = {
  FINALS: 'finals',
  ARC: 'arc',
  UNKNOWN: 'unknown',
};

// Names specific to THE FINALS' vocabulary. Excludes the generic fields a round
// payload also carries (`StartTime`, `EndTime`, `Tier`, `MatchID`,
// `TournamentID`, `IsBackfill`): any Embark title could reuse those, and a
// single collision would be enough to re-open the bug.
const FINALS_ROUND_FIELDS = [
  'ScenarioID', 'MapVariant', 'EnvironmentalCondition', 'CharacterArchetype',
  'KillsPerItem', 'RoundWon', 'TournamentWon', 'LeaderboardPosition',
];
// All 57,385 round payloads across the seven sample exports carry all eight
// names, so requiring two rejects no real round and needs two collisions to fool.
const FINALS_ROUND_MIN_FIELDS = 2;

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Which game wrote a `RoundStat` record. Total over any JSON value; own properties only. */
export function classifyRoundStat(rec) {
  if (!isPlainObject(rec)) return ROUND_KIND.UNKNOWN;
  if (isPlainObject(rec.Data)) {
    let hits = 0;
    for (const f of FINALS_ROUND_FIELDS) {
      if (Object.hasOwn(rec.Data, f) && ++hits === FINALS_ROUND_MIN_FIELDS) return ROUND_KIND.FINALS;
    }
  }
  // ARC's counter triple. Strict on all three fields and on the absent payload;
  // a half-match falls through to UNKNOWN, which is preserved but never read.
  if (
    rec.Data === undefined &&
    typeof rec.EventID === 'number' &&
    typeof rec.TargetID === 'number' &&
    typeof rec.Amount === 'number'
  ) return ROUND_KIND.ARC;
  return ROUND_KIND.UNKNOWN;
}

// --- (A) audit tenancy windows -------------------------------------------
// Audit records carrying `tenancy` + `logtime` (login details, name audits, per-round
// ids) are sparse heartbeats, so consecutive same-tenancy ones merge into a window.
//
// Measured on the sample exports: largest gap inside a genuine window 6.1h, widest
// genuine window 13.4h. The span cap matters because merging is transitive — without
// it, daily ARC Raiders play chains into one multi-day window.
const WINDOW_GAP_MS = 8 * 3600e3;
const MAX_WINDOW_SPAN_MS = 24 * 3600e3;
// Zero padding, deliberately. A window is only as wide as its evidence: padding a
// two-event, 27-second ARC heartbeat by half an hour removed nine live THE FINALS rows
// from a real export. Unpadded classifies exactly the same true positives.
const WINDOW_PAD_MS = 0;

export function tenancyWindows(auditByType) {
  if (!auditByType) return [];
  const evs = [];
  for (const rows of Object.values(auditByType)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (!r || typeof r.tenancy !== 'string' || !r.logtime) continue;
      const realm = classifyTenancy(r.tenancy);
      if (realm === REALM.LIVE) continue;
      // `logtime` is ISO on every export seen, but the SAR mixes ISO and epoch-ms
      // elsewhere; accept both rather than silently producing no windows.
      const ms = typeof r.logtime === 'number' ? r.logtime : Date.parse(r.logtime);
      if (!Number.isFinite(ms)) continue;
      evs.push({ tenancy: r.tenancy, realm, ms });
    }
  }
  evs.sort((a, b) => a.ms - b.ms);

  const out = [];
  let cur = null;
  for (const e of evs) {
    if (
      cur && e.tenancy === cur.tenancy &&
      e.ms - cur.endMs < WINDOW_GAP_MS &&
      e.ms - cur.startMs <= MAX_WINDOW_SPAN_MS
    ) {
      cur.endMs = e.ms;
      cur.events++;
    } else {
      if (cur) out.push(cur);
      // A span-cap split restarts here, leaving the preceding stretch uncovered. That
      // stretch has no heartbeat, and unevidenced time must default to live.
      cur = { tenancy: e.tenancy, realm: e.realm, startMs: e.ms, endMs: e.ms, events: 1, source: 'tenancy' };
    }
  }
  if (cur) out.push(cur);
  return out;
}

// --- (B) balance-chain arithmetic ----------------------------------------
// Lookahead for the reconnection. Real accounts already reach 47.4h between a preview
// and the next live row, so this needs room.
const MAX_SESSION_MS = 7 * 24 * 3600e3;

// A reconnection is one arithmetic equation, and +75 reward drops are everywhere, so
// it will occasionally alias: an unlogged movement of +G "reconnects" as soon as later
// live activity nets to -G, which would delete real rows. Two further conditions,
// both far outside anything real, make that alias implausible:
//   - a session is one sitting (longest real: 2.3h), not days of activity;
//   - it opens on a seeded wallet, so the jump from the parked balance is large
//     (smallest real: 9,025; injected aliases sit in the low hundreds).
const MAX_SESSION_SPAN_MS = 24 * 3600e3;
const MIN_OPENING_JUMP = 5000;

// Failing those guards is not free — it trades "deleted real data" for "inflated
// totals". The jump test specifically weakens as the live balance nears the seed
// (a player holding ~5,000 when a 10,000 wallet is seeded drops below it). What
// rescues it: the leftover gap grows by as much as the jump shrinks, because the gap
// magnitude tracks the parked balance. So an oversized gap is the tell for a session
// we missed, and gets reported. Largest real unlogged movement is 725.
const UNATTRIBUTED_GAP = 2000;

const ledgerSign = (r) => (r.logType === 'spent' ? -1 : 1);
const signedQty = (r) => ledgerSign(r) * (r.quantity || 0);
const chains = (prevBalance, r) => r.balance != null && prevBalance + signedQty(r) === r.balance;

// Unexplained breaks. When a break later returns to the balance it left, the wallet stays
// PARKED there and the return isn't counted again — one excursion is one gap. Walking
// naively reports a gap per row instead (78 for one wallet on a real export).
function walkGaps(rows) {
  const out = [];
  let live = null;
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r.balance == null) { i++; continue; }
    if (live === null || chains(live, r)) { live = r.balance; i++; continue; }
    let j = -1;
    for (let k = i + 1; k < rows.length; k++) {
      if (rows[k].ms != null && r.ms != null && rows[k].ms - r.ms > MAX_SESSION_MS) break;
      if (chains(live, rows[k])) { j = k; break; }
    }
    out.push({ ms: r.ms, unexplained: r.balance - (live + signedQty(r)) });
    if (j >= 0) { i = j; } else { live = r.balance; i++; }
  }
  return out;
}

// `rows` must be in true chronological order with same-timestamp ties resolved
// (model.js `orderLedger`). Returns realms[i] for each row. A break that never
// reconnects is a GAP — an unlogged movement, not another realm — and stays LIVE.
// (All four sample accounts carry a stray +125 in March 2024 with no matching row.)
export function detectAltSessions(rows) {
  const realms = new Array(rows.length).fill(REALM.LIVE);
  const sessions = [];
  const gaps = [];
  let live = null;
  let i = 0;

  while (i < rows.length) {
    const r = rows[i];
    if (r.balance == null) { i++; continue; }
    if (live === null || chains(live, r)) { live = r.balance; i++; continue; }

    // Chain broke. Find the earliest later row that reconnects to the parked balance;
    // everything between is a separate wallet.
    let j = -1;
    for (let k = i + 1; k < rows.length; k++) {
      if (rows[k].ms != null && r.ms != null && rows[k].ms - r.ms > MAX_SESSION_MS) break;
      if (chains(live, rows[k])) { j = k; break; }
    }

    // An undated row carries no time evidence, so the span test must FAIL, not pass.
    const span = j < 0 || rows[j - 1].ms == null || rows[i].ms == null
      ? Infinity
      : rows[j - 1].ms - rows[i].ms;
    const looksLikeSession =
      j >= 0 &&
      span <= MAX_SESSION_SPAN_MS &&
      Math.abs(rows[i].balance - live) >= MIN_OPENING_JUMP;

    if (looksLikeSession) {
      for (let k = i; k < j; k++) realms[k] = REALM.PLAYTEST;
      sessions.push({
        startMs: rows[i].ms,
        endMs: rows[j - 1].ms,
        rows: j - i,
        firstIndex: i,
        lastIndex: j - 1,
        parkedBalance: live,
        openingBalance: rows[i].balance,
        // Includes the balance BEFORE the first logged row: a session opening on a
        // spend (S7 opens `spent 950 -> 49,050`) was already at 50,000, and reporting
        // 49,050 is contradicted by the row shown right below it.
        peakBalance: Math.max(
          rows[i].balance - signedQty(rows[i]),
          ...rows.slice(i, j).map((x) => x.balance ?? 0)
        ),
        source: 'chain',
      });
      live = rows[j].balance;
      i = j + 1;
      continue;
    }

    gaps.push({ ms: r.ms, unexplained: r.balance - (live + signedQty(r)) });
    if (j >= 0) {
      // The chain does return to the parked balance at `j`; we just won't call the
      // rows between a realm. Keep `live` parked — advancing it would make `j` read as
      // a second break and report one event as two gaps.
      i = j;
    } else {
      live = r.balance;
      i++;
    }
  }
  return { sessions, realms, gaps };
}

// --- implausibility flag (ADVISORY ONLY) ----------------------------------
// The only signal left when a playtest neither reconnects nor appears in the audit
// file — i.e. the export was requested during a preview weekend, so the preview is the
// newest thing in it. The leftover gap then equals the parked balance (75-975 on the
// samples), too small for UNATTRIBUTED_GAP, so nothing else catches it.
//
// Never removes a row (removal needs a reconnection to be sound); it only labels the
// totals as an upper bound. That is why the bounds can sit close to real values.

// Any non-`bought` movement. Largest real live inflow is 1,150 and largest real live
// spend 3,000, so ~7x headroom, and it still catches the 10,000 seed.
export const IMPLAUSIBLE_GRANT = 8000;
// Far backstop for a wallet inflated by many small grants. Largest real live balance
// is 4,125; kept high because accumulation is what a legitimate big spender does.
export const IMPLAUSIBLE_BALANCE = 100000;

// A `bought` row is backed by a real charge, so it is checked against what the store
// actually sells rather than a size ceiling — which cannot work here, because the
// ranges overlap: the largest real pack (13,000) is BIGGER than the commonest playtest
// seed (10,000), and 10,000 is not a purchasable amount at all.
//
// The five real-money Multibucks packs, unchanged since launch. Add a tier here if
// Embark ships one; being stale costs one advisory line, never a removed row.
export const MULTIBUCKS_PACKS = new Set([500, 1150, 2400, 6250, 13000]);
// DLC bundles also grant Multibucks in non-tier amounts (1,000 / 1,500 / 2,150 appear
// in the samples) but never above this.
export const MAX_DLC_GRANT = 2400;

// No allowance for several packs in one cart: no export shows Embark clumping
// purchases (each granted purchase writes its own row at its own timestamp), and a
// clumped total would only cost an advisory line.
const boughtIsImplausible = (q) => q > MAX_DLC_GRANT && !MULTIBUCKS_PACKS.has(q);

export const isImplausible = (r) => {
  const q = r.quantity || 0;
  const badGrant = r.logType === 'bought' ? boughtIsImplausible(q) : q >= IMPLAUSIBLE_GRANT;
  return badGrant || (r.balance || 0) >= IMPLAUSIBLE_BALANCE;
};

// --- combine --------------------------------------------------------------
const inWindow = (ms, w) => ms != null && ms >= w.startMs - WINDOW_PAD_MS && ms <= w.endMs + WINDOW_PAD_MS;

// Classify the whole export. `orderedLedger` is the chronologically ordered
// HardCurrencyLog; `auditByType` is raw.audit?.byType (may be absent).
export function buildRealms(orderedLedger, auditByType) {
  const rows = Array.isArray(orderedLedger) ? orderedLedger : [];
  const windows = tenancyWindows(auditByType);
  const { sessions, realms } = detectAltSessions(rows);

  // A row inside a preview window is off-live regardless of the arithmetic: a seeded
  // wallet needn't open with a jump. One account was seeded at ZERO and stepped up to
  // 538,925, so MIN_OPENING_JUMP never fired on any of its 275 rows.
  //
  // ONLY preview windows. ARC Raiders cannot write Multibucks, and a daily ARC player has
  // hours of `pioneer-live` coverage every evening, so honouring it deletes real rewards.
  // Same for an unrecognised tenancy — it might be another game. Both stay in `windows`
  // for reference and classify nothing.
  const classifying = windows.filter((w) => w.realm === REALM.PLAYTEST);
  const byWindow = rows.map((r) => classifying.find((w) => inWindow(r.ms, w)) ?? null);
  const finalRealms = realms.map((realm, i) => (
    realm !== REALM.LIVE ? realm : byWindow[i] ? byWindow[i].realm : REALM.LIVE
  ));

  // Rebuild sessions from contiguous runs, so every off-live row is in exactly one
  // session whichever signal flagged it. The caller re-measures the live chain and each
  // session separately; a row in neither gets absorbed by the next live row.
  const chainAt = (i) => sessions.find((x) => i >= x.firstIndex && i <= x.lastIndex);
  const merged = [];
  for (let i = 0; i < rows.length;) {
    if (finalRealms[i] === REALM.LIVE) { i++; continue; }
    let j = i;
    // A long silence ends the run too: two previews with no live activity between them
    // are two sessions, not one spanning weeks.
    while (
      j + 1 < rows.length && finalRealms[j + 1] !== REALM.LIVE &&
      !(rows[j + 1].ms != null && rows[j].ms != null && rows[j + 1].ms - rows[j].ms > MAX_SESSION_SPAN_MS)
    ) j++;
    const chain = chainAt(i) ?? chainAt(j);
    let parked = chain?.parkedBalance ?? null;
    if (parked == null) for (let k = i - 1; k >= 0; k--) {
      if (finalRealms[k] === REALM.LIVE && rows[k].balance != null) { parked = rows[k].balance; break; }
    }
    const w = byWindow[i] ?? byWindow[j];
    merged.push({
      startMs: rows[i].ms,
      endMs: rows[j].ms,
      rows: j - i + 1,
      firstIndex: i,
      lastIndex: j,
      // null when a session precedes every live row — the live balance is unknown then,
      // and claiming 0 would put a fabricated number on screen.
      parkedBalance: parked,
      openingBalance: rows[i].balance,
      peakBalance: Math.max(
        rows[i].balance != null ? rows[i].balance - signedQty(rows[i]) : 0,
        ...rows.slice(i, j + 1).map((x) => x.balance ?? 0)
      ),
      tenancy: w?.tenancy ?? null,
      realm: w?.realm ?? REALM.PLAYTEST,
      label: w ? tenancyLabel(w.tenancy) : 'Preview playtest',
      source: chain && w ? 'chain+tenancy' : chain ? 'chain' : 'tenancy',
    });
    i = j + 1;
  }
  sessions.length = 0;
  sessions.push(...merged);

  // Recompute against the FINAL realms: a break the audit has since explained as a
  // preview is no longer unexplained, and reporting it would describe one event twice.
  const gaps = walkGaps(rows.filter((_, i) => finalRealms[i] === REALM.LIVE));

  const ledgerRealms = finalRealms.map((realm, i) => {
    if (realm === REALM.LIVE) return { realm: REALM.LIVE, tenancy: null, label: null };
    const s = sessions.find((x) => i >= x.firstIndex && i <= x.lastIndex);
    return { realm: s?.realm ?? realm, tenancy: s?.tenancy ?? null, label: s?.label ?? 'Preview playtest' };
  });

  // Still counted in the live figures, but unaccountable — reported so a total we
  // can't vouch for isn't presented as fact.
  const anomalies = [];
  // An inflated balance stays inflated for every following row, so report only the row
  // that entered the state.
  let wasImplausible = false;
  rows.forEach((r, i) => {
    const bad = finalRealms[i] === REALM.LIVE && isImplausible(r);
    if (bad && !wasImplausible) {
      // Which bound tripped. Each is a different claim and the page words them
      // separately: a `bought` amount the store has no pack for (which can be SMALLER
      // than the largest pack, so "larger than" would be false), an outsized grant, an
      // outsized SPEND (calling that a grant would be plainly wrong — export 00 has a
      // real 11,100 spend), and an out-of-reach wallet total.
      const q = r.quantity || 0;
      const overGrant = q >= IMPLAUSIBLE_GRANT;
      const by = r.logType === 'bought'
        ? (boughtIsImplausible(q) ? 'catalogue' : 'balance')
        : overGrant ? (r.logType === 'spent' ? 'spend' : 'grant')
        : 'balance';
      anomalies.push({ kind: 'impossible', by, ms: r.ms, amount: by === 'balance' ? r.balance : q });
    }
    if (finalRealms[i] === REALM.LIVE) wasImplausible = bad;
  });
  // A break too big to be an unlogged reward — usually a session the guards declined
  // to remove. `promoted` lets the page report the event once, as an anomaly, instead
  // of also listing it among ordinary unlogged movements.
  for (const g of gaps) {
    if (Math.abs(g.unexplained) >= UNATTRIBUTED_GAP) {
      g.promoted = true;
      anomalies.push({ kind: 'unattributed', ms: g.ms, amount: Math.abs(g.unexplained) });
    }
  }

  // Transaction rows go by time. Where a session and a window cover the same instant,
  // prefer whichever names a tenancy — a session only has one because a window gave it
  // one, so preferring sessions could only lose identity.
  const spans = [
    ...sessions.map((s) => ({ startMs: s.startMs, endMs: s.endMs, realm: s.realm, tenancy: s.tenancy ?? null, label: s.label, source: 'chain' })),
    ...classifying.map((w) => ({ ...w, label: tenancyLabel(w.tenancy) })),
  ];
  const realmAt = (ms) => {
    const hits = spans.filter((x) => inWindow(ms, x));
    if (!hits.length) return { realm: REALM.LIVE, tenancy: null, label: null };
    const w = hits.find((x) => x.tenancy) ?? hits[0];
    return { realm: w.realm, tenancy: w.tenancy ?? null, label: w.label };
  };

  return {
    windows,
    sessions,
    gaps,
    anomalies,
    ledgerRealms,
    realmAt,
    has: sessions.length > 0 || classifying.length > 0,
    // Only windows that can classify: an ARC-only audit contributed nothing.
    auditHadTenancy: classifying.length > 0,
  };
}
