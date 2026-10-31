// Independent reachability sweep over a course: can a sled that follows its start line always get through?
// Pure; used by the tests (and handy when tuning the generator).

import { HALF, PLAYER_R, speedAt, vmaxLat, hopSpacing } from './config.js';

const LO = -HALF + 0.5;
const HI = HALF - 0.5;

function blockedAt(course, d, out) {
  out.length = 0;
  const R = PLAYER_R;
  const circle = (od, ox, r) => {
    const dd = d - od;
    const rr = r + R;
    if (Math.abs(dd) >= rr) return;
    const w = Math.sqrt(rr * rr - dd * dd);
    out.push([ox - w, ox + w]);
  };
  for (const t of course.near('trees', d - 6, d + 6)) circle(t.d, t.x, t.r);
  for (const t of course.near('rocks', d - 6, d + 6)) circle(t.d, t.x, t.r);
  for (const l of course.near('logs', d - 6, d + 6)) if (!l.full && Math.abs(d - l.d) < 0.55 + 0.5) out.push([l.x0 - 0.4, l.x1 + 0.4]);
  for (const f of course.near('fences', d - 6, d + 6)) if (Math.abs(d - f.d) < 0.45 + 0.6) out.push([f.x0 - 0.5, f.x1 + 0.5]);
  for (const m of course.near('movers', d - 8, d + 8)) {
    if (Math.abs(d - m.d) < m.hd + R) out.push([Math.min(m.xFrom, m.xTo) - m.hw - R, Math.max(m.xFrom, m.xTo) + m.hw + R]);
  }
  out.sort((a, b) => a[0] - b[0]);
}

/**
 * Sweep d0..d1. `scale` is the share of the sled's lateral capability the path may use (0.6 by default).
 * Returns { ok, failAt, widest } where widest is the narrowest "widest reachable free gap" seen (metres).
 */
export function checkFair(course, d0, d1, o = {}) {
  const scale = o.scale ?? 0.6;
  const step = o.step ?? 0.5;
  const startX = course.route.x(d0);
  let reach = [[startX - 1.0, startX + 1.0]];
  const blocked = [];
  let narrowest = Infinity;
  for (let d = d0; d <= d1; d += step) {
    const v = speedAt(d);
    let cap = (scale * vmaxLat(v)) / v;
    for (const z of course.ice) if (d >= z.d0 && d <= z.d1) cap *= 0.25;
    for (const z of course.air) if (d >= z.d0 && d <= z.d1) cap = Math.min(cap, (scale * vmaxLat(v) * z.cap) / v);
    const m = cap * step;
    blockedAt(course, d, blocked);
    // free intervals
    const free = [];
    let cur = LO;
    for (const [a, b] of blocked) {
      if (a > cur) free.push([cur, Math.min(a, HI)]);
      cur = Math.max(cur, b);
    }
    if (cur < HI) free.push([cur, HI]);
    const next = [];
    for (const [a, b] of reach) {
      const lo = a - m;
      const hi = b + m;
      for (const [fa, fb] of free) {
        const l = Math.max(lo, fa);
        const h = Math.min(hi, fb);
        if (h - l >= 0) next.push([l, h]);
      }
    }
    if (!next.length) return { ok: false, failAt: d, widest: narrowest };
    next.sort((p, q) => p[0] - q[0]);
    const merged = [next[0].slice()];
    for (let i = 1; i < next.length; i++) {
      const last = merged[merged.length - 1];
      if (next[i][0] <= last[1] + 1e-9) last[1] = Math.max(last[1], next[i][1]);
      else merged.push(next[i].slice());
    }
    reach = merged;
    let w = 0;
    for (const [a, b] of reach) w = Math.max(w, b - a);
    narrowest = Math.min(narrowest, w);
  }
  return { ok: true, failAt: null, widest: narrowest };
}

/** Hop rows (logs that span the track) must leave room to land and hop again. */
export function checkHopSpacing(course, d1) {
  const rows = course.hopRows.filter((d) => d <= d1).sort((a, b) => a - b);
  for (let i = 1; i < rows.length; i++) if (rows[i] - rows[i - 1] < hopSpacing(speedAt(rows[i]))) return { ok: false, at: rows[i] };
  return { ok: true };
}
