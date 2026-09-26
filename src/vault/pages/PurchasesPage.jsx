import { useMemo, useRef, useState } from 'react';
import { Wallet, CreditCard, Store, Coins, ExternalLink, Info, FlaskConical } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, Note, EmptyState, TogglePill, HoverTip } from '../components/ui';
import { ListSearch, SearchEcho } from '../components/ListSearch';
import { InventoryBrowser } from '../components/InventoryBrowser';
import { useListSearch } from '../../hooks/useListSearch';
import { Pagination } from '../../components/Pagination';
import { num, money, date, dateTime, duration } from '../lib/format';
import { sourceLabel, sourceTone, storeLabel, typeLabel, logTypeMeta, SOURCE_GROUPS, BASE_CURRENCIES, isBaseCurrency, localAmount } from '../lib/economy';
import { seasonsInRange } from '../lib/seasons';

const PER_PAGE = 15;

// A row that came from a season-preview playtest or from ARC Raiders rather than
// the live game (see lib/realms.js). Only rendered when the "include" toggle is on.
const RealmBadge = ({ row }) => (row.isLive ? null : <Badge tone="purple">{row.realmLabel}</Badge>);

// Switch for including the set-aside rows in a table. The label says "set aside"
// rather than "playtest" because the same toggle also covers rows from Embark's
// other game, which is not a playtest of this one.
const IncludeToggle = ({ on, onChange, count, controls }) => (
  <TogglePill on={on} onChange={onChange} icon={FlaskConical} controls={controls}>
    {on ? 'Hide' : 'Show'} {num(count)} set-aside row{count === 1 ? '' : 's'}
  </TogglePill>
);

// Premium-currency balance over time
const BalanceChart = ({ series, seasons }) => {
  if (series.length < 2) return null;
  const W = 1000;
  const H = 200;
  const pad = 6;
  const minT = series[0].ms;
  const maxT = series[series.length - 1].ms;
  const spanT = maxT - minT || 1;
  const maxB = series.reduce((m, p) => Math.max(m, p.balance), 0) || 1;
  const x = (t) => ((t - minT) / spanT) * W;
  const y = (b) => H - pad - (b / maxB) * (H - pad * 2);
  const pts = series.map((p) => `${x(p.ms).toFixed(1)},${y(p.balance).toFixed(1)}`);
  const base = H - pad;
  const markers = seasonsInRange(minT, maxT, seasons).map((s) => ({ ...s, leftPct: ((s.startMs - minT) / spanT) * 100 }));
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-28" role="img" aria-label="Premium currency balance over time">
          <defs>
            <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`M ${x(minT).toFixed(1)},${base} L ${pts.join(' L ')} L ${x(maxT).toFixed(1)},${base} Z`} fill="url(#balFill)" />
          <path d={`M ${pts.join(' L ')}`} fill="none" stroke="rgb(16 185 129)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Season-start markers (THE FINALS launch dates — lib/seasons.js). */}
        <div className="absolute inset-0 pointer-events-none">
          {markers.map((s) => (
            <div key={s.n} className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: `${s.leftPct}%`, transform: 'translateX(-50%)' }}>
              <span className="text-[9px] leading-none text-gray-400 bg-gray-800/90 px-1 rounded-sm">{s.label}</span>
              <div className="flex-1 w-px bg-gray-500/40" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-gray-500 mt-1">
        <span>{date(minT)}</span>
        <span>Peak {num(maxB)}</span>
        <span>{date(maxT)}</span>
      </div>
    </div>
  );
};

// A labelled horizontal bar (used for the grant source/store breakdowns)
const BreakdownBars = ({ rows, total, labelFn }) => {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-sm text-gray-300" title={labelFn(r.key)}>{labelFn(r.key)}</span>
          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="w-20 text-right text-xs text-gray-400 tabular-nums">
            {num(r.count)} <span className="text-gray-600">· {total ? Math.round((r.count / total) * 100) : 0}%</span>
          </span>
        </div>
      ))}
    </div>
  );
};

// Multibucks inflow categories for the donut (HardCurrencyLog only has these broad LogTypes. `other` = LogType unknown
const MB_SEGMENTS = [
  { key: 'earned', label: 'Earned', color: '#10b981' },
  { key: 'bought', label: 'Bought', color: '#eab308' },
  { key: 'gifted', label: 'Gifted', color: '#3b82f6' },
  { key: 'other', label: 'Other', color: '#9ca3af' },
];

// SVG donut for the Multibucks inflow composition
const Donut = ({ segments, total }) => {
  const R = 56;
  const SW = 22;
  const C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0" role="img" aria-label="Multibucks by source">
      <g transform="rotate(-90 70 70)">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#374151" strokeWidth={SW} />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * C;
            const seg = (
              <circle
                key={s.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={SW}
                strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                strokeDashoffset={(-off).toFixed(2)}
              />
            );
            off += len;
            return seg;
          })}
      </g>
      <text x="70" y="66" textAnchor="middle" className="fill-white" style={{ fontSize: '18px', fontWeight: 700 }}>{num(total)}</text>
      <text x="70" y="84" textAnchor="middle" className="fill-gray-400" style={{ fontSize: '9px', letterSpacing: '0.05em' }}>MULTIBUCKS IN</text>
    </svg>
  );
};

// The standard USD/EUR store price — TransactionLog.PricePoint is the same number in $
// and €, so we show it as the primary, solid amount (formatted in € for a clean symbol;
// the figure is identical in USD). This is exactly what a EUR/USD wallet was charged.
const baseMoney = (pp) => (pp != null ? money(pp, 'EUR') : '—');

// Does this row's wallet match the USD/EUR base we display? If so the base price IS what
// was paid and any recorded local price just repeats it; if not (e.g. a PLN wallet),
// LocalizedPrice carries the real local charge worth surfacing.
const rowInBaseCurrency = (t) => (t.currency ? isBaseCurrency(t.currency) : !t.localizedPrice || /^[€$]/.test(t.localizedPrice.trim()));

// Price cell for the real-money table: the standard USD/EUR price, with the real local
// charge underneath when the wallet isn't USD/EUR and the export recorded it.
const PriceCell = ({ t }) => {
  // A known charge in a known non-USD/EUR currency leads, formatted from CurrencyCode
  // because the recorded string's bare "$" does not say which dollar.
  const paid = t.currency && !isBaseCurrency(t.currency) ? localAmount(t.localizedPrice) : null;
  return (
    <div className="leading-tight">
      <span className="text-white tabular-nums">{paid != null ? money(paid, t.currency) : baseMoney(t.pricePoint)}</span>
      {paid != null ? (
        <span className="block text-[11px] text-gray-400 tabular-nums">standard {baseMoney(t.pricePoint)}</span>
      ) : (
        t.localizedPrice && !rowInBaseCurrency(t) && <span className="block text-[11px] text-gray-400 tabular-nums">paid {t.localizedPrice}</span>
      )}
    </div>
  );
};

// The date column shows when the purchase was MADE, but a row can be written much later:
// a preview re-provisions your entitlements and writes a fresh row carrying the original
// purchase date. Without the second line, five rows read "5 Jun 2024" while carrying four
// different preview badges (each badge describes when its own row was written).
const GRANT_LAG_SHOWN = 24 * 3600e3;
const TxDate = ({ t, fmt }) => {
  const lagged = t.createdMs != null && t.ms != null && Math.abs(t.createdMs - t.ms) > GRANT_LAG_SHOWN;
  return (
    <div className="leading-tight">
      <span className="whitespace-nowrap">{fmt(t.purchasedAt)}</span>
      {lagged && (
        <span className="block text-[11px] text-gray-500 whitespace-nowrap">
          granted {date(t.createdMs, 'd MMM yyyy')}
        </span>
      )}
    </div>
  );
};

// Named contents (2026-09+ `TransactionLog.Items`). A skin granted for several weapons
// arrives as repeated lines, so identical names fold into one with a count.
const groupItems = (items) => {
  const out = new Map();
  for (const it of items) {
    const key = `${it.name}|${it.label}`;
    const e = out.get(key);
    if (e) e.amount += it.amount;
    else out.set(key, { ...it });
  }
  return [...out.values()];
};
const ItemName = ({ it, typed = false }) => (
  <span className="inline-flex items-baseline gap-1">
    {it.currency ? (
      <span className="inline-flex items-center gap-1 text-white whitespace-nowrap">
        <Coins className="w-3.5 h-3.5 text-yellow-400 shrink-0" /> {num(it.amount)} {it.name}
      </span>
    ) : (
      <span className={it.internal ? 'font-mono text-xs text-gray-500' : 'text-gray-200'}>
        {it.name}
        {it.amount > 1 && <span className="text-gray-500"> ×{num(it.amount)}</span>}
      </span>
    )}
    {(it.internal || typed) && it.label && !it.currency && <span className="text-[10px] text-gray-500">{it.label}</span>}
  </span>
);
const ITEMS_INLINE = 3;
const ITEMS_TIP_MAX = 16;
// Up to three items inline. A bundle folds into a count whose contents open in a
// fixed-position card: the table container clips positioned children, and anything
// in flow would reflow the row and shift every row below it.
const GrantedItems = ({ items, lead = null, typed = false, title = 'What you got', className = '' }) => {
  const grouped = groupItems(items);
  if (grouped.length <= ITEMS_INLINE) {
    return (
      <span className={className}>
        {lead}
        {grouped.map((it, i) => (
          <span key={i}>
            {i > 0 && ', '}
            <ItemName it={it} typed={typed} />
          </span>
        ))}
      </span>
    );
  }
  const shown = grouped.slice(0, ITEMS_TIP_MAX);
  const spoken = grouped.map((it) => (it.amount > 1 ? `${it.name} ×${num(it.amount)}` : it.name)).join(', ');
  return (
    <HoverTip
      className={className}
      width={288}
      height={60 + shown.length * 24}
      tip={
        <>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">{title}</p>
          <ul className="space-y-1">
            {shown.map((it, i) => (
              <li key={i} className="text-xs leading-snug">
                <ItemName it={it} typed />
              </li>
            ))}
          </ul>
          {grouped.length > shown.length && <p className="text-[10px] text-gray-500 mt-1.5">+{num(grouped.length - shown.length)} more</p>}
        </>
      }
    >
      <button
        type="button"
        className="cursor-help text-left text-gray-400 hover:text-gray-200 underline decoration-dotted underline-offset-2"
        aria-label={`${num(grouped.length)} items: ${spoken}`}
      >
        {lead}
        {num(grouped.length)} items
      </button>
    </HoverTip>
  );
};

const MsProductLink = ({ p }) => (
  <a
    href={p.url}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 min-w-0 max-w-full text-emerald-400 hover:text-emerald-300 hover:underline"
    title={`Open the Microsoft Store page (${p.id})`}
  >
    <Store className="w-3.5 h-3.5 shrink-0" />
    <span className={`truncate ${p.known ? '' : 'font-mono text-xs'}`}>{p.name}</span>
    <ExternalLink className="w-3 h-3 shrink-0" />
  </a>
);

// What a real-money charge actually granted: the named list when the export has one
// (a pack's Multibucks stays visible, the cosmetics fold behind the count), else
// matched by timestamp in the model (Multibucks top-up and/or a Steam DLC; DLC packs bundle both)
const Contents = ({ c }) => {
  if (c?.items?.length) {
    const cur = c.items.filter((it) => it.currency);
    const rest = c.items.filter((it) => !it.currency);
    if (cur.length && rest.length > ITEMS_INLINE) {
      return (
        <span className="text-sm inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <GrantedItems items={cur} />
          <GrantedItems items={rest} lead="plus " title="Also in this purchase" />
        </span>
      );
    }
    return <GrantedItems items={c.items} className="text-sm" />;
  }
  if (!c || (c.mb == null && !c.dlcs.length)) return <span className="text-gray-500">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {c.mb != null && (
        <span className="inline-flex items-center gap-1 text-white whitespace-nowrap">
          <Coins className="w-3.5 h-3.5 text-yellow-400 shrink-0" /> {num(c.mb)} Multibucks
        </span>
      )}
      {c.dlcs.map((d) => (
        <a key={d.dlcId} href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:underline whitespace-nowrap">
          <Store className="w-3.5 h-3.5 shrink-0" /> {d.name}
        </a>
      ))}
    </span>
  );
};

export const PurchasesPage = () => {
  const { model } = useVaultData();
  const { economy, inventory } = model;
  const {
    transactions, transactionsAll, transactionCount, grantedCount, bySource, byStore,
    fiat, fiatGrantedCount, fiatFailedCount, fiatUnpricedCount, spendBaseTotal, charged, walletCurrencies,
    ledger, ledgerAll, mb, currentBalance, balanceSeries, dlc, msBundles, msNamed, offers,
    realms, testTransactionCount, testLedgerCount, testFiatCount, mbTest,
    duplicateChargeCount, duplicateChargeTotal, topMbSpends, mbSpendsNamed,
  } = economy;
  const spentRows = useMemo(() => ledger.reduce((n, r) => n + (r.logType === 'spent' ? 1 : 0), 0), [ledger]);

  const [filter, setFilter] = useState('All');
  const [txPage, setTxPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [offersPage, setOffersPage] = useState(1);
  const [fiatPage, setFiatPage] = useState(1);
  const [dlcPage, setDlcPage] = useState(1);
  // Off-live rows are excluded from the currency figures (not from real-money spend,
  // which is judged per charge), but the export is the user's own data — these let
  // them see exactly what was set aside.
  const [showTestTx, setShowTestTx] = useState(false);
  const [showTestLedger, setShowTestLedger] = useState(false);
  const txSearchRef = useRef(null);

  const activeGroup = SOURCE_GROUPS.find((g) => g.key === filter) || SOURCE_GROUPS[0];
  const inGroup = (t) => !activeGroup.match || activeGroup.match.includes(t.source);
  const txSource = showTestTx ? transactionsAll : transactions;
  const filteredTx = useMemo(
    () => (activeGroup.match ? txSource.filter((t) => activeGroup.match.includes(t.source)) : txSource),
    [txSource, activeGroup]
  );
  // Count what the toggle would actually add UNDER THE ACTIVE FILTER — a global
  // count promises rows the filtered table will not show.
  const testTxInGroup = useMemo(
    () => transactionsAll.reduce((n, t) => n + (!t.isLive && inGroup(t) ? 1 : 0), 0),
    [transactionsAll, activeGroup] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // transaction log paging (the search applies to the active source tab, not
  // the whole log)
  const { query: txQuery, setQuery: setTxQuery, filtered: txShown } = useListSearch(
    filteredTx,
    (t) => [sourceLabel(t.source), typeLabel(t.type), storeLabel(t.store), t.state, t.granted ? 'granted' : ''],
    () => setTxPage(1)
  );
  const txTotalPages = Math.max(1, Math.ceil(txShown.length / PER_PAGE));
  const txSafePage = Math.min(txPage, txTotalPages);
  const txStart = (txSafePage - 1) * PER_PAGE;
  const txSlice = txShown.slice(txStart, txStart + PER_PAGE);

  // ledger paging
  const lgRows = showTestLedger ? ledgerAll : ledger;
  const lgTotalPages = Math.max(1, Math.ceil(lgRows.length / PER_PAGE));
  const lgSafePage = Math.min(ledgerPage, lgTotalPages);
  const lgStart = (lgSafePage - 1) * PER_PAGE;
  const lgSlice = lgRows.slice(lgStart, lgStart + PER_PAGE);

  // real-money paging (a long-lived account can have hundreds of charges, and the
  // table now lists every fiat row rather than the live-only subset)
  const fiTotalPages = Math.max(1, Math.ceil(fiat.length / PER_PAGE));
  const fiSafePage = Math.min(fiatPage, fiTotalPages);
  const fiStart = (fiSafePage - 1) * PER_PAGE;
  const fiSlice = fiat.slice(fiStart, fiStart + PER_PAGE);

  // DLC paging
  const dlTotalPages = Math.max(1, Math.ceil(dlc.length / PER_PAGE));
  const dlSafePage = Math.min(dlcPage, dlTotalPages);
  const dlStart = (dlSafePage - 1) * PER_PAGE;
  const dlSlice = dlc.slice(dlStart, dlStart + PER_PAGE);

  // offers paging (some accounts have hundreds of impression rows)
  const ofTotalPages = Math.max(1, Math.ceil(offers.length / PER_PAGE));
  const ofSafePage = Math.min(offersPage, ofTotalPages);
  const ofStart = (ofSafePage - 1) * PER_PAGE;
  const ofSlice = offers.slice(ofStart, ofStart + PER_PAGE);

  const setGroup = (key) => { setFilter(key); setTxPage(1); };

  // If any granted purchase used a wallet that isn't USD/EUR, the displayed standard price is only an estimate of what they actually paid — flag it for the disclaimer
  const nonBaseCurrencies = walletCurrencies.filter((c) => !BASE_CURRENCIES.has(c));
  const walletIsBase = nonBaseCurrencies.length === 0;
  // The store's own charges lead only on a non-USD/EUR wallet (elsewhere the standard
  // price IS what was paid) and only when they cover at least half the purchases, so a
  // big number never stands for a small fraction of the spending.
  const chargedText = charged.byCurrency.map((c) => money(c.total, c.currency)).join(' + ');
  const chargedLeads = !walletIsBase && charged.count > 0 && charged.count * 2 >= fiatGrantedCount;
  const restText = charged.uncharged > 0 ? `${num(charged.uncharged)} more at about ${baseMoney(charged.unchargedBaseTotal)} standard price` : null;
  const spentValue = !fiatGrantedCount ? '—' : chargedLeads ? chargedText : baseMoney(spendBaseTotal);
  const mbInflowSegs = MB_SEGMENTS.map((s) => ({ ...s, value: mb[s.key] || 0 })).filter((s) => s.value > 0);
  const mbInflowTotal = mb.inTotal;
  const anomalies = realms?.anomalies ?? [];
  const anomalyKinds = new Set(anomalies.map((a) => a.by || a.kind));
  // Each trigger needs its own sentence: a single grant the store can't sell, an
  // out-of-reach wallet total, and a jump too big to be an unlogged reward are three
  // different claims, and asserting the wrong one would be simply untrue.
  const REASONS = {
    catalogue: 'a top-up in an amount the store has no pack for',
    grant: 'a single grant far larger than the game hands out',
    spend: 'a single spend far larger than anything the game charges',
    balance: 'a wallet total higher than the live game reaches',
    unattributed: 'a jump too large to be an unlogged reward',
  };
  const reasons = [...anomalyKinds].map((k) => REASONS[k]).filter(Boolean);
  const anomalyReason = reasons.length
    ? ` That means ${reasons.length === 1 ? reasons[0] : `${reasons.slice(0, -1).join(', ')} and ${reasons.at(-1)}`}.`
    : '';
  // Gaps large enough to be reported as anomalies are shown there instead, so the
  // same event isn't described twice with two different explanations.
  const gaps = (realms?.gaps ?? []).filter((g) => !g.promoted);
  // Server labels that contributed excluded rows but produced no currency session,
  // so they get no line in the session list. Named separately so nothing excluded
  // is left unaccounted for.
  const otherRealmNames = useMemo(() => {
    const inSessions = new Set((realms?.sessions ?? []).map((s) => s.label));
    const names = new Set();
    for (const t of transactionsAll) {
      if (!t.isLive && t.realmLabel && !inSessions.has(t.realmLabel)) names.add(t.realmLabel);
    }
    return [...names];
  }, [transactionsAll, realms]);

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader
        icon={Wallet}
        title="Purchases & Economy"
        subtitle={`${num(transactionCount)} transactions · ${num(fiatGrantedCount)} real-money purchase${fiatGrantedCount === 1 ? '' : 's'}`}
      />

      {!economy.has ? (
        <EmptyState icon={Wallet} title="No purchase or currency data in this export">
          This export didn’t include any TransactionLog, HardCurrencyLog or Steam DLC records.
        </EmptyState>
      ) : (
        <>
          {/* Headline figures */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Real money spent"
              value={spentValue}
              accent="text-yellow-400"
              sub={
                !fiatGrantedCount
                  ? 'no real-money purchases'
                  : chargedLeads
                    ? `charged on ${num(charged.count)} of ${num(fiatGrantedCount)} purchases${restText ? ` · ${restText}` : ''}`
                    : `${num(fiatGrantedCount)} purchase${fiatGrantedCount === 1 ? '' : 's'} · standard USD/EUR price${walletIsBase ? '' : ' (approx)'}`
              }
            />
            <StatCard label="Multibucks balance" value={num(currentBalance)} accent="text-emerald-400" sub="current premium currency" />
            <StatCard label="Multibucks bought" value={num(mb.bought)} sub="with real money" />
            <StatCard label="Transactions" value={num(transactionCount)} sub={`${num(grantedCount)} granted`} />
          </div>

          {/* A value the live store cannot produce that we could NOT attribute to a
              server, so it is still counted above. Warn rather than quietly drop it —
              removing a row is only sound when the balance chain reconnects. */}
          {anomalies.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-200/90">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p>
                {num(anomalies.length)} Multibucks figure{anomalies.length === 1 ? '' : 's'} on your live ledger
                {anomalies.length === 1 ? " doesn't" : " don't"} match anything the live game does
                (largest {num(Math.max(...anomalies.map((a) => a.amount || 0)))} Multibucks).
                {anomalyReason}
                {' '}The likeliest cause is another test server whose wallet sat close enough to your real balance that
                we can’t prove which rows were its own. The figures above still include
                {anomalies.length === 1 ? ' it' : ' them'}, so read the Multibucks totals as an upper bound.
              </p>
            </div>
          )}

          {/* What was set aside, and why. Only shown when this export actually
              contains off-live records. */}
          {realms?.has && (testLedgerCount > 0 || testTransactionCount > 0) && (
            <div className="rounded-xl border border-purple-700/40 bg-purple-950/20 p-4">
              <div className="flex items-start gap-2.5">
                <FlaskConical className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-purple-200">Playtest records were removed from these figures</p>
                  <p className="text-xs text-purple-200/80 mt-1">
                    A season preview hands every participant a throwaway wallet and a stubbed store, and all of it lands
                    in the same export as your real account with nothing marking it apart. None of it cost you Multibucks,
                    so the currency figures here count the live game only. Real-money charges are judged separately, since
                    a card is charged by the store and not by a game server: the spend total below keeps every genuine
                    charge and drops only the ones re-issued a second time.
                  </p>
                  {realms.sessions.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {realms.sessions.map((s, i) => (
                        <li key={`${s.startMs}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <Badge tone="purple">{s.label}</Badge>
                          <span className="text-gray-300">{date(s.startMs)}</span>
                          <span className="text-gray-400">
                            {num(s.rows)} currency row{s.rows === 1 ? '' : 's'} · a separate wallet that peaked at{' '}
                            {num(s.peakBalance)}
                            {s.parkedBalance != null
                              ? <> · your real balance of {num(s.parkedBalance)} was untouched</>
                              : <> · it came before any live activity in this export</>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Audit-only realms: they contribute transactions but no currency
                      rows, so they have no session entry above and would otherwise be
                      an unexplained part of the totals below. */}
                  {otherRealmNames.length > 0 && (
                    <p className="text-xs text-purple-200/80 mt-3">
                      Also excluded: activity on {otherRealmNames.join(', ')}, identified from the server labels in your
                      audit log.
                    </p>
                  )}
                  <p className="text-xs text-purple-200/70 mt-3">
                    Set aside in total:{' '}
                    {testLedgerCount > 0 && (
                      <>
                        {num(testLedgerCount)} currency row{testLedgerCount === 1 ? '' : 's'}
                        {(mbTest?.inTotal > 0 || mbTest?.out > 0) && <> ({num(mbTest.inTotal)} Multibucks in, {num(mbTest.out)} out)</>}
                        {' '}and{' '}
                      </>
                    )}
                    {num(testTransactionCount)} transaction{testTransactionCount === 1 ? '' : 's'}
                    {testFiatCount > 0 && (
                      <>, including {num(testFiatCount)} stubbed store row{testFiatCount === 1 ? '' : 's'} that
                        never charged anything</>
                    )}.
                  </p>
                  {!realms.auditHadTenancy && (
                    <p className="text-[11px] text-purple-200/70 mt-2">
                      Your audit log didn’t include the server labels, so these were identified from the balance chain alone:
                      the live wallet resumes at exactly the balance it had before each session, which is only possible if the
                      rows in between belonged to a different wallet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Real-money spend */}
          <Panel title="Real-money spend">
            {fiat.length === 0 ? (
              <EmptyState icon={CreditCard} title="No real-money purchases recorded">
                Multibucks you spent in game are in the ledger below.
              </EmptyState>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-x-4 gap-y-1 mb-4">
                  <p className="text-3xl font-bold text-yellow-400">{spentValue}</p>
                  <p className="text-xs text-gray-500 pb-1">
                    {chargedLeads ? (
                      <>
                        what your store charged · {num(charged.count)} of {num(fiatGrantedCount)} purchase{fiatGrantedCount === 1 ? '' : 's'}
                        {restText && <> · {restText}</>}
                      </>
                    ) : (
                      <>
                        standard USD / EUR store price · {num(fiatGrantedCount)} purchase{fiatGrantedCount === 1 ? '' : 's'}
                        {walletCurrencies.length > 0 && <> · wallet: {walletCurrencies.join(', ')}</>}
                        {!walletIsBase && charged.count > 0 && <> · your store recorded {chargedText} for {num(charged.count)} of them</>}
                      </>
                    )}
                  </p>
                </div>
                <div className="table-container" style={fiTotalPages > 1 ? { minHeight: PER_PAGE * 38 } : undefined}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-2 px-3 font-medium">Date</th>
                        <th className="text-right py-2 px-3 font-medium">Price</th>
                        <th className="text-left py-2 px-3 font-medium">What you got</th>
                        <th className="text-left py-2 px-3 font-medium">Store</th>
                        <th className="text-left py-2 px-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fiSlice.map((t, i) => (
                        <tr key={fiStart + i} className="border-b border-gray-700/40 last:border-0">
                          <td className="py-2 px-3 text-gray-300"><TxDate t={t} fmt={dateTime} /></td>
                          <td className="py-2 px-3 text-right"><PriceCell t={t} /></td>
                          <td className="py-2 px-3">
                            {t.msProduct ? (
                              <span className="flex flex-col items-start gap-0.5">
                                <MsProductLink p={t.msProduct} />
                                {(t.contents?.items?.length > 0 || t.contents?.mb != null || t.contents?.dlcs?.length > 0) && <Contents c={t.contents} />}
                              </span>
                            ) : (
                              <Contents c={t.contents} />
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-400">{storeLabel(t.store)}</td>
                          <td className="py-2 px-3">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {/* No realm badge here. These rows are charges, not grants:
                                  the date shown is when the purchase was made, while the
                                  realm describes when the row was WRITTEN, so a genuine
                                  2024 purchase re-issued during a 2025 preview would read
                                  as "S9 preview playtest" against a 2024 date. What
                                  matters for a charge is whether it was already counted,
                                  which "Repeat grant" says directly. */}
                              <Badge tone={t.granted ? 'emerald' : 'red'}>{t.granted ? 'Completed' : t.state}</Badge>
                              {t.duplicateOfEarlierCharge && <Badge tone="gray">Repeat grant</Badge>}
                              {t.granted && t.pricePoint == null && <Badge tone="gray">No price</Badge>}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {fiTotalPages > 1 && (
                  <div className="mt-4">
                    <Pagination
                      currentPage={fiSafePage}
                      totalPages={fiTotalPages}
                      startIndex={fiStart}
                      endIndex={fiStart + PER_PAGE}
                      totalItems={fiat.length}
                      onPageChange={setFiatPage}
                      edgeScroll={false}
                      variant="compact"
                    />
                  </div>
                )}
                {/* Every row in the table above is in exactly one of these buckets,
                    so the counts reconcile against the row count. */}
                {(fiatFailedCount > 0 || fiatUnpricedCount > 0 || duplicateChargeCount > 0) && (
                  <p className="text-xs text-gray-500 mt-2">
                    {fiatFailedCount > 0 && (
                      <>{num(fiatFailedCount)} failed/cancelled attempt{fiatFailedCount === 1 ? '' : 's'} shown above but excluded from the total. </>
                    )}
                    {fiatUnpricedCount > 0 && (
                      <>
                        {num(fiatUnpricedCount)} completed purchase{fiatUnpricedCount === 1 ? '' : 's'} came through with no
                        price recorded, so {fiatUnpricedCount === 1 ? 'it is' : 'they are'} listed but can’t be added to the total.{' '}
                      </>
                    )}
                    {duplicateChargeCount > 0 && (
                      <>
                        {num(duplicateChargeCount)} row{duplicateChargeCount === 1 ? ' is a' : 's are'} repeat
                        grant{duplicateChargeCount === 1 ? '' : 's'} of a charge already counted, a server re-issuing
                        something you already own. Counting {duplicateChargeCount === 1 ? 'it' : 'them'} again would have added {baseMoney(duplicateChargeTotal)}.
                      </>
                    )}
                  </p>
                )}
                {!walletIsBase && (
                  <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2.5 text-xs text-amber-200/90">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    {chargedLeads ? (
                      <p>
                        Your wallet is in <strong>{nonBaseCurrencies.join(', ')}</strong>. The total above adds up what your store says it charged,
                        which the export recorded for {num(charged.count)} of your {num(fiatGrantedCount)} purchases.
                        {charged.uncharged > 0 && ' The rest only carry the standard USD / EUR price, which is not what you paid, so they are kept out of that total.'}{' '}
                        Whether a charge is recorded depends on the store you bought through.
                      </p>
                    ) : (
                      <p>
                        Your wallet is in <strong>{nonBaseCurrencies.join(', ')}</strong>, but the game only records the
                        standard <strong>USD / EUR</strong> price (the same number in both). Items are usually priced lower
                        in other regions, so <strong>you may have actually paid up to ~20% less</strong> than the amounts shown
                        here. Where the export recorded your exact local charge, it’s shown beneath the price.
                      </p>
                    )}
                  </div>
                )}
                {msNamed > 0 && (
                  <Note>
                    Xbox purchases are named from <code>MicrosoftOrderAttributes</code>, matched by purchase time, with titles from the
                    Microsoft Store.
                    {fiat.some((t) => t.store === 'microsoft' && !t.msProduct && t.contents?.items?.length > 0 && t.contents.items.every((it) => it.currency)) &&
                      ' Multibucks packs have no purchase time in that record, so they carry no store link.'}
                    {fiat.some((t) => t.msProduct?.arcRaiders) && (
                      <>
                        {' '}
                        The ARC Raiders row is Embark’s other game: its order is in <code>ArcRaidersMicrosoftOrderAttributes</code>, and it granted
                        THE FINALS items with no price recorded.
                      </>
                    )}
                  </Note>
                )}
              </>
            )}
          </Panel>

          {/* Premium currency ledger */}
          <Panel title="Multibucks ledger (premium currency)">
            {ledger.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center gap-5 mb-4">
                <Donut segments={mbInflowSegs} total={mbInflowTotal} />
                <div className="flex-1 w-full space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Where your Multibucks came from</p>
                  {mbInflowSegs.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="text-gray-300 w-16">{s.label}</span>
                      <span className="text-white tabular-nums">{num(s.value)}</span>
                      <span className="text-gray-500 text-xs">· {mbInflowTotal ? Math.round((s.value / mbInflowTotal) * 100) : 0}%</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-sm pt-2 mt-1 border-t border-gray-700">
                    <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" /><span className="text-gray-300">Spent</span></span>
                    <span className="text-red-400 tabular-nums font-medium">−{num(mb.out)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-300">Current balance</span>
                    <span className="text-emerald-400 tabular-nums font-bold">{num(currentBalance)}</span>
                  </div>
                </div>
              </div>
            )}

            {balanceSeries.length >= 2 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Balance over time · vertical lines mark season starts</p>
                <BalanceChart series={balanceSeries} seasons={model.seasons} />
              </div>
            )}

            {/* The toggle sits OUTSIDE the empty-state branch: an account whose only
                currency rows are set-aside ones has an empty live ledger, and burying
                the control inside the else-branch would leave the panel saying
                "no movements" with no way to reach the rows it just said it removed. */}
            {testLedgerCount > 0 && (
              <div className="mb-3">
                <IncludeToggle
                  on={showTestLedger}
                  onChange={(v) => { setShowTestLedger(v); setLedgerPage(1); }}
                  count={testLedgerCount}
                  controls="mb-ledger-rows"
                />
              </div>
            )}
            {showTestLedger && lgRows.length > 0 && (
              <p className="text-xs text-purple-200/80 mb-3">
                The set-aside rows belong to a separate wallet, so “Balance after” steps between your real balance and
                the test one. Read it within a realm, not down the column.
              </p>
            )}
            <div id="mb-ledger-rows">
            {lgRows.length === 0 ? (
              <p className="text-sm text-gray-500">
                {ledgerAll.length === 0
                  ? 'No premium-currency movements recorded.'
                  : 'No live-game movements recorded. Every currency row in this export came from another server.'}
              </p>
            ) : (
              <>
                <div className="table-container" style={lgTotalPages > 1 ? { minHeight: PER_PAGE * 38 } : undefined}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-2 px-3 font-medium">Date</th>
                        <th className="text-left py-2 px-3 font-medium">Type</th>
                        <th className="text-right py-2 px-3 font-medium">Amount</th>
                        <th className="text-right py-2 px-3 font-medium">Balance after</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lgSlice.map((l, i) => {
                        const meta = logTypeMeta(l.logType);
                        const d = l.delta ?? 0;
                        const signed = d > 0 ? `+${num(d)}` : d < 0 ? `−${num(Math.abs(d))}` : num(d);
                        const amountClass = d > 0 ? 'text-emerald-400' : d < 0 ? 'text-red-400' : 'text-gray-400';
                        return (
                          <tr key={lgStart + i} className="border-b border-gray-700/40 last:border-0">
                            <td className="py-2 px-3 text-gray-300 whitespace-nowrap">{dateTime(l.createdAt)}</td>
                            <td className="py-2 px-3">
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <Badge tone={meta.tone}>{meta.label}</Badge>
                                <RealmBadge row={l} />
                              </span>
                              {l.items?.length > 0 && <GrantedItems items={l.items} lead="Bought: " title="What this bought" className="block text-[11px] text-gray-500 mt-0.5" />}
                            </td>
                            <td className={`py-2 px-3 text-right tabular-nums font-medium ${amountClass}`}>{signed}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-400">{num(l.balance)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4">
                  <Pagination
                    currentPage={lgSafePage}
                    totalPages={lgTotalPages}
                    startIndex={lgStart}
                    endIndex={lgStart + PER_PAGE}
                    totalItems={lgRows.length}
                    onPageChange={setLedgerPage}
                    edgeScroll={false}
                    variant="compact"
                  />
                </div>
              </>
            )}
            </div>
            <Note>
              The ledger tags every inflow as one of four broad types and nothing finer, so which Battle Pass or which
              Twitch drop is not recoverable. <strong>Earned</strong> is Battle Pass, ranks and code redemptions,{' '}
              <strong>Bought</strong> is real-money top-ups, <strong>Gifted</strong> is gifts, and <strong>Other</strong>{' '}
              is anything the export tags only as <code>unknown</code>, usually a small +75 reward drop and occasionally a
              correction.
              {mbSpendsNamed > 0 && ' Where a spend’s items are known, they’re listed beneath it. Lists of more than three fold into a count you can hover or tap.'}
              {ledger.length > 0 && (
                <> These are actual balance changes, so they reconcile: total in − Spent
                  {mb.startBalance ? <> + a starting balance of {num(mb.startBalance)}</> : null} = your current
                  balance of {num(currentBalance)}.</>
              )}
              {gaps.length > 0 && (
                <>
                  {' '}Embark didn’t log every movement: {num(gaps.length)} balance change
                  {gaps.length === 1 ? '' : 's'} here {gaps.length === 1 ? 'has' : 'have'} no matching row
                  ({gaps.map((g, i) => <span key={i}>{i > 0 ? ', ' : ''}{g.unexplained > 0 ? '+' : '−'}{num(Math.abs(g.unexplained))} on {date(g.ms)}</span>)}).
                  Each is absorbed by the row it lands on, so that row’s Amount differs from its own
                  <code> Quantity</code> by the missing amount. That is why the odd row shows a figure, or a direction,
                  its type wouldn’t suggest. The running balance stays correct throughout.
                </>
              )}
            </Note>
          </Panel>

          {/* Biggest Multibucks spends (2026-09+, from the named purchase contents) */}
          {topMbSpends.length > 0 && (
            <Panel title="Biggest Multibucks spends">
              <div className="space-y-3">
                {topMbSpends.map((s, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="w-4 text-right text-xs text-gray-500 tabular-nums pt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white tabular-nums">
                        <span className="font-semibold">{num(s.mb)}</span> Multibucks <span className="text-gray-500">· {date(s.ms)}</span>
                      </p>
                      {s.items?.length ? (
                        <GrantedItems items={s.items} lead="Bought: " typed title="What this bought" className="text-xs text-gray-400" />
                      ) : (
                        <p className="text-xs text-gray-600">What this bought isn’t recorded for this spend.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Note>
                {mbSpendsNamed >= spentRows
                  ? `Every one of your ${num(spentRows)} spends carries an item name in this export.`
                  : `An item name is known for ${num(mbSpendsNamed)} of your ${num(spentRows)} spends, since battle pass and collection-event grants don’t carry one. A larger spend missing from this list is one the export attached no items to.`}
              </Note>
            </Panel>
          )}

          {/* Where grants came from */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Where your items came from">
              <BreakdownBars rows={bySource} total={transactionCount} labelFn={sourceLabel} />
            </Panel>
            <Panel title="By store / platform">
              <BreakdownBars rows={byStore} total={transactionCount} labelFn={storeLabel} />
            </Panel>
          </div>

          {/* Full transaction log */}
          <Panel
            title="Transaction log"
            action={
              <ListSearch
                value={txQuery}
                onChange={setTxQuery}
                placeholder="Search source, type or store…"
                matched={txShown.length}
                total={filteredTx.length}
                className="w-full sm:w-72"
                inputRef={txSearchRef}
              />
            }
          >
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {SOURCE_GROUPS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGroup(g.key)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === g.key ? 'bg-emerald-600 text-white' : 'bg-gray-900/60 text-gray-400 hover:text-white'
                  }`}
                >
                  {g.key}
                </button>
              ))}
            </div>

            {testTxInGroup > 0 && (
              <div className="mb-3">
                <IncludeToggle
                  on={showTestTx}
                  onChange={(v) => { setShowTestTx(v); setTxPage(1); }}
                  count={testTxInGroup}
                  controls="tx-log-table"
                />
              </div>
            )}

            <div id="tx-log-table" className="table-container" style={txTotalPages > 1 ? { minHeight: PER_PAGE * 38 } : undefined}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left py-2 px-3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 font-medium">Source</th>
                    <th className="text-left py-2 px-3 font-medium">Type</th>
                    <th className="text-left py-2 px-3 font-medium">Store</th>
                    <th className="text-right py-2 px-3 font-medium">Price</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {txSlice.map((t, i) => (
                    <tr key={txStart + i} className="border-b border-gray-700/40 last:border-0">
                      <td className="py-2 px-3 text-gray-300"><TxDate t={t} fmt={(v) => date(v, 'd MMM yyyy')} /></td>
                      <td className="py-2 px-3">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <Badge tone={sourceTone(t.source)}>{sourceLabel(t.source)}</Badge>
                          <RealmBadge row={t} />
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-400">
                        {typeLabel(t.type)}
                        {t.items?.granted?.length > 0 && <GrantedItems items={t.items.granted} lead="Got: " className="block text-[11px] text-gray-500 mt-0.5" />}
                        {t.items?.cost?.some((c) => !/multibucks/i.test(c.name)) && (
                          <span className="block text-[11px] text-gray-500 mt-0.5 tabular-nums">
                            Cost: {t.items.cost.filter((c) => !/multibucks/i.test(c.name)).map((c) => `${num(c.amount)} ${c.name}`).join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-gray-400">{storeLabel(t.store)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-300">{t.isFiat && t.pricePoint != null ? baseMoney(t.pricePoint) : '—'}</td>
                      <td className="py-2 px-3">
                        {t.granted ? <span className="text-gray-500 text-xs">granted</span> : <Badge tone="red">{t.state}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {txQuery.trim() && txShown.length === 0 && (
              <p className="text-sm text-gray-500 py-3">No transactions match “{txQuery.trim()}”.</p>
            )}

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <SearchEcho value={txQuery} onClear={() => setTxQuery('')} focusRef={txSearchRef} />
              {txShown.length > 0 && (
                <div className="flex-1">
                  <Pagination
                    currentPage={txSafePage}
                    totalPages={txTotalPages}
                    startIndex={txStart}
                    endIndex={txStart + PER_PAGE}
                    totalItems={txShown.length}
                    onPageChange={setTxPage}
                    edgeScroll={false}
                    variant="compact"
                  />
                </div>
              )}
            </div>
          </Panel>

          {/* Steam DLC ownership */}
          {(dlc.length > 0 || !(msBundles.length > 0 || transactionsAll.some((t) => t.store === 'microsoft'))) && (
            <Panel title={`Owned Steam DLC (${num(dlc.length)})`}>
              {dlc.length === 0 ? (
                <EmptyState icon={Store} title="No Steam DLC recorded">
                  Ownership rows only appear for Steam accounts that own a paid DLC pack.
                </EmptyState>
              ) : (
                <>
                  <ul className="space-y-2" style={dlTotalPages > 1 ? { minHeight: PER_PAGE * 44 } : undefined}>
                    {dlSlice.map((d) => (
                      <li key={d.dlcId} className="flex items-center justify-between gap-3 bg-gray-900/50 rounded-lg px-3 py-2 text-sm">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 hover:underline inline-flex items-center gap-1.5 min-w-0"
                          title={`Open Steam store page (App ID ${d.dlcId})`}
                        >
                          <Store className="w-4 h-4 shrink-0" />
                          <span className={`truncate ${d.known ? '' : 'font-mono text-xs'}`}>{d.name}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                        <span
                          className="text-gray-500 text-xs whitespace-nowrap"
                          title={d.ownedSinceMs && !d.dateIsPurchase
                            ? (d.dateNote === 'rerecord'
                              ? 'When Embark last wrote this ownership row. It matches a purchase in this export but was written long after it, so it is a re-record, not the day you bought it.'
                              : 'When Embark last wrote this ownership row. Nothing here ties it to a purchase, so it is not necessarily when you got it.')
                            : undefined}
                        >
                          {d.ownedSinceMs
                            ? (d.dateIsPurchase ? `since ${date(d.ownedSinceMs)}` : `recorded ${date(d.ownedSinceMs)}`)
                            : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {dlTotalPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={dlSafePage}
                        totalPages={dlTotalPages}
                        startIndex={dlStart}
                        endIndex={dlStart + PER_PAGE}
                        totalItems={dlc.length}
                        onPageChange={setDlcPage}
                        edgeScroll={false}
                        variant="compact"
                      />
                    </div>
                  )}
                  <Note>
                    {dlc.some((d) => d.ownedSinceMs && !d.dateIsPurchase) && (
                      <>
                        A date marked <em>recorded</em> is when Embark last wrote that ownership row, not necessarily when
                        you got it: re-provisioning your entitlements overwrites the timestamp, so it can be months late.
                        Steam’s own library has the real purchase date.{' '}
                      </>
                    )}
                    The export stores each owned DLC’s Steam App ID and no name or price, which is why some rows show an id.
                  </Note>
                </>
              )}
            </Panel>
          )}

          {msBundles.length > 0 && (
            <Panel title={`Microsoft bundle records (${num(msBundles.reduce((a, b) => a + b.copies, 0))})`}>
              <ul className="space-y-2">
                {msBundles.map((b) => (
                  <li key={b.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3 bg-gray-900/50 rounded-lg px-3 py-2 text-sm">
                    <MsProductLink p={b} />
                    <span className="text-gray-500 text-xs sm:whitespace-nowrap">
                      {b.firstMs == null
                        ? '—'
                        : b.copies === 1
                          ? `recorded ${date(b.firstMs)}`
                          : b.copies === 2
                            ? `2 records · ${date(b.firstMs)} and ${date(b.lastMs)}`
                            : `${num(b.copies)} records · first ${date(b.firstMs)}, last ${date(b.lastMs)}`}
                    </span>
                  </li>
                ))}
              </ul>
              <Note>
                Each row is the product id that ends <code>MicrosoftBundleRecord.BundleTransactionID</code>, and each date is when Embark wrote a
                record. The export does not say which of these products the account had.
              </Note>
            </Panel>
          )}

          {/* Limited-time offers (impressions, not purchases) */}
          {offers.length > 0 && (
            <Panel title={`Limited-time offers shown (${num(offers.length)})`}>
              <div className="table-container" style={ofTotalPages > 1 ? { minHeight: PER_PAGE * 38 } : undefined}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="text-left py-2 px-3 font-medium">Started</th>
                      <th className="text-right py-2 px-3 font-medium">Window</th>
                      <th className="text-left py-2 px-3 font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ofSlice.map((o, i) => (
                      <tr key={ofStart + i} className="border-b border-gray-700/40 last:border-0">
                        <td className="py-2 px-3 text-gray-300 whitespace-nowrap">{dateTime(o.startedAt)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-400">{o.durationSec ? duration(o.durationSec * 1000) : '—'}</td>
                        <td className="py-2 px-3">
                          {o.completed ? <Badge tone="emerald">Yes</Badge> : <span className="text-gray-500 text-xs">No</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Pagination
                  currentPage={ofSafePage}
                  totalPages={ofTotalPages}
                  startIndex={ofStart}
                  endIndex={ofStart + PER_PAGE}
                  totalItems={offers.length}
                  onPageChange={setOffersPage}
                  edgeScroll={false}
                  variant="compact"
                />
              </div>
              <Note>
                Offers the game <em>showed</em> you, not purchases.
              </Note>
            </Panel>
          )}
        </>
      )}

      {/* Inventory counts by type — shown independently of purchase/currency data. */}
      {inventory.hasNames && <InventoryBrowser inventory={inventory} />}
      {inventory.has && !inventory.hasNames && (
        <Panel title={`Items you own (${num(inventory.total)})`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {inventory.categories.map((c) => (
              <div key={c.type} className="bg-gray-900/50 rounded-lg px-3 py-2.5">
                <p className="text-2xl font-bold text-white tabular-nums">{num(c.count)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
          <Note>
            Counts come from your <code>InventoryItem</code> records, which store each item’s <em>type</em> and quantity
            and no item IDs, so cosmetics can only be counted by category, never named. We need help filling out this
            category and making it more accurate.
          </Note>
        </Panel>
      )}
    </div>
  );
};
