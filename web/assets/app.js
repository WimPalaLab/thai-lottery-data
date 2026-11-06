// LOTTO INSIGHT — หน้าเว็บ static ไม่มี dependency ภายนอก
// ความปลอดภัย: สร้าง DOM ด้วย textContent/createElement เท่านั้น (ไม่แปลงข้อความเป็น HTML),
// โหลดข้อมูลจาก origin เดียวกันเท่านั้น (CSP connect-src 'self'), ตรวจรูปแบบข้อมูลก่อนแสดง
"use strict";

// ---------- DOM helpers ----------
const SVG_NS = "http://www.w3.org/2000/svg";

function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  setAttrs(node, attrs);
  append(node, children);
  return node;
}

function s(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
  append(node, children);
  return node;
}

function setAttrs(node, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "href") node.setAttribute("href", safeHref(v));
    else node.setAttribute(k, v === true ? "" : String(v));
  }
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// ลิงก์ภายในหรือ https/http ไปยังโดเมนที่รู้จักเท่านั้น
const EXTERNAL_OK = /^(https:\/\/www\.glo\.or\.th\/|http:\/\/lotto\.join\.in\.th\/|https:\/\/news\.sanook\.com\/)/;
function safeHref(v) {
  const str = String(v);
  if (/^(\.\/|[a-z0-9_-]+\.html(\?[a-zA-Z0-9=&_-]*)?(#[a-z0-9-]*)?$|data\/[a-z0-9_./-]+$|#)/.test(str)) return str;
  if (EXTERNAL_OK.test(str)) return str;
  return "#";
}

function extLink(url, text) {
  return h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, text);
}

const app = () => document.getElementById("app");
function render(...nodes) {
  const root = app();
  root.replaceChildren(...nodes.flat());
  root.removeAttribute("aria-busy");   // กล่องเทาระหว่างโหลดถูกแทนที่แล้ว
}

// ---------- formatting ----------
const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function thShort(date) {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y + 543}`;
}
const fmt = new Intl.NumberFormat("th-TH");
const fmt1 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });
const fmt2 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
function fmtP(p) {
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

const PRIZE_LABEL = {
  first: "รางวัลที่ 1",
  near_first: "ข้างเคียงรางวัลที่ 1",
  second: "รางวัลที่ 2",
  third: "รางวัลที่ 3",
  fourth: "รางวัลที่ 4",
  fifth: "รางวัลที่ 5",
  front3: "เลขหน้า 3 ตัว",
  back3: "เลขท้าย 3 ตัว",
  last2: "เลขท้าย 2 ตัว",
};
const PRIZE_ORDER = ["first", "near_first", "second", "third", "fourth", "fifth", "front3", "back3", "last2"];
const TRUST = {
  "official": { label: "ข้อมูลทางการ GLO", cls: "ok" },
  "cross-checked": { label: "ตรวจทาน 2 แหล่ง", cls: "" },
  "single-source": { label: "แหล่งเดียว", cls: "warn" },
};
function trustChip(level) {
  const t = TRUST[level] || { label: level, cls: "gray" };
  return h("span", { class: `chip ${t.cls}`, title: "ระดับความน่าเชื่อถือของแหล่งข้อมูล" }, t.label);
}
const SIX = ["first", "second", "third", "fourth", "fifth"];
const SIX_LABEL = {
  first: "รางวัลที่ 1", second: "รางวัลที่ 2", third: "รางวัลที่ 3", fourth: "รางวัลที่ 4", fifth: "รางวัลที่ 5", all: "รวมรางวัลที่ 1–5",
};
const GROUP_LABEL = {
  digit: "ตัวเลข 0–9 ที่ออกบ่อย", position: "ตัวเลขแต่ละหลัก", pattern: "คู่/สามตัว/รูปแบบเลข",
  time_window: "ช่วงหลัง ๆ", distribution: "ผลรวม/คู่คี่/สูงต่ำ", statistical: "ตัวเลขที่มักตามกัน",
};
const SCOPE_LABEL = { global: "ทุกรางวัล", prize: "รางวัลนี้" };
// เลขท้าย 2 ตัว / ท้าย 3 ตัว / หน้า 3 ตัว (โมเดล small-v1)
const SMALL = ["last2", "back3", "front3"];
const SMALL_GROUP_LABEL = { position: "ตัวเลขแต่ละหลัก", digit: "ตัวเลข 0–9 รวมทุกหลัก", number: "เลขนี้เคยออกบ่อย", recent: "ช่วงหลัง ๆ" };
const RE_SMALL = { last2: /^\d{2}$/, back3: /^\d{3}$/, front3: /^\d{3}$/ };
const STATUS = {
  pending: { label: "รอผล", cls: "" },
  evaluated: { label: "ตรวจผลแล้ว", cls: "ok" },
  not_evaluable: { label: "ตรวจผลไม่ได้", cls: "warn" },
  no_snapshot: { label: "ไม่มีบันทึก", cls: "gray" },
  invalid: { label: "บันทึกถูกแก้", cls: "err" },
};
function statusChip(st) {
  const t = STATUS[st] || { label: st, cls: "gray" };
  return h("span", { class: `chip ${t.cls}` }, t.label);
}
const PATTERN_SHORT = {
  "111111": "ไม่ซ้ำ", "21111": "คู่ 1", "2211": "คู่ 2", "222": "คู่ 3", "3111": "ตอง", "321": "ตอง+คู่",
  "33": "ตอง×2", "411": "สี่ตัว", "42": "สี่+คู่", "51": "ห้าตัว", "6": "หกตัว",
};
const RE_SIX = /^\d{6}$/;
function cfgLabel(id, w) {
  if (id === "global") return "ดูทุกรางวัลรวมกันอย่างเดียว";
  if (id === "prize") return "ดูเฉพาะรางวัลนี้อย่างเดียว";
  if (id === "tuned") return "ชุดที่เลือกใช้";
  if (id === "freq") return "นับความถี่ธรรมดา (ไว้เทียบ)";
  return `ชุด ${id} (ทุกรางวัล ${Math.round(w * 100)}% / รางวัลนี้ ${Math.round((1 - w) * 100)}%)`;
}
function thDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
}
function leadText(hours) {
  if (hours === null || hours === undefined) return "–";
  if (hours < 0) return "หลังออกรางวัล";
  const d = Math.floor(hours / 24);
  return d >= 1 ? `${d} วัน ${Math.round(hours - d * 24)} ชม.` : `${fmt1.format(hours)} ชม.`;
}
const pctile = (p) => (p === null || p === undefined ? "–" : `${(p * 100).toFixed(1)}%`);

// ---------- data loading ----------
let manifestPromise;
function manifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("data/manifest.json", { cache: "no-cache", credentials: "omit" })
      .then(checkResponse)
      .then((m) => {
        if (!m || typeof m.version !== "string" || !/^[0-9a-f]{12}$/.test(m.version)) throw new Error("manifest ไม่ถูกต้อง");
        return m;
      });
  }
  return manifestPromise;
}
async function checkResponse(r) {
  if (!r.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${r.status})`);
  return r.json();
}
const cache = new Map();
async function getData(name) {
  if (!/^[a-z0-9_/-]+\.json$/.test(name)) throw new Error("ชื่อไฟล์ข้อมูลไม่ถูกต้อง");
  const m = await manifest();
  if (!cache.has(name)) {
    cache.set(name, fetch(`data/${name}?v=${m.version}`, { credentials: "omit" }).then(checkResponse));
  }
  return cache.get(name);
}
async function optionalData(name) {
  try {
    return await getData(name);
  } catch (e) {
    cache.delete(name);
    return null;
  }
}
async function index() {
  const d = await getData("index.json");
  const f = d.fields;
  return d.rows.map((r) => Object.fromEntries(f.map((k, i) => [k, r[i]])));
}
async function allDraws(onProgress) {
  const m = await manifest();
  let done = 0;
  const parts = await Promise.all(m.years.map((y) => {
    if (!/^\d{4}$/.test(y)) throw new Error("ปีไม่ถูกต้อง");
    return getData(`draws/${y}.json`).then((d) => { done++; onProgress && onProgress(done / m.years.length); return d.draws; });
  }));
  return parts.flat();
}

function showError(err) {
  render(h("div", { class: "card" },
    h("h2", null, "โหลดข้อมูลไม่สำเร็จ"),
    h("p", { class: "muted" }, String(err && err.message || err)),
    h("button", { class: "btn btn-ghost", type: "button", onclick: () => location.reload() }, "ลองใหม่")));
}

// ---------- shared UI ----------
function pageHead(title, sub) {
  return h("div", { class: "page-head" }, h("h1", null, title), sub ? h("p", null, sub) : null);
}
function stat(k, v, title) {
  return h("div", { class: "stat", title }, h("div", { class: "k" }, k), h("div", { class: "v" }, v));
}
function nums(list) {
  return list && list.length ? list.join("  ") : "–";
}

// ---------- ดาวน์โหลดตารางเป็น CSV ----------
// สร้างไฟล์ในเครื่องจากข้อมูลที่แสดงอยู่ (ไม่ส่งข้อมูลออกไปไหน) · ใส่ BOM ให้ Excel อ่านภาษาไทยได้
// กันสูตร Excel: ข้อความที่ขึ้นต้นด้วย = + - @ (ที่ไม่ใช่ตัวเลข) ใส่ ' นำหน้า
function csvCell(v) {
  let str = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(str) && !/^-?\d+(\.\d+)?$/.test(str)) str = `'${str}`;
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
function csvText(header, rows) {
  return `\uFEFF${[header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
function csvButton(filename, header, rows) {
  const btn = h("button", { type: "button", class: "btn btn-ghost csv-btn", title: "เลขเก็บเป็นข้อความ ถ้าเปิดใน Excel แล้วเลข 0 ด้านหน้าหาย ให้นำเข้าเป็นข้อความ" },
    s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: "M12 4v11M7 10l5 5 5-5M5 20h14" })), "ดาวน์โหลด CSV");
  btn.addEventListener("click", () => {
    const body = typeof rows === "function" ? rows() : rows;
    const url = URL.createObjectURL(new Blob([csvText(header, body)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", filename.replace(/[^a-z0-9_.-]/gi, "_"));
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  return btn;
}
const r4 = (x) => (x === null || x === undefined ? "" : Math.round(x * 10000) / 10000);

// ---------- คำอธิบายศัพท์ (glossary.html) ----------
// แต่ละคำมี id ใช้เป็น anchor: glossary.html#<id> · เทสต์ตรวจว่าทุกลิงก์ใน app.js มีคำนี้อยู่จริง
const GLOSSARY_GROUPS = [
  ["basic", "อ่านตัวเลขสถิติ"],
  ["test", "เทียบกับการสุ่ม"],
  ["model", "การจัดอันดับและการทดสอบย้อนหลัง"],
  ["record", "การบันทึกและแหล่งข้อมูล"],
];
const GLOSSARY = [
  { id: "expected", group: "basic", term: "ถ้าสุ่มควรเป็น", aka: "ค่าที่คาดไว้ (expected value)", body: [
    "จำนวนที่ควรได้โดยเฉลี่ย ถ้าผลออกแบบสุ่มที่ยุติธรรม เช่น เลขท้าย 2 ตัวมี 100 แบบ ถ้านับ 1,000 งวด แต่ละเลขควรออกราว 1,000 ÷ 100 = 10 ครั้ง",
    "ของจริงไม่ตรงเป๊ะเสมอ ห่างไปบ้างเป็นเรื่องปกติ ให้ดู \"ช่วงปกติ\" ว่าห่างแค่ไหนจึงยังถือว่าเหมือนสุ่ม"], see: ["range95"] },
  { id: "range95", group: "basic", term: "ช่วงปกติ (95%)", aka: "ช่วงที่การสุ่มให้ได้ 95 ใน 100 ครั้ง", body: [
    "ช่วงของจำนวนครั้งที่การสุ่มจริงให้ได้ 95 ใน 100 ครั้ง ถ้าค่าที่เห็นอยู่ในช่วงนี้ แปลว่ายังเหมือนการสุ่ม",
    "แม้สุ่มจริง ก็จะมีราว 5 ใน 100 ที่หลุดช่วงนี้โดยบังเอิญ เช่น เลข 00–99 ควรมีราว 5 เลขอยู่นอกช่วงเสมอ การหลุดช่วงจึงไม่ได้แปลว่าเลขนั้นพิเศษหรือจะออกอีก",
    "ในกราฟ ช่วงปกติคือแถบสีเขียวจาง และในแผนที่เลขคือช่องที่มีกรอบ"], see: ["expected", "small-sample"] },
  { id: "small-sample", group: "basic", term: "ข้อมูลน้อย / ความแกว่ง", aka: "ขนาดตัวอย่างเล็ก", body: [
    "ยิ่งข้อมูลน้อย ตัวเลขยิ่งเหวี่ยงไปมาโดยบังเอิญ เช่น ถ้าแต่ละเลขควรออกแค่ 2 ครั้ง เลขที่ออก 5 ครั้งก็เกิดได้บ่อยจากการสุ่มล้วน ๆ",
    "เว็บจะขึ้นคำเตือน \"ข้อมูลน้อย\" เมื่อแต่ละเลขควรออกน้อยกว่า 5 ครั้ง ลองเลือกช่วงเวลาที่ยาวขึ้นเพื่อให้เห็นภาพที่นิ่งกว่า",
    "ช่วงสั้น (เช่น 24 งวดล่าสุด) จึงแกว่งกว่าข้อมูลทั้งหมดเป็นธรรมดา ไม่ได้แปลว่าเลขไหน \"กำลังมา\""], see: ["range95"] },
  { id: "run", group: "basic", term: "ตัวเลขเรียงติดกัน", aka: "ความยาวช่วงเรียงที่ยาวที่สุดในเลข 6 หลัก", body: [
    "นับว่าในเลข 6 หลักมีตัวเลขเรียงติดกันยาวสุดกี่หลัก: ตัวถัดไปมากขึ้นทีละ 1 (เช่น 345) หรือน้อยลงทีละ 1 (เช่น 987) ในทิศเดียวกัน 9 กับ 0 ไม่นับว่าติดกัน",
    "เลขที่ไม่มีคู่ไหนติดกันเลยนับเป็น 1 ซึ่งมีราว 37% ของเลขทั้งหมด ส่วนเรียงครบ 6 หลัก (เช่น 123456) มีแค่ 10 เลขจาก 1 ล้านเลข",
    "เลขเรียงไม่ได้ออกยากหรือง่ายกว่าเลขอื่น เลข 123456 มีโอกาสเท่ากับ 804271 ทุกประการ ที่ดูหายากเพราะเลขเรียงมีจำนวนน้อย"], see: ["expected", "chi-square"] },
  { id: "ci", group: "basic", term: "ช่วงคลาดเคลื่อน", aka: "ช่วงความเชื่อมั่น 95%", body: [
    "ช่วงที่ค่าจริงน่าจะอยู่ เมื่อคิดเผื่อว่าผลที่วัดได้มีความบังเอิญปนอยู่",
    "ในหน้าทดสอบย้อนหลัง ถ้าช่วงนี้คร่อม 50% แปลว่าแยกไม่ออกจากการสุ่ม"], see: ["mean-rank"] },
  { id: "p-value", group: "test", term: "ค่า p", aka: "p-value", body: [
    "ถ้าผลออกแบบสุ่มจริง โอกาสที่จะเห็นความเบี้ยวมากเท่านี้หรือมากกว่ามีเท่าไร ยิ่งน้อยยิ่งต่างจากการสุ่ม เว็บนี้ถือว่าต่ำกว่า 0.05 = ต่างชัด",
    "ค่า p ไม่ได้บอกว่าเลขไหนจะออก และค่า p ต่ำครั้งเดียวยังไม่พอ เพราะถ้าทดสอบหลายแบบ ย่อมมีบางแบบที่ต่ำโดยบังเอิญ"], see: ["bonferroni", "chi-square"] },
  { id: "chi-square", group: "test", term: "การทดสอบไคสแควร์", aka: "chi-square test", body: [
    "วิธีเทียบว่าจำนวนที่นับได้ทั้งชุด (เช่น เลข 00–99 ทั้ง 100 เลข) ห่างจาก \"ถ้าสุ่มควรเป็น\" รวมกันมากแค่ไหน แล้วสรุปเป็นค่า p ตัวเดียว",
    "ใช้ตอบคำถาม \"ภาพรวมเหมือนการสุ่มไหม\" ไม่ได้บอกว่าเลขไหนเด่น บนเว็บจะเห็นเป็นข้อความ \"ภาพรวมไม่ต่างจากการสุ่ม\" หรือ \"ต่างจากการสุ่มค่อนข้างชัด\""], see: ["p-value", "expected"] },
  { id: "bonferroni", group: "test", term: "การปรับตามจำนวนการทดสอบ", aka: "Bonferroni correction · ค่า p หลังปรับ", body: [
    "ถ้าทดสอบ 20 แบบ ต่อให้สุ่มจริงทั้งหมด ก็คาดได้ว่าจะมีราว 1 แบบที่ค่า p ต่ำกว่า 0.05 โดยบังเอิญ",
    "จึงปรับโดยคูณค่า p ด้วยจำนวนการทดสอบ (สูงสุดไม่เกิน 1) เรียกว่า \"ค่า p หลังปรับ\" ถ้ายังต่ำกว่า 0.05 จึงถือว่าผิดปกติ",
    "เป็นวิธีที่เข้มงวด ช่วยไม่ให้ตื่นเต้นกับความบังเอิญ"], see: ["p-value"] },
  { id: "autocorrelation", group: "test", term: "ความเกี่ยวข้องกับงวดก่อน", aka: "autocorrelation", body: [
    "วัดว่าเลขของงวดหนึ่งช่วยบอกเลขงวดถัดไปได้ไหม ค่าอยู่ระหว่าง -1 ถึง 1 ค่าใกล้ 0 = ไม่เกี่ยวกัน",
    "ถ้าค่าอยู่ใน \"ช่วงปกติ\" (±) ที่แสดงไว้ ความต่างจาก 0 เป็นเรื่องบังเอิญ ผลจริงของสลากอยู่ในช่วงนี้ งวดก่อนจึงไม่ได้บอกอะไรเกี่ยวกับงวดถัดไป"], see: ["range95"] },
  { id: "runs-test", group: "test", term: "การนับช่วงที่ออกติดกัน", aka: "runs test (Wald–Wolfowitz)", body: [
    "แบ่งผลแต่ละงวดเป็น 2 แบบ เช่น เลขท้าย 2 ตัว 50–99 กับ 00–49 แล้วนับว่ามีกี่ \"ช่วง\" ที่ออกแบบเดียวกันติดกัน เช่น สูง สูง ต่ำ สูง = 3 ช่วง",
    "ถ้าสุ่มจริง จำนวนช่วงจะใกล้ค่าที่คาดไว้ ถ้าน้อยไปแปลว่าออกแบบเดิมติดกันนานผิดปกติ ถ้ามากไปแปลว่าสลับกันถี่ผิดปกติ",
    "ค่า z บอกว่าห่างจากค่าที่คาดไว้กี่เท่าของความแกว่งปกติ ราว -2 ถึง 2 ถือว่าปกติ"], see: ["p-value", "autocorrelation"] },
  { id: "change-point", group: "test", term: "จุดเปลี่ยนของข้อมูล", aka: "change point detection", body: [
    "ลองแบ่งข้อมูลเป็น \"ก่อน\" กับ \"หลัง\" ทุกงวดที่เป็นไปได้ แล้วหาจุดที่ตัวเลข 0–9 ก่อนและหลังกระจายต่างกันมากที่สุด",
    "จุดที่ต่างที่สุดย่อมมีเสมอแม้ข้อมูลสุ่มล้วน ๆ จึงเทียบกับการสลับลำดับงวดแบบสุ่มหลายร้อยครั้ง ถ้าลำดับจริงไม่ต่างจากลำดับที่สลับแล้ว แปลว่าไม่มีจุดเปลี่ยน",
    "ใช้ตรวจคุณภาพข้อมูล ถ้าเจอจุดเปลี่ยนใกล้วันที่เปลี่ยนแหล่งข้อมูลหรือเปลี่ยนรูปแบบรางวัล มักแปลว่าข้อมูลช่วงนั้นมีปัญหา ไม่ได้แปลว่ามีรูปแบบให้ใช้เดาเลข"], see: ["trust-level", "p-value"] },
  { id: "expected-return", group: "test", term: "ได้คืนเฉลี่ยต่อใบ", aka: "ค่าคาดหวังของสลาก 1 ใบ", body: [
    "นำเงินรางวัลทั้งหมดของสลาก 1 ล้านใบมาเฉลี่ยต่อใบ ได้ราว 48 บาท จากราคา 80 บาท หรือราว 60% ของราคา",
    "แปลว่าในระยะยาว ซื้อ 100 บาทจะได้คืนเฉลี่ยราว 60 บาท ไม่มีวิธีเลือกเลขใดเปลี่ยนตัวเลขนี้ได้"], see: [] },
  { id: "hybrid-score", group: "model", term: "คะแนนรวม", aka: "hybrid score", body: [
    "คะแนน 0–100 ที่เว็บใช้จัดอันดับเลข ผสมจาก \"ดูทุกรางวัล\" กับ \"ดูรางวัลนี้\" ตามชุดน้ำหนักที่เลือกไว้",
    "100 = อันดับสูงสุดในบรรดาเลขทั้งหมดตามวิธีนี้ เป็นคะแนนที่เทียบกันเอง ไม่ใช่เปอร์เซ็นต์โอกาสถูกรางวัล คะแนน 100 ไม่ได้แปลว่ามีโอกาส 100%",
    "เมื่อทดสอบย้อนหลังแล้ว เลขคะแนนสูงไม่ได้ถูกบ่อยกว่าการสุ่มเลือก"], see: ["global-score", "prize-score", "backtest"] },
  { id: "global-score", group: "model", term: "ดูทุกรางวัล", aka: "global score", body: [
    "คะแนนจากสถิติของเลขรางวัลที่ 1–5 ทั้งหมดรวมกัน เช่น ตัวเลขแต่ละหลัก คู่ติดกัน ผลรวม และรูปแบบเลข",
    "ใช้ข้อมูลมาก ตัวเลขจึงนิ่งกว่า แต่ไม่แยกว่าเป็นรางวัลไหน"], see: ["hybrid-score", "prize-score"] },
  { id: "prize-score", group: "model", term: "ดูรางวัลนี้", aka: "prize score", body: [
    "คะแนนจากสถิติเฉพาะรางวัลนั้น เช่น รางวัลที่ 1 ใช้เฉพาะเลขรางวัลที่ 1 ในอดีต (งวดละ 1 เลข)",
    "ข้อมูลน้อยกว่า \"ดูทุกรางวัล\" มาก ตัวเลขจึงแกว่งกว่า"], see: ["hybrid-score", "small-sample"] },
  { id: "weight-sets", group: "model", term: "ชุดน้ำหนัก", aka: "สัดส่วน ทุกรางวัล : รางวัลนี้", body: [
    "สัดส่วนผสมระหว่าง \"ดูทุกรางวัล\" กับ \"ดูรางวัลนี้\" ที่ลองไว้หลายแบบ ระบบเลือกชุดที่ทำได้ดีที่สุดในช่วงฝึก แล้วไปวัดผลในช่วงทดสอบจริง",
    "การเลือกชุดที่ดีที่สุดจากหลายชุดมักดูดีเกินจริงในช่วงฝึก จึงต้องวัดซ้ำในช่วงที่ไม่ได้ใช้เลือก"], see: ["validation-holdout"] },
  { id: "backtest", group: "model", term: "ทดสอบย้อนหลัง", aka: "backtest · walk-forward", body: [
    "ลองว่าถ้าใช้วิธีนี้ในอดีตจะเป็นอย่างไร: ก่อนแต่ละงวด ใช้เฉพาะข้อมูลก่อนหน้างวดนั้นจัดอันดับเลข แล้วเทียบกับผลจริง จากนั้นเลื่อนไปงวดถัดไปแล้วทำซ้ำ",
    "ไม่แอบดูข้อมูลอนาคต จึงเป็นการวัดที่ยุติธรรม และเทียบกับการสุ่มเลือกจำนวนเท่ากันเสมอ",
    "ผลบนเว็บนี้: ทุกวิธีทำได้พอ ๆ กับการสุ่ม ไม่มีวิธีใดดีกว่าอย่างชัดเจน"], see: ["validation-holdout", "mean-rank", "exact-hit"] },
  { id: "validation-holdout", group: "model", term: "ช่วงฝึก / ช่วงทดสอบจริง", aka: "validation · holdout", body: [
    "แบ่งงวดในอดีตเป็นสองช่วง: \"ช่วงฝึก\" ใช้เลือกชุดน้ำหนักและค่าต่าง ๆ ส่วน \"ช่วงทดสอบจริง\" เก็บไว้ไม่ให้ระบบเห็นตอนเลือก ใช้วัดผลอย่างเดียว",
    "ถ้าดีเฉพาะช่วงฝึกแต่ไม่ดีในช่วงทดสอบจริง แปลว่าบังเอิญเข้ากับข้อมูลเก่า ไม่ได้ดีจริง ให้เชื่อตัวเลขช่วงทดสอบจริงมากกว่า"], see: ["backtest", "weight-sets"] },
  { id: "mean-rank", group: "model", term: "อันดับเฉลี่ย", aka: "percentile", body: [
    "เลขที่ออกจริงอยู่ตรงไหนในอันดับของวิธีนี้ คิดเป็น % จากบนสุด: 0% = อันดับ 1, 100% = อันดับสุดท้าย",
    "ถ้าวิธีนี้ไม่ช่วยอะไร เลขที่ออกจริงจะกระจายทั่วอันดับ เฉลี่ยราว 50% ถ้าช่วยได้จริงจะต่ำกว่า 50% อย่างสม่ำเสมอ ผลบนเว็บนี้อยู่ราว 50% คือเหมือนการสุ่ม"], see: ["backtest", "ci"] },
  { id: "log-loss", group: "model", term: "คะแนนความผิดพลาดของความน่าจะเป็น", aka: "log-loss", body: [
    "ใช้วัดวิธีที่ให้ \"ความน่าจะเป็น\" กับทุกเลข แทนการเลือกเลขเป็นกลุ่ม ทุกงวดดูว่าวิธีนั้นให้ความน่าจะเป็นกับเลขที่ออกจริงเท่าไร ถ้าให้น้อยจะโดนหักคะแนนมาก ยิ่งค่าเฉลี่ยต่ำยิ่งดี",
    "เว็บแสดงเป็นผลต่างจากการให้ทุกเลขเท่ากัน: ติดลบ = ดีกว่า, บวก = แย่กว่า ถ้าช่วงคลาดเคลื่อนคร่อม 0 แปลว่าแยกไม่ออกจากการให้ทุกเลขเท่ากัน",
    "การให้ทุกเลขเท่ากันเป็นค่าที่ดีที่สุดเมื่อการออกรางวัลสุ่มจริง วิธีอื่นจะดีกว่าได้ก็ต่อเมื่อมีรูปแบบจริงให้เรียนรู้"], see: ["backtest", "ci", "validation-holdout"] },
  { id: "exact-hit", group: "model", term: "ถูกตรง", aka: "exact match", body: [
    "เลขที่ออกจริงอยู่ในกลุ่มเลขอันดับต้นที่ระบบเลือกไว้ของรางวัลเดียวกัน และตรงครบทุกหลัก ตรงบางหลักไม่นับ",
    "ให้ดูคู่กับ \"ถ้าสุ่มควรถูก\" เสมอ ถ้าจำนวนที่ถูกใกล้เคียงหรืออยู่ในช่วงปกติของการสุ่ม แปลว่าไม่ได้ดีกว่าการสุ่มเลือก"], see: ["expected", "backtest"] },
  { id: "snapshot", group: "record", term: "บันทึกการทำนาย", aka: "snapshot", body: [
    "เลขอันดับต้นของงวดถัดไปที่ระบบคำนวณแล้วล็อกเก็บไว้ก่อนออกรางวัล พร้อมเวลาที่สร้าง ข้อมูลที่ใช้ และการตั้งค่า",
    "บันทึกแล้วห้ามแก้ หลังออกรางวัลจึงนำมาเทียบผลจริง งวดที่ไม่มีบันทึกก่อนออกรางวัลจะขึ้นว่า \"ตรวจผลไม่ได้\" และไม่สร้างย้อนหลัง เพราะทำหลังรู้ผลแล้วไม่ยุติธรรม"], see: ["sha256"] },
  { id: "sha256", group: "record", term: "รหัสตรวจสอบ (SHA-256)", aka: "sha256", body: [
    "ลายนิ้วมือของไฟล์ ยาว 64 ตัวอักษร คำนวณจากเนื้อหาทั้งไฟล์ ถ้าแก้แม้ตัวเดียว รหัสจะเปลี่ยนไปทั้งหมด",
    "ใช้ยืนยันว่าบันทึกการทำนายหรือไฟล์ CSV ไม่ถูกแก้หลังสร้าง ถ้ารหัสไม่ตรง ระบบจะไม่นับผล",
    "รหัสนี้ยืนยันแค่ว่าไม่มีการแก้ ไม่ได้บอกว่าเลขในบันทึกดีหรือไม่"], see: ["snapshot"] },
  { id: "trust-level", group: "record", term: "ระดับความน่าเชื่อถือของแหล่งข้อมูล", aka: "ทางการ · ตรวจทาน 2 แหล่ง · แหล่งเดียว", body: [
    "\"ข้อมูลทางการ GLO\" = ดึงจาก API ของสำนักงานสลากกินแบ่งรัฐบาล · \"ตรวจทาน 2 แหล่ง\" = สองแหล่งตรงกัน · \"แหล่งเดียว\" = ยังไม่มีแหล่งที่สองให้เทียบ",
    "ข้อมูลแหล่งเดียวอาจมีพิมพ์ผิดปน ซึ่งทำให้สถิติดูเบี้ยวได้ ทั้งที่ผลจริงไม่ได้เบี้ยว"], see: [] },
];
const GLOSSARY_BY_ID = Object.fromEntries(GLOSSARY.map((e) => [e.id, e]));

// ปุ่ม "?" เล็ก ๆ ข้างคำศัพท์: กดแล้วเปิดคำอธิบายเป็นหน้าต่างเล็กบนหน้าเดิม
// (ยังเป็นลิงก์ไป glossary.html#<id> สำหรับเปิดในแท็บใหม่ หรือเมื่อเบราว์เซอร์ไม่รองรับหน้าต่างนี้)
function gl(id) {
  const e = GLOSSARY_BY_ID[id];
  if (!e) return null;
  return h("a", { class: "gl", href: `glossary.html#${id}`, "data-gl": id, "aria-haspopup": "dialog",
    "aria-label": `${e.term} คืออะไร`, title: `${e.term} คืออะไร` }, "?");
}

let glDialog = null;
let glOpener = null;   // ปุ่ม "?" ที่เปิดหน้าต่าง ปิดแล้วย้ายโฟกัสกลับไปที่ปุ่มนี้
function glPopup(id, opener) {
  const e = GLOSSARY_BY_ID[id];
  if (!e) return;
  if (!glDialog) {
    glDialog = h("dialog", { class: "gl-pop", "aria-labelledby": "gl-pop-title" });
    // กดพื้นมืดรอบหน้าต่าง = ปิด (คลิกในเนื้อหาจะโดน .gl-pop-inner ไม่ใช่ตัว dialog)
    glDialog.addEventListener("click", (ev) => { if (ev.target === glDialog) glDialog.close(); });
    glDialog.addEventListener("close", () => {
      const back = glOpener;
      glOpener = null;
      if (back && back.isConnected) back.focus();
    });
    document.body.append(glDialog);
  }
  const close = h("button", { type: "button", class: "gl-pop-close", "aria-label": "ปิด" }, "×");
  close.addEventListener("click", () => glDialog.close());
  const related = e.see.filter((x) => GLOSSARY_BY_ID[x]).map((x) => {
    const b = h("button", { type: "button", class: "chip gl-pop-see" }, GLOSSARY_BY_ID[x].term);
    b.addEventListener("click", () => glPopup(x));
    return b;
  });
  glDialog.replaceChildren(h("div", { class: "gl-pop-inner" },
    h("div", { class: "gl-pop-head" }, h("h2", { id: "gl-pop-title" }, e.term), close),
    e.aka ? h("p", { class: "note gl-aka" }, e.aka) : null,
    h("div", { class: "gl-pop-body" }, e.body.map((t) => h("p", null, t))),
    related.length ? h("div", { class: "gl-pop-related" }, h("span", { class: "small muted" }, "คำที่เกี่ยวข้อง:"), related) : null,
    h("a", { class: "gl-pop-more", href: `glossary.html#${id}` }, "เปิดหน้าคำอธิบายศัพท์ทั้งหมด →")));
  if (opener) glOpener = opener;
  if (!glDialog.open) glDialog.showModal();
  close.focus();
}
// ใช้ตัวดักคลิกตัวเดียวทั้งหน้า ปุ่ม "?" ที่สร้างทีหลัง (เปลี่ยนแท็บ/ช่วงเวลา) จึงใช้ได้ทันที
document.addEventListener("click", (ev) => {
  const a = ev.target instanceof Element ? ev.target.closest("a.gl[data-gl]") : null;
  if (!a || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
  if (typeof HTMLDialogElement !== "function") return;   // เบราว์เซอร์เก่า: ไปหน้าคำอธิบายศัพท์ตามเดิม
  ev.preventDefault();
  glPopup(a.dataset.gl, a);
});
// คำศัพท์ + ปุ่ม "?" (ใช้ในหัวตาราง ป้ายสถิติ ฯลฯ)
function term(text, id) {
  return h("span", { class: "term" }, text, gl(id));
}
function drawDateLine(d) {
  return h("div", { class: "draw-date" },
    `งวดวันที่ ${d.draw_date_th}`,
    d.actual_draw_date_th ? ` (ออกรางวัลจริง ${d.actual_draw_date_th})` : null);
}

// ---------- ticket check ----------
// หลักการตรวจ: เลข 6 หลักเทียบทุกรางวัลทุกงวด; เลข 2–3 หลักค้นในเลขหน้า/ท้าย
function matchTicket(d, n) {
  const p = d.prizes;
  const hits = [];
  for (const k of ["first", "near_first", "second", "third", "fourth", "fifth"]) {
    if (p[k].includes(n)) hits.push(k);
  }
  if (p.front3.includes(n.slice(0, 3))) hits.push("front3");
  if (p.back3.includes(n.slice(3))) hits.push("back3");
  if (p.last2[0] === n.slice(4)) hits.push("last2");
  return hits;
}

function ticketCard(opts = {}) {
  const input = h("input", {
    id: "ticket", type: "text", inputmode: "numeric", autocomplete: "off", maxlength: "6",
    class: "ticket-input", placeholder: "เช่น 012345", "aria-describedby": "ticket-help ticket-err",
    spellcheck: "false",
  });
  const err = h("p", { id: "ticket-err", class: "error-text", role: "alert" });
  const btn = h("button", { class: "btn", type: "submit" }, "ตรวจเลข");
  const out = h("div", { class: "stack" });
  const form = h("form", { class: "stack", novalidate: true, autocomplete: "off" },
    h("div", { class: "field" },
      h("label", { for: "ticket" }, "ตรวจเลขสลาก"),
      h("p", { id: "ticket-help", class: "muted small", style: null },
        "ใส่เลข 6 หลักเพื่อตรวจทุกรางวัลทุกงวด หรือ 2–3 หลักเพื่อดูว่าเคยออกเป็นเลขหน้า/ท้ายเมื่อไร"),
      input),
    err, btn);
  input.addEventListener("input", () => {
    const clean = input.value.replace(/[^0-9]/g, "").slice(0, 6);
    if (clean !== input.value) input.value = clean;
    err.textContent = "";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const n = input.value;
    if (!/^(\d{2}|\d{3}|\d{6})$/.test(n)) {
      err.textContent = "กรุณาใส่ตัวเลข 2, 3 หรือ 6 หลัก";
      input.focus();
      return;
    }
    btn.disabled = true;
    try {
      if (n.length === 6) await checkSix(n, out);
      else await checkShort(n, out);
    } catch (ex) {
      out.replaceChildren(h("p", { class: "error-text" }, String(ex.message || ex)));
    } finally {
      btn.disabled = false;
    }
  });
  if (opts.initial && /^(\d{2}|\d{3}|\d{6})$/.test(opts.initial)) {
    input.value = opts.initial;
    queueMicrotask(() => form.requestSubmit());
  }
  return h("section", { class: "card", "aria-labelledby": "ticket" }, form, out);
}

async function checkSix(n, out) {
  const bar = h("div");
  out.replaceChildren(h("p", { class: "muted small" }, "กำลังตรวจทุกงวด…"), h("div", { class: "progress" }, bar));
  const draws = await allDraws((f) => { bar.style.width = `${Math.round(f * 100)}%`; });
  draws.sort((a, b) => (a.draw_date < b.draw_date ? 1 : -1));
  const latest = draws[0];
  const latestHits = matchTicket(latest, n);
  const all = [];
  for (const d of draws) {
    const hits = matchTicket(d, n);
    if (hits.length) all.push([d, hits]);
  }
  const banner = latestHits.length
    ? h("div", { class: "result-banner win" }, `งวด ${latest.draw_date_th}: ถูก ${latestHits.map((k) => PRIZE_LABEL[k]).join(", ")}`)
    : h("div", { class: "result-banner lose" }, `งวด ${latest.draw_date_th}: ไม่ถูกรางวัล`);
  const list = all.length
    ? h("ul", { class: "hits" }, all.map(([d, hits]) => h("li", null,
      h("a", { href: `results.html?d=${d.draw_date}` }, thShort(d.draw_date)),
      hits.map((k) => h("span", { class: `chip${k === "first" ? " ok" : ""}` }, PRIZE_LABEL[k])),
      d.trust_level !== "official" ? trustChip(d.trust_level) : null)))
    : h("p", { class: "empty" }, "ไม่เคยถูกรางวัลในงวดที่มีข้อมูล");
  out.replaceChildren(banner,
    h("h3", null, `เลข ${n} ในทุกงวด `, h("span", { class: "muted small" }, `(${fmt.format(all.length)} งวดจาก ${fmt.format(draws.length)})`)),
    list,
    h("p", { class: "muted small" }, "ตรวจรางวัลที่ 1–5 และข้างเคียงได้เฉพาะงวดที่มีข้อมูล (126 งวดในปี 2538–2543 มีเพียงรางวัลที่ 1 และเลขท้าย) · เลขหน้า 3 ตัวเริ่มมีตั้งแต่ 1 ก.ย. 2558"));
}

async function checkShort(n, out) {
  out.replaceChildren(h("p", { class: "muted small" }, "กำลังค้นหา…"));
  const rows = (await index()).reverse();
  const hits = [];
  for (const r of rows) {
    const where = [];
    if (n.length === 2 && r.last2 === n) where.push("last2");
    if (n.length === 3) {
      if (r.front3.includes(n)) where.push("front3");
      if (r.back3.includes(n)) where.push("back3");
    }
    if (where.length) hits.push([r, where]);
  }
  const scope = n.length === 2 ? "เลขท้าย 2 ตัว" : "เลขหน้า/ท้าย 3 ตัว";
  out.replaceChildren(
    h("h3", null, `เลข ${n} เคยออกเป็น${scope} `, h("span", { class: "muted small" }, `${fmt.format(hits.length)} งวด`)),
    hits.length
      ? h("ul", { class: "hits" }, hits.map(([r, where]) => h("li", null,
        h("a", { href: `results.html?d=${r.draw_date}` }, thShort(r.draw_date)),
        where.map((k) => h("span", { class: "chip" }, PRIZE_LABEL[k])))))
      : h("p", { class: "empty" }, "ไม่เคยออก"),
    h("p", { class: "muted small" }, "จำนวนครั้งที่เคยออกไม่ได้บอกโอกาสของงวดหน้า ทุกเลขมีโอกาสเท่ากันทุกงวด"));
}

// ---------- page: home ----------
// ไอคอนเส้นเรียบ (SVG ภายใน ไม่มีไฟล์ภายนอก)
const ICONS = {
  calendar: ["M4 6h16v14H4z", "M8 3v4M16 3v4M4 10h16"],
  target: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", "M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10", "M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2"],
  grid: ["M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"],
  shield: ["M12 3l8 3v6c0 4.5-3.4 8.2-8 9c-4.6-.8-8-4.5-8-9V6z", "M8.5 12l2.5 2.5l4.5-5"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  chart: ["M4 20V10M10 20V4M16 20v-7M22 20H2"],
  trend: ["M3 17l6-6l4 4l8-8", "M15 7h6v6"],
  bell: ["M6 16V11a6 6 0 1 1 12 0v5l2 2H4z", "M10 20a2 2 0 0 0 4 0"],
};
function icon(name, cls) {
  return s("svg", { viewBox: "0 0 24 24", class: `ico ${cls || ""}`, "aria-hidden": "true" }, ICONS[name].map((d) => s("path", { d })));
}

// ลูกบอลตกแต่งในแถบหัวเรื่อง (สีกลาง ๆ ไม่สื่อความหมาย)
function heroBalls() {
  const ball = (cx, cy, r, n) => s("g", null, s("circle", { cx, cy, r, class: "ball" }), s("circle", { cx, cy, r: r * 0.58, class: "ball-in" }),
    s("text", { x: cx, y: cy + r * 0.24, "text-anchor": "middle", "font-size": r * 0.7 }, n));
  return s("svg", { viewBox: "0 0 220 170", class: "hero-balls", "aria-hidden": "true" }, ball(118, 92, 62, "6"), ball(40, 120, 30, "9"), ball(186, 46, 26, "3"), ball(196, 132, 18, "0"));
}

function kpi(iconName, k, v, unit, sub) {
  return h("div", { class: "kpi" }, h("div", { class: `kpi-ico i-${iconName}` }, icon(iconName)),
    h("div", null, h("div", { class: "k" }, k), h("div", { class: "v" }, v, unit ? h("span", { class: "unit" }, ` ${unit}`) : null), h("div", { class: "sub" }, sub)));
}

// วงแหวนคะแนน 0–100
function ring(value, label) {
  const r = 52, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return h("div", { class: "ring" },
    s("svg", { viewBox: "0 0 128 128", "aria-hidden": "true" },
      s("circle", { cx: 64, cy: 64, r, class: "ring-bg" }),
      s("circle", { cx: 64, cy: 64, r, class: "ring-fg", "stroke-dasharray": `${(c * v) / 100} ${c}`, transform: "rotate(-90 64 64)" })),
    h("div", { class: "ring-text" }, h("div", { class: "rv" }, fmt1.format(v)), h("div", { class: "rs" }, "/ 100")),
    h("div", { class: "ring-label" }, label));
}

const PRIZE_BADGE = { first: "1", second: "2", third: "3", fourth: "4", fifth: "5", last2: "2ต", back3: "3ต", front3: "3ห" };

function predCard(k, label, count, rows, extraCls) {
  return h("div", { class: `pred-card p-${k} ${extraCls || ""}` },
    h("div", { class: "pred-head" }, h("span", { class: "badge", "aria-hidden": "true" }, PRIZE_BADGE[k]),
      h("h3", null, label, h("span", { class: "muted" }, ` (${count} เลข)`))),
    h("div", { class: "num-list pred-nums" }, rows.slice(0, count).map((r) => h("span", null, r.number))),
    h("a", { class: "more", href: k === "first" ? "analysis.html" : `analysis.html?p=${k}` }, "ดูเหตุผล →"));
}

function scorePanel(sn) {
  const state = { k: "first" };
  const seg = h("div", { class: "seg", role: "group", "aria-label": "เลือกรางวัล" });
  const body = h("div", { class: "score-body" });
  const avg = (rows, f) => rows.reduce((a, r) => a + r[f], 0) / rows.length;
  function draw() {
    seg.replaceChildren(...SIX.map((k) => h("button", { type: "button", "aria-pressed": String(state.k === k), onclick: () => { state.k = k; draw(); } }, SIX_LABEL[k].replace("รางวัลที่ ", "ที่ "))));
    const K = sn.candidate_counts[state.k];
    const rows = sn.predictions[state.k].slice(0, K);
    const w = sn.hybrid_weights[state.k];
    body.replaceChildren(
      ring(avg(rows, "hybrid_score"), `คะแนนรวมเฉลี่ยของ ${K} เลขที่เลือก`),
      h("ul", { class: "score-list" },
        h("li", null, icon("check", "ok"), h("span", null, "ดูทุกรางวัลรวมกัน", gl("global-score")), h("b", null, fmt1.format(avg(rows, "global_score")))),
        h("li", null, icon("check", "ok"), h("span", null, `ดูเฉพาะ${SIX_LABEL[state.k]}`, gl("prize-score")), h("b", null, fmt1.format(avg(rows, "prize_score")))),
        h("li", null, icon("check", "ok"), h("span", null, "น้ำหนัก (ทุกรางวัล : รางวัลนี้)", gl("weight-sets")), h("b", null, `${Math.round(w.global * 100)} : ${Math.round(w.prize_specific * 100)}`))));
  }
  draw();
  return h("section", { class: "card score-panel stack" },
    h("h2", null, icon("chart"), "สรุปคะแนน", gl("hybrid-score")),
    seg, body,
    h("p", { class: "callout small" }, "คะแนนเทียบกับเลขทั้ง 1 ล้านเลข (100 = สูงสุดตามวิธีนี้) ไม่ใช่โอกาสถูกรางวัล · ลองย้อนหลังแล้วไม่ดีกว่าการสุ่ม"));
}

function backtestMini(bt) {
  if (!bt) return null;
  const tl = bt.timeline;
  const n = tl.dates.length;
  const avgPct = [...Array(n).keys()].map((i) => {
    const v = SIX.map((k) => tl[k].mean_pct[i]).filter((x) => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  });
  const win = 24;
  const roll = avgPct.map((_, i) => {
    if (i + 1 < win) return null;
    const sl = avgPct.slice(i + 1 - win, i + 1).filter((v) => v !== null);
    return sl.reduce((a, b) => a + b, 0) / sl.length;
  });
  const per = SIX.reduce((a, k) => a + Math.max(1, tl[k].numbers_per_draw), 0);
  const se = Math.sqrt(1 / 12 / (win * per));
  const ov = bt.overall.tuned.all;
  return h("section", { class: "card stack" },
    h("div", { class: "row" }, h("h2", null, "ทดสอบย้อนหลังเทียบการสุ่ม", gl("backtest")), h("span", { class: "spacer" }), h("a", { class: "small", href: "analysis.html?tab=backtest" }, "รายละเอียด →")),
    lineChart({ values: roll, labels: tl.dates.map((d) => String(Number(d.slice(0, 4)) + 543)), ref: 0.5, band: [0.5 - 1.96 * se, 0.5 + 1.96 * se], yMin: 0.4, yMax: 0.6, ariaLabel: "อันดับเฉลี่ยของเลขที่ออกจริงเทียบกับการสุ่ม", yFmt: (v) => `${Math.round(v * 100)}%`, W: 400 }),
    h("p", { class: "note" }, `เส้นทึบ = เลขที่ออกจริงอยู่อันดับเฉลี่ยกี่ % จากบนสุด (เฉลี่ยทีละ ${win} งวด) · เส้นประ = 50% ถ้าสุ่มเลือก · ${fmt.format(bt.evaluation.draws)} งวดที่ทดสอบ ถูกตรง 6 หลัก ${ov.hits} เลข (สุ่มคาดไว้ ${fmt2.format(ov.expected)}) → ไม่ดีกว่าการสุ่ม`));
}

function digitMini(six) {
  if (!six) return null;
  const rec = six.data.recent.all;
  if (!rec.numbers) return null;
  const digits = [...Array(10).keys()].map(String);
  const tot = rec.numbers * 6;
  return h("section", { class: "card stack" },
    h("div", { class: "row" }, h("h2", null, "ตัวเลข 0–9 ช่วงหลัง ๆ"), h("span", { class: "spacer" }), h("a", { class: "small", href: "stats.html?m=six" }, "ดูเพิ่ม →")),
    barChart({ labels: digits, values: rec.digit.counts.map((c) => (c / tot) * 100), expected: digits.map(() => 10), ariaLabel: "สัดส่วนตัวเลข 0 ถึง 9 ใน 24 งวดล่าสุด (%)", W: 360 }),
    h("p", { class: "note" }, `สัดส่วน (%) ของตัวเลขแต่ละตัวในรางวัลที่ 1–5 ${six.data.recent.label} (${fmt.format(rec.numbers)} เลข) · ถ้าสุ่มควรเป็น 10% ทุกตัว ความต่างช่วงสั้นเป็นเรื่องปกติ`, gl("small-sample")));
}

function updatesMini(m, pidx, bt, bts) {
  const items = [];
  items.push([m.latest_draw, `เพิ่มผลงวด ${thShort(m.latest_draw)} จากกองสลากฯ`]);
  if (pidx && pidx.snapshots.length) {
    const sn = pidx.snapshots[0];
    items.push([sn.created_at.slice(0, 10), `บันทึกเลขสำหรับงวด ${thShort(sn.target_draw_date)} (ล็อกแล้ว ไม่แก้ไข)`]);
  }
  if (bt && bt.backtest_generated_at) items.push([bt.backtest_generated_at.slice(0, 10), `ทดสอบย้อนหลังเลข 6 หลัก ${fmt.format(bt.evaluation.draws)} งวด`]);
  if (bts && bts.backtest_generated_at) items.push([bts.backtest_generated_at.slice(0, 10), "ทดสอบย้อนหลังเลขท้าย 2 ตัว / ท้าย 3 ตัว / หน้า 3 ตัว"]);
  items.sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return h("section", { class: "card stack" },
    h("h2", null, icon("bell"), "อัปเดตล่าสุด"),
    h("ul", { class: "updates" }, items.filter(([d]) => RE_DATE.test(d)).map(([d, t]) => h("li", null, h("span", { class: "d" }, thShort(d)), h("span", null, t)))),
    h("p", { class: "note" }, "ระบบดึงผลจากกองสลากฯ อัตโนมัติวันละ 3 รอบ ", h("a", { href: "data.html" }, "ดูข้อมูลและแหล่งที่มา →")));
}

async function pageHome() {
  // ไฟล์สรุปเล็ก ๆ ไฟล์เดียว (สร้างตอนบิลด์จาก latest/backtest/sixdigit/ไฟล์ทำนาย) → โหลดรอบเดียว ไม่ต้องรอ manifest
  manifest().catch(() => {});
  const home = await fetch("data/home.json", { cache: "no-cache", credentials: "omit" }).then(checkResponse);
  if (!home || !home.draw || !RE_DATE.test(home.latest_draw)) throw new Error("ข้อมูลหน้าแรกไม่ถูกต้อง");
  const m = home, pidx = home.pred_index, bt = home.backtest, bts = home.backtest_small, six = home.sixdigit;
  const d = home.draw;
  const p = d.prizes;
  const latestCard = h("section", { class: "card", "aria-labelledby": "latest-h" },
    h("div", { class: "row" }, h("h2", { id: "latest-h" }, "ผลสลากงวดล่าสุด"), h("span", { class: "spacer" }), trustChip(d.trust_level)),
    drawDateLine(d),
    h("div", { class: "first-label" }, "รางวัลที่ 1"),
    h("div", { class: "first-prize" }, p.first[0]),
    h("div", { class: "prize-trio" },
      h("div", { class: "prize-box" }, h("div", { class: "label" }, "เลขหน้า 3 ตัว"), h("div", { class: "value" }, nums(p.front3))),
      h("div", { class: "prize-box" }, h("div", { class: "label" }, "เลขท้าย 3 ตัว"), h("div", { class: "value" }, nums(p.back3))),
      h("div", { class: "prize-box" }, h("div", { class: "label" }, "เลขท้าย 2 ตัว"), h("div", { class: "value big" }, nums(p.last2)))),
    h("p", { class: "muted small section" }, `ข้างเคียงรางวัลที่ 1: ${nums(p.near_first)}`),
    h("a", { href: `results.html?d=${d.draw_date}` }, "ดูผลรางวัลทั้งหมดของงวดนี้ →"));
  const q = new URLSearchParams(location.search).get("n");

  const hero = h("section", { class: "hero" },
    h("div", { class: "hero-main" },
      h("h1", null, "วิเคราะห์", h("span", { class: "nowrap" }, "สลากกินแบ่งรัฐบาล"), h("br"), h("span", { class: "hl" }, "ด้วยสถิติจริง")),
      h("p", null, "โปร่งใส ตรวจสอบได้ทุกขั้นตอน และบอกตรง ๆ ว่าทำได้แค่ไหน"),
      h("span", { class: "chip" }, `ข้อมูลถึงงวด ${thShort(m.latest_draw)}`)),
    heroBalls(),
    h("div", { class: "hero-side" },
      h("h2", null, "แนวทางของเว็บนี้"),
      h("ul", { class: "checks" },
        h("li", null, icon("check", "ok"), "จัดอันดับเลข 6 หลักครบ 1,000,000 เลข"),
        h("li", null, icon("check", "ok"), `ใช้ข้อมูลย้อนหลัง ${fmt.format(m.draw_count)} งวด`),
        h("li", null, icon("check", "ok"), "ผสมคะแนนจากทุกรางวัลกับเฉพาะรางวัล"),
        h("li", null, icon("check", "ok"), "ทดสอบย้อนหลังเทียบกับการสุ่มทุกครั้ง", gl("backtest")))));

  const kpis = h("div", { class: "kpi-row" },
    kpi("calendar", "ข้อมูลย้อนหลัง", fmt.format(m.draw_count), "งวด", `ตั้งแต่ ${thShort(m.first_draw)}`),
    kpi("target", "จัดอันดับ", "8", "ประเภท", "รางวัลที่ 1–5, ท้าย 2, ท้าย 3, หน้า 3"),
    kpi("grid", "ให้คะแนนทุกเลข", "1,000,000", "เลข", "000000–999999"),
    kpi("shield", "ความโปร่งใส", "ตรวจสอบได้", "", "ล็อกก่อนออกรางวัล + sha256"));

  let predSection = null;
  {
    const pd = home.prediction;
    if (pd && pd.snapshot) {
      const sn = pd.snapshot;
      const sm = pd.small;
      predSection = h("div", { class: "dash section" },
        h("section", { class: "card pred-wrap" },
          h("div", { class: "pred-bar" },
            h("h2", null, `เลขที่ระบบจัดอันดับไว้ งวดวันที่ ${thShort(sn.target_draw_date)}`),
            statusChip(pd.evaluation ? pd.evaluation.status : "pending")),
          h("div", { class: "pred-grid" },
            ["first", "second", "third", "fourth"].map((k) => predCard(k, SIX_LABEL[k], sn.candidate_counts[k], sn.predictions[k])),
            predCard("fifth", SIX_LABEL.fifth, sn.candidate_counts.fifth, sn.predictions.fifth, "wide")),
          sm ? h("div", { class: "pred-grid three" }, SMALL.map((k) => predCard(k, PRIZE_LABEL[k], sm.candidate_counts[k], sm.predictions[k].rows))) : null,
          h("p", { class: "note" }, `จัดอันดับจากสถิติถึงงวด ${thShort(sn.training_data_through)} · เลขชุดนี้ล็อกไว้แล้ว รีเฟรชก็ไม่เปลี่ยน`, gl("snapshot"), " · คะแนนไม่ใช่โอกาสถูกรางวัล", gl("hybrid-score"))),
        scorePanel(sn));
    }
  }
  render(
    hero,
    kpis,
    h("div", { class: "grid grid-2 section" }, latestCard, ticketCard({ initial: q })),
    predSection,
    h("div", { class: "grid grid-3 section home-minis" }, digitMini(six), backtestMini(bt), updatesMini(m, pidx, bt, bts)));
}

// ---------- page: results ----------
async function pageResults() {
  const params = new URLSearchParams(location.search);
  const d = params.get("d");
  if (d && RE_DATE.test(d)) return drawDetail(d);
  const m = await manifest();
  let year = params.get("y");
  if (!m.years.includes(year)) year = m.years[m.years.length - 1];
  const show = PRIZE_ORDER.includes(params.get("show")) ? params.get("show") : "first";
  const trust = Object.hasOwn(TRUST, params.get("trust") || "") ? params.get("trust") : "";
  const [{ draws }, idx] = await Promise.all([getData(`draws/${year}.json`), index()]);
  const rows = draws.filter((r) => !trust || r.trust_level === trust).reverse();
  function go(over) {
    const p = new URLSearchParams({ y: year, show, trust, ...over });
    for (const [k, v] of [...p]) if (!v || (k === "show" && v === "first")) p.delete(k);
    location.search = `?${p}`;
  }
  const select = h("select", { id: "year", "aria-label": "เลือกปี (พ.ศ.)" },
    [...m.years].reverse().map((y) => h("option", { value: y, selected: y === year }, `พ.ศ. ${Number(y) + 543}`)));
  select.addEventListener("change", () => go({ y: select.value }));
  const showSel = h("select", { id: "show", "aria-label": "รางวัลที่แสดง" },
    PRIZE_ORDER.map((k) => h("option", { value: k, selected: k === show }, PRIZE_LABEL[k])));
  showSel.addEventListener("change", () => go({ show: showSel.value }));
  const trustSel = h("select", { id: "trust", "aria-label": "สถานะการตรวจสอบ" },
    h("option", { value: "" }, "ทุกสถานะ"),
    Object.entries(TRUST).map(([k, t]) => h("option", { value: k, selected: k === trust }, t.label)));
  trustSel.addEventListener("change", () => go({ trust: trustSel.value }));
  const dateIn = h("input", { id: "jump", type: "date", min: m.first_draw, max: m.latest_draw, "aria-label": "ไปที่งวดวันที่" });
  const jumpErr = h("p", { class: "error-text", role: "alert" });
  dateIn.addEventListener("change", () => {
    const v = dateIn.value;
    if (!RE_DATE.test(v)) return;
    const hit = idx.find((r) => r.draw_date >= v);
    if (hit) location.href = `results.html?d=${hit.draw_date}`;
    else jumpErr.textContent = "ไม่มีงวดตั้งแต่วันที่นี้";
  });
  const sub = (r) => {
    if (show === "first") {
      return [r.prizes.front3.length ? `หน้า 3: ${r.prizes.front3.join(" ")} · ` : "",
        `ท้าย 3: ${r.prizes.back3.join(" ")} · ท้าย 2: ${r.prizes.last2.join(" ")}`];
    }
    const v = r.prizes[show];
    return `${PRIZE_LABEL[show]}: ${v.length ? v.join(" ") : "ไม่มีข้อมูล/ยังไม่มีรางวัลนี้"}`;
  };
  render(
    pageHead("ผลย้อนหลัง", `ทั้งหมด ${fmt.format(m.draw_count)} งวด ตั้งแต่ ${thShort(m.first_draw)}`),
    h("section", { class: "card stack" },
      h("div", { class: "row" },
        h("label", { for: "year", class: "small muted" }, "ปี"), select,
        h("label", { for: "show", class: "small muted" }, "แสดง"), showSel,
        h("label", { for: "trust", class: "small muted" }, "สถานะ"), trustSel),
      h("div", { class: "row" }, h("label", { for: "jump", class: "small muted" }, "ไปที่งวดวันที่"), dateIn, jumpErr,
        h("span", { class: "spacer" }), h("span", { class: "muted small" }, `${rows.length} งวด`)),
      rows.length ? h("ul", { class: "draw-list" }, rows.map((r) => h("li", null,
        h("a", { href: `results.html?d=${r.draw_date}` },
          h("span", { class: "d" }, r.draw_date_th),
          h("span", { class: "f" }, r.prizes.first[0]),
          h("span", { class: "sub" }, sub(r), r.trust_level !== "official" ? ` · ${TRUST[r.trust_level].label}` : "")))))
        : h("p", { class: "empty" }, "ไม่มีงวดที่ตรงกับตัวกรองในปีนี้")));
}

async function drawDetail(date) {
  const m = await manifest();
  const year = date.slice(0, 4);
  if (!m.years.includes(year)) throw new Error("ไม่พบงวดนี้");
  const [{ draws }, idx] = await Promise.all([getData(`draws/${year}.json`), index()]);
  const d = draws.find((x) => x.draw_date === date);
  if (!d) throw new Error("ไม่พบงวดนี้");
  const pos = idx.findIndex((r) => r.draw_date === date);
  const prev = idx[pos - 1];
  const next = idx[pos + 1];
  const sections = PRIZE_ORDER.filter((k) => d.prizes[k].length).map((k) => h("div", { class: "prize-section" },
    h("h3", null, PRIZE_LABEL[k], h("span", { class: "muted" }, `${d.prizes[k].length} หมายเลข`)),
    k === "first"
      ? h("div", { class: "first-prize" }, d.prizes.first[0])
      : h("div", { class: "num-grid" }, d.prizes[k].map((v) => h("span", null, v)))));
  const notes = [];
  if (!d.prizes_2_to_5_available) notes.push("แหล่งข้อมูลไม่มีรางวัลข้างเคียงและรางวัลที่ 2–5 ของงวดนี้");
  if (d.era !== "E3") notes.push("งวดนี้ยังไม่มีเลขหน้า 3 ตัว และเลขท้าย 3 ตัวมี 4 หมายเลข (โครงสร้างรางวัลก่อน 1 ก.ย. 2558)");
  if (d.first_special) notes.push(`รางวัลที่ 1 พิเศษ: ${d.first_special.replaceAll("|", ", ")}`);
  if (d.reconciliation_notes) notes.push(`หมายเหตุการตรวจทาน: ${d.reconciliation_notes}`);
  const pidx = await optionalData("predictions/index.json");
  const hist = pidx ? pidx.history.find((r) => r.draw_date === date) : null;
  const ver = await optionalData("verification.json");
  const imp = ver ? ver.imports.find((x) => x.draw_date === date) : null;
  render(
    h("div", { class: "row" },
      h("a", { href: `results.html?y=${year}` }, `← ผลปี พ.ศ. ${Number(year) + 543}`),
      h("span", { class: "spacer" }),
      prev ? h("a", { href: `results.html?d=${prev.draw_date}`, "aria-label": `งวดก่อน ${prev.draw_date_th}` }, "‹ งวดก่อน") : null,
      next ? h("a", { href: `results.html?d=${next.draw_date}`, "aria-label": `งวดถัดไป ${next.draw_date_th}` }, "งวดถัดไป ›") : null),
    h("div", { class: "page-head section" }, h("h1", null, `งวดวันที่ ${d.draw_date_th}`),
      d.actual_draw_date_th ? h("p", null, `ออกรางวัลจริงวันที่ ${d.actual_draw_date_th}`) : null),
    h("section", { class: "card" }, sections),
    h("section", { class: "card section stack" },
      h("div", { class: "row" }, h("h2", null, "แหล่งข้อมูล", gl("trust-level")), trustChip(d.trust_level)),
      h("p", null, d.source, " · ", ...d.source_url.split(" ").flatMap((u, i) => [i ? " · " : "", extLink(u, "ลิงก์ต้นทาง")])),
      imp ? h("p", { class: "muted small" }, `ดึงจาก API เมื่อ ${thDateTime(imp.retrieved_at)}`) : null,
      notes.map((t) => h("p", { class: "muted small" }, t))),
    hist ? h("section", { class: "card section stack" },
      h("div", { class: "row" }, h("h2", null, "การทำนายงวดนี้"), statusChip(hist.status)),
      hist.snapshot
        ? h("p", null, hist.status === "evaluated" ? `เลข 6 หลักถูกตรง ${hist.exact_hits_total} เลข (ถ้าสุ่มควรถูกราว ${hist.random_expected_total.toFixed(4)}) · ` : "",
          h("a", { href: `history.html?d=${hist.snapshot}` }, "ดูรายละเอียด"))
        : h("p", { class: "muted small" }, "ไม่มีบันทึกการทำนายที่ทำไว้ก่อนออกรางวัลงวดนี้ จึงตรวจผลไม่ได้ (ไม่สร้างย้อนหลัง)", gl("snapshot"))) : null);
}

// ---------- page: stats ----------
function zColor(count, expected) {
  // สีตามระยะห่างจากค่าที่คาดไว้ (หน่วยเป็นส่วนเบี่ยงเบนมาตรฐานของ Poisson) ไม่ใช่ตามจำนวนดิบ
  const z = expected > 0 ? (count - expected) / Math.sqrt(expected) : 0;
  const t = Math.min(1, Math.abs(z) / 3);
  const pctMix = Math.round(8 + t * 62);
  return z >= 0
    ? `color-mix(in srgb, var(--hi) ${pctMix}%, var(--card))`
    : `color-mix(in srgb, var(--lo) ${pctMix}%, var(--card))`;
}

async function pageStats() {
  const six = new URLSearchParams(location.search).get("m") === "six";
  const modeSeg = h("div", { class: "seg tabs", role: "group", "aria-label": "ชนิดตัวเลข" },
    h("button", { type: "button", "aria-pressed": String(!six), onclick: () => { location.search = ""; } }, "เลขท้าย/หน้า 2–3 ตัว"),
    h("button", { type: "button", "aria-pressed": String(six), onclick: () => { location.search = "?m=six"; } }, "เลข 6 หลัก (รางวัลที่ 1–5)"));
  return six ? statsSix(modeSeg) : statsShort(modeSeg);
}

// ---------- ช่วงเวลาที่ใช้คำนวณ (ใช้ร่วมกันทุกส่วนของหน้าสถิติ) ----------
const RANGE_OPTS = [
  ["all", "ทั้งหมด"], ["y5", "5 ปีล่าสุด"], ["y10", "10 ปีล่าสุด"], ["y20", "20 ปีล่าสุด"],
  ["n24", "24 งวดล่าสุด"], ["n50", "50 งวดล่าสุด"], ["n100", "100 งวดล่าสุด"], ["ncustom", "กำหนดจำนวนงวดเอง…"],
  ["e3", "ตั้งแต่ 1 ก.ย. 2558 (รางวัลแบบปัจจุบัน)"], ["official", "เฉพาะข้อมูลทางการ (ตั้งแต่ 16 พ.ย. 2559)"],
];
const OLD_RANGE = { last5y: "y5", recent: "n24", custom: "years" };
// ช่วงที่คำนวณไว้แล้วตอนสร้างเว็บ (ผลเหมือนคำนวณในเบราว์เซอร์ทุกประการ แต่ไม่ต้องโหลดข้อมูลทุกงวด)
const PRECOMP_SHORT = { all: "all", e3: "e3", official: "official", y5: "last5y" };
const PRECOMP_SIX = { ...PRECOMP_SHORT, n24: "recent" };

function rangeFromParams(params, years, allowYears) {
  let key = params.get("t") || "all";
  key = OLD_RANGE[key] || key;
  const ok = RANGE_OPTS.some(([k]) => k === key) || (allowYears && key === "years");
  const n = Number(params.get("n"));
  const from = years.includes(params.get("from")) ? params.get("from") : years[0];
  const to = years.includes(params.get("to")) ? params.get("to") : years[years.length - 1];
  return { key: ok ? key : "all", n: Number.isInteger(n) && n >= 1 && n <= 2000 ? n : 30, from, to };
}

function rangeLabel(range) {
  if (range.key === "ncustom") return `${fmt.format(range.n)} งวดล่าสุด`;
  if (range.key === "years") {
    const [a, b] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from];
    return `พ.ศ. ${Number(a) + 543}–${Number(b) + 543}`;
  }
  return (RANGE_OPTS.find(([k]) => k === range.key) || ["", "ทั้งหมด"])[1];
}

function syncRangeUrl(range, extra) {
  const p = new URLSearchParams(location.search);
  for (const k of ["t", "n", "from", "to"]) p.delete(k);
  if (range.key !== "all") p.set("t", range.key);
  if (range.key === "ncustom") p.set("n", String(range.n));
  if (range.key === "years") { p.set("from", range.from); p.set("to", range.to); }
  for (const [k, v] of Object.entries(extra || {})) { if (v) p.set(k, v); else p.delete(k); }
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

function rangePicker(range, years, onChange, allowYears) {
  const opts = allowYears ? [...RANGE_OPTS, ["years", "กำหนดช่วงปีเอง…"]] : RANGE_OPTS;
  const sel = h("select", { id: "range", "aria-label": "ช่วงเวลาที่ใช้คำนวณ" },
    opts.map(([k, label]) => h("option", { value: k, selected: k === range.key }, label)));
  const nIn = h("input", { id: "range-n", type: "number", inputmode: "numeric", min: "1", max: "2000", step: "1", value: String(range.n), "aria-label": "จำนวนงวดล่าสุด" });
  const nRow = h("div", { class: "row" }, h("label", { for: "range-n", class: "small muted" }, "จำนวนงวดล่าสุด"), nIn,
    h("button", { type: "button", class: "btn btn-ghost", onclick: () => applyN() }, "ใช้"));
  const yearOpt = (y, cur) => h("option", { value: y, selected: y === cur }, `พ.ศ. ${Number(y) + 543}`);
  const fromSel = h("select", { id: "y-from", "aria-label": "ตั้งแต่ปี" }, years.map((y) => yearOpt(y, range.from)));
  const toSel = h("select", { id: "y-to", "aria-label": "ถึงปี" }, years.map((y) => yearOpt(y, range.to)));
  const yRow = h("div", { class: "row" },
    h("label", { for: "y-from", class: "small muted" }, "ตั้งแต่"), fromSel, h("label", { for: "y-to", class: "small muted" }, "ถึง"), toSel);
  function show() {
    nRow.hidden = range.key !== "ncustom";
    yRow.hidden = range.key !== "years";
  }
  function applyN() {
    const v = Math.round(Number(nIn.value));
    if (!Number.isFinite(v) || v < 1) { nIn.value = String(range.n); return; }
    range.n = Math.min(2000, v);
    nIn.value = String(range.n);
    onChange();
  }
  sel.addEventListener("change", () => { range.key = sel.value; show(); onChange(); });
  nIn.addEventListener("change", applyN);
  fromSel.addEventListener("change", () => { range.from = fromSel.value; onChange(); });
  toSel.addEventListener("change", () => { range.to = toSel.value; onChange(); });
  show();
  return h("div", { class: "stack range-picker" },
    h("div", { class: "row" }, h("label", { for: "range", class: "small muted" }, "ช่วงเวลาที่ใช้คำนวณ"), sel), nRow, yRow);
}

// ---------- stats: เลขท้าย 2 ตัว / ท้าย 3 ตัว / หน้า 3 ตัว ----------
const SHORT_PRIZES = [["last2", "เลขท้าย 2 ตัว"], ["back3", "เลขท้าย 3 ตัว"], ["front3", "เลขหน้า 3 ตัว"]];

async function statsShort(modeSeg) {
  const [freq, idx, m] = await Promise.all([getData("stats/frequency.json"), index(), manifest()]);
  const params = new URLSearchParams(location.search);
  const state = {
    prize: SHORT_PRIZES.some(([k]) => k === params.get("p")) ? params.get("p") : "last2",
    range: rangeFromParams(params, m.years, false),
    selected: null,
  };
  const body = h("div");
  const seg = h("div", { class: "seg", role: "group", "aria-label": "เลือกรางวัล" });
  function draw() {
    seg.replaceChildren(...SHORT_PRIZES.map(([k, label]) => h("button", {
      type: "button", "aria-pressed": String(state.prize === k),
      onclick: () => { state.prize = k; state.selected = null; draw(); },
    }, label)));
    const has = (r) => (state.prize === "last2" ? !!r.last2 : r[state.prize].length > 0);
    const rows = applyRange(idx, state.range, has, m.latest_draw);
    const pre = PRECOMP_SHORT[state.range.key];
    const f = pre ? freq.data[pre][state.prize] : computeFreq(rows, state.prize);
    body.replaceChildren(...statsBody(f, state, rows, freq.gaps_last2));
    syncRangeUrl(state.range, { p: state.prize === "last2" ? "" : state.prize });
  }
  render(
    pageHead("สถิติเลขท้าย", "แต่ละเลขออกกี่ครั้ง เทียบกับที่ควรเป็นถ้าการออกรางวัลสุ่มจริง"),
    h("section", { class: "card stack" }, modeSeg, seg,
      rangePicker(state.range, m.years, () => { state.selected = null; draw(); }, false)),
    body);
  draw();
}

// ข้อความสั้น ๆ ของค่า p (ไม่ใช้ศัพท์เทคนิค)
function pText(p) {
  return `ค่า p = ${fmtP(p)} (ยิ่งน้อยยิ่งต่างจากการสุ่ม ถ้าต่ำกว่า 0.05 ถือว่าต่างชัด)`;
}

function statsBody(f, state, rowsIn, gaps) {
  const width = state.prize === "last2" ? 2 : 3;
  const keyOf = (i) => String(i).padStart(width, "0");
  const space = f.counts.length;
  if (!f.slots) return [h("section", { class: "card section" }, h("p", { class: "empty" }, "ไม่มีข้อมูลรางวัลนี้ในช่วงเวลาที่เลือก"))];
  const outside = f.counts.filter((c) => c < f.range95[0] || c > f.range95[1]).length;
  const chi = f.chi_square;
  const summary = h("section", { class: "card section stack" },
    h("div", { class: "stat-row" },
      stat("งวดที่นับ", fmt.format(f.eligible_draws)),
      stat("จำนวนเลขที่ออก", fmt.format(f.slots), "บางรางวัลมีหลายเลขต่องวด"),
      stat(term("ถ้าสุ่ม แต่ละเลขควรออกราว", "expected"), `${fmt2.format(f.expected)} ครั้ง`),
      stat(term("ช่วงปกติ", "range95"), `${f.range95[0]}–${f.range95[1]} ครั้ง`, "ถ้าสุ่มจริง 95 ใน 100 เลขจะออกจำนวนครั้งอยู่ในช่วงนี้")),
    h("p", { class: "small muted" },
      `${rangeLabel(state.range)} · ${thShort(f.first_draw)} – ${thShort(f.last_draw)}`,
      state.prize === "back3" ? " · ก่อน 1 ก.ย. 2558 มี 4 เลขต่องวด หลังจากนั้น 2 เลข จึงนับเป็นจำนวนเลข ไม่ใช่จำนวนงวด" : "",
      state.prize === "front3" ? " · เลขหน้า 3 ตัวเริ่มมีตั้งแต่ 1 ก.ย. 2558 งวดก่อนหน้าไม่นับ" : ""),
    f.expected < 5 ? h("div", { class: "callout warn" }, `ข้อมูลน้อย: แต่ละเลขควรออกเพียงราว ${fmt2.format(f.expected)} ครั้ง ตัวเลขด้านล่างจึงแกว่งมากเป็นธรรมดา ลองเลือกช่วงเวลาที่ยาวขึ้น`, gl("small-sample")) : null,
    chi ? h("div", { class: chi.p >= 0.05 ? "callout ok" : "callout" },
      h("strong", null, chi.p >= 0.05 ? "ภาพรวมไม่ต่างจากการสุ่ม" : "ภาพรวมต่างจากการสุ่มค่อนข้างชัด"), h("br"),
      h("span", { class: "small" },
        `มี ${outside} จาก ${fmt.format(space)} เลขที่ออกบ่อยหรือน้อยเกินช่วงปกติ (ถ้าสุ่มจริงก็จะมีราว ${Math.round(space * 0.05)} เลขอยู่แล้ว) · ${pText(chi.p)}`, gl("p-value"), gl("chi-square")),
      chi.p < 0.05 ? h("span", { class: "small" }, " · ทดสอบหลายแบบย่อมเจอบางแบบโดยบังเอิญ ดูหน้า \"สุ่มจริงไหม\" ประกอบ") : null) : null);

  const detail = h("div", { class: "stack" });
  function showDetail(num) {
    const i = Number(num);
    const vals = (r) => (state.prize === "last2" ? [r.last2] : r[state.prize]);
    const dates = rowsIn.filter((r) => vals(r).includes(num)).map((r) => r.draw_date).reverse();
    // จำนวนครั้งรายปี เทียบกับที่ควรเป็นถ้าสุ่ม (จำนวนเลขที่ออกในปีนั้น ÷ จำนวนเลขที่เป็นไปได้)
    const years = [...new Set(rowsIn.map((r) => r.draw_date.slice(0, 4)))];
    const perYear = years.map((y) => rowsIn.filter((r) => r.draw_date.startsWith(y)).reduce((a, r) => {
      const v = vals(r);
      return [a[0] + v.filter((x) => x === num).length, a[1] + v.length / space];
    }, [0, 0]));
    const cur = state.prize === "last2" && gaps ? gaps.current_gap[i] : null;
    detail.replaceChildren(
      h("h3", null, `เลข ${num}`),
      h("p", null, `ออก ${fmt.format(f.counts[i])} ครั้ง (ถ้าสุ่มควรออกราว ${fmt2.format(f.expected)} ครั้ง, ช่วงปกติ ${f.range95[0]}–${f.range95[1]})`),
      cur !== null && cur !== undefined ? h("p", { class: "note" }, `ไม่ออกเป็นเลขท้าย 2 ตัวมาแล้ว ${fmt.format(cur)} งวด (นับทุกงวด) · ถ้าสุ่มจริง การไม่ออกนานไม่ได้ทำให้งวดหน้ามีโอกาสมากขึ้น (ยังเป็น 1 ใน 100)`) : null,
      years.length > 1 ? h("div", { class: "stack" }, h("h3", null, "จำนวนครั้งรายปี"),
        barChart({ labels: years.map((y) => String(Number(y) + 543).slice(2)), values: perYear.map((x) => x[0]), expected: perYear.map((x) => x[1]), ariaLabel: `เลข ${num} ออกกี่ครั้งในแต่ละปี`, xTitle: "ปี พ.ศ. (2 หลักท้าย)" })) : null,
      dates.length
        ? h("div", { class: "num-grid" }, dates.map((dt) => h("a", { href: `results.html?d=${dt}`, class: "small" }, thShort(dt))))
        : h("p", { class: "empty" }, "ไม่เคยออกในช่วงนี้"));
  }

  const parts = [summary];
  if (state.prize === "last2") {
    const grid = h("div", { class: "heatmap", role: "group", "aria-label": "ตารางความถี่เลขท้าย 2 ตัว 00–99" });
    f.counts.forEach((c, i) => {
      const num = keyOf(i);
      const out = c < f.range95[0] || c > f.range95[1];
      const btn = h("button", {
        type: "button", class: out ? "out" : null, "aria-pressed": String(state.selected === num),
        "aria-label": `เลข ${num} ออก ${c} ครั้ง${out ? " (นอกช่วงปกติ)" : ""}`,
        onclick: () => { state.selected = num; grid.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false")); btn.setAttribute("aria-pressed", "true"); showDetail(num); },
      }, h("span", null, num), h("span", { class: "c" }, c));
      btn.style.background = zColor(c, f.expected);
      grid.append(btn);
    });
    parts.push(h("section", { class: "card section stack" },
      h("h2", null, "ตารางความถี่ 00–99"),
      heatLegend(),
      grid,
      h("p", { class: "small muted" }, "สีบอกว่าออกบ่อยหรือน้อยกว่าที่ควรเป็นแค่ไหน ไม่ได้บอกโอกาสของงวดหน้า เลขที่ออกบ่อยหรือน้อยในอดีตมีโอกาสออกงวดหน้าเท่ากับเลขอื่น (1 ใน 100) · แตะช่องเพื่อดูรายละเอียด"),
      detail,
      freqTable(f, keyOf, `${state.prize}-${state.range.key || "range"}`)));
    if (gaps && gaps.gaps) {
      const labels = gaps.bins.map(([lo, hi]) => (hi === null ? `> ${lo - 1}` : `${lo}–${hi}`));
      parts.push(h("section", { class: "card section stack" },
        h("h2", null, "เลขเดิมกลับมาออกซ้ำห่างกันกี่งวด"),
        barChart({ labels, values: gaps.observed, expected: gaps.expected, ariaLabel: "ระยะห่างระหว่างการออกซ้ำของเลขท้าย 2 ตัว", xTitle: "ห่างกี่งวด" }),
        chiLine(gaps.chi_square),
        h("p", { class: "note" }, `เลขท้าย 2 ตัวเดียวกันกลับมาออกซ้ำห่างกันเฉลี่ย ${fmt2.format(gaps.mean_gap)} งวด (ถ้าสุ่มจริงควรเป็นราว ${fmt2.format(gaps.expected_mean_gap)}) · จาก ${fmt.format(gaps.gaps)} ครั้งที่ออกซ้ำใน ${fmt.format(gaps.draws)} งวด · ส่วนนี้ใช้ทุกงวดเสมอ ไม่ขึ้นกับช่วงเวลาที่เลือก · ค่าที่ควรเป็นได้จากการจำลองการสุ่ม ${fmt.format(gaps.sims)} รอบ`)));
    }
  } else {
    const input = h("input", { id: "lookup", type: "text", inputmode: "numeric", maxlength: "3", autocomplete: "off", placeholder: "000–999" });
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "").slice(0, 3);
      if (input.value.length === 3) showDetail(input.value);
    });
    parts.push(
      h("section", { class: "card section stack" },
        h("div", { class: "field" }, h("label", { for: "lookup" }, "ดูเลข 3 ตัว"), input), detail),
      h("section", { class: "card section stack" },
        h("h2", null, "มีกี่เลขที่ออก 0, 1, 2, … ครั้ง"),
        h("p", { class: "small muted" }, `เลข 3 ตัวมี 1,000 แบบ แต่ละเลขควรออกเพียงราว ${fmt2.format(f.expected)} ครั้ง การดูทีละเลขจึงแทบเป็นเรื่องบังเอิญ กราฟนี้เลยดูภาพรวมแทน: ถ้าแท่งกับเส้นใกล้กัน แปลว่าเหมือนการสุ่ม`),
        histogram(f.count_histogram)),
      heat1000(f, showDetail));
  }
  return parts;
}

function heatLegend() {
  const legendBar = h("span", { class: "bar" });
  legendBar.style.background = "linear-gradient(90deg, color-mix(in srgb, var(--lo) 70%, var(--card)), var(--card), color-mix(in srgb, var(--hi) 70%, var(--card)))";
  return h("div", { class: "legend" }, "ออกน้อยกว่าที่ควร", legendBar, "ออกบ่อยกว่าที่ควร", h("span", null, "· มีกรอบ = เกินช่วงปกติ"));
}

// แผนที่ 000–999: ข้อมูลน้อยมากต่อเลข สีจึงเป็นเรื่องบังเอิญเป็นหลัก
function heat1000(f, onPick) {
  const grid = h("div", { class: "heat1000", role: "group", "aria-label": "ตารางความถี่เลข 3 ตัว 000–999" });
  f.counts.forEach((c, i) => {
    const num = String(i).padStart(3, "0");
    const out = c < f.range95[0] || c > f.range95[1];
    const cell = h("button", { type: "button", class: out ? "out" : null, title: `${num}: ${c} ครั้ง`, "aria-label": `เลข ${num} ออก ${c} ครั้ง`, onclick: () => onPick(num) });
    cell.style.background = zColor(c, f.expected);
    grid.append(cell);
  });
  return h("section", { class: "card section stack" },
    h("h2", null, "ตารางความถี่ 000–999"),
    h("div", { class: "callout warn" }, `ข้อมูลน้อย: แต่ละเลขควรออกเพียงราว ${fmt2.format(f.expected)} ครั้ง สีส่วนใหญ่จึงเป็นเรื่องบังเอิญ ถ้าสุ่มจริงก็จะมีราว 50 เลขที่มีกรอบ (เกินช่วงปกติ)`, gl("small-sample")),
    heatLegend(),
    grid,
    h("p", { class: "note" }, "แต่ละแถวคือ 40 เลขเรียงกัน (แถวแรก 000–039) · แตะช่องเพื่อดูรายละเอียด"));
}

function freqTable(f, keyOf, name) {
  return h("details", null,
    h("summary", null, "แสดงเป็นตาราง"),
    h("div", { class: "row" }, csvButton(`lotto-frequency-${name || "x"}.csv`, ["เลข", "ออก (ครั้ง)", "ถ้าสุ่มควรเป็น", "ช่วงปกติ ต่ำ", "ช่วงปกติ สูง"],
      () => f.counts.map((c, i) => [keyOf(i), c, r4(f.expected), f.range95[0], f.range95[1]]))),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "เลข"), h("th", { class: "n" }, "ออก (ครั้ง)"), h("th", { class: "n" }, term("ถ้าสุ่มควรเป็น", "expected")), h("th", { class: "n" }, "ต่าง"))),
      h("tbody", null, f.counts.map((c, i) => h("tr", null,
        h("td", { class: "mono" }, keyOf(i)), h("td", { class: "n" }, c), h("td", { class: "n" }, fmt2.format(f.expected)),
        h("td", { class: "n" }, (c - f.expected >= 0 ? "+" : "") + fmt1.format(c - f.expected))))))));
}

// ---------- charts ----------
// สไตล์เรียบ: ไม่มีเส้นตาราง แสดงตัวเลขแกน y แค่ 0 และค่าสูงสุด
// แท่งสีเทาเข้ม = ค่าจริง, เส้นประสีส้ม = ที่ควรเป็นถ้าสุ่ม, แถบเขียวจาง = ช่วงปกติ
function yAxis(svg, padL, y, values, fmtV) {
  values.forEach((v) => svg.append(s("text", { x: padL - 6, y: y(v) + 4, "text-anchor": "end" }, fmtV(v))));
}

function histogram(hist) {
  const W = 640, H = 230, padL = 40, padB = 34, padT = 12;
  const n = hist.observed.length;
  const max = Math.max(1, ...hist.observed, ...hist.expected);
  const bw = (W - padL - 10) / n;
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "จำนวนเลขที่ออกแต่ละจำนวนครั้ง เทียบกับที่ควรเป็นถ้าสุ่ม" });
  yAxis(svg, padL, y, [0, max], (v) => fmt.format(Math.round(v)));
  svg.append(s("line", { x1: padL, x2: W - 10, y1: y(0), y2: y(0), class: "axis" }));
  hist.observed.forEach((v, k) => {
    const x = padL + k * bw;
    const bar = s("rect", { x: x + bw * 0.18, y: y(v), width: bw * 0.64, height: H - padB - y(v), rx: 2, class: "bar" });
    bar.append(s("title", null, `ออก ${k} ครั้ง: ${v} เลข (ถ้าสุ่มควรเป็น ${hist.expected[k].toFixed(1)})`));
    svg.append(bar);
    svg.append(s("text", { x: x + bw / 2, y: H - padB + 16, "text-anchor": "middle" }, k));
  });
  const pts = hist.expected.map((v, k) => `${padL + k * bw + bw / 2},${y(v)}`).join(" ");
  svg.append(s("polyline", { points: pts, class: "expect" }));
  svg.append(s("text", { x: (W + padL) / 2, y: H - 4, "text-anchor": "middle" }, "จำนวนครั้งที่ออก"));
  const legend = h("div", { class: "legend" }, h("span", { class: "key bar" }), "จำนวนเลขจริง", h("span", { class: "key expect" }), "ที่ควรเป็นถ้าสุ่ม");
  const table = h("details", null, h("summary", null, "แสดงเป็นตาราง"), h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "ออก (ครั้ง)"), h("th", { class: "n" }, "จำนวนเลขจริง"), h("th", { class: "n" }, term("ถ้าสุ่มควรเป็น", "expected")))),
    h("tbody", null, hist.observed.map((v, k) => h("tr", null, h("td", null, k), h("td", { class: "n" }, v), h("td", { class: "n" }, fmt1.format(hist.expected[k]))))))));
  return [h("div", { class: "chart" }, svg), legend, table];
}

function barChart({ labels, values, expected, band, ariaLabel, xTitle, every, W = 640 }) {
  const H = W < 640 ? 230 : 220, padL = 48, padB = xTitle ? 40 : 28, padT = 12, padR = 8;
  const n = values.length;
  const max = Math.max(1, ...values, ...(expected || []), band ? band[1] : 0) * 1.06;
  const bw = (W - padL - padR) / n;
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": ariaLabel });
  const top = Math.max(...values);
  yAxis(svg, padL, y, [0, top], (v) => (top < 5 ? fmt1.format(v) : fmt.format(Math.round(v))));
  if (band) {
    svg.append(s("rect", { x: padL, width: W - padL - padR, y: y(band[1]), height: Math.max(1, y(band[0]) - y(band[1])), class: "band" }));
  }
  svg.append(s("line", { x1: padL, x2: W - padR, y1: y(0), y2: y(0), class: "axis" }));
  const step = every || (n > 24 ? Math.ceil(n / 12) : 1);
  values.forEach((v, i) => {
    const x = padL + i * bw;
    const bar = s("rect", { x: x + bw * 0.18, y: y(v), width: Math.max(1, bw * 0.64), height: H - padB - y(v), rx: Math.min(2, bw / 4), class: "bar" });
    bar.append(s("title", null, `${labels[i]}: ${fmt.format(v)}${expected ? ` (ถ้าสุ่มควรเป็น ${fmt1.format(expected[i])})` : ""}`));
    svg.append(bar);
    if (i % step === 0) svg.append(s("text", { x: x + bw / 2, y: H - padB + 15, "text-anchor": "middle" }, labels[i]));
  });
  if (expected) {
    const pts = expected.map((v, i) => `${padL + i * bw + bw / 2},${y(v)}`).join(" ");
    svg.append(s("polyline", { points: pts, class: "expect" }));
  }
  if (xTitle) svg.append(s("text", { x: (W + padL) / 2, y: H - 4, "text-anchor": "middle" }, xTitle));
  const legend = h("div", { class: "legend" }, h("span", { class: "key bar" }), "ค่าจริง",
    expected ? [h("span", { class: "key expect" }), "ที่ควรเป็นถ้าสุ่ม"] : null,
    band ? [h("span", { class: "key band" }), "ช่วงปกติ", gl("range95")] : null);
  return [h("div", { class: "chart" }, svg), legend];
}

// เส้นเวลา: values (อาจมี null) เทียบเส้นอ้างอิง (เส้นประ) และแถบช่วงปกติ
function lineChart({ values, labels, ref, band, ariaLabel, yFmt, yMin, yMax, W = 640 }) {
  const H = W < 640 ? 230 : 210, padL = 52, padB = 28, padT = 10, padR = 10;
  const n = values.length;
  const vals = values.filter((v) => v !== null);
  const lo = yMin !== undefined ? yMin : Math.min(...vals, band ? band[0] : Infinity, ref ?? Infinity);
  const hi = yMax !== undefined ? yMax : Math.max(...vals, band ? band[1] : -Infinity, ref ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v) => H - padB - ((v - lo) / span) * (H - padB - padT);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": ariaLabel });
  yAxis(svg, padL, y, ref !== undefined && ref !== null ? [lo, ref, hi] : [lo, hi], yFmt || ((v) => fmt1.format(v)));
  if (band) svg.append(s("rect", { x: padL, width: W - padL - padR, y: y(band[1]), height: Math.max(1, y(band[0]) - y(band[1])), class: "band" }));
  if (ref !== undefined && ref !== null) svg.append(s("line", { x1: padL, x2: W - padR, y1: y(ref), y2: y(ref), class: "ref" }));
  let d = "";
  values.forEach((v, i) => { if (v !== null) d += `${d && values[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
  svg.append(s("path", { d, class: "line" }));
  const ticks = Math.min(6, n);
  for (let t = 0; t < ticks; t++) {
    const i = Math.round((t * (n - 1)) / Math.max(1, ticks - 1));
    svg.append(s("text", { x: x(i), y: H - 8, "text-anchor": t === 0 ? "start" : t === ticks - 1 ? "end" : "middle" }, labels[i]));
  }
  return h("div", { class: "chart" }, svg);
}

function distTable(head, labels, observed, expected) {
  return h("details", null, h("summary", null, "แสดงเป็นตาราง"), h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, head), h("th", { class: "n" }, "จริง"), h("th", { class: "n" }, term("ถ้าสุ่มควรเป็น", "expected")), h("th", { class: "n" }, "ต่าง"))),
    h("tbody", null, observed.map((o, i) => h("tr", null, h("td", null, labels[i]), h("td", { class: "n" }, fmt.format(o)),
      h("td", { class: "n" }, fmt1.format(expected[i])), h("td", { class: "n" }, (o - expected[i] >= 0 ? "+" : "") + fmt1.format(o - expected[i]))))))));
}

function chiLine(chi) {
  if (!chi) return h("p", { class: "note" }, "ข้อมูลน้อยเกินไปที่จะเทียบกับการสุ่ม");
  return h("p", { class: "note" },
    chi.p >= 0.05 ? "ไม่ต่างจากการสุ่มอย่างชัดเจน" : "ต่างจากการสุ่มค่อนข้างชัด (ทดสอบหลายแบบ ย่อมเจอบางแบบโดยบังเอิญ)",
    ` · ${pText(chi.p)}`, gl("chi-square"));
}

// ---------- six-digit stats for a custom year range (วิธีเดียวกับ scripts/lotto_sixdigit.py) ----------
const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function gammq(a, x) {
  if (x <= 0) return 1;
  const gln = lgamma(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = 1 / a;
    for (let i = 0; i < 10000; i++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
    return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - gln));
  }
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, hh = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    hh *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * hh;
}
const binomPmf = (n, p, k) => Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log1p(-p));
function binomInterval(n, p) {
  if (!n) return [0, 0];
  const mean = n * p, sd = Math.sqrt(n * p * (1 - p));
  const k0 = Math.max(0, Math.floor(mean - 12 * sd - 5));   // ส่วนก่อน k0 น้อยจนตัดได้
  let cum = 0, lo = null;
  for (let k = k0; k <= n; k++) {
    cum += binomPmf(n, p, k);
    if (lo === null && cum >= 0.025) lo = k;
    if (cum >= 0.975) return [lo, k];
  }
  return [lo ?? 0, n];
}
function chiUniform(counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) return null;
  const e = n / counts.length;
  const chi2 = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
  const df = counts.length - 1;
  return { chi2, df, p: gammq(df / 2, chi2 / 2) };
}
function chiExpected(observed, probs) {
  const n = observed.reduce((a, b) => a + b, 0);
  if (!n) return null;
  const bins = [];
  let co = 0, ce = 0;
  observed.forEach((o, i) => { co += o; ce += probs[i] * n; if (ce >= 5) { bins.push([co, ce]); co = 0; ce = 0; } });
  if (ce > 0) { if (bins.length) { const [o, e] = bins.pop(); bins.push([o + co, e + ce]); } else bins.push([co, ce]); }
  if (bins.length < 2) return null;
  const chi2 = bins.reduce((a, [o, e]) => a + (o - e) ** 2 / e, 0);
  const df = bins.length - 1;
  return { chi2, df, p: gammq(df / 2, chi2 / 2) };
}
function computeSix(numbers, info, six) {
  const n = numbers.length;
  const digit = Array(10).fill(0), pos = [...Array(6)].map(() => Array(10).fill(0)), pair = Array(100).fill(0);
  const odd = Array(7).fill(0), high = Array(7).fill(0), dsum = Array(55).fill(0), pat = Array(six.patterns.length).fill(0);
  const run = Array(6).fill(0);
  const pre = new Uint32Array(1000), suf = new Uint32Array(1000);
  for (const v of numbers) {
    const ds = [...v].map(Number);
    const cnt = Array(10).fill(0);
    ds.forEach((d, i) => { pos[i][d]++; digit[d]++; cnt[d]++; });
    for (let i = 0; i < 5; i++) pair[ds[i] * 10 + ds[i + 1]]++;
    odd[ds.filter((d) => d % 2).length]++;
    high[ds.filter((d) => d >= 5).length]++;
    dsum[ds.reduce((a, b) => a + b, 0)]++;
    pat[six.patterns.indexOf(cnt.filter((c) => c).sort((a, b) => b - a).join(""))]++;
    run[runOf(ds) - 1]++;
    pre[Number(v.slice(0, 3))]++;
    suf[Number(v.slice(3))]++;
  }
  const uni = (counts, trials, space) => ({ counts, expected: trials / space, range95: binomInterval(trials, 1 / space), chi_square: chiUniform(counts) });
  const dist = (obs, probs) => ({ observed: obs, expected: probs.map((p) => p * n), chi_square: chiExpected(obs, probs) });
  const halfHist = (arr) => {
    const hist = new Map();
    let kmax = 0;
    arr.forEach((c) => { hist.set(c, (hist.get(c) || 0) + 1); kmax = Math.max(kmax, c); });
    kmax = Math.max(kmax, (n ? binomInterval(n, 0.001)[1] : 0) + 2);
    const ks = [...Array(kmax + 1).keys()];
    return { observed: ks.map((k) => hist.get(k) || 0), expected: ks.map((k) => (n ? 1000 * binomPmf(n, 0.001, k) : (k === 0 ? 1000 : 0))) };
  };
  const th = six.theory;
  return {
    numbers: n, draws: info[0], first_draw: info[1], last_draw: info[2],
    digit: uni(digit, 6 * n, 10), position: pos.map((c) => uni(c, n, 10)), pair: uni(pair, 5 * n, 100),
    prefix_hist: halfHist(pre), suffix_hist: halfHist(suf),
    odd: dist(odd, th.binom6), high: dist(high, th.binom6), dsum: dist(dsum, th.dsum), pattern: dist(pat, th.pattern),
    run: th.run ? dist(run, th.run) : null,
  };
}

// ความยาวช่วงเรียงติดกันที่ยาวที่สุด: ตัวถัดไป +1 หรือ -1 ในทิศเดียวกัน (9→0 ไม่นับ) — เหมือน lotto_sixdigit.run_of
function runOf(ds) {
  let best = 1, cur = 1, dir = 0;
  for (let i = 1; i < ds.length; i++) {
    const step = ds[i] - ds[i - 1];
    if (step === 1 || step === -1) { cur = step === dir ? cur + 1 : 2; dir = step; } else { cur = 1; dir = 0; }
    if (cur > best) best = cur;
  }
  return best;
}

// ความถี่เลขท้าย 2 ตัว / ท้าย 3 ตัว / หน้า 3 ตัว จากแถวของ index.json (วิธีเดียวกับ lotto_stats.frequency)
function computeFreq(rows, prize) {
  const space = prize === "last2" ? 100 : 1000;
  const vals = (r) => (prize === "last2" ? (r.last2 ? [r.last2] : []) : r[prize]);
  const el = rows.filter((r) => vals(r).length);
  const counts = Array(space).fill(0), containing = Array(space).fill(0);
  let slots = 0;
  for (const r of el) {
    const v = vals(r);
    slots += v.length;
    v.forEach((x) => counts[Number(x)]++);
    new Set(v).forEach((x) => containing[Number(x)]++);
  }
  const range95 = binomInterval(slots, 1 / space);
  const out = {
    prize, eligible_draws: el.length, slots,
    first_draw: el.length ? el[0].draw_date : null, last_draw: el.length ? el[el.length - 1].draw_date : null,
    expected: slots / space, range95, counts, draws_containing: containing, chi_square: slots ? chiUniform(counts) : null,
  };
  if (space === 1000) {
    const hist = new Map();
    counts.forEach((c) => hist.set(c, (hist.get(c) || 0) + 1));
    const kmax = Math.max(...hist.keys(), range95[1] + 2);
    const ks = [...Array(kmax + 1).keys()];
    out.count_histogram = {
      observed: ks.map((k) => hist.get(k) || 0),
      expected: ks.map((k) => (slots ? (k <= slots ? 1000 * binomPmf(slots, 1 / 1000, k) : 0) : (k === 0 ? 1000 : 0))),
    };
  }
  return out;
}

// เลข 6 หลักที่ออกมากกว่า 1 ครั้ง (วิธีเดียวกับ lotto_sixdigit.repeats)
// เรียง: จำนวนครั้งมาก→น้อย, ออกล่าสุดใหม่→เก่า, เลขน้อย→มาก
function computeRepeats(draws, keys, top = 20) {
  const occ = new Map();
  let used = 0, first = null, last = null;
  for (const d of draws) {
    const list = keys.flatMap((k) => d.prizes[k].map((v) => [k, v]));
    if (!list.length) continue;
    used++;
    first = first || d.draw_date;
    last = d.draw_date;
    for (const [k, v] of list) {
      if (!occ.has(v)) occ.set(v, []);
      occ.get(v).push([d.draw_date, k]);
    }
  }
  let total = 0;
  occ.forEach((o) => { total += o.length; });
  const rep = [...occ.entries()].filter(([, o]) => o.length >= 2).map(([number, hits]) => ({ number, count: hits.length, last: hits[hits.length - 1][0], hits }));
  rep.sort((a, b) => (b.count - a.count) || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || (a.number < b.number ? -1 : 1));
  const byCount = {};
  rep.forEach((r) => { byCount[r.count] = (byCount[r.count] || 0) + 1; });
  const p = 1e-6;
  const q0 = Math.pow(1 - p, total);
  const q1 = total ? total * p * Math.pow(1 - p, total - 1) : 0;
  const q2 = total >= 2 ? (total * (total - 1) / 2) * p * p * Math.pow(1 - p, total - 2) : 0;
  return {
    prizes: keys, draws: used, first_draw: first, last_draw: last, numbers_total: total, distinct: occ.size, repeated: rep.length,
    by_count: byCount, expected_repeated: Math.round(1e7 * (1 - q0 - q1)) / 10, expected_ge3: Math.round(1e7 * (1 - q0 - q1 - q2)) / 10,
    top: rep.slice(0, top),
  };
}

// ช่วงเวลาที่ใช้คำนวณ: rows เรียงจากเก่าไปใหม่ (มี draw_date, era, trust_level), has(row) = งวดนี้มีรางวัลที่สนใจไหม
// "ปีล่าสุด" นับจากงวดล่าสุดของข้อมูลทั้งหมด (latest) · "งวดล่าสุด" นับเฉพาะงวดที่มีรางวัลนั้น
function applyRange(rows, range, has, latest) {
  const el = rows.filter(has);
  const m = /^(y|n)(\d+)$/.exec(range.key);
  if (m && m[1] === "y") {
    const cut = `${Number(latest.slice(0, 4)) - Number(m[2])}${latest.slice(4)}`;
    return el.filter((r) => r.draw_date > cut);
  }
  if (m && m[1] === "n") return el.slice(-Number(m[2]));
  if (range.key === "ncustom") return el.slice(-Math.max(1, range.n || 1));
  if (range.key === "e3") return el.filter((r) => r.era === "E3");
  if (range.key === "official") return el.filter((r) => r.trust_level === "official");
  if (range.key === "years") return el.filter((r) => r.draw_date.slice(0, 4) >= range.from && r.draw_date.slice(0, 4) <= range.to);
  return el;
}

// ---------- stats: six-digit ----------
const SIX_SHORT = { first: "ที่ 1", second: "ที่ 2", third: "ที่ 3", fourth: "ที่ 4", fifth: "ที่ 5" };

async function statsSix(modeSeg) {
  const [six, m, rep0] = await Promise.all([getData("stats/sixdigit.json"), manifest(), optionalData("stats/repeats.json")]);
  const params = new URLSearchParams(location.search);
  const state = {
    prize: six.prizes.includes(params.get("p")) ? params.get("p") : "all",
    range: rangeFromParams(params, m.years, true),
    sort: { key: "rank", dir: 1 },
  };
  let allD = null;
  let token = 0;
  const keysOf = () => (state.prize === "all" ? SIX : [state.prize]);
  async function current() {
    const keys = keysOf();
    const pre = PRECOMP_SIX[state.range.key];
    const preRep = rep0 && state.prize === "all" && state.range.key === "all";
    if (pre && preRep) return { f: six.data[pre][state.prize], rep: rep0 };
    allD = allD || (await allDraws()).sort((a, b) => (a.draw_date < b.draw_date ? -1 : 1));
    const sub = applyRange(allD, state.range, (d) => keys.some((k) => d.prizes[k].length), m.latest_draw);
    const f = pre ? six.data[pre][state.prize]
      : computeSix(sub.flatMap((d) => keys.flatMap((k) => d.prizes[k])).filter((v) => RE_SIX.test(v)),
        [sub.length, sub.length ? sub[0].draw_date : null, sub.length ? sub[sub.length - 1].draw_date : null], six);
    return { f, rep: preRep ? rep0 : computeRepeats(sub, keys) };
  }
  const seg = h("div", { class: "seg", role: "group", "aria-label": "เลือกรางวัล" });
  const body = h("div");
  async function draw() {
    const my = ++token;
    seg.replaceChildren(...six.prizes.map((k) => h("button", {
      type: "button", "aria-pressed": String(state.prize === k),
      onclick: () => { state.prize = k; draw(); },
    }, SIX_LABEL[k])));
    syncRangeUrl(state.range, { m: "six", p: state.prize === "all" ? "" : state.prize });
    body.replaceChildren(h("p", { class: "loading" }, "กำลังคำนวณ…"));
    try {
      const { f, rep } = await current();
      if (my !== token) return;
      const parts = sixBody(six, state, f);
      parts.splice(1, 0, repeatsSection(rep, state));
      body.replaceChildren(...parts);
    } catch (e) {
      if (my === token) body.replaceChildren(h("p", { class: "error-text" }, String(e.message || e)));
    }
  }
  render(
    pageHead("สถิติเลข 6 หลัก", "ตัวเลขในรางวัลที่ 1–5 เทียบกับที่ควรเป็นถ้าทุกเลข 000000–999999 มีโอกาสเท่ากัน"),
    h("section", { class: "card stack" }, modeSeg, seg, rangePicker(state.range, m.years, draw, true)),
    body);
  draw();
}

// เลข 6 หลักที่ออกซ้ำ: ตารางเรียงได้ (จำนวนครั้ง / เลข / ออกล่าสุด)
function repeatsSection(rep, state) {
  const which = state.prize === "all" ? "รางวัลที่ 1–5 รวมกัน" : SIX_LABEL[state.prize];
  const ge3 = Object.entries(rep.by_count).filter(([c]) => Number(c) >= 3).reduce((a, [, n]) => a + n, 0);
  const rows = rep.top.map((r, i) => ({ ...r, rank: i + 1 }));
  const tbody = h("tbody");
  const headRow = h("tr");
  const cols = [
    ["rank", "อันดับ", 1, "n"], ["number", "เลข", 1, null], ["count", "ออก (ครั้ง)", -1, "n"],
    [null, "รางวัล", 0, null], [null, "วันที่ออก", 0, null], ["last", "ออกล่าสุด", -1, null],
  ];
  function sortRows() {
    const { key, dir } = state.sort;
    const cmp = {
      rank: (a, b) => a.rank - b.rank,
      number: (a, b) => (a.number < b.number ? -1 : a.number > b.number ? 1 : 0),
      count: (a, b) => a.count - b.count,
      last: (a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : 0),
    }[key];
    return [...rows].sort((a, b) => dir * cmp(a, b) || a.rank - b.rank);
  }
  function paint() {
    headRow.replaceChildren(...cols.map(([key, label, defDir, cls]) => {
      if (!key) return h("th", { scope: "col" }, label);
      const active = state.sort.key === key;
      const ariaSort = active ? (state.sort.dir === 1 ? "ascending" : "descending") : "none";
      return h("th", { scope: "col", class: cls, "aria-sort": ariaSort },
        h("button", {
          type: "button", class: `sort${active ? " on" : ""}`,
          onclick: () => { state.sort = active ? { key, dir: -state.sort.dir } : { key, dir: defDir }; paint(); },
        }, label, h("span", { class: "arrow", "aria-hidden": "true" }, active ? (state.sort.dir === 1 ? "↑" : "↓") : "↕")));
    }));
    tbody.replaceChildren(...sortRows().map((r) => {
      const per = {};
      r.hits.forEach(([, k]) => { per[k] = (per[k] || 0) + 1; });
      return h("tr", null,
        h("td", { class: "n" }, r.rank),
        h("td", { class: "num6" }, RE_SIX.test(r.number) ? r.number : "–"),
        h("td", { class: "n" }, r.count),
        h("td", null, SIX.filter((k) => per[k]).map((k) => `${SIX_SHORT[k]}${per[k] > 1 ? ` ×${per[k]}` : ""}`).join(", ")),
        h("td", { class: "small" }, r.hits.map(([d, k], i) => [i ? ", " : "", h("a", { href: `results.html?d=${d}` }, thShort(d)), ` (${SIX_SHORT[k]})`])),
        h("td", { class: "small nowrap" }, thShort(r.last)));
    }));
  }
  paint();
  return h("section", { class: "card section stack" },
    h("h2", null, `เลข 6 หลักที่ออกซ้ำบ่อยที่สุด ${rows.length < 20 ? rows.length : 20} อันดับ`),
    h("p", { class: "note" }, `${which} · ${rangeLabel(state.range)}${rep.first_draw ? ` (${thShort(rep.first_draw)} – ${thShort(rep.last_draw)}, ${fmt.format(rep.draws)} งวด)` : ""} · ไม่รวมข้างเคียงรางวัลที่ 1 และเลขหน้า/ท้าย`),
    h("div", { class: "stat-row" },
      stat("เลขที่ออกทั้งหมด", fmt.format(rep.numbers_total)),
      stat("เลขที่ออก 2 ครั้งขึ้นไป", fmt.format(rep.repeated)),
      stat("ถ้าสุ่มจริง ควรมีราว", fmt.format(Math.round(rep.expected_repeated)), "จำนวนเลขที่ออกซ้ำ ถ้าทุกเลขมีโอกาสเท่ากัน (ประมาณ)"),
      stat("ออก 3 ครั้งขึ้นไป", `${fmt.format(ge3)} (ควรมีราว ${fmt.format(Math.round(rep.expected_ge3))})`)),
    rows.length
      ? [h("div", { class: "table-wrap" }, h("table", { class: "rep-table" }, h("thead", null, headRow), tbody)),
        h("div", { class: "row" }, csvButton(`lotto-repeats-${state.prize}.csv`, ["อันดับ", "เลข", "ออก (ครั้ง)", "ออกล่าสุด", "วันที่และรางวัล"],
          () => rows.map((r) => [r.rank, r.number, r.count, r.last, r.hits.map(([d, k]) => `${d} ${k}`).join("; ")])))]
      : h("p", { class: "empty" }, "ไม่มีเลขที่ออกซ้ำในช่วงนี้"),
    rows.length && rep.repeated < 20 ? h("p", { class: "note" }, `ในช่วงนี้มีเลขที่ออกซ้ำเพียง ${fmt.format(rep.repeated)} เลข จึงแสดงเท่าที่มี`) : null,
    h("p", { class: "note" }, "วิธีเลือก 20 อันดับ: ออกหลายครั้งก่อน ถ้าเท่ากันเอาเลขที่ออกล่าสุดก่อน แล้วเลขน้อยก่อน · กดหัวตารางเพื่อเรียงใหม่ (อันดับเดิมยังอยู่ในคอลัมน์แรก)"),
    h("p", { class: "note" }, "จำนวนเลขที่ออกซ้ำใกล้กับที่การสุ่มให้ได้ตามปกติ การที่เลขหนึ่งเคยออกซ้ำจึงไม่ได้ทำให้งวดหน้ามีโอกาสมากขึ้น"));
}

const RUN_LABELS = ["1 (ไม่มี)", "2", "3", "4", "5", "6"];
const RUN_EXAMPLE = ["135792", "120584", "345091", "567802", "987650", "123456"];

// ช่วงหลัง ๆ เทียบทั้งหมด แยกทีละหลัก: เทียบสัดส่วนตัวเลขช่วงหลังกับสัดส่วนระยะยาวของหลักเดียวกัน
function positionRecentTable(rec, all) {
  return h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "หลัก"), h("th", null, "ช่วงหลัง ๆ ออกบ่อยสุด"), h("th", { class: "n" }, term("ตัวเลขนอกช่วงปกติ", "range95")),
      h("th", { class: "n" }, term("ค่า p", "p-value")), h("th", null, "ผล"))),
    h("tbody", null, rec.position.map((rp, i) => {
      const ap = all.position[i];
      const aTot = ap.counts.reduce((x, y) => x + y, 0);
      const probs = ap.counts.map((c) => c / aTot);
      const chi = chiExpected(rp.counts, probs);
      const top = rp.counts.indexOf(Math.max(...rp.counts));
      const out = rp.counts.filter((c) => c < rp.range95[0] || c > rp.range95[1]).length;
      return h("tr", null, h("th", null, `ที่ ${i + 1}`),
        h("td", null, h("span", { class: "mono" }, String(top)), ` ${pct(rp.counts[top] / rec.numbers, 1)} (ทั้งหมด ${pct(probs[top], 1)})`),
        h("td", { class: "n" }, `${out} / 10`),
        h("td", { class: "n" }, chi ? fmtP(chi.p) : "–"),
        h("td", null, !chi ? "–" : chi.p >= 0.05 ? h("span", { class: "chip ok" }, "ไม่ต่างชัด") : h("span", { class: "chip warn" }, "ต่างค่อนข้างชัด")));
    }))));
}

function sixBody(six, state, f) {
  if (!f.numbers) return [h("section", { class: "card section" }, h("p", { class: "empty" }, "ไม่มีข้อมูลรางวัลนี้ในช่วงเวลาที่เลือก"))];
  const sample = `จาก ${fmt.format(f.numbers)} เลข ใน ${fmt.format(f.draws)} งวด (${thShort(f.first_draw)} – ${thShort(f.last_draw)})`;
  const digits = [...Array(10).keys()].map(String);
  const parts = [];
  parts.push(h("section", { class: "card section stack" },
    h("div", { class: "stat-row" },
      stat("เลข 6 หลัก", fmt.format(f.numbers)),
      stat("งวด", fmt.format(f.draws)),
      stat("ตัวเลขทุกหลักรวม", fmt.format(f.numbers * 6)),
      stat("ถ้าสุ่ม แต่ละตัวเลขควรออกราว", fmt.format(Math.round(f.digit.expected)))),
    h("p", { class: "note" }, `${rangeLabel(state.range)} · ${sample}`,
      state.prize === "all" ? " · รางวัลที่ 5 มี 100 เลขต่องวด รางวัลที่ 1 มีเลขเดียว ภาพรวมจึงมาจากรางวัลที่ 4–5 เป็นหลัก" : "",
      state.prize === "first" ? " · รางวัลที่ 1 มีงวดละ 1 เลข ข้อมูลน้อย ตัวเลขจึงแกว่งมาก" : "",
      " · ไม่รวมข้างเคียงรางวัลที่ 1 (คือรางวัลที่ 1 ±1) และไม่รวมเลขหน้า/ท้าย 3 ตัว หรือท้าย 2 ตัว (ไม่ใช่เลข 6 หลัก)")));

  parts.push(h("section", { class: "card section stack" },
    h("h2", null, "ตัวเลข 0–9 (ทุกหลักรวมกัน)"),
    barChart({ labels: digits, values: f.digit.counts, expected: digits.map(() => f.digit.expected), band: f.digit.range95, ariaLabel: "ความถี่ตัวเลข 0 ถึง 9" }),
    chiLine(f.digit.chi_square),
    h("p", { class: "note" }, `${sample} · ช่วงปกติ ${fmt.format(f.digit.range95[0])}–${fmt.format(f.digit.range95[1])} ครั้ง`)));

  const posHeat = h("div", { class: "pos-heat", role: "table", "aria-label": "ความถี่ตัวเลขแยกตามหลัก" },
    h("div", { class: "lab" }, "หลัก"), digits.map((d) => h("div", { class: "lab" }, d)));
  f.position.forEach((p, i) => {
    posHeat.append(h("div", { class: "lab" }, `ที่ ${i + 1}`));
    p.counts.forEach((c, d) => {
      const out = c < p.range95[0] || c > p.range95[1];
      const cell = h("div", { class: out ? "out" : null, title: `หลักที่ ${i + 1} เลข ${d}: ${c} ครั้ง (ควรเป็นราว ${fmt1.format(p.expected)})`, "aria-label": `หลักที่ ${i + 1} เลข ${d} ${c} ครั้ง` }, fmt.format(c));
      cell.style.background = zColor(c, p.expected);
      posHeat.append(cell);
    });
  });
  parts.push(h("section", { class: "card section stack" },
    h("h2", null, "ตัวเลขแยกทีละหลัก (หลักที่ 1–6)"),
    h("div", { class: "table-wrap" }, posHeat),
    heatLegend(),
    h("div", { class: "row" }, csvButton(`lotto-six-position-${state.prize}.csv`, ["หลัก", "ตัวเลข", "ออก (ครั้ง)", "ถ้าสุ่มควรเป็น", "ช่วงปกติ ต่ำ", "ช่วงปกติ สูง"],
      () => f.position.flatMap((p, i) => p.counts.map((c, d) => [i + 1, d, c, r4(p.expected), p.range95[0], p.range95[1]])))),
    h("p", { class: "note" }, `แต่ละช่องควรเป็นราว ${fmt1.format(f.position[0].expected)} ครั้ง (ช่วงปกติ ${f.position[0].range95[0]}–${f.position[0].range95[1]}) · มี 60 ช่อง ถ้าสุ่มจริงก็จะมีราว 3 ช่องที่เกินช่วงปกติ · ${sample}`),
    h("details", null, h("summary", null, "ค่า p ของแต่ละหลัก"),
      h("ul", null, f.position.map((p, i) => h("li", null, `หลักที่ ${i + 1}: p = ${p.chi_square ? fmtP(p.chi_square.p) : "–"}`))),
      h("p", { class: "note" }, "ค่า p ยิ่งน้อยยิ่งต่างจากการสุ่ม ถ้าต่ำกว่า 0.05 ถือว่าต่างชัด", gl("p-value")))));

  const pairGrid = h("div", { class: "heatmap static", role: "img", "aria-label": "ความถี่คู่ตัวเลขติดกัน 00–99" });
  f.pair.counts.forEach((c, i) => {
    const out = c < f.pair.range95[0] || c > f.pair.range95[1];
    const cell = h("div", { class: out ? "out" : null, title: `คู่ ${String(i).padStart(2, "0")}: ${c} ครั้ง` },
      h("span", null, String(i).padStart(2, "0")), h("span", { class: "c" }, c));
    cell.style.background = zColor(c, f.pair.expected);
    pairGrid.append(cell);
  });
  parts.push(h("section", { class: "card section stack" },
    h("h2", null, "คู่ตัวเลขที่อยู่ติดกัน 00–99"),
    heatLegend(),
    pairGrid,
    chiLine(f.pair.chi_square),
    h("p", { class: "note" }, `นับคู่หลักที่ 1–2, 2–3, …, 5–6 รวมกัน (เลขละ 5 คู่) · แต่ละคู่ควรเป็นราว ${fmt1.format(f.pair.expected)} ครั้ง · ${sample}`)));

  const labelsN = (n) => [...Array(n).keys()].map(String);
  const dsumLabels = labelsN(55);
  parts.push(h("div", { class: "grid grid-2e section" },
    h("section", { class: "card stack" }, h("h2", null, "มีเลขคี่กี่ตัวในเลข 6 หลัก"),
      barChart({ labels: labelsN(7), values: f.odd.observed, expected: f.odd.expected, ariaLabel: "จำนวนเลขคี่", xTitle: "จำนวนตัวคี่" }),
      chiLine(f.odd.chi_square), distTable("ตัวคี่", labelsN(7), f.odd.observed, f.odd.expected)),
    h("section", { class: "card stack" }, h("h2", null, "มีเลขสูง (5–9) กี่ตัว"),
      barChart({ labels: labelsN(7), values: f.high.observed, expected: f.high.expected, ariaLabel: "จำนวนเลขสูง", xTitle: "จำนวนตัว 5–9" }),
      chiLine(f.high.chi_square), distTable("ตัวสูง", labelsN(7), f.high.observed, f.high.expected)),
    h("section", { class: "card stack" }, h("h2", null, "ผลรวมของ 6 หลัก"),
      barChart({ labels: dsumLabels, values: f.dsum.observed, expected: f.dsum.expected, ariaLabel: "ผลรวมหลัก", xTitle: "ผลรวม", every: 6 }),
      chiLine(f.dsum.chi_square), distTable("ผลรวม", dsumLabels, f.dsum.observed, f.dsum.expected)),
    h("section", { class: "card stack" }, h("h2", null, "ตัวเลขซ้ำกันแบบไหน"),
      barChart({ labels: six.patterns.map((p) => PATTERN_SHORT[p]), values: f.pattern.observed, expected: f.pattern.expected, ariaLabel: "รูปแบบการซ้ำของตัวเลข" }),
      chiLine(f.pattern.chi_square),
      distTable("รูปแบบ", six.patterns.map((p) => `${PATTERN_SHORT[p]} (${p})`), f.pattern.observed, f.pattern.expected)),
    f.run ? h("section", { class: "card stack" }, h("h2", null, "มีตัวเลขเรียงติดกันยาวสุดกี่หลัก", gl("run")),
      barChart({ labels: RUN_LABELS, values: f.run.observed, expected: f.run.expected, ariaLabel: "ความยาวช่วงตัวเลขเรียงติดกัน", xTitle: "ยาวสุด (หลัก)" }),
      chiLine(f.run.chi_square), distTable("ยาวสุด", RUN_LABELS.map((l, i) => RUN_EXAMPLE[i] ? `${l} เช่น ${RUN_EXAMPLE[i]}` : l), f.run.observed, f.run.expected),
      h("p", { class: "note" }, "เรียงติดกัน = ตัวถัดไปมากขึ้นทีละ 1 (เช่น 345) หรือน้อยลงทีละ 1 (เช่น 987) ในทิศเดียวกัน · 9 กับ 0 ไม่นับว่าติดกัน · เลขเรียงครบ 6 หลัก (เช่น 123456) มีแค่ 10 เลขจาก 1 ล้านเลข")) : null));
  parts.push(h("p", { class: "note" }, `กราฟด้านบน: ${sample}`));

  parts.push(h("div", { class: "grid grid-2e section" },
    h("section", { class: "card stack" }, h("h2", null, "3 หลักแรก: มีกี่แบบที่พบ 0, 1, 2, … ครั้ง"), histogram(f.prefix_hist)),
    h("section", { class: "card stack" }, h("h2", null, "3 หลักท้าย: มีกี่แบบที่พบ 0, 1, 2, … ครั้ง"), histogram(f.suffix_hist))));

  const rec = six.data.recent[state.prize];
  const all = six.data.all[state.prize];
  if (rec.numbers && all.numbers) {
    const rTot = rec.numbers * 6, aTot = all.numbers * 6;
    parts.push(h("section", { class: "card section stack" },
      h("h2", null, `ช่วงหลัง ๆ เทียบกับทั้งหมด (${six.data.recent.label})`),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "ตัวเลข"), h("th", { class: "n" }, "ทั้งหมด"), h("th", { class: "n" }, "ช่วงหลัง ๆ"), h("th", { class: "n" }, "ต่าง"), h("th", null, term("ช่วงหลัง ๆ อยู่ในช่วงปกติไหม", "range95")))),
        h("tbody", null, digits.map((d, i) => {
          const a = all.digit.counts[i] / aTot, r = rec.digit.counts[i] / rTot;
          const c = rec.digit.counts[i];
          const ok = c >= rec.digit.range95[0] && c <= rec.digit.range95[1];
          return h("tr", null, h("td", { class: "mono" }, d), h("td", { class: "n" }, pct(a, 2)), h("td", { class: "n" }, pct(r, 2)),
            h("td", { class: "n" }, `${r - a >= 0 ? "+" : ""}${((r - a) * 100).toFixed(2)}`), h("td", null, ok ? h("span", { class: "chip ok" }, "ปกติ") : h("span", { class: "chip warn" }, "นอกช่วง")));
        })))),
      h("h3", null, "แยกทีละหลัก"),
      positionRecentTable(rec, all),
      h("p", { class: "note" }, "ค่า p เทียบตัวเลขช่วงหลัง ๆ ของหลักนั้นกับสัดส่วนระยะยาวของหลักเดียวกัน · มี 6 หลัก ถ้าสุ่มจริงก็อาจมีหลักที่ต่ำกว่า 0.05 โดยบังเอิญ · ตัวเลขที่ออกบ่อยช่วงหลังไม่ได้แปลว่าจะออกบ่อยต่อ", gl("small-sample")),
      h("p", { class: "note" }, `ส่วนนี้เทียบ ${six.data.recent.label} กับทั้งหมดเสมอ ไม่ขึ้นกับช่วงเวลาที่เลือก · ทั้งหมด: ${fmt.format(all.numbers)} เลข (${thShort(all.first_draw)} – ${thShort(all.last_draw)}) · ช่วงหลัง ๆ: ${fmt.format(rec.numbers)} เลข (${thShort(rec.first_draw)} – ${thShort(rec.last_draw)}) · ข้อมูลช่วงสั้นแกว่งมากกว่าระยะยาวเป็นธรรมดา`)));
  }
  return parts;
}

function responsibleBox() {
  return h("aside", { class: "respond section" },
    "สลากเป็นการเสี่ยงโชค ได้คืนเฉลี่ยราว 60% ของราคา ไม่มีสถิติหรือโมเดลใดทำให้ถูกบ่อยขึ้น ",
    "ถ้าการซื้อสลากเริ่มกระทบเงินหรือความสัมพันธ์ ปรึกษาสายด่วนสุขภาพจิต 1323 ได้ฟรี ตลอด 24 ชั่วโมง");
}

// ---------- page: analysis ----------
const ALL_KINDS = [...SIX, ...SMALL];
const kindLabel = (k) => SIX_LABEL[k] || PRIZE_LABEL[k];

// ตอบคำถาม "รีเฟรชแล้วเลขจะเปลี่ยนไหม"
function determinismCard(snap, small) {
  const sha = (x) => (typeof x === "string" && /^[0-9a-f]{64}$/.test(x) ? `${x.slice(0, 12)}…` : "–");
  return h("section", { class: "card section stack" },
    h("h2", null, "รีเฟรชแล้วเลขจะเปลี่ยนไหม?"),
    h("p", null, h("strong", null, "ไม่เปลี่ยน"), " — กดรีเฟรชกี่ครั้งก็ได้เลขชุดเดิม เพราะ"),
    h("ul", { class: "plain-list" },
      h("li", null, "เลขของแต่ละงวดคำนวณครั้งเดียว แล้วล็อกเก็บเป็น \"บันทึกการทำนาย\"", gl("snapshot"), " ก่อนออกรางวัล ไม่มีการแก้ภายหลัง และมีรหัสตรวจสอบ (sha256)", gl("sha256"), " กำกับ ถ้ามีใครแก้ ระบบจะรู้และไม่นับผล"),
      h("li", null, "การจัดอันดับไม่มีการสุ่ม ข้อมูลชุดเดิมคำนวณกี่ครั้งก็ได้อันดับเดิม ถ้าคะแนนเท่ากัน เลขที่น้อยกว่าขึ้นก่อน"),
      h("li", null, "เลขจะเปลี่ยนเมื่อมีผลงวดใหม่เข้ามาเท่านั้น ตอนนั้นระบบจะทำบันทึกใหม่สำหรับงวดถัดไป ส่วนบันทึกของงวดก่อน ๆ ยังอยู่ให้ย้อนดูได้ในหน้า \"ประวัติทำนาย\"")),
    h("p", { class: "note" }, `บันทึกนี้ (เลข 6 หลัก) สร้างเมื่อ ${thDateTime(snap.created_at)} · รหัสตรวจสอบ ${sha(snap.content_sha256)}`,
      small ? ` · เลขท้าย/หน้า สร้างเมื่อ ${thDateTime(small.created_at)}${small.source === "addon" ? " (บันทึกเสริม ทำทีหลังแต่ก่อนออกรางวัล)" : ""} · รหัสตรวจสอบ ${sha(small.content_sha256)}` : ""));
}

// รายละเอียดทางเทคนิคของบันทึก: ใช้ยืนยันว่าบันทึกสร้างจากข้อมูล/การตั้งค่า/โค้ดชุดไหน
function snapshotDetails(snap, small) {
  const hex = (x) => (typeof x === "string" && /^[0-9a-f]{64}$/.test(x) ? x : "–");
  const short = (x) => { const v = hex(x); return v === "–" ? v : `${v.slice(0, 16)}…`; };
  const hashRow = (label, x) => [h("dt", null, label), h("dd", { class: "mono small", title: hex(x) }, short(x))];
  const tun = snap.tuning;
  return h("details", { class: "snap-details" },
    h("summary", null, "รายละเอียดของบันทึกนี้ (รุ่นโมเดล, รหัสข้อมูล, น้ำหนัก)"),
    h("dl", { class: "kv" },
      h("dt", null, "รุ่นโมเดลเลข 6 หลัก"), h("dd", { class: "mono" }, snap.model_version || "–"),
      small ? [h("dt", null, "รุ่นโมเดลเลขท้าย/หน้า"), h("dd", { class: "mono" }, small.model_version || "–")] : null,
      h("dt", null, "ข้อมูลที่ใช้"), h("dd", null, `${fmt.format(snap.training_draw_count)} งวด ถึง ${thShort(snap.training_data_through)}`),
      hashRow("รหัสไฟล์ข้อมูล (CSV)", snap.csv_sha256),
      hashRow("รหัสการตั้งค่า", snap.config_sha),
      hashRow("รหัสโค้ด", snap.code_sha),
      [h("dt", null, "รหัสตรวจสอบบันทึก"), h("dd", { class: "mono small", title: hex(snap.content_sha256) }, short(snap.content_sha256), gl("sha256"))],
      small ? hashRow("รหัสตรวจสอบ (เลขท้าย/หน้า)", small.content_sha256) : null,
      h("dt", null, "น้ำหนักที่ใช้", gl("weight-sets")), h("dd", null, SIX.map((k) => {
        const w = snap.hybrid_weights[k];
        return `${SIX_LABEL[k].replace("รางวัลที่ ", "ที่ ")}: ชุด ${w.experiment} (${Math.round(w.global * 100)}:${Math.round(w.prize_specific * 100)})`;
      }).join(" · ")),
      h("dt", null, "เลือกน้ำหนักจาก"), h("dd", null, tun && tun.validation ? `ช่วงฝึก ${thShort(tun.validation.from)} – ${thShort(tun.validation.to)} (${fmt.format(tun.validation.draws)} งวด)` : "ค่าเริ่มต้น"),
      h("dt", null, "จำนวนเลขที่ใช้ตรวจผล"), h("dd", null, SIX.map((k) => `${SIX_LABEL[k].replace("รางวัลที่ ", "ที่ ")} = ${snap.candidate_counts[k]}`).join(", ")
        + (small ? ` · ${SMALL.map((k) => `${PRIZE_LABEL[k]} ${small.candidate_counts[k]}`).join(", ")}` : ""))),
    h("p", { class: "note" }, "รหัสเหล่านี้คำนวณจากเนื้อหาไฟล์ ถ้าไฟล์ข้อมูล การตั้งค่า หรือโค้ดเปลี่ยน รหัสจะเปลี่ยน ใช้เทียบกับไฟล์ใน GitHub ได้ · บันทึกของงวดก่อน ๆ ใช้ข้อมูลน้อยกว่า รหัสข้อมูลจึงต่างจากปัจจุบันเป็นเรื่องปกติ"));
}

async function pageAnalysis() {
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab") === "backtest" ? "backtest" : "rank";
  const [pidx, bt, bts, ml] = await Promise.all([optionalData("predictions/index.json"), optionalData("analysis/backtest.json"), optionalData("analysis/backtest_small.json"),
    tab === "backtest" ? optionalData("analysis/ml_study.json") : null]);
  const tabs = h("div", { class: "seg tabs", role: "group", "aria-label": "เลือกส่วน" },
    h("button", { type: "button", "aria-pressed": String(tab === "rank"), onclick: () => { location.search = ""; } }, "อันดับเลขงวดถัดไป"),
    h("button", { type: "button", "aria-pressed": String(tab === "backtest"), onclick: () => { location.search = "?tab=backtest"; } }, "ทดสอบย้อนหลัง"),
    h("a", { href: "history.html", class: "small" }, "ประวัติการทำนาย →"));
  const warn = h("div", { class: "callout warn" },
    h("strong", null, "คะแนนนี้ไม่ใช่โอกาสถูกรางวัล"), gl("hybrid-score"), h("br"),
    "อันดับมาจากการให้คะแนนตามสถิติในอดีต คะแนน 100 แปลว่าสูงสุดในบรรดาเลขทั้งหมดตามวิธีนี้ ไม่ได้แปลว่ามีโอกาส 100% ",
    "เมื่อลองย้อนหลังหลายร้อยงวด วิธีนี้เลือกเลขได้ไม่ดีกว่าการสุ่ม (ดูแท็บ \"ทดสอบย้อนหลัง\")");
  const head = pageHead("วิเคราะห์เลข", "จัดอันดับเลขของงวดถัดไปจากสถิติที่ผ่านมา: เลข 6 หลักรางวัลที่ 1–5, เลขท้าย 2 ตัว, เลขท้าย 3 ตัว และเลขหน้า 3 ตัว");
  if (tab === "backtest") {
    render(head, h("section", { class: "card stack" }, tabs), backtestView(bt, params), smallBacktestView(bts), mlStudyView(ml), responsibleBox());
    return;
  }
  if (!pidx || !pidx.snapshots.length) {
    render(head, h("section", { class: "card stack" }, tabs, warn),
      h("section", { class: "card section" }, h("p", { class: "empty" }, "ยังไม่มีบันทึกการทำนาย ระบบจะสร้างให้อัตโนมัติหลังดึงผลงวดใหม่")));
    return;
  }
  const dates = pidx.snapshots.map((x) => x.target_draw_date);
  let date = params.get("d");
  if (!dates.includes(date)) date = dates[0];
  const pd = await getData(`predictions/${date}.json`);
  const snap = pd.snapshot;
  const ev = pd.evaluation;
  const small = pd.small;
  const state = { prize: ALL_KINDS.includes(params.get("p")) ? params.get("p") : "first" };
  const countOf = (k) => (SIX.includes(k) ? snap.candidate_counts[k] : small ? small.candidate_counts[k] : 5);
  state.count = countOf(state.prize);
  const snapSel = h("select", { id: "snap", "aria-label": "เลือกงวด" },
    pidx.snapshots.map((x) => h("option", { value: x.target_draw_date, selected: x.target_draw_date === date },
      `งวด ${thShort(x.target_draw_date)}${x.status === "pending" ? "" : ` · ${STATUS[x.status].label}`}`)));
  snapSel.addEventListener("change", () => { location.search = `?d=${encodeURIComponent(snapSel.value)}`; });
  const metaCard = h("section", { class: "card section stack" },
    h("div", { class: "row" }, h("label", { for: "snap", class: "small muted" }, "งวดที่ทำนาย"), snapSel, h("span", { class: "spacer" }), statusChip(ev ? ev.status : "pending")),
    h("dl", { class: "kv" },
      h("dt", null, "งวดที่ทำนาย"), h("dd", null, `${thShort(snap.target_draw_date)}${snap.target_is_estimate ? " (วันที่คาดไว้)" : ""}`),
      h("dt", null, "ใช้ข้อมูล"), h("dd", null, `${fmt.format(snap.training_draw_count)} งวด ถึง ${thShort(snap.training_data_through)}`),
      h("dt", null, "บันทึกเมื่อ"), h("dd", null, `${thDateTime(snap.created_at)} (ก่อนออกรางวัล ไม่แก้ไขภายหลัง)`),
      h("dt", null, "รุ่นของวิธีคิด"), h("dd", { class: "mono" }, small ? `${snap.model_version} · ${small.model_version}` : snap.model_version),
      ev && ev.status === "evaluated" ? [h("dt", null, "ผล"), h("dd", null, `เลข 6 หลักถูกตรง ${ev.exact_hits_total} เลข (ถ้าสุ่มควรถูกราว ${ev.random_expected_total.toFixed(4)}) · `, h("a", { href: `history.html?d=${snap.target_draw_date}` }, "ดูรายละเอียด"))] : null,
      ev && ev.status !== "evaluated" ? [h("dt", null, "ผล"), h("dd", null, ev.reason || "")] : null),
    snapshotDetails(snap, small));
  const segSix = h("div", { class: "seg", role: "group", "aria-label": "เลือกรางวัลเลข 6 หลัก" });
  const segSmall = h("div", { class: "seg", role: "group", "aria-label": "เลือกเลขท้าย/หน้า" });
  const countSel = h("select", { id: "count", "aria-label": "จำนวนเลขที่แสดง" });
  const countNote = h("span", { class: "note" });
  const body = h("div");
  function draw() {
    const btn = (k) => h("button", {
      type: "button", "aria-pressed": String(state.prize === k),
      onclick: () => { state.prize = k; state.count = countOf(k); draw(); },
    }, kindLabel(k));
    segSix.replaceChildren(...SIX.map(btn));
    segSmall.replaceChildren(...SMALL.map(btn));
    const isSmall = SMALL.includes(state.prize);
    const rows = isSmall ? (small ? small.predictions[state.prize].rows : []) : snap.predictions[state.prize];
    countSel.replaceChildren(...rows.map((_, i) => h("option", { value: i + 1, selected: i + 1 === state.count }, `${i + 1} เลข`)));
    countSel.disabled = !rows.length;
    countNote.textContent = isSmall
      ? (small ? `จำนวนที่ใช้ตรวจผลจริง: ${SMALL.map((k) => `${PRIZE_LABEL[k]} ${small.candidate_counts[k]}`).join(", ")}` : "")
      : `จำนวนที่ใช้ตรวจผลจริง: ${SIX.map((k) => `${SIX_LABEL[k].replace("รางวัลที่ ", "ที่ ")} = ${snap.candidate_counts[k]}`).join(", ")}`;
    body.replaceChildren(...(isSmall ? smallCandidateView(small, state, snap) : candidateView(snap, ev, state)));
    const p = new URLSearchParams(location.search);
    if (state.prize === "first") p.delete("p"); else p.set("p", state.prize);
    history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
  }
  countSel.addEventListener("change", () => { state.count = Number(countSel.value); draw(); });
  render(head, h("section", { class: "card stack" }, tabs, warn), metaCard,
    h("section", { class: "card section stack" },
      h("div", { class: "small muted" }, "เลข 6 หลัก"), segSix,
      h("div", { class: "small muted" }, "เลขท้าย / เลขหน้า"), segSmall,
      h("div", { class: "row" }, h("label", { for: "count", class: "small muted" }, "แสดง"), countSel, countNote)),
    body, determinismCard(snap, small), responsibleBox());
  draw();
}

function scoreCell(v) {
  const b = h("span");
  b.style.width = `${Math.max(0, Math.min(100, v))}%`;
  return h("td", { class: "n" }, fmt1.format(v), h("span", { class: "scorebar", "aria-hidden": "true" }, b));
}

function candidateView(snap, ev, state) {
  const k = state.prize;
  const rows = snap.predictions[k].slice(0, state.count);
  const official = snap.candidate_counts[k];
  const w = snap.hybrid_weights[k];
  const res = ev && ev.status === "evaluated" ? ev.results[k] : null;
  const hitSet = new Set(res ? (res.hits_in_top_n || []) : []);
  const table = h("div", { class: "table-wrap" }, h("table", { class: "cand-table" },
    h("thead", null, h("tr", null, h("th", { class: "n" }, "อันดับ"), h("th", null, "เลข"), h("th", { class: "n" }, term("คะแนนรวม", "hybrid-score")), h("th", { class: "n" }, term("ดูทุกรางวัล", "global-score")), h("th", { class: "n" }, term("ดูรางวัลนี้", "prize-score")), h("th", null, "เหตุผลหลัก"))),
    h("tbody", null, rows.map((r) => h("tr", { class: r.rank > official ? "extra" : null },
      h("td", { class: "n" }, r.rank),
      h("td", { class: "num6" }, RE_SIX.test(r.number) ? r.number : "–", hitSet.has(r.number) ? h("span", { class: "chip ok" }, " ถูก") : null),
      scoreCell(r.hybrid_score), scoreCell(r.global_score), scoreCell(r.prize_score),
      h("td", { class: "why" }, h("ul", { class: "contrib" }, r.contributions.map((c) => h("li", null,
        h("b", null, GROUP_LABEL[c.group]), ` (${SCOPE_LABEL[c.scope]}) — ${c.detail}`)))))))));
  const alt = snap.alternatives[k];
  const cfgOrder = ["global", "prize", ...Object.keys(snap.config.hybrid_experiments).sort()];
  const winners = res ? new Set(res.exact_hits) : new Set();
  const altTable = h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "ชุดน้ำหนัก"), h("th", null, `${official} อันดับแรก`), res ? h("th", { class: "n" }, "ถูก") : null)),
    h("tbody", null, cfgOrder.filter((c) => alt[c]).map((c) => h("tr", { class: c === w.experiment ? "tuned" : null },
      h("th", null, cfgLabel(c, c === "global" ? 1 : c === "prize" ? 0 : snap.config.hybrid_experiments[c]), c === w.experiment ? h("div", { class: "note" }, "ใช้ชุดนี้") : null),
      h("td", null, h("div", { class: "num-list" }, alt[c].slice(0, official).map((n) => h("span", { class: winners.has(n) ? "hit" : null }, n)))),
      res ? h("td", { class: "n" }, res.alternatives[c] ?? "–") : null)))));
  return [
    h("section", { class: "card section stack" },
      h("h2", null, `${SIX_LABEL[k]}: ${state.count} อันดับแรก`),
      h("p", { class: "note" }, `คะแนนรวม = ${Math.round(w.global * 100)}% จากการดูทุกรางวัลรวมกัน + ${Math.round(w.prize_specific * 100)}% จากการดูเฉพาะ${SIX_LABEL[k]} (ชุด ${w.experiment}${snap.tuning && snap.tuning.source === "backtest validation" ? ` เลือกจากผลทดสอบย้อนหลังช่วง ${thShort(snap.tuning.validation.from)} – ${thShort(snap.tuning.validation.to)}` : ""}) · คะแนน 0–100 เทียบกับเลขทั้ง 1 ล้านเลข (100 = สูงสุด)`),
      table,
      state.count > official ? h("p", { class: "note" }, `แถวสีจาง = เกินจำนวนที่ใช้ตรวจผลจริง (${official} เลข)`) : null,
      h("div", { class: "row" }, csvButton(`lotto-rank-${snap.target_draw_date}-${k}.csv`, ["อันดับ", "เลข", "คะแนนรวม", "ดูทุกรางวัล", "ดูรางวัลนี้", "เหตุผลหลัก"],
        () => snap.predictions[k].map((r) => [r.rank, r.number, r.hybrid_score, r.global_score, r.prize_score,
          r.contributions.map((c) => `${GROUP_LABEL[c.group]} (${SCOPE_LABEL[c.scope]}) ${c.detail}`).join("; ")])),
        h("span", { class: "note" }, `${snap.predictions[k].length} อันดับที่บันทึกไว้`)),
      h("p", { class: "note" }, `"ดูทุกรางวัล" ใช้เลขรางวัลที่ 1–5 ทั้งหมด ${fmt.format(Object.values(snap.training_numbers).reduce((a, b) => a + b, 0))} เลข (และใช้เลขหน้า/ท้ายช่วยดู 3 หลักแรก/ท้าย) · "ดูรางวัลนี้" ใช้เฉพาะ ${fmt.format(snap.training_numbers[k])} เลขของ${SIX_LABEL[k]}`)),
    h("section", { class: "card section stack" },
      h("h2", null, "ถ้าใช้น้ำหนักแบบอื่น จะได้เลขอะไร", gl("weight-sets")),
      h("p", { class: "note" }, "ข้อมูลเดียวกัน แต่ให้น้ำหนักระหว่าง \"ทุกรางวัล\" กับ \"รางวัลนี้\" ต่างกัน แถวที่ไฮไลต์คือชุดที่ใช้จริง"),
      altTable),
  ];
}

function smallCandidateView(small, state, snap) {
  const k = state.prize;
  if (!small) {
    return [h("section", { class: "card section stack" },
      h("h2", null, PRIZE_LABEL[k]),
      h("p", { class: "empty" }, `บันทึกงวด ${thShort(snap.target_draw_date)} ยังไม่มีอันดับเลขท้าย/เลขหน้า (เริ่มมีตั้งแต่งวด 16 พ.ย. 2569) · ระบบไม่สร้างย้อนหลังหลังออกรางวัลแล้ว`))];
  }
  const block = small.predictions[k];
  const official = small.candidate_counts[k];
  const res = small.evaluation && small.evaluation.status === "evaluated" && small.evaluation.results ? small.evaluation.results[k] : null;
  const winners = new Set(res && res.available ? res.winners : []);
  const rows = block.rows.slice(0, state.count);
  const w = small.feature_weights || {};
  const space = block.space;
  return [h("section", { class: "card section stack" },
    h("h2", null, `${PRIZE_LABEL[k]}: ${state.count} อันดับแรก`),
    res && res.available ? h("div", { class: res.hits ? "callout ok" : "callout" },
      `ผลจริง: ${res.winners.join(", ")} · ${res.hits ? `อยู่ใน ${official} อันดับแรก ${res.hits} เลข` : `ไม่อยู่ใน ${official} อันดับแรก`} (ถ้าสุ่มควรถูกราว ${fmt2.format(res.random_expected)})`, gl("exact-hit")) : null,
    h("div", { class: "table-wrap" }, h("table", { class: "cand-table" },
      h("thead", null, h("tr", null, h("th", { class: "n" }, "อันดับ"), h("th", null, "เลข"), h("th", { class: "n" }, "คะแนน"), h("th", { class: "n" }, "เคยออก"), h("th", null, "เหตุผลหลัก"))),
      h("tbody", null, rows.map((r) => h("tr", { class: r.rank > official ? "extra" : null },
        h("td", { class: "n" }, r.rank),
        h("td", { class: "num6" }, RE_SMALL[k].test(r.number) ? r.number : "–", winners.has(r.number) ? h("span", { class: "chip ok" }, " ถูก") : null),
        scoreCell(r.score),
        h("td", { class: "n" }, `${fmt.format(r.times_drawn)} ครั้ง`),
        h("td", { class: "why" }, h("ul", { class: "contrib" }, r.contributions.map((c) => h("li", null,
          h("b", null, SMALL_GROUP_LABEL[c.group] || c.group), ` — ${c.detail}`))))))))),
    state.count > official ? h("p", { class: "note" }, `แถวสีจาง = เกินจำนวนที่ใช้ตรวจผลจริง (${official} เลข)`) : null,
    h("div", { class: "row" }, csvButton(`lotto-rank-${snap.target_draw_date}-${k}.csv`, ["อันดับ", "เลข", "คะแนน", "เคยออก (ครั้ง)", "เหตุผลหลัก"],
      () => block.rows.map((r) => [r.rank, r.number, r.score, r.times_drawn, r.contributions.map((c) => `${SMALL_GROUP_LABEL[c.group] || c.group} ${c.detail}`).join("; ")]))),
    h("p", { class: "note" }, `จัดอันดับเลข ${space === 100 ? "00–99 ทั้ง 100" : "000–999 ทั้ง 1,000"} เลข จาก ${fmt.format(block.training_draws)} งวดที่มี${PRIZE_LABEL[k]} (${thShort(block.first_draw)} – ${thShort(block.last_draw)}) · คะแนนรวมจาก: ตัวเลขแต่ละหลัก ${pct(w.position || 0, 0)}, ตัวเลข 0–9 รวมทุกหลัก ${pct(w.digit || 0, 0)}, เลขนี้เคยออกบ่อย ${pct(w.number || 0, 0)}, ช่วง ${small.recent_draws || 24} งวดหลัง ${pct(w.recent || 0, 0)} · คะแนน 100 = สูงสุดใน ${fmt.format(space)} เลข`),
    h("p", { class: "note" }, `ถ้าสุ่มเลือก ${official} เลข โอกาสที่เลขที่ออกจะอยู่ในนั้นคือ ${official} ใน ${fmt.format(space)} ต่อเลขที่ออก และวิธีนี้ทำได้ไม่ดีกว่านั้นเมื่อทดสอบย้อนหลัง`))];
}

function backtestView(bt, params) {
  if (!bt) return h("section", { class: "card section" }, h("p", { class: "empty" }, "ยังไม่มีผลทดสอบย้อนหลัง (รัน python scripts/lotto_predict.py backtest)"));
  const prize = SIX.includes(params.get("p")) ? params.get("p") : "first";
  const e = bt.evaluation;
  const ov = bt.overall.tuned.holdout;
  const flagged = SIX.flatMap((k) => bt.configs.map((c) => [k, c.id, bt.results[k][c.id].holdout])).filter(([, , r]) => r.p_two_sided !== undefined && r.p_two_sided * SIX.length * bt.configs.length < 0.05);
  const cfgW = Object.fromEntries(bt.configs.map((c) => [c.id, c.w_global]));
  const seg = h("div", { class: "seg", role: "group", "aria-label": "เลือกรางวัล" },
    SIX.map((k) => h("button", { type: "button", "aria-pressed": String(k === prize), onclick: () => { location.search = `?tab=backtest&p=${k}`; } }, SIX_LABEL[k])));
  const R = bt.results[prize];
  const rnd = bt.random[prize];
  const chosen = bt.tuning.chosen[prize];
  const rowsIds = [...bt.configs.map((c) => c.id)];
  const table = h("div", { class: "table-wrap" }, h("table", { class: "tight" },
    h("thead", null, h("tr", null, h("th", null, "ชุด"), h("th", { class: "n" }, term("ช่วงฝึก", "validation-holdout")), h("th", { class: "n" }, term("ช่วงทดสอบจริง", "validation-holdout")), h("th", null, term("ช่วงคลาดเคลื่อน (ทดสอบจริง)", "ci")), h("th", { class: "n" }, term("ค่า p", "p-value")), h("th", { class: "n" }, term("ถูกตรง (ทดสอบจริง)", "exact-hit")),
      h("th", { class: "n" }, "งวดที่ถูก ≥ 1 เลข"), h("th", { class: "n" }, "ถูกต่อ 100 งวด"))),
    h("tbody", null, rowsIds.map((id) => {
      const v = R[id].validation, hd = R[id].holdout;
      return h("tr", { class: id === chosen ? "tuned" : null },
        h("th", null, cfgLabel(id, cfgW[id]), id === chosen ? h("div", { class: "note" }, "ชุดที่เลือกใช้") : null),
        h("td", { class: "n" }, pctile(v.mean_pct)), h("td", { class: "n" }, pctile(hd.mean_pct)),
        h("td", null, hd.mean_pct_ci ? `${pctile(hd.mean_pct_ci[0])} – ${pctile(hd.mean_pct_ci[1])}` : "–"),
        h("td", { class: "n" }, hd.p_two_sided !== undefined ? fmtP(hd.p_two_sided) : "–"),
        h("td", { class: "n" }, `${hd.hits} / ${hd.draws} งวด`),
        h("td", { class: "n" }, hd.draws_with_hit ?? "–"),
        h("td", { class: "n" }, hd.draws ? fmt2.format(hd.hits_per_100 ?? (hd.hits / hd.draws) * 100) : "–"));
    }))));
  const st = bt.stability;
  const stabTable = h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "ชุด"), st.blocks.map((b) => h("th", { class: "n" }, `${thShort(b.from)} – ${thShort(b.to)}`)))),
    h("tbody", null, [...rowsIds, "tuned"].map((id) => h("tr", { class: id === "tuned" ? "tuned" : null },
      h("th", null, id === "tuned" ? `ชุดที่เลือกใช้ (${chosen})` : cfgLabel(id, cfgW[id])),
      st[prize][id].map((b) => h("td", { class: "n" }, pctile(b.mean_pct), b.hits ? h("span", { class: "chip ok" }, ` ${b.hits}`) : null)))))));
  const tl = bt.timeline[prize];
  const win = 24;
  const roll = tl.mean_pct.map((_, i) => {
    if (i + 1 < win) return null;
    const sl = tl.mean_pct.slice(i + 1 - win, i + 1).filter((v) => v !== null);
    return sl.reduce((a, b) => a + b, 0) / sl.length;
  });
  const se = Math.sqrt(1 / 12 / (win * Math.max(1, tl.numbers_per_draw)));
  return h("div", null,
    h("section", { class: "card section stack" },
      h("h2", null, "ทดสอบย้อนหลัง: ถ้าใช้วิธีนี้ในอดีต จะเป็นอย่างไร", gl("backtest")),
      h("p", null, "ก่อนแต่ละงวดในอดีต ให้ระบบใช้เฉพาะข้อมูลก่อนหน้างวดนั้น (ไม่แอบดูอนาคต) จัดอันดับเลข แล้วดูว่าเลขที่ออกจริงอยู่อันดับไหน และอยู่ในกลุ่มเลขที่เลือกไหม เทียบกับการสุ่มเลือก"),
      !bt.fresh ? h("div", { class: "callout warn" }, "ผลนี้คำนวณจากข้อมูล/การตั้งค่า/โค้ดชุดเก่า (", bt.stale_reasons.join(", "), ") จะอัปเดตในรอบถัดไปของ GitHub Actions") : null,
      h("div", { class: flagged.length ? "callout" : "callout ok" },
        h("strong", null, flagged.length ? `มี ${flagged.length} ชุดที่ต่างจากการสุ่ม (หลังปรับตามจำนวนการทดสอบ)` : "ไม่มีชุดใดดีกว่าการสุ่มอย่างชัดเจนในช่วงทดสอบจริง"), flagged.length ? gl("bonferroni") : gl("validation-holdout"), h("br"),
        `ช่วงทดสอบจริง ${e.holdout ? `${thShort(e.holdout.from)} – ${thShort(e.holdout.to)} (${fmt.format(e.holdout.draws)} งวด)` : "–"}: ชุดที่เลือกใช้ถูกตรง 6 หลักรวม ${ov.hits} เลข ถ้าสุ่มเลือกควรถูกราว ${fmt2.format(ov.expected)} (ช่วงปกติ ${ov.lo95}–${ov.hi95})`),
      h("dl", { class: "kv" },
        h("dt", null, "งวดที่ทดสอบ"), h("dd", null, `${fmt.format(e.draws)} งวด (${thShort(e.first_draw)} – ${thShort(e.last_draw)})`),
        h("dt", null, term("ช่วงฝึก", "validation-holdout")), h("dd", null, e.validation ? `${thShort(e.validation.from)} – ${thShort(e.validation.to)} (${fmt.format(e.validation.draws)} งวด) ใช้เลือกชุดน้ำหนัก` : "–"),
        h("dt", null, term("ช่วงทดสอบจริง", "validation-holdout")), h("dd", null, e.holdout ? `${thShort(e.holdout.from)} – ${thShort(e.holdout.to)} (${fmt.format(e.holdout.draws)} งวด) ไม่ได้ใช้เลือกค่าใด ๆ จึงเป็นการวัดผลที่ยุติธรรม` : "–"),
        h("dt", null, "ข้อมูลถึง"), h("dd", null, `${thShort(bt.data_through)} · คำนวณเมื่อ ${thDateTime(bt.backtest_generated_at)}`))),
    h("section", { class: "card section stack" },
      seg,
      h("h2", null, `${SIX_LABEL[prize]}: เลขที่ออกจริงอยู่อันดับไหน`, gl("mean-rank")),
      h("p", { class: "note" }, `ตัวเลขในตารางคือ เลขที่ออกจริงอยู่ตรงไหนในอันดับของวิธีนี้ เฉลี่ยกี่ % จากบนสุด (0% = อันดับ 1, 100% = อันดับสุดท้ายจาก 1 ล้านเลข) ถ้าวิธีนี้ไม่ช่วยอะไรเลยจะได้ราว 50% เหมือนการสุ่ม · ค่า p ยิ่งน้อยยิ่งต่างจากการสุ่ม (ต่ำกว่า 0.05 = ต่างชัด) · ประมาณจากเลขตัวอย่าง ${fmt.format(e.subsample)} เลข`),
      table,
      h("p", { class: "note" }, `ถูกตรง 6 หลัก = เลขที่ออกจริงอยู่ใน ${bt.candidate_counts[prize]} อันดับแรกของรางวัลเดียวกัน · ถ้าสุ่มเลือก ${bt.candidate_counts[prize]} เลขต่องวด ควรถูกราว ${rnd.holdout.expected.toFixed(3)} ครั้งในช่วงทดสอบจริง (ช่วงปกติ ${rnd.holdout.lo95}–${rnd.holdout.hi95}) หรือราว ${fmt2.format(R[chosen].holdout.draws ? (rnd.holdout.expected / R[chosen].holdout.draws) * 100 : 0)} ครั้งต่อ 100 งวด`),
      h("div", { class: "row" }, csvButton("lotto-backtest-six.csv", ["รางวัล", "ชุด", "ช่วง", "งวด", "ถูกตรง", "งวดที่ถูก >= 1", "ถูกต่อ 100 งวด", "ถ้าสุ่มควรถูก", "อันดับเฉลี่ย", "ค่า p"],
        () => SIX.flatMap((k) => [...bt.configs.map((c) => c.id), "tuned"].filter((id) => bt.results[k][id]).flatMap((id) => ["validation", "holdout", "all"].map((sp) => {
          const x = bt.results[k][id][sp];
          return [k, id, sp, x.draws, x.hits, x.draws_with_hit, r4(x.hits_per_100), r4(bt.random[k][sp].expected), r4(x.mean_pct), r4(x.p_two_sided)];
        })))))),
    h("section", { class: "card section stack" },
      h("h2", null, "ผลเปลี่ยนไปตามเวลาไหม"),
      lineChart({ values: roll, labels: bt.timeline.dates.map((d) => String(Number(d.slice(0, 4)) + 543)), ref: 0.5, band: [0.5 - 1.96 * se, 0.5 + 1.96 * se], ariaLabel: "อันดับเฉลี่ยของเลขที่ออกจริง เฉลี่ยทีละ 24 งวด", yFmt: (v) => `${(v * 100).toFixed(1)}%` }),
      h("p", { class: "note" }, `เส้น = อันดับเฉลี่ยของเลขที่ออกจริง (เฉลี่ยทีละ ${win} งวด) ของชุดที่เลือกใช้ (${tl.config}) · เส้นประ = 50% (เท่ากับสุ่ม) · แถบเขียว = ช่วงที่การสุ่มให้ได้ตามปกติ`),
      h("h3", null, "แยกเป็นช่วงเวลา"), stabTable,
      h("p", { class: "note" }, "ถ้าวิธีนี้ช่วยได้จริง ควรต่ำกว่า 50% ทุกช่วงอย่างสม่ำเสมอ ไม่ใช่เฉพาะบางช่วง")),
    yearRangeCard(bt, params));
}

// ผลทดสอบย้อนหลังของชุดที่เลือกใช้ ในช่วงปีที่เลือกเอง (คำนวณจาก timeline รายงวดใน backtest.json)
function backtestRangeStats(bt, y1, y2) {
  const idx = bt.timeline.dates.map((d, i) => [Number(d.slice(0, 4)), i]).filter(([y]) => y >= y1 && y <= y2).map(([, i]) => i);
  return Object.fromEntries(SIX.map((k) => {
    const tl = bt.timeline[k];
    const K = bt.candidate_counts[k];
    const npd = Math.max(1, tl.numbers_per_draw);
    const used = idx.filter((i) => tl.mean_pct[i] !== null && tl.mean_pct[i] !== undefined);
    const n = used.length;
    const hits = used.reduce((a, i) => a + (tl.hits[i] || 0), 0);
    const withHit = used.filter((i) => (tl.hits[i] || 0) > 0).length;
    const mean = n ? used.reduce((a, i) => a + tl.mean_pct[i], 0) / n : null;
    const se = n ? Math.sqrt(1 / 12 / (n * npd)) : null;
    const expected = (n * npd * K) / 1000000;
    const band = n ? binomInterval(n * npd, K / 1000000) : [0, 0];
    return [k, { config: tl.config, draws: n, hits, withHit, mean, lo: n ? 0.5 - 1.96 * se : null, hi: n ? 0.5 + 1.96 * se : null, expected, band }];
  }));
}

function yearRangeCard(bt, params) {
  const years = [...new Set(bt.timeline.dates.map((d) => Number(d.slice(0, 4))))].sort((a, b) => a - b);
  if (!years.length) return null;
  const pick = (v, dflt) => (years.includes(Number(v)) ? Number(v) : dflt);
  const state = { y1: pick(params.get("y1"), years[0]), y2: pick(params.get("y2"), years[years.length - 1]) };
  const opt = (sel) => years.map((y) => h("option", { value: y, selected: y === sel }, String(y + 543)));
  const s1 = h("select", { id: "bt-y1", "aria-label": "ตั้งแต่ปี" }, opt(state.y1));
  const s2 = h("select", { id: "bt-y2", "aria-label": "ถึงปี" }, opt(state.y2));
  const out = h("div", { class: "stack" });
  function draw() {
    if (state.y1 > state.y2) [state.y1, state.y2] = [state.y2, state.y1];
    s1.value = String(state.y1);
    s2.value = String(state.y2);
    const st = backtestRangeStats(bt, state.y1, state.y2);
    const rows = SIX.map((k) => [k, st[k]]);
    out.replaceChildren(
      h("div", { class: "table-wrap" }, h("table", { class: "tight" },
        h("thead", null, h("tr", null, h("th", null, "รางวัล"), h("th", { class: "n" }, "งวด"), h("th", { class: "n" }, term("ถูกตรง", "exact-hit")), h("th", { class: "n" }, "งวดที่ถูก ≥ 1"),
          h("th", { class: "n" }, term("ถ้าสุ่มควรถูก", "expected")), h("th", { class: "n" }, term("อันดับเฉลี่ย", "mean-rank")), h("th", null, term("ช่วงปกติ", "range95")), h("th", null, "ผล"))),
        h("tbody", null, rows.map(([k, x]) => {
          const ok = x.mean === null || (x.mean >= x.lo && x.mean <= x.hi);
          return h("tr", null, h("th", null, SIX_LABEL[k].replace("รางวัลที่ ", "ที่ "), h("div", { class: "note" }, `ชุด ${x.config}`)),
            h("td", { class: "n" }, fmt.format(x.draws)), h("td", { class: "n" }, fmt.format(x.hits)), h("td", { class: "n" }, fmt.format(x.withHit)),
            h("td", { class: "n" }, `${x.expected.toFixed(3)} (${x.band[0]}–${x.band[1]})`),
            h("td", { class: "n" }, pctile(x.mean)), h("td", { class: "small" }, x.mean === null ? "–" : `${pctile(x.lo)} – ${pctile(x.hi)}`),
            h("td", null, x.mean === null ? "–" : h("span", { class: `chip ${ok ? "ok" : "warn"}` }, ok ? "เหมือนสุ่ม" : "นอกช่วง")));
        })))),
      h("div", { class: "row" }, csvButton(`lotto-backtest-${state.y1}-${state.y2}.csv`, ["รางวัล", "ชุด", "ปีเริ่ม (ค.ศ.)", "ปีสุดท้าย (ค.ศ.)", "งวด", "ถูกตรง", "งวดที่ถูก >= 1", "ถ้าสุ่มควรถูก", "อันดับเฉลี่ย"],
        () => rows.map(([k, x]) => [k, x.config, state.y1, state.y2, x.draws, x.hits, x.withHit, r4(x.expected), r4(x.mean)]))));
    const p = new URLSearchParams(location.search);
    p.set("y1", String(state.y1));
    p.set("y2", String(state.y2));
    history.replaceState(null, "", `?${p}`);
  }
  s1.addEventListener("change", () => { state.y1 = Number(s1.value); draw(); });
  s2.addEventListener("change", () => { state.y2 = Number(s2.value); draw(); });
  draw();
  return h("section", { class: "card section stack" },
    h("h2", null, "เลือกช่วงปีเอง", gl("backtest")),
    h("div", { class: "row" }, h("label", { for: "bt-y1", class: "small muted" }, "ตั้งแต่ปี"), s1, h("label", { for: "bt-y2", class: "small muted" }, "ถึงปี"), s2),
    out,
    h("p", { class: "note" }, "ใช้ชุดน้ำหนักที่เลือกใช้ของแต่ละรางวัล · ช่วงก่อน 2560 คือช่วงฝึกที่ใช้เลือกชุดน้ำหนัก ผลช่วงนั้นจึงดูดีกว่าความจริงได้ · ถ้าลองหลายช่วงหลังเห็นผลแล้ว ย่อมเจอบางช่วงที่ดูดีโดยบังเอิญ ให้ยึดช่วงทดสอบจริงด้านบนเป็นหลัก", gl("validation-holdout")));
}

function smallBacktestView(bts) {
  if (!bts) return null;
  const splitLabel = { validation: "ก่อน 2560", holdout: "ตั้งแต่ 2560 (ทดสอบจริง)", all: "ทั้งหมด" };
  return h("section", { class: "card section stack" },
    h("h2", null, "ทดสอบย้อนหลัง: เลขท้าย 2 ตัว / ท้าย 3 ตัว / หน้า 3 ตัว", gl("backtest")),
    !bts.fresh ? h("div", { class: "callout warn" }, "ผลนี้คำนวณจากข้อมูล/การตั้งค่า/โค้ดชุดเก่า จะอัปเดตในรอบถัดไปของ GitHub Actions") : null,
    h("p", { class: "note" }, `ก่อนแต่ละงวด จัดอันดับเลขจากงวดก่อนหน้าเท่านั้น แล้วนับว่าเลขที่ออกจริงอยู่ในกลุ่มที่เลือกกี่ครั้ง (เลขท้าย 2 ตัว ${bts.candidate_counts.last2} เลข, เลขท้าย 3 ตัว ${bts.candidate_counts.back3} เลข, เลขหน้า 3 ตัว ${bts.candidate_counts.front3} เลข) เทียบกับที่การสุ่มเลือกควรได้ · เริ่มทดสอบเมื่อมีข้อมูลก่อนหน้าอย่างน้อย 100 งวด`),
    h("div", { class: "table-wrap" }, h("table", { class: "tight" },
      h("thead", null, h("tr", null, h("th", null, "รางวัล"), h("th", null, "ช่วง"), h("th", { class: "n" }, "งวด"), h("th", { class: "n" }, term("ถูก", "exact-hit")), h("th", { class: "n" }, "งวดที่ถูก ≥ 1"), h("th", { class: "n" }, "ต่อ 100 งวด (สุ่ม)"), h("th", { class: "n" }, term("ถ้าสุ่มควรถูก", "expected")), h("th", null, term("ช่วงปกติ", "range95")), h("th", { class: "n" }, term("อันดับเฉลี่ย", "mean-rank")))),
      SMALL.map((k) => {
        const r = bts.results[k];
        return h("tbody", null, ["holdout", "validation", "all"].map((sp, i) => {
          const x = r[sp];
          const ok = x.random ? x.hits >= x.random.lo95 && x.hits <= x.random.hi95 : true;
          return h("tr", { class: sp === "holdout" ? "em" : null },
            i === 0 ? h("th", { rowspan: "3" }, PRIZE_LABEL[k]) : null,
            h("td", null, splitLabel[sp]),
            h("td", { class: "n" }, fmt.format(x.draws)),
            h("td", { class: "n" }, x.draws ? fmt.format(x.hits) : "–"),
            h("td", { class: "n" }, x.draws ? fmt.format(x.draws_with_hit ?? x.hits) : "–"),
            h("td", { class: "n" }, x.draws ? `${fmt1.format((x.hits / x.draws) * 100)}${x.random ? ` (${fmt1.format((x.random.expected / x.draws) * 100)})` : ""}` : "–"),
            h("td", { class: "n" }, x.random ? fmt1.format(x.random.expected) : "–"),
            h("td", null, x.random ? [`${x.random.lo95}–${x.random.hi95} `, h("span", { class: `chip ${ok ? "ok" : "warn"}` }, ok ? "เหมือนสุ่ม" : "นอกช่วง")] : "–"),
            h("td", { class: "n" }, pctile(x.mean_pct)));
        }));
      }))),
    h("p", { class: "note" }, "\"อันดับเฉลี่ย\" = เลขที่ออกจริงอยู่ตรงไหนในอันดับ เฉลี่ยกี่ % จากบนสุด ถ้าเหมือนสุ่มจะได้ราว 50% · ถ้าจำนวนที่ถูกอยู่ในช่วงปกติ แปลว่าวิธีนี้ไม่ได้ดีกว่าการสุ่มเลือก · เลขหน้า 3 ตัวเริ่มมีปี 2558 จึงทดสอบได้เฉพาะช่วงหลัง"),
    h("div", { class: "row" }, csvButton("lotto-backtest-small.csv", ["รางวัล", "ช่วง", "งวด", "ถูก", "งวดที่ถูก >= 1", "ถูกต่อ 100 งวด", "ถ้าสุ่มควรถูก", "ช่วงปกติ ต่ำ", "ช่วงปกติ สูง", "อันดับเฉลี่ย"],
      () => SMALL.flatMap((k) => ["holdout", "validation", "all"].map((sp) => {
        const x = bts.results[k][sp];
        return [k, sp, x.draws, x.hits, x.draws_with_hit ?? x.hits, x.draws ? r4((x.hits / x.draws) * 100) : "", x.random ? r4(x.random.expected) : "", x.random ? x.random.lo95 : "", x.random ? x.random.hi95 : "", r4(x.mean_pct)];
      })))),
    h("p", { class: "note" }, "\"ต่อ 100 งวด\" = จำนวนที่ถูกต่อ 100 งวด ตัวเลขในวงเล็บคือที่การสุ่มเลือกควรได้"),
    h("p", { class: "note" }, `ข้อมูลถึง ${thShort(bts.data_through)} · คำนวณเมื่อ ${thDateTime(bts.backtest_generated_at)}`));
}

// งานวิจัย: ให้ "ความน่าจะเป็น" กับทุกเลข (ความถี่ย้อนหลัง / machine learning) เทียบกับให้ทุกเลขเท่ากัน
// ข้อมูลจาก scripts/lotto_ml_study.py (รันเองด้วยมือ)
const ML_MODEL_LABEL = { freq: "ความถี่ย้อนหลัง", logit: "Machine learning" };
const ML_TARGET_LABEL = (t) => (t === "last2" ? "เลขท้าย 2 ตัว" : `รางวัลที่ 1 หลักที่ ${t.slice(-1)}`);
const ML_VERDICT = {
  lower_logloss_than_uniform: ["warn", "ดีกว่าเท่ากัน"],
  no_difference_from_uniform: ["ok", "เหมือนเท่ากัน"],
  higher_logloss_than_uniform: ["gray", "แย่กว่าเท่ากัน"],
};
const mlVerdictOf = (ci) => (ci[1] < 0 ? "lower_logloss_than_uniform" : ci[0] > 0 ? "higher_logloss_than_uniform" : "no_difference_from_uniform");
const signed = (x, d = 4) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}`;

function mlVerdictChip(v) {
  const [cls, text] = ML_VERDICT[v] || ["", v];
  return h("span", { class: `chip ${cls}` }, text);
}

function mlStudyView(ml) {
  if (!ml) return null;
  const e = ml.evaluation;
  const models = ["freq", "logit"];
  // แถวหลัก: เลขท้าย 2 ตัว และรางวัลที่ 1 ทั้ง 6 หลักรวมกัน (ผลรวมของแต่ละหลัก)
  const rows = Object.entries(ml.groups).flatMap(([key, g]) => models.map((m) => {
    const c = g.combined_holdout[m];
    const val = g.targets.reduce((a, t) => a + g.results[t].models[m].validation.logloss_minus_uniform, 0);
    const pc = g.permutation_check[m];
    return { key, label: key === "last2" ? "เลขท้าย 2 ตัว" : "รางวัลที่ 1 (6 หลักรวมกัน)", m, val, hold: c.holdout_logloss_minus_uniform,
      ci: c.ci95, verdict: mlVerdictOf(c.ci95), perm: pc ? Math.round(pc.share_shuffled_at_or_below_actual * pc.shuffled_deltas.length) : null,
      permN: pc ? pc.shuffled_deltas.length : null };
  }));
  const better = rows.filter((r) => r.verdict === "lower_logloss_than_uniform");
  const last2 = ml.groups.last2;
  const digits = ml.groups.first_digits;
  const topRows = [];
  if (last2) topRows.push({ t: "last2", g: last2, k: "10", pick: "10 เลขแรก" });
  if (digits) digits.targets.forEach((t) => topRows.push({ t, g: digits, k: "3", pick: "3 ตัวแรก" }));
  const fp = (last2 || digits).chosen_params;
  return h("section", { class: "card section stack" },
    h("h2", null, "ลองทำนายเป็นความน่าจะเป็น (รวม machine learning): ดีกว่าให้ทุกเลขเท่ากันไหม", gl("log-loss")),
    h("div", { class: `callout ${better.length ? "warn" : "ok"}` },
      h("strong", null, better.length ? `มี ${better.length} แบบที่คะแนนดีกว่าให้ทุกเลขเท่ากันในช่วงทดสอบจริง` : "ไม่มีวิธีใดให้ความน่าจะเป็นดีกว่าการให้ทุกเลขเท่ากัน"), h("br"),
      better.length ? "ผลนี้อาจเป็นความบังเอิญได้ ให้ดูคู่กับการสลับลำดับงวดด้านล่าง" : "ทั้งความถี่ย้อนหลังและ machine learning ทำได้เท่ากับหรือแย่กว่าการให้ทุกเลขมีความน่าจะเป็นเท่ากัน ซึ่งเป็นสิ่งที่ควรเห็นเมื่อการออกรางวัลสุ่มจริง"),
    h("p", { class: "note" }, `ก่อนแต่ละงวด ใช้เฉพาะงวดก่อนหน้าคำนวณความน่าจะเป็นของทุกเลข (เลขท้าย 2 ตัว 100 เลข และรางวัลที่ 1 ทีละหลัก หลักละ 10 ตัว) แล้วดูว่าให้ความน่าจะเป็นกับเลขที่ออกจริงเท่าไร · เริ่มทายงวดที่ ${fmt.format(e.first_predicted_index + 1)} · เลือกค่าตั้งของแต่ละวิธีจากช่วงฝึกเท่านั้น `, gl("validation-holdout"), ` (${thShort(e.validation.from)} – ${thShort(e.validation.to)}, ${fmt.format(e.validation.draws)} งวด) แล้ววัดผลครั้งเดียวในช่วงทดสอบจริง (${thShort(e.holdout.from)} – ${thShort(e.holdout.to)}, ${fmt.format(e.holdout.draws)} งวด)`),
    h("ul", { class: "plain-list small" },
      h("li", null, h("strong", null, "ทุกเลขเท่ากัน"), " — ฐานสำหรับเทียบ (เลขท้าย 2 ตัว เลขละ 1%, แต่ละหลัก ตัวละ 10%)"),
      h("li", null, h("strong", null, ML_MODEL_LABEL.freq), ` — นับว่าแต่ละเลขออกกี่ครั้งในช่วงหลัง แล้วเกลี่ยเข้าหาค่าเท่ากัน (เลขท้าย 2 ตัว: ${fp.freq.window || "ทุก"} งวดล่าสุด)`),
      h("li", null, h("strong", null, `${ML_MODEL_LABEL.logit} (logistic regression)`), " — เรียนรู้จากงวดก่อนหน้าว่าข้อมูล 5 อย่างช่วยบอกเลขถัดไปได้ไหม: ความถี่ 10 งวด, 50 งวด, ทั้งหมด, จำนวนงวดที่หายไป และเป็นเลขเดียวกับงวดก่อนไหม")),
    h("div", { class: "table-wrap" }, h("table", { class: "tight" },
      h("thead", null, h("tr", null, h("th", null, "เป้าหมาย"), h("th", null, "วิธี"),
        h("th", { class: "n" }, term("ช่วงฝึก", "validation-holdout")), h("th", { class: "n" }, term("ช่วงทดสอบจริง", "validation-holdout")),
        h("th", null, term("ช่วงคลาดเคลื่อน (ทดสอบจริง)", "ci")), h("th", null, "เทียบทุกเลขเท่ากัน"), h("th", { class: "n" }, "สลับลำดับงวดแล้วได้ดีเท่าหรือดีกว่า"))),
      h("tbody", null, rows.map((r, i) => h("tr", null,
        i % 2 === 0 ? h("th", { rowspan: "2" }, r.label) : null,
        h("td", null, ML_MODEL_LABEL[r.m]),
        h("td", { class: "n mono" }, signed(r.val)), h("td", { class: "n mono" }, signed(r.hold)),
        h("td", { class: "mono small" }, `${signed(r.ci[0])} ถึง ${signed(r.ci[1])}`),
        h("td", null, mlVerdictChip(r.verdict)),
        h("td", { class: "n" }, r.perm === null ? "–" : `${r.perm} จาก ${r.permN} รอบ`)))))),
    h("p", { class: "note" }, "ตัวเลขคือคะแนนความผิดพลาด (log-loss) เฉลี่ยต่องวด ลบด้วยของการให้ทุกเลขเท่ากัน: ติดลบ = ดีกว่า, บวก = แย่กว่า · ถ้าช่วงคลาดเคลื่อนคร่อม 0 แปลว่าแยกไม่ออกจากการให้ทุกเลขเท่ากัน · \"สลับลำดับงวด\" = สุ่มสลับลำดับงวดทั้งหมดแล้วรันใหม่ ถ้าลำดับเวลามีรูปแบบที่ใช้ทายได้จริง ผลจริงควรดีกว่าแทบทุกรอบที่สลับ"),
    h("h3", null, "ถ้าเลือกเลขตามลำดับของแต่ละวิธี (ช่วงทดสอบจริง)"),
    h("div", { class: "table-wrap" }, h("table", { class: "tight" },
      h("thead", null, h("tr", null, h("th", null, "เป้าหมาย"), h("th", null, "เลือก"), h("th", { class: "n" }, ML_MODEL_LABEL.freq), h("th", { class: "n" }, "Machine learning"), h("th", { class: "n" }, term("ถ้าสุ่ม", "expected")))),
      h("tbody", null, topRows.map(({ t, g, k, pick }) => {
        const r = g.results[t].models;
        return h("tr", null, h("th", null, ML_TARGET_LABEL(t)), h("td", null, pick),
          h("td", { class: "n" }, pct(r.freq.holdout.topk[k].rate)), h("td", { class: "n" }, pct(r.logit.holdout.topk[k].rate)),
          h("td", { class: "n" }, pct(r.freq.holdout.topk[k].random_expected_rate, 0)));
      })))),
    h("p", { class: "note" }, "% ของงวดที่เลขที่ออกจริงอยู่ในกลุ่มที่เลือก ถ้าเลขมีความน่าจะเป็นเท่ากันหลายตัว คิดแบบสุ่มเลือกจากตัวที่เท่ากัน · แต่ละหลักมีงวดทดสอบจริงไม่ถึง 300 งวด จึงแกว่งรอบค่าที่สุ่มควรได้หลาย % เป็นธรรมดา"),
    !ml.code_matches ? h("div", { class: "callout warn" }, "โค้ดของงานวิจัยถูกแก้หลังจากคำนวณผลนี้ ควรรันใหม่ (python scripts/lotto_ml_study.py)") : null,
    h("div", { class: "row" }, csvButton("lotto-probability-study.csv", ["เป้าหมาย", "วิธี", "ช่วงฝึก (ผลต่าง log-loss)", "ช่วงทดสอบจริง (ผลต่าง log-loss)", "ช่วงคลาดเคลื่อน ต่ำ", "ช่วงคลาดเคลื่อน สูง", "ผล", "สลับลำดับแล้วดีเท่าหรือดีกว่า", "จำนวนรอบสลับ"],
      () => rows.map((r) => [r.key, r.m, r4(r.val), r4(r.hold), r4(r.ci[0]), r4(r.ci[1]), r.verdict, r.perm ?? "", r.permN ?? ""]))),
    h("p", { class: "note" }, `ข้อมูลถึง ${thShort(ml.data_through)} (${fmt.format(ml.draw_count)} งวด)${ml.csv_matches ? "" : " ยังไม่รวมงวดที่ใหม่กว่านั้น"} · คำนวณเมื่อ ${thDateTime(ml.study_generated_at)} ใช้เวลา ${fmt.format(Math.round(ml.runtime_seconds))} วินาที`));
}

// ---------- page: history ----------
async function pageHistory() {
  const params = new URLSearchParams(location.search);
  const pidx = await optionalData("predictions/index.json");
  const head = pageHead("ประวัติการทำนาย", "บันทึกที่ล็อกไว้ก่อนออกรางวัล แล้วเทียบกับผลจริง (ไม่มีการสร้างย้อนหลัง)");
  if (!pidx || !pidx.snapshots.length) {
    render(head, h("section", { class: "card" }, h("p", { class: "empty" }, "ยังไม่มีบันทึก · ระบบจะสร้างอัตโนมัติหลังดึงผลงวดใหม่ และตรวจผลเมื่อผลงวดถัดไปออก")));
    return;
  }
  const snaps = pidx.snapshots;
  const evaluated = snaps.filter((x) => x.status === "evaluated");
  const hits = evaluated.reduce((a, x) => a + x.exact_hits_total, 0);
  const expected = evaluated.reduce((a, x) => a + x.random_expected_total, 0);
  const noSnap = pidx.history.filter((x) => x.status === "no_snapshot" || x.status === "not_evaluable" || x.status === "invalid").length;
  const chrono = [...evaluated].reverse();
  let ch = 0, ce = 0;
  const cumH = chrono.map((x) => (ch += x.exact_hits_total));
  const cumE = chrono.map((x) => (ce += x.random_expected_total));
  const sel = params.get("d");
  const detailDate = snaps.some((x) => x.target_draw_date === sel) ? sel : (evaluated[0] ? evaluated[0].target_draw_date : null);
  const detail = h("div");
  const smallCell = (x) => {
    if (!x.small) return "–";
    if (!x.small_hits) return "รอผล";
    return SMALL.filter((k) => x.small_hits[k] !== undefined).map((k) => `${PRIZE_LABEL[k].replace("เลข", "")} ${x.small_hits[k]}`).join(" · ");
  };
  render(head,
    h("section", { class: "card stack" },
      h("div", { class: "stat-row" },
        stat("บันทึกทั้งหมด", fmt.format(snaps.length)),
        stat("ตรวจผลแล้ว", fmt.format(evaluated.length)),
        stat(term("เลข 6 หลักถูกตรงรวม", "exact-hit"), `${fmt.format(hits)}`),
        stat(term("ถ้าสุ่มควรถูกราว", "expected"), fmt2.format(expected))),
      h("p", { class: "note" }, `เริ่มบันทึกหลังงวด ${thShort(pidx.tracking_since)} · งวดหลังจากนั้นที่ไม่มีบันทึกก่อนออกรางวัลถือว่าตรวจผลไม่ได้ (${fmt.format(noSnap)} งวด) · ผลลองย้อนหลังดูได้ที่ `, h("a", { href: "analysis.html?tab=backtest" }, "ทดสอบย้อนหลัง")),
      chrono.length >= 2 ? [h("h2", null, "ถูกสะสมเทียบการสุ่ม"),
        lineChart({ values: cumH, labels: chrono.map((x) => thShort(x.actual_draw_date)), ref: null, ariaLabel: "จำนวนเลขที่ถูกสะสม", yMin: 0, yMax: Math.max(1, ...cumH, ...cumE) }),
        h("p", { class: "note" }, `เส้น = ถูกสะสมจริง · ถ้าสุ่มควรถูกรวมราว ${fmt2.format(ce)} เลข`)] : null),
    h("section", { class: "card section stack" },
      h("h2", null, "บันทึกทั้งหมด", gl("snapshot")),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "งวดที่ทำนาย"), h("th", null, "บันทึกเมื่อ"), h("th", null, "ข้อมูลถึง"), h("th", null, term("บันทึกก่อนออกรางวัล", "snapshot")), h("th", null, "สถานะ"), h("th", { class: "n" }, "6 หลัก ถูก / ควรถูกถ้าสุ่ม"), h("th", null, "เลขท้าย/หน้า ถูก"))),
        h("tbody", null, snaps.map((x) => h("tr", null,
          h("td", null, h("a", { href: `analysis.html?d=${x.target_draw_date}` }, thShort(x.target_draw_date))),
          h("td", null, thDateTime(x.created_at)),
          h("td", null, thShort(x.training_data_through)),
          h("td", null, x.lead_time_hours !== null ? leadText(x.lead_time_hours) : `≈ ${leadText((Date.parse(`${x.target_draw_date}T07:00:00Z`) - Date.parse(x.created_at)) / 3600000)} (วันที่คาดไว้)`),
          h("td", null, statusChip(x.status)),
          h("td", { class: "n" }, x.status === "evaluated" ? `${x.exact_hits_total} / ${x.random_expected_total.toFixed(4)}` : "–"),
          h("td", { class: "small" }, smallCell(x)))))))),
    detail,
    h("section", { class: "card section stack" },
      h("h2", null, "ทุกงวดตั้งแต่เริ่มบันทึก"),
      pidx.history.length
        ? h("ul", { class: "status-list" }, pidx.history.map((r) => h("li", null,
          h("a", { href: `results.html?d=${r.draw_date}` }, thShort(r.draw_date)), statusChip(r.status),
          r.status === "evaluated" ? h("span", { class: "small muted" }, `ถูก ${r.exact_hits_total} (ถ้าสุ่มควรถูก ${r.random_expected_total.toFixed(4)})`) : null,
          r.status === "no_snapshot" ? h("span", { class: "small muted" }, "ไม่มีบันทึกก่อนออกรางวัล — ไม่สร้างย้อนหลัง") : null)))
        : h("p", { class: "empty" }, "ยังไม่มีงวดที่ออกหลังเริ่มบันทึก")),
    responsibleBox());
  if (detailDate) {
    const pd = await getData(`predictions/${detailDate}.json`);
    detail.replaceChildren(evaluationDetail(pd.snapshot, pd.evaluation, pd.small));
  }
}

function evaluationDetail(snap, ev, small) {
  const headLine = h("h2", null, `รายละเอียดงวด ${thShort(snap.target_draw_date)}`);
  if (!ev) return h("section", { class: "card section stack" }, headLine, h("p", { class: "empty" }, "รอผลรางวัล"));
  if (ev.status !== "evaluated") {
    return h("section", { class: "card section stack" }, headLine, statusChip(ev.status), h("p", null, ev.reason || ""));
  }
  const sres = small && small.evaluation && small.evaluation.status === "evaluated" ? small.evaluation.results : null;
  return h("section", { class: "card section stack" }, headLine,
    h("p", { class: "note" }, `ผลจริงงวด ${thShort(ev.actual_draw_date)} · บันทึกเมื่อ ${thDateTime(ev.snapshot_created_at)} (ก่อนเริ่มออกรางวัล ${leadText(ev.lead_time_hours)})`),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "รางวัล"), h("th", null, "เลขที่ทำนาย"), h("th", { class: "n" }, term("ถูกตรง", "exact-hit")), h("th", { class: "n" }, term("ถ้าสุ่มควรถูก", "expected")))),
      h("tbody", null, SIX.map((k) => {
        const r = ev.results[k];
        const hs = new Set(r.exact_hits);
        return h("tr", null, h("th", null, SIX_LABEL[k]),
          h("td", null, h("div", { class: "num-list" }, r.candidates.map((n) => h("span", { class: hs.has(n) ? "hit" : null }, n)))),
          h("td", { class: "n" }, r.available ? r.exact_hits.length : "–"),
          h("td", { class: "n" }, r.available ? r.random_expected.toFixed(5) : "–"));
      }),
      sres ? SMALL.map((k) => {
        const r = sres[k];
        const hs = new Set(r.exact_hits || []);
        return h("tr", null, h("th", null, PRIZE_LABEL[k], r.available ? h("div", { class: "note" }, `ออก: ${r.winners.join(", ")}`) : null),
          h("td", null, h("div", { class: "num-list" }, r.candidates.map((n) => h("span", { class: hs.has(n) ? "hit" : null }, n)))),
          h("td", { class: "n" }, r.available ? r.hits : "–"),
          h("td", { class: "n" }, r.available ? r.random_expected.toFixed(3) : "–"));
      }) : null))),
    h("h3", null, "ถ้าซื้อเลข 6 หลักเหล่านี้ จะถูกรางวัลอะไรบ้าง (ทุกประเภท)"),
    ev.ticket_wins.length
      ? h("ul", { class: "hits" }, ev.ticket_wins.map((t) => h("li", null, h("span", { class: "mono" }, t.number), h("span", { class: "small muted" }, `(จากรายการ${SIX_LABEL[t.list]})`),
        t.prizes.map((p) => h("span", { class: "chip ok" }, PRIZE_LABEL[p])))))
      : h("p", { class: "empty" }, "ไม่ถูกรางวัลใดเลย"),
    h("p", { class: "note" }, "ส่วนนี้แยกจากการนับ \"ถูกตรง\" ด้านบน: ถ้าเลข 6 หลักบังเอิญตรงกับเลขท้าย 2 ตัว/หน้า-ท้าย 3 ตัว ก็เป็นรางวัลจริงของสลาก แต่ไม่นับเป็นผลงานของการทำนายรางวัลที่ 1–5"));
}

// ---------- page: randomness ----------
const STRATEGY_LABEL = { hot: "เลขออกบ่อย", cold: "เลขออกน้อย", overdue: "เลขไม่ออกนาน" };
const ERA_LABEL = { all: "ทั้งหมด", E1: "2538–2543", E2: "2543–2558", E3: "2558–ปัจจุบัน" };

async function pageRandom() {
  const r = await getData("stats/randomness.json");
  const flagged = r.tests.filter((t) => t.p_bonferroni < 0.05);
  const rawFlag = r.tests.filter((t) => t.p < 0.05);
  const bt = r.backtest_last2;
  const ac = r.autocorr_last2;

  const btBars = h("div", { class: "bars" },
    bt.strategies.map((st) => {
      const scale = 0.2;
      const fill = h("div", { class: "fill" });
      fill.style.width = `${(st.rate / scale) * 100}%`;
      const band = h("div", { class: "band" });
      band.style.left = `${(bt.chance_range95[0] / scale) * 100}%`;
      band.style.width = `${((bt.chance_range95[1] - bt.chance_range95[0]) / scale) * 100}%`;
      const mark = h("div", { class: "mark" });
      mark.style.left = `${(bt.chance_rate / scale) * 100}%`;
      return h("div", { class: "b" }, h("span", null, STRATEGY_LABEL[st.name]),
        h("div", { class: "track", role: "img", "aria-label": `${STRATEGY_LABEL[st.name]} ถูก ${pct(st.rate)}` }, band, fill, mark),
        h("span", { class: "num" }, pct(st.rate)));
    }));

  const groups = [
    ["number", "แต่ละเลขออกเท่า ๆ กันไหม"],
    ["first_digit", "แต่ละหลักของรางวัลที่ 1"],
    ["prize_digits", "ตัวเลขในรางวัลที่ 2–5 แยกตามแหล่งข้อมูล"],
    ["runs", "สูง/ต่ำ คู่/คี่ สลับกันเหมือนการสุ่มไหม"],
    ["change_point", "การกระจายของตัวเลขเปลี่ยนตามช่วงเวลาไหม"],
  ];
  const testTable = h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "การทดสอบ"), h("th", null, "ช่วง"), h("th", { class: "n" }, term("ค่า p", "p-value")), h("th", { class: "n" }, term("ค่า p หลังปรับ", "bonferroni")), h("th", null, "ผล"))),
    groups.map(([g, title]) => h("tbody", null,
      h("tr", null, h("th", { colspan: "5" }, title)),
      r.tests.filter((t) => t.group === g).map((t) => h("tr", null,
        h("td", null, g === "number" ? PRIZE_LABEL[t.label] : g === "prize_digits" ? TRUST[t.trust_level].label : t.label),
        h("td", null, ERA_LABEL[t.era] || t.era),
        h("td", { class: "n" }, fmtP(t.p)),
        h("td", { class: "n" }, fmtP(t.p_bonferroni)),
        h("td", null, pChip(t))))))));

  const runsTable = h("div", { class: "table-wrap" }, h("table", { class: "seq-table" },
    h("thead", null, h("tr", null, h("th", null, "แบ่งเป็น 2 แบบ"), h("th", { class: "n" }, "จำนวนช่วง (ถ้าสุ่มควรเป็น)"),
      h("th", { class: "n" }, "ค่า z"), h("th", { class: "n" }, term("ค่า p หลังปรับ", "bonferroni")), h("th", null, "ผล"))),
    h("tbody", null, (r.runs || []).map((t) => h("tr", null,
      h("td", null, t.label), h("td", { class: "n" }, `${fmt.format(t.runs)} (${fmt1.format(t.expected)})`),
      h("td", { class: "n" }, t.z.toFixed(2)), h("td", { class: "n" }, fmtP(t.p_bonferroni)), h("td", null, pChip(t)))))));

  const cps = r.change_points || [];
  const cpTable = h("div", { class: "table-wrap" }, h("table", { class: "seq-table" },
    h("thead", null, h("tr", null, h("th", null, "ข้อมูล"), h("th", null, "จุดที่ต่างที่สุด"), h("th", { class: "n" }, "ค่าไคสแควร์"),
      h("th", { class: "n" }, term("ค่า p หลังปรับ", "bonferroni")), h("th", null, "ผล"))),
    h("tbody", null, cps.map((c) => h("tr", null,
      h("td", null, c.label, h("br"), h("span", { class: "small muted" }, `${fmt.format(c.draws)} งวด`)),
      h("td", null, thShort(c.change_date), h("br"), h("span", { class: "small muted" }, c.nearest_boundary
        ? `${c.aligned ? "ตรงกับ" : "ห่างจาก"} ${c.nearest_boundary.label} (${thShort(c.nearest_boundary.date)})${c.aligned ? "" : ` ${fmt.format(c.nearest_boundary.draws_away)} งวด`}`
        : "")),
      h("td", { class: "n" }, fmt1.format(c.stat)), h("td", { class: "n" }, fmtP(c.p_bonferroni)), h("td", null, pChip(c)))))));
  const cpFlag = cps.filter((c) => c.p_bonferroni < 0.05);

  const ev = [
    ["รางวัลที่ 1", 1, 6000000], ["ข้างเคียงรางวัลที่ 1", 2, 100000], ["รางวัลที่ 2", 5, 200000],
    ["รางวัลที่ 3", 10, 80000], ["รางวัลที่ 4", 50, 40000], ["รางวัลที่ 5", 100, 20000],
    ["เลขหน้า 3 ตัว", 2000, 4000], ["เลขท้าย 3 ตัว", 2000, 4000], ["เลขท้าย 2 ตัว", 10000, 2000],
  ];
  const total = ev.reduce((a, [, n, v]) => a + n * v, 0);
  const perTicket = total / 1000000;

  render(
    pageHead("เลขสุ่มจริงไหม?", `ทดสอบจากผลจริง ${fmt.format(r.first_prize_digits.draws)} งวด`),
    h("section", { class: "card stack" },
      h("div", { class: flagged.length ? "callout" : "callout ok" },
        h("strong", null, flagged.length
          ? `มี ${flagged.length} การทดสอบที่ผิดปกติ (หลังปรับตามจำนวนการทดสอบ)`
          : `ทดสอบ ${r.test_count} แบบ ไม่พบความผิดปกติ (หลังปรับตามจำนวนการทดสอบ)`),
        gl("bonferroni"), h("br"),
        "ผลสลากออกมาเหมือนการสุ่มที่ยุติธรรม ไม่มีสถิติใดในข้อมูลนี้ที่ช่วยเดาเลขงวดถัดไปได้")),
    h("div", { class: "grid grid-2e section" },
      h("section", { class: "card stack" },
        h("h2", null, "ถ้าเลือกเลขตามสถิติ จะถูกบ่อยขึ้นไหม?", gl("backtest")),
        h("p", { class: "small muted" }, `ลองย้อนหลัง ${fmt.format(bt.trials)} งวด: ก่อนแต่ละงวดใช้เฉพาะข้อมูลก่อนหน้า เลือกเลขท้าย 2 ตัว ${bt.pick} ตัวตามวิธีนั้น แล้วนับว่าถูกกี่ครั้ง`),
        btBars,
        h("p", { class: "small muted" }, `เส้นตั้ง = โอกาสถ้าเลือกมั่ว ${pct(bt.chance_rate, 0)} · แถบเขียว = ช่วงที่การเลือกมั่วให้ได้ตามปกติ (${pct(bt.chance_range95[0])}–${pct(bt.chance_range95[1])})`),
        h("p", null, bt.strategies.every((st) => st.rate >= bt.chance_range95[0] && st.rate <= bt.chance_range95[1])
          ? "ทุกวิธีได้ผลพอ ๆ กับการเลือกมั่ว"
          : "มีบางวิธีอยู่นอกช่วงปกติ (ดูผลทดสอบอื่นประกอบ เพราะลองหลายวิธี ย่อมเจอบางวิธีโดยบังเอิญ)")),
      h("section", { class: "card stack" },
        h("h2", null, "งวดก่อนบอกอะไรเกี่ยวกับงวดถัดไปไหม?"),
        h("div", { class: "stat-row" }, stat(term("ความเกี่ยวข้องกับงวดก่อน", "autocorrelation"), ac.r.toFixed(3)), stat(term("ช่วงปกติ", "range95"), `±${ac.range95[1].toFixed(3)}`)),
        h("p", { class: "small muted" }, "วัดว่าเลขท้าย 2 ตัวของงวดหนึ่งเกี่ยวกับงวดถัดไปไหม (ค่า -1 ถึง 1) ค่าใกล้ 0 แปลว่าไม่เกี่ยวกัน"),
        h("h2", { class: "section" }, "ซื้อ 1 ใบ ได้คืนเฉลี่ยเท่าไร", gl("expected-return")),
        h("div", { class: "stat-row" }, stat("ราคาสลาก", "80 บาท"), stat("รางวัลเฉลี่ยต่อใบ", `${fmt.format(perTicket)} บาท`)),
        h("p", { class: "small muted" }, `จากเงินรางวัลรวม ${fmt.format(total)} บาทต่อสลาก 1 ล้านใบ (อัตรารางวัลปัจจุบัน โปรดตรวจสอบกับ GLO) ได้คืนเฉลี่ย ${pct(perTicket / 80, 0)} ของราคา`))),
    (r.runs || []).length ? h("section", { class: "card section stack" },
      h("h2", null, "สูง/ต่ำ คู่/คี่ สลับกันบ่อยเท่าการสุ่มไหม?", gl("runs-test")),
      h("p", { class: "small muted" }, "แบ่งผลแต่ละงวดเป็น 2 แบบ แล้วนับว่ามีกี่ช่วงที่ออกแบบเดียวกันติดกัน ถ้าออกแบบเดิมติดกันนานเกินไป หรือสลับกันถี่เกินไป จำนวนช่วงจะห่างจากค่าที่การสุ่มควรให้"),
      runsTable,
      h("p", null, r.runs.every((t) => t.p_bonferroni >= 0.05)
        ? "จำนวนช่วงใกล้ค่าที่การสุ่มควรให้ทุกแบบ ผลงวดก่อนไม่ได้ทำให้งวดถัดไปออกแบบเดิมหรือสลับแบบมากกว่าปกติ"
        : "มีบางแบบที่จำนวนช่วงห่างจากการสุ่ม (ดูผลทดสอบอื่นประกอบ)")) : null,
    cps.length ? h("section", { class: "card section stack" },
      h("h2", null, "ข้อมูลแต่ละช่วงเวลาสม่ำเสมอไหม?", gl("change-point")),
      h("p", { class: "small muted" }, `ส่วนนี้ใช้ตรวจคุณภาพข้อมูล ไม่ได้ใช้หาเลข: ลองแบ่งข้อมูลเป็นก่อน/หลังทุกงวด หาจุดที่ตัวเลข 0–9 ก่อนและหลังต่างกันที่สุด แล้วเทียบกับการสลับลำดับงวดแบบสุ่ม ${fmt.format(cps[0].sims)} ครั้ง ถ้าเจอจุดเปลี่ยนตรงกับวันที่เปลี่ยนแหล่งข้อมูลหรือรูปแบบรางวัล มักแปลว่าข้อมูลช่วงนั้นมีปัญหา`),
      cpTable,
      h("p", null, cpFlag.length
        ? `พบจุดเปลี่ยน ${cpFlag.length} ชุด ควรตรวจข้อมูลช่วงนั้นเทียบกับแหล่งอื่น (เป็นปัญหาข้อมูล ไม่ใช่รูปแบบของเลข)`
        : "ไม่พบจุดเปลี่ยนที่ชัดเจน จุดที่ต่างที่สุดยังอยู่ในระดับที่การสลับลำดับแบบสุ่มให้ได้ตามปกติ ข้อมูลจากหลายแหล่งและหลายยุคจึงต่อกันได้ดี")) : null,
    h("section", { class: "card section stack" },
      h("h2", null, "ผลการทดสอบทั้งหมด", gl("chi-square")),
      h("p", { class: "small muted" }, `ค่า p คือโอกาสที่การสุ่มจริงจะให้ผลเบี้ยวอย่างน้อยเท่านี้ ยิ่งน้อยยิ่งน่าสงสัย ถ้าทดสอบหลายแบบ ย่อมมีบางแบบที่ต่ำกว่า 0.05 โดยบังเอิญ (ทดสอบ ${r.test_count} แบบ น่าจะเจอราว ${fmt1.format(r.test_count * 0.05)} แบบ เจอจริง ${rawFlag.length} แบบ) จึงปรับโดยคูณค่า p ด้วยจำนวนการทดสอบ`),
      testTable,
      h("p", { class: "small muted" }, "ตัวอย่าง: หลักหน่วยของรางวัลที่ 1 มีค่า p ต่ำ แต่หลังปรับแล้วไม่ผิดปกติ · ตัวเลขในรางวัลที่ 2–5 ผิดปกติเล็กน้อยเฉพาะข้อมูลแหล่งเดียวที่ยังไม่ได้ตรวจทาน ส่วนข้อมูลทางการกระจายเท่ากัน แสดงว่าคุณภาพข้อมูลมีผลต่อสถิติ")),
    responsibleBox());
}

function pChip(t) {
  return t.p_bonferroni < 0.05 ? h("span", { class: "chip warn" }, "ผิดปกติ")
    : t.p < 0.05 ? h("span", { class: "chip gray" }, "บังเอิญได้") : h("span", { class: "chip ok" }, "ปกติ");
}

// ---------- page: data ----------
async function pageData() {
  const [m, ver] = await Promise.all([manifest(), getData("verification.json")]);
  const t = m.by_trust;
  render(
    pageHead("ข้อมูลและแหล่งที่มา", `อัปเดตล่าสุด: งวด ${m.latest_draw_th}${ver.last_import ? ` · ดึงจาก GLO เมื่อ ${thDateTime(ver.last_import.retrieved_at)}` : ""}`),
    h("div", { class: "grid grid-2e" },
      h("section", { class: "card stack" },
        h("h2", null, "แหล่งข้อมูล", gl("trust-level")),
        h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, h("th", null, "ช่วง"), h("th", null, "แหล่ง"), h("th", { class: "n" }, "งวด"))),
          h("tbody", null,
            h("tr", null, h("td", null, "16 พ.ย. 2559 – ปัจจุบัน"), h("td", null, trustChip("official"), " API สำนักงานสลากกินแบ่งรัฐบาล"), h("td", { class: "n" }, t.official)),
            h("tr", null, h("td", null, "2550 – 2559"), h("td", null, trustChip("cross-checked"), " lotto.join.in.th ตรวจทานกับ news.sanook.com"), h("td", { class: "n" }, t["cross-checked"])),
            h("tr", null, h("td", null, "2538 – 2549"), h("td", null, trustChip("single-source"), " lotto.join.in.th (ไม่มีแหล่งที่สองให้ตรวจทาน)"), h("td", { class: "n" }, t["single-source"]))))),
        h("p", { class: "small muted" }, "ขอบคุณสำนักงานสลากกินแบ่งรัฐบาล, lotto.join.in.th และ news.sanook.com ที่เผยแพร่ผลรางวัล")),
      h("section", { class: "card stack" },
        h("h2", null, "ความครบถ้วน"),
        h("ul", null,
          h("li", null, `ทั้งหมด ${fmt.format(m.draw_count)} งวด (${thShort(m.first_draw)} – ${thShort(m.latest_draw)})`),
          h("li", null, "126 งวดในช่วง 16 ม.ค. 2538 – 16 ก.ค. 2543 แหล่งข้อมูลไม่มีรางวัลข้างเคียงและรางวัลที่ 2–5"),
          h("li", null, "เลขหน้า 3 ตัวเริ่ม 1 ก.ย. 2558 · ก่อนหน้านั้นเลขท้าย 3 ตัวมี 4 หมายเลข"),
          h("li", null, "รางวัลที่ 1 พิเศษ มีเฉพาะ 1 มิ.ย. 2547 – 16 พ.ค. 2554"),
          h("li", null, "งวด 1 เม.ย. 2563 ออกรางวัลจริง 16 พ.ค. 2563 (COVID-19)"),
          h("li", null, "ไม่มีงวด 30 ธ.ค. 2567 (เลื่อนไป 2 ม.ค. 2568)")))),
    h("section", { class: "card section stack" },
      h("h2", null, "ดาวน์โหลดและตรวจสอบ"),
      h("p", null, h("a", { href: "data/thai_lottery.csv", download: "thai_lottery.csv" }, "ดาวน์โหลด thai_lottery.csv"), " (UTF-8, เปิดใน Excel ได้)"),
      h("div", { class: "table-wrap" }, h("table", null, h("tbody", null,
        h("tr", null, h("th", null, term("SHA-256 ของ CSV", "sha256")), h("td", { class: "mono small" }, m.csv_sha256)),
        h("tr", null, h("th", null, "สร้างเมื่อ (UTC)"), h("td", null, m.generated_at)),
        h("tr", null, h("th", null, "เวอร์ชัน"), h("td", { class: "mono" }, m.version)),
        m.run_id ? h("tr", null, h("th", null, "GitHub Actions run"), h("td", { class: "mono" }, m.run_id)) : null))),
      h("p", { class: "small muted" }, "ข้อมูลทุกงวดผ่านการตรวจรูปแบบอัตโนมัติก่อนขึ้นเว็บ (จำนวนหมายเลขตามยุค, ตัวเลขล้วน, วันที่, แหล่งที่มา) ถ้าไม่ผ่าน เว็บจะไม่ถูกอัปเดต · ค่า SHA-256 ใช้เทียบกับไฟล์ใน GitHub ได้ว่าตรงกัน")),
    h("section", { class: "card section stack" },
      h("h2", null, "วิธีคำนวณ"),
      h("ul", null,
        h("li", null, "ความถี่นับเฉพาะงวดที่มีรางวัลนั้น งวดที่ไม่มีรางวัลหรือไม่มีข้อมูลไม่นับเป็น 0"),
        h("li", null, "\"ถ้าสุ่ม ควรออกราว\" = จำนวนเลขที่ออกทั้งหมด ÷ จำนวนเลขที่เป็นไปได้ (100 หรือ 1,000)", gl("expected")),
        h("li", null, "\"ช่วงปกติ\" = ถ้าสุ่มจริง 95 ใน 100 เลขจะออกจำนวนครั้งอยู่ในช่วงนี้", gl("range95")),
        h("li", null, "\"ค่า p\" บอกว่าภาพรวมต่างจากการสุ่มแค่ไหน ยิ่งน้อยยิ่งต่าง (ต่ำกว่า 0.05 = ต่างชัด) และปรับเมื่อทดสอบหลายแบบ", gl("p-value"), gl("bonferroni")),
        h("li", null, "การทดสอบย้อนหลังใช้เฉพาะข้อมูลก่อนหน้าแต่ละงวด ไม่แอบดูข้อมูลอนาคต", gl("backtest")),
        h("li", null, "ทุกหน้าในส่วนสถิติเลือกช่วงเวลาที่ใช้คำนวณได้ (ทั้งหมด, 5/10/20 ปี, หรือจำนวนงวดล่าสุด) และคำนวณในเครื่องของคุณ"))),
    h("div", { class: "section" }, verificationView(ver)));
}

function verificationView(v) {
  const s = v.summary;
  const miss = v.missing;
  const c = v.conflicts;
  const w = v.import_errors;
  return h("div", { class: "stack" },
    h("section", { class: "card stack" },
      h("h2", null, "สถานะการตรวจสอบ"),
      h("div", { class: "stat-row" },
        stat("ตรวจสอบแล้ว", `${fmt.format(s.verified)} งวด`, "ข้อมูลทางการ GLO หรือตรงกัน 2 แหล่ง"),
        stat("ยังไม่ได้ตรวจทาน", `${fmt.format(s.unverified)} งวด`, "มีแหล่งเดียว"),
        stat("ไม่มีรางวัลที่ 2–5", `${fmt.format(miss.prizes_2_to_5.count)} งวด`),
        stat("ตรวจทานแล้ว (แก้ค่า)", `${fmt.format(c.reconciled_draws)} งวด`)),
      h("p", { class: "note" }, `"ตรวจสอบแล้ว" = API สำนักงานสลากฯ (${fmt.format(s.by_trust.official)} งวด) หรือ 2 แหล่งตรงกัน (${fmt.format(s.by_trust["cross-checked"])} งวด) · "ยังไม่ได้ตรวจทาน" = มีแหล่งเดียว (${fmt.format(s.by_trust["single-source"])} งวด) ไม่ได้แปลว่าผิด แต่ยังไม่มีแหล่งที่สองยืนยัน`),
      h("details", null, h("summary", null, "แยกตามปี"), h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "ปี (พ.ศ.)"), h("th", { class: "n" }, "ทางการ GLO"), h("th", { class: "n" }, "ตรวจทาน 2 แหล่ง"), h("th", { class: "n" }, "แหล่งเดียว"))),
        h("tbody", null, v.by_year.map((y) => h("tr", null, h("td", null, h("a", { href: `results.html?y=${y.year}` }, String(Number(y.year) + 543))),
          h("td", { class: "n" }, y.official || ""), h("td", { class: "n" }, y["cross-checked"] || ""), h("td", { class: "n" }, y["single-source"] || "")))))))),
    h("div", { class: "grid grid-2e" },
      h("section", { class: "card stack" },
        h("h2", null, "ข้อมูลที่ขาด"),
        h("ul", null,
          h("li", null, `รางวัลข้างเคียงและรางวัลที่ 2–5: ไม่มี ${fmt.format(miss.prizes_2_to_5.count)} งวด (${thShort(miss.prizes_2_to_5.from)} – ${thShort(miss.prizes_2_to_5.to)}) ไม่มีแหล่งที่ดึงได้`),
          miss.known_exceptions.map((e) => h("li", null, `${thShort(e.date)}: ${e.note}`))),
        h("details", null, h("summary", null, `เดือนที่จำนวนงวดผิดปกติ (${miss.month_irregular.length} เดือน)`),
          h("div", { class: "table-wrap" }, h("table", null,
            h("thead", null, h("tr", null, h("th", null, "เดือน"), h("th", { class: "n" }, "งวด"), h("th", null, "วันที่"))),
            h("tbody", null, miss.month_irregular.map((x) => h("tr", null, h("td", null, `${MONTHS_SHORT[Number(x.month.slice(5)) - 1]} ${Number(x.month.slice(0, 4)) + 543}`),
              h("td", { class: "n" }, x.draws), h("td", null, x.dates.map(thShort).join(", ") || "–"))))))),
        h("p", { class: "note" }, "ไม่นับ ธ.ค. ที่มี 3 งวด (1, 16, 30) และ ม.ค. ที่มีงวดเดียว (ไม่มีงวด 1 ม.ค.) ซึ่งเป็นเรื่องปกติ · ที่เหลือคืองวดที่เลื่อนวันข้ามเดือน ไม่ได้แปลว่าข้อมูลหาย · ไม่เติมข้อมูลที่หาไม่ได้")),
      h("section", { class: "card stack" },
        h("h2", null, "ปัญหาการนำเข้า"),
        h("dl", { class: "kv" },
          h("dt", null, "ผลตรวจรูปแบบ"), h("dd", null, "ผ่านทุกงวด (ถ้าไม่ผ่าน เว็บจะไม่ถูกอัปเดต)"),
          h("dt", null, "คำเตือน"), h("dd", null, w.validation_warnings.length ? `${w.validation_warnings.length} รายการ` : "ไม่มี"),
          h("dt", null, "บรรทัด log ที่อ่านไม่ได้"), h("dd", null, String(w.unparsed_log_lines)),
          h("dt", null, "ดึงจาก GLO ล่าสุด"), h("dd", null, v.last_import ? `งวด ${thShort(v.last_import.draw_date)} เมื่อ ${thDateTime(v.last_import.retrieved_at)}` : "ยังไม่มีบันทึก (เริ่มบันทึกตั้งแต่รอบอัปเดตถัดไป)")),
        w.validation_warnings.length ? h("ul", { class: "small" }, w.validation_warnings.map((x) => h("li", null, x))) : null,
        h("p", { class: "note" }, "ถ้า API ล่มหรือผลยังไม่ครบ ระบบจะข้ามงวดนั้นและลองใหม่รอบถัดไป โดยไม่แก้ข้อมูลเดิม (ดู log ใน GitHub Actions)"))),
    h("section", { class: "card stack" },
      h("h2", null, "ข้อมูลที่แหล่งไม่ตรงกัน"),
      h("p", { class: "note" }, `ตรวจทานแล้ว ${fmt.format(c.reconciled.length)} จุดใน ${fmt.format(c.reconciled_draws)} งวด (ใช้เสียงข้างมากของแหล่งข้อมูล) · เทียบกับชุดข้อมูลบน GitHub ไม่ตรง ${fmt.format(c.external.length)} จุด`),
      c.external_summary ? h("p", { class: "note" }, `${c.external_summary.dataset}: ${c.external_summary.note} (${fmt.format(c.external_summary.draws)} งวด)`) : null,
      h("details", null, h("summary", null, `ไม่ตรงกับชุดข้อมูลภายนอก (${c.external.length})`), h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "งวด"), h("th", null, "รางวัล"), h("th", null, "ของเรา"), h("th", null, "ของเขา"), h("th", null, "ตัดสิน"))),
        h("tbody", null, c.external.map((x) => h("tr", null, h("td", null, h("a", { href: `results.html?d=${x.date}` }, thShort(x.date))),
          h("td", null, PRIZE_LABEL[x.prize] || x.prize), h("td", { class: "mono small" }, x.only_ours.join(" ")), h("td", { class: "mono small" }, x.only_theirs.join(" ")),
          h("td", { class: "small" }, x.resolution))))))),
      h("details", null, h("summary", null, `บันทึกการตรวจทาน (${c.reconciled.length})`), h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "งวด"), h("th", null, "รางวัล"), h("th", null, "รายละเอียด"))),
        h("tbody", null, c.reconciled.map((x) => h("tr", null, h("td", null, h("a", { href: `results.html?d=${x.date}` }, thShort(x.date))),
          h("td", null, PRIZE_LABEL[x.prize] || x.prize), h("td", { class: "mono small" }, x.note)))))))));
}

// ---------- page: glossary ----------
const GLOSSARY_SEE = {
  "range95": ["stats.html", "สถิติ"], "p-value": ["random.html", "สุ่มจริงไหม"], "backtest": ["analysis.html?tab=backtest", "ทดสอบย้อนหลัง"],
  "hybrid-score": ["analysis.html", "วิเคราะห์"], "snapshot": ["history.html", "ประวัติทำนาย"], "sha256": ["data.html", "ข้อมูล"],
  "autocorrelation": ["random.html", "สุ่มจริงไหม"], "bonferroni": ["random.html", "สุ่มจริงไหม"], "expected-return": ["random.html", "สุ่มจริงไหม"],
  "runs-test": ["random.html", "สุ่มจริงไหม"], "change-point": ["random.html", "สุ่มจริงไหม"],
  "trust-level": ["data.html", "ข้อมูล"], "log-loss": ["analysis.html?tab=backtest", "ทดสอบย้อนหลัง"],
};

async function pageGlossary() {
  render(
    pageHead("คำอธิบายศัพท์", "ความหมายสั้น ๆ ของคำทางสถิติที่ใช้บนเว็บนี้ กดปุ่ม ? ข้างคำในหน้าอื่นเพื่อมาที่นี่"),
    h("div", { class: "callout warn" },
      h("strong", null, "สรุปสั้น ๆ ก่อนอ่าน"), h("br"),
      "คะแนนและอันดับบนเว็บนี้ใช้จัดลำดับเลขตามสถิติในอดีตเท่านั้น ไม่ใช่โอกาสถูกรางวัล ",
      "เมื่อทดสอบย้อนหลังและเทียบกับผลจริง ทุกวิธีให้ผลเท่ากับการสุ่มเลือก"),
    h("nav", { class: "card section gl-index", "aria-label": "รายการคำศัพท์" },
      GLOSSARY_GROUPS.map(([g, title]) => h("div", { class: "gl-index-group" },
        h("h2", null, title),
        h("ul", null, GLOSSARY.filter((e) => e.group === g).map((e) => h("li", null, h("a", { href: `#${e.id}` }, e.term))))))),
    GLOSSARY_GROUPS.map(([g, title]) => h("section", { class: "section stack", "aria-label": title },
      h("h2", { class: "gl-group-title" }, title),
      GLOSSARY.filter((e) => e.group === g).map((e) => h("article", { class: "card gl-entry", id: e.id, tabindex: "-1" },
        h("h3", null, e.term),
        e.aka ? h("p", { class: "note gl-aka" }, e.aka) : null,
        e.body.map((t) => h("p", null, t)),
        e.see.length || GLOSSARY_SEE[e.id] ? h("p", { class: "small gl-see" },
          e.see.length ? ["ดูเพิ่ม: ", e.see.map((id, i) => [i ? " · " : "", h("a", { href: `#${id}` }, GLOSSARY_BY_ID[id].term)])] : null,
          GLOSSARY_SEE[e.id] ? [e.see.length ? " · " : "", "ใช้ในหน้า ", h("a", { href: GLOSSARY_SEE[e.id][0] }, GLOSSARY_SEE[e.id][1])] : null) : null)))),
    responsibleBox());
  // เนื้อหาสร้างหลังโหลดหน้า เบราว์เซอร์จึงเลื่อนไปที่ #id เองไม่ได้ ต้องเลื่อนให้
  const id = decodeURIComponent(location.hash.slice(1));
  const target = GLOSSARY_BY_ID[id] ? document.getElementById(id) : null;
  if (target) {
    target.classList.add("is-target");
    target.scrollIntoView();
    target.focus({ preventScroll: true });
    window.addEventListener("hashchange", () => target.classList.remove("is-target"), { once: true });
  }
}

// ---------- theme toggle ----------
// สว่างเป็นค่าเริ่มต้น โหมดมืดเปิดเมื่อผู้ใช้กดเองเท่านั้น จำไว้ในเครื่องนี้ (ถ้าเบราว์เซอร์ไม่ให้เก็บ ก็ยังสลับได้แต่ไม่จำ)
function themeToggle() {
  const bar = document.querySelector(".topbar-inner");
  if (!bar || bar.querySelector(".theme-btn")) return;
  const root = document.documentElement;
  const icon = () => (root.dataset.theme === "dark"
    ? s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, s("circle", { cx: 12, cy: 12, r: 4.5 }), s("path", { d: "M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" }))
    : s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" })));
  const btn = h("button", { type: "button", class: "theme-btn" });
  function paint() {
    const dark = root.dataset.theme === "dark";
    btn.setAttribute("aria-pressed", String(dark));
    btn.setAttribute("aria-label", dark ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด");
    btn.title = btn.getAttribute("aria-label");
    btn.replaceChildren(icon(), h("span", { class: "theme-text" }, dark ? "โหมดสว่าง" : "โหมดมืด"));
  }
  btn.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("li-theme", next); } catch (e) { /* ไม่จำค่า แต่ยังใช้ได้ */ }
    paint();
  });
  paint();
  bar.append(btn);
}

// ---------- boot ----------
const PAGES = {
  index: pageHome, results: pageResults, stats: pageStats, analysis: pageAnalysis, history: pageHistory, random: pageRandom, data: pageData, glossary: pageGlossary,
};

async function boot() {
  const page = document.body.dataset.page;
  const fn = PAGES[page];
  themeToggle();
  if (!fn) return;
  try {
    await fn();
    const m = await manifest();
    const info = document.getElementById("build-info");
    if (info) info.textContent = `ข้อมูลถึงงวด ${m.latest_draw_th} · เวอร์ชัน ${m.version}`;
  } catch (err) {
    showError(err);
  }
}
boot();
