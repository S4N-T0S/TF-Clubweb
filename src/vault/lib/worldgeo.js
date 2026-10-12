import worldGeoUrl from '../assets/world.geo.json?url';

let geoJsonPromise = null;
export function loadWorldGeo() {
  if (!geoJsonPromise) {
    geoJsonPromise = fetch(worldGeoUrl)
      .then((r) => r.json())
      .catch((e) => {
        geoJsonPromise = null; // allow a retry on a later mount
        throw e;
      });
  }
  return geoJsonPromise;
}

// ISO-3166 alpha-2 -> flag emoji (regional indicator letters).
export const isoToFlag = (iso) =>
  iso && iso.length === 2
    ? iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
    : '🏳️';
