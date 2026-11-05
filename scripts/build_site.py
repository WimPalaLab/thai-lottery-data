"""สร้างเว็บไซต์ static: ตรวจ CSV → คำนวณสถิติ → เขียน JSON → คัดลอกหน้าเว็บ
ใช้: python scripts/build_site.py <csv> <web_dir> <out_dir>
เช่น python scripts/build_site.py data/thai_lottery.csv web _site

ถ้า CSV ไม่ผ่านการตรวจ สคริปต์จะหยุดด้วย exit code 1 และไม่สร้างไฟล์ใด ๆ"""
import datetime
import hashlib
import json
import re
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lotto_data as L  # noqa: E402
import lotto_meta as META  # noqa: E402
import lotto_sixdigit as SIX  # noqa: E402
import lotto_stats as S  # noqa: E402
import lotto_verify as V  # noqa: E402

SCHEMA_VERSION = 2   # 2: เพิ่ม stats/sixdigit.json, verification.json, predictions/, analysis/
DATA_DIR = os.path.join(META.ROOT, "data")
RE_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
RE_SIX = re.compile(r"^\d{6}$")
EVAL_STATUS = {"evaluated", "not_evaluable", "invalid"}
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


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def check_snapshot(s, path):
    """ตรวจโครงสร้าง snapshot ก่อนขึ้นเว็บ (ไฟล์เสียหรือถูกแก้ผิดรูปแบบ = หยุดสร้างเว็บ)"""
    def need(cond, what):
        if not cond:
            raise SystemExit(f"snapshot ไม่ถูกต้อง ({os.path.basename(path)}): {what}")
    need(s.get("kind") == "prediction_snapshot", "kind")
    for k in ("target_draw_date", "training_data_through"):
        need(L.RE_DATE.match(str(s.get(k, ""))), k)
    need(RE_ISO.match(str(s.get("created_at", ""))), "created_at")
    need(os.path.basename(path) == f"{s['target_draw_date']}.json", "ชื่อไฟล์ไม่ตรงกับ target_draw_date")
    for k in META.SIX_PRIZES:
        rows = s["predictions"][k]
        need(isinstance(rows, list) and rows, f"predictions.{k}")
        for r in rows:
            need(RE_SIX.match(str(r.get("number", ""))), f"predictions.{k}.number")
            for c in r.get("contributions", []):
                need(c.get("group") in META.GROUPS and c.get("scope") in ("global", "prize"), "contributions")
                need(isinstance(c.get("detail"), str) and len(c["detail"]) <= 300, "contributions.detail")
        for name, nums in s["alternatives"][k].items():
            need(isinstance(name, str) and name.isalnum() and all(RE_SIX.match(str(n)) for n in nums), "alternatives")


def check_evaluation(e, path):
    if e.get("kind") != "prediction_evaluation" or e.get("status") not in EVAL_STATUS \
            or not L.RE_DATE.match(str(e.get("actual_draw_date", ""))):
        raise SystemExit(f"ผลประเมินไม่ถูกต้อง: {os.path.basename(path)}")


def json_files(d):
    return sorted(os.path.join(d, n) for n in os.listdir(d) if n.endswith(".json")) if os.path.isdir(d) else []


def analysis_files(draws, csv_hash, data_dir, meta):
    """snapshot + ผลประเมิน + backtest → ไฟล์ข้อมูลของหน้าวิเคราะห์และหน้าประวัติ"""
    files, snaps = {}, []
    evals = {}
    for p in json_files(os.path.join(data_dir, "evaluations")):
        e = read_json(p)
        check_evaluation(e, p)
        evals[os.path.basename(p)] = e
    for p in json_files(os.path.join(data_dir, "predictions")):
        s = read_json(p)
        check_snapshot(s, p)
        e = evals.get(os.path.basename(p))
        files[f"predictions/{s['target_draw_date']}.json"] = {**meta, "snapshot": s, "evaluation": e}
        snaps.append({
            "target_draw_date": s["target_draw_date"], "created_at": s["created_at"],
            "training_data_through": s["training_data_through"], "model_version": s["model_version"],
            "status": e["status"] if e else "pending",
            "actual_draw_date": e["actual_draw_date"] if e else None,
            "lead_time_hours": e.get("lead_time_hours") if e else None,
            "exact_hits_total": e.get("exact_hits_total") if e else None,
            "random_expected_total": e.get("random_expected_total") if e else None,
            "ticket_wins": len(e.get("ticket_wins", [])) if e else None,
        })
    history = []
    if snaps:
        start = min(s["training_data_through"] for s in snaps)
        by_actual = {s["actual_draw_date"]: s for s in snaps if s["actual_draw_date"]}
        for d in draws:
            if d["draw_date"] <= start:
                continue
            s = by_actual.get(d["draw_date"])
            history.append({"draw_date": d["draw_date"], "status": s["status"] if s else "no_snapshot",
                            "snapshot": s["target_draw_date"] if s else None,
                            "exact_hits_total": s["exact_hits_total"] if s else None,
                            "random_expected_total": s["random_expected_total"] if s else None})
    files["predictions/index.json"] = {**meta, "snapshots": snaps[::-1], "history": history[::-1],
                                       "tracking_since": min((s["training_data_through"] for s in snaps), default=None)}

    bt_path = os.path.join(data_dir, "analysis", "backtest.json")
    if os.path.exists(bt_path):
        bt = read_json(bt_path)
        cfg = META.load_config()
        want = {"csv_sha256": csv_hash, "config_sha": META.config_sha(cfg), "code_sha": META.code_sha(),
                "model_version": cfg["model_version"]}
        stale = [k for k, v in want.items() if bt.get(k) != v]
        files["analysis/backtest.json"] = {**bt, **meta, "backtest_generated_at": bt.get("generated_at"),
                                           "fresh": not stale, "stale_reasons": stale}
    return files


def build_data(draws, csv_hash, generated_at, warnings=(), data_dir=DATA_DIR):
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
    files["stats/frequency.json"] = {**meta, "periods": [k for k, _ in PERIODS], "data": freq,
                                     "gaps_last2": S.gaps_last2(draws)}
    files["stats/randomness.json"] = {**meta, **S.randomness(draws)}
    files["stats/sixdigit.json"] = {**meta, **SIX.build(draws, period_draws, PERIODS)}
    files["verification.json"] = {**meta, **V.build(draws, list(warnings), data_dir)}
    files.update(analysis_files(draws, csv_hash, data_dir, meta))
    pred_index = files["predictions/index.json"]
    bt = files.get("analysis/backtest.json")

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
        "latest_snapshot": pred_index["snapshots"][0]["target_draw_date"] if pred_index["snapshots"] else None,
        "backtest": {"available": bt is not None, "fresh": bool(bt and bt["fresh"])},
        "last_import": files["verification.json"]["last_import"],
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
    files = build_data(draws, csv_hash, generated_at, warnings, os.path.dirname(os.path.abspath(csv_path)))
    if not files["manifest.json"]["backtest"]["fresh"]:
        print("คำเตือน: data/analysis/backtest.json ไม่มีหรือไม่ตรงกับข้อมูล/config/โค้ดปัจจุบัน "
              "(รัน python scripts/lotto_predict.py backtest) — หน้าเว็บจะแสดงป้ายเตือน")
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
