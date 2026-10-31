// Particles, falling snow, sparkles and the trail behind the sled.

import * as THREE from 'three';
import { hashUnit } from './rng.js';

const PARTICLE_VS = `
attribute float size;
attribute float alpha;
attribute vec3 color;
varying float vAlpha;
varying vec3 vColor;
uniform float scale;
void main() {
  vAlpha = alpha;
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FS = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.15, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

export class Particles {
  constructor(max, { additive = false } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.sizeBase = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.aSize = new Float32Array(max);
    this.aAlpha = new Float32Array(max);
    this.aColor = new Float32Array(max * 3);
    this.cur = 0;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.aColor, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      uniforms: { scale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setScale(h) {
    this.mat.uniforms.scale.value = h * 0.7;
  }

  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, grav = 6, drag = 0.4) {
    const i = this.cur;
    this.cur = (this.cur + 1) % this.max;
    const j = i * 3;
    this.pos[j] = x;
    this.pos[j + 1] = y;
    this.pos[j + 2] = z;
    this.vel[j] = vx;
    this.vel[j + 1] = vy;
    this.vel[j + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.sizeBase[i] = size;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.aColor[j] = r;
    this.aColor[j + 1] = g;
    this.aColor[j + 2] = b;
  }

  update(dt) {
    const { pos, vel, life, maxLife } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) {
        this.aAlpha[i] = 0;
        this.aSize[i] = 0;
        continue;
      }
      life[i] -= dt;
      const j = i * 3;
      const k = Math.exp(-this.drag[i] * dt);
      vel[j] *= k;
      vel[j + 1] = vel[j + 1] * k - this.grav[i] * dt;
      vel[j + 2] *= k;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      const f = Math.max(0, life[i] / maxLife[i]);
      this.aAlpha[i] = Math.min(1, f * 2.2) * 0.9;
      this.aSize[i] = this.sizeBase[i] * (0.6 + 0.6 * (1 - f));
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
  }
}

/** Falling snow around the camera, moved entirely on the GPU. */
export class SnowFall {
  constructor(count = 700) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = hashUnit(i, 1) * 60 - 30;
      pos[i * 3 + 1] = hashUnit(i, 2) * 30;
      pos[i * 3 + 2] = hashUnit(i, 3) * 80 - 70;
      seed[i] = hashUnit(i, 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, amount: { value: 0 }, scale: { value: 600 }, speed: { value: 20 } },
      vertexShader: `
        attribute float seed;
        uniform float time; uniform vec3 cam; uniform float amount; uniform float scale; uniform float speed;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - time * (2.5 + seed * 2.0), 30.0);
          p.x += sin(time * 0.7 + seed * 40.0) * 1.2;
          p.z = mod(p.z + speed * time * 0.0, 80.0) - 70.0;
          vec3 w = vec3(cam.x + p.x, cam.y - 10.0 + p.y, cam.z + p.z);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_PointSize = (0.16 + seed * 0.14) * scale / max(0.1, -mv.z);
          vA = step(seed, amount) * smoothstep(0.0, 6.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5 || vA <= 0.0) discard;
          gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.1, d) * 0.85 * vA);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }
  update(t, camPos, amount, h) {
    this.mat.uniforms.time.value = t;
    this.mat.uniforms.cam.value.copy(camPos);
    this.mat.uniforms.amount.value = amount;
    this.mat.uniforms.scale.value = h * 0.7;
    this.points.visible = amount > 0.01;
  }
}

/** Glints on the snow ahead of the sled. */
export class Sparkles {
  constructor(count, groundFn) {
    this.count = count;
    this.groundFn = groundFn;
    this.dd = new Float32Array(count);
    this.xx = new Float32Array(count);
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    this.pos = pos;
    for (let i = 0; i < count; i++) phase[i] = hashUnit(i, 9) * 6.28;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, scale: { value: 600 }, strength: { value: 1 } },
      vertexShader: `
        attribute float phase; uniform float time; uniform float scale; uniform float strength; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = pow(max(0.0, sin(time * 3.0 + phase * 5.0)), 6.0);
          vA = tw * strength * smoothstep(8.0, 20.0, -mv.z);
          gl_PointSize = (0.3 + tw * 0.35) * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float cross = max(0.0, 1.0 - min(abs(c.x), abs(c.y)) * 9.0) * (1.0 - d * 1.8);
          float a = (smoothstep(0.5, 0.0, d) * 0.7 + cross) * vA;
          if (a < 0.02) discard;
          gl_FragColor = vec4(1.0, 0.97, 0.9, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.ready = false;
  }
  update(t, d, h, strength) {
    this.mat.uniforms.time.value = t;
    this.mat.uniforms.scale.value = h * 0.7;
    this.mat.uniforms.strength.value = strength;
    const n = this.count;
    let moved = false;
    for (let i = 0; i < n; i++) {
      if (!this.ready || this.dd[i] < d - 12 || this.dd[i] > d + 150) {
        this.dd[i] = d + (this.ready ? 60 + Math.random() * 90 : -10 + Math.random() * 140);
        this.xx[i] = (Math.random() * 2 - 1) * 15;
        const p = this.groundFn(this.dd[i], this.xx[i]);
        this.pos[i * 3] = p[0];
        this.pos[i * 3 + 1] = p[1] + 0.08;
        this.pos[i * 3 + 2] = p[2];
        moved = true;
      }
    }
    this.ready = true;
    if (moved) this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Two thin runner marks laid on the snow behind the sled. */
export class Trail {
  constructor(n = 90) {
    this.n = n;
    this.pts = new Float32Array(n * 6); // per sample: left xyz, right xyz
    this.on = new Uint8Array(n);
    this.head = 0;
    this.count = 0;
    const pos = new Float32Array(n * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = new THREE.MeshBasicMaterial({ color: 0x7f9bd0, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.lastX = 1e9;
    this.lastZ = 1e9;
  }
  /** Add a sample if the sled moved enough: [x,y,z] of the sled and its right vector (rx, rz). */
  push(x, y, z, rx, rz, onGround, half = 0.34) {
    const dx = x - this.lastX;
    const dz = z - this.lastZ;
    if (dx * dx + dz * dz < 0.7 * 0.7) return;
    this.lastX = x;
    this.lastZ = z;
    const i = this.head;
    const j = i * 6;
    this.pts[j] = x - rx * half;
    this.pts[j + 1] = y + 0.05;
    this.pts[j + 2] = z - rz * half;
    this.pts[j + 3] = x + rx * half;
    this.pts[j + 4] = y + 0.05;
    this.pts[j + 5] = z + rz * half;
    this.on[i] = onGround ? 1 : 0;
    this.head = (this.head + 1) % this.n;
    this.count = Math.min(this.n, this.count + 1);
    this.rebuild();
  }
  rebuild() {
    const pos = this.geo.attributes.position.array;
    if (!this.count) return;
    // newest first; samples past the end repeat the oldest, air samples collapse to a point
    for (let k = 0; k < this.n; k++) {
      const src = (this.head - 1 - Math.min(k, this.count - 1) + this.n * 2) % this.n;
      const s = src * 6;
      const o = k * 6;
      const grounded = this.on[src] === 1 && k < this.count;
      for (let q = 0; q < 3; q++) {
        pos[o + q] = this.pts[s + q];
        pos[o + 3 + q] = grounded ? this.pts[s + 3 + q] : this.pts[s + q];
      }
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  reset() {
    this.count = 0;
    this.head = 0;
    this.lastX = 1e9;
    this.lastZ = 1e9;
    this.geo.attributes.position.array.fill(0);
    this.geo.attributes.position.needsUpdate = true;
  }
}

/** Speed streaks over the screen edges, on a 2D canvas. */
export class SpeedLines {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.lines = Array.from({ length: 36 }, (_, i) => ({ a: hashUnit(i, 5) * 6.283, r: 0.3 + hashUnit(i, 6) * 0.7, t: hashUnit(i, 7), l: 0.1 + hashUnit(i, 8) * 0.25 }));
    this.w = 0;
    this.h = 0;
  }
  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.c.width = Math.round(w * dpr);
    this.c.height = Math.round(h * dpr);
    this.dpr = dpr;
  }
  draw(dt, amount, color = '255,255,255') {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (amount < 0.02) return;
    const cx = this.w / 2;
    const cy = this.h * 0.46;
    const R = Math.hypot(this.w, this.h) * 0.5;
    ctx.lineCap = 'round';
    for (const l of this.lines) {
      l.t += dt * (1.6 + amount * 2.4);
      if (l.t > 1) {
        l.t -= 1;
        l.a = Math.random() * 6.283;
        l.r = 0.38 + Math.random() * 0.62;
      }
      const r0 = R * (0.34 + l.t * 0.75) * (0.7 + l.r * 0.3);
      const r1 = r0 + R * l.l * (0.4 + l.t) * amount;
      const a = Math.sin(l.t * Math.PI) * amount * 0.5;
      ctx.strokeStyle = `rgba(${color},${a.toFixed(3)})`;
      ctx.lineWidth = 1 + l.t * 3 * amount;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0 * 0.8);
      ctx.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1 * 0.8);
      ctx.stroke();
    }
  }
}
