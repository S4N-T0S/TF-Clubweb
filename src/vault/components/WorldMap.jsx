import { useEffect, useMemo, useState } from 'react';
import { loadWorldGeo } from '../lib/worldgeo';

const W = 720;
const H = 360;
const project = ([lon, lat]) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
const ringPath = (ring) => ring.map((pt, i) => `${i ? 'L' : 'M'}${project(pt).map((n) => n.toFixed(1)).join(' ')}`).join('') + 'Z';
const geomPath = (geom) => {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.map((poly) => poly.map(ringPath).join('')).join('');
};

// Equirectangular choropleth. Countries the player connected from are shaded
// emerald (deeper = more sessions); everything else is faint. Fully offline.
export const WorldMap = ({ countries }) => {
  const [geo, setGeo] = useState(null);
  useEffect(() => {
    let alive = true;
    loadWorldGeo().then((g) => alive && setGeo(g)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const { detected, maxSessions } = useMemo(() => {
    const d = new Map(countries.filter((c) => c.iso).map((c) => [c.iso, c]));
    return { detected: d, maxSessions: Math.max(1, ...countries.map((c) => c.sessions || 0)) };
  }, [countries]);

  if (!geo) return <div className="h-44 flex items-center justify-center text-gray-500 text-sm">Loading map…</div>;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-gray-900 border border-gray-700">
      {geo.features.map((f, i) => {
        const hit = detected.get(f.properties.iso);
        const fill = hit ? `rgba(16,185,129,${(0.4 + 0.6 * (hit.sessions / maxSessions)).toFixed(2)})` : '#1f2937';
        return (
          <path key={i} d={geomPath(f.geometry)} fill={fill} stroke="#374151" strokeWidth="0.3">
            <title>{f.properties.name}{hit ? ` — ${hit.sessions} session${hit.sessions === 1 ? '' : 's'}` : ''}</title>
          </path>
        );
      })}
    </svg>
  );
};
