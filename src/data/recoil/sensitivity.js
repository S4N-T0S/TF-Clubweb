/**
 * THE FINALS sensitivity / recoil-angle math for the 1:1 spray-practice trainer.
 *
 * Recoil is an angular camera rotation. The captured `pattern` in weapons.json is
 * in *screen pixels*, so to know how far a player must physically move the mouse
 * to counter it we need two conversions:
 *   1. screen px  -> true view angle (degrees)  — fixed by the capture geometry.
 *   2. view angle -> mouse counts                — depends on the player's settings.
 *
 * Capture geometry: every clip is 1440p, recorded at in-game vertical FOV 81 while
 * ADS through the Compact Reflector, which scales the on-screen VFOV by 0.78. So the
 * true on-screen VFOV during the burst is 81 * 0.78 = 63.18 deg, NOT 81 — the
 * analyser was told 81 (focal 843) and therefore over-states every angle by ~1.4x.
 * We re-derive the angle here with the correct focal length (~1171 px).
 *
 * Sensitivity model (reverse-engineered and verified against the in-game converter):
 *   degPerCount_hip = S / 1000                              (S = Mouse Look Sensitivity)
 *   degPerCount_ads = (S/1000) * (ZoomMult/100) * FOCAL
 *     FOCAL = 1                              if Focal Length Sens Scaling is OFF
 *     FOCAL = tan(0.78*FOV/2) / tan(FOV/2)   if it is ON   (FOV = base vertical FOV)
 * counts/360 = 360 / degPerCount;  cm/360 = (counts/360) / DPI * 2.54.
 * DPI does not affect counts/360 (only cm), and cancels entirely when raw mouse
 * counts are captured, so the drill is 1:1 in physical hand-distance on any rig.
 */

const deg2rad = (d) => (d * Math.PI) / 180;
const rad2deg = (r) => (r * 180) / Math.PI;

// --- Capture geometry (the recordings) ---
export const CAPTURE_HEIGHT = 1440;        // px, vertical axis the FOV is measured on
export const RECORDING_BASE_FOV = 81;      // in-game vertical FOV setting during capture
export const SCOPE_VFOV_FACTOR = 0.78;     // Compact Reflector: on-screen VFOV multiplier

// True on-screen vertical FOV while scoped, and its focal length (the correct
// px -> angle factor for the dataset).
export const RECORDING_VFOV = RECORDING_BASE_FOV * SCOPE_VFOV_FACTOR;
export const RECORDING_FOCAL_PX =
  CAPTURE_HEIGHT / 2 / Math.tan(deg2rad(RECORDING_VFOV) / 2);

/** Screen-pixel displacement (from weapons.json) -> true view rotation in degrees. */
export const pxToDeg = (px) => rad2deg(Math.atan2(px, RECORDING_FOCAL_PX));

/**
 * Player's (Compact Reflector) ADS sensitivity in **degrees of view rotation per mouse count**.
 * @param {object} s
 * @param {number} s.sens      Mouse Look Sensitivity (e.g. 20)
 * @param {number} [s.zoomMult] Mouse Zoom Sensitivity Multiplier, percent (default 100)
 * @param {boolean} [s.focalSens] Mouse Focal Length Sensitivity Scaling (default false)
 * @param {number} [s.fov]     Base vertical FOV; only used when focalSens is on (default 81)
 */
export const degPerCount = ({ sens, zoomMult = 100, focalSens = false, fov = RECORDING_BASE_FOV }) => {
  const hip = sens / 1000;
  const zoom = zoomMult / 100;
  const focal = focalSens
    ? Math.tan(deg2rad(SCOPE_VFOV_FACTOR * fov) / 2) / Math.tan(deg2rad(fov) / 2)
    : 1;
  return hip * zoom * focal;
};

/** Mouse counts for a full 360 turn in the player's current (ADS) state. */
export const countsPer360 = (settings) => 360 / degPerCount(settings);

/** cm of mouse travel per 360 turn. dpi in counts/inch. Display only. */
export const cmPer360 = (settings, dpi) => (countsPer360(settings) / dpi) * 2.54;

/** Mouse counts needed to counter a given view angle (degrees). */
export const countsForDeg = (deg, settings) => deg / degPerCount(settings);
