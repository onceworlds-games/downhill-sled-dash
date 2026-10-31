// Time of day by distance. Pure: returns plain numbers; colours are 0xRRGGBB integers.

import { smooth } from './rng.js';
import { CAM_DAY_LENGTH } from './config.js';

// d (m), then the look.
const KEYS = [
  { d: 0, name: 'dawn', top: 0x5a6fb0, hor: 0xffb28a, fog: 0xe8b9a8, sun: 0xffb073, sunI: 1.7, el: 12, hemiS: 0x8ea2d6, hemiG: 0xc9d6ef, hemiI: 0.8, fogFar: 300, night: 0, snow: 0xeef3ff, mtn: 0x6c7fb8 },
  { d: 800, name: 'day', top: 0x3d86e0, hor: 0xbfe0ff, fog: 0xcfe6fb, sun: 0xfff4dd, sunI: 2.7, el: 54, hemiS: 0xbcd6ff, hemiG: 0xe4eefc, hemiI: 1.0, fogFar: 380, night: 0, snow: 0xffffff, mtn: 0x7f9fce },
  { d: 1800, name: 'golden', top: 0x4b86c9, hor: 0xffd9a0, fog: 0xf1d9b8, sun: 0xffcf8a, sunI: 2.4, el: 28, hemiS: 0x9fb6e6, hemiG: 0xe8d3b4, hemiI: 0.9, fogFar: 340, night: 0, snow: 0xfff3e0, mtn: 0x8a95bd },
  { d: 3000, name: 'sunset', top: 0x3a3c8c, hor: 0xff7a4a, fog: 0xd9856f, sun: 0xff7a3a, sunI: 1.9, el: 7, hemiS: 0x6c78c4, hemiG: 0xb79fae, hemiI: 0.72, fogFar: 300, night: 0.1, snow: 0xffe3d6, mtn: 0x6a5d9a },
  { d: 3800, name: 'dusk', top: 0x1e2556, hor: 0xb35a7a, fog: 0x5a5483, sun: 0x8a6aa8, sunI: 0.7, el: 4, hemiS: 0x4a5598, hemiG: 0x6b6fa3, hemiI: 0.6, fogFar: 260, night: 0.55, snow: 0xc9cce8, mtn: 0x3a3f78 },
  { d: 4500, name: 'night', top: 0x07102b, hor: 0x1b2f63, fog: 0x142348, sun: 0x9db8ff, sunI: 1.0, el: 38, hemiS: 0x2f4391, hemiG: 0x3b4e8c, hemiI: 0.6, fogFar: 230, night: 1, snow: 0xaebbe0, mtn: 0x16224b },
  { d: 6000, name: 'night', top: 0x060d26, hor: 0x1d2d63, fog: 0x13214a, sun: 0x9db8ff, sunI: 1.0, el: 30, hemiS: 0x2f4391, hemiG: 0x3b4e8c, hemiI: 0.6, fogFar: 220, night: 1, snow: 0xaebbe0, mtn: 0x16224b },
  { d: CAM_DAY_LENGTH, name: 'dawn', top: 0x5a6fb0, hor: 0xffb28a, fog: 0xe8b9a8, sun: 0xffb073, sunI: 1.7, el: 12, hemiS: 0x8ea2d6, hemiG: 0xc9d6ef, hemiI: 0.8, fogFar: 300, night: 0, snow: 0xeef3ff, mtn: 0x6c7fb8 },
];

const COLOR_KEYS = ['top', 'hor', 'fog', 'sun', 'hemiS', 'hemiG', 'snow', 'mtn'];
const NUM_KEYS = ['sunI', 'el', 'hemiI', 'fogFar', 'night'];

export function mixColor(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + ((((b >> 8) & 255) - ag) * t));
  const bl = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** The look at distance d. `out` is reused when given. */
export function todAt(d, out = {}) {
  const p = ((d % CAM_DAY_LENGTH) + CAM_DAY_LENGTH) % CAM_DAY_LENGTH;
  let i = 0;
  while (i < KEYS.length - 2 && p >= KEYS[i + 1].d) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth((p - a.d) / (b.d - a.d));
  for (const k of COLOR_KEYS) out[k] = mixColor(a[k], b[k], t);
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  out.name = t < 0.5 ? a.name : b.name;
  out.phase = p;
  // Snow falls through the night and on every lap after the first.
  const lap = d >= CAM_DAY_LENGTH ? 1 : 0;
  out.snowfall = Math.min(1, Math.max(smooth((p - 4300) / 700) * (p < 6600 ? 1 : 1 - smooth((p - 6600) / 400)), lap * 0.9));
  out.stars = Math.max(0, (out.night - 0.35) / 0.65);
  out.lanterns = out.night > 0.45 ? 1 : 0;
  return out;
}
