// 앱 셸: 화면 전환·저장·해상도. 타이틀 → 로비 → 스토리/스테이지/영웅/소환/편성
import { loadAll, face, full } from './assets.js?v=20261106d';
import { Battle, heroStats } from './battle.js?v=20261106d';
import { HEROES, CLASSES, CLASS_ORDER, RANKS, RANK_COLOR, STORIES, STAGES, PROGRESSION, SPEAKERS, GACHA_RATE, GACHA_COST, PROTAGONIST } from './data.js?v=20261106d';
import { ICON, classIcon, starsHtml } from './icons.js?v=20261106d';
import { scaleOf } from './layout.js?v=20261106d';
import { sfx, setSfx } from './audio.js?v=20261106d';

const SAVE_KEY = 'edelwald_save_v1';
const GAME_TITLE = '에델발트 연대기';
const GAME_SUB = '흰 성벽의 맹세';

const DEFAULT_SAVE = () => ({ crystals: 1500, owned: {}, cleared: {}, party: [], leonLv: 1, settings: { ui: 1, op: 0.95, sfx: true, speed: 1 }, seenIntro: false });

class App {
  constructor() {
    this.rootEl = document.getElementById('app');
    this.screen = document.getElementById('screen');
    this.save = this.load();
    this.probe = document.getElementById('safe-probe');
    this.measure(); window.addEventListener('resize', () => this.onResize()); window.visualViewport && window.visualViewport.addEventListener('resize', () => this.onResize());
    this.applySettings();
  }
  load() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.owned) return Object.assign(DEFAULT_SAVE(), s, { settings: Object.assign(DEFAULT_SAVE().settings, s.settings) }); } catch { } return DEFAULT_SAVE(); }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { } }
  setSfx(on) { this.save.settings.sfx = on; setSfx(on); }
  applySettings() { setSfx(this.save.settings.sfx !== false); document.documentElement.style.setProperty('--btn-op', this.save.settings.op || 0.95); }
  measure() {
    const vv = window.visualViewport; this.W = Math.round(vv ? vv.width : window.innerWidth); this.H = Math.round(vv ? vv.height : window.innerHeight);
    const cs = getComputedStyle(this.probe); this.insets = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
    this.S = scaleOf(this.W, this.H);
    document.documentElement.style.setProperty('--s', this.S); document.documentElement.style.setProperty('--vw', this.W + 'px'); document.documentElement.style.setProperty('--vh', this.H + 'px');
    document.body.classList.toggle('portrait', this.H > this.W);
  }
  onResize() { this.measure(); if (this.battle) this.battle.onResize(); }

  // ── 진행·해금
  isCleared(id) { return !!this.save.cleared[id]; }
  isUnlocked(id) { const i = PROGRESSION.indexOf(id); if (i < 0) return false; return i === 0 || this.isCleared(PROGRESSION[i - 1]); }
  owned() { return Object.keys(this.save.owned).filter(k => this.save.owned[k] > 0); }

  show(fn, ...a) { if (this.battle) { this.battle.destroy(); this.battle = null; } this.screen.innerHTML = ''; this.screen.className = ''; fn.call(this, ...a); }

  // ───────── 타이틀
  title() {
    this.screen.className = 'scr title';
    this.screen.innerHTML = `<div class="bg" style="background-image:url(assets/bg_title.jpg)"></div><div class="shade"></div>
      <div class="logo"><div class="crest">${ICON.summon}</div><h1>${GAME_TITLE}</h1><div class="sub">${GAME_SUB}</div><div class="tag">영웅 수집형 육각 타워 디펜스 · 웹 프로토타입</div></div>
      <button class="btn gold big start">화면을 눌러 시작</button>
      <div class="foot">3D 캐릭터·애니메이션 KayKit by Kay Lousberg (CC0) · 일러스트·효과음은 이 프로젝트용 제작 · 글꼴 Noto Sans/Serif KR (SIL OFL) · three.js (MIT)</div>`;
    this.screen.querySelector('.start').addEventListener('click', () => { sfx('ui'); this.tryFullscreen(); this.show(this.lobby); });
  }
  tryFullscreen() { try { const d = document.documentElement; if (matchMedia('(pointer:coarse)').matches && d.requestFullscreen && !document.fullscreenElement) d.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { })).catch(() => { }); } catch { } }

  topbar(title, back) {
    return `<div class="topbar">${back ? `<button class="iconbtn back" data-nav="${back}" aria-label="뒤로">${ICON.back}</button>` : ''}<div class="tb-title">${title}</div>
      <div class="res">${ICON.crystal}<b>${this.save.crystals.toLocaleString('ko-KR')}</b></div></div>`;
  }
  bindNav() { this.screen.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { sfx('ui'); this.show(this[b.dataset.nav]); })); }

  // ───────── 로비
  lobby() {
    const next = PROGRESSION.find(id => !this.isCleared(id) && this.isUnlocked(id));
    const nextName = next ? (next.startsWith('story') ? `스토리 ${next.slice(5)}` : `스테이지 ${next.slice(5)}`) : '챕터 1 완료';
    this.screen.className = 'scr lobby';
    this.screen.innerHTML = `<div class="bg" style="background-image:url(assets/bg_title.jpg)"></div><div class="shade side"></div>
      ${this.topbar(`<span class="ttl">${GAME_TITLE}</span>`)}
      <div class="lobby-hero"><img src="${full(PROTAGONIST.art)}" alt=""><div class="plate"><b>${PROTAGONIST.name}</b><span>${PROTAGONIST.title} · Lv.${this.save.leonLv}</span></div></div>
      <div class="menu">
        <button class="mbtn story" data-go="storyList"><span class="mi">${ICON.route}</span><span><b>스토리</b><small>컷씬·대화와 함께하는 이야기 전투</small></span></button>
        <button class="mbtn stage" data-go="stageList"><span class="mi">${ICON.attack}</span><span><b>스테이지</b><small>본격 방어전 · 별 3개 도전</small></span></button>
        <div class="mrow">
          <button class="mbtn sm" data-go="heroes"><span class="mi">${ICON.guard}</span><b>영웅</b></button>
          <button class="mbtn sm" data-go="gacha"><span class="mi">${ICON.summon}</span><b>소환</b></button>
          <button class="mbtn sm" data-go="partyScreen"><span class="mi">${ICON.command}</span><b>편성</b></button>
        </div>
        <button class="btn gold big next" data-next="${next || ''}">${next ? '이어하기 · ' + nextName : nextName}</button>
      </div>
      <button class="iconbtn reset" data-reset aria-label="진행 초기화">초기화</button>`;
    this.screen.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { sfx('ui'); this.show(this[b.dataset.go]); }));
    this.screen.querySelector('[data-next]').addEventListener('click', () => { sfx('ui'); if (next) this.enter(next); });
    this.screen.querySelector('[data-reset]').addEventListener('click', () => this.confirm('진행 상황을 모두 초기화할까요?', () => { this.save = DEFAULT_SAVE(); this.persist(); this.show(this.lobby); }));
  }
  enter(id) { if (id.startsWith('story')) this.playStory(STORIES.find(s => s.id === id)); else this.partyScreen(STAGES.find(s => s.id === id)); }

  // ───────── 스토리·스테이지 목록 (각 10칸: 진입 가능 / 해금·준비 중 / 잠김)
  list(kind) {
    const items = kind === 'story' ? STORIES : STAGES;
    this.screen.className = 'scr listscr';
    let cells = '';
    for (let i = 0; i < 10; i++) {
      const it = items[i]; const id = `${kind}${i + 1}`;
      const unlocked = it && this.isUnlocked(id); const cleared = this.isCleared(id);
      const state = !it ? (i === items.length && this.isCleared(`${kind === 'story' ? 'stage' : 'story'}${i}`) ? 'soon' : 'locked') : unlocked ? 'open' : 'locked';
      const stars = kind === 'stage' && cleared ? this.save.cleared[id] : 0;
      cells += `<button class="node ${state}${cleared ? ' cleared' : ''}" data-id="${it && unlocked ? id : ''}">
        <div class="no">${kind === 'story' ? '스토리' : '스테이지'} 1-${i + 1}</div>
        <div class="nt">${it ? it.title : '준비 중'}</div>
        ${state === 'locked' ? `<div class="lk">${ICON.lock}</div>` : ''}${state === 'soon' ? '<div class="soon">준비 중</div>' : ''}
        ${kind === 'stage' && it ? `<div class="ns">${[1, 2, 3].map(n => `<i class="${n <= stars ? 'on' : ''}"></i>`).join('')}</div>` : ''}
        ${cleared ? '<div class="ok">클리어</div>' : ''}</button>`;
    }
    this.screen.innerHTML = `<div class="bg" style="background-image:url(assets/${kind === 'story' ? 'bg_village' : 'bg_title'}.jpg)"></div><div class="shade"></div>
      ${this.topbar(kind === 'story' ? '스토리 · 제1장 흰 성벽의 날' : '스테이지 · 제1장', 'lobby')}
      <div class="tabs"><button class="${kind === 'story' ? 'on' : ''}" data-tab="storyList">스토리</button><button class="${kind === 'stage' ? 'on' : ''}" data-tab="stageList">스테이지</button></div>
      <div class="nodes">${cells}</div>
      <div class="hintline">스토리를 클리어하면 같은 번호의 스테이지가, 스테이지를 클리어하면 다음 스토리가 열립니다.</div>`;
    this.bindNav();
    this.screen.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { sfx('ui'); this.show(this[b.dataset.tab]); }));
    this.screen.querySelectorAll('.node').forEach(b => b.addEventListener('click', () => { sfx('ui'); if (b.dataset.id) this.enter(b.dataset.id); else this.toast(b.classList.contains('soon') ? '준비 중인 콘텐츠입니다' : '이전 단계를 클리어하면 열립니다'); }));
  }
  storyList() { this.list('story'); }
  stageList() { this.list('stage'); }

  // ───────── 스토리: 컷씬(대화) → 간단한 전투 → 대화
  playStory(st) { this.show(this.dialogue, st.pre, st.bg, () => this.startBattle('story', st, st.battle.party || []), st.title, `스토리 1-${st.no}`); }
  dialogue(lines, bg, done, title, label) {
    this.screen.className = 'scr vn';
    this.screen.innerHTML = `<div class="bg kb" style="background-image:url(assets/${bg}.jpg)"></div><div class="shade vn"></div>
      <div class="vn-title"><small>${label || ''}</small><b>${title || ''}</b></div>
      <div class="actor l"></div><div class="actor r"></div>
      <div class="vn-box frame"><div class="vn-name"></div><div class="vn-text"></div><div class="vn-next">▼</div></div>
      <div class="vn-ctl"><button class="pill" data-a="auto">자동</button><button class="pill" data-a="skip">건너뛰기</button></div>`;
    let i = -1, typing = null, line = '', auto = false, autoT = null; const nameEl = this.screen.querySelector('.vn-name'), textEl = this.screen.querySelector('.vn-text');
    const L = this.screen.querySelector('.actor.l'), R = this.screen.querySelector('.actor.r');
    const next = () => {
      if (typing) { clearInterval(typing); typing = null; textEl.textContent = line; return; }
      i++; if (i >= lines.length) { clearTimeout(autoT); done(); return; }
      const [kind, who, text] = lines[i]; line = text; let n = 0; textEl.textContent = '';
      if (kind === 'narr') { nameEl.style.visibility = 'hidden'; textEl.classList.add('narr'); L.classList.remove('on'); R.classList.remove('on'); }
      else { const sp = SPEAKERS[who]; nameEl.style.visibility = ''; nameEl.textContent = sp.name; textEl.classList.remove('narr');
        const side = who === 'leon' ? L : R, other = side === L ? R : L; side.innerHTML = `<img src="${full(sp.art)}" alt="">`; side.classList.add('on', 'speak'); other.classList.remove('speak'); }
      typing = setInterval(() => { n += 1; textEl.textContent = line.slice(0, n); if (n >= line.length) { clearInterval(typing); typing = null; if (auto) autoT = setTimeout(next, 1400); } }, 28);
    };
    this.screen.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (a) { if (a.dataset.a === 'skip') { clearInterval(typing); clearTimeout(autoT); done(); } else { auto = !auto; a.classList.toggle('on', auto); if (auto && !typing) next(); } return; } sfx('ui', 0.4); clearTimeout(autoT); next(); });
    next();
  }

  // ───────── 편성 (스테이지 전 최대 5명)
  partyScreen(stage) {
    const own = this.owned();
    if (!this.save.party.length) this.save.party = own.slice(0, 5);
    const sel = new Set(this.save.party.filter(h => own.includes(h)));
    this.screen.className = 'scr party';
    const render = () => {
      const sorted = own.sort((a, b) => RANKS.indexOf(HEROES[b].rank) - RANKS.indexOf(HEROES[a].rank));
      this.screen.innerHTML = `<div class="bg" style="background-image:url(assets/bg_title.jpg)"></div><div class="shade"></div>
        ${this.topbar(stage ? `편성 · 스테이지 1-${stage.no} ${stage.title}` : '편성', stage ? 'stageList' : 'lobby')}
        <div class="party-slots">${[0, 1, 2, 3, 4].map(i => { const h = [...sel][i]; return h ? `<div class="pslot r-${HEROES[h].rank}"><div class="art" style="background-image:url(${face(HEROES[h].art)})"></div><b>${HEROES[h].name}</b><span>${CLASSES[HEROES[h].cls].name}</span></div>` : `<div class="pslot empty">빈 칸</div>`; }).join('')}</div>
        <div class="desc">전투에서 소환 시 편성한 영웅 중 무작위로 카드가 나옵니다 (1성 63.8% · 2성 30% · 3성 5% · 4성 1% · 5성 0.2%). 같은 영웅·같은 성급 2장 → 다음 성급.</div>
        <div class="grid">${own.length ? sorted.map(h => this.heroTile(h, sel.has(h))).join('') : '<div class="empty-msg">보유한 영웅이 없습니다. 스토리를 진행하거나 소환하세요.</div>'}</div>
        ${stage ? `<button class="btn gold big go" ${sel.size ? '' : 'disabled'}>출전 (${sel.size}/5)</button>` : ''}`;
      this.bindNav();
      this.screen.querySelectorAll('.htile').forEach(t => t.addEventListener('click', () => { sfx('ui'); const h = t.dataset.h; if (sel.has(h)) sel.delete(h); else if (sel.size < 5) sel.add(h); else this.toast('최대 5명까지 편성할 수 있습니다'); this.save.party = [...sel]; this.persist(); render(); }));
      const go = this.screen.querySelector('.go'); if (go) go.addEventListener('click', () => { if (!sel.size) return; sfx('ui'); this.startBattle('stage', stage, [...sel]); });
    };
    render();
  }
  heroTile(h, on, dim) {
    const d = HEROES[h], c = CLASSES[d.cls];
    return `<button class="htile r-${d.rank}${on ? ' on' : ''}${dim ? ' dim' : ''}" data-h="${h}"><div class="art" style="background-image:url(${face(d.art)})"></div>
      <div class="rk">${d.rank}</div><div class="cl">${classIcon(d.cls)}</div><div class="nm">${d.name}<small>${c.name}</small></div>${on ? '<div class="chk">✔</div>' : ''}${dim ? '<div class="miss">미획득</div>' : ''}</button>`;
  }

  // ───────── 영웅 도감
  heroes() {
    this.screen.className = 'scr heroes';
    const all = Object.keys(HEROES).sort((a, b) => RANKS.indexOf(HEROES[b].rank) - RANKS.indexOf(HEROES[a].rank));
    this.screen.innerHTML = `<div class="bg" style="background-image:url(assets/bg_title.jpg)"></div><div class="shade"></div>${this.topbar(`영웅 (${this.owned().length}/${all.length})`, 'lobby')}
      <div class="classbar">${CLASS_ORDER.map(k => `<span>${classIcon(k)}${CLASSES[k].name}</span>`).join('')}</div>
      <div class="grid">${all.map(h => this.heroTile(h, false, !this.save.owned[h])).join('')}</div>`;
    this.bindNav();
    this.screen.querySelectorAll('.htile').forEach(t => t.addEventListener('click', () => { sfx('ui'); this.heroDetail(t.dataset.h); }));
  }
  heroDetail(h) {
    const d = HEROES[h], c = CLASSES[d.cls]; const s1 = heroStats(h, 1), s5 = heroStats(h, 5);
    const role = { melee: '근거리 · 경로 위에서 몬스터를 붙잡음 (저지 1)', ranged: '원거리 · 경로 밖에서 안전하게 공격', support: '보조 · 아군 지원' }[c.group];
    const special = { spear: '직선 관통 2명 (100% / 50%)', gunner: '직선 관통 2명 (100% / 60%)', cavalry: '새 대상 첫 공격 2.5배 돌격', mage: '대상 주변 1칸 범위 피해 60%', healer: '사거리 안 체력 비율이 가장 낮은 아군 회복', bard: '사거리 안 아군 공격 속도 +25%, 공격력 +10%', archer: '유도 화살', sword: '균형 잡힌 근접 전투' }[d.cls];
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="dlg frame hero-dlg"><img class="full" src="${full(d.art)}" alt="">
      <div class="hd-info"><div class="hd-rank r-${d.rank}">${d.rank}</div><h2>${d.name}</h2><div class="hd-title">${d.title}</div>
      <div class="hd-cls">${classIcon(d.cls)} ${c.name} <small>${c.en}</small></div><div class="hd-role">${role}</div><div class="hd-sp">특성: ${special}</div>
      <table><tr><th></th><th>1성</th><th>5성</th></tr><tr><td>체력</td><td>${Math.round(s1.hp)}</td><td>${Math.round(s5.hp)}</td></tr><tr><td>${d.cls === 'healer' ? '회복' : '공격력'}</td><td>${Math.round(d.cls === 'healer' ? s1.heal : s1.atk)}</td><td>${Math.round(d.cls === 'healer' ? s5.heal : s5.atk)}</td></tr><tr><td>방어력</td><td>${Math.round(s1.def)}</td><td>${Math.round(s5.def)}</td></tr><tr><td>공격 속도</td><td>${s1.as.toFixed(2)}</td><td>${s5.as.toFixed(2)}</td></tr><tr><td>사거리</td><td>${s1.range}</td><td>${s5.range}</td></tr></table>
      <div class="hd-src">${this.save.owned[h] ? `보유 중 (중복 ${this.save.owned[h] - 1})` : d.source === 'story' ? '스토리 진행으로 획득' : '소환으로 획득'}</div>
      <button class="btn" data-close>닫기</button></div></div>`;
    this.rootEl.appendChild(m); m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
  }

  // ───────── 소환 (카드 뽑기)
  gacha() {
    this.screen.className = 'scr gacha';
    this.screen.innerHTML = `<div class="bg" style="background-image:url(assets/bg_title.jpg)"></div><div class="shade"></div>${this.topbar('영웅 소환', 'lobby')}
      <div class="g-banner frame"><div class="g-art">${['isolde', 'amelia', 'roderick'].map(h => `<img src="${full(HEROES[h].art)}" alt="">`).join('')}</div>
        <div class="g-txt"><h2>성문의 수호자 소환</h2><p>S ${pct(GACHA_RATE.S)} · A ${pct(GACHA_RATE.A)} · B ${pct(GACHA_RATE.B)} · C ${pct(GACHA_RATE.C)} · D ${pct(GACHA_RATE.D)} · E ${pct(GACHA_RATE.E)}</p><p class="dim">스토리 영웅(토비·니나·한스·리안)도 등장합니다. 중복 영웅은 결정 일부로 환급됩니다.</p>
        <div class="g-btns"><button class="btn gold" data-n="1">1회 소환 ${ICON.crystal}${GACHA_COST.one}</button><button class="btn gold" data-n="10">10회 소환 ${ICON.crystal}${GACHA_COST.ten}</button></div></div></div>`;
    this.bindNav();
    this.screen.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => this.pull(+b.dataset.n)));
  }
  pull(n) {
    const cost = n === 1 ? GACHA_COST.one : GACHA_COST.ten;
    if (this.save.crystals < cost) { this.toast('결정이 부족합니다. 스토리·스테이지를 클리어해 모으세요.'); return; }
    this.save.crystals -= cost; sfx('summon');
    const res = [];
    for (let i = 0; i < n; i++) {
      let r = Math.random(), rank = 'E'; for (const k of ['S', 'A', 'B', 'C', 'D', 'E']) { if (r < GACHA_RATE[k]) { rank = k; break; } r -= GACHA_RATE[k]; }
      const pool = Object.keys(HEROES).filter(h => HEROES[h].rank === rank); const h = pool[Math.floor(Math.random() * pool.length)];
      const dup = !!this.save.owned[h]; this.save.owned[h] = (this.save.owned[h] || 0) + 1;
      const refund = dup ? 20 + 30 * RANKS.indexOf(rank) : 0; this.save.crystals += refund; res.push({ h, dup, refund });
    }
    this.persist();
    const m = document.createElement('div'); m.className = 'modal pullres';
    m.innerHTML = `<div class="pr-grid">${res.map((r, i) => `<div class="pr-card r-${HEROES[r.h].rank}" style="animation-delay:${i * 0.12}s"><div class="art" style="background-image:url(${face(HEROES[r.h].art)})"></div><div class="rk">${HEROES[r.h].rank}</div><div class="nm">${HEROES[r.h].name}</div><div class="cl">${classIcon(HEROES[r.h].cls)}</div>${r.dup ? `<div class="dup">중복 +${r.refund}</div>` : '<div class="new">NEW</div>'}</div>`).join('')}</div><button class="btn gold" data-close>확인</button>`;
    this.rootEl.appendChild(m); m.querySelector('[data-close]').addEventListener('click', () => { m.remove(); this.show(this.gacha); });
    if (res.some(r => RANKS.indexOf(HEROES[r.h].rank) >= 4)) setTimeout(() => sfx('win'), 300);
  }

  // ───────── 전투
  startBattle(kind, def, party) {
    this.lastBattle = [kind, def, party];
    this.show(() => {
      const bdef = kind === 'story' ? { ...def.battle } : def;
      this.battle = new Battle(this, { def: bdef, party, onEnd: r => this.battleEnd(kind, def, r) });
    });
  }
  restartBattle() { const [k, d, p] = this.lastBattle; this.startBattle(k, d, p); }
  battleEnd(kind, def, r) {
    if (r.quit) { this.show(kind === 'story' ? this.storyList : this.stageList); return; }
    let rewards = [];
    if (r.win) {
      const first = !this.isCleared(def.id);
      if (kind === 'stage') { const prev = this.save.cleared[def.id] || 0; this.save.cleared[def.id] = Math.max(prev, r.stars); if (first) { this.save.crystals += def.crystals; rewards.push(`${ICON.crystal} ${def.crystals}`); this.save.leonLv++; rewards.push(`레온 Lv.${this.save.leonLv}`); } }
      else { this.save.cleared[def.id] = 1; if (first) { const rw = def.reward; if (rw.hero) { this.save.owned[rw.hero] = (this.save.owned[rw.hero] || 0) + 1; if (!this.save.party.includes(rw.hero) && this.save.party.length < 5) this.save.party.push(rw.hero); rewards.push(`영웅 ${HEROES[rw.hero].name}`); } this.save.crystals += rw.crystals; rewards.push(`${ICON.crystal} ${rw.crystals}`); } }
      this.persist();
    }
    const m = document.createElement('div'); m.className = 'modal result';
    const t = Math.floor(r.time);
    m.innerHTML = `<div class="dlg frame res-dlg ${r.win ? 'win' : 'lose'}"><h1>${r.win ? '승리' : '패배'}</h1>
      ${kind === 'stage' ? `<div class="bigstars">${[1, 2, 3].map(n => `<i class="${n <= r.stars ? 'on' : ''}" style="animation-delay:${n * 0.25}s"></i>`).join('')}</div><div class="cond">★ 클리어 · ★★ 생명 손실 2 이하 · ★★★ 생명 손실 없음</div>` : ''}
      <div class="stats"><span>처치 ${r.kills}</span><span>잃은 생명 ${r.lost}</span><span>시간 ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}</span></div>
      ${rewards.length ? `<div class="rw">첫 클리어 보상: ${rewards.join(' · ')}</div>` : ''}
      <div class="btns"><button class="btn" data-r="retry">다시 하기</button><button class="btn gold" data-r="next">${r.win ? '계속' : '목록으로'}</button></div></div>`;
    (this.battle ? this.battle.el : this.screen).appendChild(m);
    m.querySelector('[data-r="retry"]').addEventListener('click', () => { sfx('ui'); this.restartBattle(); });
    m.querySelector('[data-r="next"]').addEventListener('click', () => {
      sfx('ui');
      if (r.win && kind === 'story') this.show(this.dialogue, def.post, def.bg, () => this.show(this.stageList), def.title, `스토리 1-${def.no}`);
      else if (r.win) this.show(this.storyList);
      else this.show(kind === 'story' ? this.storyList : this.stageList);
    });
  }

  toast(t) { let el = document.getElementById('gtoast'); if (!el) { el = document.createElement('div'); el.id = 'gtoast'; this.rootEl.appendChild(el); } el.textContent = t; el.classList.add('show'); clearTimeout(this._t); this._t = setTimeout(() => el.classList.remove('show'), 1600); }
  confirm(t, yes) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="dlg frame"><p>${t}</p><div class="btns"><button class="btn" data-n>취소</button><button class="btn gold" data-y>확인</button></div></div>`; this.rootEl.appendChild(m); m.querySelector('[data-n]').onclick = () => m.remove(); m.querySelector('[data-y]').onclick = () => { m.remove(); yes(); }; }
}
const pct = v => (v * 100).toFixed(v < 0.1 ? 0 : 0) + '%';

const app = new App(); window.__app = app;
const bar = document.querySelector('#loading .lbar i');
loadAll(p => { bar.style.width = (p * 100) + '%'; }).then(() => {
  document.getElementById('loading').remove();
  const q = new URLSearchParams(location.search);
  app.dev = q.get('dev') === '1';
  if (q.get('qa')) { qaEntry(app, q); return; }
  app.show(app.title);
}).catch(e => { document.querySelector('#loading .lmsg').textContent = '불러오기 실패: ' + e.message; });

// 검증용 진입 (?qa=battle&mode=command&hand=6 등). 출시 화면 흐름에는 영향 없음.
function qaEntry(app, q) {
  const kind = q.get('qa');
  if (q.get('seed')) { app.save = DEFAULT_SAVE(); app.save.cleared = { story1: 1, stage1: 3, story2: 1, stage2: 2, story3: 1 }; app.save.owned = { toby: 1, nina: 1, hans: 1, marco: 2, elise: 1, isolde: 1, roderick: 1 }; app.save.party = ['toby', 'nina', 'hans', 'marco', 'isolde']; app.save.leonLv = 3; }
  if (kind === 'story-vn') { const st = STORIES[0]; app.show(app.dialogue, st.pre.slice(+(q.get('line') || 2)), st.bg, () => { }, st.title, '스토리 1-1'); return; }
  if (kind === 'detail') { app.show(app.heroes); app.heroDetail(q.get('h') || 'isolde'); return; }
  if (kind === 'pull') { app.show(app.gacha); app.save.crystals = 99999; app.pull(10); return; }
  if (kind === 'battle') {
    const st = STAGES[(+q.get('stage') || 1) - 1];
    const party = (q.get('party') || 'toby,nina,hans,lian,marco').split(',');
    app.startBattle('stage', { ...st, prep: 600 }, party);
    const b = app.battle; b.gold = 999;
    const n = +(q.get('hand') || 0); for (let i = 0; i < n; i++) b.addCard({ hid: party[i % party.length], star: 1 + (i % 3), invested: 10 });
    if (q.get('place')) { const pl = [['toby', 9, 4], ['hans', 11, 3], ['nina', 10, 1], ['marco', 12, 7], ['lian', 8, 6], ['amelia', 13, 1], ['isolde', 14, 7], ['roderick', 15, 4]]; for (const [h, c, r] of pl) b.placeHero(h, 2, c, r, 20); }
    if (q.get('mode') === 'command') b.setMode('command');
    b.onResize(); b.simulate(+(q.get('sim') || 1));
    if (q.get('go')) { b.startWave(); }
  } else app.show(app[kind] || app.title);
}
