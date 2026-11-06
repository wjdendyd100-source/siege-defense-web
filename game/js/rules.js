// 몬스터 이동·붙잡힘·대기 공격 판정 (참조 정본 부록 A 순서를 그대로 따른다)
// ① 통과 ② 직진 반복 ③ 대각선 한 마리 → ② ④ 대기/공격. 순수 함수: 입력 상태를 직접 갱신하고 사건 목록을 돌려준다.
import { key, fwd, upRight, downRight, progressX } from './hex.js?v=20261106c';

// st = { map, monsters:[{id,c,r,order,held,diagPref}], heroes:[{id,c,r,holding}] }  (heroes는 경로 위 유닛만)
export function monsterTick(st) {
  const { map } = st;
  const ev = { moves: [], exits: [], holds: [], wait: {} };
  const occM = new Map(), occH = new Map();
  for (const m of st.monsters) occM.set(key(m.c, m.r), m);
  for (const h of st.heroes) occH.set(key(h.c, h.r), h);

  // ① 통과
  const pending = new Set();
  for (const m of st.monsters) {
    if (m.held != null) continue;
    if (m.c >= map.endCol) { ev.exits.push(m.id); occM.delete(key(m.c, m.r)); m.exited = true; continue; }
    pending.add(m);
  }
  const empty = (c, r) => map.isPath(c, r) && !occM.has(key(c, r)) && !occH.has(key(c, r));
  const sorted = () => [...pending].sort((a, b) => (progressX(b.c, b.r) - progressX(a.c, a.r)) || (a.order - b.order));
  const rowCount = r => { let n = 0; for (const m of st.monsters) if (!m.exited && m.r === r) n++; return n; };
  const diagOrder = m => {
    const u = upRight(m.c, m.r), d = downRight(m.c, m.r);
    const uu = map.isPath(...u), dd = map.isPath(...d);
    if (uu && dd) {
      const nu = rowCount(m.r - 1), nd = rowCount(m.r + 1);
      if (nu < nd) return [u, d];
      if (nd < nu) return [d, u];
      return (m.diagPref || 0) === 0 ? [u, d] : [d, u];
    }
    return uu ? [u] : dd ? [d] : [];
  };
  const move = (m, c, r, diag) => {
    occM.delete(key(m.c, m.r));
    ev.moves.push({ id: m.id, fc: m.c, fr: m.r, tc: c, tr: r, diag });
    m.c = c; m.r = r; occM.set(key(c, r), m); pending.delete(m);
  };

  for (;;) {
    // ② 직진 반복
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of sorted()) {
        if (!pending.has(m)) continue;
        const [fc, fr] = fwd(m.c, m.r);
        const h = occH.get(key(fc, fr));
        if (h && h.holding == null) { m.held = h.id; h.holding = m.id; pending.delete(m); ev.holds.push({ m: m.id, h: h.id }); changed = true; continue; }
        if (empty(fc, fr)) { move(m, fc, fr, false); changed = true; }
      }
    }
    // ③ 대각선 한 마리
    let moved = false;
    for (const m of sorted()) {
      for (const [c, r] of diagOrder(m)) {
        if (empty(c, r)) { move(m, c, r, true); m.diagPref = (m.diagPref || 0) ^ 1; moved = true; break; }
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  // ④ 대기: 직진 → 대각선 순서로 첫 경로 위 영웅을 대기 중 공격 (붙잡힘 아님)
  for (const m of pending) {
    for (const [c, r] of [fwd(m.c, m.r), ...diagOrder(m)]) {
      const h = occH.get(key(c, r));
      if (h) { ev.wait[m.id] = h.id; break; }
    }
  }
  return ev;
}

// 경로 미리보기: 현재 배치 스냅샷에서 출발 줄마다 첫 몬스터 1마리의 예상 경로 (피해·처치 계산 없음)
export function previewPaths(map, heroCellsOnPath) {
  const out = [];
  for (const [c0, r0] of map.start) {
    const m = { id: 'p', c: c0, r: r0, order: 0, held: null, diagPref: 0 };
    const heroes = [...heroCellsOnPath].map((k, i) => ({ id: 'h' + i, c: Math.floor(k / 1000), r: k % 1000, holding: null }));
    const pts = [[c0, r0]]; let stop = null;
    for (let i = 0; i < 200; i++) {
      const ev = monsterTick({ map, monsters: [m], heroes });
      if (ev.exits.length) break;
      if (m.held != null) { stop = [m.c, m.r]; break; }
      if (!ev.moves.length) { stop = [m.c, m.r]; break; }
      pts.push([m.c, m.r]);
    }
    out.push({ pts, stop });
  }
  return out;
}
