import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Play, Pause, RotateCcw, Repeat, Crosshair, Eye, EyeOff, Film } from 'lucide-react';
import { CLASS_ACCENT, getWeaponBounds, shotColor, MIN_RECOIL_UNITS, hasRecoil } from '../../data/recoil';
import { RecoilPracticeModal } from './RecoilPracticeModal';
import { useVisibility } from '../../hooks/useVisibility';

const VBW = 300;
const VBH = 420;
const PAD = { top: 26, bottom: 40, x: 24 };
const ORIGIN_X = VBW / 2;
const ORIGIN_Y = VBH - PAD.bottom;          // spray pattern: climbs up from here
const AVAIL_H = ORIGIN_Y - PAD.top;
const AVAIL_HALF_W = VBW / 2 - PAD.x;
const GUIDE_TOP = PAD.top;                   // control guide: descends from here

const SPEEDS = [0.5, 1, 2];

const GridBackdrop = () => (
  <>
    {[0, 0.25, 0.5, 0.75, 1].map((f) => (
      <line key={f} x1={PAD.x} y1={PAD.top + f * AVAIL_H} x2={VBW - PAD.x} y2={PAD.top + f * AVAIL_H}
        stroke="#374151" strokeWidth="0.5" strokeDasharray="2 4" />
    ))}
    <line x1={ORIGIN_X} y1={PAD.top} x2={ORIGIN_X} y2={ORIGIN_Y} stroke="#374151" strokeWidth="0.5" strokeDasharray="2 4" />
  </>
);

export const RecoilViewer = ({ weapon, bounds, uniform, videoRef, sync, videoReady, onToggleSync, active = true, showVisual, loop, onUpdateSettings }) => {
  const isVisible = useVisibility();
  const [playhead, setPlayhead] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [practiceOpen, setPracticeOpen] = useState(false);

  const playheadRef = useRef(playhead);
  const rafRef = useRef();
  const wasVideoPlayingRef = useRef(false);
  const accent = CLASS_ACCENT[weapon.class] || CLASS_ACCENT.Medium;
  const recoil = hasRecoil(weapon);

  // Wrapper boolean to prevent syncing while the video is still downloading/buffering
  const activeSync = sync && videoReady;

  // "Live" = this view is both the focused tab AND not covered by a modal.
  const live = isVisible && active;

  useEffect(() => { playheadRef.current = playhead; }, [playhead]);

  const scale = useMemo(() => {
    const src = uniform ? bounds : getWeaponBounds(weapon);
    const raw = Math.min(AVAIL_H / src.maxY, AVAIL_HALF_W / src.maxX);
    return Math.min(raw, AVAIL_H / MIN_RECOIL_UNITS);
  }, [weapon, bounds, uniform]);

  // Spray pattern: bullet impacts, coloured by shot order.
  const dots = useMemo(
    () => weapon.pattern.map(([x, y, t], i, arr) => ({
      n: i + 1,
      t: typeof t === 'number' ? t : (arr.length > 1 ? i / (arr.length - 1) : 0),
      color: shotColor(arr.length > 1 ? i / (arr.length - 1) : 0),
      cx: ORIGIN_X + x * scale,
      cy: ORIGIN_Y + y * scale,
    })),
    [weapon, scale],
  );

  // Time of the very first bullet, avoiding dead-time scrubbing
  const minT = dots.length > 0 ? dots[0].t : 0;

  // Recoil control guide: the inverse of the bullet pattern (the path to pull
  // your mouse), drawn descending from the top.
  const guide = useMemo(
    () => weapon.pattern.map(([x, y, t], i, arr) => ({
      t: typeof t === 'number' ? t : (arr.length > 1 ? i / (arr.length - 1) : 0),
      cx: ORIGIN_X - x * scale,
      cy: GUIDE_TOP - y * scale,
    })),
    [weapon, scale],
  );

  // Optional visual-recoil overlay: the raw aim/camera trajectory.
  const visualTraj = useMemo(
    () => weapon.trajectory.map(([x, y]) => [ORIGIN_X + x * scale, ORIGIN_Y + y * scale]),
    [weapon, scale],
  );

  const realDuration = useMemo(
    () => Math.max(1200, (weapon.trajectory.length / weapon.fps) * 1000),
    [weapon],
  );

  // When weapon changes, reset to the first frame and remove any manual pause restrictions.
  useEffect(() => {
    setUserPaused(false);
    playheadRef.current = minT;
    setPlayhead(minT);
  }, [weapon.key, minT]);

  // Playback increments from the current playhead each frame -> pause/resume
  // continues where it left off; loop wraps instead of stopping.
  useEffect(() => {
    if (!playing || activeSync) return undefined;
    let prev = performance.now();
    const dur = realDuration / speed;
    const step = (ts) => {
      const dt = ts - prev;
      prev = ts;
      let p = playheadRef.current + dt / dur;
      if (p >= 1) {
        if (loop) { p = minT; }
        else { playheadRef.current = 1; setPlayhead(1); setPlaying(false); return; }
      }
      playheadRef.current = p;
      setPlayhead(p);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, loop, realDuration, activeSync, minT]);

  // Sync mode: the gameplay clip is the master clock. The spray playhead follows
  // the video's progress, and the transport controls below proxy to the video,
  // so play/pause, scrubbing and loop stay in lockstep across both.
  useEffect(() => {
    const vid = videoRef?.current;
    if (!activeSync || !vid) return undefined;
    let raf;
    const tick = () => {
      if (vid.duration) {
        const p = Math.min(1, vid.currentTime / vid.duration);
        playheadRef.current = p;
        setPlayhead(p);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    vid.addEventListener('ended', onPause);
    
    // We bind local playing state directly to what the native video is doing
    setPlaying(!vid.paused);
    
    return () => {
      cancelAnimationFrame(raf);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
      vid.removeEventListener('ended', onPause);
      // Leaving sync: hand the video back in a stopped, un-looped state.
      vid.pause();
      vid.loop = false;
      vid.playbackRate = 1;
    };
  }, [activeSync, videoRef, weapon.key]);

  // Pause the background — spray animation AND the gameplay clip (synced or
  // played manually) — whenever the tab is hidden or a modal is open over this
  // view. Resume what was running on return, unless the user paused it.
  useEffect(() => {
    const vid = videoRef?.current;
    if (!live) {
      if (vid && !vid.paused) { wasVideoPlayingRef.current = true; vid.pause(); }
      setPlaying(false);
      return;
    }
    if (userPaused) return;
    if (activeSync && vid) {
      vid.play().catch(() => {});
    } else {
      if (vid && wasVideoPlayingRef.current) vid.play().catch(() => {});
      setPlaying(true);
    }
    wasVideoPlayingRef.current = false;
  }, [live, userPaused, activeSync, videoRef]);

  // Reflect loop / speed onto the video while synced.
  useEffect(() => {
    const vid = videoRef?.current;
    if (!activeSync || !vid) return;
    vid.loop = loop;
    vid.playbackRate = speed;
  }, [activeSync, loop, speed, videoRef, weapon.key]);

  const handlePlayPause = () => {
    if (activeSync && videoRef?.current) {
      const vid = videoRef.current;
      if (vid.paused) {
        if (vid.ended || vid.currentTime >= (vid.duration || Infinity)) vid.currentTime = 0;
        vid.play().catch(() => {});
        setUserPaused(false);
      } else {
        vid.pause();
        setUserPaused(true);
      }
      return;
    }
    
    if (playing) { 
      setPlaying(false); 
      setUserPaused(true);
      return; 
    }
    
    if (playheadRef.current >= 1 || playheadRef.current < minT) { 
      playheadRef.current = minT; 
      setPlayhead(minT); 
    }
    setPlaying(true);
    setUserPaused(false);
  };

  const handleRestart = () => {
    if (activeSync && videoRef?.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
      setUserPaused(false);
      return;
    }
    playheadRef.current = minT;
    setPlayhead(minT);
    if (!playing) {
      setPlaying(true);
      setUserPaused(false);
    }
  };

  const handleScrub = (v) => {
    if (activeSync && videoRef?.current && videoRef.current.duration) {
      videoRef.current.currentTime = v * videoRef.current.duration;
      playheadRef.current = v;
      setPlayhead(v);
      return;
    }
    setPlaying(false);
    setUserPaused(true);
    playheadRef.current = v;
    setPlayhead(v);
  };

  const shownDots = dots.filter((d) => d.t <= playhead + 1e-6);
  const activeDot = shownDots.length ? shownDots[shownDots.length - 1] : null;
  const dotR = Math.max(2.6, Math.min(4.5, 110 / dots.length));

  const shownGuide = guide.filter((g) => g.t <= playhead + 1e-6);
  const guidePath = shownGuide.length ? 'M' + shownGuide.map((g) => `${g.cx.toFixed(1)} ${g.cy.toFixed(1)}`).join(' L') : '';
  const activeGuide = shownGuide.length ? shownGuide[shownGuide.length - 1] : null;

  const visIdx = Math.round(playhead * (visualTraj.length - 1));
  const visPath = showVisual && visualTraj.length
    ? 'M' + visualTraj.slice(0, visIdx + 1).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')
    : '';

  const fireRate = (weapon.rpm / 60).toFixed(1);

  return (
    <div className="flex flex-col items-center w-full">
      <div className={`grid grid-cols-1 ${recoil ? 'sm:grid-cols-2' : ''} gap-3 w-full`}>
        {/* Spray Pattern */}
        <figure className="m-0">
          <div className="flex items-center justify-center gap-2 mb-1">
            <figcaption className="text-xs text-gray-400">Spray Pattern</figcaption>
            <button onClick={() => onUpdateSettings({ showVisual: !showVisual })} title="Toggle visual (camera) recoil overlay"
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                showVisual ? 'bg-gray-600 text-white border-gray-400' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
              }`}>
              {showVisual ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Visual recoil
            </button>
          </div>
          <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto rounded-xl bg-gray-900/80 border border-gray-700"
            role="img" aria-label={`${weapon.name} spray pattern`}>
            <GridBackdrop />
            <line x1={ORIGIN_X - 6} y1={ORIGIN_Y} x2={ORIGIN_X + 6} y2={ORIGIN_Y} stroke="#6b7280" strokeWidth="1" />
            <line x1={ORIGIN_X} y1={ORIGIN_Y - 6} x2={ORIGIN_X} y2={ORIGIN_Y + 6} stroke="#6b7280" strokeWidth="1" />
            {visPath && <path d={visPath} fill="none" stroke="#9ca3af" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />}
            {shownDots.map((d) => (
              <circle key={d.n} cx={d.cx} cy={d.cy} r={dotR} fill={d.color}><title>{`Bullet ${d.n}`}</title></circle>
            ))}
            {activeDot && <circle cx={activeDot.cx} cy={activeDot.cy} r={dotR + 2.5} fill="none" stroke={activeDot.color} strokeWidth="1.5" />}
          </svg>
        </figure>

        {/* Recoil Control Guide (only when the weapon actually has recoil) */}
        {recoil && (
          <figure className="m-0">
            <figcaption className="text-xs text-gray-400 text-center mb-1">Recoil Control Guide</figcaption>
            <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto rounded-xl bg-gray-900/80 border border-gray-700"
              role="img" aria-label={`${weapon.name} recoil control guide`}>
              <GridBackdrop />
              {guidePath && <path d={guidePath} fill="none" stroke={accent.stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
              {activeGuide && <circle cx={activeGuide.cx} cy={activeGuide.cy} r="4" fill="#fff" />}
            </svg>
          </figure>
        )}
      </div>

      {!recoil && (
        <p className="text-xs text-gray-500 mt-2 text-center max-w-sm">
          This {weapon.fireMode === 'semi' ? 'single-shot' : ''} weapon has no meaningful recoil pattern, so there&apos;s no control guide or practice.
        </p>
      )}

      {/* Readout */}
      <div className="text-sm text-gray-300 mt-3 tabular-nums">
        <span className="font-semibold text-white">{shownDots.length}</span> / {dots.length} shots
        <span className="text-gray-500"> · </span>{fireRate}/s
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
        {recoil && (
          <button onClick={() => setPracticeOpen(true)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white ${accent.btn} transition-colors`}>
            <Crosshair className="w-4 h-4" /> Practice
          </button>
        )}
        <button onClick={handlePlayPause} title={playing ? 'Pause' : 'Play'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 text-sm font-medium">
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button onClick={handleRestart} title="Restart"
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600">
          <RotateCcw className="w-4 h-4" />
        </button>
        <button onClick={() => onUpdateSettings({ loop: !loop })} title="Loop"
          className={`flex items-center justify-center w-9 h-9 rounded-lg border ${
            loop ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
          }`}>
          <Repeat className="w-4 h-4" />
        </button>
        <div className="flex items-center bg-gray-700 rounded-lg overflow-hidden">
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => setSpeed(s)}
              className={`px-2.5 py-2 text-xs font-medium ${speed === s ? 'bg-gray-500 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>
              {s}x
            </button>
          ))}
        </div>
        <button onClick={onToggleSync} disabled={!videoReady && !sync} title={videoReady ? 'Play the gameplay clip and spray animation together, kept in sync' : 'Loading gameplay clip...'}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border ${
            sync ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
          } ${!videoReady && !sync ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <Film className="w-4 h-4" /> Sync video
        </button>
      </div>

      <input type="range" min="0" max="1" step="0.001" value={playhead}
        onChange={(e) => handleScrub(parseFloat(e.target.value))}
        className="w-full max-w-[620px] mt-3 cursor-pointer" aria-label="Spray progress" />

      {practiceOpen && recoil && <RecoilPracticeModal weapon={weapon} onClose={() => setPracticeOpen(false)} />}
    </div>
  );
};

RecoilViewer.propTypes = {
  weapon: PropTypes.shape({
    key: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    class: PropTypes.string.isRequired,
    fireMode: PropTypes.string,
    rpm: PropTypes.number.isRequired,
    fps: PropTypes.number.isRequired,
    pattern: PropTypes.array.isRequired,
    trajectory: PropTypes.array.isRequired,
  }).isRequired,
  bounds: PropTypes.shape({
    maxX: PropTypes.number.isRequired,
    maxY: PropTypes.number.isRequired,
  }).isRequired,
  uniform: PropTypes.bool.isRequired,
  videoRef: PropTypes.shape({ current: PropTypes.any }),
  sync: PropTypes.bool,
  videoReady: PropTypes.bool,
  onToggleSync: PropTypes.func,
  active: PropTypes.bool,
  showVisual: PropTypes.bool.isRequired,
  loop: PropTypes.bool.isRequired,
  onUpdateSettings: PropTypes.func.isRequired,
};
