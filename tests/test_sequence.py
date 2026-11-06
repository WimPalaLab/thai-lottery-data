import os
import random
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import lotto_data as L  # noqa: E402
import lotto_sequence as Q  # noqa: E402
import lotto_stats as S  # noqa: E402


class RunsTestTest(unittest.TestCase):
    def test_known_sequence(self):
        # TTFFTF: n1=3 n2=3 runs=4, E = 2*3*3/6 + 1 = 4, Var = 2*9*(18-6)/(36*5) = 1.2
        r = Q.runs_test([1, 1, 0, 0, 1, 0])
        self.assertEqual(r["runs"], 4)
        self.assertAlmostEqual(r["expected"], 4.0)
        self.assertAlmostEqual(r["sd"], 1.2 ** 0.5, places=3)
        self.assertAlmostEqual(r["z"], 0.0)
        self.assertAlmostEqual(r["p"], 1.0)

    def test_alternating_has_too_many_runs(self):
        r = Q.runs_test([i % 2 for i in range(100)])
        self.assertEqual(r["runs"], 100)
        self.assertAlmostEqual(r["expected"], 51.0)
        self.assertGreater(r["z"], 9)
        self.assertLess(r["p"], 1e-6)

    def test_blocks_have_too_few_runs(self):
        r = Q.runs_test([1] * 50 + [0] * 50)
        self.assertEqual(r["runs"], 2)
        self.assertLess(r["z"], -9)

    def test_random_is_normal_and_constant_is_none(self):
        rng = random.Random(7)
        r = Q.runs_test([rng.random() < 0.5 for _ in range(2000)])
        self.assertGreater(r["p"], 0.01)
        self.assertIsNone(Q.runs_test([1, 1, 1]))


def vecs_from(digits_per_draw):
    out = []
    for ds in digits_per_draw:
        v = [0] * 10
        for x in ds:
            v[x] += 1
        out.append(v)
    return out


class ChangePointTest(unittest.TestCase):
    def setUp(self):
        rng = random.Random(11)
        before = [[rng.randrange(10) for _ in range(6)] for _ in range(150)]
        # หลังงวดที่ 150 ตัวเลข 0–4 ออกบ่อยกว่า 5–9 (จำลองแหล่งข้อมูลที่มีปัญหา)
        after = [[rng.randrange(5) if rng.random() < 0.3 else rng.randrange(10) for _ in range(6)]
                 for _ in range(150)]
        self.planted = vecs_from(before + after)
        shuffled = list(self.planted)
        random.Random(3).shuffle(shuffled)
        self.shuffled = shuffled

    def test_finds_planted_shift(self):
        r = Q.change_point_scan(self.planted, sims=199, seed=1)
        self.assertLess(r["p"], 0.01)
        self.assertLess(abs(r["split"] - 150), 15)

    def test_no_shift_in_shuffled(self):
        r = Q.change_point_scan(self.shuffled, sims=199, seed=1)
        self.assertGreater(r["p"], 0.05)

    def test_deterministic(self):
        a = Q.change_point_scan(self.planted, sims=99, seed=5)
        b = Q.change_point_scan(self.planted, sims=99, seed=5)
        self.assertEqual(a, b)

    def test_split_matches_brute_force(self):
        def chi2(vs, k):
            a = [sum(v[c] for v in vs[:k]) for c in range(10)]
            b = [sum(v[c] for v in vs[k:]) for c in range(10)]
            na, nb = sum(a), sum(b)
            n = na + nb
            s = 0.0
            for c in range(10):
                t = a[c] + b[c]
                if t:
                    s += (a[c] - t * na / n) ** 2 / (t * na / n) + (b[c] - t * nb / n) ** 2 / (t * nb / n)
            return s
        vs = self.planted[:80]
        best = max(range(10, 70 + 1), key=lambda k: chi2(vs, k))
        stat, at = Q.max_split_chi2(vs, 10)
        self.assertEqual(at, best)
        self.assertAlmostEqual(stat, chi2(vs, best), places=6)


class RealDataTest(unittest.TestCase):
    def test_randomness_includes_new_tests_in_bonferroni(self):
        draws, _ = L.load(os.path.join(ROOT, "data", "thai_lottery.csv"))
        r = S.randomness(draws)
        groups = {t["group"] for t in r["tests"]}
        self.assertIn("runs", groups)
        self.assertIn("change_point", groups)
        self.assertEqual(r["test_count"], len(r["tests"]))
        for t in r["runs"] + r["change_points"]:
            self.assertAlmostEqual(t["p_bonferroni"], min(1.0, t["p"] * r["test_count"]))
        for c in r["change_points"]:
            self.assertTrue(c["from"] <= c["change_date"] <= c["to"])
            self.assertEqual(c["n_before"] + c["n_after"], c["draws"])
        self.assertIn(L.OFFICIAL_START, [b["date"] for b in r["change_boundaries"]])


if __name__ == "__main__":
    unittest.main()
