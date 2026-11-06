# Figma 이미지 생성(gpt-image-2.5-flare)으로 만든 원본(art_src/terrain/*_gen.png)을 게임 텍스처로 가공한다.
# - 바닥·벽: 생성 원본이 이미 이음매 없이 이어져(가장자리 차이 = 이웃 픽셀 차이 수준) 그대로 사용
# - 깃발·꽃덤불: 바깥 가장자리와 이어진 흰 배경만 지움(외곽 채우기). 흰 꽃처럼 안쪽의 흰색은 남는다
# 사용: python tools/make_terrain_tex.py   (Pillow, numpy, scipy 필요)
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'art_src/terrain', ROOT / 'game/assets'

def seamless(img, band=0.12):
    a = np.asarray(img.convert('RGB'), float); h, w, _ = a.shape
    b = np.roll(np.roll(a, h // 2, 0), w // 2, 1)  # 절반 밀어 이음매를 가운데로
    # 가장자리 근처일수록 밀린 이미지(b) 비중을 높여 바깥 경계를 연결
    yy = np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h * band); xx = np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w * band)
    m = np.clip(np.minimum(yy[:, None], xx[None, :]), 0, 1)[..., None]
    out = a * m + b * (1 - m)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

def tile_preview(img, path):
    w, h = img.size; pv = Image.new('RGB', (w * 2, h * 2))
    for i in range(4): pv.paste(img, ((i % 2) * w, (i // 2) * h))
    pv.resize((w, h)).save(path, quality=80)

floor = Image.open(SRC / 'floor_flagstone_gen.png').convert('RGB')
floor.save(OUT / 'tex_floor.jpg', quality=88); tile_preview(floor, ROOT / 'qa/tex_floor_tiled_preview.jpg')
wall = Image.open(SRC / 'wall_limestone_gen.png').convert('RGB')
wall.save(OUT / 'tex_wall.jpg', quality=88); tile_preview(wall, ROOT / 'qa/tex_wall_tiled_preview.jpg')

from scipy import ndimage
def cut_white_bg(img, thr=232):
    a = np.asarray(img.convert('RGB'), float)
    white = (a.min(axis=2) > thr) & (a.max(axis=2) - a.min(axis=2) < 18)
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    alpha = (~bg).astype(float)
    alpha = ndimage.gaussian_filter(alpha, 0.8)  # 가장자리 부드럽게
    alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
    rgba = np.dstack([a, alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')

for name, out, h in [('banner_navy_gen.png', 'banner_navy.webp', 512), ('bush_flowers_gen.png', 'bush_flowers.webp', 384)]:
    cut = cut_white_bg(Image.open(SRC / name))
    cut = cut.crop(cut.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    cut = cut.resize((round(cut.width * h / cut.height), h), Image.LANCZOS)
    cut.save(OUT / out, quality=90, method=6); print(out, cut.size)
print('ok')
