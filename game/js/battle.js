// 전투: 주인공 직접 조작(조작 모드) ↔ 영웅 배치·소환·합성(지휘 모드), 육각 격자 몬스터 판정, HUD
import { World } from './scene3d.js?v=20261106d';
import { RIGS } from './units.js?v=20261106d';
import { HexMap, toWorld, fromWorld, key, dist as hexDist, placementCheck, lineCells, progressX } from './hex.js?v=20261106d';
import { monsterTick, previewPaths } from './rules.js?v=20261106d';
import { CLASSES, HEROES, MONSTERS, MAPS, PROTAGONIST as P, RANK_MULT, RANKS, STAR, SUMMON_STAR_RATE, SUMMON_COST, HAND_MAX, DEF_K, RANK_COLOR } from './data.js?v=20261106d';
import { slotCounts, place, CTRL, CMD, TOP, CARD_W, CARD_H } from './layout.js?v=20261106d';
import { ICON, classIcon, starsHtml } from './icons.js?v=20261106d';
import { face } from './assets.js?v=20261106d';
import { sfx } from './audio.js?v=20261106d';

const PREP_DEFAULT = 60, REST = 20;
// 3D 모델 배정: 몬스터 → 해골 군단, 영웅 → 병과별 모델 + 영웅마다 색 (같은 모델을 구분)
const MON_RIG = { goblin: 'sk_minion', orc: 'sk_warrior', skeleton: 'sk_rogue', darkknight: 'boss' };
const HERO_TINT = { toby: '#d8c4a0', sera: '#f2f4ff', roderick: '#fff1d0', hans: '#c9b7a0', bran: '#a9b8c8', nina: '#b8d4a8', elise: '#9fc8a0', marco: '#d9b48c', lian: '#e8c8f0', isolde: '#b9a6ff', amelia: '#fff8e6' };
const P_ANIM = RIGS.leon.anims;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => Math.ceil(n).toLocaleString('ko-KR');

export function heroStats(hid, star) {
  const h = HEROES[hid], c = CLASSES[h.cls], rm = RANK_MULT[h.rank], ri = RANKS.indexOf(h.rank);
  return {
    hp: c.hp * rm * STAR.hp(star), atk: c.atk * rm * STAR.atk(star), as: c.as * STAR.as(star),
    def: c.def * (1 + 0.2 * ri) * (1 + 0.15 * (star - 1)),
    range: c.range + (c.group !== 'melee' ? Math.floor((star - 1) / 2) : 0),
    heal: c.heal ? c.heal * rm * STAR.atk(star) : 0,
  };
}
const dmgAfterDef = (d, def) => d * DEF_K / (DEF_K + Math.max(0, def));

export class Battle {
  constructor(app, cfg) {
    this.app = app; this.cfg = cfg; this.def = cfg.def;
    this.mapDef = MAPS[this.def.map]; this.map = new HexMap(this.mapDef);
    this.party = cfg.party || []; this.deployMax = this.def.deploy ?? 6; this.canSummon = this.def.summon !== false && this.party.length > 0;
    this.lives = this.def.lives ?? 5; this.livesMax = this.lives; this.gold = this.def.gold ?? 100;
    this.waves = (this.def.waves || []).map(w => Array.isArray(w) ? w : [w]);
    this.waveIdx = -1; this.phase = this.def.prep === 0 ? 'starting' : 'prep'; this.phaseT = this.def.prep ?? PREP_DEFAULT;
    this.tickDur = this.def.tick || 0.8; this.tickAcc = 0; this.monsterSeq = 0; this.uidSeq = 0;
    this.monsters = []; this.heroes = []; this.hand = []; this.spawnSched = []; this.spawnQueue = []; this.spawnRow = 0;
    this.deadThisWave = []; this.floats = []; this.mode = 'control'; this.speed = app.save.settings.speed || 1;
    this.paused = false; this.playTime = 0; this.selected = null; this.preview = null; this.shake = 0; this.hitstop = 0;
    this.input = { mx: 0, mz: 0, attack: false, keys: {} }; this.drag = null; this.pointers = new Map();
    this.camFollow = true; this.lost = 0; this.ended = false; this.kills = 0; this.cardScroll = { ctrl: 0, cmd: 0 };
    this.hintStep = this.def.hint ? 0 : -1;
    this.build();
  }

  // ───────────────────────── 구성
  build() {
    const root = this.app.screen;
    root.innerHTML = '';
    this.el = document.createElement('div'); this.el.className = 'battle'; root.appendChild(this.el);
    this.canvas = document.createElement('canvas'); this.canvas.className = 'gl'; this.el.appendChild(this.canvas);
    this.ov = document.createElement('canvas'); this.ov.className = 'ov'; this.el.appendChild(this.ov);
    this.ctx = this.ov.getContext('2d');
    this.world = new World(this.canvas); this.world.buildMap(this.map);
    this.buildHud();
    this.spawnLeon();
    this.world.prewarm(['sk_minion', 'sk_warrior', 'sk_rogue', 'boss', 'sword', 'spear', 'archer', 'gunner', 'mage']);
    const s = this.map.start[0]; const w = toWorld(Math.floor(this.map.cols * 0.35), s[1]);
    this.world.setCam(this.leon.x + 2, this.leon.z, 15); this.world.cam.x = w.x; this.world.cam.z = w.z; this.world.cam.dist = 30;
    this.bindInput();
    this.onResize(); this.setMode('control');
    this.last = performance.now();
    this.raf = requestAnimationFrame(t => this.frame(t));
    if (this.phase === 'starting') this.startWave();
    if (this.hintStep === 0) this.nextHint();
  }

  spawnLeon() {
    const lane = this.map.start[Math.floor(this.map.start.length / 2)];
    const w = toWorld(Math.floor(this.map.cols * 0.55), lane[1]);
    const lv = this.app.save.leonLv || 1;
    this.leon = {
      id: 'leon', x: w.x, z: w.z, dir: { x: -1, z: 0 }, hp: P.hp * (1 + 0.1 * (lv - 1)), max: P.hp * (1 + 0.1 * (lv - 1)),
      atk: P.atk * (1 + 0.12 * (lv - 1)), def: P.def, alive: true, act: null, comboIdx: 0, comboReset: 0, queued: false,
      cd: { slam: 0, thrust: 0, whirl: 0, dodge: 0 }, run: false, guard: false, auto: false, anchor: { x: w.x, z: w.z },
      invuln: 0, holding: null, cell: null, respawnT: 0, knock: { x: 0, z: 0 }, flash: 0, lv,
    };
    this.leon.view = this.world.unit('leon'); this.leon.view.faceNow(-1, 0);
  }

  // ───────────────────────── HUD
  buildHud() {
    const h = document.createElement('div'); h.className = 'hud'; this.el.appendChild(h); this.hud = h;
    const btn = (id, icon, label, cls = '') => `<button class="hb ${cls}" data-b="${id}" aria-label="${label}"><span class="ic">${icon}</span><span class="lb">${label}</span><span class="cdv"></span></button>`;
    h.innerHTML = `
      <div class="hp-panel" data-l="hero"><div class="face" style="background-image:url(${face(P.art)})"></div>
        <div class="hp-info"><div class="nm">${P.name} <small>Lv.${this.app.save.leonLv || 1}</small></div><div class="bar"><i></i></div><div class="hpv"></div></div></div>
      <div class="top-info" data-l="info"><div class="wave"></div><div class="lives">${ICON.heart}<b></b></div><div class="deploy">${ICON.guard}<b></b></div><div class="clock"></div></div>
      <div class="gold-chip" data-l="gold">${ICON.coin}<b></b></div>
      <button class="hb speed" data-b="speed" data-l="speed"><span class="lb2"></span></button>
      <button class="hb pause" data-b="pause" data-l="pause" aria-label="일시정지"><span class="ic">${ICON.pause}</span></button>
      <div class="prep" data-l="prep"><div class="prep-t"></div><div class="prep-btns"><button class="pill" data-b="preview">${ICON.route}<span>경로 미리보기</span></button><button class="pill gold" data-b="go"><span>전투 시작</span></button></div></div>
      <div class="info-panel" data-l="panel"></div>
      <div class="joy" data-l="joystick"><div class="joy-base"></div><div class="joy-knob"></div></div>
      ${btn('auto', ICON.auto, '자동', 'ctrl small')}
      ${btn('slam', ICON.slam, '내려찍기', 'ctrl skill')}${btn('thrust', ICON.thrust, '찌르기', 'ctrl skill')}${btn('whirl', ICON.whirl, '회전베기', 'ctrl skill')}
      ${btn('attack', ICON.attack, '공격', 'ctrl attack')}
      ${btn('run', ICON.run, '달리기', 'ctrl sub')}${btn('dodge', ICON.dodge, '회피', 'ctrl sub')}${btn('guard', ICON.guard, '방어', 'ctrl sub')}
      ${btn('mode', ICON.command, '지휘', 'modeb')}
      <div class="cards ctrl-cards"><div class="track"></div></div>
      <button class="hb mini-summon ctrl" data-b="summon"><span class="ic">${ICON.summon}</span><span class="lb">소환<br><em>${SUMMON_COST}G</em></span></button>
      <div class="cards cmd-cards cmd"><div class="track"></div><div class="scrollbar"><i></i></div></div>
      ${btn('merge', ICON.merge, '일괄합성', 'cmd col')}${btn('sell', ICON.sell, '판매', 'cmd col')}
      <button class="hb big-summon cmd" data-b="summon"><span class="ic">${ICON.summon}</span><span class="lb">영웅 소환</span><em>${ICON.coin}${SUMMON_COST}</em><span class="cnt"></span></button>
      <div class="tip"></div><div class="shout"></div><div class="toast"></div>
      <div class="ghost"></div>`;
    this.q = s => h.querySelector(s);
    this.ghost = this.q('.ghost');
    if (!this.canSummon) h.classList.add('no-summon');
  }

  layoutEnv() {
    const W = this.app.W, H = this.app.H, ins = this.app.insets, ui = this.app.save.settings.ui || 1;
    const sc = slotCounts(W, H, ins.l, ins.r, ui);
    return { W, H, S: sc.S, inL: ins.l, inR: ins.r, inT: ins.t, inB: ins.b, slots: sc };
  }
  onResize() {
    const W = this.app.W, H = this.app.H; const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.world.resize(W, H); this.ov.width = W * dpr; this.ov.height = H * dpr; this.ov.style.width = W + 'px'; this.ov.style.height = H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const env = this.env = this.layoutEnv(); const S = env.S;
    this.hud.style.setProperty('--s', S);
    const setR = (el, r) => { el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px'; };
    const pl = (name, def) => place(def, def.a, def.v, env);
    for (const [k, d] of Object.entries(TOP)) { const el = this.q(`[data-l="${k}"]`); if (el) setR(el, pl(k, d)); }
    setR(this.q('.joy'), pl('joystick', CTRL.joystick));
    for (const k of ['auto', 'slam', 'thrust', 'whirl', 'attack', 'run', 'dodge', 'guard']) setR(this.q(`[data-b="${k}"]`), pl(k, CTRL[k]));
    setR(this.q('.modeb'), pl('mode', CTRL.mode));
    setR(this.q('[data-b="merge"]'), pl('merge', CMD.merge)); setR(this.q('[data-b="sell"]'), pl('sell', CMD.sell));
    setR(this.q('.big-summon'), pl('summon', CMD.summon));
    // 조작 모드 카드 묶음: 자동(367.4+8) ~ 내려찍기(V−578−8) 사이 중심 유지, 카드 N장 + 소환 96
    const n = env.slots.ctrl, cw = CARD_W * S, ch = CARD_H * S, gap = 8 * S;
    const leftB = env.inL + (367.4 + 8) * S, rightB = env.W - env.inR - (578 + 8) * S;
    const groupW = n * (cw + gap) + 88 * S; const cx = (leftB + rightB) / 2;
    const gx = cx - groupW / 2, gy = env.H - env.inB - (8 + 135.9) * S;
    const cc = this.q('.ctrl-cards'); setR(cc, { x: gx, y: gy, w: Math.max(0, n * (cw + gap) - gap), h: ch });
    setR(this.q('.mini-summon'), { x: gx + n * (cw + gap), y: env.H - env.inB - (8 + 88) * S, w: 88 * S, h: 88 * S });
    // 지휘 모드 카드 줄: 왼쪽 24부터 N장, 간격 10
    const m = env.slots.cmd, g2 = 10 * S;
    setR(this.q('.cmd-cards'), { x: env.inL + 24 * S, y: env.H - env.inB - (14 + 135.9) * S, w: Math.max(0, m * cw + (m - 1) * g2), h: ch + 10 * S });
    this.cardW = cw; this.cardH = ch; this.renderCards();
    // 개발용 표시 (?dev=1): 남는 폭·칸 수 (출시 화면에서는 꺼짐)
    if (this.app.dev) {
      let d = this.q('.devinfo'); if (!d) { d = document.createElement('div'); d.className = 'devinfo'; this.hud.appendChild(d); }
      const sc = env.slots, boxW = this.q(this.mode === 'command' ? '.cmd-cards' : '.ctrl-cards').getBoundingClientRect().width;
      d.textContent = `${W}×${H} · S=${S.toFixed(3)} · 조작 카드 ${sc.ctrl}칸(남는 폭 ${sc.ctrlRemain.toFixed(1)}) · 지휘 카드 ${sc.cmd}칸(남는 폭 ${sc.cmdRemain.toFixed(1)}) · 표시 폭 ${boxW.toFixed(0)}px`;
    }
  }

  setMode(m) {
    this.mode = m; this.hud.dataset.mode = m;
    const mb = this.q('.modeb'); mb.querySelector('.ic').innerHTML = m === 'control' ? ICON.command : ICON.control; mb.querySelector('.lb').textContent = m === 'control' ? '지휘' : '조작';
    if (m === 'command') { this.leon.anchor = { x: this.leon.x, z: this.leon.z }; this.input.mx = this.input.mz = 0; this.input.attack = false; this.leon.guard = false; this.world.cam.tdist = Math.max(this.world.cam.tdist, 30); this.camFollow = false; }
    else { this.camFollow = true; this.world.cam.tdist = 15; }
    this.renderCards(); this.hintEvent('mode');
  }

  // 카드 렌더 (대기 카드 최대 16장, 칸 수만큼 보이고 좌우 스크롤)
  cardHtml(c, i) {
    const h = HEROES[c.hid];
    return `<div class="card r-${h.rank}${c.over ? ' over' : ''}${this.selected && this.selected.card === c ? ' sel' : ''}" data-i="${i}" style="width:${this.cardW}px;height:${this.cardH}px">
      <div class="art" style="background-image:url(${face(h.art)})"></div><div class="rk">${h.rank}</div><div class="cl">${classIcon(h.cls)}</div>
      <div class="nm">${h.name}</div>${starsHtml(c.star)}</div>`;
  }
  renderCards() {
    if (!this.env) return;
    const S = this.env.S;
    for (const [sel, kind, gap] of [['.ctrl-cards', 'ctrl', 8], ['.cmd-cards', 'cmd', 10]]) {
      const box = this.q(sel), tr = box.querySelector('.track');
      const n = kind === 'ctrl' ? this.env.slots.ctrl : this.env.slots.cmd;
      let html = this.hand.map((c, i) => this.cardHtml(c, i)).join('');
      for (let i = this.hand.length; i < n; i++) html += `<div class="card empty" style="width:${this.cardW}px;height:${this.cardH}px"><span>${i + 1}</span></div>`;
      tr.innerHTML = html; tr.style.gap = gap * S + 'px';
      const total = Math.max(this.hand.length, n), maxScroll = Math.max(0, total * (this.cardW + gap * S) - gap * S - box.clientWidth);
      this.cardScroll[kind] = clamp(this.cardScroll[kind], 0, maxScroll); tr.style.transform = `translateX(${-this.cardScroll[kind]}px)`;
      if (kind === 'cmd') { const sb = box.querySelector('.scrollbar i'); const vis = box.clientWidth / Math.max(box.clientWidth, total * (this.cardW + gap * S)); sb.style.width = vis * 100 + '%'; sb.style.left = (maxScroll ? this.cardScroll[kind] / maxScroll * (1 - vis) * 100 : 0) + '%'; box.querySelector('.scrollbar').style.opacity = maxScroll ? 1 : 0; }
    }
    const cnt = this.q('.big-summon .cnt'); cnt.textContent = `보유 ${this.hand.filter(c => !c.over).length}/${HAND_MAX}`;
    const full = this.hand.filter(c => !c.over).length >= HAND_MAX;
    this.hud.querySelectorAll('[data-b="summon"]').forEach(b => b.classList.toggle('off', full || this.gold < SUMMON_COST));
    this.q('[data-b="merge"]').classList.toggle('off', !this.mergePairs().length);
  }

  // ───────────────────────── 입력
  bindInput() {
    const h = this.hud;
    const btnDown = (b, e) => {
      const id = b.dataset.b; sfx('ui', 0.5);
      if (id === 'attack') { this.input.attack = true; this.leonAttackPress(); b.setPointerCapture(e.pointerId); }
      else if (id === 'slam' || id === 'thrust' || id === 'whirl') this.leonSkill(id);
      else if (id === 'dodge') this.leonDodge();
      else if (id === 'guard') { this.leon.guard = true; b.setPointerCapture(e.pointerId); }
      else if (id === 'run') { this.leon.run = !this.leon.run; }
      else if (id === 'auto') { this.leon.auto = !this.leon.auto; this.leon.anchor = { x: this.leon.x, z: this.leon.z }; this.camFollow = true; }
      else if (id === 'mode') this.setMode(this.mode === 'control' ? 'command' : 'control');
      else if (id === 'summon') this.summon();
      else if (id === 'merge') this.batchMerge();
      else if (id === 'sell') this.sellSelected();
      else if (id === 'speed') { this.speed = this.speed === 1 ? 2 : 1; this.app.save.settings.speed = this.speed; this.app.persist(); }
      else if (id === 'pause') this.openPause();
      else if (id === 'go') this.startWave();
      else if (id === 'preview') this.showPreview();
    };
    h.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-b]'); if (b && !b.classList.contains('off')) { e.preventDefault(); e.stopPropagation(); btnDown(b, e); return; }
      if (b) { e.stopPropagation(); if (b.dataset.b === 'summon') this.toastMsg(this.gold < SUMMON_COST ? '골드가 부족합니다' : `대기 카드가 가득 찼습니다 (${HAND_MAX}장)`); if (b.dataset.b === 'merge') this.toastMsg('합성할 짝이 없습니다'); return; }
      const card = e.target.closest('.card:not(.empty)');
      if (card) { e.preventDefault(); this.cardDown(card, e); return; }
    });
    const up = e => { const b = e.target.closest && e.target.closest('[data-b]'); if (b) { if (b.dataset.b === 'attack') this.input.attack = false; if (b.dataset.b === 'guard') this.leon.guard = false; } };
    h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    h.addEventListener('lostpointercapture', up);
    // 전장(빈 땅·유닛) 입력
    const L = this.ov; L.style.touchAction = 'none'; this.el.style.touchAction = 'none';
    this.el.addEventListener('pointerdown', e => { if (e.target !== this.ov && e.target !== this.hud && !e.target.classList.contains('joy')) return; this.fieldDown(e); });
    this._move = e => this.pointerMove(e); this._up = e => this.pointerUp(e);
    window.addEventListener('pointermove', this._move); window.addEventListener('pointerup', this._up); window.addEventListener('pointercancel', this._up);
    this._wheel = e => { e.preventDefault(); this.world.cam.tdist *= e.deltaY > 0 ? 1.1 : 0.9; }; this.el.addEventListener('wheel', this._wheel, { passive: false });
    this._kd = e => this.key(e, true); this._ku = e => this.key(e, false);
    window.addEventListener('keydown', this._kd); window.addEventListener('keyup', this._ku);
    this._vis = () => { if (document.hidden && !this.paused && !this.ended) this.openPause(); }; document.addEventListener('visibilitychange', this._vis);
  }
  key(e, down) {
    if (this.ended) return; const k = e.key.toLowerCase(); this.input.keys[k] = down;
    if (!down) { if (k === 'j') this.input.attack = false; if (k === 'f') this.leon.guard = false; return; }
    if (e.repeat) return;
    if (k === 'escape') { this.paused ? this.closePause() : this.openPause(); return; }
    if (this.paused) return;
    if (k === 'j') { this.input.attack = true; this.leonAttackPress(); }
    if (k === 'u') this.leonSkill('slam'); if (k === 'i') this.leonSkill('thrust'); if (k === 'o') this.leonSkill('whirl');
    if (k === ' ') { e.preventDefault(); this.leonDodge(); }
    if (k === 'f') this.leon.guard = true; if (k === 'shift') this.leon.run = !this.leon.run;
    if (k === 'tab') { e.preventDefault(); this.setMode(this.mode === 'control' ? 'command' : 'control'); }
    if (k === 'r') this.summon();
  }
  inRect(el, x, y) { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  fieldDown(e) {
    if (this.paused || this.ended) return;
    const x = e.clientX, y = e.clientY;
    if (this.mode === 'control' && this.inRect(this.q('.joy'), x, y) && !this.joyId) {
      this.joyId = e.pointerId; const r = this.q('.joy').getBoundingClientRect(); this.joyC = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width * 0.36 };
      this.updateJoy(x, y); this.q('.joy').classList.add('on'); return;
    }
    this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, moved: false, unit: this.unitAt(x, y) });
    if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: this.world.cam.tdist }; }
  }
  updateJoy(x, y) {
    const c = this.joyC; let dx = x - c.x, dy = y - c.y; const L = Math.hypot(dx, dy); if (L > c.R) { dx *= c.R / L; dy *= c.R / L; }
    this.q('.joy-knob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const m = Math.hypot(dx, dy) / c.R; this.input.mx = m > 0.18 ? dx / c.R : 0; this.input.mz = m > 0.18 ? dy / c.R : 0;
    if (m > 0.18) { if (this.leon.auto) { this.leon.auto = false; } this.camFollow = true; }
  }
  pointerMove(e) {
    const x = e.clientX, y = e.clientY;
    if (e.pointerId === this.joyId) { this.updateJoy(x, y); return; }
    if (this.drag && this.drag.pid === e.pointerId) { this.dragMove(x, y); return; }
    if (this.cardPend && this.cardPend.pid === e.pointerId) { this.cardMove(x, y); return; }
    const p = this.pointers.get(e.pointerId); if (!p) return;
    const px = p.x, py = p.y; p.x = x; p.y = y;
    if (Math.hypot(x - p.sx, y - p.sy) > 10 * (this.env?.S * 2 || 1)) p.moved = true;
    if (this.pointers.size >= 2 && this.pinch) { const [a, b] = [...this.pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); this.world.cam.tdist = this.pinch.dist * this.pinch.d / Math.max(20, d); return; }
    if (!p.moved) return;
    if (p.unit && p.unit.kind === 'hero' && !this.dragBlocked()) { this.pointers.delete(e.pointerId); this.beginDrag({ type: 'hero', hero: p.unit.ref }, e.pointerId, x, y); return; }
    const a = this.world.pick(px, py), b = this.world.pick(x, y);
    if (a && b) { this.world.cam.tx += a.x - b.x; this.world.cam.tz += a.z - b.z; this.world.cam.x += a.x - b.x; this.world.cam.z += a.z - b.z; this.camFollow = false; }
  }
  pointerUp(e) {
    if (e.pointerId === this.joyId) { this.joyId = null; this.input.mx = this.input.mz = 0; this.q('.joy-knob').style.transform = 'translate(-50%,-50%)'; this.q('.joy').classList.remove('on'); return; }
    if (this.drag && this.drag.pid === e.pointerId) { this.endDrag(e.clientX, e.clientY); return; }
    if (this.cardPend && this.cardPend.pid === e.pointerId) { const cp = this.cardPend; this.cardPend = null; if (!cp.decided) this.selectCard(cp.card); return; }
    const p = this.pointers.get(e.pointerId); this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch = null;
    if (p && !p.moved) this.tapSelect(p.unit);
  }
  dragBlocked() { return this.paused || this.ended; }

  // 화면 좌표의 유닛 찾기 (영웅·몬스터·주인공)
  unitAt(x, y) {
    let best = null, bd = 1e9;
    const test = (wx, wz, hgt, kind, ref) => { const a = this.world.project(wx, hgt * 0.45, wz); const d = Math.hypot(a.x - x, a.y - y); const lim = Math.max(28, this.world.h * 0.045); if (d < lim && d < bd) { bd = d; best = { kind, ref }; } };
    for (const hh of this.heroes) if (hh.alive) test(hh.x, hh.z, 1.9, 'hero', hh);
    for (const m of this.monsters) if (m.alive) test(m.vx, m.vz, 1.6, 'monster', m);
    if (this.leon.alive) test(this.leon.x, this.leon.z, 2.2, 'leon', this.leon);
    return best;
  }
  tapSelect(u) {
    if (!u) { this.selected = null; this.renderPanel(); this.renderCards(); return; }
    if (this.selected && this.selected.ref === u.ref) { this.selected = null; } else this.selected = u;
    this.renderPanel(); this.renderCards();
  }
  selectCard(c) { if (this.selected && this.selected.card === c) this.selected = null; else this.selected = { kind: 'card', card: c }; this.renderPanel(); this.renderCards(); }

  // 카드 누름: 처음 움직인 방향이 가로면 스크롤, 위쪽이면 배치 드래그
  cardDown(cardEl, e) {
    const i = +cardEl.dataset.i; const c = this.hand[i]; if (!c) return;
    const box = cardEl.closest('.cards'); const kind = box.classList.contains('ctrl-cards') ? 'ctrl' : 'cmd';
    this.cardPend = { pid: e.pointerId, card: c, sx: e.clientX, sy: e.clientY, lx: e.clientX, decided: null, kind };
  }
  cardMove(x, y) {
    const cp = this.cardPend; const dx = x - cp.sx, dy = y - cp.sy;
    if (!cp.decided) {
      const th = 12; if (Math.hypot(dx, dy) < th) return;
      if (Math.abs(dx) > Math.abs(dy)) cp.decided = 'scroll'; else if (dy < 0 && !this.dragBlocked()) { cp.decided = 'drag'; this.cardPend = null; this.beginDrag({ type: 'card', card: cp.card }, cp.pid, x, y); return; } else cp.decided = 'none';
    }
    if (cp.decided === 'scroll') { this.cardScroll[cp.kind] -= x - cp.lx; cp.lx = x; this.renderCards(); }
  }

  // ───────────────────────── 드래그 배치·이동·합성
  beginDrag(src, pid, x, y) {
    const hid = src.type === 'card' ? src.card.hid : src.hero.hid, star = src.type === 'card' ? src.card.star : src.hero.star;
    this.drag = { ...src, pid, x, y, hid, star, cell: null, ok: false };
    const h = HEROES[hid];
    this.ghost.innerHTML = `<div class="g-art" style="background-image:url(assets/${h.art}.webp)"></div>`;
    this.ghost.style.display = 'block';
    this.selected = null; this.renderPanel();
    // 유효 칸 미리 계산
    const heroCells = new Set(this.heroes.filter(hh => hh.alive && hh !== src.hero).map(hh => key(hh.c, hh.r)));
    const monCells = new Set(this.monsters.filter(m => m.alive).map(m => key(m.c, m.r)));
    this.drag.valid = new Map();
    for (const [c, r] of this.map.cells()) this.drag.valid.set(key(c, r), placementCheck(this.map, heroCells, monCells, c, r));
    if (this.mode === 'control') { this.drag.prevDist = this.world.cam.tdist; this.world.cam.tdist = Math.max(this.world.cam.tdist, 32); }
    this.dragMove(x, y);
  }
  dragMove(x, y) {
    const d = this.drag; d.x = x; d.y = y;
    const sz = this.cardH * 1.1; this.ghost.style.width = sz * 0.7 + 'px'; this.ghost.style.height = sz + 'px';
    this.ghost.style.transform = `translate(${x - sz * 0.35}px, ${y - sz * 0.95}px)`;
    d.overCard = null; d.overSell = false; d.cell = null; d.merge = null;
    const el = document.elementFromPoint(x, y);
    const cardEl = el && el.closest && el.closest('.card:not(.empty)');
    if (cardEl) { const c = this.hand[+cardEl.dataset.i]; if (c && c !== d.card && c.hid === d.hid && c.star === d.star && d.star < 5) d.overCard = c; this.ghost.classList.toggle('bad', !d.overCard); return; }
    if (this.mode === 'command' && el && el.closest && el.closest('[data-b="sell"]')) { d.overSell = true; this.ghost.classList.remove('bad'); return; }
    const p = this.world.pick(x, y); if (!p) return;
    const [c, r] = fromWorld(p.x, p.z); d.cell = [c, r];
    const tgt = this.heroes.find(hh => hh.alive && hh.c === c && hh.r === r && hh !== d.hero);
    if (tgt) { d.merge = tgt.hid === d.hid && tgt.star === d.star && d.star < 5 ? tgt : null; d.ok = !!d.merge; d.why = d.merge ? '' : '합성 불가 (같은 영웅·같은 성급만)'; }
    else { const v = d.valid.get(key(c, r)); d.ok = v ? v.ok : false; d.why = v ? v.why : '맵 밖';
      if (d.ok && d.type === 'card' && this.heroes.length >= this.deployMax) { d.ok = false; d.why = `배치 한도 ${this.deployMax}명 (합성·판매로 자리 확보)`; } }
    this.ghost.classList.toggle('bad', !d.ok);
  }
  endDrag(x, y) {
    const d = this.drag; this.drag = null; this.ghost.style.display = 'none';
    if (this.mode === 'control' && d.prevDist) this.world.cam.tdist = d.prevDist;
    if (d.overSell && d.type === 'hero') { this.sellHero(d.hero); return; }
    if (d.overSell && d.type === 'card') { this.sellCard(d.card); return; }
    if (d.overCard) { // 카드에 겹쳐 합성
      if (d.type === 'card') { this.removeCard(d.card); this.removeCard(d.overCard); this.addCard({ hid: d.hid, star: d.star + 1, invested: d.card.invested + d.overCard.invested }); }
      else { this.removeCard(d.overCard); this.removeHero(d.hero, false); this.addCard({ hid: d.hid, star: d.star + 1, invested: d.hero.invested + d.overCard.invested }); }
      this.mergeFx(); return;
    }
    if (!d.cell) return;
    if (d.merge) {
      const t = d.merge; const inv = d.type === 'card' ? d.card.invested : d.hero.invested;
      if (d.type === 'card') this.removeCard(d.card); else this.removeHero(d.hero, false);
      this.upgradeHero(t, inv); return;
    }
    if (!d.ok) { if (d.why) this.toastMsg('배치 불가: ' + d.why); return; }
    const [c, r] = d.cell;
    if (d.type === 'card') { this.removeCard(d.card); this.placeHero(d.hid, d.star, c, r, d.card.invested); this.hintEvent('place'); }
    else this.moveHero(d.hero, c, r);
  }

  // ───────────────────────── 카드·영웅 관리
  addCard(c) { this.hand.push(c); this.renderCards(); }
  removeCard(c) { const i = this.hand.indexOf(c); if (i >= 0) this.hand.splice(i, 1); if (this.selected && this.selected.card === c) { this.selected = null; this.renderPanel(); } this.renderCards(); }
  summon() {
    if (!this.canSummon) return;
    const n = this.hand.filter(c => !c.over).length;
    if (n >= HAND_MAX) { this.toastMsg(`대기 카드가 가득 찼습니다 (${HAND_MAX}장)`); return; }
    if (this.gold < SUMMON_COST) { this.toastMsg('골드가 부족합니다'); return; }
    this.gold -= SUMMON_COST;
    const hid = this.party[Math.floor(Math.random() * this.party.length)];
    let r = Math.random(), star = 1; const rates = SUMMON_STAR_RATE;
    // 5성 0.2% · 4성 1% · 3성 5% · 2성 30% · 나머지 1성
    if (r < rates[4]) star = 5; else if (r < rates[4] + rates[3]) star = 4; else if (r < rates[4] + rates[3] + rates[2]) star = 3; else if (r < rates[4] + rates[3] + rates[2] + rates[1]) star = 2;
    this.addCard({ hid, star, invested: SUMMON_COST }); sfx('summon');
    this.toastMsg(`${HEROES[hid].name} ${star}성 소환!`, 900); this.hintEvent('summon');
  }
  mergePairs() { // 대기 카드끼리 왼쪽부터 같은 영웅·같은 성급 짝
    const used = new Set(), pairs = [];
    for (let i = 0; i < this.hand.length; i++) { if (used.has(i) || this.hand[i].star >= 5 || this.hand[i].over) continue;
      for (let j = i + 1; j < this.hand.length; j++) if (!used.has(j) && !this.hand[j].over && this.hand[j].hid === this.hand[i].hid && this.hand[j].star === this.hand[i].star) { used.add(i); used.add(j); pairs.push([this.hand[i], this.hand[j]]); break; } }
    return pairs;
  }
  batchMerge() {
    const pairs = this.mergePairs(); if (!pairs.length) return;
    for (const [a, b] of pairs) { this.hand.splice(this.hand.indexOf(a), 1); this.hand.splice(this.hand.indexOf(b), 1); }
    for (const [a, b] of pairs) this.hand.push({ hid: a.hid, star: a.star + 1, invested: a.invested + b.invested });
    this.renderCards(); this.mergeFx(); this.toastMsg(`${pairs.length}쌍 합성 완료`);
  }
  mergeFx() { sfx('summon'); }
  placeHero(hid, star, c, r, invested) {
    const st = heroStats(hid, star); const w = toWorld(c, r); const h = HEROES[hid];
    const hero = { uid: ++this.uidSeq, hid, star, c, r, x: w.x, z: w.z, hp: st.hp, max: st.hp, st, cls: h.cls, cd: 0.3, holding: null, alive: true, invested, onPath: this.map.isPath(c, r), anim: 0, flash: 0, charged: null };
    hero.view = this.world.unit(h.cls, { tint: HERO_TINT[hid] }); hero.view.faceNow(-1, 0); hero.view.play('cheer', { dur: 0.9 });
    this.heroes.push(hero); this.world.ring(w.x, w.z, 1.4, '#ffe08a', 0.5); sfx('summon', 0.6);
    return hero;
  }
  upgradeHero(t, inv) {
    t.star++; t.st = heroStats(t.hid, t.star); t.max = t.st.hp; t.hp = t.max; t.invested += inv;
    this.world.ring(t.x, t.z, 1.6, '#ffd34d', 0.6); this.world.spriteFx('glow', '#ffe9a0', t.x, 1.2, t.z, 3, 0.5); sfx('summon');
    this.toastMsg(`${HEROES[t.hid].name} ${t.star}성 진급!`, 900); this.renderPanel();
  }
  moveHero(hh, c, r) {
    this.releaseHold(hh); const w = toWorld(c, r); hh.c = c; hh.r = r; hh.x = w.x; hh.z = w.z; hh.onPath = this.map.isPath(c, r);
    this.world.ring(w.x, w.z, 1.2, '#9fd4ff', 0.35);
  }
  removeHero(hh, died) {
    this.releaseHold(hh); hh.alive = false; if (died) this.world.dieUnit(hh.view); else this.world.removeUnit(hh.view); this.heroes.splice(this.heroes.indexOf(hh), 1);
    if (this.selected && this.selected.ref === hh) { this.selected = null; this.renderPanel(); }
    if (died) this.deadThisWave.push({ hid: hh.hid, star: hh.star, invested: hh.invested });
  }
  releaseHold(u) { if (u.holding != null) { const m = this.monsters.find(mm => mm.id === u.holding); if (m) m.held = null; u.holding = null; } }
  sellHero(hh) { const v = Math.floor(hh.invested / 2); this.gold += v; this.removeHero(hh, false); sfx('coin'); this.toastMsg(`판매 +${v}G`); }
  sellCard(c) { const v = Math.floor(c.invested / 2); this.gold += v; this.removeCard(c); sfx('coin'); this.toastMsg(`판매 +${v}G`); }
  sellSelected() {
    const s = this.selected; if (!s) { this.toastMsg('판매할 영웅이나 카드를 먼저 선택하세요'); return; }
    if (s.kind === 'hero') this.sellHero(s.ref); else if (s.kind === 'card') this.sellCard(s.card); else this.toastMsg('주인공·몬스터는 판매할 수 없습니다');
    this.selected = null; this.renderPanel();
  }

  // ───────────────────────── 웨이브
  startWave() {
    if (this.phase !== 'prep' && this.phase !== 'rest' && this.phase !== 'starting') return;
    // 준비 시간이 끝날 때 넘친 카드는 자동 판매
    const over = this.hand.filter(c => c.over); for (const c of over) { this.gold += Math.floor(c.invested / 2); this.removeCard(c); }
    this.waveIdx++; this.phase = 'wave'; this.preview = null;
    const wave = this.waves[this.waveIdx]; let t = 0.5;
    for (const g of wave) for (let i = 0; i < g.count; i++) { this.spawnSched.push({ t, type: g.type }); t += g.interval; }
    this.waveClock = 0; this.deadThisWave = [];
    this.bannerMsg(`웨이브 ${this.waveIdx + 1} / ${this.waves.length}`);
    if (this.waveIdx === 0) this.playStart = true;
  }
  waveCleared() {
    const bonus = 30 + 10 * this.waveIdx; this.gold += bonus; sfx('coin');
    this.floats.push({ text: `웨이브 클리어 +${bonus}G`, x: this.app.W / 2, y: this.app.H * 0.3, t: 0, life: 1.6, screen: true, color: '#ffd34d', size: 1.4 });
    // 라운드 종료: 이번 웨이브에 쓰러진 영웅을 대기 카드로 복귀 (넘치면 넘침 표시)
    for (const d of this.deadThisWave) { const over = this.hand.filter(c => !c.over).length >= HAND_MAX; this.hand.push({ ...d, over }); }
    this.deadThisWave = []; this.renderCards();
    if (this.waveIdx >= this.waves.length - 1) { this.finish(true); return; }
    this.phase = 'rest'; this.phaseT = REST;
  }

  spawnMonster(type) {
    const def = MONSTERS[type]; const hpMul = (this.def.hpMul || 1) * (1 + 0.12 * Math.max(0, this.waveIdx));
    const m = { id: ++this.monsterSeq, type, md: def, order: this.monsterSeq, hp: def.hp * hpMul, max: def.hp * hpMul, atk: def.atk * (1 + 0.08 * Math.max(0, this.waveIdx)), def: def.def,
      as: def.as, cd: 0.5, held: null, wait: null, alive: true, stun: 0, diagPref: 0, flash: 0, knock: { x: 0, z: 0 }, lunge: 0, deadT: 0 };
    this.spawnQueue.push(m);
  }
  placeSpawns() {
    if (!this.spawnQueue.length) return;
    const occ = new Set(this.monsters.filter(m => m.alive).map(m => key(m.c, m.r)));
    for (const h of this.heroes) if (h.alive) occ.add(key(h.c, h.r));
    const starts = this.map.start;
    for (let tries = 0; tries < starts.length && this.spawnQueue.length; tries++) {
      const [c, r] = starts[this.spawnRow % starts.length]; this.spawnRow++;
      if (occ.has(key(c, r))) continue;
      const m = this.spawnQueue.shift(); m.c = c; m.r = r; m.pc = c - 1; m.pr = r; m.moveT = 0; occ.add(key(c, r));
      const w = toWorld(c, r); m.vx = w.x - 1.7; m.vz = w.z;
      m.view = this.world.unit(MON_RIG[m.type], { scale: m.md.scale }); m.view.faceNow(1, 0); m.view.play('spawn', { dur: 0.75 }); this.world.spriteFx('glow', '#7a5cff', m.vx + 1.7, 0.3, m.vz, 2.2, 0.5, { grow: 1.6 });
      this.monsters.push(m);
    }
  }

  // ───────────────────────── 메인 루프
  frame(t) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(tt => this.frame(tt));
    let rdt = clamp((t - this.last) / 1000, 0, 0.05); this.last = Math.max(this.last, t);
    if (this.paused) { this.world.render(); return; }
    if (this.hitstop > 0) { this.hitstop -= rdt; rdt *= 0.08; }
    const slow = this.drag && this.mode === 'control' ? 0.5 : 1;
    const dt = rdt * this.speed * slow;
    if (this.playStart && !this.ended) this.playTime += rdt / (this.hitstop > 0 ? 0.08 : 1);
    this.update(dt, rdt);
    this.world.updateFx(dt); this.world.updateUnits(dt);
    this.shake = Math.max(0, this.shake - rdt * 2.5);
    if (this.camFollow && this.mode === 'control' && this.leon.alive) { this.world.cam.tx = this.leon.x; this.world.cam.tz = this.leon.z - 0.5; }
    this.world.setGrid(this.mode === 'command' || !!this.drag); // 육각 격자는 배치할 때만 표시
    this.world.updateCam(rdt, this.shake * 0.6);
    this.world.render();
    this.drawOverlay(rdt);
    this.updateHud();
  }

  // 검증용: 화면 갱신 없이 시뮬레이션을 고정 간격으로 진행
  simulate(sec, step = 1 / 30) {
    for (let t = 0; t < sec && !this.ended; t += step) { this.update(step * this.speed, step); this.world.updateFx(step); this.world.updateUnits(step * this.speed); if (this.playStart) this.playTime += step; }
    if (this.camFollow && this.mode === 'control') { this.world.cam.tx = this.leon.x; this.world.cam.tz = this.leon.z - 0.5; }
    this.world.updateCam(1); this.world.render(); this.drawOverlay(0); this.updateHud();
  }

  update(dt, rdt) {
    if (this.ended) { this.updateViews(dt); return; }
    if (this.phase === 'prep' || this.phase === 'rest') { this.phaseT -= dt; if (this.phaseT <= 0) this.startWave(); }
    if (this.phase === 'wave') {
      this.waveClock += dt;
      while (this.spawnSched.length && this.spawnSched[0].t <= this.waveClock) this.spawnMonster(this.spawnSched.shift().type);
    }
    this.updateLeon(dt);
    this.tickAcc += dt;
    if (this.tickAcc >= this.tickDur) { this.tickAcc -= this.tickDur; this.gridTick(); }
    this.updateHeroes(dt);
    this.updateMonsters(dt);
    this.updateViews(dt);
    if (this.phase === 'wave' && !this.spawnSched.length && !this.spawnQueue.length && !this.monsters.some(m => m.alive)) this.waveCleared();
  }

  // 격자 판정 틱 (참조 정본 부록 A)
  gridTick() {
    const L = this.leon;
    // 붙잡힘 유효성: 잡고 있는 유닛이 살아 있고 몬스터 직진 칸에 그대로 있어야 한다
    for (const m of this.monsters) {
      if (!m.alive || m.held == null) continue;
      const holder = m.held === 'leon' ? (L.alive ? L : null) : this.heroes.find(h => h.uid === m.held && h.alive);
      const ok = holder && holder.holding === m.id && (m.held === 'leon' ? L.cell && L.cell[0] === m.c + 1 && L.cell[1] === m.r : holder.c === m.c + 1 && holder.r === m.r && holder.onPath);
      if (!ok) { m.held = null; if (holder) holder.holding = null; }
    }
    if (L.holding != null && !this.monsters.some(m => m.alive && m.id === L.holding)) L.holding = null;
    for (const h of this.heroes) if (h.holding != null && !this.monsters.some(m => m.alive && m.id === h.holding)) h.holding = null;
    const live = this.monsters.filter(m => m.alive && m.stun <= 0);
    const stunned = this.monsters.filter(m => m.alive && m.stun > 0);
    const heroesOnPath = this.heroes.filter(h => h.alive && h.onPath).map(h => ({ id: h.uid, c: h.c, r: h.r, get holding() { return h.holding; }, set holding(v) { h.holding = v; } }));
    const monCells = new Set(this.monsters.filter(m => m.alive).map(m => key(m.c, m.r)));
    if (L.alive && L.cell && this.map.isPath(...L.cell) && !monCells.has(key(...L.cell)) && !this.heroes.some(h => h.alive && h.c === L.cell[0] && h.r === L.cell[1]))
      heroesOnPath.push({ id: 'leon', c: L.cell[0], r: L.cell[1], get holding() { return L.holding; }, set holding(v) { L.holding = v; } });
    // 기절한 몬스터는 이번 틱 움직이지 않는 장애물로 취급 (붙잡힌 것처럼 판정에서 제외)
    const proxy = [...live, ...stunned.map(m => ({ ...m, held: 'stun' }))];
    const before = new Map(live.map(m => [m.id, [m.c, m.r]]));
    const ev = monsterTick({ map: this.map, monsters: proxy, heroes: heroesOnPath });
    for (const m of live) { m.wait = ev.wait[m.id] ?? null; const b = before.get(m.id); if (b[0] !== m.c || b[1] !== m.r) { m.pc = b[0]; m.pr = b[1]; m.moveT = 0; } }
    for (const id of ev.exits) {
      const m = this.monsters.find(mm => mm.id === id); if (!m) continue;
      m.alive = false; m.exited = true; this.world.removeUnit(m.view);
      if (!this.def.noFail) { this.lives--; this.lost++; this.shake = 0.6; sfx('lose', 0.6); this.floats.push({ text: '생명 -1', x: this.app.W / 2, y: this.app.H * 0.22, t: 0, life: 1.2, screen: true, color: '#ff6a5a', size: 1.3 }); }
      else { this.shout('놓치면 안 돼! 주민들이 위험해!'); }
      if (this.lives <= 0) { this.finish(false); return; }
    }
    this.monsters = this.monsters.filter(m => m.alive || m.deadT > 0);
    this.placeSpawns();
  }

  // ───────────────────────── 주인공
  nearestMonster(x, z, maxD) { let b = null, bd = maxD; for (const m of this.monsters) { if (!m.alive) continue; const d = Math.hypot(m.vx - x, m.vz - z); if (d < bd) { bd = d; b = m; } } return b; }
  faceTo(L, tx, tz) { const dx = tx - L.x, dz = tz - L.z, d = Math.hypot(dx, dz); if (d > 0.01) L.dir = { x: dx / d, z: dz / d }; }
  leonAttackPress() {
    const L = this.leon; if (!L.alive) return;
    if (L.act && L.act.kind === 'combo') { L.queued = true; return; }
    if (L.act) { L.queued = true; return; }
    this.startCombo();
  }
  startCombo() {
    const L = this.leon; const step = P.combo[L.comboIdx];
    const tgt = this.nearestMonster(L.x, L.z, step.reach + 1.2); if (tgt) this.faceTo(L, tgt.vx, tgt.vz);
    L.act = { kind: 'combo', t: 0, dur: step.dur, step, hit: false }; L.queued = false; sfx('swing', 0.8);
    L.view.play('combo', { name: P_ANIM.combo[L.comboIdx], dur: step.dur * 1.35 });
    this.hintEvent('attack');
  }
  leonSkill(id) {
    const L = this.leon; if (!L.alive || L.cd[id] > 0 || (L.act && L.act.kind !== 'combo')) return;
    const sk = P.skills[id];
    const reach = id === 'thrust' ? sk.length : id === 'slam' ? sk.radius + 1 : sk.radius + 0.5;
    const tgt = this.nearestMonster(L.x, L.z, reach + 0.5); if (tgt) this.faceTo(L, tgt.vx, tgt.vz);
    L.act = { kind: id, t: 0, dur: sk.dur, sk, hit: false, hitSet: new Set(), n: 0 }; L.cd[id] = sk.cd; L.guard = false;
    if (id === 'whirl') L.view.play(id, { hold: true, speed: 1.6 }); else L.view.play(id, { dur: sk.dur * (id === 'slam' ? 1.5 : 1.3) });
    if (id === 'whirl') sfx('swing'); if (id === 'thrust') { sfx('swing'); this.world.afterimage(L.view, 0.5); }
    this.hintEvent(id);
  }
  leonDodge() {
    const L = this.leon; if (!L.alive || L.cd.dodge > 0 || L.auto) return;
    if (L.act && L.act.kind !== 'combo' && L.act.kind !== 'dodge') return;
    let dx = this.input.mx, dz = this.input.mz; const d = Math.hypot(dx, dz);
    if (d < 0.1) { dx = -L.dir.x; dz = -L.dir.z; } else { dx /= d; dz /= d; }
    L.act = { kind: 'dodge', t: 0, dur: P.dodge.dur, vx: dx * P.dodge.dist / P.dodge.dur, vz: dz * P.dodge.dist / P.dodge.dur }; L.cd.dodge = P.dodge.cd; L.invuln = P.dodge.dur + 0.05;
    L.view.faceNow(dx, dz); L.view.play('dodge', { dur: P.dodge.dur * 1.4 });
    sfx('swing', 0.5);
  }
  hitMonsters(filter, mul, opts = {}) {
    const L = this.leon; let n = 0;
    for (const m of this.monsters) {
      if (!m.alive || !filter(m)) continue;
      if (opts.set) { if (opts.set.has(m.id)) continue; opts.set.add(m.id); }
      this.damageMonster(m, L.atk * mul, L.x, L.z, opts.knock || 0.25, '#fff2c0'); n++;
      if (opts.stun) m.stun = Math.max(m.stun, opts.stun);
    }
    if (n) { this.hitstop = Math.max(this.hitstop, opts.stop ?? 0.06); this.shake = Math.max(this.shake, opts.shake ?? 0.15); sfx(opts.heavy ? 'heavy' : 'hit'); this.hintEvent('hit');
      if ((opts.shake ?? 0.15) >= 0.3) this.world.cam.dist -= (opts.heavy ? 1.4 : 0.7); } // 강한 타격은 카메라가 순간 다가감
    return n;
  }
  updateLeon(dt) {
    const L = this.leon;
    for (const k in L.cd) L.cd[k] = Math.max(0, L.cd[k] - dt);
    L.invuln = Math.max(0, L.invuln - dt); L.flash = Math.max(0, L.flash - dt);
    if (!L.alive) { L.respawnT -= dt; if (L.respawnT <= 0) { L.alive = true; L.hp = L.max; L.invuln = 1.5; L.view.revive(); L.view.sh.visible = true; this.world.ring(L.x, L.z, 2, '#9fd4ff'); this.toastMsg('레온 부활!'); } return; }
    L.hp = Math.min(L.max, L.hp + P.regen * dt);
    // 이동 입력 (키보드 WASD + 조이스틱). 화면 위쪽 = -z
    let mx = this.input.mx, mz = this.input.mz; const K = this.input.keys;
    if (this.mode === 'control') { const kx = (K['d'] ? 1 : 0) - (K['a'] ? 1 : 0), kz = (K['s'] ? 1 : 0) - (K['w'] ? 1 : 0); if (kx || kz) { mx = kx; mz = kz; const l = Math.hypot(mx, mz); mx /= l; mz /= l; L.auto = false; this.camFollow = true; } }
    else { mx = mz = 0; }
    const ai = L.auto || this.mode === 'command';
    let attackHeld = this.input.attack || K['j'];
    if (ai) { const r = this.leonAI(); mx = r.mx; mz = r.mz; attackHeld = r.attack; }
    const act = L.act;
    if (act) {
      act.t += dt; const k = act.t / act.dur;
      if (act.kind === 'combo') {
        const s = act.step; if (k < 0.45) { L.x += L.dir.x * s.lunge / (act.dur * 0.45) * dt; L.z += L.dir.z * s.lunge / (act.dur * 0.45) * dt; }
        if (!act.hit && act.t >= s.hitAt) {
          act.hit = true; const ca = Math.cos(s.arc / 2 * Math.PI / 180);
          this.world.slash(L.x + L.dir.x * 0.9, L.z + L.dir.z * 0.9, L.dir, s.reach * 0.95, L.comboIdx === 2 ? '#ffd27a' : '#fff6d8', L.comboIdx === 1 ? 0.5 : 0);
          this.hitMonsters(m => { const dx = m.vx - L.x, dz = m.vz - L.z, d = Math.hypot(dx, dz); return d < s.reach + 0.3 && (d < 0.6 || (dx * L.dir.x + dz * L.dir.z) / d > ca); }, s.mul, { knock: s.knock || 0.25, stop: L.comboIdx === 2 ? 0.1 : 0.05, shake: L.comboIdx === 2 ? 0.3 : 0.12 });
        }
        if (act.t >= act.dur) { L.act = null; if (L.queued || attackHeld) { L.comboIdx = (L.comboIdx + 1) % P.combo.length; this.startCombo(); } else { L.comboReset = 0.5; } }
      } else if (act.kind === 'slam') {
        L.y = Math.sin(clamp(k / 0.65, 0, 1) * Math.PI) * 1.2;
        if (!act.hit && act.t >= act.sk.hitAt) {
          act.hit = true; L.y = 0; const cx = L.x + L.dir.x * 1.0, cz = L.z + L.dir.z * 1.0;
          this.world.ring(cx, cz, act.sk.radius * 1.3, '#ffcf6a', 0.5); this.world.spriteFx('glow', '#ffb347', cx, 0.4, cz, 4, 0.35);
          for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28; this.world.spriteFx('spark', '#ffe2a0', cx, 0.4, cz, 0.7, 0.4, { vx: Math.cos(a) * 5, vz: Math.sin(a) * 5, vy: 3 + Math.random() * 3 }); }
          this.hitMonsters(m => Math.hypot(m.vx - cx, m.vz - cz) < act.sk.radius + 0.3, act.sk.mul, { stun: act.sk.stun, knock: 0.6, stop: 0.14, shake: 0.7, heavy: true });
        }
        if (act.t >= act.dur) { L.act = null; L.y = 0; }
      } else if (act.kind === 'thrust') {
        if (k < 0.55) { const sp = act.sk.dash / (act.dur * 0.55); L.x += L.dir.x * sp * dt; L.z += L.dir.z * sp * dt; if (Math.random() < 0.6) this.world.afterimage(L.view, 0.35, 0.2); }
        if (act.t >= act.sk.hitAt) {
          const ex = L.x + L.dir.x * 1.6, ez = L.z + L.dir.z * 1.6;
          if (!act.hit) { act.hit = true; this.world.beam(L.x, 1.0, L.z, L.x + L.dir.x * act.sk.length, 1.0, L.z + L.dir.z * act.sk.length, '#cfe9ff', 0.25, 0.12); }
          this.hitMonsters(m => { const dx = m.vx - L.x, dz = m.vz - L.z; const along = dx * L.dir.x + dz * L.dir.z; const perp = Math.abs(dx * L.dir.z - dz * L.dir.x); return along > -0.5 && along < 2.2 && perp < act.sk.width; }, act.sk.mul, { set: act.hitSet, knock: 0.7, stop: 0.07, shake: 0.3 });
        }
        if (act.t >= act.dur) L.act = null;
      } else if (act.kind === 'whirl') {
        const every = act.dur / act.sk.hits;
        if (act.t >= act.n * every) {
          act.n++; this.world.slash(L.x, L.z, { x: Math.cos(act.n * 2.1), z: Math.sin(act.n * 2.1) }, act.sk.radius * 1.2, '#bfe3ff', 0.2, 0.18);
          this.hitMonsters(m => Math.hypot(m.vx - L.x, m.vz - L.z) < act.sk.radius + 0.3, act.sk.mul, { knock: 0.15, stop: 0.02, shake: 0.12 });
          sfx('swing', 0.5);
        }
        const sp = P.speed * 0.5; L.x += mx * sp * dt; L.z += mz * sp * dt;
        if (act.t >= act.dur) { L.act = null; L.view.stopOne(); }
      } else if (act.kind === 'dodge') {
        L.x += act.vx * dt; L.z += act.vz * dt; if (Math.random() < 0.7) this.world.afterimage(L.view, 0.4, 0.22, '#9fd4ff');
        if (act.t >= act.dur) { L.act = null; if (L.queued) this.startCombo(); }
      }
    } else {
      L.comboReset -= dt; if (L.comboReset <= 0) L.comboIdx = 0;
      if (attackHeld) this.startCombo();
      else {
        const sp = P.speed * (L.run ? P.runMul : 1) * (L.guard ? 0.45 : 1);
        if (mx || mz) { L.x += mx * sp * dt; L.z += mz * sp * dt; L.dir = { x: mx / Math.hypot(mx, mz), z: mz / Math.hypot(mx, mz) }; L.walk = (L.walk || 0) + dt * (L.run ? 14 : 10); this.hintEvent('move', dt * sp);
          L.dustT = (L.dustT || 0) - dt; if (L.dustT <= 0) { L.dustT = L.run ? 0.12 : 0.26; this.world.spriteFx('glow', '#b9ab92', L.x - L.dir.x * 0.4, 0.15, L.z - L.dir.z * 0.4, L.run ? 0.9 : 0.6, 0.45, { vy: 0.6, grow: 2, normal: true }); } }
        else L.walk = 0;
      }
    }
    const b = this.world.bounds; L.x = clamp(L.x, b.minX, b.maxX + 0.5); L.z = clamp(L.z, b.minZ, b.maxZ);
    const cell = fromWorld(L.x, L.z);
    if (!L.cell || cell[0] !== L.cell[0] || cell[1] !== L.cell[1]) { if (L.holding != null) { const m = this.monsters.find(mm => mm.id === L.holding); if (m) m.held = null; L.holding = null; } L.cell = cell; }
  }
  leonAI() {
    const L = this.leon, cmd = this.mode === 'command';
    const range = cmd ? 3.5 : 9; const from = cmd ? L.anchor : L;
    let tgt = null, bd = 1e9;
    for (const m of this.monsters) { if (!m.alive) continue; const d = Math.hypot(m.vx - from.x, m.vz - from.z); if (d < range && d < bd) { bd = d; tgt = m; } }
    if (!tgt) { const dx = L.anchor.x - L.x, dz = L.anchor.z - L.z, d = Math.hypot(dx, dz); if (cmd && d > 0.4) return { mx: dx / d, mz: dz / d, attack: false }; if (!cmd) L.anchor = { x: L.x, z: L.z }; return { mx: 0, mz: 0, attack: false }; }
    const dx = tgt.vx - L.x, dz = tgt.vz - L.z, d = Math.hypot(dx, dz);
    const near = this.monsters.filter(m => m.alive && Math.hypot(m.vx - L.x, m.vz - L.z) < 2.3).length;
    if (!L.act) { if (near >= 3 && L.cd.whirl <= 0) this.leonSkill('whirl'); else if (near >= 2 && L.cd.slam <= 0) this.leonSkill('slam'); else if (d < 3.5 && d > 1.2 && L.cd.thrust <= 0) this.leonSkill('thrust'); }
    if (d > 1.5) return { mx: dx / d, mz: dz / d, attack: false };
    this.faceTo(L, tgt.vx, tgt.vz); return { mx: 0, mz: 0, attack: true };
  }
  damageLeon(amount, from) {
    const L = this.leon; if (!L.alive || L.invuln > 0) return;
    let d = dmgAfterDef(amount, L.def); if (L.guard) { d *= 1 - P.guardReduce; this.world.spriteFx('glow', '#9fd4ff', L.x, 1.2, L.z, 1.6, 0.2); }
    L.hp -= d; L.flash = 0.15; this.addFloat(L.x, 2.4, L.z, Math.ceil(d), '#ff8070'); L.view.flash(0.15);
    if (L.guard) { L.view.play('guardHit', { dur: 0.3 }); sfx('hit', 0.4); } else if (!L.act) L.view.play('hit', { dur: 0.32 }); this.shake = Math.max(this.shake, 0.12);
    if (this.def.noFail && L.hp < 1) L.hp = 1;
    if (L.hp <= 0) { L.alive = false; L.hp = 0; L.respawnT = P.respawn; L.act = null; this.releaseHold(L); L.view.die(); L.view.sh.visible = false; this.toastMsg(`레온 쓰러짐… ${P.respawn}초 후 부활`); }
  }

  // ───────────────────────── 영웅
  updateHeroes(dt) {
    const bards = this.heroes.filter(h => h.alive && h.cls === 'bard');
    for (const h of this.heroes) {
      if (!h.alive) continue;
      h.flash = Math.max(0, h.flash - dt); h.anim = Math.max(0, h.anim - dt);
      let asMul = 1, atkMul = 1;
      for (const b of bards) if (b !== h && hexDist(b.c, b.r, h.c, h.r) <= b.st.range) { const a = CLASSES.bard.aura; asMul = Math.max(asMul, 1 + a.as * STAR.as(b.star) * (1 + 0.15 * (b.star - 1))); atkMul = Math.max(atkMul, 1 + a.atk * (1 + 0.2 * (b.star - 1))); }
      h.buffed = asMul > 1;
      h.cd -= dt * asMul; if (h.cd > 0) continue;
      const cls = CLASSES[h.cls];
      if (h.cls === 'healer') { // 체력 비율이 가장 낮은 아군 회복
        let tgt = null, lo = 0.999;
        for (const o of this.heroes) if (o.alive && hexDist(o.c, o.r, h.c, h.r) <= h.st.range && o.hp / o.max < lo) { lo = o.hp / o.max; tgt = o; }
        const L = this.leon; if (L.alive && L.cell && hexDist(L.cell[0], L.cell[1], h.c, h.r) <= h.st.range && L.hp / L.max < lo) tgt = L;
        if (tgt) { const amt = h.st.heal * atkMul; tgt.hp = Math.min(tgt.max, tgt.hp + amt); h.cd = 1 / h.st.as; h.anim = 0.3; h.view.face(tgt.x - h.x, tgt.z - h.z); h.view.play('attack', { dur: 0.8 }); this.addFloat(tgt.x, 2.4, tgt.z, '+' + Math.ceil(amt), '#7dff9a');
          for (let i = 0; i < 4; i++) this.world.spriteFx('glow', '#c8ffb0', tgt.x + (Math.random() - .5), 0.5, tgt.z + (Math.random() - .5) * .5, 0.5, 0.7, { vy: 1.6 }); sfx('heal', 0.5); continue; }
      }
      const tgt = this.heroTarget(h); if (!tgt) continue;
      h.cd = 1 / h.st.as; h.anim = 0.25; h.view.face(tgt.vx - h.x, tgt.vz - h.z); h.view.play('attack', { dur: Math.min(0.9, 0.85 / h.st.as) });
      let dmg = h.st.atk * atkMul;
      if (h.cls === 'cavalry' && h.charged !== tgt.id) { dmg *= cls.charge; h.charged = tgt.id; this.world.ring(tgt.vx, tgt.vz, 1.2, '#ffe08a', 0.3); }
      if (cls.group === 'melee' && h.cls !== 'spear') { this.world.slash(tgt.vx - (tgt.vx - h.x) * 0.3, tgt.vz, { x: tgt.vx - h.x, z: tgt.vz - h.z }, 1.3, '#fff0c8', 0.3, 0.16); this.damageMonster(tgt, dmg, h.x, h.z, 0.15, '#ffe9b0'); sfx('hit', 0.5); }
      else if (h.cls === 'spear' || h.cls === 'gunner') { // 첫 대상 방향 육각 직선 관통
        const cells = lineCells(h.c, h.r, tgt.c, tgt.r, h.st.range + 1); const ks = new Set(cells.map(([c, r]) => key(c, r)));
        const hit = [tgt, ...this.monsters.filter(m => m.alive && m !== tgt && ks.has(key(m.c, m.r))).sort((a, b) => hexDist(h.c, h.r, a.c, a.r) - hexDist(h.c, h.r, b.c, b.r))];
        cls.pierce.forEach((mul, i) => { if (hit[i]) this.damageMonster(hit[i], dmg * mul, h.x, h.z, 0.2, '#ffe9b0'); });
        const last = hit[Math.min(hit.length, cls.pierce.length) - 1];
        if (h.cls === 'gunner') { this.world.beam(h.x, 1.3, h.z, last.vx, 1.0, last.vz, '#ffdf8a', 0.14, 0.07); this.world.spriteFx('glow', '#ffcc66', h.x, 1.3, h.z, 1.2, 0.12); sfx('gun', 0.5); }
        else { this.world.beam(h.x, 1.1, h.z, tgt.vx, 1.0, tgt.vz, '#f0f0ff', 0.12, 0.05); sfx('hit', 0.45); }
      } else if (h.cls === 'archer') { this.projectile(h, tgt, '#fff4c0', 16, 0.5, () => this.damageMonster(tgt, dmg, h.x, h.z, 0.12, '#ffe9b0')); sfx('arrow', 0.5); }
      else if (h.cls === 'mage') { this.projectile(h, tgt, '#c79bff', 9, 1.1, () => { this.world.ring(tgt.vx, tgt.vz, 1.6, '#b48cff', 0.4); for (const m of this.monsters) if (m.alive && (m === tgt || hexDist(m.c, m.r, tgt.c, tgt.r) <= 1)) this.damageMonster(m, m === tgt ? dmg : dmg * cls.splash, tgt.vx, tgt.vz, 0.2, '#e0c8ff'); }); sfx('magic', 0.5); }
      else if (h.cls === 'bard' || h.cls === 'healer') { this.projectile(h, tgt, h.cls === 'bard' ? '#9ff0ff' : '#fff6a0', 10, 0.7, () => this.damageMonster(tgt, dmg, h.x, h.z, 0.05, '#ffffff'), h.cls === 'bard' ? 'note' : 'glow'); }
    }
  }
  heroTarget(h) {
    if (h.holding != null) { const m = this.monsters.find(mm => mm.id === h.holding && mm.alive); if (m) return m; }
    let best = null;
    for (const m of this.monsters) { if (!m.alive || m.c == null) continue; if (hexDist(m.c, m.r, h.c, h.r) > h.st.range) continue;
      if (!best || progressX(m.c, m.r) > progressX(best.c, best.r) || (progressX(m.c, m.r) === progressX(best.c, best.r) && m.order < best.order)) best = m; }
    return best;
  }
  projectile(h, tgt, color, speed, size, onHit, tex = 'glow') {
    const s = this.world.spriteFx(tex, color, h.x, 1.3, h.z, size, 5, { grow: 1 });
    s.fade = false; const sx = h.x, sz = h.z; let t = 0;
    s.update = (f, dt) => { if (!tgt.alive) { f.life = 0; f.t = 1; return; } t += dt; const tx = tgt.vx, tz = tgt.vz; const dx = tx - f.obj.position.x, dz = tz - f.obj.position.z, d = Math.hypot(dx, dz);
      const step = speed * dt; if (d <= step + 0.1) { f.t = f.life; onHit(); return; } f.obj.position.x += dx / d * step; f.obj.position.z += dz / d * step; f.obj.position.y = 1.0 + Math.sin(Math.min(1, t * speed / (Math.hypot(tx - sx, tz - sz) + 0.1)) * Math.PI) * 0.8; };
  }

  // ───────────────────────── 몬스터
  damageMonster(m, amount, fx, fz, knock, color) {
    if (!m.alive) return;
    const d = dmgAfterDef(amount, m.def); m.hp -= d; m.flash = 0.12;
    if (m.view) { m.view.flash(0.12, '#ffffff'); if (m.hp > 0 && !m.view.one && (m.hitAnimT || 0) <= 0) { m.view.play('hit', { dur: 0.35 }); m.hitAnimT = 0.6; } }
    const dx = m.vx - fx, dz = m.vz - fz, l = Math.hypot(dx, dz) || 1; m.knock.x += dx / l * knock; m.knock.z += dz / l * knock;
    this.addFloat(m.vx, 1.8 * m.md.scale + 0.3, m.vz, Math.ceil(d), color);
    this.world.spriteFx('spark', '#ffe6b0', m.vx, 1.0 * m.md.scale, m.vz, 1.1, 0.16, { rot: 4 });
    if (m.hp <= 0) this.killMonster(m);
  }
  killMonster(m) {
    m.alive = false; m.deadT = 0; this.kills++;
    if (m.view) { m.view.face(m.vx - this.leon.x, m.vz - this.leon.z); this.world.dieUnit(m.view, m.md.boss ? 1.5 : 0.7); this.world.placeUnit(m.view, m.vx, m.vz); m.view = null; }
    for (let i = 0; i < (m.md.boss ? 24 : 7); i++) { const a = Math.random() * 6.28, sp = 2 + Math.random() * 3; this.world.spriteFx('spark', '#e8e0d0', m.vx, 0.8, m.vz, 0.45, 0.45, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 3 }); }
    for (const u of [this.leon, ...this.heroes]) if (u.holding === m.id) u.holding = null;
    this.gold += m.md.gold; this.addFloat(m.vx, 2.2, m.vz, `+${m.md.gold}G`, '#ffd34d'); sfx('coin', 0.4);
    if (this.selected && this.selected.ref === m) { this.selected = null; this.renderPanel(); }
    if (m.md.boss) { this.shake = 1; this.hitstop = 0.3; }
  }
  updateMonsters(dt) {
    const L = this.leon;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      m.hitAnimT = (m.hitAnimT || 0) - dt;
      m.stun = Math.max(0, m.stun - dt); m.flash = Math.max(0, m.flash - dt); m.moveT += dt; m.lunge = Math.max(0, m.lunge - dt * 3);
      m.cd -= dt; if (m.cd > 0 || m.stun > 0) continue;
      // 공격 대상: 붙잡은 유닛 / 대기 중 공격 대상 / 원거리: 막혔을 때 사거리 안 가장 가까운 경로 위 유닛 (경로 밖은 절대 공격하지 않음)
      let tgtId = m.held ?? m.wait;
      if (tgtId == null && m.md.ranged && m.wait === null && m.moveT > this.tickDur * 1.5) {
        let bd = 1e9; for (const h of this.heroes) if (h.alive && h.onPath) { const d = hexDist(h.c, h.r, m.c, m.r); if (d <= m.md.ranged && d < bd) { bd = d; tgtId = h.uid; } }
        if (L.alive && L.cell && this.map.isPath(...L.cell)) { const d = hexDist(L.cell[0], L.cell[1], m.c, m.r); if (d <= m.md.ranged && d < bd) tgtId = 'leon'; }
      }
      if (tgtId == null || tgtId === 'stun') continue;
      m.cd = 1 / m.as; m.lunge = 0.3;
      { const tg = tgtId === 'leon' ? L : this.heroes.find(hh => hh.uid === tgtId); if (tg && m.view) { m.view.face(tg.x - m.vx, tg.z - m.vz); m.view.play('attack', { dur: Math.min(0.8, 0.9 / m.as) }); } }
      if (tgtId === 'leon') { if (m.md.ranged) this.bolt(m, L); this.damageLeon(m.atk, m); }
      else { const h = this.heroes.find(hh => hh.uid === tgtId && hh.alive); if (!h) continue; if (m.md.ranged) this.bolt(m, h);
        const d = dmgAfterDef(m.atk, h.st.def); h.hp -= d; h.flash = 0.15; h.view.flash(0.15); if (!h.view.one) h.view.play('hit', { dur: 0.35 }); this.addFloat(h.x, 2.3, h.z, Math.ceil(d), '#ff8070');
        if (h.hp <= 0) { this.world.spriteFx('glow', '#ffffff', h.x, 1, h.z, 2.5, 0.4); this.removeHero(h, true); this.toastMsg(`${HEROES[h.hid].name} 쓰러짐 (웨이브 종료 후 카드로 복귀)`); } }
    }
  }

  // ───────────────────────── 화면 갱신
  updateViews(dt) {
    const W = this.world, L = this.leon;
    if (L.alive || L.view.dead) {
      const v = L.view, moving = !L.act && L.walk > 0;
      if (L.alive) {
        if (L.act && L.act.kind === 'whirl') v.yaw += dt * 0; // 회전베기는 동작 자체가 돈다
        else v.face(L.dir.x, L.dir.z);
        v.setBase(L.guard ? 'guard' : moving ? (L.run ? 'run' : 'walk') : 'idle', moving ? (L.run ? 1.15 : 1.25) : 1);
        v.setOpacity(L.invuln > 0 && !L.act ? 0.55 + Math.sin(performance.now() / 33) * 0.3 : 1);
      }
      W.placeUnit(v, L.x, L.z, L.y || 0);
    }
    for (const h of this.heroes) W.placeUnit(h.view, h.x, h.z, 0);
    for (const m of this.monsters) {
      if (!m.view) continue;
      const a = toWorld(m.pc ?? m.c - 1, m.pr ?? m.r), b = toWorld(m.c, m.r), k = clamp(m.moveT / (this.tickDur * 0.85), 0, 1), e = k * k * (3 - 2 * k);
      m.knock.x *= Math.exp(-dt * 8); m.knock.z *= Math.exp(-dt * 8);
      m.vx = a.x + (b.x - a.x) * e + m.knock.x; m.vz = a.z + (b.z - a.z) * e + m.knock.z;
      const v = m.view;
      if (k < 1 && m.stun <= 0) { v.face(b.x - a.x, b.z - a.z); v.setBase('walk', 1.6 / (this.tickDur / 0.8)); } else v.setBase('idle');
      if (m.stun > 0) { v.flash(0.05, '#6f7cff'); if (Math.random() < dt * 6) W.spriteFx('spark', '#ffe680', m.vx + (Math.random() - .5) * .6, m.view.height + 0.2, m.vz, 0.35, 0.3, { vy: 0.5 }); }
      W.placeUnit(v, m.vx, m.vz, 0);
    }
  }
  // 해골 석궁병 화살: 실제로 날아가는 화살 + 맞을 때 불꽃
  bolt(m, tgt) {
    const sx = m.vx, sz = m.vz, tx = tgt.x, tz = tgt.z; sfx('arrow', 0.4);
    const f = this.world.beam(sx, 1.1, sz, sx + (tx - sx) * 0.15, 1.1, sz + (tz - sz) * 0.15, '#d8f0ff', 0.25, 0.035); let t = 0; const T = Math.max(0.12, Math.hypot(tx - sx, tz - sz) / 18);
    f.fade = false; f.life = T; f.update = (ff, dt) => { t += dt; const k = Math.min(1, t / T); ff.obj.position.set(sx + (tx - sx) * k, 1.1 + Math.sin(k * Math.PI) * 0.4, sz + (tz - sz) * k); if (k >= 1) this.world.spriteFx('spark', '#bfe8ff', tx, 1.1, tz, 0.8, 0.15); };
  }

  addFloat(x, y, z, text, color) { this.floats.push({ wx: x, wy: y, wz: z, text: String(text), color, t: 0, life: 0.8, dx: (Math.random() - 0.5) * 20 }); if (this.floats.length > 60) this.floats.shift(); }

  drawOverlay(dt) {
    const g = this.ctx, W = this.world, S = this.env.S; g.clearRect(0, 0, this.app.W, this.app.H);
    const poly = (pts, fill, stroke, lw = 2) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
    // 드래그 중: 배치 가능 칸(초록 테두리) · 손가락 위치 미리보기 · 불가(빨강 + X)
    if (this.drag) {
      const capped = this.drag.type === 'card' && this.heroes.length >= this.deployMax;
      for (const [k, v] of this.drag.valid) { if (!v.ok || capped) continue; const c = Math.floor(k / 1000), r = k % 1000; poly(W.hexScreen(c, r, 0.86), 'rgba(80,220,120,0.10)', 'rgba(90,235,130,0.75)', 1.5); }
      const d = this.drag;
      if (d.cell && !d.overCard && !d.overSell) {
        const pts = W.hexScreen(d.cell[0], d.cell[1], 0.92);
        if (d.ok) poly(pts, d.merge ? 'rgba(255,211,77,0.35)' : 'rgba(80,220,120,0.38)', d.merge ? '#ffd34d' : '#5ef08c', 3);
        else { poly(pts, 'rgba(230,50,40,0.35)', '#ff4a3a', 3); const c = W.project(toWorld(...d.cell).x, 0.03, toWorld(...d.cell).z); g.strokeStyle = '#fff'; g.lineWidth = 4; const s = 10 * S * 2; g.beginPath(); g.moveTo(c.x - s, c.y - s * .6); g.lineTo(c.x + s, c.y + s * .6); g.moveTo(c.x + s, c.y - s * .6); g.lineTo(c.x - s, c.y + s * .6); g.stroke();
          if (d.why) { g.font = `600 ${Math.round(24 * S)}px "Noto Sans KR",sans-serif`; g.textAlign = 'center'; g.fillStyle = '#ffd0c8'; g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 4; g.strokeText(d.why, c.x, c.y + 40 * S); g.fillText(d.why, c.x, c.y + 40 * S); } }
        if (d.ok) { const hs = heroStats(d.hid, d.star); this.drawRange(d.cell[0], d.cell[1], hs.range, 'rgba(90,160,255,0.16)'); }
      }
    }
    // 선택: 노란 테두리 + 사거리 파란 칸
    const s = this.selected;
    if (s && s.kind === 'hero' && s.ref.alive) { this.drawRange(s.ref.c, s.ref.r, s.ref.st.range, 'rgba(70,140,255,0.22)'); poly(W.hexScreen(s.ref.c, s.ref.r, 0.95), null, '#ffd34d', 3.5); }
    if (s && s.kind === 'monster' && s.ref.alive) poly(W.hexScreen(s.ref.c, s.ref.r, 0.95), null, '#ffd34d', 3.5);
    if (s && s.kind === 'leon' && this.leon.cell) poly(W.hexScreen(this.leon.cell[0], this.leon.cell[1], 0.95), null, '#ffd34d', 3.5);
    // 경로 미리보기 (흐르는 화살표)
    if (this.preview) {
      this.preview.t += dt; if (this.preview.t > 3) this.preview = null;
      else for (const p of this.preview.paths) {
        const pts = p.pts.map(([c, r]) => { const w = toWorld(c, r); return W.project(w.x, 0.05, w.z); });
        g.strokeStyle = 'rgba(255,240,200,0.55)'; g.lineWidth = 4; g.setLineDash([10, 10]); g.lineDashOffset = -this.preview.t * 40; g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.stroke(); g.setLineDash([]);
        const ph = (this.preview.t * 6) % 1;
        for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const x = a.x + (b.x - a.x) * ph, y = a.y + (b.y - a.y) * ph; const ang = Math.atan2(b.y - a.y, b.x - a.x);
          g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = '#ffe9a8'; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore(); }
        if (p.stop) { const w = toWorld(...p.stop); const q = W.project(w.x, 0.05, w.z); g.fillStyle = '#ffb347'; g.beginPath(); g.arc(q.x, q.y, 10, 0, 7); g.fill(); g.fillStyle = '#3a1d00'; g.fillRect(q.x - 5, q.y - 5, 3.5, 10); g.fillRect(q.x + 1.5, q.y - 5, 3.5, 10); }
      }
    }
    // 체력바·성급 (확대·축소에 따라 크기 조절, 축소 시 숨김으로 겹침 방지)
    const zoomK = clamp(26 / this.world.cam.dist, 0.55, 1.3);
    const bar = (x, y, w, pct, col) => { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, 6); g.fillStyle = col; g.fillRect(x - w / 2, y, w * clamp(pct, 0, 1), 4); };
    for (const h of this.heroes) { const p = W.project(h.x, 2.15, h.z); const w = 46 * zoomK; bar(p.x, p.y, w, h.hp / h.max, '#5fd16b');
      g.fillStyle = '#ffd34d'; for (let i = 0; i < h.star; i++) { const sx = p.x - (h.star - 1) * 5.5 * zoomK + i * 11 * zoomK; star(g, sx, p.y - 8 * zoomK, 5 * zoomK); }
      if (h.buffed) { g.fillStyle = '#9ff0ff'; g.font = `${Math.round(14 * zoomK)}px serif`; g.fillText('♪', p.x + w / 2 + 6, p.y + 4); } }
    for (const m of this.monsters) { if (!m.alive || !m.view || m.hp >= m.max) continue; const p = W.project(m.vx, 1.75 * m.md.scale + 0.2, m.vz); bar(p.x, p.y, (m.md.boss ? 90 : 40) * zoomK, m.hp / m.max, '#e0453a'); }
    if (this.leon.alive) { const p = W.project(this.leon.x, 2.5 + (this.leon.y || 0), this.leon.z); bar(p.x, p.y, 56 * zoomK, this.leon.hp / this.leon.max, '#4fb3ff'); }
    else { const p = W.project(this.leon.x, 1, this.leon.z); g.font = `700 ${Math.round(26 * S)}px "Noto Sans KR",sans-serif`; g.textAlign = 'center'; g.fillStyle = '#9fd4ff'; g.fillText(`부활 ${Math.ceil(this.leon.respawnT)}`, p.x, p.y); }
    // 출현 대기 표시
    if (this.spawnQueue.length) { const st = this.map.start[0]; const w = toWorld(st[0], st[1]); const p = W.project(w.x - 1.6, 2.4, w.z); g.font = `700 ${Math.round(24 * S)}px "Noto Sans KR",sans-serif`; g.textAlign = 'center'; g.fillStyle = '#ffcf9a'; g.strokeStyle = '#000'; g.lineWidth = 4; g.strokeText(`대기 ${this.spawnQueue.length}`, p.x, p.y); g.fillText(`대기 ${this.spawnQueue.length}`, p.x, p.y); }
    // 떠오르는 숫자
    g.textAlign = 'center';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.t += dt; if (f.t > f.life) { this.floats.splice(i, 1); continue; }
      const k = f.t / f.life; let x, y;
      if (f.screen) { x = f.x; y = f.y - k * 30; } else { const p = W.project(f.wx, f.wy, f.wz); x = p.x + f.dx * k; y = p.y - Math.sin(Math.min(1, k * 2) * Math.PI / 2) * 34 * zoomK; }
      const sz = Math.round((f.size || 1) * 28 * S * (k < 0.15 ? 1 + (0.15 - k) * 3 : 1));
      g.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4; g.font = `800 ${Math.max(13, sz)}px "Noto Sans KR",sans-serif`;
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(f.text, x, y); g.fillStyle = f.color; g.fillText(f.text, x, y); g.globalAlpha = 1;
    }
  }
  drawRange(c0, r0, range, fill) {
    const g = this.ctx;
    for (const [c, r] of this.map.cells()) { if (hexDist(c, r, c0, r0) > range || (c === c0 && r === r0)) continue; const pts = this.world.hexScreen(c, r, 0.9); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.fillStyle = fill; g.fill(); }
  }

  updateHud() {
    const L = this.leon, q = this.q;
    q('.hp-panel .bar i').style.width = (L.hp / L.max * 100) + '%'; q('.hp-panel .hpv').textContent = `${fmt(L.hp)} / ${fmt(L.max)}`;
    q('.top-info .wave').textContent = this.waveIdx < 0 ? `준비` : `웨이브 ${this.waveIdx + 1}/${this.waves.length}`;
    q('.top-info .lives b').textContent = this.def.noFail ? '∞' : this.lives;
    q('.top-info .deploy b').textContent = `${this.heroes.length}/${this.deployMax}`; q('.top-info .deploy').style.display = this.canSummon ? '' : 'none';
    const pt = Math.floor(this.playTime); q('.top-info .clock').textContent = `${String(Math.floor(pt / 60)).padStart(2, '0')}:${String(pt % 60).padStart(2, '0')}`;
    q('.gold-chip b').textContent = this.gold.toLocaleString('ko-KR');
    q('.speed .lb2').textContent = this.speed + 'x'; q('.speed').classList.toggle('on', this.speed > 1);
    const prep = q('.prep'); const showPrep = this.phase === 'prep' || this.phase === 'rest';
    prep.style.display = showPrep ? '' : 'none';
    if (showPrep) { q('.prep-t').textContent = (this.phase === 'prep' ? '전투 준비' : '다음 웨이브까지') + ` ${Math.ceil(this.phaseT)}초`; q('[data-b="go"] span').textContent = this.phase === 'prep' ? '전투 시작' : '바로 시작'; }
    for (const id of ['slam', 'thrust', 'whirl', 'dodge']) { const b = q(`[data-b="${id}"]`); const cd = L.cd[id], max = id === 'dodge' ? P.dodge.cd : P.skills[id].cd; b.style.setProperty('--cd', cd > 0 ? cd / max : 0); b.querySelector('.cdv').textContent = cd > 0 ? cd.toFixed(cd < 1 ? 1 : 0) : ''; b.classList.toggle('cooling', cd > 0); }
    q('[data-b="run"]').classList.toggle('on', L.run); q('[data-b="run"] .lb').textContent = L.run ? '달리기 ON' : '달리기 OFF';
    q('[data-b="auto"]').classList.toggle('on', L.auto); q('[data-b="guard"]').classList.toggle('on', L.guard);
    q('[data-b="dodge"]').classList.toggle('off', L.auto);
    this.renderGoldState();
    if (this.selected && (this.selected.kind === 'hero' || this.selected.kind === 'leon' || this.selected.kind === 'monster')) { this._panelT = (this._panelT || 0) + 1; if (this._panelT % 10 === 0) this.renderPanel(); }
  }
  renderGoldState() { if (this._lastGold !== this.gold) { this._lastGold = this.gold; this.renderCards(); } }

  renderPanel() {
    const p = this.q('.info-panel'); const s = this.selected;
    if (!s || (this.drag)) { p.classList.remove('show'); return; }
    let html = '';
    const row = (k, v) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;
    if (s.kind === 'hero' || s.kind === 'card') {
      const hid = s.kind === 'hero' ? s.ref.hid : s.card.hid, star = s.kind === 'hero' ? s.ref.star : s.card.star; const h = HEROES[hid], st = heroStats(hid, star), c = CLASSES[h.cls];
      html = `<div class="ph"><div class="pf" style="background-image:url(${face(h.art)})"></div><div><div class="pn">${h.name}</div><div class="pt"><span class="rk r-${h.rank}">${h.rank}</span> ${c.name} ${starsHtml(star)}</div></div></div>
        ${s.kind === 'hero' ? row('체력', `${fmt(s.ref.hp)} / ${fmt(s.ref.max)}`) : row('체력', fmt(st.hp))}${row(h.cls === 'healer' ? '회복량' : '공격력', fmt(h.cls === 'healer' ? st.heal : st.atk))}${row('방어력', fmt(st.def))}${row('공격 속도', st.as.toFixed(2) + '/초')}${row('사거리', st.range + '칸')}${row('판매가', Math.floor((s.kind === 'hero' ? s.ref.invested : s.card.invested) / 2) + 'G')}`;
    } else if (s.kind === 'monster') {
      const m = s.ref; html = `<div class="ph"><div class="pf" style="background-image:url(${face(m.md.art)})"></div><div><div class="pn">${m.md.name}</div><div class="pt">${m.md.ranged ? '원거리' : '근거리'}${m.held != null ? ' · 붙잡힘' : ''}</div></div></div>${row('체력', `${fmt(m.hp)} / ${fmt(m.max)}`)}${row('공격력', fmt(m.atk))}${row('방어력', fmt(m.def))}${row('처치 골드', m.md.gold + 'G')}`;
    } else if (s.kind === 'leon') {
      const L = this.leon; html = `<div class="ph"><div class="pf" style="background-image:url(${face(P.art)})"></div><div><div class="pn">${P.name}</div><div class="pt">주인공 · 직접 조작</div></div></div>${row('체력', `${fmt(L.hp)} / ${fmt(L.max)}`)}${row('공격력', fmt(L.atk))}${row('방어력', fmt(L.def))}${row('회복력', P.regen + '/초')}${row('저지 수', 1)}`;
    }
    p.innerHTML = html; p.classList.add('show');
  }

  showPreview() {
    const cells = new Set(this.heroes.filter(h => h.alive && h.onPath).map(h => key(h.c, h.r)));
    this.preview = { t: 0, paths: previewPaths(this.map, cells) };
  }
  toastMsg(t, ms = 1400) { const el = this.q('.toast'); el.textContent = t; el.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), ms); }
  bannerMsg(t) { this.floats.push({ text: t, x: this.app.W / 2, y: this.app.H * 0.36, t: 0, life: 1.6, screen: true, color: '#ffe9a8', size: 1.8 }); }
  shout(t) { const el = this.q('.shout'); el.innerHTML = `<div class="sf" style="background-image:url(${face(P.art)})"></div><span>${t}</span>`; el.classList.add('show'); clearTimeout(this._st); this._st = setTimeout(() => el.classList.remove('show'), 2500); }

  // 튜토리얼 안내 (스토리 1)
  nextHint() {
    const steps = [
      { t: '왼쪽 아래 조이스틱으로 레온을 움직이세요 (PC: WASD)', b: '.joy', ev: 'move', need: 2.5 },
      { t: '해골에게 다가가 공격 버튼을 누르세요. 연타하면 연속기! (PC: J)', b: '[data-b="attack"]', ev: 'hit' },
      { t: '내려찍기 스킬로 주변 적을 한 번에! (PC: U)', b: '[data-b="slam"]', ev: 'slam' },
      { t: '길 위에 서 있으면 레온이 몬스터를 붙잡습니다. 놓친 몬스터는 성문으로 갑니다!', b: null, ev: 'timer', need: 6 },
    ];
    const s = steps[this.hintStep];
    this.hud.querySelectorAll('.spot').forEach(e => e.classList.remove('spot'));
    if (!s) { this.q('.tip').classList.remove('show'); this.hintStep = -1; return; }
    this.hint = { ...s, acc: 0 }; const tip = this.q('.tip'); tip.textContent = s.t; tip.classList.add('show');
    if (s.b) this.q(s.b).classList.add('spot');
    if (s.ev === 'timer') setTimeout(() => this.hintEvent('timer', 99), s.need * 1000);
  }
  hintEvent(ev, amt = 1) {
    if (this.hintStep < 0 || !this.hint || this.hint.ev !== ev) return;
    this.hint.acc += amt; if (this.hint.acc >= (this.hint.need || 1)) { this.hintStep++; this.nextHint(); }
  }

  // ───────────────────────── 일시정지·종료
  openPause() {
    if (this.ended) return; this.paused = true;
    const ov = document.createElement('div'); ov.className = 'modal'; ov.innerHTML = `<div class="dlg frame"><h2>일시정지</h2>
      <button class="btn gold" data-p="resume">계속하기</button><button class="btn" data-p="retry">다시 하기</button>
      <div class="opt"><span>버튼 크기</span><div class="seg" data-o="ui">${[0.9, 1, 1.1].map(v => `<button data-v="${v}" class="${(this.app.save.settings.ui || 1) == v ? 'on' : ''}">${Math.round(v * 100)}%</button>`).join('')}</div></div>
      <div class="opt"><span>버튼 투명도</span><div class="seg" data-o="op">${[0.45, 0.7, 0.95].map(v => `<button data-v="${v}" class="${(this.app.save.settings.op || 0.95) == v ? 'on' : ''}">${Math.round(v * 100)}%</button>`).join('')}</div></div>
      <div class="opt"><span>효과음</span><div class="seg" data-o="sfx"><button data-v="1" class="${this.app.save.settings.sfx !== false ? 'on' : ''}">켜기</button><button data-v="0" class="${this.app.save.settings.sfx === false ? 'on' : ''}">끄기</button></div></div>
      <div class="keys">PC: 이동 WASD · 공격 J · 스킬 U/I/O · 회피 Space · 방어 F(누름) · 달리기 Shift · 모드 Tab · 소환 R</div>
      <button class="btn dim" data-p="quit">전투 포기하고 나가기</button></div>`;
    this.el.appendChild(ov); this.pauseEl = ov;
    ov.addEventListener('pointerdown', e => {
      const b = e.target.closest('button'); if (!b) return; sfx('ui');
      if (b.dataset.p === 'resume') this.closePause();
      if (b.dataset.p === 'retry') { this.closePause(); this.app.restartBattle(); }
      if (b.dataset.p === 'quit') { this.closePause(); this.finish(false, true); }
      const o = b.parentElement.dataset.o; if (o) { const v = +b.dataset.v; if (o === 'ui') this.app.save.settings.ui = v; if (o === 'op') this.app.save.settings.op = v; if (o === 'sfx') this.app.setSfx(!!v);
        this.app.persist(); this.app.applySettings(); b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); this.onResize(); }
    });
  }
  closePause() { this.paused = false; if (this.pauseEl) this.pauseEl.remove(); this.pauseEl = null; this.last = performance.now(); }
  finish(win, quit = false) {
    if (this.ended) return; this.ended = true;
    const stars = win ? (this.lost === 0 ? 3 : this.lost <= 2 ? 2 : 1) : 0;
    sfx(win ? 'win' : 'lose');
    setTimeout(() => this.cfg.onEnd({ win, stars, lost: this.lost, time: this.playTime, kills: this.kills, quit }), quit ? 0 : 1200);
  }
  destroy() {
    this.dead = true; cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this._move); window.removeEventListener('pointerup', this._up); window.removeEventListener('pointercancel', this._up);
    window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku); document.removeEventListener('visibilitychange', this._vis);
    this.world.dispose(); this.el.remove();
  }
}

function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
