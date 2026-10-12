// Warm the browser cache with the bundled weapon icons + map backgrounds the moment an export starts loading
//
// Fire-and-forget: the fetches are same-origin static assets that decode off the
// main thread, so this never blocks parsing. Runs at most once per session.
import { weaponIconUrls } from './weapons';
import { mapImageUrls } from './maps';
import { loadWorldGeo } from './worldgeo';

let started = false;
let dataStarted = false;

export function preloadVaultImages() {
  if (started || typeof window === 'undefined') return;
  started = true;
  // Maps first
  const urls = [...mapImageUrls(), ...weaponIconUrls()];
  const run = () => {
    for (const src of urls) {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    }
  };
  // Defer to idle so it never competes with the export parse for the main thread
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 0);
}

// Sessions page data (world geometry, usb ids, GeoIP db), smallest first, through the same
// memoised loaders the page awaits, so an export opened mid-download waits on this request
// instead of starting another. The first failure ends the run and clears the flag so the next
// mount retries; steps that already succeeded resolve instantly. Ending early keeps an outage
// away from the usbids/geoip chunk imports, because the browser caches a failed import() until
// reload. Skipped under Data Saver. Only the Collection pictures and sound bites stay on demand.
export function preloadVaultData() {
  if (dataStarted || typeof window === 'undefined' || navigator.connection?.saveData) return;
  dataStarted = true;
  const steps = [
    () => loadWorldGeo(),
    () => import('./usbids').then((m) => m.loadUsbDb()),
    () => import('./geoip').then((m) => m.loadGeoReader()),
  ];
  const run = async () => {
    try {
      for (const step of steps) await step();
    } catch {
      dataStarted = false;
    }
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 0);
}
