import { useState } from 'react';
import { User, Ban, Activity, Medal, Target, Skull, Flame, HeartPulse, Coins, Banknote, TrendingUp, TrendingDown, Gauge } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, Note } from '../components/ui';
import { num, decimal, hours, date, pct, cash, scoreValue, compact } from '../lib/format';
import { isoToFlag } from '../lib/worldgeo';
import { SCORE_TIERS } from '../lib/gameMeta';

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

const SCORE_GRID = 'grid grid-cols-[84px_1fr_60px] sm:grid-cols-[96px_1fr_56px_64px_64px] items-center gap-x-3';

const ScorecardsSection = ({ scorecards }) => {
  const [picked, setPicked] = useState(null);
  const group = scorecards.groups.find((g) => g.key === picked) || scorecards.groups[0];
  const top = SCORE_TIERS[0];
  return (
    <div>
      <div className="flex items-center justify-between gap-x-3 gap-y-1 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Scorecards</h2>
        </div>
        <span className="w-full sm:w-auto text-[11px] text-gray-500 tabular-nums">
          {num(scorecards.rounds)} of {num(scorecards.totalRounds)} rounds · since {date(scorecards.firstMs)}
          {scorecards.unscoredRounds > 0 && ` · ${num(scorecards.unscoredRounds)} without a recorded score`}
        </span>
      </div>
      <Panel>
        {scorecards.groups.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {scorecards.groups.map((g) => (
              <button
                key={g.key}
                onClick={() => setPicked(g.key)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  g === group ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                {g.label} · {num(g.rounds)}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 text-[11px] text-gray-400">
          {SCORE_TIERS.map((t) => (
            <span key={t.name} className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-sm ${t.bg}`} />
              {t.name}
            </span>
          ))}
        </div>

        <div className={`${SCORE_GRID} pb-1.5 text-[10px] uppercase tracking-wider text-gray-500`}>
          <span>Metric</span>
          <span>Share of rounds</span>
          <span className={`hidden sm:block text-right ${top.text}`}>{top.name}</span>
          <span className="text-right">Avg</span>
          <span className="hidden sm:block text-right">Best</span>
        </div>

        <div className="divide-y divide-gray-700/40">
          {group.metrics.map((m) => (
            <div key={m.name} className={`${SCORE_GRID} py-2.5`}>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-gray-200 truncate">{m.name}</span>
                <span className={`sm:hidden block text-[10px] tabular-nums ${top.text}`}>
                  {num(m.tierCounts[0])} {top.name}
                </span>
              </span>
              <div className="flex gap-0.5 h-2.5 rounded overflow-hidden min-w-0" role="img" aria-label={`Tiers for ${m.name}, ${top.name} on the left`}>
                {m.tierCounts.map((c, i) => (
                  <div
                    key={i}
                    className={SCORE_TIERS[i].bg}
                    style={{ width: `${m.rounds ? (c / m.rounds) * 100 : 0}%` }}
                    title={m.rounds ? `${SCORE_TIERS[i].name}: ${num(c)} of ${num(m.rounds)} rounds` : undefined}
                  />
                ))}
              </div>
              <span className={`hidden sm:block text-xs tabular-nums text-right ${top.text}`}>{num(m.tierCounts[0])}</span>
              <span className="text-right">
                <span className="block text-sm font-bold text-white tabular-nums">{scoreValue(m.name, m.avgScore)}</span>
                <span className="sm:hidden block text-[10px] text-gray-500 tabular-nums">best {scoreValue(m.name, m.bestScore)}</span>
              </span>
              <span className="hidden sm:block text-xs text-gray-500 tabular-nums text-right">{scoreValue(m.name, m.bestScore)}</span>
            </div>
          ))}
        </div>

        <Note>
          Embark does not publish the tier cut-offs and they differ by metric, so compare a metric against itself rather
          than against another one. Damage here is Embark’s own score, not the damage total on your match cards.
          {scorecards.unscoredRounds > 0 && (
            <>
              {' '}
              Cards from before Season 10 carry <code>Score</code> 0 on every metric, so Avg and Best leave them out while the tier bars and Ruby
              counts include them.
            </>
          )}
        </Note>
      </Panel>
    </div>
  );
};

export const CareerPage = () => {
  const { model } = useVaultData();
  const { career, careerModes, identity, ban, meta, records } = model;
  const t = career.total;
  const recordCards = records ? RECORD_DEFS.filter((d) => records[d.key]) : [];

  const [hoveredMode, setHoveredMode] = useState(null);
  const tournWinRate = meta.tournamentsPlayed ? meta.tournamentsWon / meta.tournamentsPlayed : null;
  // Counted matches only: preview-build and practice rounds live in match history alone.
  const totalMatches = careerModes.reduce((s, m) => s + m.matches, 0);
  const unc = meta.uncounted;
  const uncountedRounds = unc.previewRounds + unc.practiceRounds;
  // Embark's totals: preview builds wrote their own summaries (left out when found), and
  // practice-range rounds are subtracted from the live one.
  const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
  const previewOut = unc.previewRounds > 0 && unc.previewSummaries > 0;
  const practiceOut = unc.practiceRounds > 0;
  const summaries = plural(unc.previewSummaries, 'lifetime summary', 'lifetime summaries');
  const leftOutLine =
    previewOut && practiceOut
      ? `The totals above leave out ${num(unc.previewRounds + unc.practiceRounds)} rounds: ${num(unc.previewRounds)} played on preview builds, whose ${summaries} ${unc.previewSummaries === 1 ? 'is' : 'are'} left out too, and ${num(unc.practiceRounds)} on the practice range.`
      : previewOut
        ? `The totals above leave out the ${plural(unc.previewRounds, 'round', 'rounds')} you played on preview builds and the ${summaries} those builds wrote.`
        : practiceOut
          ? `The totals above leave out the ${plural(unc.practiceRounds, 'practice-range round', 'practice-range rounds')}.`
          : null;
  const previewOnlyInLog = unc.previewRounds > 0 && unc.previewSummaries === 0;
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
          {career.level && (
            <HeaderFact label="Career rank">
              {num(career.level.rank)}
              {career.level.xp != null && <span className="block text-[10px] font-normal text-gray-500 normal-case tracking-normal mt-0.5">{compact(career.level.xp)} XP</span>}
            </HeaderFact>
          )}
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
              Account restricted: {ban.active.reason}
              {ban.active.permanent && <span className="ml-2"><Badge tone="red">Permanent</Badge></span>}
            </p>
            <p className="text-sm text-red-200/80 mt-0.5">
              Started {date(ban.active.startsAt, 'd MMM yyyy, HH:mm')}
              {ban.active.endsAt ? ` · ends ${date(ban.active.endsAt)}` : ' · no end date recorded'}.
            </p>
            <p className="text-xs text-red-200/60 mt-1">
              {ban.count > 1 ? `${ban.count} restrictions on record, see ` : 'Full details on the '}
              Account &amp; Bans page.
            </p>
          </div>
        </div>
      )}

      {!career.hasSummary && (
        <Note>No <code>RoundStatSummary</code> snapshot in this export, so the lifetime totals below are missing. The modes, records and every other page still come from your round log.</Note>
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
        <StatCard label="Matches" value={num(totalMatches)} sub={`${num(meta.roundCount - unc.previewRounds - unc.practiceRounds)} rounds logged`} />
      </div>
      {(leftOutLine || previewOnlyInLog) && (
        <Note>
          {leftOutLine}
          {previewOnlyInLog &&
            ` The Matches and Tournaments won totals above leave out the ${num(unc.previewRounds)} round${unc.previewRounds === 1 ? '' : 's'} you played on preview builds.`}
        </Note>
      )}

      {/* Personal records — single-game bests + biggest tournament payday */}
      {recordCards.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Medal className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Personal records</h2>
            {(records.botsExcluded > 0 || uncountedRounds > 0) && (
              <span className="text-[11px] text-gray-500 ml-auto text-right">
                {[records.botsExcluded > 0 && `${num(records.botsExcluded)} bot-lobby`, uncountedRounds > 0 && `${num(uncountedRounds)} preview or practice`]
                  .filter(Boolean)
                  .join(' · ')}{' '}
                round{records.botsExcluded + uncountedRounds === 1 ? '' : 's'} left out
              </span>
            )}
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

      {model.scorecards.has && <ScorecardsSection scorecards={model.scorecards} />}

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
