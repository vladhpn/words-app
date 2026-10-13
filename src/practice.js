import * as store from "./store.js";
import { isDue, applyCorrect, applyIncorrect, applyHard, statusOf } from "./srs.js";
import { checkUaToEn, checkEnToUa } from "./check.js";
import { escapeHtml, shuffle, speakBtn } from "./util.js";

const MODES = [
  ["ua-en", "Українська → англійська"],
  ["en-ua", "Англійська → українська"],
  ["cards", "Картки (самооцінка)"],
];
const MODE_KEY = "slovnychok:mode";

let panel;
let session = null; // { mode, queue:[ids], index, correct, incorrect, mistakes:[ids] }
let mode = "ua-en";

export function mount(el) {
  panel = el;
  try { mode = localStorage.getItem(MODE_KEY) || mode; } catch { /* ignore */ }
}

export function show() {
  if (session) renderStep();
  else renderSetup();
}

export function onDataChange() {
  if (!session) renderSetup();
}

/* ---------- setup ---------- */
function renderSetup() {
  session = null;
  const words = store.words();
  if (!words.length) {
    panel.innerHTML =
      '<h2 class="section-title">Практика</h2>' +
      '<div class="empty-state">Словник поки порожній.<br>Додайте перші слова, щоб почати практику.</div>' +
      '<div class="row center"><button class="btn btn-primary" data-goto="add">Додати слова</button></div>';
    return;
  }
  const due = words.filter(isDue).length;
  const problem = words.filter(w => statusOf(w) === "problematic").length;
  const goal = store.getData().settings.dailyGoal;

  panel.innerHTML =
    '<h2 class="section-title">Практика</h2>' +
    (due
      ? `<p class="hint">Зараз до повторення: <b>${due}</b> ${plural(due, "слово", "слова", "слів")}. Оберіть режим перевірки.</p>`
      : '<p class="hint">На сьогодні все повторено 🌿 Можна попрактикуватись додатково — вільна практика бере слова з найменшим прогресом.</p>') +
    '<div class="mode-pick" id="modePick">' +
      MODES.map(([id, label]) => `<button data-mode="${id}" class="${id === mode ? "active" : ""}">${label}</button>`).join("") +
    '</div>' +
    `<div class="goal-row"><label for="dailyGoalInput">Слів за сесію:</label> <input type="number" inputmode="numeric" id="dailyGoalInput" min="1" max="200" value="${goal}"></div>` +
    '<div class="row">' +
      (due ? `<button class="btn btn-primary" id="startDue">Повторити (${Math.min(due, goal)})</button>` : "") +
      `<button class="btn ${due ? "btn-soft" : "btn-primary"}" id="startFree">Вільна практика</button>` +
      (problem ? `<button class="btn btn-ghost" id="startProblem">Проблемні (${problem})</button>` : "") +
    '</div>';

  panel.querySelectorAll("#modePick button").forEach(b => b.addEventListener("click", () => {
    panel.querySelectorAll("#modePick button").forEach(x => x.classList.toggle("active", x === b));
    mode = b.dataset.mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  }));
  panel.querySelector("#dailyGoalInput").addEventListener("change", e => {
    const v = Math.min(200, Math.max(1, parseInt(e.target.value, 10) || 15));
    e.target.value = v;
    store.setSetting("dailyGoal", v);
  });
  panel.querySelector("#startDue")?.addEventListener("click", () => startSession("due"));
  panel.querySelector("#startFree").addEventListener("click", () => startSession("free"));
  panel.querySelector("#startProblem")?.addEventListener("click", () => startSession("problem"));
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function startSession(kind, ids) {
  const words = store.words();
  const goal = store.getData().settings.dailyGoal || 15;
  let pool;
  if (kind === "due") {
    pool = words.filter(isDue).sort((a, b) =>
      (b.difficultCount - a.difficultCount) || (a.box - b.box) || (a.nextReview || "").localeCompare(b.nextReview || ""));
  } else if (kind === "problem") {
    pool = shuffle(words.filter(w => statusOf(w) === "problematic"));
  } else if (kind === "retry") {
    pool = shuffle(ids.map(store.getWord).filter(Boolean));
  } else {
    pool = shuffle(words).sort((a, b) => a.box - b.box); // stable sort: random within each box
  }
  const queue = (kind === "retry" ? pool : pool.slice(0, goal)).map(w => w.id);
  if (!queue.length) return renderSetup();
  session = { mode, queue, index: 0, correct: 0, incorrect: 0, mistakes: [] };
  renderStep();
}

/* ---------- session ---------- */
function renderStep() {
  // Skip words that were deleted (e.g. on another device) mid-session.
  while (session.index < session.queue.length && !store.getWord(session.queue[session.index])) session.index++;
  if (session.index >= session.queue.length) return renderEnd();

  const w = store.getWord(session.queue[session.index]);
  const pct = Math.round((session.index / session.queue.length) * 100);
  const head =
    '<div class="row between session-head">' +
      `<span>${session.index + 1} / ${session.queue.length}</span>` +
      `<span>✓ ${session.correct} · ↻ ${session.incorrect}</span>` +
      '<button class="link" id="endSession">завершити</button>' +
    '</div>' +
    `<div class="progress-bar"><div style="width:${pct}%"></div></div>`;

  if (session.mode === "cards") {
    panel.innerHTML = head + flashcardHtml(w);
    wireFlashcard(w);
  } else {
    panel.innerHTML = head + writtenHtml(w, session.mode);
    wireWritten(w, session.mode);
  }
  panel.querySelector("#endSession").addEventListener("click", () => {
    session.queue = session.queue.slice(0, session.index);
    renderEnd();
  });
}

function renderEnd() {
  const s = session;
  const mistakes = s.mistakes.map(store.getWord).filter(Boolean);
  panel.innerHTML =
    '<div class="session-end">' +
      '<div class="big">Сесію завершено 🎉</div>' +
      `<p class="hint">Правильно: ${s.correct} · Потребує повторення: ${s.incorrect}</p>` +
    '</div>' +
    (mistakes.length
      ? '<h3 class="sub-title">Варто повторити</h3><div class="mistake-list">' +
        mistakes.map(w => `<div class="mistake"><b>${escapeHtml(w.en)}</b> ${speakBtn(w.en)}<span>${escapeHtml(w.ua)}</span></div>`).join("") +
        "</div>"
      : "") +
    '<div class="row center" style="margin-top:18px;">' +
      (mistakes.length ? '<button class="btn btn-soft" id="retryBtn">Повторити помилки</button>' : "") +
      '<button class="btn btn-primary" id="doneBtn">Готово</button>' +
    '</div>';
  panel.querySelector("#doneBtn").addEventListener("click", renderSetup);
  panel.querySelector("#retryBtn")?.addEventListener("click", () => startSession("retry", s.mistakes));
  session = null;
}

function advance(id, outcome) {
  const fn = outcome === "correct" ? applyCorrect : outcome === "hard" ? applyHard : applyIncorrect;
  store.updateWord(id, fn);
  if (outcome === "correct") session.correct++;
  else {
    session.incorrect++;
    if (!session.mistakes.includes(id)) session.mistakes.push(id);
  }
  session.index++;
  renderStep();
}

/* ---------- written modes ---------- */
function writtenHtml(w, m) {
  const isUaEn = m === "ua-en";
  return (
    '<div class="card-word">' +
      `<div class="eyebrow">${isUaEn ? "Перекладіть англійською" : "Перекладіть українською"}</div>` +
      `<div class="prompt-word">${escapeHtml(isUaEn ? w.ua : w.en)}${isUaEn ? "" : speakBtn(w.en)}</div>` +
      (!isUaEn && w.example ? `<div class="example">${escapeHtml(w.example)}</div>` : "") +
    '</div>' +
    '<form class="answer-row" id="answerForm" autocomplete="off">' +
      `<input type="text" id="answerInput" placeholder="Ваша відповідь…" autocapitalize="off" autocorrect="off" spellcheck="false" lang="${isUaEn ? "en" : "uk"}">` +
      '<button class="btn btn-primary" id="submitBtn">Перевірити</button>' +
    '</form>' +
    '<button class="link dont-know" id="dontKnowBtn">Не знаю — показати відповідь</button>' +
    '<div id="feedbackZone"></div>'
  );
}

function wireWritten(w, m) {
  const form = panel.querySelector("#answerForm");
  const input = panel.querySelector("#answerInput");
  const dontKnow = panel.querySelector("#dontKnowBtn");
  input.focus();

  const lock = () => {
    input.disabled = true;
    panel.querySelector("#submitBtn").disabled = true;
    dontKnow.remove();
  };

  dontKnow.addEventListener("click", () => {
    lock();
    showFeedback(w, m, false, "Нічого страшного — запам'ятовуйте:");
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const answer = input.value.trim();
    if (!answer) return;
    lock();
    const r = m === "ua-en" ? checkUaToEn(w, answer) : checkEnToUa(w, answer);
    if (r.result === "unclear") return showManualConfirm(w, answer);
    const ok = r.result !== "incorrect";
    showFeedback(w, m, ok, r.result === "typo" ? "Майже! Є одруківка, але зараховано." : null);
  });
}

function revealHtml(w, m, label = "Правильна відповідь") {
  const value = m === "ua-en" ? w.en : w.ua;
  return (
    '<div class="reveal-box">' +
      `<div class="label">${label}</div><div class="val">${escapeHtml(value)}${m === "ua-en" ? speakBtn(w.en) : ""}</div>` +
      (w.example ? `<div class="ex">${escapeHtml(w.example)}</div>` : "") +
    '</div>'
  );
}

function nextRow() {
  return '<div class="row end" style="margin-top:16px;"><button class="btn btn-primary" id="nextBtn">Далі →</button></div>';
}

function focusNext(zone, onNext) {
  const btn = zone.querySelector("#nextBtn");
  btn.addEventListener("click", onNext);
  setTimeout(() => btn.focus(), 0);
}

function showFeedback(w, m, isCorrect, note) {
  const zone = panel.querySelector("#feedbackZone");
  zone.innerHTML =
    `<div class="msg ${isCorrect ? "good" : "bad"}">${escapeHtml(note || (isCorrect ? "Правильно!" : "Неправильно"))}</div>` +
    revealHtml(w, m) +
    '<button class="link override-link" id="overrideLink">Незгодні з оцінкою?</button>' +
    '<div class="override-actions" id="overrideActions" hidden>' +
      '<button class="btn btn-soft btn-small" id="flipCorrect">Це правильно</button>' +
      '<button class="btn btn-ghost btn-small" id="flipIncorrect">Це помилка</button>' +
    '</div>' +
    nextRow();

  let finalCorrect = isCorrect;
  const msg = zone.querySelector(".msg");
  const actions = zone.querySelector("#overrideActions");
  zone.querySelector("#overrideLink").addEventListener("click", () => { actions.hidden = false; });
  zone.querySelector("#flipCorrect").addEventListener("click", () => {
    finalCorrect = true;
    msg.className = "msg good";
    msg.textContent = "Зараховано як правильно";
    actions.hidden = true;
  });
  zone.querySelector("#flipIncorrect").addEventListener("click", () => {
    finalCorrect = false;
    msg.className = "msg bad";
    msg.textContent = "Позначено як помилку";
    actions.hidden = true;
  });
  focusNext(zone, () => advance(w.id, finalCorrect ? "correct" : "incorrect"));
}

function showManualConfirm(w, answer) {
  const zone = panel.querySelector("#feedbackZone");
  zone.innerHTML =
    '<div class="msg info">Переклад не збігся дослівно. Порівняйте самі — це правильно?</div>' +
    '<div class="reveal-box">' +
      `<div class="label">Ваша відповідь</div><div class="val">${escapeHtml(answer)}</div>` +
      `<div class="label" style="margin-top:8px;">Варіант у словнику</div><div class="val">${escapeHtml(w.ua)}</div>` +
      (w.example ? `<div class="ex">${escapeHtml(w.example)}</div>` : "") +
    '</div>' +
    '<div class="override-actions">' +
      '<button class="btn btn-soft" id="confirmYes">Так, правильно</button>' +
      '<button class="btn btn-ghost" id="confirmNo">Ні, помилка</button>' +
    '</div>';
  zone.querySelector("#confirmYes").addEventListener("click", () => advance(w.id, "correct"));
  zone.querySelector("#confirmNo").addEventListener("click", () => advance(w.id, "incorrect"));
}

/* ---------- flashcards ---------- */
function flashcardHtml(w) {
  return (
    '<div class="flip-card" id="flipCard" tabindex="0" role="button" aria-label="Перевернути картку">' +
      '<div class="flip-inner">' +
        '<div class="flip-face front">' +
          '<div class="eyebrow">Слово</div>' +
          `<div class="prompt-word">${escapeHtml(w.en)}${speakBtn(w.en)}</div>` +
          (w.example ? `<div class="example">${escapeHtml(w.example)}</div>` : "") +
          '<div class="flip-hint">натисніть, щоб перевернути</div>' +
        '</div>' +
        '<div class="flip-face back">' +
          '<div class="eyebrow">Переклад</div>' +
          `<div class="prompt-word">${escapeHtml(w.ua)}</div>` +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div id="assessZone"></div>'
  );
}

function wireFlashcard(w) {
  const card = panel.querySelector("#flipCard");
  const zone = panel.querySelector("#assessZone");
  const flip = () => {
    card.classList.toggle("flipped");
    if (zone.dataset.shown) return;
    zone.dataset.shown = "1";
    zone.innerHTML =
      '<div class="assess-row">' +
        '<button class="assess-dontknow" data-o="incorrect">Не знаю</button>' +
        '<button class="assess-hard" data-o="hard">Важко</button>' +
        '<button class="assess-know" data-o="correct">Знаю</button>' +
      '</div>';
    zone.querySelectorAll("button").forEach(b => b.addEventListener("click", () => advance(w.id, b.dataset.o)));
  };
  card.addEventListener("click", e => { if (!e.target.closest("[data-say]")) flip(); });
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
  card.focus();
}
