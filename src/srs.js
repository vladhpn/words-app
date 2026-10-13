import { todayStr, addDays } from "./util.js";

// Leitner boxes: days until the next review for each box.
export const BOX_INTERVAL = [0, 1, 2, 4, 8, 16, 32];

export function isDue(word) {
  if (!word.nextReview) return true;
  return word.nextReview <= todayStr();
}

export function applyCorrect(word) {
  word.box = Math.min(6, word.box + 1);
  word.difficultCount = Math.max(0, word.difficultCount - 1);
  word.lastReviewed = Date.now();
  word.nextReview = addDays(todayStr(), BOX_INTERVAL[word.box] || 1);
}

export function applyIncorrect(word) {
  word.box = 1;
  word.difficultCount += 1;
  word.lastReviewed = Date.now();
  word.nextReview = addDays(todayStr(), 1);
}

export function applyHard(word) {
  word.box = Math.max(1, word.box - 1);
  word.difficultCount += 1;
  word.lastReviewed = Date.now();
  word.nextReview = addDays(todayStr(), 1);
}

export function statusOf(w) {
  if (w.difficultCount >= 2) return "problematic";
  if (w.box >= 5) return "learned";
  if (w.box >= 3) return "know";
  return "learning";
}

export const STATUS_LABEL = { learned: "вивчено", know: "знаю", learning: "в процесі", problematic: "проблемне" };

export function computeStats(words) {
  const s = { total: words.length, learned: 0, know: 0, learning: 0, problematic: 0, due: 0 };
  for (const w of words) {
    s[statusOf(w)]++;
    if (isDue(w)) s.due++;
  }
  return s;
}
