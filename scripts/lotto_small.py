"""small-v1: จัดอันดับเลขท้าย 2 ตัว (00–99), เลขท้าย 3 ตัว และเลขหน้า 3 ตัว (000–999)
ไลบรารีมาตรฐานเท่านั้น (จักรวาลมีแค่ 100 หรือ 1,000 เลข ไม่ต้องใช้ numpy)

แนวคิดเดียวกับ hybrid model ของเลข 6 หลัก แต่เรียบง่ายกว่า (รายละเอียดใน MODEL.md):
- position  ความถี่ของตัวเลขแต่ละหลัก (หลักร้อย/สิบ/หน่วย) จากทุกงวดก่อนหน้า
- digit     ความถี่ของตัวเลข 0–9 ทุกหลักรวมกัน
- number    จำนวนครั้งที่เลขนั้นเคยออกทั้งเลข
- recent    ตัวเลขแต่ละหลักในช่วงงวดล่าสุด เทียบกับระยะยาว
แต่ละส่วนทำเป็นคะแนนมาตรฐาน (ค่าเฉลี่ย 0, SD 1 บนทุกเลขในจักรวาล) แล้วรวมด้วยน้ำหนักจาก config
อันดับ: คะแนนมาก→น้อย ถ้าเท่ากันเลขน้อยมาก่อน (ผลเหมือนเดิมทุกครั้งที่คำนวณจากข้อมูลชุดเดียวกัน)

คะแนนเป็นคะแนนเปรียบเทียบสำหรับจัดอันดับเท่านั้น ไม่ใช่ความน่าจะเป็นที่จะถูกรางวัล
"""
import math
from collections import Counter

from lotto_meta import SMALL_GROUPS, SMALL_KINDS  # noqa: F401

WIDTH = {"last2": 2, "back3": 3, "front3": 3}
POS_NAME = {2: ["หลักสิบ", "หลักหน่วย"], 3: ["หลักร้อย", "หลักสิบ", "หลักหน่วย"]}
SPLITS = ("validation", "holdout", "all")


def history(draws, kind):
    """[(วันที่, [เลข])] เฉพาะงวดที่มีรางวัลนี้ เรียงตามเวลา (งวดที่ไม่มีรางวัลนี้ไม่นับเป็น 0)"""
    return [(d["draw_date"], list(d["prizes"][kind])) for d in draws if d["prizes"][kind]]


def _digits(n, width):
    return [(n // 10 ** (width - 1 - i)) % 10 for i in range(width)]


def _standardize(vals):
    n = len(vals)
    mean = sum(vals) / n
    sd = math.sqrt(sum((v - mean) ** 2 for v in vals) / n)
    if sd < 1e-12:
        return [0.0] * n, 0.0
    return [(v - mean) / sd for v in vals], sd


def _pct(x):
    return f"{x * 100:.1f}%"


class SmallModel:
    """โมเดลของรางวัลหนึ่งชนิด ฝึกจาก hist (เฉพาะงวดก่อนหน้างวดที่จะทำนาย)"""

    def __init__(self, hist, kind, sc):
        self.kind = kind
        self.width = width = WIDTH[kind]
        self.space = space = 10 ** width
        sm = sc["smoothing"]
        self.recent_draws = min(sc["recent_draws"], len(hist))
        obs = [int(v) for _, nums in hist for v in nums]
        recent = [int(v) for _, nums in hist[len(hist) - self.recent_draws:] for v in nums]
        self.m, self.mr = m, mr = len(obs), len(recent)
        self.draws = len(hist)
        pos = [[0] * 10 for _ in range(width)]
        rpos = [[0] * 10 for _ in range(width)]
        dig = [0] * 10
        num = [0] * space
        for v in obs:
            num[v] += 1
            for i, d in enumerate(_digits(v, width)):
                pos[i][d] += 1
                dig[d] += 1
        for v in recent:
            for i, d in enumerate(_digits(v, width)):
                rpos[i][d] += 1
        self.pos, self.rpos, self.dig, self.num = pos, rpos, dig, num
        a, b, g, k = sm["position_alpha"], sm["digit_alpha"], sm["number_alpha"], sm["recent_strength"]
        qpos = [[(c + a) / (m + 10 * a) for c in row] for row in pos]
        qdig = [(c + b) / (width * m + 10 * b) for c in dig]
        qrec = [[(rpos[i][d] + k * qpos[i][d]) / (mr + k) for d in range(10)] for i in range(width)]
        lp = [[math.log(q / 0.1) for q in row] for row in qpos]
        ld = [math.log(q / 0.1) for q in qdig]
        lr = [[math.log(qrec[i][d] / qpos[i][d]) for d in range(10)] for i in range(width)]
        raw = {name: [] for name in SMALL_GROUPS}
        for n in range(space):
            ds = _digits(n, width)
            raw["position"].append(sum(lp[i][d] for i, d in enumerate(ds)))
            raw["digit"].append(sum(ld[d] for d in ds))
            raw["number"].append(math.log((num[n] + g) / (m + space * g) * space))
            raw["recent"].append(sum(lr[i][d] for i, d in enumerate(ds)))
        self.z = {name: _standardize(raw[name])[0] for name in SMALL_GROUPS}
        self.weights = w = sc["feature_weights"]
        comb = [sum(w[name] * self.z[name][n] for name in SMALL_GROUPS) for n in range(space)]
        scores, self.sd = _standardize(comb)
        # ปัดเศษก่อนจัดอันดับ เพื่อให้ทุกเครื่องได้อันดับเดียวกัน (ต่างกันระดับ 1e-15 ไม่มีผล)
        self.scores = [round(x, 9) for x in scores]
        self.order = sorted(range(space), key=lambda x: (-self.scores[x], x))
        self.rank = [0] * space
        for r, x in enumerate(self.order):
            self.rank[x] = r
        lo, hi = min(self.scores), max(self.scores)
        self._lo, self._span = lo, (hi - lo) or 1.0

    def score_100(self, n):
        return (self.scores[n] - self._lo) / self._span * 100

    def detail(self, name, n):
        ds = _digits(n, self.width)
        names = POS_NAME[self.width]
        if name == "position":
            parts = [f"{names[i]} {d}: {_pct(self.pos[i][d] / self.m)}" for i, d in enumerate(ds)] if self.m else []
            return "พบบ่อยแค่ไหนในแต่ละหลัก — " + ", ".join(parts) + " (ถ้าสุ่ม 10%)"
        if name == "digit":
            tot = self.width * self.m
            parts = [f"{d}: {_pct(self.dig[d] / tot)}" for d in sorted(set(ds))] if tot else []
            return "ตัวเลขนี้ทุกหลักรวมกัน — " + ", ".join(parts) + " (ถ้าสุ่ม 10%)"
        if name == "number":
            return f"เลขนี้เคยออก {self.num[n]} ครั้ง (ถ้าสุ่ม คาดไว้ราว {self.m / self.space:.1f} ครั้ง)"
        parts = [f"{names[i]} {d}: {_pct(self.rpos[i][d] / self.mr)}" for i, d in enumerate(ds)] if self.mr else []
        return f"ช่วง {self.recent_draws} งวดล่าสุด — " + ", ".join(parts) + " (ถ้าสุ่ม 10%)"

    def explain(self, n, top=2):
        sd = self.sd or 1.0
        contrib = sorted(((self.weights[g] * self.z[g][n] / sd, g) for g in SMALL_GROUPS), key=lambda t: (-t[0], t[1]))
        return [{"group": g, "contribution": round(c, 4), "detail": self.detail(g, n)} for c, g in contrib[:top]]


def fmt_number(n, kind):
    return f"{n:0{WIDTH[kind]}d}"


def build_predictions(draws, sc):
    """อันดับเลขของทุกชนิดจากข้อมูลทั้งหมดใน draws (ใช้ตอนสร้าง snapshot)"""
    out = {}
    for kind in sc["kinds"]:
        hist = history(draws, kind)
        mdl = SmallModel(hist, kind, sc)
        rows = []
        for r, x in enumerate(mdl.order[:sc["report_top_n"]], start=1):
            rows.append({"number": fmt_number(x, kind), "rank": r, "score": round(mdl.score_100(x), 3),
                         "z": round(mdl.scores[x], 4), "times_drawn": mdl.num[x], "contributions": mdl.explain(x)})
        out[kind] = {"rows": rows, "training_draws": len(hist), "training_numbers": mdl.m,
                     "first_draw": hist[0][0] if hist else None, "last_draw": hist[-1][0] if hist else None,
                     "space": mdl.space}
    return out


# ---------- การเลือกแบบสุ่ม (แจกแจงแม่นตรง ไม่ต้องจำลอง) ----------
def draw_hit_pmf(winners, K, space):
    """ถ้าสุ่มเลือก K เลขไม่ซ้ำจาก space เลข: ความน่าจะเป็นที่จะถูก 0, 1, 2, … หมายเลขในงวดนี้
    (เลขที่ออกซ้ำในงวดเดียวกัน เช่น เลขท้าย 3 ตัวสองตัวเหมือนกัน นับตามจำนวนที่ออก)"""
    mult = list(Counter(winners).values())
    u = len(mult)
    total = math.comb(space, K)
    pmf = [0.0] * (sum(mult) + 1)
    for mask in range(1 << u):
        s = bin(mask).count("1")
        if K - s < 0:
            continue
        hits = sum(mult[i] for i in range(u) if mask >> i & 1)
        pmf[hits] += math.comb(space - u, K - s) / total
    return pmf


def convolve(a, b):
    out = [0.0] * (len(a) + len(b) - 1)
    for i, x in enumerate(a):
        if x == 0.0:
            continue
        for j, y in enumerate(b):
            out[i + j] += x * y
    return out


def random_summary(recs, K, space):
    pmf = [1.0]
    for r in recs:
        pmf = convolve(pmf, draw_hit_pmf(r["winners"], K, space))
    cdf, lo, hi = 0.0, None, None
    for k, v in enumerate(pmf):
        cdf += v
        if lo is None and cdf >= 0.025 - 1e-12:
            lo = k
        if hi is None and cdf >= 0.975 - 1e-12:
            hi = k
    return pmf, {"expected": round(sum(K * len(r["winners"]) / space for r in recs), 5),
                 "lo95": lo or 0, "hi95": hi or 0}


def summarize(recs, K, space):
    n = len(recs)
    out = {"draws": n, "hits": sum(r["hits"] for r in recs), "draws_with_hit": sum(1 for r in recs if r["hits"])}
    if not n:
        return out
    pmf, rnd = random_summary(recs, K, space)
    out.update(random=rnd, p_random_ge=round(sum(pmf[out["hits"]:]), 4),
               first_draw=recs[0]["date"], last_draw=recs[-1]["date"])
    pcts = [p for r in recs for p in r["pcts"]]
    mean = sum(pcts) / len(pcts)
    se_null = math.sqrt((1 - 1 / space ** 2) / 12 / len(pcts))
    z = (mean - 0.5) / se_null
    out.update(numbers=len(pcts), mean_pct=round(mean, 5),
               null_ci=[round(0.5 - 1.96 * se_null, 5), round(0.5 + 1.96 * se_null, 5)],
               z=round(z, 3), p_two_sided=round(math.erfc(abs(z) / math.sqrt(2)), 4))
    return out


def walk_forward(draws, sc):
    """ก่อนงวด t ฝึกจากงวดก่อนหน้าเท่านั้น แล้วดูว่าเลขที่ออกจริงอยู่อันดับเท่าไร และอยู่ใน K อันดับแรกไหม"""
    bt = sc["backtest"]
    out = {}
    for kind in sc["kinds"]:
        hist = history(draws, kind)
        K = sc["candidate_counts"][kind]
        space = 10 ** WIDTH[kind]
        recs = []
        for t in range(bt["min_training_draws"], len(hist)):
            mdl = SmallModel(hist[:t], kind, sc)
            winners = [int(v) for v in hist[t][1]]
            top = set(mdl.order[:K])
            recs.append({"date": hist[t][0], "winners": winners, "hits": sum(1 for w in winners if w in top),
                         "pcts": [(mdl.rank[w] + 0.5) / space for w in winners]})
        out[kind] = recs
    return out


def summarize_all(draws, sc, recs_by_kind=None):
    bt = sc["backtest"]
    recs_by_kind = recs_by_kind or walk_forward(draws, sc)
    out = {}
    for kind, recs in recs_by_kind.items():
        K = sc["candidate_counts"][kind]
        space = 10 ** WIDTH[kind]
        split = {"validation": [r for r in recs if r["date"] < bt["holdout_start"]],
                 "holdout": [r for r in recs if r["date"] >= bt["holdout_start"]], "all": recs}
        nb = bt["stability_blocks"]
        size = len(recs)
        blocks = [recs[size * i // nb: size * (i + 1) // nb] for i in range(nb)] if size >= nb else [recs]
        out[kind] = {
            "kind": kind, "space": space, "candidate_count": K,
            "training_min_draws": bt["min_training_draws"], "holdout_start": bt["holdout_start"],
            **{s: summarize(v, K, space) for s, v in split.items()},
            "stability": [{"from": b[0]["date"], "to": b[-1]["date"], "draws": len(b), "hits": sum(r["hits"] for r in b),
                           "expected": round(sum(K * len(r["winners"]) / space for r in b), 4),
                           "mean_pct": round(sum(p for r in b for p in r["pcts"]) / max(1, sum(len(r["pcts"]) for r in b)), 5)}
                          for b in blocks if b],
        }
    return out
