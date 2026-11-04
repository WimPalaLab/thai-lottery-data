"""ดาวน์โหลดหน้าผลสลากจาก news.sanook.com/lotto สำหรับงวด 2550 ถึงก่อน 16 พ.ย. 2559
ใช้เป็นแหล่งที่สองเพื่อตรวจทานและเติมข้อมูลที่ lotto.join.in.th ขาด (robots.txt อนุญาต /lotto/)
ใช้: python fetch_sanook.py <raw_dir>"""
import glob
import os
import sys
import time
import urllib.request

RAW = sys.argv[1] if len(sys.argv) > 1 else "raw"
OUT = os.path.join(RAW, "sanook")
DELAY = 1.5
FIRST, LAST = "2007-01-01", "2016-11-15"


def main():
    os.makedirs(OUT, exist_ok=True)
    dates = set()
    for path in glob.glob(os.path.join(RAW, "join", "[0-9]" * 6 + ".html")):
        c = os.path.basename(path)[:6]
        dates.add(f"{2500 + int(c[:2]) - 543}-{c[2:4]}-{c[4:]}")
    for path in glob.glob(os.path.join(RAW, "github", "vicha", "lottonumbers", "*.txt")):
        dates.add(os.path.basename(path)[:10])
    dates = sorted(d for d in dates if FIRST <= d <= LAST)
    print(f"{len(dates)} draws", flush=True)
    for i, d in enumerate(dates):
        y, m, dd = d.split("-")
        code = f"{dd}{m}{int(y) + 543}"
        path = os.path.join(OUT, f"{code}.html")
        if os.path.exists(path):
            continue
        url = f"https://news.sanook.com/lotto/check/{code}/"
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    final = r.geturl()
                    body = r.read()
                break
            except Exception as e:
                print(f"  retry {attempt + 1}: {url} ({e})", flush=True)
                time.sleep(5 * (attempt + 1))
        else:
            print(f"  FAILED {url}", flush=True)
            continue
        if code not in final:  # ไม่มีหน้างวดนี้ ระบบพากลับหน้าแรก
            print(f"  MISSING {d}", flush=True)
        else:
            open(path, "wb").write(body)
            print(f"[{i + 1}/{len(dates)}] {d}", flush=True)
        time.sleep(DELAY)
    print("done")


if __name__ == "__main__":
    main()
