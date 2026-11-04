"""การวิเคราะห์ V2/V3: แต่ละหลัก, ลักษณะเลข, รายปี, เปรียบเทียบช่วงเวลา, ระยะห่างระหว่างการออก,
การปรับ p สำหรับทดสอบหลายครั้ง — ใช้ไลบรารีมาตรฐานของ Python เท่านั้น

หลักการเดียวกับ lotto_stats:
- นับเฉพาะงวดที่มีรางวัลนั้น (ตัวหาร = จำนวนหมายเลขที่ออกจริง) ไม่นับงวดที่ไม่มีรางวัลเป็น 0
- ทุกค่าที่เห็นมาพร้อมค่าที่คาดไว้ถ้าสุ่มจริง และช่วงที่การสุ่มให้ได้ตามปกติ
- ความน่าจะเป็นที่คาดไว้ของลักษณะเลขคำนวณแบบ exact โดยไล่นับทุกเลขที่เป็นไปได้"""
import random
from collections import Counter

from lotto_stats import POS_NAMES, binom_interval, binom_pmf, chi_square_uniform, digit_counts, eligible, gammq

WIDTH = {"first": 6, "front3": 3, "back3": 3, "last2": 2}


def all_numbers(draws, prize):
    """ทุกหมายเลขของรางวัลนั้นในงวดที่มีรางวัล (1 หมายเลข = 1 ช่อง)"""
    return [v for d in eligible(draws, prize) for v in d["prizes"][prize]]


# ---------- การปรับ p สำหรับทดสอบหลายครั้ง ----------

def bonferroni(ps):
    m = len(ps)
    return [min(1.0, p * m) for p in ps]


def fdr_bh(ps):
    """Benjamini–Hochberg: คืน q-value ของแต่ละ p ตามลำดับเดิม"""
    m = len(ps)
    order = sorted(range(m), key=lambda i: ps[i])
    q = [0.0] * m
    prev = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        prev = min(prev, ps[i] * m / rank)
        q[i] = min(1.0, prev)
    return q


def add_adjusted(tests):
    """เติม p_bonferroni และ q_fdr ให้ทุกการทดสอบที่มี p (นับจำนวนการทดสอบเฉพาะที่มี p)"""
    have = [t for t in tests if t.get("p") is not None]
    ps = [t["p"] for t in have]
    for t, b, q in zip(have, bonferroni(ps), fdr_bh(ps)):
        t["p_bonferroni"] = b
        t["q_fdr"] = q
    return tests


def binom_test_two_sided(k, n, p):
    """exact binomial test สองด้าน: รวมความน่าจะเป็นของทุกผลที่เกิดยากเท่าหรือยากกว่าผลที่เห็น"""
    if n == 0:
        return 1.0
    if p <= 0:
        return 1.0 if k == 0 else 0.0
    if p >= 1:
        return 1.0 if k == n else 0.0
    pmf = binom_pmf(n, p)
    lim = pmf[k] * (1 + 1e-7)
    return min(1.0, sum(v for v in pmf if v <= lim))


# ---------- chi-square ที่รวมช่องเล็ก ----------

def pool_bins(observed, expected, min_expected=5.0):
    """รวมช่องที่อยู่ติดกันจนค่าที่คาดไว้ของแต่ละช่อง ≥ min_expected (chi-square ใช้ไม่ได้ถ้าคาดไว้น้อยเกินไป)
    เศษท้ายสุดรวมเข้าช่องก่อนหน้า"""
    po, pe = [], []
    ao = ae = 0.0
    for o, e in zip(observed, expected):
        ao += o
        ae += e
        if ae >= min_expected:
            po.append(ao)
            pe.append(ae)
            ao = ae = 0.0
    if ae > 0 or ao > 0:
        if po:
            po[-1] += ao
            pe[-1] += ae
        else:
            po.append(ao)
            pe.append(ae)
    return po, pe


def chi_square_gof(observed, probs, min_expected=5.0):
    """จำนวนที่เห็นเข้ากับความน่าจะเป็นที่คาดไว้ไหม (รวมช่องเล็กก่อน); เหลือ < 2 ช่อง → None"""
    n = sum(observed)
    if n == 0:
        return None
    po, pe = pool_bins(observed, [n * p for p in probs], min_expected)
    if len(po) < 2:
        return None
    chi2 = sum((o - e) ** 2 / e for o, e in zip(po, pe))
    df = len(po) - 1
    return {"chi2": round(chi2, 3), "df": df, "p": gammq(df / 2, chi2 / 2), "n": n, "bins": len(po)}


def chi_square_homogeneity(a, b, min_expected=5.0):
    """ตาราง 2×k: สองช่วงเวลามีการกระจายเหมือนกันไหม
    รวมคอลัมน์ติดกันจนค่าที่คาดไว้ทุกช่อง ≥ min_expected; เหลือ < 2 คอลัมน์ → None"""
    na, nb = sum(a), sum(b)
    if na == 0 or nb == 0:
        return None
    total = na + nb
    need = min_expected * total / min(na, nb)   # ผลรวมคอลัมน์ขั้นต่ำที่ทำให้ทุกช่องคาดไว้ ≥ min_expected
    cols = []
    ca = cb = 0
    for x, y in zip(a, b):
        ca += x
        cb += y
        if ca + cb >= need:
            cols.append((ca, cb))
            ca = cb = 0
    if ca + cb:
        if cols:
            cols[-1] = (cols[-1][0] + ca, cols[-1][1] + cb)
        else:
            cols.append((ca, cb))
    if len(cols) < 2:
        return None
    chi2 = 0.0
    for x, y in cols:
        c = x + y
        ea, eb = na * c / total, nb * c / total
        chi2 += (x - ea) ** 2 / ea + (y - eb) ** 2 / eb
    df = len(cols) - 1
    return {"chi2": round(chi2, 3), "df": df, "p": gammq(df / 2, chi2 / 2), "n": total, "bins": len(cols)}


# ---------- แต่ละหลัก ----------

def digit_positions(draws, prize):
    """ตัวเลข 0–9 ในแต่ละหลักของรางวัล (นับทุกหมายเลข) เทียบกับที่คาดไว้ n/10"""
    numbers = all_numbers(draws, prize)
    n = len(numbers)
    lo, hi = binom_interval(n, 0.1)
    positions = []
    for pos in range(WIDTH[prize]):
        counts = digit_counts(numbers, pos)
        res = chi_square_uniform(counts) if n else None
        positions.append({"position": pos + 1, "counts": counts, "chi2": res and res["chi2"],
                          "df": res and res["df"], "p": res and res["p"]})
    return {"prize": prize, "eligible_draws": len(eligible(draws, prize)), "n": n,
            "expected": n / 10, "range95": [lo, hi], "positions": positions}


# ---------- ลักษณะเลข ----------

def pattern3(s):
    """0 = ไม่ซ้ำ, 1 = เบิ้ลหน้า AAB, 2 = หัวท้ายเหมือน ABA, 3 = เบิ้ลท้าย ABB, 4 = ตอง AAA"""
    a, b, c = s
    if a == b == c:
        return 4
    if a == b:
        return 1
    if a == c:
        return 2
    if b == c:
        return 3
    return 0


def consecutive(s):
    """0 = ไม่เรียง, 1 = เรียงขึ้นทีละ 1 (เช่น 123), 2 = เรียงลงทีละ 1 (เช่น 321); ไม่วนจาก 9 ไป 0"""
    d = [int(ch) for ch in s]
    steps = {d[i + 1] - d[i] for i in range(len(d) - 1)}
    if steps == {1}:
        return 1
    if steps == {-1}:
        return 2
    return 0


def characteristic_defs(width):
    """นิยามลักษณะเลข: (key, ชื่อ, ชื่อแต่ละกลุ่ม, ฟังก์ชันที่คืนเลขกลุ่ม)"""
    asc = "".join(str(i) for i in range(1, width + 1))
    defs = [
        ("parity", "คู่ / คี่ (ดูจากหลักสุดท้าย)", ["เลขคู่", "เลขคี่"], lambda s: int(s[-1]) % 2),
        ("digit_sum", "ผลรวมของทุกหลัก", [str(i) for i in range(9 * width + 1)],
         lambda s: sum(int(ch) for ch in s)),
    ]
    if width == 2:
        defs.append(("repeat", "เลขเบิ้ล", ["ไม่เบิ้ล", "เบิ้ล (เช่น 11)"], lambda s: int(s[0] == s[1])))
    else:
        defs.append(("repeat", "รูปแบบเลขซ้ำ",
                     ["ไม่ซ้ำเลย (เช่น 123)", "เบิ้ลหน้า (เช่น 112)", "หัวท้ายเหมือน (เช่น 121)",
                      "เบิ้ลท้าย (เช่น 122)", "ตอง (เช่น 111)"], pattern3))
        defs.append(("distinct", "จำนวนตัวเลขที่ไม่ซ้ำกัน", ["1 ตัว", "2 ตัว", "3 ตัว"],
                     lambda s: len(set(s)) - 1))
    defs.append(("consecutive", "เลขเรียงทีละ 1",
                 ["ไม่เรียง", f"เรียงขึ้น (เช่น {asc})", f"เรียงลง (เช่น {asc[::-1]})"], consecutive))
    return defs


def exact_distribution(fn, ncat, width):
    """ความน่าจะเป็นของแต่ละกลุ่ม จากการไล่ทุกเลข 0..10^width − 1 (exact ไม่ใช่ค่าประมาณ)"""
    space = 10 ** width
    c = [0] * ncat
    for i in range(space):
        c[fn(f"{i:0{width}d}")] += 1
    return [x / space for x in c]


_PROBS = {}


def char_probs(width):
    """{key: ความน่าจะเป็นของแต่ละกลุ่ม} ของลักษณะเลขทุกแบบ (คำนวณครั้งเดียวต่อจำนวนหลัก)"""
    if width not in _PROBS:
        _PROBS[width] = {k: exact_distribution(fn, len(c), width) for k, _, c, fn in characteristic_defs(width)}
    return _PROBS[width]


def _ranges(n, probs):
    return [list(binom_interval(n, p)) if p > 0 else [0, 0] for p in probs]


def characteristics(draws, prize):
    width = WIDTH[prize]
    numbers = all_numbers(draws, prize)
    n = len(numbers)
    items = []
    for key, label, cats, fn in characteristic_defs(width):
        probs = char_probs(width)[key]
        obs = [0] * len(cats)
        for v in numbers:
            obs[fn(v)] += 1
        res = chi_square_gof(obs, probs)
        items.append({"key": key, "label": label, "categories": cats, "probs": probs, "observed": obs,
                      "range95": _ranges(n, probs),
                      "chi2": res and res["chi2"], "df": res and res["df"], "p": res and res["p"],
                      "bins": res and res["bins"]})
    return {"prize": prize, "eligible_draws": len(eligible(draws, prize)), "n": n, "items": items}


# ---------- รายปี ----------

def yearly(draws, prize):
    """ต่อปี ค.ศ.: งวด, จำนวนหมายเลข, ช่วงปกติของเลขหนึ่งตัว และจำนวนในแต่ละกลุ่มของลักษณะเลข"""
    width = WIDTH[prize]
    space = 10 ** width
    defs = characteristic_defs(width)
    years = sorted({d["draw_date"][:4] for d in eligible(draws, prize)})
    rows = []
    for y in years:
        sub = [d for d in draws if d["draw_date"][:4] == y]
        numbers = all_numbers(sub, prize)
        chars = {}
        for key, _, cats, fn in defs:
            obs = [0] * len(cats)
            for v in numbers:
                obs[fn(v)] += 1
            chars[key] = obs
        rows.append({"year": y, "draws": len(eligible(sub, prize)), "slots": len(numbers),
                     "number_range95": list(binom_interval(len(numbers), 1 / space)),
                     "characteristics": chars})
    meta = []
    for key, label, cats, fn in defs:
        probs = char_probs(width)[key]
        meta.append({"key": key, "label": label, "categories": cats, "probs": probs,
                     "range95": [_ranges(r["slots"], probs) for r in rows]})
    return {"prize": prize, "space": space, "years": rows, "characteristics": meta}


# ---------- เปรียบเทียบสองช่วงเวลา ----------

def compare_periods(a, b, prize):
    """ช่วง A กับ B มีการกระจายต่างกันไหม (chi-square homogeneity) สำหรับรางวัลเดียวกัน
    ใช้เฉพาะคู่ช่วงที่โครงสร้างรางวัลเทียบกันได้ (เลือกไว้ใน build_site.COMPARISONS)"""
    width = WIDTH[prize]
    na, nb = all_numbers(a, prize), all_numbers(b, prize)
    tests = []

    def add(kind, label, ca, cb, probs, cats):
        res = chi_square_homogeneity(ca, cb)
        tests.append({"prize": prize, "kind": kind, "label": label, "categories": cats,
                      "a": ca, "b": cb, "probs": probs,
                      "chi2": res and res["chi2"], "df": res and res["df"], "p": res and res["p"]})

    if width == 2:
        ca, cb = Counter(na), Counter(nb)
        keys = [f"{i:02d}" for i in range(100)]
        add("number", "การกระจายของเลข 00–99", [ca[k] for k in keys], [cb[k] for k in keys],
            [0.01] * 100, keys)
    digits = [str(i) for i in range(10)]
    for pos in range(width):
        add("digit", POS_NAMES[width][pos], digit_counts(na, pos), digit_counts(nb, pos), [0.1] * 10, digits)
    if prize != "first":
        for key, label, cats, fn in characteristic_defs(width):
            probs = char_probs(width)[key]
            ca, cb = [0] * len(cats), [0] * len(cats)
            for v in na:
                ca[fn(v)] += 1
            for v in nb:
                cb[fn(v)] += 1
            add(key, label, ca, cb, probs, cats)
    return {"prize": prize, "n_a": len(na), "n_b": len(nb), "tests": tests}


# ---------- ระยะห่างระหว่างการออก ----------

GAP_BINS = [(1, 10), (11, 20), (21, 30), (31, 40), (41, 50), (51, 75), (76, 100), (101, 150),
            (151, 200), (201, 300), (301, None)]


def gaps_of(seq):
    """ระยะห่าง (จำนวนงวด) ระหว่างการออกสองครั้งติดกันของเลขเดียวกัน รวมทุกเลข"""
    last = {}
    out = []
    for i, v in enumerate(seq):
        if v in last:
            out.append(i - last[v])
        last[v] = i
    return out


def bin_gaps(gaps, bins=GAP_BINS):
    c = [0] * len(bins)
    for g in gaps:
        for j, (lo, hi) in enumerate(bins):
            if g >= lo and (hi is None or g <= hi):
                c[j] += 1
                break
    return c


def expected_gap_counts(n_draws, space, bins=GAP_BINS):
    """จำนวนระยะห่างที่คาดไว้ถ้าสุ่มจริง (exact สำหรับลำดับยาว n_draws งวด รวมผลของขอบลำดับแล้ว):
    E[จำนวนระยะห่าง = g] = space × (n − g) × p² × (1 − p)^(g − 1), p = 1/space"""
    p = 1 / space
    q = 1 - p
    per_g = [0.0] + [space * (n_draws - g) * p * p * q ** (g - 1) for g in range(1, n_draws)]
    out = []
    for lo, hi in bins:
        top = n_draws - 1 if hi is None else min(hi, n_draws - 1)
        out.append(sum(per_g[lo:top + 1]) if lo <= top else 0.0)
    return out


def gap_monte_carlo(n_draws, space, sims=1000, seed=2538, bins=GAP_BINS):
    """ช่วง 95% ของจำนวนระยะห่างในแต่ละช่วง จากการจำลองการสุ่มจริง sims รอบ (seed คงที่ ผลเหมือนเดิมทุกครั้ง)"""
    rng = random.Random(seed)
    per_bin = [[] for _ in bins]
    for _ in range(sims):
        seq = [rng.randrange(space) for _ in range(n_draws)]
        for j, c in enumerate(bin_gaps(gaps_of(seq), bins)):
            per_bin[j].append(c)
    lo_i, hi_i = int(0.025 * sims), min(sims - 1, int(0.975 * sims))
    out = []
    for v in per_bin:
        v.sort()
        out.append([v[lo_i], v[hi_i]])
    return out


_MC_CACHE = {}


def gap_distribution(draws, sims=1000):
    """ระยะห่างระหว่างการออกของเลขท้าย 2 ตัว (1 หมายเลขต่องวดทุกยุค จึงเทียบกันได้ตลอดช่วง)
    ใช้เฉพาะช่วงเวลาที่งวดต่อเนื่องกัน"""
    seq = [d["prizes"]["last2"][0] for d in draws if d["prizes"]["last2"]]
    n = len(seq)
    gaps = gaps_of(seq)
    if (n, sims) not in _MC_CACHE:
        _MC_CACHE[(n, sims)] = gap_monte_carlo(n, 100, sims)
    exp = expected_gap_counts(n, 100)
    return {
        "prize": "last2", "draws": n, "gap_count": len(gaps), "expected_gap_count": sum(exp),
        "mean_gap": sum(gaps) / len(gaps) if gaps else None,
        "bins": [[lo, hi] for lo, hi in GAP_BINS],
        "observed": bin_gaps(gaps), "expected": exp, "range95": _MC_CACHE[(n, sims)], "sims": sims,
    }
