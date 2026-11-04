import csv
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import lotto_data as L  # noqa: E402

CSV = os.path.join(ROOT, "data", "thai_lottery.csv")


def nums(n, width, start=0):
    return "|".join(f"{start + i:0{width}d}" for i in range(n))


def e3_row(date="2026-11-16", **over):
    r = {
        "draw_date": date, "draw_date_th": L.thai_date(date), "source": "glo.or.th API",
        "first": "123456", "first_special": "", "near_first": "123455|123457",
        "second": nums(5, 6, 1000), "third": nums(10, 6, 2000), "fourth": nums(50, 6, 3000),
        "fifth": nums(100, 6, 4000), "front3": "012|345", "back3": "678|901", "last2": "05",
        "prizes_2_to_5_available": "yes", "reconciliation_notes": "",
        "source_url": "https://www.glo.or.th/api/checking/getLotteryResult",
    }
    r.update(over)
    return [r[h] for h in L.HEADER]


def e1_row(date="1996-01-16", **over):
    r = dict(zip(L.HEADER, e3_row(date)))
    r.update(source="lotto.join.in.th", near_first="", second="", third="", fourth="", fifth="",
             front3="", back3="001|002|003|004", prizes_2_to_5_available="no",
             source_url="http://lotto.join.in.th/result.php?myselect=390116")
    r.update(over)
    return [r[h] for h in L.HEADER]


def errors_of(rows):
    return L.validate(L.HEADER, rows)[0]


class RealDataTest(unittest.TestCase):
    def test_real_csv_is_valid(self):
        header, rows = L.read_rows(CSV)
        errors, warnings = L.validate(header, rows)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_bom_is_stripped_and_values_stay_strings(self):
        draws, _ = L.load(CSV)
        self.assertEqual(draws[0]["draw_date"], "1995-01-16")
        for d in draws:
            for vals in d["prizes"].values():
                self.assertTrue(all(isinstance(v, str) for v in vals))
        # มีงวดที่เลขขึ้นต้นด้วย 0 และต้องไม่หาย
        self.assertTrue(any(d["prizes"]["last2"][0].startswith("0") for d in draws))

    def test_eras(self):
        draws, _ = L.load(CSV)
        missing = [d for d in draws if not d["prizes_2_to_5_available"]]
        self.assertEqual(len(missing), 126)
        self.assertTrue(all(d["era"] == "E1" and d["prizes"]["fifth"] == [] for d in missing))
        self.assertEqual(sum(1 for d in draws if d["era"] == "E1"), 133)
        for d in draws:
            if d["era"] != "E3":
                self.assertEqual(d["prizes"]["front3"], [])
                self.assertEqual(len(d["prizes"]["back3"]), 4)
            else:
                self.assertEqual(len(d["prizes"]["front3"]), 2)
                self.assertEqual(len(d["prizes"]["back3"]), 2)
        self.assertEqual(L.era("2000-07-16"), "E1")
        self.assertEqual(L.era("2000-08-01"), "E2")
        self.assertEqual(L.era("2015-08-16"), "E2")
        self.assertEqual(L.era("2015-09-01"), "E3")

    def test_postponed_draw(self):
        draws, _ = L.load(CSV)
        d = next(d for d in draws if d["draw_date"] == "2020-04-01")
        self.assertEqual(d["actual_draw_date"], "2020-05-16")
        self.assertEqual(d["actual_draw_date_th"], "16 พฤษภาคม 2563")

    def test_trust_levels(self):
        draws, _ = L.load(CSV)
        for d in draws:
            if d["draw_date"] >= L.OFFICIAL_START:
                self.assertEqual(d["trust_level"], "official")
            if d["draw_date"] < "2007-01-01":
                self.assertEqual(d["trust_level"], "single-source")


class ValidationTest(unittest.TestCase):
    def test_good_rows(self):
        self.assertEqual(errors_of([e1_row(), e3_row()]), [])

    def test_wrong_count_for_era(self):
        self.assertTrue(errors_of([e3_row(back3="001|002|003|004")]))
        self.assertTrue(errors_of([e3_row(front3="")]))
        self.assertTrue(errors_of([e1_row(front3="111|222")]))

    def test_e1_must_not_have_prizes_after_e2(self):
        self.assertTrue(errors_of([e1_row(date="2001-01-16",
                                          source_url="http://lotto.join.in.th/result.php?myselect=440116")]))

    def test_digits_and_leading_zeros(self):
        self.assertTrue(errors_of([e3_row(last2="5")]))
        self.assertTrue(errors_of([e3_row(first="12345a")]))
        self.assertTrue(errors_of([e3_row(last2="٠٥")]))  # ตัวเลขอารบิก ไม่ใช่ ASCII

    def test_unsorted_and_duplicate(self):
        self.assertTrue(errors_of([e3_row(front3="345|012")]))
        self.assertTrue(errors_of([e3_row(), e3_row()]))
        self.assertTrue(errors_of([e3_row("2026-12-01"), e3_row("2026-11-16")]))

    def test_near_first_must_be_neighbours(self):
        self.assertTrue(errors_of([e3_row(near_first="111111|222222")]))

    def test_injection_is_rejected(self):
        self.assertTrue(errors_of([e3_row(reconciliation_notes="<script>alert(1)</script>")]))
        self.assertTrue(errors_of([e3_row(source_url="javascript:alert(1)")]))
        self.assertTrue(errors_of([e3_row(source_url="https://evil.example/")]))
        self.assertTrue(errors_of([e3_row(source="<b>x</b>")]))
        self.assertTrue(errors_of([e3_row(first_special='"><img src=x>')]))

    def test_thai_date_must_match(self):
        self.assertTrue(errors_of([e3_row(draw_date_th="16 พฤศจิกายน 2026")]))

    def test_long_gap_warns(self):
        errors, warnings = L.validate(L.HEADER, [e3_row("2026-11-16"), e3_row("2027-01-16", first="000000",
                                                                            near_first="000001|999999")])
        self.assertEqual(errors, [])
        self.assertEqual(len(warnings), 1)

    def test_load_raises_on_bad_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "bad.csv")
            with open(path, "w", encoding="utf-8-sig", newline="") as f:
                w = csv.writer(f)
                w.writerow(L.HEADER)
                w.writerow(e3_row(last2="xx"))
            with self.assertRaises(L.DataError):
                L.load(path)


if __name__ == "__main__":
    unittest.main()
