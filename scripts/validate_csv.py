"""ตรวจ data/thai_lottery.csv (ใช้ใน GitHub Actions ก่อนสร้างเว็บ และกับ pull request)
ใช้: python scripts/validate_csv.py data/thai_lottery.csv
exit code 1 ถ้ามีข้อผิดพลาด; คำเตือน (เช่น งวดห่างกันเกิน 20 วัน) ไม่ทำให้ล้ม"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lotto_data as L  # noqa: E402


def main():
    header, rows = L.read_rows(sys.argv[1])
    errors, warnings = L.validate(header, rows)
    for w in warnings:
        print("::warning::" + w)
    for e in errors:
        print("::error::" + e)
    print(f"{len(rows)} งวด, {len(errors)} ข้อผิดพลาด, {len(warnings)} คำเตือน")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
