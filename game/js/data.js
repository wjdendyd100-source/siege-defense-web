// 게임 데이터 (수치·영웅·몬스터·스토리·스테이지). 코드와 분리해 교체 가능하게 둔다.

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
export const RANK_MULT = { E: 1.0, D: 1.5, C: 2.2, B: 3.2, A: 4.6, S: 6.6 };
export const RANK_COLOR = { E: '#8d8a83', D: '#c9c4b8', C: '#3fa36b', B: '#3f78c9', A: '#9b4fd1', S: '#d9433a' };

// 성급(1~5성)은 전투 안에서만 존재. 같은 영웅·같은 성급 2명 → 다음 성급
export const STAR = {
  atk: s => Math.pow(1.6, s - 1),
  hp: s => Math.pow(1.45, s - 1),
  as: s => Math.pow(1.06, s - 1),
};
export const SUMMON_STAR_RATE = [0.638, 0.30, 0.05, 0.01, 0.002]; // 1~5성
export const SUMMON_COST = 10;
export const HAND_MAX = 16;
export const DEF_K = 100; // 받는 피해 = 피해 × K/(K+방어력)

// 8병과. group: melee(경로 위 저지) / ranged / support
export const CLASSES = {
  sword:   { name: '검사', en: 'SWORDSMAN', group: 'melee',   hp: 120, atk: 12, as: 1.0,  range: 1, def: 6,  block: 1 },
  spear:   { name: '창병', en: 'SPEARMAN',  group: 'melee',   hp: 110, atk: 15, as: 0.6,  range: 2, def: 5,  block: 1, pierce: [1, 0.5] },
  cavalry: { name: '기병', en: 'CAVALRY',   group: 'melee',   hp: 150, atk: 13, as: 0.8,  range: 1, def: 8,  block: 1, charge: 2.5 },
  archer:  { name: '궁수', en: 'ARCHER',    group: 'ranged',  hp: 45,  atk: 9,  as: 1.1,  range: 3, def: 2,  block: 1 },
  gunner:  { name: '사수', en: 'GUNNER',    group: 'ranged',  hp: 45,  atk: 22, as: 0.45, range: 4, def: 2,  block: 1, pierce: [1, 0.6] },
  mage:    { name: '마법사', en: 'MAGE',    group: 'ranged',  hp: 50,  atk: 14, as: 0.6,  range: 3, def: 2,  block: 1, splash: 0.6 },
  healer:  { name: '힐러', en: 'HEALER',    group: 'support', hp: 60,  atk: 4,  as: 0.8,  range: 2, def: 3,  block: 1, heal: 11 },
  bard:    { name: '바드', en: 'BARD',      group: 'support', hp: 70,  atk: 5,  as: 1.0,  range: 2, def: 3,  block: 1, aura: { as: 0.25, atk: 0.10 } },
};
export const CLASS_ORDER = ['sword', 'spear', 'archer', 'gunner', 'cavalry', 'healer', 'bard', 'mage'];

// 영웅 (초반 영웅은 스토리로 획득, 나머지는 소환)
export const HEROES = {
  toby:     { name: '토비',     title: '견습 종자',       cls: 'sword',   rank: 'E', art: 'hero_toby',     source: 'story' },
  nina:     { name: '니나',     title: '숲의 사냥꾼',     cls: 'archer',  rank: 'E', art: 'hero_nina',     source: 'story' },
  hans:     { name: '한스',     title: '성읍 민병대장',   cls: 'spear',   rank: 'D', art: 'hero_hans',     source: 'story' },
  lian:     { name: '리안',     title: '떠돌이 음유시인', cls: 'bard',    rank: 'C', art: 'hero_lian',     source: 'story' },
  marco:    { name: '마르코',   title: '화승총 명사수',   cls: 'gunner',  rank: 'C', art: 'hero_marco',    source: 'gacha' },
  bran:     { name: '브란',     title: '창벽의 노병',     cls: 'spear',   rank: 'B', art: 'hero_bran',     source: 'gacha' },
  elise:    { name: '엘리스',   title: '녹림의 레인저',   cls: 'archer',  rank: 'B', art: 'hero_elise',    source: 'gacha' },
  roderick: { name: '로데릭',   title: '백마 기사단장',   cls: 'cavalry', rank: 'A', art: 'hero_roderick', source: 'gacha' },
  sera:     { name: '세라',     title: '은빛 검희',       cls: 'sword',   rank: 'A', art: 'hero_sera',     source: 'gacha' },
  amelia:   { name: '아멜리아', title: '새벽의 성녀',     cls: 'healer',  rank: 'S', art: 'hero_amelia',   source: 'gacha' },
  isolde:   { name: '이졸데',   title: '자정의 대마도사', cls: 'mage',    rank: 'S', art: 'hero_isolde',   source: 'gacha' },
};
export const GACHA_RATE = { E: 0.22, D: 0.30, C: 0.24, B: 0.15, A: 0.07, S: 0.02 };
export const GACHA_COST = { one: 150, ten: 1350 };

export const PROTAGONIST = {
  id: 'leon', name: '레온', title: '에델발트의 기사', art: 'hero_protagonist',
  hp: 620, atk: 22, def: 12, regen: 3, speed: 4.2, runMul: 1.55,
  combo: [ // 기본 공격 연속기 (던파식 3타 + 마무리)
    { mul: 1.0, dur: 0.36, hitAt: 0.15, reach: 1.9, arc: 120, lunge: 0.35 },
    { mul: 1.15, dur: 0.36, hitAt: 0.15, reach: 1.9, arc: 120, lunge: 0.35 },
    { mul: 1.7, dur: 0.52, hitAt: 0.27, reach: 2.3, arc: 150, lunge: 0.8, knock: 0.6 },
  ],
  skills: {
    slam:   { name: '내려찍기', cd: 6,  mul: 3.2, radius: 2.0, stun: 1.2, dur: 0.6, hitAt: 0.38 },
    thrust: { name: '찌르기',   cd: 5,  mul: 2.6, length: 4.2, width: 1.0, dur: 0.42, hitAt: 0.10, dash: 3.2 },
    whirl:  { name: '회전베기', cd: 9,  mul: 0.75, hits: 6, radius: 1.8, dur: 1.2 },
  },
  dodge: { cd: 1.1, dist: 3.4, dur: 0.32 },
  guardReduce: 0.75,
  respawn: 5,
};

export const MONSTERS = {
  goblin:     { name: '해골 병사',     art: 'mon_goblin',     hp: 60,   atk: 6,  as: 1.0, def: 0,  gold: 3,  scale: 0.85 },
  orc:        { name: '해골 전사',     art: 'mon_orc',        hp: 280,  atk: 16, as: 0.7, def: 10, gold: 8,  scale: 1.25 },
  skeleton:   { name: '해골 석궁병',   art: 'mon_skeleton',   hp: 75,   atk: 9,  as: 0.8, def: 2,  gold: 5,  scale: 1.0, ranged: 2 },
  darkknight: { name: '타락한 흑기사', art: 'mon_darkknight', hp: 3400, atk: 42, as: 0.6, def: 30, gold: 120, scale: 1.7, boss: true },
};

// ── 맵: 행 단위(왼쪽→오른쪽) 경로 띠. band[c] = [위 행, 폭]
function band(cols, segs) { // segs: [{to, top, w}] 열 c까지 top 고정 (선형 보간 허용)
  const out = [];
  let prev = segs[0];
  for (const s of segs) {
    for (let c = out.length; c <= s.to; c++) {
      let top = s.top;
      if (s.slide && prev) { const t = (c - (prev.to)) / (s.to - prev.to); top = Math.round(prev.top + (s.top - prev.top) * t); }
      out.push([top, s.w]);
    }
    prev = s;
  }
  return out.slice(0, cols);
}

export const MAPS = {
  straight3: { cols: 20, rows: 9, band: band(20, [{ to: 19, top: 3, w: 3 }]) },
  straight2: { cols: 20, rows: 8, band: band(20, [{ to: 19, top: 3, w: 2 }]) },
  bend3: { cols: 24, rows: 11, band: band(24, [
    { to: 5, top: 5, w: 3 }, { to: 9, top: 2, w: 3, slide: true }, { to: 14, top: 2, w: 3 },
    { to: 18, top: 6, w: 3, slide: true }, { to: 23, top: 6, w: 3 }]) },
  zig3: { cols: 26, rows: 12, band: band(26, [
    { to: 4, top: 1, w: 3 }, { to: 8, top: 5, w: 3, slide: true }, { to: 12, top: 5, w: 3 },
    { to: 16, top: 8, w: 3, slide: true }, { to: 19, top: 8, w: 3 }, { to: 23, top: 4, w: 3, slide: true }, { to: 25, top: 4, w: 3 }]) },
  wide4: { cols: 26, rows: 12, band: band(26, [
    { to: 6, top: 4, w: 4 }, { to: 10, top: 1, w: 4, slide: true }, { to: 15, top: 1, w: 4 },
    { to: 19, top: 5, w: 4, slide: true }, { to: 25, top: 5, w: 4 }]) },
};

const W = (type, count, interval = 2) => ({ type, count, interval });

// 스토리: 컷씬(대화) → 간단한 전투 → 대화. 클리어 시 다음 스테이지 해금.
export const STORIES = [
  { id: 'story1', no: 1, title: '불타는 변경 마을', bg: 'bg_village', reward: { hero: 'toby', crystals: 300 },
    pre: [
      ['narr', null, '에델발트 왕국력 812년, 가을. 동쪽 숲 너머에서 연기가 피어올랐다.'],
      ['say', 'toby', '기사님! 레온 기사님! 해골들이… 땅에서 기어 나와 마을을 덮쳤어요!'],
      ['say', 'leon', '진정해라, 꼬마. 이름이 뭐지?'],
      ['say', 'toby', '토비요! 대장간 집 아들이에요. 저도 싸울 수 있어요!'],
      ['say', 'leon', '좋다, 토비. 내 뒤를 따라라. 길을 막으면 놈들은 지나가지 못한다.'],
    ],
    battle: { map: 'straight3', lives: 99, gold: 0, summon: false, tick: 0.9, noFail: true, prep: 0,
      hint: true, waves: [W('goblin', 3, 3), W('goblin', 4, 2.5)] },
    post: [
      ['say', 'toby', '해, 해냈어요! 해골들이 산산이 부서졌어요!'],
      ['say', 'leon', '잘 버텼다. 오늘부터 너는 내 종자다, 토비.'],
      ['narr', null, '【토비(E·검사)가 동료가 되었다】 이제 전투에서 영웅을 소환해 배치할 수 있다.'],
    ] },
  { id: 'story2', no: 2, title: '숲의 사냥꾼', bg: 'bg_village', reward: { hero: 'nina', crystals: 300 },
    pre: [
      ['narr', null, '해골들이 기어 나온 무덤의 흔적을 쫓아 숲으로 들어선 레온과 토비.'],
      ['say', 'nina', '거기 멈춰요. 이 숲에서 함부로 칼을 휘두르면 곤란해요.'],
      ['say', 'leon', '우리는 되살아난 해골들을 쫓고 있다. 너는?'],
      ['say', 'nina', '니나. 사냥꾼이에요. 그 뼈다귀들이 내 덫을 다 망가뜨렸거든요. …같이 가죠.'],
    ],
    battle: { map: 'straight3', lives: 99, gold: 60, summon: true, party: ['toby'], tick: 0.85, noFail: true, prep: 20,
      waves: [W('goblin', 6, 2.2), W('skeleton', 3, 3)] },
    post: [
      ['say', 'nina', '석궁 쏘는 해골까지… 누군가 죽은 자들을 부리고 있어요.'],
      ['narr', null, '【니나(E·궁수)가 동료가 되었다】'],
    ] },
  { id: 'story3', no: 3, title: '성읍의 민병대', bg: 'bg_title', reward: { hero: 'hans', crystals: 400 },
    pre: [
      ['say', 'hans', '하하! 왕도의 기사가 이런 변경까지 오다니. 나는 한스, 이 성읍 민병대장이오.'],
      ['say', 'leon', '방패를 든 해골 전사들이 몰려오고 있다. 성문을 지킬 창이 필요하다.'],
      ['say', 'hans', '창이라면 우리 민병대가 제일이지. 앞은 검이, 뒤는 창이 맡는 거요!'],
    ],
    battle: { map: 'straight3', lives: 99, gold: 80, summon: true, party: ['toby', 'nina'], tick: 0.8, noFail: true, prep: 20,
      waves: [W('goblin', 8, 1.8), W('orc', 2, 4)] },
    post: [['narr', null, '【한스(D·창병)가 동료가 되었다】']] },
  { id: 'story4', no: 4, title: '음유시인의 노래', bg: 'bg_title', reward: { hero: 'lian', crystals: 400 },
    pre: [
      ['say', 'lian', '♪ 백마의 기사, 흰 성벽의 날에… 아, 실례. 노래가 절로 나와서요.'],
      ['say', 'leon', '노래로 싸움을 이길 수 있나?'],
      ['say', 'lian', '물론이죠. 제 노래를 들은 병사는 두 배로 빨리 칼을 휘두르거든요!'],
    ],
    battle: { map: 'straight3', lives: 99, gold: 100, summon: true, party: ['toby', 'nina', 'hans'], tick: 0.8, noFail: true, prep: 20,
      waves: [W('goblin', 10, 1.5), W('skeleton', 4, 2.5), W('orc', 2, 4)] },
    post: [['narr', null, '【리안(C·바드)이 동료가 되었다】 이제 소환으로 더 많은 영웅을 모을 수 있다.']] },
  { id: 'story5', no: 5, title: '흑기사의 그림자', bg: 'bg_village', reward: { crystals: 800 },
    pre: [
      ['narr', null, '모든 습격의 배후에는 한 사람이 있었다. 한때 왕국 최고의 기사였던 자.'],
      ['say', 'leon', '…발터 경. 당신이 왜 죽은 자들의 군단을 이끄는 겁니까.'],
      ['say', 'darkknight', '왕국은 이미 썩었다, 레온. 흰 성벽은 오늘 무너진다.'],
    ],
    battle: { map: 'straight3', lives: 99, gold: 120, summon: true, party: ['toby', 'nina', 'hans', 'lian'], tick: 0.8, noFail: true, prep: 20,
      waves: [W('goblin', 10, 1.2), W('orc', 3, 3)] },
    post: [
      ['say', 'darkknight', '제법이군. 하지만 진짜 전쟁은 성문 앞에서다.'],
      ['narr', null, '흑기사는 어둠 속으로 사라졌다. 최종 결전은 스테이지 5 「성문 앞의 포화」에서.'],
    ] },
];

// 스테이지: 스토리를 바탕으로 한 본격 전투. 3성 조건 = 생명 손실 0.
export const STAGES = [
  { id: 'stage1', no: 1, title: '마을 외곽 방어선', map: 'straight3', lives: 5, gold: 100, deploy: 6, tick: 0.8, prep: 60,
    waves: [[W('goblin', 12, 1.6)], [W('goblin', 14, 1.3), W('skeleton', 4, 2.5)]], crystals: 200 },
  { id: 'stage2', no: 2, title: '안개 숲의 매복', map: 'bend3', lives: 5, gold: 100, deploy: 8, tick: 0.78, prep: 60,
    waves: [[W('goblin', 14, 1.4)], [W('skeleton', 8, 1.8), W('goblin', 10, 1.2)], [W('orc', 4, 3), W('goblin', 10, 1.0)]], crystals: 250 },
  { id: 'stage3', no: 3, title: '성읍 남문 공방', map: 'zig3', lives: 5, gold: 120, deploy: 9, tick: 0.75, prep: 60, hpMul: 1.5,
    waves: [[W('goblin', 16, 1.2)], [W('orc', 6, 2.4), W('skeleton', 8, 1.5)], [W('goblin', 20, 0.9), W('orc', 5, 2.5)]], crystals: 300 },
  { id: 'stage4', no: 4, title: '음유시인의 다리', map: 'wide4', lives: 5, gold: 140, deploy: 10, tick: 0.72, prep: 60, hpMul: 2.1,
    waves: [[W('goblin', 18, 1.0), W('skeleton', 6, 1.6)], [W('orc', 8, 2.0)], [W('skeleton', 12, 1.0), W('orc', 6, 2.0), W('goblin', 20, 0.8)]], crystals: 350 },
  { id: 'stage5', no: 5, title: '성문 앞의 포화', map: 'zig3', lives: 5, gold: 160, deploy: 11, tick: 0.72, prep: 60, hpMul: 2.9,
    waves: [[W('goblin', 20, 0.9), W('skeleton', 8, 1.4)], [W('orc', 10, 1.6), W('skeleton', 10, 1.2)], [W('orc', 6, 2), W('darkknight', 1, 1), W('goblin', 16, 0.9)]], crystals: 600 },
];

// 해금 순서: 스토리1 → 스테이지1 → 스토리2 → 스테이지2 …
export const PROGRESSION = [];
for (let i = 0; i < 5; i++) { PROGRESSION.push('story' + (i + 1)); PROGRESSION.push('stage' + (i + 1)); }

export const SPEAKERS = {
  leon: { name: '레온', art: 'hero_protagonist' },
  darkknight: { name: '흑기사 발터', art: 'mon_darkknight' },
};
for (const [id, h] of Object.entries(HEROES)) SPEAKERS[id] = { name: h.name, art: h.art };
