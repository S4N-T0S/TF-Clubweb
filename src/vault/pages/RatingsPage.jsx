import { useMemo, useState } from 'react';
import { Gauge, Trophy, TrendingUp, ChevronDown, Info, Crown, Swords, Target } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, Note, EmptyState } from '../components/ui';
import { num, decimal, date } from '../lib/format';
import { leagueAbbrev, RANK_TIERS, RANKED_POINTS_PER_DIVISION, PERFORMANCE_BONUS_MAX_SCORE } from '../lib/ratings';

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

// Footnote when the two sources disagree, or the rank came from the match log.
const endRankNote = (s) => {
  if (s.endDisagrees)
    return `The season snapshot records ${num(Math.round(s.rankPoints))} RankPoints, while the match-by-match log ends at ${num(Math.round(s.curveEndScore))}. The snapshot is the one shown.`;
  if (s.source === 'rankUpdate')
    return 'Rebuilt from the match-by-match log, because this export didn’t include a season snapshot. Ruby is a top-500 cutoff rather than a score, so a rebuilt rank stops at Diamond 1.';
  return null;
};

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

  // One DISTINCT slot per season, reused by BOTH the extent maths below and the
  // bar loop (they used to fall back differently, i + 1 vs minN + i, so an
  // unresolved season drew in a slot the extent hadn't reserved). Seasons keep
  // their real number; anything unresolved, or colliding with a slot already
  // taken, is pushed past the highest one. Both cases are reachable: an unmapped
  // id resolves to null, and until seasons.js/RANKED_SEASON_IDS learn about a new
  // season its id date-resolves onto the newest known one. Without this, two bars
  // and two axis labels render at identical coordinates.
  const ns = [];
  let nextSlot = Math.max(0, ...seasons.map((s) => s.seasonN ?? 0));
  for (const s of seasons) ns.push(s.seasonN != null && !ns.includes(s.seasonN) ? s.seasonN : ++nextSlot);
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
          const n = ns[i];
          const x = cx(n);
          const idx = s.rankIndex || 0;
          const peak = s.peakIndex || 0;
          if (!s.rankReliable || (!s.played && idx === 0)) {
            // never played ranked this season, or only the shadow engine survived
            return (
              <g key={s.seasonId}>
                {s.rankReliable ? (
                  <circle cx={x} cy={yBase - 3} r="2.5" fill="#4b5563" />
                ) : (
                  <text x={x} y={yBase - 4} textAnchor="middle" style={{ fontSize: '13px', fontWeight: 700 }} fill="#6b7280">?</text>
                )}
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
        <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-gray-600" /> Didn’t play</span>
        <span className="inline-flex items-center gap-1.5"><span className="font-bold text-gray-500">?</span> Rank unknown</span>
      </div>
    </div>
  );
};

// ---- per-season score curves ----------------------------------------------
// One wrapped panel per season rather than a shared career-long axis, so the
// layout holds as seasons pile up. Plotted in points, not the rank ladder:
// everything above Diamond 1 is one index but thousands of points, which would
// flatten the longest histories. The y-scale is shared so panels compare.
const CURVE_W = 120;
const CURVE_H = 56;

const SeasonCurves = ({ seasons }) => {
  const panels = useMemo(() => {
    const curves = seasons.filter((s) => s.curve?.length > 0);
    if (!curves.length) return null;
    let maxScore = 0;
    for (const s of curves) for (const p of s.curve) if (p.score > maxScore) maxScore = p.score;
    // Rounded to a whole division so the bands line up; the floor stops a
    // low-ranked career rendering as a flat line in an empty chart.
    const yMax = Math.max(Math.ceil((maxScore * 1.04) / RANKED_POINTS_PER_DIVISION) * RANKED_POINTS_PER_DIVISION, 12500);
    // Inset by the stroke width, or a score of 0 gets half-clipped at the edge.
    const y = (score) => CURVE_H - 2 - (Math.min(Math.max(score, 0), yMax) / yMax) * (CURVE_H - 4);
    return {
      yMax,
      y,
      list: curves.map((s) => {
        const n = s.curve.length;
        const x = (i) => (n === 1 ? CURVE_W / 2 : (i / (n - 1)) * CURVE_W);
        return {
          key: s.seasonId,
          label: s.seasonLabel,
          // Withheld here too, or this hands back the rank the table refuses.
          // The scores go with it: they resolve to the same rank.
          rank: s.rankReliable ? s.rank : null,
          start: s.rankReliable ? Math.round(s.curveStartScore) : null,
          end: s.rankReliable ? Math.round(s.curveEndScore) : null,
          // The season's own count, so this can't contradict the Matches column.
          // Where a snapshot exists it wins, and it disagrees with the log's row
          // count when the server counted penalised matches differently.
          matches: s.matches ?? s.curveMatches ?? n,
          single: n === 1 ? y(s.curve[0].score) : null,
          pts: s.curve.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' '),
        };
      }),
    };
  }, [seasons]);

  if (!panels) return null;
  const { yMax, y, list } = panels;
  // BANDS are indices, this axis is points: index n covers (n-1)*2500..n*2500.
  const bandScore = (v) => (v - 0.5) * RANKED_POINTS_PER_DIVISION;
  const bands = BANDS.filter((b) => bandScore(b.bot) < yMax);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {list.map((p) => (
        <div key={p.key} className="bg-gray-900/50 rounded-lg p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-gray-200">{p.label}</span>
            {p.rank && <span className={`text-[11px] font-semibold truncate ${p.rank.text}`}>{p.rank.name}</span>}
          </div>
          <svg
            viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
            preserveAspectRatio="none"
            className="w-full h-14 mt-1.5"
            role="img"
            aria-label={
              p.start == null
                ? `${p.label}: ${num(p.matches)} ranked match${p.matches === 1 ? '' : 'es'}`
                : `${p.label}: ${num(p.start)} to ${num(p.end)} RankScore over ${num(p.matches)} match${p.matches === 1 ? '' : 'es'}`
            }
          >
            {bands.map((b) => (
              <rect
                key={b.name}
                x="0"
                y={y(Math.min(bandScore(b.top), yMax))}
                width={CURVE_W}
                height={y(bandScore(b.bot)) - y(Math.min(bandScore(b.top), yMax))}
                fill={b.color}
                opacity="0.12"
              />
            ))}
            {p.single != null ? (
              // A dash, not a dot: the viewBox is stretched, so a circle would
              // render as an ellipse.
              <line x1={CURVE_W / 2 - 7} x2={CURVE_W / 2 + 7} y1={p.single} y2={p.single} stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ) : (
              <polyline points={p.pts} fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <p className="mt-1 text-[10px] text-gray-400 tabular-nums">
            {p.start == null ? <span className="text-gray-600">score withheld</span> : <>{num(p.start)} <span className="text-gray-600">→</span> {num(p.end)}</>}
          </p>
          <p className="text-[10px] text-gray-500">
            {num(p.matches)} match{p.matches === 1 ? '' : 'es'}
          </p>
        </div>
      ))}
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
          This export didn’t include the <code>BucketObject</code> records that hold your hidden MMR and ranked ratings, nor
          the <code>RankUpdate</code> rows that log each ranked match.
        </EmptyState>
      </div>
    );
  }

  const { ranked, hiddenMmr, openSkill } = ratings;
  // Only newer exports carry the log, so its column and chart are conditional.
  const hasCurve = ranked.seasons.some((s) => s.curve?.length > 0);
  const hasReconstructed = ranked.seasons.some((s) => s.source === 'rankUpdate');
  const scoreBonusSeasons = ranked.seasons.filter((s) => s.bonusTotal > 0 && s.bonusMatches > 0);
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
          value={
            ranked.latest ? (
              <RankName info={ranked.latest.rank} />
            ) : (
              // "Never ranked" would contradict the table below when the player
              // DID play but every season came back withheld. Key off `withheld`,
              // NOT `played`: a player can play and legitimately never place.
              <span className="text-gray-500">{ranked.withheld > 0 ? 'Unknown' : 'Never ranked'}</span>
            )
          }
          sub={
            ranked.latest
              ? `${ranked.latest.seasonLabel}${ranked.latest.rpReliable && ranked.latest.rankPoints > 0 ? ` · ${num(Math.round(ranked.latest.rankPoints))} RP` : ''} · ${num(ranked.latest.matches)} matches`
              : ranked.withheld > 0
                ? 'this export didn’t record a usable rank'
                : 'no completed ranked season'
          }
        />
        <StatCard
          label="Peak rank"
          // `peak` is null for THREE reasons: every season withheld, no seasons at
          // all, or the player played and simply never placed. Only the first is
          // "Unknown" — keying off `played` would call an honest never-placed
          // career unrecorded, right above a row showing its Unranked result.
          value={ranked.peak ? <RankName info={ranked.peak.peak} /> : <span className="text-gray-500">{ranked.withheld > 0 ? 'Unknown' : '—'}</span>}
          sub={ranked.peak ? `reached in ${ranked.peak.seasonLabel}` : ranked.withheld > 0 ? 'this export didn’t record a usable rank' : 'never reached a rank'}
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
                  {hasCurve && (
                    <th className="text-left py-2 px-3 font-medium">
                      {/* Native title for the same clipping reason as the Engine header. */}
                      <span
                        className="border-b border-dotted border-gray-500 cursor-help"
                        title="The lowest rank you dropped to during the season, from the match-by-match log. Only newer exports include that log, so seasons without one show a dash."
                      >
                        Low
                      </span>
                    </th>
                  )}
                  <th className="text-right py-2 px-3 font-medium">RankPoints</th>
                  <th className="text-right py-2 px-3 font-medium">Matches</th>
                  <th className="text-right py-2 pl-3 font-medium">
                    {/* Native title, not <Tooltip>: this <th> is inside
                        .table-container too, so on a 1-2 season table the popover
                        clips and inflates scrollHeight into a phantom scrollbar. */}
                    <span
                      className="border-b border-dotted border-gray-500 cursor-help"
                      title="Which rating engine actually drove the ladder that season. S2 ran on OpenSkill, S3 onwards on IVK. Seasons that logged both engines show the one that was live."
                    >
                      Engine
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.seasons.map((s) => {
                  const note = endRankNote(s);
                  return (
                  <tr key={s.seasonId} className="border-b border-gray-700/40 last:border-0">
                    <td className="py-2 pr-3 text-gray-200 font-medium whitespace-nowrap">{s.seasonLabel}</td>
                    <td className="py-2 px-3">
                      {!s.rankReliable ? (
                        // Native title, not <Tooltip>: .table-container clips
                        // absolutely-positioned tooltips (see components/Tooltip.jsx),
                        // and a withheld season is usually the LAST row, where the
                        // popover would fall entirely outside the scroll box.
                        <span
                          className="text-gray-500 border-b border-dotted border-gray-600 cursor-help"
                          title="This export only kept the background rating for this season, which the game didn't rank you on. Its stored tier is unreliable, so it's withheld rather than shown wrong."
                        >
                          Unknown
                        </span>
                      ) : s.played || s.rankIndex > 0 ? (
                        note ? (
                          <span className="border-b border-dotted border-gray-600 cursor-help" title={note}>
                            <RankName info={s.rank} />
                          </span>
                        ) : (
                          <RankName info={s.rank} />
                        )
                      ) : (
                        <span className="text-gray-500">Didn’t play</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {s.rankReliable && s.peakIndex > 0 ? <span className={s.peak.text}>{s.peak.name}</span> : <span className="text-gray-600">—</span>}
                    </td>
                    {hasCurve && (
                      <td className="py-2 px-3">
                        {/* Withheld like End rank: an untrusted season has no floor either. */}
                        {s.lowInfo && s.rankReliable ? (
                          <span
                            className={`${s.lowInfo.text} border-b border-dotted border-gray-600 cursor-help`}
                            title={
                              s.low < s.curveStartScore - 1
                                ? `Dropped as low as ${num(Math.round(s.low))} RankPoints${s.lowMs ? ` on ${date(s.lowMs)}` : ''} before finishing the season.`
                                : `Never went below ${num(Math.round(s.low))} RankPoints, where the season started.`
                            }
                          >
                            {s.lowInfo.name}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    )}
                    <td className="py-2 px-3 text-right tabular-nums text-gray-300">{s.rpReliable && s.rankPoints > 0 ? num(Math.round(s.rankPoints)) : '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-300">{s.matches > 0 ? num(s.matches) : '—'}</td>
                    <td className="py-2 pl-3 text-right">
                      {/* The column means "the engine that drove the ladder". A withheld
                          row's record is the background one, so it can't answer that. */}
                      {s.rankReliable ? <Badge tone={s.engine === 'openskill' ? 'blue' : 'gray'}>{s.engineLabel}</Badge> : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Note>
            Rank shown is where you finished each season, from the recorded <code>leagueRankIndex</code>, with your peak that
            season alongside. The ranked engine changed hands partway through: S2 ran on OpenSkill, S3 was the first season
            on IVK, and S4 onwards uses the IVK tournament ladder. Seasons
            that logged both engines keep only the one that was live, because the other carried on in the background on its own
            point scale, which can read well above or below the real rank. <strong>RankPoints</strong> is the in-game RankScore from S3
            onward, but the ladder was rescaled at S4: S3 ran 2,500 points per division up to Platinum 4 and 5,000 per
            division above it, where S4 onwards is a flat 2,500. So compare it inside a season rather than across S3 to S4. S2’s OpenSkill points were an internal number never shown in-game, so
            they’re left out. The chart tracks the rank ladder instead, which stays comparable throughout.
            {hasCurve && ' Newer exports also log every ranked match individually, which is where the Low column comes from: the snapshot only keeps where you finished and how high you got, never how far you fell.'}
            {hasReconstructed &&
              ' This export has no season snapshots at all, so the ranks above were rebuilt from that match log. The end-of-season scores match the published leaderboard, but Ruby is a top-500 cutoff rather than a score, so a rebuilt rank stops at Diamond 1.'}
            {ranked.seedsDropped > 0 && ' Empty placeholder ratings (and, for multi-account exports, a second account’s untouched ratings) are de-duplicated to your real progression.'}
            {ranked.withheld > 0 && ' A season marked “Unknown” kept only the background rating, whose stored tier can sit well above or below the real one, so it’s withheld rather than shown wrong.'}
            {ranked.curveParked > 0 && ` ${ranked.curveParked} season${ranked.curveParked === 1 ? '' : 's'} of match history couldn’t be tied to a known season and ${ranked.curveParked === 1 ? 'is' : 'are'} left out.`}
          </Note>
        </Panel>
      )}

      {/* Within-season progression, from the per-match log */}
      {hasCurve && (
        <Panel title="RankScore within each season">
          <SeasonCurves seasons={ranked.seasons} />
          {/* The performance score isn't in the export, only the points it paid,
              recovered as the gain minus the flat placement value. */}
          {scoreBonusSeasons.length > 0 && (
            <p className="mt-3 text-[11px] text-gray-400">
              <span className="text-emerald-300">Earned for your own play:</span>{' '}
              {scoreBonusSeasons
                .map((s) => `${s.seasonLabel} +${num(s.bonusTotal)} over ${num(s.bonusMatches)} match${s.bonusMatches === 1 ? '' : 'es'}`)
                .join(' · ')}
              . From S11 the game tops each result up based on how you personally performed, so this is the part your own
              play earned rather than where your team finished; it shows per match in Match history. It stops paying once
              you reach Diamond — in the exports we can check, no match starting at or above{' '}
              {num(PERFORMANCE_BONUS_MAX_SCORE)} has received one.
              The score itself isn’t in the export, only the points it was worth.
            </p>
          )}
          <Note>
            One panel per season, each running left to right through every rated match you played that season, on a shared
            scale so they compare directly. Every season restarts you well below where you finished — for most of the
            game’s life placement matches could not put you above Gold 1 however well you did, and the ceiling has only
            been raised recently — so the climb, not the starting point, is what these show. The log starts at S4, so
            earlier ranked seasons have no curve at all, but from there it holds virtually every rated match. Points are
            only comparable within S4 onwards, where a division is a flat {num(RANKED_POINTS_PER_DIVISION)}.
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
                        {/* Native title for the same reason as the ranked table's
                            headers: this <th> sits in a .table-container, which
                            clips the popover and inflates scrollHeight on a short
                            table. This was the page's last clipping tooltip. */}
                        <span
                          className="border-b border-dotted border-gray-500 cursor-help"
                          title="OpenSkill's conservative skill estimate (μ − 3σ): the value that ladders typically sort on."
                        >
                          Conservative
                        </span>
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
