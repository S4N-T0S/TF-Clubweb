import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';
import { MIN_RECOIL_UNITS } from '../../data/recoil';

const BOX = 360;
const PAD = 36;
const START = { x: BOX / 2, y: PAD };  // press point, top-centre

// Interpolate a point along the compensation guide by time fraction f (0..1).
// pts are sorted by t; clamps at the ends so it never indexes out of range.
function compAt(pts, f) {
  if (!pts.length) return [START.x, START.y];
  if (f <= pts[0].t) return [pts[0].x, pts[0].y];
  for (let i = 1; i < pts.length; i++) {
    if (f <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      const seg = (f - a.t) / ((b.t - a.t) || 1);
      return [a.x + (b.x - a.x) * seg, a.y + (b.y - a.y) * seg];
    }
  }
  const last = pts[pts.length - 1];
  return [last.x, last.y];
}

const scoreMessage = (s) =>
  s >= 90 ? 'Perfect!' : s >= 70 ? 'Great!' : s >= 45 ? 'Nice try!' : 'Keep Practicing!';
const scoreColor = (s) => (s >= 70 ? '#34d399' : s >= 45 ? '#fbbf24' : '#fb7185');

export const RecoilPracticeModal = ({ weapon, onClose }) => {
  const [phase, setPhase] = useState('ready'); // ready | running | done
  const [score, setScore] = useState(0);
  const [userPath, setUserPath] = useState('');
  const [markerF, setMarkerF] = useState(0);

  const svgRef = useRef(null);
  const rafRef = useRef();
  const runRef = useRef(null);

  // Compensation guide: the inverse of the bullet-impact pattern (pull your
  // mouse opposite to where the bullets climb). Built from `pattern`, not the
  // visual aim trajectory.
  const { guidePts, guidePath } = useMemo(() => {
    let maxX = 1;
    let maxY = 1;
    for (const [x, y] of weapon.pattern) {
      if (Math.abs(x) > maxX) maxX = Math.abs(x);
      if (Math.abs(y) > maxY) maxY = Math.abs(y);
    }
    const avail = BOX - PAD * 2;
    const raw = Math.min(avail / maxY, (BOX / 2 - PAD) / maxX);
    const scale = Math.min(raw, avail / MIN_RECOIL_UNITS);
    const pts = weapon.pattern.map(([x, y, t], i, arr) => ({
      t: typeof t === 'number' ? t : (arr.length > 1 ? i / (arr.length - 1) : 0),
      x: START.x - x * scale, // invert -> compensation direction
      y: START.y - y * scale,
    })).sort((a, b) => a.t - b.t);
    const path = 'M' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L');
    return { guidePts: pts, guidePath: path };
  }, [weapon]);

  // Real-time playback length taken straight from the captured footage
  // (trajectory frames / fps). The bullet timings (tNorm) are normalised against
  // this same timeline, so the marker fires in sync — and burst weapons keep
  // their real inter-burst pauses instead of collapsing to the intra-burst rpm.
  const durationMs = useMemo(
    () => Math.max(400, (weapon.trajectory.length / Math.max(1, weapon.fps)) * 1000),
    [weapon],
  );

  const toSvgPoint = useCallback((clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = BOX / rect.width;
    return [(clientX - rect.left) * sx, (clientY - rect.top) * sx];
  }, []);

  const finish = useCallback((samples) => {
    cancelAnimationFrame(rafRef.current);
    runRef.current = null;
    let s = 0;
    if (samples && samples.length) {
      const avgErr = samples.reduce((a, b) => a + b, 0) / samples.length;
      const tolerance = Math.max(60, (BOX - PAD * 2) * 0.45);
      s = Math.round(100 * Math.max(0, 1 - avgErr / tolerance));
    }
    setScore(s);
    setPhase('done');
  }, []);

  const handlePointerDown = (e) => {
    if (phase !== 'ready' || !svgRef.current) return;
    const [px, py] = toSvgPoint(e.clientX, e.clientY);
    if (Math.hypot(px - START.x, py - START.y) > 60) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    // ux/uy track the user's latest cursor; sampling happens on a fixed cadence
    // (every frame) so being in the wrong place at the wrong time is penalised
    // — you can't race to the end, park there, and wait for the marker.
    runRef.current = { start: performance.now(), pressX: px, pressY: py, samples: [], ux: START.x, uy: START.y };
    setPhase('running');
    setUserPath(`M${START.x} ${START.y}`);

    const tick = (now) => {
      const run = runRef.current;
      if (!run) return;
      const f = Math.min(1, (now - run.start) / durationMs);
      setMarkerF(f);
      const [gx, gy] = compAt(guidePts, f);
      run.samples.push(Math.hypot(run.ux - gx, run.uy - gy));
      if (f >= 1) { finish(run.samples); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const handlePointerMove = (e) => {
    const run = runRef.current;
    if (phase !== 'running' || !run || !svgRef.current) return;
    const [px, py] = toSvgPoint(e.clientX, e.clientY);
    run.ux = START.x + (px - run.pressX);
    run.uy = START.y + (py - run.pressY);
    setUserPath((p) => `${p} L${run.ux.toFixed(1)} ${run.uy.toFixed(1)}`);
  };

  const handlePointerUp = () => {
    if (phase === 'running' && runRef.current) finish(runRef.current.samples);
  };

  const reset = () => {
    cancelAnimationFrame(rafRef.current);
    runRef.current = null;
    setPhase('ready');
    setScore(0);
    setUserPath('');
    setMarkerF(0);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const [mx, my] = compAt(guidePts, markerF);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-white">Spray Practice — {weapon.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Press &amp; hold the start point, then drag to follow the guide as the gun fires.
        </p>

        <div className="relative mx-auto" style={{ maxWidth: BOX }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${BOX} ${BOX}`}
            className="w-full h-auto rounded-xl bg-gray-900 border border-gray-700 touch-none select-none"
            style={{ cursor: phase === 'running' ? 'none' : phase === 'ready' ? 'crosshair' : 'default' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={`h${f}`} x1={PAD} y1={PAD + f * (BOX - 2 * PAD)} x2={BOX - PAD} y2={PAD + f * (BOX - 2 * PAD)} stroke="#374151" strokeWidth="0.5" strokeDasharray="2 4" />
            ))}
            <line x1={BOX / 2} y1={PAD} x2={BOX / 2} y2={BOX - PAD} stroke="#374151" strokeWidth="0.5" strokeDasharray="2 4" />

            <path d={guidePath} fill="none" stroke="#34d399" strokeOpacity="0.55" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {userPath && <path d={userPath} fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
            {phase === 'running' && <circle cx={mx} cy={my} r="7" fill="none" stroke="#fff" strokeWidth="2" />}

            {phase === 'ready' && (
              <g>
                <circle cx={START.x} cy={START.y} r="10" fill="#34d399" />
                <text x={START.x} y={START.y + 26} textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="700">PRESS</text>
              </g>
            )}
          </svg>

          {phase === 'done' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/85 rounded-xl select-text">
              <div className="relative w-28 h-28">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="#1f2937" strokeWidth="9" />
                  <circle
                    cx="50" cy="50" r="44" fill="none"
                    stroke={scoreColor(score)} strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={`${(2 * Math.PI * 44 * score) / 100} ${2 * Math.PI * 44}`}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-4xl font-extrabold text-white select-text tabular-nums">{score}</span>
              </div>
              <span className="mt-2 text-lg font-bold select-text" style={{ color: scoreColor(score) }}>{scoreMessage(score)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 mt-3 text-xs">
          <span className="flex items-center gap-1.5 text-gray-300"><span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Guide</span>
          <span className="flex items-center gap-1.5 text-gray-300"><span className="w-3 h-0.5 bg-amber-400 inline-block" /> You</span>
        </div>
        {phase === 'done' && (
          <div className="flex justify-center gap-2 mt-4">
            <button onClick={reset} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">Try Again</button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-semibold">Close</button>
          </div>
        )}
      </div>
    </div>
  );
};

RecoilPracticeModal.propTypes = {
  weapon: PropTypes.shape({
    name: PropTypes.string.isRequired,
    pattern: PropTypes.array.isRequired,
    trajectory: PropTypes.array.isRequired,
    fps: PropTypes.number.isRequired,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};
