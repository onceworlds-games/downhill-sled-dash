// The run: movement, tricks, collisions, pickups, score. Pure and deterministic given a course and the inputs.

import {
  HALF, PLAYER_R, G, HOP_V, SPIN_RATE, START_V, BOOST_MULT, BOOST_TIME, MAGNET_TIME, X2_TIME, MAGNET_RADIUS, CLEAN_LANDING,
  speedAt, vmaxLat, launchVy,
} from './config.js';
import { clamp, wrapPi } from './rng.js';

const TAU = Math.PI * 2;

export function moverPos(m, t) {
  if (m.t0 < 0) return m.xFrom;
  const len = Math.abs(m.xTo - m.xFrom);
  const p = Math.min(1, ((t - m.t0) * m.speed) / len);
  return m.xFrom + (m.xTo - m.xFrom) * p;
}
export function moverDone(m, t) {
  return m.t0 >= 0 && ((t - m.t0) * m.speed) / Math.abs(m.xTo - m.xFrom) >= 1;
}

export class Sim {
  constructor(course) {
    this.course = course;
    this.t = 0;
    this.d = 0;
    this.x = 0;
    this.vx = 0;
    this.v = START_V;
    this.hy = 0;
    this.vy = 0;
    this.air = false;
    this.big = false;
    this.spin = 0;
    this.spinV = 0;
    this.spinMark = 0;
    this.lift = 0;
    this.wobble = 0;
    this.invuln = 0;
    this.scrapeCd = 0;
    this.hopBuf = 0;
    this.steerIn = 0;
    this.onIce = false;
    this.phase = 'run';
    this.crash = null;
    this.crashT = 0;
    this.done = false;
    this.magnet = 0;
    this.boost = 0;
    this.x2 = 0;
    this.shield = false;
    this.combo = 0;
    this.streak = 0;
    this.chain = 0;
    this.lastBell = -9;
    this.scoreF = 0;
    this.trickPts = 0;
    this.gatePts = 0;
    this.stats = {
      gates: 0, gateMisses: 0, bestStreak: 0, tricks: 0, bestSpins: 0, jumps: 0, bells: 0, powerups: 0,
      hops: 0, smashes: 0, shieldUsed: false, bigAirTime: 0,
    };
    this.events = [];
    this._prevD = 0;
  }

  get score() {
    return Math.floor(this.scoreF);
  }
  get mult() {
    return this.x2 > 0 ? 2 : 1;
  }
  emit(type, data) {
    this.events.push(data ? { type, ...data } : { type });
  }
  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  addPoints(p) {
    this.scoreF += p * this.mult;
  }

  step(dt, input) {
    this.t += dt;
    if (this.phase === 'crashed') return this.stepCrash(dt);
    const c = this.course;
    const steer = clamp(input.steer || 0, -1, 1);
    this.steerIn = steer;
    this._prevD = this.d;

    if (this.magnet > 0 && (this.magnet -= dt) <= 0) {
      this.magnet = 0;
      this.emit('power-end', { type: 'magnet' });
    }
    if (this.boost > 0 && (this.boost -= dt) <= 0) {
      this.boost = 0;
      this.emit('power-end', { type: 'boost' });
    }
    if (this.x2 > 0 && (this.x2 -= dt) <= 0) {
      this.x2 = 0;
      this.emit('power-end', { type: 'x2' });
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.wobble > 0) this.wobble -= dt;
    if (this.scrapeCd > 0) this.scrapeCd -= dt;
    if (input.hop) this.hopBuf = 0.14;
    else if (this.hopBuf > 0) this.hopBuf -= dt;

    // ice under the sled
    this.onIce = false;
    for (const z of c.ice) if (this.d >= z.d0 && this.d <= z.d1) this.onIce = true;

    // forward speed
    const target = speedAt(this.d) * (this.boost > 0 ? BOOST_MULT : 1);
    const up = this.boost > 0 ? 14 : 5.5;
    this.v += clamp(target - this.v, -14 * dt, up * dt);

    // sideways: momentum, looser with speed, much looser on ice and in the air
    const grip = this.air ? (this.big ? 0.12 : 0.5) : this.onIce ? 0.16 : 1;
    const k = (6.8 - 0.06 * this.v) * grip;
    const want = steer * vmaxLat(this.v) * (this.wobble > 0 ? 0.6 : 1);
    this.vx += (want - this.vx) * Math.min(1, k * dt);
    this.x += this.vx * dt;
    const lim = HALF - 0.5;
    if (this.x > lim || this.x < -lim) {
      const side = this.x > 0 ? 1 : -1;
      this.x = lim * side;
      if (this.vx * side > 0) {
        if (this.scrapeCd <= 0 && Math.abs(this.vx) > 2) {
          this.scrapeCd = 0.35;
          this.v *= 0.95;
          this.emit('scrape', { side });
        }
        this.vx *= -0.3;
      }
    }

    const dd = this.v * dt;
    this.d += dd;
    this.scoreF += dd * this.mult;

    // ramps and ground height
    let liftT = 0;
    const ramps = c.near('ramps', this.d - 10, this.d + 10);
    let launchRamp = null;
    for (const r of ramps) {
      if (Math.abs(this.x - r.x) > r.w / 2 + 0.2) continue;
      if (this.d >= r.d && this.d <= r.d + r.len) liftT = Math.max(liftT, (r.h * (this.d - r.d)) / r.len);
      const lip = r.d + r.len;
      if (this._prevD < lip && this.d >= lip) launchRamp = r;
    }
    this.lift = liftT;
    if (!this.air) {
      if (liftT > this.hy) this.hy = liftT;
      else this.hy = Math.max(liftT, this.hy - 14 * dt);
    }
    if (launchRamp && !this.air) {
      this.air = true;
      this.big = true;
      this.vy = launchVy(this.v) + (this.hopBuf > 0 ? 1.4 : 0);
      this.hopBuf = 0;
      this.spin = 0;
      this.spinV = 0;
      this.spinMark = 0;
      this.stats.jumps++;
      this.emit('launch', { vy: this.vy });
    } else if (this.hopBuf > 0 && !this.air) {
      this.air = true;
      this.big = false;
      this.vy = HOP_V;
      this.hopBuf = 0;
      this.emit('hop');
    }

    if (this.air) {
      this.vy -= G * dt;
      this.hy += this.vy * dt;
      if (this.big) {
        this.stats.bigAirTime += dt;
        this.spinV += (steer * SPIN_RATE - this.spinV) * Math.min(1, 10 * dt);
        this.spin += this.spinV * dt;
        const n = Math.floor((Math.abs(this.spin) + 0.7) / TAU);
        if (n > this.spinMark) {
          this.spinMark = n;
          this.emit('spin', { n });
        }
      }
      if (this.hy <= liftT && this.vy <= 0) this.land();
    }

    this.collide();
    if (this.phase !== 'run') return;
    this.pickups(dt);
    this.gates();
    this.logsPassed();
    this.movers();
  }

  land() {
    const impact = -this.vy;
    this.hy = this.lift;
    this.vy = 0;
    this.air = false;
    if (this.big) {
      const res = wrapPi(this.spin);
      const a = Math.abs(res);
      const clean = a < CLEAN_LANDING;
      const perfect = a < 0.28;
      const n = Math.round(Math.abs(this.spin) / TAU);
      if (clean) {
        let pts = 0;
        if (n > 0) {
          this.combo++;
          pts = 100 * ((n * (n + 1)) / 2) * (1 + 0.5 * (this.combo - 1));
          this.stats.tricks += n;
          this.stats.bestSpins = Math.max(this.stats.bestSpins, n);
          this.trickPts += pts * this.mult;
        } else this.combo = 0;
        if (perfect) pts += 25;
        this.addPointsRaw(pts);
        this.emit('land', { big: true, clean: true, perfect, tricks: n, pts, combo: this.combo, impact });
      } else {
        this.combo = 0;
        this.wobble = 1.1;
        this.v *= 0.7;
        this.emit('land', { big: true, clean: false, tricks: 0, impact });
      }
    } else {
      this.emit('land', { big: false, impact });
    }
    this.spin = 0;
    this.spinV = 0;
    this.spinMark = 0;
    this.big = false;
  }
  addPointsRaw(p) {
    // trick points were multiplied above when they were counted; perfect bonus here
    if (p > 0) this.scoreF += p * this.mult;
  }

  collide() {
    const c = this.course;
    const px = this.x;
    const pd = this.d;
    const hy = this.hy;
    let hit = null;
    let kind = '';
    const R = PLAYER_R;
    for (const t of c.near('trees', pd - 3, pd + 3)) {
      if (t.dead || hy >= t.h) continue;
      const dx = t.x - px;
      const dd = t.d - pd;
      if (dx * dx + dd * dd < (t.r + R) * (t.r + R)) {
        hit = t;
        kind = 'tree';
        break;
      }
    }
    if (!hit) {
      for (const t of c.near('rocks', pd - 3, pd + 3)) {
        if (t.dead || hy >= t.h) continue;
        const dx = t.x - px;
        const dd = t.d - pd;
        if (dx * dx + dd * dd < (t.r + R) * (t.r + R)) {
          hit = t;
          kind = t.small ? 'rock' : 'boulder';
          break;
        }
      }
    }
    if (!hit) {
      for (const l of c.near('logs', pd - 3, pd + 3)) {
        if (l.dead || hy >= l.h) continue;
        if (Math.abs(l.d - pd) < 0.55 + 0.5 && px > l.x0 - 0.4 && px < l.x1 + 0.4) {
          hit = l;
          kind = 'log';
          break;
        }
      }
    }
    if (!hit) {
      for (const f of c.near('fences', pd - 3, pd + 3)) {
        if (f.dead || hy >= 1.9) continue;
        if (Math.abs(f.d - pd) < 0.45 + 0.6 && px > f.x0 - 0.5 && px < f.x1 + 0.5) {
          hit = f;
          kind = 'fence';
          break;
        }
      }
    }
    if (!hit) {
      for (const m of c.near('movers', pd - 8, pd + 8)) {
        if (!m.active || m.t0 < 0 || hy >= m.h) continue;
        const mx = moverPos(m, this.t);
        if (Math.abs(m.d - pd) < m.hd + R && Math.abs(mx - px) < m.hw + R) {
          if (m.kind === 'ball' && Math.hypot(m.d - pd, mx - px) >= m.r + R) continue;
          hit = m;
          kind = m.kind === 'ball' ? 'snowball' : 'snowcat';
          break;
        }
      }
    }
    if (!hit) return;
    if (this.boost > 0) {
      hit.dead = true;
      if (hit.active !== undefined) hit.active = false;
      this.stats.smashes++;
      this.emit('smash', { item: hit, kind, x: hit.x ?? px, d: hit.d });
      return;
    }
    if (this.invuln > 0) return;
    if (this.shield) {
      this.shield = false;
      this.invuln = 1.4;
      this.stats.shieldUsed = true;
      const side = px - (hit.x ?? px) >= 0 ? 1 : -1;
      this.vx = side * 10;
      this.v *= 0.82;
      if (kind === 'log' || kind === 'fence') this.d -= 1.2;
      this.emit('shield-break', { kind, side });
      return;
    }
    this.phase = 'crashed';
    this.crash = { kind, x: px, d: pd, v: this.v, vx: this.vx, hy: this.hy, seed: (Math.abs(Math.floor(pd * 13 + px * 7)) + 1) | 0 };
    this.combo = 0;
    this.streak = 0;
    this.emit('crash', { kind });
  }

  stepCrash(dt) {
    this.crashT += dt;
    this.v *= Math.exp(-1.7 * dt);
    this.vx *= Math.exp(-1.2 * dt);
    this.x = clamp(this.x + this.vx * dt * 0.4, -HALF, HALF);
    this.d += this.v * dt;
    if (this.air) {
      this.vy -= G * dt;
      this.hy += this.vy * dt;
      if (this.hy <= 0) {
        this.hy = 0;
        this.vy = 0;
        this.air = false;
      }
    }
    if (this.crashT > 2.4 || (this.v < 0.8 && this.crashT > 0.8)) this.done = true;
  }

  pickups(dt) {
    const c = this.course;
    const px = this.x;
    const pd = this.d;
    const magnet = this.magnet > 0;
    for (const b of c.near('bells', pd - 14, pd + 14)) {
      if (b.got) continue;
      let bx = b.mx ?? b.x;
      let bd = b.md ?? b.d;
      if (magnet) {
        const dx = px - bx;
        const dd = pd - bd;
        const dist = Math.hypot(dx, dd);
        if (dist < MAGNET_RADIUS && dist > 0.01) {
          const s = Math.min(dist, (20 + this.v) * dt * 1.1);
          bx += (dx / dist) * s;
          bd += (dd / dist) * s;
          b.mx = bx;
          b.md = bd;
        }
      }
      const dx = bx - px;
      const dd = bd - pd;
      if (dx * dx + dd * dd < 2.9 && Math.abs(b.y - this.hy) < 1.5) {
        b.got = true;
        this.stats.bells++;
        this.chain = this.t - this.lastBell < 0.9 ? this.chain + 1 : 0;
        this.lastBell = this.t;
        this.emit('bell', { chain: this.chain, item: b });
      }
    }
    for (const p of c.near('powers', pd - 4, pd + 4)) {
      if (p.got) continue;
      const dx = p.x - px;
      const dd = p.d - pd;
      if (dx * dx + dd * dd < 3.4 && this.hy < 3) {
        p.got = true;
        this.stats.powerups++;
        if (p.type === 'magnet') this.magnet = MAGNET_TIME;
        else if (p.type === 'boost') this.boost = BOOST_TIME;
        else if (p.type === 'x2') this.x2 = X2_TIME;
        else if (p.type === 'shield') this.shield = true;
        this.emit('power', { type: p.type, item: p });
      }
    }
  }

  gates() {
    for (const g of this.course.near('gates', this.d - 3, this.d + 3)) {
      if (g.done || !(this._prevD < g.d && this.d >= g.d)) continue;
      g.done = true;
      const ok = Math.abs(this.x - g.cx) < g.w / 2 - 0.35;
      if (ok) {
        this.streak++;
        this.stats.gates++;
        this.stats.bestStreak = Math.max(this.stats.bestStreak, this.streak);
        const mult = Math.min(this.streak, 10);
        const pts = 25 * mult;
        this.gatePts += pts * this.mult;
        this.scoreF += pts * this.mult;
        this.emit('gate', { ok: true, streak: this.streak, mult, pts: pts * this.mult, gate: g });
      } else {
        this.stats.gateMisses++;
        const lost = this.streak;
        this.streak = 0;
        this.emit('gate', { ok: false, streak: 0, lost, gate: g });
      }
    }
  }

  logsPassed() {
    for (const l of this.course.near('logs', this.d - 3, this.d + 3)) {
      if (l.counted || !(this._prevD < l.d && this.d >= l.d)) continue;
      l.counted = true;
      if (this.hy >= l.h && this.x > l.x0 - 0.4 && this.x < l.x1 + 0.4) {
        this.stats.hops++;
        this.emit('hop-over', { log: l });
      }
    }
  }

  movers() {
    for (const m of this.course.near('movers', this.d - 4, this.d + 140)) {
      if (m.t0 < 0 && m.active && m.d - this.d < m.lead && m.d - this.d > -4) {
        m.t0 = this.t;
        this.emit('mover', { item: m });
      }
      if (m.kind === 'ball' && m.active && m.t0 >= 0 && moverDone(m, this.t) && this.t - m.t0 > Math.abs(m.xTo - m.xFrom) / m.speed + 0.15) {
        m.active = false;
        this.emit('burst', { item: m });
      }
    }
  }
}
