"""เทสต์งานวิจัย ml_study: softmax/log-loss ถูกต้อง และ walk-forward ไม่เห็นข้อมูลงวดที่กำลังทาย"""
import math
import os
import random
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import lotto_ml_study as S  # noqa: E402


def rand_series(n, k, seed=1):
    rng = random.Random(seed)
    return [rng.randrange(k) for _ in range(n)]


class MathTest(unittest.TestCase):
    def test_softmax(self):
        p = S.softmax([1.0, 2.0, 3.0])
        self.assertAlmostEqual(sum(p), 1.0)
        e = [math.exp(x) for x in (1, 2, 3)]
        for a, b in zip(p, e):
            self.assertAlmostEqual(a, b / sum(e))
        # เสถียรกับค่าใหญ่
        self.assertAlmostEqual(sum(S.softmax([1000.0, 1000.0])), 1.0)
        self.assertEqual(S.softmax([0.0] * 4), [0.25] * 4)

    def test_logloss_brier_uniform(self):
        p = [0.01] * 100
        self.assertAlmostEqual(S.log_loss(p, 7), math.log(100))
        self.assertAlmostEqual(S.brier(p, 7), 1 - 1 / 100)
        self.assertAlmostEqual(S.log_loss([0.0, 1.0], 0), -math.log(1e-15))

    def test_rank(self):
        self.assertEqual(S.rank_of([0.1, 0.5, 0.4], 1), 1)
        self.assertEqual(S.rank_of([0.1, 0.5, 0.4], 0), 3)
        self.assertEqual(S.rank_of([0.25] * 4, 2), 2.5)

    def test_topk_ties_give_random_expectation(self):
        self.assertAlmostEqual(S.topk_credit([0.01] * 100, 3, 10), 0.1)
        self.assertEqual(S.topk_credit([0.1, 0.5, 0.4], 2, 2), 1.0)
        self.assertEqual(S.topk_credit([0.1, 0.5, 0.4], 0, 2), 0.0)
        self.assertAlmostEqual(S.topk_credit([0.5, 0.2, 0.2, 0.1], 2, 2), 0.5)

    def test_freq_counts_window(self):
        s = [0, 1, 1, 2]
        p = S.walk_freq(s, 3, 3, window=2, alpha=1)  # ทายงวด index 3 จาก s[1:3] = [1, 1]
        self.assertEqual(len(p), 1)
        for a, b in zip(p[0], [1 / 5, 3 / 5, 1 / 5]):
            self.assertAlmostEqual(a, b)

    def test_bootstrap_ci_contains_mean(self):
        rng = random.Random(3)
        d = [rng.gauss(0, 1) for _ in range(200)]
        lo, hi = S.bootstrap_ci(d, 500, 1)
        self.assertLess(lo, S.mean(d))
        self.assertGreater(hi, S.mean(d))


class NoLeakTest(unittest.TestCase):
    """เปลี่ยนค่าตั้งแต่งวด j เป็นต้นไป → การทายงวด ≤ j ต้องเหมือนเดิมทุกโมเดล"""

    def check(self, k):
        n, start, j = 80, 30, 50
        a = rand_series(n, k, 1)
        b = a[:j] + rand_series(n - j, k, 2)
        self.assertNotEqual(a[j:], b[j:])
        params = {"freq": {"window": 10, "alpha": 1}, "logit": {"lr": 0.05, "l2": 0.01}}
        pa = S.run_models(a, k, start, params, seed=5)
        pb = S.run_models(b, k, start, params, seed=5)
        for m in S.MODELS:
            for t in range(start, j + 1):
                self.assertEqual(pa[m][t - start], pb[m][t - start], f"{m} draw {t} leaked")
            # ตรวจด้วยว่าเทสต์มีความไว: หลังงวด j การทายของ freq/logit ต้องเปลี่ยน
            if m != "uniform":
                self.assertTrue(any(pa[m][t - start] != pb[m][t - start] for t in range(j + 1, n)))

    def test_no_leak_last2(self):
        self.check(100)

    def test_no_leak_digit(self):
        self.check(10)

    def test_features_use_only_past(self):
        s = rand_series(40, 10, 4)
        f1 = S.all_features(s, 10)
        s2 = s[:25] + [(v + 1) % 10 for v in s[25:]]
        f2 = S.all_features(s2, 10)
        self.assertEqual(f1[:26], f2[:26])
        self.assertNotEqual(f1[26:], f2[26:])


class LearnTest(unittest.TestCase):
    def test_logit_learns_a_real_pattern(self):
        """ถ้ามีรูปแบบจริง (เลขซ้ำงวดก่อนบ่อย) โมเดลต้องจับได้ → log-loss ต่ำกว่า uniform"""
        rng = random.Random(9)
        s = [0]
        for _ in range(399):
            s.append(s[-1] if rng.random() < 0.5 else rng.randrange(10))
        probs, w = S.walk_logit(s, 10, 100, lr=0.05, l2=0.0, seed=1)
        ll = S.mean([S.log_loss(p, y) for p, y in zip(probs, s[100:])])
        self.assertLess(ll, math.log(10) - 0.2)
        self.assertGreater(w[4], 0.5)  # น้ำหนักของ feature "is_previous"

    def test_split_is_by_date(self):
        dates = ["2016-12-16", "2017-01-01", "2017-01-16"]
        self.assertEqual(S.split_ranges(dates, 0, "2017-01-01"), ([0], [1, 2]))


if __name__ == "__main__":
    unittest.main()
