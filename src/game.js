// The game: state machine, loop, effects, saves. Pure rules live in sim/course/missions; this wires them to the screen.

import * as THREE from 'three';
import './style.css';
import { createWorld } from './world.js';
import { createCameraRig } from './camera.js';
import { createUI } from './ui.js';
import { createInput } from './input.js';
import { getPlatform, DEBUG } from './platform.js';
import { Particles, SnowFall, Sparkles, Trail, SpeedLines } from './fx.js';
import { buildSled } from './models.js';
import { startAudio, setMotion, setMusic, sfx } from './audio.js';
import { createCourse } from './course.js';
import { Sim } from './sim.js';
import { makeBot } from './bot.js';
import { todAt } from './tod.js';
import { centre, centreSlope, groundY, slopeDY, worldPoint } from './track.js';
import { SIM_DT, SLEDS, OUTFITS, POWERS, HALF, speedAt } from './config.js';
import { normalize, buy } from './save.js';
import { settleMissions, missionProgress, missionText } from './missions.js';
import { clamp, lerp, smooth, mulberry32 } from './rng.js';

const $ = (s) => document.querySelector(s);

export async function startGame() {
  const plat = getPlatform();
  try {
    plat.setOrientation('landscape');
  } catch {}
  plat.setLook({ accent: '#ff5b1f', panel: '#0e1a2b', text: '#f3f8ff' });

  let quality = plat.quality();
  const canvas = $('#gl');
  const world = createWorld(canvas, { quality });
  const { scene, camera } = world;
  const rig = createCameraRig(camera);
  rig.reduced = plat.reducedMotion();
  let save = normalize(await plat.load());
  const lines = new SpeedLines($('#fx'));

  // ---- effects ----
  const parts = new Particles(900);
  scene.add(parts.points);
  const snow = new SnowFall(700);
  scene.add(snow.points);
  const sparkles = new Sparkles(220, (d, x) => worldPoint([0, 0, 0], d, x));
  scene.add(sparkles.points);
  const trail = new Trail(90);
  scene.add(trail.mesh);
  const blobTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(20,34,70,0.9)');
    r.addColorStop(0.55, 'rgba(20,34,70,0.4)');
    r.addColorStop(1, 'rgba(20,34,70,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  blob.scale.set(1, 1, 1.9);
  blob.renderOrder = 2;
  scene.add(blob);
  world.onResize.push((ph) => {
    parts.setScale(ph);
  });

  // ---- UI ----
  let state = 'title'; // title | garage | play | pause | count | dying | results
  const handlers = {
    play: () => startRun(),
    garage: (fromResults) => enterGarage(fromResults),
    missions: () => openMissions(),
    closeMissions: () => closeMissions(),
    pause: () => pauseGame(false),
    resume: () => resumeGame(),
    retry: () => startRun(),
    home: () => goHome(),
    hopButton: () => input.queueHop(),
    sledStep: (n) => sledStep(n),
    sledAct: () => sledAct(),
    garageBack: () => garageBack(),
    outfit: (i) => setOutfit(i),
  };
  const ui = createUI($('#ui'), handlers);
  const input = createInput(canvas, plat);
  const touchy = plat.touch();
  document.body.classList.toggle('touch', touchy);
  ui.hud.ownHop(touchy && !plat.present);

  // ---- run state ----
  let course = null;
  let sim = null;
  let bot = null;
  let demo = true;
  let sledV = null;
  let looks = { sled: '', outfit: -1 };
  let anim = 0;
  let acc = 0;
  let timeScale = 1;
  let hitStop = 0;
  let crashClock = -1;
  let endTimer = 0;
  let spray = 0;
  let pausedByPlatform = false;
  let countT = 0;
  let countN = 0;
  let missionsReturn = 'title';
  let garageIndex = Math.max(0, SLEDS.findIndex((s) => s.id === save.sled));
  let garageFrom = 'title';
  let missionToasted = new Set();
  let awarded = new Set();
  let hintT = 0;
  let runSeed = 0;
  let rider = null; // detached rider state
  let tumble = null;
  let lastMissionCheck = 0;
  let airTrickTouched = false;
  let saveTimer = 0;
  let dbgBot = null;
  let dbgDt = 0;
  let pruneN = 0;

  function persist() {
    plat.store(save);
  }

  function disposeObject(o) {
    o.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
    });
  }
  function setSledLook(sledId, outfitIdx) {
    if (looks.sled === sledId && looks.outfit === outfitIdx && sledV) return;
    if (sledV) {
      scene.remove(sledV.api.group);
      if (sledV.api.rider.parent === scene) scene.remove(sledV.api.rider);
      disposeObject(sledV.api.group);
    }
    const api = buildSled(sledId, OUTFITS[outfitIdx] ?? OUTFITS[0]);
    scene.add(api.group);
    sledV = { api };
    looks = { sled: sledId, outfit: outfitIdx };
    rider = null;
    tumble = null;
  }

  function newCourse(seed) {
    course = createCourse(seed);
    sim = new Sim(course);
    world.bindCourse(course, save.best.dist);
    trail.reset();
    parts.clear();
    rider = null;
    tumble = null;
    looks = { sled: '', outfit: -1 };
    setSledLook(save.sled, save.outfit);
    acc = 0;
  }

  function resetDemo(run) {
    demo = true;
    newCourse((Math.random() * 1e9) | 0);
    sim.invuln = 1e9;
    bot = run ? makeBot(sim, { seed: runSeed++ + 5, tricks: true, error: 0.25 }) : null;
    if (run) {
      // skip the empty start: the demo begins mid-slope at a lively speed
      course.ensure(700);
      sim.d = 260;
      sim._prevD = 260;
      sim.x = course.route.x(260);
      sim.v = speedAt(260);
    }
    rig.snap(sim);
  }

  // ---- screens ----
  function refreshTitle() {
    ui.title.set({ best: save.best.dist, bells: save.bells, missions: save.missions.length });
  }
  function showTitle() {
    state = 'title';
    ui.screen('title');
    refreshTitle();
    input.setEnabled(false);
    plat.controls(null);
    setMusic('menu', 0);
    setMotion(0, true, false, false);
    resetDemo(true);
  }
  function goHome() {
    sfx.click();
    showTitle();
  }

  function openMissions() {
    sfx.click();
    ui.missions.set(save.missions);
    missionsReturn = state;
    ui.screen('missions-title');
    state = 'missions';
  }
  function closeMissions() {
    sfx.click();
    state = missionsReturn === 'results' ? 'results' : 'title';
    ui.screen(state === 'results' ? 'results' : 'title');
  }

  function enterGarage(fromResults) {
    sfx.click();
    garageFrom = fromResults ? 'results' : 'title';
    state = 'garage';
    ui.screen('garage');
    input.setEnabled(false);
    resetDemo(false);
    garageIndex = Math.max(0, SLEDS.findIndex((s) => s.id === save.sled));
    refreshGarage();
    setMusic('menu', 0);
    setMotion(0, true, false, false);
  }
  function refreshGarage() {
    ui.garage.set({ index: garageIndex, owned: save.owned, equipped: save.sled, bells: save.bells, outfit: save.outfit });
    ui.wallet(save.bells);
    // show the sled being browsed
    setSledLook(SLEDS[garageIndex].id, save.outfit);
  }
  function sledStep(n) {
    sfx.click();
    garageIndex = (garageIndex + n + SLEDS.length) % SLEDS.length;
    refreshGarage();
  }
  function sledAct() {
    const s = SLEDS[garageIndex];
    if (save.owned.includes(s.id)) {
      save = { ...save, sled: s.id };
      sfx.click();
    } else {
      const b = buy(save, s.id);
      if (!b) {
        sfx.nope();
        return;
      }
      save = b;
      sfx.buy();
      if (save.owned.length === SLEDS.length) plat.award('collector');
    }
    persist();
    refreshGarage();
  }
  function setOutfit(i) {
    sfx.click();
    save = { ...save, outfit: i };
    persist();
    refreshGarage();
  }
  function garageBack() {
    sfx.click();
    // the sled being worn is the equipped one
    if (garageFrom === 'results') {
      setSledLook(save.sled, save.outfit);
      state = 'results';
      ui.screen('results');
    } else showTitle();
  }

  // ---- a run ----
  function startRun() {
    startAudio();
    sfx.click();
    demo = false;
    runSeed = (Math.random() * 4294967295) >>> 0;
    newCourse(runSeed);
    bot = null;
    missionToasted = new Set();
    awarded = new Set();
    ui.hud.reset();
    ui.hud.setBest(save.best.dist > 0 ? `${Math.round(save.best.dist).toLocaleString('en-US')} m` : '');
    ui.screen('play');
    state = 'play';
    crashClock = -1;
    timeScale = 1;
    hitStop = 0;
    hintT = 0;
    airTrickTouched = false;
    input.setEnabled(true);
    input.clearHop();
    plat.controls({ buttons: [{ id: 'hop', label: 'Hop', key: ' ' }] });
    setMusic('play', 1);
    rig.snap(sim);
    lastMissionCheck = 0;
  }

  function pauseGame(byPlatform) {
    if (state !== 'play') return;
    state = 'pause';
    pausedByPlatform = byPlatform;
    ui.screen('pause');
    input.setEnabled(false);
    setMotion(0, true, false, false);
    setMusic('menu', 0);
    sfx.click();
  }
  function resumeGame() {
    if (state !== 'pause') return;
    sfx.click();
    state = 'count';
    countN = 3;
    countT = 0;
    ui.screen('play');
    ui.hud.count(3);
    sfx.tick(false);
  }

  const runNumbers = () => ({
    dist: Math.floor(sim.d),
    score: sim.score,
    gates: sim.stats.gates,
    bestStreak: sim.stats.bestStreak,
    bestSpins: sim.stats.bestSpins,
    tricks: sim.stats.tricks,
    bells: sim.stats.bells,
    hops: sim.stats.hops,
    powerups: sim.stats.powerups,
    smashes: sim.stats.smashes,
    shieldUsed: sim.stats.shieldUsed,
  });

  function award(id) {
    if (awarded.has(id)) return;
    awarded.add(id);
    plat.award(id);
  }

  function finishRun() {
    state = 'results';
    const run = runNumbers();
    const before = save.missions;
    const settled = settleMissions(save, run);
    const prevBest = save.best;
    const newBest = run.dist > prevBest.dist;
    const bellsEarned = run.bells + settled.paid;
    save = {
      ...save,
      bells: save.bells + bellsEarned,
      runs: save.runs + 1,
      totalDist: save.totalDist + run.dist,
      best: { dist: Math.max(prevBest.dist, run.dist), score: Math.max(prevBest.score, run.score) },
      missions: settled.missions,
      mseed: settled.mseed,
      mdone: settled.mdone,
      maxStreak: Math.max(save.maxStreak, run.bestStreak),
      hints: { ...save.hints },
    };
    persist();
    plat.submit('best-distance', run.dist);
    plat.submit('best-score', run.score);
    const kind = sim.crash ? sim.crash.kind : '';
    const cause = kind ? `HIT ${/^[aeiou]/i.test(kind) ? 'AN' : 'A'} ${kind.toUpperCase()}` : '';
    ui.results.show({
      cause,
      dist: run.dist,
      score: run.score,
      bells: bellsEarned,
      best: save.best.dist,
      newBest,
      missions: before,
      completed: settled.completed,
      run,
    });
    ui.screen('results');
    input.setEnabled(false);
    plat.controls(null);
    setMotion(0, true, false, false);
    if (newBest && prevBest.dist > 0) sfx.fanfare();
    else sfx.stinger();
    setMusic('menu', 0);
  }

  // ---- particles ----
  const tmpP = [0, 0, 0];
  function snowBurst(wx, wy, wz, n, power, up = 1, blue = false) {
    const k = rig.reduced ? 0.4 : quality === 'low' ? 0.6 : 1;
    n = Math.round(n * k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const s = (0.4 + Math.random()) * power;
      parts.spawn(wx + (Math.random() - 0.5) * 0.6, wy + 0.2, wz + (Math.random() - 0.5) * 0.6, Math.cos(a) * s, (1.5 + Math.random() * 3.5) * up, Math.sin(a) * s - 2, 0.6 + Math.random() * 0.7, 0.9 + Math.random() * 1.1, blue ? 0.7 : 0.96, blue ? 0.85 : 0.98, 1, 8, 0.8);
    }
  }
  function sparks(wx, wy, wz, n, r, g, b, power = 4) {
    n = Math.round(n * (rig.reduced ? 0.4 : 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const e = Math.random() * 3.14 - 0.2;
      const s = (0.5 + Math.random()) * power;
      parts.spawn(wx, wy, wz, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s, 0.4 + Math.random() * 0.5, 0.35 + Math.random() * 0.3, r, g, b, 9, 0.6);
    }
  }

  // ---- events ----
  const KINDS = { tree: 'tree', rock: 'rock', boulder: 'rock' };
  function sledWorld() {
    return worldPoint(tmpP, sim.d, sim.x, sim.hy);
  }
  function handleEvents() {
    for (const e of sim.drain()) {
      const p = sledWorld();
      const gy = groundY(sim.d, sim.x);
      switch (e.type) {
        case 'hop':
          if (!demo) sfx.hop();
          snowBurst(p[0], gy, p[2], 6, 1.5);
          if (!save.hints.hop && !demo) {
            save.hints.hop = true;
            persist();
          }
          break;
        case 'launch':
          if (!demo) sfx.launch();
          rig.addTrauma(0.18);
          snowBurst(p[0], gy, p[2], 14, 3);
          break;
        case 'spin':
          if (!demo) sfx.spin(e.n);
          ui.hud.pop(`${e.n * 360}`, 'big');
          break;
        case 'land': {
          const q = Math.min(1, e.impact / 18);
          if (!demo) sfx.land(e.big, e.clean, e.impact);
          snowBurst(p[0], gy, p[2], e.big ? 26 : 10, 2 + q * 3);
          if (e.big) rig.addTrauma(e.clean ? 0.3 : 0.55);
          else rig.addTrauma(0.05 * q);
          if (!demo) {
            if (e.big && e.clean && e.tricks > 0) {
              sfx.trick(e.tricks);
              ui.hud.pop(`${e.tricks * 360} +${Math.round(e.pts)}`, 'big', e.combo > 1 ? `x${e.combo}` : '');
              if (e.tricks >= 2) award('double-spin');
              hitStop = rig.reduced ? 0 : 0.05;
            } else if (e.big && e.clean && e.perfect) ui.hud.pop('Perfect', 'good');
            else if (e.big && !e.clean) {
              ui.hud.pop('Wobble', 'bad');
              plat.vibrate(40);
            }
          }
          break;
        }
        case 'bell':
          if (!demo) {
            sfx.bell(e.chain);
            sparks(...worldPoint(tmpP, e.item.md ?? e.item.d, e.item.mx ?? e.item.x, e.item.y), 6, 1, 0.8, 0.2, 2.5);
          }
          break;
        case 'gate':
          e.gate.flash = anim;
          e.gate.ok = e.ok;
          if (!demo) {
            if (e.ok) {
              sfx.gate(e.streak);
              ui.hud.pop(`Gate x${e.mult}`, e.streak >= 5 ? 'big' : '', `+${e.pts}`);
              if (e.streak >= 10) award('gate-master');
            } else {
              sfx.gateMiss();
              if (e.lost >= 2) ui.hud.pop('Streak lost', 'bad');
            }
            ui.hud.streak(sim.streak);
          }
          break;
        case 'power':
          if (!demo) {
            sfx.power(e.type);
            ui.hud.pop(POWERS[e.type].name === 'x2' ? 'Score x2' : POWERS[e.type].name, 'big');
            if (e.type === 'boost') {
              sfx.boost();
              rig.addTrauma(0.25);
            }
          }
          break;
        case 'power-end':
          if (!demo) sfx.powerEnd();
          break;
        case 'shield-break':
          sfx.shieldBreak();
          rig.addTrauma(0.6);
          sparks(p[0], p[1] + 0.8, p[2], 30, 0.5, 0.8, 1, 6);
          ui.hud.pop('Shield', 'bad');
          ui.hud.flash();
          plat.vibrate(50);
          hitStop = rig.reduced ? 0 : 0.08;
          break;
        case 'smash':
          sfx.smash();
          world.hide(e.item, KINDS[e.kind] ?? '');
          snowBurst(p[0], p[1], p[2] - 1, 18, 4, 1.2);
          sparks(p[0], p[1] + 0.5, p[2] - 1, 8, 0.25, 0.6, 0.35, 4);
          rig.addTrauma(0.2);
          break;
        case 'scrape':
          if (!demo) sfx.scrape();
          sparks(p[0] + e.side * 0.5, gy + 0.2, p[2], 10, 1, 0.85, 0.5, 3);
          rig.addTrauma(0.15);
          break;
        case 'burst': {
          const m = e.item;
          const bp = worldPoint([0, 0, 0], m.d, m.xTo, 1);
          snowBurst(bp[0], bp[1], bp[2], 30, 5, 1.4);
          break;
        }
        case 'crash':
          onCrash();
          break;
        default:
      }
    }
  }

  function onCrash() {
    sfx.crash();
    plat.vibrate(120);
    rig.addTrauma(1);
    ui.hud.flash();
    ui.hud.streak(0);
    ui.hud.hint('');
    const p = sledWorld();
    snowBurst(p[0], groundY(sim.d, sim.x), p[2], 70, 7, 1.6);
    sparks(p[0], p[1] + 0.6, p[2], 24, 1, 0.9, 0.6, 6);
    state = 'dying';
    crashClock = 0;
    setMusic('off', 0);
    setMotion(0, false, false, false);
    plat.controls(null);
    input.setEnabled(false);
    // the rider leaves the sled
    const api = sledV.api;
    scene.attach(api.rider);
    const c = sim.crash;
    const rng = mulberry32(c.seed);
    rider = {
      v: new THREE.Vector3(c.vx * 0.4 + (rng() - 0.5) * 5, 6 + rng() * 3, -c.v * 0.85),
      w: new THREE.Vector3((rng() - 0.5) * 14, (rng() - 0.5) * 8, (rng() - 0.5) * 14),
      bounces: 0,
    };
    tumble = { rx: 0, rz: 0, ry: 0, wx: (rng() - 0.5) * 9, wz: (rng() - 0.5) * 9, wy: (rng() - 0.5) * 5, t: 0 };
  }

  // ---- pose ----
  const _eu = new THREE.Euler();
  function poseSled(dt) {
    const api = sledV.api;
    const s = sim;
    const g = groundY(s.d, s.x);
    const crashed = s.phase === 'crashed';
    let y = g + s.hy;
    const v = Math.max(s.v, 0.001);
    const slip = crashed ? 0 : s.vx / Math.max(v, 6);
    let yaw = -Math.atan(centreSlope(s.d)) - slip * 1.4 + s.spin;
    let pitch = Math.atan(slopeDY(s.d)) + (s.air ? s.vy * 0.03 : 0);
    let roll = -s.vx * 0.02;
    if (s.wobble > 0 && !crashed) {
      yaw += Math.sin(anim * 26) * 0.3 * Math.min(1, s.wobble);
      roll += Math.sin(anim * 31) * 0.14 * Math.min(1, s.wobble);
    }
    if (!s.air && !crashed && s.v > 4) y += Math.sin(anim * 70) * 0.012 * Math.min(1, s.v / 30);
    if (crashed && tumble) {
      tumble.t += dt;
      const decay = Math.exp(-1.3 * tumble.t);
      tumble.rx += tumble.wx * decay * dt;
      tumble.rz += tumble.wz * decay * dt;
      tumble.ry += tumble.wy * decay * dt;
      y += Math.abs(Math.sin(tumble.t * 5)) * 1.1 * Math.exp(-tumble.t * 1.4);
      yaw += tumble.ry;
      pitch += tumble.rx;
      roll += tumble.rz;
    }
    api.group.position.set(centre(s.d) + s.x, y, -s.d);
    _eu.set(pitch, yaw, roll, 'YXZ');
    api.group.rotation.copy(_eu);
    if (!rider) api.update(anim, s.v, clamp(s.steerIn, -1, 1), s.vx, s.air, s.wobble > 0.2);
    blob.position.set(centre(s.d) + s.x, g + 0.05, -s.d);
    blob.rotation.y = yaw;
    const h = Math.max(0, s.hy);
    blob.scale.set(1 - Math.min(0.5, h * 0.06), 1, 1.9 - Math.min(0.8, h * 0.08));
    blob.material.opacity = Math.max(0.1, 0.55 - h * 0.05) * (quality === 'low' ? 1 : 0.8);
  }

  function updateRider(dt) {
    if (!rider) return;
    const r = sledV.api.rider;
    rider.v.y -= 22 * dt;
    r.position.addScaledVector(rider.v, dt);
    r.rotation.x += rider.w.x * dt;
    r.rotation.y += rider.w.y * dt;
    r.rotation.z += rider.w.z * dt;
    const d = -r.position.z;
    const x = r.position.x - centre(d);
    const gyv = groundY(d, x) + 0.35;
    if (r.position.y < gyv) {
      r.position.y = gyv;
      if (rider.v.y < -1.5) {
        rider.bounces++;
        snowBurst(r.position.x, gyv - 0.3, r.position.z, 14, 3, 1);
        if (rider.bounces < 4) sfx.smash();
      }
      rider.v.y = Math.abs(rider.v.y) * 0.32;
      rider.v.x *= 0.7;
      rider.v.z *= 0.72;
      rider.w.multiplyScalar(0.7);
    }
  }

  // ---- loop ----
  let last = performance.now();
  const _cp = new THREE.Vector3();

  function stepSim(dt) {
    acc += dt;
    let n = 0;
    while (acc >= SIM_DT && n++ < 12) {
      acc -= SIM_DT;
      let inp;
      if (bot) inp = bot();
      else if (dbgBot) inp = dbgBot();
      else inp = { steer: input.steer(SIM_DT), hop: input.hop() };
      if (!bot && !demo) {
        // steer is read per step so keys ramp in real time
      }
      sim.step(SIM_DT, inp);
      if (sim.events.length) handleEvents();
    }
    if (acc > SIM_DT * 4) acc = 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = dbgDt || Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!sim) return;
    anim += dt;
    try {
      tick(dt);
    } catch (e) {
      console.error('[downhill-sled-dash] frame error', e);
    }
  }

  function tick(dt) {
    const playing = state === 'play' || state === 'dying';
    const lively = playing || state === 'title';
    // time scale: slow motion around a crash
    if (state === 'dying') {
      crashClock += dt;
      const t = crashClock;
      timeScale = t < 0.2 ? 0.2 : t < 1.4 ? lerp(0.2, 0.8, smooth((t - 0.2) / 1.2)) : 1;
      endTimer = t;
      if ((sim.done && t > 1.9) || t > 3.4) finishRun();
    } else timeScale = 1;

    if (++pruneN % 90 === 0) course.prune(sim.d);
    if (hitStop > 0) hitStop -= dt;
    else if (lively && !(state === 'garage')) {
      if (demo && (sim.done || sim.d > 3000 || sim.phase === 'crashed')) resetDemo(true);
      stepSim(dt * timeScale);
    }

    if (state === 'count') {
      countT += dt;
      if (countT >= 0.55) {
        countT = 0;
        countN--;
        if (countN <= 0) {
          ui.hud.count(0);
          state = 'play';
          input.setEnabled(true);
          input.clearHop();
          plat.controls({ buttons: [{ id: 'hop', label: 'Hop', key: ' ' }] });
          setMusic('play', 1);
          sfx.tick(true);
        } else {
          ui.hud.count(countN);
          sfx.tick(false);
        }
      }
    }

    const s = sim;
    const tod = todAt(s.d);
    // camera
    if (state === 'garage') {
      const sp = worldPoint([0, 0, 0], 0, 0, 0);
      rig.orbit(dt, sp);
      const w = innerWidth;
      const h = innerHeight;
      if (rig.portraitT > 0.5) camera.setViewOffset(w, h, 0, h * 0.16, w, h);
      else camera.setViewOffset(w, h, -w * 0.17, 0, w, h);
    } else {
      if (camera.view && camera.view.enabled) camera.clearViewOffset();
      rig.follow(dt * (state === 'dying' ? timeScale * 0.6 + 0.4 : 1), s, state === 'title' ? 'title' : state === 'dying' ? 'crash' : 'play');
    }

    // sled
    if (rider) updateRider(dt * timeScale);
    poseSled(dt * timeScale);

    // trail, spray, sparkles
    const sp = sledWorld();
    const onGround = !s.air && s.phase === 'run' && s.v > 3;
    if (onGround) {
      const rx = Math.cos(-Math.atan(centreSlope(s.d)));
      const rz = Math.sin(-Math.atan(centreSlope(s.d)));
      trail.push(sp[0], groundY(s.d, s.x), sp[2], rx, rz, true);
    } else if (s.phase === 'crashed' && s.v > 2) {
      trail.push(sp[0], groundY(s.d, s.x), sp[2], 1, 0, true, 0.5);
    }
    if (lively && s.phase === 'run' && s.v > 3 && !s.air) {
      const q = quality === 'low' ? 0.5 : 1;
      spray += dt * timeScale * (22 + s.v * 1.2 + Math.abs(s.vx) * 4) * q * (rig.reduced ? 0.4 : 1);
      const hxd = centreSlope(s.d) + s.vx / s.v;
      while (spray >= 1) {
        spray -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        const gy2 = groundY(s.d, s.x);
        parts.spawn(
          sp[0] + side * 0.42 + (Math.random() - 0.5) * 0.3, gy2 + 0.12, sp[2] + 0.9,
          side * (0.8 + Math.random() * 1.6) - s.vx * 0.15 - hxd * s.v * 0.05, 1.2 + Math.random() * 2.4 + Math.abs(s.vx) * 0.1, s.v * (0.04 + Math.random() * 0.06),
          0.45 + Math.random() * 0.4, 0.5 + Math.random() * 0.6, 0.95, 0.98, 1, 7, 1.2,
        );
      }
    }
    parts.update(dt * Math.max(0.35, timeScale));
    camera.updateMatrixWorld();
    snow.update(anim, camera.position, tod.snowfall, innerHeight * (world.renderer.getPixelRatio?.() ?? 1));
    sparkles.update(anim, s.d, innerHeight * world.renderer.getPixelRatio(), 0.6 + 0.4 * (1 - tod.night));

    // HUD and audio
    if (playing || state === 'count' || state === 'pause') {
      ui.hud.setDist(s.d);
      ui.hud.setScore(s.score);
      ui.hud.setBells(s.stats.bells);
      const pw = [];
      if (s.boost > 0) pw.push({ type: 'boost', frac: s.boost / POWERS.boost.time });
      if (s.magnet > 0) pw.push({ type: 'magnet', frac: s.magnet / POWERS.magnet.time });
      if (s.x2 > 0) pw.push({ type: 'x2', frac: s.x2 / POWERS.x2.time });
      if (s.shield) pw.push({ type: 'shield', frac: 1 });
      ui.hud.setPowers(pw);
    }
    if (state === 'play') {
      setMotion(s.v, !s.air, s.boost > 0, true);
      setMusic('play', s.v < 18 ? 1 : s.v < 26 ? 2 : 3);
      runChecks(dt);
    }
    if (state === 'title') setMotion(s.v * 0.3, !s.air, false, false);

    // speed lines
    const sl = lively && !rig.reduced ? clamp((s.v - 22) / 16, 0, 1) * 0.7 + (s.boost > 0 ? 0.6 : 0) : 0;
    lines.draw(dt, state === 'dying' ? 0 : sl, s.boost > 0 ? '255,200,120' : '255,255,255');

    const headlamp = 1;
    const tp = sledWorld();
    world.update({
      d: s.d,
      t: anim,
      simT: s.t,
      tod,
      targetPos: tp,
      fwdX: centreSlope(s.d),
      headlamp,
    });
    world.render();
  }

  // hints, missions, badges while playing
  function runChecks(dt) {
    const s = sim;
    hintT += dt;
    // hints
    let hint = '';
    if (!save.hints.steer && hintT < 6) {
      hint = touchy ? 'Drag to steer' : 'A / D to steer';
      if (Math.abs(s.steerIn) > 0.5 && hintT > 1) {
        save.hints.steer = true;
        persist();
      }
    } else if (!save.hints.hop) {
      for (const l of course.near('logs', s.d, s.d + 70)) {
        if (l.d > s.d && l.d - s.d < 60 && l.full) hint = touchy ? 'Tap Hop' : 'Space to hop';
      }
    } else if (!save.hints.spin && s.air && s.big) {
      hint = 'Steer to spin';
      airTrickTouched = true;
    }
    if (!hint && airTrickTouched && !s.air) {
      save.hints.spin = true;
      airTrickTouched = false;
      persist();
    }
    ui.hud.hint(hint);

    // badges
    if (s.d >= 1000) award('first-km');
    if (s.d >= 4500) award('night-rider');
    if (s.d >= 2000 && !s.stats.shieldUsed) award('untouchable');

    // missions: toast when one is complete
    lastMissionCheck += dt;
    if (lastMissionCheck > 0.3) {
      lastMissionCheck = 0;
      const run = runNumbers();
      for (const m of save.missions) {
        if (!missionToasted.has(m) && missionProgress(m, run) >= 1) {
          missionToasted.add(m);
          ui.hud.toast(missionText(m), m.reward);
          sfx.buy();
        }
      }
    }
  }

  // ---- resize, settings, pause hooks ----
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = plat.pixelRatio(2);
    world.resize(w, h, dpr);
    rig.setAspect(w / h);
    lines.resize(w, h, Math.min(dpr, 1.5));
  }
  window.addEventListener('resize', resize);
  plat.onSettings(() => {
    quality = plat.quality();
    rig.reduced = plat.reducedMotion();
    world.setQuality(quality);
    resize();
  });
  plat.on('pause', () => pauseGame(true));
  plat.on('resume', () => {
    if (state === 'pause' && pausedByPlatform) resumeGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame(false);
  });
  input.handlers.pause = () => {
    if (state === 'play') pauseGame(false);
    else if (state === 'pause') resumeGame();
    else if (state === 'garage') garageBack();
    else if (state === 'missions') closeMissions();
  };
  input.handlers.enter = () => {
    startAudio();
    if (state === 'title') startRun();
    else if (state === 'results') startRun();
    else if (state === 'pause') resumeGame();
    else if (state === 'garage') sledAct();
  };
  input.handlers.any = (e) => {
    startAudio();
    if (e.code === 'Space' && state === 'title') startRun();
    else if (e.code === 'Space' && state === 'results') startRun();
    else if (state === 'garage' && (e.code === 'ArrowLeft' || e.code === 'KeyA')) sledStep(-1);
    else if (state === 'garage' && (e.code === 'ArrowRight' || e.code === 'KeyD')) sledStep(1);
  };
  window.addEventListener('pointerdown', () => startAudio(), { passive: true });

  resize();
  showTitle();
  ui.screen('title');
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
  // a small hook for the screenshot tools (only with ?debug): jump to a distance with an autopilot, or stage a crash
  if (DEBUG) window.__sled = {
    get sim() { return sim; },
    get state() { return state; },
    save: () => save,
    goto(d, { invuln = true } = {}) {
      startRun();
      course.ensure(d + 400);
      sim.d = d;
      sim._prevD = d;
      sim.x = course.route.x(d);
      sim.v = speedAt(d);
      if (invuln) sim.invuln = 1e9;
      dbgBot = makeBot(sim, { seed: 3, tricks: true });
      rig.snap(sim);
      save.hints.steer = save.hints.hop = save.hints.spin = true;
    },
    crash() {
      const t = course.add('trees', { d: sim.d + 6, x: sim.x, r: 0.9, h: 3.6, s: 1.1, v: 0, dead: false });
      sim.invuln = 0;
      dbgBot = null;
      return t;
    },
    dt(v) {
      dbgDt = v;
    },
    finish() {
      if (!sim.crash) sim.crash = { kind: 'tree', x: sim.x, d: sim.d, v: 5, vx: 0, hy: 0, seed: 3 };
      sim.stats.bells = 37;
      finishRun();
    },
    shop(i = 2) {
      enterGarage(false);
      garageIndex = i;
      refreshGarage();
    },
  };
}
