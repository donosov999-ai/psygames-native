"""Mechanical crops from real Flutter renders; no UI repainting."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
shots = root / 'flutter/test/design/preview'
out = root / 'design-integration-evidence/four-tabs/progress-tabs-backplates.png'
canvas = Image.new('RGB', (780, 496))
for column, theme in enumerate(['dark', 'light']):
    for row, state in enumerate(['top', 'history']):
        image = Image.open(shots / f'statistics-{theme}-{state}.png').convert('RGB')
        # Same physical coords for all captures; scale uniformly by 1/2.
        crop = image.crop((0, 0, 780, 496)).resize((390, 248), Image.Resampling.LANCZOS)
        canvas.paste(crop, (390 * column, 248 * row))
canvas.save(out)
print(out)
