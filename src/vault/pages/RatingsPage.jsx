import { useState } from 'react';
import { Gauge, Trophy, TrendingUp, ChevronDown, Info, Crown, Swords, Target } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, Note, EmptyState, Tooltip } from '../components/ui';
import { num, decimal, date } from '../lib/format';
import { leagueAbbrev, RANK_TIERS } from '../lib/ratings';

// Coloured rank name (Bronze..Ruby), with a swatch dot.
const RankName = ({ info, className = '' }) => (
  <span className={`font-bold whitespace-nowrap ${info.text} ${className}`}>
    <span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1.5" style={{ background: info.color }} />
    {info.name}
  </span>
);

// ---- ranked-rank-across-seasons chart -------------------------------------
// Vertical bars = end-of-season rank, drawn over coloured tier bands. A thin
// "wick" with a cap marks the season's PEAK rank when it beat the final one.
// The y-axis is the leagueRankIndex (0..21 = Unranked..Ruby), the one metric
// that's comparable across seasons even as the RP scale/engine changed.
const BANDS = [
  { name: 'Bronze', color: '#b45309', top: 4.5, bot: 0.5, label: 2.5 },
  { name: 'Silver', color: '#d1d5db', top: 8.5, bot: 4.5, label: 6.5 },
  { name: 'Gold', color: '#facc15', top: 12.5, bot: 8.5, label: 10.5 },
  { name: 'Platinum', color: '#67e8f9', top: 16.5, bot: 12.5, label: 14.5 },
  { name: 'Diamond', color: '#60a5fa', top: 20.5, bot: 16.5, label: 18.5 },
  { name: 'Ruby', color: '#dc2626', top: 22, bot: 20.5, label: 21.25 },
];

const RankedChart = ({ seasons }) => {
  const W = 760;
  const H = 300;
  const ml = 70;
  const mr = 16;
  const mt = 10;
  const mb = 28;
  const yMax = 22;
  const x0 = ml;
  const x1 = W - mr;
  const yTop = mt;
  const yBase = H - mb;
  const y = (idx) => yBase - (Math.max(0, Math.min(idx, yMax)) / yMax) * (yBase - yTop);

  const ns = seasons.map((s, i) => s.seasonN ?? i + 1);
  const minN = Math.min(...ns);
  const maxN = Math.max(...ns);
  const slots = Math.max(1, maxN - minN + 1);
  const slotW = (x1 - x0) / slots;
  const barW = Math.min(46, slotW * 0.62);
  const cx = (n) => x0 + slotW * (n - minN + 0.5);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Ranked rank across seasons">
        {/* tier bands */}
        {BANDS.map((b) => (
          <g key={b.name}>
            <rect x={x0} y={y(b.top)} width={x1 - x0} height={y(b.bot) - y(b.top)} fill={b.color} opacity="0.12" />
            <line x1={x0} x2={x1} y1={y(b.bot)} y2={y(b.bot)} stroke={b.color} strokeOpacity="0.18" strokeWidth="1" />
            <text x={x0 - 8} y={y(b.label) + 3} textAnchor="end" style={{ fontSize: '10px', fontWeight: 600 }} fill={b.color} opacity="0.85">
              {b.name}
            </text>
          </g>
        ))}

        {/* bars + peak wicks */}
        {seasons.map((s, i) => {
          const n = s.seasonN ?? minN + i;
          const x = cx(n);
          const idx = s.rankIndex || 0;
          const peak = s.peakIndex || 0;
          if (!s.played && idx === 0) {
            // never played ranked this season
            return (
              <g key={s.seasonId}>
                <circle cx={x} cy={yBase - 3} r="2.5" fill="#4b5563" />
                <text x={x} y={H - 9} textAnchor="middle" style={{ fontSize: '11px' }} fill="#6b7280">{s.seasonLabel}</text>
              </g>
            );
          }
          const info = s.rank;
          const barTop = idx > 0 ? y(idx) : yBase - 6; // unranked-but-played = short stub
          const fill = idx > 0 ? info.color : '#6b7280';
          return (
            <g key={s.seasonId}>
              <rect x={x - barW / 2} y={barTop} width={barW} height={yBase - barTop} rx="3" fill={fill} opacity={idx > 0 ? 0.92 : 0.55} />
              {/* peak wick (only when the peak beat the final rank) */}
              {peak > idx && (
                <g>
                  <line x1={x} x2={x} y1={y(peak)} y2={barTop} stroke={s.peak.color} strokeWidth="2" />
                  <line x1={x - barW / 2 - 3} x2={x + barW / 2 + 3} y1={y(peak)} y2={y(peak)} stroke={s.peak.color} strokeWidth="2.5" />
                </g>
              )}
              {/* abbrev label above bar */}
              <text x={x} y={(peak > idx ? y(peak) : barTop) - 5} textAnchor="middle" style={{ fontSize: '11px', fontWeight: 700 }} fill={idx > 0 ? info.color : '#9ca3af'}>
                {leagueAbbrev(idx)}
              </text>
              <text x={x} y={H - 9} textAnchor="middle" style={{ fontSize: '11px', fontWeight: 600 }} fill="#d1d5db">{s.seasonLabel}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-gray-400" /> End-of-season rank</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-gray-300" /> Season peak</span>
      </div>
    </div>
  );
};

export const RatingsPage = () => {
  const { model } = useVaultData();
  const { ratings } = model;
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!ratings?.has) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <PageHeader icon={Gauge} title="Skill Rating" subtitle="Hidden matchmaking ratings & ranked history" />
        <EmptyState icon={Gauge} title="No skill-rating data in this export">
          This export didn’t include the <code>BucketObject</code> records that hold your hidden MMR and ranked ratings.
        </EmptyState>
      </div>
    );
  }

  const { ranked, hiddenMmr, openSkill } = ratings;
  const casual = hiddenMmr.find((m) => m.ratingId === 'IVKCasualRating');
  const worldTour = hiddenMmr.find((m) => m.ratingId === 'IVKWorldTourRating');

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader icon={Gauge} title="Skill Rating" subtitle="Hidden matchmaking ratings & ranked history" />

      {/* What this is */}
      <Panel>
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-300 leading-relaxed">
            THE FINALS quietly rates your skill in every playlist, even casual ones, and uses that rating to put you in
            &quot;balanced&quot; lobbies. In <strong className="text-white">Ranked</strong> it becomes the league rank and RankPoints you
            see on screen; everywhere else it stays hidden. Your <strong className="text-white">Ranked</strong> rating resets
            every season, while your <strong className="text-white">casual and World Tour</strong> ratings carry across your
            whole account.
          </p>
        </div>
      </Panel>

      {/* Headline standing */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Latest ranked rank"
          value={ranked.latest ? <RankName info={ranked.latest.rank} /> : <span className="text-gray-500">Never ranked</span>}
          sub={ranked.latest ? `${ranked.latest.seasonLabel}${ranked.latest.rpReliable && ranked.latest.rankPoints > 0 ? ` · ${num(Math.round(ranked.latest.rankPoints))} RP` : ''} · ${num(ranked.latest.matches)} matches` : 'no completed ranked season'}
        />
        <StatCard
          label="Peak rank"
          value={ranked.peak ? <RankName info={ranked.peak.peak} /> : <span className="text-gray-500">—</span>}
          sub={ranked.peak ? `reached in ${ranked.peak.seasonLabel}` : 'never reached a rank'}
        />
        <StatCard
          label="Casual MMR"
          value={casual?.mu != null ? num(Math.round(casual.mu)) : '—'}
          accent="text-emerald-400"
          sub={casual ? `${num(casual.matches)} matches rated` : 'not recorded'}
        />
        <StatCard
          label="World Tour MMR"
          value={worldTour?.mu != null ? num(Math.round(worldTour.mu)) : '—'}
          accent="text-purple-300"
          sub={worldTour ? `${num(worldTour.matches)} matches rated` : 'not recorded'}
        />
      </div>

      {/* Ranked history */}
      {ranked.seasons.length > 0 && (
        <Panel title="Ranked rank by season">
          {ranked.peak && (
            <div className="flex items-center gap-2 mb-4 text-sm">
              <Crown className="w-4 h-4 text-yellow-400 shrink-0" />
              <span className="text-gray-300">
                Career peak: <RankName info={ranked.peak.peak} /> in {ranked.peak.seasonLabel}
              </span>
            </div>
          )}

          <RankedChart seasons={ranked.seasons} />

          <div className="table-container mt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 pr-3 font-medium">Season</th>
                  <th className="text-left py-2 px-3 font-medium">End rank</th>
                  <th className="text-left py-2 px-3 font-medium">Peak</th>
                  <th className="text-right py-2 px-3 font-medium">RankPoints</th>
                  <th className="text-right py-2 px-3 font-medium">Matches</th>
                  <th className="text-right py-2 pl-3 font-medium">
                    <Tooltip label="Which rating engine logged this season. S2–S3 ran on OpenSkill; S4 onwards on IVK, so RankPoints aren't directly comparable across that change.">
                      <span className="border-b border-dotted border-gray-500 cursor-help">Engine</span>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.seasons.map((s) => (
                  <tr key={s.seasonId} className="border-b border-gray-700/40 last:border-0">
                    <td className="py-2 pr-3 text-gray-200 font-medium whitespace-nowrap">{s.seasonLabel}</td>
                    <td className="py-2 px-3">
                      {s.played || s.rankIndex > 0 ? <RankName info={s.rank} /> : <span className="text-gray-500">Didn’t play</span>}
                    </td>
                    <td className="py-2 px-3">
                      {s.peakIndex > 0 ? <span className={s.peak.text}>{s.peak.name}</span> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-300">{s.rpReliable && s.rankPoints > 0 ? num(Math.round(s.rankPoints)) : '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-300">{s.matches > 0 ? num(s.matches) : '—'}</td>
                    <td className="py-2 pl-3 text-right">
                      <Badge tone={s.engine === 'openskill' ? 'blue' : 'gray'}>{s.engineLabel}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>
            Rank shown is where you finished each season, with your peak that season alongside. <strong>RankPoints</strong> is
            listed from S4 onward, where it’s the in-game ranked score. S2–S3 ran on an older rating system
            (<Badge tone="blue">OpenSkill</Badge>, and S3 was a one-off Terminal Attack ranked season) whose stored points are
            an internal value on a different scale, not the figure shown in-game, so they’re left out. The chart tracks the
            rank ladder instead, which stays comparable throughout. The season ranks themselves come from the recorded
            <code> leagueRankIndex</code>.
            {ranked.seedsDropped > 0 && ' Empty placeholder ratings (and, for multi-account exports, a second account’s untouched ratings) are de-duplicated to your real progression.'}
          </Note>
        </Panel>
      )}

      {/* Hidden MMR for non-ranked playlists */}
      {hiddenMmr.length > 0 && (
        <Panel title="Hidden MMR — casual & other playlists">
          <p className="text-sm text-gray-400 leading-relaxed mb-4">
            Unlike Ranked, these don’t reset each season. Each one is a single rating the game keeps refining across your whole
            account, so the number is where it stands today (the date shows when it last changed). They’re never shown anywhere
            in-game.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {hiddenMmr.map((m) => (
              <div key={m.ratingId} className="bg-gray-900/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  {m.ratingId === 'IVKWorldTourRating' ? <Trophy className="w-4 h-4 text-purple-300" /> : m.ratingId === 'IVKCasualAttackDefendRating' ? <Target className="w-4 h-4 text-emerald-300" /> : <Swords className="w-4 h-4 text-emerald-300" />}
                  <span className="text-sm font-semibold text-gray-200">{m.label}</span>
                </div>
                <p className="text-3xl font-bold text-white tabular-nums">{m.mu != null ? num(Math.round(m.mu)) : '—'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{num(m.matches)} matches rated{m.updatedMs ? ` · updated ${date(m.updatedMs)}` : ''}</p>
                <p className="text-[11px] text-gray-500 mt-2 leading-snug">{m.desc}</p>
              </div>
            ))}
          </div>
          <Note>
            There’s no public scale for these and no league or badge attached. A higher number just means the game rates you
            above the average player in that mode, and that’s what it uses to choose who you’re matched with. Beyond “higher is
            better” the raw value has no in-game meaning; it only matters relative to everyone else.
          </Note>
        </Panel>
      )}

      {/* OpenSkill model (advanced) */}
      {openSkill.length > 0 && (
        <Panel>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
            aria-expanded={showAdvanced}
          >
            <span className="inline-flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Earlier skill ratings (OpenSkill)</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {showAdvanced && (
            <div className="mt-4">
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                In earlier seasons THE FINALS rated skill with <strong className="text-gray-200">OpenSkill</strong>, an
                open-source system (later revised to a “V2”). These values stopped updating once the game moved everyone onto
                the current ratings above, so they’re a frozen snapshot of the older system. The “last updated” column shows
                when each was retired. OpenSkill describes your skill as two numbers per playlist:{' '}
                <strong className="text-gray-200">μ (mu)</strong>, its best guess at your skill, and{' '}
                <strong className="text-gray-200">σ (sigma)</strong>, how unsure it still was. A high σ means few games and an
                unsettled rating; it shrinks as you play.
              </p>
              <div className="table-container">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="text-left py-2 pr-3 font-medium">Playlist</th>
                      <th className="text-right py-2 px-3 font-medium">Skill (μ)</th>
                      <th className="text-right py-2 px-3 font-medium">Uncertainty (σ)</th>
                      <th className="text-right py-2 px-3 font-medium">
                        <Tooltip label="OpenSkill's conservative skill estimate (μ − 3σ): the value that ladders typically sort on.">
                          <span className="border-b border-dotted border-gray-500 cursor-help">Conservative</span>
                        </Tooltip>
                      </th>
                      <th className="text-right py-2 px-3 font-medium">Matches</th>
                      <th className="text-right py-2 pl-3 font-medium">Last updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openSkill.map((o) => (
                      <tr key={o.ratingId} className="border-b border-gray-700/40 last:border-0">
                        <td className="py-2 pr-3">
                          <span className="text-gray-200">{o.label}</span>
                          <span className="block text-[11px] text-gray-500">{o.desc}</span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-white">{o.mu != null ? decimal(o.mu, 2) : '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-400">{o.sigma != null ? `± ${decimal(o.sigma, 2)}` : '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-emerald-300">{o.conservative != null ? decimal(o.conservative, 2) : '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-400">{o.matches > 0 ? num(o.matches) : '—'}</td>
                        <td className="py-2 pl-3 text-right tabular-nums text-gray-500 whitespace-nowrap">{o.updatedMs ? date(o.updatedMs) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Note>
                Both an original and a “V2” OpenSkill value can exist for the same playlist as the method was revised; the
                most-played record is shown for each. They track the same hidden skill as the ratings above, just with the older
                system, so treat them as history rather than your current standing.
              </Note>
            </div>
          )}
        </Panel>
      )}

      {/* Rank ladder legend */}
      <Panel title="The rank ladder">
        <div className="flex flex-wrap gap-2">
          {RANK_TIERS.map((t) => (
            <span key={t.name} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-900/60 ${t.text}`}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
              {t.name}
            </span>
          ))}
        </div>
        <Note>
          Each tier except Ruby has four divisions (4 is the lowest, 1 the highest), climbing Bronze 4 → Diamond 1 → Ruby
          (top 500). This matches the rank colours used across the rest of the site.
        </Note>
      </Panel>
    </div>
  );
};
