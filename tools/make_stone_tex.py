# 성 안뜰 돌바닥 텍스처(이음매 없이 반복) 생성. 결과: game/assets/tex_stone.jpg, tex_cobble.jpg
# 토러스 위 보로노이(F2-F1)로 줄눈을 만들고, 돌마다 색·결을 다르게 준다. 외부 에셋 미사용.
import numpy as np
from PIL import Image, ImageFilter
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(7)

def fbm(n, octaves=5, seed=0):
    r = np.random.default_rng(seed); out = np.zeros((n, n))
    for o in range(octaves):
        k = 4 * 2 ** o; g = r.random((k, k))
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)
        # 이음매 없게: 작은 격자를 반복 타일로 확대
        g3 = np.tile(g, (3, 3)); img = Image.fromarray((g3 * 255).astype(np.uint8)).resize((n * 3, n * 3), Image.BICUBIC)
        a = np.asarray(img, float)[n:2 * n, n:2 * n] / 255
        out += a / 2 ** o
    return (out - out.min()) / (out.max() - out.min())

def stones(n, grid, jitter, mortar, base, var, seed, warm=0.0):
    r = np.random.default_rng(seed)
    pts = []
    for gy in range(grid):
        for gx in range(grid):
            sx = 1.0 + r.uniform(-0.25, 0.6)  # 가로로 긴 판석
            pts.append(((gx + 0.5 + r.uniform(-jitter, jitter)) / grid, (gy + 0.5 + r.uniform(-jitter, jitter)) / grid))
    pts = np.array(pts)
    cols = base + r.uniform(-var, var, (len(pts), 1)) + r.uniform(-var * .08, var * .08, (len(pts), 3))
    yy, xx = np.mgrid[0:n, 0:n] / n
    f1 = np.full((n, n), 9.0); f2 = np.full((n, n), 9.0); idx = np.zeros((n, n), int)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xx - px); dx = np.minimum(dx, 1 - dx) * 1.0
        dy = np.abs(yy - py); dy = np.minimum(dy, 1 - dy) * 1.25
        d = 0.55 * np.sqrt(dx * dx + dy * dy) + 0.45 * np.maximum(dx, dy)  # 각진 판석
        m = d < f1; f2 = np.where(m, f1, np.minimum(f2, d)); idx = np.where(m, i, idx); f1 = np.where(m, d, f1)
    edge = (f2 - f1) * grid
    col = cols[idx]
    grain = fbm(n, 6, seed + 1)[..., None]; big = fbm(n, 3, seed + 2)[..., None]
    speck = np.random.default_rng(seed + 9).random((n, n, 1))
    col = col * (0.84 + 0.22 * grain) * (0.9 + 0.16 * big) * (0.93 + 0.1 * speck)
    bevel = np.clip(edge / (mortar * 2.2), 0, 1)[..., None]
    col = col * (0.72 + 0.28 * bevel)  # 가장자리 살짝 어둡게(입체감)
    moss = np.clip(fbm(n, 4, seed + 3) * 2.2 - 1.3, 0, 1)[..., None]
    mortar_col = np.array([62, 58, 50]) * (0.8 + 0.4 * grain) * (1 - moss) + np.array([74, 92, 52]) * moss  # 줄눈 (군데군데 이끼)
    t = np.clip((edge - mortar * 0.5) / (mortar * 0.6), 0, 1)[..., None]
    out = mortar_col * (1 - t) + col * t
    if warm: out = out * np.array([1 + warm, 1, 1 - warm])
    return np.clip(out, 0, 255).astype(np.uint8)

N = 512
a = stones(N, 5, 0.28, 0.035, np.array([200, 192, 176]), 16, 11)
Image.fromarray(a).save(ROOT / 'game/assets/tex_stone.jpg', quality=86)
b = stones(N, 9, 0.36, 0.06, np.array([158, 146, 128]), 16, 23, warm=0.03)
Image.fromarray(b).save(ROOT / 'game/assets/tex_cobble.jpg', quality=86)
# 미리보기: 2×2 반복해 이음매 확인
for name in ['tex_stone', 'tex_cobble']:
    im = Image.open(ROOT / f'game/assets/{name}.jpg'); pv = Image.new('RGB', (N * 2, N * 2))
    for i in range(4): pv.paste(im, ((i % 2) * N, (i // 2) * N))
    pv.save(ROOT / f'qa/{name}_tiled_preview.jpg', quality=80)
print('ok')
