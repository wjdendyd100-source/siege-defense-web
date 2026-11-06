// 휴대폰 조건 실제 플레이 검증: 가로 915×412 터치 화면, 실제 속도, 손가락 터치(CDP 터치 이벤트)로
// 타이틀 → 로비 → 대화(한 줄씩 탭) → 전투(조이스틱을 누른 채 공격·스킬 탭)를 끝까지 진행하고 영상·캡처·점검 결과를 남긴다.
// 사용: game/을 http://localhost:8765 로 띄운 뒤  OUT=qa/playtest node tools/playtest_mobile.js
//       (CDN이 막힌 환경이면 THREE_DIR=<three 패키지 경로>)
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = path.resolve(process.env.OUT || 'qa/playtest'); fs.mkdirSync(OUT, { recursive: true });
const THREE_DIR = process.env.THREE_DIR;
const STORY = process.env.STORY || 'story1';
const W = 915, H = 412;
const log = []; const say = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };
const checks = []; const check = (ok, name, detail = '') => { checks.push({ ok, name, detail }); say(ok ? 'PASS' : 'FAIL', name, detail); };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: OUT, size: { width: W, height: H } } });
  const p = await ctx.newPage();
  if (THREE_DIR) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\//, r => { const u = new URL(r.request().url()); r.fulfill({ path: path.join(THREE_DIR, u.pathname.replace('/npm/three@0.160.0/', '')), contentType: 'text/javascript' }); });
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.addInitScript(() => { window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ entryTypes: ['longtask'] }); try { localStorage.clear(); } catch {} });
  const cdp = await ctx.newCDPSession(p);
  // ── 손가락: 여러 손가락을 동시에 유지 (id → 좌표)
  const fingers = new Map();
  const send = async type => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...fingers.entries()].map(([id, [x, y]]) => ({ x, y, id, radiusX: 8, radiusY: 8 })) });
  const down = async (id, x, y) => { fingers.set(id, [x, y]); await send('touchStart'); };
  const move = async (id, x, y) => { fingers.set(id, [x, y]); await send('touchMove'); };
  // 한 손가락만 뗄 때: touchEnd에 뗄 손가락만 담는다 (CDP 터치 에뮬레이션 동작을 직접 확인함)
  const up = async id => { const [x, y] = fingers.get(id); fingers.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x, y, id }] }); };
  const tap = async (x, y, id = 9) => { await down(id, x, y); await p.waitForTimeout(60); await up(id); };
  const center = async sel => { const r = await p.locator(sel).first().boundingBox(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; };
  const tapSel = async sel => { const c = await center(sel); if (!c) throw new Error('없음 ' + sel); await tap(...c); };
  const shot = async name => p.screenshot({ path: path.join(OUT, name + '.png') });

  await p.addInitScript(() => { window.__stat = { hits: 0, kills: 0, escaped: 0 }; });
  await p.goto('http://localhost:8765/index.html');
  await p.waitForSelector('.start', { timeout: 90000 }); await p.waitForTimeout(500); await shot('01_title');
  const ver = await p.locator('.ver').textContent().catch(() => ''); say('version', ver);
  await tapSel('.start'); await p.waitForTimeout(700); await shot('02_lobby');
  await tapSel('[data-next]'); await p.waitForTimeout(700); await shot('03_dialogue');
  // 대화: 탭으로 한 줄씩 (전투 화면이 나올 때까지)
  for (let i = 0; i < 40 && !(await p.$('.battle')); i++) { await tap(W / 2, H * 0.55); await p.waitForTimeout(450); }
  await p.waitForSelector('.battle', { timeout: 20000 }); await p.waitForFunction(() => window.__app.battle && window.__app.battle.ready, null, { timeout: 30000 }); await p.waitForTimeout(800); await shot('04_battle_start');

  // 튜토리얼 안내가 레온을 가리는지 (화면 좌표로 판정)
  const overlap = async () => p.evaluate(() => {
    const B = window.__app.battle, L = B.leon, tip = B.q('.tip'); if (!tip.classList.contains('show')) return { shown: false };
    const r = tip.getBoundingClientRect(); const top = B.world.project(L.x, L.view.height + 0.1, L.z), foot = B.world.project(L.x, 0, L.z);
    const lx0 = foot.x - 30, lx1 = foot.x + 30, ly0 = top.y, ly1 = foot.y;
    const hit = !(r.right < lx0 || r.left > lx1 || r.bottom < ly0 || r.top > ly1);
    // 다른 HUD(버튼·패널·준비 표시·상단 정보)와 겹침
    const ui = [...B.hud.querySelectorAll('[data-l], .hb, .joy, .cards')].filter(e => e !== tip && e.offsetParent !== null && getComputedStyle(e).display !== 'none' && getComputedStyle(e).opacity !== '0');
    const uiHits = ui.filter(e => { const q = e.getBoundingClientRect(); return q.width > 0 && !(r.right <= q.left || r.left >= q.right || r.bottom <= q.top || r.top >= q.bottom); }).map(e => e.dataset.l || e.dataset.b || e.className);
    return { shown: true, hit: hit || uiHits.length > 0, uiHits, tip: [r.left, r.top, r.right, r.bottom].map(Math.round), leon: [lx0, ly0, lx1, ly1].map(Math.round), text: tip.textContent };
  });
  // 회귀 검사: 대화를 거쳐 들어온 전투에서 버튼을 짧게 탭해도 전투가 다시 시작되면 안 된다 (2026-11-06 사용자 신고 버그)
  await p.evaluate(() => { window.__app.battle.__marker = 1; });
  for (const b of ['attack', 'attack', 'attack', 'dodge', 'run', 'run']) { await tap(...(await center(`[data-b="${b}"]`))); await p.waitForTimeout(350); }
  await tap(W * 0.6, H * 0.45); await p.waitForTimeout(350); // 빈 전장도 탭
  const same = await p.evaluate(() => window.__app.battle && window.__app.battle.__marker === 1);
  check(same, '버튼·전장을 짧게 탭해도 전투가 다시 시작되지 않음 (대화 → 전투 경로)');
  let o = await overlap(); check(o.shown && !o.hit, '튜토리얼 안내가 레온·HUD를 가리지 않음 (전투 시작)', JSON.stringify(o));

  // ── 플레이: 조이스틱 손가락(1)을 누른 채 가장 가까운 몬스터 쪽으로, 가까우면 공격(2) 연타·스킬
  await p.evaluate(() => { const B = window.__app.battle, S = window.__stat; const dm = B.damageMonster.bind(B), km = B.killMonster.bind(B), gt = B.gridTick.bind(B);
    B.damageMonster = (...a) => { S.hits++; return dm(...a); }; B.killMonster = (...a) => { S.kills++; return km(...a); };
    B.gridTick = () => { const before = B.monsters.filter(m => m.exited).length; gt(); }; B.shout = (t) => { if (t.includes('놓치')) S.escaped++; }; });
  const joy = await center('.joy'); const joyR = (await p.locator('.joy').boundingBox()).width * 0.36;
  await down(1, ...joy);
  const bannerPrep = [];
  const t0 = Date.now(); let lastSkill = 0, n = 0, tipChecks = 0, tipHits = 0; const animSeen = new Set();
  while (Date.now() - t0 < 240000) {
    const st = await p.evaluate(() => { const B = window.__app.battle; if (!B) return { gone: true };
      const L = B.leon; let best = null, bd = 1e9; for (const m of B.monsters) if (m.alive && m.vx != null) { const d = Math.hypot(m.vx - L.x, m.vz - L.z); if (d < bd) { bd = d; best = m; } }
      const a = B.world.project(L.x, 0, L.z), t = best ? B.world.project(best.vx + 1.2, 0, best.vz) : null; // 몬스터 바로 앞(성문 쪽)에 서서 막는다
      return { ended: B.ended, d: bd, dx: t ? t.x - a.x : 0, dy: t ? t.y - a.y : 0, phase: B.phase, wave: B.waveIdx, kills: B.kills, hp: L.hp, anim: L.view.cur && L.view.cur.getClip().name,
        monAnims: B.monsters.filter(m => m.view && m.view.cur).map(m => m.view.cur.getClip().name) };
    });
    if (st.gone || st.ended) break;
    if (process.env.DEBUG && n % 8 === 0) say('dbg', JSON.stringify({ d: Math.round(st.d * 10) / 10, dx: Math.round(st.dx), dy: Math.round(st.dy), anim: st.anim, f2: fingers.has(2), dbg: await p.evaluate(() => { const B = window.__app.battle, L = B.leon; return { lx: Math.round(L.x * 10) / 10, lz: Math.round(L.z * 10) / 10, atk: B.input.attack, act: L.act && L.act.kind, mx: Math.round(B.input.mx * 100) / 100, hits: window.__stat.hits, mons: B.monsters.filter(m => m.alive).map(m => [Math.round(m.vx * 10) / 10, Math.round(m.vz * 10) / 10, m.held]) }; }) }));
    if (st.anim) animSeen.add('레온:' + st.anim); for (const a of st.monAnims) animSeen.add('몬스터:' + a);
    const l = Math.hypot(st.dx, st.dy);
    const atk = await center('[data-b="attack"]');
    if (st.d < 1.9 || l < 6) { await move(1, ...joy); if (!fingers.has(2)) await down(2, ...atk); }
    else { if (fingers.has(2)) await up(2); await move(1, joy[0] + st.dx / l * joyR, joy[1] + st.dy / l * joyR); }
    if (st.d < 2.5 && Date.now() - lastSkill > 2500) { lastSkill = Date.now(); const sk = ['slam', 'thrust', 'whirl'][Math.floor(Math.random() * 3)]; await tap(...(await center(`[data-b="${sk}"]`)), 3); }
    if (n % 5 === 0) { const bp = await p.evaluate(() => { const B = window.__app.battle, pr = B.q('.prep'); if (getComputedStyle(pr).display === 'none') return null; const r = pr.getBoundingClientRect(); const f = B.floats.filter(f => f.screen && f.t < f.life);
      return f.length ? { banner: f.map(x => x.text), prep: [r.top, r.bottom].map(Math.round), y: f.map(x => Math.round(x.y)) } : null; }); if (bp) { bannerPrep.push(bp); } }
    if (n % 10 === 0) { const ov = await overlap(); if (ov.shown) { tipChecks++; if (ov.hit) { tipHits++; say('겹침', JSON.stringify(ov)); } } }
    if (n === 25) await shot('05_fight_a'); if (n === 60) await shot('06_fight_b'); if (n === 110) await shot('07_fight_c');
    n++; await p.waitForTimeout(120);
  }
  await up(1); if (fingers.has(2)) await up(2);
  check(bannerPrep.length === 0, '큰 안내 글자(웨이브 시작·클리어)와 준비 버튼이 동시에 보이지 않음', JSON.stringify(bannerPrep.slice(0, 3)));
  check(tipHits === 0, '플레이 중 튜토리얼 안내가 레온·HUD와 겹친 횟수 0', `${tipHits}/${tipChecks}회 점검`);
  await p.waitForTimeout(1500); await shot('08_result');
  const res = await p.evaluate(() => { const B = window.__app.battle; return { inBattle: !!B, ended: B ? B.ended : null, kills: B ? B.kills : null, screen: document.querySelector('#screen').className, text: document.querySelector('#screen').innerText.slice(0, 120) }; });
  const stat = await p.evaluate(() => window.__stat); say('stat', JSON.stringify(stat)); check(stat.hits > 10 && stat.kills >= 4, '실제 타격이 들어가고 처치됨 (스토리1 해골 7마리 중 4마리 이상)', JSON.stringify(stat));
  say('result', JSON.stringify(res), 'elapsed', Math.round((Date.now() - t0) / 1000) + 's', 'ticks', n);
  check(!res.inBattle || res.ended, '전투가 끝까지 진행됨', JSON.stringify(res));
  const need = ['레온:1H_Melee_Attack_Slice_Diagonal', '레온:Walking_A', '몬스터:Walking_D_Skeletons'];
  check(need.every(a => animSeen.has(a)), '레온·몬스터 실제 애니메이션 재생', [...animSeen].join(', '));
  // ── 2단계: 결과 → 에필로그 → 스테이지 목록 → 스테이지 1 → 편성 → 전투 (소환·카드 끌어 배치·지휘 모드·일시정지·배속·자동)
  await tapSel('.result [data-r="next"]'); await p.waitForTimeout(600);
  for (let i = 0; i < 20 && !(await p.$('.node')); i++) { await tap(W / 2, H * 0.55); await p.waitForTimeout(400); }
  await shot('09_stage_list');
  await tapSel('.node.open'); await p.waitForTimeout(700); await shot('10_party');
  await tapSel('.go'); await p.waitForSelector('.battle', { timeout: 20000 }); await p.waitForFunction(() => window.__app.battle && window.__app.battle.ready, null, { timeout: 30000 }); await p.waitForTimeout(1200);
  await p.evaluate(() => { window.__app.battle.__marker = 2; });
  const st0 = await p.evaluate(() => { const B = window.__app.battle; return { gold: B.gold, hand: B.hand.length, heroes: B.heroes.length, phase: B.phase }; });
  await tapSel('.mini-summon'); await p.waitForTimeout(500); await tapSel('.mini-summon'); await p.waitForTimeout(600);
  const st1 = await p.evaluate(() => { const B = window.__app.battle; return { gold: B.gold, hand: B.hand.length }; });
  check(st1.hand === st0.hand + 2 && st1.gold < st0.gold, '소환 버튼 탭 → 카드 2장, 골드 감소', JSON.stringify([st0, st1]));
  // 카드를 위로 끌어 경로 위 칸(6,3)에 놓기 (근접 영웅은 길 위에 있어야 싸움)
  const card = await center('.ctrl-cards .card:not(.empty)');
  const proj = () => p.evaluate(() => { const B = window.__app.battle, c = 6, r = 3; const q = B.world.project(Math.sqrt(3) * (c + 0.5 * (r & 1)), 0, 1.5 * r); return [q.x, q.y]; });
  // 사람처럼: 먼저 위로 끌어올린 뒤(카드 줄 가로 스크롤과 구분) 목표 칸으로. 끌기 시작하면 카메라가 멀어지므로 목표 위치를 매번 다시 계산
  await down(5, ...card); for (let k = 1; k <= 4; k++) { await move(5, card[0], card[1] - 15 * k); await p.waitForTimeout(40); }
  await p.waitForTimeout(500); // 카메라가 멀어지는 동안 대기
  let cur = [card[0], card[1] - 60];
  for (let k = 1; k <= 12; k++) { const tgt = await proj(); cur = [cur[0] + (tgt[0] - cur[0]) * 0.35, cur[1] + (tgt[1] - cur[1]) * 0.35]; await move(5, ...cur); await p.waitForTimeout(60); }
  const tgtF = await proj(); await move(5, ...tgtF); await p.waitForTimeout(250);
  say('drag', JSON.stringify(await p.evaluate(() => { const d = window.__app.battle.drag; return d ? { cell: d.cell, ok: d.ok, why: d.why } : null; })));
  await up(5); await p.waitForTimeout(700);
  const st2 = await p.evaluate(() => { const B = window.__app.battle; return { heroes: B.heroes.map(h => [h.hid, h.c, h.r]), hand: B.hand.length }; });
  check(st2.heroes.length === 1 && st2.hand === st1.hand - 1, '카드를 끌어 전장에 놓으면 영웅 배치', JSON.stringify(st2)); await shot('11_hero_placed');
  await tapSel('.modeb'); await p.waitForTimeout(600);
  const mode1 = await p.evaluate(() => window.__app.battle.mode); await shot('12_command_mode');
  await tapSel('.modeb'); await p.waitForTimeout(400);
  const mode2 = await p.evaluate(() => window.__app.battle.mode);
  check(mode1 === 'command' && mode2 === 'control', '모드 버튼 탭 → 지휘/조작 전환', mode1 + '→' + mode2);
  await tapSel('[data-b="pause"]'); await p.waitForTimeout(500);
  const paused = await p.evaluate(() => window.__app.battle.paused); await shot('13_pause');
  await tapSel('[data-p="resume"]'); await p.waitForTimeout(400);
  const resumed = await p.evaluate(() => !window.__app.battle.paused);
  check(paused && resumed, '일시정지 → 계속하기', `${paused} ${resumed}`);
  await tapSel('[data-b="speed"]'); await p.waitForTimeout(300);
  const spd = await p.evaluate(() => window.__app.battle.speed); await tapSel('[data-b="speed"]');
  check(spd === 2, '배속 버튼 탭 → 2배속', String(spd));
  await tapSel('[data-b="go"]'); await p.waitForTimeout(300); await tapSel('[data-b="auto"]');
  const heroAnims = new Set();
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(500); const a = await p.evaluate(() => window.__app.battle ? window.__app.battle.heroes.map(h => h.view.cur && h.view.cur.getClip().name) : []); a.forEach(x => heroAnims.add(x)); }
  await shot('14_stage_fight');
  const st3 = await p.evaluate(() => { const B = window.__app.battle; return { marker: B && B.__marker, phase: B && B.phase, wave: B && B.waveIdx, kills: B && B.kills, playTime: B && Math.round(B.playTime) }; });
  check(st3.marker === 2 && st3.playTime >= 8, '스테이지 전투가 다시 시작되지 않고 진행됨', JSON.stringify(st3));
  check([...heroAnims].some(a => /Attack|Shoot|Spell/.test(a || '')), '배치한 영웅이 실제 공격 동작', [...heroAnims].join(', '));
  const lt = await p.evaluate(() => window.__lt.filter(x => x[1] >= 200)); say('longtasks>=200ms', JSON.stringify(lt));
  check(errors.length === 0, '스크립트 오류 없음', errors.slice(0, 5).join(' | '));
  const video = await p.video().path(); await ctx.close(); await b.close();
  fs.renameSync(video, path.join(OUT, 'playtest.webm'));
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, log }, null, 1));
  say('video', path.join(OUT, 'playtest.webm'));
  process.exit(checks.every(c => c.ok) ? 0 : 1);
})();
