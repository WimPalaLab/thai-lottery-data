"""Walk-forward backtest ของ hybrid model เทียบกับการเลือกเลขแบบสุ่ม

หลักการ (ไม่มีข้อมูลอนาคตรั่ว):
1. ก่อนงวด t ฝึกทุกโมเดลจากงวด index < t เท่านั้น (models_at)
2. จัดอันดับเลขทั้ง 1 ล้านเลข แล้วเลือก K อันดับแรกต่อรางวัล (K เท่ากับที่ใช้จริงใน snapshot)
3. เทียบกับผลจริงของงวด t: นับเลขที่ตรงทั้ง 6 หลักกับรางวัลเดียวกัน และดูว่าเลขที่ออกจริงอยู่อันดับเท่าไร
4. เลื่อนไปงวดถัดไป

การปรับน้ำหนัก hybrid (A–F) ใช้เฉพาะช่วง validation (ก่อน holdout_start) ช่วง holdout ไม่ถูกใช้เลือกค่าใด ๆ
Baseline สุ่ม: เลือก K เลขแบบสุ่มจาก 1 ล้านเลขต่อรางวัลต่องวด (จำนวนเท่ากัน ช่วงเดียวกัน) จำลองหลายรอบด้วย seed คงที่
"""
import math
import multiprocessing

import numpy as np

import lotto_model as M

SUBSAMPLE = 100_000      # ใช้ประมาณ percentile ของเลขที่ออกจริง (คลาดเคลื่อนราว ±0.3% ต่อเลข)
CAND_TOP = 300           # ผู้สมัครจาก global/prize model สำหรับหาเกณฑ์ top-K ของ hybrid (ผลยังแม่นตรง)
SPLITS = ("validation", "holdout", "all")


# ---------- data ----------
def prepare(draws):
    """แปลงงวด (จาก lotto_data.load) เป็น array เลข int พร้อม index งวด"""
    def collect(key):
        idx, val = [], []
        for i, d in enumerate(draws):
            for v in d["prizes"][key]:
                idx.append(i)
                val.append(int(v))
        return np.array(idx, dtype=np.int64), np.array(val, dtype=np.int64)

    return {
        "dates": [d["draw_date"] for d in draws],
        "avail": np.array([d["prizes_2_to_5_available"] for d in draws]),
        "six": {k: collect(k) for k in M.SIX_PRIZES},
        "partial": {k: collect(k) for k in ("front3", "back3", "last2")},
        "n": len(draws),
    }


def _recent(idx, val, mask, window):
    """เลขจาก window งวดล่าสุด (ที่มีเลขชุดนี้) ในส่วนที่ mask อนุญาต"""
    have = np.unique(idx[mask])
    if not len(have):
        return val[:0]
    return val[mask & (idx >= have[-window:][0])]


def models_at(prep, t, cfg):
    """ฝึก Global model และ Prize model ทั้ง 5 จากงวด index < t เท่านั้น"""
    w = cfg["time_window_draws"]
    prize_models, pooled, pooled_recent = {}, [], []
    any_idx = np.concatenate([prep["six"][k][0] for k in M.SIX_PRIZES])
    have_any = np.unique(any_idx[any_idx < t])
    first_recent = have_any[-w:][0] if len(have_any) else t
    for k in M.SIX_PRIZES:
        idx, val = prep["six"][k]
        mask = idx < t
        obs = val[mask]
        prize_models[k] = M.model_from_obs(obs, _recent(idx, val, mask, w), cfg, scope=k)
        pooled.append(obs)
        pooled_recent.append(val[mask & (idx >= first_recent)])
    partial = {k: v[i < t] for k, (i, v) in prep["partial"].items()}
    g = M.model_from_obs(np.concatenate(pooled), np.concatenate(pooled_recent), cfg, scope="global", partial=partial)
    return g, prize_models


def eval_indices(prep, cfg):
    """งวดที่ประเมินได้: มีรางวัลที่ 2–5 และมีงวดที่มีรางวัลครบก่อนหน้าอย่างน้อย min_training_draws งวด"""
    need = cfg["backtest"]["min_training_draws"]
    avail = prep["avail"]
    before = np.concatenate([[0], np.cumsum(avail)[:-1]])
    return [t for t in range(prep["n"]) if avail[t] and before[t] >= need]


def config_list(cfg):
    out = [("global", 1.0), ("prize", 0.0)]
    out += [(k, float(v)) for k, v in sorted(cfg["hybrid_experiments"].items())]
    return out


# ---------- one step ----------
def _topk_threshold_hits(zg, zp, w, k, cand, winners):
    """จำนวนเลขที่ออกจริงที่อยู่ใน top-k ของ hybrid (ผลเหมือน M.top_k ทุกประการ)"""
    hc = w * zg[cand] + (1 - w) * zp[cand]
    v0 = np.partition(hc, len(hc) - k)[len(hc) - k]     # เกณฑ์ขั้นต่ำ: top-k จริงต้อง ≥ v0
    h = w * zg + (1 - w) * zp
    sel = np.flatnonzero(h >= v0)
    order = np.lexsort((sel, -h[sel]))
    top = sel[order[:k]]
    return int(np.isin(winners, top).sum()), h


def _percentiles(h, sub, winners):
    """percentile ของเลขที่ออกจริง (0 = อันดับบนสุด, 1 = ล่างสุด) ประมาณจากตัวอย่างคงที่"""
    if not len(winners):
        return np.zeros(0)
    s = np.sort(h[winners])
    pos = np.searchsorted(s, h[sub], side="left")
    hist = np.bincount(pos, minlength=len(s) + 1)
    greater = np.cumsum(hist[::-1])[::-1][1:]          # จำนวนตัวอย่างที่คะแนนมากกว่า s[j]
    pct_sorted = (greater + 0.5) / len(sub)
    order = np.argsort(h[winners], kind="stable")
    out = np.empty(len(winners))
    out[order] = pct_sorted
    return out


_W = {}


def _init(prep, cfg):
    _W["prep"], _W["cfg"] = prep, cfg
    _W["sub"] = np.random.default_rng(12345).choice(M.N, SUBSAMPLE, replace=False)
    M.universe()


def evaluate_draw(t, prep=None, cfg=None):
    """ประเมินงวด index t: คืน {prize: {config: (hits, percentiles)}}"""
    if prep is None:
        prep, cfg, sub = _W["prep"], _W["cfg"], _W["sub"]
    else:
        sub = np.random.default_rng(12345).choice(M.N, SUBSAMPLE, replace=False)
    g, pms = models_at(prep, t, cfg)
    zg = g.scores
    gtop = np.argpartition(-zg, CAND_TOP)[:CAND_TOP]
    out = {}
    for k in M.SIX_PRIZES:
        idx, val = prep["six"][k]
        winners = val[idx == t]
        K = cfg["candidate_counts"][k]
        zp = pms[k].scores
        cand = np.union1d(gtop, np.argpartition(-zp, CAND_TOP)[:CAND_TOP])
        res = {}
        for name, w in config_list(cfg):
            hits, h = _topk_threshold_hits(zg, zp, w, K, cand, winners)
            res[name] = (hits, _percentiles(h, sub, winners).astype(np.float32))
        out[k] = res
    return out


def run_walk_forward(draws, cfg, workers=None, indices=None):
    prep = prepare(draws)
    idxs = eval_indices(prep, cfg) if indices is None else indices
    workers = workers or max(1, min(4, multiprocessing.cpu_count()))
    if workers == 1:
        _init(prep, cfg)
        recs = [evaluate_draw(t) for t in idxs]
    else:
        ctx = multiprocessing.get_context("spawn")
        with ctx.Pool(workers, initializer=_init, initargs=(prep, cfg)) as pool:
            recs = pool.map(evaluate_draw, idxs, chunksize=4)
    return prep, idxs, recs


# ---------- statistics ----------
def norm_sf(z):
    return 0.5 * math.erfc(z / math.sqrt(2))


def tune(records, idxs, prep, cfg, split_of):
    """เลือกน้ำหนัก hybrid ต่อรางวัลจากช่วง validation เท่านั้น (percentile เฉลี่ยต่ำสุด = ดีที่สุด)"""
    chosen, scores = {}, {}
    exps = sorted(cfg["hybrid_experiments"])
    for k in M.SIX_PRIZES:
        sc = {}
        for e in exps:
            vals = [r[k][e][1] for r, t in zip(records, idxs) if split_of(t) == "validation"]
            sc[e] = float(np.concatenate(vals).mean()) if vals and sum(len(v) for v in vals) else None
        scores[k] = sc
        valid = {e: v for e, v in sc.items() if v is not None}
        if valid:
            best = min(valid.values())
            # เสมอกัน (หรือต่างกันไม่ถึง 1e-12) เลือกค่าเริ่มต้นก่อน แล้วตามลำดับตัวอักษร
            ties = [e for e in exps if e in valid and valid[e] - best < 1e-12]
            chosen[k] = cfg["default_experiment"] if cfg["default_experiment"] in ties else ties[0]
        else:
            chosen[k] = cfg["default_experiment"]
    return chosen, scores


def random_baseline(m_list, K, trials, seed):
    """จำนวนเลขที่ถูกรวมทุกงวด ถ้าเลือก K เลขแบบสุ่มจาก 1 ล้านเลข (hypergeometric ต่องวด)"""
    if not m_list:
        return {"expected": 0.0, "lo95": 0, "hi95": 0}, np.zeros(trials)
    rng = np.random.default_rng(seed)
    m = np.array(m_list)
    tot = np.zeros(trials)
    for mv in np.unique(m):
        c = int((m == mv).sum())
        tot += rng.hypergeometric(int(mv), M.N - int(mv), K, size=(trials, c)).sum(axis=1)
    exp = float((m * K / M.N).sum())
    return {"expected": round(exp, 5), "lo95": float(np.percentile(tot, 2.5)), "hi95": float(np.percentile(tot, 97.5))}, tot


def summarize_block(items, rand_dist):
    """items: [(hits, percentiles)] ของแต่ละงวด"""
    n = len(items)
    hits = int(sum(h for h, _ in items))
    pcts = np.concatenate([p for _, p in items]) if items else np.zeros(0)
    out = {"draws": n, "hits": hits, "draws_with_hit": int(sum(1 for h, _ in items if h)),
           "hits_per_100": round(hits / n * 100, 4) if n else None}
    if rand_dist is not None and n:
        out["p_random_ge"] = round(float((rand_dist >= hits).mean()), 4)
    if len(pcts):
        mean = float(pcts.mean())
        se_null = math.sqrt(1 / 12 / len(pcts))
        se_obs = float(pcts.std(ddof=1) / math.sqrt(len(pcts))) if len(pcts) > 1 else se_null
        z = (mean - 0.5) / se_null
        out.update({
            "numbers": int(len(pcts)),
            "mean_pct": round(mean, 5),
            "mean_pct_ci": [round(mean - 1.96 * se_obs, 5), round(mean + 1.96 * se_obs, 5)],
            "null_ci": [round(0.5 - 1.96 * se_null, 5), round(0.5 + 1.96 * se_null, 5)],
            "median_pct": round(float(np.median(pcts)), 5),
            "top1pct_share": round(float((pcts <= 0.01).mean()), 5),
            "z": round(z, 3),
            "p_two_sided": round(2 * norm_sf(abs(z)), 4),
        })
    return out


def summarize(prep, idxs, records, cfg):
    bt = cfg["backtest"]
    dates = prep["dates"]
    split_of = lambda t: "validation" if dates[t] < bt["holdout_start"] else "holdout"  # noqa: E731
    chosen, tune_scores = tune(records, idxs, prep, cfg, split_of)
    configs = config_list(cfg)
    names = [c for c, _ in configs]
    by_split = {s: [i for i, t in enumerate(idxs) if s == "all" or split_of(t) == s] for s in SPLITS}

    results, rand = {}, {}
    rand_tot = {s: np.zeros(bt["random_trials"]) for s in SPLITS}
    exp_tot = {s: 0.0 for s in SPLITS}
    for pi, k in enumerate(M.SIX_PRIZES):
        K = cfg["candidate_counts"][k]
        idx = prep["six"][k][0]
        rand[k], dists = {}, {}
        for si, s in enumerate(SPLITS):
            m_list = [int((idx == idxs[i]).sum()) for i in by_split[s]]
            info, dist = random_baseline(m_list, K, bt["random_trials"], [bt["random_seed"], pi, si])
            info.update(trials=bt["random_trials"], seed=[bt["random_seed"], pi, si])
            rand[k][s], dists[s] = info, dist
            rand_tot[s] += dist
            exp_tot[s] += info["expected"]
        results[k] = {c: {s: summarize_block([records[i][k][c] for i in by_split[s]], dists[s]) for s in SPLITS}
                      for c in names}
        results[k]["tuned"] = {s: summarize_block([records[i][k][chosen[k]] for i in by_split[s]], dists[s])
                               for s in SPLITS}

    overall = {}
    for c in names + ["tuned"]:
        overall[c] = {}
        for s in SPLITS:
            hits = sum(results[k][c][s]["hits"] for k in M.SIX_PRIZES)
            overall[c][s] = {"hits": hits, "expected": round(exp_tot[s], 5),
                             "lo95": float(np.percentile(rand_tot[s], 2.5)),
                             "hi95": float(np.percentile(rand_tot[s], 97.5)),
                             "p_random_ge": round(float((rand_tot[s] >= hits).mean()), 4),
                             "mean_pct_by_prize": round(float(np.mean([results[k][c][s].get("mean_pct", 0.5)
                                                                       for k in M.SIX_PRIZES])), 5)}

    nb = bt["stability_blocks"]
    blocks = [list(b) for b in np.array_split(np.arange(len(idxs)), nb) if len(b)]
    stability = {"blocks": [{"from": dates[idxs[b[0]]], "to": dates[idxs[b[-1]]], "draws": len(b)} for b in blocks]}
    for k in M.SIX_PRIZES:
        stability[k] = {}
        for c in names + ["tuned"]:
            key = chosen[k] if c == "tuned" else c
            stability[k][c] = []
            for b in blocks:
                s = summarize_block([records[i][k][key] for i in b], None)
                stability[k][c].append({"hits": s["hits"], "mean_pct": s.get("mean_pct")})

    timeline = {"dates": [dates[t] for t in idxs]}
    for k in M.SIX_PRIZES:
        timeline[k] = {
            "config": chosen[k],
            "mean_pct": [round(float(r[k][chosen[k]][1].mean()), 4) if len(r[k][chosen[k]][1]) else None for r in records],
            "hits": [int(r[k][chosen[k]][0]) for r in records],
            "numbers_per_draw": int(np.median([len(r[k][chosen[k]][1]) for r in records])) if records else 0,
        }

    val_ids = [idxs[i] for i in by_split["validation"]]
    hold_ids = [idxs[i] for i in by_split["holdout"]]
    span = lambda ids: {"from": dates[ids[0]], "to": dates[ids[-1]], "draws": len(ids)} if ids else None  # noqa: E731
    return {
        "evaluation": {"first_draw": dates[idxs[0]], "last_draw": dates[idxs[-1]], "draws": len(idxs),
                       "training_min_draws": bt["min_training_draws"], "holdout_start": bt["holdout_start"],
                       "validation": span(val_ids), "holdout": span(hold_ids), "subsample": SUBSAMPLE},
        "candidate_counts": cfg["candidate_counts"],
        "configs": [{"id": c, "w_global": w} for c, w in configs],
        "tuning": {"metric": "mean_pct", "split": "validation", "chosen": chosen, "scores": tune_scores},
        "results": results,
        "random": rand,
        "overall": overall,
        "stability": stability,
        "timeline": timeline,
    }
