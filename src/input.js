// Keyboard and touch. Steer is -1..1: keys ramp in, a drag is analog relative to where the finger went down.

import { clamp } from './rng.js';

export function createInput(target, plat) {
  const keys = new Set();
  let keyAxis = 0;
  let hopQueued = false;
  let drag = null; // { id, x0, x }
  let dragSteer = 0;
  const handlers = { pause: null, enter: null, any: null, pointerStart: null };
  let enabled = false;
  let lastPresses = 0;

  const left = () => keys.has('KeyA') || keys.has('ArrowLeft');
  const right = () => keys.has('KeyD') || keys.has('ArrowRight');

  const onKeyDown = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const c = e.code;
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(c)) e.preventDefault();
    if (handlers.any) handlers.any(e);
    if (e.repeat) return;
    keys.add(c);
    if (c === 'Space' || c === 'KeyW' || c === 'ArrowUp') hopQueued = true;
    else if (c === 'KeyP' || c === 'Escape') handlers.pause && handlers.pause();
    else if (c === 'Enter') handlers.enter && handlers.enter(e);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const range = () => clamp(Math.min(window.innerWidth, window.innerHeight) * 0.13, 46, 78);

  const onDown = (e) => {
    if (!enabled) return;
    if (e.target.closest && e.target.closest('button, [data-ui]')) return;
    if (!drag && (e.isPrimary || e.pointerType === 'mouse')) {
      drag = { id: e.pointerId, x0: e.clientX, x: e.clientX };
      dragSteer = 0;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {}
    } else {
      // a second finger hops
      hopQueued = true;
    }
    if (handlers.pointerStart) handlers.pointerStart(e);
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    const r = range();
    const dx = drag.x - drag.x0;
    if (Math.abs(dx) > r * 1.5) drag.x0 = drag.x - Math.sign(dx) * r * 1.5;
    dragSteer = clamp((drag.x - drag.x0) / r, -1, 1);
  };
  const onUp = (e) => {
    if (drag && e.pointerId === drag.id) {
      drag = null;
      dragSteer = 0;
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    keys.clear();
    drag = null;
    dragSteer = 0;
  });
  target.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  return {
    handlers,
    setEnabled(v) {
      enabled = v;
      if (!v) {
        drag = null;
        dragSteer = 0;
        hopQueued = false;
      }
    },
    /** Steer value for this frame. */
    steer(dt) {
      const want = (right() ? 1 : 0) - (left() ? 1 : 0);
      const rate = want !== 0 && Math.sign(want) === Math.sign(keyAxis || want) ? 5.2 : 11;
      keyAxis += clamp(want - keyAxis, -rate * dt, rate * dt);
      let s = keyAxis;
      // the platform's analog stick, if a game ever asks for it, adds in
      if (drag) s = dragSteer;
      return clamp(s, -1, 1);
    },
    /** True once per press (the key, a second finger, or the platform's Hop button). */
    hop() {
      let h = hopQueued;
      hopQueued = false;
      const ow = plat && plat.raw;
      if (ow) {
        try {
          const n = ow.controls.presses('hop');
          if (n > lastPresses) h = true;
          lastPresses = n;
        } catch {}
      }
      return h;
    },
    queueHop() {
      hopQueued = true;
    },
    clearHop() {
      hopQueued = false;
    },
    dragging: () => !!drag,
  };
}
