// 3D 유닛: KayKit(CC0) 리깅 모델 + 애니메이션. 그림 한 장 스프라이트를 대신한다.
// 모델 파일은 tools/build_models.mjs로 만든 game/assets/models/*.glb (필요한 동작만 남기고 압축).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const MODEL_FILES = ['knight', 'barbarian', 'rogue_hooded', 'rogue', 'mage', 'sk_minion', 'sk_warrior', 'sk_rogue'];
const LIB = {}; // name → { scene, clips: {name: clip}, height }

export async function loadModels(onProgress) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  let done = 0;
  await Promise.all(MODEL_FILES.map(async n => {
    const g = await loader.loadAsync(`assets/models/${n}.gltf.json?v=20261106e`);
    const clips = {}; for (const c of g.animations) clips[c.name] = c;
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g.scene);
    LIB[n] = { scene: g.scene, clips, height: box.max.y - box.min.y };
    done++; onProgress && onProgress(done / MODEL_FILES.length);
  }));
}

// 역할별 설정: 모델·키·보이는 무기·색·동작 이름
const H = (o) => ({ idle: 'Idle', walk: 'Walking_A', run: 'Running_A', hit: ['Hit_A', 'Hit_B'], death: 'Death_A', cheer: 'Cheer', ...o });
const SK = (o) => ({ idle: 'Idle_Combat', walk: 'Walking_D_Skeletons', run: 'Walking_D_Skeletons', hit: ['Hit_A'], death: 'Death_C_Skeletons', spawn: 'Spawn_Ground_Skeletons', cheer: 'Taunt', ...o });
export const RIGS = {
  leon: { model: 'knight', h: 2.24, show: ['1H_Sword'], tint: { Knight_Body: '#eef0f6' }, paint: { Knight_Cape: '#24387e' },
    anims: H({ combo: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop'], slam: '2H_Melee_Attack_Chop',
      thrust: '1H_Melee_Attack_Stab', whirl: '2H_Melee_Attack_Spinning', dodge: 'Dodge_Forward', guard: 'Blocking', guardHit: 'Block_Hit' }) },
  sword: { model: 'knight', h: 1.95, show: ['1H_Sword', 'Badge_Shield'], anims: H({ attack: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal'] }) },
  cavalry: { model: 'knight', h: 2.13, show: ['2H_Sword'], anims: H({ idle: '2H_Melee_Idle', attack: ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop'] }) },
  spear: { model: 'barbarian', h: 2.01, show: ['2H_Axe'], anims: H({ idle: '2H_Melee_Idle', attack: ['2H_Melee_Attack_Stab', '2H_Melee_Attack_Chop'] }) },
  archer: { model: 'rogue_hooded', h: 1.90, show: ['2H_Crossbow'], anims: H({ attack: ['2H_Ranged_Shoot'] }) },
  gunner: { model: 'rogue', h: 1.90, show: ['1H_Crossbow'], anims: H({ attack: ['1H_Ranged_Shoot'] }) },
  bard: { model: 'rogue', h: 1.90, show: [], anims: H({ attack: ['Spellcast_Raise'] }) },
  mage: { model: 'mage', h: 1.95, show: ['2H_Staff'], anims: H({ attack: ['Spellcast_Shoot'] }) },
  healer: { model: 'mage', h: 1.95, show: ['2H_Staff'], anims: H({ attack: ['Spellcast_Raise'] }) },
  sk_minion: { model: 'sk_minion', h: 1.72, anims: SK({ attack: ['1H_Melee_Attack_Chop'] }) },
  sk_warrior: { model: 'sk_warrior', h: 2.01, anims: SK({ attack: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Jump_Chop'] }) },
  sk_rogue: { model: 'sk_rogue', h: 1.78, anims: SK({ attack: ['1H_Ranged_Shoot'] }) },
  boss: { model: 'knight', h: 2.2, show: ['2H_Sword'], tint: { '*': '#4a4058', Knight_Cape: '#5a1620' },
    anims: H({ idle: '2H_Melee_Idle', walk: 'Walking_B', attack: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'], death: 'Death_A' }) },
};
const WEAPONS = new Set(['1H_Sword', '1H_Sword_Offhand', 'Badge_Shield', '2H_Sword', '2H_Axe', '2H_Crossbow', '1H_Crossbow', '2H_Staff']);

export class Unit3D {
  constructor(parent, rig, opts = {}) {
    const R = RIGS[rig], L = LIB[R.model];
    this.rig = R; this.root = new THREE.Group(); parent.add(this.root);
    const model = skClone(L.scene); this.model = model;
    const s = (R.h * (opts.scale || 1)) / L.height; model.scale.setScalar(s); this.height = R.h * (opts.scale || 1);
    this.mats = [];
    const tintAll = opts.tint || (R.tint && R.tint['*']);
    model.traverse(o => {
      if (WEAPONS.has(o.name) && R.show && !R.show.includes(o.name)) o.visible = false;
      if (!o.isMesh) return;
      o.frustumCulled = false; // 스킨 메시는 경계 상자가 실제 자세와 달라 잘못 잘리는 일이 있다
      const m = o.material.clone(); o.material = m; this.mats.push(m);
      const t = (R.tint && R.tint[o.name]) || tintAll; if (t) m.color.set(t);
      if (R.paint && R.paint[o.name]) { m.map = null; m.color.set(R.paint[o.name]); m.needsUpdate = true; } // 원래 색과 전혀 다른 색은 무늬 없이 칠한다
      m.userData.baseColor = m.color.clone(); m.emissive = new THREE.Color(0, 0, 0);
    });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {}; for (const [n, c] of Object.entries(L.clips)) this.actions[n] = this.mixer.clipAction(c);
    this.base = null; this.one = null; this.yaw = opts.yaw ?? -Math.PI / 2; this.tYaw = this.yaw; this.dead = false; this.flashT = 0; this.flashColor = new THREE.Color('#ff3020');
    this.mixer.addEventListener('finished', e => { if (this.one && e.action === this.one.action) { const cb = this.one.done; this.one = null; if (!this.dead) this._fadeTo(this.actions[this.baseName], 0.15); cb && cb(); } });
    this.setBase('idle');
  }
  clipName(key) { const v = this.rig.anims[key]; return Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v; }
  _fadeTo(a, fade) { if (!a) return; if (this.cur && this.cur !== a) { a.reset(); a.setEffectiveWeight(1); a.play(); this.cur.crossFadeTo(a, fade, false); } else { a.reset(); a.play(); } this.cur = a; }
  // 반복 동작 (서기·걷기·달리기·방어)
  setBase(key, speed = 1) {
    const name = this.rig.anims[key] || this.rig.anims.idle; const a = this.actions[name]; if (!a) return;
    a.timeScale = speed; a.setLoop(THREE.LoopRepeat);
    if (this.baseName === name) return; this.baseName = name;
    if (!this.one && !this.dead) this._fadeTo(a, 0.18);
  }
  // 한 번 하는 동작. dur를 주면 그 시간 안에 끝나도록 속도를 맞춘다
  play(key, { dur, speed = 1, fade = 0.08, done, name, hold = false } = {}) {
    const clip = name || this.clipName(key); const a = this.actions[clip]; if (!a) { done && done(); return 0; }
    a.setLoop(hold ? THREE.LoopRepeat : THREE.LoopOnce, hold ? Infinity : 1); a.clampWhenFinished = true;
    a.timeScale = dur ? a.getClip().duration / dur : speed;
    this.one = hold ? null : { action: a, done }; this._fadeTo(a, fade);
    return a.getClip().duration / a.timeScale;
  }
  stopOne() { if (this.one) { this.one = null; this._fadeTo(this.actions[this.baseName], 0.1); } }
  die(done) { this.dead = true; this.one = null; const a = this.actions[this.clipName('death')]; if (!a) { done && done(); return; } a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 1.15; this._fadeTo(a, 0.08); this._deathDone = done; this._deathT = a.getClip().duration / 1.15; }
  revive() { this.dead = false; this.setOpacity(1); this.root.visible = true; this.baseName = null; this.setBase('idle'); }
  flash(t = 0.12, color) { this.flashT = t; if (color) this.flashColor.set(color); else this.flashColor.set('#ff3020'); }
  face(dx, dz) { if (Math.abs(dx) + Math.abs(dz) > 1e-4) this.tYaw = Math.atan2(dx, dz); }
  faceNow(dx, dz) { this.face(dx, dz); this.yaw = this.tYaw; }
  setOpacity(o) { for (const m of this.mats) { m.transparent = o < 1; m.opacity = o; m.depthWrite = o >= 1; } }
  set(x, y, z) { this.root.position.set(x, y, z); }
  update(dt) {
    let d = this.tYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 14);
    this.root.rotation.y = this.yaw;
    this.mixer.update(dt);
    if (this.flashT > 0 || this._flashing) { this.flashT = Math.max(0, this.flashT - dt); const k = Math.min(1, this.flashT / 0.08);
      for (const m of this.mats) m.emissive.copy(this.flashColor).multiplyScalar(k * 0.7); this._flashing = this.flashT > 0; }
    if (this.dead && this._deathT != null) { this._deathT -= dt; if (this._deathT <= 0) { const cb = this._deathDone; this._deathT = null; this._deathDone = null; cb && cb(); } }
  }
  dispose() { this.root.parent && this.root.parent.remove(this.root); this.mixer.stopAllAction(); for (const m of this.mats) m.dispose(); }
}
