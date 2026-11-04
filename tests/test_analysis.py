"""เทสต์การคำนวณ V2/V3 (lotto_analysis) ด้วยข้อมูลเล็ก ๆ ที่ตรวจด้วยมือได้"""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import build_site  # noqa: E402
import lotto_analysis as A  # noqa: E402
import lotto_data as L  # noqa: E402
from test_stats import draw  # noqa: E402


class AdjustTest(unittest.TestCase):
    def test_bonferroni(self):
        for got, want in zip(A.bonferroni([0.01, 0.2, 0.5]), [0.03, 0.6, 1.0]):
            self.assertAlmostEqual(got, want)

    def test_fdr_bh_hand_checked(self):
        # p เรียงแล้ว 0.01, 0.02, 0.03, 0.5 (m=4): q = min ของ p×m/rank จากท้าย
        q = A.fdr_bh([0.03, 0.01, 0.5, 0.02])
        for got, want in zip(q, [0.04, 0.04, 0.5, 0.04]):
            self.assertAlmostEqual(got, want)

    def test_add_adjusted_skips_missing(self):
        t = A.add_adjusted([{"p": 0.01}, {"p": None}, {"p": 0.04}])
        self.assertAlmostEqual(t[0]["p_bonferroni"], 0.02)
        self.assertNotIn("p_bonferroni", t[1])
        self.assertAlmostEqual(t[2]["q_fdr"], 0.04)

    def test_binom_test_reference(self):
        self.assertAlmostEqual(A.binom_test_two_sided(7, 10, 0.5), 0.34375)
        self.assertAlmostEqual(A.binom_test_two_sided(0, 10, 0.5), 2 / 1024)
        self.assertAlmostEqual(A.binom_test_two_sided(5, 10, 0.5), 1.0)
        # อสมมาตร: k=3, n=10, p=0.1 → รวม P(X≥3) เพราะทุกค่า ≥3 เกิดยากกว่า; P(X=0)=0.349 > P(X=3)
        self.assertAlmostEqual(A.binom_test_two_sided(3, 10, 0.1), 0.0701908264, places=8)


class ChiSquareTest(unittest.TestCase):
    def test_pool_bins(self):
        po, pe = A.pool_bins([1, 2, 10, 1, 1], [2, 3, 10, 1, 1])
        self.assertEqual(po, [3, 12])     # 2+3=5 → ช่องแรก; 10 → ช่องที่สอง; 1+1 เศษรวมเข้าช่องสุดท้าย
        self.assertEqual(pe, [5, 12])

    def test_gof_df_and_value(self):
        r = A.chi_square_gof([60, 40], [0.5, 0.5])
        self.assertEqual(r["df"], 1)
        self.assertAlmostEqual(r["chi2"], 4.0)
        self.assertAlmostEqual(r["p"], 0.0455, places=4)
        self.assertIsNone(A.chi_square_gof([3], [1.0]))

    def test_homogeneity_identical_and_hand_value(self):
        r = A.chi_square_homogeneity([10, 20, 30], [10, 20, 30])
        self.assertAlmostEqual(r["chi2"], 0)
        # ตาราง 2×2 [[30,10],[10,30]]: E=20 ทุกช่อง → chi2 = 4 × 100/20 = 20
        r = A.chi_square_homogeneity([30, 10], [10, 30])
        self.assertAlmostEqual(r["chi2"], 20)
        self.assertEqual(r["df"], 1)

    def test_homogeneity_pools_small_columns(self):
        # คอลัมน์รวมน้อยกว่าที่ต้องการต้องถูกรวมจนทุกช่องคาดไว้ ≥ 5
        r = A.chi_square_homogeneity([1, 1, 1, 1, 20, 20], [1, 1, 1, 1, 20, 20])
        self.assertLess(r["bins"], 6)


class CharacteristicsTest(unittest.TestCase):
    def probs(self, width, key):
        return A.char_probs(width)[key]

    def test_exact_probabilities_two_digits(self):
        self.assertEqual(self.probs(2, "parity"), [0.5, 0.5])
        self.assertEqual(self.probs(2, "repeat"), [0.9, 0.1])
        self.assertEqual(self.probs(2, "consecutive"), [0.82, 0.09, 0.09])   # 01..89 / 10..98
        ds = self.probs(2, "digit_sum")
        self.assertEqual(len(ds), 19)
        self.assertAlmostEqual(ds[9], 0.10)    # 09,18,…,90 = 10 แบบ
        self.assertAlmostEqual(ds[0], 0.01)

    def test_exact_probabilities_three_digits(self):
        self.assertEqual(self.probs(3, "repeat"), [0.72, 0.09, 0.09, 0.09, 0.01])
        self.assertEqual(self.probs(3, "distinct"), [0.01, 0.27, 0.72])
        self.assertEqual(self.probs(3, "consecutive"), [0.984, 0.008, 0.008])   # 012..789 / 210..987
        ds = self.probs(3, "digit_sum")
        self.assertAlmostEqual(ds[13], 0.075)   # สูงสุด 75 แบบ
        self.assertAlmostEqual(sum(ds), 1.0)

    def test_classifiers(self):
        self.assertEqual([A.pattern3(x) for x in ("123", "112", "121", "122", "111")], [0, 1, 2, 3, 4])
        self.assertEqual([A.consecutive(x) for x in ("123", "321", "890", "13", "98")], [1, 2, 0, 0, 2])

    def test_characteristics_counts_slots(self):
        ds = [draw("2015-08-16", "11", back3=["111", "123", "200", "321"]),
              draw("2015-09-01", "34", back3=["001", "002"])]
        c = {i["key"]: i for i in A.characteristics(ds, "back3")["items"]}
        self.assertEqual(A.characteristics(ds, "back3")["n"], 6)
        self.assertEqual(c["parity"]["observed"], [2, 4])           # คู่: 200, 002
        self.assertEqual(c["repeat"]["observed"], [2, 2, 0, 1, 1])   # 123,321 / 001,002 / – / 200 / 111
        self.assertEqual(c["consecutive"]["observed"], [4, 1, 1])
        l2 = {i["key"]: i for i in A.characteristics(ds, "last2")["items"]}
        self.assertEqual(l2["repeat"]["observed"], [1, 1])
        self.assertEqual(l2["consecutive"]["observed"], [1, 1, 0])

    def test_front3_excludes_old_draws(self):
        ds = [draw("2015-08-16", "11"), draw("2015-09-01", "22", front3=["135", "246"])]
        c = A.characteristics(ds, "front3")
        self.assertEqual(c["eligible_draws"], 1)
        self.assertEqual(c["n"], 2)


class DigitsTest(unittest.TestCase):
    def test_positions(self):
        ds = [draw("2020-01-01", "05", first="000001"), draw("2020-01-16", "15", first="900001")]
        r = A.digit_positions(ds, "first")
        self.assertEqual(r["n"], 2)
        self.assertEqual(r["positions"][0]["counts"][0], 1)
        self.assertEqual(r["positions"][0]["counts"][9], 1)
        self.assertEqual(r["positions"][5]["counts"][1], 2)
        self.assertAlmostEqual(r["expected"], 0.2)
        l2 = A.digit_positions(ds, "last2")
        self.assertEqual(l2["positions"][1]["counts"][5], 2)


class YearlyCompareTest(unittest.TestCase):
    def test_yearly(self):
        ds = [draw("2015-08-16", "11"), draw("2015-09-01", "22"), draw("2016-01-01", "33")]
        y = A.yearly(ds, "back3")
        self.assertEqual([r["year"] for r in y["years"]], ["2015", "2016"])
        self.assertEqual([r["slots"] for r in y["years"]], [6, 2])
        self.assertEqual(len(y["characteristics"][0]["range95"]), 2)

    def test_compare_identical_periods(self):
        a = [draw(f"2020-01-{i + 1:02d}", f"{i:02d}") for i in range(20)]
        r = A.compare_periods(a, list(a), "last2")
        self.assertEqual(r["n_a"], 20)
        for t in r["tests"]:
            if t["chi2"] is not None:
                self.assertAlmostEqual(t["chi2"], 0)


class GapTest(unittest.TestCase):
    def test_gaps_of(self):
        self.assertEqual(sorted(A.gaps_of(["a", "b", "a", "a", "b"])), [1, 2, 3])

    def test_bins(self):
        self.assertEqual(A.bin_gaps([1, 10, 11, 300, 301, 999])[:2], [2, 1])
        self.assertEqual(A.bin_gaps([300, 301, 999])[-2:], [1, 2])

    def test_expected_total_is_exact(self):
        # ผลรวมทุก g = space × (n·p − 1 + (1 − p)^n) = จำนวนระยะห่างที่คาดไว้
        n, space = 200, 100
        p = 1 / space
        exp = A.expected_gap_counts(n, space, bins=[(1, None)])
        self.assertAlmostEqual(exp[0], space * (n * p - 1 + (1 - p) ** n), places=9)

    def test_monte_carlo_is_deterministic_and_covers_expected(self):
        a = A.gap_monte_carlo(300, 100, sims=200)
        b = A.gap_monte_carlo(300, 100, sims=200)
        self.assertEqual(a, b)
        exp = A.expected_gap_counts(300, 100)
        for (lo, hi), e in zip(a, exp):
            self.assertLessEqual(lo, e + 1)
            self.assertGreaterEqual(hi, e - 1)


class BuildV2Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        draws, _ = L.load(os.path.join(ROOT, "data", "thai_lottery.csv"))
        cls.draws = draws
        cls.files = build_site.build_data(draws, "x", "t")

    def test_scopes_and_trust_filter(self):
        f = self.files["stats/frequency.json"]
        self.assertEqual(f["trusts"], ["all", "checked", "official"])
        off = f["data"]["all"]["official"]["last2"]
        self.assertEqual(off["eligible_draws"], sum(1 for d in self.draws if d["trust_level"] == "official"))
        chk = f["data"]["all"]["checked"]["last2"]["eligible_draws"]
        self.assertEqual(chk, sum(1 for d in self.draws if d["trust_level"] != "single-source"))

    def test_comparisons_only_comparable_prizes(self):
        for pair in self.files["stats/compare.json"]["pairs"]:
            a, b = pair["a"], pair["b"]
            spans_e3 = a["first_draw"] < L.E3_START <= b["last_draw"] and not a["first_draw"] >= L.E3_START
            if spans_e3:
                self.assertNotIn("back3", pair["prizes"], pair["key"])
                self.assertNotIn("front3", pair["prizes"], pair["key"])
            if a["first_draw"] < L.E3_START:
                self.assertNotIn("front3", pair["prizes"], pair["key"])

    def test_json_is_finite(self):
        for name in ("digits", "characteristics", "timeline", "compare", "gaps"):
            json.dumps(self.files[f"stats/{name}.json"], allow_nan=False)


if __name__ == "__main__":
    unittest.main()
