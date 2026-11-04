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
  if (str === "tel:1323") return str;
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
  render(
    h("div", { class: "grid grid-2" }, latestCard, ticketCard({ initial: q })),
    h("section", { class: "card section" },
      h("h2", null, "ข้อมูลในเว็บนี้"),
      h("div", { class: "stat-row" },
        stat("จำนวนงวด", fmt.format(m.draw_count)),
        stat("ตั้งแต่", thShort(m.first_draw)),
        stat("ถึง", thShort(m.latest_draw)),
        stat("ข้อมูลทางการ GLO", `${fmt.format(m.by_trust.official)} งวด`)),
      h("p", { class: "muted small section" },
        "อยากรู้ว่ามีเลขไหน \"ออกบ่อย\" จริงไหม? ดู ", h("a", { href: "random.html" }, "ผลทดสอบความสุ่ม"),
        " หรือ ", h("a", { href: "stats.html" }, "ความถี่เทียบกับค่าที่คาดไว้"))),
    responsibleBox());
}

// ---------- page: results ----------
async function pageResults() {
  const params = new URLSearchParams(location.search);
  const d = params.get("d");
  if (d && RE_DATE.test(d)) return drawDetail(d);
  const m = await manifest();
  let year = params.get("y");
  if (!m.years.includes(year)) year = m.years[m.years.length - 1];
  const rows = (await index()).filter((r) => r.draw_date.startsWith(year)).reverse();
  const select = h("select", { id: "year", "aria-label": "เลือกปี (พ.ศ.)" },
    [...m.years].reverse().map((y) => h("option", { value: y, selected: y === year }, `พ.ศ. ${Number(y) + 543}`)));
  select.addEventListener("change", () => { location.search = `?y=${encodeURIComponent(select.value)}`; });
  render(
    pageHead("ผลย้อนหลัง", `ทั้งหมด ${fmt.format(m.draw_count)} งวด ตั้งแต่ ${thShort(m.first_draw)}`),
    h("section", { class: "card" },
      h("div", { class: "row" }, h("label", { for: "year", class: "small muted" }, "ปี"), select,
        h("span", { class: "spacer" }), h("span", { class: "muted small" }, `${rows.length} งวด`)),
      h("ul", { class: "draw-list section" }, rows.map((r) => h("li", null,
        h("a", { href: `results.html?d=${r.draw_date}` },
          h("span", { class: "d" }, r.draw_date_th),
          h("span", { class: "f" }, r.first),
          h("span", { class: "sub" },
            r.front3.length ? `หน้า 3: ${r.front3.join(" ")} · ` : "",
            `ท้าย 3: ${r.back3.join(" ")} · ท้าย 2: ${r.last2}`,
            r.trust_level !== "official" ? ` · ${TRUST[r.trust_level].label}` : "")))))));
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
      notes.map((t) => h("p", { class: "muted small" }, t))));
}

function zColor(count, expected) {
  // สีตามระยะห่างจากค่าที่คาดไว้ (หน่วยเป็นส่วนเบี่ยงเบนมาตรฐานของ Poisson) ไม่ใช่ตามจำนวนดิบ
  const z = expected > 0 ? (count - expected) / Math.sqrt(expected) : 0;
  const t = Math.min(1, Math.abs(z) / 3);
  const pctMix = Math.round(8 + t * 62);
  return z >= 0
    ? `color-mix(in srgb, var(--hi) ${pctMix}%, var(--card))`
    : `color-mix(in srgb, var(--lo) ${pctMix}%, var(--card))`;
}

// ---------- shared: ขอบเขตข้อมูล (ช่วงเวลา × ระดับความน่าเชื่อถือ) ----------
const STAT_PRIZES = [["last2", "เลขท้าย 2 ตัว"], ["back3", "เลขท้าย 3 ตัว"], ["front3", "เลขหน้า 3 ตัว"]];
const DIGIT_PRIZES = [["first", "รางวัลที่ 1"], ...STAT_PRIZES];
const WIDTH = { first: 6, front3: 3, back3: 3, last2: 2 };

function oneOf(v, list, dflt) {
  return list.includes(v) ? v : dflt;
}

function trustHas(trust, row) {
  if (trust === "checked") return row.trust_level !== "single-source";
  if (trust === "official") return row.trust_level === "official";
  return true;
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

function selectBox(id, label, options, value, onChange) {
  const sel = h("select", { id, "aria-label": label },
    options.map(([k, l]) => h("option", { value: k, selected: k === value }, l)));
  sel.addEventListener("change", () => onChange(sel.value));
  return h("div", { class: "field" }, h("label", { for: id, class: "small muted" }, label), sel);
}

function prizeSeg(list, state, redraw) {
  return h("div", { class: "seg", role: "group", "aria-label": "เลือกรางวัล" },
    list.map(([k, label]) => h("button", {
      type: "button", "aria-pressed": String(state.prize === k),
      onclick: () => { state.prize = k; state.selected = null; redraw(); },
    }, label)));
}

// ตัวเลือกช่วงเวลาและแหล่งข้อมูล (ใช้ร่วมกันทุกหน้าสถิติ)
function scopeControls(json, state, redraw, opts = {}) {
  const fields = [];
  if (opts.period !== false) {
    fields.push(selectBox("period", "ช่วงเวลา", json.periods.map((k) => [k, json.period_labels[k]]), state.period,
      (v) => { state.period = v; state.selected = null; redraw(); }));
  }
  fields.push(selectBox("trust", "แหล่งข้อมูล", json.trusts.map((k) => [k, json.trust_labels[k]]), state.trust,
    (v) => { state.trust = v; state.selected = null; redraw(); }));
  return h("div", { class: "controls" }, fields);
}

function scopeData(json, state) {
  const p = json.data[state.period] || json.data.all;
  return p[state.trust] || p.all;
}

function scopeNote(json, state, opts = {}) {
  return h("p", { class: "small muted scope-note" },
    opts.period === false ? "" : `ช่วงเวลา: ${json.period_labels[state.period]} · `,
    `แหล่งข้อมูล: ${json.trust_labels[state.trust]}`);
}

function resultChip(p, padj) {
  if (p === null || p === undefined) return h("span", { class: "chip gray" }, "ข้อมูลน้อยเกินไป");
  if (padj < 0.05) return h("span", { class: "chip warn" }, "ผิดปกติ");
  if (p < 0.05) return h("span", { class: "chip gray" }, "บังเอิญได้");
  return h("span", { class: "chip ok" }, "ปกติ");
}

function pLine(t, scopeText) {
  if (t.p === null || t.p === undefined) {
    return h("p", { class: "small muted" }, "ข้อมูลน้อยเกินกว่าจะทดสอบ chi-square ได้");
  }
  return h("p", { class: "small p-line" },
    `p = ${fmtP(t.p)} · หลังปรับ ${fmtP(t.p_bonferroni)} `, resultChip(t.p, t.p_bonferroni),
    scopeText ? h("span", { class: "muted" }, ` (${scopeText})`) : null);
}

const fmtR = (r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);

// ---------- กราฟ: ค่าที่ออกจริงเทียบช่วงปกติและค่าที่คาดไว้ ----------
// ทุกกราฟมีตารางให้กางดู และแท่งที่อยู่นอกช่วงปกติมีขอบหนา (ไม่สื่อด้วยสีอย่างเดียว)
function isOut(o, r) {
  return o < r[0] || o > r[1];
}

function rangeTable(o) {
  return h("details", null, h("summary", null, "แสดงเป็นตาราง"), h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, o.catTitle || "กลุ่ม"), h("th", { class: "n" }, "ออกจริง"),
      h("th", { class: "n" }, "คาดไว้"), h("th", { class: "n" }, "ช่วงปกติ 95%"), h("th", null, "ผล"))),
    h("tbody", null, o.labels.map((l, i) => h("tr", null,
      h("td", null, o.longLabels ? o.longLabels[i] : l), h("td", { class: "n" }, fmt.format(o.observed[i])),
      h("td", { class: "n" }, fmt2.format(o.expected[i])), h("td", { class: "n" }, fmtR(o.ranges[i])),
      h("td", null, isOut(o.observed[i], o.ranges[i]) ? "นอกช่วงปกติ" : "ในช่วงปกติ")))))));
}

function rangeLegend() {
  return h("div", { class: "legend" },
    h("span", { class: "key key-bar" }), "ออกจริง",
    h("span", { class: "key key-band" }), "ช่วงปกติ 95% ถ้าสุ่มจริง",
    h("span", { class: "key key-tick" }), "ค่าที่คาดไว้",
    h("span", { class: "key key-out" }), "นอกช่วงปกติ");
}

function outSummary(o) {
  const out = o.observed.filter((v, i) => isOut(v, o.ranges[i])).length;
  return h("p", { class: "small muted" },
    `นอกช่วงปกติ ${out} จาก ${o.labels.length} ${o.unit || "กลุ่ม"} — แม้สุ่มจริง แต่ละ${o.unit || "กลุ่ม"}ก็มีโอกาสอยู่นอกช่วงได้ถึงราว 5%`);
}

// แบบแนวนอน (กลุ่มที่มีชื่อยาว เช่น เลขคู่/คี่, รูปแบบเลขซ้ำ)
function rangeRows(o) {
  const max = Math.max(1, ...o.observed, ...o.ranges.map((r) => r[1]), ...o.expected) * 1.05;
  const pctOf = (v) => `${(v / max) * 100}%`;
  const rows = h("div", { class: "rbars", role: "img", "aria-label": o.title },
    o.labels.map((l, i) => {
      const band = h("div", { class: "band" });
      band.style.left = pctOf(o.ranges[i][0]);
      band.style.width = `max(2px, ${pctOf(o.ranges[i][1] - o.ranges[i][0])})`;
      const fill = h("div", { class: isOut(o.observed[i], o.ranges[i]) ? "fill out" : "fill" });
      fill.style.width = pctOf(o.observed[i]);
      const mark = h("div", { class: "mark" });
      mark.style.left = pctOf(o.expected[i]);
      return h("div", { class: "rb" },
        h("span", { class: "lbl" }, l),
        h("div", { class: "track" }, band, fill, mark),
        h("span", { class: "num" }, fmt.format(o.observed[i]), h("span", { class: "muted" }, ` / ${fmt1.format(o.expected[i])}`)));
    }));
  return [rows, rangeLegend(), rangeTable(o)];
}

// แบบแนวตั้ง (แกน x เป็นตัวเลข เช่น หลัก 0–9, ผลรวม, ปี, ระยะห่าง)
function rangeBars(o) {
  const W = 360, H = 200, padL = 34, padR = 6, padT = 10, padB = 34;
  const n = o.labels.length;
  const max = Math.max(1, ...o.observed, ...o.ranges.map((r) => r[1]), ...o.expected) * 1.08;
  const bw = (W - padL - padR) / n;
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.title });
  const step = niceStep(max / 4);
  for (let v = 0; v <= max; v += step) {
    svg.append(s("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: "currentColor", "stroke-opacity": 0.1 }));
    svg.append(s("text", { x: padL - 5, y: y(v) + 4, "text-anchor": "end" }, fmt.format(v)));
  }
  const every = o.labelEvery || Math.ceil(n / 12);
  o.labels.forEach((l, i) => {
    const x = padL + i * bw;
    const r = o.ranges[i];
    svg.append(s("rect", { x: x + bw * 0.06, width: bw * 0.88, y: y(r[1]), height: Math.max(1.5, y(r[0]) - y(r[1])), class: "c-band" }));
    const out = isOut(o.observed[i], r);
    const bar = s("rect", {
      x: x + bw * 0.25, width: bw * 0.5, y: y(o.observed[i]), height: Math.max(0, H - padB - y(o.observed[i])),
      class: out ? "c-bar out" : "c-bar",
    });
    bar.append(s("title", null, `${o.longLabels ? o.longLabels[i] : l}: ออก ${o.observed[i]} (คาดไว้ ${fmt1.format(o.expected[i])}, ช่วงปกติ ${fmtR(r)})`));
    svg.append(bar);
    svg.append(s("line", { x1: x + bw * 0.08, x2: x + bw * 0.92, y1: y(o.expected[i]), y2: y(o.expected[i]), class: "c-tick" }));
    if (i % every === 0) svg.append(s("text", { x: x + bw / 2, y: H - padB + 14, "text-anchor": "middle" }, l));
  });
  if (o.xTitle) svg.append(s("text", { x: (W + padL) / 2, y: H - 4, "text-anchor": "middle" }, o.xTitle));
  return [h("div", { class: "chart" }, svg), rangeLegend(), rangeTable(o)];
}

function niceStep(x) {
  if (x <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

const shortLabel = (l) => l.replace(/ \(เช่น [^)]*\)$/, "");

// ---------- page: stats ----------
const STAT_VIEWS = [
  ["freq", "ความถี่"], ["digits", "แต่ละหลัก"], ["chars", "ลักษณะเลข"], ["timeline", "รายปี"], ["compare", "เทียบช่วงเวลา"],
];

async function pageStats() {
  const params = new URLSearchParams(location.search);
  const state = {
    view: oneOf(params.get("v"), STAT_VIEWS.map((v) => v[0]), "freq"),
    prize: oneOf(params.get("p"), Object.keys(WIDTH), "last2"),
    period: "all", trust: "all", selected: null, block: 0, pair: null, tmode: "char:parity:1", tnum: "",
  };
  const tabs = h("div", { class: "seg tabs", role: "group", "aria-label": "เลือกมุมมอง" });
  const body = h("div");
  const views = { freq: viewFreq, digits: viewDigits, chars: viewChars, timeline: viewTimeline, compare: viewCompare };
  let seq = 0;
  async function draw() {
    const my = ++seq;
    const focusId = document.activeElement && document.activeElement.id;
    tabs.replaceChildren(...STAT_VIEWS.map(([k, label]) => h("button", {
      type: "button", "aria-pressed": String(state.view === k),
      onclick: () => { state.view = k; state.selected = null; draw(); },
    }, label)));
    history.replaceState(null, "", `?v=${state.view}&p=${state.prize}`);
    try {
      const nodes = await views[state.view](state, draw);
      if (my !== seq) return;
      body.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
      if (focusId) {
        const el = document.getElementById(focusId);
        if (el) el.focus();
      }
    } catch (err) {
      body.replaceChildren(h("p", { class: "error-text" }, String(err && err.message || err)));
    }
  }
  render(
    pageHead("สถิติ", "ทุกค่าเทียบกับค่าที่คาดไว้ถ้าการออกรางวัลสุ่มจริง ไม่มีค่าใดบอกโอกาสของงวดหน้า"),
    h("section", { class: "card" }, tabs),
    body);
  await draw();
}

// ----- มุมมอง: ความถี่ -----
async function viewFreq(state, redraw) {
  if (!WIDTH[state.prize] || state.prize === "first") state.prize = "last2";
  const [freq, idx] = await Promise.all([getData("stats/frequency.json"), index()]);
  const f = scopeData(freq, state)[state.prize];
  return [
    h("section", { class: "card section stack" }, prizeSeg(STAT_PRIZES, state, redraw), scopeControls(freq, state, redraw)),
    statsBody(f, state, idx, freq)];
}

function statsBody(f, state, idx, freq) {
  const width = WIDTH[state.prize];
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
    scopeNote(freq, state),
    h("div", { class: f.chi_square.p >= 0.05 ? "callout ok" : "callout" },
      h("strong", null, `Chi-square p = ${fmtP(f.chi_square.p)}`), " — ",
      f.chi_square.p >= 0.05
        ? "การกระจายของตัวเลขไม่ต่างจากการสุ่มอย่างมีนัยสำคัญ"
        : "การกระจายต่างจากการสุ่มอย่างมีนัยสำคัญที่ระดับ 5% (ดูการปรับสำหรับทดสอบหลายครั้งในหน้า \"สุ่มจริงไหม\")",
      h("br"),
      h("span", { class: "small" },
        `มี ${outside} จาก ${fmt.format(space)} เลขที่อยู่นอกช่วงปกติ 95% (ถ้าสุ่มจริงคาดว่าจะมีราว ${fmt.format(Math.round(f.expected_outside))} เลข)`)));

  const detail = h("div", { class: "stack", "aria-live": "polite" });
  function showDetail(num) {
    const i = Number(num);
    const dates = idx.filter((r) => (state.prize === "last2" ? r.last2 === num : r[state.prize].includes(num))
      && periodHas(state.period, r, idx) && trustHas(state.trust, r)).map((r) => r.draw_date).reverse();
    detail.replaceChildren(
      h("h3", null, `เลข ${num}`),
      h("p", null, `ออก ${fmt.format(f.counts[i])} ครั้ง (คาดไว้ ${fmt2.format(f.expected)}, ช่วงปกติ ${f.range95[0]}–${f.range95[1]})`),
      dates.length
        ? h("div", { class: "num-grid" }, dates.map((dt) => h("a", { href: `results.html?d=${dt}`, class: "small" }, thShort(dt))))
        : h("p", { class: "empty" }, "ไม่เคยออกในช่วงนี้"));
  }

  const parts = [summary];
  if (state.prize === "last2") {
    const grid = heatGrid(f, 0, 100, keyOf, state, showDetail, "แผนที่ความถี่เลขท้าย 2 ตัว 00–99");
    parts.push(h("section", { class: "card section stack" },
      h("h2", null, "แผนที่ความถี่ 00–99"),
      heatLegend(),
      grid,
      h("p", { class: "small muted" }, "สีแสดงระยะห่างจากค่าที่คาดไว้ ไม่ใช่โอกาสของงวดหน้า เลขที่ออกบ่อยหรือน้อยในอดีตมีโอกาสออกงวดหน้าเท่ากับเลขอื่น (1 ใน 100)"),
      detail,
      freqTable(f, keyOf, 0, 100)));
  } else {
    parts.push(heat1000(f, keyOf, state, showDetail, detail));
    parts.push(h("section", { class: "card section stack" },
      h("h2", null, "มีกี่เลขที่ออก 0, 1, 2, … ครั้ง"),
      h("p", { class: "small muted" }, `เลข 3 ตัวมี 1,000 แบบ แต่แต่ละเลขออกเฉลี่ยเพียง ${fmt2.format(f.expected)} ครั้ง ภาพรวมนี้จึงบอกได้ดีกว่าการดูทีละเลข`),
      histogram(f.count_histogram)));
  }
  return parts;
}

function heatLegend() {
  const legendBar = h("span", { class: "bar" });
  legendBar.style.background = "linear-gradient(90deg, color-mix(in srgb, var(--lo) 70%, var(--card)), var(--card), color-mix(in srgb, var(--hi) 70%, var(--card)))";
  return h("div", { class: "legend" }, "น้อยกว่าที่คาด", legendBar, "มากกว่าที่คาด", h("span", null, "· กรอบ = นอกช่วงปกติ 95%"));
}

function heatGrid(f, start, count, keyOf, state, showDetail, label) {
  const grid = h("div", { class: "heatmap", role: "group", "aria-label": label });
  for (let i = start; i < start + count; i++) {
    const c = f.counts[i];
    const num = keyOf(i);
    const out = c < f.range95[0] || c > f.range95[1];
    const btn = h("button", {
      type: "button", class: out ? "out" : null, "aria-pressed": String(state.selected === num),
      "aria-label": `เลข ${num} ออก ${c} ครั้ง${out ? " (นอกช่วงปกติ)" : ""}`,
      onclick: () => {
        state.selected = num;
        grid.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
        btn.setAttribute("aria-pressed", "true");
        showDetail(num);
      },
    }, h("span", null, num), h("span", { class: "c" }, c));
    btn.style.background = zColor(c, f.expected);
    grid.append(btn);
  }
  return grid;
}

// heatmap 000–999: ภาพรวม 10 บล็อก (ตามหลักร้อย) + บล็อกที่เลือกแบบมีตัวเลข
function heat1000(f, keyOf, state, showDetail, detail) {
  const outside = f.counts.filter((c) => c < f.range95[0] || c > f.range95[1]).length;
  const blockWrap = h("div", { class: "stack" });
  const overview = h("div", { class: "mini-blocks", role: "group", "aria-label": "เลือกหลักร้อย" });
  function pick(b) {
    state.block = b;
    overview.querySelectorAll("button").forEach((x, j) => x.setAttribute("aria-pressed", String(j === b)));
    blockWrap.replaceChildren(
      h("h3", null, `เลข ${keyOf(b * 100)}–${keyOf(b * 100 + 99)}`),
      heatGrid(f, b * 100, 100, keyOf, state, showDetail, `แผนที่ความถี่เลข ${keyOf(b * 100)}–${keyOf(b * 100 + 99)}`),
      freqTable(f, keyOf, b * 100, 100));
  }
  for (let b = 0; b < 10; b++) {
    const cells = h("span", { class: "mini", "aria-hidden": "true" });
    for (let i = b * 100; i < b * 100 + 100; i++) {
      const c = f.counts[i];
      const cell = h("span", { class: c < f.range95[0] || c > f.range95[1] ? "out" : null });
      cell.style.background = zColor(c, f.expected);
      cells.append(cell);
    }
    overview.append(h("button", {
      type: "button", "aria-pressed": String(state.block === b), "aria-label": `ดูเลข ${b}00–${b}99`,
      onclick: () => pick(b),
    }, cells, h("span", { class: "small" }, `${b}xx`)));
  }
  pick(state.block || 0);
  const input = h("input", { id: "lookup", type: "text", inputmode: "numeric", maxlength: "3", autocomplete: "off", placeholder: "000–999" });
  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9]/g, "").slice(0, 3);
    if (input.value.length === 3) {
      pick(Number(input.value[0]));
      showDetail(input.value);
    }
  });
  return h("section", { class: "card section stack" },
    h("h2", null, "แผนที่ความถี่ 000–999"),
    h("div", { class: "callout warn-box" },
      h("strong", null, "ตัวอย่างน้อยมาก: "),
      `แต่ละเลขคาดไว้เพียง ${fmt2.format(f.expected)} ครั้ง (ช่วงปกติ ${f.range95[0]}–${f.range95[1]} ครั้ง) สีที่ต่างกันในแผนที่นี้จึงเกือบทั้งหมดเป็นความผันผวนของการสุ่ม`,
      h("br"),
      h("span", { class: "small" }, `นอกช่วงปกติ ${fmt.format(outside)} จาก 1,000 เลข — ถ้าสุ่มจริงก็คาดว่าจะมีราว ${fmt.format(Math.round(f.expected_outside))} เลข`)),
    heatLegend(),
    overview,
    h("div", { class: "field" }, h("label", { for: "lookup" }, "ดูเลข 3 ตัว"), input),
    blockWrap,
    detail);
}

function freqTable(f, keyOf, start = 0, count = f.counts.length) {
  const rows = [];
  for (let i = start; i < start + count; i++) {
    const c = f.counts[i];
    rows.push(h("tr", null,
      h("td", { class: "mono" }, keyOf(i)), h("td", { class: "n" }, c), h("td", { class: "n" }, fmt2.format(f.expected)),
      h("td", { class: "n" }, (c - f.expected >= 0 ? "+" : "") + fmt1.format(c - f.expected)),
      h("td", null, c < f.range95[0] || c > f.range95[1] ? "นอกช่วงปกติ" : "")));
  }
  return h("details", null,
    h("summary", null, "แสดงเป็นตาราง"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "เลข"), h("th", { class: "n" }, "ออก (ครั้ง)"), h("th", { class: "n" }, "คาดไว้"), h("th", { class: "n" }, "ต่างจากที่คาด"), h("th", null, "ช่วงปกติ"))),
      h("tbody", null, rows))));
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
  return [h("div", { class: "chart chart-wide" }, svg), legend, table];
}

// ----- มุมมอง: แต่ละหลัก -----
async function viewDigits(state, redraw) {
  const dj = await getData("stats/digits.json");
  const scope = scopeData(dj, state);
  const d = scope[state.prize];
  const total = Object.values(scope).reduce((a, x) => a + x.positions.filter((p) => p.p !== null).length, 0);
  const posLabel = (k) => (state.prize === "first" ? `หลักที่ ${k} (นับจากซ้าย)` : `หลักที่ ${k}`);
  return [
    h("section", { class: "card section stack" }, prizeSeg(DIGIT_PRIZES, state, redraw), scopeControls(dj, state, redraw)),
    h("section", { class: "card section stack" },
      h("h2", null, `ตัวเลข 0–9 ในแต่ละหลักของ${PRIZE_LABEL[state.prize]}`),
      h("div", { class: "stat-row" },
        stat("งวดที่มีรางวัลนี้", fmt.format(d.eligible_draws)),
        stat("จำนวนหมายเลข", fmt.format(d.n)),
        stat("คาดไว้ต่อตัวเลข", fmt1.format(d.expected)),
        stat("ช่วงปกติ 95%", fmtR(d.range95))),
      scopeNote(dj, state),
      h("p", { class: "small muted" }, `ถ้าสุ่มจริง ตัวเลข 0–9 ในแต่ละหลักมีโอกาสเท่ากัน (1 ใน 10) · p หลังปรับใช้ Bonferroni ตามจำนวนการทดสอบทั้งหมดในมุมมองนี้ (${total} หลัก จากทุกรางวัล)`)),
    h("div", { class: "grid grid-2e section" }, d.positions.map((pos) => h("section", { class: "card stack" },
      h("h3", null, posLabel(pos.position)),
      rangeBars({
        title: `${PRIZE_LABEL[state.prize]} ${posLabel(pos.position)}: จำนวนตัวเลข 0–9 เทียบกับที่คาดไว้`,
        labels: [...Array(10).keys()].map(String), observed: pos.counts,
        expected: Array(10).fill(d.expected), ranges: Array(10).fill(d.range95), catTitle: "ตัวเลข", labelEvery: 1,
      }),
      pLine(pos, `${total} การทดสอบ`)))),
  ];
}

// ----- มุมมอง: ลักษณะเลข -----
async function viewChars(state, redraw) {
  if (state.prize === "first") state.prize = "last2";
  const cj = await getData("stats/characteristics.json");
  const scope = scopeData(cj, state);
  const c = scope[state.prize];
  const total = Object.values(scope).reduce((a, x) => a + x.items.filter((it) => it.p !== null).length, 0);
  return [
    h("section", { class: "card section stack" }, prizeSeg(STAT_PRIZES, state, redraw), scopeControls(cj, state, redraw)),
    h("section", { class: "card section stack" },
      h("h2", null, `การกระจายของลักษณะเลข: ${PRIZE_LABEL[state.prize]}`),
      h("div", { class: "stat-row" },
        stat("งวดที่มีรางวัลนี้", fmt.format(c.eligible_draws)),
        stat("จำนวนหมายเลข", fmt.format(c.n))),
      scopeNote(cj, state),
      h("p", { class: "small muted" },
        "ค่าที่คาดไว้คำนวณแบบตรงตัวจากการนับเลขทุกตัวที่เป็นไปได้ (เช่น เลขท้าย 2 ตัวที่เป็นเลขเบิ้ลมี 10 จาก 100 แบบ จึงคาดไว้ 10%) ",
        `· p หลังปรับใช้ Bonferroni ตามจำนวนการทดสอบในมุมมองนี้ (${total} การทดสอบ) · กลุ่มที่คาดไว้น้อยกว่า 5 ครั้งถูกรวมกับกลุ่มข้างเคียงก่อนคำนวณ chi-square`)),
    h("div", { class: "grid grid-2e section" }, c.items.map((it) => {
      const expected = it.probs.map((p) => p * c.n);
      const opts = {
        title: `${it.label} ของ${PRIZE_LABEL[state.prize]} เทียบกับที่คาดไว้`,
        labels: it.key === "digit_sum" ? it.categories : it.categories.map(shortLabel),
        longLabels: it.categories, observed: it.observed, expected, ranges: it.range95,
        catTitle: it.key === "digit_sum" ? "ผลรวม" : "กลุ่ม",
      };
      return h("section", { class: `card stack${it.key === "digit_sum" ? " span-2" : ""}` },
        h("h3", null, it.label),
        it.key === "digit_sum" ? rangeBars({ ...opts, xTitle: "ผลรวมของทุกหลัก" }) : rangeRows(opts),
        pLine(it, `${total} การทดสอบ`));
    })),
  ];
}

// ----- มุมมอง: รายปี -----
async function viewTimeline(state, redraw) {
  if (state.prize === "first") state.prize = "last2";
  const [tj, idx] = await Promise.all([getData("stats/timeline.json"), index()]);
  const t = (tj.data[state.trust] || tj.data.all)[state.prize];
  const width = WIDTH[state.prize];
  const modes = [["number", "เลขที่เลือก"]];
  for (const c of t.characteristics) {
    c.categories.forEach((cat, i) => {
      if (c.key !== "digit_sum") modes.push([`char:${c.key}:${i}`, `${c.label}: ${shortLabel(cat)}`]);
    });
  }
  if (!modes.some(([k]) => k === state.tmode)) state.tmode = "char:parity:1";
  const years = t.years;
  const be = years.map((y) => String(Number(y.year) + 543));
  const chartWrap = h("div", { class: "stack" });

  function drawNumber(num) {
    if (!new RegExp(`^\\d{${width}}$`).test(num)) {
      chartWrap.replaceChildren(h("p", { class: "muted" }, `ใส่เลข ${width} หลักเพื่อดูจำนวนครั้งที่ออกในแต่ละปี`));
      return;
    }
    const byYear = new Map(years.map((y) => [y.year, 0]));
    for (const r of idx) {
      if (!trustHas(state.trust, r)) continue;
      const list = state.prize === "last2" ? [r.last2] : r[state.prize];
      const k = list.filter((v) => v === num).length;
      if (k && byYear.has(r.draw_date.slice(0, 4))) byYear.set(r.draw_date.slice(0, 4), byYear.get(r.draw_date.slice(0, 4)) + k);
    }
    const o = {
      title: `เลข ${num} ออกในแต่ละปี เทียบกับที่คาดไว้`, labels: be, observed: years.map((y) => byYear.get(y.year)),
      expected: years.map((y) => y.slots / t.space), ranges: years.map((y) => y.number_range95), catTitle: "ปี พ.ศ.",
      xTitle: "ปี พ.ศ.", labelEvery: 5, unit: "ปี",
    };
    chartWrap.replaceChildren(h("h3", null, `เลข ${num}`), ...rangeBars(o), outSummary(o),
      h("p", { class: "small muted" }, "จำนวนครั้งในอดีตไม่ได้บอกโอกาสของปีหน้าหรืองวดหน้า"));
  }

  const controls = [prizeSeg(STAT_PRIZES, state, redraw),
    h("div", { class: "controls" },
      selectBox("trust", "แหล่งข้อมูล", tj.trusts.map((k) => [k, tj.trust_labels[k]]), state.trust, (v) => { state.trust = v; redraw(); }),
      selectBox("tmode", "ดูอะไร", modes, state.tmode, (v) => { state.tmode = v; redraw(); }))];
  if (state.tmode === "number") {
    const input = h("input", { id: "tnum", type: "text", inputmode: "numeric", maxlength: String(width), autocomplete: "off", placeholder: width === 2 ? "00–99" : "000–999", value: state.tnum.length === width ? state.tnum : "" });
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "").slice(0, width);
      state.tnum = input.value;
      drawNumber(input.value);
    });
    controls.push(h("div", { class: "field" }, h("label", { for: "tnum" }, `เลข ${width} หลัก`), input));
    drawNumber(input.value);
  } else {
    const [, key, ci] = state.tmode.split(":");
    const c = t.characteristics.find((x) => x.key === key);
    const i = Number(ci);
    const o = {
      title: `${c.label}: ${c.categories[i]} ในแต่ละปี`, labels: be,
      observed: years.map((y) => y.characteristics[key][i]),
      expected: years.map((y) => y.slots * c.probs[i]), ranges: c.range95.map((r) => r[i]),
      catTitle: "ปี พ.ศ.", xTitle: "ปี พ.ศ.", labelEvery: 5, unit: "ปี",
    };
    chartWrap.replaceChildren(h("h3", null, `${c.label}: ${c.categories[i]}`),
      h("p", { class: "small muted" }, `ถ้าสุ่มจริง คาดไว้ ${pct(c.probs[i])} ของหมายเลขในแต่ละปี`),
      ...rangeBars(o), outSummary(o));
  }
  return [
    h("section", { class: "card section stack" }, controls),
    h("section", { class: "card section stack" },
      h("h2", null, `รายปี: ${PRIZE_LABEL[state.prize]}`),
      h("p", { class: "small muted scope-note" }, `แหล่งข้อมูล: ${tj.trust_labels[state.trust]} · ปีที่ไม่มีงวดในแหล่งที่เลือกจะไม่แสดง`),
      chartWrap,
      h("p", { class: "small muted" },
        "แต่ละปีมีค่าที่คาดไว้ของตัวเอง เพราะจำนวนงวดและจำนวนหมายเลขต่อปีไม่เท่ากัน",
        state.prize === "back3" ? " · เลขท้าย 3 ตัวมี 4 หมายเลขต่องวดก่อน 1 ก.ย. 2558 และ 2 หมายเลขหลังจากนั้น ค่าที่คาดไว้จึงลดลงตั้งแต่ปี 2558" : "",
        state.prize === "front3" ? " · เลขหน้า 3 ตัวเริ่มมีตั้งแต่ 1 ก.ย. 2558" : ""),
      h("details", null, h("summary", null, "จำนวนงวดและหมายเลขในแต่ละปี"), h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "ปี พ.ศ."), h("th", { class: "n" }, "งวด"), h("th", { class: "n" }, "หมายเลข"))),
        h("tbody", null, years.map((y, i) => h("tr", null, h("td", null, be[i]), h("td", { class: "n" }, y.draws), h("td", { class: "n" }, y.slots)))))))),
  ];
}

// ----- มุมมอง: เทียบช่วงเวลา -----
async function viewCompare(state, redraw) {
  const cj = await getData("stats/compare.json");
  const pairs = cj.pairs;
  if (!pairs.some((p) => p.key === state.pair)) state.pair = pairs[0].key;
  const pair = pairs.find((p) => p.key === state.pair);
  const all = pair.results.flatMap((r) => r.tests).filter((t) => t.p !== null);
  const span = (x) => `${thShort(x.first_draw)} – ${thShort(x.last_draw)} (${fmt.format(x.draws)} งวด)`;
  const why = {
    back3: "เลขท้าย 3 ตัวมี 4 หมายเลขต่องวดก่อน 1 ก.ย. 2558 และ 2 หมายเลขหลังจากนั้น",
    front3: "เลขหน้า 3 ตัวมีเฉพาะตั้งแต่ 1 ก.ย. 2558",
  };
  const excluded = pair.excluded.filter((p) => why[p]);
  return [
    h("section", { class: "card section stack" },
      selectBox("pair", "เทียบช่วงไหน", pairs.map((p) => [p.key, p.label]), state.pair, (v) => { state.pair = v; redraw(); }),
      h("div", { class: "stat-row stat-row-2" }, stat("ช่วง A", span(pair.a)), stat("ช่วง B", span(pair.b))),
      excluded.length ? h("p", { class: "small muted" }, "ไม่เทียบ ", excluded.map((p) => `${PRIZE_LABEL[p]} (${why[p]})`).join(" และ "),
        " เพราะโครงสร้างรางวัลของสองช่วงต่างกัน") : null,
      h("p", { class: "small muted" },
        `ทดสอบว่าการกระจายของสองช่วงต่างกันไหม (chi-square แบบตาราง 2 แถว) ทั้งหมด ${all.length} การทดสอบ · p หลังปรับใช้ Bonferroni ตามจำนวนนี้ · ถ้าสุ่มจริงและการออกรางวัลไม่เปลี่ยนไป ทุกช่วงควรได้ผล "ปกติ"`)),
    pair.results.map((r) => h("section", { class: "card section stack" },
      h("h2", null, PRIZE_LABEL[r.prize]),
      h("p", { class: "small muted" }, `หมายเลขในช่วง A ${fmt.format(r.n_a)} · ช่วง B ${fmt.format(r.n_b)}`),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "การทดสอบ"), h("th", { class: "n" }, "p"), h("th", { class: "n" }, "p หลังปรับ"), h("th", null, "ผล"))),
        h("tbody", null, r.tests.map((t) => h("tr", null,
          h("td", null, t.label), h("td", { class: "n" }, t.p === null ? "–" : fmtP(t.p)),
          h("td", { class: "n" }, t.p === null ? "–" : fmtP(t.p_bonferroni)), h("td", null, resultChip(t.p, t.p_bonferroni))))))),
      r.tests.filter((t) => t.kind !== "number").map((t) => compareDetail(t, r)))),
  ];
}

function compareDetail(t, r) {
  const na = r.n_a || 1, nb = r.n_b || 1;
  return h("details", null, h("summary", null, `${t.label}: สัดส่วนในแต่ละช่วง`), h("div", { class: "table-wrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "กลุ่ม"), h("th", { class: "n" }, "ช่วง A"), h("th", { class: "n" }, "ช่วง B"), h("th", { class: "n" }, "คาดไว้"))),
    h("tbody", null, t.categories.map((c, i) => h("tr", null, h("td", null, c),
      h("td", { class: "n" }, `${t.a[i]} (${pct(t.a[i] / na)})`), h("td", { class: "n" }, `${t.b[i]} (${pct(t.b[i] / nb)})`),
      h("td", { class: "n" }, pct(t.probs[i]))))))));
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

  const gaps = await gapSection();

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
        h("div", { class: "stat-row" }, stat("ราคาสลาก", "80 บาท"), stat("รางวัลเฉลี่ยต่อใบ", `${fmt.format(PER_TICKET)} บาท`)),
        h("p", { class: "small muted" }, `จากเงินรางวัลรวม ${fmt.format(PRIZE_TOTAL)} บาทต่อสลาก 1 ล้านใบ (อัตรารางวัลปัจจุบัน โปรดตรวจสอบกับ GLO) ได้คืนเฉลี่ย ${pct(PER_TICKET / TICKET_PRICE, 0)} ของราคา`))),
    h("section", { class: "card section stack" },
      h("h2", null, "ผลการทดสอบทั้งหมด"),
      h("p", { class: "small muted" }, `p คือโอกาสที่การสุ่มจริงจะให้ผลเบี้ยวอย่างน้อยเท่านี้ ถ้าทดสอบหลายแบบ ย่อมมีบางแบบที่ p < 0.05 โดยบังเอิญ (ทดสอบ ${r.test_count} แบบ คาดว่าจะเจอราว ${fmt1.format(r.test_count * 0.05)} แบบ เจอจริง ${rawFlag.length} แบบ) จึงปรับด้วยวิธี Bonferroni (คูณ p ด้วยจำนวนการทดสอบ)`),
      testTable,
      h("p", { class: "small muted" }, "ตัวอย่าง: หลักหน่วยของรางวัลที่ 1 มี p ต่ำ แต่หลังปรับแล้วไม่ผิดปกติ · ตัวเลขในรางวัลที่ 2–5 ผิดปกติเล็กน้อยเฉพาะข้อมูลแหล่งเดียวที่ยังไม่ได้ตรวจทาน ส่วนข้อมูลทางการกระจายเท่ากัน แสดงว่าคุณภาพข้อมูลมีผลต่อสถิติ")),
    gaps,
    responsibleBox());
}

// ---------- page: data ----------
async function pageData() {
  const m = await manifest();
  const t = m.by_trust;
  render(
    pageHead("ข้อมูลและแหล่งที่มา", `อัปเดตล่าสุด: งวด ${m.latest_draw_th}`),
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
        h("li", null, "Backtest ใช้เฉพาะข้อมูลก่อนหน้าแต่ละงวด (ไม่มีการใช้ข้อมูลอนาคต)"),
        h("li", null, "ค่าที่คาดไว้ของลักษณะเลข (คู่/คี่, ผลรวม, เลขซ้ำ, เลขเรียง) นับแบบตรงตัวจากเลขทุกตัวที่เป็นไปได้ ไม่ใช่ค่าประมาณ"),
        h("li", null, "เปรียบเทียบช่วงเวลาเฉพาะรางวัลที่โครงสร้างเหมือนกันในทั้งสองช่วง (เลขท้าย 3 ตัวมี 4 หมายเลขต่องวดก่อน 1 ก.ย. 2558 และ 2 หมายเลขหลังจากนั้น)"),
        h("li", null, "ระยะห่างระหว่างการออกเทียบกับการแจกแจงเรขาคณิตที่คาดไว้ และช่วงปกติจากการจำลองการสุ่ม 1,000 รอบ"),
        h("li", null, "ห้องทดลองใช้ exact binomial test และปรับ p ตามจำนวนเงื่อนไขที่ลอง (Bonferroni และ FDR)"))));
}

// ---------- lab core (BEGIN) ----------
// ฟังก์ชันล้วน ไม่แตะ DOM — tests/test_lab_js.py ดึงส่วนนี้ไปรันด้วย node เทียบกับ Python
function logFactorials(n) {
  const t = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) t[i] = t[i - 1] + Math.log(i);
  return t;
}

function binomPmfList(n, p) {
  const lf = logFactorials(n);
  const lp = Math.log(p), lq = Math.log1p(-p);
  const out = new Array(n + 1);
  for (let k = 0; k <= n; k++) out[k] = Math.exp(lf[n] - lf[k] - lf[n - k] + k * lp + (n - k) * lq);
  return out;
}

// exact binomial test สองด้าน (เหมือน lotto_analysis.binom_test_two_sided)
function binomTwoSided(k, n, p) {
  if (n === 0) return 1;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  const pmf = binomPmfList(n, p);
  const lim = pmf[k] * (1 + 1e-7);
  let sum = 0;
  for (const v of pmf) if (v <= lim) sum += v;
  return Math.min(1, sum);
}

// ช่วงกลาง 95% ของ Binomial(n, p) (เหมือน lotto_stats.binom_interval)
function binomRange(n, p, level = 0.95) {
  if (n === 0 || p <= 0) return [0, 0];
  if (p >= 1) return [n, n];
  const pmf = binomPmfList(n, p);
  const a = (1 - level) / 2;
  let cum = 0, lo = null, hi = n;
  for (let k = 0; k <= n; k++) {
    cum += pmf[k];
    if (lo === null && cum >= a) lo = k;
    if (cum >= 1 - a) { hi = k; break; }
  }
  return [lo, hi];
}

function bonferroniList(ps) {
  return ps.map((p) => Math.min(1, p * ps.length));
}

// Benjamini–Hochberg q-value (เหมือน lotto_analysis.fdr_bh)
function fdrList(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b] || a - b);
  const q = new Array(m);
  let prev = 1;
  for (let rank = m; rank >= 1; rank--) {
    const i = order[rank - 1];
    prev = Math.min(prev, (ps[i] * m) / rank);
    q[i] = Math.min(1, prev);
  }
  return q;
}

// เงื่อนไข: digits[i] = null | 0–9, parity any|even|odd, sumMin/sumMax,
// repeat any|none|some|adjacent|all, consec any|asc|desc|either|not
function makePredicate(c, width) {
  const maxSum = 9 * width;
  return (str) => {
    for (let i = 0; i < width; i++) {
      if (c.digits[i] !== null && str.charCodeAt(i) - 48 !== c.digits[i]) return false;
    }
    if (c.parity !== "any" && ((str.charCodeAt(width - 1) - 48) % 2 === 1) !== (c.parity === "odd")) return false;
    if (c.sumMin > 0 || c.sumMax < maxSum) {
      let sum = 0;
      for (let i = 0; i < width; i++) sum += str.charCodeAt(i) - 48;
      if (sum < c.sumMin || sum > c.sumMax) return false;
    }
    if (c.repeat !== "any") {
      const distinct = new Set(str).size;
      let adjacent = false;
      for (let i = 1; i < width; i++) if (str[i] === str[i - 1]) adjacent = true;
      const ok = { none: distinct === width, some: distinct < width, adjacent, all: distinct === 1 }[c.repeat];
      if (!ok) return false;
    }
    if (c.consec !== "any") {
      let asc = true, desc = true;
      for (let i = 1; i < width; i++) {
        const d = str.charCodeAt(i) - str.charCodeAt(i - 1);
        if (d !== 1) asc = false;
        if (d !== -1) desc = false;
      }
      const ok = { asc, desc, either: asc || desc, not: !asc && !desc }[c.consec];
      if (!ok) return false;
    }
    return true;
  };
}

// ความน่าจะเป็นที่คาดไว้แบบ exact: ไล่ทุกเลข 0 .. 10^width − 1
function conditionProb(c, width) {
  const pred = makePredicate(c, width);
  const space = 10 ** width;
  let k = 0;
  for (let i = 0; i < space; i++) if (pred(String(i).padStart(width, "0"))) k++;
  return k / space;
}
// ---------- lab core (END) ----------

// ---------- page: research lab ----------
const LAB_PRIZES = [["last2", "เลขท้าย 2 ตัว"], ["back3", "เลขท้าย 3 ตัว"], ["front3", "เลขหน้า 3 ตัว"], ["first", "รางวัลที่ 1"]];
const LAB_REPEAT = {
  any: "ไม่กำหนด", none: "ไม่มีตัวเลขซ้ำเลย", some: "มีตัวเลขซ้ำอย่างน้อย 2 ตัว", adjacent: "มีหลักติดกันซ้ำ (เบิ้ล)", all: "ทุกหลักเหมือนกัน",
};
const LAB_CONSEC = { any: "ไม่กำหนด", asc: "เรียงขึ้นทีละ 1", desc: "เรียงลงทีละ 1", either: "เรียงขึ้นหรือลง", not: "ไม่เรียง" };
const LAB_PARITY = { any: "ไม่กำหนด", even: "เลขคู่", odd: "เลขคี่" };

function describeCondition(c, width) {
  const parts = [];
  c.digits.forEach((d, i) => { if (d !== null) parts.push(`หลักที่ ${i + 1} = ${d}`); });
  if (c.parity !== "any") parts.push(LAB_PARITY[c.parity]);
  if (c.sumMin > 0 || c.sumMax < 9 * width) parts.push(c.sumMin === c.sumMax ? `ผลรวม = ${c.sumMin}` : `ผลรวม ${c.sumMin}–${c.sumMax}`);
  if (c.repeat !== "any") parts.push(LAB_REPEAT[c.repeat]);
  if (c.consec !== "any") parts.push(LAB_CONSEC[c.consec]);
  return parts.join(", ");
}

async function pageLab() {
  const [freq, idx] = await Promise.all([getData("stats/frequency.json"), index()]);
  const history = []; // เก็บในหน่วยความจำของหน้านี้เท่านั้น ปิดหน้าแล้วหาย
  const state = { prize: "last2", period: "all", trust: "all" };
  const form = h("form", { class: "stack", novalidate: true, autocomplete: "off" });
  const out = h("div", { class: "stack", "aria-live": "polite" });
  const histBox = h("div");

  function sel(id, label, opts, value) {
    return h("div", { class: "field" }, h("label", { for: id, class: "small muted" }, label),
      h("select", { id }, opts.map(([k, l]) => h("option", { value: k, selected: String(k) === String(value) }, l))));
  }
  const val = (id) => document.getElementById(id).value;

  function buildForm() {
    const width = WIDTH[state.prize];
    const digitOpts = [["", "ใดก็ได้"], ...[...Array(10).keys()].map((d) => [String(d), String(d)])];
    const sums = [...Array(9 * width + 1).keys()].map((v) => [String(v), String(v)]);
    const repeatKeys = width === 2 ? ["any", "none", "all"] : ["any", "none", "some", "adjacent", "all"];
    const repeatLabel = (k) => (width === 2 && k === "all" ? "เบิ้ล (เช่น 11)" : width === 2 && k === "none" ? "ไม่เบิ้ล" : LAB_REPEAT[k]);
    const prizeSel = sel("lab-prize", "รางวัล", LAB_PRIZES, state.prize);
    prizeSel.querySelector("select").addEventListener("change", (e) => {
      state.prize = oneOf(e.target.value, Object.keys(WIDTH), "last2");
      state.period = oneOf(val("lab-period"), freq.periods, "all");
      state.trust = oneOf(val("lab-trust"), freq.trusts, "all");
      buildForm();
      document.getElementById("lab-prize").focus();
    });
    form.replaceChildren(
      h("div", { class: "controls" },
        prizeSel,
        sel("lab-period", "ช่วงเวลา", freq.periods.map((k) => [k, freq.period_labels[k]]), state.period),
        sel("lab-trust", "แหล่งข้อมูล", freq.trusts.map((k) => [k, freq.trust_labels[k]]), state.trust)),
      h("fieldset", null, h("legend", null, "ตัวเลขในแต่ละหลัก"),
        h("div", { class: "digit-row" }, [...Array(width).keys()].map((i) => sel(`lab-d${i}`, `หลักที่ ${i + 1}`, digitOpts, "")))),
      h("div", { class: "controls" },
        sel("lab-parity", "คู่ / คี่", Object.entries(LAB_PARITY), "any"),
        sel("lab-smin", "ผลรวมของหลัก ตั้งแต่", sums, 0),
        sel("lab-smax", "ถึง", sums, 9 * width),
        sel("lab-repeat", "ตัวเลขซ้ำ", repeatKeys.map((k) => [k, repeatLabel(k)]), "any"),
        sel("lab-consec", "เลขเรียง", Object.entries(LAB_CONSEC), "any")),
      h("p", { class: "error-text", id: "lab-err", role: "alert" }),
      h("button", { class: "btn", type: "submit" }, "ทดสอบเงื่อนไขนี้"));
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    state.period = oneOf(val("lab-period"), freq.periods, "all");
    state.trust = oneOf(val("lab-trust"), freq.trusts, "all");
    const width = WIDTH[state.prize];
    const c = {
      digits: [...Array(width).keys()].map((i) => (/^\d$/.test(val(`lab-d${i}`)) ? Number(val(`lab-d${i}`)) : null)),
      parity: oneOf(val("lab-parity"), Object.keys(LAB_PARITY), "any"),
      sumMin: Number(val("lab-smin")) || 0, sumMax: Number(val("lab-smax")),
      repeat: oneOf(val("lab-repeat"), Object.keys(LAB_REPEAT), "any"),
      consec: oneOf(val("lab-consec"), Object.keys(LAB_CONSEC), "any"),
    };
    if (!(c.sumMax >= 0 && c.sumMax <= 9 * width)) c.sumMax = 9 * width;
    const err = document.getElementById("lab-err");
    if (c.sumMin > c.sumMax) { err.textContent = "ผลรวมเริ่มต้นต้องไม่มากกว่าค่าสิ้นสุด"; return; }
    const text = describeCondition(c, width);
    if (!text) { err.textContent = "ยังไม่ได้ตั้งเงื่อนไข ลองเลือกอย่างน้อย 1 ข้อ"; return; }
    err.textContent = "";
    runLab(c, text);
  });

  function runLab(c, text) {
    const width = WIDTH[state.prize];
    const pred = makePredicate(c, width);
    const p = conditionProb(c, width);
    const rows = idx.filter((r) => periodHas(state.period, r, idx) && trustHas(state.trust, r));
    let n = 0, k = 0;
    const matched = [];
    for (const r of rows) {
      const list = state.prize === "last2" ? [r.last2] : state.prize === "first" ? [r.first] : r[state.prize];
      if (!list.length) continue; // งวดที่ไม่มีรางวัลนี้ไม่นับในตัวหาร
      n += list.length;
      const hit = list.filter(pred);
      k += hit.length;
      if (hit.length) matched.push([r, hit]);
    }
    const expected = n * p;
    const range = binomRange(n, p);
    const pval = binomTwoSided(k, n, p);
    const key = `${state.prize}|${state.period}|${state.trust}|${JSON.stringify(c)}`;
    let entry = history.find((x) => x.key === key);
    if (!entry) {
      entry = { key, label: `${PRIZE_LABEL[state.prize]}: ${text}`, scope: `${freq.period_labels[state.period]} · ${freq.trust_labels[state.trust]}`, n, k, expected, p: pval };
      history.push(entry);
    }
    const ps = history.map((x) => x.p);
    const bon = bonferroniList(ps), fdr = fdrList(ps);
    history.forEach((x, i) => { x.bon = bon[i]; x.fdr = fdr[i]; });
    const m = history.length;

    const verdict = entry.bon < 0.05
      ? "ต่างจากที่คาดไว้แม้หลังปรับแล้ว — ควรตรวจซ้ำด้วยข้อมูลช่วงอื่นก่อนสรุป และไม่ได้แปลว่างวดหน้าจะเป็นแบบนี้"
      : entry.p < 0.05
        ? `p ก่อนปรับต่ำกว่า 0.05 แต่หลังปรับสำหรับ ${m} เงื่อนไขที่ลองแล้วไม่ผิดปกติ — ระดับนี้เกิดจากการสุ่มได้เมื่อลองหลายเงื่อนไข`
        : "ไม่ต่างจากที่คาดไว้ถ้าสุ่มจริง";
    const shown = matched.slice().reverse();
    const list = h("ul", { class: "hits" });
    const more = h("button", { class: "btn btn-ghost", type: "button" }, `แสดงทั้งหมด ${fmt.format(shown.length)} งวด`);
    function fill(limit) {
      list.replaceChildren(...shown.slice(0, limit).map(([r, hit]) => h("li", null,
        h("a", { href: `results.html?d=${r.draw_date}` }, thShort(r.draw_date)),
        hit.map((v) => h("span", { class: "chip mono" }, v)),
        r.trust_level !== "official" ? trustChip(r.trust_level) : null)));
      more.hidden = shown.length <= limit;
    }
    more.addEventListener("click", () => fill(shown.length));
    fill(30);
    out.replaceChildren(
      h("h2", null, "ผลลัพธ์"),
      h("p", null, h("strong", null, entry.label), h("br"), h("span", { class: "small muted" }, entry.scope)),
      h("div", { class: "stat-row" },
        stat("หมายเลขทั้งหมด", fmt.format(n), "นับทุกหมายเลขของรางวัลนี้ในงวดที่มีรางวัล"),
        stat("เข้าเงื่อนไข", fmt.format(k)),
        stat("คาดไว้ถ้าสุ่มจริง", fmt1.format(expected), `${pct(p, 2)} ของเลขที่เป็นไปได้ทั้งหมด`),
        stat("ช่วงปกติ 95%", fmtR(range))),
      h("p", { class: "small muted" }, `เลขที่เข้าเงื่อนไขมี ${pct(p, 2)} ของเลขทั้งหมดที่เป็นไปได้ (นับแบบตรงตัวทุกเลข) จึงคาดไว้ ${fmt.format(n)} × ${pct(p, 2)} = ${fmt1.format(expected)}`),
      h("div", { class: entry.bon < 0.05 ? "callout" : "callout ok" },
        h("strong", null, `p = ${fmtP(entry.p)} · หลังปรับ (Bonferroni, ${m} เงื่อนไข) = ${fmtP(entry.bon)} · FDR q = ${fmtP(entry.fdr)}`),
        h("br"), verdict),
      h("h3", null, `งวดที่มีหมายเลขเข้าเงื่อนไข `, h("span", { class: "muted small" }, `${fmt.format(matched.length)} งวด`)),
      shown.length ? list : h("p", { class: "empty" }, "ไม่มี"),
      more);
    drawHistory();
  }

  function drawHistory() {
    if (!history.length) { histBox.replaceChildren(); return; }
    histBox.replaceChildren(h("section", { class: "card section stack" },
      h("h2", null, `เงื่อนไขที่ลองแล้ว (${history.length})`),
      h("p", { class: "small muted" }, "เก็บไว้เฉพาะในหน้านี้ ปิดหรือรีเฟรชหน้าแล้วจะหายและนับใหม่ ไม่มีการส่งออกจากเครื่อง"),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "เงื่อนไข"), h("th", { class: "n" }, "เข้า / คาดไว้"), h("th", { class: "n" }, "p"), h("th", { class: "n" }, "Bonferroni"), h("th", { class: "n" }, "FDR q"), h("th", null, "ผล"))),
        h("tbody", null, history.map((x) => h("tr", null,
          h("td", null, x.label, h("br"), h("span", { class: "small muted" }, x.scope)),
          h("td", { class: "n" }, `${fmt.format(x.k)} / ${fmt1.format(x.expected)}`),
          h("td", { class: "n" }, fmtP(x.p)), h("td", { class: "n" }, fmtP(x.bon)), h("td", { class: "n" }, fmtP(x.fdr)),
          h("td", null, resultChip(x.p, x.bon)))))))));
  }

  buildForm();
  out.append(h("p", { class: "muted" }, "ตั้งเงื่อนไขแล้วกด \"ทดสอบเงื่อนไขนี้\""));
  render(
    pageHead("ห้องทดลอง", "ตั้งเงื่อนไขเอง แล้วดูว่าผลจริงต่างจากที่คาดไว้ถ้าสุ่มจริงแค่ไหน"),
    h("div", { class: "grid grid-2" },
      h("section", { class: "card stack" }, form),
      h("section", { class: "card stack" },
        h("h2", null, "ทำไมต้องปรับ p"),
        h("p", null, "ถ้าลองเงื่อนไขไปเรื่อย ๆ สักวันจะเจอเงื่อนไขที่ดู \"แปลก\" เสมอ แม้ผลจะสุ่มจริงทุกงวด เหมือนโยนเหรียญหลายรอบแล้วย่อมมีบางช่วงที่ออกหัวติดกันหลายครั้ง"),
        h("p", null, "p ก่อนปรับบอกว่าผลแบบนี้เกิดยากแค่ไหนถ้าสุ่มจริงและลองแค่เงื่อนไขเดียว ถ้าลองไปแล้ว 20 เงื่อนไข ก็คาดว่าจะเจอ p < 0.05 โดยบังเอิญราว 1 เงื่อนไข"),
        h("ul", { class: "small" },
          h("li", null, h("strong", null, "Bonferroni"), ": คูณ p ด้วยจำนวนเงื่อนไขที่ลองแล้ว เข้มงวดที่สุด ใช้ตัดสินในหน้านี้"),
          h("li", null, h("strong", null, "FDR (Benjamini–Hochberg)"), ": ผ่อนกว่า คุมสัดส่วนของผลที่ \"เจอแต่ไม่จริง\" ไว้ไม่เกิน 5%")),
        h("p", { class: "small muted" }, "ทุกครั้งที่กดทดสอบเงื่อนไขใหม่ จำนวนเงื่อนไขจะเพิ่ม และ p หลังปรับของทุกเงื่อนไขจะเพิ่มตาม · ผลที่ \"ผิดปกติ\" ก็ไม่ได้บอกว่างวดหน้าจะเป็นอย่างไร ทุกเลขยังมีโอกาสเท่ากันทุกงวด"))),
    h("section", { class: "card section stack" }, out),
    histBox,
    responsibleBox());
}

// ---------- กล่องการเล่นอย่างรับผิดชอบ ----------
const PRIZE_TABLE = [
  ["รางวัลที่ 1", 1, 6000000], ["ข้างเคียงรางวัลที่ 1", 2, 100000], ["รางวัลที่ 2", 5, 200000],
  ["รางวัลที่ 3", 10, 80000], ["รางวัลที่ 4", 50, 40000], ["รางวัลที่ 5", 100, 20000],
  ["เลขหน้า 3 ตัว", 2000, 4000], ["เลขท้าย 3 ตัว", 2000, 4000], ["เลขท้าย 2 ตัว", 10000, 2000],
];
const TICKET_PRICE = 80;
const PRIZE_TOTAL = PRIZE_TABLE.reduce((a, [, n, v]) => a + n * v, 0);
const PER_TICKET = PRIZE_TOTAL / 1000000;

function responsibleBox() {
  return h("section", { class: "card section responsible", "aria-labelledby": "rp-h" },
    h("h2", { id: "rp-h" }, "ซื้ออย่างรู้ทัน"),
    h("p", null, `สลาก 1 ใบราคา ${TICKET_PRICE} บาท ได้รางวัลคืนเฉลี่ย ${fmt.format(PER_TICKET)} บาท (${pct(PER_TICKET / TICKET_PRICE, 0)}) — โดยเฉลี่ยเสีย ${fmt.format(TICKET_PRICE - PER_TICKET)} บาททุกใบที่ซื้อ ไม่ว่าจะเลือกเลขแบบไหน`),
    h("p", { class: "small muted" }, "ซื้อเพื่อความสนุกด้วยเงินที่เสียได้ ไม่ซื้อเพื่อถอนทุน และไม่กู้เงินมาซื้อ"),
    h("p", null, "ถ้าการซื้อสลากเริ่มทำให้เครียดหรือกระทบเงินและครอบครัว โทร ",
      h("a", { href: "tel:1323", class: "hotline" }, "สายด่วนสุขภาพจิต 1323"), " (กรมสุขภาพจิต ฟรี 24 ชั่วโมง)"));
}

// ---------- ระยะห่างระหว่างการออก (หน้าสุ่มจริงไหม) ----------
async function gapSection() {
  const gj = await getData("stats/gaps.json");
  const state = { period: "all", trust: "all" };
  const wrap = h("div", { class: "stack" });
  function draw() {
    const g = scopeData(gj, state);
    const labels = g.bins.map(([lo, hi]) => (hi === null ? `${lo}+` : `${lo}–${hi}`));
    const o = {
      title: "ระยะห่างระหว่างการออกของเลขท้าย 2 ตัว เทียบกับที่คาดไว้ถ้าสุ่มจริง", labels, observed: g.observed,
      expected: g.expected, ranges: g.range95, catTitle: "ระยะห่าง (งวด)", xTitle: "ระยะห่าง (งวด)", labelEvery: 2, unit: "ช่วง",
    };
    wrap.replaceChildren(
      h("div", { class: "controls" },
        selectBox("gperiod", "ช่วงเวลา", gj.periods.map((k) => [k, gj.period_labels[k]]), state.period, (v) => { state.period = v; draw(); }),
        selectBox("gtrust", "แหล่งข้อมูล", gj.trusts.map((k) => [k, gj.trust_labels[k]]), state.trust, (v) => { state.trust = v; draw(); })),
      h("div", { class: "stat-row" },
        stat("งวด", fmt.format(g.draws)), stat("จำนวนระยะห่าง", fmt.format(g.gap_count)),
        stat("ระยะห่างเฉลี่ย", `${fmt1.format(g.mean_gap)} งวด`), stat("ถ้าสุ่มจริง", "ราว 100 งวด")),
      ...rangeBars(o), outSummary(o),
      h("p", { class: "small muted" }, `ค่าที่คาดไว้คำนวณตรงตัวจากการแจกแจงเรขาคณิต (โอกาส 1 ใน 100 ต่องวด) โดยคิดความยาวของข้อมูลแล้ว · ช่วงปกติจากการจำลองการสุ่ม ${fmt.format(g.sims)} รอบ`));
  }
  draw();
  return h("section", { class: "card section stack" },
    h("h2", null, "ระยะห่างระหว่างการออก"),
    h("p", null, "นับว่าเลขท้าย 2 ตัวเลขเดียวกันออกซ้ำห่างกันกี่งวด รวมทุกเลข แล้วเทียบกับที่การสุ่มจริงจะให้"),
    h("div", { class: "callout ok" },
      h("strong", null, "ระยะห่างยาวไม่ได้ทำให้เลขนั้นมีโอกาสออกมากขึ้น"), h("br"),
      "การออกรางวัลแต่ละงวดไม่จำงวดก่อน ทุกเลขมีโอกาส 1 ใน 100 ทุกงวดเสมอ ไม่ว่าจะไม่ออกมานานแค่ไหน (เว็บนี้จึงไม่จัดอันดับเลขที่ไม่ออกนาน)"),
    wrap);
}

// ---------- boot ----------
const PAGES = { index: pageHome, results: pageResults, stats: pageStats, lab: pageLab, random: pageRandom, data: pageData };

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
