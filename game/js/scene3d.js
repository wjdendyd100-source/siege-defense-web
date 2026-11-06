// 3D 전장: 원근 카메라(전략 게임식 내려다보는 각도), 지면, 성문 소품, 스프라이트 유닛, 효과.
import * as THREE from 'three';
import { A, FACING, fxTex } from './assets.js?v=20261106c';
import { toWorld, SQ3, key } from './hex.js?v=20261106c';

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2620');
    this.scene.fog = new THREE.Fog('#2a2620', 40, 90);
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 200);
    this.cam = { x: 0, z: 0, dist: 24, pitch: 54 * Math.PI / 180, tx: 0, tz: 0, tdist: 24 };
    const hemi = new THREE.HemisphereLight('#fff6e0', '#3a4a30', 1.1); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff1d0', 1.6); sun.position.set(-20, 30, 15); this.scene.add(sun);
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
    const maxAniso = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const rep = (img, unit) => { const t = new THREE.Texture(img); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.repeat.set(1 / unit, 1 / unit); t.needsUpdate = true; return t; };
    // 월드 좌표를 그대로 UV로 쓰는 평면 (텍스처 반복 단위 = unit)
    const flat = (geo) => { const pos = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), -pos.getY(i)); uv.needsUpdate = true; return geo; };
    // 1) 안뜰 돌바닥
    const stoneTex = rep(A.img.tex_stone, 6.5);
    const g0 = flat(new THREE.PlaneGeometry(W, D).translate(minX + W / 2, -(minZ + D / 2), 0));
    const ground = new THREE.Mesh(g0, new THREE.MeshLambertMaterial({ map: stoneTex }));
    ground.rotation.x = -Math.PI / 2; this.root.add(ground);
    // 2) 몬스터 길: 열마다 길 위·아래 가장자리를 구해 부드러운 곡선 띠로
    const lane = this.laneOutline(map);
    const shapeOf = (m) => { const up = lane.up.map(([x, z]) => new THREE.Vector2(x, -(z - m))), lo = lane.lo.map(([x, z]) => new THREE.Vector2(x, -(z + m)));
      const sh = new THREE.Shape(); const a = new THREE.SplineCurve(up).getPoints(up.length * 6), b = new THREE.SplineCurve([...lo].reverse()).getPoints(lo.length * 6);
      sh.setFromPoints([...a, ...b]); return sh; };
    const layer = (m, mat, y) => { const me = new THREE.Mesh(flat(new THREE.ShapeGeometry(shapeOf(m), 1)), mat); me.rotation.x = -Math.PI / 2; me.position.y = y; this.root.add(me); return me; };
    layer(0.55, new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.16, depthWrite: false }), 0.004);
    layer(0.22, new THREE.MeshLambertMaterial({ color: '#d8cfbb' }), 0.008);            // 연석
    layer(0.0, new THREE.MeshLambertMaterial({ map: rep(A.img.tex_cobble, 3.2) }), 0.012); // 포장길
    // 3) 바닥 장식: 금색 나침반 문양(시안의 원형 문장)과 가장자리 어둡게
    const cx = mw * 0.5, cz = (lane.midZ);
    const deco = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: compassTex(), transparent: true, depthWrite: false, opacity: 0.85 }));
    deco.rotation.x = -Math.PI / 2; deco.position.set(cx, 0.016, cz); deco.scale.set(9.5, 9.5, 1); this.root.add(deco);
    const vig = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: vignetteTex(), transparent: true, depthWrite: false }));
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
    const stone = new THREE.MeshLambertMaterial({ color: '#ddd5c4' });
    const stoneDark = new THREE.MeshLambertMaterial({ color: '#aaa190' });
    const roof = new THREE.MeshLambertMaterial({ color: '#2b3f73' });
    const gold = new THREE.MeshLambertMaterial({ color: '#c9a24a' });
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); this.root.add(m); return m; };
    // 도착 지점: 흰 성벽과 성문
    const endX = mw + 1.4;
    let zs = [];
    for (const [c, r] of map.cells()) if (map.isPath(c, r) && c === map.endCol) zs.push(toWorld(c, r).z);
    const zMin = Math.min(...zs) - 1.2, zMax = Math.max(...zs) + 1.2;
    const wallH = 3.2, farZ = -3.4, nearZ = md + 3.4;
    const seg = (z0, z1) => { if (z1 - z0 < 0.2) return; box(1.4, wallH, z1 - z0, stone, endX, wallH / 2, (z0 + z1) / 2);
      for (let z = z0 + 0.3; z < z1; z += 0.8) box(1.5, 0.5, 0.42, stoneDark, endX, wallH + 0.25, z); };
    seg(farZ, zMin); seg(zMax, nearZ);
    for (const z of [zMin, zMax]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 5.2, 12), stone); t.position.set(endX, 2.6, z); this.root.add(t);
      const cn = new THREE.Mesh(new THREE.ConeGeometry(1.45, 2.4, 12), roof); cn.position.set(endX, 6.4, z); this.root.add(cn);
    }
    box(1.6, 0.9, zMax - zMin, stone, endX, wallH + 0.9, (zMin + zMax) / 2);
    const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 20), gold); crest.rotation.z = Math.PI / 2; crest.position.set(endX - 0.85, wallH + 0.9, (zMin + zMax) / 2); this.root.add(crest);
    // 안뜰 뒤쪽: 흰 성벽 + 톱니 + 청색 깃발 (시안 03의 성벽·깃발)
    const x0 = -4, x1 = endX - 0.7, backH = 2.6;
    box(x1 - x0, backH, 0.9, stone, (x0 + x1) / 2, backH / 2, farZ);
    for (let x = x0 + 0.3; x < x1; x += 0.9) box(0.45, 0.45, 1.0, stoneDark, x, backH + 0.22, farZ);
    const banner = new THREE.MeshLambertMaterial({ map: bannerTex(), transparent: true, side: THREE.DoubleSide });
    for (let x = 3; x < x1 - 2; x += 8.5) { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), banner); b.position.set(x, backH - 0.75, farZ + 0.47); this.root.add(b); }
    for (let x = x0 + 1; x < x1; x += 7) { box(0.95, backH + 0.9, 1.1, stoneDark, x, (backH + 0.9) / 2, farZ); }
    // 안뜰 앞쪽: 낮은 난간(카메라를 가리지 않게) + 기둥
    const railH = 0.75;
    box(x1 - x0, railH, 0.45, stone, (x0 + x1) / 2, railH / 2, nearZ);
    box(x1 - x0, 0.14, 0.62, stoneDark, (x0 + x1) / 2, railH + 0.07, nearZ);
    for (let x = x0 + 0.5; x < x1; x += 4.2) box(0.6, railH + 0.45, 0.6, stoneDark, x, (railH + 0.45) / 2, nearZ);
    // 성벽 밑 꽃덤불 (흰 꽃 + 담쟁이)
    const fl = new THREE.SpriteMaterial({ map: flowerTex(), transparent: true, depthWrite: false });
    const rnd = mulberry(map.cols * 31 + map.rows);
    const bush = (x, z, s) => { const sp = new THREE.Sprite(fl); sp.center.set(0.5, 0.1); sp.position.set(x, 0, z); sp.scale.set(s * 1.5, s, 1); sp.renderOrder = 1000 + Math.round(z * 20); this.root.add(sp); };
    for (let x = x0 + 1.5; x < x1 - 1; x += 2.2 + rnd() * 2.5) bush(x, farZ + 0.9 + rnd() * 0.4, 0.9 + rnd() * 0.6);
    for (let x = x0 + 2; x < x1 - 1; x += 3 + rnd() * 3) bush(x, nearZ - 0.7, 0.6 + rnd() * 0.4);
    // 출발 지점: 안뜰 서쪽 입구 (붉은 횃불)
    zs = []; for (const [c, r] of map.start) zs.push(toWorld(c, r).z);
    for (const z of [Math.min(...zs) - 1.3, Math.max(...zs) + 1.3]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.8, 6), new THREE.MeshLambertMaterial({ color: '#4a3020' })); p.position.set(-1.6, 0.9, z); this.root.add(p);
      const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex('glow'), color: '#ff7a2a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      fire.position.set(-1.6, 1.95, z); fire.scale.set(1.2, 1.2, 1); this.root.add(fire); this.torches = (this.torches || []).concat(fire);
    }
  }

  // ── 스프라이트 유닛
  makeUnit(art, height) {
    const mat = new THREE.SpriteMaterial({ map: A.tex[art], transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat); sp.center.set(0.5, 0.03);
    const asp = A.aspect[art];
    sp.scale.set(height * asp, height, 1);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: fxTex('shadow'), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; sh.scale.set(Math.min(2.6, height * asp * 0.9), height * 0.35, 1);
    this.root.add(sp); this.root.add(sh);
    return { sp, sh, mat, art, height, asp, face: FACING[art] || 1, flipped: false };
  }
  setFacing(u, dir) { // dir: 1 오른쪽, -1 왼쪽
    const want = dir !== u.face;
    if (want !== u.flipped) { u.flipped = want; u.mat.map = want ? A.texFlip[u.art] : A.tex[u.art]; u.mat.needsUpdate = true; }
  }
  placeUnit(u, x, z, y = 0, sx = 1, sy = 1) {
    u.sp.position.set(x, y, z); u.sp.scale.set(u.height * u.asp * sx, u.height * sy, 1);
    u.sh.position.set(x, 0.02, z + 0.1);
    u.sp.renderOrder = 1000 + Math.round(z * 20);
  }
  removeUnit(u) { this.root.remove(u.sp); this.root.remove(u.sh); u.mat.dispose(); u.sh.material.dispose(); u.sh.geometry.dispose(); }

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
  afterimage(u, opacity = 0.5, life = 0.25, tint = '#7fc8ff') {
    const m = u.mat.clone(); m.color = new THREE.Color(tint); m.opacity = opacity; m.blending = THREE.AdditiveBlending;
    const s = new THREE.Sprite(m); s.center.copy(u.sp.center); s.position.copy(u.sp.position); s.scale.copy(u.sp.scale); s.renderOrder = u.sp.renderOrder - 1; this.root.add(s);
    return this.addFx({ obj: s, t: 0, life, fade: true, grow: 1, base: opacity, keepScale: true });
  }
  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt; const k = f.t / f.life;
      if (k >= 1) { this.root.remove(f.obj); f.obj.material.dispose(); if (f.obj.geometry && f.isMesh) f.obj.geometry.dispose(); this.fx.splice(i, 1); continue; }
      if (f.update) f.update(f, dt, k);
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
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function compassTex() {
  return canvasTex(512, 512, (g, w) => {
    const c = w / 2; g.translate(c, c); g.strokeStyle = 'rgba(214,170,74,0.9)'; g.fillStyle = 'rgba(214,170,74,0.55)';
    for (const [r, lw] of [[246, 6], [228, 2], [150, 3], [138, 1.5]]) { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 2; for (let i = 0; i < 32; i++) { const a = i * Math.PI / 16; g.beginPath(); g.moveTo(Math.cos(a) * 228, Math.sin(a) * 228); g.lineTo(Math.cos(a) * (i % 4 ? 214 : 196), Math.sin(a) * (i % 4 ? 214 : 196)); g.stroke(); }
    const star = (R, r, n, rot) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r : R; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke(); };
    star(130, 26, 4, -Math.PI / 2); star(92, 22, 4, -Math.PI / 4);
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
