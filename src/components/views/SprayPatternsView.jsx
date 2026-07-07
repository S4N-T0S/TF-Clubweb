import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { Crosshair, Scaling, PlayCircle } from 'lucide-react';
import { loadWeapons, getGlobalBounds, getGlobalPatternBounds, WEAPON_CLASSES, CLASS_ACCENT, FIRE_MODE_META, weaponVideoSrc, weaponIconSrc, hasRecoil } from '../../data/recoil';
import { LoadingDisplay } from '../LoadingDisplay';
import { RecoilViewer } from '../recoil/RecoilViewer';
import { getStoredSpraySettings, setStoredSpraySettings } from '../../services/localStorageManager';
import { useMobileDetect } from '../../hooks/useMobileDetect';

// Gameplay clip.
const WeaponVideo = ({ weapon, videoRef, sync, onReady }) => {
  const [error, setError] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = 0.05;
  }, [videoRef]);

  // If the browser loaded the video entirely from cache before mounting, bypass standard events
  useEffect(() => {
    if (videoRef.current && videoRef.current.readyState >= 3) {
      onReady();
    }
  }, [videoRef, onReady]);

  const handlePlay = () => {
    setStarted(true);
    videoRef.current?.play();
  };

  // Sync mode drives playback from the spray controls, so reveal the player.
  const show = started || sync;

  return (
    <div className="bg-gray-800/60 rounded-2xl border border-gray-700 p-3">
      <h4 className="text-white font-semibold text-sm mb-2 px-1">{weapon.name} in-game clip</h4>
      {error ? (
        <div className="w-full aspect-video rounded-xl bg-gray-900 border border-gray-700 flex items-center justify-center text-gray-500 text-xs text-center px-4">
          No gameplay clip available yet for {weapon.name}.
        </div>
      ) : (
        <div className="relative w-full aspect-video">
          <video
            ref={videoRef}
            src={weaponVideoSrc(weapon)}
            controls={show}
            preload="auto"
            playsInline
            onLoadedData={onReady}
            onCanPlay={onReady}
            onCanPlayThrough={onReady}
            onError={() => setError(true)}
            className="w-full h-full rounded-xl bg-black"
          />
          {!show && (
            <button
              onClick={handlePlay}
              className="absolute inset-0 rounded-xl bg-gray-900 border border-gray-700 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-900/60 hover:text-gray-200 transition-colors"
            >
              <PlayCircle className="w-10 h-10 mb-1" />
              <span className="text-xs">Play gameplay clip</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const FireModeBadge = ({ mode, className = '' }) => {
  const meta = FIRE_MODE_META[mode] || FIRE_MODE_META.auto;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border ${meta.cls} ${className}`}>
      {meta.label}
    </span>
  );
};

const DEFAULT_WEAPON = 'akm';

const StatBox = ({ label, value }) => (
  <div className="bg-gray-900/60 rounded-lg px-3 py-2 border border-gray-700">
    <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
    <div className="text-lg font-bold text-white">{value}</div>
  </div>
);

export const SprayPatternsView = () => {
  const { weapon: weaponSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // A modal (events/info/members/graph/search) is open on top of this view when
  // the URL no longer points at the spray page. Used to pause the background.
  const overlayOpen = !location.pathname.startsWith('/spray-patterns');
  const [weapons, setWeapons] = useState(null);
  
  // Stored Spray Preferences
  const [spraySettings, setSpraySettings] = useState(getStoredSpraySettings);
  const updateSpraySetting = useCallback((updates) => {
    setSpraySettings((prev) => {
      const next = { ...prev, ...updates };
      setStoredSpraySettings(next);
      return next;
    });
  }, []);

  const { uniform, hasToggledUniform } = spraySettings;
  
  const [sync, setSync] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef(null);

  const isStacked = useMobileDetect(1024);
  useEffect(() => {
    if (isStacked) setSync(false);
  }, [isStacked]);

  useEffect(() => {
    let alive = true;
    loadWeapons().then((w) => { if (alive) setWeapons(w); });
    return () => { alive = false; };
  }, []);

  const bounds = useMemo(() => (weapons ? getGlobalBounds(weapons) : null), [weapons]);
  // Pattern-only global extent, used by the practice trainer for a shared (proportional) scale.
  const patternBounds = useMemo(() => (weapons ? getGlobalPatternBounds(weapons) : null), [weapons]);

  // Remember the last weapon we resolved. Falling back to the remembered key keeps the selection stable.
  const lastWeaponKeyRef = useRef(weaponSlug || DEFAULT_WEAPON);

  const selected = useMemo(() => {
    if (!weapons) return null;
    const key = weaponSlug || lastWeaponKeyRef.current;
    return weapons.find((w) => w.key === key)
      || weapons.find((w) => w.key === DEFAULT_WEAPON)
      || weapons[0];
  }, [weapons, weaponSlug]);

  useEffect(() => {
    if (selected) lastWeaponKeyRef.current = selected.key;
  }, [selected]);

  // Preload every weapon icon once the list is known
  useEffect(() => {
    if (!weapons) return;
    weapons.forEach((w) => { new Image().src = weaponIconSrc(w); });
  }, [weapons]);

  const selectedPillRef = useRef(null);
  useEffect(() => {
    const pill = selectedPillRef.current;
    const rail = pill?.parentElement;
    if (!pill || !rail || rail.scrollWidth <= rail.clientWidth) return;
    const offset = pill.getBoundingClientRect().left - rail.getBoundingClientRect().left;
    rail.scrollLeft += offset - (rail.clientWidth - pill.offsetWidth) / 2;
  }, [selected]);

  // Keep the URL canonical: drop unknown weapon slugs.
  useEffect(() => {
    if (weapons && weaponSlug && !weapons.some((w) => w.key === weaponSlug)) {
      navigate('/spray-patterns', { replace: true });
    }
  }, [weapons, weaponSlug, navigate]);

  // Reset Video ready status on weapon switch
  useEffect(() => {
    setVideoReady(false);
  }, [selected?.key]);

  const handleVideoReady = useCallback(() => {
    setVideoReady(true);
  }, []);

  if (!weapons || !selected) {
    return <LoadingDisplay variant="component" message="Loading recoil data..." />;
  }

  const accent = CLASS_ACCENT[selected.class];
  const iconSrc = weaponIconSrc(selected);
  const grouped = WEAPON_CLASSES.map((cls) => ({
    cls,
    list: weapons.filter((w) => w.class === cls),
  }));

  const ownMaxY = Math.max(...selected.pattern.map((p) => Math.abs(p[1])), 0);
  const timeToEmpty = selected.rpm ? (selected.shots / selected.rpm) * 60 : 0;
  const recoil = hasRecoil(selected);

  return (
    <div className="animate-fade-in-up">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Crosshair className="w-6 h-6 text-blue-400" />
          THE FINALS Spray Patterns &amp; Recoil Guide
        </h2>
        <p className="text-sm text-gray-400 mt-1 max-w-3xl text-pretty">
          Real spray patterns captured from in-game footage for {weapons.length} of THE FINALS&apos; guns,
          from pistols and SMGs to rifles and LMGs. See where each bullet lands, then follow the control
          guide to learn the exact counter-pull.
          Hit <span className="text-gray-200 font-medium">Practice</span> to trace the pattern in real time and score yourself.
        </p>
      </div>

      {/* Weapon selector grouped by class */}
      <div className="space-y-3 mb-6">
        {grouped.map(({ cls, list }) => (
          <div key={cls} className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className={`text-xs font-bold uppercase tracking-wider w-16 shrink-0 ${CLASS_ACCENT[cls].text}`}>
              {cls}
            </span>
            {/* Phones: one scrollable rail per class */}
            <div className="flex gap-2 sm:flex-wrap max-sm:overflow-x-auto max-sm:scrollbar-none max-sm:mask-[linear-gradient(90deg,#000_92%,transparent)]">
              {list.map((w) => (
                <Link
                  key={w.key}
                  ref={w.key === selected.key ? selectedPillRef : undefined}
                  to={`/spray-patterns/${w.key}`}
                  aria-current={w.key === selected.key ? 'true' : undefined}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border flex items-center gap-1.5 shrink-0 ${
                    w.key === selected.key
                      ? CLASS_ACCENT[cls].pill
                      : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  {w.name}
                  <FireModeBadge mode={w.fireMode} />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Viewer + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 lg:items-start">
        <div className="bg-gray-800/60 rounded-2xl border border-gray-700 p-4 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-3">
            <h3 className={`text-xl font-bold ${accent.text} flex items-center gap-2`}>
              <span className="w-10 h-10 rounded-lg overflow-hidden bg-linear-to-b from-gray-300 to-gray-400 ring-1 ring-black/25 shrink-0">
                <img key={selected.key} src={iconSrc} alt={`${selected.name} weapon render`} className="w-full h-full object-cover" />
              </span>
              {selected.name}
              <FireModeBadge mode={selected.fireMode} />
            </h3>
            <button
              onClick={() => updateSpraySetting({ uniform: !uniform, hasToggledUniform: true })}
              aria-pressed={uniform}
              title={uniform
                ? 'All weapons share one scale for true size comparison. Click to fit this weapon to the view.'
                : 'This weapon is zoomed to fill the view. Click to compare all weapons on one shared scale.'}
              className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-300 ${
                uniform
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                  : !hasToggledUniform
                    ? 'bg-blue-900/40 text-blue-200 border-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.3)] hover:bg-blue-800/50'
                    : 'bg-gray-700 text-gray-300 border-gray-600'
              }`}
            >
              {!hasToggledUniform && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </span>
              )}
              <Scaling className="w-3.5 h-3.5" />
              {uniform ? 'Proportional' : 'Fit'}
            </button>
          </div>

          <RecoilViewer
            weapon={selected}
            bounds={bounds}
            patternBounds={patternBounds}
            uniform={uniform}
            videoRef={videoRef}
            sync={sync}
            videoReady={videoReady}
            onToggleSync={() => setSync((s) => !s)}
            canSync={!isStacked}
            active={!overlayOpen}
            showVisual={spraySettings.showVisual}
            loop={spraySettings.loop}
            onUpdateSettings={updateSpraySetting}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3">
            <StatBox label="Fire mode" value={FIRE_MODE_META[selected.fireMode]?.label || 'Auto'} />
            <StatBox label="Fire rate" value={`${selected.rpm} RPM`} />
            <StatBox label="Mag" value={selected.shots} />
            <StatBox label="Time to empty" value={timeToEmpty ? `${timeToEmpty.toFixed(1)}s` : 'N/A'} />
          </div>

          <div className="bg-gray-800/60 rounded-2xl border border-gray-700 p-5 text-sm text-gray-300 leading-relaxed">
            <h4 className="text-white font-semibold mb-2">Reading the {selected.name}</h4>
            {recoil ? (
              <p>
                The <span className="text-gray-100 font-medium">Spray Pattern</span> panel shows where each bullet
                actually lands, coloured from
                <span className="text-cyan-300 font-medium"> first shot</span> to
                <span className="text-rose-300 font-medium"> last</span>
                {ownMaxY > 5 ? `, climbing roughly ${Math.round(ownMaxY)} pixels` : ''}
                {timeToEmpty ? ` over about ${timeToEmpty.toFixed(1)}s` : ''}. The
                <span className="text-gray-100 font-medium"> Recoil Control Guide</span> is its mirror image:
                pull your mouse along that path while firing to cancel the climb and keep every shot on target.
                Hit <span className="text-gray-200 font-medium">Practice</span> to trace it and get scored.
              </p>
            ) : (
              <p>
                The {selected.name} fires single, accurate shots with no meaningful spray pattern. Each shot lands
                where you aim, so there is no climb to counter and no drill to practise.
                Toggle <span className="text-gray-200 font-medium">Visual recoil</span> to see the small camera
                kick it does have.
              </p>
            )}
            <p className="mt-2 text-gray-400">
              <span className="text-gray-200 font-medium">Visual recoil</span> overlays the raw camera kick.
              <span className="text-gray-200 font-medium"> Fit</span> zooms this weapon to fill the view, while
              <span className="text-gray-200 font-medium"> Proportional</span> puts every weapon on one shared
              scale so you can compare true recoil size.
            </p>
          </div>

          <WeaponVideo key={selected.key} weapon={selected} videoRef={videoRef} sync={sync} onReady={handleVideoReady} />
        </div>
      </div>
    </div>
  );
};
