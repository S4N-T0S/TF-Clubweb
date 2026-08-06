// Offline USB vendor/product name lookup via the bundled usb.ids snapshot
// (public/vault/usb-ids.json.gz — regenerate with tools/generate-usb-ids.mjs).
//
// This module is ONLY ever dynamically imported (see SessionsPage), mirroring
// geoip.js: the asset ships pre-gzipped (Cloudflare does not compress it) and
// is fetched + inflated once, only when an export actually has peripherals.

let dbPromise = null;
export function loadUsbDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const res = await fetch('/vault/usb-ids.json.gz');
      if (!res.ok) throw new Error(`usb db ${res.status}`);
      let bytes = await res.arrayBuffer();
      // Magic-byte check: skip inflation if a proxy/server already content-decoded it.
      const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      if (head[0] === 0x1f && head[1] === 0x8b) {
        bytes = await new Response(new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      }
      return JSON.parse(new TextDecoder().decode(bytes));
    })().catch((e) => {
      dbPromise = null; // allow a retry on a later mount
      throw e;
    });
  }
  return dbPromise;
}
