"""V4: อันดับความถี่ที่ซื่อตรง — ทุกอันดับมาพร้อมค่าที่การสุ่มจริงให้ได้ตามปกติ

- order statistics จาก Monte Carlo: ถ้าสุ่มจริง เลขอันดับ r (เรียงจากออกบ่อยไปน้อย) มักออกกี่ครั้ง
  เพราะเลขอันดับ 1 ย่อม "ออกบ่อยกว่าที่คาด" เสมอ แม้การออกรางวัลจะสุ่มสมบูรณ์
- การแจกแจงของค่าสูงสุด/ต่ำสุดภายใต้การสุ่ม (histogram) และ P(สูงสุด ≥ ที่เห็นจริง)
- walk-forward backtest: เลือก 10 อันดับแรก (หรือสุดท้าย) จากช่วงย้อนหลังที่เลือก ก่อนทุกงวด แล้วนับว่าถูกกี่ครั้ง

ใช้ไลบรารีมาตรฐานเท่านั้น และ seed คงที่ (ผลเหมือนเดิมทุก build)"""
import datetime
import random
from collections import Counter

from lotto_analysis import all_numbers, binom_test_two_sided
from lotto_stats import binom_interval, eligible

SPACE = {"last2": 100, "back3": 1000, "front3": 1000}
WIDTH = {"first": 6, "front3": 3, "back3": 3, "last2": 2}
EDGE = 20  # เลข 3 ตัว: เก็บ order statistics เฉพาะ 20 อันดับแรกและ 20 อันดับสุดท้าย (ไฟล์ไม่ใหญ่เกินไป)

_MC = {}


def quantile(sorted_vals, q):
    return sorted_vals[min(len(sorted_vals) - 1, int(q * len(sorted_vals)))]


def order_stats_mc(slots, space, sims, seed=2538, keep=None):
    """จำลองการสุ่ม slots หมายเลขจาก space เลข sims รอบ แล้วเรียงจำนวนครั้งจากมากไปน้อย
    คืน ranks (1 = ออกบ่อยสุด), mean/lo/hi (ช่วง 95%) ของแต่ละอันดับ และ histogram ของค่าสูงสุด/ต่ำสุด"""
    key = (slots, space, sims, seed, tuple(keep) if keep else None)
    if key in _MC:
        return _MC[key]
    ranks = keep or list(range(1, space + 1))
    rng = random.Random(seed)
    pop = range(space)
    per = [[] for _ in ranks]
    maxs, mins = Counter(), Counter()
    for _ in range(sims):
        c = [0] * space
        for v in rng.choices(pop, k=slots):
            c[v] += 1
        c.sort(reverse=True)
        maxs[c[0]] += 1
        mins[c[-1]] += 1
        for j, r in enumerate(ranks):
            per[j].append(c[r - 1])
    mean, lo, hi = [], [], []
    for v in per:
        v.sort()
        mean.append(sum(v) / sims)
        lo.append(quantile(v, 0.025))
        hi.append(quantile(v, 0.975))
    out = {"sims": sims, "ranks": ranks, "mean": mean, "lo": lo, "hi": hi,
           "max_hist": sorted(maxs.items()), "min_hist": sorted(mins.items())}
    _MC[key] = out
    return out


def extreme_summary(hist, observed, upper=True):
    """ช่วง 95% ของค่าสูงสุด (หรือต่ำสุด) และสัดส่วนของการจำลองที่สุดโต่งเท่าหรือมากกว่าที่เห็นจริง"""
    total = sum(f for _, f in hist)
    vals = [v for v, f in hist for _ in range(f)]
    tail = sum(f for v, f in hist if (v >= observed if upper else v <= observed)) / total
    return {"observed": observed, "range95": [quantile(vals, 0.025), quantile(vals, 0.975)],
            "share_as_extreme": tail, "hist": [list(x) for x in hist]}


def number_ranking(draws, prize, sims=None):
    space = SPACE[prize]
    width = WIDTH[prize]
    nums = all_numbers(draws, prize)
    slots = len(nums)
    if not slots:
        return None
    counts = Counter(nums)
    keys = [f"{i:0{width}d}" for i in range(space)]
    obs = sorted((counts[k] for k in keys), reverse=True)
    keep = None if space <= 100 else list(range(1, EDGE + 1)) + list(range(space - EDGE + 1, space + 1))
    mc = order_stats_mc(slots, space, sims or (1000 if space <= 100 else 500), keep=keep)
    lo, hi = binom_interval(slots, 1 / space)
    return {
        "prize": prize, "space": space, "slots": slots, "eligible_draws": len(eligible(draws, prize)),
        "expected": slots / space, "range95": [lo, hi],
        # โอกาสที่เลขหนึ่งจะอยู่ในรางวัลนี้งวดหน้า (เท่ากันทุกเลข): 1 − (1 − 1/space)^หมายเลขต่องวดล่าสุด
        "per_draw": len(eligible(draws, prize)[-1]["prizes"][prize]),
        "order": {"ranks": mc["ranks"], "mean": mc["mean"], "lo": mc["lo"], "hi": mc["hi"], "sims": mc["sims"]},
        "max": extreme_summary(mc["max_hist"], obs[0], True),
        "min": extreme_summary(mc["min_hist"], obs[-1], False),
    }


def digit_ranking(draws, prize, sims=1000):
    """อันดับตัวเลข 0–9 ในแต่ละหลัก: order statistics ของ Multinomial(n, 1/10)"""
    nums = all_numbers(draws, prize)
    n = len(nums)
    if not n:
        return None
    mc = order_stats_mc(n, 10, sims)
    return {"prize": prize, "n": n, "order": {"ranks": mc["ranks"], "mean": mc["mean"], "lo": mc["lo"],
                                               "hi": mc["hi"], "sims": mc["sims"]}}


def ranking_scope(draws):
    out = {p: number_ranking(draws, p) for p in SPACE}
    out["digits"] = {p: digit_ranking(draws, p) for p in WIDTH}
    return out


# ---------- walk-forward backtest แบบเลือก 10 อันดับ ----------

LOOKBACKS = [("all", None), ("last20y", 20), ("last10y", 10), ("last5y", 5)]


def years_before(date_str, years):
    d = datetime.date.fromisoformat(date_str)
    try:
        return d.replace(year=d.year - years).isoformat()
    except ValueError:  # 29 ก.พ.
        return d.replace(year=d.year - years, day=28).isoformat()


def backtest_topk(draws, years=None, pick=10, warmup=100):
    """ก่อนแต่ละงวด t (หลัง warmup งวดแรก) นับเลขท้าย 2 ตัวจากงวดก่อน t ที่อยู่ในช่วง years ปีย้อนหลัง
    (None = ทุกงวดก่อนหน้า) เลือก pick อันดับแรกและ pick อันดับสุดท้าย (เสมอกันเลือกเลขน้อยก่อน) แล้วดูว่าถูกไหม
    ใช้เฉพาะข้อมูลก่อนงวดนั้น (ไม่มีข้อมูลอนาคต)"""
    seq = [(d["draw_date"], d["prizes"]["last2"][0]) for d in draws if d["prizes"]["last2"]]
    keys = [f"{i:02d}" for i in range(100)]
    counts = Counter()
    left = 0
    hits = {"top": 0, "bottom": 0}
    trials = 0
    for t, (date, actual) in enumerate(seq):
        if years is not None:
            cut = years_before(date, years)
            while left < t and seq[left][0] <= cut:
                counts[seq[left][1]] -= 1
                left += 1
        if t >= warmup:
            top = sorted(keys, key=lambda k: (-counts[k], k))[:pick]
            bottom = sorted(keys, key=lambda k: (counts[k], k))[:pick]
            trials += 1
            hits["top"] += actual in top
            hits["bottom"] += actual in bottom
        counts[actual] += 1
    p = pick / 100
    lo, hi = binom_interval(trials, p)
    return {
        "years": years, "pick": pick, "warmup": warmup, "trials": trials,
        "first_test": seq[warmup][0] if len(seq) > warmup else None,
        "chance_rate": p, "chance_range95": [lo / trials, hi / trials] if trials else [0, 0],
        "strategies": [{"name": k, "hits": hits[k], "rate": hits[k] / trials if trials else 0,
                        "p": binom_test_two_sided(hits[k], trials, p)} for k in ("top", "bottom")],
    }


def backtests(draws):
    return {k: backtest_topk(draws, y) for k, y in LOOKBACKS}
