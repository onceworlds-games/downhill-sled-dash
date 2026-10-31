// The screens: title, garage, HUD, pause, results. Plain DOM, all text set with textContent.

import { SLEDS, OUTFITS, POWERS } from './config.js';
import { missionText, missionProgress } from './missions.js';

const BELL = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3a3 3 0 0 1 3 3v1c4 1 6 4 6 9v4l3 4H4l3-4v-4c0-5 2-8 6-9V6a3 3 0 0 1 3-3z" fill="#ffc43d" stroke="#0e1a2b" stroke-width="2.4" stroke-linejoin="round"/><circle cx="16" cy="27" r="3" fill="#b97a14" stroke="#0e1a2b" stroke-width="2"/></svg>`;

const ICONS = {
  magnet: '<path d="M10 28V20a14 14 0 0 1 28 0v8" fill="none" stroke="COL" stroke-width="9"/><rect x="5" y="26" width="10" height="9" fill="#f3f8ff"/><rect x="33" y="26" width="10" height="9" fill="#f3f8ff"/>',
  shield: '<path d="M24 7l14 5-1 14c-1 8-7 12-13 15-6-3-12-7-13-15L10 12z" fill="COL" stroke="#f3f8ff" stroke-width="2.5" stroke-linejoin="round"/><rect x="22" y="14" width="4" height="22" fill="#f3f8ff"/>',
  boost: '<path d="M27 6L12 26h9l-4 16 19-23h-10z" fill="COL" stroke="#f3f8ff" stroke-width="2.5" stroke-linejoin="round"/>',
  x2: '<text x="24" y="31" text-anchor="middle" font-family="Barlow Condensed, Impact, sans-serif" font-weight="900" font-size="22" font-style="italic" fill="COL" stroke="#f3f8ff" stroke-width="1.2">x2</text>',
};

function powerSvg(type) {
  const col = '#' + POWERS[type].color.toString(16).padStart(6, '0');
  return `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#0e1a2b"/><circle class="ring" cx="24" cy="24" r="21" fill="none" stroke="${col}" stroke-width="3.6" stroke-dasharray="131.9" stroke-dashoffset="0" transform="rotate(-90 24 24)"/>${ICONS[type].replace(/COL/g, col)}</svg>`;
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const btn = (cls, label, id) => {
  const b = el('button', cls);
  if (id) b.id = id;
  const f = el('span', 'face');
  f.textContent = label;
  b.append(f);
  return b;
};
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function createUI(root, h) {
  root.innerHTML = '';
  const S = {};
  const sections = {};
  const mk = (id) => {
    const s = el('section');
    s.id = id;
    root.append(s);
    sections[id] = s;
    return s;
  };

  // ---- title ----
  const title = mk('title');
  title.innerHTML = `<div class="logo"><div class="l1 ol">Downhill</div><div class="l2">Sled Dash</div></div>
  <div class="menu"></div>
  <div class="wallet ol">${BELL}<b id="t-bells">0</b></div>
  <div class="best ol"><span>BEST</span><b id="t-best">0 m</b></div>`;
  const menu = title.querySelector('.menu');
  const play = btn('cta', 'Play', 'play');
  play.querySelector('.face').insertAdjacentHTML('beforeend', '<kbd>Space</kbd>');
  menu.append(play);
  const row = el('div', 'row');
  const bSleds = btn('sec', 'Sleds', 'b-sleds');
  const bMis = btn('sec', 'Missions', 'b-missions');
  const mcount = el('i', '', '3');
  bMis.querySelector('.face').append(mcount);
  row.append(bSleds, bMis);
  menu.append(row);
  play.onclick = () => h.play();
  bSleds.onclick = () => h.garage();
  bMis.onclick = () => h.missions();

  // ---- HUD ----
  const hud = el('div');
  hud.id = 'hud';
  hud.innerHTML = `<div class="bib-wrap"><div class="bib"><i></i><i></i><div class="bib-num"><span id="h-dist">0</span><small>M</small></div></div><div class="bib-best" id="h-best"></div></div>
  <div class="stats ol"><div class="stat" id="st-score"><span>SCORE</span><b>0</b></div><div class="stat" id="st-bells"><span>BELLS</span><b>0</b></div></div>
  <button id="pausebtn" aria-label="Pause"></button>
  <div class="powers" id="powers"></div>
  <div class="pops ol" id="pops"></div>
  <div class="hint ol" id="hint"></div>
  <div class="mtoast" id="mtoast"></div>
  <div class="streak ol" id="streak"></div>
  <button id="hopbtn" class="own">Hop</button>
  <div class="flash" id="flash"></div>
  <div class="count ol" id="count"></div>`;
  root.append(hud);
  const q = (id) => hud.querySelector('#' + id);
  const hDist = q('h-dist');
  const hBest = q('h-best');
  const stScore = q('st-score').querySelector('b');
  const stBells = q('st-bells').querySelector('b');
  const stBellsBox = q('st-bells');
  const powersEl = q('powers');
  const popsEl = q('pops');
  const hintEl = q('hint');
  const toastEl = q('mtoast');
  const streakEl = q('streak');
  const flashEl = q('flash');
  const countEl = q('count');
  q('pausebtn').onclick = () => h.pause();
  const hop = q('hopbtn');
  hop.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    h.hopButton();
  });

  const last = { dist: -1, score: -1, bells: -1, best: '' };
  const powerEls = new Map();
  let toastT = 0;

  S.hud = {
    setDist(d) {
      const v = Math.floor(d);
      if (v !== last.dist) {
        last.dist = v;
        hDist.textContent = fmt(v);
      }
    },
    setScore(s) {
      if (s !== last.score) {
        last.score = s;
        stScore.textContent = fmt(s);
      }
    },
    setBells(b) {
      if (b !== last.bells) {
        if (last.bells >= 0) {
          stBellsBox.classList.remove('bump');
          void stBellsBox.offsetWidth;
          stBellsBox.classList.add('bump');
        }
        last.bells = b;
        stBells.textContent = fmt(b);
      }
    },
    setBest(text) {
      if (text !== last.best) {
        last.best = text;
        hBest.innerHTML = '';
        if (text) {
          hBest.append(document.createTextNode('BEST '));
          hBest.append(el('b', '', text));
        }
      }
    },
    /** list: [{type, frac}] (frac 0..1 remaining). */
    setPowers(list) {
      const seen = new Set();
      for (const p of list) {
        seen.add(p.type);
        let e = powerEls.get(p.type);
        if (!e) {
          e = el('div', 'pw');
          e.innerHTML = powerSvg(p.type);
          e.ring = e.querySelector('.ring');
          powersEl.append(e);
          powerEls.set(p.type, e);
        }
        e.ring.setAttribute('stroke-dashoffset', String(131.9 * (1 - p.frac)));
        e.style.opacity = p.frac < 0.25 && p.type !== 'shield' ? (Math.floor(performance.now() / 150) % 2 ? 0.45 : 1) : 1;
      }
      for (const [t, e] of powerEls) {
        if (!seen.has(t)) {
          e.remove();
          powerEls.delete(t);
        }
      }
    },
    pop(text, cls = '', small = '') {
      const p = el('div', 'pop ' + cls, text);
      if (small) p.append(el('small', '', small));
      popsEl.append(p);
      while (popsEl.children.length > 3) popsEl.firstChild.remove();
      setTimeout(() => p.remove(), 1150);
    },
    hint(text) {
      hintEl.textContent = text || '';
      hintEl.classList.toggle('on', !!text);
    },
    toast(text, reward) {
      toastEl.textContent = text;
      if (reward) toastEl.append(el('b', '', '+' + reward));
      toastEl.classList.add('on');
      clearTimeout(toastT);
      toastT = setTimeout(() => toastEl.classList.remove('on'), 2600);
    },
    streak(n) {
      streakEl.textContent = n >= 2 ? `GATES x${Math.min(n, 10)}` : '';
      streakEl.classList.toggle('on', n >= 2);
    },
    flash() {
      flashEl.classList.remove('on');
      void flashEl.offsetWidth;
      flashEl.classList.add('on');
    },
    count(n) {
      if (!n) {
        countEl.classList.remove('on');
        return;
      }
      countEl.classList.add('on');
      countEl.innerHTML = '';
      countEl.append(el('b', '', String(n)));
    },
    reset() {
      last.dist = last.score = last.bells = -1;
      last.best = '';
      popsEl.innerHTML = '';
      streakEl.classList.remove('on');
      hintEl.classList.remove('on');
      toastEl.classList.remove('on');
      for (const e of powerEls.values()) e.remove();
      powerEls.clear();
    },
    ownHop(show) {
      hop.classList.toggle('own', show);
      hop.style.display = show ? 'block' : 'none';
    },
  };
  S.hud.ownHop(false);

  // ---- pause ----
  const pause = mk('pause');
  pause.innerHTML = '<div class="dim"><div class="panel"><h2>Paused</h2><div class="col"></div></div></div>';
  const pcol = pause.querySelector('.col');
  const pResume = btn('cta', 'Resume');
  pResume.querySelector('.face').insertAdjacentHTML('beforeend', '<kbd>P</kbd>');
  const pRestart = btn('sec', 'Restart');
  const pQuit = btn('sec', 'Title');
  pcol.append(pResume, pRestart, pQuit);
  pResume.onclick = () => h.resume();
  pRestart.onclick = () => h.retry();
  pQuit.onclick = () => h.home();

  // ---- results ----
  const res = mk('results');
  res.innerHTML = `<div class="slip"><div class="slip-top"><span id="r-cause"></span><span class="stamp" id="r-new">New best</span></div>
  <div class="r-dist ol"><span id="r-d">0</span><i>M</i></div>
  <div class="r-grid ol"><div><span>SCORE</span><b id="r-s">0</b></div><div class="gold"><span>BELLS</span><b id="r-b">0</b></div><div><span>BEST</span><b id="r-best">0</b></div></div>
  <ul class="missions" id="r-m"></ul><div class="r-actions"></div></div>`;
  const ra = res.querySelector('.r-actions');
  const rRetry = btn('cta', 'Retry');
  rRetry.querySelector('.face').insertAdjacentHTML('beforeend', '<kbd>Enter</kbd>');
  const rSleds = btn('sec', 'Sleds');
  const rHome = btn('sec', 'Title');
  ra.append(rRetry, rSleds, rHome);
  rRetry.onclick = () => h.retry();
  rSleds.onclick = () => h.garage(true);
  rHome.onclick = () => h.home();
  const rq = (id) => res.querySelector('#' + id);

  function fillMissions(ul, missions, run, doneIds) {
    ul.innerHTML = '';
    for (const m of missions) {
      const li = el('li');
      const frac = run ? missionProgress(m, run) : 0;
      if (doneIds && doneIds.has(m)) li.classList.add('done');
      li.append(el('span', '', missionText(m)), el('b', '', '+' + m.reward));
      const bar = el('div', 'bar');
      bar.style.width = Math.round(frac * 100) + '%';
      li.append(bar);
      ul.append(li);
    }
  }

  S.results = {
    show(r) {
      rq('r-cause').textContent = r.cause;
      rq('r-d').textContent = fmt(r.dist);
      rq('r-s').textContent = fmt(r.score);
      rq('r-b').textContent = '+' + fmt(r.bells);
      rq('r-best').textContent = fmt(r.best) + ' m';
      rq('r-new').classList.toggle('on', r.newBest);
      fillMissions(rq('r-m'), r.missions, r.run, new Set(r.completed));
    },
  };

  // ---- missions modal ----
  const mis = mk('missions');
  mis.innerHTML = '<div class="dim"><div class="panel"><h2>Missions</h2><div class="col"><ul class="missions" id="m-list" style="width:min(460px,80vw);padding:0"></ul></div></div></div>';
  const mClose = btn('cta', 'Close');
  mis.querySelector('.col').append(mClose);
  mClose.onclick = () => h.closeMissions();
  S.missions = { set: (list) => fillMissions(mis.querySelector('#m-list'), list, null) };

  // ---- garage ----
  const gar = mk('garage');
  gar.innerHTML = `<div class="gcard ol"><div class="gname" id="g-name"></div><div class="gsub" id="g-sub"></div>
  <div class="gnav"><button id="g-prev" aria-label="Previous sled">&lsaquo;</button><div class="gdots" id="g-dots"></div><button id="g-next" aria-label="Next sled">&rsaquo;</button></div>
  <div class="price" id="g-price"></div><div class="swatches" id="g-sw"></div></div>`;
  const gcard = gar.querySelector('.gcard');
  const gAct = btn('cta', 'Equip', 'g-act');
  gcard.insertBefore(gAct, gcard.querySelector('.swatches'));
  const gBack = btn('sec', 'Back', 'g-back');
  gar.append(gBack);
  const gq = (id) => gar.querySelector('#' + id);
  gq('g-prev').onclick = () => h.sledStep(-1);
  gq('g-next').onclick = () => h.sledStep(1);
  gAct.onclick = () => h.sledAct();
  gBack.onclick = () => h.garageBack();
  const dots = gq('g-dots');
  for (let i = 0; i < SLEDS.length; i++) dots.append(el('i'));
  const sw = gq('g-sw');
  OUTFITS.forEach((o, i) => {
    const b = el('button');
    b.setAttribute('aria-label', o.name + ' outfit');
    b.style.background = '#' + o.jacket.toString(16).padStart(6, '0');
    const sc = el('span', 'sc');
    sc.style.background = '#' + o.scarf.toString(16).padStart(6, '0');
    b.append(sc);
    b.onclick = () => h.outfit(i);
    sw.append(b);
  });
  S.garage = {
    set({ index, owned, equipped, bells, outfit }) {
      const s = SLEDS[index];
      gq('g-name').textContent = s.name;
      gq('g-sub').textContent = s.blurb;
      [...dots.children].forEach((d, i) => {
        d.classList.toggle('on', i === index);
        d.classList.toggle('own', owned.includes(SLEDS[i].id));
      });
      const price = gq('g-price');
      price.innerHTML = '';
      price.classList.remove('no');
      const face = gAct.querySelector('.face');
      if (owned.includes(s.id)) {
        price.append(el('span', 'state', equipped === s.id ? 'EQUIPPED' : 'OWNED'));
        face.textContent = equipped === s.id ? 'Ride' : 'Equip';
      } else {
        price.insertAdjacentHTML('beforeend', BELL);
        price.append(el('span', '', fmt(s.price)));
        price.classList.toggle('no', bells < s.price);
        face.textContent = bells >= s.price ? 'Buy' : 'Need ' + fmt(s.price - bells);
      }
      [...sw.children].forEach((b, i) => b.classList.toggle('on', i === outfit));
    },
  };

  S.title = {
    set({ best, bells, missions }) {
      title.querySelector('#t-best').textContent = fmt(best) + ' m';
      title.querySelector('#t-bells').textContent = fmt(bells);
      mcount.textContent = String(missions);
    },
  };

  S.screen = (name) => {
    for (const [k, s] of Object.entries(sections)) s.classList.toggle('on', k === name || (name === 'missions-title' && k === 'title') || (k === 'pause' && name === 'pause'));
    hud.classList.toggle('on', name === 'play' || name === 'pause' || name === 'dying');
    if (name === 'missions' || name === 'missions-title') {
      sections.missions.classList.add('on');
      sections.title.classList.add('on');
    }
  };
  S.wallet = (n) => {
    title.querySelector('#t-bells').textContent = fmt(n);
  };
  return S;
}
