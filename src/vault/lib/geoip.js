// Offline IP geolocation via the bundled DB-IP Country Lite database.
//
// This module is ONLY ever dynamically imported (see SessionsPage) so mmdb-lib
// + buffer stay out of the main vault chunk.
// Licensing: DB-IP Lite is CC-BY — "IP Geolocation by DB-IP" attribution is rendered under the map
import { Buffer } from 'buffer';
import { geoAsset } from './worldgeo';

// mmdb-lib references a global `Buffer`. Sets it BEFORE importing mmdb-lib (done dynamically inside the loader, after this line has run).
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer;

let readerPromise = null;
// Lazily fetch + parse the ~8 MB country DB once, then cache.
export function loadGeoReader() {
  if (!readerPromise) {
    readerPromise = (async () => {
      const { Reader } = await import('mmdb-lib');
      const res = await fetch(geoAsset('dbip-country-lite.mmdb'));
      if (!res.ok) throw new Error(`geo db ${res.status}`);
      return new Reader(Buffer.from(await res.arrayBuffer()));
    })().catch((e) => {
      readerPromise = null; // allow a retry on a later mount
      throw e;
    });
  }
  return readerPromise;
}

export function lookupCountry(reader, ip) {
  try {
    const c = reader.get(ip)?.country;
    if (!c?.iso_code) return null;
    return { iso: c.iso_code, name: c.names?.en || c.iso_code };
  } catch {
    return null;
  }
}
