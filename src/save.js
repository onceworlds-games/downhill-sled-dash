// What is kept between visits (ow.save). Pure: normalise() accepts anything and returns a valid save.

import { SLEDS, OUTFITS } from './config.js';
import { freshMissions, TEMPLATES } from './missions.js';

export const SAVE_KEY = 'sled';

const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : d);

export function defaults() {
  return {
    v: 1,
    bells: 0,
    best: { dist: 0, score: 0 },
    runs: 0,
    totalDist: 0,
    owned: ['wood'],
    sled: 'wood',
    outfit: 0,
    missions: freshMissions(1),
    mseed: 10,
    mdone: 0,
    hints: { steer: false, hop: false, spin: false },
    maxStreak: 0,
  };
}

export function normalize(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const ids = new Set(SLEDS.map((s) => s.id));
  const owned = Array.isArray(raw.owned) ? [...new Set(raw.owned.filter((id) => ids.has(id)))] : [];
  if (!owned.includes('wood')) owned.unshift('wood');
  const missions = [];
  if (Array.isArray(raw.missions)) {
    for (const m of raw.missions) {
      if (m && TEMPLATES[m.t] && typeof m.n === 'number' && m.n > 0 && missions.length < 3) {
        missions.push({ t: m.t, n: Math.floor(m.n), reward: num(m.reward, 0, 1000, 40) });
      }
    }
  }
  while (missions.length < 3) {
    const f = freshMissions(num(raw.mseed, 0, 1e9, 10) + missions.length * 7);
    const pick = f.find((m) => !missions.some((x) => x.t === m.t)) ?? f[0];
    missions.push(pick);
  }
  const hints = raw.hints && typeof raw.hints === 'object' ? raw.hints : {};
  return {
    v: 1,
    bells: num(raw.bells, 0, 1e9, 0),
    best: {
      dist: num(raw.best && raw.best.dist, 0, 1e9, 0),
      score: num(raw.best && raw.best.score, 0, 1e12, 0),
    },
    runs: num(raw.runs, 0, 1e9, 0),
    totalDist: num(raw.totalDist, 0, 1e12, 0),
    owned,
    sled: owned.includes(raw.sled) ? raw.sled : 'wood',
    outfit: num(raw.outfit, 0, OUTFITS.length - 1, 0),
    missions,
    mseed: num(raw.mseed, 0, 1e9, 10),
    mdone: num(raw.mdone, 0, 1e9, 0),
    hints: { steer: !!hints.steer, hop: !!hints.hop, spin: !!hints.spin },
    maxStreak: num(raw.maxStreak, 0, 1e6, 0),
  };
}

/** Buy a sled: returns the new save or null when it can't be bought. */
export function buy(save, id) {
  const sled = SLEDS.find((s) => s.id === id);
  if (!sled || save.owned.includes(id) || save.bells < sled.price) return null;
  return { ...save, bells: save.bells - sled.price, owned: [...save.owned, id], sled: id };
}
