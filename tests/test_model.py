"""เทสต์ของ hybrid model: feature, smoothing, การทำคะแนนมาตรฐาน, hybrid, การจัดอันดับ"""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

try:
    import numpy as np
    import lotto_model as M
except ImportError:  # pragma: no cover - CI ติดตั้ง numpy เสมอ
    np = None

import lotto_meta as META  # noqa: E402
import lotto_sixdigit as SIX  # noqa: E402


def cfg():
    return META.load_config()


@unittest.skipIf(np is None, "ต้องติดตั้ง numpy")
class UniverseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.u = M.universe()

    def test_theory_matches_combinatorics(self):
        self.assertAlmostEqual(self.u.theory["pattern"].sum(), 1.0)
        for a, b in zip(self.u.theory["pattern"], SIX.PATTERN_P):
            self.assertAlmostEqual(a, b, places=12)
        for a, b in zip(self.u.theory["dsum"], SIX.DSUM_P):
            self.assertAlmostEqual(a, b, places=12)

    def test_bins_have_enough_mass(self):
        for k, th in self.u.bin_theory.items():
            self.assertAlmostEqual(th.sum(), 1.0)
            self.assertGreater(th.min(), 0.005, k)

    def test_leading_zero_digits(self):
        self.assertEqual(M.digits_of([int("000123")])[:, 0].tolist(), [0, 0, 0, 1, 2, 3])
        self.assertEqual(M.digits_of([7])[:, 0].tolist(), [0, 0, 0, 0, 0, 7])
        self.assertEqual(self.u.prefix[123], 0)
        self.assertEqual(self.u.suffix[123], 123)


@unittest.skipIf(np is None, "ต้องติดตั้ง numpy")
class FeatureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rng = np.random.default_rng(1)
        cls.obs = rng.integers(0, M.N, 3000)
        cls.recent = cls.obs[-300:]
        cls.partial = {"front3": rng.integers(0, 1000, 200), "back3": rng.integers(0, 1000, 400),
                       "last2": rng.integers(0, 100, 100)}
        cls.feats = M.build_features(cls.obs, cls.recent, cfg(), cls.partial)
        cls.allx = np.arange(M.N)

    def test_exact_moments_match_brute_force(self):
        for f in self.feats:
            r = f.raw(self.allx)
            self.assertAlmostEqual(f.mean, r.mean(), places=9, msg=f.name)
            self.assertAlmostEqual(f.std, r.std(), places=9, msg=f.name)

    def test_fold_equals_weighted_group_scores(self):
        m = M.Model(self.feats, cfg()["feature_weights"], "global")
        gz = m.group_z(self.allx)
        direct = sum(cfg()["feature_weights"][g] * gz[g] for g in M.GROUPS)
        direct = (direct - direct.mean()) / direct.std()
        self.assertLess(np.abs(direct - m.scores).max(), 1e-9)
        self.assertAlmostEqual(m.scores.mean(), 0, places=9)
        self.assertAlmostEqual(m.scores.std(), 1, places=9)

    def test_position_indexing(self):
        obs = np.array([700000] * 50 + [123456] * 50)
        f = next(f for f in M.build_features(obs, obs, cfg()) if f.name == "position")
        q = f.info["q"]
        self.assertGreater(q[0][7], q[0][0])     # หลักที่ 1 เป็น 7 บ่อย
        self.assertGreater(q[5][0], q[5][7])     # หลักที่ 6 เป็น 0 บ่อย
        self.assertGreater(q[5][6], q[5][7])

    def test_pair_and_triplet_extraction(self):
        obs = np.array([123456])
        fs = {f.name: f for f in M.build_features(obs, obs, cfg())}
        q = fs["pair"].info["q"]
        for a, b in ((1, 2), (2, 3), (3, 4), (4, 5), (5, 6)):
            self.assertGreater(q[a, b], q[6, 1])
        self.assertEqual(int(fs["triplet"].info["prefix_c"][123]), 1)
        self.assertEqual(int(fs["triplet"].info["suffix_c"][456]), 1)
        self.assertEqual(int(fs["triplet"].info["prefix_c"].sum()), 1)

    def test_smoothing_shrinks_toward_uniform(self):
        counts = np.array([5] + [0] * 9)
        weak, _ = M._log_ratio(counts, 1, 0.1)
        strong, _ = M._log_ratio(counts, 100, 0.1)
        self.assertGreater(weak[0], strong[0])
        self.assertGreater(strong[0], 0)
        zero, q = M._log_ratio(np.zeros(10), 5, 0.1)
        self.assertTrue(np.allclose(zero, 0))
        self.assertAlmostEqual(q.sum(), 1)

    def test_empty_observations_give_neutral_scores(self):
        m = M.model_from_obs(np.zeros(0, dtype=np.int64), np.zeros(0, dtype=np.int64), cfg(), "prize")
        self.assertTrue(np.allclose(m.scores, 0))


@unittest.skipIf(np is None, "ต้องติดตั้ง numpy")
class RankingTest(unittest.TestCase):
    def test_hybrid_arithmetic(self):
        g = np.array([1.0, 0.0, -1.0])
        p = np.array([0.0, 2.0, 1.0])
        self.assertTrue(np.allclose(M.hybrid(g, p, 0.4), [0.4, 1.2, 0.2]))
        self.assertTrue(np.allclose(M.hybrid(g, p, 1.0), g))
        self.assertTrue(np.allclose(M.hybrid(g, p, 0.0), p))

    def test_top_k_is_deterministic_with_ties(self):
        s = np.zeros(M.N)
        s[[900000, 5, 77]] = 3.0
        s[[42, 10]] = 2.0
        self.assertEqual(M.top_k(s, 4).tolist(), [5, 77, 900000, 10])
        self.assertEqual(M.top_k(s, 4).tolist(), M.top_k(s.copy(), 4).tolist())

    def test_ranks_match_brute_force(self):
        rng = np.random.default_rng(3)
        s = rng.standard_normal(M.N)
        s[11] = s[12]  # คะแนนเท่ากัน
        x = np.array([11, 12, 999999, 0, int(np.argmax(s))])
        brute = [1 + int((s > s[v]).sum()) for v in x]
        self.assertEqual(M.ranks_of(s, x).tolist(), brute)
        self.assertEqual(M.ranks_of(s, x)[-1], 1)

    def test_scale_100(self):
        s = np.array([-2.0, 0.0, 2.0])
        f = M.scale_100(s)
        self.assertTrue(np.allclose(f(s), [0, 50, 100]))


if __name__ == "__main__":
    unittest.main()
