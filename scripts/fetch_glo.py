"""ดาวน์โหลดผลสลากจาก API ของสำนักงานสลากกินแบ่งรัฐบาล (glo.or.th) ตั้งแต่ 16 พ.ย. 2559 (2016-11-16)
เก็บ JSON ดิบของแต่ละงวดไว้ใน raw/glo/YYYY-MM-DD.json"""
import datetime
import json
import os
import sys
import time
import urllib.request

OUT = sys.argv[1] if len(sys.argv) > 1 else "raw/glo"
START = "2016-11-16"
DELAY = 1.0
API = "https://www.glo.or.th/api"


def post(path, body):
    data = json.dumps(body).encode()
    for attempt in range(5):
        try:
            req = urllib.request.Request(f"{API}/{path}", data=data,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print(f"  retry {attempt + 1}: {path} {body} ({e})", flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"{path} {body}")


def main():
    os.makedirs(OUT, exist_ok=True)
    dates = set()
    for year in range(2016, datetime.date.today().year + 1):
        res = post("lottery/getPeriodsByYear", {"year": str(year), "type": "CHECKED"})
        periods = (res.get("response") or {}).get("result") or []
        dates |= {p["date"] for p in periods if p["date"] >= START}
        time.sleep(DELAY)
    dates = sorted(dates)
    print(f"{len(dates)} draws {dates[0]} .. {dates[-1]}", flush=True)
    json.dump(dates, open(os.path.join(OUT, "_dates.json"), "w"))
    for i, d in enumerate(dates):
        path = os.path.join(OUT, f"{d}.json")
        if os.path.exists(path):
            continue
        y, m, dd = d.split("-")
        res = post("checking/getLotteryResult", {"date": dd, "month": m, "year": y})
        result = ((res.get("response") or {}).get("result"))
        if not result:
            print(f"  EMPTY {d}", flush=True)
            continue
        json.dump(result, open(path, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"[{i + 1}/{len(dates)}] {d}", flush=True)
        time.sleep(DELAY)
    print("done")


if __name__ == "__main__":
    main()
