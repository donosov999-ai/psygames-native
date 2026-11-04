"""Package original Flutter-rendered frames; no generated artwork substitution."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
source = root / 'test/design/preview/pet-materialization-frames'
files = sorted(source.glob('*.png'))
if len(files) != 26:
    raise SystemExit('Expected 26 original Flutter frames')
frames = [Image.open(p).convert('RGBA') for p in files]
out = root.parent / 'design-integration-evidence'
out.mkdir(exist_ok=True)
back = (7, 21, 43, 255)
rendered = []
for frame in frames:
    image = Image.new('RGBA', frame.size, back)
    image.alpha_composite(frame)
    rendered.append(image.convert('RGB'))
rendered[0].save(out / 'pet-materialization.gif', save_all=True,
    append_images=rendered[1:], duration=[80] + [40] * 24 + [1100], loop=0, disposal=2)
selected = [0, 3, 7, 12, 18, 25]
sheet = Image.new('RGB', (900, 640), back[:3])
draw = ImageDraw.Draw(sheet)
for slot, index in enumerate(selected):
    x, y = (slot % 3) * 300, (slot // 3) * 320
    sheet.paste(rendered[index].resize((300, 300)), (x, y))
    draw.text((x + 12, y + 302), f'{index * 40} ms', fill='white')
sheet.save(out / 'pet-materialization-frames.jpg', quality=93)
print(out / 'pet-materialization.gif')
