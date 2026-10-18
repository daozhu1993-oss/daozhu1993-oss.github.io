"""Cut 入景 tiles from the Wikimedia full scan (39974×1600).

The scan is public domain:
File:Wang Ximeng. A Thousand Li of Rivers and Mountains.
(Complete, 51,3x1191,5 cm). 1113. Palace museum, Beijing.jpg

Pass the downloaded file as the first argument. Tiles cover the six beast
neighbourhoods only, so roam can keep the lighter 900px set.
"""
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "tiles" / "lod2"
OUT.mkdir(parents=True, exist_ok=True)
MANIFEST = ROOT / "assets" / "tiles" / "manifest.json"

# Normalised x spans, widened by about one 入景 screen.
RANGES = [
    (0.205, 0.320),
    (0.345, 0.520),
    (0.630, 0.870),
]

def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/qianli-commons.jpg")
    image = Image.open(source).convert("RGB")
    width, height = image.size
    tile_w = 1024
    tiles = []
    index = 0
    cursor = 0
    while cursor < width:
        end = min(width, cursor + tile_w)
        nx0, nx1 = cursor / width, end / width
        if any(nx1 > a and nx0 < b for a, b in RANGES):
            name = f"{index:03d}.jpg"
            image.crop((cursor, 0, end, height)).save(
                OUT / name, quality=80, optimize=True, progressive=True,
            )
            tiles.append({
                "i": index,
                "x": cursor,
                "w": end - cursor,
                "h": height,
                "file": f"lod2/{name}",
            })
            index += 1
        cursor = end
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["lod2Width"] = width
    manifest["lod2Height"] = height
    manifest["lod2"] = tiles
    manifest["lod2Source"] = (
        "Wikimedia Commons public-domain scan, 39974×1600, "
        "File:Wang Ximeng. A Thousand Li of Rivers and Mountains. "
        "(Complete, 51,3x1191,5 cm). 1113. Palace museum, Beijing.jpg. "
        "Tiles cover the six beast neighbourhoods for 入景."
    )
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(tiles)} lod2 tiles from {width}x{height}")

if __name__ == "__main__":
    main()
