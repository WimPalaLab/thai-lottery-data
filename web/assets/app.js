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
  digit: "ความถี่ตัวเลข 0–9", position: "ความถี่ตามตำแหน่ง", pattern: "คู่/สามตัว/รูปแบบเลข",
  time_window: "ช่วงล่าสุด", distribution: "ผลรวม/คู่คี่/สูงต่ำ", statistical: "Markov ตามตำแหน่ง",
};
const SCOPE_LABEL = { global: "Global", prize: "เฉพาะรางวัล" };
const STATUS = {
  pending: { label: "รอผล", cls: "" },
  evaluated: { label: "ประเมินแล้ว", cls: "ok" },
  not_evaluable: { label: "ประเมินไม่ได้", cls: "warn" },
  no_snapshot: { label: "ไม่มี snapshot", cls: "gray" },
  invalid: { label: "snapshot ถูกแก้", cls: "err" },
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
  if (id === "global") return "Global อย่างเดียว";
  if (id === "prize") return "เฉพาะรางวัลอย่างเดียว";
  if (id === "tuned") return "ชุดที่เลือกจาก validation";
  return `ชุด ${id} (Global ${Math.round(w * 100)}% / เฉพาะรางวัล ${Math.round((1 - w) * 100)}%)`;
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
      nextCard = h("section", { class: "card section stack next-card" },
        h("div", { class: "row" }, h("h2", null, `อันดับจากโมเดล: งวด ${thShort(sn.target_draw_date)}`), h("span", { class: "spacer" }), statusChip(pd.evaluation ? pd.evaluation.status : "pending")),
        h("div", { class: "grid grid-2e" }, ["first", "second"].map((k) => h("div", { class: "stack" },
          h("div", { class: "small muted" }, `${SIX_LABEL[k]} · ${sn.candidate_counts[k]} อันดับแรก`),
          h("div", { class: "num-list" }, sn.predictions[k].slice(0, sn.candidate_counts[k]).map((r) => h("span", null, r.number)))))),
        h("p", { class: "note" }, `คะแนนเปรียบเทียบจาก Hybrid model (ข้อมูลถึง ${thShort(sn.training_data_through)}) ไม่ใช่โอกาสถูกรางวัล · backtest ย้อนหลังไม่ดีกว่าการสุ่ม · `,
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
        " หรือ ", h("a", { href: "stats.html" }, "ความถี่เทียบกับค่าที่คาดไว้"))));
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
        ? h("p", null, hist.status === "evaluated" ? `ถูกตรง 6 หลัก ${hist.exact_hits_total} เลข (ถ้าสุ่มคาดไว้ ${hist.random_expected_total.toFixed(4)}) · ` : "",
          h("a", { href: `history.html?d=${hist.snapshot}` }, "ดูรายละเอียด"))
        : h("p", { class: "muted small" }, "ไม่มี snapshot ที่สร้างก่อนออกรางวัลงวดนี้ จึงประเมินไม่ได้ (ไม่สร้างย้อนหลัง)")) : null);
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

async function statsShort(modeSeg) {
  const [freq, idx] = await Promise.all([getData("stats/frequency.json"), index()]);
  const state = { prize: "last2", period: "all", selected: null };
  const body = h("div");
  const prizes = [["last2", "เลขท้าย 2 ตัว"], ["back3", "เลขท้าย 3 ตัว"], ["front3", "เลขหน้า 3 ตัว"]];
  const seg = h("div", { class: "seg", role: "group", "aria-label": "เลือกรางวัล" });
  const periodSel = h("select", { id: "period", "aria-label": "ช่วงเวลา" },
    freq.periods.map((k) => h("option", { value: k }, freq.data[k].label)));
  function draw() {
    seg.replaceChildren(...prizes.map(([k, label]) => h("button", {
      type: "button", "aria-pressed": String(state.prize === k),
      onclick: () => { state.prize = k; state.selected = null; draw(); },
    }, label)));
    const f = freq.data[state.period][state.prize];
    body.replaceChildren(...statsBody(f, state, idx, draw));
  }
  periodSel.addEventListener("change", () => { state.period = periodSel.value; state.selected = null; draw(); });
  render(
    pageHead("สถิติความถี่", "ทุกตัวเลขเทียบกับค่าที่คาดไว้ถ้าการออกรางวัลสุ่มจริง"),
    h("section", { class: "card stack" },
      modeSeg,
      seg,
      h("div", { class: "row" }, h("label", { for: "period", class: "small muted" }, "ช่วงเวลา"), periodSel)),
    body);
  draw();
}

function statsBody(f, state, idx, redraw) {
  const width = state.prize === "last2" ? 2 : 3;
  const keyOf = (i) => String(i).padStart(width, "0");
  const outside = f.counts.filter((c) => c < f.range95[0] || c > f.range95[1]).length;
  const space = f.counts.length;
  const summary = h("section", { class: "card section stack" },
    h("div", { class: "stat-row" },
      stat("งวดที่มีรางวัลนี้", fmt.format(f.eligible_draws)),
      stat("จำนวนหมายเลขที่ออก", fmt.format(f.slots), "บางรางวัลมีหลายหมายเลขต่องวด"),
      stat("คาดไว้ต่อเลข", fmt2.format(f.expected)),
      stat("ช่วงปกติ 95%", `${f.range95[0]}–${f.range95[1]} ครั้ง`)),
    h("p", { class: "small muted" },
      `ช่วง ${thShort(f.first_draw)} – ${thShort(f.last_draw)}`,
      state.prize === "back3" ? " · ก่อน 1 ก.ย. 2558 มี 4 หมายเลขต่องวด หลังจากนั้น 2 หมายเลข จึงนับเป็นจำนวนหมายเลข ไม่ใช่จำนวนงวด" : "",
      state.prize === "front3" ? " · เลขหน้า 3 ตัวเริ่มมีตั้งแต่ 1 ก.ย. 2558 งวดก่อนหน้าไม่นับในตัวหาร" : ""),
    h("div", { class: f.chi_square.p >= 0.05 ? "callout ok" : "callout" },
      h("strong", null, `Chi-square p = ${fmtP(f.chi_square.p)}`), " — ",
      f.chi_square.p >= 0.05
        ? "การกระจายของตัวเลขไม่ต่างจากการสุ่มอย่างมีนัยสำคัญ"
        : "การกระจายต่างจากการสุ่มอย่างมีนัยสำคัญที่ระดับ 5% (ดูการปรับสำหรับทดสอบหลายครั้งในหน้า \"สุ่มจริงไหม\")",
      h("br"),
      h("span", { class: "small" },
        `มี ${outside} จาก ${fmt.format(space)} เลขที่อยู่นอกช่วงปกติ 95% (ถ้าสุ่มจริงคาดว่าจะมีราว ${Math.round(space * 0.05)} เลข)`)));

  const detail = h("div", { class: "stack" });
  function showDetail(num) {
    const i = Number(num);
    const dates = idx.filter((r) => (state.prize === "last2" ? r.last2 === num : r[state.prize].includes(num))
      && periodHas(state.period, r, idx)).map((r) => r.draw_date).reverse();
    detail.replaceChildren(
      h("h3", null, `เลข ${num}`),
      h("p", null, `ออก ${fmt.format(f.counts[i])} ครั้ง (คาดไว้ ${fmt2.format(f.expected)}, ช่วงปกติ ${f.range95[0]}–${f.range95[1]})`),
      dates.length
        ? h("div", { class: "num-grid" }, dates.map((dt) => h("a", { href: `results.html?d=${dt}`, class: "small" }, thShort(dt))))
        : h("p", { class: "empty" }, "ไม่เคยออกในช่วงนี้"));
  }

  const parts = [summary];
  if (state.prize === "last2") {
    const grid = h("div", { class: "heatmap", role: "group", "aria-label": "แผนที่ความถี่เลขท้าย 2 ตัว 00–99" });
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
    const legendBar = h("span", { class: "bar" });
    legendBar.style.background = "linear-gradient(90deg, color-mix(in srgb, var(--lo) 70%, var(--card)), var(--card), color-mix(in srgb, var(--hi) 70%, var(--card)))";
    parts.push(h("section", { class: "card section stack" },
      h("h2", null, "แผนที่ความถี่ 00–99"),
      h("div", { class: "legend" }, "น้อยกว่าที่คาด", legendBar, "มากกว่าที่คาด", h("span", null, "· กรอบ = นอกช่วงปกติ 95%")),
      grid,
      h("p", { class: "small muted" }, "สีแสดงระยะห่างจากค่าที่คาดไว้ ไม่ใช่โอกาสของงวดหน้า เลขที่ออกบ่อยหรือน้อยในอดีตมีโอกาสออกงวดหน้าเท่ากับเลขอื่น (1 ใน 100)"),
      detail,
      freqTable(f, keyOf)));
  } else {
    const input = h("input", { id: "lookup", type: "text", inputmode: "numeric", maxlength: "3", autocomplete: "off", placeholder: "000–999" });
    const err = h("p", { class: "error-text", role: "alert" });
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "").slice(0, 3);
      err.textContent = "";
      if (input.value.length === 3) showDetail(input.value);
    });
    parts.push(
      h("section", { class: "card section stack" },
        h("h2", null, "มีกี่เลขที่ออก 0, 1, 2, … ครั้ง"),
        h("p", { class: "small muted" }, `เลข 3 ตัวมี 1,000 แบบ แต่แต่ละเลขออกเฉลี่ยเพียง ${fmt2.format(f.expected)} ครั้ง ความถี่รายเลขจึงเป็นสัญญาณรบกวนเกือบทั้งหมด กราฟนี้เทียบรูปแบบรวมกับที่คาดไว้แทน`),
        histogram(f.count_histogram)),
      h("section", { class: "card section stack" },
        h("div", { class: "field" }, h("label", { for: "lookup" }, "ดูเลข 3 ตัว"), input), err, detail));
  }
  return parts;
}

function periodHas(period, row, idx) {
  if (period === "all") return true;
  if (period === "e3") return row.era === "E3";
  if (period === "official") return row.trust_level === "official";
  if (period === "last5y") {
    const last = idx[idx.length - 1].draw_date;
    const cut = `${Number(last.slice(0, 4)) - 5}${last.slice(4)}`;
    return row.draw_date > cut;
  }
  return true;
}

function freqTable(f, keyOf) {
  return h("details", null,
    h("summary", null, "แสดงเป็นตาราง"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "เลข"), h("th", { class: "n" }, "ออก (ครั้ง)"), h("th", { class: "n" }, "คาดไว้"), h("th", { class: "n" }, "ต่างจากที่คาด"))),
      h("tbody", null, f.counts.map((c, i) => h("tr", null,
        h("td", { class: "mono" }, keyOf(i)), h("td", { class: "n" }, c), h("td", { class: "n" }, fmt2.format(f.expected)),
        h("td", { class: "n" }, (c - f.expected >= 0 ? "+" : "") + fmt1.format(c - f.expected))))))));
}

function histogram(hist) {
  const W = 640, H = 240, padL = 40, padB = 34, padT = 12;
  const n = hist.observed.length;
  const max = Math.max(...hist.observed, ...hist.expected);
  const bw = (W - padL - 10) / n;
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "จำนวนเลขที่ออกแต่ละจำนวนครั้ง เทียบกับที่คาดไว้" });
  for (let t = 0; t <= 4; t++) {
    const v = (max * t) / 4;
    svg.append(s("line", { x1: padL, x2: W - 10, y1: y(v), y2: y(v), stroke: "currentColor", "stroke-opacity": 0.1 }));
    svg.append(s("text", { x: padL - 6, y: y(v) + 4, "text-anchor": "end" }, Math.round(v)));
  }
  hist.observed.forEach((v, k) => {
    const x = padL + k * bw;
    const bar = s("rect", { x: x + bw * 0.15, y: y(v), width: bw * 0.7, height: H - padB - y(v), rx: 3, fill: "var(--accent)" });
    bar.append(s("title", null, `ออก ${k} ครั้ง: ${v} เลข (คาดไว้ ${hist.expected[k].toFixed(1)})`));
    svg.append(bar);
    svg.append(s("text", { x: x + bw / 2, y: H - padB + 16, "text-anchor": "middle" }, k));
  });
  const pts = hist.expected.map((v, k) => `${padL + k * bw + bw / 2},${y(v)}`).join(" ");
  svg.append(s("polyline", { points: pts, fill: "none", stroke: "var(--hi)", "stroke-width": 2.5 }));
  hist.expected.forEach((v, k) => svg.append(s("circle", { cx: padL + k * bw + bw / 2, cy: y(v), r: 3.5, fill: "var(--hi)" })));
  svg.append(s("text", { x: (W + padL) / 2, y: H - 4, "text-anchor": "middle" }, "จำนวนครั้งที่ออก"));
  const legend = h("div", { class: "legend" }, "แท่ง = จำนวนเลขจริง · เส้นส้ม = ที่คาดไว้ถ้าสุ่มจริง");
  const table = h("details", null, h("summary", null, "แสดงเป็นตาราง"), h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "ออก (ครั้ง)"), h("th", { class: "n" }, "จำนวนเลขจริง"), h("th", { class: "n" }, "คาดไว้"))),
    h("tbody", null, hist.observed.map((v, k) => h("tr", null, h("td", null, k), h("td", { class: "n" }, v), h("td", { class: "n" }, fmt1.format(hist.expected[k]))))))));
  return [h("div", { class: "chart" }, svg), legend, table];
}

// ---------- generic charts ----------
// แท่ง = ค่าจริง, เส้น/จุดส้ม = ค่าที่คาดไว้ถ้าสุ่ม, แถบเขียว = ช่วงปกติ 95% (ถ้ามี)
function barChart({ labels, values, expected, band, ariaLabel, xTitle, every }) {
  const W = 640, H = 230, padL = 48, padB = xTitle ? 40 : 28, padT = 12, padR = 8;
  const n = values.length;
  const max = Math.max(1, ...values, ...(expected || []), band ? band[1] : 0) * 1.08;
  const bw = (W - padL - padR) / n;
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": ariaLabel });
  for (let t = 0; t <= 4; t++) {
    const v = (max * t) / 4;
    svg.append(s("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: "currentColor", "stroke-opacity": 0.1 }));
    svg.append(s("text", { x: padL - 6, y: y(v) + 4, "text-anchor": "end" }, fmt.format(Math.round(v))));
  }
  if (band) {
    svg.append(s("rect", { x: padL, width: W - padL - padR, y: y(band[1]), height: Math.max(1, y(band[0]) - y(band[1])), fill: "var(--ok)", "fill-opacity": 0.13 }));
  }
  const step = every || (n > 24 ? Math.ceil(n / 12) : 1);
  values.forEach((v, i) => {
    const x = padL + i * bw;
    const bar = s("rect", { x: x + bw * 0.15, y: y(v), width: Math.max(1, bw * 0.7), height: H - padB - y(v), rx: Math.min(3, bw / 4), fill: "var(--accent)" });
    bar.append(s("title", null, `${labels[i]}: ${fmt.format(v)}${expected ? ` (คาดไว้ ${fmt1.format(expected[i])})` : ""}`));
    svg.append(bar);
    if (i % step === 0) svg.append(s("text", { x: x + bw / 2, y: H - padB + 15, "text-anchor": "middle" }, labels[i]));
  });
  if (expected) {
    const pts = expected.map((v, i) => `${padL + i * bw + bw / 2},${y(v)}`).join(" ");
    svg.append(s("polyline", { points: pts, fill: "none", stroke: "var(--hi)", "stroke-width": 2.2 }));
    if (n <= 24) expected.forEach((v, i) => svg.append(s("circle", { cx: padL + i * bw + bw / 2, cy: y(v), r: 3.2, fill: "var(--hi)" })));
  }
  if (xTitle) svg.append(s("text", { x: (W + padL) / 2, y: H - 4, "text-anchor": "middle" }, xTitle));
  const legend = h("div", { class: "legend" }, "แท่ง = ค่าจริง", expected ? " · เส้นส้ม = ที่คาดไว้ถ้าสุ่มจริง" : "", band ? " · แถบเขียว = ช่วงปกติ 95%" : "");
  return [h("div", { class: "chart" }, svg), legend];
}

// เส้นเวลา: values (อาจมี null) เทียบเส้นอ้างอิงและแถบ
function lineChart({ values, labels, ref, band, ariaLabel, yFmt, yMin, yMax }) {
  const W = 640, H = 220, padL = 52, padB = 28, padT = 10, padR = 10;
  const n = values.length;
  const vals = values.filter((v) => v !== null);
  const lo = yMin !== undefined ? yMin : Math.min(...vals, band ? band[0] : Infinity, ref ?? Infinity);
  const hi = yMax !== undefined ? yMax : Math.max(...vals, band ? band[1] : -Infinity, ref ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v) => H - padB - ((v - lo) / span) * (H - padB - padT);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": ariaLabel });
  for (let t = 0; t <= 4; t++) {
    const v = lo + (span * t) / 4;
    svg.append(s("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: "currentColor", "stroke-opacity": 0.1 }));
    svg.append(s("text", { x: padL - 6, y: y(v) + 4, "text-anchor": "end" }, yFmt ? yFmt(v) : fmt1.format(v)));
  }
  if (band) svg.append(s("rect", { x: padL, width: W - padL - padR, y: y(band[1]), height: Math.max(1, y(band[0]) - y(band[1])), fill: "var(--ok)", "fill-opacity": 0.13 }));
  if (ref !== undefined && ref !== null) svg.append(s("line", { x1: padL, x2: W - padR, y1: y(ref), y2: y(ref), stroke: "var(--text)", "stroke-width": 1.5, "stroke-dasharray": "4 4" }));
  let d = "";
  values.forEach((v, i) => { if (v !== null) d += `${d && values[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
  svg.append(s("path", { d, fill: "none", stroke: "var(--accent)", "stroke-width": 2 }));
  const ticks = Math.min(6, n);
  for (let t = 0; t < ticks; t++) {
    const i = Math.round((t * (n - 1)) / Math.max(1, ticks - 1));
    svg.append(s("text", { x: x(i), y: H - 8, "text-anchor": t === 0 ? "start" : t === ticks - 1 ? "end" : "middle" }, labels[i]));
  }
  return h("div", { class: "chart" }, svg);
}

function distTable(head, labels, observed, expected) {
  return h("details", null, h("summary", null, "แสดงเป็นตาราง"), h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, head), h("th", { class: "n" }, "จริง"), h("th", { class: "n" }, "คาดไว้"), h("th", { class: "n" }, "ต่าง"))),
    h("tbody", null, observed.map((o, i) => h("tr", null, h("td", null, labels[i]), h("td", { class: "n" }, fmt.format(o)),
      h("td", { class: "n" }, fmt1.format(expected[i])), h("td", { class: "n" }, (o - expected[i] >= 0 ? "+" : "") + fmt1.format(o - expected[i]))))))));
}

function chiLine(chi) {
  if (!chi) return h("p", { class: "note" }, "ข้อมูลน้อยเกินไปสำหรับ chi-square");
  return h("p", { class: "note" }, `Chi-square p = ${fmtP(chi.p)} — `,
    chi.p >= 0.05 ? "ไม่ต่างจากการสุ่มอย่างมีนัยสำคัญ" : "ต่างจากการสุ่มที่ระดับ 5% (ทดสอบหลายแบบ ย่อมเจอบางแบบโดยบังเอิญ)");
}

// ---------- stats: six-digit ----------
async function statsSix(modeSeg) {
  const six = await getData("stats/sixdigit.json");
  const params = new URLSearchParams(location.search);
  const state = {
    prize: six.prizes.includes(params.get("p")) ? params.get("p") : "all",
    period: six.periods.includes(params.get("t")) ? params.get("t") : "all",
  };
  const seg = h("div", { class: "seg", role: "group", "aria-label": "เลือกรางวัล" });
  const periodSel = h("select", { id: "period", "aria-label": "ช่วงเวลา" },
    six.periods.map((k) => h("option", { value: k, selected: k === state.period }, six.data[k].label)));
  const body = h("div");
  function draw() {
    seg.replaceChildren(...six.prizes.map((k) => h("button", {
      type: "button", "aria-pressed": String(state.prize === k),
      onclick: () => { state.prize = k; draw(); },
    }, SIX_LABEL[k])));
    body.replaceChildren(...sixBody(six, state));
  }
  periodSel.addEventListener("change", () => { state.period = periodSel.value; draw(); });
  render(
    pageHead("สถิติเลข 6 หลัก", "ตัวเลขในรางวัลที่ 1–5 เทียบกับค่าที่คาดไว้ถ้าทุกเลข 000000–999999 มีโอกาสเท่ากัน"),
    h("section", { class: "card stack" }, modeSeg, seg,
      h("div", { class: "row" }, h("label", { for: "period", class: "small muted" }, "ช่วงเวลา"), periodSel)),
    body);
  draw();
}

function sixBody(six, state) {
  const f = six.data[state.period][state.prize];
  if (!f.numbers) return [h("section", { class: "card section" }, h("p", { class: "empty" }, "ไม่มีข้อมูลรางวัลนี้ในช่วงเวลาที่เลือก"))];
  const sample = `จาก ${fmt.format(f.numbers)} เลข ใน ${fmt.format(f.draws)} งวด (${thShort(f.first_draw)} – ${thShort(f.last_draw)})`;
  const digits = [...Array(10).keys()].map(String);
  const parts = [];
  parts.push(h("section", { class: "card section stack" },
    h("div", { class: "stat-row" },
      stat("เลข 6 หลัก", fmt.format(f.numbers)),
      stat("งวด", fmt.format(f.draws)),
      stat("ตัวเลขทุกหลัก", fmt.format(f.numbers * 6)),
      stat("คาดไว้ต่อตัวเลข", fmt.format(Math.round(f.digit.expected)))),
    h("p", { class: "note" }, sample,
      state.prize === "all" ? " · รางวัลที่ 5 มี 100 เลขต่องวด รางวัลที่ 1 มีเลขเดียว ภาพรวมจึงเป็นของรางวัลที่ 4–5 เป็นหลัก" : "",
      state.prize === "first" ? " · รางวัลที่ 1 มีงวดละ 1 เลข ข้อมูลน้อย ความผันผวนจึงสูง" : "",
      " · ไม่รวมรางวัลข้างเคียง (ได้จากรางวัลที่ 1 ±1) และไม่รวมเลขหน้า/ท้าย 3 ตัว หรือท้าย 2 ตัว (ไม่ใช่เลข 6 หลัก)")));

  parts.push(h("section", { class: "card section stack" },
    h("h2", null, "ตัวเลข 0–9 (ทุกหลักรวมกัน)"),
    barChart({ labels: digits, values: f.digit.counts, expected: digits.map(() => f.digit.expected), band: f.digit.range95, ariaLabel: "ความถี่ตัวเลข 0 ถึง 9" }),
    chiLine(f.digit.chi_square),
    h("p", { class: "note" }, `${sample} · ช่วงปกติ 95% = ${fmt.format(f.digit.range95[0])}–${fmt.format(f.digit.range95[1])} ครั้ง`)));

  const posHeat = h("div", { class: "pos-heat", role: "table", "aria-label": "ความถี่ตัวเลขแยกตามตำแหน่ง" },
    h("div", { class: "lab" }, "หลัก"), digits.map((d) => h("div", { class: "lab" }, d)));
  f.position.forEach((p, i) => {
    posHeat.append(h("div", { class: "lab" }, `ที่ ${i + 1}`));
    p.counts.forEach((c, d) => {
      const out = c < p.range95[0] || c > p.range95[1];
      const cell = h("div", { class: out ? "out" : null, title: `หลักที่ ${i + 1} เลข ${d}: ${c} ครั้ง (คาดไว้ ${fmt1.format(p.expected)})`, "aria-label": `หลักที่ ${i + 1} เลข ${d} ${c} ครั้ง` }, fmt.format(c));
      cell.style.background = zColor(c, p.expected);
      posHeat.append(cell);
    });
  });
  parts.push(h("section", { class: "card section stack" },
    h("h2", null, "ตัวเลขแยก 6 ตำแหน่ง"),
    h("div", { class: "table-wrap" }, posHeat),
    h("div", { class: "legend" }, "สีส้ม = มากกว่าที่คาด · น้ำเงิน = น้อยกว่า · กรอบ = นอกช่วงปกติ 95%"),
    h("p", { class: "note" }, `แต่ละช่องคาดไว้ ${fmt1.format(f.position[0].expected)} ครั้ง (ช่วงปกติ ${f.position[0].range95[0]}–${f.position[0].range95[1]}) · มี 60 ช่อง ถ้าสุ่มจริงจะมีราว 3 ช่องอยู่นอกช่วงปกติ · ${sample}`),
    h("details", null, h("summary", null, "Chi-square แต่ละตำแหน่ง"),
      h("ul", null, f.position.map((p, i) => h("li", null, `หลักที่ ${i + 1}: p = ${fmtP(p.chi_square.p)}`))))));

  const pairGrid = h("div", { class: "heatmap static", role: "img", "aria-label": "ความถี่คู่ตัวเลขติดกัน 00–99" });
  f.pair.counts.forEach((c, i) => {
    const out = c < f.pair.range95[0] || c > f.pair.range95[1];
    const cell = h("div", { class: out ? "out" : null, title: `คู่ ${String(i).padStart(2, "0")}: ${c} ครั้ง` },
      h("span", null, String(i).padStart(2, "0")), h("span", { class: "c" }, c));
    cell.style.background = zColor(c, f.pair.expected);
    pairGrid.append(cell);
  });
  parts.push(h("section", { class: "card section stack" },
    h("h2", null, "คู่ตัวเลขติดกัน 00–99"),
    pairGrid,
    chiLine(f.pair.chi_square),
    h("p", { class: "note" }, `นับคู่หลักที่ 1–2, 2–3, …, 5–6 รวมกัน (เลขละ 5 คู่) · คาดไว้ ${fmt1.format(f.pair.expected)} ต่อคู่ · ${sample}`)));

  const labelsN = (n) => [...Array(n).keys()].map(String);
  const dsumLabels = labelsN(55);
  parts.push(h("div", { class: "grid grid-2e section" },
    h("section", { class: "card stack" }, h("h2", null, "จำนวนเลขคี่ในเลข 6 หลัก"),
      barChart({ labels: labelsN(7), values: f.odd.observed, expected: f.odd.expected, ariaLabel: "จำนวนเลขคี่", xTitle: "จำนวนตัวคี่" }),
      chiLine(f.odd.chi_square), distTable("ตัวคี่", labelsN(7), f.odd.observed, f.odd.expected)),
    h("section", { class: "card stack" }, h("h2", null, "จำนวนเลขสูง (5–9)"),
      barChart({ labels: labelsN(7), values: f.high.observed, expected: f.high.expected, ariaLabel: "จำนวนเลขสูง", xTitle: "จำนวนตัว 5–9" }),
      chiLine(f.high.chi_square), distTable("ตัวสูง", labelsN(7), f.high.observed, f.high.expected)),
    h("section", { class: "card stack" }, h("h2", null, "ผลรวมของ 6 หลัก"),
      barChart({ labels: dsumLabels, values: f.dsum.observed, expected: f.dsum.expected, ariaLabel: "ผลรวมหลัก", xTitle: "ผลรวม", every: 6 }),
      chiLine(f.dsum.chi_square), distTable("ผลรวม", dsumLabels, f.dsum.observed, f.dsum.expected)),
    h("section", { class: "card stack" }, h("h2", null, "รูปแบบการซ้ำ"),
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
      h("h2", null, `ช่วงล่าสุดเทียบระยะยาว (${six.data.recent.label})`),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "ตัวเลข"), h("th", { class: "n" }, "ทั้งหมด"), h("th", { class: "n" }, "ช่วงล่าสุด"), h("th", { class: "n" }, "ต่าง"), h("th", null, "ช่วงล่าสุดอยู่ในช่วงปกติ"))),
        h("tbody", null, digits.map((d, i) => {
          const a = all.digit.counts[i] / aTot, r = rec.digit.counts[i] / rTot;
          const c = rec.digit.counts[i];
          const ok = c >= rec.digit.range95[0] && c <= rec.digit.range95[1];
          return h("tr", null, h("td", { class: "mono" }, d), h("td", { class: "n" }, pct(a, 2)), h("td", { class: "n" }, pct(r, 2)),
            h("td", { class: "n" }, `${r - a >= 0 ? "+" : ""}${((r - a) * 100).toFixed(2)}`), h("td", null, ok ? h("span", { class: "chip ok" }, "ปกติ") : h("span", { class: "chip warn" }, "นอกช่วง")));
        })))),
      h("p", { class: "note" }, `ทั้งหมด: ${fmt.format(all.numbers)} เลข (${thShort(all.first_draw)} – ${thShort(all.last_draw)}) · ช่วงล่าสุด: ${fmt.format(rec.numbers)} เลข (${thShort(rec.first_draw)} – ${thShort(rec.last_draw)}) · ช่วงปกติของช่วงล่าสุด ${rec.digit.range95[0]}–${rec.digit.range95[1]} ครั้งต่อตัวเลข · ตัวอย่างช่วงสั้นแกว่งมากกว่าระยะยาวเป็นธรรมดา`)));
  }
  return parts;
}

// ---------- page: analysis ----------
async function pageAnalysis() {
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab") === "backtest" ? "backtest" : "rank";
  const [pidx, bt] = await Promise.all([optionalData("predictions/index.json"), optionalData("analysis/backtest.json")]);
  const tabs = h("div", { class: "seg tabs", role: "group", "aria-label": "เลือกส่วน" },
    h("button", { type: "button", "aria-pressed": String(tab === "rank"), onclick: () => { location.search = ""; } }, "อันดับเลขงวดถัดไป"),
    h("button", { type: "button", "aria-pressed": String(tab === "backtest"), onclick: () => { location.search = "?tab=backtest"; } }, "Backtest เทียบการสุ่ม"),
    h("a", { href: "history.html", class: "small" }, "ประวัติการทำนาย →"));
  const warn = h("div", { class: "callout warn" },
    h("strong", null, "คะแนนนี้ไม่ใช่โอกาสถูกรางวัล"), h("br"),
    "อันดับมาจากคะแนนเปรียบเทียบของโมเดลที่ดูจากสถิติในอดีต คะแนน 100 แปลว่าสูงสุดในเลข 1 ล้านเลขตามโมเดลนี้ ไม่ได้แปลว่ามีโอกาส 100% ",
    bt ? `ผล backtest ช่วง holdout ${fmt.format(bt.evaluation.holdout ? bt.evaluation.holdout.draws : 0)} งวด: ไม่มีชุดน้ำหนักใดดีกว่าการสุ่มอย่างมีนัยสำคัญ` : "");
  const head = pageHead("วิเคราะห์ Hybrid", "Global Score + Prize-Specific Score จัดอันดับเลข 000000–999999 แยกตามรางวัลที่ 1–5");
  if (tab === "backtest") {
    render(head, h("section", { class: "card stack" }, tabs), backtestView(bt, params));
    return;
  }
  if (!pidx || !pidx.snapshots.length) {
    render(head, h("section", { class: "card stack" }, tabs, warn),
      h("section", { class: "card section" }, h("p", { class: "empty" }, "ยังไม่มี snapshot การทำนาย ระบบจะสร้างให้อัตโนมัติหลังดึงผลงวดใหม่จาก GLO")));
    return;
  }
  const dates = pidx.snapshots.map((x) => x.target_draw_date);
  let date = params.get("d");
  if (!dates.includes(date)) date = dates[0];
  const pd = await getData(`predictions/${date}.json`);
  const snap = pd.snapshot;
  const ev = pd.evaluation;
  const state = { prize: SIX.includes(params.get("p")) ? params.get("p") : "first" };
  state.count = snap.candidate_counts[state.prize];
  const snapSel = h("select", { id: "snap", "aria-label": "เลือกงวด" },
    pidx.snapshots.map((x) => h("option", { value: x.target_draw_date, selected: x.target_draw_date === date },
      `งวด ${thShort(x.target_draw_date)}${x.status === "pending" ? "" : ` · ${STATUS[x.status].label}`}`)));
  snapSel.addEventListener("change", () => { location.search = `?d=${encodeURIComponent(snapSel.value)}`; });
  const metaCard = h("section", { class: "card section stack" },
    h("div", { class: "row" }, h("label", { for: "snap", class: "small muted" }, "งวดเป้าหมาย"), snapSel, h("span", { class: "spacer" }), statusChip(ev ? ev.status : "pending")),
    h("dl", { class: "kv" },
      h("dt", null, "งวดเป้าหมาย"), h("dd", null, `${thShort(snap.target_draw_date)}${snap.target_is_estimate ? " (วันที่คาดไว้)" : ""}`),
      h("dt", null, "ข้อมูลที่ใช้ฝึก"), h("dd", null, `${fmt.format(snap.training_draw_count)} งวด ถึง ${thShort(snap.training_data_through)}`),
      h("dt", null, "สร้างเมื่อ"), h("dd", null, `${thDateTime(snap.created_at)} (ก่อนออกรางวัล ไม่แก้ไขภายหลัง)`),
      h("dt", null, "โมเดล"), h("dd", { class: "mono" }, snap.model_version),
      ev && ev.status === "evaluated" ? [h("dt", null, "ผล"), h("dd", null, `ถูกตรง 6 หลัก ${ev.exact_hits_total} เลข (ถ้าสุ่มคาดไว้ ${ev.random_expected_total.toFixed(4)}) · `, h("a", { href: `history.html?d=${snap.target_draw_date}` }, "ดูรายละเอียด"))] : null,
      ev && ev.status !== "evaluated" ? [h("dt", null, "ผล"), h("dd", null, ev.reason || "")] : null));
  const seg = h("div", { class: "seg", role: "group", "aria-label": "เลือกรางวัล" });
  const countSel = h("select", { id: "count", "aria-label": "จำนวนเลขที่แสดง" });
  const body = h("div");
  function draw() {
    seg.replaceChildren(...SIX.map((k) => h("button", {
      type: "button", "aria-pressed": String(state.prize === k),
      onclick: () => { state.prize = k; state.count = snap.candidate_counts[k]; draw(); },
    }, SIX_LABEL[k])));
    const n = snap.predictions[state.prize].length;
    countSel.replaceChildren(...[...Array(n).keys()].map((i) => h("option", { value: i + 1, selected: i + 1 === state.count }, `${i + 1} เลข`)));
    body.replaceChildren(...candidateView(snap, ev, state));
  }
  countSel.addEventListener("change", () => { state.count = Number(countSel.value); draw(); });
  render(head, h("section", { class: "card stack" }, tabs, warn), metaCard,
    h("section", { class: "card section stack" }, seg,
      h("div", { class: "row" }, h("label", { for: "count", class: "small muted" }, "แสดง"), countSel,
        h("span", { class: "note" }, "จำนวนที่ใช้ประเมินจริง: ", SIX.map((k) => `${SIX_LABEL[k].replace("รางวัลที่ ", "ที่ ")} = ${snap.candidate_counts[k]}`).join(", ")))),
    body);
  draw();
}

function candidateView(snap, ev, state) {
  const k = state.prize;
  const rows = snap.predictions[k].slice(0, state.count);
  const official = snap.candidate_counts[k];
  const w = snap.hybrid_weights[k];
  const res = ev && ev.status === "evaluated" ? ev.results[k] : null;
  const hitSet = new Set(res ? (res.hits_in_top_n || []) : []);
  const scoreCell = (v) => h("td", { class: "n" }, fmt1.format(v), h("span", { class: "scorebar", "aria-hidden": "true" }, (() => { const b = h("span"); b.style.width = `${Math.max(0, Math.min(100, v))}%`; return b; })()));
  const table = h("div", { class: "table-wrap" }, h("table", { class: "cand-table" },
    h("thead", null, h("tr", null, h("th", { class: "n" }, "อันดับ"), h("th", null, "เลข"), h("th", { class: "n" }, "Hybrid"), h("th", { class: "n" }, "Global"), h("th", { class: "n" }, "เฉพาะรางวัล"), h("th", null, "ส่วนที่ทำให้คะแนนสูง"))),
    h("tbody", null, rows.map((r) => h("tr", { class: r.rank > official ? "extra" : null },
      h("td", { class: "n" }, r.rank),
      h("td", { class: "num6" }, RE_SIX.test(r.number) ? r.number : "–", hitSet.has(r.number) ? h("span", { class: "chip ok" }, " ถูก") : null),
      scoreCell(r.hybrid_score), scoreCell(r.global_score), scoreCell(r.prize_score),
      h("td", { class: "why" }, h("ul", { class: "contrib" }, r.contributions.map((c) => h("li", null,
        h("b", null, GROUP_LABEL[c.group]), ` (${SCOPE_LABEL[c.scope]}, ${c.contribution >= 0 ? "+" : ""}${c.contribution.toFixed(3)}) — ${c.detail}`)))))))));
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
      h("p", { class: "note" }, `Hybrid = ${Math.round(w.global * 100)}% × Global + ${Math.round(w.prize_specific * 100)}% × เฉพาะรางวัล (ชุด ${w.experiment}${snap.tuning && snap.tuning.source === "backtest validation" ? `, เลือกจากช่วง validation ${thShort(snap.tuning.validation.from)} – ${thShort(snap.tuning.validation.to)}` : ""}) · คะแนน 0–100 เทียบกับเลขทั้ง 1 ล้านเลข (100 = สูงสุด)`),
      table,
      state.count > official ? h("p", { class: "note" }, `แถวสีจาง = เกินจำนวนที่ใช้ประเมินจริง (${official} เลข)`) : null,
      h("p", { class: "note" }, `Global ใช้เลขรางวัลที่ 1–5 ทั้งหมด ${fmt.format(Object.values(snap.training_numbers).reduce((a, b) => a + b, 0))} เลข + เลขหน้า/ท้าย 3 ตัว และท้าย 2 ตัว (ผลบางส่วน ใช้เฉพาะ feature 3 หลักแรก/ท้าย) · เฉพาะรางวัลใช้ ${fmt.format(snap.training_numbers[k])} เลขของ${SIX_LABEL[k]}เท่านั้น · ตัวเลขในวงเล็บคือส่วนที่เพิ่มให้คะแนน hybrid (หน่วย z)`)),
    h("section", { class: "card section stack" },
      h("h2", null, "เปรียบเทียบชุดน้ำหนัก"),
      h("p", { class: "note" }, "อันดับแรกของแต่ละชุดน้ำหนัก (ข้อมูลเดียวกัน) ชุดที่ไฮไลต์คือชุดที่ใช้จริง"),
      altTable),
  ];
}

function backtestView(bt, params) {
  if (!bt) return h("section", { class: "card section" }, h("p", { class: "empty" }, "ยังไม่มีผล backtest (รัน python scripts/lotto_predict.py backtest)"));
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
    h("thead", null, h("tr", null, h("th", null, "ชุด"), h("th", { class: "n" }, "validation"), h("th", { class: "n" }, "holdout"), h("th", null, "ช่วง 95% (holdout)"), h("th", { class: "n" }, "p"), h("th", { class: "n" }, "ถูกตรง (holdout)"))),
    h("tbody", null, rowsIds.map((id) => {
      const v = R[id].validation, hd = R[id].holdout;
      return h("tr", { class: id === chosen ? "tuned" : null },
        h("th", null, cfgLabel(id, cfgW[id]), id === chosen ? h("div", { class: "note" }, "เลือกจาก validation") : null),
        h("td", { class: "n" }, pctile(v.mean_pct)), h("td", { class: "n" }, pctile(hd.mean_pct)),
        h("td", null, hd.mean_pct_ci ? `${pctile(hd.mean_pct_ci[0])} – ${pctile(hd.mean_pct_ci[1])}` : "–"),
        h("td", { class: "n" }, hd.p_two_sided !== undefined ? fmtP(hd.p_two_sided) : "–"),
        h("td", { class: "n" }, `${hd.hits} / ${hd.draws} งวด`));
    }))));
  const st = bt.stability;
  const stabTable = h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "ชุด"), st.blocks.map((b) => h("th", { class: "n" }, `${thShort(b.from)} – ${thShort(b.to)}`)))),
    h("tbody", null, [...rowsIds, "tuned"].map((id) => h("tr", { class: id === "tuned" ? "tuned" : null },
      h("th", null, id === "tuned" ? `ชุดที่เลือก (${chosen})` : cfgLabel(id, cfgW[id])),
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
      !bt.fresh ? h("div", { class: "callout warn" }, "ผล backtest นี้คำนวณจากข้อมูล/config/โค้ดชุดเก่า (", bt.stale_reasons.join(", "), ") จะอัปเดตในรอบถัดไปของ GitHub Actions") : null,
      h("div", { class: flagged.length ? "callout" : "callout ok" },
        h("strong", null, flagged.length ? `มี ${flagged.length} ชุดที่ต่างจากการสุ่มหลังปรับ Bonferroni` : "ไม่มีชุดใดดีกว่าการสุ่มอย่างมีนัยสำคัญในช่วง holdout"), h("br"),
        `ช่วง holdout ${e.holdout ? `${thShort(e.holdout.from)} – ${thShort(e.holdout.to)} (${fmt.format(e.holdout.draws)} งวด)` : "–"}: ชุดที่เลือกถูกตรง 6 หลักรวม ${ov.hits} เลข ถ้าสุ่มคาดไว้ ${fmt2.format(ov.expected)} (ช่วงปกติ ${ov.lo95}–${ov.hi95})`),
      h("dl", { class: "kv" },
        h("dt", null, "งวดที่ประเมิน"), h("dd", null, `${fmt.format(e.draws)} งวด (${thShort(e.first_draw)} – ${thShort(e.last_draw)}) ฝึกด้วยข้อมูลก่อนหน้าแต่ละงวดเท่านั้น`),
        h("dt", null, "Validation"), h("dd", null, e.validation ? `${thShort(e.validation.from)} – ${thShort(e.validation.to)} (${fmt.format(e.validation.draws)} งวด) ใช้เลือกชุดน้ำหนัก` : "–"),
        h("dt", null, "Holdout"), h("dd", null, e.holdout ? `${thShort(e.holdout.from)} – ${thShort(e.holdout.to)} (${fmt.format(e.holdout.draws)} งวด) ไม่ถูกใช้เลือกค่าใด ๆ` : "–"),
        h("dt", null, "ข้อมูลถึง"), h("dd", null, `${thShort(bt.data_through)} · คำนวณเมื่อ ${thDateTime(bt.backtest_generated_at)}`))),
    h("section", { class: "card section stack" },
      seg,
      h("h2", null, `${SIX_LABEL[prize]}: เลขที่ออกจริงอยู่อันดับเท่าไรในโมเดล`),
      h("p", { class: "note" }, `ตัวเลขคือ percentile เฉลี่ยของเลขที่ออกจริง (0% = อันดับบนสุดของ 1 ล้านเลข, 100% = ล่างสุด) ถ้าโมเดลไม่ช่วยอะไรเลยจะได้ราว 50% · ค่าน้อยกว่า 50% อย่างมีนัยสำคัญจึงแปลว่าโมเดลช่วยได้ · ประมาณจากตัวอย่างคงที่ ${fmt.format(e.subsample)} เลข`),
      table,
      h("p", { class: "note" }, `ถูกตรง 6 หลัก = เลขที่ออกจริงอยู่ใน ${bt.candidate_counts[prize]} อันดับแรกของรางวัลเดียวกัน · ถ้าสุ่มเลือก ${bt.candidate_counts[prize]} เลขต่องวด คาดว่าจะถูก ${rnd.holdout.expected.toFixed(3)} ครั้งในช่วง holdout (ช่วงปกติ ${rnd.holdout.lo95}–${rnd.holdout.hi95}; จำลอง ${fmt.format(rnd.holdout.trials)} รอบ seed คงที่)`)),
    h("section", { class: "card section stack" },
      h("h2", null, "เปลี่ยนไปตามเวลาไหม"),
      lineChart({ values: roll, labels: bt.timeline.dates.map((d) => String(Number(d.slice(0, 4)) + 543)), ref: 0.5, band: [0.5 - 1.96 * se, 0.5 + 1.96 * se], ariaLabel: "percentile เฉลี่ยเคลื่อนที่ 24 งวด", yFmt: (v) => `${(v * 100).toFixed(1)}%` }),
      h("p", { class: "note" }, `เส้นน้ำเงิน = percentile เฉลี่ยเคลื่อนที่ ${win} งวดของชุดที่เลือก (${tl.config}) · เส้นประ = 50% (สุ่ม) · แถบเขียว = ช่วงที่การสุ่มให้ได้ตามปกติ`),
      h("h3", null, "แยกเป็นช่วงเวลา"), stabTable,
      h("p", { class: "note" }, "ถ้าโมเดลมีประโยชน์จริง ควรต่ำกว่า 50% สม่ำเสมอทุกช่วง ไม่ใช่เฉพาะบางช่วง")));
}

// ---------- page: history ----------
async function pageHistory() {
  const params = new URLSearchParams(location.search);
  const pidx = await optionalData("predictions/index.json");
  const head = pageHead("ประวัติการทำนาย", "snapshot ที่บันทึกไว้ก่อนออกรางวัล แล้วเทียบกับผลจริง (ไม่สร้างย้อนหลัง)");
  if (!pidx || !pidx.snapshots.length) {
    render(head, h("section", { class: "card" }, h("p", { class: "empty" }, "ยังไม่มี snapshot · ระบบจะสร้างอัตโนมัติหลังดึงผลงวดใหม่จาก GLO และประเมินเมื่อผลงวดถัดไปออก")));
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
  render(head,
    h("section", { class: "card stack" },
      h("div", { class: "stat-row" },
        stat("snapshot", fmt.format(snaps.length)),
        stat("ประเมินแล้ว", fmt.format(evaluated.length)),
        stat("ถูกตรง 6 หลักรวม", `${fmt.format(hits)}`),
        stat("ถ้าสุ่มคาดไว้", fmt2.format(expected))),
      h("p", { class: "note" }, `เริ่มบันทึกหลังงวด ${thShort(pidx.tracking_since)} · งวดหลังจากนั้นที่ไม่มี snapshot ก่อนออกรางวัลถือว่าประเมินไม่ได้ (${fmt.format(noSnap)} งวด) · ผลจำลองย้อนหลังดูได้ที่ `, h("a", { href: "analysis.html?tab=backtest" }, "Backtest")),
      chrono.length >= 2 ? [h("h2", null, "ถูกสะสมเทียบการสุ่ม"),
        lineChart({ values: cumH, labels: chrono.map((x) => thShort(x.actual_draw_date)), ref: null, ariaLabel: "จำนวนเลขที่ถูกสะสม", yMin: 0, yMax: Math.max(1, ...cumH, ...cumE) }),
        h("p", { class: "note" }, `เส้น = ถูกสะสมจริง · ถ้าสุ่มคาดไว้รวม ${fmt2.format(ce)} เลข`)] : null),
    h("section", { class: "card section stack" },
      h("h2", null, "snapshot ทั้งหมด"),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "งวดเป้าหมาย"), h("th", null, "สร้างเมื่อ"), h("th", null, "ข้อมูลถึง"), h("th", null, "สร้างก่อนออกรางวัล"), h("th", null, "สถานะ"), h("th", { class: "n" }, "ถูก / คาดไว้"))),
        h("tbody", null, snaps.map((x) => h("tr", null,
          h("td", null, h("a", { href: `analysis.html?d=${x.target_draw_date}` }, thShort(x.target_draw_date))),
          h("td", null, thDateTime(x.created_at)),
          h("td", null, thShort(x.training_data_through)),
          h("td", null, x.lead_time_hours !== null ? leadText(x.lead_time_hours) : `≈ ${leadText((Date.parse(`${x.target_draw_date}T07:00:00Z`) - Date.parse(x.created_at)) / 3600000)} (วันที่คาดไว้)`),
          h("td", null, statusChip(x.status)),
          h("td", { class: "n" }, x.status === "evaluated" ? `${x.exact_hits_total} / ${x.random_expected_total.toFixed(4)}` : "–"))))))),
    detail,
    h("section", { class: "card section stack" },
      h("h2", null, "ทุกงวดตั้งแต่เริ่มบันทึก"),
      pidx.history.length
        ? h("ul", { class: "status-list" }, pidx.history.map((r) => h("li", null,
          h("a", { href: `results.html?d=${r.draw_date}` }, thShort(r.draw_date)), statusChip(r.status),
          r.status === "evaluated" ? h("span", { class: "small muted" }, `ถูก ${r.exact_hits_total} (สุ่มคาดไว้ ${r.random_expected_total.toFixed(4)})`) : null,
          r.status === "no_snapshot" ? h("span", { class: "small muted" }, "ไม่มี snapshot ก่อนออกรางวัล — ไม่สร้างย้อนหลัง") : null)))
        : h("p", { class: "empty" }, "ยังไม่มีงวดที่ออกหลังเริ่มบันทึก")));
  if (detailDate) {
    const pd = await getData(`predictions/${detailDate}.json`);
    detail.replaceChildren(evaluationDetail(pd.snapshot, pd.evaluation));
  }
}

function evaluationDetail(snap, ev) {
  const headLine = h("h2", null, `รายละเอียดงวด ${thShort(snap.target_draw_date)}`);
  if (!ev) return h("section", { class: "card section stack" }, headLine, h("p", { class: "empty" }, "รอผลรางวัล"));
  if (ev.status !== "evaluated") {
    return h("section", { class: "card section stack" }, headLine, statusChip(ev.status), h("p", null, ev.reason || ""));
  }
  return h("section", { class: "card section stack" }, headLine,
    h("p", { class: "note" }, `ผลจริงงวด ${thShort(ev.actual_draw_date)} · snapshot สร้าง ${thDateTime(ev.snapshot_created_at)} (ก่อนเริ่มออกรางวัล ${leadText(ev.lead_time_hours)})`),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "รางวัล"), h("th", null, "เลขที่ทำนาย"), h("th", { class: "n" }, "ถูกตรง"), h("th", { class: "n" }, "สุ่มคาดไว้"))),
      h("tbody", null, SIX.map((k) => {
        const r = ev.results[k];
        const hs = new Set(r.exact_hits);
        return h("tr", null, h("th", null, SIX_LABEL[k]),
          h("td", null, h("div", { class: "num-list" }, r.candidates.map((n) => h("span", { class: hs.has(n) ? "hit" : null }, n)))),
          h("td", { class: "n" }, r.available ? r.exact_hits.length : "–"),
          h("td", { class: "n" }, r.available ? r.random_expected.toFixed(5) : "–"));
      })))),
    h("h3", null, "ถ้าซื้อเลขเหล่านี้ จะถูกรางวัลอะไรบ้าง (ทุกประเภท)"),
    ev.ticket_wins.length
      ? h("ul", { class: "hits" }, ev.ticket_wins.map((t) => h("li", null, h("span", { class: "mono" }, t.number), h("span", { class: "small muted" }, `(จากรายการ${SIX_LABEL[t.list]})`),
        t.prizes.map((p) => h("span", { class: "chip ok" }, PRIZE_LABEL[p])))))
      : h("p", { class: "empty" }, "ไม่ถูกรางวัลใดเลย"),
    h("p", { class: "note" }, "ส่วนนี้แยกจากการนับ \"ถูกตรง\" ด้านบน: เลขท้าย 2 ตัว/หน้า-ท้าย 3 ตัวเป็นรางวัลจริงของสลาก แต่ไม่นับเป็นความแม่นของโมเดลรางวัลที่ 1–5"));
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
    ["number", "การกระจายของเลข (chi-square)"],
    ["first_digit", "แต่ละหลักของรางวัลที่ 1"],
    ["prize_digits", "ตัวเลขในรางวัลที่ 2–5 แยกตามแหล่งข้อมูล"],
  ];
  const testTable = h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "การทดสอบ"), h("th", null, "ช่วง"), h("th", { class: "n" }, "p"), h("th", { class: "n" }, "p หลังปรับ"), h("th", null, "ผล"))),
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
          ? `มี ${flagged.length} การทดสอบที่ผิดปกติหลังปรับสำหรับการทดสอบหลายครั้ง`
          : `ทดสอบ ${r.test_count} แบบ ไม่พบความผิดปกติหลังปรับสำหรับการทดสอบหลายครั้ง`),
        h("br"),
        "ผลสลากมีพฤติกรรมเหมือนการสุ่มที่ยุติธรรม ไม่มีสถิติใดในข้อมูลนี้ที่ช่วยเดาเลขงวดถัดไปได้")),
    h("div", { class: "grid grid-2e section" },
      h("section", { class: "card stack" },
        h("h2", null, "ถ้าเลือกเลขตามสถิติ จะถูกบ่อยขึ้นไหม?"),
        h("p", { class: "small muted" }, `จำลองย้อนหลัง ${fmt.format(bt.trials)} งวด: ก่อนแต่ละงวดใช้เฉพาะข้อมูลก่อนหน้า เลือกเลขท้าย 2 ตัว ${bt.pick} ตัวตามกลยุทธ์ แล้วนับว่าถูกกี่ครั้ง`),
        btBars,
        h("p", { class: "small muted" }, `เส้นดำ = โอกาสถ้าเลือกมั่ว ${pct(bt.chance_rate, 0)} · แถบเขียว = ช่วงที่การสุ่มให้ได้ตามปกติ (${pct(bt.chance_range95[0])}–${pct(bt.chance_range95[1])})`),
        h("p", null, bt.strategies.every((st) => st.rate >= bt.chance_range95[0] && st.rate <= bt.chance_range95[1])
          ? "ทุกกลยุทธ์อยู่ในช่วงเดียวกับการเลือกมั่ว"
          : "มีบางกลยุทธ์อยู่นอกช่วงปกติ (ดูผลทดสอบอื่นประกอบ เพราะทดสอบหลายกลยุทธ์)")),
      h("section", { class: "card stack" },
        h("h2", null, "งวดก่อนบอกอะไรเกี่ยวกับงวดถัดไปไหม?"),
        h("div", { class: "stat-row" }, stat("ค่าสหสัมพันธ์ (r)", ac.r.toFixed(3)), stat("ช่วงปกติ", `±${ac.range95[1].toFixed(3)}`)),
        h("p", { class: "small muted" }, "วัดว่าเลขท้าย 2 ตัวของงวดหนึ่งสัมพันธ์กับงวดถัดไปไหม ค่าใกล้ 0 แปลว่าไม่สัมพันธ์กัน"),
        h("h2", { class: "section" }, "ซื้อ 1 ใบ ได้คืนเฉลี่ยเท่าไร"),
        h("div", { class: "stat-row" }, stat("ราคาสลาก", "80 บาท"), stat("รางวัลเฉลี่ยต่อใบ", `${fmt.format(perTicket)} บาท`)),
        h("p", { class: "small muted" }, `จากเงินรางวัลรวม ${fmt.format(total)} บาทต่อสลาก 1 ล้านใบ (อัตรารางวัลปัจจุบัน โปรดตรวจสอบกับ GLO) ได้คืนเฉลี่ย ${pct(perTicket / 80, 0)} ของราคา`))),
    h("section", { class: "card section stack" },
      h("h2", null, "ผลการทดสอบทั้งหมด"),
      h("p", { class: "small muted" }, `p คือโอกาสที่การสุ่มจริงจะให้ผลเบี้ยวอย่างน้อยเท่านี้ ถ้าทดสอบหลายแบบ ย่อมมีบางแบบที่ p < 0.05 โดยบังเอิญ (ทดสอบ ${r.test_count} แบบ คาดว่าจะเจอราว ${fmt1.format(r.test_count * 0.05)} แบบ เจอจริง ${rawFlag.length} แบบ) จึงปรับด้วยวิธี Bonferroni (คูณ p ด้วยจำนวนการทดสอบ)`),
      testTable,
      h("p", { class: "small muted" }, "ตัวอย่าง: หลักหน่วยของรางวัลที่ 1 มี p ต่ำ แต่หลังปรับแล้วไม่ผิดปกติ · ตัวเลขในรางวัลที่ 2–5 ผิดปกติเล็กน้อยเฉพาะข้อมูลแหล่งเดียวที่ยังไม่ได้ตรวจทาน ส่วนข้อมูลทางการกระจายเท่ากัน แสดงว่าคุณภาพข้อมูลมีผลต่อสถิติ")));
}

// ---------- page: data ----------
async function pageData() {
  const [m, ver] = await Promise.all([manifest(), getData("verification.json")]);
  const t = m.by_trust;
  render(
    pageHead("ข้อมูลและแหล่งที่มา", `อัปเดตล่าสุด: งวด ${m.latest_draw_th}${ver.last_import ? ` · ดึงจาก GLO เมื่อ ${thDateTime(ver.last_import.retrieved_at)}` : ""}`),
    verificationView(ver),
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
        h("li", null, "ค่าที่คาดไว้ = จำนวนหมายเลขที่ออก ÷ จำนวนเลขที่เป็นไปได้ (100 หรือ 1,000)"),
        h("li", null, "ช่วงปกติ 95% มาจากการแจกแจงทวินาม: ถ้าสุ่มจริง แต่ละเลขจะอยู่ในช่วงนี้ 95% ของเวลา"),
        h("li", null, "Chi-square ทดสอบว่าทุกเลขออกเท่า ๆ กันหรือไม่ · ปรับ Bonferroni เมื่อทดสอบหลายแบบ"),
        h("li", null, "Backtest ใช้เฉพาะข้อมูลก่อนหน้าแต่ละงวด (ไม่มีการใช้ข้อมูลอนาคต)"))));
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
        h("details", null, h("summary", null, `เดือนที่จำนวนงวดไม่ใช่ 2 (${miss.month_irregular.length} เดือน)`),
          h("div", { class: "table-wrap" }, h("table", null,
            h("thead", null, h("tr", null, h("th", null, "เดือน"), h("th", { class: "n" }, "งวด"), h("th", null, "วันที่"))),
            h("tbody", null, miss.month_irregular.map((x) => h("tr", null, h("td", null, `${MONTHS_SHORT[Number(x.month.slice(5)) - 1]} ${Number(x.month.slice(0, 4)) + 543}`),
              h("td", { class: "n" }, x.draws), h("td", null, x.dates.map(thShort).join(", ") || "–"))))))),
        h("p", { class: "note" }, "ส่วนใหญ่เป็นงวดสิ้นปี (16 และ 30 ธ.ค.) หรืองวดที่เลื่อนวัน ไม่ได้แปลว่าข้อมูลหาย · ไม่เติมข้อมูลที่หาไม่ได้")),
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

// ---------- boot ----------
const PAGES = {
  index: pageHome, results: pageResults, stats: pageStats, analysis: pageAnalysis, history: pageHistory, random: pageRandom, data: pageData,
};

async function boot() {
  const page = document.body.dataset.page;
  const fn = PAGES[page];
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
