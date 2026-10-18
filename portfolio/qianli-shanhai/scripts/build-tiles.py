"""Stitch section_0.jpg–section_5.jpg and cut 1024px-wide roam tiles.

See assets/painting/LAYERS.md. Requires Pillow.
"""
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PAINT = ROOT / "assets" / "painting"
OUT = ROOT / "assets" / "tiles" / "lod1"
OUT.mkdir(parents=True, exist_ok=True)

sections = []
x = 0
for i in range(6):
    image = Image.open(PAINT / f"section_{i}.jpg").convert("RGB")
    sections.append((x, image))
    x += image.width

width, height = x, sections[0][1].height
sheet = Image.new("RGB", (width, height))
for origin, image in sections:
    sheet.paste(image, (origin, 0))

tiles = []
tile_w = 1024
index = 0
cursor = 0
while cursor < width:
    end = min(width, cursor + tile_w)
    name = f"{index:03d}.jpg"
    sheet.crop((cursor, 0, end, height)).save(OUT / name, quality=78, optimize=True, progressive=True)
    tiles.append({"i": index, "x": cursor, "w": end - cursor, "h": height, "file": f"lod1/{name}"})
    index += 1
    cursor = end

manifest = {
    "source": "section_0.jpg–section_5.jpg stitched left to right",
    "width": width,
    "height": height,
    "tileWidth": tile_w,
    "lod1": tiles,
    "overview": "painting/qianli_panorama_hi.jpg",
}
(ROOT / "assets" / "tiles" / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
print(f"{len(tiles)} tiles, {width}x{height}")
