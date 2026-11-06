// node tests/core.test.mjs — 해상도 칸 수(REV01 표), 맵 검증, 몬스터 판정 대표 유형 검사
// (Drive TEST Game/claude/tests/core.test.mjs 사본)
import { slotCounts, CTRL } from '../game/js/layout.js';
import { HexMap, placementCheck, key, dist, fromWorld, toWorld } from '../game/js/hex.js';
import { monsterTick } from '../game/js/rules.js';
import { MAPS } from '../game/js/data.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };

// 1) REV01 12개 해상도 표 (UI 100%, 인셋 0)
const REV01 = [
  [1280, 720, 2, 10], [1440, 720, 3, 11], [1600, 720, 5, 13], [1920, 1080, 2, 10], [2340, 1080, 5, 12], [2400, 1080, 5, 13],
  [2520, 1080, 6, 13], [2532, 1170, 5, 12], [2560, 1440, 2, 10], [2640, 1080, 7, 14], [3120, 1440, 5, 12], [3840, 1644, 6, 13]];
for (const [w, h, c, m] of REV01) {
  const s = slotCounts(w, h);
  ok(s.ctrl === c && s.cmd === m, `${w}x${h} ctrl ${s.ctrl}/${c} cmd ${s.cmd}/${m}`);
  // N장은 들어가고 N+1장은 안 들어감
  ok(s.ctrlRemain >= 0 && s.ctrlRemain < 98.6, `${w}x${h} ctrl remain ${s.ctrlRemain}`);
  ok(s.cmdRemain >= -1e-6 && s.cmdRemain < 100.6, `${w}x${h} cmd remain ${s.cmdRemain}`);
}
// 2) 조작 모드 버튼 겹침 없음 + 최소 간격 8 (원형 버튼은 원 거리)
const circ = n => { const r = CTRL[n]; return { x: r.x + r.w / 2, y: r.y + r.h / 2, r: r.w / 2 }; };
const btns = ['slam', 'thrust', 'whirl', 'attack', 'run', 'dodge', 'guard', 'mode'];
for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
  const a = circ(btns[i]), b = circ(btns[j]);
  ok(Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r >= 8, `gap ${btns[i]}-${btns[j]}`);
}
ok(CTRL.auto.x + CTRL.auto.w <= 367.4 + 1e-9 && CTRL.slam.x === 702, 'REV01 경계 367.4 / V-578');

// 3) 맵: 모든 경로 칸이 앞으로 진행 가능
for (const [id, def] of Object.entries(MAPS)) {
  const m = new HexMap(def);
  ok(m.validateForward().length === 0, `map ${id} forward ${JSON.stringify(m.validateForward())}`);
  ok(m.connectedWith(new Set()), `map ${id} connected`);
}
// 4) 격자 수학
for (const [c, r] of [[0, 0], [3, 1], [7, 4], [10, 9]]) { const w = toWorld(c, r); const [a, b] = fromWorld(w.x + 0.1, w.z - 0.1); ok(a === c && b === r, `fromWorld ${c},${r}`); }
ok(dist(0, 0, 1, 0) === 1 && dist(0, 0, 0, 1) === 1 && dist(0, 1, 1, 0) === 1 && dist(0, 0, 2, 2) === 3, 'hex dist');

// 5) 몬스터 판정 (폭 2칸 일자 경로)
const map2 = new HexMap(MAPS.straight2); // 행 3,4
const T = (monsters, heroes) => monsterTick({ map: map2, monsters, heroes });
{ // W2-01 직진 빈칸 → 직진
  const m = { id: 1, c: 6, r: 3, order: 1, held: null };
  T([m], []); ok(m.c === 7 && m.r === 3, 'W2-01 직진');
}
{ // W2-03 직진 여유 영웅 → 붙잡힘
  const m = { id: 1, c: 6, r: 3, order: 1, held: null }; const h = { id: 'A', c: 7, r: 3, holding: null };
  const ev = T([m], [h]); ok(m.held === 'A' && h.holding === 1 && m.c === 6, 'W2-03 붙잡힘'); ok(ev.holds.length === 1, 'W2-03 ev');
}
{ // W2-02 직진=몬스터(붙잡힘) · 대각=빈칸 → 대각선 이동
  const a = { id: 1, c: 7, r: 3, order: 1, held: 'A' }; const hA = { id: 'A', c: 8, r: 3, holding: 1 };
  const b = { id: 2, c: 6, r: 3, order: 2, held: null };
  T([a, b], [hA]); ok(b.r === 4 && b.c === 7, 'W2-02 대각선 (홀수행 아래오른쪽 = 다음 열)');
}
{ // W2-04 직진=몬스터 · 대각=여유 영웅 → 대기 + 대각 영웅 공격 (붙잡힘 아님)
  const a = { id: 1, c: 7, r: 3, order: 1, held: 'B' }; const hB = { id: 'B', c: 8, r: 3, holding: 1 };
  const hA = { id: 'A', c: 7, r: 4, holding: null };
  const b = { id: 2, c: 6, r: 3, order: 2, held: null };
  const ev = T([a, b], [hB, hA]); ok(b.c === 6 && b.r === 3 && b.held == null && ev.wait[2] === 'A', 'W2-04 대기공격');
}
{ // W2-06 직진·대각 모두 몬스터 → 공격 없이 대기
  const a = { id: 1, c: 7, r: 3, order: 1, held: 'B' }; const hB = { id: 'B', c: 8, r: 3, holding: 1 };
  const a2 = { id: 3, c: 7, r: 4, order: 3, held: 'C' }; const hC = { id: 'C', c: 8, r: 4, holding: 3 };
  const b = { id: 2, c: 6, r: 3, order: 2, held: null };
  const ev = T([a, a2, b], [hB, hC]); ok(b.c === 6 && ev.wait[2] === undefined, 'W2-06 대기');
}
{ // 앞 몬스터가 비운 칸은 즉시 빈칸 (줄줄이 직진)
  const ms = [0, 1, 2, 3].map(i => ({ id: i, c: 6 + i, r: 3, order: 10 - i, held: null }));
  T(ms, []); ok(ms.every((m, i) => m.c === 7 + i), '연속 직진');
}
{ // W2-07 경합: 직진 우선
  const a = { id: 1, c: 8, r: 3, order: 1, held: null };   // 앞서 진행
  const blk = { id: 9, c: 7, r: 4, order: 0, held: 'X' }; const hX = { id: 'X', c: 8, r: 4, holding: 9 };
  const b = { id: 2, c: 7, r: 3, order: 2, held: null };
  T([a, blk, b], [hX]); ok(a.c === 9 && b.c === 8, 'W2-07 직진 연쇄');
}
// 6) 배치 금지: 폭 2칸에서 한쪽 줄 영웅과 맞닿은 반대 줄 2칸
{
  const heroCells = new Set([key(10, 3)]);
  const res = [[10, 4], [11, 4], [12, 4], [9, 4]].map(([c, r]) => placementCheck(map2, heroCells, new Set(), c, r).ok);
  ok(res[0] === false && res[1] === false && res[2] === true && res[3] === true, `폭2 금지칸 ${res}`);
  ok(placementCheck(map2, new Set(), new Set(), 3, 3).ok === false, '출발 금지 구간');
  ok(placementCheck(map2, new Set(), new Set(), 3, 0).ok === true, '경로 밖 배치 허용');
}
console.log(`PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
