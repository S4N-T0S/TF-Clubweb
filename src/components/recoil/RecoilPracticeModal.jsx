import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Settings2, MousePointer2, Crosshair } from 'lucide-react';
import { pxToDeg, degPerCount, cmPer360, countsForDeg, countsPer360 } from '../../data/recoil/sensitivity';
import { getStoredAimSettings, setStoredAimSettings, isAimCustomized } from '../../services/localStorageManager';

const BOX = 360;
const PAD = 36;
const AVAIL = BOX - PAD * 2;
const START = { x: BOX / 2, y: PAD }; // top-centre: the path descends as you counter the climb

// Interpolate the compensation point (degrees) at time fraction f (0..1).
// pts are sorted by t; clamps at the ends so it never indexes out of range.
function compAt(pts, f) {
  if (!pts.length) return { dx: 0, dy: 0 };
  if (f <= pts[0].t) return pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (f <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      const seg = (f - a.t) / ((b.t - a.t) || 1);
      return { dx: a.dx + (b.dx - a.dx) * seg, dy: a.dy + (b.dy - a.dy) * seg };
    }
  }
  return pts[pts.length - 1];
}

const scoreMessage = (s) =>
  s >= 90 ? 'Perfect!' : s >= 70 ? 'Great!' : s >= 45 ? 'Nice try!' : 'Keep Practicing!';
const scoreColor = (s) => (s >= 70 ? '#34d399' : s >= 45 ? '#fbbf24' : '#fb7185');

const clamp = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));

// Aim settings panel

const NumberField = ({ label, value, onChange, step = 1, min, max, suffix, hint }) => (
  <label className="flex flex-col gap-1 text-xs text-gray-300">
    <span className="font-medium">{label}{hint && <span className="text-gray-500"> · {hint}</span>}</span>
    <div className="flex items-center gap-1">
      <input
        type="number" value={value} step={step} min={min} max={max}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full bg-gray-900 border border-gray-600 rounded-md px-2 py-1.5 text-white tabular-nums focus:outline-hidden focus:border-blue-500"
      />
      {suffix && <span className="text-gray-500 text-[11px] shrink-0">{suffix}</span>}
    </div>
  </label>
);

const AimSettingsPanel = ({ aim, setAim }) => {
  const set = (patch) => setAim((prev) => ({ ...prev, ...patch }));
  const cm360 = cmPer360(aim, aim.dpi);
  return (
    <div className="bg-gray-900/60 rounded-xl border border-gray-700 p-3 mb-3">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Mouse Look Sens" value={aim.sens} min={0} max={100} step={0.5}
          onChange={(v) => set({ sens: clamp(v, 0, 100) })} />
        <NumberField label="DPI" value={aim.dpi} min={1} step={50}
          onChange={(v) => set({ dpi: clamp(v, 1, 100000) })} />
        <NumberField label="Zoom Sens Mult" value={aim.zoomMult} min={0} max={100} step={1} suffix="%"
          onChange={(v) => set({ zoomMult: clamp(v, 0, 100) })} />
        <NumberField label="FOV (vertical)" value={aim.fov} min={45} max={100} step={1}
          hint={aim.focalSens ? 'in use' : 'off'}
          onChange={(v) => set({ fov: clamp(v, 45, 100) })} />
      </div>
      <label className="flex items-center gap-2 mt-3 text-xs text-gray-300 cursor-pointer select-none">
        <input type="checkbox" checked={aim.focalSens}
          onChange={(e) => set({ focalSens: e.target.checked })}
          className="accent-blue-500 w-4 h-4" />
        Mouse Focal Length Sensitivity Scaling
        <span className="text-gray-500">(changes ADS sens with FOV)</span>
      </label>
      <p className="text-[11px] text-gray-500 mt-2 tabular-nums">
        ADS (Compact Reflector) sensitivity ≈ <span className="text-gray-300">{cm360.toFixed(2)} cm/360°</span>
        {' · '}{countsPer360(aim).toFixed(0)} counts/360°
      </p>
      <details className="mt-2 text-xs text-gray-400">
        <summary className="cursor-pointer select-none hover:text-gray-200">Calibration (advanced)</summary>
        <div className="mt-2">
          <NumberField label="Input scale" value={aim.inputScale} min={0.1} max={10} step={0.05}
            hint="1.0 = raw"
            onChange={(v) => set({ inputScale: clamp(v, 0.1, 10) })} />
          <p className="text-[10px] text-gray-500 mt-1 leading-snug">
            Leave at 1.0 if your browser supplies raw mouse input. Only adjust if the spray feels more or
            less sensitive than in-game — raise it to make the trainer more sensitive.
          </p>
        </div>
      </details>
    </div>
  );
};

// Practice modal

export const RecoilPracticeModal = ({ weapon, globalBounds, onClose }) => {
  const [phase, setPhase] = useState('ready'); // ready | running | done
  const [score, setScore] = useState(0);
  const [avgErrDeg, setAvgErrDeg] = useState(0);
  const [userPath, setUserPath] = useState('');
  const [markerF, setMarkerF] = useState(0);
  const [rawUnsupported, setRawUnsupported] = useState(false);

  const [aim, setAimState] = useState(getStoredAimSettings);
  const setAim = useCallback((updater) => {
    setAimState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setStoredAimSettings(next);
      return next;
    });
  }, []);

  // First open shows the settings as a dedicated setup screen (replacing the drill)
  const [showSettings, setShowSettings] = useState(() => !aim.seenAimSettings);
  // True only while the auto-shown first-time setup is still up. Once the drill has been
  // revealed (by any path), the gear becomes an ordinary settings toggle ("Done", not "Start").
  const [setupPending, setSetupPending] = useState(() => !aim.seenAimSettings);
  useEffect(() => { if (!showSettings) setSetupPending(false); }, [showSettings]);
  useEffect(() => {
    if (!aim.seenAimSettings) setAim((prev) => ({ ...prev, seenAimSettings: true }));
  }, [aim.seenAimSettings, setAim]);

  // Highlight the gear green whenever the config differs from the in-game defaults
  const aimCustomized = useMemo(() => isAimCustomized(aim), [aim]);

  const padRef = useRef(null);
  const rafRef = useRef();
  const runRef = useRef(null);
  // Only dismiss when a click both starts and ends on the backdrop itself — stops
  // a drag that began inside a settings input from closing the modal on release.
  const backdropDownRef = useRef(false);

  // Mirror phase into a ref so the pointer-lock change handler (a stable listener)
  // can read the current phase without going stale.
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // The drill relies on Pointer Lock + raw mouse movement, which needs a real
  // mouse. Touch-only devices can view the pattern but can't practise.
  const canPractice = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(any-pointer: fine)').matches,
    [],
  );

  // Compensation guide in *degrees of view rotation* (the inverse of the recoil
  // kick). Built from the captured pattern via the corrected capture geometry,
  // so it is FOV/DPI/sens-independent — a pure weapon property.
  const { compPts, scale, maxDeg, firingFrac } = useMemo(() => {
    const raw = weapon.pattern.map(([x, y, t], i, arr) => ({
      t: typeof t === 'number' ? t : (arr.length > 1 ? i / (arr.length - 1) : 0),
      dx: -pxToDeg(x), // counter horizontal drift
      dy: -pxToDeg(y), // counter the climb (recoil y is negative/up -> dy positive/down)
    })).sort((a, b) => a.t - b.t);
    // Re-base the timeline onto the firing window (first shot -> last shot) so the
    // gun fires the instant the run starts — the captured clip's blank lead-in and
    // tail frames are dropped, removing the "random delay" before recoil begins.
    const t0 = raw.length ? raw[0].t : 0;
    const tLast = raw.length ? raw[raw.length - 1].t : 1;
    const span = (tLast - t0) || 1;
    const pts = raw.map((p) => ({ ...p, t: (p.t - t0) / span }));
    let maxX = 1e-3;
    let maxY = 1e-3;
    for (const p of pts) {
      if (Math.abs(p.dx) > maxX) maxX = Math.abs(p.dx);
      if (Math.abs(p.dy) > maxY) maxY = Math.abs(p.dy);
    }
    // Proportional scale: size every weapon against the global recoil extent (in
    // degrees) so pixels-per-degree is constant across weapons — a small-recoil gun
    // draws a small path and a big one a big path, matching the real hand motion.
    // Fall back to fitting this weapon if the global extent isn't available.
    const refX = globalBounds ? Math.max(maxX, pxToDeg(globalBounds.maxX)) : maxX;
    const refY = globalBounds ? Math.max(maxY, pxToDeg(globalBounds.maxY)) : maxY;
    const s = Math.min(AVAIL / refY, (BOX / 2 - PAD) / refX);
    return { compPts: pts, scale: s, maxDeg: maxY, firingFrac: span };
  }, [weapon, globalBounds]);

  const guidePath = useMemo(
    () => 'M' + compPts.map((p) => `${(START.x + p.dx * scale).toFixed(1)} ${(START.y + p.dy * scale).toFixed(1)}`).join(' L'),
    [compPts, scale],
  );

  // Real-time length of the firing window only (first shot -> last shot). Scaling
  // the full clip duration by firingFrac keeps the per-shot cadence true to the
  // footage while dropping the dead lead-in/tail frames.
  const durationMs = useMemo(
    () => Math.max(300, firingFrac * (weapon.trajectory.length / Math.max(1, weapon.fps)) * 1000),
    [firingFrac, weapon],
  );

  // Physical mouse travel this spray demands, for the player's settings.
  const cmPull = useMemo(() => {
    const counts = countsForDeg(maxDeg, aim); // counts to cover the vertical climb
    return (counts / aim.dpi) * 2.54;
  }, [maxDeg, aim]);

  const finish = useCallback((samples) => {
    cancelAnimationFrame(rafRef.current);
    runRef.current = null;
    if (document.pointerLockElement) document.exitPointerLock();
    let s = 0;
    let avgErr = 0;
    if (samples && samples.length) {
      avgErr = samples.reduce((a, b) => a + b, 0) / samples.length; // mean per-shot aim error
      // Zero-score tolerance (degrees): the average miss that drives the score to 0.
      // Relative to the climb so it's visual-scale independent, but tightened and made
      // convex (^1.5) so a high "Perfect" demands a genuine 1:1 trace — a half-hearted
      // sketch now averages well outside this and lands in the lower tiers, not 90+.
      const tolerance = Math.max(0.25, 0.35 * maxDeg);
      s = Math.round(100 * Math.max(0, 1 - avgErr / tolerance) ** 1.5);
    }
    setScore(s);
    setAvgErrDeg(avgErr);
    setPhase('done');
  }, [maxDeg]);

  // Pointer-lock mouse capture: accumulate raw counts -> degrees of view rotation.
  const onMouseMove = useCallback((e) => {
    const run = runRef.current;
    if (!run) return;
    const dpc = degPerCount(run.aim) * (run.aim.inputScale || 1);
    run.viewX += e.movementX * dpc;
    run.viewY += e.movementY * dpc;
    const px = START.x + run.viewX * scale;
    const py = START.y + run.viewY * scale;
    setUserPath((p) => `${p} L${px.toFixed(1)} ${py.toFixed(1)}`);
  }, [scale]);

  const beginRun = useCallback(() => {
    runRef.current = { start: performance.now(), viewX: 0, viewY: 0, samples: [], shotIdx: 0, aim };
    setPhase('running');
    setUserPath(`M${START.x} ${START.y}`);
    document.addEventListener('mousemove', onMouseMove);

    const tick = (now) => {
      const run = runRef.current;
      if (!run) return;
      const f = Math.min(1, (now - run.start) / durationMs);
      setMarkerF(f);
      // Score per *bullet*: each shot fires at its own time fraction (compPts[i].t).
      // The instant a shot's firing time is reached, sample the tracking error against
      // that shot's exact compensation point (degrees of view rotation, visual-scale
      // independent) — one sample per bullet, so the trace is judged shot-by-shot
      // instead of being smoothed across ~60 animation frames.
      while (run.shotIdx < compPts.length && compPts[run.shotIdx].t <= f) {
        const b = compPts[run.shotIdx];
        run.samples.push(Math.hypot(run.viewX - b.dx, run.viewY - b.dy));
        run.shotIdx++;
      }
      if (f >= 1) { finish(run.samples); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [aim, onMouseMove, durationMs, compPts, finish]);

  // Once locked we wait, armed, for the player's mouse press: that press is the
  // trigger pull, so the gun starts firing the instant they click — no countdown.
  const armFire = useCallback((e) => {
    if (e.button !== 0) return; // left button only
    document.removeEventListener('mousedown', armFire);
    beginRun();
  }, [beginRun]);

  // Lock the pointer on user gesture, preferring raw (unaccelerated) movement.
  const handleStart = useCallback(() => {
    const el = padRef.current;
    if (!el) return;
    try {
      const req = el.requestPointerLock({ unadjustedMovement: true });
      if (req && typeof req.then === 'function') {
        req.catch(() => {
          setRawUnsupported(true);
          try { el.requestPointerLock(); } catch { /* noop */ }
        });
      }
    } catch {
      setRawUnsupported(true);
      try { el.requestPointerLock(); } catch { /* noop */ }
    }
  }, []);

  // When the lock engages, arm the trigger (wait for the mouse press). When it
  // drops: finish a run in progress, or return to ready if still armed (Esc).
  useEffect(() => {
    const onChange = () => {
      const locked = document.pointerLockElement === padRef.current;
      if (locked) {
        if (!runRef.current) {
          setPhase('armed');
          document.addEventListener('mousedown', armFire);
        }
      } else {
        document.removeEventListener('mousedown', armFire);
        if (runRef.current) finish(runRef.current.samples);
        // Only reset to ready when the lock dropped while still armed (e.g. Esc
        // before firing) — never clobber the score screen after a finished run.
        else if (phaseRef.current === 'armed') setPhase('ready');
      }
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, [armFire, finish]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mousedown', armFire);
    if (document.pointerLockElement) document.exitPointerLock();
  }, [onMouseMove, armFire]);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mousedown', armFire);
    runRef.current = null;
    setPhase('ready');
    setScore(0);
    setAvgErrDeg(0);
    setUserPath('');
    setMarkerF(0);
  }, [onMouseMove, armFire]);

  const marker = compAt(compPts, markerF);
  const mx = START.x + marker.dx * scale;
  const my = START.y + marker.dy * scale;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => { backdropDownRef.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && backdropDownRef.current) onClose(); }}>
      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-lg lg:max-w-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-white">Spray Practice — {weapon.name}</h3>
          <div className="flex items-center gap-1">
            {canPractice && (
              <button onClick={() => setShowSettings((v) => !v)}
                title={aimCustomized ? 'Aim settings (customised)' : 'Aim settings'}
                className={`p-1.5 rounded-lg transition-colors ${
                  aimCustomized
                    ? 'bg-green-600 text-white hover:bg-green-500'
                    : showSettings
                      ? 'bg-gray-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}>
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {canPractice && showSettings ? (
          <div>
            <p className="text-xs text-gray-400 mb-3">
              Enter your in-game sensitivity so the drill matches the exact mouse motion you&apos;d make — a true
              1:1 spray. You can reopen this anytime with the <Settings2 className="inline w-3.5 h-3.5 -mt-0.5" /> button.
            </p>
            <AimSettingsPanel aim={aim} setAim={setAim} />
            <button onClick={() => setShowSettings(false)}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">
              {setupPending ? 'Start practising' : 'Done'}
            </button>
          </div>
        ) : (
        <>
        {canPractice ? (
          <p className="text-xs text-gray-400 mb-3">
            Click <span className="text-gray-200 font-medium">Start</span> to lock your mouse, then
            <span className="text-gray-200 font-medium"> click to fire</span> — the gun kicks instantly, so pull
            down to follow the guide, exactly the motion you&apos;d make in game.
          </p>
        ) : (
          <div className="flex items-start gap-2 text-xs text-gray-300 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2.5 mb-3">
            <MousePointer2 className="w-4 h-4 mt-0.5 shrink-0 text-blue-300" />
            <span>
              The interactive drill needs a <span className="text-gray-100 font-medium">mouse</span>, so it&apos;s
              desktop-only. Here&apos;s the recoil-compensation path you&apos;d trace — open this on a computer to
              practise it and get scored.
            </span>
          </div>
        )}

        <div className="relative mx-auto" style={{ maxWidth: BOX }}>
          <svg
            ref={padRef}
            viewBox={`0 0 ${BOX} ${BOX}`}
            className="w-full h-auto rounded-xl bg-gray-900 border border-gray-700 touch-none select-none"
            style={{ cursor: phase === 'running' ? 'none' : 'default' }}
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={`h${f}`} x1={PAD} y1={PAD + f * AVAIL} x2={BOX - PAD} y2={PAD + f * AVAIL} stroke="#374151" strokeWidth="0.5" strokeDasharray="2 4" />
            ))}
            <line x1={BOX / 2} y1={PAD} x2={BOX / 2} y2={BOX - PAD} stroke="#374151" strokeWidth="0.5" strokeDasharray="2 4" />

            <path d={guidePath} fill="none" stroke="#34d399" strokeOpacity="0.55" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {userPath && <path d={userPath} fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
            {phase === 'running' && <circle cx={mx} cy={my} r="7" fill="none" stroke="#fff" strokeWidth="2" />}

            {phase === 'ready' && (
              <g>
                <circle cx={START.x} cy={START.y} r="6" fill="#34d399" />
                <text x={START.x} y={START.y + 22} textAnchor="middle" fill="#9ca3af" fontSize="11">start of spray</text>
              </g>
            )}
          </svg>

          {phase === 'ready' && canPractice && (
            <button onClick={handleStart}
              className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/60 rounded-xl text-gray-200 hover:bg-gray-900/40 transition-colors">
              <MousePointer2 className="w-8 h-8 mb-1" />
              <span className="text-sm font-semibold">Start</span>
              <span className="text-[11px] text-gray-400">locks your mouse · Esc to cancel</span>
            </button>
          )}

          {phase === 'armed' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/60 rounded-xl text-gray-200 pointer-events-none">
              <Crosshair className="w-8 h-8 mb-1 text-emerald-400 animate-pulse" />
              <span className="text-sm font-semibold">Click to fire</span>
              <span className="text-[11px] text-gray-400">recoil starts instantly — pull down · Esc to cancel</span>
            </div>
          )}

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
              <span className="text-[11px] text-gray-400 mt-0.5 tabular-nums select-text">avg {avgErrDeg.toFixed(2)}° off target</span>
              <div className="flex gap-2 mt-5">
                <button onClick={reset} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">Try Again</button>
                <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-semibold">Close</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-gray-300"><span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Guide</span>
            {canPractice && <span className="flex items-center gap-1.5 text-gray-300"><span className="w-3 h-0.5 bg-amber-400 inline-block" /> You</span>}
          </div>
          {canPractice && <span className="text-gray-500 tabular-nums">≈ {cmPull.toFixed(1)} cm pull</span>}
        </div>

        {rawUnsupported && (
          <p className="text-[11px] text-amber-300/80 mt-2 leading-snug">
            Your browser can&apos;t supply raw mouse input, so movement may be affected by OS acceleration. For an
            accurate drill, set Windows pointer speed to 6/11 and turn off &quot;Enhance pointer precision&quot;
            (or use a Chromium browser), then fine-tune with <span className="font-medium">Calibration</span> in settings.
          </p>
        )}
        </>
        )}

      </div>
    </div>
  );
};
