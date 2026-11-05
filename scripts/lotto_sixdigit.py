"""สถิติของเลข 6 หลักในรางวัลที่ 1–5 (ไลบรารีมาตรฐานเท่านั้น ใช้ตอนสร้างเว็บ)

ทุกค่ามาคู่กับค่าที่คาดไว้ถ้าทุกเลข 000000–999999 มีโอกาสเท่ากัน
- ตัวเลข 0–9 (ทุกหลักรวมกัน) และแยก 6 ตำแหน่ง
- คู่ตัวเลขติดกัน (00–99 รวม 5 ตำแหน่ง), 3 หลักแรก/ท้าย (ฮิสโทแกรม)
- จำนวนเลขคี่, จำนวนเลขสูง (5–9), ผลรวมหลัก, รูปแบบการซ้ำ
- เลขเรียงติดกัน: ความยาวช่วงที่ยาวที่สุดที่ตัวเลขถัดไปเพิ่มทีละ 1 (เช่น 345) หรือลดทีละ 1 (เช่น 987)
  ในทิศเดียวกัน 9→0 และ 0→9 ไม่นับว่าติดกัน; ไม่มีคู่ใดติดกัน = 1, ทั้ง 6 หลัก (เช่น 123456) = 6
ไม่รวมรางวัลข้างเคียง (ขึ้นกับรางวัลที่ 1) และไม่รวมเลขหน้า/ท้าย 3 ตัว หรือท้าย 2 ตัว (ไม่ใช่เลข 6 หลัก)"""
import math
from collections import Counter

import lotto_stats as S

SIX_PRIZES = ["first", "second", "third", "fourth", "fifth"]
PATTERNS = ["111111", "21111", "2211", "222", "3111", "321", "33", "411", "42", "51", "6"]
RECENT_DRAWS = 24


def pattern_of(num):
    return "".join(str(c) for c in sorted(Counter(num).values(), reverse=True))


def run_of(num):
    """ความยาวช่วงเรียงติดกันที่ยาวที่สุด (1–6) ดูนิยามด้านบน"""
    best = cur = 1
    direction = 0
    for a, b in zip(num, num[1:]):
        step = ord(b) - ord(a)
        if step in (1, -1):
            cur = cur + 1 if step == direction else 2
            direction = step
        else:
            cur, direction = 1, 0
        best = max(best, cur)
    return best


def _run_theory():
    """ความน่าจะเป็นของ run_of = 1..6 ถ้าทุกเลขมีโอกาสเท่ากัน (ไล่สถานะทีละหลัก ไม่ต้องไล่ 1 ล้านเลข)"""
    states = Counter({(d, 0, 1, 1): 1 for d in range(10)})  # (หลักล่าสุด, ทิศ, ช่วงปัจจุบัน, ยาวสุด) -> จำนวนเลข
    for _ in range(5):
        nxt = Counter()
        for (last, direction, cur, best), c in states.items():
            for d in range(10):
                step = d - last
                if step in (1, -1):
                    nc, nd = (cur + 1 if step == direction else 2), step
                else:
                    nc, nd = 1, 0
                nxt[(d, nd, nc, max(best, nc))] += c
        states = nxt
    out = [0] * 6
    for (_, _, _, best), c in states.items():
        out[best - 1] += c
    return [c / 1_000_000 for c in out]


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
RUN_P = _run_theory()


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
    run = [0] * 6
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
        run[run_of(v) - 1] += 1
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
        "run": _dist_block(run, RUN_P, n),
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
            "theory": {"pattern": PATTERN_P, "dsum": DSUM_P, "binom6": BINOM6, "run": RUN_P}}


def repeats(draws, prizes=SIX_PRIZES, top=20):
    """เลข 6 หลักที่ออกมากกว่า 1 ครั้งในรางวัลที่เลือก (ค่าเริ่มต้น: รางวัลที่ 1–5 รวมกัน ไม่รวมข้างเคียง)
    เรียง: จำนวนครั้งมาก→น้อย, ออกล่าสุดใหม่→เก่า, เลขน้อย→มาก (ผลเหมือนเดิมทุกครั้ง)"""
    occ = {}
    used = 0
    first = last = None
    for d in draws:
        nums = [(k, v) for k in prizes for v in d["prizes"][k]]
        if not nums:
            continue
        used += 1
        first = first or d["draw_date"]
        last = d["draw_date"]
        for k, v in nums:
            occ.setdefault(v, []).append([d["draw_date"], k])
    total = sum(len(v) for v in occ.values())
    rep = [(n, o) for n, o in occ.items() if len(o) >= 2]
    rep.sort(key=lambda t: t[0])
    rep.sort(key=lambda t: t[1][-1][0], reverse=True)
    rep.sort(key=lambda t: len(t[1]), reverse=True)
    by_count = Counter(len(o) for _, o in rep)
    p = 1 / 1_000_000
    q0 = (1 - p) ** total
    q1 = total * p * (1 - p) ** (total - 1) if total else 0.0
    q2 = math.comb(total, 2) * p ** 2 * (1 - p) ** (total - 2) if total >= 2 else 0.0
    return {
        "prizes": list(prizes), "draws": used, "first_draw": first, "last_draw": last,
        "numbers_total": total, "distinct": len(occ), "repeated": len(rep),
        "by_count": {str(c): by_count[c] for c in sorted(by_count)},
        # ถ้าทุกเลขมีโอกาสเท่ากัน (ประมาณด้วยการแจกแจงทวินาม)
        "expected_repeated": round(1_000_000 * (1 - q0 - q1), 1),
        "expected_ge3": round(1_000_000 * (1 - q0 - q1 - q2), 1),
        "top": [{"number": n, "count": len(o), "last": o[-1][0], "hits": o} for n, o in rep[:top]],
    }
