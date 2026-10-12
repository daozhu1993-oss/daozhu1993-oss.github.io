import os
import sys
import subprocess
import urllib.request
import ssl

ctx = ssl._create_unverified_context()

SECTIONS = [
    {
        "id": 0,
        "name": "start",
        "url": "https://upload.wikimedia.org/wikipedia/commons/5/59/Wang_Ximeng_-_A_Thousand_Li_of_River_%28Start%29.jpg"
    },
    {
        "id": 1,
        "name": "river1",
        "url": "https://upload.wikimedia.org/wikipedia/commons/b/b8/Wang_Ximeng_-_A_Thousand_Li_of_River1.jpg"
    },
    {
        "id": 2,
        "name": "middle_waterfalls",
        "url": "https://upload.wikimedia.org/wikipedia/commons/0/0d/1c_Wang_Ximeng._A_Thousand_Li_of_Rivers_and_Mountains._%2851%2C3x1191%2C5cm%291113._%28section%29_Palace_museum%2C_Beijing.jpg"
    },
    {
        "id": 3,
        "name": "bridge",
        "url": "https://upload.wikimedia.org/wikipedia/commons/4/43/Wang_Ximeng_-_A_Thousand_Li_of_River_%28Bridge%29.jpg"
    },
    {
        "id": 4,
        "name": "peaks",
        "url": "https://upload.wikimedia.org/wikipedia/commons/f/fb/1e_Wang_Ximeng._A_Thousand_Li_of_Rivers_and_Mountains._%2851%2C3x1191%2C5cm%291113._%28section%29_Palace_museum%2C_Beijing.jpg"
    },
    {
        "id": 5,
        "name": "end_colophon",
        "url": "https://upload.wikimedia.org/wikipedia/commons/f/f4/Wang_Ximeng_-_A_Thousand_Li_of_River_%28End%29.jpg"
    }
]

dest_dir = "/Users/gx/.gemini/antigravity/scratch/qianli-shanhai/assets/painting"
os.makedirs(dest_dir, exist_ok=True)

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
}

import time

for item in SECTIONS:
    raw_path = os.path.join(dest_dir, f"section_{item['id']}_raw.jpg")
    opt_path = os.path.join(dest_dir, f"section_{item['id']}.jpg")
    
    if not os.path.exists(raw_path):
        print(f"Downloading Section {item['id']} ({item['name']})...")
        time.sleep(3)
        req = urllib.request.Request(item['url'], headers=headers)
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
                data = resp.read()
                with open(raw_path, 'wb') as f:
                    f.write(data)
            print(f"  Downloaded {len(data) / 1024 / 1024:.2f} MB")
        except Exception as e:
            print(f"  Error downloading section {item['id']}: {e}")
            continue
    else:
        print(f"Section {item['id']} raw already exists.")

    # Optimize using sips to 900px height for ultra-crisp web rendering & fast loading
    if not os.path.exists(opt_path) and os.path.exists(raw_path):
        print(f"Optimizing Section {item['id']} with sips...")
        subprocess.run(["cp", raw_path, opt_path])
        subprocess.run(["sips", "--resampleHeight", "900", opt_path], stdout=subprocess.DEVNULL)
        size = os.path.getsize(opt_path)
        print(f"  Optimized {opt_path} to {size / 1024:.1f} KB")

print("All sections processed successfully!")
