"""Assemble real Flutter frame recordings and width-normalized comparisons.

No regeneration, repainting or non-uniform stretching of UI screenshots.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw

p = argparse.ArgumentParser()
p.add_argument('--reference', type=Path, required=True)
args = p.parse_args()
root = Path(__file__).resolve().parents[1]
frames = root / 'test/design/preview'
out = root.parent / 'design-integration-evidence/compact/review'
out.mkdir(parents=True, exist_ok=True)
ref = Image.open(args.reference).convert('RGB')
for theme in ('dark', 'light'):
    pair = Image.new('RGB', (780, 844), '#071622')
    for i, page in enumerate(('warmup_picker', 'pet')):
        im = Image.open(frames / f'{page}-{theme}-top.png').convert('RGB')
        im = im.resize((390, round(im.height * 390 / im.width)))
        pair.paste(im, (390 * i, 0))
    pair.save(out / f'flutter-workout-pet-{theme}.png')
for i, page in enumerate(('warmup_picker', 'pet')):
    actual = Image.open(frames / f'{page}-dark-top.png').convert('RGB')
    actual = actual.resize((390, round(actual.height * 390 / actual.width)))
    half = ref.crop((round(i * ref.width / 2), 0, round((i + 1) * ref.width / 2), ref.height))
    half = half.resize((390, round(half.height * 390 / half.width)))
    height = max(half.height, actual.height)
    reference = Image.new('RGB', (390, height), '#071622')
    reference.paste(half, (0, 0))
    screenshot = Image.new('RGB', (390, height), '#071622')
    screenshot.paste(actual, (0, 0))
    overlay = Image.blend(reference, screenshot, .5)
    sheet = Image.new('RGB', (1194, height + 32), '#071622')
    d = ImageDraw.Draw(sheet)
    for x, label, im in ((0, 'Accepted v3 / same width', reference), (402, 'Flutter render / real widgets', screenshot), (804, '50% overlay / NOT acceptance', overlay)):
        d.text((x + 8, 8), label, fill='white')
        sheet.paste(im, (x, 32))
    sheet.save(out / f'{page}-reference-flutter-overlay.png')
for page in ('games', 'warmup_picker', 'statistics', 'pet'):
    sources = sorted((frames / 'motion').glob(f'{page}-*.png'))
    if not sources:
        continue
    images = []
    for f in sources:
        im = Image.open(f).convert('RGB')
        images.append(im.resize((390, round(im.height * 390 / im.width))))
    images[0].save(out / f'{page}-motion.gif', save_all=True,
        append_images=images[1:], duration=[40] * (len(images) - 1) + [800], loop=0)
