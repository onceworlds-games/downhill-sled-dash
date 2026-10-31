// Procedural low-poly models: pines, boulders, sleds and the rider. No files.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng.js';

export const lam = (hex, o = {}) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...o });

function tint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function moved(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(m);
  return geo;
}
export function merged(parts) {
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

/** A snowy pine, 4.5 m tall at scale 1. Vertex colours; base at y = 0. */
export function pineGeometry(variant = 0) {
  const parts = [];
  const greens = [0x2a7a58, 0x25704f, 0x318a62];
  const green = greens[variant % 3];
  parts.push(tint(moved(new THREE.CylinderGeometry(0.16, 0.24, 1.1, 5), 0, 0.55, 0), 0x5a3b2a));
  const tiers = [
    [1.35, 1.6, 1.0],
    [1.1, 1.5, 1.85],
    [0.82, 1.4, 2.65],
    [0.5, 1.15, 3.4],
  ];
  tiers.forEach(([r, h, y], i) => {
    const c = new THREE.Color(green).lerp(new THREE.Color(0x5cb887), i * 0.12);
    parts.push(tint(moved(new THREE.ConeGeometry(r, h, 7), 0, y + h / 2, 0), c));
    // snow resting on the tier
    parts.push(tint(moved(new THREE.ConeGeometry(r * 0.72, h * 0.58, 7), 0, y + h * 0.7, 0), 0xf4f9ff));
  });
  return merged(parts);
}

/** A boulder with snow on top, about 2 m wide at scale 1. */
export function rockGeometry(seed = 1) {
  const rng = mulberry32(seed);
  const base = new THREE.IcosahedronGeometry(1, 0);
  const pos = base.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.78 + rng() * 0.4;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.78, pos.getZ(i) * k);
  }
  // the vertices are shared by faces of an indexed icosahedron only after merging; Icosahedron is already non-indexed
  const g = base.index ? base.toNonIndexed() : base;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const rock = new THREE.Color(0xb7c3da);
  const snow = new THREE.Color(0xf4f9ff);
  const nrm = g.attributes.normal;
  for (let f = 0; f < n; f += 3) {
    const ny = (nrm.getY(f) + nrm.getY(f + 1) + nrm.getY(f + 2)) / 3;
    const c = ny > 0.5 ? snow : rock.clone().multiplyScalar(0.85 + ny * 0.3);
    for (let k = 0; k < 3; k++) {
      col[(f + k) * 3] = c.r;
      col[(f + k) * 3 + 1] = c.g;
      col[(f + k) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, 0.35, 0);
  return g;
}

/** A log lying across x, unit length (scale x to stretch). */
export function logGeometry() {
  const parts = [];
  parts.push(tint(moved(new THREE.CylinderGeometry(0.46, 0.46, 1, 8), 0, 0.46, 0, 0, 0, Math.PI / 2), 0x7a5236));
  parts.push(tint(new THREE.CylinderGeometry(0.47, 0.47, 0.98, 8, 1).rotateZ(Math.PI / 2).scale(1, 0.3, 1).translate(0, 0.8, 0), 0xf4f9ff));
  return merged(parts);
}

/** A fence panel 2 m wide: two posts and two rails. */
export function fenceGeometry() {
  const parts = [];
  for (const x of [-0.9, 0.9]) parts.push(tint(moved(new THREE.BoxGeometry(0.16, 1.7, 0.16), x, 0.85, 0), 0x6b4a33));
  for (const y of [0.55, 1.25]) parts.push(tint(moved(new THREE.BoxGeometry(2, 0.16, 0.1), 0, y, 0), 0xc9a06a));
  parts.push(tint(moved(new THREE.BoxGeometry(2.0, 0.07, 0.2), 0, 1.72, 0), 0xf4f9ff));
  parts.push(tint(moved(new THREE.BoxGeometry(0.1, 1.0, 0.07), 0, 0.9, 0.0, 0, 0, 0.0), 0xc9a06a));
  return merged(parts);
}

/** A launch ramp, 1 x 1 x 1 (scale to width, height, length): a snow wedge with timber sides. Front (low end) at -z? No: low end at +z, lip at -z. */
export function rampGeometry() {
  // wedge: x in [-.5,.5], y in [0,1], z from +0.5 (start, y=0) to -0.5 (lip, y=1)
  const v = [
    [-0.5, 0, 0.5], [0.5, 0, 0.5], [-0.5, 0, -0.5], [0.5, 0, -0.5],
    [-0.5, 1, -0.5], [0.5, 1, -0.5],
  ];
  const tri = (a, b, c, col) => ({ a, b, c, col });
  const snow = 0xeaf3ff;
  const wood = 0xc4813f;
  const dark = 0x6b4a33;
  const faces = [
    tri(0, 1, 5, snow), tri(0, 5, 4, snow), // top slope
    tri(2, 4, 5, dark), tri(2, 5, 3, dark), // back wall
    tri(0, 4, 2, wood), // left side
    tri(1, 3, 5, wood), // right side
  ];
  const pos = [];
  const col = [];
  for (const f of faces) {
    const c = new THREE.Color(f.col);
    for (const i of [f.a, f.b, f.c]) {
      pos.push(...v[i]);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // orange edge stripes along the lip
  const stripe = tint(moved(new THREE.BoxGeometry(1.0, 0.08, 0.12), 0, 0.98, -0.47), 0xff5b1f);
  return merged([g, stripe]);
}

/** A brass cowbell, about 0.6 m. */
export function bellGeometry() {
  const parts = [];
  parts.push(tint(moved(new THREE.CylinderGeometry(0.17, 0.3, 0.46, 7), 0, 0.1, 0), 0xffc43d));
  parts.push(tint(moved(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 7), 0, 0.34, 0), 0xfff0b0));
  parts.push(tint(moved(new THREE.TorusGeometry(0.1, 0.03, 4, 8), 0, 0.42, 0, Math.PI / 2, 0, 0), 0xb97a14));
  parts.push(tint(moved(new THREE.SphereGeometry(0.07, 5, 4), 0, -0.14, 0), 0xb97a14));
  const g = merged(parts);
  g.scale(1.25, 1.25, 1.25);
  g.translate(0, 0.45, 0);
  return g;
}

export function pennantGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.55, 0, 0, -0.55, 0, 1.5, 0, 0], 3));
  g.computeVertexNormals();
  return g;
}
export function bannerFlagGeometry() {
  const g = new THREE.PlaneGeometry(1.15, 0.85);
  g.translate(0.575, 0, 0);
  return g;
}

// ---- sleds and the rider ----

const SLED_SPEC = {
  wood: { pose: 'sit', len: 2 },
  redline: { pose: 'sit', len: 2.4 },
  ring: { pose: 'lounge', len: 1.6 },
  steel: { pose: 'low', len: 2.4 },
  skimmer: { pose: 'stand', len: 1.8 },
  aurum: { pose: 'sit', len: 2.1 },
};

function addTo(group, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  group.add(m);
  return m;
}
const box = (w, h, l) => new THREE.BoxGeometry(w, h, l);

export function buildSledBody(id) {
  const g = new THREE.Group();
  const steel = lam(0x4b586d);
  const dark = lam(0x1b2433);
  const orange = lam(0xff5b1f);
  const white = lam(0xf3f8ff);
  const wood1 = lam(0xc99056);
  const wood2 = lam(0xb07a42);
  if (id === 'wood') {
    for (const x of [-0.34, 0.34]) {
      addTo(g, box(0.07, 0.1, 1.9), steel, x, 0.08, 0);
      addTo(g, new THREE.TorusGeometry(0.2, 0.04, 5, 8, Math.PI * 0.75), steel, x, 0.26, -1.05, 0, Math.PI / 2, 0).rotation.set(0, Math.PI / 2, Math.PI * 0.12);
      addTo(g, box(0.06, 0.26, 0.06), dark, x, 0.2, -0.5);
      addTo(g, box(0.06, 0.26, 0.06), dark, x, 0.2, 0.55);
    }
    [-0.6, -0.2, 0.2, 0.6].forEach((z, i) => addTo(g, box(0.92, 0.07, 0.34), i % 2 ? wood2 : wood1, 0, 0.34, z));
    addTo(g, box(0.9, 0.08, 0.08), orange, 0, 0.38, -0.82);
    addTo(g, new THREE.TorusGeometry(0.22, 0.015, 3, 12), lam(0xe8d9b0), 0, 0.5, -1.1, Math.PI / 2.4, 0, 0);
  } else if (id === 'redline') {
    const red = lam(0xd92e3a);
    addTo(g, box(0.82, 0.12, 2.0), red, 0, 0.2, 0.1);
    addTo(g, box(0.82, 0.12, 0.7), red, 0, 0.36, -1.18, -0.5, 0, 0);
    addTo(g, box(0.1, 0.16, 2.3), white, -0.42, 0.28, 0);
    addTo(g, box(0.1, 0.16, 2.3), white, 0.42, 0.28, 0);
    addTo(g, box(0.5, 0.02, 1.9), white, 0, 0.27, 0.1);
    for (const x of [-0.25, 0.25]) addTo(g, box(0.05, 0.06, 2.2), dark, x, 0.07, 0.05);
    addTo(g, box(0.9, 0.06, 0.1), orange, 0, 0.3, -1.45, -0.5, 0, 0);
  } else if (id === 'ring') {
    const yel = lam(0xf2b134);
    addTo(g, new THREE.TorusGeometry(0.66, 0.3, 6, 12), yel, 0, 0.32, 0, Math.PI / 2, 0, 0);
    addTo(g, new THREE.TorusGeometry(0.66, 0.31, 6, 12, Math.PI / 3), orange, 0, 0.32, 0, Math.PI / 2, 0, 0.3);
    addTo(g, new THREE.TorusGeometry(0.66, 0.31, 6, 12, Math.PI / 3), orange, 0, 0.32, 0, Math.PI / 2, 0, Math.PI + 0.3);
    addTo(g, new THREE.TorusGeometry(0.12, 0.035, 4, 8), dark, -0.92, 0.5, 0, 0, Math.PI / 2, 0);
    addTo(g, new THREE.TorusGeometry(0.12, 0.035, 4, 8), dark, 0.92, 0.5, 0, 0, Math.PI / 2, 0);
  } else if (id === 'steel') {
    const hull = lam(0x9fb0c7);
    addTo(g, new THREE.CylinderGeometry(0.42, 0.34, 1.9, 8), hull, 0, 0.5, 0.1, Math.PI / 2, 0, 0);
    addTo(g, new THREE.ConeGeometry(0.42, 0.9, 8), hull, 0, 0.5, -1.25, -Math.PI / 2, 0, 0);
    addTo(g, box(0.1, 0.5, 1.6), orange, 0, 0.78, 0.0).scale.set(1, 0.18, 1);
    addTo(g, box(0.6, 0.12, 0.7), dark, 0, 0.88, 0.25);
    for (const x of [-0.38, 0.38]) addTo(g, box(0.06, 0.08, 2.2), steel, x, 0.1, 0);
    addTo(g, box(0.12, 0.2, 0.12), steel, -0.38, 0.2, 0.7);
    addTo(g, box(0.12, 0.2, 0.12), steel, 0.38, 0.2, 0.7);
    addTo(g, box(0.12, 0.2, 0.12), steel, -0.38, 0.2, -0.6);
    addTo(g, box(0.12, 0.2, 0.12), steel, 0.38, 0.2, -0.6);
  } else if (id === 'skimmer') {
    const deck = lam(0xff5b1f);
    addTo(g, box(0.36, 0.06, 1.5), deck, 0, 0.12, 0);
    addTo(g, new THREE.CylinderGeometry(0.18, 0.18, 0.06, 8), deck, 0, 0.12, -0.75);
    addTo(g, new THREE.CylinderGeometry(0.18, 0.18, 0.06, 8), deck, 0, 0.12, 0.75);
    addTo(g, box(0.24, 0.025, 1.4), white, 0, 0.16, 0);
    addTo(g, box(0.4, 0.08, 0.14), dark, 0, 0.19, -0.3);
    addTo(g, box(0.4, 0.08, 0.14), dark, 0, 0.19, 0.35);
    addTo(g, box(0.1, 0.1, 0.1), steel, 0, 0.22, -0.3);
  } else {
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc43d, metalness: 0.85, roughness: 0.28, emissive: 0x5a3a00, emissiveIntensity: 0.6, flatShading: true });
    const gem = new THREE.MeshStandardMaterial({ color: 0xff5b1f, emissive: 0xff3b00, emissiveIntensity: 0.9, flatShading: true });
    for (const x of [-0.36, 0.36]) {
      addTo(g, box(0.08, 0.12, 2.0), gold, x, 0.08, 0);
      addTo(g, new THREE.TorusGeometry(0.24, 0.05, 5, 8, Math.PI * 0.8), gold, x, 0.28, -1.12).rotation.set(0, Math.PI / 2, Math.PI * 0.1);
    }
    addTo(g, box(1.0, 0.1, 1.7), gold, 0, 0.3, 0);
    addTo(g, box(0.8, 0.04, 1.4), lam(0x7a1f1f), 0, 0.37, 0);
    addTo(g, box(1.04, 0.2, 0.1), gold, 0, 0.42, 0.85);
    addTo(g, new THREE.OctahedronGeometry(0.14), gem, 0, 0.55, 0.85);
    addTo(g, new THREE.OctahedronGeometry(0.1), gem, 0, 0.42, -0.9);
  }
  return g;
}

/**
 * Rider and sled together. group faces -z, base at y = 0.
 * Returns { group, update(t, speed, steer, vx, air, wob) } with the rider's parts animated by it.
 */
export function buildSled(id, outfit) {
  const spec = SLED_SPEC[id] ?? SLED_SPEC.wood;
  const root = new THREE.Group();
  const body = buildSledBody(id);
  root.add(body);
  const rider = new THREE.Group();
  root.add(rider);
  const jacket = lam(outfit.jacket);
  const pants = lam(0x1e2a3d);
  const skin = lam(0xf0b48a);
  const helmet = lam(outfit.helmet);
  const glove = lam(0x10151f);
  const scarfMat = lam(outfit.scarf, { side: THREE.DoubleSide });
  const lens = new THREE.MeshStandardMaterial({ color: 0x9fd6ff, metalness: 0.9, roughness: 0.1, emissive: 0x3a7bd0, emissiveIntensity: 0.5 });
  const strap = lam(0x0e1a2b);

  // pose numbers: hip position, torso lean (negative = forward), leg style
  const P = {
    sit: { hip: [0, 0.46, 0.22], lean: -0.22, legs: 'fwd', yaw: 0 },
    lounge: { hip: [0, 0.42, 0.12], lean: 0.35, legs: 'fwd', yaw: 0 },
    low: { hip: [0, 0.72, 0.4], lean: 0.55, legs: 'hidden', yaw: 0 },
    stand: { hip: [0, 0.78, 0.0], lean: -0.12, legs: 'stand', yaw: Math.PI / 2 },
  }[spec.pose];

  const hip = new THREE.Group();
  hip.position.set(...P.hip);
  hip.rotation.y = P.yaw;
  rider.add(hip);

  const torsoPivot = new THREE.Group();
  torsoPivot.rotation.x = P.lean;
  hip.add(torsoPivot);
  addTo(torsoPivot, box(0.56, 0.6, 0.34), jacket, 0, 0.3, 0);
  addTo(torsoPivot, box(0.58, 0.12, 0.36), strap, 0, 0.04, 0);
  addTo(torsoPivot, box(0.3, 0.28, 0.08), lam(0xf3f8ff), 0, 0.28, -0.19).scale.set(1, 1, 1);

  const neck = new THREE.Group();
  neck.position.set(0, 0.68, 0);
  torsoPivot.add(neck);
  const head = new THREE.Group();
  neck.add(head);
  addTo(head, new THREE.SphereGeometry(0.17, 8, 6), skin, 0, 0.1, 0);
  const shell = addTo(head, new THREE.SphereGeometry(0.235, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.62), helmet, 0, 0.14, 0.01);
  shell.castShadow = true;
  addTo(head, box(0.34, 0.13, 0.12), lens, 0, 0.13, -0.17);
  addTo(head, box(0.36, 0.05, 0.1), strap, 0, 0.2, -0.17);

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  for (const [a, s] of [[armL, -1], [armR, 1]]) {
    a.position.set(0.34 * s, 0.56, 0);
    torsoPivot.add(a);
    addTo(a, box(0.16, 0.42, 0.16), jacket, 0, -0.2, 0);
    const fore = new THREE.Group();
    fore.position.set(0, -0.42, 0);
    a.add(fore);
    addTo(fore, box(0.14, 0.38, 0.14), jacket, 0, -0.18, 0);
    addTo(fore, box(0.17, 0.14, 0.17), glove, 0, -0.4, 0);
    a.userData.fore = fore;
  }
  armL.rotation.set(-1.0, 0, -0.18);
  armR.rotation.set(-1.0, 0, 0.18);
  armL.userData.fore.rotation.x = -0.7;
  armR.userData.fore.rotation.x = -0.7;
  if (spec.pose === 'stand') {
    armL.rotation.set(0.1, 0, -1.1);
    armR.rotation.set(0.1, 0, 1.1);
    armL.userData.fore.rotation.x = -0.2;
    armR.userData.fore.rotation.x = -0.2;
  }

  const legPivots = [];
  if (P.legs !== 'hidden') {
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0.15 * s, 0, 0);
      hip.add(leg);
      if (P.legs === 'fwd') {
        leg.rotation.x = spec.pose === 'lounge' ? 1.2 : 1.35;
        addTo(leg, box(0.2, 0.5, 0.2), pants, 0, -0.25, 0);
        const shin = new THREE.Group();
        shin.position.set(0, -0.5, 0);
        shin.rotation.x = spec.pose === 'lounge' ? -0.1 : -0.55;
        leg.add(shin);
        addTo(shin, box(0.19, 0.46, 0.19), pants, 0, -0.23, 0);
        addTo(shin, box(0.22, 0.14, 0.34), strap, 0, -0.5, -0.07);
      } else {
        leg.rotation.x = 0.15;
        leg.rotation.z = 0.05 * s;
        addTo(leg, box(0.2, 0.42, 0.2), pants, 0, -0.21, 0);
        const shin = new THREE.Group();
        shin.position.set(0, -0.42, 0);
        shin.rotation.x = -0.3;
        leg.add(shin);
        addTo(shin, box(0.19, 0.4, 0.19), pants, 0, -0.2, 0);
        addTo(shin, box(0.22, 0.14, 0.34), strap, 0, -0.43, -0.06);
      }
      legPivots.push(leg);
    }
    if (spec.pose === 'stand') {
      // hips over the board: legs reach the deck
      hip.position.y = 0.92;
    }
  }

  // the scarf: a chain of flaps behind the neck, driven by speed in update()
  const scarf = [];
  addTo(neck, new THREE.TorusGeometry(0.17, 0.06, 4, 8), scarfMat, 0, -0.02, 0, Math.PI / 2, 0, 0);
  for (let i = 0; i < 6; i++) {
    const m = addTo(torsoPivot, box(0.13, 0.03, 0.2 - i * 0.01), scarfMat, 0, 0.66, 0.2);
    m.castShadow = false;
    scarf.push(m);
  }

  const shadowish = { x: 0 };
  const api = {
    group: root,
    spec,
    rider,
    hip,
    head,
    torsoPivot,
    armL,
    armR,
    scarf,
    update(t, speed, steer, vx, air, wob) {
      const k = Math.min(1, speed / 38);
      // lean into the turn
      const roll = -vx * 0.028;
      rider.rotation.z += (roll - rider.rotation.z) * 0.2;
      torsoPivot.rotation.z = -steer * 0.1;
      head.rotation.y = -steer * 0.35 + (wob ? Math.sin(t * 40) * 0.1 : 0);
      const arm = air ? -1.7 : -1.0 - k * 0.2;
      if (spec.pose !== 'stand') {
        armL.rotation.x = arm + steer * 0.18;
        armR.rotation.x = arm - steer * 0.18;
      } else {
        armL.rotation.z = -1.1 - steer * 0.3 - (air ? 0.3 : 0);
        armR.rotation.z = 1.1 - steer * 0.3 + (air ? 0.3 : 0);
      }
      // scarf flies back and lifts with speed
      for (let i = 0; i < scarf.length; i++) {
        const f = i + 1;
        const flap = Math.sin(t * (16 + k * 14) + f * 0.9) * (0.04 + k * 0.05) * f;
        scarf[i].position.set(flap - vx * 0.012 * f, 0.66 + (0.02 + k * 0.1) * f * 0.7, 0.22 + f * (0.16 + k * 0.08));
        scarf[i].rotation.set(-0.15 - k * 0.3, flap * 1.5, flap);
      }
    },
  };
  return api;
}
