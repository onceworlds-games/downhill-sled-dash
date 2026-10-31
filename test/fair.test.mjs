import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourse } from '../src/course.js';
import { checkFair, checkHopSpacing } from '../src/fairness.js';
import { HALF, PLAYER_R, speedAt, vmaxLat } from '../src/config.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 37);

test('every course has a passable route (60% of lateral capability)', () => {
  for (const seed of SEEDS) {
    const c = createCourse(seed);
    c.ensure(9000);
    const r = checkFair(c, 0, 8500, { scale: 0.6 });
    assert.ok(r.ok, `seed ${seed} fails at ${r.failAt}`);
    assert.ok(r.widest > 1.6, `seed ${seed} squeezes to ${r.widest}`);
  }
});

test('hop rows are spaced for landing', () => {
  for (const seed of SEEDS) {
    const c = createCourse(seed);
    c.ensure(9000);
    assert.ok(checkHopSpacing(c, 8500).ok, `seed ${seed}`);
  }
});

test('route stays inside the track and within half the sled capability', () => {
  for (const seed of SEEDS.slice(0, 12)) {
    const c = createCourse(seed);
    c.ensure(9000);
    for (let d = 0; d < 8800; d += 1) {
      const x = c.route.x(d);
      assert.ok(Math.abs(x) <= HALF - 3.9, `x ${x}`);
      const v = speedAt(d);
      const lim = (0.5 * vmaxLat(v)) / v;
      assert.ok(Math.abs(c.route.slope(d)) <= lim + 1e-6, `slope ${c.route.slope(d)} > ${lim} at ${d}`);
    }
  }
});

test('route is clear of every blocking obstacle and gates sit on it', () => {
  for (const seed of SEEDS.slice(0, 20)) {
    const c = createCourse(seed);
    c.ensure(7000);
    for (const t of [...c.all('trees'), ...c.all('rocks')]) {
      const gap = Math.abs(t.x - c.route.x(t.d)) - t.r - PLAYER_R;
      assert.ok(gap > 0.6, `seed ${seed} obstacle at ${t.d.toFixed(1)} gap ${gap.toFixed(2)}`);
    }
    for (const g of c.all('gates')) assert.ok(Math.abs(g.cx - c.route.x(g.d)) < 1e-9);
    for (const f of c.all('fences')) {
      const x = c.route.x(f.d);
      assert.ok(!(x > f.x0 - 1.4 && x < f.x1 + 1.4), `fence blocks route at ${f.d}`);
    }
  }
});

test('ramps and logs keep a clear landing zone', () => {
  for (const seed of SEEDS.slice(0, 20)) {
    const c = createCourse(seed);
    c.ensure(7000);
    for (const z of c.air.filter((a) => a.cap <= 0.12)) {
      for (const o of [...c.all('trees'), ...c.all('rocks'), ...c.all('fences')]) {
        assert.ok(!(o.d > z.d0 && o.d < z.d1), `seed ${seed}: obstacle at ${o.d.toFixed(1)} inside ramp air ${z.d0.toFixed(0)}-${z.d1.toFixed(0)}`);
      }
    }
  }
});

test('bells and power-ups never sit inside a blocking obstacle', () => {
  for (const seed of SEEDS.slice(0, 20)) {
    const c = createCourse(seed);
    c.ensure(7000);
    const obs = [...c.all('trees'), ...c.all('rocks')];
    for (const b of [...c.all('bells'), ...c.all('powers')]) {
      for (const o of obs) {
        if (Math.abs(o.d - b.d) > 4) continue;
        assert.ok(Math.hypot(o.d - b.d, o.x - b.x) > o.r + 0.3, `seed ${seed} bell at ${b.d.toFixed(1)} in obstacle`);
      }
    }
  }
});

test('same seed, same course', () => {
  const a = createCourse(77);
  const b = createCourse(77);
  a.ensure(3000);
  b.ensure(3000);
  assert.deepEqual(a.all('trees').map((t) => [t.d, t.x]), b.all('trees').map((t) => [t.d, t.x]));
  assert.deepEqual(a.names, b.names);
});

test('density rises with distance', () => {
  const c = createCourse(5);
  c.ensure(6000);
  const n = (a, b) => [...c.all('trees'), ...c.all('rocks')].filter((o) => o.d >= a && o.d < b).length;
  assert.ok(n(3500, 5500) > n(300, 1300));
});

test('the opening is scripted: a runway, a log, gates, a ramp', () => {
  const c = createCourse(9);
  c.ensure(800);
  assert.deepEqual(c.names.slice(0, 5), ['runway', 'log1', 'scatter', 'gates', 'ramp']);
  assert.equal(c.all('trees').filter((t) => t.d < 110).length, 0);
});
