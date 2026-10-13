import { levenshtein } from "./util.js";

// Mobile keyboards insert typographic apostrophes; treat them all as '.
function unifyQuotes(s) {
  return String(s || "").replace(/[’‘`´ʼ]/g, "'");
}

function baseNorm(s) {
  return unifyQuotes(s).toLowerCase().trim()
    .replace(/[.!?;:,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEn(str) {
  let s = baseNorm(str);
  s = s.replace(/^to\s+/, "");
  s = s.replace(/^(a|an|the)\s+/, "");
  s = s.replace(/\b(someone's|smb's|sb's|one's)/g, "SMBPOS");
  s = s.replace(/\b(someone|somebody|smb|sb|one)\b/g, "SMB");
  s = s.replace(/\b(something|smth|sth)\b/g, "STH");
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeUa(str) {
  return baseNorm(str);
}

function variants(str, splitter) {
  const out = new Set();
  for (const part of String(str || "").split(splitter)) {
    const p = part.trim();
    if (!p) continue;
    out.add(p);
    // "здаватися (припиняти спроби)" → also accept "здаватися"
    const noParens = p.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    if (noParens) out.add(noParens);
  }
  if (!out.size && str) out.add(String(str));
  return [...out];
}

function isTypo(a, b) {
  const len = Math.max(a.length, b.length);
  if (len < 4) return false;
  return levenshtein(a, b) <= (len >= 10 ? 2 : 1);
}

function jaccard(a, b) {
  const sa = new Set(a.split(/\s+/).filter(Boolean));
  const sb = new Set(b.split(/\s+/).filter(Boolean));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  sa.forEach(x => { if (sb.has(x)) inter++; });
  return inter / new Set([...sa, ...sb]).size;
}

/** UA → EN: result is "correct" | "typo" | "incorrect". */
export function checkUaToEn(word, answer) {
  const user = normalizeEn(answer);
  const opts = variants(word.en, /[\/;]|,\s*/).map(normalizeEn);
  if (opts.includes(user)) return { result: "correct" };
  if (opts.some(o => isTypo(o, user))) return { result: "typo" };
  return { result: "incorrect" };
}

/**
 * EN → UA: translations are free-form, so anything we can't confidently
 * accept is returned as "unclear" and the user compares manually.
 */
export function checkEnToUa(word, answer) {
  const user = normalizeUa(answer);
  const opts = variants(word.ua, /[\/;]|,\s*|\sабо\s/i).map(normalizeUa);
  if (opts.includes(user)) return { result: "correct" };
  if (opts.some(o => isTypo(o, user))) return { result: "typo" };
  if (opts.some(o => jaccard(user, o) >= 0.6)) return { result: "correct" };
  return { result: "unclear" };
}

/* ---------- grammar exercises ---------- */
export function normalizeGrammar(str) {
  let s = unifyQuotes(str).toLowerCase();
  s = s.replace(/[.!?,;:"]+/g, " ");
  s = s.replace(/\bwon't\b/g, "will not")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/\b(\w+)n't\b/g, "$1 not")
    .replace(/'m\b/g, " am")
    .replace(/'re\b/g, " are")
    .replace(/'ve\b/g, " have")
    .replace(/'ll\b/g, " will")
    .replace(/\bcan not\b/g, "cannot");
  return s.replace(/\s+/g, " ").trim();
}

export function checkGrammar(exercise, answer) {
  if (exercise.o) return exercise.a.includes(answer);
  const user = normalizeGrammar(answer);
  return exercise.a.some(a => normalizeGrammar(a) === user);
}
