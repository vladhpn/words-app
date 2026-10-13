import * as store from "./store.js";
import { TOPICS, GROUPS, TOPIC_BY_ID } from "./grammar-data.js";
import { checkGrammar } from "./check.js";
import { escapeHtml, shuffle } from "./util.js";

const SESSION_SIZE = 10;

let panel;
let view = { name: "home" }; // or { name: "topic", id }
let session = null;          // { items:[{topicId, idx, opts}], index, correct, wrong:[], mixed, origin }

export function mount(el) { panel = el; }
export function show() { render(); }
export function onDataChange(source) {
  if (source === "remote" && !session && view.name === "home") render();
}

function render() {
  if (session) return renderStep();
  if (view.name === "topic") return renderTopic(view.id);
  renderHome();
}

/* ---------- progress ---------- */
function topicStats(id) {
  const g = store.getData().grammar[id];
  if (!g || !g.recent || !g.recent.length) return null;
  return { acc: g.recent.reduce((a, b) => a + b, 0) / g.recent.length, seen: g.seen || 0 };
}
function isWeak(id) {
  const s = topicStats(id);
  return !!s && s.seen >= 3 && s.acc < 0.7;
}
function chip(id) {
  const s = topicStats(id);
  if (!s) return '<span class="chip">нове</span>';
  const pct = Math.round(s.acc * 100);
  return `<span class="chip ${pct >= 80 ? "good" : pct >= 60 ? "mid" : "bad"}">${pct}%</span>`;
}

/* ---------- home ---------- */
function renderHome() {
  const weak = TOPICS.filter(t => isWeak(t.id));
  const tenses = TOPICS.filter(t => t.group === "tense");
  panel.innerHTML =
    '<h2 class="section-title">Граматика</h2>' +
    '<p class="hint">Теорія та вправи на часи й основні правила. Відсоток — точність за останніми 10 відповідями в темі. Змішана практика частіше дає теми, де ви помиляєтесь.</p>' +
    '<div class="row">' +
      `<button class="btn btn-primary" id="mixBtn">Змішана практика (${SESSION_SIZE})</button>` +
      (weak.length ? `<button class="btn btn-soft" id="weakBtn">Слабкі теми (${weak.length})</button>` : "") +
    '</div>' +
    '<details class="cheat"><summary>Шпаргалка: усі 12 часів</summary><div class="table-wrap"><table class="grid">' +
      '<tr><th>Час</th><th>Ствердження</th><th>Маркери</th></tr>' +
      tenses.map(t => `<tr><td><b>${t.title}</b><br><span class="muted">${t.summary}</span></td><td>${t.forms[0][1]}</td><td class="muted">${t.markers}</td></tr>`).join("") +
    '</table></div></details>' +
    GROUPS.map(g =>
      `<h3 class="sub-title">${g.title}</h3><div class="topic-grid">` +
      TOPICS.filter(t => t.group === g.id).map(t =>
        `<button class="topic-card" data-topic="${t.id}"><span class="t-title">${t.title}</span><span class="t-sub">${t.ua}</span>${chip(t.id)}</button>`
      ).join("") +
      "</div>"
    ).join("");

  panel.querySelector("#mixBtn").addEventListener("click", () => startSession(buildMix(TOPICS), { mixed: true, origin: "home" }));
  panel.querySelector("#weakBtn")?.addEventListener("click", () => startSession(buildMix(weak), { mixed: true, origin: "home" }));
  panel.querySelectorAll("[data-topic]").forEach(b => b.addEventListener("click", () => {
    view = { name: "topic", id: b.dataset.topic };
    render();
    panel.scrollIntoView({ block: "start" });
  }));
}

/* ---------- topic ---------- */
function theoryHtml(t) {
  let h = "";
  if (t.use) h += `<h3>Коли вживаємо</h3><ul>${t.use.map(x => `<li>${x}</li>`).join("")}</ul>`;
  if (t.forms) h += `<h3>Утворення</h3><table class="forms">${t.forms.map(([s, f]) => `<tr><th>${s}</th><td>${f}</td></tr>`).join("")}</table>`;
  for (const b of t.blocks || []) {
    h += `<h3>${b.h}</h3>`;
    if (b.p) h += `<p>${b.p}</p>`;
    if (b.list) h += `<ul>${b.list.map(x => `<li>${x}</li>`).join("")}</ul>`;
    if (b.table) {
      const [head, ...rows] = b.table;
      h += '<div class="table-wrap"><table class="grid">' +
        `<tr>${head.map(c => `<th>${c}</th>`).join("")}</tr>` +
        rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("") +
        "</table></div>";
    }
  }
  if (t.markers) h += `<h3>Слова-маркери</h3><p class="markers">${t.markers}</p>`;
  if (t.examples) h += `<h3>Приклади</h3><ul class="examples">${t.examples.map(([en, ua]) => `<li><span class="en">${en}</span><span class="ua">${ua}</span></li>`).join("")}</ul>`;
  if (t.notes) h += `<div class="note">${t.notes.map(n => `<p>${n}</p>`).join("")}</div>`;
  return h;
}

function renderTopic(id) {
  const t = TOPIC_BY_ID[id];
  if (!t) { view = { name: "home" }; return renderHome(); }
  const s = topicStats(id);
  panel.innerHTML =
    '<button class="link back" id="backBtn">← Усі теми</button>' +
    `<h2 class="section-title">${t.title} ${chip(id)}</h2>` +
    `<p class="hint">${t.ua}${s ? ` · виконано вправ: ${s.seen}` : ""}</p>` +
    `<div class="theory">${theoryHtml(t)}</div>` +
    '<div class="row" style="margin-top:20px;">' +
      `<button class="btn btn-primary" id="startTopic">Вправи (${Math.min(SESSION_SIZE, t.ex.length)})</button>` +
    '</div>';
  panel.querySelector("#backBtn").addEventListener("click", () => { view = { name: "home" }; render(); });
  panel.querySelector("#startTopic").addEventListener("click", () => {
    const items = shuffle(t.ex.map((_, idx) => ({ topicId: id, idx }))).slice(0, SESSION_SIZE);
    startSession(items, { mixed: false, origin: id });
  });
}

/* ---------- sessions ---------- */
function buildMix(topics) {
  const pool = [];
  for (const t of topics) {
    const s = topicStats(t.id);
    const weight = 0.5 + (1 - (s ? s.acc : 0.5)) * 2; // weaker topic → more likely
    t.ex.forEach((_, idx) => pool.push({ topicId: t.id, idx, weight: weight / t.ex.length }));
  }
  const picked = [];
  while (picked.length < SESSION_SIZE && pool.length) {
    let r = Math.random() * pool.reduce((sum, p) => sum + p.weight, 0);
    let i = 0;
    while (i < pool.length - 1 && (r -= pool[i].weight) > 0) i++;
    const [item] = pool.splice(i, 1);
    picked.push({ topicId: item.topicId, idx: item.idx });
  }
  return picked;
}

function startSession(items, opts) {
  if (!items.length) return;
  session = {
    items: items.map(it => {
      const ex = TOPIC_BY_ID[it.topicId].ex[it.idx];
      return { ...it, opts: ex.o ? shuffle(ex.o) : null };
    }),
    index: 0, correct: 0, wrong: [], ...opts,
  };
  renderStep();
}

function questionHtml(q) {
  return escapeHtml(q).replace(/___/g, '<span class="blank">____</span>');
}

function renderStep() {
  const s = session;
  if (s.index >= s.items.length) return renderEnd();
  const item = s.items[s.index];
  const t = TOPIC_BY_ID[item.topicId];
  const ex = t.ex[item.idx];
  const pct = Math.round((s.index / s.items.length) * 100);

  panel.innerHTML =
    '<div class="row between session-head">' +
      `<span>${s.index + 1} / ${s.items.length}</span>` +
      `<span>✓ ${s.correct} · ✗ ${s.wrong.length}</span>` +
      '<button class="link" id="endSession">завершити</button>' +
    '</div>' +
    `<div class="progress-bar"><div style="width:${pct}%"></div></div>` +
    '<div class="card-word grammar-q">' +
      `<div class="eyebrow">${s.mixed ? escapeHtml(t.title) : ex.o ? "Оберіть правильний варіант" : "Впишіть правильну форму"}</div>` +
      `<div class="q-text">${questionHtml(ex.q)}</div>` +
    '</div>' +
    (item.opts
      ? `<div class="options">${item.opts.map(o => `<button class="opt" data-opt="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}</div>`
      : '<form class="answer-row" id="gForm" autocomplete="off">' +
          '<input type="text" id="gInput" placeholder="Ваша відповідь…" autocapitalize="off" autocorrect="off" spellcheck="false" lang="en">' +
          '<button class="btn btn-primary">Перевірити</button>' +
        '</form>') +
    '<div id="gFeedback"></div>';

  panel.querySelector("#endSession").addEventListener("click", () => {
    s.items = s.items.slice(0, s.index);
    renderEnd();
  });

  if (item.opts) {
    panel.querySelectorAll(".opt").forEach(b => b.addEventListener("click", () => {
      panel.querySelectorAll(".opt").forEach(x => {
        x.disabled = true;
        if (ex.a.includes(x.dataset.opt)) x.classList.add("correct");
      });
      const ok = checkGrammar(ex, b.dataset.opt);
      if (!ok) b.classList.add("wrong");
      answered(item, ex, ok, b.dataset.opt);
    }));
  } else {
    const input = panel.querySelector("#gInput");
    input.focus();
    panel.querySelector("#gForm").addEventListener("submit", e => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;
      input.disabled = true;
      panel.querySelector("#gForm button").disabled = true;
      answered(item, ex, checkGrammar(ex, val), val);
    });
  }
}

function answered(item, ex, ok, given) {
  const s = session;
  store.recordGrammar(item.topicId, ok);
  if (ok) s.correct++;
  else s.wrong.push({ ...item, given });

  const zone = panel.querySelector("#gFeedback");
  const others = ex.a.length > 1 ? `<div class="ex">Також правильно: ${ex.a.slice(1).map(escapeHtml).join(", ")}</div>` : "";
  zone.innerHTML =
    `<div class="msg ${ok ? "good" : "bad"}">${ok ? "Правильно!" : "Неправильно"}</div>` +
    (!ok || ex.h || others
      ? '<div class="reveal-box">' +
          (ok ? "" : `<div class="label">Правильна відповідь</div><div class="val">${escapeHtml(ex.a[0])}</div>`) +
          others +
          (ex.h ? `<div class="ex">${escapeHtml(ex.h)}</div>` : "") +
        "</div>"
      : "") +
    '<div class="row end" style="margin-top:16px;"><button class="btn btn-primary" id="gNext">Далі →</button></div>';
  const next = zone.querySelector("#gNext");
  next.addEventListener("click", () => { s.index++; renderStep(); });
  setTimeout(() => next.focus(), 0);
}

function renderEnd() {
  const s = session;
  session = null;
  const total = s.correct + s.wrong.length;
  panel.innerHTML =
    '<div class="session-end">' +
      `<div class="big">${total && s.correct === total ? "Бездоганно! 🎉" : "Готово 👍"}</div>` +
      `<p class="hint">Правильно: ${s.correct} з ${total}</p>` +
    '</div>' +
    (s.wrong.length
      ? '<h3 class="sub-title">Помилки</h3><div class="mistake-list">' +
        s.wrong.map(w => {
          const t = TOPIC_BY_ID[w.topicId];
          const ex = t.ex[w.idx];
          return `<div class="mistake grammar"><div>${questionHtml(ex.q)}</div>` +
            `<span><s>${escapeHtml(w.given)}</s> → <b>${escapeHtml(ex.a[0])}</b> · <button class="link" data-topic="${t.id}">${escapeHtml(t.title)}</button></span></div>`;
        }).join("") +
        "</div>"
      : "") +
    '<div class="row center" style="margin-top:18px;">' +
      '<button class="btn btn-soft" id="againBtn">Ще раз</button>' +
      '<button class="btn btn-primary" id="homeBtn">До тем</button>' +
    '</div>';

  panel.querySelector("#homeBtn").addEventListener("click", () => { view = { name: "home" }; render(); });
  panel.querySelector("#againBtn").addEventListener("click", () => {
    if (s.origin === "home") return startSession(buildMix(TOPICS), { mixed: true, origin: "home" });
    const t = TOPIC_BY_ID[s.origin];
    startSession(shuffle(t.ex.map((_, idx) => ({ topicId: t.id, idx }))).slice(0, SESSION_SIZE), { mixed: false, origin: t.id });
  });
  panel.querySelectorAll("[data-topic]").forEach(b => b.addEventListener("click", () => {
    view = { name: "topic", id: b.dataset.topic };
    render();
  }));
}
