# ARCHITECTURE — LOTTO INSIGHT

## ภาพรวม

```text
GLO API ──(update_from_glo.py, วันละ 3 รอบ)──▶ data/thai_lottery.csv + raw/glo/
                                                   │
                         validate_csv.py (ตรวจเข้มงวด; ไม่ผ่าน = หยุด)
                                                   │
   lotto_predict.py evaluate → backtest → snapshot (numpy) ─▶ data/evaluations/, data/analysis/, data/predictions/
                                                   │
                     build_site.py  ─▶  _site/  (HTML/CSS/JS + data/*.json)
                                                   │
                                     GitHub Pages (static, ไม่มี server)
```

- `data/thai_lottery.csv` คือข้อมูลหลัก ห้ามย้ายหรือเปลี่ยนชื่อ
- `_site/` สร้างใหม่ทุกครั้งใน GitHub Actions และ **ไม่ commit** (อยู่ใน `.gitignore`) จึงไม่มี commit ที่สร้างอัตโนมัติรก history และไม่มีทางที่ไฟล์บนเว็บจะต่างจาก CSV
- ไม่มีฐานข้อมูล ไม่มี server ไม่มีระบบสมาชิก
- ผลวิเคราะห์ที่ต้องเก็บถาวร (snapshot, ผลประเมิน, backtest, import log) **commit** ไว้ใน `data/` เพราะ snapshot ต้องพิสูจน์ได้ว่าสร้างก่อนออกรางวัล (Git history เป็นหลักฐาน)

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `scripts/lotto_data.py` | อ่าน CSV, ตรวจทุกค่าด้วย regex, กำหนดยุค (E1–E3) และระดับความน่าเชื่อถือ |
| `scripts/lotto_stats.py` | ความถี่ + ค่าคาดหวัง + ช่วง 95%, chi-square, autocorrelation, backtest (ไลบรารีมาตรฐานเท่านั้น) |
| `scripts/build_site.py` | ตรวจ → คำนวณ → เขียน JSON → คัดลอกหน้าเว็บ (เฉพาะนามสกุลที่อนุญาต) |
| `scripts/validate_csv.py` | ตัวตรวจ CSV แบบ command line สำหรับ GitHub Actions |
| `scripts/lotto_sixdigit.py` | สถิติเลข 6 หลักรางวัลที่ 1–5 (ไลบรารีมาตรฐาน) |
| `scripts/lotto_verify.py` | รายงานตรวจสอบข้อมูลจาก CSV, `reconciliation_log.txt`, `github_crosscheck.txt`, `metadata/import_log.json` |
| `scripts/lotto_meta.py` | config + hash ของโมเดล (ไลบรารีมาตรฐาน ให้ build ตรวจความสดของ backtest ได้) |
| `scripts/lotto_model.py`, `lotto_backtest.py`, `lotto_predict.py` | Hybrid model, walk-forward backtest, snapshot/ประเมินผล (numpy) — ดู MODEL.md |
| `config/model.json` | น้ำหนักและการตั้งค่าโมเดล |
| `web/*.html` | 7 หน้า: หน้าแรก, ผลย้อนหลัง, สถิติ, วิเคราะห์, ประวัติทำนาย, สุ่มจริงไหม, ข้อมูล |
| `web/assets/app.js`, `app.css` | โค้ดหน้าเว็บทั้งหมด (ไฟล์เดียวต่อชนิด) |
| `tests/` | unittest ของข้อมูล สถิติ และความปลอดภัยของหน้าเว็บ |

## ไฟล์ข้อมูลที่สร้าง (`_site/data/`)

| ไฟล์ | เนื้อหา | ใช้ที่ |
|---|---|---|
| `manifest.json` | จำนวนงวด, งวดล่าสุด, ปีที่มี, SHA-256 ของ CSV, version | ทุกหน้า (โหลดแบบ `no-cache`) |
| `latest.json` | งวดล่าสุดครบทุกรางวัล | หน้าแรก |
| `index.json` | ทุกงวด: วันที่, ยุค, ความน่าเชื่อถือ, รางวัลที่ 1, เลขหน้า/ท้าย | รายการผล, ค้นเลข 2–3 หลัก, สถิติ |
| `draws/<ปี ค.ศ.>.json` | ผลเต็มรายปี | หน้ารายงวด, ตรวจเลข 6 หลัก |
| `stats/frequency.json` | ความถี่ last2/back3/front3 × 4 ช่วงเวลา | หน้าสถิติ |
| `stats/randomness.json` | ผลทดสอบความสุ่มทั้งหมด | หน้าสุ่มจริงไหม |
| `stats/sixdigit.json` | สถิติเลข 6 หลัก × รางวัล (1–5, รวม) × ช่วงเวลา | หน้าสถิติ `?m=six` |
| `verification.json` | รายงานตรวจสอบข้อมูล | หน้าข้อมูล, หน้ารายงวด |
| `predictions/index.json` | สรุป snapshot + สถานะทุกงวดตั้งแต่เริ่มบันทึก | หน้าแรก, วิเคราะห์, ประวัติ |
| `predictions/<วันที่>.json` | snapshot + ผลประเมิน (ตรวจโครงสร้างก่อนขึ้นเว็บ) | หน้าวิเคราะห์, ประวัติ |
| `analysis/backtest.json` | ผล backtest + `fresh` (ตรงกับข้อมูล/config/โค้ดปัจจุบันไหม) | หน้าวิเคราะห์ แท็บ Backtest |
| `thai_lottery.csv` | สำเนา CSV สำหรับดาวน์โหลด | หน้าข้อมูล |

Cache: ทุกไฟล์ข้อมูลโหลดด้วย `?v=<version>` (hash ของ CSV + โค้ดหน้าเว็บ) ส่วน `manifest.json` โหลดแบบ `no-cache` ทุกครั้ง ผลงวดใหม่จึงขึ้นทันทีหลัง deploy

## GitHub Actions

| Workflow | Trigger | สิทธิ์ |
|---|---|---|
| `update.yml` → job `update` | 17:00, 21:00, 09:00 (เวลาไทย), สั่งเอง, push | `contents: write` |
| `update.yml` → job `build` | เมื่อมีงวดใหม่ / สั่งเอง / push บน main | `contents: read` |
| `update.yml` → job `deploy` | หลัง build | `pages: write`, `id-token: write` |
| `validate.yml` | pull request | `contents: read` |

ถ้าไม่มีงวดใหม่ในรอบตามเวลา จะไม่ commit และไม่ deploy

การกู้คืน: Actions → "Update lottery results and deploy site" → Run workflow (สร้างและ deploy ใหม่จาก CSV ใน main) หรือ `git revert` commit ที่ผิดแล้ว push

## ความปลอดภัย

เว็บเป็น static จึงไม่มี server หรือฐานข้อมูลให้เจาะ ความเสี่ยงที่เหลือคือ (1) มีคนแก้ข้อมูลใน repo (2) สคริปต์แปลกปลอมบนหน้าเว็บ (3) ห่วงโซ่ dependency

| ความเสี่ยง | มาตรการ |
|---|---|
| แก้ข้อมูลใน repo | เขียน repo ได้เฉพาะเจ้าของ; ทุกค่าใน CSV ต้องผ่าน regex/จำนวนตามยุค/รางวัลข้างเคียง = รางวัลที่ 1 ±1 ก่อน commit และก่อน deploy; หน้าข้อมูลแสดง SHA-256 ของ CSV เทียบกับ GitHub ได้; Git history เป็นหลักฐานและใช้ย้อนกลับได้ |
| XSS / สคริปต์แปลกปลอม | CSP เข้มงวดทุกหน้า (`default-src 'none'`, script/style/connect เฉพาะ `'self'`, ไม่มี `unsafe-inline`); สร้าง DOM ด้วย `textContent` เท่านั้น; ลิงก์ภายนอกผ่าน allowlist (glo.or.th, lotto.join.in.th, news.sanook.com) และ `rel="noopener noreferrer"`; เทสต์ห้าม sink อันตรายและ inline script |
| Input ของผู้ใช้ | ช่องตรวจเลขรับเฉพาะตัวเลข 2/3/6 หลัก; พารามิเตอร์ URL ตรวจด้วย regex ก่อนใช้; การค้นทำในเครื่องผู้ใช้ ไม่ส่งออกไปไหน |
| Supply chain | ไม่มี npm; pip มีตัวเดียวคือ numpy สำหรับ analysis engine ติดตั้งด้วย `--require-hashes --only-binary` จาก `requirements-analysis.txt` (ตัวสร้างเว็บและหน้าเว็บไม่ใช้); GitHub Actions ปัก commit SHA; Dependabot เสนออัปเดตรายเดือน |
| Snapshot ถูกแก้ย้อนหลัง | เขียนแบบสร้างใหม่เท่านั้น, มี `content_sha256`, workflow ล้มถ้าไฟล์ใน `data/predictions` หรือ `data/evaluations` ถูกแก้/ลบ, การประเมินตรวจ hash และเวลาสร้างก่อน 14:00 น. ของวันออกรางวัล |
| สิทธิ์ใน Actions | `permissions: {}` ที่ระดับ workflow และให้แต่ละ job เท่าที่ใช้; job build ไม่เก็บ token (`persist-credentials: false`) |
| ความเป็นส่วนตัว | ไม่มี analytics/cookie/font ภายนอก; `referrer: no-referrer`; `robots: noindex` |

ควรตั้งค่าใน GitHub เพิ่มเอง (ทำผ่านหน้าเว็บ GitHub):

1. Settings → Pages → Source = **GitHub Actions**
2. เปิด 2FA ของบัญชี GitHub
3. Settings → Branches → เพิ่ม rule ให้ `main`: ห้าม force push และห้ามลบ branch
4. Settings → Environments → `github-pages` → Deployment branches = `main` เท่านั้น
5. Settings → Actions → General → Workflow permissions = **Read repository contents** (workflow ขอสิทธิ์เขียนเองเฉพาะ job ที่ต้องใช้)

## การตัดสินใจ

| เรื่อง | ตัดสินใจ | เหตุผล |
|---|---|---|
| Analysis engine | Python + numpy (offline ใน Actions) ผลเก็บเป็น JSON ใน repo | จัดอันดับ 1 ล้านเลข × 535 งวด × 8 ชุด ด้วย Python ล้วนใช้เวลาเป็นชั่วโมง numpy ใช้ราว 3 นาที; ไม่ต้องมี backend/ฐานข้อมูล |
| Framework | HTML/CSS/JS ล้วน ไม่ใช้ Next.js/Astro | ผู้ใช้เน้นความปลอดภัย: ไม่มี dependency ให้ถูกโจมตีผ่าน npm, ไม่มีขั้นตอน build ของ JS, เว็บมีแค่ 5 หน้า |
| กราฟ | SVG/CSS ที่เขียนเอง ไม่ใช้ ECharts | กราฟมีแค่ heatmap, histogram, แถบ; ไม่ต้องโหลดไลบรารี ~1 MB และไม่ต้องอนุญาต script ภายนอกใน CSP |
| ตำแหน่งไฟล์ที่สร้าง | `_site/` ใน CI ไม่ commit | ไม่ต้อง commit ไฟล์ที่สร้างอัตโนมัติ และเว็บสร้างจาก CSV เสมอ |
| Hosting | GitHub Pages | ฟรี, HTTPS, อยู่ repo เดียวกัน |
| ฟอนต์ | ฟอนต์ไทยของระบบ | ไม่ต้องโหลดจาก Google Fonts (ความเป็นส่วนตัว + CSP) |

## รันในเครื่อง

```bash
python -m pip install numpy                         # เฉพาะเมื่อจะรันโมเดล/เทสต์โมเดล
python scripts/lotto_predict.py backtest --workers 4
python scripts/build_site.py data/thai_lottery.csv web _site
python -m http.server 8765 --bind 127.0.0.1 --directory _site
python -m unittest discover -s tests
```
