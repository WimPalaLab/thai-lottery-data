"""เทสต์ข้อมูลที่สร้างให้เว็บ: สถิติเลข 6 หลัก, รายงานตรวจสอบข้อมูล, snapshot/backtest ในเว็บ, การนำเข้าซ้ำ"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "tests"))
import build_site  # noqa: E402
import lotto_data as L  # noqa: E402
import lotto_predict as P  # noqa: E402
import lotto_sixdigit as SIX  # noqa: E402
import lotto_verify as V  # noqa: E402
from test_predict import fake_snapshot  # noqa: E402

CSV = os.path.join(ROOT, "data", "thai_lottery.csv")


class SixDigitStatsTest(unittest.TestCase):
    def test_counts_keep_leading_zeros(self):
        s = SIX.six_digit_stats(["000123", "000123", "987650"], (2, "a", "b"))
        self.assertEqual(s["numbers"], 3)
        self.assertEqual(s["position"][0]["counts"][0], 2)
        self.assertEqual(s["position"][0]["counts"][9], 1)
        self.assertEqual(s["digit"]["counts"][0], 2 * 3 + 1)
        self.assertEqual(sum(s["digit"]["counts"]), 18)
        self.assertEqual(s["pair"]["counts"][0], 4)        # 00 ×2 ต่อเลข "000123"
        self.assertEqual(sum(s["pair"]["counts"]), 15)
        self.assertEqual(s["dsum"]["observed"][6], 2)
        self.assertEqual(s["odd"]["observed"][2], 2)        # 000123: 1, 3
        self.assertEqual(s["pattern"]["observed"][SIX.PATTERNS.index("3111")], 2)

    def test_theory_distributions(self):
        self.assertAlmostEqual(sum(SIX.PATTERN_P), 1.0)
        self.assertAlmostEqual(sum(SIX.DSUM_P), 1.0)
        self.assertAlmostEqual(SIX.PATTERN_P[0], 151200 / 1_000_000)   # 10×9×8×7×6×5
        self.assertEqual(SIX.pattern_of("112233"), "222")

    def test_chi_square_merges_small_bins(self):
        r = SIX.chi_square_expected([10, 0, 0, 10], [0.49, 0.01, 0.01, 0.49])
        self.assertEqual(r["df"], 1)
        self.assertGreater(r["p"], 0.5)

    def test_empty_period(self):
        s = SIX.six_digit_stats([], (0, None, None))
        self.assertEqual(s["numbers"], 0)
        self.assertIsNone(s["digit"]["chi_square"])

    def test_prize_separation(self):
        d = {"prizes": {"first": ["111111"], "second": ["222222"], "third": [], "fourth": [], "fifth": [],
                        "front3": ["333"], "back3": ["444"], "last2": ["55"], "near_first": ["111110", "111112"]}}
        self.assertEqual(SIX.numbers_for([d], "first"), ["111111"])
        self.assertEqual(sorted(SIX.numbers_for([d], "all")), ["111111", "222222"])   # ไม่รวมข้างเคียง/เลขหน้า-ท้าย


class VerifyTest(unittest.TestCase):
    def test_parsers(self):
        tmp = tempfile.mkdtemp()
        try:
            with open(os.path.join(tmp, "reconciliation_log.txt"), "w", encoding="utf-8") as f:
                f.write("2007-01-16 last2: used sanook+vicha; join differs (has ['55'] / lacks ['54'], 1 numbers)\n")
                f.write("2007-01-16 last2: <script>alert(1)</script>\n")
            with open(os.path.join(tmp, "github_crosscheck.txt"), "w", encoding="utf-8") as f:
                f.write("summary\nDETAILS\nvicha 2012-02-16 fifth: only_ours=['061300'] only_theirs=['620855', 'xxxxxx'] (count ours=100 theirs=100)\n")
                f.write("vicha dates only in theirs: ['2020-05-16', '2026-01-16']\n")
            r, bad = V.parse_reconciliation(os.path.join(tmp, "reconciliation_log.txt"))
            self.assertEqual(len(r), 1)
            self.assertEqual(bad, 1)
            c, dates_only, bad2 = V.parse_crosscheck(os.path.join(tmp, "github_crosscheck.txt"))
            self.assertEqual(c[0]["only_ours"], ["061300"])
            self.assertEqual(c[0]["only_theirs"], ["620855"])   # 'xxxxxx' ถูกตัดทิ้ง
            self.assertEqual([d["date"] for d in dates_only], ["2020-05-16", "2026-01-16"])
            self.assertEqual(bad2, 0)
        finally:
            shutil.rmtree(tmp)

    def test_report_on_real_data(self):
        draws, warnings = L.load(CSV)
        v = V.build(draws, warnings, os.path.join(ROOT, "data"))
        s = v["summary"]
        self.assertEqual(s["verified"] + s["unverified"], len(draws))
        self.assertEqual(v["missing"]["prizes_2_to_5"]["count"], sum(1 for d in draws if not d["prizes_2_to_5_available"]))
        self.assertEqual(v["import_errors"]["unparsed_log_lines"], 0)
        months = {m["month"] for m in v["missing"]["month_irregular"]}
        self.assertIn("2020-05", months)   # งวด 1 เม.ย. 2563 เลื่อนไป 16 พ.ค.


class AnalysisFilesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.draws, _ = L.load(CSV)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_empty_partial_and_evaluated(self):
        meta = {"schema_version": 2, "generated_at": "t"}
        files = build_site.analysis_files(self.draws, "x", self.tmp, meta)   # ไม่มีอะไรเลย
        self.assertEqual(files["predictions/index.json"]["snapshots"], [])
        self.assertNotIn("analysis/backtest.json", files)

        prev, last = self.draws[-2], self.draws[-1]
        snap = fake_snapshot(last["draw_date"], prev["draw_date"], f"{prev['draw_date']}T12:00:00Z")
        P.write_new(os.path.join(self.tmp, "predictions", f"{last['draw_date']}.json"), snap)
        files = build_site.analysis_files(self.draws, "x", self.tmp, meta)  # มี snapshot ยังไม่ประเมิน
        self.assertEqual(files["predictions/index.json"]["snapshots"][0]["status"], "pending")
        self.assertEqual(files["predictions/index.json"]["history"][0]["status"], "no_snapshot")

        rec = P.evaluate_snapshot(snap, self.draws, P.utcnow())
        P.write_new(os.path.join(self.tmp, "evaluations", f"{last['draw_date']}.json"), rec)
        files = build_site.analysis_files(self.draws, "x", self.tmp, meta)
        idx = files["predictions/index.json"]
        self.assertEqual(idx["snapshots"][0]["status"], "evaluated")
        self.assertEqual(idx["history"][0], {"draw_date": last["draw_date"], "status": "evaluated", "snapshot": last["draw_date"],
                                             "exact_hits_total": rec["exact_hits_total"],
                                             "random_expected_total": rec["random_expected_total"]})

    def test_bad_snapshot_stops_build(self):
        snap = fake_snapshot("2099-01-16", "2099-01-01", "2026-01-01T00:00:00Z")
        snap["predictions"]["first"][0]["number"] = "12345<"
        P.write_new(os.path.join(self.tmp, "predictions", "2099-01-16.json"), snap)
        with self.assertRaises(SystemExit):
            build_site.analysis_files(self.draws, "x", self.tmp, {})

    def test_stale_backtest_is_flagged(self):
        os.makedirs(os.path.join(self.tmp, "analysis"))
        with open(os.path.join(self.tmp, "analysis", "backtest.json"), "w", encoding="utf-8") as f:
            json.dump({"csv_sha256": "old", "config_sha": "old", "code_sha": "old", "model_version": "old"}, f)
        files = build_site.analysis_files(self.draws, "x", self.tmp, {})
        self.assertFalse(files["analysis/backtest.json"]["fresh"])
        self.assertIn("csv_sha256", files["analysis/backtest.json"]["stale_reasons"])

    def test_ml_study_summary(self):
        real = os.path.join(build_site.DATA_DIR, "analysis", "ml_study.json")
        if not os.path.exists(real):
            self.skipTest("ยังไม่มี ml_study.json")
        os.makedirs(os.path.join(self.tmp, "analysis"))
        shutil.copyfile(real, os.path.join(self.tmp, "analysis", "ml_study.json"))
        ml = build_site.analysis_files(self.draws, "x", self.tmp, {})["analysis/ml_study.json"]
        self.assertFalse(ml["csv_matches"])
        self.assertNotIn("per_draw_last2", ml)
        self.assertEqual(set(ml["groups"]), {"last2", "first_digits"})
        r = ml["groups"]["last2"]["results"]["last2"]["models"]["logit"]["holdout"]
        self.assertEqual(len(r["logloss_minus_uniform_ci95"]), 2)
        with open(os.path.join(self.tmp, "analysis", "ml_study.json"), "w", encoding="utf-8") as f:
            json.dump({"schema_version": 99}, f)
        with self.assertRaises(SystemExit):
            build_site.analysis_files(self.draws, "x", self.tmp, {})

    def test_build_with_partial_dataset(self):
        files = build_site.build_data(self.draws[:3], "x", "t", [], self.tmp)
        self.assertEqual(files["manifest.json"]["draw_count"], 3)
        self.assertEqual(files["stats/sixdigit.json"]["data"]["all"]["second"]["numbers"], 0)   # ปี 2538 ไม่มีรางวัลที่ 2–5
        home = files["home.json"]
        self.assertIsNone(home["prediction"])
        self.assertIsNone(home["backtest"])
        self.assertEqual(home["pred_index"]["snapshots"], [])
        self.assertEqual(home["draw"], self.draws[2])


class HomeSummaryTest(unittest.TestCase):
    """home.json ต้องเป็นส่วนย่อยของไฟล์เต็มทุกค่า (หน้าแรกกับหน้าอื่นต้องแสดงตัวเลขเดียวกัน)"""

    def assertSubset(self, part, full, path="home"):
        if isinstance(part, dict):
            self.assertIsInstance(full, dict, path)
            for k, v in part.items():
                self.assertIn(k, full, f"{path}.{k}")
                self.assertSubset(v, full[k], f"{path}.{k}")
        elif isinstance(part, list) and part and isinstance(part[0], dict):
            self.assertLessEqual(len(part), len(full), path)
            for i, v in enumerate(part):
                self.assertSubset(v, full[i], f"{path}[{i}]")
        else:
            self.assertEqual(part, full, path)

    def test_matches_full_files_on_real_data(self):
        draws, _ = L.load(CSV)
        files = build_site.build_data(draws, "x", "t", [], os.path.join(ROOT, "data"))
        home, m = files["home.json"], files["manifest.json"]
        for k in ("draw_count", "first_draw", "latest_draw", "latest_draw_th", "latest_snapshot"):
            self.assertEqual(home[k], m[k], k)
        self.assertEqual(home["draw"], files["latest.json"]["draw"])
        self.assertSubset(home["pred_index"], files["predictions/index.json"], "pred_index")
        self.assertSubset(home["sixdigit"], files["stats/sixdigit.json"], "sixdigit")
        if "analysis/backtest.json" in files:
            self.assertSubset(home["backtest"], files["analysis/backtest.json"], "backtest")
            self.assertEqual(len(home["backtest"]["timeline"]["first"]["mean_pct"]), len(home["backtest"]["timeline"]["dates"]))
        if m["latest_snapshot"]:
            pd = files[f"predictions/{m['latest_snapshot']}.json"]
            self.assertSubset(home["prediction"], pd, "prediction")
            sn = home["prediction"]["snapshot"]
            for k, rows in sn["predictions"].items():
                self.assertEqual(len(rows), sn["candidate_counts"][k], k)   # ครบตามจำนวนเลขที่แสดง
            if pd["small"]:
                for k, v in home["prediction"]["small"]["predictions"].items():
                    self.assertEqual(len(v["rows"]), pd["small"]["candidate_counts"][k], k)
        size = len(json.dumps(home, ensure_ascii=False, separators=(",", ":")).encode())
        self.assertLess(size, 60_000, "home.json ใหญ่เกินไป")


class ImportTest(unittest.TestCase):
    def test_import_log_is_idempotent(self):
        import update_from_glo as U
        tmp = tempfile.mkdtemp()
        try:
            csv = os.path.join(tmp, "x.csv")
            U.append_import_log(csv, ["2026-11-16"], {"2026-11-16": "2026-11-16T10:00:00Z"})
            U.append_import_log(csv, ["2026-11-16"], {"2026-11-16": "2026-11-16T14:00:00Z"})
            log = json.load(open(os.path.join(tmp, "metadata", "import_log.json"), encoding="utf-8"))
            self.assertEqual(len(log["entries"]), 1)
            self.assertEqual(log["entries"][0]["retrieved_at"], "2026-11-16T10:00:00Z")
        finally:
            shutil.rmtree(tmp)

    def test_api_failure_does_not_touch_data(self):
        import update_from_glo as U
        tmp = tempfile.mkdtemp()
        try:
            csv = os.path.join(tmp, "thai_lottery.csv")
            shutil.copyfile(CSV, csv)
            before = open(csv, "rb").read()
            with mock.patch.object(U, "post", side_effect=OSError("API down")), \
                    mock.patch.object(sys, "argv", ["x", csv, tmp]):
                with self.assertRaises(OSError):
                    U.main()
            self.assertEqual(open(csv, "rb").read(), before)
            self.assertFalse(os.path.exists(os.path.join(tmp, "metadata")))
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()
