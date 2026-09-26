import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Gauge, Trophy, TrendingUp, ChevronDown, ChevronRight, Crown, Swords, Target, Maximize2 } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, Note, EmptyState } from '../components/ui';
import { VaultGraphModal } from '../components/VaultGraphModal';
import { VaultMatchModal } from '../components/VaultMatchModal';
import { Pagination } from '../../components/Pagination';
import { DEFAULT_GRAPH_SETTINGS } from '../lib/rankChart';
import { num, decimal, date, ordinal } from '../lib/format';
import { leagueAbbrev, RANK_TIERS, RANKED_POINTS_PER_DIVISION, PERFORMANCE_BONUS_MAX_SCORE } from '../lib/ratings';
import { sponsorLogo } from '../lib/gameMeta';

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
    return `Your end-of-season record says ${num(Math.round(s.rankPoints))} RankScore. The match-by-match log of your ranked games ends the season on ${num(Math.round(s.curveEndScore))}. The record is what’s shown here.`;
  if (s.source === 'rankUpdate')
    return 'This export has no end-of-season record for this season, so the rank was worked out from your match-by-match log instead. Ruby is the top 500 players rather than a score, so a rank worked out this way stops at Diamond 1.';
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

// World Tour record: where a Season 3 badge was read from, and which log count a
// season's FinalsWon matches.
const s3BadgeTip = (b) => {
  if (b.basis === 'finalsWins') {
    return b.level === 1
      ? 'Read from Finals won: 63 tournament wins in the World Tour Finals stage made Emerald 1 in Season 3 (Update 3.10.0).'
      : 'Read from Finals won: 3 tournament wins in the World Tour Finals stage made Emerald 4 and 63 made Emerald 1 (Update 3.10.0), and the steps between were never published.';
  }
  if (b.basis === 'finalsStage') return 'Read from your rounds in the World Tour Finals stage, which opened at Gold 1, the top of Season 3’s points ladder.';
  return undefined;
};
const finalsWonTitle = (s) => {
  const n = s.logCounts[s.finalsWonMatch];
  const plural = n === 1 ? '' : 's';
  if (s.finalsWonMatch === 'finalsStageWins') return `Matches the ${num(n)} World Tour tournament${plural} your log shows you won in the Finals stage.`;
  if (s.finalsWonMatch === 'tournamentsWon') return `Matches the ${num(n)} World Tour and Ranked tournament${plural} your log shows you won.`;
  return `Matches the ${num(n)} World Tour and Ranked round${plural} your log shows you won, not tournaments.`;
};

const WtStopRow = ({ st }) => (
  <div className="rounded-lg bg-gray-950/45 px-3 py-2">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3">
      <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold text-gray-100 break-words">
          {st.stop != null ? `Stop ${st.stop}` : st.event != null ? `Event ${st.event}` : 'Unknown stop'}
          {st.stopName && <span className="font-normal text-gray-300"> · {st.stopName}</span>}
        </span>
        {st.sponsors.map((sp) => {
          const logo = sponsorLogo(sp);
          return (
            <Badge key={sp} tone="gray">
              {logo && <img src={logo} alt="" className="h-3 w-auto max-w-[56px] object-contain" />}
              {sp}
            </Badge>
          );
        })}
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-2 gap-y-1 sm:gap-6 flex-wrap shrink-0 text-right">
        {st.tournaments > 0 && (
          <>
            <div className="w-14">
              <p className="text-[10px] uppercase text-gray-400">Rounds</p>
              <p className="text-sm font-semibold text-gray-100 tabular-nums">{num(st.rounds)}</p>
            </div>
            <div className="w-20">
              <p className="text-[10px] uppercase text-gray-400">Tournaments</p>
              <p className="text-sm font-semibold text-gray-100 tabular-nums">{num(st.tournaments)}</p>
            </div>
            <div className="w-10">
              <p className="text-[10px] uppercase text-gray-400">Won</p>
              <p className="text-sm font-semibold text-gray-100 tabular-nums">{num(st.tournamentsWon)}</p>
            </div>
          </>
        )}
        {st.fans != null && (
          <div className="min-w-16">
            <p className="text-[10px] uppercase text-gray-400">Fans</p>
            <p className="text-sm font-semibold text-gray-100 tabular-nums">{num(st.fans)}</p>
          </div>
        )}
      </div>
    </div>
    {st.weeks.length > 0 && (
      <ul className="mt-1.5 pl-3 border-l border-gray-700 space-y-1">
        {st.weeks.map((w, i) => (
          <li key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3 text-xs">
            <span className="min-w-0 break-words text-gray-300">
              {w.weeks.length > 1 ? `Weeks ${w.weeks[0]} to ${w.weeks.at(-1)}` : `Week ${w.weeks[0]}`}
              {w.weekName && ` · ${w.weekName}`}
            </span>
            <span className="shrink-0 tabular-nums text-gray-400">
              {num(w.tournaments)} tournament{w.tournaments === 1 ? '' : 's'} · {num(w.tournamentsWon)} won
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const SponsorTag = ({ id, name, logo, fans, official = false, noLevels = false }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
      official ? 'text-gray-400' : 'bg-gray-700 font-medium text-gray-100'
    }`}
  >
    {logo && <img src={logo} alt="" className="h-3.5 w-auto max-w-[64px] object-contain" />}
    {name ?? 'Unnamed sponsor'}
    {name == null && id && <span className="font-mono text-[10px] font-normal text-gray-400">{id}</span>}
    {fans != null && <span className="font-normal tabular-nums text-gray-400">{num(fans)}</span>}
    {noLevels && <span className="text-gray-500">no new levels</span>}
  </span>
);

const SponsorsPanel = ({ sponsors, wtRecord }) => {
  const { seasons, sponsors: tracks, signed, ratesSeason } = sponsors;
  const hasCareer = seasons.some((s) => s.era === 'career');
  const hasJourney = seasons.some((s) => s.era === 'journey');
  const signedTrack = tracks.find((t) => t.signed);
  const sized = tracks.filter((t) => t.length > 0);
  const completeCount = sized.filter((t) => t.complete).length;
  const emptyCount = tracks.filter((t) => t.empty).length;
  const hasUnnamed = [signed, ...tracks, ...seasons.flatMap((s) => s.bySponsor)].some((x) => x && !x.name);
  const hasOfficial = seasons.some((s) => s.official.length > 0);
  const hasCovered = tracks.some((t) => t.nextLevelCovered);
  const hasComplete = tracks.some((t) => t.complete);
  const stopFans = new Map((wtRecord?.seasons ?? []).map((w) => [w.n, w.stops.reduce((a, x) => a + (x.fans ?? 0), 0)]));
  const addsUp = hasJourney && wtRecord != null && seasons.every((s) => s.era !== 'journey' || stopFans.get(s.n) === s.fans);
  const newest = seasons[0]?.n;
  const oldest = seasons.at(-1)?.n;

  return (
    <Panel title="Sponsors">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {(signed || hasJourney) && (
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Currently signed</p>
            {signed ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {signed.logo && <img src={signed.logo} alt="" className="h-6 w-auto max-w-[100px] object-contain" />}
                <span className="text-xl font-bold text-white">{signed.name ?? 'Unnamed sponsor'}</span>
              </p>
            ) : (
              <p className="text-xl font-bold text-gray-500 mt-1">None</p>
            )}
            {signedTrack?.level != null && (
              <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                Level {num(signedTrack.level)}
                {signedTrack.length > 0 && ` of ${num(signedTrack.length)}`}
              </p>
            )}
          </div>
        )}
        {sized.length > 0 && (
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Tracks complete</p>
            <p className="text-xl font-bold text-white mt-1 tabular-nums">
              {num(completeCount)} of {num(sized.length)}
            </p>
            {emptyCount > 0 && <p className="text-[11px] text-gray-500 mt-0.5">{num(emptyCount)} with no fans</p>}
          </div>
        )}
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Total fans</p>
          <p className="text-xl font-bold text-white mt-1 tabular-nums">{num(sponsors.totalFans)}</p>
          {newest != null && <p className="text-[11px] text-gray-500 mt-0.5">{oldest === newest ? `Season ${newest}` : `Seasons ${oldest} to ${newest}`}</p>}
        </div>
      </div>

      {tracks.length > 0 && (
        <>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">By sponsor</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            {tracks.map((t) => {
              const next = (t.level ?? 0) + 1;
              return (
                <div key={t.id} className={`rounded-lg p-3 ${t.empty ? 'bg-gray-900/30' : 'bg-gray-900/50'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {t.logo && <img src={t.logo} alt="" className="h-6 w-auto max-w-[110px] object-contain shrink-0" />}
                    <span className="font-semibold text-gray-100">{t.name ?? 'Unnamed sponsor'}</span>
                    {t.signed && <Badge tone="emerald">Signed</Badge>}
                    {t.complete && <Badge tone="blue">Complete</Badge>}
                    {t.empty && <Badge tone="gray">No fans</Badge>}
                    {t.level != null && (
                      <span className="ml-auto text-xs font-semibold text-gray-300 tabular-nums whitespace-nowrap">
                        Level {num(t.level)}
                        {t.length > 0 && ` of ${num(t.length)}`}
                      </span>
                    )}
                  </div>
                  {!t.name && <p className="mt-0.5 font-mono text-[10px] text-gray-500">{t.id}</p>}
                  {t.length > 0 ? (
                    <div className="mt-2 h-1.5 rounded-full bg-gray-700/50 overflow-hidden" aria-hidden="true">
                      <div className={`h-full rounded-full ${t.complete ? 'bg-blue-400/70' : 'bg-gray-400'}`} style={{ width: `${Math.min(100, ((t.level ?? 0) / t.length) * 100)}%` }} />
                    </div>
                  ) : (
                    t.length == null && <p className="mt-2 text-[11px] text-gray-500">Track length unknown</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    {!t.empty && <span className="text-gray-400">{num(t.fans)} fans</span>}
                    {t.nextLevelCovered ? (
                      <span className="text-gray-400">Banked fans already cover level {num(next)}</span>
                    ) : (
                      t.toNext != null && <span className="text-gray-400">{num(t.toNext)} fans to level {num(next)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {seasons.length > 0 && (
        <>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">By season</p>
          <ul className="space-y-2 mb-5">
            {seasons.map((s) => (
              <li key={s.n} className="rounded-lg bg-gray-900/50 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-gray-100 whitespace-nowrap">Season {s.n}</span>
                  <span className="ml-auto font-bold text-white tabular-nums whitespace-nowrap">{num(s.fans)} fans</span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-gray-500">You</span>
                  <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                    {s.bySponsor.length === 0 ? (
                      <span className="text-xs text-gray-500">No sponsor chosen</span>
                    ) : (
                      s.bySponsor.map((b) => <SponsorTag key={b.id} id={b.id} name={b.name} logo={b.logo} fans={s.bySponsor.length > 1 ? b.fans : null} />)
                    )}
                    {s.level != null && s.bySponsor.length > 0 && <span className="text-xs text-gray-500">Level {num(s.level)}</span>}
                    {s.stopCount > 0 && (
                      <span className="text-xs text-gray-500">
                        {num(s.stopCount)} stop{s.stopCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>
                {s.official.length > 0 && (
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-gray-500">Official</span>
                    <div className="min-w-0 flex flex-wrap items-center gap-y-0.5">
                      {s.official.map((o) => (
                        <SponsorTag key={o.name} name={o.name} logo={o.logo} official noLevels={!o.addedLevels} />
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <Note>
        {hasCareer && (
          <>
            Seasons 4 to 8 come from <code>player_career</code>, which records the level the chosen sponsor had reached by the end of each season.{' '}
          </>
        )}
        {hasJourney && (
          <>
            {hasCareer ? 'Later seasons' : 'Every season'} and the By sponsor list come from <code>sponsor_journey</code>.{' '}
          </>
        )}
        The export stores sponsors as ids, and the names come from a list the vault keeps.
        {hasUnnamed && ' An id missing from that list shows as Unnamed sponsor, with no known track length.'}
        {hasOfficial && ' Each season’s official sponsors, and whether they added levels, come from thefinals.wiki and Embark’s patch notes.'}
        {sized.length > 0 &&
          ratesSeason != null &&
          ` Track lengths${tracks.some((t) => t.nextLevelFans != null) ? ' and level costs' : ''} come from tables the vault keeps, as of Season ${ratesSeason}.`}
        {hasCovered && ' Progress banked under an older season’s costs is not recalculated until the track next earns fans, so it can already cover more than the next level now costs.'}
        {hasComplete && ' Fans keep counting after a track is complete, so a complete track’s fans can be far more than its levels cost.'}
        {addsUp && ' From Season 9, a season’s fans by sponsor add up to its fans per stop in the World Tour record above.'}
      </Note>
    </Panel>
  );
};

// REVERT / UNDO_REVERT rows (model.ratings.adjustments). Its own component so the
// page's early return above can't split the hooks.
const ADJ_PER_PAGE = 10;
const lagText = (ms) => (ms < 48 * 3_600_000 ? `${decimal(ms / 3_600_000, 1)} hours` : `${decimal(ms / 86_400_000, 1)} days`);
const RankAdjustments = ({ adj, matchesByTournament }) => {
  // The Support inbox links here with router state `adjustment` (a row's `key`). Read once, so a
  // later navigation to this page cannot cancel the highlight's timer.
  const location = useLocation();
  const [focusKey] = useState(() => location.state?.adjustment ?? null);
  const [page, setPage] = useState(() => {
    const i = focusKey ? adj.rows.findIndex((r) => r.key === focusKey) : -1;
    return i >= 0 ? Math.floor(i / ADJ_PER_PAGE) + 1 : 1;
  });
  const [focus, setFocus] = useState(focusKey);
  const [openMatch, setOpenMatch] = useState(null);
  const listRef = useRef(null);
  useEffect(() => {
    if (!focusKey) return undefined;
    const raf = requestAnimationFrame(() => {
      const li = listRef.current?.querySelector(`[data-adj="${CSS.escape(focusKey)}"]`);
      li?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      li?.querySelector('button')?.focus({ preventScroll: true });
    });
    const t = setTimeout(() => setFocus(null), 2500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [focusKey]);
  const sign = (v) => `${v > 0 ? '+' : ''}${num(v || 0)}`;
  const tone = (v) => (v > 0 ? 'text-emerald-300' : v < 0 ? 'text-red-300' : 'text-gray-400');
  const totalPages = Math.max(1, Math.ceil(adj.rows.length / ADJ_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * ADJ_PER_PAGE;
  const notified = adj.rows.some((r) => r.notifiedMs != null);
  return (
    <Panel title="Rank adjustments">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Reverts</p>
          <p className="text-xl font-bold text-white mt-1 tabular-nums">{num(adj.reverts)}</p>
          {adj.reverts > 0 && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              {num(adj.raised)} raised, {num(adj.lowered)} lowered{adj.unchanged > 0 ? `, ${num(adj.unchanged)} unchanged` : ''}
            </p>
          )}
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Net effect</p>
          <p className={`text-xl font-bold mt-1 tabular-nums ${adj.netRs > 0 ? 'text-emerald-400' : adj.netRs < 0 ? 'text-red-400' : 'text-white'}`}>{sign(adj.netRs)} RS</p>
          {adj.undos > 0 && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              reverts {sign(adj.revertRs)}, undos {sign(adj.netRs - adj.revertRs)}
            </p>
          )}
        </div>
        {adj.lagMs && (
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Typical delay</p>
            <p className="text-xl font-bold text-white mt-1 tabular-nums">{lagText(adj.lagMs.median)}</p>
            {adj.lagMs.min !== adj.lagMs.max && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                {lagText(adj.lagMs.min)} to {lagText(adj.lagMs.max)}
              </p>
            )}
          </div>
        )}
      </div>
      <ul ref={listRef} className="space-y-1.5">
        {adj.rows.slice(start, start + ADJ_PER_PAGE).map((r, i) => {
          const match = matchesByTournament.get(r.tournamentId);
          const result = [r.placement != null && `${ordinal(r.placement)} of 8`, r.originalRs != null && `${sign(r.originalRs)} RS`].filter(Boolean).join(', ');
          const parts = [
            r.matchMs != null ? `Played ${date(r.matchMs)}` : match ? `Played ${date(match.start)}` : 'Tournament not in this export',
            result,
            r.lagMs != null ? `adjusted ${lagText(r.lagMs)} later` : `adjusted ${date(r.adjustedMs)}`,
            r.notifiedMs != null && `in your inbox ${date(r.notifiedMs)}`,
          ].filter(Boolean);
          const body = (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {r.seasonLabel && <span className="text-sm font-semibold text-gray-100">{r.seasonLabel}</span>}
                <Badge tone="yellow">{r.type === 'UNDO_REVERT' ? 'Undo revert' : 'Revert'}</Badge>
                {r.undone && <span className="text-[10px] text-gray-500">later undone</span>}
                <span className={`ml-auto text-sm font-bold tabular-nums ${tone(r.rs)}`}>{sign(r.rs)} RS</span>
                {match && <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />}
              </div>
              <p className="text-xs text-gray-400 mt-1">{parts.join(' · ')}</p>
            </>
          );
          return (
            <li key={`${r.key}:${start + i}`} data-adj={r.key} className={`rounded-lg bg-gray-950/45 transition-shadow ${focus === r.key ? 'ring-1 ring-emerald-400/70' : ''}`}>
              {match ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setOpenMatch(match)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-700/30 transition-colors"
                >
                  {body}
                </button>
              ) : (
                <div className="px-3 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {openMatch && <VaultMatchModal match={openMatch} onClose={() => setOpenMatch(null)} />}
      {adj.rows.length > ADJ_PER_PAGE && (
        <div className="mt-3">
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            startIndex={start}
            endIndex={start + ADJ_PER_PAGE}
            totalItems={adj.rows.length}
            onPageChange={setPage}
            edgeScroll={false}
            variant="compact"
          />
        </div>
      )}
      <Note>
        Each row is a <code>REVERT</code> or <code>UNDO_REVERT</code> entry in <code>RankUpdate</code>, tied to the tournament it adjusts by{' '}
        <code>TournamentID</code>, and your season totals already include it. Embark’s README says most reverts come from a cheater found in the
        match and that a revert can raise or lower a rating. Its amount usually differs from the tournament’s own change.
        {notified && ' An inbox date marks the weekly rank-update message that reported that exact amount.'}
        {adj.runHourUtc != null && (
          <>
            {' '}
            Rows written in the same run share one <code>AdjustedAt</code>, most often {String(adj.runHourUtc).padStart(2, '0')}:00 UTC in this export.
          </>
        )}
      </Note>
    </Panel>
  );
};

const SeasonCurves = ({ seasons, onOpen }) => {
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
        const matches = s.matches ?? s.curveMatches ?? n;
        const plural = matches === 1 ? '' : 'es';
        return {
          key: s.seasonId,
          label: s.seasonLabel,
          // A withheld season stays a flat card: the graph's axis and tooltips
          // would hand back precisely the scores this panel refuses to print.
          openable: s.rankReliable,
          aria: s.rankReliable
            ? `${s.seasonLabel}: ${num(Math.round(s.curveStartScore))} to ${num(Math.round(s.curveEndScore))} RankScore over ${num(matches)} match${plural}`
            : `${s.seasonLabel}: ${num(matches)} ranked match${plural}`,
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
      {list.map((p) => {
        // On an openable card the sentence moves to the button and the svg goes
        // aria-hidden: nested in a button, its label joins the button's own
        // accessible name and the card announces its description twice.
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-gray-200">{p.label}</span>
              {p.rank && <span className={`text-[11px] font-semibold truncate ${p.rank.text}`}>{p.rank.name}</span>}
            </div>
            <svg
              viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
              preserveAspectRatio="none"
              className="w-full h-14 mt-1.5"
              role={p.openable ? undefined : 'img'}
              aria-hidden={p.openable ? 'true' : undefined}
              aria-label={p.openable ? undefined : p.aria}
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
              {p.start == null ? <span className="text-gray-600">score not shown</span> : <>{num(p.start)} <span className="text-gray-600">→</span> {num(p.end)}</>}
            </p>
            <p className="text-[10px] text-gray-500">
              {num(p.matches)} match{p.matches === 1 ? '' : 'es'}
            </p>
          </>
        );

        if (!p.openable) {
          return (
            <div key={p.key} className="bg-gray-900/50 rounded-lg p-2.5" title="The export doesn’t have a rank we can trust for this season, so there’s no graph to open.">
              {body}
            </div>
          );
        }

        // ring-inset, not a plain ring: <main> is overflow-x-clip, which shaves
        // the side slivers off an outset one. The resting ring and the icon are
        // the affordance; hover-only cues left these reading as static panels.
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onOpen(p.key)}
            aria-label={`Open the graph for ${p.aria}`}
            className="group relative w-full text-left bg-gray-900/50 rounded-lg p-2.5 cursor-pointer transition-all ring-1 ring-inset ring-emerald-500/20 hover:bg-gray-900 hover:ring-emerald-500/60 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {body}
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 group-hover:bg-emerald-500/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-400/70 group-hover:text-emerald-300 transition-colors">
              <Maximize2 className="w-3 h-3" />
              Graph
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const RatingsPage = () => {
  const { model } = useVaultData();
  const { ratings } = model;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [graphSeasonId, setGraphSeasonId] = useState(null);
  // Held on the page, not in the modal: the modal unmounts on close, so the
  // toggles would snap back every time a season was reopened. Not persisted —
  // the vault stores nothing between visits by design.
  const [graphSettings, setGraphSettings] = useState(DEFAULT_GRAPH_SETTINGS);
  // Lets a clicked graph point open its match, built once rather than scanning
  // model.matches (thousands of rows) per click. It sits above the empty-state
  // early return because a hook below it would only run on one of the two paths.
  const matchesByTournament = useMemo(() => {
    const map = new Map();
    for (const m of model.matches || []) if (m.tournamentId) map.set(m.tournamentId, m);
    return map;
  }, [model.matches]);
  const [openWtSeasons, setOpenWtSeasons] = useState(() => new Set());
  const toggleWtSeason = (key) =>
    setOpenWtSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!ratings?.has) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <PageHeader icon={Gauge} title="Skill Rating" subtitle="Hidden matchmaking ratings & ranked history" />
        <EmptyState icon={Gauge} title="No skill-rating data in this export">
          Neither record is here: the <code>BucketObject</code> entries that hold your hidden MMR and ranked ratings, and
          the <code>RankUpdate</code> rows that log each ranked match. Those are the names to quote if you ask Embark.
        </EmptyState>
      </div>
    );
  }

  const { ranked, hiddenMmr, openSkill } = ratings;
  // Only newer exports carry the log, so its column and chart are conditional.
  const hasCurve = ranked.seasons.some((s) => s.curve?.length > 0);
  // Held here rather than in SeasonCurves: that memo projects each season down
  // to what a sparkline needs and drops the curve itself, which the graph needs.
  const graphSeasons = ranked.seasons.filter((s) => s.curve?.length > 0 && s.rankReliable);
  const graphSeason = graphSeasons.find((s) => s.seasonId === graphSeasonId) ?? null;
  const hasReconstructed = ranked.seasons.some((s) => s.source === 'rankUpdate');
  const scoreBonusSeasons = ranked.seasons.filter((s) => s.bonusTotal > 0 && s.bonusMatches > 0);
  const casual = hiddenMmr.find((m) => m.ratingId === 'IVKCasualRating');
  const worldTour = hiddenMmr.find((m) => m.ratingId === 'IVKWorldTourRating');
  const wtRecord = model.worldTour?.has && (model.worldTour.totalEvents > 0 || model.worldTour.seasons.length > 0) ? model.worldTour : null;
  const wtStops = wtRecord ? wtRecord.seasons.flatMap((s) => s.stops) : [];
  const eventsAddUp = wtRecord?.totalEvents > 0 && wtRecord.events.counted === wtRecord.totalEvents;
  const eventsCounted = !!wtRecord && !wtRecord.hasSummary && wtRecord.events.counted > 0;
  const wtNamed = wtStops.some((st) => st.stopName || st.weeks.some((w) => w.weekNameSource === 'wiki'));
  const wtExportWeek = wtStops.some((st) => st.weeks.some((w) => w.weekNameSource === 'export'));
  const wtFans = wtStops.some((st) => st.fans != null);
  const wtShared = wtRecord?.seasons.some((s) => s.n >= 9 && s.unlabelled.tournaments > 0);

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader icon={Gauge} title="Skill Rating" subtitle="Hidden matchmaking ratings & ranked history" />

      {/* Headline standing */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Latest rank"
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
              ? `${ranked.latest.seasonLabel}${ranked.latest.rpReliable && ranked.latest.rankPoints > 0 ? ` · ${num(Math.round(ranked.latest.rankPoints))} RS` : ''} · ${num(ranked.latest.matches)} matches`
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

      {wtRecord && (
        <Panel title="World Tour record">
          {(wtRecord.totalEvents != null || eventsCounted || wtRecord.streak?.streak > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {(wtRecord.totalEvents != null || eventsCounted) && (
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500">{eventsCounted ? 'Total events (vault count)' : 'Total events'}</p>
                  <p className="text-xl font-bold text-white mt-1 tabular-nums">{num(eventsCounted ? wtRecord.events.counted : wtRecord.totalEvents)}</p>
                  {(eventsAddUp || eventsCounted) && (
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {[
                        wtRecord.events.fromLog > 0 && `${num(wtRecord.events.fromLog)} from your match log`,
                        wtRecord.events.fromFans > 0 && `${num(wtRecord.events.fromFans)} from sponsor fans`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              )}
              {wtRecord.streak?.streak > 0 && (
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500">Current win streak</p>
                  <p className="text-xl font-bold text-white mt-1 tabular-nums">{num(wtRecord.streak.streak)}</p>
                  {wtRecord.streak.lastWinMs && <p className="text-[11px] text-gray-500 mt-0.5">last win {date(wtRecord.streak.lastWinMs)}</p>}
                </div>
              )}
            </div>
          )}
          <div className="table-container @container">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 pr-3 font-medium">Season</th>
                  {wtRecord.hasSummary && (
                    <>
                      <th className="text-right py-2 px-3 font-medium">Badge score</th>
                      <th className="text-right py-2 px-3 font-medium">
                        <span className="border-b border-dotted border-gray-500 cursor-help" title="Embark’s own FinalsWon counter, which counted different things in different seasons.">
                          Finals won
                        </span>
                      </th>
                    </>
                  )}
                  <th className="text-right py-2 px-3 font-medium">Rounds</th>
                  <th className="text-right py-2 px-3 font-medium">Tournaments</th>
                  <th className="text-right py-2 pl-3 font-medium">Tournaments won</th>
                </tr>
              </thead>
              <tbody>
                {wtRecord.seasons.map((s) => {
                  const key = s.seasonId ?? s.label;
                  const canOpen = s.stops.length > 0 || s.unlabelled.tournaments > 0;
                  const open = canOpen && openWtSeasons.has(key);
                  return (
                    <Fragment key={key}>
                      <tr className="border-b border-gray-700/40 last:border-0">
                        <td className="py-2 pr-3 text-gray-200 font-medium whitespace-nowrap">
                          {canOpen ? (
                            <button
                              type="button"
                              onClick={() => toggleWtSeason(key)}
                              aria-expanded={open}
                              className="inline-flex items-center gap-1.5 -my-1 py-1 hover:text-white"
                            >
                              <ChevronDown aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                              {s.label}
                            </button>
                          ) : (
                            s.label
                          )}
                        </td>
                        {wtRecord.hasSummary && (
                          <>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-300 whitespace-nowrap">
                              {s.badge && (
                                <span
                                  className={`font-semibold mr-2 ${s.badge.text} ${s.badge.basis !== 'points' ? 'border-b border-dotted border-gray-500 cursor-help' : ''}`}
                                  title={s3BadgeTip(s.badge)}
                                >
                                  <span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1.5" style={{ background: s.badge.color }} />
                                  {s.badge.level == null && s.badge.name === 'Emerald' ? 'Emerald 4 to 2' : s.badge.label}
                                </span>
                              )}
                              {num(s.badgeScore)}
                              {s.system && (
                                <span className="block sm:inline text-[10px] font-normal text-gray-500 sm:ml-1.5">
                                  {s.system === 'allModes' ? 'every mode' : 'tournaments only'}
                                  {s.badge?.basis === 'finalsWins' && ' · badge from Finals won'}
                                  {s.badge?.basis === 'finalsStage' && ' · badge from Finals stage'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-300">
                              {s.finalsWonMatch ? (
                                <span className="border-b border-dotted border-gray-600 cursor-help" title={finalsWonTitle(s)}>
                                  {num(s.finalsWon)}
                                </span>
                              ) : s.finalsWon === 0 && s.tournamentsWon > 0 && s.n !== 3 ? (
                                <span
                                  className="border-b border-dotted border-gray-600 cursor-help"
                                  title={`Embark’s counter reads 0 although your log shows ${num(s.tournamentsWon)} World Tour tournament win${s.tournamentsWon === 1 ? '' : 's'} this season.`}
                                >
                                  0
                                </span>
                              ) : (
                                num(s.finalsWon)
                              )}
                            </td>
                          </>
                        )}
                        <td className="py-2 px-3 text-right tabular-nums text-gray-400 whitespace-nowrap">{s.rounds > 0 ? num(s.rounds) : '0 in log'}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-400">{s.tournaments > 0 ? num(s.tournaments) : '—'}</td>
                        <td className="py-2 pl-3 text-right tabular-nums text-gray-400">{s.tournaments > 0 ? num(s.tournamentsWon) : '—'}</td>
                      </tr>
                      {open && (
                        <tr className="border-b border-gray-700/40 last:border-0">
                          <td colSpan={wtRecord.hasSummary ? 6 : 4} className="pt-1 pb-3">
                            <div className="sticky left-0 w-[100cqw] space-y-1.5">
                              {s.stops.map((st, i) => (
                                <WtStopRow key={i} st={st} />
                              ))}
                              {s.unlabelled.tournaments > 0 && (
                                <div className="rounded-lg border border-dashed border-gray-700 px-3 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                                  <span className="text-sm text-gray-400">No stop or week</span>
                                  <span className="text-xs text-gray-400 tabular-nums">
                                    {`${num(s.unlabelled.tournaments)} tournament${s.unlabelled.tournaments === 1 ? '' : 's'} · ${num(s.unlabelled.rounds)} round${s.unlabelled.rounds === 1 ? '' : 's'}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Note>
            {wtRecord.hasSummary ? (
              <>
                Total events, badge score and Finals won come from Embark’s <code>worldTour</code> summary, and rounds, tournaments and
                tournaments won from your match log. The two do not always cover the same seasons. What counts toward the badge score is
                labelled with each score, and scores under different labels do not compare. From Season 4 the badge is worked out from the score.
                {wtRecord.seasons.some((s) => s.n === 3) &&
                  ' Season 3’s score is stored on today’s point scale rather than the one its own tiers used, so its badge is read from the World Tour Finals stage (Gold 1 to enter, Emerald from 3 wins) and is left blank below that.'}
                {' Finals won is Embark’s own counter and counted different things in different seasons'}
                {wtRecord.seasons.some((s) => s.n >= 4 && s.n <= 8) &&
                  wtRecord.seasons.every((s) => !(s.n >= 4 && s.n <= 8) || s.finalsWon === 0) &&
                  ', reading 0 for Seasons 4 to 8 on every export checked'}
                .
              </>
            ) : (
              <>
                Rounds, tournaments and tournaments won come from your match log. This export has no <code>worldTour</code> summary, so it has no
                {eventsCounted ? ' badge score or Finals won.' : ' total events, badge score or Finals won.'}
              </>
            )}
            {eventsAddUp && (
              <>
                {' '}
                Total events is Embark’s <code>TotalWorldTourEvents</code>, which equals the Season 3 events and Season 4 to 8 stops with a World
                Tour tournament in your match log, plus the stops from Season 9 where you earned sponsor fans.
              </>
            )}
            {eventsCounted && (
              <>
                {' '}
                Total events is the vault’s own count of the Season 3 events and Season 4 to 8 stops with a World Tour tournament in your match
                log, plus the stops from Season 9 where you earned sponsor fans. Counted this way it equals Embark’s{' '}
                <code>TotalWorldTourEvents</code> on every export checked that has one.
              </>
            )}
            {wtNamed && ' Stop and week names and each stop’s sponsors come from thefinals.wiki, checked against Embark’s patch notes and videos.'}
            {wtExportWeek && ' A week that neither thefinals.wiki nor Embark’s patch notes name shows the internal name from the export.'}
            {wtFans && (
              <>
                {' '}
                Fans per stop, from Season 9, come from <code>sponsor_journey.gainedFans</code> and count fans earned in any mode, so a stop can
                have fans and no tournaments.
              </>
            )}
            {wtShared && ' From Update 9.8.0 (5 Feb 2026) nearly every World Tour tournament shares one scenario id, so those tournaments have no stop or week.'}
          </Note>
        </Panel>
      )}

      {model.sponsors?.has && <SponsorsPanel sponsors={model.sponsors} wtRecord={wtRecord} />}

      {model.quickplay?.has && model.quickplay.seasons.length > 0 && (
        <Panel title="Quickplay badge">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {model.quickplay.seasons.map((s) => (
              <div key={s.seasonId} className="bg-gray-900/50 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500">{s.label}</p>
                <p className="text-xl font-bold text-white mt-1 tabular-nums">{num(s.score)}</p>
                {s.badge ? (
                  <p className={`text-xs font-semibold mt-0.5 ${s.badge.text}`}>
                    <span className="inline-block w-2 h-2 rounded-full align-middle mr-1.5" style={{ background: s.badge.color }} />
                    {s.badge.label}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-0.5">no badge</p>
                )}
              </div>
            ))}
          </div>
          <Note>
            Scores come from <code>QuickPlayScore</code>, which the export holds only for Seasons 6 to 8, and each badge is worked out from its score.
            The Quickplay badge never counted toward World Tour.
          </Note>
        </Panel>
      )}

      {/* Within-season progression, from the per-match log */}
      {hasCurve && (
        <Panel
          title="RankScore within each season"
          action={
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400/90">
              <Maximize2 className="w-3.5 h-3.5" />
              Open a season for the full graph
            </span>
          }
        >
          <SeasonCurves seasons={ranked.seasons} onOpen={setGraphSeasonId} />
          {/* Inside the hasCurve gate, so an export with no match-by-match log
              has no way to mount it. */}
          {graphSeason && (
            <VaultGraphModal
              season={graphSeason}
              seasons={graphSeasons}
              onSeasonChange={setGraphSeasonId}
              onClose={() => setGraphSeasonId(null)}
              nameHistory={model.nameHistory}
              tournaments={ratings.rankedTournaments}
              matchesByTournament={matchesByTournament}
              note={endRankNote(graphSeason)}
              settings={graphSettings}
              onSettingsChange={setGraphSettings}
            />
          )}
          {/* The performance score isn't in the export, only the points it paid,
              recovered as the gain minus the flat placement value. */}
          {scoreBonusSeasons.length > 0 && (
            <p className="mt-3 text-[11px] text-gray-400">
              <span className="text-emerald-300">Earned for your own play:</span>{' '}
              {scoreBonusSeasons
                .map((s) => `${s.seasonLabel} +${num(s.bonusTotal)} over ${num(s.bonusMatches)} match${s.bonusMatches === 1 ? '' : 'es'}`)
                .join(' · ')}
              . From S11 the game adds RankScore on top of what your team’s finish paid, based on how you personally
              played, and Match history shows it match by match. It stops at Diamond: in every export we can check, no
              match starting at or above {num(PERFORMANCE_BONUS_MAX_SCORE)} RankScore has been given one. The performance
              score itself isn’t in the export, only the RankScore it was worth.
            </p>
          )}
          <Note>
            The match log starts at S4, so earlier seasons have no card, and from S4 on it holds virtually every rated
            match. A division has been a flat {num(RANKED_POINTS_PER_DIVISION)} points since S4, so the cards share one
            scale. Every card starts low because placement matches could not put you above Gold 1 for most of the game’s
            life, a ceiling only raised recently.
          </Note>
        </Panel>
      )}

      {ratings.adjustments && <RankAdjustments adj={ratings.adjustments} matchesByTournament={matchesByTournament} />}

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
                      {/* Native title for the same clipping reason as the Rating system header. */}
                      <span
                        className="border-b border-dotted border-gray-500 cursor-help"
                        title="The lowest rank you fell to during the season. It comes from the match-by-match log, which only newer exports include, so a season without one shows a dash."
                      >
                        Lowest
                      </span>
                    </th>
                  )}
                  <th className="text-right py-2 px-3 font-medium">RankScore</th>
                  <th className="text-right py-2 px-3 font-medium">Matches</th>
                  <th className="text-right py-2 pl-3 font-medium">
                    {/* Native title, not <Tooltip>: this <th> is inside
                        .table-container too, so on a 1-2 season table the popover
                        clips and inflates scrollHeight into a phantom scrollbar. */}
                    <span
                      className="border-b border-dotted border-gray-500 cursor-help"
                      title="Which system the game used to rank you that season. S2 ran on OpenSkill, S3 onwards on IVK, the system behind the rank and RankScore you see in game. Where a season logged both, this is the one that was running the ladder."
                    >
                      Rating system
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
                          title="For this season the export kept only the rating the game ran in the background, not the one it ranked you on. That rating sits on its own scale and can read well above or below your real rank, so no rank is shown."
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
                                ? `Dropped as low as ${num(Math.round(s.low))} RankScore${s.lowMs ? ` on ${date(s.lowMs)}` : ''} before finishing the season.`
                                : `Never went below ${num(Math.round(s.low))} RankScore, the score the season started you on.`
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
            End rank comes from the season record in the export (<code>leagueRankIndex</code>), with that season’s peak
            beside it. The engine changed twice: S2 ran on OpenSkill, S3 was the first IVK season, S4 onwards uses the IVK
            tournament ladder. Where a season logged both, only the live one is kept, because the other kept running in
            the background on its own point scale. <strong>RankScore</strong> is the score you saw in game
            (<code>rankPoints</code>), and it exists only from S3 on. S3 ran 2,500 points per division to Platinum 4 and
            5,000 above that, S4 onwards a flat 2,500, so compare a score inside a season and not across S3 and S4. S2’s
            OpenSkill points were internal and never shown in game, so they are left out and the chart uses the rank
            ladder, which stays comparable throughout.
            {hasCurve && ' Newer exports log every ranked match on its own, which is where Lowest comes from: the end-of-season record keeps where you finished and how high you got, never how far you fell.'}
            {hasReconstructed &&
              ' This export has no end-of-season records at all, so the ranks above were worked out from that match log. The final scores line up with the published leaderboard, but Ruby is the top 500 players rather than a score, so a rank worked out this way stops at Diamond 1.'}
            {ranked.seedsDropped > 0 && ' Empty placeholder ratings are ignored, along with a second account’s untouched ratings where an export covers more than one account.'}
            {ranked.withheld > 0 && ' A season marked “Unknown” kept only that background rating, so no rank is shown for it.'}
            {ranked.curveParked > 0 && ` ${ranked.curveParked} season${ranked.curveParked === 1 ? '' : 's'} of match history couldn’t be matched to a season we know about, so ${ranked.curveParked === 1 ? 'it is' : 'they are'} left out.`}
          </Note>
        </Panel>
      )}

      {/* Hidden MMR for non-ranked playlists */}
      {hiddenMmr.length > 0 && (
        <Panel title="Hidden MMR: casual and other modes">
          <p className="text-sm text-gray-400 leading-relaxed mb-4">
            These never reset and are never shown in game. Each is one rating refined across your whole account, so the
            number is where it stands on the date beside it.
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
            There is no public scale for these and no league or badge attached, so a number only means something next to
            everyone else’s.
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
                Earlier seasons rated skill with <strong className="text-gray-200">OpenSkill</strong>, an open-source
                system, later revised to a “V2”. These stopped updating when the game moved to the ratings above, so
                “last updated” is the date each was retired. OpenSkill keeps two numbers per mode:{' '}
                <strong className="text-gray-200">μ (mu)</strong>, its guess at your skill, and{' '}
                <strong className="text-gray-200">σ (sigma)</strong>, how unsure it was. A high σ means few games, and it
                shrinks as you play.
              </p>
              <div className="table-container">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="text-left py-2 pr-3 font-medium">Mode</th>
                      <th className="text-right py-2 px-3 font-medium">Skill (μ)</th>
                      <th className="text-right py-2 px-3 font-medium">Uncertainty (σ)</th>
                      <th className="text-right py-2 px-3 font-medium">
                        {/* Native title for the same reason as the ranked table's
                            headers: this <th> sits in a .table-container, which
                            clips the popover and inflates scrollHeight on a short
                            table. This was the page's last clipping tooltip. */}
                        <span
                          className="border-b border-dotted border-gray-500 cursor-help"
                          title="The cautious version of the estimate, μ minus 3σ. Systems like this usually sort ladders on it, so an unsettled rating counts for less until you have played more."
                        >
                          Cautious (μ − 3σ)
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
                A mode can appear twice, an original and a “v2” from when the method was revised, and both are listed.
                Where the export holds more than one copy of the same rating, the one with the most matches is used.
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
      </Panel>
    </div>
  );
};
