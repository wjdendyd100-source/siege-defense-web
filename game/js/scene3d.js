// 3D 전장: 원근 카메라(전략 게임식 내려다보는 각도), 지면, 성문 소품, 스프라이트 유닛, 효과.
import * as THREE from 'three';
import { A, fxTex } from './assets.js?v=20261106h';
import { Unit3D } from './units.js?v=20261106h';
import { toWorld, SQ3, key } from './hex.js?v=20261106h';

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    // 시안처럼 따뜻한 한낮 햇빛: 필름 톤매핑 + 진한 그림자
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.4;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color('#b9ad94');
    this.scene.fog = new THREE.Fog('#b9ad94', 45, 95);
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 200);
    this.cam = { x: 0, z: 0, dist: 24, pitch: 54 * Math.PI / 180, tx: 0, tz: 0, tdist: 24 };
    const hemi = new THREE.HemisphereLight('#fff4de', '#8a7a5e', 1.15); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffe9c4', 2.9); sun.position.set(-22, 34, 18); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    this.scene.add(sun); this.scene.add(sun.target); this.sun = sun;
    this.fx = []; this.root = new THREE.Group(); this.scene.add(this.root);
  }
  resize(w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.w = w; this.h = h; }

  // 성 안뜰 전장. 바닥은 반복 텍스처를 입힌 메시로 만든다(큰 캔버스를 그려 올리지 않음 → 모바일 첫 화면 멈춤 방지).
  // 몬스터 길은 육각 모양이 아닌 부드러운 포장길로 그리고, 육각 격자는 배치할 때만 보이는 별도 선 메시로 둔다.
  buildMap(map) {
    this.map = map;
    const mw = SQ3 * (map.cols + 0.5), md = 1.5 * (map.rows - 1);
    this.bounds = { minX: -1, maxX: mw, minZ: -1, maxZ: md + 1 };
    const M = 14, minX = -SQ3 / 2 - M, maxX = mw + M, minZ = -1 - M, maxZ = md + 1 + M, W = maxX - minX, D = maxZ - minZ;
    const maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.rep = (img, ux, uy = ux) => { const t = new THREE.Texture(img); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.repeat.set(1 / ux, 1 / uy); t.needsUpdate = true; return t; };
    const flat = (geo) => { const pos = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), -pos.getY(i)); uv.needsUpdate = true; return geo; };
    // 해 그림자 범위를 맵에 맞춤
    const cxm = mw / 2, czm = md / 2, sc = this.sun.shadow.camera; sc.left = -mw / 2 - 8; sc.right = mw / 2 + 8; sc.top = md / 2 + 10; sc.bottom = -md / 2 - 10; sc.near = 1; sc.far = 120; sc.updateProjectionMatrix();
    this.sun.target.position.set(cxm, 0, czm); this.sun.position.set(cxm - 20, 34, czm + 20); // 시안처럼 앞쪽 왼편 위에서 비춰 그림자가 뒤쪽 오른편으로
    // 1) 안뜰 판석 바닥 (Figma 생성 텍스처, 판석 한 장 ≈ 1칸)
    const g0 = flat(new THREE.PlaneGeometry(W, D).translate(minX + W / 2, -(minZ + D / 2), 0));
    const ground = new THREE.Mesh(g0, new THREE.MeshLambertMaterial({ map: this.rep(A.img.tex_floor, 7.5), color: '#fff6e6' }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.root.add(ground);
    // 2) 몬스터 길: 시안에는 따로 깔린 길이 없으므로, 많이 밟혀 조금 어두워진 판석 띠로만 은은하게 표시
    const lane = this.laneOutline(map);
    const shapeOf = (m) => { const up = lane.up.map(([x, z]) => new THREE.Vector2(x, -(z - m))), lo = lane.lo.map(([x, z]) => new THREE.Vector2(x, -(z + m)));
      const sh = new THREE.Shape(); const a = new THREE.SplineCurve(up).getPoints(up.length * 6), b = new THREE.SplineCurve([...lo].reverse()).getPoints(lo.length * 6);
      sh.setFromPoints([...a, ...b]); return sh; };
    const layer = (m, mat, y) => { const me = new THREE.Mesh(flat(new THREE.ShapeGeometry(shapeOf(m), 1)), mat); me.rotation.x = -Math.PI / 2; me.position.y = y; me.receiveShadow = true; this.root.add(me); return me; };
    layer(0.5, new THREE.MeshBasicMaterial({ color: '#4a3c28', transparent: true, opacity: 0.07, depthWrite: false }), 0.004);
    layer(0.15, new THREE.MeshBasicMaterial({ color: '#4a3c28', transparent: true, opacity: 0.08, depthWrite: false }), 0.006);
    // 3) 금색 나침반 상감 (시안 03·04의 원형 문장)
    const cx = mw * 0.5, cz = lane.midZ;
    const deco = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: compassTex(), transparent: true, depthWrite: false, opacity: 0.95 }));
    deco.rotation.x = -Math.PI / 2; deco.position.set(cx, 0.012, cz); deco.scale.set(13, 13, 1); deco.receiveShadow = true; this.root.add(deco);
    // 4) 나뭇잎 그늘 (시안 바닥의 얼룩진 햇빛) + 가장자리 어둡게
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: leafShadowTex(), transparent: true, depthWrite: false, opacity: 0.55 }));
    leaf.material.map.wrapS = leaf.material.map.wrapT = THREE.RepeatWrapping; leaf.material.map.repeat.set(W / 22, D / 22);
    leaf.rotation.x = -Math.PI / 2; leaf.position.set(minX + W / 2, 0.018, minZ + D / 2); this.root.add(leaf);
    const vig = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: vignetteTex(), transparent: true, depthWrite: false, opacity: 0.6 }));
    vig.rotation.x = -Math.PI / 2; vig.position.set(minX + W / 2, 0.02, minZ + D / 2); this.root.add(vig);
    this.buildGrid(map);
    this.buildProps(map, mw, md);
  }

  laneOutline(map) {
    const up = [], lo = []; let zs = 0, n = 0;
    for (let c = 0; c < map.cols; c++) {
      let top = 1e9, bot = -1e9;
      for (let r = 0; r < map.rows; r++) if (map.isPath(c, r)) { top = Math.min(top, r); bot = Math.max(bot, r); }
      if (top > bot) continue;
      const x = SQ3 * (c + 0.25), z0 = 1.5 * top - 0.95, z1 = 1.5 * bot + 0.95;
      if (!up.length) { up.push([x - 6, z0]); lo.push([x - 6, z1]); }
      up.push([x, z0]); lo.push([x, z1]); zs += (z0 + z1) / 2; n++;
    }
    const last = up[up.length - 1]; up.push([last[0] + 4, last[1]]); lo.push([last[0] + 4, lo[lo.length - 1][1]]);
    return { up, lo, midZ: zs / n };
  }

  // 배치용 육각 격자 (평소에는 숨김). 길 칸은 금색, 길 밖 칸은 흰색, 출발 금지 구간은 붉게.
  buildGrid(map) {
    const off = [], on = [], bad = [];
    for (const [c, r] of map.cells()) {
      const w = toWorld(c, r), s = 0.97, arr = map.isPath(c, r) ? on : off;
      for (let i = 0; i < 6; i++) { const a0 = (60 * i - 30) * Math.PI / 180, a1 = (60 * (i + 1) - 30) * Math.PI / 180; arr.push(w.x + Math.cos(a0) * s, 0.03, w.z + Math.sin(a0) * s, w.x + Math.cos(a1) * s, 0.03, w.z + Math.sin(a1) * s); }
      if (map.inStartZone(c, r)) bad.push(w);
    }
    const lines = (arr, color, op) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false })); };
    this.grid = new THREE.Group();
    this.grid.add(lines(off, '#fffbe8', 0.45)); this.grid.add(lines(on, '#ffd76a', 0.8));
    const hexGeo = new THREE.CircleGeometry(0.93, 6); hexGeo.rotateZ(Math.PI / 6); hexGeo.rotateX(-Math.PI / 2);
    const badMat = new THREE.MeshBasicMaterial({ color: '#c0392b', transparent: true, opacity: 0.22, depthWrite: false });
    for (const w of bad) { const m = new THREE.Mesh(hexGeo, badMat); m.position.set(w.x, 0.025, w.z); this.grid.add(m); }
    this.grid.renderOrder = 10; this.grid.visible = false; this.root.add(this.grid);
  }
  setGrid(v) { if (this.grid && this.grid.visible !== v) this.grid.visible = v; }

  buildProps(map, mw, md) {
    // 석회암 재질: 텍스처 하나를 색조별로 공유하고(GPU 업로드 1회), 크기에 맞는 반복은 상자 UV를 늘려서 처리 (3.2m마다 한 장)
    const wallT = this.rep(A.img.tex_wall, 1, 1); wallT.repeat.set(1, 1); const stoneCache = {};
    const stoneMat = (w, h, tint = '#ffffff') => stoneCache[tint] || (stoneCache[tint] = new THREE.MeshLambertMaterial({ map: wallT, color: tint }));
    const scaleUV = (geo, w, h, d, unit = 3.2) => { // BoxGeometry 면 순서: +x,-x(깊이×높이) +y,-y(너비×깊이) +z,-z(너비×높이)
      const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / unit, uv.getY(i) * dims[f][1] / unit); }
      uv.needsUpdate = true; return geo; };
    const box = (w, h, d, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(w, h, d), w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; this.root.add(m); return m; };
    const roof = new THREE.MeshLambertMaterial({ color: '#2b3f73' });
    const gold = new THREE.MeshLambertMaterial({ color: '#c9a24a' });
    const endX = mw + 1.4, farZ = -3.4, nearZ = md + 3.4, x0 = -5, x1 = endX - 0.7;
    // 도착 지점: 흰 석회암 성문과 탑
    let zs = []; for (const [c, r] of map.cells()) if (map.isPath(c, r) && c === map.endCol) zs.push(toWorld(c, r).z);
    const zMin = Math.min(...zs) - 1.2, zMax = Math.max(...zs) + 1.2, wallH = 3.4;
    const seg = (z0, z1) => { if (z1 - z0 < 0.2) return; box(1.4, wallH, z1 - z0, stoneMat(z1 - z0, wallH), endX, wallH / 2, (z0 + z1) / 2);
      for (let z = z0 + 0.3; z < z1; z += 0.8) box(1.5, 0.5, 0.42, stoneMat(0.42, 0.5, '#e9e2d4'), endX, wallH + 0.25, z); };
    seg(farZ, zMin); seg(zMax, nearZ);
    for (const z of [zMin, zMax]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 5.4, 16), stoneMat(7, 5.4)); t.position.set(endX, 2.7, z); t.castShadow = t.receiveShadow = true; this.root.add(t);
      const cn = new THREE.Mesh(new THREE.ConeGeometry(1.45, 2.4, 16), roof); cn.position.set(endX, 6.6, z); cn.castShadow = true; this.root.add(cn);
    }
    box(1.6, 0.9, zMax - zMin, stoneMat(zMax - zMin, 0.9), endX, wallH + 0.9, (zMin + zMax) / 2);
    const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 20), gold); crest.rotation.z = Math.PI / 2; crest.position.set(endX - 0.85, wallH + 0.9, (zMin + zMax) / 2); this.root.add(crest);
    // 안뜰 뒤쪽: 석회암 성벽 + 톱니 + 기둥 + 청색 깃발 (시안 03)
    const backH = 3.0, len = x1 - x0;
    box(len, backH, 1.0, stoneMat(len, backH), (x0 + x1) / 2, backH / 2, farZ);
    const merlon = stoneMat(0.55, 0.55, '#ece6d8');
    for (let x = x0 + 0.35; x < x1; x += 1.0) box(0.55, 0.55, 1.1, merlon, x, backH + 0.27, farZ);
    const bannerMat = new THREE.MeshLambertMaterial({ map: this.rep(A.img.banner_navy, 1, 1), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    bannerMat.map.wrapS = bannerMat.map.wrapT = THREE.ClampToEdgeWrapping; bannerMat.map.repeat.set(1, 1);
    const bAsp = A.img.banner_navy.width / A.img.banner_navy.height;
    let bi = 0;
    for (let x = x0 + 2; x < x1 - 1; x += 6.5) {
      // 기둥(받침·몸통·머리)
      box(1.3, 0.35, 1.5, stoneMat(1.3, 0.35, '#e8e1d2'), x, 0.17, farZ + 0.15);
      box(1.0, backH + 1.3, 1.3, stoneMat(1.0, backH + 1.3, '#f1ece2'), x, (backH + 1.3) / 2, farZ + 0.1);
      box(1.35, 0.3, 1.6, stoneMat(1.35, 0.3, '#e8e1d2'), x, backH + 1.45, farZ + 0.1);
      // 기둥 사이 깃발
      if (bi++ % 1 === 0 && x + 3.25 < x1 - 1) { const bh = 2.7, b = new THREE.Mesh(new THREE.PlaneGeometry(bh * bAsp, bh), bannerMat); b.position.set(x + 3.25, backH - bh / 2 + 0.25, farZ + 0.52); b.castShadow = true; this.root.add(b); }
    }
    // 안뜰 앞쪽: 돌 난간 (받침·난간동자·손잡이) — 카메라를 가리지 않는 낮은 높이
    const railMat = stoneMat(4, 1, '#f3eee4'), rh = 0.95;
    box(len, 0.22, 0.75, railMat, (x0 + x1) / 2, 0.11, nearZ);
    box(len, 0.16, 0.62, railMat, (x0 + x1) / 2, rh, nearZ);
    const pts = [[0.0, 0], [0.13, 0.02], [0.09, 0.12], [0.16, 0.32], [0.09, 0.55], [0.07, 0.6], [0.11, 0.66], [0.0, 0.68]].map(([r, y]) => new THREE.Vector2(r, y));
    const balGeo = new THREE.LatheGeometry(pts, 10); const nBal = Math.floor(len / 0.42);
    const bal = new THREE.InstancedMesh(balGeo, new THREE.MeshLambertMaterial({ color: '#efe8da' }), nBal); bal.castShadow = true; bal.receiveShadow = true;
    const mtx = new THREE.Matrix4(); for (let i = 0; i < nBal; i++) { mtx.makeTranslation(x0 + 0.2 + i * 0.42, 0.22, nearZ); bal.setMatrixAt(i, mtx); } this.root.add(bal);
    for (let x = x0 + 0.4; x < x1; x += 4.2) { box(0.62, rh + 0.35, 0.62, stoneMat(0.62, rh + 0.35, '#e9e2d4'), x, (rh + 0.35) / 2, nearZ); box(0.8, 0.14, 0.8, railMat, x, rh + 0.42, nearZ); }
    // 꽃덤불 (Figma 생성 이미지): 성벽 아래, 기둥 옆, 난간 위
    const fl = new THREE.SpriteMaterial({ map: this.rep(A.img.bush_flowers, 1, 1), transparent: true, alphaTest: 0.3 });
    fl.map.wrapS = fl.map.wrapT = THREE.ClampToEdgeWrapping; fl.map.repeat.set(1, 1);
    const fAsp = A.img.bush_flowers.width / A.img.bush_flowers.height; const rnd = mulberry(map.cols * 31 + map.rows);
    const bush = (x, y, z, s) => { s *= 1.35; return bush0(x, y, z, s); };
    const bush0 = (x, y, z, s) => { const sp = new THREE.Sprite(fl); sp.center.set(0.5, 0.12); sp.position.set(x, y, z); sp.scale.set(s * fAsp, s, 1); sp.renderOrder = 1000 + Math.round(z * 20); this.root.add(sp); };
    for (let x = x0 + 0.8; x < x1 - 0.5; x += 1.6 + rnd() * 1.8) bush(x, 0, farZ + 0.85 + rnd() * 0.3, 1.0 + rnd() * 0.7);
    for (let x = x0 + 1.2; x < x1 - 0.5; x += 3.5 + rnd() * 3) bush(x, backH + 0.2, farZ, 0.8 + rnd() * 0.4);
    for (let x = x0 + 2.4; x < x1 - 0.5; x += 4.2 * (1 + Math.floor(rnd() * 2))) bush(x + 1.6, rh + 0.05, nearZ, 0.7 + rnd() * 0.3);
    // 나무 상자 (시안 03 왼쪽 위)
    const wood = new THREE.MeshLambertMaterial({ map: woodTex() });
    box(1.0, 1.0, 1.0, wood, x0 + 3.6, 0.5, farZ + 1.2); box(0.8, 0.8, 0.8, wood, x0 + 4.5, 0.4, farZ + 1.6).rotation.y = 0.4; box(0.75, 0.75, 0.75, wood, x0 + 3.7, 1.37, farZ + 1.2).rotation.y = -0.3;
    // 출발 지점: 안뜰 서쪽 입구 기둥 한 쌍
    zs = []; for (const [c, r] of map.start) zs.push(toWorld(c, r).z);
    for (const z of [Math.min(...zs) - 1.6, Math.max(...zs) + 1.6]) { box(1.0, 3.6, 1.0, stoneMat(1, 3.6, '#f1ece2'), -2.4, 1.8, z); box(1.3, 0.3, 1.3, stoneMat(1.3, 0.3, '#e8e1d2'), -2.4, 3.75, z); }
  }
  // 프레임이 느린 기기: 유닛 그림자를 끄고 정적 그림자만 한 번 그려 둔다
  setLowShadow() { if (this._lowShadow) return; this._lowShadow = true; if (this.units) for (const u of this.units) u.model.traverse(o => { if (o.isMesh) o.castShadow = false; }); this.castUnits = false; }

  // ── 3D 유닛 (units.js). 발밑 그림자는 가벼운 원판으로 둔다.
  unit(rig, opts = {}) {
    const u = new Unit3D(this.root, rig, opts);
    if (this.castUnits !== false) u.model.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: fxTex('shadow'), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; sh.material.opacity = 0.55; const r = u.height * 0.45; sh.scale.set(r * 1.4, r, 1); this.root.add(sh); u.sh = sh;
    (this.units || (this.units = new Set())).add(u); return u;
  }
  placeUnit(u, x, z, y = 0) { u.set(x, y, z); u.sh.position.set(x, 0.02, z + 0.05); }
  removeUnit(u) { if (!u) return; this.units && this.units.delete(u); u.dispose(); this.root.remove(u.sh); u.sh.material.dispose(); u.sh.geometry.dispose(); }
  // 쓰러지는 동작을 끝까지 보여 준 뒤 서서히 가라앉혀 지운다 (게임 판정과는 분리)
  dieUnit(u, sink = 0.8) {
    if (!u || u._dying) return; u._dying = true;
    u.die(() => { let t = 0; this.addFx({ obj: u.root, t: 0, life: sink, update: (f, dt) => { t += dt; u.root.position.y = -t * 0.6; u.setOpacity(Math.max(0, 1 - t / sink)); }, keep: true, onEnd: () => this.removeUnit(u) }); });
  }
  // 전투 중 처음 나타나는 모델의 셰이더 컴파일로 화면이 멈추지 않도록, 시작할 때 미리 한 번씩 컴파일해 둔다
  prewarm(rigs) {
    const tmp = rigs.map(r => this.unit(r)); const c = this.cam;
    tmp.forEach((u, i) => this.placeUnit(u, c.x + (i - rigs.length / 2) * 1.2, c.z, 0));
    const n0 = this.fx.length; // 효과 종류도 한 번씩 만들어 텍스처·셰이더를 미리 올린다
    for (const t of ['glow', 'spark', 'note']) { this.spriteFx(t, '#fff', c.x, 1, c.z, 1, 1); this.spriteFx(t, '#fff', c.x, 1, c.z, 1, 1, { normal: true }); }
    this.slash(c.x, c.z, { x: 1, z: 0 }, 1); this.ring(c.x, c.z, 1, '#fff'); this.beam(c.x, 1, c.z, c.x + 1, 1, c.z, '#fff');
    if (this.grid) this.grid.visible = true;
    this.updateCam(1); this.renderer.compile(this.scene, this.camera); this.render();
    if (this.grid) this.grid.visible = false;
    // 재질을 버리면 컴파일한 셰이더도 함께 버려지므로, 장면에서만 빼고 재질은 남겨 둔다
    this._warm = [...this.fx.splice(n0).map(f => f.obj), ...tmp];
    for (const o of this._warm) { if (o.isObject3D) this.root.remove(o); else { this.root.remove(o.root); this.root.remove(o.sh); this.units.delete(o); o.mixer.stopAllAction(); } }
  }
  // 비동기 미리 준비: 셰이더를 병렬 컴파일(KHR_parallel_shader_compile)로 만들고 끝날 때까지 화면을 멈추지 않는다
  async prewarmAsync(rigs) {
    const tmp = rigs.map(r => this.unit(r)); const c = this.cam;
    tmp.forEach((u, i) => this.placeUnit(u, c.x + (i - rigs.length / 2) * 1.2, c.z, 0));
    const n0 = this.fx.length;
    for (const t of ['glow', 'spark', 'note']) { this.spriteFx(t, '#fff', c.x, 1, c.z, 1, 1); this.spriteFx(t, '#fff', c.x, 1, c.z, 1, 1, { normal: true }); }
    this.slash(c.x, c.z, { x: 1, z: 0 }, 1); this.ring(c.x, c.z, 1, '#fff'); this.beam(c.x, 1, c.z, c.x + 1, 1, c.z, '#fff');
    if (this.grid) this.grid.visible = true;
    this.updateCam(1);
    if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera); else this.renderer.compile(this.scene, this.camera);
    // 텍스처를 한 장씩 나눠 올려 한 번에 몰리지 않게
    const texs = new Set(); this.scene.traverse(o => { const m = o.material; if (m && m.map) texs.add(m.map); });
    for (const t of texs) { this.renderer.initTexture(t); await new Promise(r => setTimeout(r, 0)); }
    await new Promise(r => requestAnimationFrame(r));
    this.render(); // 남은 그림자용 셰이더는 여기서 한 번
    if (this.grid) this.grid.visible = false;
    this._warm = [...this.fx.splice(n0).map(f => f.obj), ...tmp];
    for (const o of this._warm) { if (o.isObject3D) this.root.remove(o); else { this.root.remove(o.root); this.root.remove(o.sh); this.units.delete(o); o.mixer.stopAllAction(); } }
  }
  updateUnits(dt) { if (this.units) for (const u of this.units) u.update(dt); }
  // ── 효과 (생성 후 life 동안 갱신)
  addFx(o) { this.fx.push(o); return o; }
  spriteFx(tex, color, x, y, z, size, life, opts = {}) {
    const m = new THREE.SpriteMaterial({ map: fxTex(tex), color, transparent: true, depthWrite: false, blending: opts.normal ? THREE.NormalBlending : THREE.AdditiveBlending });
    const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.set(size, size, 1); s.renderOrder = 5000; this.root.add(s);
    return this.addFx({ obj: s, t: 0, life, size, vx: opts.vx || 0, vy: opts.vy || 0, vz: opts.vz || 0, grow: opts.grow ?? 1.5, fade: true, rot: opts.rot || 0 });
  }
  slash(x, z, dir, radius, color = '#fff3c4', tilt = 0, life = 0.22) { // 지면 위에 눕힌 베기 궤적
    const m = new THREE.MeshBasicMaterial({ map: fxTex('slash'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), m);
    mesh.position.set(x, 1.0, z);
    mesh.rotation.order = 'YXZ'; mesh.rotation.y = -Math.atan2(dir.z, dir.x) - Math.PI / 2 + Math.PI; mesh.rotation.x = -Math.PI / 2 + 0.55 + tilt;
    mesh.scale.set(radius, radius * 1.1, 1); mesh.renderOrder = 5001; this.root.add(mesh);
    return this.addFx({ obj: mesh, t: 0, life, size: radius, grow: 1.25, fade: true, isMesh: true });
  }
  ring(x, z, radius, color, life = 0.4) {
    const m = new THREE.MeshBasicMaterial({ map: fxTex('ring'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.08, z);
    mesh.scale.set(radius * 0.3, radius * 0.3, 1); mesh.renderOrder = 4999; this.root.add(mesh);
    return this.addFx({ obj: mesh, t: 0, life, size: radius, ringTo: radius, fade: true, isMesh: true });
  }
  beam(x0, y0, z0, x1, y1, z1, color, life = 0.18, width = 0.18) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0; const L = Math.hypot(dx, dy, dz);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const g = new THREE.CylinderGeometry(width, width, L, 6, 1, true); g.translate(0, L / 2, 0); g.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x0, y0, z0); mesh.lookAt(x1, y1, z1); mesh.renderOrder = 5002; this.root.add(mesh);
    return this.addFx({ obj: mesh, t: 0, life, fade: true, isMesh: true, thin: true });
  }
  afterimage(u, opacity = 0.5, life = 0.25, tint = '#7fc8ff') { // 3D 유닛은 복제 대신 빛 잔상으로
    const p = u.root.position; return this.spriteFx('glow', tint, p.x, p.y + u.height * 0.5, p.z, u.height * 0.9, life, { grow: 0.6 });
  }
  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt; const k = f.t / f.life;
      if (k >= 1) { if (f.keep) { f.onEnd && f.onEnd(); } else { this.root.remove(f.obj); f.obj.material.dispose(); if (f.obj.geometry && f.isMesh) f.obj.geometry.dispose(); } this.fx.splice(i, 1); continue; }
      if (f.update) f.update(f, dt, k);
      if (f.keep) continue;
      f.obj.position.x += f.vx ? f.vx * dt : 0; f.obj.position.y += f.vy ? f.vy * dt : 0; f.obj.position.z += f.vz ? f.vz * dt : 0;
      if (f.fade) f.obj.material.opacity = (f.base ?? 1) * (1 - k * k);
      if (f.ringTo) { const s = f.ringTo * (0.3 + 0.7 * Math.sqrt(k)); f.obj.scale.set(s, s, 1); }
      else if (!f.keepScale && !f.thin && f.size) { const s = f.size * (1 + (f.grow - 1) * k); if (f.isMesh) f.obj.scale.set(s, s * 1.1, 1); else f.obj.scale.set(s, s, 1); }
      if (f.rot) f.obj.material.rotation += f.rot * dt;
    }
  }

  // ── 카메라
  setCam(x, z, dist) { this.cam.tx = x; this.cam.tz = z; if (dist) this.cam.tdist = dist; }
  clampCam() {
    const b = this.bounds; if (!b) return;
    this.cam.tx = Math.max(b.minX, Math.min(b.maxX, this.cam.tx)); this.cam.tz = Math.max(b.minZ, Math.min(b.maxZ, this.cam.tz));
    this.cam.tdist = Math.max(11, Math.min(42, this.cam.tdist));
  }
  updateCam(dt, shake = 0) {
    this.clampCam();
    const c = this.cam, k = 1 - Math.exp(-dt * 8);
    c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k; c.dist += (c.tdist - c.dist) * k;
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    this.camera.position.set(c.x + sx, Math.sin(c.pitch) * c.dist + sy, c.z + Math.cos(c.pitch) * c.dist);
    this.camera.lookAt(c.x + sx, 0, c.z);
    if (this.torches) for (const t of this.torches) { const s = 1.1 + Math.random() * 0.25; t.scale.set(s, s, 1); }
  }
  // 화면 좌표 → 지면 좌표
  pick(sx, sy) {
    const ndc = new THREE.Vector3((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1, 0.5);
    ndc.unproject(this.camera);
    const o = this.camera.position, d = ndc.sub(o).normalize();
    if (Math.abs(d.y) < 1e-5) return null;
    const t = -o.y / d.y; return { x: o.x + d.x * t, z: o.z + d.z * t };
  }
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, vis: v.z < 1 };
  }
  hexScreen(c, r, s = 0.95) {
    const w = toWorld(c, r); const pts = [];
    for (let i = 0; i < 6; i++) { const a = (60 * i - 30) * Math.PI / 180; pts.push(this.project(w.x + Math.cos(a) * s, 0.03, w.z + Math.sin(a) * s)); }
    return pts;
  }
  render() { this.renderer.render(this.scene, this.camera); }
  dispose() { this.renderer.dispose(); }
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ── 작은 캔버스 텍스처 (모두 256px 이하라 업로드 부담이 거의 없다)
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function compassTex() {
  // 시안 03·04의 금색 상감: 가는 이중 원, 눈금, 두 가지 금색으로 입체감을 준 8방향 별
  return canvasTex(1024, 1024, (g, w) => {
    const c = w / 2, G1 = 'rgba(222,182,92,0.95)', G2 = 'rgba(160,118,44,0.95)'; g.translate(c, c); g.lineCap = 'round';
    const ring = (r, lw, col = G1) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    ring(500, 9); ring(484, 3); ring(420, 3, G2); ring(300, 6); ring(286, 2); ring(150, 3, G2);
    for (let i = 0; i < 72; i++) { const a = i * Math.PI / 36, l = i % 9 === 0 ? 40 : i % 3 === 0 ? 22 : 12; g.strokeStyle = i % 9 === 0 ? G1 : G2; g.lineWidth = i % 9 === 0 ? 5 : 2.5;
      g.beginPath(); g.moveTo(Math.cos(a) * 482, Math.sin(a) * 482); g.lineTo(Math.cos(a) * (482 - l), Math.sin(a) * (482 - l)); g.stroke(); }
    // 별: 각 꼭짓점을 두 삼각형(밝은 면/어두운 면)으로
    const star = (R, r, n, rot) => { for (let i = 0; i < n; i++) { const a = rot + i * Math.PI * 2 / n, aL = a - Math.PI / n, aR = a + Math.PI / n;
        g.fillStyle = G1; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.lineTo(Math.cos(aL) * r, Math.sin(aL) * r); g.closePath(); g.fill();
        g.fillStyle = G2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.lineTo(Math.cos(aR) * r, Math.sin(aR) * r); g.closePath(); g.fill(); } };
    star(270, 46, 4, Math.PI / 4); star(410, 52, 4, 0);
    g.fillStyle = G1; g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill();
  });
}
function vignetteTex() {
  return canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, w * 0.22, w / 2, h / 2, w * 0.62); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,8,5,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
function bannerTex() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#1f2f62'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h - 30); g.lineTo(w / 2, h); g.lineTo(0, h - 30); g.closePath(); g.fill();
    g.strokeStyle = '#d4ad55'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#d4ad55'; g.fillRect(w / 2 - 6, 40, 12, 130); g.fillRect(w / 2 - 34, 80, 68, 12);
    g.beginPath(); g.arc(w / 2, 40, 12, 0, 7); g.fill(); g.fillRect(0, 0, w, 10);
  });
}
function flowerTex() {
  return canvasTex(192, 128, (g, w, h) => {
    const rnd = mulberry(5);
    for (let i = 0; i < 26; i++) { const x = 20 + rnd() * (w - 40), y = 40 + rnd() * (h - 50), r = 12 + rnd() * 14; g.fillStyle = `hsl(${100 + rnd() * 25},${30 + rnd() * 15}%,${18 + rnd() * 14}%)`; g.beginPath(); g.ellipse(x, y, r * 1.2, r, 0, 0, 7); g.fill(); }
    for (let i = 0; i < 40; i++) { const x = 18 + rnd() * (w - 36), y = 30 + rnd() * (h - 50); g.fillStyle = rnd() < 0.85 ? '#f6f2e6' : '#f2d77a'; g.beginPath(); g.arc(x, y, 2.5 + rnd() * 2.5, 0, 7); g.fill(); }
  });
}

// 나뭇잎 그늘: 부드러운 얼룩 무늬(반복). 어두운 부분이 그늘
function leafShadowTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const rnd = mulberry(77); g.filter = 'blur(10px)';
    for (let i = 0; i < 70; i++) { const x = rnd() * w, y = rnd() * h, r = 18 + rnd() * 46;
      for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { g.fillStyle = `rgba(28,26,14,${0.25 + rnd() * 0.35})`; g.beginPath(); g.ellipse(x + dx, y + dy, r * 1.3, r, rnd() * 3, 0, 7); g.fill(); } }
    g.filter = 'none';
  });
}
function woodTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a6239'; g.fillRect(0, 0, w, h); const rnd = mulberry(9);
    for (let y = 0; y < h; y += 64) { g.fillStyle = `hsl(28,${35 + rnd() * 10}%,${30 + rnd() * 8}%)`; g.fillRect(4, y + 4, w - 8, 56);
      for (let i = 0; i < 18; i++) { g.strokeStyle = `rgba(40,22,8,${0.15 + rnd() * 0.2})`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); const yy = y + 8 + rnd() * 48; g.moveTo(4, yy); g.bezierCurveTo(w * 0.3, yy + rnd() * 6 - 3, w * 0.7, yy + rnd() * 6 - 3, w - 4, yy); g.stroke(); } }
    g.strokeStyle = '#3c2512'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke();
    g.fillStyle = '#6b6b6b'; for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  });
}
