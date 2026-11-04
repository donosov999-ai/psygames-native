"""Compose evidence from original Flutter frames. Never repaint the UI."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

root = Path(__file__).resolve().parents[2]
shots = root / 'flutter/test/design/preview'
refs = root.parent / 'design-refresh-20261024/four-tabs-review-20261101'
out = root / 'design-integration-evidence/four-tabs'
out.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 13)
pages = [('games', 'games', 'Games'), ('warmup_picker', 'workout', 'Workout'),
         ('statistics', 'progress', 'Progress'), ('pet', 'pet', 'Pet')]
crops = {}
for theme in ['dark', 'light']:
    canvas = Image.new('RGB', (1560, 900), '#071523' if theme == 'dark' else '#fff9ef')
    draw = ImageDraw.Draw(canvas)
    fg = 'white' if theme == 'dark' else '#102035'
    for i, (screen, refname, label) in enumerate(pages):
        actual = Image.open(shots / f'{screen}-{theme}-top.png').convert('RGB')
        actual = actual.resize((390, 844), Image.Resampling.LANCZOS)
        canvas.paste(actual, (i * 390, 30))
        draw.text((i * 390 + 12, 7), label, font=font, fill=fg)
        source = refs / f'{refname}-dark-light-candidate.png'
        reference = Image.open(source).convert('RGB')
        if refname == 'games':
            box = (60, 113, 416, 858) if theme == 'dark' else (882, 113, 1244, 858)
        else:
            box = (31, 146, 365, 915) if theme == 'dark' else (795, 146, 1129, 915)
        cropped = reference.crop(box)
        cropped = cropped.resize((390, round(cropped.height * 390 / cropped.width)), Image.Resampling.LANCZOS)
        height = max(actual.height, cropped.height)
        left = Image.new('RGB', (390, height), '#1b2230')
        middle = left.copy()
        left.paste(cropped, (0, 0))
        middle.paste(actual, (0, 0))
        overlay = Image.blend(left, middle, .5)
        comparison = Image.new('RGB', (1170, height + 65), '#1b2230')
        cd = ImageDraw.Draw(comparison)
        for j, (image, title) in enumerate([(left, 'Reference direction'), (middle, 'Real Flutter / fixture'), (overlay, '50% overlay - NOT acceptance')]):
            comparison.paste(image, (390 * j, 30))
            cd.text((390 * j + 8, 6), title, font=small, fill='white')
        cd.text((8, height + 38), 'Same width, proportional scaling, top aligned. Data and intended header/footer art differ. No pixel-match claim.', font=small, fill='white')
        comparison.save(out / f'{screen}-{theme}-reference-render-overlay.jpg', quality=95)
        crops[f'{screen}-{theme}'] = {'reference': str(source), 'crop': box,
            'actual': str(shots / f'{screen}-{theme}-top.png'), 'comparison': 'same width; no vertical stretching'}
    draw.text((12, 880), 'Flutter widget renders / fixture data / 390 logical px / no physical-device or visual acceptance claimed', font=small, fill=fg)
    canvas.save(out / f'four-tabs-flutter-{theme}.png')
(out / 'comparison-crops.json').write_text(json.dumps(crops, indent=2) + '\n')
print(out)
