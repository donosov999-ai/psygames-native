#!/usr/bin/env python3
"""ОБЛОЖКА КАРТОЧКИ — ЭТО ИГРА ИЛИ МЕНЮ? Замер, а не глаз.

🔴 ЗАЧЕМ. Превью на карточке игры должно показывать ИГРУ. 21.08.2026 нашлось, что
17 обложек из 48 — снимки экрана «About Game»: заголовок, панель «How it works»,
кнопки Help и Start. На карточке этот текст просвечивает под её собственным
названием, и человек видит два текста поверх друг друга. Часть снимков вдобавок
устарела: на них две стрелки «назад» подряд, которых в приложении давно нет.

КАК ОТЛИЧАЕМ. У экрана About внизу всегда жёлтая кнопка «Help» — приметы ярче не
нужно. Считаем долю жёлтого в нижней полосе: у снимков меню она 22–34%, у
игровых экранов ниже 6%. Разрыв четырёхкратный, порога хватает простого.

Пересобрать:  python3 scripts/gen_thumb_audit.py
"""
import glob, hashlib, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THUMBS = os.path.join(ROOT, 'frontend/assets/images/gamethumbs')
OUT = os.path.join(ROOT, 'frontend/src/constants/gameThumbAudit.ts')
SHOT = (760, 1440)      # полноэкранный снимок; 160×160 — это иконки, не фоны
ABOUT_YELLOW = 0.06     # ниже — игровой экран, выше — меню

def yellow_bottom(im):
    w, h = im.size
    band = im.crop((0, int(h * 0.86), w, int(h * 0.99))).resize((190, 60), Image.LANCZOS)
    px = list(band.get_flattened_data() if hasattr(band, 'get_flattened_data') else band.getdata())
    hit = sum(1 for r, g, b in px if r > 200 and g > 150 and b < 120 and (r - b) > 90)
    return hit / len(px)

rows = []
for f in sorted(glob.glob(os.path.join(THUMBS, '*.webp'))):
    im = Image.open(f).convert('RGB')
    gid = os.path.basename(f)[:-5]
    sha = hashlib.sha256(open(f, 'rb').read()).hexdigest()[:12]
    if im.size != SHOT:
        rows.append((gid, False, 0.0, sha)); continue
    y = yellow_bottom(im)
    rows.append((gid, y > ABOUT_YELLOW, round(y, 4), sha))

body = ''.join(
    f"  {json.dumps(g)}: {{ about: {str(a).lower()}, yellow: {y}, sha: '{s}' }},\n"
    for g, a, y, s in rows)
open(OUT, 'w', encoding='utf-8').write(f'''/* psygames-game-thumb-audit · VER 1 · 21.08.2026 · СГЕНЕРИРОВАНО, РУКАМИ НЕ ПРАВИТЬ */
/**
 * ЧТО ИЗОБРАЖЕНО НА ОБЛОЖКЕ КАРТОЧКИ — игра или экран «About Game».
 *
 * Источник — сами файлы обложек. Пересобрать: python3 scripts/gen_thumb_audit.py
 * Правило и порог объяснены там же.
 *
 * `sha` — отпечаток файла. Заменили обложку, не пересчитав этот файл, — гейт
 * `game-thumb-audit.test.ts` покраснеет: иначе запись про «меню» пережила бы
 * замену обложки на игровую и глушила бы её зря.
 */
export interface ThumbAudit {{ about: boolean; yellow: number; sha: string }}

export const THUMB_AUDIT: Record<string, ThumbAudit> = {{
{body}}};
''')
print(f'обложек: {len(rows)}, из них снимки меню: {sum(1 for r in rows if r[1])}')
