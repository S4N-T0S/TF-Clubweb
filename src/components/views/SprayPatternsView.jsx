import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import { Crosshair, Scaling, PlayCircle } from 'lucide-react';
import { loadWeapons, getGlobalBounds, WEAPON_CLASSES, CLASS_ACCENT, FIRE_MODE_META, weaponVideoSrc, hasRecoil } from '../../data/recoil';
import { LoadingDisplay } from '../LoadingDisplay';
import { RecoilViewer } from '../recoil/RecoilViewer';

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
      <h4 className="text-white font-semibold text-sm mb-2 px-1">{weapon.name} — in-game</h4>
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
    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${meta.cls} ${className}`}>
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
  const [weapons, setWeapons] = useState(null);
  const [uniform, setUniform] = useState(false);
  const [sync, setSync] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadWeapons().then((w) => { if (alive) setWeapons(w); });
    return () => { alive = false; };
  }, []);

  const bounds = useMemo(() => (weapons ? getGlobalBounds(weapons) : null), [weapons]);

  const selected = useMemo(() => {
    if (!weapons) return null;
    return weapons.find((w) => w.key === weaponSlug)
      || weapons.find((w) => w.key === DEFAULT_WEAPON)
      || weapons[0];
  }, [weapons, weaponSlug]);

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
        <p className="text-sm text-gray-400 mt-1 max-w-3xl">
          Real spray patterns captured from in-game footage for every weapon in THE FINALS.
          See where each bullet lands and the recoil control guide you need to counter it.
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
            <div className="flex flex-wrap gap-2">
              {list.map((w) => (
                <button
                  key={w.key}
                  onClick={() => navigate(`/spray-patterns/${w.key}`)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border flex items-center gap-1.5 ${
                    w.key === selected.key
                      ? 'bg-gray-600 text-white border-gray-400'
                      : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  {w.name}
                  <FireModeBadge mode={w.fireMode} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Viewer + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
        <div className="bg-gray-800/60 rounded-2xl border border-gray-700 p-4 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-3">
            <h3 className={`text-xl font-bold ${accent.text} flex items-center gap-2`}>
              {selected.name}
              <FireModeBadge mode={selected.fireMode} />
            </h3>
            <button
              onClick={() => setUniform((u) => !u)}
              title={uniform
                ? 'Proportional scale: weapons share one scale so recoil is comparable'
                : 'Fit scale: this weapon is scaled to fill the view'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                uniform
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                  : 'bg-gray-700 text-gray-300 border-gray-600'
              }`}
            >
              <Scaling className="w-3.5 h-3.5" />
              {uniform ? 'Proportional' : 'Fit'}
            </button>
          </div>

          <RecoilViewer weapon={selected} bounds={bounds} uniform={uniform}
            videoRef={videoRef} sync={sync} videoReady={videoReady} onToggleSync={() => setSync((s) => !s)} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3">
            <StatBox label="Class" value={selected.class} />
            <StatBox label="Fire mode" value={FIRE_MODE_META[selected.fireMode]?.label || 'Auto'} />
            <StatBox label="Fire rate" value={`${selected.rpm} RPM`} />
            <StatBox label="Shots" value={selected.shots} />
          </div>

          <div className="bg-gray-800/60 rounded-2xl border border-gray-700 p-5 text-sm text-gray-300 leading-relaxed">
            <h4 className="text-white font-semibold mb-2">Reading the {selected.name}</h4>
            {recoil ? (
              <p>
                The left panel shows where each bullet actually lands, coloured from
                <span className="text-cyan-300 font-medium"> first shot</span> to
                <span className="text-rose-300 font-medium"> last</span>
                {ownMaxY > 5 ? `, climbing roughly ${Math.round(ownMaxY)} pixels` : ''}
                {timeToEmpty ? ` over about ${timeToEmpty.toFixed(1)}s` : ''}. The right panel is the
                recoil control guide &mdash; pull your mouse along that path to counter the climb and keep every
                shot on target. Hit <span className="text-gray-200 font-medium">Practice</span> to trace it and get scored.
              </p>
            ) : (
              <p>
                The {selected.name} is a {FIRE_MODE_META[selected.fireMode]?.label.toLowerCase() || 'single-shot'} weapon
                with no meaningful recoil pattern &mdash; shots land on your crosshair, so there is no control guide to
                follow. Use the <span className="text-gray-200 font-medium">Visual recoil</span> toggle to inspect the
                small camera kick if you like.
              </p>
            )}
            <p className="mt-2 text-gray-400">
              Toggle <span className="text-gray-200 font-medium">Visual recoil</span> to overlay the raw camera kick,
              or <span className="text-gray-200 font-medium">Fit</span> /
              <span className="text-gray-200 font-medium"> Proportional</span> to zoom this weapon or compare true
              recoil size across all weapons.
            </p>
          </div>

          <WeaponVideo key={selected.key} weapon={selected} videoRef={videoRef} sync={sync} onReady={handleVideoReady} />
        </div>
      </div>
    </div>
  );
};

StatBox.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

FireModeBadge.propTypes = {
  mode: PropTypes.string,
  className: PropTypes.string,
};

WeaponVideo.propTypes = {
  weapon: PropTypes.shape({
    key: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  }).isRequired,
  videoRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  sync: PropTypes.bool,
  onReady: PropTypes.func.isRequired,
};
