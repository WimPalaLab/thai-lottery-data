"""รายงานตรวจสอบข้อมูล (verified / unverified / missing / conflicting / import errors / อัปเดตล่าสุด)
ไลบรารีมาตรฐานเท่านั้น ใช้ตอนสร้างเว็บ → verification.json

ข้อความจากไฟล์ log ทุกบรรทัดต้องผ่าน regex ก่อนนำไปแสดง ถ้าไม่ผ่านจะถูกข้าม (นับเป็น unparsed)"""
import datetime
import json
import os
import re
from collections import Counter, defaultdict

import lotto_data as L

VERIFIED = {"official", "cross-checked"}
PRIZE_KEYS = {"first", "near_first", "second", "third", "fourth", "fifth", "front3", "back3", "last2"}
RE_RECON = re.compile(r"^(\d{4}-\d{2}-\d{2}) ([a-z_0-9]+): (.{1,600})$")
RE_DETAIL = re.compile(r"^(vicha|heart) (\d{4}-\d{2}-\d{2}) ([a-z_0-9]+): only_ours=\[([0-9x', ]*)\] "
                       r"only_theirs=\[([0-9x', ]*)\] \(count ours=(\d+) theirs=(\d+)\)$")
RE_DATES_ONLY = re.compile(r"^(vicha|heart) dates only in (ours|theirs): \[((?:'\d{4}-\d{2}-\d{2}'(?:, )?)*)\]$")
RE_SAFE_TEXT = re.compile(r"^[A-Za-z0-9 _+\-:;.,()\[\]'/=]*$")
RE_NUM = re.compile(r"^\d{2,6}$")


def _nums(s):
    out = [x.strip().strip("'") for x in s.split(",") if x.strip()]
    return [x for x in out if RE_NUM.match(x)]


def parse_reconciliation(path):
    entries, unparsed = [], 0
    if not os.path.exists(path):
        return entries, unparsed
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            m = RE_RECON.match(line)
            if not m or m.group(2) not in PRIZE_KEYS or not RE_SAFE_TEXT.match(m.group(3)):
                unparsed += 1
                continue
            entries.append({"date": m.group(1), "prize": m.group(2), "note": m.group(3)})
    return entries, unparsed


def parse_crosscheck(path):
    """คืน (รายการที่เลขไม่ตรง, รายการวันที่ที่มีแค่ฝั่งเดียว, จำนวนบรรทัดที่อ่านไม่ได้)"""
    details, dates_only, unparsed = [], [], 0
    if not os.path.exists(path):
        return details, dates_only, unparsed
    in_details = False
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if line == "DETAILS":
                in_details = True
                continue
            if not in_details or not line.strip():
                continue
            m = RE_DATES_ONLY.match(line)
            if m:
                for dt in re.findall(r"\d{4}-\d{2}-\d{2}", m.group(3)):
                    dates_only.append({"dataset": m.group(1), "side": m.group(2), "date": dt})
                continue
            m = RE_DETAIL.match(line)
            if not m or m.group(3) not in PRIZE_KEYS:
                unparsed += 1
                continue
            details.append({"dataset": m.group(1), "date": m.group(2), "prize": m.group(3),
                            "only_ours": _nums(m.group(4)), "only_theirs": _nums(m.group(5)),
                            "count_ours": int(m.group(6)), "count_theirs": int(m.group(7))})
    return details, dates_only, unparsed


def read_import_log(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        log = json.load(f)
    ok = []
    for e in log.get("entries", []):
        if (isinstance(e, dict) and L.RE_DATE.match(str(e.get("draw_date", "")))
                and re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$", str(e.get("retrieved_at", "")))
                and e.get("status") in ("added",)):
            ok.append({"draw_date": e["draw_date"], "retrieved_at": e["retrieved_at"], "status": e["status"]})
    return ok


def month_gaps(draws):
    """เดือนที่จำนวนงวดไม่ใช่ 2 (ปกติออกวันที่ 1 และ 16)"""
    per = Counter(d["draw_date"][:7] for d in draws)
    first = datetime.date.fromisoformat(draws[0]["draw_date"]).replace(day=1)
    last = datetime.date.fromisoformat(draws[-1]["draw_date"]).replace(day=1)
    out, cur = [], first
    while cur <= last:
        key = cur.strftime("%Y-%m")
        c = per.get(key, 0)
        if c != 2 and cur != last:
            out.append({"month": key, "draws": c, "dates": sorted(d["draw_date"] for d in draws if d["draw_date"].startswith(key))})
        cur = (cur + datetime.timedelta(days=32)).replace(day=1)
    return out


def build(draws, warnings, data_dir):
    recon, recon_bad = parse_reconciliation(os.path.join(data_dir, "reconciliation_log.txt"))
    cross, dates_only, cross_bad = parse_crosscheck(os.path.join(data_dir, "github_crosscheck.txt"))
    imports = read_import_log(os.path.join(data_dir, "metadata", "import_log.json"))
    by_date = {d["draw_date"]: d for d in draws}

    by_year = defaultdict(Counter)
    for d in draws:
        by_year[d["draw_date"][:4]][d["trust_level"]] += 1
    trust = Counter(d["trust_level"] for d in draws)

    no_2_5 = [d["draw_date"] for d in draws if not d["prizes_2_to_5_available"]]
    recon_keys = {(e["date"], e["prize"]) for e in recon}
    conflicts = []
    for c in cross:
        d = by_date.get(c["date"])
        if c["dataset"] == "heart":
            continue  # สรุปรวมด้านล่าง (ชุดข้อมูลนี้รางวัลเลื่อนช่องทั้งชุด)
        if d is None:
            res = "ไม่มีงวดนี้ในข้อมูลของเรา"
        elif d["trust_level"] == "official":
            res = "ใช้ค่าจาก API GLO (ทางการ)"
        elif (c["date"], c["prize"]) in recon_keys:
            res = "ตรวจทานแล้ว ดูบันทึกการตรวจทาน"
        else:
            res = "ใช้ค่าจาก lotto.join.in.th + news.sanook.com (ตรงกัน 2 แหล่ง)" if d["trust_level"] == "cross-checked" \
                else "ยังไม่ได้ตรวจทาน"
        conflicts.append({**c, "trust_level": d["trust_level"] if d else None, "resolution": res})
    heart = [c for c in cross if c["dataset"] == "heart"]
    heart_summary = {
        "dataset": "heart", "entries": len(heart), "draws": len({c["date"] for c in heart}),
        "note": "ชุดข้อมูล GitHub นี้มีรางวัลที่ 2–5 เลื่อนช่อง (เช่น รางวัลที่ 3 ของเขาคือรางวัลที่ 2 ของเรา) เกือบทุกงวด จึงไม่ใช้เป็นหลักฐานตัดสิน",
    } if heart else None

    return {
        "summary": {
            "draws": len(draws),
            "verified": sum(trust[t] for t in VERIFIED),
            "unverified": trust["single-source"],
            "by_trust": {t: trust[t] for t in ("official", "cross-checked", "single-source")},
            "first_draw": draws[0]["draw_date"], "latest_draw": draws[-1]["draw_date"],
        },
        "by_year": [{"year": y, **{t: by_year[y][t] for t in ("official", "cross-checked", "single-source")}}
                    for y in sorted(by_year)],
        "missing": {
            "prizes_2_to_5": {"count": len(no_2_5), "from": no_2_5[0] if no_2_5 else None,
                              "to": no_2_5[-1] if no_2_5 else None},
            "month_irregular": month_gaps(draws),
            "known_exceptions": [
                {"date": "2020-04-01", "note": "เลื่อนไปออกรางวัลจริง 16 พ.ค. 2563 (COVID-19) จึงไม่มีงวดเดือน พ.ค. 2563"},
                {"date": "2024-12-30", "note": "ไม่มีงวด 30 ธ.ค. 2567 เลื่อนไปออก 2 ม.ค. 2568"},
            ],
        },
        "conflicts": {
            "reconciled": recon,
            "reconciled_draws": len({e["date"] for e in recon}),
            "external": conflicts,
            "external_summary": heart_summary,
            "date_mismatches": dates_only,
        },
        "import_errors": {
            "validation_warnings": warnings,
            "unparsed_log_lines": recon_bad + cross_bad,
        },
        "imports": imports[-20:],
        "last_import": imports[-1] if imports else None,
    }
