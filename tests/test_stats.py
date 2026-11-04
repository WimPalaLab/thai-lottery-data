import json
import math
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import build_site  # noqa: E402
import lotto_data as L  # noqa: E402
import lotto_stats as S  # noqa: E402


def draw(date, last2, back3=None, front3=None, first="123456", trust="official"):
    e = L.era(date)
    return {"draw_date": date, "era": e, "trust_level": trust, "prizes_2_to_5_available": True,
            "prizes": {"first": [first], "near_first": [], "second": [], "third": [], "fourth": [],
                       "fifth": [], "last2": [last2],
                       "back3": back3 if back3 is not None else (["001", "002"] if e == "E3" else
                                                                ["001", "002", "003", "004"]),
                       "front3": front3 if front3 is not None else (["100", "200"] if e == "E3" else [])}}


class DistributionTest(unittest.TestCase):
    def test_chi_square_p_reference(self):
        self.assertAlmostEqual(S.gammq(0.5, 3.841459 / 2), 0.05, places=5)   # df=1
        self.assertAlmostEqual(S.gammq(4.5, 16.918978 / 2), 0.05, places=5)  # df=9
        self.assertAlmostEqual(S.gammq(49.5, 123.225221 / 2), 0.05, places=4)  # df=99

    def test_uniform_counts(self):
        r = S.chi_square_uniform([10] * 10)
        self.assertEqual(r["chi2"], 0)
        self.assertAlmostEqual(r["p"], 1.0)

    def test_binomial(self):
        pmf = S.binom_pmf(50, 0.1)
        self.assertAlmostEqual(sum(pmf), 1.0, places=9)
        lo, hi = S.binom_interval(761, 0.01)
        self.assertLessEqual(lo, 7.61)
        self.assertGreaterEqual(hi, 7.61)
        self.assertEqual((lo, hi), (3, 13))


class FrequencyTest(unittest.TestCase):
    def test_front3_excludes_draws_without_the_prize(self):
        ds = [draw("2015-08-16", "11"), draw("2015-09-01", "22"), draw("2015-09-16", "33")]
        f = S.frequency(ds, "front3")
        self.assertEqual(f["eligible_draws"], 2)
        self.assertEqual(f["slots"], 4)
        self.assertAlmostEqual(f["expected"], 4 / 1000)

    def test_back3_counts_slots_by_era(self):
        ds = [draw("2015-08-16", "11"), draw("2015-09-01", "22")]
        f = S.frequency(ds, "back3")
        self.assertEqual(f["eligible_draws"], 2)
        self.assertEqual(f["slots"], 6)
        self.assertEqual(f["counts"][1], 2)   # 001 ออกทั้งสองงวด
        self.assertEqual(f["counts"][3], 1)   # 003 มีเฉพาะยุคเก่า

    def test_last2_counts_and_containing(self):
        ds = [draw("2020-01-01", "05"), draw("2020-01-16", "05"), draw("2020-02-01", "99")]
        f = S.frequency(ds, "last2")
        self.assertEqual(f["counts"][5], 2)
        self.assertEqual(f["draws_containing"][5], 2)
        self.assertEqual(f["counts"][99], 1)
        self.assertEqual(sum(f["counts"]), 3)
        self.assertAlmostEqual(f["expected"], 0.03)

    def test_expected_outside_is_exact(self):
        # 1 งวด: ช่วงปกติคือ 0–0 ครั้ง และเลขที่ออก 1 เลขต้องอยู่นอกช่วงเสมอ → คาดไว้ 100 × 0.01 = 1
        f = S.frequency([draw("2020-01-01", "05")], "last2")
        self.assertEqual(f["range95"], [0, 0])
        self.assertAlmostEqual(f["expected_outside"], 1.0)

    def test_histogram_sums_to_space(self):
        ds = [draw("2020-01-01", "05")]
        h = S.frequency(ds, "back3")["count_histogram"]
        self.assertEqual(sum(h["observed"]), 1000)
        self.assertAlmostEqual(sum(h["expected"]), 1000, places=6)


class BacktestTest(unittest.TestCase):
    def test_no_look_ahead(self):
        # ทุกงวดเป็นเลขใหม่ที่ไม่เคยออก: ถ้าใช้เฉพาะอดีต กลยุทธ์ hot ต้องไม่ถูกเลย
        ds = [draw(f"2020-01-{i + 1:02d}", f"{i:02d}") for i in range(30)]
        bt = S.backtest_last2(ds, pick=10, warmup=10)
        hot = next(s for s in bt["strategies"] if s["name"] == "hot")
        self.assertEqual(bt["trials"], 20)
        self.assertEqual(hot["hits"], 0)

    def test_uses_past(self):
        ds = [draw(f"2020-01-{i + 1:02d}", "07") for i in range(30)]
        bt = S.backtest_last2(ds, pick=10, warmup=5)
        hot = next(s for s in bt["strategies"] if s["name"] == "hot")
        self.assertEqual(hot["hits"], bt["trials"])

    def test_autocorr(self):
        r = S.autocorr_lag1([1, 2, 1, 2, 1, 2, 1, 2])
        self.assertLess(r["r"], -0.5)


class BuildTest(unittest.TestCase):
    def test_build_data_is_deterministic_and_finite(self):
        draws, _ = L.load(os.path.join(ROOT, "data", "thai_lottery.csv"))
        a = build_site.build_data(draws, "x", "t")
        b = build_site.build_data(draws, "x", "t")
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))
        json.dumps(a, allow_nan=False)  # ไม่มี NaN/Infinity
        m = a["manifest.json"]
        self.assertEqual(m["draw_count"], len(draws))
        self.assertEqual(sum(m["by_era"].values()), len(draws))
        self.assertEqual(sum(m["by_trust"].values()), len(draws))
        self.assertEqual(len(a["index.json"]["rows"]), len(draws))
        for t in a["stats/randomness.json"]["tests"]:
            self.assertTrue(0 <= t["p"] <= 1 and not math.isnan(t["p"]))


if __name__ == "__main__":
    unittest.main()
