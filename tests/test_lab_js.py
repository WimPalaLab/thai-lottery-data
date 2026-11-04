"""ตรวจฟังก์ชันคำนวณของห้องทดลอง (ส่วน "lab core" ใน web/assets/app.js) เทียบกับ Python
ต้องมี node ในเครื่อง (ไม่ใช่ dependency ของเว็บ ใช้แค่ตอนทดสอบ) ถ้าไม่มีจะข้าม"""
import json
import os
import shutil
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import itertools  # noqa: E402
import lotto_analysis as A  # noqa: E402
import lotto_ranking as K  # noqa: E402
import lotto_stats as S  # noqa: E402

NODE = shutil.which("node")


def lab_core():
    with open(os.path.join(ROOT, "web", "assets", "app.js"), encoding="utf-8") as f:
        src = f.read()
    a = src.index("// ---------- lab core (BEGIN) ----------")
    b = src.index("// ---------- lab core (END) ----------")
    return src[a:b]


def run_js(expr):
    code = lab_core() + f"\nprocess.stdout.write(JSON.stringify({expr}));\n"
    out = subprocess.run([NODE, "--input-type=module", "-e", code], capture_output=True, text=True,
                         encoding="utf-8", timeout=60)
    if out.returncode:
        raise AssertionError(out.stderr)
    return json.loads(out.stdout)


def cond(width, **kw):
    c = {"digits": [None] * width, "parity": "any", "sumMin": 0, "sumMax": 9 * width,
         "repeat": "any", "consec": "any"}
    c.update(kw)
    return c


@unittest.skipUnless(NODE, "ไม่มี node")
class LabCoreTest(unittest.TestCase):
    def test_lab_core_is_pure(self):
        core = lab_core()
        for word in ("document", "window", "fetch", "localStorage"):
            self.assertNotIn(word, core)

    def test_binomial_matches_python(self):
        cases = [(7, 10, 0.5), (0, 10, 0.5), (3, 10, 0.1), (30, 761, 0.05), (120, 2512, 0.05), (2, 532, 0.001)]
        js = run_js("[" + ",".join(f"binomTwoSided({k},{n},{p})" for k, n, p in cases) + "]")
        for (k, n, p), got in zip(cases, js):
            self.assertAlmostEqual(got, A.binom_test_two_sided(k, n, p), places=9, msg=(k, n, p))
        ranges = [(761, 0.01), (2512, 0.1), (532, 0.008), (50, 0.5)]
        js = run_js("[" + ",".join(f"binomRange({n},{p})" for n, p in ranges) + "]")
        for (n, p), got in zip(ranges, js):
            self.assertEqual(tuple(got), S.binom_interval(n, p), (n, p))

    def test_adjustments_match_python(self):
        ps = [0.03, 0.01, 0.5, 0.02, 0.2]
        js = run_js(f"[bonferroniList({ps}), fdrList({ps})]")
        for got, want in zip(js[0], A.bonferroni(ps)):
            self.assertAlmostEqual(got, want)
        for got, want in zip(js[1], A.fdr_bh(ps)):
            self.assertAlmostEqual(got, want)

    def test_condition_probabilities_exact(self):
        cases = [
            (2, cond(2, parity="odd"), 0.5),
            (2, cond(2, repeat="all"), 0.1),
            (2, cond(2, consec="either"), 0.18),
            (3, cond(3, repeat="all"), 0.01),
            (3, cond(3, repeat="none"), 0.72),
            (3, cond(3, repeat="adjacent"), 0.19),        # AAB 90 + ABB 90 + AAA 10
            (3, cond(3, consec="asc"), 0.008),
            (3, cond(3, sumMin=0, sumMax=0), 0.001),
            (3, cond(3, sumMin=13, sumMax=13), 0.075),
            (6, cond(6, digits=[1, None, None, None, None, None], parity="even"), 0.05),
            (6, cond(6, repeat="none"), 0.1512),          # 10×9×8×7×6×5 / 10^6
        ]
        js = run_js("[" + ",".join(f"conditionProb({json.dumps(c)},{w})" for w, c, _ in cases) + "]")
        for (w, c, want), got in zip(cases, js):
            self.assertAlmostEqual(got, want, places=12, msg=c)

    def test_predicate_matches_python_characteristics(self):
        # "เลขเรียง" และ "เลขเบิ้ล" ในห้องทดลองต้องนิยามเหมือนหน้าลักษณะเลข
        p3 = A.char_probs(3)
        p2 = A.char_probs(2)
        js = run_js(f"[conditionProb({json.dumps(cond(3, consec='desc'))},3),"
                    f"conditionProb({json.dumps(cond(3, repeat='none'))},3),"
                    f"conditionProb({json.dumps(cond(2, repeat='all'))},2)]")
        self.assertAlmostEqual(js[0], p3["consecutive"][2])
        self.assertAlmostEqual(js[1], p3["repeat"][0])
        self.assertAlmostEqual(js[2], p2["repeat"][1])


    # ----- V4: วันเดียวกัน, ช่วงเวลา, ตัวสุ่มเลข -----
    def test_years_before_matches_python(self):
        dates = ["2026-11-01", "2024-02-29", "2028-02-29", "2000-01-16", "2025-12-30"]
        js = run_js("[" + ",".join(f'yearsBefore("{d}",{y})' for d in dates for y in (4, 5, 10, 20)) + "]")
        want = [K.years_before(d, y) for d in dates for y in (4, 5, 10, 20)]
        self.assertEqual(js, want)

    def test_next_draw_day(self):
        js = run_js('[nextDrawDay("2026-11-01"), nextDrawDay("2026-11-16"), nextDrawDay("2026-12-16"), nextDrawDay("2025-01-17")]')
        self.assertEqual(js, [[11, 16], [12, 1], [1, 1], [2, 1]])

    def test_same_date_rows(self):
        rows = [{"draw_date": d} for d in ("2019-12-30", "2020-01-17", "2020-11-16", "2021-11-01", "2021-11-17",
                                           "2022-11-16", "2023-01-02", "2023-01-03")]
        r = json.dumps(rows)
        js = run_js(f"[sameDateRows({r},11,16,0).map(x=>x.row.draw_date),"
                    f"sameDateRows({r},11,16,1).map(x=>[x.year,x.row.draw_date,x.diff]),"
                    f"sameDateRows({r},1,1,3).map(x=>[x.year,x.row.draw_date,x.diff]),"
                    f"sameDateRows({r},2,30,3).length]")
        self.assertEqual(js[0], ["2020-11-16", "2022-11-16"])
        self.assertEqual(js[1], [[2020, "2020-11-16", 0], [2021, "2021-11-17", 1], [2022, "2022-11-16", 0]])
        # 1 ม.ค. ±3 วัน: ปี 2020 ได้ 30 ธ.ค. 2562 (ห่าง 2 วัน), ปี 2023 เลือกงวดที่ใกล้กว่า (2 ม.ค.)
        self.assertEqual(js[2], [[2020, "2019-12-30", 2], [2023, "2023-01-02", 1]])
        self.assertEqual(js[3], 0)  # 30 ก.พ. ไม่มีจริง

    def test_tally(self):
        self.assertEqual(run_js('tally(["07","12","07","03","12","07"])'), [["07", 3], ["12", 2], ["03", 1]])

    def test_unseen_stats_exact(self):
        # brute force: N = 6, n = 4 → ไล่ 6^4 ลำดับ นับจำนวนเลขที่ไม่เคยออก
        N, n = 6, 4
        dist = [0] * (N + 1)
        for seq in itertools.product(range(N), repeat=n):
            dist[N - len(set(seq))] += 1
        total = N ** n
        cum, lo, hi = 0, None, N
        for u in range(N + 1):
            cum += dist[u] / total
            if lo is None and cum >= 0.025:
                lo = u
            if cum >= 0.975:
                hi = u
                break
        js = run_js(f"[unseenStats({N},{n}), unseenStats(2,2)]")
        self.assertAlmostEqual(js[0]["expected"], sum(u * c for u, c in enumerate(dist)) / total)
        self.assertEqual([js[0]["lo"], js[0]["hi"]], [lo, hi])
        self.assertAlmostEqual(js[1]["expected"], 0.5)

    def test_expected_at_least_and_chance(self):
        pmf = S.binom_pmf(30, 0.01)
        js = run_js("[expectedAtLeast(100,30,2), chanceInDraw(1000,2), chanceInDraw(100,1), expectedAtLeast(100,1,2)]")
        self.assertAlmostEqual(js[0], 100 * (1 - pmf[0] - pmf[1]))
        self.assertAlmostEqual(js[1], 1 - 0.999 ** 2)
        self.assertAlmostEqual(js[2], 0.01)
        self.assertEqual(js[3], 0)

    def test_uniform_and_weighted_picks(self):
        js = run_js("""(() => {
          const seq = (xs) => { let i = 0; return () => xs[i++]; };
          return [
            uniformBelow(10, seq([4294967295, 4294967290, 5])),
            uniformBelow(1000000, seq([123])),
            [0, 1, 2].map((r) => weightedIndex([1, 0, 2], r)),
            makeTicket("uniform", null, seq([42])),
            makeTicket("weighted", { kind: "digits", positions: [0,1,2,3,4,5].map((d) => Array.from({length: 10}, (_, i) => (i === d ? 7 : 0))) }, seq([0,0,0,0,0,0])),
            makeTicket("weighted", { kind: "last2", counts: Array.from({length: 100}, (_, i) => (i === 37 ? 3 : 0)) }, seq([9876, 2])),
            makeTicket("weighted", { kind: "back3", counts: Array(1000).fill(0) }, seq([5, 999])),
          ];
        })()""")
        self.assertEqual(js[0], 5)          # 2 ค่าแรกเกินพหุคูณของ 10 → ทิ้ง
        self.assertEqual(js[1], 123)
        self.assertEqual(js[2], [0, 2, 2])
        self.assertEqual(js[3], "000042")
        self.assertEqual(js[4], "012345")
        self.assertEqual(js[5], "987637")
        self.assertEqual(js[6], "005999")   # น้ำหนักเป็น 0 ทั้งหมด → สุ่มเท่ากัน


if __name__ == "__main__":
    unittest.main()
