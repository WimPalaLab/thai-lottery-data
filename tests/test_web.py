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


# เว็บใช้เองคนเดียว ใช้คำว่า "ทำนาย" ได้ แต่ห้ามอ้างความแน่นอนที่โมเดลไม่ได้ calibrate ไว้ (ดู SPEC.md)
PROHIBITED = ["โอกาสสูง", "ถูกแน่", "แม่นยำ 100", "รับประกัน", "high chance", "guaranteed"]
NAV_PAGES = ["index", "results", "stats", "analysis", "history", "random", "data"]
# หน้าคำอธิบายศัพท์ไม่อยู่ในเมนู (เข้าจากท้ายหน้าและปุ่ม "?" ข้างคำศัพท์)
PAGES = NAV_PAGES + ["glossary"]


class WebSecurityTest(unittest.TestCase):
    def test_no_dangerous_dom_sinks(self):
        bad = re.compile(r"innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|setTimeout\s*\(\s*['\"]")
        for p in files(".js"):
            self.assertIsNone(bad.search(read(p)), p)

    def test_every_page_has_strict_csp(self):
        pages = files(".html")
        self.assertEqual(sorted(os.path.splitext(os.path.basename(p))[0] for p in pages), sorted(PAGES))
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

    def test_every_page_has_same_navigation(self):
        for p in files(".html"):
            html = read(p)
            for name in NAV_PAGES[1:]:
                self.assertIn(f'href="{name}.html"', html, p)
            in_nav = os.path.splitext(os.path.basename(p))[0] in NAV_PAGES
            self.assertEqual(html.count('aria-current="page"'), 2 if in_nav else 0, p)
            self.assertIn('<a href="glossary.html">', html, f"{p}: ลิงก์คำอธิบายศัพท์ท้ายหน้า")

    def test_glossary_links_have_entries(self):
        """ทุกลิงก์ไปหน้าคำอธิบายศัพท์ (gl("id"), term(..., "id"), glossary.html#id) ต้องมีคำนั้นอยู่จริง"""
        js = read(os.path.join(WEB, "assets", "app.js"))
        block = re.search(r"const GLOSSARY = \[(.*?)\n\];", js, re.S)
        self.assertIsNotNone(block)
        ids = re.findall(r'\{ id: "([a-z0-9-]+)"', block.group(1))
        self.assertGreaterEqual(len(ids), 15)
        self.assertEqual(len(ids), len(set(ids)), "id ซ้ำ")
        refs = set(re.findall(r'\b(?:gl|term)\((?:[^()]*?, )?"([a-z0-9-]+)"\)', js))
        self.assertGreaterEqual(len(refs), 15, "ลิงก์จากหน้าอื่นน้อยเกินไป")
        refs |= set(re.findall(r"glossary\.html#([a-z0-9-]+)", js + "".join(read(p) for p in files(".html"))))
        for e in re.findall(r"see: \[([^\]]*)\]", block.group(1)):
            refs |= set(re.findall(r'"([a-z0-9-]+)"', e))
        see = re.search(r"const GLOSSARY_SEE = \{(.*?)\n\};", js, re.S)
        self.assertIsNotNone(see)
        refs |= set(re.findall(r'"([a-z0-9-]+)": \[', see.group(1)))
        self.assertEqual(sorted(refs - set(ids)), [], "ลิงก์ไปคำที่ไม่มีในหน้าอธิบายศัพท์")
        for need in ("p-value", "range95", "expected", "backtest", "validation-holdout", "mean-rank", "hybrid-score",
                     "global-score", "prize-score", "bonferroni", "autocorrelation", "chi-square", "snapshot", "sha256",
                     "small-sample"):
            self.assertIn(need, ids)
        # ลิงก์รูปแบบ glossary.html#id ต้องผ่าน safeHref ใน app.js
        safe = re.search(r"if \(/(\^\(.+?)/\.test\(str\)\) return str;", js).group(1)
        self.assertRegex("glossary.html#p-value", safe.replace("\/", "/"))

    def test_prohibited_wording(self):
        for p in files(".html") + files(".js"):
            text = read(p).lower()
            for word in PROHIBITED:
                self.assertNotIn(word.lower(), text, f"{p}: {word}")


if __name__ == "__main__":
    unittest.main()
