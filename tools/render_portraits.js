// 3D 해골 모델로 몬스터 얼굴 아이콘(256×256)을 렌더해 game/assets/mon_*_face.webp를 만든다.
// 사용: game/을 http://localhost:8765 로 띄운 뒤  node tools/render_portraits.js  (playwright 필요)
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const THREE_DIR = process.env.THREE_DIR; // 로컬 three 패키지 경로 (CDN 대신 사용할 때)
const JOBS = [['sk_minion', 'mon_goblin_face'], ['sk_warrior', 'mon_orc_face'], ['sk_rogue', 'mon_skeleton_face']];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 400, height: 400 } });
  if (THREE_DIR) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\//, r => { const u = new URL(r.request().url()); r.fulfill({ path: path.join(THREE_DIR, u.pathname.replace('/npm/three@0.160.0/', '')), contentType: 'text/javascript' }); });
  await p.goto('http://localhost:8765/index.html'); await p.waitForSelector('.start', { timeout: 60000 });
  for (const [model, out] of JOBS) {
    const dataUrl = await p.evaluate(async (model) => {
      const THREE = await import('three'); const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
      const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder); const g = await l.loadAsync(`assets/models/${model}.gltf.json`);
      const scene = new THREE.Scene(); scene.add(g.scene);
      scene.add(new THREE.HemisphereLight('#fff6e0', '#3a4a30', 1.4)); const d = new THREE.DirectionalLight('#ffffff', 2); d.position.set(1, 2, 3); scene.add(d);
      const mixer = new THREE.AnimationMixer(g.scene); const clip = g.animations.find(a => a.name === 'Taunt') || g.animations[0]; mixer.clipAction(clip).play(); mixer.update(clip.duration * 0.35);
      g.scene.updateMatrixWorld(true);
      const head = g.scene.getObjectByName('head'); const hp = new THREE.Vector3(); head.getWorldPosition(hp);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(hp.x + 0.6, hp.y + 0.35, hp.z + 3.4); cam.lookAt(hp.x, hp.y - 0.05, hp.z);
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true }); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0, 0);
      r.render(scene, cam); const u = c.toDataURL('image/webp', 0.9); r.dispose(); return u;
    }, model);
    fs.writeFileSync(path.join(__dirname, '../game/assets', out + '.webp'), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(out);
  }
  await b.close();
})();
