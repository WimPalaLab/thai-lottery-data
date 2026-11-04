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

SCHEMA_VERSION = 1
# ไฟล์หน้าเว็บที่อนุญาตให้คัดลอก (กันไฟล์แปลก ๆ หลุดขึ้นเว็บ)
ALLOWED_EXT = {".html", ".css", ".js", ".svg", ".ico", ".txt", ".woff2"}
PERIODS = [
    ("all", "ทั้งหมด"),
    ("e3", "ตั้งแต่ 1 ก.ย. 2558 (โครงสร้างรางวัลปัจจุบัน)"),
    ("official", "เฉพาะข้อมูลทางการ GLO (ตั้งแต่ 16 พ.ย. 2559)"),
    ("last5y", "5 ปีล่าสุด"),
]


def period_draws(draws, key):
    if key == "all":
        return draws
    if key == "e3":
        return [d for d in draws if d["era"] == "E3"]
    if key == "official":
        return [d for d in draws if d["trust_level"] == "official"]
    if key == "last5y":
        last = datetime.date.fromisoformat(draws[-1]["draw_date"])
        cut = last.replace(year=last.year - 5).isoformat()
        return [d for d in draws if d["draw_date"] > cut]
    raise KeyError(key)


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

    freq = {}
    for key, label in PERIODS:
        sub = period_draws(draws, key)
        freq[key] = {"label": label, **{p: S.frequency(sub, p) for p in ("last2", "back3", "front3")}}
    files["stats/frequency.json"] = {**meta, "periods": [k for k, _ in PERIODS], "data": freq}
    files["stats/randomness.json"] = {**meta, **S.randomness(draws)}

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
