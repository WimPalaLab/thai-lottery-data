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
        h("li", null, "Backtest ใช้เฉพาะข้อมูลก่อนหน้าแต่ละงวด (ไม่มีการใช้ข้อมูลอนาคต)"))));
}

// ---------- boot ----------
const PAGES = { index: pageHome, results: pageResults, stats: pageStats, random: pageRandom, data: pageData };

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
