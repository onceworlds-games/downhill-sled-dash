// A rider that follows the course's route: drives the title screen, the posters and the tests. Pure.

import { speedAt, vmaxLat, PLAYER_R } from './config.js';
import { mulberry32, clamp, wrapPi } from './rng.js';

const TAU = Math.PI * 2;

/**
 * makeBot(sim, { seed, tricks, error }) returns () => ({ steer, hop }) to call before every sim step.
 * `error` is the lateral wander in metres (0 is perfect); `tricks` lets it spin off ramps.
 */
export function makeBot(sim, { seed = 1, tricks = true, error = 0.0 } = {}) {
  const rng = mulberry32(seed * 7919 + 13);
  let plan = null; // spins to land in this jump
  let wander = 0;
  let wanderV = 0;
  return () => {
    const c = sim.course;
    const v = sim.v;
    c.ensure(sim.d + 260);
    const r = c.route;
    const ahead = Math.max(5, v * 0.42);
    if (error) {
      wanderV += (rng() - 0.5) * 0.9;
      wanderV *= 0.96;
      wander = clamp(wander + wanderV * 0.01, -error, error);
    }
    const xt = r.x(sim.d + ahead) + wander;
    const err = xt - sim.x;
    const ff = r.slope(sim.d + ahead) * v;
    let want = ff + err * (sim.onIce ? 0.6 : 2.0) - sim.vx * (sim.onIce ? 0.2 : 0.15);
    let steer = clamp(want / vmaxLat(v), -1, 1);
    let hop = false;

    if (sim.air && sim.big) {
      if (!plan) {
        const n = tricks ? [0, 1, 1, 2][Math.floor(rng() * 4)] : 0;
        plan = { target: n * TAU * (rng() < 0.5 ? -1 : 1) };
      }
      // spin to the target angle, then hold it; hold the line otherwise
      const e = plan.target - sim.spin;
      steer = clamp(e * 2.4 - sim.spinV * 0.45, -1, 1);
    } else plan = null;

    if (!sim.air) {
      // hop the next full-width log when it is about to arrive
      for (const l of c.near('logs', sim.d, sim.d + 40)) {
        if (l.d > sim.d && l.d - sim.d < v * 0.34 && sim.x > l.x0 - 1 && sim.x < l.x1 + 1) {
          hop = true;
          break;
        }
      }
    }
    return { steer, hop };
  };
}

/** Run the sim with the bot until it ends or reaches maxD. Returns the sim. */
export function playBot(sim, bot, { maxD = 3000, dt = 1 / 120, maxT = 900 } = {}) {
  let n = 0;
  while (!sim.done && sim.d < maxD && sim.t < maxT && n++ < 5e6) {
    sim.step(dt, bot());
    sim.drain();
    sim.course.prune(sim.d);
  }
  return sim;
}
