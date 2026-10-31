import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, freshMissions, makeMission, settleMissions, missionProgress, missionText } from '../src/missions.js';
import { normalize, defaults, buy } from '../src/save.js';
import { todAt } from '../src/tod.js';
import { SLEDS, OUTFITS, BADGES } from '../src/config.js';
import { centre, groundY, slopeY } from '../src/track.js';
import { readFileSync } from 'node:fs';

const run = (o = {}) => ({ dist: 0, score: 0, gates: 0, bestStreak: 0, bestSpins: 0, tricks: 0, bells: 0, hops: 0, powerups: 0, smashes: 0, shieldUsed: false, ...o });

test('missions: three distinct, text for each, progress and settle', () => {
  const f = freshMissions(5);
  assert.equal(f.length, 3);
  assert.equal(new Set(f.map((m) => m.t)).size, 3);
  for (const t of Object.keys(TEMPLATES)) for (const n of TEMPLATES[t].goals) assert.ok(missionText({ t, n }).length > 4);
  const m = { t: 'gates', n: 10, reward: 70 };
  assert.equal(missionProgress(m, run({ gates: 5 })), 0.5);
  assert.equal(missionProgress(m, run({ gates: 50 })), 1);
  const state = { missions: [m, { t: 'dist', n: 1000, reward: 70 }, { t: 'bells', n: 25, reward: 40 }], mseed: 10, mdone: 0 };
  const r = settleMissions(state, run({ gates: 12, dist: 400, bells: 30 }));
  assert.equal(r.paid, 110);
  assert.equal(r.completed.length, 2);
  assert.equal(r.missions.length, 3);
  assert.ok(r.missions.some((x) => x.t === 'dist'));
  assert.equal(new Set(r.missions.map((x) => x.t)).size, 3);
});

test('the no-shield mission fails when a shield was used', () => {
  const m = { t: 'clean', n: 2000, reward: 70 };
  assert.equal(missionProgress(m, run({ dist: 2500, shieldUsed: true })), 0);
  assert.equal(missionProgress(m, run({ dist: 2500 })), 1);
});

test('mission tiers rise with completions', () => {
  let high = 0;
  for (let s = 0; s < 60; s++) {
    const m = makeMission(s, 20, []);
    if (m.n === TEMPLATES[m.t].goals[TEMPLATES[m.t].goals.length - 1]) high++;
  }
  assert.ok(high > 10);
});

test('save: garbage in, valid save out', () => {
  for (const raw of [null, undefined, 5, 'x', [], { owned: 'no', best: 4, missions: 7, sled: 'zzz', bells: -9, outfit: 99 }]) {
    const s = normalize(raw);
    assert.ok(s.owned.includes('wood'));
    assert.equal(s.missions.length, 3);
    assert.ok(s.bells >= 0 && s.outfit < OUTFITS.length);
    assert.ok(s.owned.includes(s.sled));
  }
  const d = defaults();
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(d))), d);
});

test('shop: first unlock after a couple of runs, can only buy what you can afford', () => {
  assert.ok(SLEDS[1].price <= 200);
  let s = normalize({ bells: 100 });
  assert.equal(buy(s, 'redline'), null);
  s = normalize({ bells: 200 });
  const b = buy(s, 'redline');
  assert.equal(b.bells, 20);
  assert.ok(b.owned.includes('redline') && b.sled === 'redline');
  assert.equal(buy(b, 'redline'), null);
  assert.equal(buy(s, 'nope'), null);
});

test('time of day loops and is continuous', () => {
  const names = new Set();
  let prev = todAt(0);
  for (let d = 0; d <= 15000; d += 10) {
    const t = todAt(d);
    names.add(t.name);
    assert.ok(Number.isFinite(t.sunI) && t.fogFar > 100);
    assert.ok(Math.abs(t.sunI - prev.sunI) < 0.1, `jump at ${d}`);
    prev = t;
  }
  assert.ok(['dawn', 'day', 'golden', 'sunset', 'dusk', 'night'].every((n) => names.has(n)));
  assert.equal(todAt(4600).night, 1);
  assert.equal(todAt(900).night, 0);
  assert.ok(todAt(7000 + 100).snowfall > 0.5);
  assert.deepEqual(todAt(0).top, todAt(7000).top);
});

test('terrain is finite, banks rise, the track descends', () => {
  for (let d = 0; d < 20000; d += 137) {
    assert.ok(Number.isFinite(groundY(d, 5)) && Number.isFinite(centre(d)));
    assert.ok(groundY(d, 30) > groundY(d, 0));
    assert.ok(slopeY(d + 50) < slopeY(d));
  }
});

test('onceworlds.json matches the game', () => {
  const j = JSON.parse(readFileSync(new URL('../onceworlds.json', import.meta.url)));
  assert.equal(j.slug, 'downhill-sled-dash');
  assert.equal(j.dir, 'dist');
  assert.deepEqual(j.badges.map((b) => b.id).sort(), BADGES.map((b) => b.id).sort());
  assert.ok(j.controls.length <= 12 && j.controls.every((c) => c.action.length <= 40 && c.keys.length >= 1 && c.keys.length <= 4));
  assert.ok(j.badges.every((b) => b.icon === `store/badge-${b.id}.png`));
});
