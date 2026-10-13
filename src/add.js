import * as store from "./store.js";
import { escapeHtml } from "./util.js";
import { parseWordBlocks } from "./parse.js";

let panel;

export function mount(el) {
  panel = el;
  panel.innerHTML =
    '<h2 class="section-title">Додати одне слово</h2>' +
    '<form id="addForm" autocomplete="off">' +
      '<label class="field-label" for="addEn">Англійське слово / ідіома</label>' +
      '<input type="text" id="addEn" placeholder="напр. give up" autocapitalize="off" lang="en">' +
      '<label class="field-label" for="addUa">Переклад українською</label>' +
      '<input type="text" id="addUa" placeholder="напр. здаватися, покинути" lang="uk">' +
      '<label class="field-label" for="addExample">Приклад використання англійською</label>' +
      '<textarea id="addExample" placeholder="напр. Don’t give up on your dreams." lang="en"></textarea>' +
      '<p class="hint small">Кілька варіантів перекладу розділяйте комою або «/» — у практиці зараховується будь-який.</p>' +
      '<div class="row"><button class="btn btn-primary">Додати слово</button></div>' +
    '</form>' +
    '<div id="addOneMsg"></div>' +

    '<div class="divider"></div>' +

    '<h2 class="section-title">Масовий імпорт</h2>' +
    '<p class="hint">Кожне слово — окремий блок: перший рядок «слово — переклад», другий рядок (необов\'язково) — приклад. Блоки розділяйте порожнім рядком.</p>' +
    '<textarea id="bulkInput" rows="8" placeholder="give up — здаватися, покинути\nDon’t give up on your dreams.\n\nkick the bucket — померти, врізати дуба\nOld Mr. Jenkins finally kicked the bucket last week."></textarea>' +
    '<div class="row" style="margin-top:14px;"><button class="btn btn-primary" id="bulkImportBtn">Імпортувати список</button></div>' +
    '<div id="bulkReport" class="import-report"></div>';

  const en = panel.querySelector("#addEn");
  const ua = panel.querySelector("#addUa");
  const ex = panel.querySelector("#addExample");
  const msg = panel.querySelector("#addOneMsg");

  panel.querySelector("#addForm").addEventListener("submit", e => {
    e.preventDefault();
    const item = { en: en.value.trim(), ua: ua.value.trim(), example: ex.value.trim() };
    if (!item.en || !item.ua) {
      msg.innerHTML = '<div class="msg bad">Заповніть принаймні слово та переклад.</div>';
      return;
    }
    if (store.hasWord(item.en) && !confirm(`«${item.en}» вже є у словнику. Додати ще раз?`)) return;
    store.addWords([item]);
    en.value = ua.value = ex.value = "";
    msg.innerHTML = `<div class="msg good">Слово «${escapeHtml(item.en)}» додано.</div>`;
    en.focus();
  });

  panel.querySelector("#bulkImportBtn").addEventListener("click", () => {
    const input = panel.querySelector("#bulkInput");
    const { added, errors, duplicates } = parseBulk(input.value);
    if (added.length) store.addWords(added);
    const lines = [`Додано слів: ${added.length}.`];
    if (duplicates.length) lines.push(`Пропущено (вже є у словнику): ${duplicates.join(", ")}`);
    if (errors.length) lines.push(`Не вдалося розпізнати ${errors.length} блок(и):\n` + errors.join("\n"));
    panel.querySelector("#bulkReport").textContent = lines.join("\n");
    if (added.length && !errors.length) input.value = "";
  });
}

export function show() {}

function parseBulk(text) {
  const parsed = parseWordBlocks(text);
  const errors = parsed.errors.map(line => `«${line}» — не знайдено роздільник «—» між словом і перекладом`);
  const added = [], duplicates = [];
  const seen = new Set();
  for (const item of parsed.items) {
    const key = item.en.toLowerCase();
    if (store.hasWord(item.en) || seen.has(key)) {
      duplicates.push(item.en);
      continue;
    }
    seen.add(key);
    added.push(item);
  }
  return { added, errors, duplicates };
}
