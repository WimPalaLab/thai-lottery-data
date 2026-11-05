"""เทสต์ส่วนเสริม: ระยะห่างเลขท้าย 2 ตัว, เดือนผิดปกติ, ตัวคำนวณช่วงปีเองใน JS ตรงกับ Python, ข้อมูลกราฟตรงตัวกรอง"""
import json
import os
import shutil
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import build_site  # noqa: E402
import lotto_data as L  # noqa: E402
import lotto_sixdigit as SIX  # noqa: E402
import lotto_stats as S  # noqa: E402
import lotto_verify as V  # noqa: E402

CSV = os.path.join(ROOT, "data", "thai_lottery.csv")
APP_JS = os.path.join(ROOT, "web", "assets", "app.js")
NODE = shutil.which("node")


class ExtrasTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.draws, _ = L.load(CSV)

    def test_gaps_last2(self):
        g = S.gaps_last2(self.draws, sims=200)
        self.assertEqual(sum(g["observed"]), g["gaps"])
        self.assertEqual(g["gaps"], g["draws"] - len({d["prizes"]["last2"][0] for d in self.draws}))
        self.assertAlmostEqual(sum(g["expected"]), sum(g["observed"]), delta=5)   # จำนวนการออกซ้ำแทบคงที่
        self.assertEqual(g, S.gaps_last2(self.draws, sims=200))                 # seed คงที่ ทำซ้ำได้
        latest = self.draws[-1]["prizes"]["last2"][0]
        self.assertEqual(g["current_gap"][int(latest)], 0)

    def test_gap_sequence(self):
        gaps, _ = S._gap_list(["01", "02", "01", "01", "02"])
        self.assertEqual(gaps, [2, 1, 3])

    def test_normal_months_not_flagged(self):
        months = {m["month"] for m in V.month_gaps(self.draws)}
        self.assertNotIn("2024-01", months)    # ม.ค. มีงวดเดียว = ปกติ
        self.assertNotIn("2023-12", months)    # ธ.ค. 3 งวด = ปกติ
        self.assertIn("2023-07", months)       # งวด 1 ส.ค. 2566 เลื่อนมา 31 ก.ค.
        self.assertIn("2020-05", months)

    def test_six_digit_period_filter_matches_data(self):
        files = build_site.build_data(self.draws, "x", "t", [], os.path.join(ROOT, "data"))
        six = files["stats/sixdigit.json"]
        e3 = [d for d in self.draws if d["era"] == "E3"]
        self.assertEqual(six["data"]["e3"]["first"]["numbers"], len(e3))
        self.assertEqual(six["data"]["e3"]["fifth"]["numbers"], 100 * len(e3))
        self.assertEqual(six["data"]["recent"]["first"]["draws"], SIX.RECENT_DRAWS)
        first_digits = [d["prizes"]["first"][0][0] for d in e3]
        self.assertEqual(six["data"]["e3"]["first"]["position"][0]["counts"][0], first_digits.count("0"))


@unittest.skipIf(NODE is None, "ไม่มี node")
class CustomRangeJsTest(unittest.TestCase):
    """ตัดฟังก์ชันคำนวณช่วงปีเองจาก app.js มารันด้วย node แล้วเทียบกับ lotto_sixdigit.py"""

    def test_js_matches_python(self):
        draws, _ = L.load(CSV)
        nums = [v for d in draws if "2010" <= d["draw_date"][:4] <= "2012" for v in d["prizes"]["third"]]
        src = open(APP_JS, encoding="utf-8").read()
        a = src.index("// ---------- six-digit stats for a custom year range")
        b = src.index("// ---------- stats: six-digit ----------")
        six = {"patterns": SIX.PATTERNS, "theory": {"pattern": SIX.PATTERN_P, "dsum": SIX.DSUM_P, "binom6": SIX.BINOM6}}
        script = src[a:b] + "\nconst r = computeSix(" + json.dumps(nums) + ", [1, 'a', 'b'], " + json.dumps(six) + ");\n" \
            "process.stdout.write(JSON.stringify(r));"
        out = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=60, check=True).stdout
        js = json.loads(out)
        py = SIX.six_digit_stats(nums, (1, "a", "b"))
        for key in ("digit", "pair"):
            self.assertEqual(js[key]["counts"], py[key]["counts"], key)
            self.assertEqual(js[key]["range95"], py[key]["range95"], key)
            self.assertAlmostEqual(js[key]["chi_square"]["p"], py[key]["chi_square"]["p"], places=6)
        for i in range(6):
            self.assertEqual(js["position"][i]["counts"], py["position"][i]["counts"])
            self.assertEqual(js["position"][i]["range95"], py["position"][i]["range95"])
        for key in ("odd", "high", "dsum", "pattern"):
            self.assertEqual(js[key]["observed"], py[key]["observed"], key)
            self.assertAlmostEqual(js[key]["chi_square"]["p"], py[key]["chi_square"]["p"], places=6)
        self.assertEqual(js["prefix_hist"]["observed"], py["prefix_hist"]["observed"])
        for x, y in zip(js["suffix_hist"]["expected"], py["suffix_hist"]["expected"]):
            self.assertAlmostEqual(x, y, places=6)


if __name__ == "__main__":
    unittest.main()
