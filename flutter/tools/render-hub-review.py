"""Assemble real Flutter renders and reference comparisons; never a pixel-pass claim."""
import argparse
import html
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

p = argparse.ArgumentParser()
p.add_argument('design', type=Path)
args = p.parse_args()
flutter = Path(__file__).resolve().parents[1]
review = flutter.parent / 'review'
review.mkdir(exist_ok=True)
src = flutter / 'test/design/preview'
inventory = json.loads((args.design / 'all-hubs-3col-20261113/inventory.json').read_text())
hubs = inventory['hubs']
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)
small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)

def sheet(items, out, columns=5, width=260, height=563):
    result = Image.new('RGB', (columns*width, math.ceil(len(items)/columns)*(height+36)+42), '#142332')
    d = ImageDraw.Draw(result)
    d.text((12, 10), 'REAL FLUTTER WIDGET RENDERS / fixture data / NOT device acceptance', font=small, fill='white')
    for i, (title, file) in enumerate(items):
        x, y = (i % columns)*width, (i//columns)*(height+36)+42
        im = Image.open(file).convert('RGB').resize((width, height), Image.Resampling.LANCZOS)
        result.paste(im, (x, y+28))
        d.text((x+8, y+5), title, font=small, fill='white')
    result.save(out)

for theme in ['light', 'dark']:
    items = [(h['titleEn'], src / f"hubs-{h['route'].split('/')[-1]}-{theme}.png") for h in hubs]
    sheet(items, review/f'flutter-hubs-{theme}.png')
sheet([(t.title(), src / f'mental-settings-{t}.png') for t in ['light','dark']],
      review/'mental-settings-two-themes.png', columns=2, width=390, height=844)

# Inspect each new cut as an actual sprite on both light and dark fields.
modes = ['mixed','rotation','projection','net','viewpoint','same','assembly','memory','formation','section','missing','oblique']
canvas = Image.new('RGB', (960, 4*230), '#142332')
draw = ImageDraw.Draw(canvas)
for i, name in enumerate(modes):
    x, y = (i%3)*320, (i//3)*230
    draw.rectangle((x,y,x+159,y+205), fill='#f4f3ee')
    draw.rectangle((x+160,y,x+319,y+205), fill='#082137')
    sprite = Image.open(flutter/f'assets/hub_art/mental_modes/{name}.webp').convert('RGBA').resize((152,152), Image.Resampling.LANCZOS)
    canvas.paste(sprite,(x+4,y+25),sprite)
    canvas.paste(sprite,(x+164,y+25),sprite)
    draw.text((x+12,y+210),name,font=small,fill='white')
canvas.save(review/'mental-mode-sprites.png')

art = json.loads((flutter/'assets/hub_art/index.json').read_text())['byRoute']
cards = {c['route']:c for h in hubs for c in h['cards']}
for theme in ['light','dark']:
    cell=132
    image=Image.new('RGB',(10*cell,math.ceil(len(cards)/10)*166+32),'#e9edf2' if theme=='light' else '#091a29')
    d=ImageDraw.Draw(image)
    d.text((10,8),'134 hub entries / artwork candidates, NOT 134 unique games',font=small,fill='#152032' if theme=='light' else 'white')
    for i,(route,card) in enumerate(cards.items()):
        x,y=(i%10)*cell,(i//10)*166+32
        im=Image.open(flutter/art[route][theme]).convert('RGBA').resize((124,124),Image.Resampling.LANCZOS)
        image.paste(im,(x+4,y),im)
        d.text((x+4,y+126),card['titleEn'][:17],font=small,fill='#152032' if theme=='light' else 'white')
    image.save(review/f'all-artwork-{theme}.png')

compare=review/'comparisons'
compare.mkdir(exist_ok=True)
names=['span','mnemonics-hub','chess-hub','attention-conflict','search-hub','sudoku-hub','spatial-hub','sorting-hub','relaxation-hub','counting-hub','words-hub','hearing-hub','languages-hub']
links=[]
for n, slug in enumerate(names,1):
    ref=args.design/f'all-hubs-3col-20261113/renders/{n:02d}-{slug}-p1.png'
    if not ref.exists():
        continue
    a=Image.open(ref).convert('RGB').resize((390,844),Image.Resampling.LANCZOS)
    b=Image.open(src/f'hubs-{slug}-light.png').convert('RGB').resize((390,844),Image.Resampling.LANCZOS)
    out=Image.new('RGB',(1170,900),'#142332')
    d=ImageDraw.Draw(out)
    for x,title,im in [(0,'Reference candidate',a),(390,'Flutter / fixture',b),(780,'50% overlay / NOT acceptance',Image.blend(a,b,.5))]:
        d.text((x+8,8),title,font=small,fill='white')
        out.paste(im,(x,40))
    name=f'{n:02d}-{slug}.png'
    out.save(compare/name)
    links.append(f'<li><a href="comparisons/{name}">{html.escape(slug)}: ref / Flutter / overlay</a></li>')
page='''<!doctype html><meta charset="utf-8"><title>PsyGames local hub review</title>
<style>body{background:#0b1926;color:#eef4ff;font:17px system-ui;margin:24px}a{color:#80d9ff}img{max-width:100%;height:auto}section{margin:36px 0}</style>
<h1>PsyGames: local hub review</h1><p>13 real hub screens, 134 catalogue entries, both themes. Fixture progress, not user data. Widget renders are NOT device tests or visual approval. First Mental Rotation LIGHT drawing is accepted; other artwork is presented for review.</p>
'''
for title,name in [('Light hubs','flutter-hubs-light.png'),('Dark hubs','flutter-hubs-dark.png'),('Mental Rotation settings','mental-settings-two-themes.png'),('New mode icons on light and dark','mental-mode-sprites.png'),('All covers / light','all-artwork-light.png'),('All covers / dark','all-artwork-dark.png')]:
    page+=f'<section><h2>{title}</h2><a href="{name}"><img loading="lazy" src="{name}"></a></section>'
page+='<h2>Equal-width comparisons</h2><p>Layouts and artwork differ from conceptual references; no pixel-match claimed. Record disagreements before acceptance.</p><ul>'+''.join(links)+'</ul>'
(review/'index.html').write_text(page)
print(f'Review saved: {review}/index.html; comparisons={len(links)}')
