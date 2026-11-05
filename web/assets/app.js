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
async function pageHome() {
  const [m, latest] = await Promise.all([manifest(), getData("latest.json")]);
  const d = latest.draw;
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
  let nextCard = null;
  if (m.latest_snapshot && RE_DATE.test(m.latest_snapshot)) {
    const pd = await optionalData(`predictions/${m.latest_snapshot}.json`);
    if (pd && pd.snapshot) {
      const sn = pd.snapshot;
      const sm = pd.small;
      const block = (label, count, list) => h("div", { class: "stack" },
        h("div", { class: "small muted" }, `${label} · ${count} อันดับแรก`),
        h("div", { class: "num-list" }, list.slice(0, count).map((r) => h("span", null, r.number))));
      nextCard = h("section", { class: "card section stack next-card" },
        h("div", { class: "row" }, h("h2", null, `เลขที่ระบบจัดอันดับไว้: งวด ${thShort(sn.target_draw_date)}`), h("span", { class: "spacer" }), statusChip(pd.evaluation ? pd.evaluation.status : "pending")),
        h("div", { class: "grid grid-2e" },
          ["first", "second"].map((k) => block(SIX_LABEL[k], sn.candidate_counts[k], sn.predictions[k])),
          sm ? ["last2", "back3"].map((k) => block(PRIZE_LABEL[k], sm.candidate_counts[k], sm.predictions[k].rows)) : null),
        h("p", { class: "note" }, `จัดอันดับจากสถิติที่ผ่านมา (ข้อมูลถึง ${thShort(sn.training_data_through)}) คะแนนไม่ใช่โอกาสถูกรางวัล · ลองย้อนหลังแล้วไม่ดีกว่าการสุ่ม · เลขชุดนี้ล็อกไว้แล้ว รีเฟรชก็ไม่เปลี่ยน · `,
          h("a", { href: "analysis.html" }, "ดูทุกรางวัลและเหตุผล →")));
    }
  }
  render(
    h("div", { class: "grid grid-2" }, latestCard, ticketCard({ initial: q })),
    nextCard,
    h("section", { class: "card section" },
      h("h2", null, "ข้อมูลในเว็บนี้"),
      h("div", { class: "stat-row" },
        stat("จำนวนงวด", fmt.format(m.draw_count)),
        stat("ตั้งแต่", thShort(m.first_draw)),
        stat("ถึง", thShort(m.latest_draw)),
        stat("ข้อมูลทางการ GLO", `${fmt.format(m.by_trust.official)} งวด`)),
      h("p", { class: "muted small section" },
        "อยากรู้ว่ามีเลขไหน \"ออกบ่อย\" จริงไหม? ดู ", h("a", { href: "random.html" }, "ผลทดสอบความสุ่ม"),
        " หรือ ", h("a", { href: "stats.html" }, "ความถี่เทียบกับที่ควรเป็นถ้าสุ่ม"))));
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
      h("div", { class: "row" }, h("h2", null, "แหล่งข้อมูล"), trustChip(d.trust_level)),
      h("p", null, d.source, " · ", ...d.source_url.split(" ").flatMap((u, i) => [i ? " · " : "", extLink(u, "ลิงก์ต้นทาง")])),
      imp ? h("p", { class: "muted small" }, `ดึงจาก API เมื่อ ${thDateTime(imp.retrieved_at)}`) : null,
      notes.map((t) => h("p", { class: "muted small" }, t))),
    hist ? h("section", { class: "card section stack" },
      h("div", { class: "row" }, h("h2", null, "การทำนายงวดนี้"), statusChip(hist.status)),
      hist.snapshot
        ? h("p", null, hist.status === "evaluated" ? `เลข 6 หลักถูกตรง ${hist.exact_hits_total} เลข (ถ้าสุ่มควรถูกราว ${hist.random_expected_total.toFixed(4)}) · ` : "",
          h("a", { href: `history.html?d=${hist.snapshot}` }, "ดูรายละเอียด"))
        : h("p", { class: "muted small" }, "ไม่มีบันทึกการทำนายที่ทำไว้ก่อนออกรางวัลงวดนี้ จึงตรวจผลไม่ได้ (ไม่สร้างย้อนหลัง)")) : null);
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
      stat("ถ้าสุ่ม แต่ละเลขควรออกราว", `${fmt2.format(f.expected)} ครั้ง`),
      stat("ช่วงปกติ", `${f.range95[0]}–${f.range95[1]} ครั้ง`, "ถ้าสุ่มจริง 95 ใน 100 เลขจะออกจำนวนครั้งอยู่ในช่วงนี้")),
    h("p", { class: "small muted" },
      `${rangeLabel(state.range)} · ${thShort(f.first_draw)} – ${thShort(f.last_draw)}`,
      state.prize === "back3" ? " · ก่อน 1 ก.ย. 2558 มี 4 เลขต่องวด หลังจากนั้น 2 เลข จึงนับเป็นจำนวนเลข ไม่ใช่จำนวนงวด" : "",
      state.prize === "front3" ? " · เลขหน้า 3 ตัวเริ่มมีตั้งแต่ 1 ก.ย. 2558 งวดก่อนหน้าไม่นับ" : ""),
    f.expected < 5 ? h("div", { class: "callout warn" }, `ข้อมูลน้อย: แต่ละเลขควรออกเพียงราว ${fmt2.format(f.expected)} ครั้ง ตัวเลขด้านล่างจึงแกว่งมากเป็นธรรมดา ลองเลือกช่วงเวลาที่ยาวขึ้น`) : null,
    chi ? h("div", { class: chi.p >= 0.05 ? "callout ok" : "callout" },
      h("strong", null, chi.p >= 0.05 ? "ภาพรวมไม่ต่างจากการสุ่ม" : "ภาพรวมต่างจากการสุ่มค่อนข้างชัด"), h("br"),
      h("span", { class: "small" },
        `มี ${outside} จาก ${fmt.format(space)} เลขที่ออกบ่อยหรือน้อยเกินช่วงปกติ (ถ้าสุ่มจริงก็จะมีราว ${Math.round(space * 0.05)} เลขอยู่แล้ว) · ${pText(chi.p)}`),
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
      freqTable(f, keyOf)));
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
    h("div", { class: "callout warn" }, `ข้อมูลน้อย: แต่ละเลขควรออกเพียงราว ${fmt2.format(f.expected)} ครั้ง สีส่วนใหญ่จึงเป็นเรื่องบังเอิญ ถ้าสุ่มจริงก็จะมีราว 50 เลขที่มีกรอบ (เกินช่วงปกติ)`),
    heatLegend(),
    grid,
    h("p", { class: "note" }, "แต่ละแถวคือ 40 เลขเรียงกัน (แถวแรก 000–039) · แตะช่องเพื่อดูรายละเอียด"));
}

function freqTable(f, keyOf) {
  return h("details", null,
    h("summary", null, "แสดงเป็นตาราง"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "เลข"), h("th", { class: "n" }, "ออก (ครั้ง)"), h("th", { class: "n" }, "ถ้าสุ่มควรเป็น"), h("th", { class: "n" }, "ต่าง"))),
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
    h("thead", null, h("tr", null, h("th", null, "ออก (ครั้ง)"), h("th", { class: "n" }, "จำนวนเลขจริง"), h("th", { class: "n" }, "ถ้าสุ่มควรเป็น"))),
    h("tbody", null, hist.observed.map((v, k) => h("tr", null, h("td", null, k), h("td", { class: "n" }, v), h("td", { class: "n" }, fmt1.format(hist.expected[k]))))))));
  return [h("div", { class: "chart" }, svg), legend, table];
}

function barChart({ labels, values, expected, band, ariaLabel, xTitle, every }) {
  const W = 640, H = 220, padL = 48, padB = xTitle ? 40 : 28, padT = 12, padR = 8;
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
    band ? [h("span", { class: "key band" }), "ช่วงปกติ"] : null);
  return [h("div", { class: "chart" }, svg), legend];
}

// เส้นเวลา: values (อาจมี null) เทียบเส้นอ้างอิง (เส้นประ) และแถบช่วงปกติ
function lineChart({ values, labels, ref, band, ariaLabel, yFmt, yMin, yMax }) {
  const W = 640, H = 210, padL = 52, padB = 28, padT = 10, padR = 10;
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
    h("thead", null, h("tr", null, h("th", null, head), h("th", { class: "n" }, "จริง"), h("th", { class: "n" }, "ถ้าสุ่มควรเป็น"), h("th", { class: "n" }, "ต่าง"))),
    h("tbody", null, observed.map((o, i) => h("tr", null, h("td", null, labels[i]), h("td", { class: "n" }, fmt.format(o)),
      h("td", { class: "n" }, fmt1.format(expected[i])), h("td", { class: "n" }, (o - expected[i] >= 0 ? "+" : "") + fmt1.format(o - expected[i]))))))));
}

function chiLine(chi) {
  if (!chi) return h("p", { class: "note" }, "ข้อมูลน้อยเกินไปที่จะเทียบกับการสุ่ม");
  return h("p", { class: "note" },
    chi.p >= 0.05 ? "ไม่ต่างจากการสุ่มอย่างชัดเจน" : "ต่างจากการสุ่มค่อนข้างชัด (ทดสอบหลายแบบ ย่อมเจอบางแบบโดยบังเอิญ)",
    ` · ${pText(chi.p)}`);
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
  };
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
      ? h("div", { class: "table-wrap" }, h("table", { class: "rep-table" }, h("thead", null, headRow), tbody))
      : h("p", { class: "empty" }, "ไม่มีเลขที่ออกซ้ำในช่วงนี้"),
    rows.length && rep.repeated < 20 ? h("p", { class: "note" }, `ในช่วงนี้มีเลขที่ออกซ้ำเพียง ${fmt.format(rep.repeated)} เลข จึงแสดงเท่าที่มี`) : null,
    h("p", { class: "note" }, "วิธีเลือก 20 อันดับ: ออกหลายครั้งก่อน ถ้าเท่ากันเอาเลขที่ออกล่าสุดก่อน แล้วเลขน้อยก่อน · กดหัวตารางเพื่อเรียงใหม่ (อันดับเดิมยังอยู่ในคอลัมน์แรก)"),
    h("p", { class: "note" }, "จำนวนเลขที่ออกซ้ำใกล้กับที่การสุ่มให้ได้ตามปกติ การที่เลขหนึ่งเคยออกซ้ำจึงไม่ได้ทำให้งวดหน้ามีโอกาสมากขึ้น"));
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
    h("p", { class: "note" }, `แต่ละช่องควรเป็นราว ${fmt1.format(f.position[0].expected)} ครั้ง (ช่วงปกติ ${f.position[0].range95[0]}–${f.position[0].range95[1]}) · มี 60 ช่อง ถ้าสุ่มจริงก็จะมีราว 3 ช่องที่เกินช่วงปกติ · ${sample}`),
    h("details", null, h("summary", null, "ค่า p ของแต่ละหลัก"),
      h("ul", null, f.position.map((p, i) => h("li", null, `หลักที่ ${i + 1}: p = ${p.chi_square ? fmtP(p.chi_square.p) : "–"}`))),
      h("p", { class: "note" }, "ค่า p ยิ่งน้อยยิ่งต่างจากการสุ่ม ถ้าต่ำกว่า 0.05 ถือว่าต่างชัด"))));

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
      distTable("รูปแบบ", six.patterns.map((p) => `${PATTERN_SHORT[p]} (${p})`), f.pattern.observed, f.pattern.expected))));
  parts.push(h("p", { class: "note" }, `กราฟ 4 รูปบน: ${sample}`));

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
        h("thead", null, h("tr", null, h("th", null, "ตัวเลข"), h("th", { class: "n" }, "ทั้งหมด"), h("th", { class: "n" }, "ช่วงหลัง ๆ"), h("th", { class: "n" }, "ต่าง"), h("th", null, "ช่วงหลัง ๆ อยู่ในช่วงปกติไหม"))),
        h("tbody", null, digits.map((d, i) => {
          const a = all.digit.counts[i] / aTot, r = rec.digit.counts[i] / rTot;
          const c = rec.digit.counts[i];
          const ok = c >= rec.digit.range95[0] && c <= rec.digit.range95[1];
          return h("tr", null, h("td", { class: "mono" }, d), h("td", { class: "n" }, pct(a, 2)), h("td", { class: "n" }, pct(r, 2)),
            h("td", { class: "n" }, `${r - a >= 0 ? "+" : ""}${((r - a) * 100).toFixed(2)}`), h("td", null, ok ? h("span", { class: "chip ok" }, "ปกติ") : h("span", { class: "chip warn" }, "นอกช่วง")));
        })))),
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
      h("li", null, "เลขของแต่ละงวดคำนวณครั้งเดียว แล้วล็อกเก็บเป็น \"บันทึกการทำนาย\" ก่อนออกรางวัล ไม่มีการแก้ภายหลัง และมีรหัสตรวจสอบ (sha256) กำกับ ถ้ามีใครแก้ ระบบจะรู้และไม่นับผล"),
      h("li", null, "การจัดอันดับไม่มีการสุ่ม ข้อมูลชุดเดิมคำนวณกี่ครั้งก็ได้อันดับเดิม ถ้าคะแนนเท่ากัน เลขที่น้อยกว่าขึ้นก่อน"),
      h("li", null, "เลขจะเปลี่ยนเมื่อมีผลงวดใหม่เข้ามาเท่านั้น ตอนนั้นระบบจะทำบันทึกใหม่สำหรับงวดถัดไป ส่วนบันทึกของงวดก่อน ๆ ยังอยู่ให้ย้อนดูได้ในหน้า \"ประวัติทำนาย\"")),
    h("p", { class: "note" }, `บันทึกนี้ (เลข 6 หลัก) สร้างเมื่อ ${thDateTime(snap.created_at)} · รหัสตรวจสอบ ${sha(snap.content_sha256)}`,
      small ? ` · เลขท้าย/หน้า สร้างเมื่อ ${thDateTime(small.created_at)}${small.source === "addon" ? " (บันทึกเสริม ทำทีหลังแต่ก่อนออกรางวัล)" : ""} · รหัสตรวจสอบ ${sha(small.content_sha256)}` : ""));
}

async function pageAnalysis() {
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab") === "backtest" ? "backtest" : "rank";
  const [pidx, bt, bts] = await Promise.all([optionalData("predictions/index.json"), optionalData("analysis/backtest.json"), optionalData("analysis/backtest_small.json")]);
  const tabs = h("div", { class: "seg tabs", role: "group", "aria-label": "เลือกส่วน" },
    h("button", { type: "button", "aria-pressed": String(tab === "rank"), onclick: () => { location.search = ""; } }, "อันดับเลขงวดถัดไป"),
    h("button", { type: "button", "aria-pressed": String(tab === "backtest"), onclick: () => { location.search = "?tab=backtest"; } }, "ทดสอบย้อนหลัง"),
    h("a", { href: "history.html", class: "small" }, "ประวัติการทำนาย →"));
  const warn = h("div", { class: "callout warn" },
    h("strong", null, "คะแนนนี้ไม่ใช่โอกาสถูกรางวัล"), h("br"),
    "อันดับมาจากการให้คะแนนตามสถิติในอดีต คะแนน 100 แปลว่าสูงสุดในบรรดาเลขทั้งหมดตามวิธีนี้ ไม่ได้แปลว่ามีโอกาส 100% ",
    "เมื่อลองย้อนหลังหลายร้อยงวด วิธีนี้เลือกเลขได้ไม่ดีกว่าการสุ่ม (ดูแท็บ \"ทดสอบย้อนหลัง\")");
  const head = pageHead("วิเคราะห์เลข", "จัดอันดับเลขของงวดถัดไปจากสถิติที่ผ่านมา: เลข 6 หลักรางวัลที่ 1–5, เลขท้าย 2 ตัว, เลขท้าย 3 ตัว และเลขหน้า 3 ตัว");
  if (tab === "backtest") {
    render(head, h("section", { class: "card stack" }, tabs), backtestView(bt, params), smallBacktestView(bts), responsibleBox());
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
      ev && ev.status !== "evaluated" ? [h("dt", null, "ผล"), h("dd", null, ev.reason || "")] : null));
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
    h("thead", null, h("tr", null, h("th", { class: "n" }, "อันดับ"), h("th", null, "เลข"), h("th", { class: "n" }, "คะแนนรวม"), h("th", { class: "n" }, "ดูทุกรางวัล"), h("th", { class: "n" }, "ดูรางวัลนี้"), h("th", null, "เหตุผลหลัก"))),
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
      h("p", { class: "note" }, `"ดูทุกรางวัล" ใช้เลขรางวัลที่ 1–5 ทั้งหมด ${fmt.format(Object.values(snap.training_numbers).reduce((a, b) => a + b, 0))} เลข (และใช้เลขหน้า/ท้ายช่วยดู 3 หลักแรก/ท้าย) · "ดูรางวัลนี้" ใช้เฉพาะ ${fmt.format(snap.training_numbers[k])} เลขของ${SIX_LABEL[k]}`)),
    h("section", { class: "card section stack" },
      h("h2", null, "ถ้าใช้น้ำหนักแบบอื่น จะได้เลขอะไร"),
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
      `ผลจริง: ${res.winners.join(", ")} · ${res.hits ? `อยู่ใน ${official} อันดับแรก ${res.hits} เลข` : `ไม่อยู่ใน ${official} อันดับแรก`} (ถ้าสุ่มควรถูกราว ${fmt2.format(res.random_expected)})`) : null,
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
  const table = h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "ชุด"), h("th", { class: "n" }, "ช่วงฝึก"), h("th", { class: "n" }, "ช่วงทดสอบจริง"), h("th", null, "ช่วงคลาดเคลื่อน (ทดสอบจริง)"), h("th", { class: "n" }, "ค่า p"), h("th", { class: "n" }, "ถูกตรง (ทดสอบจริง)"))),
    h("tbody", null, rowsIds.map((id) => {
      const v = R[id].validation, hd = R[id].holdout;
      return h("tr", { class: id === chosen ? "tuned" : null },
        h("th", null, cfgLabel(id, cfgW[id]), id === chosen ? h("div", { class: "note" }, "ชุดที่เลือกใช้") : null),
        h("td", { class: "n" }, pctile(v.mean_pct)), h("td", { class: "n" }, pctile(hd.mean_pct)),
        h("td", null, hd.mean_pct_ci ? `${pctile(hd.mean_pct_ci[0])} – ${pctile(hd.mean_pct_ci[1])}` : "–"),
        h("td", { class: "n" }, hd.p_two_sided !== undefined ? fmtP(hd.p_two_sided) : "–"),
        h("td", { class: "n" }, `${hd.hits} / ${hd.draws} งวด`));
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
      h("h2", null, "ทดสอบย้อนหลัง: ถ้าใช้วิธีนี้ในอดีต จะเป็นอย่างไร"),
      h("p", null, "ก่อนแต่ละงวดในอดีต ให้ระบบใช้เฉพาะข้อมูลก่อนหน้างวดนั้น (ไม่แอบดูอนาคต) จัดอันดับเลข แล้วดูว่าเลขที่ออกจริงอยู่อันดับไหน และอยู่ในกลุ่มเลขที่เลือกไหม เทียบกับการสุ่มเลือก"),
      !bt.fresh ? h("div", { class: "callout warn" }, "ผลนี้คำนวณจากข้อมูล/การตั้งค่า/โค้ดชุดเก่า (", bt.stale_reasons.join(", "), ") จะอัปเดตในรอบถัดไปของ GitHub Actions") : null,
      h("div", { class: flagged.length ? "callout" : "callout ok" },
        h("strong", null, flagged.length ? `มี ${flagged.length} ชุดที่ต่างจากการสุ่ม (หลังปรับตามจำนวนการทดสอบ)` : "ไม่มีชุดใดดีกว่าการสุ่มอย่างชัดเจนในช่วงทดสอบจริง"), h("br"),
        `ช่วงทดสอบจริง ${e.holdout ? `${thShort(e.holdout.from)} – ${thShort(e.holdout.to)} (${fmt.format(e.holdout.draws)} งวด)` : "–"}: ชุดที่เลือกใช้ถูกตรง 6 หลักรวม ${ov.hits} เลข ถ้าสุ่มเลือกควรถูกราว ${fmt2.format(ov.expected)} (ช่วงปกติ ${ov.lo95}–${ov.hi95})`),
      h("dl", { class: "kv" },
        h("dt", null, "งวดที่ทดสอบ"), h("dd", null, `${fmt.format(e.draws)} งวด (${thShort(e.first_draw)} – ${thShort(e.last_draw)})`),
        h("dt", null, "ช่วงฝึก"), h("dd", null, e.validation ? `${thShort(e.validation.from)} – ${thShort(e.validation.to)} (${fmt.format(e.validation.draws)} งวด) ใช้เลือกชุดน้ำหนัก` : "–"),
        h("dt", null, "ช่วงทดสอบจริง"), h("dd", null, e.holdout ? `${thShort(e.holdout.from)} – ${thShort(e.holdout.to)} (${fmt.format(e.holdout.draws)} งวด) ไม่ได้ใช้เลือกค่าใด ๆ จึงเป็นการวัดผลที่ยุติธรรม` : "–"),
        h("dt", null, "ข้อมูลถึง"), h("dd", null, `${thShort(bt.data_through)} · คำนวณเมื่อ ${thDateTime(bt.backtest_generated_at)}`))),
    h("section", { class: "card section stack" },
      seg,
      h("h2", null, `${SIX_LABEL[prize]}: เลขที่ออกจริงอยู่อันดับไหน`),
      h("p", { class: "note" }, `ตัวเลขในตารางคือ เลขที่ออกจริงอยู่ตรงไหนในอันดับของวิธีนี้ เฉลี่ยกี่ % จากบนสุด (0% = อันดับ 1, 100% = อันดับสุดท้ายจาก 1 ล้านเลข) ถ้าวิธีนี้ไม่ช่วยอะไรเลยจะได้ราว 50% เหมือนการสุ่ม · ค่า p ยิ่งน้อยยิ่งต่างจากการสุ่ม (ต่ำกว่า 0.05 = ต่างชัด) · ประมาณจากเลขตัวอย่าง ${fmt.format(e.subsample)} เลข`),
      table,
      h("p", { class: "note" }, `ถูกตรง 6 หลัก = เลขที่ออกจริงอยู่ใน ${bt.candidate_counts[prize]} อันดับแรกของรางวัลเดียวกัน · ถ้าสุ่มเลือก ${bt.candidate_counts[prize]} เลขต่องวด ควรถูกราว ${rnd.holdout.expected.toFixed(3)} ครั้งในช่วงทดสอบจริง (ช่วงปกติ ${rnd.holdout.lo95}–${rnd.holdout.hi95})`)),
    h("section", { class: "card section stack" },
      h("h2", null, "ผลเปลี่ยนไปตามเวลาไหม"),
      lineChart({ values: roll, labels: bt.timeline.dates.map((d) => String(Number(d.slice(0, 4)) + 543)), ref: 0.5, band: [0.5 - 1.96 * se, 0.5 + 1.96 * se], ariaLabel: "อันดับเฉลี่ยของเลขที่ออกจริง เฉลี่ยทีละ 24 งวด", yFmt: (v) => `${(v * 100).toFixed(1)}%` }),
      h("p", { class: "note" }, `เส้น = อันดับเฉลี่ยของเลขที่ออกจริง (เฉลี่ยทีละ ${win} งวด) ของชุดที่เลือกใช้ (${tl.config}) · เส้นประ = 50% (เท่ากับสุ่ม) · แถบเขียว = ช่วงที่การสุ่มให้ได้ตามปกติ`),
      h("h3", null, "แยกเป็นช่วงเวลา"), stabTable,
      h("p", { class: "note" }, "ถ้าวิธีนี้ช่วยได้จริง ควรต่ำกว่า 50% ทุกช่วงอย่างสม่ำเสมอ ไม่ใช่เฉพาะบางช่วง")));
}

function smallBacktestView(bts) {
  if (!bts) return null;
  const splitLabel = { validation: "ก่อน 2560", holdout: "ตั้งแต่ 2560 (ทดสอบจริง)", all: "ทั้งหมด" };
  return h("section", { class: "card section stack" },
    h("h2", null, "ทดสอบย้อนหลัง: เลขท้าย 2 ตัว / ท้าย 3 ตัว / หน้า 3 ตัว"),
    !bts.fresh ? h("div", { class: "callout warn" }, "ผลนี้คำนวณจากข้อมูล/การตั้งค่า/โค้ดชุดเก่า จะอัปเดตในรอบถัดไปของ GitHub Actions") : null,
    h("p", { class: "note" }, `ก่อนแต่ละงวด จัดอันดับเลขจากงวดก่อนหน้าเท่านั้น แล้วนับว่าเลขที่ออกจริงอยู่ในกลุ่มที่เลือกกี่ครั้ง (เลขท้าย 2 ตัว ${bts.candidate_counts.last2} เลข, เลขท้าย 3 ตัว ${bts.candidate_counts.back3} เลข, เลขหน้า 3 ตัว ${bts.candidate_counts.front3} เลข) เทียบกับที่การสุ่มเลือกควรได้ · เริ่มทดสอบเมื่อมีข้อมูลก่อนหน้าอย่างน้อย 100 งวด`),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "รางวัล"), h("th", null, "ช่วง"), h("th", { class: "n" }, "งวด"), h("th", { class: "n" }, "ถูก"), h("th", { class: "n" }, "ถ้าสุ่มควรถูก"), h("th", null, "ช่วงปกติ"), h("th", { class: "n" }, "อันดับเฉลี่ย"))),
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
            h("td", { class: "n" }, x.random ? fmt1.format(x.random.expected) : "–"),
            h("td", null, x.random ? [`${x.random.lo95}–${x.random.hi95} `, h("span", { class: `chip ${ok ? "ok" : "warn"}` }, ok ? "เหมือนสุ่ม" : "นอกช่วง")] : "–"),
            h("td", { class: "n" }, pctile(x.mean_pct)));
        }));
      }))),
    h("p", { class: "note" }, "\"อันดับเฉลี่ย\" = เลขที่ออกจริงอยู่ตรงไหนในอันดับ เฉลี่ยกี่ % จากบนสุด ถ้าเหมือนสุ่มจะได้ราว 50% · ถ้าจำนวนที่ถูกอยู่ในช่วงปกติ แปลว่าวิธีนี้ไม่ได้ดีกว่าการสุ่มเลือก · เลขหน้า 3 ตัวเริ่มมีปี 2558 จึงทดสอบได้เฉพาะช่วงหลัง"),
    h("p", { class: "note" }, `ข้อมูลถึง ${thShort(bts.data_through)} · คำนวณเมื่อ ${thDateTime(bts.backtest_generated_at)}`));
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
        stat("เลข 6 หลักถูกตรงรวม", `${fmt.format(hits)}`),
        stat("ถ้าสุ่มควรถูกราว", fmt2.format(expected))),
      h("p", { class: "note" }, `เริ่มบันทึกหลังงวด ${thShort(pidx.tracking_since)} · งวดหลังจากนั้นที่ไม่มีบันทึกก่อนออกรางวัลถือว่าตรวจผลไม่ได้ (${fmt.format(noSnap)} งวด) · ผลลองย้อนหลังดูได้ที่ `, h("a", { href: "analysis.html?tab=backtest" }, "ทดสอบย้อนหลัง")),
      chrono.length >= 2 ? [h("h2", null, "ถูกสะสมเทียบการสุ่ม"),
        lineChart({ values: cumH, labels: chrono.map((x) => thShort(x.actual_draw_date)), ref: null, ariaLabel: "จำนวนเลขที่ถูกสะสม", yMin: 0, yMax: Math.max(1, ...cumH, ...cumE) }),
        h("p", { class: "note" }, `เส้น = ถูกสะสมจริง · ถ้าสุ่มควรถูกรวมราว ${fmt2.format(ce)} เลข`)] : null),
    h("section", { class: "card section stack" },
      h("h2", null, "บันทึกทั้งหมด"),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "งวดที่ทำนาย"), h("th", null, "บันทึกเมื่อ"), h("th", null, "ข้อมูลถึง"), h("th", null, "บันทึกก่อนออกรางวัล"), h("th", null, "สถานะ"), h("th", { class: "n" }, "6 หลัก ถูก / ควรถูกถ้าสุ่ม"), h("th", null, "เลขท้าย/หน้า ถูก"))),
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
      h("thead", null, h("tr", null, h("th", null, "รางวัล"), h("th", null, "เลขที่ทำนาย"), h("th", { class: "n" }, "ถูกตรง"), h("th", { class: "n" }, "ถ้าสุ่มควรถูก"))),
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
  ];
  const testTable = h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "การทดสอบ"), h("th", null, "ช่วง"), h("th", { class: "n" }, "ค่า p"), h("th", { class: "n" }, "ค่า p หลังปรับ"), h("th", null, "ผล"))),
    groups.map(([g, title]) => h("tbody", null,
      h("tr", null, h("th", { colspan: "5" }, title)),
      r.tests.filter((t) => t.group === g).map((t) => h("tr", null,
        h("td", null, g === "number" ? PRIZE_LABEL[t.label] : g === "prize_digits" ? TRUST[t.trust_level].label : t.label),
        h("td", null, ERA_LABEL[t.era] || t.era),
        h("td", { class: "n" }, fmtP(t.p)),
        h("td", { class: "n" }, fmtP(t.p_bonferroni)),
        h("td", null, t.p_bonferroni < 0.05 ? h("span", { class: "chip warn" }, "ผิดปกติ")
          : t.p < 0.05 ? h("span", { class: "chip gray" }, "บังเอิญได้") : h("span", { class: "chip ok" }, "ปกติ"))))))));

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
        h("br"),
        "ผลสลากออกมาเหมือนการสุ่มที่ยุติธรรม ไม่มีสถิติใดในข้อมูลนี้ที่ช่วยเดาเลขงวดถัดไปได้")),
    h("div", { class: "grid grid-2e section" },
      h("section", { class: "card stack" },
        h("h2", null, "ถ้าเลือกเลขตามสถิติ จะถูกบ่อยขึ้นไหม?"),
        h("p", { class: "small muted" }, `ลองย้อนหลัง ${fmt.format(bt.trials)} งวด: ก่อนแต่ละงวดใช้เฉพาะข้อมูลก่อนหน้า เลือกเลขท้าย 2 ตัว ${bt.pick} ตัวตามวิธีนั้น แล้วนับว่าถูกกี่ครั้ง`),
        btBars,
        h("p", { class: "small muted" }, `เส้นตั้ง = โอกาสถ้าเลือกมั่ว ${pct(bt.chance_rate, 0)} · แถบเขียว = ช่วงที่การเลือกมั่วให้ได้ตามปกติ (${pct(bt.chance_range95[0])}–${pct(bt.chance_range95[1])})`),
        h("p", null, bt.strategies.every((st) => st.rate >= bt.chance_range95[0] && st.rate <= bt.chance_range95[1])
          ? "ทุกวิธีได้ผลพอ ๆ กับการเลือกมั่ว"
          : "มีบางวิธีอยู่นอกช่วงปกติ (ดูผลทดสอบอื่นประกอบ เพราะลองหลายวิธี ย่อมเจอบางวิธีโดยบังเอิญ)")),
      h("section", { class: "card stack" },
        h("h2", null, "งวดก่อนบอกอะไรเกี่ยวกับงวดถัดไปไหม?"),
        h("div", { class: "stat-row" }, stat("ความเกี่ยวข้องกับงวดก่อน", ac.r.toFixed(3)), stat("ช่วงปกติ", `±${ac.range95[1].toFixed(3)}`)),
        h("p", { class: "small muted" }, "วัดว่าเลขท้าย 2 ตัวของงวดหนึ่งเกี่ยวกับงวดถัดไปไหม (ค่า -1 ถึง 1) ค่าใกล้ 0 แปลว่าไม่เกี่ยวกัน"),
        h("h2", { class: "section" }, "ซื้อ 1 ใบ ได้คืนเฉลี่ยเท่าไร"),
        h("div", { class: "stat-row" }, stat("ราคาสลาก", "80 บาท"), stat("รางวัลเฉลี่ยต่อใบ", `${fmt.format(perTicket)} บาท`)),
        h("p", { class: "small muted" }, `จากเงินรางวัลรวม ${fmt.format(total)} บาทต่อสลาก 1 ล้านใบ (อัตรารางวัลปัจจุบัน โปรดตรวจสอบกับ GLO) ได้คืนเฉลี่ย ${pct(perTicket / 80, 0)} ของราคา`))),
    h("section", { class: "card section stack" },
      h("h2", null, "ผลการทดสอบทั้งหมด"),
      h("p", { class: "small muted" }, `ค่า p คือโอกาสที่การสุ่มจริงจะให้ผลเบี้ยวอย่างน้อยเท่านี้ ยิ่งน้อยยิ่งน่าสงสัย ถ้าทดสอบหลายแบบ ย่อมมีบางแบบที่ต่ำกว่า 0.05 โดยบังเอิญ (ทดสอบ ${r.test_count} แบบ น่าจะเจอราว ${fmt1.format(r.test_count * 0.05)} แบบ เจอจริง ${rawFlag.length} แบบ) จึงปรับโดยคูณค่า p ด้วยจำนวนการทดสอบ`),
      testTable,
      h("p", { class: "small muted" }, "ตัวอย่าง: หลักหน่วยของรางวัลที่ 1 มีค่า p ต่ำ แต่หลังปรับแล้วไม่ผิดปกติ · ตัวเลขในรางวัลที่ 2–5 ผิดปกติเล็กน้อยเฉพาะข้อมูลแหล่งเดียวที่ยังไม่ได้ตรวจทาน ส่วนข้อมูลทางการกระจายเท่ากัน แสดงว่าคุณภาพข้อมูลมีผลต่อสถิติ")),
    responsibleBox());
}

// ---------- page: data ----------
async function pageData() {
  const [m, ver] = await Promise.all([manifest(), getData("verification.json")]);
  const t = m.by_trust;
  render(
    pageHead("ข้อมูลและแหล่งที่มา", `อัปเดตล่าสุด: งวด ${m.latest_draw_th}${ver.last_import ? ` · ดึงจาก GLO เมื่อ ${thDateTime(ver.last_import.retrieved_at)}` : ""}`),
    h("div", { class: "grid grid-2e" },
      h("section", { class: "card stack" },
        h("h2", null, "แหล่งข้อมูล"),
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
        h("tr", null, h("th", null, "SHA-256 ของ CSV"), h("td", { class: "mono small" }, m.csv_sha256)),
        h("tr", null, h("th", null, "สร้างเมื่อ (UTC)"), h("td", null, m.generated_at)),
        h("tr", null, h("th", null, "เวอร์ชัน"), h("td", { class: "mono" }, m.version)),
        m.run_id ? h("tr", null, h("th", null, "GitHub Actions run"), h("td", { class: "mono" }, m.run_id)) : null))),
      h("p", { class: "small muted" }, "ข้อมูลทุกงวดผ่านการตรวจรูปแบบอัตโนมัติก่อนขึ้นเว็บ (จำนวนหมายเลขตามยุค, ตัวเลขล้วน, วันที่, แหล่งที่มา) ถ้าไม่ผ่าน เว็บจะไม่ถูกอัปเดต · ค่า SHA-256 ใช้เทียบกับไฟล์ใน GitHub ได้ว่าตรงกัน")),
    h("section", { class: "card section stack" },
      h("h2", null, "วิธีคำนวณ"),
      h("ul", null,
        h("li", null, "ความถี่นับเฉพาะงวดที่มีรางวัลนั้น งวดที่ไม่มีรางวัลหรือไม่มีข้อมูลไม่นับเป็น 0"),
        h("li", null, "\"ถ้าสุ่ม ควรออกราว\" = จำนวนเลขที่ออกทั้งหมด ÷ จำนวนเลขที่เป็นไปได้ (100 หรือ 1,000)"),
        h("li", null, "\"ช่วงปกติ\" = ถ้าสุ่มจริง 95 ใน 100 เลขจะออกจำนวนครั้งอยู่ในช่วงนี้"),
        h("li", null, "\"ค่า p\" บอกว่าภาพรวมต่างจากการสุ่มแค่ไหน ยิ่งน้อยยิ่งต่าง (ต่ำกว่า 0.05 = ต่างชัด) และปรับเมื่อทดสอบหลายแบบ"),
        h("li", null, "การทดสอบย้อนหลังใช้เฉพาะข้อมูลก่อนหน้าแต่ละงวด ไม่แอบดูข้อมูลอนาคต"),
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
  index: pageHome, results: pageResults, stats: pageStats, analysis: pageAnalysis, history: pageHistory, random: pageRandom, data: pageData,
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
