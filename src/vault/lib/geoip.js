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
// Lazily fetch + parse the country DB once, then cache. Shipped gzip since clownflare does not compress oclet stream
export function loadGeoReader() {
  if (!readerPromise) {
    readerPromise = (async () => {
      const { Reader } = await import('mmdb-lib');
      const res = await fetch(geoAsset('dbip-country-lite.mmdb.gz'));
      if (!res.ok) throw new Error(`geo db ${res.status}`);
      let bytes = await res.arrayBuffer();
      // Magic-byte check: skip inflation if a proxy/server already content-decoded it.
      const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      if (head[0] === 0x1f && head[1] === 0x8b) {
        bytes = await new Response(new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      }
      return new Reader(Buffer.from(bytes));
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
