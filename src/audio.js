// Every sound is synthesized: a runner hiss and wind that follow the speed, effects for every action, and a
// 128 BPM sequencer whose layers rise with speed. The platform applies volume and mute.

let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let noiseBuf = null;
let started = false;
let hiss = null;
let wind = null;
let timer = 0;

const BPM = 128;
const STEP = 60 / BPM / 4;
let nextT = 0;
let stepNo = 0;
let mode = 'off'; // 'off' | 'menu' | 'play'
let intensity = 0;

export function startAudio() {
  if (started) {
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    return;
  }
  started = true;
  master = ctx.createGain();
  master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.9;
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  buildLoops();
  nextT = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 30);
}

const ok = () => ctx && ctx.state === 'running';

function buildLoops() {
  const mk = (type, freq, q) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(master);
    src.start();
    return { f, g };
  };
  hiss = mk('bandpass', 2400, 0.9);
  wind = mk('lowpass', 500, 0.5);
}

/** Called every frame while a run is on: speed in m/s, whether on the ground, and a boost flag. */
export function setMotion(v, grounded, boosting, on = true) {
  if (!ok() || !hiss) return;
  const t = ctx.currentTime;
  const k = Math.min(1, v / 38);
  const h = on ? (grounded ? 0.05 + k * 0.2 : 0.01) : 0;
  hiss.g.gain.setTargetAtTime(h, t, 0.05);
  hiss.f.frequency.setTargetAtTime(1600 + k * 2600, t, 0.08);
  wind.g.gain.setTargetAtTime(on ? 0.02 + k * k * 0.3 + (boosting ? 0.12 : 0) : 0, t, 0.1);
  wind.f.frequency.setTargetAtTime(300 + k * 900 + (boosting ? 500 : 0), t, 0.1);
}

export function setMusic(m, level = 0) {
  mode = m;
  intensity = level;
  if (!ok()) return;
  const target = m === 'off' ? 0 : m === 'menu' ? 0.2 : 0.34;
  musicGain.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
}

function env(g, t, a, peak, decay) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
}

function tone(freq, { type = 'sine', at = 0, dur = 0.2, vol = 0.3, attack = 0.004, slide = 0, out = sfxGain, detune = 0 } = {}) {
  if (!ok()) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.value = detune;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  env(g, t, attack, vol, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise({ at = 0, dur = 0.1, vol = 0.3, freq = 1200, q = 1, type = 'bandpass', sweep = 0, out = sfxGain } = {}) {
  if (!ok()) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.004, vol, dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.1);
}

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const semis = (base, n) => base * Math.pow(2, n / 12);

export const sfx = {
  click() {
    tone(620, { type: 'square', dur: 0.05, vol: 0.12 });
    tone(930, { type: 'square', at: 0.035, dur: 0.06, vol: 0.1 });
  },
  hop() {
    noise({ dur: 0.18, vol: 0.2, freq: 500, sweep: 4, q: 0.8 });
    tone(260, { type: 'sine', dur: 0.14, vol: 0.2, slide: 2 });
  },
  land(big, clean = true, impact = 8) {
    const v = Math.min(1, impact / 18);
    tone(120, { type: 'sine', dur: 0.16, vol: 0.3 + v * 0.3, slide: 0.45 });
    noise({ dur: 0.16 + v * 0.1, vol: 0.18 + v * 0.18, freq: 900, type: 'lowpass', sweep: 0.3 });
    if (big && clean) {
      tone(523, { type: 'triangle', at: 0.02, dur: 0.18, vol: 0.2 });
      tone(784, { type: 'triangle', at: 0.08, dur: 0.22, vol: 0.18 });
    } else if (big) {
      noise({ dur: 0.35, vol: 0.3, freq: 300, type: 'lowpass' });
      tone(90, { type: 'sawtooth', dur: 0.3, vol: 0.2, slide: 0.5 });
    }
  },
  launch() {
    noise({ dur: 0.5, vol: 0.28, freq: 400, sweep: 6, q: 0.7 });
    tone(220, { type: 'sawtooth', dur: 0.4, vol: 0.1, slide: 3 });
  },
  spin(n) {
    tone(1100 + n * 200, { type: 'sine', dur: 0.07, vol: 0.18, slide: 1.5 });
    tone(1650 + n * 250, { type: 'sine', at: 0.05, dur: 0.1, vol: 0.14 });
  },
  trick(n) {
    for (let i = 0; i < 3 + n; i++) tone(semis(523, PENTA[i]), { type: 'triangle', at: i * 0.055, dur: 0.18, vol: 0.2 });
  },
  bell(chain) {
    const f = semis(880, PENTA[chain % PENTA.length] + 12 * Math.floor(chain / PENTA.length));
    tone(Math.min(f, 3800), { type: 'triangle', dur: 0.22, vol: 0.2 });
    tone(Math.min(f * 2.01, 7000), { type: 'sine', dur: 0.14, vol: 0.07 });
  },
  gate(streak) {
    const base = semis(784, Math.min(streak, 12));
    tone(base, { type: 'triangle', dur: 0.25, vol: 0.22 });
    tone(base * 1.5, { type: 'triangle', at: 0.06, dur: 0.3, vol: 0.18 });
  },
  gateMiss() {
    tone(180, { type: 'sawtooth', dur: 0.22, vol: 0.14, slide: 0.6 });
    tone(150, { type: 'square', at: 0.08, dur: 0.2, vol: 0.1, slide: 0.6 });
  },
  power(type) {
    noise({ dur: 0.4, vol: 0.2, freq: 500, sweep: 8, q: 0.8 });
    const seq = { magnet: [0, 4, 7, 12], shield: [0, 5, 9, 12], boost: [0, 7, 12, 19], x2: [0, 4, 7, 16] }[type] ?? [0, 4, 7, 12];
    seq.forEach((n, i) => tone(semis(440, n), { type: 'square', at: i * 0.06, dur: 0.14, vol: 0.1 }));
    tone(semis(880, seq[3]), { type: 'triangle', at: 0.24, dur: 0.3, vol: 0.18 });
  },
  boost() {
    noise({ dur: 1.0, vol: 0.34, freq: 300, sweep: 10, q: 0.6 });
    tone(110, { type: 'sawtooth', dur: 0.9, vol: 0.16, slide: 4 });
  },
  powerEnd() {
    tone(500, { type: 'sine', dur: 0.2, vol: 0.12, slide: 0.5 });
  },
  shieldBreak() {
    noise({ dur: 0.35, vol: 0.34, freq: 5200, type: 'highpass', sweep: 0.4, q: 0.7 });
    tone(880, { type: 'square', dur: 0.25, vol: 0.14, slide: 0.35 });
    tone(110, { type: 'sine', dur: 0.2, vol: 0.4, slide: 0.5 });
  },
  scrape() {
    noise({ dur: 0.22, vol: 0.2, freq: 3200, q: 1.2 });
  },
  smash() {
    noise({ dur: 0.25, vol: 0.34, freq: 1400, type: 'lowpass', sweep: 0.3 });
    tone(140, { type: 'square', dur: 0.14, vol: 0.2, slide: 0.5 });
  },
  crash() {
    noise({ dur: 0.7, vol: 0.55, freq: 1800, type: 'lowpass', sweep: 0.1 });
    tone(150, { type: 'sine', dur: 0.8, vol: 0.55, slide: 0.2 });
    tone(320, { type: 'sawtooth', dur: 0.6, vol: 0.2, slide: 0.15 });
    noise({ at: 0.12, dur: 0.4, vol: 0.2, freq: 4000, type: 'highpass' });
  },
  stinger() {
    [0, -3, -7, -12].forEach((n, i) => tone(semis(440, n), { type: 'triangle', at: 0.55 + i * 0.14, dur: 0.4, vol: 0.2 }));
  },
  fanfare() {
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(semis(392, n), { type: 'square', at: i * 0.075, dur: 0.3, vol: 0.12 }));
    tone(semis(392, 24), { type: 'triangle', at: 0.55, dur: 0.8, vol: 0.2 });
  },
  buy() {
    [0, 7, 12, 19].forEach((n, i) => tone(semis(523, n), { type: 'triangle', at: i * 0.07, dur: 0.22, vol: 0.2 }));
  },
  nope() {
    tone(160, { type: 'square', dur: 0.14, vol: 0.14 });
  },
  tick(final) {
    tone(final ? 988 : 659, { type: 'square', dur: final ? 0.3 : 0.1, vol: 0.14 });
  },
};

// ---- music ----
// A minor: Am F C G, a bar each (16 steps)
const ROOTS = [55, 43.65, 65.41, 49];
const CHORDS = [
  [0, 3, 7, 12],
  [0, 4, 7, 12],
  [0, 4, 7, 12],
  [0, 4, 7, 11],
];
const LEAD = [
  [12, null, 15, null, 19, null, 15, 12, null, 10, null, 12, null, null, 7, null],
  [9, null, 12, null, 16, null, 12, 9, null, 7, null, 9, null, null, 4, null],
  [12, null, 16, null, 19, null, 16, 12, null, 14, null, 16, null, null, 12, null],
  [11, null, 14, null, 19, null, 14, 11, null, 7, null, 11, null, 14, null, 19],
];

function kick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  env(g, t, 0.002, 0.9, 0.2);
  o.connect(g).connect(musicGain);
  o.start(t);
  o.stop(t + 0.25);
}
function hat(t, open) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ctx.createGain();
  env(g, t, 0.001, open ? 0.2 : 0.14, open ? 0.12 : 0.04);
  src.connect(f).connect(g).connect(musicGain);
  src.start(t, Math.random());
  src.stop(t + 0.2);
}
function clap(t) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1700;
  f.Q.value = 0.8;
  const g = ctx.createGain();
  env(g, t, 0.002, 0.3, 0.14);
  src.connect(f).connect(g).connect(musicGain);
  src.start(t, Math.random());
  src.stop(t + 0.2);
}
function voice(freq, t, dur, type, vol, cutoff) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  env(g, t, 0.006, vol, dur);
  o.connect(f).connect(g).connect(musicGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function playStep(t, n) {
  const bar = Math.floor(n / 16) % 4;
  const s = n % 16;
  const root = ROOTS[bar];
  const lvl = intensity;
  if (mode === 'menu') {
    if (s === 0) for (const c of CHORDS[bar]) voice(root * 4 * Math.pow(2, c / 12), t, 1.8, 'triangle', 0.045, 1500);
    if (s % 4 === 0) voice(root * 8 * Math.pow(2, CHORDS[bar][(s / 4) % 4] / 12), t, 0.4, 'sine', 0.05, 3000);
    return;
  }
  if (lvl >= 0 && s % 4 === 0) kick(t);
  if (lvl >= 1) {
    if (s % 2 === 0 || s === 3 || s === 11) voice(root * (s === 7 || s === 15 ? 2 : 1), t, STEP * 1.6, 'sawtooth', 0.2, 420 + lvl * 220);
    if (s === 4 || s === 12) clap(t);
  }
  if (lvl >= 2) {
    if (s % 4 === 2) hat(t, true);
    else hat(t, false);
    if (s % 2 === 1 || lvl >= 3) {
      const c = CHORDS[bar][(s >> 1) % 4];
      voice(root * 8 * Math.pow(2, c / 12), t, STEP * 1.3, 'square', 0.05, 2600);
    }
  }
  if (lvl >= 3) {
    const nn = LEAD[bar][s];
    if (nn !== null) voice(root * 8 * Math.pow(2, nn / 12), t, STEP * 2.2, 'sawtooth', 0.075, 3600);
  }
}

function schedule() {
  if (!ok() || mode === 'off') {
    if (ok()) nextT = Math.max(nextT, ctx.currentTime + 0.05);
    return;
  }
  while (nextT < ctx.currentTime + 0.18) {
    playStep(nextT, stepNo);
    nextT += STEP;
    stepNo++;
  }
}

export function stopAudio() {
  clearInterval(timer);
}
