"""Package unmodified Flutter test frames into GIF; not artwork generation."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
frames = [Image.open(p).convert('RGB') for p in sorted((root / 'test/design/preview/motion-frames').glob('*.png'))]
if len(frames) != 21:
    raise SystemExit('Expected the 21 original Flutter frames')
dest = root.parent / 'design-integration-evidence/footer-press-motion.gif'
frames[0].save(dest, save_all=True, append_images=frames[1:],
               duration=[400] + [25] * 19 + [800], loop=0, disposal=2)
print(dest)
