// Chart.js config for the vault's per-season RankScore graph. No React and no
// chart.js import, so the config stays plain data and can't drag the library in.
//
// Mirrors the shape of src/hooks/useChartConfig.js, but must never import from
// it: that file pulls in historicalDataService, which statically imports eleven
// season leaderboard JSON blobs (a ~15MB chunk) that would then land in the
// vault chunk too.
import { RANKED_POINTS_PER_DIVISION, leagueInfo, scoreToLeagueIdx } from './ratings';
import { num } from './format';

// Canvas can't read CSS variables, so gridlines need a per-theme literal. Copy
// of CHART_GRID in src/hooks/useChartConfig.js — edit both if a theme changes.
const CHART_GRID = {
  default: '#2a3042',
  midnight: '#1b2647',
  amoled: '#232323',
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// Line semantics as on the leaderboard graph: green where the score rose, red
// where it fell, off-white where nothing moved.
const UP = '#10B981';
const DOWN = '#EF4444';
const NEUTRAL = '#FAF9F6';
// Adjustments (rollbacks, penalties) and renames keep their own hues: amber for
// a change the server made, indigo for a rename, as on the leaderboard graph.
const ADJUST_COLOR = '#f59e0b';
export const NAME_COLOR = '#818cf8';
export const ADJUST_MARKER_COLOR = ADJUST_COLOR;

// Staircase timing, as in the leaderboard's processGraphData: the flat run holds
// the previous score until 15 minutes before the next match, tightening to 4
// minutes when the two are close and to the midpoint when they nearly coincide,
// which stops the step crossing back over its own point.
const STEP_15 = 15 * MINUTE;
const STEP_5 = 5 * MINUTE;
const STEP_4 = 4 * MINUTE;

export const DEFAULT_GRAPH_SETTINGS = {
  showLeagueLines: true,
  showNameChanges: true,
  showAdjustments: true,
};

// Time presets. The leaderboard's 24H/7D/MAX is anchored to `now`, which a
// season that ended months ago doesn't have; these anchor to the season's own
// last match so the same control works for a finished and a running season.
export const PRESETS = [
  { key: 'season', label: 'Season', span: null },
  { key: '30d', label: '30D', span: 30 * DAY },
  { key: '7d', label: '7D', span: 7 * DAY },
];

// The score in effect at `ms`: the curve only moves at a point, so a rename
// between matches sits on the flat run before the next one.
const scoreAt = (curve, ms) => {
  let score = curve[0]?.score ?? 0;
  for (const p of curve) {
    if (p.ms > ms) break;
    score = p.score;
  }
  return score;
};

// Which presets a season can offer. A window longer than the season's own
// history would render an identical view under a different name, so it's shown
// disabled with a reason rather than silently duplicating "Season".
export const availablePresets = (curve) => {
  if (!curve?.length) return [];
  const span = curve[curve.length - 1].ms - curve[0].ms;
  return PRESETS.map((p) => ({
    ...p,
    disabled: p.span != null && span <= p.span,
    title: p.span != null && span <= p.span ? 'This season is shorter than that, so it would show the same view.' : 'Select time range',
  }));
};

// A season can hold a single rated match, and its own extent is then zero. Left
// alone, chart.js collapses that to a one-millisecond window: no tick falls
// inside it so the axis renders blank, the sole marker sits half-clipped on the
// right edge, and there is no way back — the 30D/7D presets are disabled on a
// season this short and the zoom plugin refuses to widen past minRange. Give a
// degenerate extent an hour either side so it frames like any other season.
const FLAT_WINDOW_PAD = HOUR;

export const presetWindow = (curve, key) => {
  const first = curve[0].ms;
  const last = curve[curve.length - 1].ms;
  const flat = last - first < 2 * FLAT_WINDOW_PAD;
  const min = flat ? first - FLAT_WINDOW_PAD : first;
  const max = flat ? last + FLAT_WINDOW_PAD : last;
  const preset = PRESETS.find((p) => p.key === key);
  if (!preset?.span) return { min, max };
  return { min: Math.max(min, max - preset.span), max };
};

// Division lines, derived from RANKED_POINTS_PER_DIVISION rather than a
// hardcoded table so they can't drift from scoreToLeagueIdx: index n starts at
// (n-1) * 2500. Styling matches the leaderboard's rankAnnotations — dashed 1.5px
// in the tier colour, label centred, label background left to the plugin default
// (which is what gives it the dark pill).
//
// Ruby is absent by design: it's a top-500 server cut rather than a score
// threshold, so a curve rebuilt from points can never reach it, and the line
// would assert something the export doesn't know.
const ladderAnnotations = (yMin, yMax) => {
  const out = {};
  for (let idx = 1; idx <= 20; idx++) {
    const y = (idx - 1) * RANKED_POINTS_PER_DIVISION;
    if (y < yMin || y > yMax) continue;
    const info = leagueInfo(idx);
    out[`rank-line-${idx}`] = {
      type: 'line',
      drawTime: 'beforeDatasetsDraw',
      yMin: y,
      yMax: y,
      borderColor: info.color,
      borderWidth: 1.5,
      borderDash: [2, 2],
      // Scales don't exist on the first layout pass, so every scriptable option
      // here has to tolerate being called before the chart has measured itself.
      display: (ctx) => {
        const s = ctx.chart.scales?.y;
        return !s || (y >= s.min && y <= s.max);
      },
      label: {
        content: info.name,
        display: true,
        position: 'center',
        color: info.color,
        font: { size: 11 },
        padding: { left: 8, right: 8 },
      },
    };
  }
  return out;
};

// Rename markers, with the leaderboard's edge clamp and zoom-scaled font: a
// label near the axis would otherwise hang half outside the canvas, and at
// full-season zoom full-size text collides with its neighbours.
const LABEL_HALF_WIDTH = 90;

const nameAnnotations = (events, curve) => {
  const out = {};
  events.forEach((ev, i) => {
    out[`name-${i}`] = {
      type: 'label',
      xValue: ev.ms,
      yValue: scoreAt(curve, ev.ms),
      // Label and yAdjust as the leaderboard writes them: the heading on the
      // first line, the transition on the second, sitting below the point. The
      // "approx." qualifier is ours — a span-derived date can be days late, so
      // it mustn't read as exact.
      content: [ev.source === 'sighting' ? 'Name Change (approx. date):' : 'Name Change:', `${ev.from ?? '?'} → ${ev.to}`],
      color: NAME_COLOR,
      backgroundColor: 'rgba(30, 41, 59, 0.85)',
      borderRadius: 4,
      padding: 6,
      yAdjust: 25,
      font: {
        size: (ctx) => {
          const s = ctx.chart?.scales?.x;
          if (!s || s.min === undefined) return 11;
          const viewDuration = s.max - s.min;
          if (viewDuration <= 3 * DAY) return 11;
          if (viewDuration <= 14 * DAY) return 10;
          return Math.max(8, 9);
        },
      },
      xAdjust: (ctx) => {
        const s = ctx.chart.scales?.x;
        if (!s) return 0;
        const xPixel = s.getPixelForValue(ev.ms);
        const chartRight = s.getPixelForValue(s.max);
        const chartLeft = s.getPixelForValue(s.min);
        if (xPixel + LABEL_HALF_WIDTH > chartRight) return chartRight - (xPixel + LABEL_HALF_WIDTH) - 5;
        if (xPixel - LABEL_HALF_WIDTH < chartLeft) return chartLeft - (xPixel - LABEL_HALF_WIDTH) + 5;
        return 0;
      },
      display: (ctx) => {
        const s = ctx.chart.scales?.x;
        return !s || (ev.ms >= s.min && ev.ms <= s.max);
      },
    };
  });
  return out;
};

// Rename events that belong on THIS season's axis.
export const seasonNameEvents = (nameHistory, curve) => {
  if (!curve?.length) return [];
  // A merged export can't say which account played these matches — RankUpdate
  // rows carry no Embark user id — so annotate nothing rather than guess.
  if (!nameHistory?.embark || nameHistory.embark.multi) return [];
  const from = curve[0].ms;
  const to = curve[curve.length - 1].ms;
  return (nameHistory.embark.changes || []).filter((ev) => ev.ms >= from && ev.ms <= to);
};

// Plotted points, with a synthetic step point before every match — the staircase
// the leaderboard graph draws. Without it two matches a week apart join with one
// long diagonal, as though the score drifted the whole time.
//
// The flat run is drawn solid, not dashed like the leaderboard's gap bridges:
// its dashes mean "polled API, no readings here", whereas this is the game's own
// per-match log, so a flat stretch only means the player didn't queue.
const buildPoints = (curve) => {
  const out = [];
  for (let i = 0; i < curve.length; i++) {
    const p = curve[i];
    const prev = i > 0 ? curve[i - 1] : null;
    if (prev) {
      const dt = p.ms - prev.ms;
      const at = dt >= STEP_15 ? p.ms - STEP_15 : dt >= STEP_5 ? p.ms - STEP_4 : prev.ms + dt / 2;
      out.push({ x: at, y: prev.score, raw: prev, synthetic: true });
    }
    // Precomputed rather than derived in the scriptable options, which run for
    // every point on every render — a backward scan there is what made the
    // leaderboard's own version O(n²).
    const direction = !prev ? 'first' : p.score > prev.score ? 'up' : p.score < prev.score ? 'down' : 'same';
    out.push({ x: p.ms, y: p.score, raw: p, direction });
  }
  return out;
};

// Marker sizing, as in the leaderboard's getPointRadius: full size when zoomed
// into a day, a third of that from a week out, interpolated between. Triangles
// start bigger than circles so the two read as the same weight.
const pointRadiusFor = (isTriangle, timeRange) => {
  const initial = isTriangle ? 4.5 : 3;
  if (timeRange <= DAY) return initial;
  if (timeRange >= WEEK) return initial - (initial * 2) / 3;
  return initial - ((initial * 2) / 3) * ((timeRange - DAY) / (WEEK - DAY));
};

export const buildRankChart = ({ season, nameEvents = [], settings = DEFAULT_GRAPH_SETTINGS, themeId = 'default', isMobile = false, window: win }) => {
  const curve = season.curve;
  const domainMin = curve[0].ms;
  const domainMax = curve[curve.length - 1].ms;

  // Snap outward to whole divisions so every ladder line lands on a tick. The
  // extra division of headroom on each side keeps the line off the frame edge.
  const step = RANKED_POINTS_PER_DIVISION;
  const yMin = Math.max(0, Math.floor(season.low / step) * step - step);
  const yMax = Math.ceil(season.high / step) * step + step;
  // Above ~12 divisions the per-division ticks crowd into an unreadable stack.
  const divisions = (yMax - yMin) / step;
  const stepSize = divisions > 24 ? step * 4 : divisions > 12 ? step * 2 : step;

  // A one-match season has a zero-width domain, which the zoom plugin's limits
  // can't express (min === max). Widen symmetrically before it gets there.
  const minRange = 6 * HOUR;
  const pad = Math.max(2 * HOUR, (minRange - (domainMax - domainMin)) / 2);

  const points = buildPoints(curve);
  const markers = settings.showAdjustments
    ? curve.filter((p) => p.type !== 'NORMAL').map((p) => ({ x: p.ms, y: p.score, raw: p }))
    : [];

  const datasets = [
    {
      label: 'RankScore',
      data: points,
      normalized: true,
      borderColor: NEUTRAL,
      borderWidth: 2,
      tension: 0,
      // Colour per segment: the flat run into a match is neutral, the step
      // itself green or red by which way the result moved the score.
      segment: {
        borderColor: (ctx) => {
          const p1 = ctx.p1?.raw;
          if (!p1 || p1.synthetic) return NEUTRAL;
          const a = ctx.p0.parsed.y;
          const b = ctx.p1.parsed.y;
          return b > a ? UP : b < a ? DOWN : NEUTRAL;
        },
      },
      // Markers as the leaderboard draws them: a triangle pointing the way the
      // score moved, green up / red down, and a circle when a match changed
      // nothing. Staircase points are never drawn.
      pointStyle: (ctx) => {
        const d = ctx.raw?.direction;
        return d === 'up' || d === 'down' ? 'triangle' : 'circle';
      },
      pointRotation: (ctx) => (ctx.raw?.direction === 'down' ? 180 : 0),
      pointBackgroundColor: (ctx) => {
        const d = ctx.raw?.direction;
        return d === 'up' ? UP : d === 'down' ? DOWN : NEUTRAL;
      },
      // One value covers both marker types: the series colour is off-white too.
      pointBorderColor: NEUTRAL,
      pointBorderWidth: 0.9,
      pointRadius: (ctx) => {
        if (ctx.raw?.synthetic) return 0;
        const s = ctx.chart?.scales?.x;
        const range = s ? s.max - s.min : WEEK;
        const d = ctx.raw?.direction;
        return pointRadiusFor(d === 'up' || d === 'down', range);
      },
      pointHoverRadius: (ctx) => {
        if (ctx.raw?.synthetic) return 0;
        const s = ctx.chart?.scales?.x;
        const range = s ? s.max - s.min : WEEK;
        const d = ctx.raw?.direction;
        return pointRadiusFor(d === 'up' || d === 'down', range) * 1.5;
      },
      // Small, and paired with intersect:true below: a generous radius popped a
      // tooltip for a match days away as the cursor ran along a flat stretch.
      pointHitRadius: (ctx) => (ctx.raw?.synthetic ? 0 : 5),
      order: 2,
    },
  ];

  if (markers.length) {
    datasets.push({
      label: 'Adjustments',
      data: markers,
      showLine: false,
      pointStyle: 'rectRot',
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: ADJUST_COLOR,
      pointBorderColor: ADJUST_COLOR,
      pointHitRadius: 8,
      order: 1,
    });
  }

  const annotations = {};
  if (settings.showLeagueLines) Object.assign(annotations, ladderAnnotations(yMin, yMax));
  if (settings.showNameChanges) Object.assign(annotations, nameAnnotations(nameEvents, curve));

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    // Never set `resizeDelay`, however tempting it looks for a dvh-sized modal
    // on mobile. `_resize` does `if (this._doResize(mode)) this.render()`, and
    // the debounced `_doResize` returns truthy immediately while deferring the
    // update, so a non-zero delay renders before `chartArea` exists — the
    // annotation plugin destructures it in beforeDraw and throws "Cannot read
    // properties of undefined (reading 'left')".
    transitions: { active: { animation: { duration: 0 } } },
    // intersect:true makes the pointer actually reach a point. With false,
    // chart.js always resolves a nearest one, so a tooltip stayed on screen for
    // the whole of a flat run.
    interaction: { mode: 'nearest', intersect: true },
    scales: {
      x: {
        type: 'time',
        min: win?.min ?? domainMin,
        max: win?.max ?? domainMax,
        // Formats, unit and the rotated tick callback are the leaderboard's, so
        // the two graphs date their axes identically.
        time: {
          unit: 'hour',
          displayFormats: {
            millisecond: 'dd MMM HH:mm',
            second: 'dd MMM HH:mm',
            minute: 'dd MMM HH:mm',
            hour: 'd MMM HH:mm',
            day: 'dd MMM',
            week: 'dd MMM',
            month: 'MMM yyyy',
            quarter: 'MMM yyyy',
            year: 'yyyy',
          },
          tooltipFormat: 'd MMM yyyy HH:mm',
        },
        grid: { color: CHART_GRID[themeId] ?? CHART_GRID.default },
        ticks: {
          color: '#cecfd3',
          maxRotation: isMobile ? 55 : 69,
          minRotation: isMobile ? 55 : 69,
          autoSkip: true,
          maxTicksLimit: isMobile ? 7 : 20,
          padding: 4,
          align: 'end',
          // Every vault season is in the past, so the year always shows.
          callback: (value) =>
            new Date(value).toLocaleString(undefined, {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              year: 'numeric',
            }),
        },
      },
      y: {
        min: yMin,
        max: yMax,
        grid: { color: CHART_GRID[themeId] ?? CHART_GRID.default },
        // Ticks built by hand, not via ticks.stepSize: chart.js treats that as a
        // rounding UNIT for its own nice-number search rather than an absolute
        // spacing, and here it produced 4,643-point gridlines that no division
        // line could sit on. On this axis a gridline has to be a division line.
        afterBuildTicks: (axis) => {
          const out = [];
          for (let v = Math.ceil(axis.min / stepSize) * stepSize; v <= axis.max; v += stepSize) out.push({ value: v });
          axis.ticks = out;
        },
        ticks: { color: '#cecfd3', callback: (v) => num(Math.round(v)) },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }, // replaced by the external handler in VaultRankChart
      annotation: { annotations },
      zoom: {
        limits: { x: { min: domainMin - pad, max: domainMax + pad, minRange } },
        pan: { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
      },
    },
  };

  return { data: { datasets }, options };
};

// Everything the tooltip shows for one point, resolved here so the DOM builder
// stays presentational. `tournaments` is ratings.rankedTournaments; its figures
// are pre-rounded at parse time so they match the Match history card exactly.
export const describePoint = (point, tournaments) => {
  const ru = point.tid ? tournaments?.get(point.tid) : null;
  const score = Math.round(point.score);
  const info = leagueInfo(scoreToLeagueIdx(score));
  // A rollback has no placement of its own: the ladder belongs to the match it
  // undid, so showing a finishing position against it would be wrong.
  const played = point.type === 'NORMAL' || point.type === 'PENALTY';
  // The per-tournament summary describes the MATCH — its `primary` is the NORMAL
  // row — so it can only speak for a played row. A rollback lands days later and
  // usually moves the score the other way, so taking the match's figures there
  // prints the wrong sign against the step the chart has just drawn. Its own
  // before -> after is the only thing that describes it, which is why the curve
  // point carries `before`.
  const delta = played && ru ? ru.delta : Math.round(score - point.before);
  const place = played && ru?.ladder ? ru.ladder.findIndex((l) => l.mine) + 1 : 0;
  return {
    score,
    info,
    delta,
    place: place > 0 ? place : null,
    ladder: played ? ru?.ladder ?? null : null,
    // PositionUpdates is absent on S4 and part of S5, so "no ladder" is a real
    // state to explain rather than a gap to render as zeroes.
    ladderMissing: played && !!ru && !ru.ladder,
    // Gated on `played` for the same reason as `delta`: a performance bonus or a
    // leaver penalty belongs to the match, and attributing one to the rollback
    // that undid it reads as though the rollback itself paid out.
    bonus: played ? ru?.bonus || 0 : 0,
    bonusKind: played ? ru?.bonusKind ?? null : null,
    penalty: played ? ru?.penalty || 0 : 0,
    isAdjustment: !played,
    adjustmentLabel: point.type === 'UNDO_REVERT' ? 'Rollback reversed' : point.type === 'REVERT' ? 'Match rolled back' : null,
    // A penalised row IS a match the player played, so it keeps its placement
    // and ladder, but it's marked on the chart like a rollback and so needs the
    // note that explains the marker.
    isPenalty: point.type === 'PENALTY',
    matchMs: point.matchMs,
  };
};
