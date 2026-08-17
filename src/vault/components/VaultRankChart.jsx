import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Chart as ChartJS,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';
import { useTheme } from '../../context/ThemeProvider';
import { buildRankChart, describePoint } from '../lib/rankChart';
import { dateTime, date, num } from '../lib/format';

// The vault's ONLY chart.js importer, and a static one: the vault has to keep
// working with the network gone and there's no service worker to cache a lazy
// chunk, so the library ships with the route. Everything else here is SVG.
//
// Registration runs once because module evaluation does. The leaderboard's
// GraphModal registers into the same chart.js singleton, but the two chunks are
// independent, so NEITHER may assume the other loaded and this list has to stand
// alone. Absent on purpose: CategoryScale (time axis only), Title, Filler (the
// line is unfilled) and Legend (one visible dataset).
ChartJS.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Tooltip, annotationPlugin, zoomPlugin);

// Distinct class from the leaderboard's `rank-tooltip`: that one finds its node
// with parentNode.querySelector('div.rank-tooltip'), and a shared class would
// let the two modals adopt each other's element.
const TOOLTIP_CLASS = 'vault-rank-tooltip';

const el = (tag, style, text) => {
  const node = document.createElement(tag);
  if (style) Object.assign(node.style, style);
  if (text != null) node.textContent = text;
  return node;
};

const getOrCreateTooltip = (chart) => {
  const parent = chart.canvas.parentNode;
  let node = parent.querySelector(`div.${TOOLTIP_CLASS}`);
  if (node) return node;
  node = el('div', {
    background: 'color-mix(in oklab, var(--color-gray-900) 92%, transparent)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(52, 211, 153, 0.35)',
    borderRadius: '8px',
    color: '#FAF9F6',
    opacity: 0,
    pointerEvents: 'none',
    position: 'absolute',
    padding: '10px 12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
    transition: 'opacity 0.15s ease-out, left 0.1s ease-out, top 0.1s ease-out',
    zIndex: 5,
  });
  node.className = TOOLTIP_CLASS;
  parent.appendChild(node);
  return node;
};

const row = (parent, children, style) => {
  const r = el('div', { display: 'flex', alignItems: 'center', gap: '6px', ...style });
  for (const c of children) r.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  parent.appendChild(r);
  return r;
};

// One compact strip of the eight finishing slots, the player's own highlighted.
const ladderStrip = (ladder) => {
  const wrap = el('div', { display: 'flex', gap: '2px', marginTop: '6px' });
  for (const slot of ladder) {
    const cell = el(
      'div',
      {
        flex: '1',
        textAlign: 'center',
        fontSize: '9px',
        fontWeight: slot.mine ? '700' : '500',
        padding: '2px 3px',
        borderRadius: '3px',
        whiteSpace: 'nowrap',
        background: slot.mine ? 'rgba(52, 211, 153, 0.22)' : 'rgba(255, 255, 255, 0.05)',
        color: slot.mine ? '#6ee7b7' : slot.rp > 0 ? '#9ca3af' : '#8b8f98',
      },
      `${slot.rp > 0 ? '+' : ''}${num(slot.rp)}`
    );
    wrap.appendChild(cell);
  }
  return wrap;
};

export const VaultRankChart = ({ season, nameEvents, tournaments, settings, viewWindow, resetKey, onInteract, onPointClick, isMobile }) => {
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const { themeId } = useTheme();

  // Keep the newest handlers reachable from the chart callbacks without putting
  // them in the options memo, which would rebuild the whole config on every render.
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);
  const onPointClickRef = useRef(onPointClick);
  useEffect(() => {
    onPointClickRef.current = onPointClick;
  }, [onPointClick]);

  const externalTooltip = useCallback(
    (context) => {
      const { chart, tooltip } = context;
      const node = getOrCreateTooltip(chart);

      if (tooltip.opacity === 0) {
        node.style.opacity = 0;
        return;
      }
      // A synthetic step point is a drawing device for an idle stretch, not a
      // match, so it gets no tooltip however close the cursor lands.
      const wrapper = tooltip.dataPoints?.[0]?.raw;
      const point = wrapper?.raw;
      if (!point || wrapper.synthetic) {
        node.style.opacity = 0;
        return;
      }

      const d = describePoint(point, tournaments);
      node.replaceChildren();

      node.appendChild(el('div', { color: '#9ca3af', fontSize: '11px', marginBottom: '3px' }, dateTime(point.ms)));

      const dot = el('span', {
        width: '9px',
        height: '9px',
        borderRadius: '2px',
        background: d.info.color,
        display: 'inline-block',
        flexShrink: '0',
      });
      row(node, [
        el('span', { fontSize: '15px', fontWeight: '700' }, num(d.score)),
        dot,
        el('span', { fontSize: '12px', color: d.info.color, fontWeight: '600' }, d.info.name),
      ]);

      if (d.delta !== 0 || !d.isAdjustment) {
        row(
          node,
          [
            el(
              'span',
              { fontSize: '13px', fontWeight: '700', color: d.delta > 0 ? '#10B981' : d.delta < 0 ? '#EF4444' : '#9ca3af' },
              `${d.delta > 0 ? '+' : ''}${num(d.delta)}`
            ),
            d.place ? el('span', { fontSize: '12px', color: '#9ca3af' }, `· finished ${d.place}${['st', 'nd', 'rd'][d.place - 1] || 'th'} of 8`) : '',
          ],
          { marginTop: '2px' }
        );
      }

      if (d.bonus > 0) {
        node.appendChild(
          el(
            'div',
            { fontSize: '11px', color: '#6ee7b7', marginTop: '3px' },
            d.bonusKind === 'performance' ? `incl. +${num(d.bonus)} for your own play` : `incl. +${num(d.bonus)} score adjustment`
          )
        );
      }
      if (d.penalty < 0) {
        node.appendChild(el('div', { fontSize: '11px', color: '#fca5a5', marginTop: '3px' }, `incl. ${num(d.penalty)} penalty`));
      }

      if (d.ladder) node.appendChild(ladderStrip(d.ladder));
      else if (d.ladderMissing) {
        node.appendChild(
          el('div', { fontSize: '10px', color: '#6b7280', marginTop: '5px', maxWidth: '210px', whiteSpace: 'normal' }, 'This season didn’t log what each finishing place was worth.')
        );
      }

      // A rollback is stamped when the adjustment ran, not when the match was
      // played, and the two are days apart. Without this the point reads as an
      // unexplained spike on a day the player may not have queued at all.
      if (d.isAdjustment || d.isPenalty) {
        const note = el('div', {
          fontSize: '11px',
          color: '#fbbf24',
          marginTop: '6px',
          paddingTop: '6px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          maxWidth: '210px',
          whiteSpace: 'normal',
        });
        if (d.isPenalty) note.textContent = 'This match was penalised, so it paid less than the placement was worth.';
        else
          note.textContent = d.matchMs
            ? `${d.adjustmentLabel} — the match was played on ${date(d.matchMs)}.`
            : `${d.adjustmentLabel} — the match it applies to isn’t in this export.`;
        node.appendChild(note);
      }

      const { offsetLeft, offsetTop } = chart.canvas;
      let left = offsetLeft + tooltip.caretX - node.offsetWidth / 2;
      left = Math.max(5, Math.min(left, chart.width - node.offsetWidth - 5));
      let top = offsetTop + tooltip.caretY - node.offsetHeight - 12;
      if (top < 5) top = offsetTop + tooltip.caretY + 16;

      node.style.opacity = 1;
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
    },
    [tournaments]
  );

  const { data, options } = useMemo(() => {
    const built = buildRankChart({ season, nameEvents, settings, themeId, isMobile, window: viewWindow });
    built.options.plugins.tooltip = { enabled: false, external: externalTooltip, position: 'nearest' };
    const fire = () => onInteractRef.current?.();
    built.options.plugins.zoom.pan.onPanStart = fire;
    built.options.plugins.zoom.zoom.onZoomStart = fire;
    // A click only lands when intersect:true says the pointer actually reached a
    // point, so this can't fire from a stray click on the flat run.
    built.options.onClick = (_evt, elements) => {
      const hit = elements?.[0];
      if (!hit) return;
      const wrapper = built.data.datasets[hit.datasetIndex]?.data[hit.index];
      if (!wrapper || wrapper.synthetic) return;
      onPointClickRef.current?.(wrapper.raw);
    };
    // Only show the pointer cursor where a click would do something.
    built.options.onHover = (evt, elements) => {
      const target = evt?.native?.target;
      if (target) target.style.cursor = elements?.length ? 'pointer' : 'default';
    };
    return built;
  }, [season, nameEvents, settings, themeId, isMobile, viewWindow, externalTooltip]);

  // The tooltip node lives outside React's tree, so React won't clean it up.
  useEffect(() => {
    const container = containerRef.current;
    return () => container?.querySelector(`div.${TOOLTIP_CLASS}`)?.remove();
  }, []);

  // Hide it whenever the chart is rebuilt. chart.js only calls the external
  // handler from a pointer event, and destroy() fires no tooltip hook, so a
  // tooltip left open — which is the normal state after a tap, since touch has
  // no mouseout — would stay pinned over the new season's chart at its old
  // coordinates until something happened to be hovered.
  useEffect(() => {
    const node = containerRef.current?.querySelector(`div.${TOOLTIP_CLASS}`);
    if (node) node.style.opacity = 0;
  }, [resetKey]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Remounting is the zoom reset: re-applying scale bounds alone leaves the
          zoom plugin's own stored state behind. Cheap at a few hundred points. */}
      <Line key={resetKey} ref={chartRef} data={data} options={options} />
    </div>
  );
};

export default VaultRankChart;
