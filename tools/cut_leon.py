# 시안(art_src/leon_concept_sheet.png)에서 레온 전신·얼굴을 잘라 게임 에셋으로 만든다.
# 사용: python tools/cut_leon.py  (rembg[cpu] 필요, 모델 isnet-general-use)
import sys
from pathlib import Path
from PIL import Image
from rembg import remove, new_session

ROOT = Path(__file__).resolve().parent.parent
src = Image.open(ROOT / 'art_src/leon_concept_sheet.png').convert('RGB')
# 패널 02 (3D CHARACTER): 오른쪽 위. 라벨·테두리 제외
panel = src.crop((775, 4, 1536, 484))
from PIL import ImageDraw
ImageDraw.Draw(panel).rectangle((0, 0, 240, 42), fill=(38, 38, 40))  # 라벨 "02 3D CHARACTER" 가림
panel.save(ROOT / 'art_src/leon_panel02.png')
sess = new_session('isnet-general-use')
cut = remove(panel, session=sess, post_process_mask=True)
bbox = cut.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
cut = cut.crop(bbox)
cut.save(ROOT / 'art_src/leon_cutout.png')
# 게임 규격: 높이 560 (기존 영웅과 동일)
h = 560; w = round(cut.width * h / cut.height)
full = cut.resize((w, h), Image.LANCZOS)
full.save(ROOT / 'game/assets/hero_protagonist.webp', quality=90, method=6)
# 얼굴: 패널 01 (ILLUSTRATION) 얼굴 중심 정사각
face = src.crop((250, 20, 510, 280)).resize((256, 256), Image.LANCZOS).convert('RGBA')
face.save(ROOT / 'game/assets/hero_protagonist_face.webp', quality=90, method=6)
print('full', full.size, 'bbox', bbox)
