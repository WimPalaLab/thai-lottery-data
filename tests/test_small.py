"""เทสต์โมเดลเลขท้าย 2 ตัว / ท้าย 3 ตัว / หน้า 3 ตัว (small-v1), ไฟล์ snapshot เสริม และเลข 6 หลักที่ออกซ้ำ"""
import copy
import json
import os
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "tests"))
import build_site  # noqa: E402
import lotto_data as L  # noqa: E402
import lotto_meta as META  # noqa: E402
import lotto_predict as P  # noqa: E402
import lotto_sixdigit as SIX  # noqa: E402
import lotto_small as SM  # noqa: E402
from test_predict import fake_snapshot  # noqa: E402

CSV = os.path.join(ROOT, "data", "thai_lottery.csv")
SMALL_BT = os.path.join(ROOT, "data", "analysis", "backtest_small.json")


class SmallModelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.draws, _ = L.load(CSV)
        cls.cfg = META.load_config()
        cls.sc = cls.cfg[META.SMALL_KEY]

    def test_no_data_ranks_by_number(self):
        m = SM.SmallModel([], "back3", self.sc)
        self.assertEqual(m.order[:5], [0, 1, 2, 3, 4])     # คะแนนเท่ากันหมด → เลขน้อยมาก่อน

    def test_ranking_is_deterministic_and_complete(self):
        hist = SM.history(self.draws, "last2")
        a, b = SM.SmallModel(hist, "last2", self.sc), SM.SmallModel(copy.deepcopy(hist), "last2", self.sc)
        self.assertEqual(a.order, b.order)
        self.assertEqual(sorted(a.order), list(range(100)))
        s = a.scores
        self.assertTrue(all(s[x] > s[y] or (s[x] == s[y] and x < y) for x, y in zip(a.order, a.order[1:])))

    def test_counts_keep_leading_zeros(self):
        hist = [("2020-01-01", ["007", "070"]), ("2020-01-16", ["007"])]
        m = SM.SmallModel(hist, "back3", self.sc)
        self.assertEqual(m.num[7], 2)
        self.assertEqual(m.pos[0][0], 3)
        self.assertEqual(m.pos[2][7], 2)
        self.assertEqual(m.order[0], 7)
        self.assertEqual(SM.fmt_number(7, "back3"), "007")

    def test_predictions_format(self):
        p = SM.build_predictions(self.draws, self.sc)
        self.assertEqual(set(p), set(META.SMALL_KINDS))
        for k, block in p.items():
            rows = block["rows"]
            self.assertEqual(len(rows), self.sc["report_top_n"])
            self.assertEqual([r["rank"] for r in rows], list(range(1, len(rows) + 1)))
            self.assertTrue(all(len(r["number"]) == SM.WIDTH[k] and r["number"].isdigit() for r in rows))
            self.assertEqual(rows[0]["score"], 100.0)
            self.assertTrue(rows[0]["contributions"])
        self.assertEqual(p["front3"]["training_draws"], sum(1 for d in self.draws if d["prizes"]["front3"]))

    def test_walk_forward_uses_only_past(self):
        """แก้ผลงวดหลัง t แล้ว อันดับก่อนงวด t ต้องเหมือนเดิม"""
        sc = {**self.sc, "backtest": {**self.sc["backtest"], "min_training_draws": 700}}
        a = SM.walk_forward(self.draws, sc)["last2"]
        changed = copy.deepcopy(self.draws)
        for d in changed[-20:]:
            d["prizes"]["last2"] = ["00"]
        b = SM.walk_forward(changed, sc)["last2"]
        cut = len(a) - 20
        self.assertEqual([r["pcts"] for r in a[:cut]], [r["pcts"] for r in b[:cut]])
        self.assertNotEqual([r["pcts"] for r in a[cut:]], [r["pcts"] for r in b[cut:]])

    def test_random_pmf(self):
        pmf = SM.draw_hit_pmf([5], 10, 100)
        self.assertAlmostEqual(sum(pmf), 1.0)
        self.assertAlmostEqual(pmf[1], 0.1)
        pmf = SM.draw_hit_pmf([5, 5], 10, 1000)             # เลขท้าย 3 ตัวสองตัวเหมือนกัน นับ 2
        self.assertEqual(len(pmf), 3)
        self.assertAlmostEqual(pmf[2], 0.01)
        pmf = SM.draw_hit_pmf([1, 2], 10, 1000)
        self.assertAlmostEqual(pmf[1] + 2 * pmf[2], 0.02)   # ค่าคาดหวัง = K × m / space
        recs = [{"winners": [3], "hits": 0, "pcts": [0.5], "date": "x"}] * 50
        _, info = SM.random_summary(recs, 5, 100)
        self.assertAlmostEqual(info["expected"], 2.5)
        self.assertLessEqual(info["lo95"], 2)
        self.assertGreaterEqual(info["hi95"], 3)

    def test_backtest_file_matches_current_inputs(self):
        bt = json.load(open(SMALL_BT, encoding="utf-8"))
        self.assertEqual({k: bt[k] for k in ("config_sha", "code_sha", "model_version")},
                         {k: v for k, v in META.small_backtest_inputs(CSV, self.cfg).items() if k != "csv_sha256"})
        for k in META.SMALL_KINDS:
            r = bt["results"][k]["all"]
            self.assertGreater(r["draws"], 100)
            self.assertLessEqual(r["random"]["lo95"], r["random"]["expected"])

    def test_small_config_does_not_change_six_digit_hash(self):
        cfg = copy.deepcopy(self.cfg)
        cfg[META.SMALL_KEY]["recent_draws"] = 12
        self.assertEqual(META.config_sha(cfg), META.config_sha(self.cfg))
        self.assertNotEqual(META.small_config_sha(cfg), META.small_config_sha(self.cfg))


class SmallSnapshotTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.draws, _ = L.load(CSV)
        cls.cfg = META.load_config()
        cls.prev, cls.last = cls.draws[-2], cls.draws[-1]

    def test_addon_created_once_without_touching_snapshot(self):
        tmp = tempfile.mkdtemp()
        try:
            latest = self.last["draw_date"]
            target = P.next_draw_date(latest)
            P.write_new(os.path.join(tmp, f"{target}.json"), fake_snapshot(target, latest, "2026-11-05T00:00:00Z"))
            before = open(os.path.join(tmp, f"{target}.json"), "rb").read()
            args = ["snapshot", "--csv", CSV, "--pred-dir", tmp, "--small-backtest", SMALL_BT,
                    "--backtest", os.path.join(tmp, "missing.json"), "--now", f"{latest}T12:00:00Z"]
            self.assertEqual(P.main(args), 0)
            path = os.path.join(tmp, "small", f"{target}.json")
            addon = json.load(open(path, encoding="utf-8"))
            self.assertEqual(addon["kind"], "small_prediction_snapshot")
            self.assertEqual(addon["content_sha256"], P.content_sha(addon))
            self.assertEqual(addon["training_data_through"], latest)
            first = open(path, "rb").read()
            self.assertEqual(P.main(args), 0)                # รอบสองไม่เขียนทับ
            self.assertEqual(open(path, "rb").read(), first)
            self.assertEqual(open(os.path.join(tmp, f"{target}.json"), "rb").read(), before)
            build_site.check_small_addon(addon, path)
        finally:
            shutil.rmtree(tmp)

    def test_no_addon_after_draw_started(self):
        tmp = tempfile.mkdtemp()
        try:
            latest = self.last["draw_date"]
            target = P.next_draw_date(latest)
            P.write_new(os.path.join(tmp, f"{target}.json"), fake_snapshot(target, latest, "2026-11-05T00:00:00Z"))
            P.main(["snapshot", "--csv", CSV, "--pred-dir", tmp, "--small-backtest", SMALL_BT,
                    "--now", f"{target}T07:00:00Z"])
            self.assertFalse(os.path.exists(os.path.join(tmp, "small")))
        finally:
            shutil.rmtree(tmp)

    def small_part(self, winner2):
        p = SM.build_predictions(self.draws[:-1], self.cfg[META.SMALL_KEY])
        rows = p["last2"]["rows"]
        rows[0]["number"] = winner2
        return {"model_version": "small-v1", "candidate_counts": {"last2": 5, "back3": 10, "front3": 10},
                "predictions": p}

    def test_evaluate_small_in_snapshot(self):
        w = self.last["prizes"]["last2"][0]
        snap = fake_snapshot(self.last["draw_date"], self.prev["draw_date"], f"{self.prev['draw_date']}T12:00:00Z")
        snap["small_predictions"] = self.small_part(w)
        snap["content_sha256"] = P.content_sha(snap)
        rec = P.evaluate_snapshot(snap, self.draws, P.utcnow())
        self.assertEqual(rec["status"], "evaluated")
        r = rec["small_results"]["last2"]
        self.assertEqual(r["hits"], 1)
        self.assertEqual(r["exact_hits"], [w])
        self.assertAlmostEqual(r["random_expected"], 0.05)
        self.assertEqual(rec["small_results"]["back3"]["winners"], self.last["prizes"]["back3"])

    def test_evaluate_addon_and_tamper(self):
        w = self.last["prizes"]["last2"][0]
        addon = {"schema_version": 2, "kind": "small_prediction_snapshot", "target_draw_date": self.last["draw_date"],
                 "created_at": f"{self.prev['draw_date']}T12:00:00Z", "training_data_through": self.prev["draw_date"],
                 "small_predictions": self.small_part(w)}
        addon["content_sha256"] = P.content_sha(addon)
        rec = P.evaluate_snapshot(addon, self.draws, P.utcnow())
        self.assertEqual(rec["kind"], "small_prediction_evaluation")
        self.assertEqual(rec["small_results"]["last2"]["hits"], 1)
        addon["small_predictions"]["predictions"]["last2"]["rows"][1]["number"] = "99"
        self.assertEqual(P.evaluate_snapshot(addon, self.draws, P.utcnow())["status"], "invalid")


class RepeatsTest(unittest.TestCase):
    def test_synthetic(self):
        def d(date, first, fifth):
            return {"draw_date": date, "prizes": {"first": [first], "second": [], "third": [], "fourth": [],
                                                  "fifth": fifth, "near_first": ["999999"]}}
        draws = [d("2020-01-01", "000001", ["123456", "000002"]), d("2020-01-16", "123456", ["000002"]),
                 d("2020-02-01", "777777", ["000002", "123456"]), d("2020-02-16", "555555", ["000003"])]
        r = SIX.repeats(draws)
        self.assertEqual([(t["number"], t["count"]) for t in r["top"]], [("000002", 3), ("123456", 3)])   # เท่ากัน → เลขน้อยก่อน
        self.assertEqual(r["top"][1]["hits"], [["2020-01-01", "fifth"], ["2020-01-16", "first"], ["2020-02-01", "fifth"]])
        self.assertEqual(r["repeated"], 2)
        self.assertEqual(r["numbers_total"], 10)               # ไม่นับข้างเคียงรางวัลที่ 1
        self.assertEqual(SIX.repeats(draws, prizes=["first"])["repeated"], 0)

    def test_real_data(self):
        draws, _ = L.load(CSV)
        r = SIX.repeats(draws)
        self.assertEqual(sum(r["by_count"].values()), r["repeated"])
        self.assertEqual(len(r["top"]), min(20, r["repeated"]))
        keys = [(-t["count"], t["last"]) for t in r["top"]]
        self.assertEqual([k[0] for k in keys], sorted(k[0] for k in keys))
        self.assertGreater(r["expected_repeated"], 0)
        files = build_site.build_data(draws, "x", "t", [], os.path.join(ROOT, "data"))
        self.assertEqual(files["stats/repeats.json"]["top"], r["top"])
        self.assertIn("analysis/backtest_small.json", files)


if __name__ == "__main__":
    unittest.main()
