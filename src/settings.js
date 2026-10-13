import * as store from "./store.js";
import { escapeHtml, formatTime, todayStr } from "./util.js";

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=gist&description=Slovnychok";

let panel;
let busy = false;
let lastMsg = "";

export function mount(el) { panel = el; }
export function show() { render(); }
export function onStatus() { if (!busy) render(); }

function render() {
  const cfg = store.getSyncConfig();
  const st = store.getStatus();
  panel.innerHTML =
    '<h2 class="section-title">Синхронізація між пристроями</h2>' +
    (cfg ? connectedHtml(cfg, st) : setupHtml()) +
    `<div id="syncMsg">${lastMsg}</div>` +
    '<div class="divider"></div>' +
    '<h2 class="section-title">Резервна копія</h2>' +
    '<p class="hint">Файл JSON з усіма словами, прогресом і налаштуваннями. Імпорт додає лише нові слова й нічого не видаляє — підходить і для бекапу з першої версії застосунку.</p>' +
    '<div class="row">' +
      '<button class="btn btn-ghost" id="exportBtn">Експорт JSON</button>' +
      '<label class="btn btn-ghost"><input type="file" id="importFile" accept="application/json,.json" hidden>Імпорт JSON</label>' +
    '</div>';
  wire();
}

function setupHtml() {
  return (
    '<p class="hint">Зараз слова зберігаються лише в цьому браузері. Щоб на телефоні й ноутбуці були однакові дані, застосунок зберігає їх у <b>приватному GitHub Gist</b> — файлі у вашому акаунті GitHub. Сервер і база даних не потрібні.</p>' +
    '<ol class="steps">' +
      `<li>Створіть токен <a href="${TOKEN_URL}" target="_blank" rel="noopener">за цим посиланням</a>. Потрібен лише дозвіл <b>gist</b> (вже позначений). Термін дії оберіть на свій смак — з «No expiration» не доведеться оновлювати.</li>` +
      '<li>Скопіюйте токен, вставте нижче й натисніть «Підключити».</li>' +
      '<li>На іншому пристрої зробіть те саме з тим самим токеном — застосунок сам знайде ваші дані й об\'єднає їх.</li>' +
    '</ol>' +
    '<form class="answer-row" id="connectForm" autocomplete="off">' +
      '<input type="password" id="tokenInput" placeholder="ghp_…" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      `<button class="btn btn-primary" ${busy ? "disabled" : ""}>${busy ? "Підключення…" : "Підключити"}</button>` +
    '</form>' +
    '<p class="hint small">Токен зберігається лише в цьому браузері й використовується тільки для запитів до api.github.com.</p>'
  );
}

function connectedHtml(cfg, st) {
  const stateText = {
    ok: `останнє оновлення ${formatTime(st.at || cfg.lastSyncAt)}`,
    syncing: "синхронізація…",
    idle: "синхронізація…",
    offline: "немає мережі — зміни збережено локально",
    error: `помилка: ${escapeHtml(st.message || "")}`,
  }[st.state] || "";
  return (
    '<div class="sync-card">' +
      `<div><span class="dot ${st.state}"></span>Підключено як <b>${escapeHtml(cfg.login || "GitHub")}</b> · ${stateText}</div>` +
      `<div class="hint small">Дані: <a href="https://gist.github.com/${encodeURIComponent(cfg.gistId)}" target="_blank" rel="noopener">приватний gist</a>. Зміни надсилаються автоматично за секунду-дві після кожної дії й підтягуються, коли ви відкриваєте застосунок.</div>` +
    '</div>' +
    (st.state === "error" && /токен/i.test(st.message || "")
      ? '<div class="msg bad">Схоже, токен більше не діє. Відключіть синхронізацію на цьому пристрої й підключіть знову з новим токеном.</div>'
      : "") +
    '<div class="row" style="margin-top:14px;">' +
      `<button class="btn btn-primary" id="syncNowBtn" ${st.state === "syncing" ? "disabled" : ""}>Синхронізувати зараз</button>` +
      '<button class="btn btn-ghost" id="disconnectBtn">Відключити на цьому пристрої</button>' +
    '</div>'
  );
}

function setMsg(html) {
  lastMsg = html;
  const el = panel.querySelector("#syncMsg");
  if (el) el.innerHTML = html;
}

function wire() {
  panel.querySelector("#connectForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const token = panel.querySelector("#tokenInput").value.trim();
    if (!token) return;
    busy = true;
    lastMsg = "";
    render();
    try {
      const cfg = await store.connectSync(token);
      lastMsg = `<div class="msg good">Готово! Синхронізацію увімкнено для ${escapeHtml(cfg.login)}.</div>`;
    } catch (err) {
      lastMsg = `<div class="msg bad">${escapeHtml(err.message || "Не вдалося підключитися")}</div>`;
    } finally {
      busy = false;
      render();
    }
  });

  panel.querySelector("#syncNowBtn")?.addEventListener("click", () => {
    lastMsg = "";
    store.syncNow();
  });

  panel.querySelector("#disconnectBtn")?.addEventListener("click", () => {
    if (!confirm("Відключити синхронізацію на цьому пристрої? Дані в браузері та в gist залишаться.")) return;
    lastMsg = "";
    store.disconnectSync();
    render();
  });

  panel.querySelector("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([store.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slovnychok-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  panel.querySelector("#importFile").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const added = store.importBackup(JSON.parse(reader.result));
        setMsg(`<div class="msg good">Імпортовано нових слів: ${added}.</div>`);
      } catch {
        setMsg('<div class="msg bad">Не вдалося прочитати файл. Перевірте, що це JSON-бекап цього застосунку.</div>');
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });
}
