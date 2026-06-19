import { useMemo, useState } from 'react';
import { Wallet, CreditCard, Store, Coins, Clock, ExternalLink } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, Note, EmptyState, PageJump } from '../components/ui';
import { Pagination } from '../../components/Pagination';
import { num, decimal, date, dateTime, duration } from '../lib/format';
import { sourceLabel, sourceTone, storeLabel, typeLabel, logTypeMeta, SOURCE_GROUPS } from '../lib/economy';
import { seasonsInRange } from '../lib/seasons';

const PER_PAGE = 15;

// Premium-currency balance over time
const BalanceChart = ({ series }) => {
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
  const markers = seasonsInRange(minT, maxT).map((s) => ({ ...s, leftPct: ((s.startMs - minT) / spanT) * 100 }));
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

// Per-row price. LocalizedPrice is the only field with the TRUE amount charged (e.g. "PLN 20.95") and is present on only some rows. Otherwise PricePoint is Valve's base price tier (≈ USD/EUR), NOT the local charge — shown as approx
const fiatPrice = (t) => t.localizedPrice || (t.pricePoint != null ? `≈ ${decimal(t.pricePoint)}` : '—');

// What a real-money charge actually granted — matched by timestamp in the model (Multibucks top-up and/or a Steam DLC; DLC packs bundle both)
const Contents = ({ c }) => {
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
  const { economy } = model;
  const {
    transactions, transactionCount, grantedCount, bySource, byStore,
    fiat, fiatGrantedCount, fiatFailedCount, spendBaseTotal, walletCurrencies,
    ledger, mb, currentBalance, balanceSeries, dlc, offers,
  } = economy;

  const [filter, setFilter] = useState('All');
  const [txPage, setTxPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);

  const activeGroup = SOURCE_GROUPS.find((g) => g.key === filter) || SOURCE_GROUPS[0];
  const filteredTx = useMemo(
    () => (activeGroup.match ? transactions.filter((t) => activeGroup.match.includes(t.source)) : transactions),
    [transactions, activeGroup]
  );

  // transaction log paging
  const txTotalPages = Math.max(1, Math.ceil(filteredTx.length / PER_PAGE));
  const txSafePage = Math.min(txPage, txTotalPages);
  const txStart = (txSafePage - 1) * PER_PAGE;
  const txSlice = filteredTx.slice(txStart, txStart + PER_PAGE);

  // ledger paging
  const lgTotalPages = Math.max(1, Math.ceil(ledger.length / PER_PAGE));
  const lgSafePage = Math.min(ledgerPage, lgTotalPages);
  const lgStart = (lgSafePage - 1) * PER_PAGE;
  const lgSlice = ledger.slice(lgStart, lgStart + PER_PAGE);

  const setGroup = (key) => { setFilter(key); setTxPage(1); };

  const spentValue = fiatGrantedCount ? `≈ ${decimal(spendBaseTotal)}` : '—';
  const mbInflowSegs = MB_SEGMENTS.map((s) => ({ ...s, value: mb[s.key] || 0 })).filter((s) => s.value > 0);
  const mbInflowTotal = mb.inTotal;

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
              sub={fiatGrantedCount ? `${num(fiatGrantedCount)} purchase${fiatGrantedCount === 1 ? '' : 's'} · est.` : 'no real-money purchases'}
            />
            <StatCard label="Multibucks balance" value={num(currentBalance)} accent="text-emerald-400" sub="current premium currency" />
            <StatCard label="Multibucks bought" value={num(mb.bought)} sub="with real money" />
            <StatCard label="Transactions" value={num(transactionCount)} sub={`${num(grantedCount)} granted`} />
          </div>

          {/* Real-money spend */}
          <Panel title="Real-money spend">
            {fiat.length === 0 ? (
              <EmptyState icon={CreditCard} title="No real-money purchases recorded">
                Nothing was bought with real currency on this account. Premium currency (Multibucks) you spent in-game is
                tracked in the ledger below.
              </EmptyState>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-x-4 gap-y-1 mb-4">
                  <p className="text-3xl font-bold text-yellow-400">≈ {decimal(spendBaseTotal)}</p>
                  <p className="text-xs text-gray-500 pb-1">
                    estimated from base (USD/EUR) price points · {num(fiatGrantedCount)} purchase{fiatGrantedCount === 1 ? '' : 's'}
                    {walletCurrencies.length > 0 && <> · wallet: {walletCurrencies.join(', ')}</>}
                  </p>
                </div>
                <div className="table-container">
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
                      {fiat.map((t, i) => (
                        <tr key={i} className="border-b border-gray-700/40 last:border-0">
                          <td className="py-2 px-3 text-gray-300 whitespace-nowrap">{dateTime(t.purchasedAt)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-white">{fiatPrice(t)}</td>
                          <td className="py-2 px-3"><Contents c={t.contents} /></td>
                          <td className="py-2 px-3 text-gray-400">{storeLabel(t.store)}</td>
                          <td className="py-2 px-3">
                            <Badge tone={t.granted ? 'emerald' : 'red'}>{t.granted ? 'Completed' : t.state}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {fiatFailedCount > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    {num(fiatFailedCount)} failed/cancelled attempt{fiatFailedCount === 1 ? '' : 's'} shown above but excluded from the total.
                  </p>
                )}
                <Note>
                  Each charge is matched to the Multibucks and/or DLC it granted by exact timestamp (DLC packs bundle both).
                  <strong> Amounts are approximate</strong> — the export stores Valve’s base price point (≈ USD/EUR), not what
                  your wallet was actually charged: e.g. a PLN wallet billed 74.99&nbsp;zł is recorded as the 19.99 tier. The
                  real local amount only appears on some rows (shown when present), so treat the total as a USD/EUR-equivalent
                  estimate, not your exact local spend.
                </Note>
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
                <BalanceChart series={balanceSeries} />
              </div>
            )}

            {ledger.length === 0 ? (
              <p className="text-sm text-gray-500">No premium-currency movements recorded.</p>
            ) : (
              <>
                <div className="table-container" style={{ minHeight: PER_PAGE * 38 }}>
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
                            <td className="py-2 px-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                            <td className={`py-2 px-3 text-right tabular-nums font-medium ${amountClass}`}>{signed}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-400">{num(l.balance)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <PageJump totalPages={lgTotalPages} onJump={setLedgerPage} />
                  <div className="flex-1">
                    <Pagination
                      currentPage={lgSafePage}
                      totalPages={lgTotalPages}
                      startIndex={lgStart}
                      endIndex={lgStart + PER_PAGE}
                      totalItems={ledger.length}
                      onPageChange={setLedgerPage}
                      variant="compact"
                    />
                  </div>
                </div>
              </>
            )}
            <Note>
              Multibucks is the in-game premium currency. <strong>Earned</strong> = Battle Pass, ranks and code redemptions;
              <strong> Bought</strong> = real-money top-ups; <strong>Gifted</strong> = gifts; <strong>Other</strong> =
              uncategorised grants the export tags only as <code>unknown</code> (usually small +75 reward drops, occasionally a
              correction). The ledger records only these broad types, not a finer source (which Battle Pass, which Twitch drop),
              so that’s all that can be shown. These are actual balance changes, so they reconcile: total in − Spent
              {mb.startBalance ? <> + a starting balance of {num(mb.startBalance)}</> : null} = your current balance of {num(currentBalance)}.
            </Note>
          </Panel>

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
          <Panel title="Transaction log">
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

            <div className="table-container" style={{ minHeight: PER_PAGE * 38 }}>
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
                      <td className="py-2 px-3 text-gray-300 whitespace-nowrap">{date(t.purchasedAt, 'd MMM yyyy')}</td>
                      <td className="py-2 px-3"><Badge tone={sourceTone(t.source)}>{sourceLabel(t.source)}</Badge></td>
                      <td className="py-2 px-3 text-gray-400">{typeLabel(t.type)}</td>
                      <td className="py-2 px-3 text-gray-400">{storeLabel(t.store)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-300">{t.isFiat && t.pricePoint != null ? fiatPrice(t) : '—'}</td>
                      <td className="py-2 px-3">
                        {t.granted ? <span className="text-gray-500 text-xs">granted</span> : <Badge tone="red">{t.state}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <PageJump totalPages={txTotalPages} onJump={setTxPage} />
              <div className="flex-1">
                <Pagination
                  currentPage={txSafePage}
                  totalPages={txTotalPages}
                  startIndex={txStart}
                  endIndex={txStart + PER_PAGE}
                  totalItems={filteredTx.length}
                  onPageChange={setTxPage}
                  variant="compact"
                />
              </div>
            </div>
            <Note>
              Every grant the account received — purchases, Battle Pass unlocks, event rewards, Twitch drops and gifts.
              Only real-money rows carry a price; in-game and reward grants don’t record the item, just when and why it
              was granted.
            </Note>
          </Panel>

          {/* Steam DLC ownership */}
          <Panel title={`Owned Steam DLC (${num(dlc.length)})`}>
            {dlc.length === 0 ? (
              <EmptyState icon={Store} title="No Steam DLC recorded">
                This export listed no Steam DLC ownership rows (these only appear for Steam accounts that own paid DLC packs).
              </EmptyState>
            ) : (
              <>
                <ul className="space-y-2">
                  {dlc.map((d) => (
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
                      <span className="text-gray-500 text-xs whitespace-nowrap">{d.ownedSinceMs ? `since ${date(d.ownedSinceMs)}` : '—'}</span>
                    </li>
                  ))}
                </ul>
                <Note>
                  The export stores the Steam App ID of each owned DLC, not its name or price (those are localised on
                  Steam). Links open the matching Steam store page.
                </Note>
              </>
            )}
          </Panel>

          {/* Limited-time offers (impressions, not purchases) */}
          {offers.length > 0 && (
            <Panel title={`Limited-time offers shown (${num(offers.length)})`}>
              <div className="table-container">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="text-left py-2 px-3 font-medium">Started</th>
                      <th className="text-right py-2 px-3 font-medium">Window</th>
                      <th className="text-left py-2 px-3 font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.slice(0, 30).map((o, i) => (
                      <tr key={i} className="border-b border-gray-700/40 last:border-0">
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
              {offers.length > 30 && <p className="text-xs text-gray-500 mt-2">Showing the 30 most recent of {num(offers.length)}.</p>}
              <Note>
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /></span> These are limited-time
                store offers the game <em>showed</em> you, not confirmed purchases.
              </Note>
            </Panel>
          )}
        </>
      )}
    </div>
  );
};
