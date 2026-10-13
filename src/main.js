import "./styles.css";
import * as store from "./store.js";
import { computeStats } from "./srs.js";
import { speak, formatTime, gotoTab } from "./util.js";
import * as practice from "./practice.js";
import * as grammar from "./grammar.js";
import * as add from "./add.js";
import * as library from "./library.js";
import * as settings from "./settings.js";
import { importPacks } from "./packs.js";

const PANELS = { practice, grammar, add, library, settings };
const TAB_KEY = "slovnychok:tab";
const WORD_TABS = new Set(["practice", "add", "library"]);
let current = "practice";

function renderStats() {
  const s = computeStats(store.words());
  document.getElementById("statsStrip").innerHTML =
    `<div class="stat"><b>${s.total}</b><span>усього слів</span></div>` +
    `<div class="stat due"><b>${s.due}</b><span>до повторення</span></div>` +
    `<div class="stat learned"><b>${s.learned}</b><span>вивчено</span></div>` +
    `<div class="stat"><b>${s.know}</b><span>знаю</span></div>` +
    `<div class="stat"><b>${s.learning}</b><span>в процесі</span></div>` +
    `<div class="stat problematic"><b>${s.problematic}</b><span>проблемні</span></div>`;
}

function renderSyncStatus(st = store.getStatus()) {
  const el = document.getElementById("syncStatus");
  const text = {
    off: `Дані лише на цьому пристрої · <button class="link" data-goto="settings">увімкнути синхронізацію</button>`,
    idle: "☁ Синхронізація…",
    syncing: "☁ Синхронізація…",
    ok: `☁ Синхронізовано ${formatTime(st.at)}`,
    offline: "☁ Офлайн — зміни збережено локально й синхронізуються пізніше",
    error: `⚠ ${st.message || "Помилка синхронізації"} · <button class="link" data-goto="settings">деталі</button>`,
  }[st.state] || "";
  el.innerHTML = text;
  el.className = "sync-" + st.state;
  if (current === "settings") settings.onStatus(st);
}

function showTab(name) {
  if (!PANELS[name]) name = "practice";
  current = name;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + name));
  document.getElementById("statsStrip").hidden = !WORD_TABS.has(name);
  PANELS[name].show();
  try { localStorage.setItem(TAB_KEY, name); } catch { /* ignore */ }
}

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
window.addEventListener("app:tab", e => showTab(e.detail));

document.addEventListener("click", e => {
  const say = e.target.closest("[data-say]");
  if (say) { e.preventDefault(); speak(say.dataset.say); return; }
  const go = e.target.closest("[data-goto]");
  if (go) { e.preventDefault(); gotoTab(go.dataset.goto); }
});

store.on("change", source => {
  renderStats();
  PANELS[current].onDataChange?.(source);
});
store.on("status", renderSyncStatus);

for (const [name, mod] of Object.entries(PANELS)) mod.mount(document.getElementById("panel-" + name));

let saved = null;
try { saved = localStorage.getItem(TAB_KEY); } catch { /* ignore */ }
renderStats();
renderSyncStatus();
showTab(saved || "practice");
store.startSync().then(() => {
  const report = importPacks();
  if (report.length) {
    const total = report.reduce((n, r) => n + r.count, 0);
    toast(`Додано ${total} нових слів: ${report.map(r => r.name).join(", ")}`);
  }
});

function toast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("hide"), 4500);
  setTimeout(() => el.remove(), 5000);
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
