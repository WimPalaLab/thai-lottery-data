"""ทดสอบลำดับการออกรางวัลตามเวลา (ไลบรารีมาตรฐานเท่านั้น, ใช้ seed คงที่ ผลจึงเหมือนเดิมทุกครั้ง)

- runs test (Wald–Wolfowitz): สูง/ต่ำ หรือ คู่/คี่ สลับกันบ่อยเท่าที่การสุ่มควรเป็นไหม
- change point (max-split chi-square + permutation): มีจุดเวลาไหนที่การกระจายของตัวเลขก่อน/หลังต่างกันชัดไหม
  ใช้ตรวจคุณภาพข้อมูลข้ามแหล่ง/ยุค ไม่ใช่หาเลข ถ้าเจอจุดเปลี่ยน มักแปลว่าข้อมูลช่วงหนึ่งมีปัญหา"""
import math
import random

import lotto_data as L


# ---------- runs test ----------

def runs_test(seq):
    """seq = ลำดับค่าจริง/เท็จ คืนจำนวน run ที่เห็น, ที่คาดไว้, z และค่า p สองทาง (normal approximation)"""
    seq = [bool(x) for x in seq]
    n = len(seq)
    n1 = sum(seq)
    n2 = n - n1
    if n1 == 0 or n2 == 0:
        return None
    runs = 1 + sum(1 for i in range(1, n) if seq[i] != seq[i - 1])
    expected = 2 * n1 * n2 / n + 1
    var = 2 * n1 * n2 * (2 * n1 * n2 - n) / (n * n * (n - 1))
    z = (runs - expected) / math.sqrt(var) if var > 0 else 0.0
    p = math.erfc(abs(z) / math.sqrt(2))
    return {"n": n, "n_true": n1, "n_false": n2, "runs": runs, "expected": round(expected, 2),
            "sd": round(math.sqrt(var), 3), "z": round(z, 3), "p": p}


RUNS_SERIES = [
    # (key, ชื่อที่แสดง, ดึงค่าจากงวด, เงื่อนไขที่นับเป็น "จริง")
    ("last2_high", "เลขท้าย 2 ตัว: 50–99 / 00–49", lambda d: d["prizes"]["last2"], lambda v: int(v) >= 50),
    ("last2_odd", "เลขท้าย 2 ตัว: คี่ / คู่", lambda d: d["prizes"]["last2"], lambda v: int(v) % 2 == 1),
    ("first_last_high", "หลักหน่วยรางวัลที่ 1: 5–9 / 0–4", lambda d: d["prizes"]["first"], lambda v: int(v[-1]) >= 5),
]


def runs_tests(draws):
    out = []
    for key, label, get, cond in RUNS_SERIES:
        seq = [cond(get(d)[0]) for d in draws if get(d)]
        r = runs_test(seq)
        if r:
            out.append({"key": key, "label": label, **r})
    return out


# ---------- change point ----------

def max_split_chi2(vecs, min_seg):
    """หาจุดแบ่งลำดับเป็น "ก่อน/หลัง" ที่การนับแต่ละหมวดต่างกันมากที่สุด (chi-square ตาราง 2×K)
    vecs = จำนวนนับของแต่ละหมวดต่องวด คืน (ค่า chi-square สูงสุด, ตำแหน่งแบ่ง = จำนวนงวดช่วงก่อน)"""
    n = len(vecs)
    k = len(vecs[0])
    total = [sum(v[c] for v in vecs) for c in range(k)]
    big_n = sum(total)
    cats = [c for c in range(k) if total[c] > 0]
    inv_t = {c: 1.0 / total[c] for c in cats}
    left = [0] * k
    nl = 0
    best, best_at = -1.0, None
    for i in range(n - min_seg):
        v = vecs[i]
        for c in cats:
            left[c] += v[c]
        nl += sum(v)
        if i + 1 < min_seg:
            continue
        nr = big_n - nl
        if nl == 0 or nr == 0:
            continue
        f = nl / big_n
        s = 0.0
        for c in cats:
            dlt = left[c] - total[c] * f
            s += dlt * dlt * inv_t[c]
        chi2 = s * big_n * big_n / (nl * nr)
        if chi2 > best:
            best, best_at = chi2, i + 1
    return best, best_at


def change_point_scan(vecs, sims=999, seed=2024, min_seg=30):
    """ค่า p จาก permutation: สลับลำดับงวด (ตัวเลขในแต่ละงวดอยู่ด้วยกันเหมือนเดิม) แล้วหาจุดแบ่งใหม่
    ถ้าข้อมูลไม่มีจุดเปลี่ยน ลำดับเวลาจริงก็ไม่ต่างจากลำดับที่สลับแล้ว"""
    if len(vecs) < 2 * min_seg + 1:
        return None
    stat, at = max_split_chi2(vecs, min_seg)
    rng = random.Random(seed)
    work = list(vecs)
    ge = 0
    for _ in range(sims):
        rng.shuffle(work)
        if max_split_chi2(work, min_seg)[0] >= stat - 1e-9:
            ge += 1
    return {"stat": round(stat, 3), "split": at, "df": sum(1 for c in range(len(vecs[0]))
                                                          if any(v[c] for v in vecs)) - 1,
            "sims": sims, "p": (ge + 1) / (sims + 1)}


def _digit_vec(numbers):
    v = [0] * 10
    for x in numbers:
        for ch in x:
            v[int(ch)] += 1
    return v


CP_SERIES = [
    # (key, ชื่อ, งวดที่ใช้ได้, ตัวเลขที่นับ)
    ("last2", "ตัวเลขในเลขท้าย 2 ตัว", lambda d: bool(d["prizes"]["last2"]), lambda d: d["prizes"]["last2"]),
    ("first", "ตัวเลขทั้ง 6 หลักของรางวัลที่ 1", lambda d: bool(d["prizes"]["first"]), lambda d: d["prizes"]["first"]),
    ("prizes_2_to_5", "ตัวเลขในรางวัลที่ 2–5", lambda d: d["prizes_2_to_5_available"],
     lambda d: [x for k in ("second", "third", "fourth", "fifth") for x in d["prizes"][k]]),
]


def boundaries(draws):
    """วันเริ่มยุค และวันแรกของข้อมูลแต่ละระดับความน่าเชื่อถือ (ไม่นับงวดเดี่ยว ๆ ที่ใช้แหล่งอื่นแทรก)"""
    out = [(L.E2_START, "เริ่มยุค 2 (มีรางวัลที่ 2–5)"), (L.E3_START, "เริ่มยุค 3 (มีเลขหน้า 3 ตัว)"),
           (L.OFFICIAL_START, "เริ่มข้อมูลทางการ GLO")]
    label = {"cross-checked": "เริ่มข้อมูลตรวจทาน 2 แหล่ง", "official": "เริ่มข้อมูลทางการ GLO"}
    first = {}
    for d in draws:
        first.setdefault(d["trust_level"], d["draw_date"])
    for level, date in first.items():
        if level in label and date != draws[0]["draw_date"]:
            out.append((date, label[level]))
    seen, uniq = set(), []
    for d, lab in sorted(out):
        if d not in seen:
            seen.add(d)
            uniq.append({"date": d, "label": lab})
    return uniq


def change_points(draws, sims=999, seed=2024, min_seg=30, near=12):
    """near = ถ้าจุดเปลี่ยนห่างจากขอบยุค/แหล่งข้อมูลไม่เกินกี่งวด ถือว่าตรงกัน"""
    bounds = boundaries(draws)
    out = []
    for i, (key, label, ok, nums) in enumerate(CP_SERIES):
        sub = [d for d in draws if ok(d)]
        if not sub:
            continue
        r = change_point_scan([_digit_vec(nums(d)) for d in sub], sims=sims, seed=seed + i, min_seg=min_seg)
        if not r:
            continue
        date = sub[r["split"]]["draw_date"]
        dates = [d["draw_date"] for d in sub]
        nearest = None
        for b in bounds:
            if not dates[0] < b["date"] <= dates[-1]:
                continue
            pos = sum(1 for x in dates if x < b["date"])
            dist = abs(pos - r["split"])
            if nearest is None or dist < nearest["draws_away"]:
                nearest = {**b, "draws_away": dist}
        out.append({"key": key, "label": label, "draws": len(sub), "from": dates[0], "to": dates[-1],
                    "change_date": date, "n_before": r["split"], "n_after": len(sub) - r["split"],
                    "stat": r["stat"], "df": r["df"], "sims": r["sims"], "p": r["p"],
                    "nearest_boundary": nearest,
                    "aligned": bool(nearest and nearest["draws_away"] <= near)})
    return out
