"""เทสต์การคำนวณ V4 (lotto_randomness, lotto_ranking) ด้วยข้อมูลเล็ก ๆ ที่ตรวจด้วยมือได้"""
import itertools
import json
import math
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import build_site  # noqa: E402
import lotto_data as L  # noqa: E402
import lotto_randomness as R  # noqa: E402
import lotto_ranking as K  # noqa: E402
from test_stats import draw  # noqa: E402


class RunsTest(unittest.TestCase):
    def test_balanced_sequence_hits_expected(self):
        # 11|00|1|0 → 4 runs; n1 = n2 = 3: E = 2·9/6 + 1 = 4, Var = 2·9·(18 − 6)/(36·5) = 1.2
        r = R.runs_test([1, 1, 0, 0, 1, 0])
        self.assertEqual(r["runs"], 4)
        self.assertAlmostEqual(r["expected"], 4)
        self.assertAlmostEqual(r["sd"] ** 2, 1.2)
        self.assertAlmostEqual(r["z"], 0)
        self.assertAlmostEqual(r["p"], 1)

    def test_alternating_sequence(self):
        # 10101010: 8 runs, E = 5, Var = 2·16·24/(64·7) = 12/7 → z = 3/√(12/7)
        r = R.runs_test([1, 0] * 4)
        self.assertEqual(r["runs"], 8)
        z = 3 / math.sqrt(12 / 7)
        self.assertAlmostEqual(r["z"], z)
        self.assertAlmostEqual(r["p"], math.erfc(z / math.sqrt(2)))
        self.assertAlmostEqual(r["p"], 0.02195, places=4)

    def test_degenerate(self):
        self.assertIsNone(R.runs_test([1, 1, 1, 1]))
        self.assertIsNone(R.runs_test([0, 1]))


class SerialTest(unittest.TestCase):
    def test_transition_table(self):
        self.assertEqual(R.transition_table([0, 1, 1, 0, 0], 2), [[1, 1], [1, 1]])

    def test_independence_hand_value(self):
        # [[30,10],[10,30]]: E = 20 ทุกช่อง → χ² = 4·100/20 = 20, df = 1
        r = R.independence_chi2([[30, 10], [10, 30]])
        self.assertAlmostEqual(r["chi2"], 20)
        self.assertEqual(r["df"], 1)
        self.assertAlmostEqual(r["p"], 7.744e-6, places=8)
        self.assertAlmostEqual(R.independence_chi2([[10, 20], [20, 40]])["chi2"], 0)

    def test_too_sparse_is_none(self):
        self.assertIsNone(R.independence_chi2([[1, 2], [2, 1]]))  # คาดไว้เฉลี่ย 1.5 ต่อช่อง


class LjungBoxTest(unittest.TestCase):
    def test_hand_value(self):
        # x = 1,2,3,4: ส่วนเบี่ยง −1.5,−.5,.5,1.5, Σ² = 5; r1 = 1.25/5 = .25, r2 = −1.5/5 = −.3
        self.assertAlmostEqual(R.acf([1, 2, 3, 4], 1), 0.25)
        self.assertAlmostEqual(R.acf([1, 2, 3, 4], 2), -0.3)
        x = [1, 2, 3, 4, 5, 6, 7, 8]
        r = R.ljung_box(x, lags=2)
        r1, r2 = R.acf(x, 1), R.acf(x, 2)
        q = 8 * 10 * (r1 ** 2 / 7 + r2 ** 2 / 6)
        self.assertAlmostEqual(r["q"], q)
        self.assertEqual(r["df"], 2)
        self.assertAlmostEqual(r["p"], math.exp(-q / 2))  # df = 2: p = e^(−Q/2)

    def test_too_short(self):
        self.assertIsNone(R.ljung_box([1, 2, 3], lags=10))


class KSTest(unittest.TestCase):
    def test_kolmogorov_reference(self):
        self.assertAlmostEqual(R.kolmogorov_sf(1.3581), 0.05, places=3)
        self.assertAlmostEqual(R.kolmogorov_sf(1.6276), 0.01, places=3)
        self.assertEqual(R.kolmogorov_sf(0.1), 1.0)

    def test_d_statistic(self):
        # u = (v + .5)/10 = .15,.35,.55,.75,.95: D− = max(u_i − (i−1)/5) = .15, D+ = max(i/5 − u_i) = .05
        r = R.ks_uniform([1, 3, 5, 7, 9], 10)
        self.assertAlmostEqual(r["d"], 0.15, places=9)
        # ทุกค่ากองที่ 0: u ≈ 0.05 → D = 1 − 0.05
        self.assertAlmostEqual(R.ks_uniform([0] * 5, 10)["d"], 0.95)


class PokerTest(unittest.TestCase):
    def test_counts_hand_checked(self):
        self.assertEqual(R.pattern_count((1, 1, 1, 1, 1, 1), 6), 151200)   # 10·9·8·7·6·5
        self.assertEqual(R.pattern_count((6,), 6), 10)
        self.assertEqual(R.pattern_count((2, 1, 1, 1, 1), 6), 453600)    # C(6,2)·10·9·8·7·6
        self.assertEqual(sum(R.pattern_count(p, 6) for p in R.POKER_PATTERNS), 10 ** 6)

    def test_counts_match_brute_force(self):
        for width in (3, 4):
            brute = {}
            for t in itertools.product("0123456789", repeat=width):
                p = R.poker_pattern("".join(t))
                brute[p] = brute.get(p, 0) + 1
            for p, c in brute.items():
                self.assertEqual(R.pattern_count(p, width), c, (width, p))

    def test_classify(self):
        self.assertEqual(R.poker_pattern("112233"), (2, 2, 2))
        self.assertEqual(R.poker_pattern("111223"), (3, 2, 1))
        r = R.poker_test(["123456", "112345", "111111"])
        self.assertEqual(r["observed"][0], 1)
        self.assertEqual(r["observed"][1], 1)
        self.assertEqual(r["observed"][-1], 1)


class CouponTest(unittest.TestCase):
    def test_expected_value(self):
        e, sd = R.coupon_expected(100)
        self.assertAlmostEqual(e, 518.7377517639621)
        self.assertAlmostEqual(R.coupon_expected(2)[0], 3)  # 2·(1 + 1/2)

    def test_runs(self):
        self.assertEqual(R.coupon_runs([0, 1, 0, 2, 2, 1, 0, 1], 3), ([4, 3], 1, 1))

    def test_monte_carlo_deterministic(self):
        a = R.coupon_monte_carlo(10, sims=500, seed=1)
        b = R.coupon_monte_carlo(10, sims=500, seed=1)
        self.assertEqual(a, b)
        mean = sum(a) / len(a)
        self.assertAlmostEqual(mean, R.coupon_expected(10)[0], delta=2)  # 29.29

    def test_empirical_p(self):
        sims = list(range(1, 101))
        self.assertAlmostEqual(R.empirical_two_sided(sims, 50), 1.0)
        self.assertAlmostEqual(R.empirical_two_sided(sims, 3), 0.06)


class PowerTest(unittest.TestCase):
    def test_critical_and_power_hand_checked(self):
        # n = 10, p0 = .5: P(X≥9) = 11/1024 ≤ .025 < P(X≥8) = 56/1024 → c = 9
        self.assertEqual(R.upper_critical(10, 0.5, 0.025), 9)
        # อำนาจที่ p1 = .9: P(X≥9) = .9^10 + 10·.9^9·.1
        self.assertAlmostEqual(R.power_upper(10, 0.5, 0.9, 0.025), 0.9 ** 10 + 10 * 0.9 ** 9 * 0.1)

    def test_detectable_bias_monotone(self):
        small = R.detectable_bias(100, 0.1)
        big = R.detectable_bias(1000, 0.1)
        self.assertGreater(small, big)
        p1 = 0.1 * (1 + big)
        self.assertGreaterEqual(R.power_upper(1000, 0.1, p1, 0.025), 0.8)
        self.assertLess(R.power_upper(1000, 0.1, p1 * 0.99, 0.025), 0.8)


class RankingTest(unittest.TestCase):
    def test_order_stats_deterministic_and_sane(self):
        a = K.order_stats_mc(50, 10, 300, seed=7)
        K._MC.clear()
        b = K.order_stats_mc(50, 10, 300, seed=7)
        self.assertEqual(a, b)
        self.assertAlmostEqual(sum(a["mean"]), 50)       # ผลรวมทุกอันดับ = จำนวนหมายเลข
        self.assertEqual(a["mean"], sorted(a["mean"], reverse=True))
        self.assertGreater(a["mean"][0], 5)              # อันดับ 1 สูงกว่าค่าที่คาดไว้ต่อเลข (5) เสมอ
        self.assertEqual(sum(f for _, f in a["max_hist"]), 300)

    def test_extreme_summary(self):
        hist = [(3, 50), (4, 30), (5, 20)]
        s = K.extreme_summary(hist, 4, True)
        self.assertAlmostEqual(s["share_as_extreme"], 0.5)
        self.assertEqual(s["range95"], [3, 5])
        self.assertAlmostEqual(K.extreme_summary(hist, 3, False)["share_as_extreme"], 0.5)

    def test_number_ranking_counts(self):
        draws = [draw(f"2020-01-{i + 1:02d}", "07" if i < 3 else f"{i + 10:02d}") for i in range(10)]
        r = K.number_ranking(draws, "last2", sims=200)
        self.assertEqual(r["slots"], 10)
        self.assertEqual(r["max"]["observed"], 3)
        self.assertEqual(r["min"]["observed"], 0)
        self.assertEqual(r["per_draw"], 1)
        self.assertEqual(len(r["order"]["ranks"]), 100)

    def test_backtest_no_look_ahead_and_window(self):
        # ทุกงวดออก "05": หลัง warmup เลข 05 อยู่อันดับ 1 เสมอ → top ถูกทุกครั้ง, bottom ไม่ถูกเลย
        draws = [draw(f"{2000 + i // 24}-{i % 12 + 1:02d}-{1 + (i // 12) % 2 * 15:02d}", "05") for i in range(130)]
        draws.sort(key=lambda d: d["draw_date"])
        r = K.backtest_topk(draws, None, warmup=100)
        top = r["strategies"][0]
        self.assertEqual(r["trials"], 30)
        self.assertEqual(top["hits"], 30)
        self.assertEqual(r["strategies"][1]["hits"], 0)
        # งวดแรกที่ทดสอบยังไม่เห็นผลของตัวเอง: ถ้าลำดับคือ 00…00 แล้วออก 99 ครั้งเดียว top ต้องไม่ถูก
        draws2 = [draw(d["draw_date"], "00") for d in draws[:101]]
        draws2[100] = draw(draws[100]["draw_date"], "99")
        self.assertEqual(K.backtest_topk(draws2, None, warmup=100)["strategies"][0]["hits"], 0)

    def test_window_drops_old_draws(self):
        # 2000–2005 ออก "11", 2011–2013 ออก "22": ย้อน 5 ปีไม่เห็น 11 แล้ว → top-1 = 22 ถูกทุกงวด
        # ยกเว้นงวดแรกของปี 2011 (ช่วงย้อนหลังยังว่าง ทุกเลขเสมอกันที่ 0 → เลือก 00)
        draws = [draw(f"{y}-{m:02d}-01", "11") for y in range(2000, 2006) for m in range(1, 13)]
        draws += [draw(f"{y}-{m:02d}-16", "22") for y in range(2011, 2014) for m in range(1, 13)]
        all_hist = K.backtest_topk(draws, None, pick=1, warmup=72)
        recent = K.backtest_topk(draws, 5, pick=1, warmup=72)
        self.assertEqual(recent["strategies"][0]["hits"], 35)
        self.assertLess(all_hist["strategies"][0]["hits"], 36)

    def test_years_before_leap_day(self):
        self.assertEqual(K.years_before("2024-02-29", 5), "2019-02-28")


class BuildV4Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        draws, _ = L.load(os.path.join(ROOT, "data", "thai_lottery.csv"))
        cls.draws = draws
        cls.files = build_site.build_data(draws, "x", "t")

    def test_year_windows(self):
        f = self.files["stats/frequency.json"]
        for k in ("last5y", "last10y", "last20y"):
            self.assertIn(k, f["periods"])
        n5 = f["data"]["last5y"]["all"]["last2"]["eligible_draws"]
        n10 = f["data"]["last10y"]["all"]["last2"]["eligible_draws"]
        n20 = f["data"]["last20y"]["all"]["last2"]["eligible_draws"]
        self.assertTrue(110 <= n5 <= 125 and 230 <= n10 <= 245 and 470 <= n20 <= 485, (n5, n10, n20))

    def test_randomness_scopes_adjusted(self):
        r = self.files["stats/randomness.json"]
        for pk, per in r["data"].items():
            for tk, sc in per.items():
                m = len(sc["tests"])
                self.assertEqual(sc["test_count"], m)
                for t in sc["tests"]:
                    self.assertTrue(0 <= t["p"] <= 1, (pk, tk, t["label"]))
                    self.assertAlmostEqual(t["p_bonferroni"], min(1.0, t["p"] * m))
        groups = {t["group"] for t in r["data"]["all"]["all"]["tests"]}
        self.assertTrue({"runs", "serial", "ljung_box", "ks", "poker", "coupon"} <= groups)

    def test_ranking_json(self):
        k = self.files["stats/ranking.json"]
        sc = k["data"]["all"]["all"]
        self.assertEqual(len(sc["back3"]["order"]["ranks"]), 2 * K.EDGE)
        self.assertEqual(sc["last2"]["per_draw"], 1)
        self.assertEqual(sc["back3"]["per_draw"], 2)
        self.assertEqual(set(k["backtests"]), {"all", "last20y", "last10y", "last5y"})
        json.dumps(k, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
