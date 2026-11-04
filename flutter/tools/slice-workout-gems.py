"""Mechanical 2x2 sheet slicing only; original RGBA and manifest are preserved."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

p = argparse.ArgumentParser()
p.add_argument("sheet", type=Path)
p.add_argument("--out", type=Path, default=Path("assets/workout_gems"))
p.add_argument("--evidence", type=Path, default=Path("../design-integration-evidence/compact/gems"))
a = p.parse_args()
im = Image.open(a.sheet).convert("RGBA")
if im.getchannel("A").getextrema()[0] == 255:
    raise SystemExit("Sheet must have real alpha; do not silently remove a black matte")
a.out.mkdir(parents=True, exist_ok=True)
a.evidence.mkdir(parents=True, exist_ok=True)
source = a.evidence / "workout-gem-sheet.png"
source.write_bytes(a.sheet.read_bytes())
items = []
contact = Image.new("RGB", (1024, 548), "#082032")
for i, key in enumerate(["morning", "day", "evening", "night"]):
    x, y = i % 2, i // 2
    cell = (x * im.width // 2, y * im.height // 2,
            (x + 1) * im.width // 2, (y + 1) * im.height // 2)
    crop = im.crop(cell)
    bounds = crop.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
    if bounds is None:
        raise SystemExit(f"Empty cell: {key}")
    sprite = crop.crop(bounds)
    sprite.thumbnail((492, 492), Image.Resampling.LANCZOS)
    final = Image.new("RGBA", (512, 512))
    final.alpha_composite(sprite, ((512 - sprite.width) // 2, (512 - sprite.height) // 2))
    target = a.out / f"{key}.png"
    final.save(target)
    thumb = final.resize((256, 256), Image.Resampling.LANCZOS)
    contact.paste(thumb, (i * 256, 0), thumb)
    contact.paste(thumb, (i * 256, 280), thumb)
    items.append({"id": key, "cell": cell, "alpha_bbox": bounds,
                  "file": str(target), "size": [512, 512],
                  "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
ImageDraw.Draw(contact).text((12, 260), "Same RGBA art; native labels and states are separate", fill="white")
contact.save(a.evidence / "contact.png")
(a.evidence / "manifest.json").write_text(json.dumps({
    "source_sha256": hashlib.sha256(a.sheet.read_bytes()).hexdigest(),
    "grid": [2, 2], "method": "RGBA crop, alpha bbox, centered 512 canvas; no repainting",
    "items": items}, indent=2) + "\n")
print(json.dumps({"source": str(source), "items": [i["file"] for i in items]}))
