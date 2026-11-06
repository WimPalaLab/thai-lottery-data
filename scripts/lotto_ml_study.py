"""งานวิจัย: มีโมเดลไหน (รวม machine learning แบบง่าย) ให้ "ความน่าจะเป็น" ของงวดถัดไปดีกว่า
"ทุกเลขมีโอกาสเท่ากัน" หรือไม่ — ทดสอบแบบ walk-forward ทีละงวด

หลักการ (กันหลอกตัวเอง):
1. ทายงวด t โดยใช้เฉพาะงวด index < t (ข้อมูลงวด t และหลังจากนั้นไม่ถูกใช้เลย)
2. เป้าหมายมีจำนวนแบบน้อยพอจะวัดได้: เลขท้าย 2 ตัว (100 แบบ) และเลขแต่ละหลักของรางวัลที่ 1 (10 แบบต่อหลัก)
3. โมเดล: uniform (เท่ากันหมด), freq (ความถี่ย้อนหลังแบบ smoothing), logit
   (multinomial logistic regression แบบ softmax + gradient descent + L2 เขียนด้วย Python ล้วน)
4. แบ่งช่วงล่วงหน้า (pre-registered): validation = งวดก่อน HOLDOUT_START ใช้เลือก hyper-parameter เท่านั้น
   holdout = ตั้งแต่ HOLDOUT_START วัดผลครั้งเดียวด้วยค่าที่เลือกไว้แล้ว ไม่มีการจูนบน holdout
5. วัดด้วย log-loss, Brier (พร้อม bootstrap 95%), calibration, top-K hit rate และ permutation check
   (สลับลำดับงวดแล้วรันใหม่ ถ้าลำดับเวลามีข้อมูลจริง ผลจริงควรดีกว่าผลที่สลับลำดับ)

ใช้ไลบรารีมาตรฐานของ Python เท่านั้น
รัน: python scripts/lotto_ml_study.py  → เขียน data/analysis/ml_study.json
"""
import argparse
import datetime
import hashlib
import json
import math
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import lotto_data as L  # noqa: E402

CSV_PATH = os.path.join(ROOT, "data", "thai_lottery.csv")
OUT_PATH = os.path.join(ROOT, "data", "analysis", "ml_study.json")
SCHEMA_VERSION = 1

# ทุกค่าในนี้กำหนดไว้ก่อนดูผล holdout และถูกบันทึกลง JSON
CONFIG = {
    "min_train_draws": 200,          # งวดแรกที่ทาย = index 200 (งวดที่ 201)
    "holdout_start": "2017-01-01",   # ตรงกับ backtest เดิม
    "freq_grid": {"window": [10, 25, 50, 100, 200, 0], "alpha": [0.5, 1, 2, 5, 10, 20, 50, 100]},
    "logit_grid": {"lr": [0.003, 0.01, 0.03, 0.1], "l2": [0.0, 0.001, 0.01, 0.1]},
    "logit_fixed": {"pretrain_epochs": 3, "replay": 5},
    "features": ["recent10", "recent50", "all_history", "gap", "is_previous"],
    "topk": {"last2": [1, 5, 10], "digit": [1, 3]},
    "calibration_edges": [0.0, 0.8, 0.9, 1.0, 1.1, 1.25],   # หน่วย = p × K (1.0 คือเท่า uniform)
    "bootstrap": 2000,
    "permutations": 20,
    "seed": 20261106,
}
MODELS = ("uniform", "freq", "logit")
DIGIT_TARGETS = tuple(f"first_d{i}" for i in range(1, 7))


# ---------- data ----------
def extract_series(draws):
    """คืน dates และ series ของแต่ละเป้าหมาย (int) เรียงตามเวลา"""
    dates = [d["draw_date"] for d in draws]
    series = {"last2": [int(d["prizes"]["last2"][0]) for d in draws]}
    for i in range(6):
        series[f"first_d{i + 1}"] = [int(d["prizes"]["first"][0][i]) for d in draws]
    return dates, series


def prefix_counts(series, k):
    """cum[t][c] = จำนวนครั้งที่ c ออกในงวด index < t"""
    cum = [[0] * k]
    for v in series:
        row = cum[-1][:]
        row[v] += 1
        cum.append(row)
    return cum


# ---------- math ----------
def softmax(scores):
    m = max(scores)
    e = [math.exp(s - m) for s in scores]
    z = sum(e)
    return [x / z for x in e]


def log_loss(p, y):
    return -math.log(max(p[y], 1e-15))


def brier(p, y):
    return sum((q - (1.0 if c == y else 0.0)) ** 2 for c, q in enumerate(p))


def rank_of(p, y):
    """อันดับของเลขที่ออกจริง (1 = โมเดลให้โอกาสสูงสุด) ถ้าเท่ากันนับแบบกลาง ๆ"""
    higher = sum(1 for q in p if q > p[y])
    ties = sum(1 for q in p if q == p[y]) - 1
    return 1 + higher + ties / 2


# ---------- models (ทุกฟังก์ชันใช้แค่ series[:t]) ----------
def predict_uniform(k, n):
    return [[1.0 / k] * k for _ in range(n)]


def walk_freq(series, k, start, window, alpha, cum=None):
    """ความน่าจะเป็นของงวด start..end จากความถี่ใน window งวดก่อนหน้า (0 = ทั้งหมด) + alpha"""
    cum = cum or prefix_counts(series, k)
    out = []
    for t in range(start, len(series)):
        lo = 0 if window == 0 else max(0, t - window)
        c = [cum[t][j] - cum[lo][j] for j in range(k)]
        z = sum(c) + k * alpha
        out.append([(x + alpha) / z for x in c])
    return out


def features_at(series, k, t, cum, last_seen):
    """feature ต่อเลข c จากประวัติ series[:t] เท่านั้น (last_seen = index ล่าสุดที่ c ออก ก่อน t)"""
    feats = []
    prev = series[t - 1] if t > 0 else -1
    w10, w50 = min(10, t), min(50, t)
    for c in range(k):
        r10 = (cum[t][c] - cum[t - w10][c]) * k / w10 - 1 if w10 else 0.0
        r50 = (cum[t][c] - cum[t - w50][c]) * k / w50 - 1 if w50 else 0.0
        allh = cum[t][c] * k / t - 1 if t else 0.0
        gap = (t - last_seen[c]) if last_seen[c] >= 0 else t
        feats.append((r10, r50, allh, min(gap, 3 * k) / k, 1.0 if c == prev else 0.0))
    return feats


def all_features(series, k, cum=None):
    """F[t] = feature ของงวด t (คำนวณจาก series[:t]) สำหรับทุก t"""
    cum = cum or prefix_counts(series, k)
    last_seen = [-1] * k
    out = []
    for t in range(len(series)):
        out.append(features_at(series, k, t, cum, last_seen))
        last_seen[series[t]] = t
    return out


def _probs(feats, w):
    return softmax([sum(a * b for a, b in zip(f, w)) for f in feats])


def _sgd(feats, y, w, lr, l2):
    p = _probs(feats, w)
    d = len(w)
    g = [l2 * w[j] for j in range(d)]
    for c, f in enumerate(feats):
        coef = p[c] - (1.0 if c == y else 0.0)
        if coef:
            for j in range(d):
                g[j] += coef * f[j]
    for j in range(d):
        w[j] -= lr * g[j]


def walk_logit(series, k, start, lr, l2, seed, pretrain_epochs=3, replay=5, feats=None):
    """Softmax regression (น้ำหนักร่วมทุกเลข) เรียนแบบ online:
    - ก่อนทายงวดแรก: ฝึกบนงวด 1..start-1 (pretrain_epochs รอบ)
    - งวด t: ทายด้วยน้ำหนักปัจจุบัน (เห็นแค่ < t) → แล้วจึงอัปเดตด้วยงวด t และสุ่มทวนงวดเก่า replay งวด
    คืน (probs ของงวด start.., น้ำหนักสุดท้าย)"""
    feats = feats or all_features(series, k)
    rng = random.Random(seed)
    w = [0.0] * len(feats[0][0])
    idx = list(range(1, start))
    for _ in range(pretrain_epochs):
        rng.shuffle(idx)
        for t in idx:
            _sgd(feats[t], series[t], w, lr, l2)
    out = []
    for t in range(start, len(series)):
        out.append(_probs(feats[t], w))
        _sgd(feats[t], series[t], w, lr, l2)
        for _ in range(replay):
            u = rng.randint(1, t)
            _sgd(feats[u], series[u], w, lr, l2)
    return out, w


# ---------- metrics ----------
def mean(xs):
    return sum(xs) / len(xs) if xs else float("nan")


def bootstrap_ci(diffs, n, seed):
    """95% CI ของค่าเฉลี่ย diffs (paired bootstrap ตามงวด)"""
    rng = random.Random(seed)
    m = len(diffs)
    means = sorted(sum(diffs[rng.randrange(m)] for _ in range(m)) / m for _ in range(n))
    return [means[int(0.025 * n)], means[int(0.975 * n) - 1]]


def calibration(probs, ys, k, edges):
    bins = [{"from": e, "to": (edges[i + 1] if i + 1 < len(edges) else None), "n": 0, "p_sum": 0.0, "hits": 0}
            for i, e in enumerate(edges)]
    for p, y in zip(probs, ys):
        for c, q in enumerate(p):
            r = q * k
            i = max(j for j, e in enumerate(edges) if r >= e)
            b = bins[i]
            b["n"] += 1
            b["p_sum"] += q
            b["hits"] += (c == y)
    out = []
    for b in bins:
        if b["n"]:
            out.append({"p_times_k_from": b["from"], "p_times_k_to": b["to"], "n": b["n"],
                        "mean_predicted": b["p_sum"] / b["n"], "observed": b["hits"] / b["n"]})
    return out


def topk_credit(p, y, kk):
    """โอกาสที่เลขจริงอยู่ใน top-kk เมื่อสุ่มตัดสินเลขที่ค่าเท่ากัน (uniform ได้ kk/K พอดี)"""
    higher = sum(1 for q in p if q > p[y])
    ties = sum(1 for q in p if q == p[y])
    return min(1.0, max(0.0, (kk - higher) / ties))


def topk_hits(probs, ys, ks):
    out = {}
    k = len(probs[0]) if probs else 1
    for kk in ks:
        hits = sum(topk_credit(p, y, kk) for p, y in zip(probs, ys))
        out[str(kk)] = {"hits": hits, "rate": hits / len(ys) if ys else None, "random_expected_rate": kk / k}
    return out


def score(probs, ys):
    return [log_loss(p, y) for p, y in zip(probs, ys)], [brier(p, y) for p, y in zip(probs, ys)]


# ---------- study ----------
def split_ranges(dates, start, holdout_start):
    val = [t for t in range(start, len(dates)) if dates[t] < holdout_start]
    hold = [t for t in range(start, len(dates)) if dates[t] >= holdout_start]
    return val, hold


def run_models(series, k, start, params, cum=None, feats=None, seed=0):
    """รันทุกโมเดลด้วย hyper-parameter ที่กำหนด คืน {model: probs งวด start..}"""
    cum = cum or prefix_counts(series, k)
    n = len(series) - start
    fp, lp = params["freq"], params["logit"]
    return {
        "uniform": predict_uniform(k, n),
        "freq": walk_freq(series, k, start, fp["window"], fp["alpha"], cum),
        "logit": walk_logit(series, k, start, lp["lr"], lp["l2"], seed, feats=feats,
                            **CONFIG["logit_fixed"])[0],
    }


def tune(group, data, start, val):
    """เลือก hyper-parameter จาก validation log-loss เท่านั้น (รวมทุกเป้าหมายในกลุ่ม)"""
    seed = CONFIG["seed"]
    val_off = [t - start for t in val]

    def val_loss(probs_by_target):
        return sum(mean([log_loss(probs[i], data[name]["series"][start + i]) for i in val_off])
                   for name, probs in probs_by_target.items())

    freq_scores, logit_scores = [], []
    for wnd in CONFIG["freq_grid"]["window"]:
        for a in CONFIG["freq_grid"]["alpha"]:
            v = val_loss({n: walk_freq(data[n]["series"], data[n]["k"], start, wnd, a, data[n]["cum"]) for n in group})
            freq_scores.append({"window": wnd, "alpha": a, "val_logloss": v})
    for lr in CONFIG["logit_grid"]["lr"]:
        for l2 in CONFIG["logit_grid"]["l2"]:
            v = val_loss({n: walk_logit(data[n]["series"], data[n]["k"], start, lr, l2, seed, feats=data[n]["feats"],
                                        **CONFIG["logit_fixed"])[0] for n in group})
            logit_scores.append({"lr": lr, "l2": l2, "val_logloss": v})
    bf = min(freq_scores, key=lambda r: r["val_logloss"])
    bl = min(logit_scores, key=lambda r: r["val_logloss"])
    uni = sum(math.log(data[n]["k"]) for n in group)
    return ({"freq": {"window": bf["window"], "alpha": bf["alpha"]}, "logit": {"lr": bl["lr"], "l2": bl["l2"]}},
            {"uniform_val_logloss": uni, "freq": freq_scores, "logit": logit_scores})


def evaluate(probs, ys, k, idx, start, seed, uniform_ll, uniform_br):
    off = [t - start for t in idx]
    p = [probs[i] for i in off]
    y = [ys[t] for t in idx]
    ll, br = score(p, y)
    dll = [a - uniform_ll for a in ll]
    dbr = [a - uniform_br for a in br]
    return {
        "draws": len(y),
        "logloss": mean(ll),
        "logloss_minus_uniform": mean(dll),
        "logloss_minus_uniform_ci95": bootstrap_ci(dll, CONFIG["bootstrap"], seed),
        "brier": mean(br),
        "brier_minus_uniform": mean(dbr),
        "brier_minus_uniform_ci95": bootstrap_ci(dbr, CONFIG["bootstrap"], seed + 1),
        "mean_rank": mean([rank_of(q, a) for q, a in zip(p, y)]),
        "topk": topk_hits(p, y, CONFIG["topk"]["last2" if k == 100 else "digit"]),
    }


def verdict(ci):
    if ci[1] < 0:
        return "lower_logloss_than_uniform"
    if ci[0] > 0:
        return "higher_logloss_than_uniform"
    return "no_difference_from_uniform"


def permutation_check(group, data, start, hold, params, actual_delta):
    """สลับลำดับงวด (seed คงที่) แล้วรันใหม่ด้วยค่าที่เลือกไว้ เทียบ Δlog-loss ช่วง holdout (รวมทั้งกลุ่ม)"""
    rng = random.Random(CONFIG["seed"] + 99)
    n = len(next(iter(data.values()))["series"])
    off = [t - start for t in hold]
    deltas = {"freq": [], "logit": []}
    for _ in range(CONFIG["permutations"]):
        order = list(range(n))
        rng.shuffle(order)
        tot = {"freq": 0.0, "logit": 0.0}
        for name in group:
            k = data[name]["k"]
            s = [data[name]["series"][i] for i in order]
            pr = run_models(s, k, start, params, seed=CONFIG["seed"])
            for m in tot:
                tot[m] += mean([log_loss(pr[m][i], s[start + i]) for i in off]) - math.log(k)
        for m in tot:
            deltas[m].append(tot[m])
    out = {}
    for m in deltas:
        d = sorted(deltas[m])
        out[m] = {"actual_delta": actual_delta[m], "shuffled_deltas": d,
                  "share_shuffled_at_or_below_actual": sum(1 for x in d if x <= actual_delta[m]) / len(d)}
    return out


def study_group(label, group, data, dates, start, val, hold):
    params, tuning = tune(group, data, start, val)
    targets, combined_dll = {}, {m: [0.0] * len(hold) for m in MODELS}
    preds = {}
    for j, name in enumerate(group):
        k, ys = data[name]["k"], data[name]["series"]
        probs = run_models(ys, k, start, params, data[name]["cum"], data[name]["feats"], seed=CONFIG["seed"])
        preds[name] = probs
        u_ll, u_br = math.log(k), 1 - 1 / k
        res = {}
        for m in MODELS:
            res[m] = {"validation": evaluate(probs[m], ys, k, val, start, CONFIG["seed"] + j, u_ll, u_br),
                      "holdout": evaluate(probs[m], ys, k, hold, start, CONFIG["seed"] + j, u_ll, u_br)}
            for i, t in enumerate(hold):
                combined_dll[m][i] += log_loss(probs[m][t - start], ys[t]) - u_ll
            res[m]["holdout"]["calibration"] = calibration([probs[m][t - start] for t in hold],
                                                           [ys[t] for t in hold], k, CONFIG["calibration_edges"])
            res[m]["verdict"] = ("baseline" if m == "uniform"
                                 else verdict(res[m]["holdout"]["logloss_minus_uniform_ci95"]))
        targets[name] = {"classes": k, "uniform_logloss": u_ll, "uniform_brier": u_br, "models": res}
    combined = {m: {"holdout_logloss_minus_uniform": mean(combined_dll[m]),
                    "ci95": bootstrap_ci(combined_dll[m], CONFIG["bootstrap"], CONFIG["seed"] + 50)}
                for m in ("freq", "logit")}
    perm = permutation_check(group, data, start, hold, params,
                             {m: combined[m]["holdout_logloss_minus_uniform"] for m in ("freq", "logit")})
    return {"label": label, "targets": list(group), "chosen_params": params, "tuning": tuning,
            "results": targets, "combined_holdout": combined, "permutation_check": perm}, preds


def per_draw_last2(dates, series, preds, start):
    rows = []
    for t in range(start, len(series)):
        i, y = t - start, series[t]
        rows.append({"date": dates[t], "actual": f"{y:02d}",
                     "p": {m: preds[m][i][y] for m in MODELS},
                     "rank": {m: rank_of(preds[m][i], y) for m in MODELS},
                     "top5": {m: [f"{c:02d}" for c in sorted(range(100), key=lambda c: -preds[m][i][c])[:5]]
                              for m in ("freq", "logit")}})
    return rows


def _round(o, nd=6):
    if isinstance(o, float):
        return round(o, nd)
    if isinstance(o, dict):
        return {k: _round(v, nd) for k, v in o.items()}
    if isinstance(o, list):
        return [_round(v, nd) for v in o]
    return o


def file_sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def run(csv_path=CSV_PATH):
    t0 = time.perf_counter()
    draws, _ = L.load(csv_path)
    dates, series = extract_series(draws)
    start = CONFIG["min_train_draws"]
    val, hold = split_ranges(dates, start, CONFIG["holdout_start"])
    data = {}
    for name, s in series.items():
        k = 100 if name == "last2" else 10
        cum = prefix_counts(s, k)
        data[name] = {"series": s, "k": k, "cum": cum, "feats": all_features(s, k, cum)}

    last2, p_last2 = study_group("เลขท้าย 2 ตัว", ("last2",), data, dates, start, val, hold)
    digits, _ = study_group("เลขแต่ละหลักของรางวัลที่ 1", DIGIT_TARGETS, data, dates, start, val, hold)
    elapsed = time.perf_counter() - t0
    out = {
        "schema_version": SCHEMA_VERSION,
        "csv_sha256": file_sha256(csv_path),
        "code_sha": file_sha256(os.path.abspath(__file__)),
        "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "runtime_seconds": elapsed,
        "config": CONFIG,
        "data_through": dates[-1],
        "draw_count": len(dates),
        "evaluation": {
            "first_predicted_index": start,
            "rule": "draw t is predicted using only draws with index < t",
            "pre_registered_split": "hyper-parameters chosen on validation log-loss only; holdout scored once",
            "validation": {"from": dates[val[0]], "to": dates[val[-1]], "draws": len(val)},
            "holdout": {"from": dates[hold[0]], "to": dates[hold[-1]], "draws": len(hold)},
            "permutation_note": "draw order shuffled with fixed seed, chosen params re-run (not re-tuned)",
        },
        "groups": {"last2": last2, "first_digits": digits},
        "per_draw_last2": per_draw_last2(dates, series["last2"], p_last2["last2"], start),
    }
    return _round(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=OUT_PATH)
    args = ap.parse_args(argv)
    out = run()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote {args.out} in {out['runtime_seconds']:.1f}s")
    for key, g in out["groups"].items():
        for m in ("freq", "logit"):
            c = g["combined_holdout"][m]
            p = g["permutation_check"][m]["share_shuffled_at_or_below_actual"]
            print(f"  {key:<12} {m:<6} holdout Δlogloss={c['holdout_logloss_minus_uniform']:+.4f} "
                  f"CI95={c['ci95']} perm={p}")


if __name__ == "__main__":
    main()
