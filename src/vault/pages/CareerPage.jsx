import { useState } from 'react';
import { User, Ban, Activity, Medal, Target, Skull, Flame, HeartPulse, Coins, Banknote, TrendingUp, TrendingDown } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, Note } from '../components/ui';
import { num, decimal, hours, date, pct, cash } from '../lib/format';
import { isoToFlag } from '../lib/worldgeo';

// One colour per named game mode (shared by the pie + the per-mode table)
const MODE_COLOR = {
  Ranked: '#eab308', // yellow
  'World Tour': '#a855f7', // purple
  'Quick Cash': '#10b981', // emerald
  'Team Deathmatch': '#ef4444', // red
  'Power Shift': '#3b82f6', // blue
  'Point Break': '#f97316', // orange
  Other: '#9ca3af', // gray
};

// SVG donut of game-mode share (by matches played) with hover powers
const ModeDonut = ({ segments, total, hovered, onHover }) => {
  const R = 56;
  const SW = 22;
  const C = 2 * Math.PI * R;
  let off = 0;
  const active = hovered ? segments.find((s) => s.key === hovered) : null;
  return (
    <div className="relative w-36 h-36 shrink-0">
      <svg viewBox="0 0 140 140" className="w-36 h-36" role="img" aria-label="Matches by game mode">
        <g transform="rotate(-90 70 70)">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#374151" strokeWidth={SW} />
          {total > 0 &&
            segments.map((s) => {
              const len = (s.value / total) * C;
              const dim = hovered && hovered !== s.key;
              const seg = (
                <circle
                  key={s.key}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hovered === s.key ? SW + 4 : SW}
                  strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                  strokeDashoffset={(-off).toFixed(2)}
                  opacity={dim ? 0.3 : 1}
                  style={{ cursor: 'pointer', touchAction: 'manipulation', transition: 'opacity 0.15s, stroke-width 0.15s' }}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(s.key)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(null)}
                  onClick={() => onHover(hovered === s.key ? null : s.key)}
                />
              );
              off += len;
              return seg;
            })}
        </g>
        {!active && (
          <>
            <text x="70" y="66" textAnchor="middle" className="fill-white" style={{ fontSize: '20px', fontWeight: 700 }}>
              {num(total)}
            </text>
            <text x="70" y="84" textAnchor="middle" className="fill-gray-400" style={{ fontSize: '9px', letterSpacing: '0.05em' }}>
              MATCHES
            </text>
          </>
        )}
      </svg>
      {active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          <span className="text-xs font-semibold text-white leading-tight">{active.label}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">
            {num(active.value)} · {total ? Math.round((active.value / total) * 100) : 0}%
          </span>
        </div>
      )}
    </div>
  );
};

// A compact label-over-value fact for the page header (account meta moved up
// from the old bottom "Account" panel).
const HeaderFact = ({ label, children }) => (
  <div>
    <dt className="text-[10px] uppercase tracking-wider text-gray-500">{label}</dt>
    <dd className="text-sm font-medium text-white whitespace-nowrap mt-0.5">{children}</dd>
  </div>
);

// One "career best" card: a big value, a context line (where it happened) and a
// date. The context explains an outlier — a 60-kill game is a high-respawn LTM.
const RecordCard = ({ icon: Icon, label, value, accent, context, sub }) => (
  <div className="bg-gray-800 rounded-xl p-4">
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500">
      <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </div>
    <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
    {context && <p className="text-xs text-gray-400 mt-1 truncate">{context}</p>}
    {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
  </div>
);

// Context line for a single-game record: "mode · map", with a "Won · " prefix on
// the match-level cash record when that tournament was won.
const gameContext = (rec) => (
  <>
    {rec.won && <span className="text-emerald-400 font-semibold">Won · </span>}
    {[rec.mode, rec.mapName].filter(Boolean).join(' · ') || '—'}
  </>
);
const recDate = (rec) => date(rec.date);

// Personal records: single-game bests (kills/deaths/damage/revives), best cash in
// one round vs one whole match, and longest won/lost round streaks. Each def maps
// a model.records[key] to a card; records that are absent are filtered out.
const RECORD_DEFS = [
  { key: 'kills', icon: Target, label: 'Most kills', accent: 'text-white', fmt: (r) => num(r.value), context: gameContext, sub: recDate },
  { key: 'deaths', icon: Skull, label: 'Most deaths', accent: 'text-white', fmt: (r) => num(r.value), context: gameContext, sub: recDate },
  { key: 'damage', icon: Flame, label: 'Most damage', accent: 'text-white', fmt: (r) => num(Math.round(r.value)), context: gameContext, sub: recDate },
  { key: 'revives', icon: HeartPulse, label: 'Most revives', accent: 'text-white', fmt: (r) => num(r.value), context: gameContext, sub: recDate },
  { key: 'cashout', icon: Coins, label: 'Most cash (round)', accent: 'text-yellow-400', fmt: (r) => cash(r.value), context: gameContext, sub: recDate },
  { key: 'payday', icon: Banknote, label: 'Most cash (match)', accent: 'text-yellow-400', fmt: (r) => cash(r.value), context: gameContext, sub: recDate },
  { key: 'winStreak', icon: TrendingUp, label: 'Longest win streak', accent: 'text-emerald-400', fmt: (r) => num(r.value), context: () => 'rounds in a row', sub: recDate },
  { key: 'lossStreak', icon: TrendingDown, label: 'Longest loss streak', accent: 'text-white', fmt: (r) => num(r.value), context: () => 'rounds in a row', sub: recDate },
];

export const CareerPage = () => {
  const { model } = useVaultData();
  const { career, careerModes, identity, ban, meta, records } = model;
  const t = career.total;
  const recordCards = records ? RECORD_DEFS.filter((d) => records[d.key]) : [];

  const [hoveredMode, setHoveredMode] = useState(null);
  const tournWinRate = meta.tournamentsPlayed ? meta.tournamentsWon / meta.tournamentsPlayed : null;
  const totalMatches = careerModes.reduce((s, m) => s + m.matches, 0);
  const segments = careerModes
    .map((m) => ({ key: m.key, label: m.label, value: m.matches, color: MODE_COLOR[m.key] || MODE_COLOR.Other }))
    .filter((s) => s.value > 0);

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader
        icon={User}
        title="Career"
        subtitle={identity.fullName || 'Lifetime overview'}
        mobileCenter
      >
        <dl className="flex items-start justify-center gap-x-6 gap-y-2 flex-wrap text-center sm:justify-end sm:text-left">
          <HeaderFact label="Created">{date(identity.accountCreatedAt)}</HeaderFact>
          <HeaderFact label="Last active">{date(meta.lastActivity)}</HeaderFact>
          <HeaderFact label="Country">
            {identity.countryCode ? (
              <span className="inline-flex items-center gap-1.5">
                <span>{identity.countryCode}</span>
                <span>{isoToFlag(identity.countryCode)}</span>
              </span>
            ) : (
              '—'
            )}
          </HeaderFact>
        </dl>
      </PageHeader>

      {ban.hasActive && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <Ban className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-semibold">
              Account restricted — {ban.active.reason}
              {ban.active.permanent && <span className="ml-2"><Badge tone="red">Permanent</Badge></span>}
            </p>
            <p className="text-sm text-red-200/80 mt-0.5">
              Started {date(ban.active.startsAt, 'd MMM yyyy, HH:mm')}
              {ban.active.endsAt ? ` · ends ${date(ban.active.endsAt)}` : ' · no end date recorded'}.
            </p>
            <p className="text-xs text-red-200/60 mt-1">
              {ban.count > 1 ? `${ban.count} restrictions on record — see ` : 'Full details on the '}
              Account &amp; Bans page.
            </p>
          </div>
        </div>
      )}

      {!career.hasSummary && (
        <Note>No RoundStatSummary snapshot was found, so lifetime totals may be incomplete. Stats below fall back to what is available.</Note>
      )}

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Playtime" value={hours(t.timePlayedMs)} sub={`${num(t.roundsPlayed)} rounds`} />
        <StatCard label="Kills" value={num(t.kills)} sub={`${num(t.deaths)} deaths`} />
        <StatCard label="K/D" value={decimal(t.kd)} accent="text-emerald-400" />
        <StatCard
          label="Tournaments won"
          value={
            <>
              {num(meta.tournamentsWon)}
              {tournWinRate != null && (
                <span className="text-base font-semibold text-emerald-400 ml-1.5">({Math.round(tournWinRate * 100)}%)</span>
              )}
            </>
          }
          sub={`of ${num(meta.tournamentsPlayed)} played`}
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total cash-out" value={`$${num(t.totalCashOut)}`} accent="text-yellow-400" />
        <StatCard label="Revives" value={num(t.revives)} />
        <StatCard label="Damage dealt" value={num(Math.round(t.damage))} />
        <StatCard label="Matches" value={num(meta.matchCount)} sub={`${num(meta.roundCount)} rounds logged`} />
      </div>

      {/* Personal records — single-game bests + biggest tournament payday */}
      {recordCards.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Medal className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Personal records</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {recordCards.map((d) => (
              <RecordCard
                key={d.key}
                icon={d.icon}
                label={d.label}
                value={d.fmt(records[d.key])}
                accent={d.accent}
                context={d.context(records[d.key])}
                sub={d.sub(records[d.key])}
              />
            ))}
          </div>
        </div>
      )}

      {/* Where you played — by game mode */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Where you played</h2>
        </div>

        <Panel>
          {totalMatches === 0 ? (
            <p className="text-sm text-gray-500">No match history to break down by mode.</p>
          ) : (
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <ModeDonut segments={segments} total={totalMatches} hovered={hoveredMode} onHover={setHoveredMode} />
              <div className="flex-1 w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="text-left py-2 pr-3 font-medium">Mode</th>
                      <th className="text-right py-2 px-3 font-medium">Matches</th>
                      <th className="text-right py-2 px-3 font-medium">K/D</th>
                      <th className="text-right py-2 px-3 font-medium">Win&nbsp;%</th>
                      <th className="text-right py-2 pl-3 font-medium">Playtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {careerModes.map((m) => (
                      <tr
                        key={m.key}
                        onPointerEnter={(e) => e.pointerType === 'mouse' && setHoveredMode(m.key)}
                        onPointerLeave={(e) => e.pointerType === 'mouse' && setHoveredMode(null)}
                        onClick={() => setHoveredMode(hoveredMode === m.key ? null : m.key)}
                        className={`border-b border-gray-700/40 last:border-0 cursor-pointer transition-colors ${
                          hoveredMode === m.key ? 'bg-gray-700/40' : ''
                        }`}
                      >
                        <td className="py-2 pr-3">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: MODE_COLOR[m.key] || MODE_COLOR.Other }} />
                            <span className="text-gray-100">{m.label}</span>
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-white">
                          {num(m.matches)}
                          <span className="text-gray-500 text-xs"> · {totalMatches ? Math.round((m.matches / totalMatches) * 100) : 0}%</span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-emerald-300">{decimal(m.kd)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-300">{pct(m.winRate)}</td>
                        <td className="py-2 pl-3 text-right tabular-nums text-gray-300">{hours(m.timeMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};
