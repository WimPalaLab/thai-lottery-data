"""สถิติของเลข 6 หลักในรางวัลที่ 1–5 (ไลบรารีมาตรฐานเท่านั้น ใช้ตอนสร้างเว็บ)

ทุกค่ามาคู่กับค่าที่คาดไว้ถ้าทุกเลข 000000–999999 มีโอกาสเท่ากัน
- ตัวเลข 0–9 (ทุกหลักรวมกัน) และแยก 6 ตำแหน่ง
- คู่ตัวเลขติดกัน (00–99 รวม 5 ตำแหน่ง), 3 หลักแรก/ท้าย (ฮิสโทแกรม)
- จำนวนเลขคี่, จำนวนเลขสูง (5–9), ผลรวมหลัก, รูปแบบการซ้ำ
ไม่รวมรางวัลข้างเคียง (ขึ้นกับรางวัลที่ 1) และไม่รวมเลขหน้า/ท้าย 3 ตัว หรือท้าย 2 ตัว (ไม่ใช่เลข 6 หลัก)"""
import math
from collections import Counter

import lotto_stats as S

SIX_PRIZES = ["first", "second", "third", "fourth", "fifth"]
PATTERNS = ["111111", "21111", "2211", "222", "3111", "321", "33", "411", "42", "51", "6"]
RECENT_DRAWS = 24


def pattern_of(num):
    return "".join(str(c) for c in sorted(Counter(num).values(), reverse=True))


def _pattern_theory():
    """ความน่าจะเป็นของแต่ละรูปแบบการซ้ำ (คำนวณเชิงการจัด ไม่ต้องไล่ 1 ล้านเลข)"""
    out = []
    for p in PATTERNS:
        parts = [int(c) for c in p]
        k = len(parts)
        mult = Counter(parts)
        choose_digits = math.perm(10, k) / math.prod(math.factorial(m) for m in mult.values())
        arrange = math.factorial(6) / math.prod(math.factorial(x) for x in parts)
        out.append(choose_digits * arrange / 1_000_000)
    return out


def _dsum_theory():
    dist = [1.0]
    for _ in range(6):
        nxt = [0.0] * (len(dist) + 9)
        for s, v in enumerate(dist):
            for d in range(10):
                nxt[s + d] += v / 10
        dist = nxt
    return dist


PATTERN_P = _pattern_theory()
DSUM_P = _dsum_theory()
BINOM6 = [math.comb(6, k) / 64 for k in range(7)]


def chi_square_expected(observed, probs, min_expected=5):
    """chi-square goodness-of-fit กับการแจกแจงที่กำหนด รวมช่องที่คาดไว้ < min_expected เข้ากับช่องข้างเคียง"""
    n = sum(observed)
    if n == 0:
        return None
    bins, cur_o, cur_e = [], 0, 0.0
    for o, p in zip(observed, probs):
        cur_o += o
        cur_e += p * n
        if cur_e >= min_expected:
            bins.append((cur_o, cur_e))
            cur_o, cur_e = 0, 0.0
    if cur_e > 0:
        if bins:
            o, e = bins.pop()
            bins.append((o + cur_o, e + cur_e))
        else:
            bins.append((cur_o, cur_e))
    if len(bins) < 2:
        return None
    chi2 = sum((o - e) ** 2 / e for o, e in bins)
    df = len(bins) - 1
    return {"chi2": round(chi2, 3), "df": df, "p": S.gammq(df / 2, chi2 / 2)}


def _uniform_block(counts, trials, space):
    lo, hi = S.binom_interval(trials, 1 / space)
    return {"counts": counts, "expected": trials / space, "range95": [lo, hi],
            "chi_square": S.chi_square_uniform(counts) if trials else None}


def _dist_block(observed, probs, n):
    return {"observed": observed, "expected": [round(p * n, 4) for p in probs],
            "chi_square": chi_square_expected(observed, probs)}


def _half_hist(counter, n):
    """จำนวน 3 หลัก (000–999) ที่พบ k ครั้ง เทียบกับที่คาดไว้"""
    hist = Counter(counter.get(f"{i:03d}", 0) for i in range(1000))
    pmf = S.binom_pmf(n, 1 / 1000) if n else [1.0]
    hi = S.binom_interval(n, 1 / 1000)[1] if n else 0
    kmax = max(max(hist), hi + 2)
    return {"observed": [hist.get(k, 0) for k in range(kmax + 1)],
            "expected": [1000 * (pmf[k] if k < len(pmf) else 0) for k in range(kmax + 1)]}


def six_digit_stats(numbers, draws_info):
    """numbers: list ของเลข 6 หลัก (string); draws_info: (จำนวนงวด, งวดแรก, งวดสุดท้าย)"""
    n = len(numbers)
    digit = [0] * 10
    pos = [[0] * 10 for _ in range(6)]
    pair = [0] * 100
    odd = [0] * 7
    high = [0] * 7
    dsum = [0] * 55
    pat = Counter()
    pre, suf = Counter(), Counter()
    for v in numbers:
        ds = [ord(c) - 48 for c in v]
        for i, d in enumerate(ds):
            pos[i][d] += 1
            digit[d] += 1
        for i in range(5):
            pair[ds[i] * 10 + ds[i + 1]] += 1
        odd[sum(d & 1 for d in ds)] += 1
        high[sum(d >= 5 for d in ds)] += 1
        dsum[sum(ds)] += 1
        pat[pattern_of(v)] += 1
        pre[v[:3]] += 1
        suf[v[3:]] += 1
    return {
        "numbers": n,
        "draws": draws_info[0],
        "first_draw": draws_info[1],
        "last_draw": draws_info[2],
        "digit": _uniform_block(digit, 6 * n, 10),
        "position": [_uniform_block(pos[i], n, 10) for i in range(6)],
        "pair": _uniform_block(pair, 5 * n, 100),
        "prefix_hist": _half_hist(pre, n),
        "suffix_hist": _half_hist(suf, n),
        "odd": _dist_block(odd, BINOM6, n),
        "high": _dist_block(high, BINOM6, n),
        "dsum": _dist_block(dsum, DSUM_P, n),
        "pattern": _dist_block([pat.get(p, 0) for p in PATTERNS], PATTERN_P, n),
    }


def numbers_for(draws, prize):
    if prize == "all":
        return [v for d in draws for k in SIX_PRIZES for v in d["prizes"][k]]
    return [v for d in draws for v in d["prizes"][prize]]


def build(draws, period_draws, periods):
    """คืน dict สำหรับ stats/sixdigit.json: data[period][prize]"""
    data = {}
    keys = [k for k, _ in periods] + ["recent"]
    labels = dict(periods)
    labels["recent"] = f"{RECENT_DRAWS} งวดล่าสุด"
    for key in keys:
        data[key] = {"label": labels[key]}
        for prize in SIX_PRIZES + ["all"]:
            if key == "recent":
                have = [d for d in draws if any(d["prizes"][k] for k in (SIX_PRIZES if prize == "all" else [prize]))]
                sub = have[-RECENT_DRAWS:]
            else:
                sub = [d for d in period_draws(draws, key)
                       if any(d["prizes"][k] for k in (SIX_PRIZES if prize == "all" else [prize]))]
            nums = numbers_for(sub, prize)
            info = (len(sub), sub[0]["draw_date"] if sub else None, sub[-1]["draw_date"] if sub else None)
            data[key][prize] = six_digit_stats(nums, info)
    return {"periods": keys, "prizes": SIX_PRIZES + ["all"], "patterns": PATTERNS, "data": data,
            # ใช้คำนวณช่วงปีที่ผู้ใช้เลือกเองในหน้าเว็บ
            "theory": {"pattern": PATTERN_P, "dsum": DSUM_P, "binom6": BINOM6}}
