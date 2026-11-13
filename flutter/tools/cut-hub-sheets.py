"""Mechanical sprite-sheet cutting; keep generated alpha and original sheets.

The user explicitly requested the sheet/cut pipeline. No background repainting.
"""
import argparse
import json
import shutil
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("design", type=Path)
parser.add_argument("source", type=Path)
parser.add_argument("--modes", action="store_true")
args = parser.parse_args()
root = args.design / "hub-art-20261113"
root.mkdir(parents=True, exist_ok=True)
sheet = Image.open(args.source).convert("RGBA")
names = (["mixed", "rotation", "projection", "net", "viewpoint", "same",
          "assembly", "memory", "formation", "section", "missing", "oblique"]
         if args.modes else ["words-hub", "hearing-hub"])
cols, rows = (3, 4) if args.modes else (2, 1)
shutil.copy2(args.source, root / ("mental-mode-sheet.png" if args.modes else "hub-pair-sheet.png"))
folder = root / ("mental-modes" if args.modes else "extra")
folder.mkdir(exist_ok=True)
outputs = {}
for i, name in enumerate(names):
    x, y = i % cols, i // cols
    bounds = (round(x * sheet.width / cols), round(y * sheet.height / rows),
              round((x + 1) * sheet.width / cols), round((y + 1) * sheet.height / rows))
    cell = sheet.crop(bounds)
    # Remove only transparent gutter. Preserve faint antialiased lighting.
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"Empty sprite {name}")
    content = cell.crop(bbox)
    edge = max(content.size)
    canvas = Image.new("RGBA", (edge, edge))
    canvas.alpha_composite(content, ((edge - content.width) // 2, (edge - content.height) // 2))
    canvas.thumbnail((448, 448), Image.Resampling.LANCZOS)
    final = Image.new("RGBA", (512, 512))
    final.alpha_composite(canvas, ((512-canvas.width)//2, (512-canvas.height)//2))
    png, webp = folder / f"{name}.png", folder / f"{name}.webp"
    final.save(png)
    final.resize((256, 256), Image.Resampling.LANCZOS).save(webp, quality=92, method=6)
    outputs[name] = {"png": str(png), "webp": str(webp), "cell": bounds}
if not args.modes:
    extras = {f"/games/{name}": {"light": item["webp"], "dark": item["webp"],
               "original": str(root / "hub-pair-sheet.png")} for name, item in outputs.items()}
    (root / "extra-art.json").write_text(json.dumps(extras, ensure_ascii=False, indent=2) + "\n")
(root / ("mental-mode-cuts.json" if args.modes else "hub-pair-cuts.json")).write_text(
    json.dumps(outputs, ensure_ascii=False, indent=2) + "\n")
print(f"Cut {len(outputs)} sprites; originals retained at {root}")
