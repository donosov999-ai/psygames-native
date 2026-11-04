"""Mechanical inner-texture extraction; retain the accepted source panels.

Remove the baked outer frame so the connected outline is drawn exactly once.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'assets'
for theme in ('dark', 'light'):
    source = root / 'aurora_tab_panels' / f'{theme}-panel-selected.png'
    im = Image.open(source).convert('RGBA')
    w, h = im.size
    im.crop((int(w * .12), int(h * .16), int(w * .88), int(h * .84))).save(
        root / 'workout_gems' / f'program-{theme}.png')
