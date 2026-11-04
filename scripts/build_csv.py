"""รวมผลสลากเป็น CSV เดียว
- งวดก่อน 2016-11-16: แยกจากหน้า HTML ของ lotto.join.in.th (raw/join)
- งวดตั้งแต่ 2016-11-16: ใช้ JSON จาก API ของกองสลากฯ เท่านั้น (raw/glo)
รางวัลที่มีหลายหมายเลขคั่นด้วย |  ช่องที่งวดนั้นไม่มีรางวัลหรือไม่มีข้อมูลเว้นว่าง
ใช้: python build_csv.py <raw_dir> <out_csv> <issues_txt>"""
import csv
import glob
import html as htmllib
import json
import os
import re
import sys

GLO_START = "2016-11-16"
GLO_NOTES = {"2020-04-01": "งวด 1 เม.ย. 2563 เลื่อนออกรางวัลจริงวันที่ 16 พ.ค. 2563 (COVID-19); API ใช้วันที่งวดเดิม"}
PRIZES = ["first", "first_special", "near_first", "second", "third", "fourth", "fifth", "front3", "back3", "last2"]
GLO_KEYS = {"first": "first", "near1": "near_first", "second": "second", "third": "third",
            "fourth": "fourth", "fifth": "fifth", "last3f": "front3", "last3b": "back3", "last2": "last2"}
THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม",
               "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]

# ป้ายรางวัลบนหน้า join.in.th -> (คอลัมน์, จำนวนหลักของเลข)
LABELS = [
    (r"รางวัลข้างเคียงรางวัลที่\s*1", "near_first", 6),
    (r"รางวัลที่หนึ่ง|รางวัลที่\s*1(?!\d)", "first", 6),
    (r"รางวัลที่\s*2", "second", 6),
    (r"รางวัลที่\s*3", "third", 6),
    (r"รางวัลที่\s*4", "fourth", 6),
    (r"รางวัลที่\s*5", "fifth", 6),
    (r"เลขหน้า\s*3\s*ตัว", "front3", 3),
    (r"เลขท้าย\s*3\s*ตัว", "back3", 3),
    (r"เลขท้าย\s*2\s*ตัว", "last2", 2),
]
TOKEN = re.compile("|".join(f"(?P<L{i}>{p})" for i, (p, _, _) in enumerate(LABELS)) + r"|(?<![\d,./])(?P<num>\d{2,6})(?![\d,./])")
PRICE = re.compile(r"(?:มี\s*\d+\s*)?(?:\d+\s*(?=รางวัลๆ))?รางวัลๆ?ละ\s*[\d,.]+\s*(?:หมื่น|แสน|ล้าน)?\s*บาท")
# จำนวนหมายเลขของแต่ละรางวัล ใช้แบ่งเลขเมื่อหน้าเว็บวางป้ายหลายรางวัลติดกันก่อนตัวเลข
CAPACITY = {"first": 1, "near_first": 2, "second": 5, "third": 10, "fourth": 50, "fifth": 100,
            "front3": 2, "back3": 4, "last2": 1}


def parse_join(path):
    html = open(path, encoding="utf-8", errors="replace").read()
    text = htmllib.unescape(re.sub(r"<[^>]+>", " ", html))
    text = re.sub(r"\s+", " ", text)
    start = re.search(r"รางวัลที่หนึ่ง|รางวัลที่ 1 รางวัลละ|ผลหวย รางวัลที่ 1", text)
    end = text.find("ชื่อเรื่อง", start.start() if start else 0)
    if not start or end < 0:
        return None
    region = text[start.start():end]
    out = {k: [] for k in PRIZES}
    # รางวัลที่ 1 พิเศษ (มีบางงวด): เลขเดียวกับรางวัลที่ 1 แต่ระบุกลุ่มและชุดที่ถูกรางวัล
    special = re.search(r"รางวัลที่\s*(?:1|หนึ่ง)\s*พิเศษ(.*?)(?=รางวัลข้างเคียง|รางวัลที่ 2|$)", region)
    if special:
        for part in re.split(r"กลุ่มที่", special.group(1))[1:]:
            g = re.match(r"\s*(\d+)", part)
            s = re.search(r"ชุดที่\s*(\d+)", part)
            if g and s:  # บางหน้าไม่ระบุเลขชุด จึงข้ามไป
                out["first_special"].append(f"กลุ่ม{g.group(1)}:ชุด{s.group(1)}")
        region = region[:special.start()] + " " + region[special.end():]
    out.update({k: v for k, v in parse_text(region).items() if k != "first_special"})
    return out


def parse_sanook(path):
    """หน้า Sanook มีผลรางวัลเป็นข้อความล้วนใน articleBody ของ JSON-LD"""
    html = open(path, encoding="utf-8", errors="replace").read()
    m = re.search(r'"articleBody":\s*("(?:[^"\\]|\\.)*")', html)
    text = re.sub(r"\s+", " ", htmllib.unescape(json.loads(m.group(1)))) if m else ""
    if "รางวัลที่ 1" not in text:
        # บางหน้า articleBody เป็นแค่ "รอผลสลากกินแบ่งรัฐบาล" แต่ผลอยู่ในเนื้อหน้า (มีโค้ดโฆษณาคั่นระหว่างรางวัล)
        body = re.sub(r"<script\b.*?</script>", " ", html, flags=re.S)
        body = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", body)))
        start = body.find("รางวัลที่ 1 ")
        if start < 0:
            return None
        end = body.find("ตรวจหวยย้อนหลัง", start)
        text = body[start:end if end > 0 else None]
        text = re.sub(r"รางวัลที่\s*(?:1|หนึ่ง)\s*พิเศษ.*?(?=รางวัลข้างเคียง)", " ", text)
    # งวดเก่ายังไม่มีเลขหน้า 3 ตัว Sanook แสดงเป็น xxx; ตัดทิ้งพร้อมป้ายเพื่อไม่ให้เลขท้าย 3 ตัวถูกแบ่งผิดช่อง
    text = re.sub(r"รางวัลเลขหน้า 3 ตัว.{0,60}?บาท\s*(?:x{3}\s*)+", " ", text)
    start = text.find("รางวัลที่ 1")
    return parse_text(text[start:]) if start >= 0 else None


def parse_text(region):
    out = {k: [] for k in PRIZES}
    region = PRICE.sub(" ", region)
    queues = {}  # จำนวนหลัก -> ป้ายรางวัลที่รอตัวเลขอยู่ ตามลำดับที่ปรากฏ
    after_number = False
    for m in TOKEN.finditer(region):
        if m.group("num"):
            n = m.group("num")
            q = queues.get(len(n))
            if not q:
                continue
            while len(q) > 1 and len(out[q[0]]) >= CAPACITY[q[0]]:
                q.pop(0)
            out[q[0]].append(n)
            after_number = True
        else:
            if after_number:
                queues = {}
                after_number = False
            _, col, digits = LABELS[int(m.lastgroup[1:])]
            queues.setdefault(digits, []).append(col)
    return out


def parse_glo(path):
    d = json.load(open(path, encoding="utf-8"))
    out = {k: [] for k in PRIZES}
    for key, col in GLO_KEYS.items():
        nums = (d.get("data") or {}).get(key, {}).get("number") or []
        out[col] = sorted(n["value"] for n in nums)
    extra = {k: v for k, v in (d.get("data") or {}).items() if k not in GLO_KEYS and v.get("number")}
    return d["date"], out, extra


def expected(date):
    """จำนวนหมายเลขที่ควรมีในแต่ละรางวัล ตามโครงสร้างรางวัลของช่วงเวลานั้น"""
    e = {"first": 1, "near_first": 2, "second": 5, "third": 10, "fourth": 50, "fifth": 100, "last2": 1}
    if date >= "2015-09-01":
        e.update(front3=2, back3=2)
    else:
        e.update(front3=0, back3=4)
    return e


def join_date(code):
    yy, mm, dd = int(code[:2]), int(code[2:4]), int(code[4:])
    be = 2500 + yy
    return f"{be - 543:04d}-{mm:02d}-{dd:02d}"


def load_vicha(d):
    names = {"FIRST": "first", "NEAR_FIRST": "near_first", "SECOND": "second", "THIRD": "third",
             "FOURTH": "fourth", "FIFTH": "fifth", "THREE_FIRST": "front3", "THREE_LAST": "back3",
             "THREE": "back3", "TWO": "last2"}
    out = {}
    for path in glob.glob(os.path.join(d, "*.txt")):
        rec = {k: [] for k in PRIZES}
        for line in open(path, encoding="utf-8").read().splitlines()[1:]:
            parts = line.split()
            if parts and parts[0] in names:
                rec[names[parts[0]]] += parts[1:]
        out[os.path.basename(path)[:10]] = rec
    return out


def load_heart(path):
    names = {"prize_1st": "first", "nearby_1st": "near_first", "prize_2nd": "second", "prize_3rd": "third",
             "prize_4th": "fourth", "prize_5th": "fifth", "prize_pre_3digit": "front3",
             "prize_sub_3digits": "back3", "prize_2digits": "last2"}
    out = {}
    for row in csv.DictReader(open(path, encoding="utf-8")):
        if row["date"]:
            out[row["date"]] = {k: re.findall(r"\d+", row.get(c) or "") for c, k in names.items()}
    return out


def neighbours(first):
    if len(first) != 1:
        return None
    f = int(first[0])
    return sorted(f"{(f + d) % 1000000:06d}" for d in (-1, 1))


def ok(k, vals, date):
    return len(vals) == expected(date)[k] and all(len(v) == {"front3": 3, "back3": 3, "last2": 2}.get(k, 6) for v in vals)


def merge(date, join, sanook, refs, log):
    """รวมผลของงวด 2550-2559 จาก join.in.th และ Sanook; ถ้าไม่ตรงกันใช้เสียงข้างมากร่วมกับ GitHub สองชุด"""
    out = {k: [] for k in PRIZES}
    out["first_special"] = (join or {}).get("first_special", [])
    notes = []
    for k in PRIZES:
        if k == "first_special" or expected(date)[k] == 0:
            continue
        j = sorted((join or {}).get(k, []))
        s = sorted((sanook or {}).get(k, []))
        if j == s and ok(k, j, date) and (k != "near_first" or j == neighbours(out["first"])):
            out[k] = j
            continue
        cands = {"join": j, "sanook": s}
        for name, data in refs.items():
            if date in data:
                cands[name] = sorted(data[date][k])
        votes = {}
        for name, v in cands.items():
            if ok(k, v, date) and (k != "near_first" or v == neighbours(out["first"])):
                votes.setdefault(tuple(v), []).append(name)
        if not votes and k == "near_first" and len(out["first"]) == 1:
            # รางวัลข้างเคียงคือรางวัลที่ 1 บวก/ลบ 1 ตามนิยาม; ใช้เมื่อทุกแหล่งพิมพ์ผิดหรือไม่ครบ
            out[k] = neighbours(out["first"])
            log.append(f"{date} {k}: derived from first prize {out['first'][0]} (sources: "
                       + "; ".join(f"{n}={v}" for n, v in cands.items()) + ")")
            notes.append(f"{k}:derived_from_first")
            continue
        if not votes:
            out[k] = j or s
            log.append(f"{date} {k}: no source has a complete value; kept {'join' if j else 'sanook'} ({len(out[k])} numbers)")
            notes.append(f"{k}:incomplete")
            continue
        best = max(votes.items(), key=lambda kv: (len(kv[1]), "sanook" in kv[1], "join" in kv[1]))
        out[k] = list(best[0])
        chosen = "+".join(best[1])
        detail = []
        for name in ("join", "sanook"):
            v = cands[name]
            if tuple(v) != best[0]:
                miss = sorted(set(best[0]) - set(v))
                extra = sorted(set(v) - set(best[0]))
                detail.append(f"{name} differs (has {extra or '-'} / lacks {miss[:10] or '-'}{'...' if len(miss) > 10 else ''}, {len(v)} numbers)")
        log.append(f"{date} {k}: used {chosen}; " + "; ".join(detail))
        notes.append(f"{k}:{chosen}")
    return out, notes


def main():
    raw, out_csv, issues_txt, merge_log = sys.argv[1:5]
    rows, issues, mlog = {}, [], []
    joins, sanooks = {}, {}
    for path in sorted(glob.glob(os.path.join(raw, "join", "[0-9]" * 6 + ".html"))):
        code = os.path.basename(path)[:6]
        date = join_date(code)
        if date < GLO_START:
            joins[date] = (code, parse_join(path))
    for path in sorted(glob.glob(os.path.join(raw, "sanook", "*.html"))):
        c = os.path.basename(path)[:8]
        date = f"{int(c[4:]) - 543}-{c[2:4]}-{c[:2]}"
        if date < GLO_START:
            sanooks[date] = parse_sanook(path)
    refs = {"vicha": load_vicha(os.path.join(raw, "github", "vicha", "lottonumbers")),
            "heart": load_heart(os.path.join(raw, "github", "heart_lotto.csv"))}
    for date in sorted(set(joins) | set(sanooks)):
        code, j = joins.get(date, (None, None))
        s = sanooks.get(date)
        jurl = f"http://lotto.join.in.th/result.php?myselect={code}" if code else ""
        y, m, d = date.split("-")
        surl = f"https://news.sanook.com/lotto/check/{d}{m}{int(y) + 543}/" if s else ""
        if not s:
            if j is None:
                issues.append(f"{date}: no usable data in any source")
                continue
            rows[date] = ("lotto.join.in.th", jurl, j, "")
            continue
        p, notes = merge(date, j, s, refs, mlog)
        srcs = ["lotto.join.in.th"] * bool(j) + ["news.sanook.com"]
        rows[date] = (" + ".join(srcs), " ".join(u for u in (jurl, surl) if u), p, "; ".join(notes))
    for path in sorted(glob.glob(os.path.join(raw, "glo", "*-*-*.json"))):
        date, p, extra = parse_glo(path)
        if extra:
            issues.append(f"{date} glo: extra prize keys {sorted(extra)}")
        rows[date] = ("glo.or.th API", "https://www.glo.or.th/api/checking/getLotteryResult", p, GLO_NOTES.get(date, ""))

    with open(out_csv, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["draw_date", "draw_date_th", "source"] + PRIZES
                   + ["prizes_2_to_5_available", "reconciliation_notes", "source_url"])
        for date in sorted(rows):
            src, url, p, note = rows[date]
            y, m, d = map(int, date.split("-"))
            full = bool(p["second"])
            exp = expected(date)
            for k in PRIZES:
                if k == "first_special":
                    continue
                n = len(p[k])
                if full or k in ("first", "front3", "back3", "last2"):
                    if n != exp[k]:
                        issues.append(f"{date} {src}: {k} has {n} numbers, expected {exp[k]}")
                elif n:
                    issues.append(f"{date} {src}: {k} has {n} numbers but prizes 2-5 missing")
                for v in p[k]:
                    if len(v) != {"front3": 3, "back3": 3, "last2": 2}.get(k, 6):
                        issues.append(f"{date} {src}: {k} bad value {v}")
            if full and p["first"] and p["near_first"]:
                f1 = int(p["first"][0])
                if sorted(int(x) for x in p["near_first"]) != sorted([(f1 - 1) % 1000000, (f1 + 1) % 1000000]):
                    issues.append(f"{date} {src}: near_first {p['near_first']} not adjacent to {p['first']}")
            w.writerow([date, f"{d} {THAI_MONTHS[m - 1]} {y + 543}", src]
                       + ["|".join(sorted(p[k]) if k != "first_special" else p[k]) for k in PRIZES]
                       + ["yes" if full else "no", note, url])
    open(issues_txt, "w", encoding="utf-8").write("\n".join(issues) + "\n")
    open(merge_log, "w", encoding="utf-8").write("\n".join(mlog) + "\n")
    print(f"{len(rows)} draws -> {out_csv}; {len(issues)} issues; {len(mlog)} reconciliation decisions")


if __name__ == "__main__":
    main()
