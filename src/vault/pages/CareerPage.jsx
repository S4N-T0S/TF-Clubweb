import { useState } from 'react';
import { User, Ban, Activity, BadgeDollarSign } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, Note, Tooltip } from '../components/ui';
import { num, decimal, hours, date, pct } from '../lib/format';

// One colour per named game mode (shared by the pie + the per-mode table)
const MODE_COLOR = {
  Ranked: '#eab308', // yellow
  'World Tour': '#a855f7', // purple
  'Cash Out': '#10b981', // emerald
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
                  style={{ cursor: 'pointer', transition: 'opacity 0.15s, stroke-width 0.15s' }}
                  onMouseEnter={() => onHover(s.key)}
                  onMouseLeave={() => onHover(null)}
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

const Row = ({ label, value }) => (
  <div className="flex justify-between py-1.5 border-b border-gray-700/50 last:border-0 text-sm">
    <span className="text-gray-400">{label}</span>
    <span className="text-white font-medium">{value}</span>
  </div>
);

export const CareerPage = () => {
  const { model } = useVaultData();
  const { career, careerModes, identity, ban, meta } = model;
  const t = career.total;

  const [hoveredMode, setHoveredMode] = useState(null);
  const tournWinRate = meta.tournamentsPlayed ? meta.tournamentsWon / meta.tournamentsPlayed : null;
  const totalMatches = careerModes.reduce((s, m) => s + m.matches, 0);
  const segments = careerModes
    .map((m) => ({ key: m.key, label: m.label, value: m.matches, color: MODE_COLOR[m.key] || MODE_COLOR.Other }))
    .filter((s) => s.value > 0);

  const spender = identity.spender?.value
    ? (
      <Tooltip
        label={
          <>
            Embark’s backend marks this account with <code className="text-yellow-300">is_spender = true</code> — an internal
            flag for whether you’ve ever spent real money. Oddly, it rides along in your data export.
          </>
        }
      >
        <BadgeDollarSign className="w-5 h-5 text-yellow-400" aria-label="Account flagged as a spender" />
      </Tooltip>
    )
    : null;

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader
        icon={User}
        title="Career"
        subtitle={
          <span className="inline-flex items-center gap-2 align-middle">
            <span>{identity.fullName || 'Lifetime overview'}</span>
            {spender}
          </span>
        }
      />

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
                        onMouseEnter={() => setHoveredMode(m.key)}
                        onMouseLeave={() => setHoveredMode(null)}
                        className={`border-b border-gray-700/40 last:border-0 cursor-default transition-colors ${
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
          <Note>
            Game-mode figures are derived from your match history (one match = one session) — the only per-mode source in the
            export. The single authoritative ranked/casual split (from the lifetime summary) is{' '}
            <span className="text-gray-300">{num(career.ranked.roundsPlayed)} ranked</span> ·{' '}
            <span className="text-gray-300">{num(career.casual.roundsPlayed)} casual</span> ·{' '}
            <span className="text-gray-300">{num(career.otherRoundsPlayed)} other</span> rounds. Win&nbsp;% is per round.
          </Note>
        </Panel>
      </div>

      {/* Identity quick facts */}
      <Panel title="Account">
        <div className="grid sm:grid-cols-2 gap-x-8">
          <Row label="Embark account created" value={date(identity.accountCreatedAt)} />
          <Row label="Last activity" value={date(meta.lastActivity, 'd MMM yyyy, HH:mm')} />
          <Row label="Country" value={identity.countryCode || '—'} />
          <Row label="Linked platforms" value={num(model.linkedAccounts.length)} />
          <Row label="Players you reported" value={num(model.reports.count)} />
        </div>
      </Panel>
    </div>
  );
};
