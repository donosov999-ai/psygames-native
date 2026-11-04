"""Mechanical QA montage/GIF of genuine Flutter frames; no repainting artwork."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
source = root / 'test/design/preview/goods-feedback'
out = root.parent / 'design-integration-evidence/goods-feedback'
out.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
names = ['dark-390-before', 'dark-390-selected', 'motion-10', 'dark-390-landed']
sheet = Image.new('RGB', (390 * 4, 890), '#06151f')
draw = ImageDraw.Draw(sheet)
for i, (name, label) in enumerate(zip(names, ['Before · Flutter', 'Selected', 'Transfer · actual frame', 'Landed'])):
    draw.text((i * 390 + 10, 10), label, fill='white', font=font)
    image = Image.open(source / f'{name}.png').convert('RGB')
    image.thumbnail((390, 844), Image.Resampling.LANCZOS)
    sheet.paste(image, (i * 390, 40))
sheet.save(out / 'goods-feedback-steps.jpg', quality=92)

names = ['dark-390-before', 'dark-390-selected'] + [f'motion-{i:02d}' for i in range(24)] + ['dark-390-landed']
frames = []
for name in names:
    image = Image.open(source / f'{name}.png').convert('RGB')
    image.thumbnail((390, 844), Image.Resampling.LANCZOS)
    frames.append(image)
frames[0].save(out / 'goods-feedback.gif', save_all=True, append_images=frames[1:],
    duration=[700, 500] + [16] * 24 + [900], loop=0, disposal=2)

themes = Image.new('RGB', (780, 844), '#06151f')
for i, theme in enumerate(['dark', 'light']):
    image = Image.open(source / f'{theme}-390-before.png').convert('RGB')
    image.thumbnail((390, 844), Image.Resampling.LANCZOS)
    themes.paste(image, (i * 390, 0))
themes.save(out / 'goods-feedback-themes.jpg', quality=92)
print(out)
