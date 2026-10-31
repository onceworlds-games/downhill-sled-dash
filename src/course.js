// The course: a guaranteed route, and stretches of hazards built around it with a seeded RNG. Pure.
//
// Every blocking obstacle keeps clear of the route (the route's lateral slope is at most half of what the sled can do
// at that speed), so a fair path always exists; test/fair.test.mjs re-checks that independently.

import { HALF, PLAYER_R, G, HOP_V, speedAt, vmaxLat, hopSpacing, launchVy, airDistance } from './config.js';
import { rngFor, clamp, lerp } from './rng.js';

export const SP = 36; // route waypoint spacing
const BUCKET = 16;
const RB = HALF - 4; // the route stays inside +-RB

export function createRoute(seed) {
  const rng = rngFor(seed, 1);
  const wp = [0];
  let lastSign = 1;
  const limitAt = (d) => {
    const v = speedAt(d);
    return (0.5 * vmaxLat(v)) / v;
  };
  function pushOne(mode, target) {
    const d = wp.length * SP;
    const maxD = (limitAt(d) * SP) / 1.6;
    const prev = wp[wp.length - 1];
    let nx = prev;
    if (mode === 'goto') nx = prev + clamp(target - prev, -maxD, maxD);
    else if (mode === 'wander') {
      let dir = rng() < 0.7 ? -lastSign : lastSign;
      if (prev > RB - 2) dir = -1;
      else if (prev < -RB + 2) dir = 1;
      nx = prev + dir * (0.35 + 0.65 * rng()) * maxD;
      lastSign = dir;
    }
    wp.push(clamp(nx, -RB, RB));
  }
  const route = {
    wp,
    /** Make sure waypoints cover distance d. */
    extendTo(d, mode = 'wander', target = 0) {
      while ((wp.length - 1) * SP < d) pushOne(mode, target);
    },
    x(d) {
      if (d <= 0) return wp[0];
      const f = d / SP;
      const k = Math.floor(f);
      if (k + 1 >= wp.length) return wp[wp.length - 1];
      const t = f - k;
      const s = t * t * (3 - 2 * t);
      return wp[k] + (wp[k + 1] - wp[k]) * s;
    },
    slope(d) {
      if (d <= 0) return 0;
      const f = d / SP;
      const k = Math.floor(f);
      if (k + 1 >= wp.length) return 0;
      const t = f - k;
      return ((wp[k + 1] - wp[k]) * 6 * t * (1 - t)) / SP;
    },
    aligned(d) {
      return Math.ceil(d / SP - 1e-9) * SP;
    },
    /** Forget waypoints after distance d (the next stretch decides them). */
    cut(d) {
      const idx = Math.round(d / SP);
      if (wp.length > idx + 1) wp.length = idx + 1;
    },
  };
  return route;
}

export const diffAt = (d) => {
  const t = clamp(d / 5200, 0, 1);
  return t * t * (3 - 2 * t) * 0.35 + t * 0.65;
};

export function createCourse(seed) {
  const rng = rngFor(seed, 2);
  const route = createRoute(seed);
  const buckets = new Map();
  const course = {
    seed,
    route,
    cursor: 0,
    clears: [], // {d0, d1}: no scatter here
    ice: [], // {d0, d1}
    air: [], // {d0, d1, cap}: zones with little steering, the route is straight there
    hopRows: [], // d of every log that spans the track
    stretchNo: 0,
    last: '',
    nextPowerAt: 380,
    names: [],
  };

  const add = (kind, item) => {
    const k = Math.floor(item.d / BUCKET);
    let b = buckets.get(k);
    if (!b) {
      b = { trees: [], rocks: [], logs: [], fences: [], ramps: [], gates: [], bells: [], powers: [], movers: [] };
      buckets.set(k, b);
    }
    b[kind].push(item);
    return item;
  };
  /** Items of a kind with d0 <= d <= d1 (bucket-granular: callers allow a margin). */
  const near = (kind, d0, d1, out = []) => {
    out.length = 0;
    const a = Math.floor(d0 / BUCKET);
    const z = Math.floor(d1 / BUCKET);
    for (let k = a; k <= z; k++) {
      const b = buckets.get(k);
      if (!b) continue;
      const arr = b[kind];
      for (let i = 0; i < arr.length; i++) out.push(arr[i]);
    }
    return out;
  };
  course.add = add;
  course.near = near;
  course.all = (kind) => {
    const out = [];
    for (const k of [...buckets.keys()].sort((a, b) => a - b)) out.push(...buckets.get(k)[kind]);
    return out;
  };
  course.prune = (d) => {
    const lim = Math.floor((d - 160) / BUCKET);
    for (const k of buckets.keys()) if (k < lim) buckets.delete(k);
    while (course.clears.length && course.clears[0].d1 < d - 200) course.clears.shift();
    while (course.ice.length && course.ice[0].d1 < d - 200) course.ice.shift();
    while (course.air.length && course.air[0].d1 < d - 200) course.air.shift();
  };

  const inClear = (d) => {
    for (const z of course.clears) if (d >= z.d0 && d <= z.d1) return true;
    return false;
  };
  const padAt = (d) => lerp(1.7, 1.15, diffAt(d));
  /** Is (d, x) with radius r too close to the guaranteed route? */
  const nearRoute = (d, x, r, pad = padAt(d)) => {
    const need = r + PLAYER_R + pad;
    for (let q = d - r - 1.4; q <= d + r + 1.4; q += 0.8) if (Math.abs(x - route.x(q)) < need) return true;
    return false;
  };
  const overlaps = (d, x, r) => {
    const t = near('trees', d - 5, d + 5);
    for (let i = 0; i < t.length; i++) if (Math.hypot(t[i].d - d, t[i].x - x) < t[i].r + r + 1.1) return true;
    const k = near('rocks', d - 5, d + 5);
    for (let i = 0; i < k.length; i++) if (Math.hypot(k[i].d - d, k[i].x - x) < k[i].r + r + 1.1) return true;
    return false;
  };

  const addTree = (d, x) => add('trees', { d, x, r: 0.9, h: 3.6, s: 0.85 + rng() * 0.5, v: Math.floor(rng() * 3), dead: false });
  const addRock = (d, x, small, scale) => {
    const s = small ? 0.55 + rng() * 0.15 : scale ?? 0.9 + rng() * 0.9;
    return add('rocks', { d, x, r: small ? 0.62 : 1.0 * s + 0.1, h: small ? 0.7 : 2.0 * s, s, small: !!small, rot: rng() * 6.28, dead: false });
  };

  function scatter(d0, d1, perHundred, o = {}) {
    const n = Math.round(((d1 - d0) / 100) * perHundred);
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 8; tries++) {
        const d = d0 + rng() * (d1 - d0);
        const roll = rng();
        const x = (rng() * 2 - 1) * (HALF - 1.0);
        if (inClear(d)) continue;
        if (roll < (o.rocks ?? 0.28)) {
          const small = rng() < (o.small ?? 0.25);
          const s = o.big ? 1.1 + rng() * 0.9 : undefined;
          const rr = small ? 0.62 : (s ?? 1.35) * 1.0 + 0.1;
          if (nearRoute(d, x, rr, padAt(d) + (o.extraPad ?? 0)) || overlaps(d, x, rr)) continue;
          addRock(d, x, small, s);
        } else if (roll < 0.9) {
          if (nearRoute(d, x, 0.9, padAt(d) + (o.extraPad ?? 0)) || overlaps(d, x, 0.9)) continue;
          addTree(d, x);
        } else {
          // a small cluster
          const k = 2 + Math.floor(rng() * 3);
          for (let j = 0; j < k; j++) {
            const dd = d + (rng() - 0.5) * 5;
            const xx = clamp(x + (rng() - 0.5) * 5, -HALF + 1, HALF - 1);
            if (inClear(dd) || nearRoute(dd, xx, 0.9, padAt(d) + (o.extraPad ?? 0)) || overlaps(dd, xx, 0.9)) continue;
            addTree(dd, xx);
          }
        }
        break;
      }
    }
  }

  function bellLine(d0, d1, o = {}) {
    const step = o.step ?? 2.4;
    const off = o.off ?? 0;
    const wig = o.wiggle ?? 0;
    for (let d = d0; d <= d1; d += step) {
      const x = clamp(route.x(d) + off + wig * Math.sin(d * 0.35), -HALF + 1, HALF - 1);
      add('bells', { d, x, y: o.y ?? 0.45, got: false });
    }
  }
  function bellArc(dStart, length, apex, stepM = 3.2) {
    for (let t = 0; t <= length + 1e-6; t += stepM) {
      const f = t / length;
      add('bells', { d: dStart + t, x: route.x(dStart + t), y: 0.5 + apex * 4 * f * (1 - f), got: false });
    }
  }

  /** Start of a straight stretch: the first waypoint at or after c, with everything beyond it undecided. */
  function startAt(c) {
    const a = route.aligned(c);
    route.extendTo(a, 'wander');
    route.cut(a);
    return a;
  }

  // ---- stretches (each returns the new cursor) ----

  function runway(c, len) {
    route.extendTo(c + len + SP, 'straight');
    bellLine(c + 26, c + len - 10, { step: 2.6 });
    course.clears.push({ d0: c, d1: c + len });
    return c + len;
  }

  function sScatter(c, len, mult = 1) {
    route.extendTo(c + len + SP, 'wander');
    const dens = lerp(5, 13, diffAt(c)) * mult;
    scatter(c, c + len, dens);
    if (rng() < 0.7) bellLine(c + 8, c + len - 8, { step: 2.4, wiggle: 1.0 });
    return c + len;
  }

  function sWall(c) {
    const df = diffAt(c);
    const rows = 2 + Math.floor(df * 2.2 + rng() * 0.9);
    const gh = lerp(3.5, 2.7, df);
    let d = c + 14;
    route.extendTo(c + 14 + rows * 24 + SP, 'wander');
    for (let r = 0; r < rows; r++) {
      const g = route.x(d);
      const rockRow = rng() < 0.3;
      for (let x = -HALF + 1; x <= HALF - 0.9; x += 2.3) {
        if (Math.abs(x - g) < gh) continue;
        const jx = x + (rng() - 0.5) * 0.4;
        if (rockRow) addRock(d + (rng() - 0.5) * 0.6, jx, false, 1.0);
        else addTree(d + (rng() - 0.5) * 0.6, jx);
      }
      bellLine(d - 6, d + 6, { step: 3, y: 0.5 });
      d += 17 + rng() * 6;
    }
    scatter(c, d + 6, lerp(3, 8, df), { extraPad: 0.3 });
    return d + 6;
  }

  function sLogs(c) {
    const a = startAt(c);
    const df = diffAt(a);
    const n = 1 + Math.floor(rng() * (1 + df * 2));
    let d = a + 22;
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push(d);
      d += hopSpacing(speedAt(d)) + 6 + rng() * 10;
    }
    const end = d + 14;
    route.extendTo(end + SP, 'straight');
    if (c < a) scatter(c, a, lerp(5, 12, df));
    const airLen = (2 * HOP_V) / G;
    for (const ld of rows) {
      const full = rng() < 0.82;
      let x0 = -HALF;
      let x1 = HALF;
      if (!full) {
        // a partial log: the route side is open, go round or hop
        const side = rng() < 0.5 ? -1 : 1;
        const rx = route.x(ld);
        if (side < 0) {
          x0 = -HALF;
          x1 = rx - 5;
        } else {
          x0 = rx + 5;
          x1 = HALF;
        }
      }
      add('logs', { d: ld, x0, x1, h: 0.95, full });
      if (full) course.hopRows.push(ld);
      course.air.push({ d0: ld - 1, d1: ld + 0.8 * airLen * speedAt(ld), cap: 0.3 });
      bellArc(ld - 7, 14, 1.35);
    }
    scatter(a, end, lerp(4, 9, df), { extraPad: 0.5 });
    return end;
  }

  function sFence(c) {
    const df = diffAt(c);
    const rows = 1 + Math.floor(rng() * 2 + df * 1.5);
    route.extendTo(c + 16 + rows * 24 + SP, 'wander');
    const gw = lerp(6.2, 4.8, df);
    let d = c + 14;
    for (let r = 0; r < rows; r++) {
      const gaps = [route.x(d)];
      if (rng() < 0.45) {
        const alt = clamp(route.x(d) + (rng() < 0.5 ? -1 : 1) * (9 + rng() * 3), -HALF + 3, HALF - 3);
        if (Math.abs(alt - gaps[0]) > gw + 1) gaps.push(alt);
      }
      gaps.sort((p, q) => p - q);
      let from = -HALF;
      for (const g of gaps) {
        if (g - gw / 2 > from + 0.5) add('fences', { d, x0: from, x1: g - gw / 2 });
        from = g + gw / 2;
      }
      if (from < HALF - 0.5) add('fences', { d, x0: from, x1: HALF });
      bellLine(d - 7, d + 7, { step: 3.2 });
      d += 22 + rng() * 6;
    }
    scatter(c, d + 4, lerp(3, 9, df), { extraPad: 0.4 });
    return d + 4;
  }

  function sRamp(c, opening = false) {
    const a = startAt(c);
    const len = 7.5;
    const v = speedAt(a + len);
    const air = airDistance(v);
    const total = len + air + 16;
    route.extendTo(a + total + SP, 'straight');
    const df = diffAt(a);
    if (c < a) scatter(c, a - 4, opening ? 4 : lerp(5, 12, df));
    const rx = route.x(a);
    add('ramps', { d: a, x: rx, w: 6.4, len, h: 1.5 });
    if (!opening && df > 0.12 && rng() < 0.45) {
      const side = rx > 0 ? -1 : 1;
      const x2 = clamp(rx + side * 9.5, -HALF + 3.4, HALF - 3.4);
      if (Math.abs(x2 - rx) > 7) add('ramps', { d: a + 3, x: x2, w: 6.4, len, h: 1.5 });
    }
    const vy = launchVy(v);
    bellArc(a + len + 4, Math.max(8, air - 8), (vy * vy) / (2 * G) * 0.8);
    course.clears.push({ d0: a - 8, d1: a + total });
    course.air.push({ d0: a, d1: a + len + air + 4, cap: 0.12 });
    // trees frame the runway out of play
    return a + total;
  }

  function sGates(c, count) {
    const df = diffAt(c);
    const n = count ?? 4 + Math.floor(rng() * 3);
    const spacing = clamp(0.55 * speedAt(c), 14, 24);
    const end = c + 12 + n * spacing;
    route.extendTo(end + SP, 'wander');
    for (let i = 0; i < n; i++) {
      const d = c + 12 + i * spacing;
      add('gates', { d, cx: route.x(d), w: 5.6, done: false });
      if (i > 0) bellLine(d - spacing + 4, d - 4, { step: 2.8 });
    }
    scatter(c, end, lerp(3, 8, df), { extraPad: 1.6 });
    return end;
  }

  function sIce(c) {
    const a = startAt(c);
    const df = diffAt(a);
    const nsp = rng() < 0.5 ? 2 : 3;
    const len = nsp * SP;
    route.extendTo(a + len + SP, 'straight');
    if (c < a) scatter(c, a, lerp(5, 12, df));
    course.ice.push({ d0: a, d1: a + len });
    course.clears.push({ d0: a, d1: a + len });
    const rx = route.x(a);
    const n = 2 + Math.floor(rng() * 3 + df * 2);
    for (let i = 0; i < n; i++) {
      const d = a + 10 + rng() * (len - 20);
      const side = rng() < 0.5 ? -1 : 1;
      const x = clamp(rx + side * (6.5 + rng() * 3), -HALF + 1.2, HALF - 1.2);
      if (Math.abs(x - rx) < 6 || overlaps(d, x, 1.6)) continue;
      if (rng() < 0.6) addRock(d, x, false, 1.3);
      else addTree(d, x);
    }
    bellLine(a + 6, a + len - 6, { step: 2.8 });
    return a + len + 6;
  }

  function sLanes(c) {
    const a = startAt(c);
    const df = diffAt(a);
    const len = 2 * SP;
    route.extendTo(a + len + SP, 'straight');
    if (c < a) scatter(c, a, lerp(5, 12, df));
    const hw = lerp(3.8, 3.1, df);
    const rx = route.x(a);
    for (let d = a + 4; d < a + len - 2; d += 3.1) {
      addTree(d, rx - hw - 0.4 * Math.sin(d));
      addTree(d + 1.5, rx + hw + 0.4 * Math.cos(d));
    }
    for (let d = a + 4; d < a + len - 2; d += 4.4) {
      for (const sgn of [-1, 1]) {
        const x = rx + sgn * (hw + 2.6);
        if (Math.abs(x) < HALF - 0.5) addTree(d + 0.6 * sgn, x);
      }
    }
    bellLine(a + 6, a + len - 4, { step: 2.6 });
    course.clears.push({ d0: a, d1: a + len });
    return a + len + 4;
  }

  function sMover(c, kind) {
    const df = diffAt(c);
    const s = rng() < 0.5 ? -1 : 1;
    const target = -s * (kind === 'ball' ? 5.8 : 7);
    // walk the route to the far side, then hold it there
    let guard = 0;
    startAt(c);
    while (Math.abs(route.wp[route.wp.length - 1] - target) > 0.5 && guard++ < 8) route.extendTo(route.wp.length * SP, 'goto', target);
    const a = Math.max(c, (route.wp.length - 1) * SP);
    const count = kind === 'ball' ? 2 + Math.floor(rng() * 2) : 1;
    const gap = kind === 'ball' ? 30 : 0;
    const end = a + 24 + count * gap + (kind === 'ball' ? 14 : 70);
    route.extendTo(end + SP, 'straight');
    if (c < a) scatter(c, a, lerp(5, 11, df));
    for (let i = 0; i < count; i++) {
      const d = a + 36 + i * gap + (kind === 'cat' ? 20 : 0);
      const v = speedAt(d);
      if (kind === 'ball') {
        const xFrom = s * (HALF + 5);
        const xTo = -s * 1.0;
        const speed = 11;
        const dur = Math.abs(xTo - xFrom) / speed;
        add('movers', { kind: 'ball', d, xFrom, xTo, speed, r: 1.25, hd: 1.25, hw: 1.25, h: 2.4, lead: v * dur * (0.55 + rng() * 0.3), t0: -1, active: true, s });
      } else {
        const xFrom = s * (HALF + 8);
        const xTo = -s * 0.5;
        const speed = 5.2;
        const dur = Math.abs(xTo - xFrom) / speed;
        add('movers', { kind: 'cat', d, xFrom, xTo, speed, r: 3.6, hd: 2.1, hw: 3.6, h: 3.0, lead: v * dur * (0.55 + rng() * 0.25), t0: -1, active: true, s });
      }
    }
    bellLine(a + 8, end - 6, { step: 2.8 });
    course.clears.push({ d0: a, d1: end });
    scatter(a, end, lerp(2, 5, df), { extraPad: 0.5 });
    return end;
  }

  function sRockfield(c) {
    const df = diffAt(c);
    const len = 70 + rng() * 30;
    route.extendTo(c + len + SP, 'wander');
    scatter(c, c + len, lerp(9, 18, df), { rocks: 0.6, small: 0.3, big: true, extraPad: 0.2 });
    bellLine(c + 6, c + len - 6, { step: 2.6, wiggle: 0.8 });
    return c + len;
  }

  const STRETCHES = [
    ['scatter', (c) => sScatter(c, 70 + rng() * 50), () => 3.2],
    ['wall', sWall, () => 2.2],
    ['logs', sLogs, (df) => 2.0],
    ['fence', sFence, (df) => 1.3 + df],
    ['ramp', (c) => sRamp(c), () => 1.7],
    ['gates', (c) => sGates(c), () => 2.2],
    ['ice', sIce, (df) => (df > 0.08 ? 1.0 : 0)],
    ['lanes', sLanes, (df) => (df > 0.15 ? 1.3 : 0)],
    ['balls', (c) => sMover(c, 'ball'), (df) => (df > 0.28 ? 1.3 : 0)],
    ['cat', (c) => sMover(c, 'cat'), (df) => (df > 0.5 ? 1.0 : 0)],
    ['rocks', sRockfield, () => 1.3],
  ];

  function pick(c) {
    const df = diffAt(c);
    let total = 0;
    const w = STRETCHES.map(([name, , wt]) => {
      let x = wt(df);
      if (name === course.last) x *= 0.2;
      total += x;
      return x;
    });
    let r = rng() * total;
    for (let i = 0; i < STRETCHES.length; i++) {
      r -= w[i];
      if (r <= 0) return STRETCHES[i];
    }
    return STRETCHES[0];
  }

  function powerUps(from, to) {
    if (course.nextPowerAt > to - 10) return;
    const d = Math.max(from + 10, course.nextPowerAt);
    if (inClear(d) && course.air.some((z) => d >= z.d0 && d <= z.d1 && z.cap < 0.2)) {
      course.nextPowerAt = d + 40;
      return;
    }
    const types = ['magnet', 'shield', 'boost', 'x2'];
    const wts = [0.25, 0.3, 0.2, 0.25];
    let r = rng();
    let type = types[3];
    for (let i = 0; i < 4; i++) {
      r -= wts[i];
      if (r <= 0) {
        type = types[i];
        break;
      }
    }
    route.extendTo(d + SP, 'wander');
    add('powers', { d, x: route.x(d), type, got: false });
    course.nextPowerAt = d + 520 + rng() * 520;
  }

  course.ensure = (dTo) => {
    while (course.cursor < dTo) {
      const c = course.cursor;
      let end;
      let name;
      switch (course.stretchNo) {
        case 0:
          name = 'runway';
          end = runway(c, 120);
          break;
        case 1: {
          // one log, taught once
          name = 'log1';
          const a = startAt(c);
          route.extendTo(a + 3 * SP, 'straight');
          const ld = a + 34;
          add('logs', { d: ld, x0: -HALF, x1: HALF, h: 0.95, full: true });
          course.hopRows.push(ld);
          course.air.push({ d0: ld - 1, d1: ld + 0.8 * ((2 * HOP_V) / G) * speedAt(ld), cap: 0.3 });
          bellArc(ld - 7, 14, 1.35);
          course.clears.push({ d0: c, d1: ld + 40 });
          end = ld + 40;
          break;
        }
        case 2:
          name = 'scatter';
          end = sScatter(c, 90, 0.55);
          break;
        case 3:
          name = 'gates';
          end = sGates(c, 3);
          break;
        case 4:
          name = 'ramp';
          end = sRamp(c, true);
          break;
        default: {
          const [n, fn] = pick(c);
          name = n;
          end = fn(c);
        }
      }
      course.names.push(name);
      course.last = name;
      course.stretchNo++;
      route.extendTo(end + SP, 'wander');
      powerUps(c, end);
      course.cursor = end;
    }
  };
  course.ensure(400);
  return course;
}
