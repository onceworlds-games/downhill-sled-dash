import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourse } from '../src/course.js';
import { Sim } from '../src/sim.js';
import { makeBot } from '../src/bot.js';
import { speedAt, HALF } from '../src/config.js';

const none = { steer: 0, hop: false };

function run(seed, opts = {}) {
  const c = createCourse(seed);
  const s = new Sim(c);
  const bot = makeBot(s, { seed, ...opts });
  const events = [];
  let n = 0;
  while (!s.done && s.d < (opts.maxD ?? 3000) && n++ < 3e6) {
    s.step(1 / 120, bot());
    events.push(...s.drain());
    c.prune(s.d);
  }
  return { s, events };
}

test('speed starts at 14 and ramps toward ~37 at 3 km', () => {
  assert.ok(Math.abs(speedAt(0) - 14) < 1e-9);
  assert.ok(speedAt(3000) > 35 && speedAt(3000) < 39);
  assert.ok(speedAt(30000) < 39.1);
  for (let d = 0; d < 9000; d += 100) assert.ok(speedAt(d + 100) >= speedAt(d));
});

test('a rider on the route survives 3 km on many seeds, without NaN', () => {
  for (let seed = 1; seed <= 24; seed++) {
    const { s } = run(seed, { error: 0.35 });
    assert.ok(Number.isFinite(s.d) && Number.isFinite(s.x) && Number.isFinite(s.v) && Number.isFinite(s.scoreF), `seed ${seed}`);
    assert.ok(!s.crash, `seed ${seed} crashed on ${s.crash && s.crash.kind} at ${s.crash && s.crash.d.toFixed(0)}`);
    assert.ok(s.d >= 3000);
    assert.ok(Math.abs(s.x) <= HALF);
  }
});

test('a run gives gates, bells, tricks and a score', () => {
  const { s, events } = run(3, { error: 0.2, maxD: 2500 });
  assert.ok(s.stats.gates > 3, 'gates');
  assert.ok(s.stats.bells > 10, 'bells');
  assert.ok(s.score > s.d, 'score beats distance');
  assert.ok(events.some((e) => e.type === 'launch'));
  assert.ok(events.some((e) => e.type === 'land' && e.big));
});

test('going straight into a tree crashes; a hop clears a log', () => {
  const c = createCourse(11);
  const s = new Sim(c);
  c.add('trees', { d: 40, x: 0, r: 0.9, h: 3.6, s: 1, v: 0, dead: false });
  for (let i = 0; i < 5000 && s.phase === 'run'; i++) s.step(1 / 120, none);
  assert.equal(s.phase, 'crashed');
  assert.equal(s.crash.kind, 'tree');

  const c2 = createCourse(11);
  c2.add('logs', { d: 30, x0: -HALF, x1: HALF, h: 0.95, full: true });
  const s2 = new Sim(c2);
  let hopped = false;
  for (let i = 0; i < 4000 && s2.d < 45; i++) {
    const hop = !hopped && 30 - s2.d < s2.v * 0.34;
    if (hop) hopped = true;
    s2.step(1 / 120, { steer: 0, hop });
  }
  assert.equal(s2.phase, 'run');
  assert.equal(s2.stats.hops, 1);
  const c3 = createCourse(11);
  c3.add('logs', { d: 30, x0: -HALF, x1: HALF, h: 0.95, full: true });
  const s3 = new Sim(c3);
  for (let i = 0; i < 4000 && s3.phase === 'run'; i++) s3.step(1 / 120, none);
  assert.equal(s3.crash.kind, 'log');
});

test('a shield absorbs one crash, a boost smashes through', () => {
  const c = createCourse(4);
  c.add('trees', { d: 40, x: 0, r: 0.9, h: 3.6, s: 1, v: 0, dead: false });
  const s = new Sim(c);
  s.shield = true;
  let broke = 0;
  for (let i = 0; i < 6000 && s.d < 60; i++) {
    s.step(1 / 120, none);
    for (const e of s.drain()) if (e.type === 'shield-break') broke++;
  }
  assert.equal(broke, 1);
  assert.equal(s.phase, 'run');
  assert.ok(s.stats.shieldUsed);
  assert.equal(s.shield, false);

  const c2 = createCourse(4);
  c2.add('trees', { d: 40, x: 0, r: 0.9, h: 3.6, s: 1, v: 0, dead: false });
  const s2 = new Sim(c2);
  s2.boost = 4;
  for (let i = 0; i < 3000 && s2.d < 60; i++) s2.step(1 / 120, none);
  assert.equal(s2.phase, 'run');
  assert.equal(s2.stats.smashes, 1);
});

function atFirstRamp() {
  const c = createCourse(21);
  const s = new Sim(c);
  const r = c.all('ramps')[0];
  s.d = r.d - 3;
  s._prevD = s.d;
  s.x = r.x;
  s.v = 20;
  return s;
}

test('landing a spin straight scores; landing crooked wobbles', () => {
  // no spin: clean, no tricks
  let s = atFirstRamp();
  let ev = [];
  for (let i = 0; i < 4000; i++) {
    s.step(1 / 120, none);
    ev.push(...s.drain());
    if (ev.some((e) => e.type === 'land')) break;
  }
  let land = ev.find((e) => e.type === 'land');
  assert.ok(land.big && land.clean && land.tricks === 0);

  // a full turn with a controller
  s = atFirstRamp();
  ev = [];
  for (let i = 0; i < 4000; i++) {
    const input = s.big ? { steer: Math.max(-1, Math.min(1, (Math.PI * 2 - s.spin) * 2.4 - s.spinV * 0.45)), hop: false } : none;
    s.step(1 / 120, input);
    ev.push(...s.drain());
    if (ev.some((e) => e.type === 'land')) break;
  }
  land = ev.find((e) => e.type === 'land');
  assert.ok(land.clean && land.tricks === 1, JSON.stringify(land));
  assert.ok(land.pts >= 100);
  assert.ok(s.trickPts >= 100);

  // half a turn: crooked
  s = atFirstRamp();
  ev = [];
  for (let i = 0; i < 4000; i++) {
    const input = s.big && s.spin < Math.PI ? { steer: 1, hop: false } : none;
    s.step(1 / 120, input);
    ev.push(...s.drain());
    if (ev.some((e) => e.type === 'land')) break;
  }
  land = ev.find((e) => e.type === 'land');
  assert.ok(!land.clean, 'a half turn is a crooked landing');
  assert.ok(s.wobble > 0);
});

test('gate streak multiplies and resets on a miss', () => {
  const c = createCourse(2);
  const s = new Sim(c);
  for (const d of [20, 40, 60, 80]) c.add('gates', { d, cx: d === 80 ? 9 : 0, w: 5.6, done: false });
  const out = [];
  for (let i = 0; i < 8000 && s.d < 100; i++) {
    s.step(1 / 120, none);
    out.push(...s.drain().filter((e) => e.type === 'gate'));
  }
  assert.deepEqual(out.map((g) => [g.ok, g.streak]), [[true, 1], [true, 2], [true, 3], [false, 0]]);
  assert.equal(out[2].mult, 3);
  assert.equal(s.stats.bestStreak, 3);
});

test('magnet pulls bells, x2 doubles points', () => {
  const c = createCourse(2);
  const mine = [];
  for (let i = 0; i < 5; i++) mine.push(c.add('bells', { d: 30 + i * 2, x: 7, y: 0.45, got: false }));
  const s = new Sim(c);
  s.magnet = 8;
  for (let i = 0; i < 1500 && s.d < 60; i++) s.step(1 / 120, none);
  assert.ok(mine.every((b) => b.got), 'all five pulled in');
  const a = new Sim(createCourse(2));
  const b = new Sim(createCourse(2));
  b.x2 = 10;
  for (let i = 0; i < 600; i++) {
    a.step(1 / 120, none);
    b.step(1 / 120, none);
  }
  assert.ok(Math.abs(b.scoreF - 2 * a.scoreF) < 1e-6);
});

test('ice makes steering slide', () => {
  const slide = (ice) => {
    const c = createCourse(8);
    if (ice) c.ice.push({ d0: 0, d1: 1000 });
    const s = new Sim(c);
    s.v = 20;
    for (let i = 0; i < 60; i++) s.step(1 / 120, { steer: 1, hop: false });
    const vx1 = s.vx;
    for (let i = 0; i < 60; i++) s.step(1 / 120, none);
    return s.vx / vx1;
  };
  assert.ok(slide(true) > slide(false) + 0.3, 'on ice, sideways speed persists after letting go');
});

test('a crash ends the run within a few seconds', () => {
  const c = createCourse(11);
  c.add('trees', { d: 30, x: 0, r: 0.9, h: 3.6, s: 1, v: 0, dead: false });
  const s = new Sim(c);
  for (let i = 0; i < 20000 && !s.done; i++) s.step(1 / 120, none);
  assert.ok(s.done);
  assert.ok(Number.isFinite(s.d));
});
