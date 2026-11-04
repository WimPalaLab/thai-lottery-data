"""อ่านและตรวจ data/thai_lottery.csv แบบเข้มงวด (ใช้ทั้งตอนสร้างเว็บและใน GitHub Actions)

ทุกค่าที่จะไปแสดงบนเว็บต้องผ่าน regex ที่นี่ก่อน ถ้ามีค่าแปลก ๆ (เช่น ถูกแก้ไฟล์ใส่ <script>)
การสร้างเว็บจะหยุดทันทีและไม่ deploy
ใช้ไลบรารีมาตรฐานของ Python เท่านั้น"""
import csv
import datetime
import re

HEADER = ["draw_date", "draw_date_th", "source", "first", "first_special", "near_first",
          "second", "third", "fourth", "fifth", "front3", "back3", "last2",
          "prizes_2_to_5_available", "reconciliation_notes", "source_url"]

PRIZES = ["first", "near_first", "second", "third", "fourth", "fifth", "front3", "back3", "last2"]
DIGITS = {"front3": 3, "back3": 3, "last2": 2}  # ที่เหลือ 6 หลัก
PRIZES_2_TO_5 = ["near_first", "second", "third", "fourth", "fifth"]

THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
               "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]

E2_START = "2000-08-01"   # เริ่มมีรางวัลข้างเคียงและรางวัลที่ 2–5 ในข้อมูล
E3_START = "2015-09-01"   # เริ่มมีเลขหน้า 3 ตัว, เลขท้าย 3 ตัวเหลือ 2 หมายเลข
OFFICIAL_START = "2016-11-16"
FIRST_SPECIAL_RANGE = ("2004-06-01", "2011-05-16")

# งวดที่ออกรางวัลจริงคนละวันกับวันที่งวด
ACTUAL_DRAW_DATES = {"2020-04-01": "2020-05-16"}
# ช่วงห่างระหว่างงวดที่ยาวผิดปกติแต่ตรวจแล้วว่าถูกต้อง (วันที่งวดก่อนช่องว่าง)
KNOWN_LONG_GAPS = {"2020-04-01"}
MAX_GAP_DAYS = 20

SOURCES = {
    "glo.or.th API": "official",
    "lotto.join.in.th + news.sanook.com": "cross-checked",
    "lotto.join.in.th": "single-source",
    "news.sanook.com": "single-source",
}

RE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RE_FIRST_SPECIAL = re.compile(r"^กลุ่ม\d:ชุด\d{1,3}(\|กลุ่ม\d:ชุด\d{1,3})*$")
RE_NOTES = re.compile(r"^[฀-๿A-Za-z0-9 :+;.,()_\-]*$")
RE_URL = re.compile(
    r"^(https://www\.glo\.or\.th/api/checking/getLotteryResult"
    r"|http://lotto\.join\.in\.th/result\.php\?myselect=\d{6}"
    r"( https://news\.sanook\.com/lotto/check/\d{8}/)?)$")


class DataError(Exception):
    pass


def era(date):
    if date < E2_START:
        return "E1"
    if date < E3_START:
        return "E2"
    return "E3"


def expected_counts(date, prizes_2_to_5=True):
    """จำนวนหมายเลขที่ควรมีในแต่ละรางวัลของงวดนั้น"""
    e = {"first": 1, "near_first": 2, "second": 5, "third": 10, "fourth": 50, "fifth": 100,
         "last2": 1}
    if date >= E3_START:
        e.update(front3=2, back3=2)
    else:
        e.update(front3=0, back3=4)
    if not prizes_2_to_5:
        e.update({k: 0 for k in PRIZES_2_TO_5})
    return e


def neighbours(first):
    f = int(first)
    return sorted(f"{(f + d) % 1000000:06d}" for d in (-1, 1))


def thai_date(date):
    y, m, d = (int(x) for x in date.split("-"))
    return f"{d} {THAI_MONTHS[m - 1]} {y + 543}"


def split(value):
    return value.split("|") if value else []


def read_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
    return header, rows


def validate(header, rows):
    """คืน (errors, warnings) เป็นรายการข้อความ; errors ต้องว่างจึงจะสร้างเว็บได้"""
    errors, warnings = [], []
    if header != HEADER:
        return [f"header ไม่ตรง: {header}"], warnings

    seen = set()
    prev = None
    for i, row in enumerate(rows, start=2):
        where = f"แถว {i}"
        if len(row) != len(HEADER):
            errors.append(f"{where}: มี {len(row)} คอลัมน์ (ต้องมี {len(HEADER)})")
            continue
        r = dict(zip(HEADER, row))
        date = r["draw_date"]
        if not RE_DATE.match(date):
            errors.append(f"{where}: draw_date ผิดรูปแบบ")
            continue
        try:
            day = datetime.date.fromisoformat(date)
        except ValueError:
            errors.append(f"{where}: draw_date ไม่ใช่วันที่จริง")
            continue
        where = f"{where} ({date})"
        if date in seen:
            errors.append(f"{where}: วันที่ซ้ำ")
        seen.add(date)
        if prev is not None:
            if date <= prev[0]:
                errors.append(f"{where}: ไม่ได้เรียงตามวันที่")
            elif (day - prev[1]).days > MAX_GAP_DAYS and prev[0] not in KNOWN_LONG_GAPS:
                warnings.append(f"{where}: ห่างจากงวดก่อน {(day - prev[1]).days} วัน")
        prev = (date, day)

        if r["draw_date_th"] != thai_date(date):
            errors.append(f"{where}: draw_date_th ไม่ตรงกับ draw_date")
        if r["source"] not in SOURCES:
            errors.append(f"{where}: source ไม่รู้จัก")
        if r["prizes_2_to_5_available"] not in ("yes", "no"):
            errors.append(f"{where}: prizes_2_to_5_available ต้องเป็น yes/no")
            continue
        avail = r["prizes_2_to_5_available"] == "yes"
        if not avail and date >= E2_START:
            errors.append(f"{where}: ไม่มีรางวัลที่ 2–5 ทั้งที่อยู่หลัง {E2_START}")

        exp = expected_counts(date, avail)
        for k in PRIZES:
            vals = split(r[k])
            n = DIGITS.get(k, 6)
            if len(vals) != exp[k]:
                errors.append(f"{where}: {k} มี {len(vals)} หมายเลข (ต้องมี {exp[k]})")
            if not all(len(v) == n and v.isascii() and v.isdigit() for v in vals):
                errors.append(f"{where}: {k} ต้องเป็นตัวเลข {n} หลัก")
            elif vals != sorted(vals):
                errors.append(f"{where}: {k} ไม่ได้เรียงจากน้อยไปมาก")
        if avail and len(split(r["first"])) == 1 and r["first"].isdigit() \
                and split(r["near_first"]) != neighbours(r["first"]):
            errors.append(f"{where}: near_first ไม่ใช่รางวัลที่ 1 ±1")

        fs = r["first_special"]
        if fs and not (RE_FIRST_SPECIAL.match(fs) and FIRST_SPECIAL_RANGE[0] <= date <= FIRST_SPECIAL_RANGE[1]):
            errors.append(f"{where}: first_special ผิดรูปแบบหรืออยู่นอกช่วง")
        if not RE_NOTES.match(r["reconciliation_notes"]) or len(r["reconciliation_notes"]) > 400:
            errors.append(f"{where}: reconciliation_notes มีอักขระที่ไม่อนุญาต")
        if not RE_URL.match(r["source_url"]):
            errors.append(f"{where}: source_url ไม่อยู่ในรายการที่อนุญาต")
    return errors, warnings


def load(path):
    """อ่าน CSV แล้วคืนรายการงวด (dict) ที่ผ่านการตรวจ; ถ้ามี error จะ raise DataError"""
    header, rows = read_rows(path)
    errors, warnings = validate(header, rows)
    if errors:
        raise DataError("\n".join(errors[:50]))
    draws = []
    for row in rows:
        r = dict(zip(HEADER, row))
        date = r["draw_date"]
        d = {
            "product": "L6",
            "draw_date": date,
            "draw_date_th": r["draw_date_th"],
            "era": era(date),
            "trust_level": SOURCES[r["source"]],
            "source": r["source"],
            "source_url": r["source_url"],
            "prizes": {k: split(r[k]) for k in PRIZES},
            "prizes_2_to_5_available": r["prizes_2_to_5_available"] == "yes",
            "first_special": r["first_special"] or None,
            "reconciliation_notes": r["reconciliation_notes"] or None,
        }
        if date in ACTUAL_DRAW_DATES:
            d["actual_draw_date"] = ACTUAL_DRAW_DATES[date]
            d["actual_draw_date_th"] = thai_date(ACTUAL_DRAW_DATES[date])
        draws.append(d)
    return draws, warnings
