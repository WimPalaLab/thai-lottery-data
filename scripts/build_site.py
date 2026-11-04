"""สร้างเว็บไซต์ static: ตรวจ CSV → คำนวณสถิติ → เขียน JSON → คัดลอกหน้าเว็บ
ใช้: python scripts/build_site.py <csv> <web_dir> <out_dir>
เช่น python scripts/build_site.py data/thai_lottery.csv web _site

ถ้า CSV ไม่ผ่านการตรวจ สคริปต์จะหยุดด้วย exit code 1 และไม่สร้างไฟล์ใด ๆ"""
import datetime
import hashlib
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lotto_data as L  # noqa: E402
import lotto_stats as S  # noqa: E402
import lotto_analysis as A  # noqa: E402
import lotto_randomness as R  # noqa: E402
import lotto_ranking as K  # noqa: E402

SCHEMA_VERSION = 3
# ไฟล์หน้าเว็บที่อนุญาตให้คัดลอก (กันไฟล์แปลก ๆ หลุดขึ้นเว็บ)
ALLOWED_EXT = {".html", ".css", ".js", ".svg", ".ico", ".txt", ".woff2"}
PERIODS = [
    ("all", "ทั้งหมด (ตั้งแต่ 2538)"),
    ("last20y", "20 ปีล่าสุด"),
    ("last10y", "10 ปีล่าสุด"),
    ("last5y", "5 ปีล่าสุด"),
    ("e3", "ตั้งแต่ 1 ก.ย. 2558 (โครงสร้างรางวัลปัจจุบัน)"),
    ("official", "เฉพาะข้อมูลทางการ GLO (ตั้งแต่ 16 พ.ย. 2559)"),
]
YEAR_WINDOWS = {"last5y": 5, "last10y": 10, "last20y": 20}
# ตัวกรองระดับความน่าเชื่อถือ (ใช้ร่วมกับช่วงเวลาได้อิสระ)
TRUSTS = [
    ("all", "ทุกแหล่งข้อมูล"),
    ("checked", "ตรวจทานแล้วหรือทางการ (ตัดข้อมูลแหล่งเดียว)"),
    ("official", "เฉพาะข้อมูลทางการ GLO"),
]
STAT_PRIZES = ("last2", "back3", "front3")
DIGIT_PRIZES = ("first", "front3", "back3", "last2")


def period_draws(draws, key):
    if key == "all":
        return draws
    if key == "e3":
        return [d for d in draws if d["era"] == "E3"]
    if key == "official":
        return [d for d in draws if d["trust_level"] == "official"]
    if key in YEAR_WINDOWS:
        # N ปีย้อนจากงวดล่าสุด (ไม่รวมงวดที่ตรงกับวันเดียวกันเมื่อ N ปีก่อน)
        cut = K.years_before(draws[-1]["draw_date"], YEAR_WINDOWS[key])
        return [d for d in draws if d["draw_date"] > cut]
    raise KeyError(key)


def trust_draws(draws, key):
    if key == "all":
        return draws
    if key == "checked":
        return [d for d in draws if d["trust_level"] in ("official", "cross-checked")]
    if key == "official":
        return [d for d in draws if d["trust_level"] == "official"]
    raise KeyError(key)


def scopes(draws):
    """ทุกคู่ (ช่วงเวลา, ระดับความน่าเชื่อถือ) ที่มีงวดอย่างน้อย 1 งวด"""
    for pk, plabel in PERIODS:
        for tk, tlabel in TRUSTS:
            sub = trust_draws(period_draws(draws, pk), tk)
            if sub:
                yield pk, tk, sub


def nested(draws, fn):
    out = {}
    for pk, tk, sub in scopes(draws):
        out.setdefault(pk, {})[tk] = fn(sub)
    return out


def comparisons(draws):
    """คู่ช่วงเวลาที่เปรียบเทียบได้ เฉพาะรางวัลที่โครงสร้างเหมือนกันทั้งสองช่วง:
    - เลขท้าย 2 ตัวและรางวัลที่ 1: 1 หมายเลขต่องวดตลอด เทียบได้ทุกช่วง
    - เลขท้าย 3 ตัว: 4 หมายเลขต่องวดก่อน 1 ก.ย. 2558, 2 หมายเลขหลังจากนั้น → เทียบเฉพาะภายในยุคเดียวกัน
    - เลขหน้า 3 ตัว: มีเฉพาะตั้งแต่ 1 ก.ย. 2558 → เทียบเฉพาะภายในยุคนั้น"""
    old = [d for d in draws if d["era"] != "E3"]
    new = [d for d in draws if d["era"] == "E3"]
    single = [d for d in draws if d["trust_level"] == "single-source"]
    official = [d for d in draws if d["trust_level"] == "official"]

    def halves(x):
        m = len(x) // 2
        return x[:m], x[m:]

    pairs = [
        ("old_vs_new", "ก่อน vs ตั้งแต่ 1 ก.ย. 2558", old, new, ("last2", "first")),
        ("old_halves", "ก่อน 1 ก.ย. 2558: ครึ่งแรก vs ครึ่งหลัง", *halves(old), ("last2", "back3", "first")),
        ("new_halves", "ตั้งแต่ 1 ก.ย. 2558: ครึ่งแรก vs ครึ่งหลัง", *halves(new),
         ("last2", "back3", "front3", "first")),
        ("single_vs_official", "ข้อมูลแหล่งเดียว vs ข้อมูลทางการ GLO", single, official, ("last2", "first")),
    ]
    out = []
    for key, label, a, b, prizes in pairs:
        if not a or not b:
            continue
        results = [A.compare_periods(a, b, p) for p in prizes]
        A.add_adjusted([t for r in results for t in r["tests"]])
        out.append({"key": key, "label": label,
                    "a": {"first_draw": a[0]["draw_date"], "last_draw": a[-1]["draw_date"], "draws": len(a)},
                    "b": {"first_draw": b[0]["draw_date"], "last_draw": b[-1]["draw_date"], "draws": len(b)},
                    "prizes": list(prizes),
                    "excluded": [p for p in ("last2", "back3", "front3", "first") if p not in prizes],
                    "results": results})
    return out


def digits_scope(sub):
    out = {p: A.digit_positions(sub, p) for p in DIGIT_PRIZES}
    A.add_adjusted([pos for p in DIGIT_PRIZES for pos in out[p]["positions"]])
    return out


def characteristics_scope(sub):
    out = {p: A.characteristics(sub, p) for p in STAT_PRIZES}
    A.add_adjusted([it for p in STAT_PRIZES for it in out[p]["items"]])
    return out


def randomness_scope(sub):
    """การทดสอบความสุ่มทั้งหมดของขอบเขตหนึ่ง: chi-square เดิม + การทดสอบ V4 แล้วปรับ p รวมกัน"""
    out = S.randomness(sub)
    extra, detail = R.extra_tests(sub)
    out["tests"] += extra
    A.add_adjusted(out["tests"])
    out["test_count"] = len(out["tests"])
    out.update(detail)
    return out


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def build_data(draws, csv_hash, generated_at):
    meta = {"schema_version": SCHEMA_VERSION, "generated_at": generated_at}
    years = sorted({d["draw_date"][:4] for d in draws})
    files = {}
    files["latest.json"] = {**meta, "draw": draws[-1]}
    files["index.json"] = {
        **meta,
        "fields": ["draw_date", "draw_date_th", "era", "trust_level", "first", "front3", "back3", "last2"],
        "rows": [[d["draw_date"], d["draw_date_th"], d["era"], d["trust_level"],
                  d["prizes"]["first"][0], d["prizes"]["front3"], d["prizes"]["back3"],
                  d["prizes"]["last2"][0]] for d in draws],
    }
    for y in years:
        files[f"draws/{y}.json"] = {**meta, "year": y, "draws": [d for d in draws if d["draw_date"][:4] == y]}

    lists = {"periods": [k for k, _ in PERIODS], "period_labels": dict(PERIODS),
             "trusts": [k for k, _ in TRUSTS], "trust_labels": dict(TRUSTS)}
    files["stats/frequency.json"] = {**meta, **lists,
                                     "data": nested(draws, lambda sub: {p: S.frequency(sub, p) for p in STAT_PRIZES})}
    files["stats/digits.json"] = {**meta, **lists, "data": nested(draws, digits_scope)}
    files["stats/characteristics.json"] = {**meta, **lists, "data": nested(draws, characteristics_scope)}
    files["stats/timeline.json"] = {**meta, "trusts": lists["trusts"], "trust_labels": lists["trust_labels"],
                                    "data": {tk: {p: A.yearly(trust_draws(draws, tk), p) for p in STAT_PRIZES}
                                             for tk, _ in TRUSTS}}
    files["stats/compare.json"] = {**meta, "pairs": comparisons(draws)}
    files["stats/gaps.json"] = {**meta, **lists, "data": nested(draws, A.gap_distribution)}
    files["stats/randomness.json"] = {**meta, **lists, "data": nested(draws, randomness_scope)}
    files["stats/ranking.json"] = {**meta, **lists, "data": nested(draws, K.ranking_scope),
                                   "backtests": K.backtests(draws),
                                   "lookbacks": [k for k, _ in K.LOOKBACKS]}

    def count(pred):
        return sum(1 for d in draws if pred(d))

    files["manifest.json"] = {
        **meta,
        "product": "L6",
        "draw_count": len(draws),
        "first_draw": draws[0]["draw_date"],
        "latest_draw": draws[-1]["draw_date"],
        "latest_draw_th": draws[-1]["draw_date_th"],
        "years": years,
        "by_era": {e: count(lambda d, e=e: d["era"] == e) for e in ("E1", "E2", "E3")},
        "by_trust": {t: count(lambda d, t=t: d["trust_level"] == t)
                     for t in ("official", "cross-checked", "single-source")},
        "csv_sha256": csv_hash,
        "run_id": os.environ.get("GITHUB_RUN_ID"),
    }
    return files


def copy_web(web_dir, out_dir, version):
    for root, _, names in os.walk(web_dir):
        for name in names:
            src = os.path.join(root, name)
            ext = os.path.splitext(name)[1].lower()
            if ext not in ALLOWED_EXT:
                raise SystemExit(f"ไฟล์ชนิดที่ไม่อนุญาตในหน้าเว็บ: {src}")
            dst = os.path.join(out_dir, os.path.relpath(src, web_dir))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if ext == ".html":
                text = open(src, encoding="utf-8").read().replace("__V__", version)
                open(dst, "w", encoding="utf-8", newline="\n").write(text)
            else:
                shutil.copyfile(src, dst)


def web_hash(web_dir):
    h = hashlib.sha256()
    for root, _, names in sorted(os.walk(web_dir)):
        for name in sorted(names):
            p = os.path.join(root, name)
            h.update(os.path.relpath(p, web_dir).replace("\\", "/").encode())
            h.update(open(p, "rb").read())
    return h.hexdigest()


def main():
    csv_path, web_dir, out_dir = sys.argv[1:4]
    try:
        draws, warnings = L.load(csv_path)
    except L.DataError as e:
        print("CSV ไม่ผ่านการตรวจ — หยุดการสร้างเว็บ:\n" + str(e), file=sys.stderr)
        sys.exit(1)
    for w in warnings:
        print("คำเตือน:", w)

    csv_hash = sha256_file(csv_path)
    generated_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    files = build_data(draws, csv_hash, generated_at)
    version = hashlib.sha256((csv_hash + web_hash(web_dir)).encode()).hexdigest()[:12]
    files["manifest.json"]["version"] = version

    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    copy_web(web_dir, out_dir, version)
    for name, obj in files.items():
        dump(os.path.join(out_dir, "data", name), obj)
    shutil.copyfile(csv_path, os.path.join(out_dir, "data", "thai_lottery.csv"))
    open(os.path.join(out_dir, ".nojekyll"), "w").close()
    print(f"สร้างเว็บแล้ว: {len(draws)} งวด, version {version}, {len(files)} ไฟล์ข้อมูล → {out_dir}")


if __name__ == "__main__":
    main()
