"""เทสต์ snapshot และการประเมิน: สร้างก่อนออกรางวัล, ห้ามเขียนทับ, ไม่มี snapshot = ประเมินไม่ได้"""
import copy
import datetime
import json
import os
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "tests"))
import lotto_data as L  # noqa: E402
import lotto_meta as META  # noqa: E402
import lotto_predict as P  # noqa: E402

try:
    import numpy as np  # noqa: F401
    from test_backtest import synthetic_draws
except ImportError:  # pragma: no cover
    np = None

CSV = os.path.join(ROOT, "data", "thai_lottery.csv")


class DateTest(unittest.TestCase):
    def test_next_draw_date(self):
        self.assertEqual(P.next_draw_date("2026-11-01"), "2026-11-16")
        self.assertEqual(P.next_draw_date("2026-11-16"), "2026-12-01")
        self.assertEqual(P.next_draw_date("2026-12-16"), "2026-12-30")
        self.assertEqual(P.next_draw_date("2026-12-30"), "2027-01-16")
        self.assertEqual(P.next_draw_date("2025-01-02"), "2025-01-16")
        self.assertEqual(P.next_draw_date("2026-05-02"), "2026-05-16")

    def test_cutoff_is_before_live_draw(self):
        # 14:00 น. เวลาไทย = 07:00 UTC
        self.assertEqual(P.iso(P.draw_cutoff("2026-11-16")), "2026-11-16T07:00:00Z")


def fake_snapshot(target, through, created, numbers=None):
    numbers = numbers or {k: ["123456", "000001", "999999", "500000", "000000", "111111", "222222", "333333", "444444", "555555"]
                          for k in META.SIX_PRIZES}
    s = {
        "schema_version": 1, "kind": "prediction_snapshot", "model_version": "test",
        "target_draw_date": target, "target_is_estimate": True, "created_at": created,
        "training_data_through": through, "candidate_counts": {"first": 3, "second": 5, "third": 8, "fourth": 10, "fifth": 10},
        "predictions": {k: [{"number": n, "rank": i + 1, "contributions": []} for i, n in enumerate(v)] for k, v in numbers.items()},
        "alternatives": {k: {"global": v[:10]} for k, v in numbers.items()},
    }
    s["content_sha256"] = P.content_sha(s)
    return s


class EvaluateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.draws, _ = L.load(CSV)
        cls.prev, cls.last = cls.draws[-2], cls.draws[-1]

    def test_evaluated_when_created_before_draw(self):
        winner = self.last["prizes"]["first"][0]
        nums = {k: ["000001"] * 10 for k in META.SIX_PRIZES}
        nums["first"] = [winner, "000002", "000003"] + ["000004"] * 7
        snap = fake_snapshot(self.last["draw_date"], self.prev["draw_date"], f"{self.prev['draw_date']}T12:00:00Z", nums)
        rec = P.evaluate_snapshot(snap, self.draws, P.utcnow())
        self.assertEqual(rec["status"], "evaluated")
        self.assertEqual(rec["results"]["first"]["exact_hits"], [winner])
        self.assertEqual(rec["exact_hits_total"], 1)
        self.assertGreater(rec["lead_time_hours"], 0)
        self.assertTrue(any(t["number"] == winner and "first" in t["prizes"] for t in rec["ticket_wins"]))

    def test_not_evaluable_when_created_after_draw_started(self):
        created = f"{self.last['draw_date']}T08:00:00Z"   # 15:00 น. เวลาไทยของวันออกรางวัล
        snap = fake_snapshot(self.last["draw_date"], self.prev["draw_date"], created)
        rec = P.evaluate_snapshot(snap, self.draws, P.utcnow())
        self.assertEqual(rec["status"], "not_evaluable")
        self.assertNotIn("results", rec)

    def test_tampered_snapshot_is_invalid(self):
        snap = fake_snapshot(self.last["draw_date"], self.prev["draw_date"], f"{self.prev['draw_date']}T12:00:00Z")
        snap["predictions"]["first"][0]["number"] = self.last["prizes"]["first"][0]
        rec = P.evaluate_snapshot(snap, self.draws, P.utcnow())
        self.assertEqual(rec["status"], "invalid")

    def test_pending_when_no_result_yet(self):
        snap = fake_snapshot("2099-01-16", self.last["draw_date"], "2026-11-05T00:00:00Z")
        self.assertIsNone(P.evaluate_snapshot(snap, self.draws, P.utcnow()))

    def test_evaluate_command_is_idempotent_and_never_overwrites(self):
        tmp = tempfile.mkdtemp()
        try:
            pred, ev = os.path.join(tmp, "p"), os.path.join(tmp, "e")
            snap = fake_snapshot(self.last["draw_date"], self.prev["draw_date"], f"{self.prev['draw_date']}T12:00:00Z")
            P.write_new(os.path.join(pred, f"{self.last['draw_date']}.json"), snap)
            args = ["evaluate", "--csv", CSV, "--pred-dir", pred, "--eval-dir", ev]
            P.main(args)
            files = os.listdir(ev)
            first = open(os.path.join(ev, files[0]), encoding="utf-8").read()
            P.main(args)
            self.assertEqual(os.listdir(ev), files)
            self.assertEqual(open(os.path.join(ev, files[0]), encoding="utf-8").read(), first)
            with self.assertRaises(FileExistsError):
                P.write_new(os.path.join(pred, f"{self.last['draw_date']}.json"), snap)
        finally:
            shutil.rmtree(tmp)


class SnapshotGuardTest(unittest.TestCase):
    def test_no_snapshot_after_next_draw_started(self):
        tmp = tempfile.mkdtemp()
        try:
            draws, _ = L.load(CSV)
            target = P.next_draw_date(draws[-1]["draw_date"])
            now = f"{target}T07:30:00Z"
            rc = P.main(["snapshot", "--csv", CSV, "--pred-dir", tmp, "--now", now,
                         "--backtest", os.path.join(tmp, "missing.json")])
            self.assertEqual(rc, 0)
            self.assertEqual(os.listdir(tmp), [])
        finally:
            shutil.rmtree(tmp)

    def test_snapshot_requires_fresh_backtest(self):
        tmp = tempfile.mkdtemp()
        try:
            rc = P.main(["snapshot", "--csv", CSV, "--pred-dir", tmp, "--now", "2000-01-01T00:00:00Z",
                         "--backtest", os.path.join(tmp, "missing.json")])
            self.assertEqual(rc, 1)
            self.assertEqual(os.listdir(tmp), [])
        finally:
            shutil.rmtree(tmp)


@unittest.skipIf(np is None, "ต้องติดตั้ง numpy")
class BuildSnapshotTest(unittest.TestCase):
    def test_snapshot_content(self):
        draws = synthetic_draws(25)
        cfg = META.load_config()
        chosen = {k: cfg["default_experiment"] for k in META.SIX_PRIZES}
        now = datetime.datetime(2011, 1, 1, tzinfo=datetime.timezone.utc)
        snap = P.build_snapshot(draws, cfg, chosen, now, "x", {"source": "default"})
        self.assertEqual(snap["training_data_through"], draws[-1]["draw_date"])
        self.assertEqual(snap["created_at"], "2011-01-01T00:00:00Z")
        self.assertEqual(snap["content_sha256"], P.content_sha(snap))
        for k in META.SIX_PRIZES:
            rows = snap["predictions"][k]
            self.assertEqual(len(rows), cfg["report_top_n"])
            self.assertEqual([r["rank"] for r in rows], list(range(1, len(rows) + 1)))
            self.assertTrue(all(len(r["number"]) == 6 and r["number"].isdigit() for r in rows))
            self.assertEqual(rows[0]["hybrid_score"], 100.0)
            hz = [r["hybrid_z"] for r in rows]
            self.assertEqual(hz, sorted(hz, reverse=True))
            self.assertTrue(rows[0]["contributions"])
            w = snap["hybrid_weights"][k]
            self.assertAlmostEqual(w["global"] + w["prize_specific"], 1.0)
            self.assertEqual(set(snap["alternatives"][k]), {"global", "prize", *cfg["hybrid_experiments"]})
        # ทำซ้ำได้ผลเดิม
        again = P.build_snapshot(copy.deepcopy(draws), cfg, chosen, now, "x", {"source": "default"})
        self.assertEqual(json.dumps(snap["predictions"]), json.dumps(again["predictions"]))


if __name__ == "__main__":
    unittest.main()
