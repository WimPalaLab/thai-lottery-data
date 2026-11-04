"""ดาวน์โหลดหน้าผลสลากจาก lotto.join.in.th ปี พ.ศ. 2538-2559 (เก็บไฟล์ HTML ไว้ใน raw/join)
robots.txt ของเว็บอนุญาตทุก user-agent; เว้นระยะระหว่างคำขอเพื่อไม่ให้รบกวนเซิร์ฟเวอร์"""
import os
import re
import sys
import time
import urllib.request

OUT = sys.argv[1] if len(sys.argv) > 1 else "raw/join"
DELAY = 1.5
BASE = "http://lotto.join.in.th"


def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except Exception as e:
            print(f"  retry {attempt + 1}: {url} ({e})", flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(url)


def main():
    os.makedirs(OUT, exist_ok=True)
    ids = []
    for year in range(2538, 2560):
        path = os.path.join(OUT, f"year_{year}.html")
        if not os.path.exists(path):
            open(path, "wb").write(get(f"{BASE}/year.php?num={year}"))
            time.sleep(DELAY)
        html = open(path, encoding="utf-8", errors="replace").read()
        yy = str(year)[2:]
        found = sorted(set(m for m in re.findall(r"myselect=(\d{6})", html) if m.startswith(yy)))
        print(f"{year}: {len(found)} draws", flush=True)
        ids += found
    for i, d in enumerate(ids):
        path = os.path.join(OUT, f"{d}.html")
        if os.path.exists(path) and os.path.getsize(path) > 10000:
            continue
        open(path, "wb").write(get(f"{BASE}/result.php?myselect={d}"))
        print(f"[{i + 1}/{len(ids)}] {d}", flush=True)
        time.sleep(DELAY)
    print("done", len(ids))


if __name__ == "__main__":
    main()
