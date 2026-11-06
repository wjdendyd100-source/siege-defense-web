// 에셋 로딩: 전부 이 프로젝트에서 새로 생성한 이미지(game/assets). 교체 시 파일만 바꾸면 된다.
// 레온 그림은 사용자 제공 시안(art_src/leon_concept_sheet.png)에서 tools/cut_leon.py로 잘라 만든다.
import * as THREE from 'three';
import { loadModels } from './units.js?v=20261106g';

export const ART = [
  'hero_protagonist', 'hero_sera', 'hero_bran', 'hero_elise', 'hero_marco', 'hero_roderick', 'hero_amelia',
  'hero_lian', 'hero_isolde', 'hero_toby', 'hero_nina', 'hero_hans',
  'mon_goblin', 'mon_orc', 'mon_skeleton', 'mon_darkknight',
];
// 원화가 바라보는 방향 (1 = 오른쪽, -1 = 왼쪽)
export const FACING = {
  hero_protagonist: 1, hero_sera: -1, hero_bran: 1, hero_elise: 1, hero_marco: 1, hero_roderick: -1, hero_amelia: -1,
  hero_lian: 1, hero_isolde: 1, hero_toby: -1, hero_nina: 1, hero_hans: -1,
  mon_goblin: 1, mon_orc: 1, mon_skeleton: 1, mon_darkknight: 1,
};

export const A = { img: {}, tex: {}, texFlip: {}, aspect: {} };
export const face = name => `assets/${name}_face.webp`;
export const full = name => `assets/${name}.webp`;

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load ' + src)); i.src = src; });
}

export async function loadAll(onProgress) {
  // 전투 유닛은 3D 모델(units.js)이라 영웅·몬스터 2D 그림은 미리 GPU에 올리지 않는다 (대화·카드 화면은 그림 주소를 바로 쓴다)
  const list = [['tex_stone', 'assets/tex_stone.jpg'], ['tex_cobble', 'assets/tex_cobble.jpg'],
    ['bg_title', 'assets/bg_title.jpg'], ['bg_village', 'assets/bg_village.jpg']];
  let done = 0;
  let mp = 0; const prog = () => onProgress && onProgress((done / list.length) * 0.3 + mp * 0.7);
  await Promise.all([
    ...list.map(async ([n, src]) => { A.img[n] = await loadImg(src); done++; prog(); }),
    loadModels(p => { mp = p; prog(); }),
  ]);
}

// 캔버스로 만드는 효과용 텍스처 (그라데이션·호·불꽃)
const cache = {};
export function fxTex(kind) {
  if (cache[kind]) return cache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  if (kind === 'glow') {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  } else if (kind === 'shadow') {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  } else if (kind === 'slash') { // 호 형태 베기 궤적 (가운데가 밝고 끝으로 갈수록 가늘게)
    c.width = 256; c.height = 128;
    for (let i = 0; i < 40; i++) {
      const t = i / 40; g.strokeStyle = `rgba(255,255,255,${0.04 + t * 0.05})`; g.lineWidth = 2 + t * 26 * Math.sin(t * Math.PI);
      g.beginPath(); g.arc(128, 128, 100 - i * 0.3, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 104, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
  } else if (kind === 'ring') {
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
    const gr = g.createRadialGradient(64, 64, 30, 64, 64, 60); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.35)');
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  } else if (kind === 'note') {
    g.fillStyle = '#fff'; g.font = 'bold 96px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♪', 64, 70);
  } else if (kind === 'spark') {
    g.translate(64, 64);
    for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 4); const gr = g.createLinearGradient(-60, 0, 60, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-60, -3 + (i % 2), 120, 6 - (i % 2) * 2); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  cache[kind] = t; return t;
}
