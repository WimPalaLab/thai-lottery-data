"""เทียบ CSV ที่สร้างได้กับข้อมูลบน GitHub สองชุด
- vicha-w/thai-lotto-archive (raw/github/vicha/lottonumbers/*.txt)
- heart/Data-Set-Thai-Lotto (raw/github/heart_lotto.csv)
ใช้: python crosscheck.py <thai_lottery_csv> <raw_github_dir> <report_txt>"""
import ast
import csv
import glob
import os
import sys
from collections import Counter

PRIZES = ["first", "near_first", "second", "third", "fourth", "fifth", "front3", "back3", "last2"]
VICHA = {"FIRST": "first", "NEAR_FIRST": "near_first", "SECOND": "second", "THIRD": "third",
         "FOURTH": "fourth", "FIFTH": "fifth", "THREE_FIRST": "front3", "THREE_LAST": "back3",
         "THREE": "back3", "TWO": "last2"}
HEART = {"prize_1st": "first", "nearby_1st": "near_first", "prize_2nd": "second", "prize_3rd": "third",
         "prize_4th": "fourth", "prize_5th": "fifth", "prize_pre_3digit": "front3",
         "prize_sub_3digits": "back3", "prize_2digits": "last2"}


def load_vicha(d):
    out = {}
    for path in glob.glob(os.path.join(d, "*.txt")):
        rec = {k: [] for k in PRIZES}
        for line in open(path, encoding="utf-8").read().splitlines()[1:]:
            parts = line.split()
            if parts and parts[0] in VICHA:
                rec[VICHA[parts[0]]] += parts[1:]
        out[os.path.basename(path)[:10]] = rec
    return out


def load_heart(path):
    out = {}
    for row in csv.DictReader(open(path, encoding="utf-8")):
        rec = {}
        for col, k in HEART.items():
            v = (row.get(col) or "").strip()  # บางแถวของชุดนี้มีคอลัมน์ไม่ครบ
            rec[k] = ast.literal_eval(v) if v.startswith("[") else ([v] if v else [])
        if row["date"]:
            out[row["date"]] = rec
    return out


def compare(name, ours, theirs, lines):
    stats = Counter()
    for date in sorted(set(ours) & set(theirs)):
        o, t = ours[date], theirs[date]
        stats["draws compared"] += 1
        bad = []
        for k in PRIZES:
            if not o[k]:  # ไม่มีข้อมูลรางวัลนี้ในชุดของเรา (เช่น งวดเก่าที่ไม่มีรางวัลที่ 2-5)
                continue
            if sorted(o[k]) != sorted(t[k]):
                bad.append(k)
                stats[f"mismatch {k}"] += 1
        if bad:
            stats["draws with any mismatch"] += 1
            for k in bad:
                oc, tc = Counter(o[k]), Counter(t[k])
                lines.append(f"{name} {date} {k}: only_ours={sorted((oc - tc).elements())} "
                             f"only_theirs={sorted((tc - oc).elements())} (count ours={len(o[k])} theirs={len(t[k])})")
    only_theirs = sorted(set(theirs) - set(ours))
    only_ours = [d for d in sorted(set(ours) - set(theirs)) if min(theirs) <= d <= max(theirs)]
    stats["dates only in theirs"] = len(only_theirs)
    stats["dates only in ours (within their range)"] = len(only_ours)
    if only_theirs:
        lines.append(f"{name} dates only in theirs: {only_theirs}")
    if only_ours:
        lines.append(f"{name} dates only in ours: {only_ours}")
    return stats


def main():
    csv_path, gh, report = sys.argv[1:4]
    ours = {}
    for row in csv.DictReader(open(csv_path, encoding="utf-8-sig")):
        ours[row["draw_date"]] = {k: row[k].split("|") if row[k] else [] for k in PRIZES}
    vicha = load_vicha(os.path.join(gh, "vicha", "lottonumbers"))
    heart = load_heart(os.path.join(gh, "heart_lotto.csv"))
    lines = []
    summary = [f"ours: {len(ours)} draws {min(ours)}..{max(ours)}",
               f"vicha: {len(vicha)} draws {min(vicha)}..{max(vicha)}",
               f"heart: {len(heart)} draws {min(heart)}..{max(heart)}"]
    for name, data in (("vicha", vicha), ("heart", heart)):
        s = compare(name, ours, data, lines)
        summary.append(f"\n[{name}]")
        summary += [f"  {k}: {v}" for k, v in sorted(s.items())]
    open(report, "w", encoding="utf-8").write("\n".join(summary) + "\n\nDETAILS\n" + "\n".join(lines) + "\n")
    print("\n".join(summary))


if __name__ == "__main__":
    main()
