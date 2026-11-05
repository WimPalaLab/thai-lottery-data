"""เทสต์ backtest: ไม่มีข้อมูลอนาคตรั่ว, baseline สุ่มทำซ้ำได้และใช้จำนวนเลขเท่ากัน, ไม่ใช้ holdout ปรับค่า"""
import copy
import datetime
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

try:
    import numpy as np
    import lotto_backtest as B
    import lotto_model as M
except ImportError:  # pragma: no cover
    np = None

import lotto_meta as META  # noqa: E402

COUNTS = {"first": 1, "second": 5, "third": 10, "fourth": 50, "fifth": 100}


def synthetic_draws(n, seed=7, start="2010-01-01"):
    """งวดสมมติที่มีรางวัลครบ (เลขเป็น string 6 หลัก มี 0 นำหน้าได้)"""
    rng = np.random.default_rng(seed)
    d0 = datetime.date.fromisoformat(start)
    draws = []
    for i in range(n):
        date = (d0 + datetime.timedelta(days=15 * i)).isoformat()
        prizes = {k: sorted(f"{v:06d}" for v in rng.choice(M.N, c, replace=False)) for k, c in COUNTS.items()}
        prizes.update(near_first=[], front3=[f"{rng.integers(1000):03d}"] * 2, back3=[f"{rng.integers(1000):03d}"] * 2,
                      last2=[f"{rng.integers(100):02d}"])
        draws.append({"draw_date": date, "prizes": prizes, "prizes_2_to_5_available": True, "trust_level": "official"})
    return draws


def small_cfg():
    c = META.load_config()
    c["backtest"] = dict(c["backtest"], min_training_draws=20, random_trials=200, holdout_start="2011-01-01")
    return c


@unittest.skipIf(np is None, "ต้องติดตั้ง numpy")
class LeakageTest(unittest.TestCase):
    def test_models_ignore_target_and_future_draws(self):
        draws = synthetic_draws(40)
        cfg = small_cfg()
        t = 30
        g1, p1 = B.models_at(B.prepare(draws), t, cfg)
        changed = copy.deepcopy(draws)
        for d in changed[t:]:
            for k in COUNTS:
                d["prizes"][k] = ["000000"] * len(d["prizes"][k])
            d["prizes"]["front3"] = ["000", "000"]
        g2, p2 = B.models_at(B.prepare(changed), t, cfg)
        self.assertTrue(np.array_equal(g1.scores, g2.scores))
        for k in COUNTS:
            self.assertTrue(np.array_equal(p1[k].scores, p2[k].scores))
        # แต่ถ้าเปลี่ยนงวดก่อนหน้า ผลต้องเปลี่ยน (ยืนยันว่าเทสต์นี้มีความหมาย)
        changed[t - 1]["prizes"]["first"] = ["999999"]
        g3, _ = B.models_at(B.prepare(changed), t, cfg)
        self.assertFalse(np.array_equal(g1.scores, g3.scores))

    def test_eval_indices_need_training_history(self):
        draws = synthetic_draws(30)
        draws[3]["prizes_2_to_5_available"] = False
        idx = B.eval_indices(B.prepare(draws), small_cfg())
        self.assertEqual(idx[0], 21)   # ต้องมีงวดที่มีรางวัลครบก่อนหน้า 20 งวด (งวด 3 ไม่นับ)


@unittest.skipIf(np is None, "ต้องติดตั้ง numpy")
class BaselineTest(unittest.TestCase):
    def test_random_baseline_reproducible(self):
        a, da = B.random_baseline([100] * 50, 10, 500, [1, 2, 3])
        b, db = B.random_baseline([100] * 50, 10, 500, [1, 2, 3])
        self.assertEqual(a, b)
        self.assertTrue(np.array_equal(da, db))
        self.assertAlmostEqual(a["expected"], 50 * 100 * 10 / M.N)

    def test_threshold_hits_equal_plain_top_k(self):
        rng = np.random.default_rng(5)
        zg, zp = rng.standard_normal(M.N), rng.standard_normal(M.N)
        cand = np.union1d(np.argpartition(-zg, 300)[:300], np.argpartition(-zp, 300)[:300])
        for w in (0.0, 0.3, 0.7, 1.0):
            top = M.top_k(M.hybrid(zg, zp, w), 10)
            winners = np.concatenate([top[:3], [1, 2, 3]])
            hits, _ = B._topk_threshold_hits(zg, zp, w, 10, cand, winners)
            self.assertEqual(hits, 3)

    def test_percentile_estimate_close_to_exact(self):
        rng = np.random.default_rng(9)
        s = rng.standard_normal(M.N)
        sub = rng.choice(M.N, B.SUBSAMPLE, replace=False)
        x = rng.choice(M.N, 50, replace=False)
        est = B._percentiles(s, sub, x)
        exact = M.ranks_of(s, x) / M.N
        self.assertLess(np.abs(est - exact).max(), 0.01)


@unittest.skipIf(np is None, "ต้องติดตั้ง numpy")
class WalkForwardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.draws = synthetic_draws(30)
        cls.cfg = small_cfg()
        prep = B.prepare(cls.draws)
        cls.idxs = B.eval_indices(prep, cls.cfg)
        cls.prep, cls.idxs, cls.recs = B.run_walk_forward(cls.draws, cls.cfg, workers=1, indices=cls.idxs)

    def test_same_candidate_counts_for_model_and_random(self):
        s = B.summarize(self.prep, self.idxs, self.recs, self.cfg)
        for k, K in self.cfg["candidate_counts"].items():
            m = COUNTS[k]
            n = s["results"][k]["global"]["all"]["draws"]
            self.assertAlmostEqual(s["random"][k]["all"]["expected"], round(n * m * K / M.N, 5))
            self.assertEqual(s["results"][k]["global"]["all"]["numbers"], n * m)

    def test_frequency_only_baseline_reported(self):
        s = B.summarize(self.prep, self.idxs, self.recs, self.cfg)
        self.assertIn(B.FREQ_ONLY, [c["id"] for c in s["configs"]])
        for k in COUNTS:
            r = s["results"][k][B.FREQ_ONLY]["all"]
            self.assertEqual(r["draws"], len(self.idxs))
            self.assertEqual(r["numbers"], len(self.idxs) * COUNTS[k])
        self.assertNotIn(B.FREQ_ONLY, s["tuning"]["scores"]["first"])   # baseline ไม่ถูกเลือกเป็นชุดใช้งาน

    def test_exact_match_counting(self):
        # ถ้าเลขที่ออกจริงคือ top-1 ของ global model ต้องนับว่าถูก 1 เลข
        t = self.idxs[0]
        g, _ = B.models_at(self.prep, t, self.cfg)
        top = f"{int(M.top_k(g.scores, 1)[0]):06d}"
        draws = copy.deepcopy(self.draws)
        draws[t]["prizes"]["first"] = [top]
        rec = B.evaluate_draw(t, B.prepare(draws), self.cfg)
        self.assertEqual(rec["first"]["global"][0], 1)
        self.assertLess(rec["first"]["global"][1][0], 0.001)

    def test_tuning_ignores_holdout(self):
        dates = self.prep["dates"]
        split_of = lambda t: "validation" if dates[t] < self.cfg["backtest"]["holdout_start"] else "holdout"  # noqa: E731
        chosen, _ = B.tune(self.recs, self.idxs, self.prep, self.cfg, split_of)
        recs = copy.deepcopy(self.recs)
        for r, t in zip(recs, self.idxs):
            if split_of(t) == "holdout":
                for k in r:
                    for c in r[k]:
                        r[k][c] = (99, np.zeros_like(r[k][c][1]))   # holdout "ดีมาก" ปลอม ๆ
        chosen2, _ = B.tune(recs, self.idxs, self.prep, self.cfg, split_of)
        self.assertEqual(chosen, chosen2)
        self.assertTrue(any(split_of(t) == "holdout" for t in self.idxs))


if __name__ == "__main__":
    unittest.main()
