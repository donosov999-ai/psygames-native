"""Mechanical crops of generated sheets and reuse of accepted chrome artwork."""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[2]
refs = root.parent / 'design-refresh-20261024/four-tabs-review-20261101/assets'
out = root / 'flutter/assets/aurora_tab_panels'
refs.mkdir(exist_ok=True, parents=True)
out.mkdir(exist_ok=True, parents=True)
generated = Path('/Users/denisonosov/.codex/generated_images/01a00bd7-7b65-7130-a62a-2cdc1e6ee88f')
sources = {'square-sheet-rejected.png': generated / 'exec-e274f984-352a-4ba8-8be2-1e609ae6048e.png',
           'wide-sheet.png': generated / 'exec-6f5f9c0d-9d0c-4471-ac44-4761063a7312.png'}
for name, source in sources.items():
    shutil.copy2(source, refs / name)

manifest = {'method': 'mechanical alpha trim, original proportions retained', 'assets': [],
            'rejected': {'square-sheet-rejected.png': 'square cards exceed row boundaries; do not use'}}
def save(source, image, name, cell=None, cell_box=None):
    bbox = image.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if not bbox:
        raise ValueError(name)
    crop = image.crop(bbox)
    crop.save(out / f'{name}.png')
    manifest['assets'].append({'id': name, 'source': str(source), 'cell': cell,
        'cell_bounds': cell_box, 'alpha_crop': bbox, 'size': crop.size,
        'sha256': hashlib.sha256((out / f'{name}.png').read_bytes()).hexdigest()})

source = sources['wide-sheet.png']
sheet = Image.open(source).convert('RGBA')
w, h = sheet.size
for i, name in enumerate(['dark-panel', 'light-panel', 'dark-panel-selected', 'light-panel-selected']):
    x, y = i % 2, i // 2
    box = (x * w // 2, y * h // 2, (x + 1) * w // 2, (y + 1) * h // 2)
    save(source, sheet.crop(box), name, [y, x], box)

approved = root.parent / 'design-refresh-20261024/home-gem-20261031'
for theme in ['dark', 'light']:
    for kind in ['header', 'footer']:
        source = approved / f'{kind}-{theme}.png'
        save(source, Image.open(source).convert('RGBA'), f'{kind}-{theme}')
    source = root / f'flutter/assets/aurora_game_chrome/home_panels_pilot/{theme}_goal.png'
    save(source, Image.open(source).convert('RGBA'), f'{theme}-card')

stage_source = generated / 'exec-af69a440-bdbb-4970-97fd-436a1c249562.png'
shutil.copy2(stage_source, refs / 'pet-stage-sheet.png')
stage = Image.open(stage_source).convert('RGBA')
sw, sh = stage.size
for i, theme in enumerate(['dark', 'light']):
    box = (i * sw // 2, 0, (i + 1) * sw // 2, sh)
    crop = stage.crop(box)
    crop.save(out / f'pet-stage-{theme}.png')
    manifest['assets'].append({'id': f'pet-stage-{theme}', 'source': str(stage_source),
        'cell': [0, i], 'cell_bounds': box, 'size': crop.size,
        'sha256': hashlib.sha256((out / f'pet-stage-{theme}.png').read_bytes()).hexdigest()})

(refs / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
contact = Image.new('RGB', (960, 220 * 6), '#182435')
draw = ImageDraw.Draw(contact)
for i, a in enumerate(manifest['assets']):
    image = Image.open(out / f"{a['id']}.png").convert('RGBA')
    image.thumbnail((440, 185))
    x, y = (i % 2) * 480, (i // 2) * 220
    contact.paste(image, (x + (480 - image.width) // 2, y + 8), image)
    draw.text((x + 12, y + 199), a['id'], fill='white')
contact.save(refs / 'contact-sheet.jpg', quality=95)
print(json.dumps(manifest, ensure_ascii=False, indent=2))
