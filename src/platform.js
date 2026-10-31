// The Onceworlds SDK behind safe wrappers: every call works (or does nothing) when the SDK is missing or throws.

import { SAVE_KEY } from './save.js';

const guard = (fn, fallback) => {
  try {
    const r = fn();
    return r === undefined ? fallback : r;
  } catch {
    return fallback;
  }
};

// ?debug installs the screenshot tools' hook in game.js; such a page never awards badges or posts scores.
export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

export function getPlatform() {
  const ow = typeof window !== 'undefined' ? window.onceworlds || null : null;
  const mem = new Map();
  let ls = null;
  try {
    localStorage.setItem('__sled', '1');
    localStorage.removeItem('__sled');
    ls = localStorage;
  } catch {
    ls = null;
  }
  const noop = () => {};
  const p = {
    present: !!ow,
    raw: ow,
    async load() {
      if (ow) {
        try {
          return await ow.save.get(SAVE_KEY);
        } catch {
          return null;
        }
      }
      try {
        return JSON.parse(ls ? ls.getItem(SAVE_KEY) : mem.get(SAVE_KEY) || 'null');
      } catch {
        return null;
      }
    },
    async store(value) {
      if (ow) {
        try {
          await ow.save.set(SAVE_KEY, value);
        } catch {}
        return;
      }
      const s = JSON.stringify(value);
      try {
        if (ls) ls.setItem(SAVE_KEY, s);
        else mem.set(SAVE_KEY, s);
      } catch {}
    },
    quality: () => guard(() => ow.settings.quality, 'high'),
    choice: () => guard(() => ow.settings.choice, 'auto'),
    reducedMotion: () => guard(() => !!ow.settings.reducedMotion, false),
    pixelRatio: (max = 2) => guard(() => ow.settings.pixelRatio(max), Math.min(window.devicePixelRatio || 1, max)),
    onSettings(cb) {
      guard(() => ow.settings.on('change', cb));
    },
    on(name, cb) {
      guard(() => ow.on(name, cb));
    },
    award(id) {
      if (DEBUG) return;
      guard(() => {
        const r = ow.badges.award(id);
        if (r && r.catch) r.catch(noop);
      });
    },
    submit(board, score) {
      if (DEBUG) return;
      guard(() => {
        const r = ow.leaderboards.submit(board, score);
        if (r && r.catch) r.catch(noop);
      });
    },
    controls(opts) {
      guard(() => ow.controls.set(opts));
    },
    touch: () => guard(() => !!ow.controls.touch, false) || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches),
    setLook(look) {
      guard(() => ow.ui.setLook(look));
    },
    setOrientation(o) {
      guard(() => ow.ui.setOrientation(o));
    },
    reserved: () => guard(() => ow.ui.reserved, null),
    vibrate(ms) {
      guard(() => navigator.vibrate && navigator.vibrate(ms));
    },
  };
  return p;
}
