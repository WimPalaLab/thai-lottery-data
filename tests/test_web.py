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
        self.assertGreaterEqual(len(pages), 6)
        expected = None
        for p in pages:
            html = read(p)
            name = os.path.basename(p)
            here = "./" if name == "index.html" else name
            for cls in ("nav", "bottomnav"):
                m = re.search(rf'<nav class="{cls}"[^>]*>(.*?)</nav>', html, re.S)
                self.assertIsNotNone(m, f"{p}: {cls}")
                hrefs = re.findall(r'<a href="([^"]+)"', m.group(1))
                current = re.findall(r'<a href="([^"]+)" aria-current="page"', m.group(1))
                self.assertEqual(current, [here], f"{p}: {cls}")
                if expected is None:
                    expected = hrefs
                self.assertEqual(hrefs, expected, f"{p}: {cls}")
        for href in expected:
            if href != "./":
                self.assertTrue(os.path.exists(os.path.join(WEB, href)), href)

    def test_prohibited_wording(self):
        # รวมสคริปต์ Python ที่สร้างข้อความขึ้นเว็บ (ชื่อกลุ่มลักษณะเลข, ชื่อช่วงเวลา)
        shown = [os.path.join(ROOT, "scripts", n) for n in ("lotto_analysis.py", "build_site.py", "lotto_stats.py")]
        for p in files(".html") + files(".js") + shown:
            text = read(p).lower()
            for word in PROHIBITED:
                self.assertNotIn(word.lower(), text, f"{p}: {word}")


if __name__ == "__main__":
    unittest.main()
