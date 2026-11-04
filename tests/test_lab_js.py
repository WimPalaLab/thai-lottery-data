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
import lotto_analysis as A  # noqa: E402
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


if __name__ == "__main__":
    unittest.main()
