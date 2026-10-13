export function uid(prefix = "w") {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Local calendar date (not UTC), so "today" matches the user's clock.
export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return todayStr(new Date(y, m - 1, d + days));
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
}

export function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const sameDay = todayStr(d) === todayStr();
  return sameDay
    ? d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Edit distance where swapping two adjacent letters counts as one typo.
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/* ---------- pronunciation (Web Speech API) ---------- */
export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(text) {
  if (!canSpeak || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// Clicks on [data-say] are handled by a single delegated listener in app.js.
export function speakBtn(text) {
  if (!canSpeak || !text) return "";
  return `<button type="button" class="icon-btn speak" data-say="${escapeHtml(text)}" title="Вимова" aria-label="Прослухати вимову">🔊</button>`;
}

export function gotoTab(name) {
  window.dispatchEvent(new CustomEvent("app:tab", { detail: name }));
}
