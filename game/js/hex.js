// 정육각형 격자 (뾰족한 위, 홀수 행 반 칸 오른쪽: odd-r offset). 크기 1 = 외접 반지름.
export const SQ3 = Math.sqrt(3);
export const key = (c, r) => c * 1000 + r;
export const unkey = k => [Math.floor(k / 1000), k % 1000];

export function toWorld(c, r) { return { x: SQ3 * (c + 0.5 * (r & 1)), z: 1.5 * r }; }
export function progressX(c, r) { return c + 0.5 * (r & 1); }

const N_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const N_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
export function neighbors(c, r) {
  return (r & 1 ? N_ODD : N_EVEN).map(([dc, dr]) => [c + dc, r + dr]);
}
export function fwd(c, r) { return [c + 1, r]; }
export function upRight(c, r) { return r & 1 ? [c + 1, r - 1] : [c, r - 1]; }
export function downRight(c, r) { return r & 1 ? [c + 1, r + 1] : [c, r + 1]; }

function toCube(c, r) { const x = c - (r - (r & 1)) / 2; const z = r; return [x, -x - z, z]; }
export function dist(c1, r1, c2, r2) {
  const a = toCube(c1, r1), b = toCube(c2, r2);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}
export function fromWorld(x, z) {
  const q = (SQ3 / 3 * x - z / 3), rr = (2 / 3) * z;
  let cx = q, cz = rr, cy = -cx - cz;
  let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  const r = rz, c = rx + (r - (r & 1)) / 2;
  return [c, r];
}
// 육각 직선 방향(관통용): 시작→대상 방향으로 같은 방향 이웃을 이어간다
export function lineCells(c0, r0, c1, r1, n) {
  const a = toWorld(c0, r0), b = toWorld(c1, r1);
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
  // 6방향 중 가장 가까운 방향 선택
  let best = 0, bd = -2;
  const nb = neighbors(c0, r0);
  nb.forEach(([c, r], i) => { const w = toWorld(c, r); const d = ((w.x - a.x) * dx + (w.z - a.z) * dz) / (L * SQ3); if (d > bd) { bd = d; best = i; } });
  const out = []; let c = c0, r = r0;
  for (let i = 0; i < n; i++) { [c, r] = neighbors(c, r)[best]; out.push([c, r]); }
  return out;
}

export class HexMap {
  constructor(def) {
    this.cols = def.cols; this.rows = def.rows;
    this.path = new Set();
    def.band.forEach(([top, w], c) => { for (let r = top; r < top + w; r++) if (r >= 0 && r < def.rows) this.path.add(key(c, r)); });
    this.endCol = def.cols - 1;
    this.start = []; for (let r = 0; r < this.rows; r++) if (this.isPath(0, r)) this.start.push([0, r]);
  }
  inside(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
  isPath(c, r) { return this.path.has(key(c, r)); }
  cells() { const o = []; for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) o.push([c, r]); return o; }
  // 출발 금지 구간: 출발 단면 1~5번(열 0~4)의 경로 칸
  inStartZone(c, r) { return c <= 4 && this.isPath(c, r); }
  // 모든 경로 칸에서 앞으로(직진·대각) 이동해 도착할 수 있는지 (맵 데이터 검증용)
  validateForward() {
    const bad = [];
    for (const k of this.path) {
      const [c, r] = unkey(k);
      if (c === this.endCol) continue;
      const opts = [fwd(c, r), upRight(c, r), downRight(c, r)].filter(([a, b]) => this.isPath(a, b));
      if (!opts.length) bad.push([c, r]);
    }
    return bad;
  }
  // 영웅을 (c,r)에 더 두어도 출발→도착 길이 남는지 (육각 이웃 연결 검사)
  connectedWith(blocked) {
    const seen = new Set(); const q = [];
    for (const [c, r] of this.start) { const k = key(c, r); if (!blocked.has(k)) { seen.add(k); q.push([c, r]); } }
    while (q.length) {
      const [c, r] = q.shift();
      if (c === this.endCol) return true;
      for (const [a, b] of neighbors(c, r)) {
        const k = key(a, b);
        if (!this.isPath(a, b) || seen.has(k) || blocked.has(k)) continue;
        seen.add(k); q.push([a, b]);
      }
    }
    return false;
  }
}

// 배치 판정. heroCells: 경로 위/밖 영웅이 점유한 칸 key Set (주인공 제외). monsterCells: 몬스터 칸 Set
export function placementCheck(map, heroCells, monsterCells, c, r, ignoreKey = -1) {
  if (!map.inside(c, r)) return { ok: false, why: '맵 밖' };
  const k = key(c, r);
  if (heroCells.has(k) && k !== ignoreKey) return { ok: false, why: '영웅이 있는 칸' };
  if (!map.isPath(c, r)) return { ok: true };
  if (map.inStartZone(c, r)) return { ok: false, why: '출발 금지 구간' };
  if (monsterCells.has(k)) return { ok: false, why: '몬스터가 있는 칸' };
  const blocked = new Set([...heroCells].filter(x => x !== ignoreKey && map.path.has(x)));
  blocked.add(k);
  if (!map.connectedWith(blocked)) return { ok: false, why: '길이 끊김' };
  return { ok: true };
}
