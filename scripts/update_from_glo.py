"""เพิ่มงวดใหม่จาก API ของกองสลากฯ ต่อท้าย data/thai_lottery.csv (ใช้ใน GitHub Actions)
- ดึงรายการงวดของปีล่าสุดใน CSV ถึงปีปัจจุบัน แล้วเพิ่มเฉพาะงวดที่ยังไม่มี
- เก็บ JSON ดิบไว้ใน raw/glo/ เหมือน fetch_glo.py
- ข้ามงวดที่ผลยังไม่ครบ (เช่น ระหว่างถ่ายทอดสด) แล้วรอบถัดไปจะลองใหม่
ใช้: python update_from_glo.py <csv> <raw_glo_dir>"""
import csv
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_csv import GLO_NOTES, PRIZES, THAI_MONTHS, expected, neighbours, parse_glo  # noqa: E402
from fetch_glo import post  # noqa: E402

DIGITS = {"front3": 3, "back3": 3, "last2": 2}


def complete(date, p):
    """ผลของงวดครบทุกรางวัลตามโครงสร้างรางวัลของช่วงนั้นหรือไม่"""
    for k, n in expected(date).items():
        vals = p[k]
        if len(vals) != n or not all(v.isdigit() and len(v) == DIGITS.get(k, 6) for v in vals):
            return False
    return p["near_first"] == neighbours(p["first"])


def main():
    csv_path, raw_dir = sys.argv[1:3]
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
    have = {r[0] for r in rows}
    last = max(have)
    today = datetime.date.today().isoformat()

    dates = set()
    for year in range(int(last[:4]), int(today[:4]) + 1):
        res = post("lottery/getPeriodsByYear", {"year": str(year), "type": "CHECKED"})
        dates |= {p["date"] for p in ((res.get("response") or {}).get("result") or [])}
    new = sorted(d for d in dates if d > last and d <= today)
    print(f"last draw in CSV: {last}; new draws listed by GLO: {new or 'none'}")

    added = []
    for d in new:
        y, m, dd = d.split("-")
        res = post("checking/getLotteryResult", {"date": dd, "month": m, "year": y})
        result = (res.get("response") or {}).get("result")
        if not result or not result.get("data"):
            print(f"{d}: no result yet, skipping")
            continue
        path = os.path.join(raw_dir, f"{d}.json")
        json.dump(result, open(path, "w", encoding="utf-8"), ensure_ascii=False)
        date, p, _ = parse_glo(path)
        if not complete(date, p):
            os.remove(path)
            print(f"{d}: result incomplete, skipping")
            continue
        row = dict(zip(header, [""] * len(header)))
        row.update({k: "|".join(sorted(p[k])) for k in PRIZES if k != "first_special"})
        row.update(draw_date=date, draw_date_th=f"{int(dd)} {THAI_MONTHS[int(m) - 1]} {int(y) + 543}",
                   source="glo.or.th API", prizes_2_to_5_available="yes",
                   reconciliation_notes=GLO_NOTES.get(date, ""),
                   source_url="https://www.glo.or.th/api/checking/getLotteryResult")
        rows.append([row[h] for h in header])
        added.append(date)
        print(f"{d}: added (first prize {p['first'][0]})")

    if added:
        rows.sort(key=lambda r: r[0])
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(rows)
    print(f"added {len(added)} draw(s)")


if __name__ == "__main__":
    main()
