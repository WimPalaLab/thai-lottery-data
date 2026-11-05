"""Hybrid model สำหรับจัดอันดับเลข 6 หลักทั้ง 1,000,000 เลข (000000–999999)

ภาพรวม (รายละเอียดสูตรอยู่ใน MODEL.md):
- feature แต่ละตัวคำนวณจากชุดเลขที่เคยออก (observations) แล้วให้คะแนนดิบกับทุกเลขในจักรวาล
- คะแนนดิบของ feature ถูกทำให้เป็นมาตรฐาน (z) ด้วยค่าเฉลี่ย/ส่วนเบี่ยงเบนมาตรฐานที่คำนวณแบบแม่นตรง
  บนจักรวาลทั้ง 1 ล้านเลข (ไม่ต้องสุ่มตัวอย่าง)
- คะแนนกลุ่ม = ค่าเฉลี่ยของ z ของ feature ในกลุ่ม; คะแนนโมเดล = Σ น้ำหนักกลุ่ม × คะแนนกลุ่ม แล้วทำเป็น z อีกครั้ง
- Global model ใช้เลข 6 หลักของรางวัลที่ 1–5 รวมกัน (+ เลขหน้า/ท้าย 3 ตัว และท้าย 2 ตัวเป็นข้อมูลเสริม)
  Prize model ใช้เฉพาะเลขของรางวัลนั้น
- Hybrid = w_global × z_global + (1 − w_global) × z_prize

คะแนนเป็นคะแนนเปรียบเทียบสำหรับจัดอันดับเท่านั้น ไม่ใช่ความน่าจะเป็นที่จะถูกรางวัล
เลขทุกตัวเก็บเป็น string ในไฟล์; ภายในโมดูลนี้แปลงเป็น int เพื่อคำนวณ และแปลงกลับด้วย f"{x:06d}"
"""
import numpy as np

from lotto_meta import GROUPS, SIX_PRIZES, load_config  # noqa: F401  (load_config ใช้ผ่านโมดูลนี้ได้)

N = 1_000_000
# รูปแบบการซ้ำของตัวเลข 6 หลัก (partition ของ 6) เช่น "2211" = มีคู่ซ้ำ 2 คู่ อีก 2 ตัวไม่ซ้ำ
PATTERNS = ["111111", "21111", "2211", "222", "3111", "321", "33", "411", "42", "51", "6"]
# รูปแบบที่พบน้อยกว่า ~1% (222, 33, 411, 42, 51, 6) รวมเป็น "other" (รวมราว 2.4%)
PATTERN_BUCKET = {p: (p if p in ("111111", "21111", "2211", "3111", "321") else "other") for p in PATTERNS}
PATTERN_BIN = ["111111", "21111", "2211", "3111", "321", "other"]
BIN_TAIL = 0.02


# ---------- universe ----------
def digits_of(x):
    """int array → (6, m) ตัวเลขแต่ละหลัก (หลักที่ 1 = ซ้ายสุด)"""
    x = np.asarray(x, dtype=np.int64)
    return np.stack([(x // 10 ** (5 - i)) % 10 for i in range(6)]).astype(np.int64)


def pattern_of_counts(counts):
    """จำนวนครั้งของแต่ละตัวเลข → ชื่อรูปแบบ เช่น [2,1,1,1,1,0,...] → '21111'"""
    return "".join(str(c) for c in sorted((c for c in counts if c), reverse=True))


class Universe:
    """ค่าคงที่ของเลขทั้ง 1 ล้านเลข (ไม่ขึ้นกับข้อมูล) คำนวณครั้งเดียวต่อ process"""

    def __init__(self):
        n = np.arange(N, dtype=np.int64)
        self.digits = digits_of(n).astype(np.int8)
        self.prefix = (n // 1000).astype(np.int32)
        self.suffix = (n % 1000).astype(np.int32)
        self.pair23 = (self.digits[2].astype(np.int32) * 10 + self.digits[3]).astype(np.int32)

        cnt = np.stack([(self.digits == d).sum(axis=0) for d in range(10)]).astype(np.int8)
        srt = -np.sort(-cnt, axis=0)
        key = np.zeros(N, dtype=np.int64)
        for k in range(6):
            key = key * 7 + srt[k]
        pattern_key = {}
        for i, p in enumerate(PATTERNS):
            parts = [int(c) for c in p] + [0] * (6 - len(p))
            v = 0
            for c in parts:
                v = v * 7 + c
            pattern_key[v] = i
        lut_keys = np.array(sorted(pattern_key))
        pattern = np.array([pattern_key[k] for k in lut_keys])[np.searchsorted(lut_keys, key)]
        dsum = self.digits.astype(np.int16).sum(axis=0)
        odd = (self.digits % 2).sum(axis=0)
        high = (self.digits >= 5).sum(axis=0)
        joint = pattern.astype(np.int64) * 100000 + dsum * 100 + odd * 10 + high
        uniq, inv = np.unique(joint, return_inverse=True)
        self.cls = inv.astype(np.int32)
        self.ncls = len(uniq)
        self.cls_pattern = (uniq // 100000).astype(np.int64)
        self.cls_dsum = ((uniq // 100) % 1000).astype(np.int64)
        self.cls_odd = ((uniq // 10) % 10).astype(np.int64)
        self.cls_high = (uniq % 10).astype(np.int64)
        self.cls_count = np.bincount(self.cls, minlength=self.ncls).astype(np.float64)
        self.cls_p = self.cls_count / N
        # การแจกแจงทางทฤษฎีถ้าทุกเลขมีโอกาสเท่ากัน
        self.theory = {
            "pattern": np.bincount(self.cls_pattern, weights=self.cls_count, minlength=len(PATTERNS)) / N,
            "dsum": np.bincount(self.cls_dsum, weights=self.cls_count, minlength=55) / N,
            "odd": np.bincount(self.cls_odd, weights=self.cls_count, minlength=7) / N,
            "high": np.bincount(self.cls_high, weights=self.cls_count, minlength=7) / N,
        }
        self.cls_attr = {"pattern": self.cls_pattern, "dsum": self.cls_dsum, "odd": self.cls_odd, "high": self.cls_high}
        # รวมคลาสที่หายากเป็นกลุ่มเดียว (bin) เพื่อไม่ให้ feature ไปจำเลขแปลก ๆ ที่เคยออกไม่กี่ครั้ง
        # ทุก bin มีเลขในจักรวาลอย่างน้อยราว 1–2% (ดู MODEL.md)
        pat_bin = np.array([PATTERN_BIN.index(PATTERN_BUCKET[p]) for p in PATTERNS])
        cdf = np.cumsum(self.theory["dsum"])
        lo = int(np.searchsorted(cdf, BIN_TAIL))                    # ค่าแรกที่สะสมถึง 2%
        hi = int(np.searchsorted(cdf, 1 - BIN_TAIL))                # ค่าที่ส่วนบนเหลือราว 2%
        self.dsum_range = (lo, hi)
        self.bin_attr = {
            "pattern": pat_bin[self.cls_pattern],
            "dsum": np.clip(self.cls_dsum, lo, hi) - lo,
            "odd": np.clip(self.cls_odd, 1, 5) - 1,
            "high": np.clip(self.cls_high, 1, 5) - 1,
        }
        self.bin_theory = {k: np.bincount(v, weights=self.cls_count) / N for k, v in self.bin_attr.items()}
        # หลักของเลข 3 หลัก 000–999 สำหรับรวมตาราง
        h = np.arange(1000)
        self.half_digits = np.stack([h // 100, (h // 10) % 10, h % 10])


_UNI = None


def universe():
    global _UNI
    if _UNI is None:
        _UNI = Universe()
    return _UNI


# ---------- features ----------
class Feature:
    """feature หนึ่งตัว มีได้ 3 แบบ (แต่ละแบบคำนวณค่าเฉลี่ย/ความแปรปรวนบนจักรวาลได้แม่นตรง):
    - chain: unary[i] (ตาราง 10 ค่าของหลัก i) + pairs[i] (ตาราง 10×10 ของหลัก i กับ i+1)
    - halves: prefix (ตาราง 1000 ค่าของ 3 หลักแรก) + suffix (3 หลักท้าย)
    - cls: ตารางตามคลาสของเลข (รูปแบบซ้ำ, ผลรวม, คู่/คี่, สูง/ต่ำ)"""

    def __init__(self, group, name, kind, unary=None, pairs=None, prefix=None, suffix=None, cls=None, info=None):
        self.group, self.name, self.kind = group, name, kind
        self.unary = unary or {}
        self.pairs = pairs or {}
        self.prefix, self.suffix, self.cls = prefix, suffix, cls
        self.info = info or {}
        self.mean, self.std = self._moments()

    def _moments(self):
        if self.kind == "chain":
            # DP บนตัวเลข 6 หลักที่สุ่มอิสระและสม่ำเสมอ: เก็บ E[S·1{d}] และ E[S²·1{d}]
            u0 = self.unary.get(0, np.zeros(10))
            p = np.full(10, 0.1)
            m1 = p * u0
            m2 = p * u0 ** 2
            for k in range(5):
                phi = self.pairs.get(k, np.zeros((10, 10))) + self.unary.get(k + 1, np.zeros(10))[None, :]
                m1n = 0.1 * (m1[:, None] + p[:, None] * phi).sum(axis=0)
                m2n = 0.1 * (m2[:, None] + 2 * m1[:, None] * phi + p[:, None] * phi ** 2).sum(axis=0)
                m1, m2 = m1n, m2n
            mean = m1.sum()
            var = m2.sum() - mean ** 2
        elif self.kind == "halves":
            a = self.prefix if self.prefix is not None else np.zeros(1000)
            b = self.suffix if self.suffix is not None else np.zeros(1000)
            mean = a.mean() + b.mean()
            var = a.var() + b.var()
        elif self.kind == "cls":
            p = universe().cls_p
            mean = float(p @ self.cls)
            var = float(p @ self.cls ** 2) - mean ** 2
        else:
            raise ValueError(self.kind)
        return float(mean), float(np.sqrt(max(var, 0.0)))

    def raw(self, x):
        """คะแนนดิบของเลข x (int array)"""
        x = np.asarray(x, dtype=np.int64)
        if self.kind == "chain":
            d = digits_of(x)
            s = np.zeros(len(x))
            for i, t in self.unary.items():
                s += t[d[i]]
            for i, t in self.pairs.items():
                s += t[d[i], d[i + 1]]
            return s
        if self.kind == "halves":
            s = np.zeros(len(x))
            if self.prefix is not None:
                s += self.prefix[x // 1000]
            if self.suffix is not None:
                s += self.suffix[x % 1000]
            return s
        return self.cls[universe().cls[x]]

    def z(self, x):
        if self.std < 1e-12:
            return np.zeros(len(np.atleast_1d(x)))
        return (self.raw(x) - self.mean) / self.std

    def fold(self, coef, A, B, X, C):
        """บวกตาราง feature × coef เข้าไปในตารางรวม A[3 หลักแรก], B[3 หลักท้าย], X[หลัก 3–4], C[คลาส]"""
        if coef == 0:
            return
        if self.kind == "chain":
            hd = universe().half_digits
            for i, t in self.unary.items():
                if i < 3:
                    A += coef * t[hd[i]]
                else:
                    B += coef * t[hd[i - 3]]
            for i, t in self.pairs.items():
                if i < 2:
                    A += coef * t[hd[i], hd[i + 1]]
                elif i == 2:
                    X += coef * t.reshape(100)
                else:
                    B += coef * t[hd[i - 3], hd[i - 2]]
        elif self.kind == "halves":
            if self.prefix is not None:
                A += coef * self.prefix
            if self.suffix is not None:
                B += coef * self.suffix
        else:
            C += coef * self.cls


def _log_ratio(counts, alpha, base_p):
    """log(ค่าประมาณแบบ smoothing / ค่าที่คาดไว้ถ้าสุ่ม) — alpha คือ pseudo-count ต่อช่อง"""
    counts = np.asarray(counts, dtype=np.float64)
    q = (counts + alpha) / (counts.sum() + alpha * len(counts))
    return np.log(q / base_p), q


def _shrunk_log_ratio(counts, theory, strength):
    """สำหรับการแจกแจงที่ไม่สม่ำเสมอ (เช่น ผลรวมหลัก): ดึงค่าประมาณเข้าหาค่าทางทฤษฎีด้วย strength pseudo-obs"""
    counts = np.asarray(counts, dtype=np.float64)
    q = (counts + strength * theory) / (counts.sum() + strength)
    with np.errstate(divide="ignore", invalid="ignore"):
        t = np.where(theory > 0, np.log(q / np.where(theory > 0, theory, 1)), 0.0)
    return t, q


def build_features(obs, recent_obs, cfg, partial=None):
    """สร้าง feature ทั้งหมดจากเลขที่เคยออก
    obs: int array ของเลข 6 หลักที่ใช้ฝึก; recent_obs: เฉพาะช่วงล่าสุด (time window)
    partial: dict front3/back3/last2 (int array) สำหรับ global model เท่านั้น"""
    u = universe()
    sm = cfg["smoothing"]
    obs = np.asarray(obs, dtype=np.int64)
    D = digits_of(obs) if len(obs) else np.zeros((6, 0), dtype=np.int64)
    feats = []

    c = np.bincount(D.ravel(), minlength=10)
    t, q = _log_ratio(c, sm["digit_alpha"], 0.1)
    feats.append(Feature("digit", "digit", "chain", unary={i: t for i in range(6)}, info={"q": q, "n": int(c.sum())}))

    pos_t, pos_q = {}, {}
    for i in range(6):
        pos_t[i], pos_q[i] = _log_ratio(np.bincount(D[i], minlength=10), sm["position_alpha"], 0.1)
    feats.append(Feature("position", "position", "chain", unary=pos_t, info={"q": pos_q, "n": len(obs)}))

    pc = np.bincount((D[:-1] * 10 + D[1:]).ravel(), minlength=100)
    t, q = _log_ratio(pc, sm["pair_alpha"], 0.01)
    feats.append(Feature("pattern", "pair", "chain", pairs={k: t.reshape(10, 10) for k in range(5)},
                         info={"q": q.reshape(10, 10)}))

    pre_c = np.bincount(obs // 1000, minlength=1000)
    suf_c = np.bincount(obs % 1000, minlength=1000)
    tp, _ = _log_ratio(pre_c, sm["triplet_alpha"], 0.001)
    ts, _ = _log_ratio(suf_c, sm["triplet_alpha"], 0.001)
    feats.append(Feature("pattern", "triplet", "halves", prefix=tp, suffix=ts, info={"prefix_c": pre_c, "suffix_c": suf_c}))

    obs_cls = u.cls[obs]
    th = u.bin_theory["pattern"]
    pat_c = np.bincount(u.bin_attr["pattern"][obs_cls], minlength=len(th))
    t, q = _shrunk_log_ratio(pat_c, th, sm["class_strength"])
    feats.append(Feature("pattern", "structure", "cls", cls=t[u.bin_attr["pattern"]], info={"q": q, "theory": th}))

    if partial is not None:
        f3 = np.asarray(partial.get("front3", []), dtype=np.int64)
        b3 = np.asarray(partial.get("back3", []), dtype=np.int64)
        l2 = np.asarray(partial.get("last2", []), dtype=np.int64)
        tf = _log_ratio(np.bincount(f3, minlength=1000), sm["triplet_alpha"], 0.001)[0] if len(f3) else np.zeros(1000)
        tb = _log_ratio(np.bincount(b3, minlength=1000), sm["triplet_alpha"], 0.001)[0] if len(b3) else np.zeros(1000)
        tl = _log_ratio(np.bincount(l2, minlength=100), sm["pair_alpha"], 0.01)[0] if len(l2) else np.zeros(100)
        feats.append(Feature("pattern", "partial", "halves", prefix=tf, suffix=tb + tl[np.arange(1000) % 100],
                             info={"n_front3": len(f3), "n_back3": len(b3), "n_last2": len(l2)}))

    for attr in ("dsum", "odd", "high"):
        th = u.bin_theory[attr]
        t, q = _shrunk_log_ratio(np.bincount(u.bin_attr[attr][obs_cls], minlength=len(th)), th, sm["class_strength"])
        feats.append(Feature("distribution", attr, "cls", cls=t[u.bin_attr[attr]], info={"q": q, "theory": th}))

    recent_obs = np.asarray(recent_obs, dtype=np.int64)
    R = digits_of(recent_obs) if len(recent_obs) else np.zeros((6, 0), dtype=np.int64)
    k = sm["time_window_strength"]
    tw_t, tw_q = {}, {}
    for i in range(6):
        rc = np.bincount(R[i], minlength=10)
        q_rec = (rc + k * pos_q[i]) / (len(recent_obs) + k)
        tw_t[i], tw_q[i] = np.log(q_rec / pos_q[i]), q_rec
    feats.append(Feature("time_window", "recent_position", "chain", unary=tw_t,
                         info={"q": tw_q, "q_long": pos_q, "n": len(recent_obs)}))

    am = sm["markov_alpha"]
    q0 = (np.bincount(D[0], minlength=10) + am) / (len(obs) + 10 * am)
    pairs, trans = {}, {}
    for i in range(5):
        cm = np.bincount(D[i] * 10 + D[i + 1], minlength=100).reshape(10, 10).astype(np.float64)
        p = (cm + am) / (cm.sum(axis=1, keepdims=True) + 10 * am)
        pairs[i], trans[i] = np.log(10 * p), p
    feats.append(Feature("statistical", "markov", "chain", unary={0: np.log(10 * q0)}, pairs=pairs,
                         info={"trans": trans}))
    return feats


class Model:
    """รวม feature เป็นคะแนนโมเดลเดียว (z บนจักรวาล 1 ล้านเลข)"""

    def __init__(self, features, weights, scope):
        u = universe()
        self.features, self.weights, self.scope = features, weights, scope
        self.by_group = {g: [f for f in features if f.group == g] for g in GROUPS}
        A, B, X, C = np.zeros(1000), np.zeros(1000), np.zeros(100), np.zeros(u.ncls)
        for g, fs in self.by_group.items():
            for f in fs:
                if f.std > 1e-12:
                    f.fold(weights[g] / len(fs) / f.std, A, B, X, C)
        raw = A[u.prefix] + B[u.suffix] + X[u.pair23] + C[u.cls]
        self.mean, self.std = float(raw.mean()), float(raw.std())
        self.tables = (A, B, X, C)
        self.scores = (raw - self.mean) / self.std if self.std > 0 else np.zeros(N)

    def group_z(self, x):
        out = {}
        for g, fs in self.by_group.items():
            out[g] = np.mean([f.z(x) for f in fs], axis=0) if fs else np.zeros(len(x))
        return out


def model_from_obs(obs, recent_obs, cfg, scope, partial=None):
    return Model(build_features(obs, recent_obs, cfg, partial), cfg["feature_weights"], scope)


# ---------- ranking ----------
def hybrid(z_global, z_prize, w_global):
    return w_global * z_global + (1.0 - w_global) * z_prize


def top_k(scores, k):
    """k อันดับแรก เรียงคะแนนมาก→น้อย ถ้าคะแนนเท่ากันเลขน้อยมาก่อน (ผลเหมือนเดิมทุกครั้ง)"""
    idx = np.argpartition(-scores, k - 1)[:k]
    v = scores[idx].min()
    cand = np.flatnonzero(scores >= v)
    order = np.lexsort((cand, -scores[cand]))
    return cand[order[:k]]


def ranks_of(scores, x):
    """อันดับของเลข x ในจักรวาล (1 = คะแนนสูงสุด; คะแนนเท่ากันได้อันดับดีที่สุดร่วมกัน)"""
    x = np.asarray(x, dtype=np.int64)
    if len(x) == 0:
        return np.zeros(0, dtype=np.int64)
    s = scores[x]
    order = np.argsort(s, kind="stable")
    ss = s[order]
    pos = np.searchsorted(ss, scores, side="left")   # จำนวนคะแนนของ x ที่ < คะแนนของเลขนั้น
    hist = np.bincount(pos, minlength=len(ss) + 1)
    greater = np.cumsum(hist[::-1])[::-1]               # greater[j] = จำนวนเลขที่ pos ≥ j
    ranks_sorted = 1 + greater[1:]                      # เลขที่คะแนนมากกว่า ss[j] คือ pos ≥ j+1
    out = np.empty(len(x), dtype=np.int64)
    out[order] = ranks_sorted
    return out


def scale_100(scores):
    """แปลงคะแนนเป็น 0–100 แบบ min–max บนจักรวาล (100 = สูงสุดในจักรวาล) ใช้แสดงผลเท่านั้น"""
    lo, hi = float(scores.min()), float(scores.max())
    span = hi - lo if hi > lo else 1.0
    return lambda v: (np.asarray(v, dtype=np.float64) - lo) / span * 100


# ---------- explanations ----------
GROUP_LABEL = {
    "digit": "ความถี่ตัวเลข 0–9",
    "position": "ความถี่ตามตำแหน่ง",
    "pattern": "คู่/สามตัว/รูปแบบเลข",
    "time_window": "ช่วงล่าสุด",
    "distribution": "ผลรวม/คู่คี่/สูงต่ำ",
    "statistical": "Markov ตามตำแหน่ง",
}
PATTERN_LABEL = {
    "111111": "ไม่มีตัวซ้ำ", "21111": "ซ้ำ 1 คู่", "2211": "ซ้ำ 2 คู่", "222": "ซ้ำ 3 คู่",
    "3111": "ตอง 1 ชุด", "321": "ตอง + คู่", "33": "ตอง 2 ชุด", "411": "ซ้ำ 4 ตัว",
    "42": "ซ้ำ 4 ตัว + คู่", "51": "ซ้ำ 5 ตัว", "6": "เหมือนกันทั้ง 6 ตัว",
}


def _detail(model, group, x):
    """ข้อความสั้น ๆ อธิบายว่า feature กลุ่มนี้ให้คะแนนเลข x สูงเพราะอะไร (อิงตัวเลขจริงในตาราง)"""
    u = universe()
    d = digits_of([x])[:, 0]
    fs = model.by_group[group]
    f = fs[0]
    if group == "digit":
        q = f.info["q"]
        best = max(set(d.tolist()), key=lambda v: q[v])
        return f"มีเลข {best} ซึ่งพบ {q[best] * 100:.2f}% ของทุกหลัก (ถ้าสุ่ม 10%)"
    if group == "position":
        q = f.info["q"]
        i = max(range(6), key=lambda k: q[k][d[k]])
        return f"หลักที่ {i + 1} เป็น {d[i]}: พบ {q[i][d[i]] * 100:.2f}% (ถ้าสุ่ม 10%)"
    if group == "pattern":
        zs = {g.name: float(g.z([x])[0]) for g in fs}
        name = max(zs, key=zs.get)
        if name == "structure":
            g = next(g for g in fs if g.name == "structure")
            b = int(u.bin_attr["pattern"][u.cls[x]])
            p = PATTERNS[u.cls_pattern[u.cls[x]]]
            return f"รูปแบบ \"{PATTERN_LABEL[p]}\": กลุ่มนี้พบ {g.info['q'][b] * 100:.1f}% (ถ้าสุ่ม {g.info['theory'][b] * 100:.1f}%)"
        if name == "triplet":
            g = next(g for g in fs if g.name == "triplet")
            return f"3 หลักแรก {x // 1000:03d} เคยพบ {int(g.info['prefix_c'][x // 1000])} ครั้ง, 3 หลักท้าย {x % 1000:03d} เคยพบ {int(g.info['suffix_c'][x % 1000])} ครั้ง"
        if name == "partial":
            return f"3 หลักแรก/ท้าย ตรงกับเลขหน้า/ท้าย 3 ตัวหรือท้าย 2 ตัวที่เคยออก (ข้อมูลผลบางส่วน)"
        g = next(g for g in fs if g.name == "pair")
        i = max(range(5), key=lambda k: g.info["q"][d[k], d[k + 1]])
        return f"คู่ติดกัน {d[i]}{d[i + 1]} พบ {g.info['q'][d[i], d[i + 1]] * 100:.2f}% (ถ้าสุ่ม 1%)"
    if group == "time_window":
        q, ql = f.info["q"], f.info["q_long"]
        i = max(range(6), key=lambda k: q[k][d[k]] / ql[k][d[k]])
        return f"ช่วงล่าสุด หลักที่ {i + 1} เป็น {d[i]} บ่อยกว่าระยะยาว ({q[i][d[i]] * 100:.1f}% เทียบ {ql[i][d[i]] * 100:.1f}%)"
    if group == "distribution":
        s = int(d.sum())
        lo, hi = u.dsum_range
        b = min(max(s, lo), hi) - lo
        g = next(g for g in fs if g.name == "dsum")
        label = f"≤ {lo}" if s <= lo else f"≥ {hi}" if s >= hi else str(s)
        return f"ผลรวมหลัก {s} (กลุ่ม {label}): พบ {g.info['q'][b] * 100:.2f}% (ถ้าสุ่ม {g.info['theory'][b] * 100:.2f}%)"
    tr = f.info["trans"]
    i = max(range(5), key=lambda k: tr[k][d[k], d[k + 1]])
    return f"หลักที่ {i + 1}→{i + 2}: {d[i]}→{d[i + 1]} พบ {tr[i][d[i], d[i + 1]] * 100:.1f}% (ถ้าสุ่ม 10%)"


def explain(x, global_model, prize_model, w_global, top=3):
    """feature ที่ช่วยให้คะแนน hybrid ของเลข x สูงที่สุด เรียงตามขนาด"""
    xs = np.array([x])
    items = []
    for model, w, scope in ((global_model, w_global, "global"), (prize_model, 1 - w_global, "prize")):
        gz = model.group_z(xs)
        for g in GROUPS:
            # ส่วนที่กลุ่มนี้เพิ่มให้คะแนน hybrid (หน่วยเดียวกับ z ของ hybrid)
            contrib = w * model.weights[g] * float(gz[g][0]) / model.std if model.std > 0 else 0.0
            items.append({"group": g, "scope": scope, "z": round(float(gz[g][0]), 3),
                          "contribution": round(contrib, 4)})
    items.sort(key=lambda it: -it["contribution"])
    out = []
    for it in items[:top]:
        model = global_model if it["scope"] == "global" else prize_model
        it["detail"] = _detail(model, it["group"], int(x))
        out.append(it)
    return out
