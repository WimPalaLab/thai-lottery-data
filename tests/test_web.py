"""ตรวจหน้าเว็บแบบ static: ความปลอดภัยพื้นฐานและคำที่ห้ามใช้"""
import glob
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")


def files(ext):
    return glob.glob(os.path.join(WEB, "**", f"*{ext}"), recursive=True)


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


PROHIBITED = ["เลขเด็ด", "เลขมาแรง", "เลขน่าจับตา", "แนวโน้มงวดหน้า", "โอกาสสูง", "ทำนาย", "สูตร",
              "เลขเด่น", "เลขดับ", "hot number", "lucky number", "prediction", "forecast"]


class WebSecurityTest(unittest.TestCase):
    def test_no_dangerous_dom_sinks(self):
        bad = re.compile(r"innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|setTimeout\s*\(\s*['\"]")
        for p in files(".js"):
            self.assertIsNone(bad.search(read(p)), p)

    def test_every_page_has_strict_csp(self):
        pages = files(".html")
        self.assertGreaterEqual(len(pages), 5)
        for p in pages:
            html = read(p)
            m = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', html)
            self.assertIsNotNone(m, p)
            csp = m.group(1)
            for directive in ("default-src 'none'", "script-src 'self'", "connect-src 'self'",
                              "base-uri 'none'", "form-action 'none'", "object-src 'none'"):
                self.assertIn(directive, csp, p)
            self.assertNotIn("unsafe-inline", csp)
            self.assertNotIn("unsafe-eval", csp)
            self.assertIn('name="referrer" content="no-referrer"', html)

    def test_no_inline_scripts_or_handlers(self):
        for p in files(".html"):
            html = read(p)
            for tag in re.findall(r"<script\b[^>]*>", html):
                self.assertIn('src="assets/', tag, p)
            self.assertIsNone(re.search(r"\son[a-z]+\s*=", html), p)
            self.assertNotIn("style=", html, p)

    def test_no_third_party_resources(self):
        for p in files(".html") + files(".css") + files(".js"):
            text = read(p)
            for url in re.findall(r"https?://[^\s\"'`)<>]+", text):
                self.assertRegex(url, r"^(http://www\.w3\.org/2000/svg|https://www\.glo\.or\.th/|"
                                      r"http://lotto\.join\.in\.th/|https://news\.sanook\.com/)", f"{p}: {url}")

    def test_no_user_data_storage(self):
        # ไม่เก็บข้อมูลผู้ใช้: ห้องทดลองเก็บประวัติในหน่วยความจำของหน้าเท่านั้น
        for p in files(".js"):
            self.assertIsNone(re.search(r"localStorage|sessionStorage|indexedDB|document\.cookie", read(p)), p)

    def test_nav_is_identical_on_every_page(self):
        pages = sorted(files(".html"))
        self.assertGreaterEqual(len(pages), 10)
        every = {"./" if os.path.basename(p) == "index.html" else os.path.basename(p) for p in pages}
        expected = {}
        for p in pages:
            html = read(p)
            name = os.path.basename(p)
            here = "./" if name == "index.html" else name
            for cls in ("nav", "bottomnav"):
                m = re.search(rf'<nav class="{cls}"[^>]*>(.*?)</nav>', html, re.S)
                self.assertIsNotNone(m, f"{p}: {cls}")
                block = m.group(1)
                hrefs = re.findall(r'<a href="([^"]+)"', block)
                current = re.findall(r'<a href="([^"]+)" aria-current="page"', block)
                self.assertEqual(current, [here], f"{p}: {cls}")
                expected.setdefault(cls, hrefs)
                self.assertEqual(hrefs, expected[cls], f"{p}: {cls}")
                # ทุกหน้าไปถึงได้จากทั้งเมนูบนและเมนูล่าง ไม่มีหน้าซ้ำ
                self.assertEqual(sorted(hrefs), sorted(every), f"{p}: {cls}")
                # เมนู "เพิ่มเติม" เป็น <details> (เปิดได้แม้ไม่มี JS) และทำเครื่องหมายเมื่อหน้าปัจจุบันอยู่ในนั้น
                more = re.search(r'<details class="more( current)?">\s*<summary>(.*?)</summary>(.*?)</details>', block, re.S)
                self.assertIsNotNone(more, f"{p}: {cls}")
                self.assertIn("เพิ่มเติม", more.group(2))
                inside = re.findall(r'<a href="([^"]+)"', more.group(3))
                self.assertEqual(bool(more.group(1)), here in inside, f"{p}: {cls}")
        # มือถือ: ปุ่มหลักไม่เกิน 4 + เพิ่มเติม (ใช้ได้ที่ 360px)
        bottom_main = re.search(r'<nav class="bottomnav"[^>]*>(.*?)<details', read(pages[0]), re.S).group(1)
        self.assertLessEqual(len(re.findall(r"<a href=", bottom_main)), 4)
        for href in expected["nav"]:
            if href != "./":
                self.assertTrue(os.path.exists(os.path.join(WEB, href)), href)

    def test_methods_page_covers_every_method(self):
        html = read(os.path.join(WEB, "methods.html"))
        for anchor in ("expected", "binomial", "zscore", "chisq", "homog", "exact", "binomtest", "bonferroni", "fdr",
                       "autocorr", "runs", "serial", "ks", "poker", "coupon", "gaps", "montecarlo", "orderstat",
                       "backtest", "power", "ev", "samedate", "generator", "scopes"):
            self.assertIn(f'id="{anchor}"', html)
            self.assertIn(f'href="#{anchor}"', html)
        for part in ("ตอบคำถาม", "วิธีคำนวณ", "ใช้ที่", "ข้อจำกัด"):
            self.assertEqual(html.count(f"<dt>{part}</dt>"), 24, part)

    def test_generator_uses_crypto_random(self):
        js = read(os.path.join(WEB, "assets", "app.js"))
        self.assertIn("crypto.getRandomValues", js)
        self.assertNotIn("Math.random", js)

    def test_prohibited_wording(self):
        # รวมสคริปต์ Python ที่สร้างข้อความขึ้นเว็บ (ชื่อกลุ่มลักษณะเลข, ชื่อช่วงเวลา)
        shown = [os.path.join(ROOT, "scripts", n) for n in ("lotto_analysis.py", "build_site.py", "lotto_stats.py",
                                                            "lotto_randomness.py", "lotto_ranking.py")]
        for p in files(".html") + files(".js") + shown:
            text = read(p).lower()
            for word in PROHIBITED:
                self.assertNotIn(word.lower(), text, f"{p}: {word}")


if __name__ == "__main__":
    unittest.main()
