/* ================= Гаманець ================= */

/* ---- Telegram WebApp (graceful fallback in browser) ---- */
const tg = window.Telegram && window.Telegram.WebApp;
try {
  if (tg) {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor("#000000");
    if (tg.setBackgroundColor) tg.setBackgroundColor("#000000");
  }
} catch (e) {}

const INIT_DATA = (tg && tg.initData) || "";

// Base path when served behind a reverse proxy (e.g. "/wallet"). Empty at root.
// A static host (GitHub Pages) deploy injects window.API_BASE = the full API origin+prefix
// on the PC (https://<domain>/wallet); otherwise use the current page path.
const BASE = (window.API_BASE ? String(window.API_BASE).replace(/\/+$/, "") : "")
  || location.pathname.replace(/\/(index\.html)?$/, "");
// Skip ngrok's free-tier browser-warning interstitial on API/XHR calls.
const NGROK_HDR = { "ngrok-skip-browser-warning": "1" };

function haptic(style = "light") {
  try {
    tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(style);
  } catch (e) {}
}
function hapticDone(type = "success") {
  try {
    tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred(type);
  } catch (e) {}
}

/* ---- format helpers ---- */
const nf = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const CUR = { UAH: "₴", USD: "$", EUR: "€" };
const CUR_ORDER = ["UAH", "USD", "EUR"];
// Конвертація з ₴ у вибрану валюту за курсом НБУ (приходить у state.rates).
function conv(uah) {
  const rate = (state.rates && state.rates[state.cur]) || 1;
  return state.cur === "UAH" ? uah : uah / rate;
}
const money = (n) => nf.format(Math.round(conv(n))) + " " + CUR[state.cur];
const MONTHS = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
const MONTHS_SHORT = ["січ","лют","бер","кві","тра","чер","лип","сер","вер","жов","лис","гру"];
const MONTHS_IN = ["січні","лютому","березні","квітні","травні","червні","липні","серпні","вересні","жовтні","листопаді","грудні"];

function monthLabel(m) {
  const [y, mm] = m.split("-").map(Number);
  return MONTHS[mm - 1] + " " + y;
}
function fmtDate(d) {
  const [y, mm, dd] = d.split("-").map(Number);
  return dd + " " + MONTHS_SHORT[mm - 1];
}
function shiftMonth(m, delta) {
  let [y, mm] = m.split("-").map(Number);
  mm += delta;
  if (mm < 1) { mm = 12; y--; }
  if (mm > 12) { mm = 1; y++; }
  return y + "-" + String(mm).padStart(2, "0");
}
function currentMonth() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---- palette for pickers ---- */
/* Системна палітра iOS (Apple dark) — узгоджена з дефолтними категоріями в db.py */
const COLORS = ["#30D158","#FF9F0A","#0A84FF","#BF5AF2","#FF375F","#64D2FF","#FFD60A","#98989D","#FF453A","#63E6E2"];
const EMOJIS = ["🛒","☕","🚕","🎬","🛍️","💊","🏠","✨","🍔","🍕","🎮","📱","💡","⛽","🎁","💳","🐱","🎧","📚","🏋️","🌿","🍺","✈️","🎨"];

/* ---- state (loaded from backend, see fetchState) ---- */
let state = {
  tab: "overview",
  month: currentMonth(),
  cur: "UAH",
  rates: { UAH: 1 },
  categories: [],
  transactions: [],
};

/* ---- API layer ---- */
function qsWithAuth() {
  const p = new URLSearchParams();
  if (INIT_DATA) p.set("initData", INIT_DATA);
  else p.set("demo", "1");
  return "?" + p.toString();
}
function bodyWithAuth(obj) {
  return JSON.stringify(INIT_DATA ? { ...obj, initData: INIT_DATA } : { ...obj, demo: 1 });
}
async function getApi(path) {
  const res = await fetch(BASE + path + qsWithAuth(), { headers: NGROK_HDR });
  if (!res.ok) throw new Error("api " + res.status);
  return res.json();
}
async function postApi(path, obj) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...NGROK_HDR },
      body: bodyWithAuth(obj || {}),
    });
  } catch (e) {
    toast("Немає з'єднання", "⚠️");
    throw e;
  }
  if (!res.ok) {
    toast("Помилка збереження", "⚠️");
    throw new Error("api " + res.status);
  }
  return res.json();
}
// Не смітити в консоль відхиленнями, які вже показані користувачу тостом.
window.addEventListener("unhandledrejection", (e) => e.preventDefault());
async function fetchState() {
  const data = await getApi("/api/state");
  state.categories = data.categories || [];
  state.transactions = data.transactions || [];
  state.rates = data.rates || { UAH: 1 };
}

/* ---- selectors ---- */
const catById = (id) => (id == null ? null : state.categories.find((c) => Number(c.id) === Number(id)));
const monthTx = () => state.transactions.filter((t) => t.date.startsWith(state.month));
const catTotals = () => {
  const map = {};
  let uncat = 0;
  monthTx().forEach((t) => {
    if (t.cat != null && catById(t.cat)) map[t.cat] = (map[t.cat] || 0) + t.amount;
    else uncat += t.amount;
  });
  return { map, uncat };
};
const totalSpent = () => monthTx().reduce((s, t) => s + t.amount, 0);

/* ================= RENDER ================= */
const screen = document.getElementById("screen");

function render() {
  document.querySelectorAll(".tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === state.tab)
  );
  const cc = document.getElementById("curChip");
  if (cc) cc.textContent = CUR[state.cur];

  screen.innerHTML = state.tab === "overview" ? overviewHTML() : categoriesHTML();
  screen.classList.remove("fade-in");
  void screen.offsetWidth;
  screen.classList.add("fade-in");
  if (state.tab === "overview") animateOverview();
}

/* ---------- Overview ---------- */
function overviewHTML() {
  const { map, uncat } = catTotals();
  const total = totalSpent();
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);

  const totalLimit = state.categories.reduce((s, c) => s + (c.limit || 0), 0);
  const budgetPct = totalLimit ? Math.round((total / totalLimit) * 100) : 0;
  const txCount = monthTx().length;

  const ring = ringHTML(entries, uncat, total);

  // Дельта проти минулого місяця: «на N більше/менше, ніж у …»
  const prevKey = shiftMonth(state.month, -1);
  const prevTotal = state.transactions
    .filter((t) => t.date.startsWith(prevKey))
    .reduce((s, t) => s + t.amount, 0);
  let deltaLine = "";
  if (total > 0 && prevTotal > 0) {
    const diff = total - prevTotal;
    const more = diff > 0;
    const pct = Math.round((Math.abs(diff) / prevTotal) * 100);
    const pm = Number(prevKey.split("-")[1]);
    deltaLine = diff === 0
      ? `<button class="hero-delta muted" data-action="open-compare">так само, як у ${MONTHS_IN[pm - 1]}</button>`
      : `<button class="hero-delta ${more ? "bad" : "good"}" data-action="open-compare">${more ? "▲" : "▼"} на ${money(Math.abs(diff))} ${more ? "більше" : "менше"}, ніж у ${MONTHS_IN[pm - 1]} · ${pct}%</button>`;
  } else if (total > 0 || prevTotal > 0) {
    deltaLine = `<button class="hero-delta muted" data-action="open-compare">⇄ Порівняти періоди</button>`;
  }

  const bars = entries.length
    ? entries
        .map(([id, sum]) => {
          const c = catById(id);
          const pct = total ? Math.round((sum / total) * 100) : 0;
          return `
      <div class="catbar" data-action="cat-detail" data-id="${id}">
        <div class="cat-ic" style="background:${c.color}22">${c.icon}</div>
        <div class="catbar-body">
          <div class="catbar-top">
            <span class="cat-name">${esc(c.name)}</span>
            <span class="cat-amount">${money(sum)}</span>
          </div>
          <div class="cat-track"><i data-w="${pct}" style="background:${c.color}"></i></div>
        </div>
        <span class="cat-pct">${pct}%</span>
      </div>`;
        })
        .join("")
    : `<div class="empty"><div class="empty-emoji">🪙</div><p>Ще немає витрат за цей місяць.<br/>Додай першу — тисни «+».</p></div>`;

  const txs = monthTx()
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(txRowHTML)
    .join("");

  return `
    <div class="month-nav">
      <button data-action="month-prev" aria-label="Попередній місяць"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
      <div class="month-label">${monthLabel(state.month)}</div>
      <button data-action="month-next" aria-label="Наступний місяць"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>

    <div class="hero">
      <div class="hero-glow"></div>
      ${ring}
      ${deltaLine}
    </div>

    <div class="stat-row">
      <div class="stat">
        <div class="stat-k">Бюджет місяця</div>
        <div class="stat-v">${totalLimit ? budgetPct + "%" : "—"} <small>${totalLimit ? "з " + money(totalLimit) : "не задано"}</small></div>
        ${totalLimit ? `<div class="mini-bar"><i class="${budgetPct > 100 ? "over" : ""}" data-w="${Math.min(budgetPct, 100)}"></i></div>` : ""}
      </div>
      <div class="stat">
        <div class="stat-k">Транзакцій</div>
        <div class="stat-v">${txCount} <small>за місяць</small></div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <span class="section-title">Розподіл витрат</span>
        <button class="link-btn" data-tab="categories">Категорії →</button>
      </div>
      ${bars}
    </div>

    <div class="section">
      <div class="section-head"><span class="section-title">Транзакції</span></div>
      ${txs || `<div class="empty"><p>Порожньо.</p></div>`}
    </div>
  `;
}

function txRowHTML(t) {
  const c = t.cat != null ? catById(t.cat) : null;
  const icon = c ? c.icon : "❓";
  const bg = c ? c.color + "22" : "var(--surface-2)";
  let suggestBlock = "";
  if (t.cat == null) {
    const sc = t.suggestedCat != null ? catById(t.suggestedCat) : null;
    suggestBlock = `
      <div class="suggest">
        <span class="suggest-txt">${sc ? `Схоже на <b>${esc(sc.name)}</b>` : "Оберіть категорію"}</span>
        <div class="suggest-actions">
          ${sc ? `<button class="chip solid" data-action="accept-suggest" data-id="${t.id}" data-cat="${t.suggestedCat}">Додати</button>` : ""}
          <button class="chip ghost" data-action="pick-cat-for" data-id="${t.id}">${sc ? "Інша" : "Обрати"}</button>
        </div>
      </div>`;
  }
  return `
    <div class="tx" data-action="tx-detail" data-id="${t.id}">
      <div class="tx-ic" style="background:${bg}">${icon}</div>
      <div class="tx-body">
        <div class="tx-name">${esc(t.merchant)}</div>
        <div class="tx-meta">
          <span class="tx-src ${t.src}">${t.src === "mono" ? "картка" : "готівка"}</span>
          ${fmtDate(t.date)}${t.note ? " · " + esc(t.note) : ""}
        </div>
      </div>
      <div class="tx-amount">−${money(t.amount)}</div>
      ${suggestBlock}
    </div>`;
}

/* ---------- Ring (SVG donut) ---------- */
const RING_R = 84;
const RING_C = 2 * Math.PI * RING_R;
const GAP = 8; // px gap between segments along the path

function ringHTML(entries, uncat, total) {
  if (total <= 0) {
    return `
      <div class="ring-wrap">
        <svg class="ring-svg" viewBox="0 0 200 200"><circle class="ring-track" cx="100" cy="100" r="${RING_R}"/></svg>
        <div class="ring-center"><div class="ring-empty">Немає витрат за цей місяць</div></div>
      </div>`;
  }
  const segs = entries.map(([id, sum]) => ({ color: catById(id).color, sum, id }));
  if (uncat > 0) segs.push({ color: "rgba(255,255,255,0.16)", sum: uncat, id: "uncat" });
  const dom = (segs[0] && segs[0].color) || "#30D158"; // найбільша категорія — колір сяйва

  let acc = 0;
  const paths = segs
    .map((s) => {
      const frac = s.sum / total;
      const len = Math.max(frac * RING_C - GAP, 2);
      const offset = -acc * RING_C;
      acc += frac;
      return `<circle class="ring-seg" data-seg="${s.id}" cx="100" cy="100" r="${RING_R}"
        stroke="${s.color}" stroke-dasharray="0 ${RING_C}" data-len="${len.toFixed(2)}"
        stroke-dashoffset="${offset.toFixed(2)}"/>`;
    })
    .join("");

  return `
    <div class="ring-wrap">
      <div class="ring-halo" style="background:radial-gradient(circle at 50% 50%, ${dom}2e 0%, ${dom}14 42%, transparent 66%)"></div>
      <svg class="ring-svg" viewBox="0 0 200 200" style="filter:drop-shadow(0 0 13px ${dom}55)">
        <circle class="ring-track" cx="100" cy="100" r="${RING_R}"/>
        ${paths}
      </svg>
      <div class="ring-center">
        <div class="ring-total"><span data-countup="${Math.round(total)}">0</span><span class="cur">${CUR[state.cur]}</span></div>
        <div class="ring-sub">усього витрачено</div>
      </div>
    </div>`;
}

function animateOverview() {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Ring segments: trigger the draw via setTimeout (fires even where rAF is throttled)
  // and always guarantee the final dash state so the ring is never left invisible.
  screen.querySelectorAll(".ring-seg").forEach((el, i) => {
    const len = parseFloat(el.dataset.len);
    const finalDash = `${len} ${RING_C - len}`;
    if (reduce) { el.style.strokeDasharray = finalDash; return; }
    el.style.transitionDelay = i * 80 + "ms";
    setTimeout(() => (el.style.strokeDasharray = finalDash), 40);
    setTimeout(() => (el.style.strokeDasharray = finalDash), 1300); // safety net
  });

  // Bar fills
  screen.querySelectorAll("[data-w]").forEach((el) => {
    const w = el.dataset.w + "%";
    if (reduce) { el.style.width = w; return; }
    setTimeout(() => (el.style.width = w), 40);
    setTimeout(() => (el.style.width = w), 1300);
  });

  // Count-up: rAF for smoothness, but the final value is always guaranteed.
  const cu = screen.querySelector("[data-countup]");
  if (cu) {
    const target = conv(Number(cu.dataset.countup));
    if (reduce) { cu.textContent = nf.format(target); return; }
    let done = false;
    const finish = () => { if (!done) { done = true; cu.textContent = nf.format(target); } };
    const dur = 900, t0 = performance.now();
    const step = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      cu.textContent = nf.format(Math.round(target * e));
      if (p < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    setTimeout(finish, 1100); // guarantee final if rAF is paused/throttled
  }
}

/* ---------- Categories screen ---------- */
function categoriesHTML() {
  const { map } = catTotals();
  const rows = state.categories
    .map((c) => {
      const spent = map[c.id] || 0;
      const pct = c.limit ? Math.round((spent / c.limit) * 100) : 0;
      const over = c.limit && spent > c.limit;
      const sub = c.limit
        ? `${money(spent)} з ${money(c.limit)} <span class="${over ? "over" : ""}">· ${pct}%</span>`
        : `${money(spent)} · без ліміту`;
      return `
        <div class="cat-row" data-action="edit-category" data-id="${c.id}">
          <div class="cat-ic" style="background:${c.color}22">${c.icon}</div>
          <div class="cat-row-body">
            <div class="cat-row-name">${esc(c.name)}</div>
            <div class="cat-row-sub">${sub}</div>
            ${c.limit ? `<div class="cat-limit-bar"><i style="width:${Math.min(pct, 100)}%;background:${over ? "var(--danger)" : c.color}"></i></div>` : ""}
          </div>
          <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
        </div>`;
    })
    .join("");
  return `
    <div class="section" style="margin-top:12px">
      <div class="section-head">
        <span class="section-title">Мої категорії</span>
        <span class="cat-pct" style="color:var(--ink-3)">${state.categories.length}</span>
      </div>
      ${rows}
      <button class="add-cat-btn" data-action="add-category" style="margin-top:6px">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Додати категорію
      </button>
    </div>`;
}

/* ================= SHEETS ================= */
const sheetRoot = document.getElementById("sheetRoot");
let sheetOnMount = null;

function openSheet(title, body, opts = {}) {
  sheetRoot.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="grabber"></div>
      ${title ? `<h2 class="sheet-title">${esc(title)}</h2>` : ""}
      ${opts.desc ? `<p class="sheet-desc">${opts.desc}</p>` : ""}
      ${body}
    </div>`;

  // rAF gives a smooth slide-up transition, but if it never fires (throttled/background
  // tab) the sheet must still become visible+interactive — guarantee it with a timeout.
  let opened = false;
  const doOpen = () => { if (!opened) { opened = true; sheetRoot.classList.add("open"); } };
  requestAnimationFrame(() => requestAnimationFrame(doOpen));
  setTimeout(doOpen, 60);

  sheetOnMount = opts.onMount || null;
  if (sheetOnMount) {
    let mounted = false;
    const doMount = () => { if (!mounted) { mounted = true; sheetOnMount(); } };
    requestAnimationFrame(doMount);
    setTimeout(doMount, 60);
  }
  haptic("light");
}
function closeSheet() {
  sheetRoot.classList.remove("open");
  setTimeout(() => (sheetRoot.innerHTML = ""), 340);
}

/* ---- Add expense ---- */
let draftTx = null;
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function openExpenseSheet(preset) {
  const defaultCat = state.categories[0] ? state.categories[0].id : null;
  // Дата — завжди реальне «сьогодні»: раніше бралися день сьогодні + місяць,
  // який переглядаєш, і виходили неіснуючі дати типу 2026-02-30.
  draftTx = Object.assign({ merchant: "", amount: "", cat: defaultCat, src: "cash", date: todayISO() }, preset || {});
  const chips = state.categories
    .map((c) => `<button type="button" class="choice ${Number(c.id) === Number(draftTx.cat) ? "sel" : ""}" data-action="draft-cat" data-id="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`)
    .join("");
  openSheet("Нова витрата", `
    <div class="field">
      <div class="amount-field">
        <input id="exp-amount" type="text" inputmode="decimal" placeholder="0" value="${draftTx.amount}" />
        <span class="cur">₴</span>
      </div>
    </div>
    <div class="field">
      <label>Категорія</label>
      <div class="choice-wrap" id="exp-cats">${chips}</div>
    </div>
    <div class="field">
      <label>Опис</label>
      <input id="exp-merchant" class="input" type="text" placeholder="Напр. Сільпо, таксі…" value="${esc(draftTx.merchant)}" />
    </div>
    <div class="field">
      <label>Спосіб оплати</label>
      <div class="seg" id="exp-src">
        <button type="button" class="${draftTx.src === "cash" ? "on" : ""}" data-action="draft-src" data-src="cash">💵 Готівка</button>
        <button type="button" class="${draftTx.src === "mono" ? "on" : ""}" data-action="draft-src" data-src="mono">💳 Картка</button>
      </div>
    </div>
    <button class="btn btn-primary" data-action="save-expense">Зберегти</button>
  `, { onMount: () => document.getElementById("exp-amount").focus() });
}

async function saveExpense() {
  const amount = parseFloat((document.getElementById("exp-amount").value || "").replace(",", "."));
  if (!amount || amount <= 0) { toast("Введіть суму", "⚠️"); return; }
  const cat = catById(draftTx.cat);
  const merchant = document.getElementById("exp-merchant").value.trim() || (cat ? cat.name : "Витрата");
  await postApi("/api/expense", { merchant, amount, cat: draftTx.cat, date: draftTx.date, src: draftTx.src });
  await fetchState();
  closeSheet();
  state.tab = "overview";
  render();
  hapticDone("success");
  toast("Витрату додано", "✓");
}

/* ---- Category form (add / edit) ---- */
let draftCat = null;
function openCategorySheet(id) {
  const existing = id ? catById(id) : null;
  draftCat = existing
    ? Object.assign({}, existing)
    : { id: null, name: "", icon: "✨", color: COLORS[0], limit: 0 };

  const emojiOpts = EMOJIS.map((e) => `<button type="button" class="emoji-opt ${e === draftCat.icon ? "sel" : ""}" data-action="draft-emoji" data-emoji="${e}">${e}</button>`).join("");
  const colorOpts = COLORS.map((c) => `<button type="button" class="color-opt ${c === draftCat.color ? "sel" : ""}" data-action="draft-color" data-color="${c}" style="background:${c};color:${c}"></button>`).join("");

  openSheet(existing ? "Редагувати категорію" : "Нова категорія", `
    <div class="cat-preview" id="cat-preview">
      <div class="cat-ic" style="background:${draftCat.color}22">${draftCat.icon}</div>
      <div><b id="cp-name">${esc(draftCat.name) || "Назва категорії"}</b><span>${draftCat.limit ? "ліміт " + money(draftCat.limit) : "без ліміту"}</span></div>
    </div>
    <div class="field">
      <label>Назва</label>
      <input id="cat-name" class="input" type="text" placeholder="Напр. Підписки" value="${esc(draftCat.name)}" />
    </div>
    <div class="field">
      <label>Іконка</label>
      <div class="picker" id="cat-emojis">${emojiOpts}</div>
    </div>
    <div class="field">
      <label>Колір</label>
      <div class="picker" id="cat-colors">${colorOpts}</div>
    </div>
    <div class="field">
      <label>Місячний ліміт (необовʼязково)</label>
      <input id="cat-limit" class="input" type="text" inputmode="numeric" placeholder="0 — без ліміту" value="${draftCat.limit || ""}" />
    </div>
    <button class="btn btn-primary" data-action="save-category">${existing ? "Зберегти зміни" : "Створити категорію"}</button>
    ${existing ? `<div class="btn-row"><button class="btn btn-danger" data-action="delete-category" data-id="${existing.id}">Видалити категорію</button></div>` : ""}
  `, {
    onMount: () => {
      const name = document.getElementById("cat-name");
      name.addEventListener("input", () => {
        draftCat.name = name.value;
        document.getElementById("cp-name").textContent = name.value || "Назва категорії";
      });
      const lim = document.getElementById("cat-limit");
      lim.addEventListener("input", () => {
        draftCat.limit = parseInt(lim.value.replace(/\D/g, "")) || 0;
        document.querySelector("#cat-preview span").textContent = draftCat.limit ? "ліміт " + money(draftCat.limit) : "без ліміту";
      });
    },
  });
}

function refreshCatPreview() {
  const ic = document.querySelector("#cat-preview .cat-ic");
  if (ic) { ic.textContent = draftCat.icon; ic.style.background = draftCat.color + "22"; }
}

async function saveCategory() {
  const name = document.getElementById("cat-name").value.trim();
  if (!name) { toast("Введіть назву", "⚠️"); return; }
  draftCat.name = name;
  draftCat.limit = parseInt((document.getElementById("cat-limit").value || "").replace(/\D/g, "")) || 0;
  await postApi("/api/category", {
    id: draftCat.id, name: draftCat.name, icon: draftCat.icon, color: draftCat.color, limit: draftCat.limit,
  });
  await fetchState();
  closeSheet();
  render();
  hapticDone("success");
  toast("Категорію збережено", "✓");
}

function deleteCategory(id) {
  const c = catById(id);
  openSheet("Видалити категорію?", `
    <p class="sheet-desc" style="margin-bottom:20px">Категорія «${esc(c.name)}» буде видалена. Її транзакції стануть «без категорії» — зможеш перепризначити їх пізніше.</p>
    <button class="btn btn-danger" data-action="confirm-delete" data-id="${id}">Так, видалити</button>
    <div class="btn-row"><button class="btn btn-ghost" data-action="close-sheet">Скасувати</button></div>
  `);
}
async function confirmDelete(id) {
  await postApi("/api/category/delete", { id: Number(id) });
  await fetchState();
  closeSheet();
  render();
  hapticDone("warning");
  toast("Категорію видалено", "🗑");
}

/* ---- Category detail ---- */
function openCategoryDetail(id) {
  const c = catById(id);
  const list = monthTx()
    .filter((t) => Number(t.cat) === Number(id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const spent = list.reduce((s, t) => s + t.amount, 0);
  const rows = list.length
    ? list.map((t) => `
        <div class="detail-tx">
          <div><div class="dt-name">${esc(t.merchant)}</div><div class="dt-date">${fmtDate(t.date)} · ${t.src === "mono" ? "картка" : "готівка"}</div></div>
          <div class="dt-amount">−${money(t.amount)}</div>
        </div>`).join("")
    : `<p class="sheet-desc">За цей місяць витрат немає.</p>`;
  openSheet("", `
    <div class="cat-preview" style="margin-bottom:16px">
      <div class="cat-ic" style="background:${c.color}22;width:52px;height:52px;border-radius:16px;font-size:24px">${c.icon}</div>
      <div><b style="font-size:17px">${esc(c.name)}</b><span>${money(spent)} за ${monthLabel(state.month)}</span></div>
    </div>
    ${rows}
    <div class="btn-row" style="margin-top:18px"><button class="btn btn-ghost" data-action="edit-category" data-id="${id}">Редагувати категорію</button></div>
  `);
}

/* ---- transaction detail (tap a tx) ---- */
function openTxSheet(id) {
  const t = state.transactions.find((x) => Number(x.id) === Number(id));
  if (!t) return;
  const c = t.cat != null ? catById(t.cat) : null;
  openSheet("", `
    <div class="cat-preview" style="margin-bottom:16px">
      <div class="cat-ic" style="background:${c ? c.color + "22" : "var(--surface-2)"};width:52px;height:52px;border-radius:16px;font-size:24px">${c ? c.icon : "❓"}</div>
      <div><b style="font-size:17px">${esc(t.merchant)}</b><span>${money(t.amount)} · ${fmtDate(t.date)} · ${t.src === "mono" ? "картка" : "готівка"}</span></div>
    </div>
    ${t.note ? `<p class="sheet-desc">${esc(t.note)}</p>` : ""}
    <div class="btn-row"><button class="btn btn-ghost" data-action="pick-cat-for" data-id="${t.id}">${c ? "Змінити категорію" : "Обрати категорію"}</button></div>
    <div class="btn-row"><button class="btn btn-danger" data-action="delete-tx" data-id="${t.id}">Видалити витрату</button></div>
  `);
}
async function deleteTx(id) {
  await postApi("/api/transaction/delete", { id: Number(id) });
  await fetchState();
  closeSheet();
  render();
  hapticDone("warning");
  toast("Витрату видалено", "🗑");
}

/* ================= Порівняння періодів ================= */
let cmp = { mode: "month", a: null, b: null };

function mondayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function fmtISO(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function monthKeys() {
  const s = new Set(state.transactions.map((t) => t.date.slice(0, 7)));
  s.add(currentMonth());
  return [...s].sort().reverse();
}
function weekKeys() {
  const s = new Set(state.transactions.map((t) => fmtISO(mondayOf(t.date))));
  s.add(fmtISO(mondayOf(todayISO())));
  return [...s].sort().reverse();
}
function weekLabel(k) {
  const a = new Date(k + "T00:00:00");
  const b = new Date(a); b.setDate(a.getDate() + 6);
  const f = (d) => d.getDate() + " " + MONTHS_SHORT[d.getMonth()];
  return f(a) + " – " + f(b);
}
function periodKeys() { return cmp.mode === "month" ? monthKeys() : weekKeys(); }
function periodLabel(k) { return cmp.mode === "month" ? monthLabel(k) : weekLabel(k); }
function periodStats(k) {
  let txs;
  if (cmp.mode === "month") txs = state.transactions.filter((t) => t.date.startsWith(k));
  else {
    const end = new Date(k + "T00:00:00"); end.setDate(end.getDate() + 6);
    const e = fmtISO(end);
    txs = state.transactions.filter((t) => t.date >= k && t.date <= e);
  }
  const cats = {}; let total = 0;
  txs.forEach((t) => {
    total += t.amount;
    const id = t.cat != null && catById(t.cat) ? t.cat : "un";
    cats[id] = (cats[id] || 0) + t.amount;
  });
  return { total, cats, count: txs.length };
}

function openCompareSheet() {
  const keys = periodKeys();
  if (keys.length < 2) { toast("Замало даних для порівняння", "⚠️"); return; }
  if (!keys.includes(cmp.a)) cmp.a = keys[0];
  if (!keys.includes(cmp.b) || cmp.b === cmp.a) cmp.b = keys.find((k) => k !== cmp.a) || keys[1];
  openSheet("Порівняння", `
    <div class="seg" id="cmp-mode" style="margin-bottom:14px">
      <button type="button" class="${cmp.mode === "month" ? "on" : ""}" data-action="cmp-mode" data-mode="month">Місяці</button>
      <button type="button" class="${cmp.mode === "week" ? "on" : ""}" data-action="cmp-mode" data-mode="week">Тижні</button>
    </div>
    <div class="cmp-selects">
      <select id="cmp-a" class="input"></select>
      <span class="cmp-vs">до</span>
      <select id="cmp-b" class="input"></select>
    </div>
    <div id="cmp-result"></div>
  `, { onMount: () => {
    fillCmpSelects();
    renderCmpResult();
    document.getElementById("cmp-a").addEventListener("change", (e) => { cmp.a = e.target.value; renderCmpResult(); haptic("light"); });
    document.getElementById("cmp-b").addEventListener("change", (e) => { cmp.b = e.target.value; renderCmpResult(); haptic("light"); });
  }});
}
function fillCmpSelects() {
  const keys = periodKeys();
  const opts = (sel) => keys.map((k) => `<option value="${k}" ${k === sel ? "selected" : ""}>${periodLabel(k)}</option>`).join("");
  document.getElementById("cmp-a").innerHTML = opts(cmp.a);
  document.getElementById("cmp-b").innerHTML = opts(cmp.b);
}
function renderCmpResult() {
  const A = periodStats(cmp.a), B = periodStats(cmp.b);
  const diff = A.total - B.total;
  const more = diff > 0;
  const pct = B.total > 0 ? Math.round((Math.abs(diff) / B.total) * 100) : null;
  const deltaTxt = diff === 0
    ? "витрати однакові"
    : `${more ? "▲ більше" : "▼ менше"} на ${money(Math.abs(diff))}${pct != null ? ` · ${pct}%` : ""}`;
  const head = `
    <div class="cmp-totals">
      <div class="cmp-tcell"><span>${periodLabel(cmp.a)}</span><b>${money(A.total)}</b><small>${A.count} транз.</small></div>
      <div class="cmp-tcell b"><span>${periodLabel(cmp.b)}</span><b>${money(B.total)}</b><small>${B.count} транз.</small></div>
    </div>
    <div class="cmp-delta ${diff === 0 ? "" : more ? "bad" : "good"}">${deltaTxt}</div>`;

  const ids = [...new Set([...Object.keys(A.cats), ...Object.keys(B.cats)])];
  ids.sort((x, y) => Math.max(A.cats[y] || 0, B.cats[y] || 0) - Math.max(A.cats[x] || 0, B.cats[x] || 0));
  const maxV = Math.max(1, ...ids.map((i) => Math.max(A.cats[i] || 0, B.cats[i] || 0)));
  const rows = ids.map((id) => {
    const c = id === "un" ? { icon: "❓", name: "Без категорії", color: "#98989D" } : catById(id);
    if (!c) return "";
    const a = A.cats[id] || 0, b = B.cats[id] || 0, d = a - b;
    return `
      <div class="cmp-row">
        <div class="cat-ic" style="background:${c.color}22">${c.icon}</div>
        <div class="cmp-body">
          <div class="cmp-top"><span>${esc(c.name)}</span><span class="cmp-d ${d > 0 ? "bad" : d < 0 ? "good" : ""}">${d === 0 ? "=" : (d > 0 ? "+" : "−") + money(Math.abs(d))}</span></div>
          <div class="cmp-bar"><i style="width:${Math.max(Math.round((a / maxV) * 100), a > 0 ? 3 : 0)}%;background:${c.color}"></i><em>${money(a)}</em></div>
          <div class="cmp-bar b"><i style="width:${Math.max(Math.round((b / maxV) * 100), b > 0 ? 3 : 0)}%"></i><em>${money(b)}</em></div>
        </div>
      </div>`;
  }).join("");
  document.getElementById("cmp-result").innerHTML =
    head + (rows ? `<div class="cmp-rows">${rows}</div>` : `<p class="sheet-desc" style="text-align:center;margin-top:14px">У цих періодах немає витрат.</p>`);
}

/* ---- pick category for an uncategorized tx ---- */
function openPickCatFor(txId) {
  const chips = state.categories
    .map((c) => `<button type="button" class="choice" data-action="assign-cat" data-tx="${txId}" data-id="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`)
    .join("");
  openSheet("Оберіть категорію", `<div class="choice-wrap">${chips}</div>`, { desc: "Наступного разу цей продавець підставиться автоматично." });
}
async function assignCat(txId, catId) {
  await postApi("/api/assign", { txId: Number(txId), catId: Number(catId) });
  await fetchState();
  closeSheet();
  render();
  hapticDone("success");
  toast("Категорію призначено", "✓");
}
async function acceptSuggest(txId, catId) {
  await assignCat(txId, catId);
}

/* ================= Toast ================= */
const toastRoot = document.getElementById("toastRoot");
function toast(text, icon = "✓") {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="ic">${icon}</span>${esc(text)}`;
  toastRoot.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 2000);
}

/* ================= Event routing ================= */
document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) { state.tab = tabBtn.dataset.tab; render(); haptic("light"); return; }

  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;

  switch (a) {
    case "add-expense": openExpenseSheet(); break;
    case "save-expense": saveExpense(); break;
    case "draft-cat":
      draftTx.cat = Number(id);
      document.querySelectorAll("#exp-cats .choice").forEach((c) => c.classList.toggle("sel", c.dataset.id === id));
      haptic("light"); break;
    case "draft-src":
      draftTx.src = el.dataset.src;
      document.querySelectorAll("#exp-src button").forEach((b) => b.classList.toggle("on", b.dataset.src === el.dataset.src));
      haptic("light"); break;

    case "add-category": openCategorySheet(null); break;
    case "edit-category": openCategorySheet(id); break;
    case "save-category": saveCategory(); break;
    case "delete-category": deleteCategory(id); break;
    case "confirm-delete": confirmDelete(id); break;
    case "draft-emoji":
      draftCat.icon = el.dataset.emoji;
      document.querySelectorAll("#cat-emojis .emoji-opt").forEach((b) => b.classList.toggle("sel", b.dataset.emoji === el.dataset.emoji));
      refreshCatPreview(); haptic("light"); break;
    case "draft-color":
      draftCat.color = el.dataset.color;
      document.querySelectorAll("#cat-colors .color-opt").forEach((b) => b.classList.toggle("sel", b.dataset.color === el.dataset.color));
      refreshCatPreview(); haptic("light"); break;

    case "cat-detail": openCategoryDetail(id); break;
    case "tx-detail": openTxSheet(id); break;
    case "delete-tx": deleteTx(id); break;
    case "cycle-cur": {
      state.cur = CUR_ORDER[(CUR_ORDER.indexOf(state.cur) + 1) % CUR_ORDER.length];
      render(); haptic("light");
      if (state.cur !== "UAH" && state.rates[state.cur]) toast(`1 ${state.cur} = ${state.rates[state.cur]} ₴ · курс НБУ`, "💱");
      break;
    }
    case "pick-cat-for": openPickCatFor(id); break;
    case "assign-cat": assignCat(el.dataset.tx, id); break;
    case "accept-suggest": acceptSuggest(id, el.dataset.cat); break;

    case "month-prev": state.month = shiftMonth(state.month, -1); render(); haptic("light"); break;
    case "month-next": state.month = shiftMonth(state.month, 1); render(); haptic("light"); break;

    case "open-compare": openCompareSheet(); break;
    case "cmp-mode": {
      if (cmp.mode !== el.dataset.mode) {
        cmp.mode = el.dataset.mode;
        document.querySelectorAll("#cmp-mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === cmp.mode));
        const keys = periodKeys();
        cmp.a = keys[0];
        cmp.b = keys[1] || keys[0];
        fillCmpSelects();
        renderCmpResult();
        haptic("light");
      }
      break;
    }

    case "close-sheet": closeSheet(); break;
  }
});

/* boot */
async function boot() {
  screen.innerHTML = `<div class="empty"><p>Завантаження…</p></div>`;
  try {
    await fetchState();
  } catch (e) {
    screen.innerHTML = `<div class="empty"><p>Не вдалося завантажити дані. Онови сторінку.</p></div>`;
    return;
  }
  render();
}
boot();
