// Missions: three at a time, per-run goals, paid when the run ends, replaced by a new one. Pure.

import { mulberry32, hash2 } from './rng.js';

const spinName = { 1: 'single', 2: 'double', 3: 'triple' };

// metric(run) -> number; the mission is done when metric >= n
export const TEMPLATES = {
  gates: { goals: [6, 10, 16, 24], text: (n) => `Pass ${n} gates`, metric: (r) => r.gates },
  streak: { goals: [4, 6, 9, 12], text: (n) => `Gate streak of ${n}`, metric: (r) => r.bestStreak },
  spin: { goals: [1, 2, 3], text: (n) => `Land a ${spinName[n] ?? n + 'x'} spin`, metric: (r) => r.bestSpins },
  tricks: { goals: [2, 4, 6, 9], text: (n) => `Land ${n} tricks in a run`, metric: (r) => r.tricks },
  dist: { goals: [500, 1000, 1800, 3000], text: (n) => `Reach ${n.toLocaleString('en-US')} m`, metric: (r) => r.dist },
  clean: { goals: [1000, 2000, 3000], text: (n) => `Reach ${n / 1000} km without a shield`, metric: (r) => (r.shieldUsed ? 0 : r.dist) },
  bells: { goals: [25, 45, 70, 100], text: (n) => `Collect ${n} bells in a run`, metric: (r) => r.bells },
  hops: { goals: [2, 4, 6, 9], text: (n) => `Hop ${n} logs in a run`, metric: (r) => r.hops },
  power: { goals: [1, 2, 3], text: (n) => `Grab ${n} power-up${n > 1 ? 's' : ''} in a run`, metric: (r) => r.powerups },
  smash: { goals: [2, 4, 7], text: (n) => `Smash ${n} trees on Boost`, metric: (r) => r.smashes },
  score: { goals: [1200, 2500, 5000, 9000], text: (n) => `Score ${n.toLocaleString('en-US')} in a run`, metric: (r) => r.score },
};
const IDS = Object.keys(TEMPLATES);
const REWARD = [40, 70, 110, 170];

export function missionText(m) {
  return TEMPLATES[m.t] ? TEMPLATES[m.t].text(m.n) : '';
}

/** Progress 0..1 of a mission for a run's numbers. */
export function missionProgress(m, run) {
  const t = TEMPLATES[m.t];
  if (!t) return 0;
  return Math.max(0, Math.min(1, t.metric(run) / m.n));
}

/** Make one mission that differs from the active ones. `done` is how many were finished so far (sets the tier). */
export function makeMission(seed, done, active = []) {
  const rng = mulberry32(hash2(seed, 77));
  const tier = Math.min(3, Math.floor(done / 4) + (rng() < 0.3 ? 1 : 0));
  const taken = new Set(active.map((m) => m.t));
  const pool = IDS.filter((id) => !taken.has(id));
  const id = pool[Math.floor(rng() * pool.length)] ?? IDS[0];
  const goals = TEMPLATES[id].goals;
  const gi = Math.min(goals.length - 1, tier);
  return { t: id, n: goals[gi], reward: REWARD[Math.min(REWARD.length - 1, Math.round((gi / Math.max(1, goals.length - 1)) * 3))] };
}

export function freshMissions(seed = 1) {
  const out = [];
  for (let i = 0; i < 3; i++) out.push(makeMission(seed + i, 0, out));
  // the first set is gentle: lowest goals
  return out.map((m) => ({ ...m, n: TEMPLATES[m.t].goals[0], reward: REWARD[0] }));
}

/**
 * Settle a run: returns { missions, paid, completed } where completed are the finished missions and missions the new list.
 * `state` has { missions, mseed, mdone }.
 */
export function settleMissions(state, run) {
  const kept = [];
  const completed = [];
  for (const m of state.missions) {
    if (missionProgress(m, run) >= 1) completed.push(m);
    else kept.push(m);
  }
  let seed = state.mseed;
  let done = state.mdone;
  for (const m of completed) {
    done++;
    seed++;
    kept.push(makeMission(seed, done, kept));
  }
  return { missions: kept, paid: completed.reduce((s, m) => s + m.reward, 0), completed, mseed: seed, mdone: done };
}
