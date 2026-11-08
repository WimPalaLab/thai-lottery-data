"""Backtest, snapshot การทำนาย และการประเมินผลหลังออกรางวัล (ใช้ใน GitHub Actions และในเครื่อง)

ใช้:
  python scripts/lotto_predict.py backtest [--force] [--workers N]   คำนวณ data/analysis/backtest.json ใหม่ถ้าข้อมูล/config/โค้ดเปลี่ยน
  python scripts/lotto_predict.py snapshot                           สร้าง snapshot ของงวดถัดไป (ถ้ายังไม่มี และยังไม่ถึงเวลาออกรางวัล)
  python scripts/lotto_predict.py evaluate                           ประเมิน snapshot ที่รอผล เมื่อมีผลรางวัลจริงแล้ว

กฎ:
- snapshot สร้างครั้งเดียวและห้ามแก้ (มี content_sha256 กำกับ) สคริปต์นี้ไม่เขียนทับไฟล์ที่มีอยู่แล้ว
- snapshot ต้องสร้างก่อนเวลาออกรางวัล (14:00 น. เวลาไทยของวันออกรางวัล) ไม่อย่างนั้นจะไม่ถูกนับผล
- ไม่มีการสร้าง snapshot ย้อนหลัง งวดที่ไม่มี snapshot = ประเมินไม่ได้
- ตั้งแต่ schema 2 snapshot มีอันดับเลขท้าย 2 ตัว/ท้าย 3 ตัว/หน้า 3 ตัว (small_predictions) ด้วย
  snapshot ที่สร้างก่อนหน้านั้น (schema 1) จะได้ไฟล์เสริม data/predictions/small/<วันที่>.json
  แยกต่างหาก (สร้างใหม่ ไม่แก้ไฟล์เดิม) เฉพาะเมื่อยังไม่ถึงเวลาออกรางวัล
"""
import argparse
import datetime
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lotto_data as L  # noqa: E402
import lotto_meta as meta  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, "data", "thai_lottery.csv")
PRED_DIR = os.path.join(ROOT, "data", "predictions")
EVAL_DIR = os.path.join(ROOT, "data", "evaluations")
BACKTEST = os.path.join(ROOT, "data", "analysis", "backtest.json")
BACKTEST_SMALL = os.path.join(ROOT, "data", "analysis", "backtest_small.json")
GLOBAL_RANK = os.path.join(ROOT, "data", "analysis", "global_rank.json")
SMALL_SUBDIR = "small"   # ไฟล์เสริมของ snapshot เดิมที่ยังไม่มีอันดับเลขท้าย
SCHEMA_VERSION = 2       # 2: เพิ่ม small_predictions (เลขท้าย 2 ตัว, ท้าย 3 ตัว, หน้า 3 ตัว)
DRAW_CUTOFF_UTC = datetime.time(7, 0)   # 14:00 น. เวลาไทย (UTC+7) ก่อนเริ่มถ่ายทอดการออกรางวัล
SIX_PRIZES = ["first", "second", "third", "fourth", "fifth"]


# ---------- helpers ----------
def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)


def iso(dt):
    return dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s):
    return datetime.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)


def draw_cutoff(date):
    """เวลาที่ถือว่าผลรางวัลของวันนั้นเริ่มเป็นที่รู้ (snapshot ต้องสร้างก่อนเวลานี้)"""
    return datetime.datetime.combine(datetime.date.fromisoformat(date), DRAW_CUTOFF_UTC, datetime.timezone.utc)


def next_draw_date(latest):
    """วันที่คาดว่าจะออกรางวัลงวดถัดไป (ประมาณ: วันที่ 1 และ 16; สิ้นปีออก 30 ธ.ค.; ไม่มีงวด 1 ม.ค.)"""
    d = datetime.date.fromisoformat(latest)
    if d.month == 12 and 16 <= d.day < 30:
        return d.replace(day=30).isoformat()
    if d.day < 16:
        return d.replace(day=16).isoformat()
    nm = (d.replace(day=1) + datetime.timedelta(days=32)).replace(day=1)
    if nm.month == 1:
        nm = nm.replace(day=16)
    return nm.isoformat()


def file_sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def content_sha(obj):
    """hash ของ snapshot โดยไม่รวมฟิลด์ content_sha256 เอง"""
    body = {k: v for k, v in obj.items() if k != "content_sha256"}
    return hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def write_new(path, obj):
    """เขียนไฟล์ใหม่เท่านั้น ถ้ามีไฟล์อยู่แล้วจะหยุด (กันการเขียนทับ snapshot/ผลประเมิน)"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "x", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def list_json(d):
    if not os.path.isdir(d):
        return []
    return sorted(os.path.join(d, n) for n in os.listdir(d) if n.endswith(".json"))


def ticket_prizes(draw, n):
    """เลข 6 หลัก n ถูกรางวัลอะไรบ้างในงวดนี้ (ทุกประเภท รวมเลขหน้า/ท้าย)"""
    p = draw["prizes"]
    out = [k for k in ("first", "near_first", "second", "third", "fourth", "fifth") if n in p[k]]
    if n[:3] in p["front3"]:
        out.append("front3")
    if n[3:] in p["back3"]:
        out.append("back3")
    if p["last2"] and n[4:] == p["last2"][0]:
        out.append("last2")
    return out


# ---------- backtest ----------
backtest_inputs = meta.backtest_inputs


def backtest_is_fresh(path, inputs):
    if not os.path.exists(path):
        return False
    old = read_json(path)
    return all(old.get(k) == v for k, v in inputs.items())


def cmd_backtest_small(args, cfg):
    import lotto_small as SM
    inputs = meta.small_backtest_inputs(args.csv, cfg)
    if not args.force and backtest_is_fresh(args.small_out, inputs):
        print("backtest (small): up to date")
        return
    draws, _ = L.load(args.csv)
    sc = cfg[meta.SMALL_KEY]
    out = {"schema_version": SCHEMA_VERSION, "kind": "small_backtest", **inputs,
           "data_through": draws[-1]["draw_date"], "draw_count": len(draws), "generated_at": iso(utcnow()),
           "candidate_counts": sc["candidate_counts"], "results": SM.summarize_all(draws, sc)}
    os.makedirs(os.path.dirname(args.small_out), exist_ok=True)
    with open(args.small_out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("backtest (small): " + ", ".join(f"{k} {v['all']['draws']} draws, hits {v['all']['hits']}"
                                           for k, v in out["results"].items()))


def cmd_backtest(args):
    cfg = meta.load_config()
    if meta.SMALL_KEY in cfg:
        cmd_backtest_small(args, cfg)
    inputs = backtest_inputs(args.csv, cfg)
    if not args.force and backtest_is_fresh(args.out, inputs):
        print("backtest: up to date")
        return 0
    import lotto_backtest as B
    draws, _ = L.load(args.csv)
    t0 = datetime.datetime.now()
    prep, idxs, recs = B.run_walk_forward(draws, cfg, workers=args.workers)
    summary = B.summarize(prep, idxs, recs, cfg)
    out = {"schema_version": SCHEMA_VERSION, **inputs, "data_through": draws[-1]["draw_date"],
           "draw_count": len(draws), "generated_at": iso(utcnow()), **summary}
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    secs = (datetime.datetime.now() - t0).total_seconds()
    print(f"backtest: {len(idxs)} draws ({summary['evaluation']['first_draw']}..{summary['evaluation']['last_draw']}) "
          f"in {secs:.0f}s; tuned {summary['tuning']['chosen']}")
    return 0


# ---------- อันดับ "ดูทุกรางวัล" ----------
def build_global_rank(draws, cfg):
    """เลข 6 หลักอันดับต้นตามคะแนน "ดูทุกรางวัล" (สถิติรางวัลที่ 1–5 รวมกัน) พร้อมเหตุผล
    เป็นการจัดอันดับว่าเลขไหนคล้ายเลขที่เคยออก ไม่ใช่โอกาสถูกรางวัล (ทุกเลขมีโอกาสเท่ากัน)"""
    import lotto_backtest as B
    import lotto_model as M
    prep = B.prepare(draws)
    g, pms = B.models_at(prep, prep["n"], cfg)
    zg = g.scores
    g100 = M.scale_100(zg)
    rows = []
    for r, x in enumerate(M.top_k(zg, cfg["report_top_n"]), start=1):
        # w_global = 1: ส่วนของโมเดลรางวัลเฉพาะมีน้ำหนัก 0 จึงเหลือแต่เหตุผลจากทุกรางวัลรวมกัน
        why = [c for c in M.explain(int(x), g, pms["first"], 1.0, top=len(M.GROUPS) * 2) if c["scope"] == "global"]
        rows.append({"number": f"{int(x):06d}", "rank": r, "global_score": round(float(g100(zg[x])), 3),
                     "global_z": round(float(zg[x]), 4), "contributions": why[:3]})
    return rows


def cmd_global(args):
    cfg = meta.load_config()
    inputs = backtest_inputs(args.csv, cfg)
    if not args.force and backtest_is_fresh(args.global_out, inputs):
        print("global rank: up to date")
        return 0
    draws, _ = L.load(args.csv)
    out = {"schema_version": SCHEMA_VERSION, "kind": "global_rank", **inputs, "data_through": draws[-1]["draw_date"],
           "draw_count": len(draws), "generated_at": iso(utcnow()), "rows": build_global_rank(draws, cfg)}
    os.makedirs(os.path.dirname(args.global_out), exist_ok=True)
    with open(args.global_out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"global rank: top {len(out['rows'])} from {len(draws)} draws, #1 = {out['rows'][0]['number']}")
    return 0


# ---------- snapshot ----------
def existing_snapshots(pred_dir):
    return [read_json(p) for p in list_json(pred_dir)]


def build_small(draws, cfg, small_ref):
    """ส่วนเลขท้าย 2 ตัว / ท้าย 3 ตัว / หน้า 3 ตัว ของ snapshot (ไลบรารีมาตรฐาน)"""
    import lotto_small as SM
    sc = cfg[meta.SMALL_KEY]
    return {"model_version": sc["model_version"], "config_sha": meta.small_config_sha(cfg),
            "code_sha": meta.small_code_sha(), "candidate_counts": sc["candidate_counts"],
            "feature_weights": sc["feature_weights"], "recent_draws": sc["recent_draws"],
            "backtest": small_ref, "predictions": SM.build_predictions(draws, sc)}


def small_ref_of(path):
    bt = read_json(path)
    return {"generated_at": bt["generated_at"], "data_through": bt["data_through"],
            "holdout": {k: {x: v["holdout"].get(x) for x in ("draws", "hits", "mean_pct")}
                        for k, v in bt["results"].items()}}


def build_small_addon(draws, cfg, now, csv_sha, target, small_ref):
    """ไฟล์เสริมสำหรับ snapshot เดิม (schema 1) ที่ยังไม่มีอันดับเลขท้าย — เป็นไฟล์ใหม่ ไม่แตะไฟล์เดิม"""
    snap = {
        "schema_version": SCHEMA_VERSION,
        "kind": "small_prediction_snapshot",
        "target_draw_date": target,
        "target_is_estimate": True,
        "created_at": iso(now),
        "training_data_through": draws[-1]["draw_date"],
        "training_draw_count": len(draws),
        "csv_sha256": csv_sha,
        "small_predictions": build_small(draws, cfg, small_ref),
        "evaluation_status": "pending",
    }
    snap["content_sha256"] = content_sha(snap)
    return snap


def build_snapshot(draws, cfg, chosen, now, csv_sha, backtest_ref, small_ref=None):
    import numpy as np
    import lotto_backtest as B
    import lotto_model as M
    prep = B.prepare(draws)
    g, pms = B.models_at(prep, prep["n"], cfg)
    top_n = cfg["report_top_n"]
    zg = g.scores
    g100 = M.scale_100(zg)
    predictions, alternatives, weights = {}, {}, {}
    for k in SIX_PRIZES:
        w = float(cfg["hybrid_experiments"][chosen[k]])
        weights[k] = {"experiment": chosen[k], "global": w, "prize_specific": round(1 - w, 6)}
        zp = pms[k].scores
        h = M.hybrid(zg, zp, w)
        p100, h100 = M.scale_100(zp), M.scale_100(h)
        top = M.top_k(h, top_n)
        ranks_g = M.ranks_of(zg, top)
        ranks_p = M.ranks_of(zp, top)
        rows = []
        for r, x in enumerate(top, start=1):
            rows.append({
                "number": f"{int(x):06d}", "rank": r,
                "global_score": round(float(g100(zg[x])), 3), "prize_score": round(float(p100(zp[x])), 3),
                "hybrid_score": round(float(h100(h[x])), 3),
                "global_z": round(float(zg[x]), 4), "prize_z": round(float(zp[x]), 4), "hybrid_z": round(float(h[x]), 4),
                "global_rank": int(ranks_g[r - 1]), "prize_rank": int(ranks_p[r - 1]),
                "contributions": M.explain(int(x), g, pms[k], w),
            })
        predictions[k] = rows
        kmax = max(cfg["candidate_counts"].values())
        alternatives[k] = {}
        for name, wv in B.config_list(cfg):
            hh = zg if name == "global" else zp if name == "prize" else M.hybrid(zg, zp, wv)
            alternatives[k][name] = [f"{int(x):06d}" for x in M.top_k(hh, kmax)]
    obs_counts = {k: int((prep["six"][k][0] < prep["n"]).sum()) for k in SIX_PRIZES}
    snap = {
        "schema_version": SCHEMA_VERSION,
        "kind": "prediction_snapshot",
        "model_version": cfg["model_version"],
        "target_draw_date": next_draw_date(draws[-1]["draw_date"]),
        "target_is_estimate": True,
        "created_at": iso(now),
        "training_data_through": draws[-1]["draw_date"],
        "training_draw_count": len(draws),
        "training_numbers": obs_counts,
        "csv_sha256": csv_sha,
        "config": cfg,
        "config_sha": meta.config_sha(cfg),
        "code_sha": meta.code_sha(),
        "hybrid_weights": weights,
        "tuning": backtest_ref,
        "candidate_counts": cfg["candidate_counts"],
        "predictions": predictions,
        "alternatives": alternatives,
        "random_seed": None,
        "evaluation_status": "pending",
    }
    if meta.SMALL_KEY in cfg:
        snap["small_predictions"] = build_small(draws, cfg, small_ref)
    snap["content_sha256"] = content_sha(snap)
    return snap


def small_backtest_ref(args, cfg):
    if not backtest_is_fresh(args.small_backtest, meta.small_backtest_inputs(args.csv, cfg)):
        print("snapshot: backtest_small.json is missing or out of date — run `lotto_predict.py backtest` first",
              file=sys.stderr)
        return None
    return small_ref_of(args.small_backtest)


def maybe_small_addon(args, cfg, draws, existing, now):
    """snapshot ของข้อมูลชุดนี้มีอยู่แล้วแต่ยังไม่มีอันดับเลขท้าย: สร้างไฟล์เสริมถ้ายังไม่ถึงเวลาออกรางวัล"""
    target = existing["target_draw_date"]
    path = os.path.join(args.pred_dir, SMALL_SUBDIR, f"{target}.json")
    if "small_predictions" in existing or meta.SMALL_KEY not in cfg or os.path.exists(path):
        return 0
    if now >= draw_cutoff(target):
        print(f"snapshot (small): skipped — draw {target} has started")
        return 0
    ref = small_backtest_ref(args, cfg)
    if ref is None:
        return 1
    addon = build_small_addon(draws, cfg, now, file_sha256(args.csv), target, ref)
    write_new(path, addon)
    print(f"snapshot (small): wrote {os.path.relpath(path, ROOT)} (add-on for {target}, created {addon['created_at']})")
    return 0


def cmd_snapshot(args):
    cfg = meta.load_config()
    draws, _ = L.load(args.csv)
    latest = draws[-1]["draw_date"]
    now = parse_iso(args.now) if args.now else utcnow()
    for s in existing_snapshots(args.pred_dir):
        if s.get("training_data_through") == latest:
            print(f"snapshot: already exists for data through {latest} (target {s['target_draw_date']})")
            return maybe_small_addon(args, cfg, draws, s, now)
    target = next_draw_date(latest)
    if now >= draw_cutoff(target):
        print(f"snapshot: skipped — next draw ({target}) has started or passed but its result is not in the data yet; "
              "a snapshot made now could not be evaluated honestly")
        return 0
    path = os.path.join(args.pred_dir, f"{target}.json")
    if os.path.exists(path):
        print(f"snapshot: {path} exists with different training data; refusing to overwrite", file=sys.stderr)
        return 1
    inputs = backtest_inputs(args.csv, cfg)
    if not backtest_is_fresh(args.backtest, inputs):
        print("snapshot: backtest.json is missing or out of date — run `lotto_predict.py backtest` first", file=sys.stderr)
        return 1
    small_ref = None
    if meta.SMALL_KEY in cfg:
        small_ref = small_backtest_ref(args, cfg)
        if small_ref is None:
            return 1
    bt = read_json(args.backtest)
    if cfg.get("use_tuned_experiment", True):
        chosen = bt["tuning"]["chosen"]
    else:
        chosen = {k: cfg["default_experiment"] for k in SIX_PRIZES}
    ref = {"source": "backtest validation" if cfg.get("use_tuned_experiment", True) else "default",
           "validation": bt["evaluation"]["validation"], "metric": bt["tuning"]["metric"], "chosen": chosen}
    snap = build_snapshot(draws, cfg, chosen, now, inputs["csv_sha256"], ref, small_ref)
    write_new(path, snap)
    print(f"snapshot: wrote {os.path.relpath(path, ROOT)} (data through {latest}, created {snap['created_at']})")
    return 0


# ---------- evaluation ----------
def evaluate_small(small, d):
    """เทียบอันดับเลขท้าย/หน้ากับผลจริงของงวด d (นับเฉพาะ K อันดับแรกที่ตั้งไว้ใน snapshot)"""
    out = {}
    for kind, block in small["predictions"].items():
        K = small["candidate_counts"][kind]
        rows = block["rows"]
        cands = [r["number"] for r in rows[:K]]
        winners = list(d["prizes"][kind])
        if not winners:
            out[kind] = {"count": K, "candidates": cands, "winners": [], "available": False}
            continue
        out[kind] = {
            "count": K, "candidates": cands, "winners": winners, "available": True,
            "hits": sum(1 for w in winners if w in cands),
            "exact_hits": [n for n in cands if n in winners],
            "hits_in_top_n": [n for n in (r["number"] for r in rows) if n in winners],
            "random_expected": round(K * len(winners) / block["space"], 6),
        }
    return out


def evaluate_snapshot(snap, draws, now):
    """สร้างบันทึกผลประเมินของ snapshot หนึ่งชุด หรือ None ถ้ายังไม่มีผลรางวัล"""
    through = snap["training_data_through"]
    later = [d for d in draws if d["draw_date"] > through]
    if not later:
        return None
    d = later[0]
    actual_date = d.get("actual_draw_date", d["draw_date"])
    cutoff = draw_cutoff(actual_date)
    created = parse_iso(snap["created_at"])
    rec = {
        "schema_version": SCHEMA_VERSION,
        "kind": "small_prediction_evaluation" if snap.get("kind") == "small_prediction_snapshot" else "prediction_evaluation",
        "snapshot": f"{snap['target_draw_date']}.json",
        "snapshot_sha256": snap.get("content_sha256"),
        "model_version": snap.get("model_version") or snap["small_predictions"]["model_version"],
        "target_draw_date": snap["target_draw_date"],
        "actual_draw_date": d["draw_date"],
        "actual_trust_level": d["trust_level"],
        "snapshot_created_at": snap["created_at"],
        "draw_cutoff": iso(cutoff),
        "lead_time_hours": round((cutoff - created).total_seconds() / 3600, 1),
        "evaluated_at": iso(now),
    }
    if content_sha(snap) != snap.get("content_sha256"):
        rec.update(status="invalid", reason="content_sha256 ไม่ตรง: snapshot ถูกแก้หลังสร้าง")
        return rec
    if created >= cutoff:
        rec.update(status="not_evaluable", reason="snapshot สร้างหลังเวลาเริ่มออกรางวัล")
        return rec
    if rec["kind"] == "small_prediction_evaluation":
        rec.update(status="evaluated", small_results=evaluate_small(snap["small_predictions"], d))
        return rec
    results, tickets = {}, []
    for k in SIX_PRIZES:
        K = snap["candidate_counts"][k]
        rows = snap["predictions"][k]
        cands = [r["number"] for r in rows[:K]]
        winners = d["prizes"][k]
        if not winners:
            results[k] = {"count": K, "candidates": cands, "winners": 0, "exact_hits": [], "available": False}
            continue
        results[k] = {
            "count": K, "candidates": cands, "winners": len(winners), "available": True,
            "exact_hits": [n for n in cands if n in winners],
            "hits_in_top_n": [n for n in (r["number"] for r in rows) if n in winners],
            "random_expected": round(K * len(winners) / 1_000_000, 8),
            "alternatives": {c: sum(1 for n in nums[:K] if n in winners) for c, nums in snap["alternatives"][k].items()},
        }
        for n in cands:
            won = ticket_prizes(d, n)
            if won:
                tickets.append({"number": n, "list": k, "prizes": won})
    rec.update(status="evaluated", results=results, ticket_wins=tickets,
               exact_hits_total=sum(len(r["exact_hits"]) for r in results.values()),
               random_expected_total=round(sum(r.get("random_expected", 0) for r in results.values()), 8))
    if "small_predictions" in snap:
        rec["small_results"] = evaluate_small(snap["small_predictions"], d)
    return rec


def cmd_evaluate(args):
    draws, _ = L.load(args.csv)
    now = parse_iso(args.now) if args.now else utcnow()
    done = 0
    pairs = [(p, os.path.join(args.eval_dir, os.path.basename(p))) for p in list_json(args.pred_dir)]
    pairs += [(p, os.path.join(args.eval_dir, SMALL_SUBDIR, os.path.basename(p)))
              for p in list_json(os.path.join(args.pred_dir, SMALL_SUBDIR))]
    for p, out in pairs:
        if os.path.exists(out):
            continue
        rec = evaluate_snapshot(read_json(p), draws, now)
        if rec is None:
            print(f"evaluate: {os.path.basename(p)} pending (no result yet)")
            continue
        write_new(out, rec)
        done += 1
        print(f"evaluate: {os.path.basename(p)} → {rec['status']} (draw {rec['actual_draw_date']})")
    print(f"evaluate: {done} new evaluation(s)")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["backtest", "snapshot", "evaluate", "global"])
    ap.add_argument("--csv", default=CSV)
    ap.add_argument("--pred-dir", default=PRED_DIR)
    ap.add_argument("--eval-dir", default=EVAL_DIR)
    ap.add_argument("--backtest", default=BACKTEST)
    ap.add_argument("--out", default=BACKTEST)
    ap.add_argument("--small-backtest", default=BACKTEST_SMALL)
    ap.add_argument("--small-out", default=BACKTEST_SMALL)
    ap.add_argument("--global-out", default=GLOBAL_RANK)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--now", default=None, help="เวลาปัจจุบันแบบ YYYY-MM-DDTHH:MM:SSZ (ใช้ทดสอบ)")
    args = ap.parse_args(argv)
    return {"backtest": cmd_backtest, "snapshot": cmd_snapshot, "evaluate": cmd_evaluate, "global": cmd_global}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
