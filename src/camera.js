// The chase camera: lags behind the sled, banks into turns, widens with speed, shakes from decaying trauma.

import * as THREE from 'three';
import { groundY, centre } from './track.js';
import { clamp } from './rng.js';

const _look = new THREE.Vector3();

export function createCameraRig(camera) {
  const rig = {
    lat: 0,
    y: 0,
    fov: 62,
    trauma: 0,
    t: 0,
    roll: 0,
    reduced: false,
    boostKick: 0,
    orbitA: 0.6,
    aspect: 16 / 9,
    portraitT: 0,
    setAspect(a) {
      rig.aspect = a;
      rig.portraitT = clamp((1.6 - a) / 1.1, 0, 1);
    },
    addTrauma(v) {
      if (!rig.reduced) rig.trauma = Math.min(1, rig.trauma + v);
    },
    snap(sim, mode = 'play') {
      rig.lat = sim.x;
      rig.y = groundY(sim.d - 9, sim.x) + 4;
      rig.fov = baseFov();
    },
    /** mode: 'play' | 'title' | 'crash'. */
    follow(dt, sim, mode = 'play') {
      rig.t += dt;
      const pt = rig.portraitT;
      const title = mode === 'title';
      const back = (title ? 7.2 : 7.4) + 3.2 * pt + sim.v * 0.04;
      const height = (title ? 2.6 : 3.5) + 1.9 * pt + Math.min(1.2, sim.hy * 0.25);
      const ahead = (title ? 12 : 13) + 6 * pt;
      const side = title ? -2.6 * (1 - pt * 0.7) : 0;
      const camD = sim.d - back;
      const k = 1 - Math.exp(-(mode === 'crash' ? 2.2 : 5.5) * dt);
      rig.lat += (sim.x * 0.8 + side - rig.lat) * k;
      const ty = groundY(camD, rig.lat) + height + sim.hy * 0.4;
      rig.y += (ty - rig.y) * (1 - Math.exp(-9 * dt));
      // shake: smooth sines scaled by trauma squared
      const sh = rig.trauma * rig.trauma;
      const st = rig.t;
      const sx = Math.sin(st * 41) * sh * 0.32;
      const sy = Math.sin(st * 53 + 1.3) * sh * 0.26;
      const sr = Math.sin(st * 37 + 2.1) * sh * 0.05;
      rig.trauma = Math.max(0, rig.trauma - dt * 1.5);
      camera.position.set(centre(camD) + rig.lat + sx, rig.y + sy, -camD);
      const lookD = sim.d + ahead;
      _look.set(centre(lookD) + sim.x * 0.8 + side * 1.1, groundY(lookD, sim.x) + 1.1 + sim.hy * 0.45, -lookD);
      camera.lookAt(_look);
      const bank = rig.reduced ? 0 : -sim.vx * 0.0055 - sim.steerIn * 0.012;
      rig.roll += (bank - rig.roll) * (1 - Math.exp(-6 * dt));
      camera.rotateZ(rig.roll + sr);
      // field of view
      const speedK = clamp((sim.v - 14) / 25, 0, 1);
      const boost = sim.boost > 0 ? 1 : 0;
      rig.boostKick += (boost - rig.boostKick) * (1 - Math.exp(-(boost ? 9 : 3) * dt));
      const kick = rig.reduced ? 0 : speedK * 9 + rig.boostKick * 11;
      const target = baseFov() + kick;
      rig.fov += (target - rig.fov) * (1 - Math.exp(-5 * dt));
      if (Math.abs(camera.fov - rig.fov) > 0.03) {
        camera.fov = rig.fov;
        camera.updateProjectionMatrix();
      }
    },
    /** Orbit a point (the garage). */
    orbit(dt, p, radius = 7.4) {
      rig.t += dt;
      rig.orbitA += dt * 0.5;
      const r = radius + 1.5 * rig.portraitT;
      camera.position.set(p[0] + Math.cos(rig.orbitA) * r, p[1] + 2.5 + rig.portraitT * 1.5, p[2] + Math.sin(rig.orbitA) * r);
      camera.lookAt(p[0], p[1] + 0.75, p[2]);
      if (camera.fov !== 42) {
        camera.fov = 42 + 14 * rig.portraitT;
        camera.updateProjectionMatrix();
      }
      rig.fov = camera.fov;
    },
  };
  function baseFov() {
    return 62 + 22 * rig.portraitT;
  }
  return rig;
}
