import * as store from "./store.js";
import { statusOf, STATUS_LABEL, isDue } from "./srs.js";
import { escapeHtml, speakBtn, formatDate } from "./util.js";

let panel, search, filter;

export function mount(el) {
  panel = el;
  panel.innerHTML =
    '<h2 class="section-title">Словник</h2>' +
    '<div class="lib-controls">' +
      '<input type="search" id="libSearch" placeholder="Пошук слова або перекладу…" autocapitalize="off">' +
      '<select id="libFilter">' +
        '<option value="all">Усі статуси</option>' +
        '<option value="due">До повторення</option>' +
        '<option value="learned">Вивчено</option>' +
        '<option value="know">Знаю</option>' +
        '<option value="learning">В процесі</option>' +
        '<option value="problematic">Проблемні</option>' +
      '</select>' +
    '</div>' +
    '<div id="libCount" class="hint small"></div>' +
    '<div id="libList"></div>';
  search = panel.querySelector("#libSearch");
  filter = panel.querySelector("#libFilter");
  search.addEventListener("input", renderList);
  filter.addEventListener("change", renderList);
}

export function show() { renderList(); }

export function onDataChange(source) {
  if (source === "remote") renderList();
}

function renderList() {
  const list = panel.querySelector("#libList");
  const q = search.value.trim().toLowerCase();
  const f = filter.value;
  let words = store.words().slice().sort((a, b) => b.createdAt - a.createdAt);
  if (q) words = words.filter(w => w.en.toLowerCase().includes(q) || w.ua.toLowerCase().includes(q));
  if (f === "due") words = words.filter(isDue);
  else if (f !== "all") words = words.filter(w => statusOf(w) === f);

  panel.querySelector("#libCount").textContent = words.length ? `Показано: ${words.length}` : "";
  if (!words.length) {
    list.innerHTML = store.words().length
      ? '<div class="empty-state">Нічого не знайдено.</div>'
      : '<div class="empty-state">Словник порожній. Додайте слова на вкладці «Додати».</div>';
    return;
  }

  list.innerHTML = words.map(w => {
    const st = statusOf(w);
    const meta = [
      w.pack ? `набір: ${escapeHtml(w.pack)}` : "",
      w.nextReview && !isDue(w) ? `наступне повторення: ${formatDate(w.nextReview)}` : "",
    ].filter(Boolean).join(" · ");
    const next = meta ? `<div class="wnext">${meta}</div>` : "";
    return (
      `<div class="word-row" data-id="${escapeHtml(w.id)}">` +
        '<div class="word-main">' +
          '<div class="wtext">' +
            `<div class="wen">${escapeHtml(w.en)}${speakBtn(w.en)}</div>` +
            `<div class="wua">${escapeHtml(w.ua)}</div>` +
            (w.example ? `<div class="wex">${escapeHtml(w.example)}</div>` : "") +
            next +
          '</div>' +
          `<span class="badge ${st}">${STATUS_LABEL[st]}</span>` +
          '<div class="word-actions">' +
            '<button class="icon-btn" data-act="edit" title="Редагувати" aria-label="Редагувати">✎</button>' +
            '<button class="icon-btn" data-act="del" title="Видалити" aria-label="Видалити">🗑</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join("");

  list.querySelectorAll(".word-row").forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-act="del"]').addEventListener("click", () => {
      const w = store.getWord(id);
      if (!w || !confirm(`Видалити «${w.en}» зі словника?`)) return;
      store.deleteWord(id);
      renderList();
    });
    row.querySelector('[data-act="edit"]').addEventListener("click", () => toggleEdit(row, id));
  });
}

function toggleEdit(row, id) {
  const existing = row.querySelector(".edit-form");
  if (existing) return existing.remove();
  const w = store.getWord(id);
  if (!w) return;
  const form = document.createElement("form");
  form.className = "edit-form";
  form.innerHTML =
    `<label class="field-label">Слово</label><input type="text" class="e-en" value="${escapeHtml(w.en)}" autocapitalize="off">` +
    `<label class="field-label">Переклад</label><input type="text" class="e-ua" value="${escapeHtml(w.ua)}">` +
    `<label class="field-label">Приклад</label><textarea class="e-ex">${escapeHtml(w.example)}</textarea>` +
    '<label class="check"><input type="checkbox" class="e-reset"> Скинути прогрес вивчення</label>' +
    '<div class="row end" style="margin-top:10px;">' +
      '<button type="button" class="btn btn-ghost btn-small e-cancel">Скасувати</button>' +
      '<button class="btn btn-primary btn-small">Зберегти</button>' +
    '</div>';
  row.appendChild(form);
  form.querySelector(".e-en").focus();
  form.querySelector(".e-cancel").addEventListener("click", () => form.remove());
  form.addEventListener("submit", e => {
    e.preventDefault();
    const en = form.querySelector(".e-en").value.trim();
    const ua = form.querySelector(".e-ua").value.trim();
    const example = form.querySelector(".e-ex").value.trim();
    const reset = form.querySelector(".e-reset").checked;
    store.updateWord(id, word => {
      if (en) word.en = en;
      if (ua) word.ua = ua;
      word.example = example;
      if (reset) Object.assign(word, { box: 0, difficultCount: 0, lastReviewed: null, nextReview: null });
    });
    renderList();
  });
}
