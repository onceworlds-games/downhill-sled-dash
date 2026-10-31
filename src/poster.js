// Store pictures (?poster=cover|action|win|icon|badge-<id>): one staged frame from a real run of the simulation, drawn by
// the game's own renderer. No SDK, no HUD, no room.

import * as THREE from 'three';
import './style.css';
import { createWorld } from './world.js';
import { createCameraRig } from './camera.js';
import { Particles } from './fx.js';
import { buildSled } from './models.js';
import { createCourse } from './course.js';
import { Sim } from './sim.js';
import { makeBot } from './bot.js';
import { todAt } from './tod.js';
import { centre, centreSlope, groundY, slopeDY, worldPoint } from './track.js';
import { OUTFITS, SIM_DT } from './config.js';

/** Run the bot through the first ramp until it is high in the air, turned over by at least `minSpin` radians. */
function findJump(minSpin, hyMin = 1.8) {
  for (let seed = 1; seed < 400; seed++) {
    const course = createCourse(seed * 31 + 7);
    const sim = new Sim(course);
    const bot = makeBot(sim, { seed, tricks: true });
    let n = 0;
    while (!sim.done && sim.d < 700 && n++ < 400000) {
      sim.step(SIM_DT, bot());
      sim.drain();
      if (sim.air && sim.big && sim.hy > hyMin && Math.abs(sim.spin) > minSpin) return { course, sim, seed };
    }
  }
  return null;
}

function runTo(d, seed = 5) {
  const course = createCourse(seed);
  const sim = new Sim(course);
  const bot = makeBot(sim, { seed, tricks: true });
  let n = 0;
  while (!sim.done && sim.d < d && n++ < 800000) {
    sim.step(SIM_DT, bot());
    sim.drain();
  }
  return { course, sim };
}

function text(parent, css, content) {
  const e = document.createElement('div');
  e.style.cssText = css;
  e.textContent = content;
  parent.append(e);
  return e;
}

export async function runPoster(name) {
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;overflow:hidden;background:#0e1a2b';
  const W = window.innerWidth;
  const H = window.innerHeight;
  try {
    await document.fonts.load('900 italic 100px "Barlow Condensed"');
    await document.fonts.load('800 40px "Barlow Condensed"');
  } catch {}
  await document.fonts.ready;

  if (name.startsWith('badge-')) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.style.cssText = 'position:fixed;inset:0';
    document.body.append(c);
    drawBadge(c.getContext('2d'), W, H, name.slice(6));
    document.body.dataset.ready = '1';
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  document.body.append(canvas);
  const world = createWorld(canvas, { quality: 'high', poster: true });
  world.resize(W, H, 1);
  const { scene, camera } = world;
  const rig = createCameraRig(camera);
  rig.setAspect(W / H);
  const parts = new Particles(900);
  scene.add(parts.points);
  parts.setScale(H);

  const outfit = OUTFITS[0];
  const sledApi = buildSled(name === 'win' ? 'aurum' : 'wood', outfit);
  scene.add(sledApi.group);

  const puff = (p, n, power, up, col = [0.96, 0.98, 1], size = 1.3) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const s = (0.3 + Math.random()) * power;
      parts.spawn(p[0] + (Math.random() - 0.5), p[1] + 0.2, p[2] + (Math.random() - 0.5), Math.cos(a) * s, (1 + Math.random() * 3) * up, Math.sin(a) * s - 1, 1.2, size * (0.6 + Math.random()), col[0], col[1], col[2], 7, 0.7);
    }
  };

  function poseSled(sim, extraYaw = 0) {
    const g = groundY(sim.d, sim.x);
    sledApi.group.position.set(centre(sim.d) + sim.x, g + sim.hy, -sim.d);
    sledApi.group.rotation.copy(new THREE.Euler(Math.atan(slopeDY(sim.d)) + (sim.air ? sim.vy * 0.03 : 0), -Math.atan(centreSlope(sim.d)) - (sim.vx / Math.max(6, sim.v)) * 1.4 + sim.spin + extraYaw, -sim.vx * 0.02, 'YXZ'));
    sledApi.update(1.3, sim.v, sim.steerIn, sim.vx, sim.air, false);
  }

  let sim;
  let course;
  let todD = 2900;
  let best = 0;
  let camFn = null;
  let overlay = null;

  if (name === 'cover') {
    ({ course, sim } = findJump(2.5, 2.8));
    todD = 2500;
    camFn = () => {
      const p = worldPoint([0, 0, 0], sim.d, sim.x, sim.hy);
      camera.position.set(p[0] - 0.4, p[1] + 1.7, p[2] + 6.4);
      camera.lookAt(p[0] - 2.3, p[1] - 0.1, p[2] - 6);
      camera.fov = 64;
      camera.updateProjectionMatrix();
    };
    overlay = () => {
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:"Barlow Condensed","Arial Narrow",Impact,sans-serif;font-style:italic;font-weight:900;text-transform:uppercase';
      document.body.append(o);
      text(o, 'position:absolute;left:46px;top:44px;font-size:168px;line-height:.82;color:#f3f8ff;-webkit-text-stroke:14px #0e1a2b;paint-order:stroke fill;text-shadow:0 8px 0 rgba(14,26,43,.5)', 'Downhill');
      text(o, 'position:absolute;left:62px;top:172px;font-size:96px;line-height:1;color:#0e1a2b;background:#ff5b1f;padding:0 30px 4px 22px;clip-path:polygon(5% 0,100% 0,95% 100%,0 100%)', 'Sled Dash');
    };
  } else if (name === 'action') {
    ({ course, sim } = findJump(4.0, 1.8));
    todD = 1950;
    camFn = () => {
      // a low, close camera beside the sled
      const p = worldPoint([0, 0, 0], sim.d, sim.x, sim.hy);
      camera.position.set(p[0] + 4.2, p[1] + 0.7, p[2] + 3.6);
      camera.lookAt(p[0] - 0.2, p[1] + 1.0, p[2] - 3);
      camera.fov = 56;
      camera.updateProjectionMatrix();
    };
  } else if (name === 'win') {
    ({ course, sim } = runTo(1000, 11));
    sim.d = sim.d;
    todD = 4600;
    best = sim.d + 12;
    camFn = () => {
      const p = worldPoint([0, 0, 0], sim.d, sim.x, 0);
      camera.position.set(p[0] + 0.6, p[1] + 2.2, p[2] + 5.4);
      camera.lookAt(p[0], p[1] + 1.8, p[2] - 8);
      camera.fov = 64;
      camera.updateProjectionMatrix();
    };
    overlay = () => {
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:"Barlow Condensed","Arial Narrow",Impact,sans-serif;font-style:italic;font-weight:900;text-transform:uppercase;text-align:center';
      document.body.append(o);
      text(o, 'position:absolute;left:0;right:0;top:34px;font-size:150px;line-height:.9;color:#ffc43d;-webkit-text-stroke:12px #0e1a2b;paint-order:stroke fill;text-shadow:0 8px 0 rgba(14,26,43,.5)', 'New best');
    };
  } else {
    // icon: the rider, big, from the front-left, over the dawn slope
    ({ course, sim } = runTo(520, 9));
    todD = 100;
    camFn = () => {
      const p = worldPoint([0, 0, 0], sim.d, sim.x, 0);
      camera.position.set(p[0] - 3.1, p[1] + 1.7, p[2] - 4.6);
      camera.lookAt(p[0] + 0.1, p[1] + 0.7, p[2]);
      camera.fov = 46;
      camera.updateProjectionMatrix();
    };
    sim.v = 24;
  }

  if (name === 'icon') {
    sim.spin = Math.PI + 0.6;
  }
  course.ensure(sim.d + 400);
  world.bindCourse(course, best);
  poseSled(sim, name === 'icon' ? Math.PI * 0.82 - sim.spin : 0);
  camFn();
  if (name === 'icon') {
    // face the camera a little: the sled turns toward the lens
  }
  const p = worldPoint([0, 0, 0], sim.d, sim.x, 0);
  if (name === 'cover' || name === 'action') puff([p[0], groundY(sim.d, sim.x), p[2] + 8], 40, 5, 1.2);
  if (name === 'win') {
    for (let i = 0; i < 90; i++) {
      const c = [[1, 0.77, 0.24], [1, 0.36, 0.12], [0.95, 0.97, 1]][i % 3];
      parts.spawn(p[0] + (Math.random() - 0.5) * 7, p[1] + 1 + Math.random() * 5, p[2] - 4 - Math.random() * 6, (Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 4, 3, 0.55 + Math.random() * 0.4, c[0], c[1], c[2], 1.5, 0.3);
    }
    puff([p[0], groundY(sim.d, sim.x), p[2] + 3], 30, 4, 1);
  }
  parts.update(0.4);
  if (overlay) overlay();

  const tod = todAt(todD);
  const frame = () => {
    camera.updateMatrixWorld();
    world.update({ d: sim.d, t: 1.3, simT: sim.t, tod, targetPos: p, fwdX: 0, headlamp: 1 });
    world.render();
  };
  for (let i = 0; i < 4; i++) frame();
  document.body.dataset.ready = '1';
  const keep = () => {
    frame();
    requestAnimationFrame(keep);
  };
  requestAnimationFrame(keep);
}

function drawBadge(g, W, H, id) {
  const col = { 'first-km': '#ffc43d', 'night-rider': '#2d3f8f', 'double-spin': '#ff5b1f', 'gate-master': '#2d7fe0', collector: '#ffc43d', untouchable: '#1d7a55' }[id] ?? '#ff5b1f';
  g.translate(W / 2, H / 2);
  const grad = g.createRadialGradient(0, -W * 0.15, 10, 0, 0, W * 0.5);
  grad.addColorStop(0, '#ffffff22');
  grad.addColorStop(1, '#00000000');
  g.fillStyle = '#0e1a2b';
  g.beginPath();
  g.arc(0, 0, W * 0.5, 0, 7);
  g.fill();
  g.fillStyle = col;
  g.beginPath();
  g.arc(0, 0, W * 0.44, 0, 7);
  g.fill();
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#f3f8ff';
  g.beginPath();
  g.arc(0, 0, W * 0.44, 0, 7);
  g.stroke();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const ink = '#0e1a2b';
  const snow = '#f3f8ff';
  g.fillStyle = snow;
  g.strokeStyle = ink;
  g.lineWidth = 9;
  const label = (t, size, y = 0, fill = snow) => {
    g.font = `italic 900 ${size}px "Barlow Condensed", Impact, "Arial Narrow", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeStyle = ink;
    g.lineWidth = 12;
    g.strokeText(t, 0, y);
    g.fillStyle = fill;
    g.fillText(t, 0, y);
  };
  if (id === 'first-km') {
    label('1K', 118, 6, snow);
    g.fillStyle = snow;
    g.beginPath();
    g.moveTo(-56, -88);
    g.lineTo(-56, -40);
    g.moveTo(-56, -88);
    g.lineTo(-6, -74);
    g.lineTo(-56, -56);
    g.strokeStyle = ink;
    g.lineWidth = 8;
    g.stroke();
    g.fill();
  } else if (id === 'night-rider') {
    g.fillStyle = snow;
    g.beginPath();
    g.arc(-6, 0, 62, 0, 7);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(22, -14, 56, 0, 7);
    g.fill();
    g.fillStyle = '#ffc43d';
    for (const [x, y, r] of [[50, 36, 8], [72, -40, 6], [34, -70, 7]]) {
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    }
  } else if (id === 'double-spin') {
    g.strokeStyle = snow;
    g.lineWidth = 16;
    g.beginPath();
    g.arc(0, 0, 60, 0.4, 5.2);
    g.stroke();
    g.fillStyle = snow;
    g.beginPath();
    g.moveTo(66, -34);
    g.lineTo(96, -2);
    g.lineTo(46, 6);
    g.closePath();
    g.fill();
    label('720', 66, 4, snow);
  } else if (id === 'gate-master') {
    for (const [x, c] of [[-52, '#ff5b1f'], [52, '#f3f8ff']]) {
      g.strokeStyle = ink;
      g.lineWidth = 14;
      g.beginPath();
      g.moveTo(x, 70);
      g.lineTo(x, -66);
      g.stroke();
      g.strokeStyle = snow;
      g.lineWidth = 7;
      g.stroke();
      g.fillStyle = c;
      g.strokeStyle = ink;
      g.lineWidth = 6;
      g.beginPath();
      if (x < 0) {
        g.moveTo(x, -66);
        g.lineTo(x + 54, -44);
        g.lineTo(x, -22);
      } else {
        g.moveTo(x, -66);
        g.lineTo(x - 54, -66);
        g.lineTo(x - 54, -22);
        g.lineTo(x, -22);
      }
      g.closePath();
      g.fill();
      g.stroke();
    }
    label('x10', 56, 50, snow);
  } else if (id === 'collector') {
    g.fillStyle = '#ffc43d';
    g.strokeStyle = ink;
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(-26, -66);
    g.lineTo(26, -66);
    g.lineTo(66, 40);
    g.lineTo(-66, 40);
    g.closePath();
    g.fillStyle = snow;
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(0, 56, 17, 0, 7);
    g.fillStyle = '#b97a14';
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(0, -76, 14, Math.PI, 0);
    g.stroke();
  } else {
    g.fillStyle = snow;
    g.strokeStyle = ink;
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(0, -86);
    g.lineTo(66, -60);
    g.lineTo(60, 14);
    g.quadraticCurveTo(46, 60, 0, 86);
    g.quadraticCurveTo(-46, 60, -60, 14);
    g.lineTo(-66, -60);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = col;
    g.fillRect(-9, -60, 18, 112);
    g.fillRect(-40, -18, 80, 18);
  }
}
