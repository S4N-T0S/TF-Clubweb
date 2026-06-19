// Warm the browser cache with the bundled weapon icons + map backgrounds the moment an export starts loading
//
// Fire-and-forget: the fetches are same-origin static assets that decode off the
// main thread, so this never blocks parsing. Runs at most once per session.
import { weaponIconUrls } from './weapons';
import { mapImageUrls } from './maps';

let started = false;

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
