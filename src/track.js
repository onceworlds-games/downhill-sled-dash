// The mountain as functions of (d, x). Pure.

import { HALF } from './config.js';
import { hashUnit } from './rng.js';

export const SLOPE = 0.3;

/** World X of the track centre at distance d (a gentle winding). */
export function centre(d) {
  return 20 * Math.sin(d / 290) + 8 * Math.sin(d / 101 + 2);
}
export function centreSlope(d) {
  return (20 / 290) * Math.cos(d / 290) + (8 / 101) * Math.cos(d / 101 + 2);
}
/** Height of the slope's spine at d (descending, with swells). */
export function slopeY(d) {
  return -SLOPE * d + 2.6 * Math.sin(d / 43) + 1.4 * Math.sin(d / 17 + 1.3);
}
export function slopeDY(d) {
  return -SLOPE + (2.6 / 43) * Math.cos(d / 43) + (1.4 / 17) * Math.cos(d / 17 + 1.3);
}

function vnoise(a, b) {
  const ia = Math.floor(a);
  const ib = Math.floor(b);
  const fa = a - ia;
  const fb = b - ib;
  const sa = fa * fa * (3 - 2 * fa);
  const sb = fb * fb * (3 - 2 * fb);
  const h = (i, j) => hashUnit(ia + i + 7919, ib + j + 104729);
  const top = h(0, 0) + (h(1, 0) - h(0, 0)) * sa;
  const bot = h(0, 1) + (h(1, 1) - h(0, 1)) * sa;
  return top + (bot - top) * sb;
}

/** Height of the snow at (d, x) relative to the slope spine: flat track, rising banks with rolling noise. */
export function terrainOffset(d, x) {
  const ax = Math.abs(x);
  const dunes = (vnoise(d / 9, x / 7) - 0.5) * 0.22;
  if (ax <= HALF + 1) return dunes;
  const t = ax - HALF - 1;
  const rise = 0.075 * t * t + 0.25 * t;
  const hills = (vnoise(d / 26, x / 18) - 0.5) * 7 * Math.min(1, t / 6);
  return dunes + Math.min(rise, 34) + hills;
}

export function groundY(d, x) {
  return slopeY(d) + terrainOffset(d, x);
}

/** World position of track point (d, x) with height h above the snow, written into out = [x, y, z]. */
export function worldPoint(out, d, x, h = 0) {
  out[0] = centre(d) + x;
  out[1] = groundY(d, x) + h;
  out[2] = -d;
  return out;
}
