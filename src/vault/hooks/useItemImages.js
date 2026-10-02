import { useSyncExternalStore } from 'react';
import manifestUrl from '../lib/itemManifest.json?url';
import { ITEM_IMAGE_BASE, ITEM_SOUND_BASE, createItemImages, createItemSounds } from '../lib/itemImages';

// The index of pictures and sound bites, fetched once per session when a page first asks
// for it. They are the one part of the vault that is not preloaded, so this can fail offline.
const none = () => null;
let state = { status: 'idle', imageOf: none, soundOf: none };
const listeners = new Set();
const set = (next) => {
  state = next;
  listeners.forEach((notify) => notify());
};

const load = () => {
  if (state.status === 'loading' || state.status === 'ready') return;
  set({ status: 'loading', imageOf: none, soundOf: none });
  fetch(manifestUrl)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((manifest) => {
      const fileOf = createItemImages(manifest);
      const audioOf = createItemSounds(manifest);
      // /vault/* is cached for a year, so the build date is what lets a replaced file through.
      const url = (base, file) => (file ? `${base}/${file}?v=${manifest.built}` : null);
      set({
        status: 'ready',
        imageOf: (it) => url(ITEM_IMAGE_BASE, it?.klass ? fileOf(it) : null),
        soundOf: (it) => url(ITEM_SOUND_BASE, it?.klass ? audioOf(it) : null),
      });
    })
    .catch(() => set({ status: 'offline', imageOf: none, soundOf: none }));
};

const subscribe = (notify) => {
  if (listeners.size === 0) window.addEventListener('online', load);
  listeners.add(notify);
  if (state.status === 'idle' || (state.status === 'offline' && listeners.size === 1)) load();
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) window.removeEventListener('online', load);
  };
};
const snapshot = () => state;

// status: 'loading' | 'ready' | 'offline'. imageOf(item) and soundOf(item) are URLs, or null
// when the item has no picture or audio, or the index has not arrived.
export const useItemImages = () => {
  const { status, imageOf, soundOf } = useSyncExternalStore(subscribe, snapshot);
  return { status: status === 'idle' ? 'loading' : status, imageOf, soundOf, retry: load };
};
