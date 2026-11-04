"""V4: การทดสอบความสุ่มเพิ่มเติม — ใช้ไลบรารีมาตรฐานของ Python เท่านั้น

- runs test (Wald–Wolfowitz): คู่/คี่ และ สูง/ต่ำ ของเลขท้าย 2 ตัว สลับกันบ่อยหรือน้อยเกินไปไหม
- serial test (ตารางการเปลี่ยนจากงวดหนึ่งไปงวดถัดไป, Anderson–Goodman): งวดก่อนบอกอะไรเกี่ยวกับงวดถัดไปไหม
- Ljung–Box: autocorrelation หลาย lag พร้อมกัน
- Kolmogorov–Smirnov: รางวัลที่ 1 กระจายเท่ากันตลอด 000000–999999 ไหม
- poker test: รูปแบบตัวเลขซ้ำใน 6 หลักของรางวัลที่ 1 (ความน่าจะเป็น exact)
- coupon collector: ต้องใช้กี่งวดจนเลขท้าย 2 ตัวออกครบ 00–99 (คาดไว้ราว 519)
- power analysis: ด้วยจำนวนงวดเท่านี้ ความเบี้ยวขนาดไหนที่เราน่าจะตรวจเจอ

ทุกการทดสอบคืน p-value (หรือ None ถ้าข้อมูลน้อยเกินไป) เพื่อนำไปปรับ Bonferroni/FDR รวมกับการทดสอบอื่น"""
import math
import random
from collections import Counter

from lotto_stats import POS_NAMES, binom_interval, binom_pmf, gammq
from lotto_analysis import chi_square_gof


def p_normal_two_sided(z):
    return math.erfc(abs(z) / math.sqrt(2))


# ---------- runs test ----------

def runs_test(bits):
    """Wald–Wolfowitz runs test ของลำดับ 0/1: คืน runs, ค่าที่คาดไว้, sd, z, p สองด้าน
    E[R] = 2·n1·n2/n + 1, Var[R] = 2·n1·n2·(2·n1·n2 − n) / (n²·(n − 1))"""
    n = len(bits)
    n1 = sum(1 for b in bits if b)
    n2 = n - n1
    if n < 3 or n1 == 0 or n2 == 0:
        return None
    runs = 1 + sum(1 for i in range(1, n) if bits[i] != bits[i - 1])
    mu = 2 * n1 * n2 / n + 1
    var = 2 * n1 * n2 * (2 * n1 * n2 - n) / (n * n * (n - 1))
    if var <= 0:
        return None
    z = (runs - mu) / math.sqrt(var)
    return {"n": n, "n1": n1, "n2": n2, "runs": runs, "expected": mu, "sd": math.sqrt(var),
            "z": z, "p": p_normal_two_sided(z)}


# ---------- serial (transition) test ----------

def transition_table(seq, k):
    """ตาราง k×k: แถว = ค่าในงวดก่อน, คอลัมน์ = ค่าในงวดถัดไป"""
    t = [[0] * k for _ in range(k)]
    for a, b in zip(seq, seq[1:]):
        t[a][b] += 1
    return t


def independence_chi2(table, min_mean_expected=5.0):
    """chi-square ความเป็นอิสระของตาราง (Anderson–Goodman สำหรับ Markov chain อันดับ 1):
    E_ij = R_i·C_j / N, df = (แถวที่มีข้อมูล − 1)(คอลัมน์ที่มีข้อมูล − 1)
    ถ้าค่าที่คาดไว้เฉลี่ยต่อช่องน้อยกว่า min_mean_expected ถือว่าข้อมูลน้อยเกินไป → None"""
    rows = [r for r in table if sum(r)]
    cols = [j for j in range(len(table[0])) if sum(r[j] for r in rows)]
    N = sum(sum(r) for r in rows)
    if len(rows) < 2 or len(cols) < 2 or N / (len(rows) * len(cols)) < min_mean_expected:
        return None
    R = [sum(r) for r in rows]
    C = [sum(r[j] for r in rows) for j in cols]
    chi2 = 0.0
    for i, r in enumerate(rows):
        for jj, j in enumerate(cols):
            e = R[i] * C[jj] / N
            chi2 += (r[j] - e) ** 2 / e
    df = (len(rows) - 1) * (len(cols) - 1)
    return {"chi2": chi2, "df": df, "p": gammq(df / 2, chi2 / 2), "n": N}


# ---------- Ljung–Box ----------

def acf(x, k):
    n = len(x)
    m = sum(x) / n
    den = sum((v - m) ** 2 for v in x)
    if den == 0:
        return 0.0
    return sum((x[t] - m) * (x[t + k] - m) for t in range(n - k)) / den


def ljung_box(x, lags=10):
    """Q = n(n+2) Σ_{k=1..h} r_k² / (n − k), df = h; ช่วงปกติของ r_k แต่ละตัว ±1.96/√n"""
    n = len(x)
    if n <= lags + 2:
        return None
    r = [acf(x, k) for k in range(1, lags + 1)]
    q = n * (n + 2) * sum(rk * rk / (n - k) for k, rk in enumerate(r, start=1))
    return {"n": n, "lags": lags, "r": r, "q": q, "df": lags, "p": gammq(lags / 2, q / 2),
            "band": 1.96 / math.sqrt(n)}


# ---------- Kolmogorov–Smirnov ----------

def kolmogorov_sf(lam):
    """P(K > λ) ของการแจกแจง Kolmogorov: 2 Σ (−1)^(k−1) exp(−2k²λ²) (Numerical Recipes probks)"""
    if lam < 0.2:
        return 1.0
    s, prev, sign = 0.0, 0.0, 1.0
    for k in range(1, 101):
        term = sign * 2 * math.exp(-2 * k * k * lam * lam)
        s += term
        if abs(term) <= 1e-10 * abs(s) or abs(term) <= 1e-3 * prev:
            return min(1.0, max(0.0, s))
        sign = -sign
        prev = abs(term)
    return 1.0


def ks_uniform(values, space):
    """KS ของเลขจำนวนเต็ม 0..space−1 เทียบกับการแจกแจงเท่ากัน (ใช้จุดกึ่งกลาง (v + 0.5)/space;
    space = 1,000,000 ละเอียดพอจะถือว่าต่อเนื่อง) p จากค่าประมาณของ Stephens"""
    n = len(values)
    if n < 5:
        return None
    u = sorted((v + 0.5) / space for v in values)
    d = max(max(i / n - u[i - 1], u[i - 1] - (i - 1) / n) for i in range(1, n + 1))
    sq = math.sqrt(n)
    return {"n": n, "d": d, "p": kolmogorov_sf((sq + 0.12 + 0.11 / sq) * d)}


# ---------- poker test ----------

POKER_PATTERNS = [(1, 1, 1, 1, 1, 1), (2, 1, 1, 1, 1), (2, 2, 1, 1), (3, 1, 1, 1), (2, 2, 2), (3, 2, 1),
                  (4, 1, 1), (3, 3), (4, 2), (5, 1), (6,)]
POKER_LABELS = ["ไม่ซ้ำเลย", "คู่ 1 คู่", "คู่ 2 คู่", "ตอง 1 ชุด", "คู่ 3 คู่", "ตอง + คู่",
                "4 ตัวเหมือน", "ตอง 2 ชุด", "4 ตัว + คู่", "5 ตัวเหมือน", "6 ตัวเหมือน"]


def poker_pattern(s):
    return tuple(sorted(Counter(s).values(), reverse=True))


def pattern_count(pattern, width, base=10):
    """จำนวนเลข width หลักที่มีรูปแบบตัวเลขซ้ำตาม pattern (exact):
    เลือกตัวเลขให้แต่ละกลุ่ม (กลุ่มขนาดเท่ากันสลับกันได้) × จำนวนวิธีเรียงตำแหน่ง"""
    r = len(pattern)
    if sum(pattern) != width or r > base:
        return 0
    digits = math.perm(base, r)
    for size, cnt in Counter(pattern).items():
        digits //= math.factorial(cnt)
    arrange = math.factorial(width)
    for m in pattern:
        arrange //= math.factorial(m)
    return digits * arrange


def poker_test(numbers):
    """รูปแบบตัวเลขซ้ำของเลข 6 หลัก เทียบความน่าจะเป็น exact (chi-square รวมกลุ่มเล็ก)"""
    probs = [pattern_count(p, 6) / 10 ** 6 for p in POKER_PATTERNS]
    idx = {p: i for i, p in enumerate(POKER_PATTERNS)}
    obs = [0] * len(POKER_PATTERNS)
    for v in numbers:
        obs[idx[poker_pattern(v)]] += 1
    res = chi_square_gof(obs, probs)
    n = len(numbers)
    return {"n": n, "labels": POKER_LABELS, "patterns": ["".join(map(str, p)) for p in POKER_PATTERNS],
            "probs": probs, "observed": obs, "range95": [list(binom_interval(n, p)) for p in probs],
            "chi2": res and res["chi2"], "df": res and res["df"], "p": res and res["p"], "bins": res and res["bins"]}


# ---------- coupon collector ----------

def harmonic(n):
    return sum(1 / i for i in range(1, n + 1))


def coupon_expected(space):
    """E[T] = N·H_N, SD = √(N² Σ 1/i² − N·H_N)"""
    e = space * harmonic(space)
    var = space * space * sum(1 / (i * i) for i in range(1, space + 1)) - e
    return e, math.sqrt(var)


def coupon_runs(seq, space):
    """แบ่งลำดับเป็นรอบที่ไม่ทับกัน แต่ละรอบจบเมื่อเลขครบทุกตัว: คืน (ความยาวของรอบที่ครบ, จำนวนเลขที่เห็นในรอบสุดท้ายที่ยังไม่ครบ, ความยาวรอบนั้น)"""
    done, seen, length = [], set(), 0
    for v in seq:
        length += 1
        seen.add(v)
        if len(seen) == space:
            done.append(length)
            seen, length = set(), 0
    return done, len(seen), length


_COUPON_MC = {}


def coupon_monte_carlo(space, sims=2000, seed=2538):
    """เวลาที่ใช้จนครบทุกเลข จากการจำลอง sims รอบ (เรียงจากน้อยไปมาก; seed คงที่)"""
    key = (space, sims, seed)
    if key not in _COUPON_MC:
        rng = random.Random(seed)
        out = []
        for _ in range(sims):
            seen, t = set(), 0
            while len(seen) < space:
                seen.add(rng.randrange(space))
                t += 1
            out.append(t)
        out.sort()
        _COUPON_MC[key] = out
    return _COUPON_MC[key]


def empirical_two_sided(sorted_sims, obs):
    n = len(sorted_sims)
    le = sum(1 for v in sorted_sims if v <= obs) / n
    ge = sum(1 for v in sorted_sims if v >= obs) / n
    return min(1.0, 2 * min(le, ge))


def coupon_collector(seq, space=100, sims=2000):
    done, partial_seen, partial_len = coupon_runs(seq, space)
    e, sd = coupon_expected(space)
    mc = coupon_monte_carlo(space, sims)
    lo, hi = mc[int(0.025 * sims)], mc[min(sims - 1, int(0.975 * sims))]
    return {"space": space, "draws": len(seq), "completed": done, "partial_seen": partial_seen,
            "partial_length": partial_len, "expected": e, "sd": sd, "range95": [lo, hi], "sims": sims,
            "p": empirical_two_sided(mc, done[0]) if done else None}


# ---------- power analysis ----------

def upper_critical(n, p0, alpha_one_sided):
    """จำนวนครั้งน้อยที่สุด c ที่ P(X ≥ c | p0) ≤ alpha (ถ้าเห็น ≥ c จึงจะเรียกว่าผิดปกติ)"""
    pmf = binom_pmf(n, p0)
    tail = 0.0
    for c in range(n, -1, -1):
        if tail + pmf[c] > alpha_one_sided:
            return c + 1
        tail += pmf[c]
    return 0


def power_upper(n, p0, p1, alpha_one_sided):
    c = upper_critical(n, p0, alpha_one_sided)
    if c > n:
        return 0.0
    return sum(binom_pmf(n, p1)[c:])


def detectable_bias(n, p0, alpha_two_sided=0.05, power=0.8):
    """ความเบี้ยวน้อยที่สุด (สัดส่วนเพิ่มจาก p0) ที่ทดสอบสองด้านระดับ alpha จะตรวจเจอด้วยโอกาส ≥ power
    เช่น 0.5 = ออกบ่อยกว่าปกติ 50% (p1 = 1.5·p0) — ค้นแบบแบ่งครึ่ง"""
    if n == 0:
        return None
    a = alpha_two_sided / 2
    if power_upper(n, p0, 1 - 1e-12, a) < power:
        return None
    lo, hi = p0, 1 - 1e-12
    for _ in range(60):
        mid = (lo + hi) / 2
        if power_upper(n, p0, mid, a) >= power:
            hi = mid
        else:
            lo = mid
    return hi / p0 - 1


def power_table(n_last2, n_digit):
    """ตัวอย่างที่แสดงบนเว็บ: เลขท้าย 2 ตัวหนึ่งเลข (ระบุล่วงหน้า / ดูทุกเลขพร้อมกัน), ตัวเลขหนึ่งตัวในหลักหนึ่ง, คู่/คี่"""
    rows = [
        ("last2_one", "เลขท้าย 2 ตัว 1 เลขที่ระบุไว้ก่อนดูข้อมูล", n_last2, 0.01, 0.05),
        ("last2_any", "เลขท้าย 2 ตัว เมื่อดูทุก 100 เลขพร้อมกัน (Bonferroni)", n_last2, 0.01, 0.05 / 100),
        ("digit", "ตัวเลข 1 ตัวในหลักหนึ่งของรางวัลที่ 1", n_digit, 0.1, 0.05),
        ("parity", "เลขท้าย 2 ตัวเป็นเลขคี่", n_last2, 0.5, 0.05),
    ]
    return [{"key": k, "label": label, "n": n, "p0": p0, "alpha": alpha,
             "bias": detectable_bias(n, p0, alpha)} for k, label, n, p0, alpha in rows]


# ---------- รวมทุกการทดสอบของขอบเขตหนึ่ง ----------

def extra_tests(draws):
    """คืน (รายการการทดสอบสำหรับตาราง, รายละเอียดแต่ละการทดสอบ)"""
    last2 = [int(d["prizes"]["last2"][0]) for d in draws if d["prizes"]["last2"]]
    firsts = [d["prizes"]["first"][0] for d in draws]
    tests = []

    def add(group, label, res, stat):
        if res and res.get("p") is not None:
            tests.append({"group": group, "label": label, "stat": stat, "p": res["p"], "n": res["n"], "era": "all"})

    runs = {
        "parity": runs_test([v % 2 for v in last2]),
        "highlow": runs_test([1 if v >= 50 else 0 for v in last2]),
    }
    add("runs", "คู่/คี่ ของเลขท้าย 2 ตัว", runs["parity"], runs["parity"] and f"z = {runs['parity']['z']:.2f}")
    add("runs", "สูง (50–99) / ต่ำ (00–49) ของเลขท้าย 2 ตัว", runs["highlow"],
        runs["highlow"] and f"z = {runs['highlow']['z']:.2f}")

    serial = []
    for key, label, seq, k in [
        ("parity", "คู่/คี่ → คู่/คี่", [v % 2 for v in last2], 2),
        ("highlow", "สูง/ต่ำ → สูง/ต่ำ", [1 if v >= 50 else 0 for v in last2], 2),
        ("tens", "หลักสิบ → หลักสิบ", [v // 10 for v in last2], 10),
        ("units", "หลักหน่วย → หลักหน่วย", [v % 10 for v in last2], 10),
    ]:
        res = independence_chi2(transition_table(seq, k))
        serial.append({"key": key, "label": label, "k": k, "pairs": max(0, len(seq) - 1),
                       "chi2": res and res["chi2"], "df": res and res["df"], "p": res and res["p"]})
        add("serial", f"งวดต่องวด: {label} (เลขท้าย 2 ตัว)", res, res and f"χ² = {res['chi2']:.1f}, df = {res['df']}")

    lb = {"last2": ljung_box(last2), "first": ljung_box([int(v) for v in firsts])}
    add("ljung_box", "เลขท้าย 2 ตัว lag 1–10", lb["last2"], lb["last2"] and f"Q = {lb['last2']['q']:.1f}, df = 10")
    add("ljung_box", "รางวัลที่ 1 lag 1–10", lb["first"], lb["first"] and f"Q = {lb['first']['q']:.1f}, df = 10")

    ks = ks_uniform([int(v) for v in firsts], 10 ** 6)
    add("ks", "รางวัลที่ 1 เทียบการกระจายเท่ากัน 000000–999999", ks, ks and f"D = {ks['d']:.3f}")

    poker = poker_test(firsts)
    add("poker", "รูปแบบตัวเลขซ้ำใน 6 หลักของรางวัลที่ 1", poker,
        poker["p"] is not None and f"χ² = {poker['chi2']:.1f}, df = {poker['df']}")

    coupon = coupon_collector(["%02d" % v for v in last2])
    add("coupon", "จำนวนงวดจนเลขท้าย 2 ตัวออกครบ 00–99 (รอบแรก)", {"p": coupon["p"], "n": len(last2)},
        coupon["completed"] and f"{coupon['completed'][0]} งวด")

    detail = {"runs": runs, "serial": serial, "ljung_box": lb, "ks_first": ks, "poker": poker,
              "coupon": coupon, "power": power_table(len(last2), len(firsts)),
              "first_prize_positions": POS_NAMES[6]}
    return tests, detail
