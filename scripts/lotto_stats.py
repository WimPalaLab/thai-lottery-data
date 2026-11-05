"""สถิติจากผลสลาก: ความถี่เทียบค่าที่คาดไว้, chi-square, autocorrelation, backtest
ใช้ไลบรารีมาตรฐานของ Python เท่านั้น (ไม่มี numpy/scipy) เพื่อให้ตรวจสอบได้ง่ายและไม่มี dependency

หลักการ:
- นับเฉพาะงวดที่ "มีรางวัลนั้น" (ตัวหาร = งวดที่มีสิทธิ์) เช่น เลขหน้า 3 ตัวนับเฉพาะตั้งแต่ 1 ก.ย. 2558
- เลขท้าย 3 ตัวนับเป็น "ช่อง" (ยุคเก่า 4 ช่อง/งวด, ยุคใหม่ 2 ช่อง/งวด) แล้วคาดไว้ = ช่อง / 1000
- ทุกความถี่มาพร้อมค่าที่คาดไว้และช่วง 95% ที่การสุ่มล้วน ๆ ให้ได้ตามปกติ"""
import math
from collections import Counter

SPACE = {"last2": 100, "back3": 1000, "front3": 1000}


# ---------- การแจกแจงทวินามและ chi-square ----------

def binom_pmf(n, p):
    """คืนรายการ pmf ของ Binomial(n, p) สำหรับ k = 0..n (คำนวณด้วย log กัน overflow)"""
    lp, lq = math.log(p), math.log1p(-p)
    out = []
    for k in range(n + 1):
        lc = math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
        out.append(math.exp(lc + k * lp + (n - k) * lq))
    return out


def binom_interval(n, p, level=0.95):
    """ช่วงกลาง level ของ Binomial(n, p): คืน (lo, hi) เป็นจำนวนเต็ม"""
    if n == 0:
        return 0, 0
    pmf = binom_pmf(n, p)
    a = (1 - level) / 2
    cum, lo, hi = 0.0, None, n
    for k, v in enumerate(pmf):
        cum += v
        if lo is None and cum >= a:
            lo = k
        if cum >= 1 - a:
            hi = k
            break
    return lo, hi


def gammq(a, x):
    """regularized upper incomplete gamma Q(a, x) (Numerical Recipes)"""
    if x < 0 or a <= 0:
        raise ValueError
    if x == 0:
        return 1.0
    gln = math.lgamma(a)
    if x < a + 1:  # อนุกรม
        ap, s, d = a, 1.0 / a, 1.0 / a
        for _ in range(10000):
            ap += 1
            d *= x / ap
            s += d
            if abs(d) < abs(s) * 1e-15:
                break
        return max(0.0, 1.0 - s * math.exp(-x + a * math.log(x) - gln))
    # continued fraction (Lentz)
    tiny = 1e-300
    b = x + 1 - a
    c = 1 / tiny
    d = 1 / b
    h = d
    for i in range(1, 10000):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        d = tiny if abs(d) < tiny else d
        c = b + an / c
        c = tiny if abs(c) < tiny else c
        d = 1 / d
        delta = d * c
        h *= delta
        if abs(delta - 1) < 1e-15:
            break
    return math.exp(-x + a * math.log(x) - gln) * h


def chi_square_uniform(counts):
    """ทดสอบว่า counts (list) กระจายเท่ากันหรือไม่: คืน dict(chi2, df, p)"""
    n, k = sum(counts), len(counts)
    if n == 0:
        return None   # ไม่มีข้อมูล ทดสอบไม่ได้
    e = n / k
    chi2 = sum((c - e) ** 2 / e for c in counts)
    df = k - 1
    return {"chi2": round(chi2, 3), "df": df, "p": gammq(df / 2, chi2 / 2), "n": n}


# ---------- ความถี่ ----------

def numbers_of(draw, prize):
    return draw["prizes"][prize]


def eligible(draws, prize):
    """งวดที่มีรางวัลนั้นจริง (ตัดงวดที่ยังไม่มีรางวัล/ไม่มีข้อมูลออก ไม่นับเป็น 0)"""
    return [d for d in draws if numbers_of(d, prize)]


def frequency(draws, prize):
    space = SPACE[prize]
    width = len(str(space - 1))
    el = eligible(draws, prize)
    counts = Counter()
    containing = Counter()
    slots = 0
    for d in el:
        nums = numbers_of(d, prize)
        slots += len(nums)
        counts.update(nums)
        containing.update(set(nums))
    p = 1 / space
    lo, hi = binom_interval(slots, p)
    keys = [f"{i:0{width}d}" for i in range(space)]
    out = {
        "prize": prize,
        "eligible_draws": len(el),
        "slots": slots,
        "first_draw": el[0]["draw_date"] if el else None,
        "last_draw": el[-1]["draw_date"] if el else None,
        "expected": slots * p,
        "range95": [lo, hi],
        "counts": [counts[k] for k in keys],
        "draws_containing": [containing[k] for k in keys],
        "chi_square": chi_square_uniform([counts[k] for k in keys]) if slots else None,
    }
    if space == 1000:
        # จำนวนเลขที่ออก k ครั้ง เทียบกับที่คาดไว้ ถ้าสุ่มจริง
        hist = Counter(counts[k] for k in keys)
        pmf = binom_pmf(slots, p)
        kmax = max(max(hist), hi + 2)
        out["count_histogram"] = {
            "observed": [hist.get(k, 0) for k in range(kmax + 1)],
            "expected": [space * (pmf[k] if k < len(pmf) else 0.0) for k in range(kmax + 1)],
        }
    return out


def digit_counts(numbers, position):
    c = [0] * 10
    for v in numbers:
        c[int(v[position])] += 1
    return c


def first_prize_digits(draws):
    firsts = [d["prizes"]["first"][0] for d in draws]
    out = []
    for pos in range(6):
        counts = digit_counts(firsts, pos)
        out.append({"position": pos + 1, "counts": counts, "chi_square": chi_square_uniform(counts)})
    return {"draws": len(firsts), "positions": out}


# ---------- การทดสอบความสุ่ม ----------

def autocorr_lag1(values):
    n = len(values)
    if n < 3:
        return None
    m = sum(values) / n
    num = sum((values[i] - m) * (values[i + 1] - m) for i in range(n - 1))
    den = sum((v - m) ** 2 for v in values)
    r = num / den if den else 0.0
    return {"r": round(r, 4), "n": n, "range95": [round(-1.96 / math.sqrt(n), 4), round(1.96 / math.sqrt(n), 4)]}


def backtest_last2(draws, pick=10, warmup=100):
    """walk-forward: ก่อนแต่ละงวด ใช้เฉพาะงวดก่อนหน้า เลือกเลขท้าย 2 ตัว pick ตัว แล้วนับว่าถูกกี่ครั้ง
    กลยุทธ์: hot = ออกบ่อยสุด, cold = ออกน้อยสุด, overdue = ไม่ออกนานสุด"""
    seq = [d["prizes"]["last2"][0] for d in draws if d["prizes"]["last2"]]
    keys = [f"{i:02d}" for i in range(100)]
    counts = Counter()
    last_seen = {k: -1 for k in keys}
    hits = Counter()
    trials = 0
    for t, actual in enumerate(seq):
        if t >= warmup:
            order = sorted(keys, key=lambda k: (-counts[k], k))
            picks = {
                "hot": order[:pick],
                "cold": sorted(keys, key=lambda k: (counts[k], k))[:pick],
                "overdue": sorted(keys, key=lambda k: (last_seen[k], k))[:pick],
            }
            trials += 1
            for name, nums in picks.items():
                if actual in nums:
                    hits[name] += 1
        counts[actual] += 1
        last_seen[actual] = t
    p = pick / 100
    lo, hi = binom_interval(trials, p)
    return {
        "pick": pick,
        "warmup": warmup,
        "trials": trials,
        "chance_rate": p,
        "chance_range95": [lo / trials if trials else 0, hi / trials if trials else 0],
        "strategies": [{"name": k, "hits": hits[k], "rate": hits[k] / trials if trials else 0}
                       for k in ("hot", "cold", "overdue")],
    }


def prize_digits_by_trust(draws):
    """ตัวเลขทุกหลักของรางวัลที่ 2–5 แยกตามระดับความน่าเชื่อถือของแหล่งข้อมูล"""
    out = []
    for level in ("single-source", "cross-checked", "official"):
        c = [0] * 10
        n_draws = 0
        for d in draws:
            if d["trust_level"] != level or not d["prizes_2_to_5_available"]:
                continue
            n_draws += 1
            for k in ("second", "third", "fourth", "fifth"):
                for v in d["prizes"][k]:
                    for ch in v:
                        c[int(ch)] += 1
        if n_draws:
            out.append({"trust_level": level, "draws": n_draws, "counts": c,
                        "chi_square": chi_square_uniform(c)})
    return out


def randomness(draws):
    tests = []

    def add(group, label, res, **extra):
        if res is None:   # ไม่มีข้อมูลรางวัลนี้ในชุดข้อมูล (เช่น ข้อมูลไม่กี่งวด) จึงทดสอบไม่ได้
            return
        tests.append({"group": group, "label": label, "chi2": res["chi2"], "df": res["df"],
                      "p": res["p"], "n": res["n"], **extra})

    for prize in ("last2", "back3", "front3"):
        f = frequency(draws, prize)
        add("number", prize, f["chi_square"], era="all")
    for e in ("E1", "E2", "E3"):
        sub = [d for d in draws if d["era"] == e]
        add("number", "last2", frequency(sub, "last2")["chi_square"], era=e)
    fd = first_prize_digits(draws)
    for pos in fd["positions"]:
        add("first_digit", f"หลักที่ {pos['position']}", pos["chi_square"], era="all", position=pos["position"])
    for e in ("E1", "E2", "E3"):
        sub = [d for d in draws if d["era"] == e]
        for pos in first_prize_digits(sub)["positions"]:
            add("first_digit", f"หลักที่ {pos['position']}", pos["chi_square"], era=e, position=pos["position"])
    for t in prize_digits_by_trust(draws):
        add("prize_digits", t["trust_level"], t["chi_square"], era="all", trust_level=t["trust_level"])

    m = len(tests)
    for t in tests:
        t["p_bonferroni"] = min(1.0, t["p"] * m)

    last2 = [int(d["prizes"]["last2"][0]) for d in draws if d["prizes"]["last2"]]
    return {
        "tests": tests,
        "test_count": m,
        "first_prize_digits": fd,
        "prize_digits_by_trust": prize_digits_by_trust(draws),
        "autocorr_last2": autocorr_lag1(last2),
        "backtest_last2": backtest_last2(draws),
    }
