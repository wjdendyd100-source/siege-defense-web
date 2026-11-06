// KayKit(CC0) 캐릭터를 게임용으로 가볍게 만든다: 쓰는 애니메이션만 남기고, 무기 정리, 해골 무기 손에 붙이기, 정점 양자화.
// 원본: github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (672074b)
//       github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0  (15b62b9)
// 사용: KAYKIT=<두 저장소를 받은 폴더> node tools/build_models.mjs   (@gltf-transform/core·functions·extensions 4.x 필요)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize, resample, mergeDocuments, unpartition, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import path from 'node:path';
import fs from 'node:fs';

const K = process.env.KAYKIT;
const ADV = path.join(K, 'Adventures/addons/kaykit_character_pack_adventures');
const SKL = path.join(K, 'Skeletons/addons/kaykit_character_pack_skeletons');
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../game/assets/models');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const BASE = ['Idle', 'Walking_A', 'Running_A', 'Hit_A', 'Hit_B', 'Death_A', 'Cheer'];
const MODELS = {
  knight: { src: `${ADV}/Characters/gltf/Knight.glb`, keep: ['1H_Sword', 'Badge_Shield', '2H_Sword'],
    anims: [...BASE, '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Stab',
      '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spinning', '2H_Melee_Idle', 'Dodge_Forward', 'Dodge_Backward', 'Blocking', 'Block_Hit', 'Walking_B'] },
  barbarian: { src: `${ADV}/Characters/gltf/Barbarian.glb`, keep: ['2H_Axe'], anims: [...BASE, '2H_Melee_Attack_Stab', '2H_Melee_Attack_Chop', '2H_Melee_Idle'] },
  rogue_hooded: { src: `${ADV}/Characters/gltf/Rogue_Hooded.glb`, keep: ['2H_Crossbow'], anims: [...BASE, '2H_Ranged_Shoot', '2H_Ranged_Aiming'] },
  rogue: { src: `${ADV}/Characters/gltf/Rogue.glb`, keep: ['1H_Crossbow'], anims: [...BASE, '1H_Ranged_Shoot', 'Spellcast_Raise'] },
  mage: { src: `${ADV}/Characters/gltf/Mage.glb`, keep: ['2H_Staff'], anims: [...BASE, 'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcasting'] },
  sk_minion: { src: `${SKL}/Characters/gltf/Skeleton_Minion.glb`, attach: { 'handslot.r': 'Skeleton_Blade' },
    anims: ['Idle_Combat', 'Walking_D_Skeletons', 'Hit_A', 'Death_C_Skeletons', 'Spawn_Ground_Skeletons', '1H_Melee_Attack_Chop', 'Taunt'] },
  sk_warrior: { src: `${SKL}/Characters/gltf/Skeleton_Warrior.glb`, attach: { 'handslot.r': 'Skeleton_Axe', 'handslot.l': 'Skeleton_Shield_Large_A' },
    anims: ['Idle_Combat', 'Walking_D_Skeletons', 'Hit_A', 'Death_C_Skeletons', 'Spawn_Ground_Skeletons', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Jump_Chop', 'Taunt'] },
  sk_rogue: { src: `${SKL}/Characters/gltf/Skeleton_Rogue.glb`, attach: { 'handslot.r': 'Skeleton_Crossbow' },
    anims: ['Idle_Combat', 'Walking_D_Skeletons', 'Hit_A', 'Death_C_Skeletons', 'Spawn_Ground_Skeletons', '1H_Ranged_Shoot', 'Taunt'] },
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, m] of Object.entries(MODELS)) {
  const doc = await io.read(m.src);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!m.anims.includes(a.getName())) { a.listChannels().forEach(c => c.dispose()); a.listSamplers().forEach(x => x.dispose()); a.dispose(); }
  const missing = m.anims.filter(n => !root.listAnimations().some(a => a.getName() === n));
  if (missing.length) throw new Error(`${name}: 애니메이션 없음 ${missing}`);
  if (m.keep) for (const n of root.listNodes()) {
    const p = n.getParentNode && n.getParentNode();
    if (n.getMesh() && root.listNodes().some(h => h.getName().startsWith('handslot') && h.listChildren().includes(n)) && !m.keep.includes(n.getName())) { n.getMesh().dispose(); n.dispose(); }
  }
  if (m.attach) for (const [slot, w] of Object.entries(m.attach)) {
    const wdoc = await io.read(`${SKL}/Assets/gltf/${w}.gltf`);
    const map = mergeDocuments(doc, wdoc);
    const wScene = map.get(wdoc.getRoot().listScenes()[0]);
    const hand = root.listNodes().find(n => n.getName() === slot);
    for (const c of wScene.listChildren()) { wScene.removeChild(c); hand.addChild(c); }
    wScene.dispose();
  }
  // 변형에 쓰이지 않는 IK·컨트롤 뼈의 애니메이션 트랙 제거 (용량의 큰 부분)
  const joints = new Set(root.listSkins().flatMap(s => s.listJoints()));
  for (const a of root.listAnimations()) for (const ch of a.listChannels()) {
    const t = ch.getTargetNode(); if (t && !joints.has(t) && t.getName() !== 'root' && t.getName() !== 'Rig') { ch.dispose(); }
  }
  // 기본 자세에서 전혀 움직이지 않는 트랙 제거 (JSON 머리말이 커지는 원인)
  for (const a of root.listAnimations()) for (const ch of a.listChannels()) {
    const t = ch.getTargetNode(), sm = ch.getSampler(), path = ch.getTargetPath(); if (!t || !sm) continue;
    const base = path === 'translation' ? t.getTranslation() : path === 'rotation' ? t.getRotation() : path === 'scale' ? t.getScale() : null; if (!base) continue;
    const out = sm.getOutput(), n = out.getCount(), el = []; let still = true;
    for (let i = 0; i < n && still; i++) { out.getElement(i, el); for (let k = 0; k < el.length; k++) if (Math.abs(el[k] - base[k]) > 1e-4) { still = false; break; } }
    if (still) ch.dispose();
  }
  for (const a of root.listAnimations()) { const used = new Set(a.listChannels().map(c => c.getSampler())); for (const sm of a.listSamplers()) if (!used.has(sm)) sm.dispose(); }
  await doc.transform(unpartition(), resample({ tolerance: 5e-4 }), prune(), dedup(), quantize({ quantizeNormal: 8, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  for (const acc of root.listAccessors()) if (!acc.listParents().some(p => p.propertyType !== 'Root')) acc.dispose(); // 남은 고아 accessor 정리
  const file = path.join(OUT, `${name}.glb`);
  await io.write(file, doc);
  console.log(name, Math.round(fs.statSync(file).size / 1024) + 'KB', root.listAnimations().length + ' anims');
}
