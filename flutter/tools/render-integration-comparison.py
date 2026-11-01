"""Acceptance helper: preserve aspect, same canvas width, honest 50% overlay.

Generated images are evidence, not an approval or a pixel-similarity score.
The accepted concept has different proportions and fixture content.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont

repo = Path(__file__).resolve().parents[2]
reference = Path('/Users/denisonosov/.codex/generated_images/01a00bd7-7b65-7130-a62a-2cdc1e6ee88f/exec-d0998c42-c6f1-4d6e-9fd6-0b43a1226c75.png')
render = repo / 'flutter/test/design/preview/home-dark-top.png'
out = repo / 'design-integration-evidence'
out.mkdir(exist_ok=True)
size = (390, 844)
ref = Image.open(reference).convert('RGB').crop((242, 45, 747, 982))
ref = ImageOps.pad(ref, size, color='#25303b')
actual = Image.open(render).convert('RGB').resize(size, Image.Resampling.LANCZOS)
overlay = Image.blend(ref, actual, .5)
canvas = Image.new('RGB', (3 * 406, 906), '#edf0f3')
d = ImageDraw.Draw(canvas)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)
for i, (label, im) in enumerate([('Accepted concept - aspect preserved', ref), ('Real Flutter - fixture data', actual), ('50% overlay - NOT acceptance', overlay)]):
    x = 8 + i * 406
    d.text((x, 10), label, font=font, fill='#17202a')
    canvas.paste(im, (x, 42))
canvas.save(out / 'home-reference-render-overlay.png')
print(out / 'home-reference-render-overlay.png')
