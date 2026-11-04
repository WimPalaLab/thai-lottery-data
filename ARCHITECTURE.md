# ARCHITECTURE — LOTTO INSIGHT

## ภาพรวม

```text
GLO API ──(update_from_glo.py, วันละ 3 รอบ)──▶ data/thai_lottery.csv + raw/glo/
                                                   │
                         validate_csv.py (ตรวจเข้มงวด; ไม่ผ่าน = หยุด)
                                                   │
                     build_site.py  ─▶  _site/  (HTML/CSS/JS + data/*.json)
                                                   │
                                     GitHub Pages (static, ไม่มี server)
```

- `data/thai_lottery.csv` คือข้อมูลหลัก ห้ามย้ายหรือเปลี่ยนชื่อ
- `_site/` สร้างใหม่ทุกครั้งใน GitHub Actions และ **ไม่ commit** (อยู่ใน `.gitignore`) จึงไม่มี commit ที่สร้างอัตโนมัติรก history และไม่มีทางที่ไฟล์บนเว็บจะต่างจาก CSV
- ไม่มีฐานข้อมูล ไม่มี server ไม่มีระบบสมาชิก

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `scripts/lotto_data.py` | อ่าน CSV, ตรวจทุกค่าด้วย regex, กำหนดยุค (E1–E3) และระดับความน่าเชื่อถือ |
| `scripts/lotto_stats.py` | ความถี่ + ค่าคาดหวัง + ช่วง 95%, chi-square, autocorrelation, backtest (ไลบรารีมาตรฐานเท่านั้น) |
| `scripts/lotto_analysis.py` | V2/V3: แต่ละหลัก, ลักษณะเลข (exact), รายปี, เปรียบเทียบช่วงเวลา, ระยะห่าง + Monte Carlo, Bonferroni/FDR, binomial test |
| `scripts/lotto_randomness.py` | V4: runs test, serial (transition) test, Ljung–Box, Kolmogorov–Smirnov, poker test, coupon collector + Monte Carlo, power analysis |
| `scripts/lotto_ranking.py` | V4: order statistics / ค่าสูงสุด-ต่ำสุดจาก Monte Carlo, backtest 10 อันดับแรก/สุดท้ายตามช่วงย้อนหลัง, `years_before` |
| `scripts/build_site.py` | ตรวจ → คำนวณ → เขียน JSON → คัดลอกหน้าเว็บ (เฉพาะนามสกุลที่อนุญาต) |
| `scripts/validate_csv.py` | ตัวตรวจ CSV แบบ command line สำหรับ GitHub Actions |
| `web/*.html` | 10 หน้า: หน้าแรก, ผลย้อนหลัง, สถิติ, อันดับ, วันเดียวกัน, สุ่มเลข, ห้องทดลอง, สุ่มจริงไหม, ทฤษฎีที่ใช้ (HTML ล้วน), ข้อมูล — head/nav/footer เหมือนกันทุกหน้า |
| `web/assets/app.js`, `app.css` | โค้ดหน้าเว็บทั้งหมด (ไฟล์เดียวต่อชนิด) |
| `tests/` | unittest ของข้อมูล สถิติ และความปลอดภัยของหน้าเว็บ; `test_lab_js.py` รันส่วน "lab core" ของ `app.js` (ห้องทดลอง, วันเดียวกัน, ตัวสุ่มเลข, `yearsBefore`) ด้วย node (ถ้ามี) เทียบกับ Python/ค่าที่ไล่นับด้วยมือ; `test_v4.py` เทสต์ V4 ฝั่ง Python |

## ไฟล์ข้อมูลที่สร้าง (`_site/data/`)

| ไฟล์ | เนื้อหา | ใช้ที่ |
|---|---|---|
| `manifest.json` | จำนวนงวด, งวดล่าสุด, ปีที่มี, SHA-256 ของ CSV, version | ทุกหน้า (โหลดแบบ `no-cache`) |
| `latest.json` | งวดล่าสุดครบทุกรางวัล | หน้าแรก |
| `index.json` | ทุกงวด: วันที่, ยุค, ความน่าเชื่อถือ, รางวัลที่ 1, เลขหน้า/ท้าย | รายการผล, ค้นเลข 2–3 หลัก, สถิติ |
| `draws/<ปี ค.ศ.>.json` | ผลเต็มรายปี | หน้ารายงวด, ตรวจเลข 6 หลัก |
| `stats/frequency.json` | ความถี่ last2/back3/front3 ต่อ `data[ช่วงเวลา][แหล่งข้อมูล]` | สถิติ (ความถี่) |
| `stats/digits.json` | ตัวเลข 0–9 ในแต่ละหลักของ first/front3/back3/last2 ต่อขอบเขต | สถิติ (แต่ละหลัก) |
| `stats/characteristics.json` | ลักษณะเลข: จำนวนจริง, ความน่าจะเป็น exact, ช่วง 95%, chi-square ต่อขอบเขต | สถิติ (ลักษณะเลข) |
| `stats/timeline.json` | ต่อปี ต่อแหล่งข้อมูล: งวด, หมายเลข, ช่วงปกติของเลข 1 ตัว, ลักษณะเลข | สถิติ (รายปี) |
| `stats/compare.json` | คู่ช่วงเวลาที่เทียบได้และผล chi-square homogeneity | สถิติ (เทียบช่วงเวลา) |
| `stats/gaps.json` | ระยะห่างระหว่างการออกของ last2 เทียบค่าที่คาดไว้และช่วง Monte Carlo | สุ่มจริงไหม |
| `stats/randomness.json` | ต่อ `data[ช่วงเวลา][แหล่งข้อมูล]`: ผลทดสอบความสุ่มทั้งหมด (chi-square เดิม + V4) พร้อม p หลังปรับรวมกัน, backtest, power, รายละเอียด runs/serial/Ljung–Box/KS/poker/coupon | หน้าสุ่มจริงไหม |
| `stats/ranking.json` | ต่อขอบเขต: order statistics และค่าสูงสุด/ต่ำสุดจากการจำลองของ last2/back3/front3 และตัวเลขรายหลัก; `backtests[all|last20y|last10y|last5y]` (ทุกแหล่งข้อมูล) | หน้าอันดับ |
| `thai_lottery.csv` | สำเนา CSV สำหรับดาวน์โหลด | หน้าข้อมูล |

ขอบเขต (scope) = ช่วงเวลา (`all`, `last20y`, `last10y`, `last5y`, `e3`, `official`) × แหล่งข้อมูล (`all`, `checked` = ตัดข้อมูลแหล่งเดียว, `official`) คำนวณไว้ทุกคู่ล่วงหน้า หน้าเว็บแค่เลือกแสดง ยกเว้นห้องทดลองและหน้าวันเดียวกันที่ต้องนับตามเงื่อนไขที่ผู้ใช้ตั้งเองในเครื่อง (จาก `index.json`) และตัวสุ่มเลขที่สุ่มในเครื่อง (ฟังก์ชันคำนวณทั้งหมดอยู่ในส่วน "lab core" ที่เทสต์ได้)

สถานะในหน้า (มุมมอง, รางวัล, ช่วงเวลา, แหล่งข้อมูล, วันที่) เก็บใน query string ด้วย `history.replaceState` และตรวจกับรายการที่อนุญาต/regex ทุกครั้งก่อนใช้ (`readState`) ค่าที่ไม่รู้จักใช้ค่าเริ่มต้น — ไม่มีการใช้ storage

Monte Carlo ทั้งหมดใช้ `random.Random(2538)` (seed คงที่) และ cache ตามขนาดปัญหา ผลจึงเหมือนเดิมทุก build (เวลา build ราว 6 วินาที)

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
| Input ของผู้ใช้ | ช่องตรวจเลขรับเฉพาะตัวเลข 2/3/6 หลัก; พารามิเตอร์ URL ตรวจด้วย regex/รายการที่อนุญาตก่อนใช้; การค้นและห้องทดลองทำในเครื่องผู้ใช้ ไม่ส่งออกไปไหน และไม่เก็บลง storage (เทสต์ห้าม localStorage/cookie) |
| Supply chain | ไม่มี npm/pip dependency เลย (Python stdlib + JS ล้วน); GitHub Actions ปัก commit SHA; Dependabot เสนออัปเดตรายเดือน |
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
| Framework | HTML/CSS/JS ล้วน ไม่ใช้ Next.js/Astro | ผู้ใช้เน้นความปลอดภัย: ไม่มี dependency ให้ถูกโจมตีผ่าน npm, ไม่มีขั้นตอน build ของ JS, เว็บมีแค่ 10 หน้า |
| เมนู "เพิ่มเติม" | `<details>` ใน nav (JS แค่ปิดเมื่อคลิกนอก/กด Esc) | 10 หน้าไม่พอดีแถบล่างที่ 360px; ไม่ต้องใช้ JS และไม่ต้องแก้ CSP |
| ตัวสุ่มเลข | `crypto.getRandomValues` + rejection sampling | ไม่เอียงแม้แต่น้อย ไม่ใช้ `Math.random` (เทสต์ห้ามไว้) |
| ห้องทดลองคำนวณใน JS | เงื่อนไขอิสระคำนวณล่วงหน้าไม่ได้ | ฟังก์ชันคำนวณแยกเป็นส่วน "lab core" ที่ไม่แตะ DOM และเทสต์เทียบกับ Python ด้วย node |
| ระยะห่าง: เฉพาะ last2 | 1 หมายเลขต่องวดทุกยุค | เลขท้าย 3 ตัวเปลี่ยนจาก 4 เป็น 2 หมายเลขต่องวด โอกาสต่องวดจึงไม่คงที่ |
| กราฟ | SVG/CSS ที่เขียนเอง ไม่ใช้ ECharts | กราฟมีแค่ heatmap, histogram, แถบ; ไม่ต้องโหลดไลบรารี ~1 MB และไม่ต้องอนุญาต script ภายนอกใน CSP |
| ตำแหน่งไฟล์ที่สร้าง | `_site/` ใน CI ไม่ commit | ไม่ต้อง commit ไฟล์ที่สร้างอัตโนมัติ และเว็บสร้างจาก CSV เสมอ |
| Hosting | GitHub Pages | ฟรี, HTTPS, อยู่ repo เดียวกัน |
| ฟอนต์ | ฟอนต์ไทยของระบบ | ไม่ต้องโหลดจาก Google Fonts (ความเป็นส่วนตัว + CSP) |

## รันในเครื่อง

```bash
python scripts/build_site.py data/thai_lottery.csv web _site
python -m http.server 8765 --bind 127.0.0.1 --directory _site
python -m unittest discover -s tests
```
