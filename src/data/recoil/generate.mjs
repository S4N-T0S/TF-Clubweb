/**
 * Recoil dataset generator.
 *
 * Reads the raw per-weapon JSON exports from the `recoil-analyser` project and
 * produces a single trimmed `weapons.json` consumed by the Spray Patterns view.
 *
 * The raw files are large (per-frame trajectory + tracking metadata). The site
 * only needs: per-bullet pattern points, the smooth trajectory polyline, and a
 * little metadata (rpm / magazine / class). Coordinates are kept in their
 * native units (screen pixels relative to bullet 1, +x right / -y up) so the
 * viewer can apply a single global scale across every weapon.
 *
 * Run:  node src/data/recoil/generate.mjs
 * The source path can be overridden with the RECOIL_OUTPUT env var.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default to the sibling recoil-analyser checkout (…/Dev/recoil-analyser/output). https://github.com/S4N-T0S/recoil-analyser
const SOURCE = process.env.RECOIL_OUTPUT
  || resolve(__dirname, '../../../../recoil-analyser/output');

const CLASSES = ['Light', 'Medium', 'Heavy'];

// Fire mode per weapon | Values: auto | burst | semi.
// Unknown weapons default to 'auto'.
const FIRE_MODES = {
  '93r': 'burst', 'arn-220': 'auto', 'h-plus-infuser': 'auto', 'lh1': 'semi',
  'm11': 'auto', 'v9s': 'semi', 'xp-54': 'auto',
  'akm': 'auto', 'chimera-xb': 'semi', 'famas': 'burst', 'fcar': 'auto', 'p90': 'auto',
  'r-357': 'semi', 'pike-556': 'semi', 'cb-01-repeater': 'semi',
  'lewis-gun': 'auto', 'm60': 'auto', 'shak-50': 'auto', 'bfr-titan': 'semi',
};

const round = (n, p = 2) => {
  const f = 10 ** p;
  return Math.round(n * f) / f;
};

const slug = (name) =>
  name.toLowerCase().trim()
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const weapons = [];

for (const cls of CLASSES) {
  let files;
  try {
    files = readdirSync(join(SOURCE, cls)).filter((f) => f.endsWith('.json'));
  } catch {
    console.warn(`Skipping missing class dir: ${cls}`);
    continue;
  }

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(SOURCE, cls, file), 'utf8'));

    const name = raw.weapon || file.replace(/\.json$/, '');
    const rpm = round(raw.rpm?.video_median || raw.rpm?.audio || 0, 0);

    const rawPattern = raw.pattern || [];
    const rawTraj = raw.trajectory || [];

    // Timeline span used to place each bullet along the trajectory playback.
    const tStart = rawTraj.length ? rawTraj[0].time_s : (rawPattern[0]?.time_s ?? 0);
    const tEnd = rawTraj.length ? rawTraj[rawTraj.length - 1].time_s
      : (rawPattern[rawPattern.length - 1]?.time_s ?? 1);
    const span = tEnd - tStart || 1;

    // [x, y, tNorm] where tNorm (0..1) is the bullet's position on the timeline.
    const pattern = rawPattern.map((p, i) => {
      const tNorm = p.time_s != null
        ? Math.min(1, Math.max(0, (p.time_s - tStart) / span))
        : (rawPattern.length > 1 ? i / (rawPattern.length - 1) : 0);
      return [round(p.x), round(p.y), round(tNorm, 3)];
    });
    const trajectory = rawTraj.map((t) => [round(t.x), round(t.y)]);

    const key = slug(name);
    weapons.push({
      key,
      name,
      class: cls,
      fireMode: FIRE_MODES[key] || 'auto',
      rpm,
      mag: raw.magazine ?? raw.shots_detected ?? pattern.length,
      shots: raw.shots_detected ?? pattern.length,
      fps: round(raw.capture?.fps || 60, 1),
      pattern,
      // Fall back to the per-bullet pattern if no continuous trajectory exists.
      trajectory: trajectory.length ? trajectory : pattern,
    });
  }
}

// Stable ordering: by class (Light→Medium→Heavy) then name.
weapons.sort((a, b) =>
  CLASSES.indexOf(a.class) - CLASSES.indexOf(b.class) || a.name.localeCompare(b.name));

const out = join(__dirname, 'weapons.json');
writeFileSync(out, JSON.stringify(weapons));

const kb = (JSON.stringify(weapons).length / 1024).toFixed(1);
console.log(`Wrote ${weapons.length} weapons to ${out} (${kb} KB)`);
for (const w of weapons) {
  const maxY = Math.max(...w.pattern.map((p) => Math.abs(p[1])), 0);
  const maxX = Math.max(...w.pattern.map((p) => Math.abs(p[0])), 0);
  console.log(`  ${w.class.padEnd(6)} ${w.fireMode.padEnd(5)} ${w.name.padEnd(14)} rpm=${String(w.rpm).padStart(4)} maxX=${maxX} maxY=${maxY}`);
}
