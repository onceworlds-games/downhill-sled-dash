// The mountain in three.js: sky, terrain, instanced hazards and scenery, lights, fog. It reads a course and draws it.

import * as THREE from 'three';
import { HALF, POWERS } from './config.js';
import { centre, centreSlope, groundY, slopeDY } from './track.js';
import { mixColor } from './tod.js';
import { hashUnit, hash2, clamp } from './rng.js';
import { moverPos, moverDone } from './sim.js';
import { lam, pineGeometry, rockGeometry, logGeometry, fenceGeometry, rampGeometry, bellGeometry, pennantGeometry, bannerFlagGeometry } from './models.js';

const SEG_LEN = 48;
const SEG_ROWS = 16;
const X_COLS = [-52, -40, -31, -24, -19, -15.5, -13, -10, -6.7, -3.4, 0, 3.4, 6.7, 10, 13, 15.5, 19, 24, 31, 40, 52];
const NSEG = 9;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function glowTexture(inner = 'rgba(255,230,170,1)') {
  return canvasTex(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, inner);
    r.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)'));
    r.addColorStop(1, inner.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });
}

export function iconTexture(type) {
  return canvasTex(128, 128, (g, w) => {
    const col = '#' + POWERS[type].color.toString(16).padStart(6, '0');
    g.translate(64, 64);
    g.fillStyle = '#0e1a2b';
    g.beginPath();
    g.arc(0, 0, 58, 0, 7);
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = col;
    g.beginPath();
    g.arc(0, 0, 52, 0, 7);
    g.stroke();
    g.fillStyle = col;
    g.strokeStyle = '#f3f8ff';
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (type === 'magnet') {
      g.lineWidth = 17;
      g.strokeStyle = col;
      g.beginPath();
      g.arc(0, -2, 24, Math.PI, 0);
      g.lineTo(24, 22);
      g.moveTo(-24, -2);
      g.lineTo(-24, 22);
      g.stroke();
      g.fillStyle = '#f3f8ff';
      g.fillRect(-33, 14, 18, 12);
      g.fillRect(15, 14, 18, 12);
    } else if (type === 'shield') {
      g.beginPath();
      g.moveTo(0, -38);
      g.lineTo(32, -26);
      g.lineTo(28, 8);
      g.quadraticCurveTo(22, 28, 0, 40);
      g.quadraticCurveTo(-22, 28, -28, 8);
      g.lineTo(-32, -26);
      g.closePath();
      g.fill();
      g.lineWidth = 5;
      g.stroke();
      g.fillStyle = '#f3f8ff';
      g.fillRect(-4, -26, 8, 52);
    } else if (type === 'boost') {
      g.beginPath();
      g.moveTo(8, -42);
      g.lineTo(-24, 6);
      g.lineTo(-2, 6);
      g.lineTo(-10, 42);
      g.lineTo(26, -10);
      g.lineTo(4, -10);
      g.closePath();
      g.fill();
      g.lineWidth = 4;
      g.stroke();
    } else {
      g.font = '900 52px "Barlow Condensed", Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = col;
      g.fillText('x2', 0, 4);
      g.lineWidth = 3;
      g.strokeStyle = '#f3f8ff';
      g.strokeText('x2', 0, 4);
    }
  });
}

function bannerTexture(text, sub, bg = '#ff5b1f', fg = '#f3f8ff') {
  return canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(14,26,43,0.9)';
    for (let i = -2; i < 12; i++) {
      g.beginPath();
      g.moveTo(i * 44, 0);
      g.lineTo(i * 44 + 22, 0);
      g.lineTo(i * 44 + 6, h);
      g.lineTo(i * 44 - 16, h);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(14,26,43,0.92)';
    g.fillRect(0, h * 0.18, w, h * 0.64);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `italic 900 ${sub ? 84 : 104}px "Barlow Condensed", Impact, "Arial Narrow", sans-serif`;
    g.fillText(text, w / 2, h * (sub ? 0.42 : 0.52));
    if (sub) {
      g.font = '800 44px "Barlow Condensed", Impact, "Arial Narrow", sans-serif';
      g.fillStyle = '#ffc43d';
      g.fillText(sub, w / 2, h * 0.72);
    }
  });
}

export function createWorld(canvas, { quality = 'high', poster = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality === 'high',
    powerPreference: 'high-performance',
    preserveDrawingBuffer: poster,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x9fb7d9);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe6fb, 30, 340);
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 4200);
  scene.add(camera);

  const world = { renderer, scene, camera, quality, course: null, poster };

  // ---- lights ----
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = quality !== 'low';
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd6ff, 0xe4eefc, 1);
  scene.add(hemi);
  const lamp = new THREE.SpotLight(0xfff0d0, 0, 90, 0.55, 0.7, 1.1);
  scene.add(lamp);
  scene.add(lamp.target);
  const SUN_DIR = new THREE.Vector3();

  function setShadowSize() {
    const size = world.quality === 'low' ? 0 : world.quality === 'medium' ? 1024 : 2048;
    sun.castShadow = size > 0;
    renderer.shadowMap.enabled = size > 0;
    if (size && sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
  }
  setShadowSize();

  // ---- sky ----
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color() },
      hor: { value: new THREE.Color() },
      glowCol: { value: new THREE.Color() },
      glowDir: { value: new THREE.Vector3(-0.3, 0.12, -1).normalize() },
      glowAmt: { value: 0.5 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 top; uniform vec3 hor; uniform vec3 glowCol; uniform vec3 glowDir; uniform float glowAmt;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        float t = pow(clamp(h, 0.0, 1.0), 0.5);
        vec3 c = mix(hor, top, t);
        c = mix(c, hor, smoothstep(0.0, -0.2, vDir.y));
        float g = max(dot(normalize(vDir), glowDir), 0.0);
        c += glowCol * (pow(g, 14.0) * 0.55 + pow(g, 140.0) * 0.9) * glowAmt;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 24, 14), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry();
  {
    const n = 420;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = hashUnit(i, 11) * 6.283;
      const y = 0.06 + hashUnit(i, 12) * 0.94;
      const r = Math.sqrt(1 - y * y);
      p[i * 3] = Math.cos(a) * r * 1900;
      p[i * 3 + 1] = y * 1900;
      p[i * 3 + 2] = Math.sin(a) * r * 1900;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  scene.add(stars);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.3, 'rgba(235,242,255,1)');
    r.addColorStop(0.36, 'rgba(190,210,255,0.35)');
    r.addColorStop(1, 'rgba(160,190,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  }), transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  moon.scale.set(300, 300, 1);
  moon.renderOrder = -8;
  scene.add(moon);

  // ---- mountains ----
  const ridges = [];
  {
    const layers = [
      { z: 850, y: 50, amp: 150, haze: 0.22, seed: 1, w: 2600 },
      { z: 1300, y: 80, amp: 230, haze: 0.42, seed: 2, w: 3600 },
      { z: 1850, y: 110, amp: 330, haze: 0.62, seed: 3, w: 4800 },
    ];
    for (const L of layers) {
      const N = 56;
      const pos = [];
      const col = [];
      const idx = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const x = (u - 0.5) * L.w;
        const n = hashUnit(i, L.seed) * 0.6 + Math.sin(u * 17 + L.seed) * 0.28 + Math.sin(u * 41 + L.seed * 2) * 0.12;
        const hgt = L.amp * (0.35 + 0.65 * Math.abs(n)) * (0.55 + 0.45 * Math.sin(u * 5 + L.seed));
        pos.push(x, -L.z * 0.34, 0, x, L.y * 0.5 - 40 + hgt, 0);
        col.push(0.5, 0.55, 0.65, 1, 1, 1);
        if (i < N) {
          const a = i * 2;
          idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = -7;
      m.frustumCulled = false;
      m.userData = L;
      scene.add(m);
      ridges.push(m);
    }
  }

  // ---- terrain ----
  const NC = X_COLS.length;
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const segs = [];
  function makeSeg() {
    const verts = NC * (SEG_ROWS + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let r = 0; r < SEG_ROWS; r++) {
      for (let c = 0; c < NC - 1; c++) {
        const a = r * NC + c;
        const b = a + 1;
        const cc = a + NC;
        const d = cc + 1;
        // alternate the diagonal for a faceted look
        if ((r + c) % 2 === 0) idx.push(a, b, cc, b, d, cc);
        else idx.push(a, d, cc, a, b, d);
      }
    }
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, terrainMat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.userData.k = -1e9;
    scene.add(mesh);
    return mesh;
  }
  for (let i = 0; i < NSEG; i++) segs.push(makeSeg());
  const snowC = new THREE.Color(0xffffff);
  const shadeC = new THREE.Color(0xc9d9f0);
  function fillSeg(mesh, k) {
    mesh.userData.k = k;
    const pos = mesh.geometry.attributes.position.array;
    const col = mesh.geometry.attributes.color.array;
    for (let r = 0; r <= SEG_ROWS; r++) {
      const d = k * SEG_LEN + (r * SEG_LEN) / SEG_ROWS;
      const cx = centre(d);
      for (let c = 0; c < NC; c++) {
        const x = X_COLS[c];
        const i = (r * NC + c) * 3;
        pos[i] = cx + x;
        pos[i + 1] = groundY(d, x);
        pos[i + 2] = -d;
        const ax = Math.abs(x);
        const t = clamp((ax - HALF) / 30, 0, 1);
        const n = hashUnit(Math.floor(d / 3) * 31 + c, 77);
        const stripe = r % 2 ? 0.985 : 1;
        const k2 = (0.93 + n * 0.07) * stripe;
        _c.copy(snowC).lerp(shadeC, t * 0.7).multiplyScalar(k2);
        col[i] = _c.r;
        col[i + 1] = _c.g;
        col[i + 2] = _c.b;
      }
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.color.needsUpdate = true;
  }

  // ---- instanced scenery and hazards ----
  const treeGeo = [pineGeometry(0)];
  const treeMesh = new THREE.InstancedMesh(treeGeo[0], new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 1100);
  const rockMesh = new THREE.InstancedMesh(rockGeometry(7), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 420);
  const logMesh = new THREE.InstancedMesh(logGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 32);
  const fenceMesh = new THREE.InstancedMesh(fenceGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 220);
  const rampMesh = new THREE.InstancedMesh(rampGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 24);
  const lampPostMesh = new THREE.InstancedMesh(
    (() => {
      const g = new THREE.CylinderGeometry(0.09, 0.12, 3.2, 5);
      g.translate(0, 1.6, 0);
      return g;
    })(),
    new THREE.MeshLambertMaterial({ color: 0x2a3550 }),
    80,
  );
  for (const m of [treeMesh, rockMesh, logMesh, fenceMesh, rampMesh, lampPostMesh]) {
    m.frustumCulled = false;
    m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }
  for (const m of [treeMesh, rockMesh, logMesh, fenceMesh, rampMesh]) m.castShadow = true;
  for (const m of [rockMesh, logMesh, rampMesh, fenceMesh]) m.receiveShadow = true;
  treeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1100 * 3), 3);
  rockMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(420 * 3), 3);

  const lampGlow = (() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(80 * 3), 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture('rgba(255,214,140,1)'), size: 7, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: 0xffffff }));
    m.frustumCulled = false;
    m.renderOrder = 4;
    scene.add(m);
    return m;
  })();

  // bells
  const bellMesh = new THREE.InstancedMesh(bellGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x6a4300 }), 360);
  bellMesh.frustumCulled = false;
  bellMesh.count = 0;
  bellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(bellMesh);

  // gates
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6).translate(0, 1.7, 0), lam(0xf3f8ff), 64);
  const pennantMesh = new THREE.InstancedMesh(pennantGeometry(), new THREE.MeshLambertMaterial({ color: 0xff5b1f, side: THREE.DoubleSide, flatShading: true }), 32);
  const bannerMesh = new THREE.InstancedMesh(bannerFlagGeometry(), new THREE.MeshLambertMaterial({ color: 0x2d7fe0, side: THREE.DoubleSide, flatShading: true }), 32);
  const stripGeo = new THREE.PlaneGeometry(1, 0.7).rotateX(-Math.PI / 2);
  const stripMesh = new THREE.InstancedMesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 32);
  for (const m of [poleMesh, pennantMesh, bannerMesh, stripMesh]) {
    m.frustumCulled = false;
    m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }
  poleMesh.castShadow = true;
  stripMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(32 * 3), 3);
  stripMesh.renderOrder = 3;

  // power-ups: icon sprites with a beam
  const powerPool = [];
  const iconTex = {};
  for (const t of Object.keys(POWERS)) iconTex[t] = iconTexture(t);
  const beamTex = canvasTex(8, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  for (let i = 0; i < 6; i++) {
    const grp = new THREE.Group();
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex.magnet, transparent: true, depthWrite: false }));
    spr.scale.set(2.5, 2.5, 1);
    spr.position.y = 2.1;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 16, 10, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.y = 8;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.09, 4, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.y = 0.2;
    grp.add(beam, ring, spr);
    grp.visible = false;
    grp.userData = { spr, beam, ring, type: '' };
    scene.add(grp);
    powerPool.push(grp);
  }

  // movers
  const balls = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), lam(0xf4f9ff));
    m.castShadow = true;
    m.visible = false;
    scene.add(m);
    balls.push(m);
  }
  const cat = (() => {
    const g = new THREE.Group();
    const body = lam(0xff5b1f);
    const dark = lam(0x1b2433);
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(6.2, 1.6, 3.3), body, 0, 1.55, 0);
    add(new THREE.BoxGeometry(2.6, 1.4, 2.7), lam(0x2a3550), 0.8, 2.95, 0);
    add(new THREE.BoxGeometry(2.7, 0.9, 2.8), new THREE.MeshStandardMaterial({ color: 0x9fd6ff, emissive: 0x2d6bb0, emissiveIntensity: 0.4, metalness: 0.8, roughness: 0.2 }), 0.82, 3.05, 0);
    for (const z of [-1.9, 1.9]) add(new THREE.BoxGeometry(6.8, 1.1, 0.9), dark, 0, 0.6, z);
    add(new THREE.BoxGeometry(0.4, 1.3, 3.8), lam(0xc9d1de), 3.5, 0.9, 0);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0 });
    for (const z of [-1.1, 1.1]) add(new THREE.BoxGeometry(0.2, 0.3, 0.5), lampMat, 3.15, 1.9, z);
    g.visible = false;
    scene.add(g);
    return g;
  })();

  // best flag, finish line, start arch
  const bestGroup = new THREE.Group();
  const bestBanner = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.38), new THREE.MeshBasicMaterial({ transparent: false, side: THREE.DoubleSide }));
  bestBanner.position.set(0, 7.6, 0);
  {
    const poleMat = lam(0xf3f8ff);
    for (const x of [-2.4, 2.4]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 8.4, 6), poleMat);
      p.position.set(x, 4.2, 0);
      p.castShadow = true;
      bestGroup.add(p);
    }
  }
  bestGroup.add(bestBanner);
  const bestLine = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 4, 1.4),
    new THREE.MeshBasicMaterial({
      map: canvasTex(256, 16, (g, w, h) => {
        for (let i = 0; i < 32; i++) {
          g.fillStyle = i % 2 ? '#ffffff' : '#ff5b1f';
          g.fillRect(i * 8, 0, 8, h / 2);
          g.fillStyle = i % 2 ? '#ff5b1f' : '#ffffff';
          g.fillRect(i * 8, h / 2, 8, h / 2);
        }
      }),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  bestLine.rotation.order = 'YXZ';
  bestGroup.visible = false;
  bestLine.visible = false;
  scene.add(bestGroup, bestLine);

  const startGroup = new THREE.Group();
  {
    const poleMat = lam(0x2a3550);
    for (const x of [-(HALF - 2), HALF - 2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.7), poleMat);
      p.position.set(x, 4, 0);
      p.castShadow = true;
      startGroup.add(p);
    }
    const ban = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 - 3, 2.2, 0.35), new THREE.MeshBasicMaterial({ map: bannerTexture('START', 'DOWNHILL SLED DASH') }));
    ban.position.set(0, 7.6, 0);
    startGroup.add(ban);
  }
  scene.add(startGroup);

  // ---- state ----
  let course = null;
  let builtAt = -1e9;
  let lastK0 = -1e9;
  let bestD = 0;
  let bestLabel = '';
  const tmp = [];
  const VIEW = () => (world.quality === 'low' ? 250 : 330);

  const tintTree = new THREE.Color();
  function setTreeColor(i, d, x) {
    const n = hashUnit(Math.floor(d * 7), Math.floor(x * 5) + 3);
    tintTree.setRGB(0.82 + n * 0.3, 0.86 + n * 0.24, 0.8 + n * 0.28);
    treeMesh.setColorAt(i, tintTree);
  }

  function rebuild(d) {
    builtAt = d;
    const w0 = d - 70;
    const w1 = d + VIEW();
    course.ensure(w1 + 40);
    // trees: course trees, then edge forest
    let nt = 0;
    for (const t of course.near('trees', w0, w1, tmp)) {
      if (t.dead || t.d < w0 || t.d > w1 || nt >= 1100) continue;
      _p.set(centre(t.d) + t.x, groundY(t.d, t.x) - 0.08, -t.d);
      _e.set(0, hashUnit(Math.floor(t.d * 3), 5) * 6.28, 0);
      _q.setFromEuler(_e);
      _s.set(t.s, t.s * (0.9 + 0.2 * hashUnit(Math.floor(t.x * 9), 3)), t.s);
      _m.compose(_p, _q, _s);
      treeMesh.setMatrixAt(nt, _m);
      setTreeColor(nt, t.d, t.x);
      t.i = nt;
      nt++;
    }
    const cell = 6;
    const lowQ = world.quality === 'low';
    for (let k = Math.floor(w0 / cell); k <= Math.floor(w1 / cell) && nt < 1090; k++) {
      for (const side of [-1, 1]) {
        const key = hash2(k * 2 + (side > 0 ? 1 : 0), 4242);
        const cnt = lowQ ? 2 : 3;
        for (let j = 0; j < cnt; j++) {
          const u = hashUnit(key, j * 3 + 1);
          const v = hashUnit(key, j * 3 + 2);
          const x = side * (HALF + 3.2 + Math.pow(u, 1.4) * 38);
          const dd = k * cell + v * cell;
          const sc = 0.85 + hashUnit(key, j * 3 + 3) * 0.55 + Math.min(0.8, (Math.abs(x) - HALF) / 45);
          _p.set(centre(dd) + x, groundY(dd, x) - 0.1, -dd);
          _e.set(0, hashUnit(key, j + 50) * 6.28, 0);
          _q.setFromEuler(_e);
          _s.set(sc, sc * 1.05, sc);
          _m.compose(_p, _q, _s);
          treeMesh.setMatrixAt(nt, _m);
          setTreeColor(nt, dd, x);
          nt++;
        }
      }
    }
    treeMesh.count = nt;
    treeMesh.instanceMatrix.needsUpdate = true;
    treeMesh.instanceColor.needsUpdate = true;

    // rocks
    let nr = 0;
    for (const r of course.near('rocks', w0, w1, tmp)) {
      if (r.dead || r.d < w0 || r.d > w1 || nr >= 420) continue;
      _p.set(centre(r.d) + r.x, groundY(r.d, r.x) - 0.05, -r.d);
      _e.set(0, r.rot, 0);
      _q.setFromEuler(_e);
      _s.set(r.s * 1.05, r.s * 1.05, r.s * 1.05);
      _m.compose(_p, _q, _s);
      rockMesh.setMatrixAt(nr, _m);
      _c.setRGB(0.9 + hashUnit(Math.floor(r.d), 3) * 0.2, 0.92 + hashUnit(Math.floor(r.d), 4) * 0.16, 1);
      rockMesh.setColorAt(nr, _c);
      r.i = nr;
      nr++;
    }
    for (let k = Math.floor(w0 / 11); k <= Math.floor(w1 / 11) && nr < 410; k++) {
      for (const side of [-1, 1]) {
        const key = hash2(k * 2 + (side > 0 ? 1 : 0), 999);
        if (hashUnit(key, 1) > 0.6) continue;
        const x = side * (HALF + 3 + hashUnit(key, 2) * 24);
        const dd = k * 11 + hashUnit(key, 3) * 11;
        const sc = 0.8 + hashUnit(key, 4) * 1.5;
        _p.set(centre(dd) + x, groundY(dd, x) - 0.1, -dd);
        _e.set(0, hashUnit(key, 5) * 6.28, 0);
        _q.setFromEuler(_e);
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        rockMesh.setMatrixAt(nr, _m);
        _c.setRGB(0.85, 0.9, 1);
        rockMesh.setColorAt(nr, _c);
        nr++;
      }
    }
    rockMesh.count = nr;
    rockMesh.instanceMatrix.needsUpdate = true;
    rockMesh.instanceColor.needsUpdate = true;

    // logs
    let nl = 0;
    for (const l of course.near('logs', w0, w1, tmp)) {
      if (l.dead || nl >= 32) continue;
      const len = l.x1 - l.x0;
      const cx = (l.x0 + l.x1) / 2;
      _p.set(centre(l.d) + cx, groundY(l.d, cx) - 0.02, -l.d);
      _e.set(0, 0, 0);
      _q.setFromEuler(_e);
      _s.set(len, 1, 1);
      _m.compose(_p, _q, _s);
      logMesh.setMatrixAt(nl++, _m);
    }
    logMesh.count = nl;
    logMesh.instanceMatrix.needsUpdate = true;

    // fences
    let nf = 0;
    for (const f of course.near('fences', w0, w1, tmp)) {
      if (f.dead) continue;
      const len = f.x1 - f.x0;
      const panels = Math.max(1, Math.round(len / 2));
      const sx = len / panels / 2;
      for (let i = 0; i < panels && nf < 220; i++) {
        const x = f.x0 + (i + 0.5) * (len / panels);
        _p.set(centre(f.d) + x, groundY(f.d, x) - 0.02, -f.d);
        _q.identity();
        _s.set(sx, 1, 1);
        _m.compose(_p, _q, _s);
        fenceMesh.setMatrixAt(nf++, _m);
      }
    }
    fenceMesh.count = nf;
    fenceMesh.instanceMatrix.needsUpdate = true;

    // ramps
    let nrp = 0;
    for (const r of course.near('ramps', w0 - 10, w1, tmp)) {
      if (nrp >= 24) break;
      const dm = r.d + r.len / 2;
      _p.set(centre(dm) + r.x, groundY(dm, r.x) - 0.12, -dm);
      // follow the slope of the hill so the ramp's rise is on top of it
      _e.set(Math.atan(slopeDY(dm)), -Math.atan(centreSlope(dm)), 0, 'YXZ');
      _q.setFromEuler(_e);
      _s.set(r.w, r.h, r.len);
      _m.compose(_p, _q, _s);
      rampMesh.setMatrixAt(nrp++, _m);
    }
    rampMesh.count = nrp;
    rampMesh.instanceMatrix.needsUpdate = true;

    // lanterns along both edges every 36 m
    let nlp = 0;
    const lp = lampGlow.geometry.attributes.position.array;
    for (let k = Math.ceil(w0 / 36); k <= Math.floor(w1 / 36) && nlp < 78; k++) {
      for (const side of [-1, 1]) {
        const dd = k * 36 + (side > 0 ? 18 : 0);
        const x = side * (HALF + 0.7);
        _p.set(centre(dd) + x, groundY(dd, x), -dd);
        _q.identity();
        _s.set(1, 1, 1);
        _m.compose(_p, _q, _s);
        lampPostMesh.setMatrixAt(nlp, _m);
        lp[nlp * 3] = _p.x;
        lp[nlp * 3 + 1] = _p.y + 3.3;
        lp[nlp * 3 + 2] = _p.z;
        nlp++;
      }
    }
    lampPostMesh.count = nlp;
    lampPostMesh.instanceMatrix.needsUpdate = true;
    lampGlow.geometry.setDrawRange(0, nlp);
    lampGlow.geometry.attributes.position.needsUpdate = true;
  }

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  const api = Object.assign(world, {
    bindCourse(c, best = 0) {
      course = c;
      api.course = c;
      builtAt = -1e9;
      bestD = best;
      api.setBest(best);
      for (const s of segs) s.userData.k = -1e9;
    },
    setBest(best) {
      bestD = best;
      if (best > 0) {
        const t = canvasTex(512, 160, (g, w, h) => {
          g.fillStyle = '#ffc43d';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#0e1a2b';
          g.fillRect(0, h * 0.12, w, h * 0.76);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = '#ffc43d';
          g.font = 'italic 900 96px "Barlow Condensed", Impact, "Arial Narrow", sans-serif';
          g.fillText('BEST', w * 0.31, h * 0.53);
          g.fillStyle = '#f3f8ff';
          g.font = 'italic 900 80px "Barlow Condensed", Impact, "Arial Narrow", sans-serif';
          g.fillText(Math.round(best).toLocaleString('en-US') + ' m', w * 0.7, h * 0.53);
        });
        bestBanner.material.map = t;
        bestBanner.material.needsUpdate = true;
      }
    },
    /** Hide one instanced item at once (smashed trees and rocks). */
    hide(item, kind) {
      const mesh = kind === 'rock' ? rockMesh : kind === 'tree' ? treeMesh : null;
      if (!mesh || item.i === undefined) return;
      mesh.setMatrixAt(item.i, zero);
      mesh.instanceMatrix.needsUpdate = true;
    },
    resize(w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const ph = h * dpr;
      for (const f of api.onResize ?? []) f(ph);
    },
    setQuality(q) {
      api.quality = q;
      world.quality = q;
      setShadowSize();
      builtAt = -1e9;
      renderer.shadowMap.needsUpdate = true;
    },
    /**
     * Per-frame update. f: { d, t, sim, tod, fwdX, targetPos:[x,y,z], gateFlash }
     */
    update(f) {
      const d = f.d;
      if (!course) return;
      if (Math.abs(d - builtAt) > 24 || builtAt < -1e8) rebuild(d);
      // terrain ring
      const k0 = Math.floor((d - 100) / SEG_LEN);
      if (k0 !== lastK0 || segs.some((s) => s.userData.k < -1e8)) {
        lastK0 = k0;
        const have = new Set();
        const spare = [];
        for (const s of segs) {
          const k = s.userData.k;
          if (k >= k0 && k < k0 + NSEG && !have.has(k)) have.add(k);
          else spare.push(s);
        }
        for (let k = k0; k < k0 + NSEG; k++) if (!have.has(k)) fillSeg(spare.pop(), k);
      }

      // look
      const tod = f.tod;
      skyMat.uniforms.top.value.setHex(tod.top);
      skyMat.uniforms.hor.value.setHex(tod.hor);
      skyMat.uniforms.glowCol.value.setHex(tod.sun);
      const el = tod.el;
      skyMat.uniforms.glowAmt.value = (1 - clamp((el - 8) / 30, 0, 1)) * (1 - tod.night) * 0.9 + 0.06;
      const glowEl = Math.max(2, Math.min(18, el * 0.5));
      skyMat.uniforms.glowDir.value.set(-0.45, Math.sin((glowEl * Math.PI) / 180), -1).normalize();
      scene.fog.color.setHex(tod.fog);
      scene.fog.far = tod.fogFar * (world.quality === 'low' ? 0.85 : 1);
      scene.fog.near = 28;
      renderer.setClearColor(tod.fog);
      hemi.color.setHex(tod.hemiS);
      hemi.groundColor.setHex(tod.hemiG);
      hemi.intensity = tod.hemiI;
      sun.color.setHex(tod.sun);
      sun.intensity = tod.sunI;
      terrainMat.color.setHex(tod.snow);
      // sun direction: from the left, a little ahead; lower in the evening, high at noon
      const er = (el * Math.PI) / 180;
      SUN_DIR.set(-Math.cos(er) * 0.88, Math.sin(er), -Math.cos(er) * 0.4).normalize();
      const tp = f.targetPos;
      const qx = Math.round(tp[0]);
      const qy = Math.round(tp[1]);
      const qz = Math.round(tp[2] - 16);
      sun.target.position.set(qx, qy, qz);
      sun.position.set(qx + SUN_DIR.x * 90, qy + SUN_DIR.y * 90, qz + SUN_DIR.z * 90);
      sun.target.updateMatrixWorld();
      lamp.intensity = tod.night * 90 * (f.headlamp ?? 1);
      if (lamp.intensity > 0) {
        lamp.position.set(tp[0], tp[1] + 1.6, tp[2] + 0.5);
        lamp.target.position.set(tp[0] + (f.fwdX ?? 0) * 20, tp[1] - 1.5, tp[2] - 22);
      }

      // sky follows the camera
      const cp = camera.position;
      sky.position.copy(cp);
      stars.position.copy(cp);
      stars.material.opacity = tod.stars;
      stars.visible = tod.stars > 0.01;
      moon.position.set(cp.x - 260, cp.y + 760, cp.z - 1650);
      moon.material.opacity = tod.stars > 0 ? Math.min(1, tod.stars * 1.4) : 0;
      moon.visible = moon.material.opacity > 0.01;
      for (const r of ridges) {
        const L = r.userData;
        r.position.set(cp.x * 0.92 - 120, cp.y, cp.z - L.z);
        r.material.color.setHex(mixColor(tod.mtn, tod.fog, L.haze));
      }
      lampGlow.material.opacity = tod.lanterns ? Math.min(1, tod.night * 1.3) : 0;
      lampGlow.visible = lampGlow.material.opacity > 0.02;
      lampPostMesh.visible = tod.lanterns > 0;
      // night: bells and flags glow a bit
      bellMesh.material.emissive.setHex(tod.night > 0.4 ? 0xb87a10 : 0x6a4300);

      // dynamic items
      let nb = 0;
      const t = f.t;
      const items = course.near('bells', d - 6, d + VIEW(), tmp);
      for (let i = 0; i < items.length && nb < 360; i++) {
        const b = items[i];
        if (b.got) continue;
        const bd = b.md ?? b.d;
        if (bd < d - 3.5) continue;
        const bx = b.mx ?? b.x;
        _p.set(centre(bd) + bx, groundY(bd, bx) + b.y, -bd);
        _e.set(0, t * 3 + bd * 0.7, Math.sin(t * 4 + bd) * 0.12);
        _q.setFromEuler(_e);
        _s.set(1, 1, 1);
        _m.compose(_p, _q, _s);
        bellMesh.setMatrixAt(nb++, _m);
      }
      bellMesh.count = nb;
      bellMesh.instanceMatrix.needsUpdate = true;

      let ng = 0;
      let np = 0;
      const gates = course.near('gates', d - 25, d + VIEW(), tmp);
      for (let i = 0; i < gates.length && ng < 32; i++) {
        const g = gates[i];
        const gx = [g.cx - g.w / 2, g.cx + g.w / 2];
        for (let s = 0; s < 2; s++) {
          _p.set(centre(g.d) + gx[s], groundY(g.d, gx[s]) - 0.1, -g.d);
          _q.identity();
          _s.set(1, 1, 1);
          _m.compose(_p, _q, _s);
          poleMesh.setMatrixAt(ng * 2 + s, _m);
        }
        const wave = Math.sin(t * 5 + g.d) * 0.3;
        _p.set(centre(g.d) + gx[0] + 0.05, groundY(g.d, gx[0]) + 2.7, -g.d);
        _e.set(0, wave - 0.2, 0);
        _q.setFromEuler(_e);
        _m.compose(_p, _q, _s.set(1, 1, 1));
        pennantMesh.setMatrixAt(ng, _m);
        _p.set(centre(g.d) + gx[1] - 0.05, groundY(g.d, gx[1]) + 2.8, -g.d);
        _e.set(0, Math.PI + wave * 0.8 + 0.2, 0);
        _q.setFromEuler(_e);
        _m.compose(_p, _q, _s.set(1, 1, 1));
        bannerMesh.setMatrixAt(ng, _m);
        _p.set(centre(g.d) + g.cx, groundY(g.d, g.cx) + 0.04, -g.d);
        _q.identity();
        _m.compose(_p, _q, _s.set(g.w, 1, 1));
        stripMesh.setMatrixAt(ng, _m);
        const fl = g.flash !== undefined ? clamp(1 - (t - g.flash) / 1.2, 0, 1) : 0;
        if (fl > 0) _c.setRGB(g.ok ? 0.3 : 1, g.ok ? 1 : 0.25, g.ok ? 0.45 : 0.25).multiplyScalar(0.6 + fl * 1.2);
        else _c.setRGB(0.8, 0.85, 1).multiplyScalar(g.done ? 0.35 : 0.9);
        stripMesh.setColorAt(ng, _c);
        ng++;
      }
      poleMesh.count = ng * 2;
      pennantMesh.count = ng;
      bannerMesh.count = ng;
      stripMesh.count = ng;
      for (const m of [poleMesh, pennantMesh, bannerMesh, stripMesh]) m.instanceMatrix.needsUpdate = true;
      stripMesh.instanceColor.needsUpdate = true;

      const pw = course.near('powers', d - 8, d + VIEW(), tmp);
      for (let i = 0; i < pw.length && np < powerPool.length; i++) {
        const p = pw[i];
        if (p.got) continue;
        const grp = powerPool[np++];
        const u = grp.userData;
        if (u.type !== p.type) {
          u.type = p.type;
          u.spr.material.map = iconTex[p.type];
          u.spr.material.needsUpdate = true;
          u.beam.material.color.setHex(POWERS[p.type].color);
          u.ring.material.color.setHex(POWERS[p.type].color);
        }
        grp.visible = true;
        grp.position.set(centre(p.d) + p.x, groundY(p.d, p.x) + 0.2 + Math.sin(t * 3 + p.d) * 0.18, -p.d);
        u.ring.rotation.y = t * 2;
        const s = 2.5 + Math.sin(t * 6 + p.d) * 0.12;
        u.spr.scale.set(s, s, 1);
      }
      for (let i = np; i < powerPool.length; i++) powerPool[i].visible = false;

      // movers
      let nball = 0;
      let catShown = false;
      for (const m of course.near('movers', d - 10, d + 160, tmp)) {
        if (!m.active || m.dead) continue;
        const x = moverPos(m, f.simT ?? t);
        if (m.kind === 'ball' && nball < balls.length) {
          const b = balls[nball++];
          b.visible = true;
          b.position.set(centre(m.d) + x, groundY(m.d, x) + 1.25, -m.d);
          b.rotation.z = -x * 0.8 * (m.s ?? 1);
          b.rotation.x = x * 0.2;
        } else if (m.kind === 'cat' && !catShown) {
          catShown = true;
          cat.visible = true;
          cat.position.set(centre(m.d) + x, groundY(m.d, x), -m.d);
          cat.rotation.y = m.xTo > m.xFrom ? 0 : Math.PI;
          if (m.t0 >= 0 && !moverDone(m, f.simT ?? t)) cat.position.y += Math.sin(t * 40) * 0.02;
        }
      }
      for (let i = nball; i < balls.length; i++) balls[i].visible = false;
      if (!catShown) cat.visible = false;

      // start arch and the best marker
      startGroup.visible = d < 120;
      if (startGroup.visible) {
        startGroup.position.set(centre(34), groundY(34, 0) + 0.1, -34);
        startGroup.rotation.y = -Math.atan(centreSlope(34)) * 0;
      }
      const showBest = bestD > 40 && Math.abs(bestD - d) < VIEW();
      bestGroup.visible = showBest;
      bestLine.visible = showBest;
      if (showBest) {
        const bx = course.route.x(bestD);
        bestGroup.position.set(centre(bestD) + bx, groundY(bestD, bx) - 0.1, -bestD);
        bestLine.position.set(centre(bestD), groundY(bestD, 0) + 0.06, -bestD);
        bestLine.rotation.set(-Math.PI / 2 + Math.atan(slopeDY(bestD)) * -1, 0, 0);
        bestBanner.rotation.y = Math.sin(t * 2) * 0.05;
      }
    },
    render() {
      renderer.render(scene, camera);
    },
    onResize: [],
  });
  return api;
}
