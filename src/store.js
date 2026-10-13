// App state: persisted to localStorage on every change and, if configured,
// synced to a private GitHub Gist. Sync is pull → merge → push, so every
// device converges on the union of changes (per-record last-write-wins,
// deletions tracked as tombstones).
import { uid } from "./util.js";
import * as gist from "./gist.js";

const LOCAL_KEY = "slovnychok:data:v1";
const SYNC_KEY = "slovnychok:sync:v1";
const TOMBSTONE_TTL = 365 * 24 * 3600 * 1000;
const PUSH_DELAY = 1500;
const PULL_INTERVAL = 60 * 1000;

export function emptyData() {
  return { version: 1, words: [], deleted: {}, settings: { dailyGoal: 15, updatedAt: 0 }, grammar: {} };
}

function normalizeWord(w) {
  const out = Object.assign({
    id: "", en: "", ua: "", example: "",
    box: 0, difficultCount: 0, lastReviewed: null, nextReview: null,
    createdAt: Date.now(), updatedAt: 0,
  }, w);
  if (!out.id) out.id = uid();
  if (!out.updatedAt) out.updatedAt = out.lastReviewed || out.createdAt || 0;
  return out;
}

export function normalizeData(raw) {
  const d = emptyData();
  if (!raw || typeof raw !== "object") return d;
  if (Array.isArray(raw.words)) d.words = raw.words.filter(w => w && w.en).map(normalizeWord);
  if (raw.deleted && typeof raw.deleted === "object") d.deleted = { ...raw.deleted };
  if (raw.settings && typeof raw.settings === "object") d.settings = { ...d.settings, ...raw.settings };
  if (raw.grammar && typeof raw.grammar === "object") d.grammar = { ...raw.grammar };
  return d;
}

export function mergeData(a, b) {
  const now = Date.now();
  const deleted = {};
  for (const src of [a.deleted, b.deleted]) {
    for (const [id, ts] of Object.entries(src || {})) {
      if (now - ts < TOMBSTONE_TTL) deleted[id] = Math.max(deleted[id] || 0, ts);
    }
  }
  const byId = new Map();
  for (const w of [...a.words, ...b.words]) {
    const cur = byId.get(w.id);
    if (!cur || (w.updatedAt || 0) > (cur.updatedAt || 0)) byId.set(w.id, w);
  }
  const words = [...byId.values()].filter(w => !(deleted[w.id] >= (w.updatedAt || 0)));

  const settings = (b.settings.updatedAt || 0) > (a.settings.updatedAt || 0) ? b.settings : a.settings;

  const grammar = { ...a.grammar };
  for (const [id, g] of Object.entries(b.grammar || {})) {
    if (!grammar[id] || (g.updatedAt || 0) > (grammar[id].updatedAt || 0)) grammar[id] = g;
  }
  return { version: 1, words, deleted, settings: { ...settings }, grammar };
}

// Key-order independent JSON, used to detect whether anything changed.
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  }
  return JSON.stringify(v ?? null);
}
function fingerprint(d) {
  return canonical({ ...d, words: d.words.slice().sort((x, y) => (x.id < y.id ? -1 : 1)) });
}

/* ---------- events ---------- */
const listeners = { change: new Set(), status: new Set() };
export function on(event, fn) {
  listeners[event].add(fn);
  return () => listeners[event].delete(fn);
}
function emit(event, arg) {
  listeners[event].forEach(fn => fn(arg));
}

/* ---------- local persistence ---------- */
function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return normalizeData(JSON.parse(raw));
  } catch { /* corrupted or blocked storage */ }
  return emptyData();
}

let localError = null;
function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    localError = null;
  } catch {
    localError = "Не вдалося зберегти в браузері (сховище недоступне або переповнене)";
  }
}

let data = loadLocal();

export function getData() { return data; }
export function words() { return data.words; }
export function getWord(id) { return data.words.find(w => w.id === id); }

function commit() {
  saveLocal();
  emit("change", "local");
  if (localError) setStatus({ state: "error", message: localError });
  schedulePush();
}

/* ---------- mutations ---------- */
function wordKey(en) { return String(en || "").trim().toLowerCase(); }

export function hasWord(en) {
  const k = wordKey(en);
  return data.words.some(w => wordKey(w.en) === k);
}

export function addWords(list) {
  const now = Date.now();
  const added = list.map((item, i) => normalizeWord({
    id: uid(), en: item.en, ua: item.ua, example: item.example || "",
    createdAt: now + i, updatedAt: now,
  }));
  data.words.push(...added);
  commit();
  return added;
}

export function updateWord(id, fn) {
  const w = getWord(id);
  if (!w) return null;
  fn(w);
  w.updatedAt = Date.now();
  commit();
  return w;
}

export function deleteWord(id) {
  data.words = data.words.filter(w => w.id !== id);
  data.deleted[id] = Date.now();
  commit();
}

export function setSetting(key, value) {
  data.settings[key] = value;
  data.settings.updatedAt = Date.now();
  commit();
}

export function recordGrammar(topicId, ok) {
  const g = data.grammar[topicId] || { seen: 0, correct: 0, recent: [] };
  g.seen = (g.seen || 0) + 1;
  if (ok) g.correct = (g.correct || 0) + 1;
  g.recent = [...(g.recent || []), ok ? 1 : 0].slice(-10);
  g.lastAt = Date.now();
  g.updatedAt = Date.now();
  data.grammar[topicId] = g;
  commit();
}

/** Merge a JSON backup (this app's export or the original prototype's). Returns number of new words. */
export function importBackup(raw) {
  if (!raw || !Array.isArray(raw.words)) throw new Error("bad format");
  const incoming = normalizeData(raw);
  const ids = new Set(data.words.map(w => w.id));
  const keys = new Set(data.words.map(w => (w.en + "|" + w.ua).toLowerCase()));
  let added = 0;
  for (const w of incoming.words) {
    const key = (w.en + "|" + w.ua).toLowerCase();
    if (ids.has(w.id) || keys.has(key)) continue;
    delete data.deleted[w.id];
    data.words.push({ ...w, updatedAt: Date.now() });
    ids.add(w.id);
    keys.add(key);
    added++;
  }
  if (raw.settings && raw.settings.dailyGoal) {
    data.settings.dailyGoal = raw.settings.dailyGoal;
    data.settings.updatedAt = Date.now();
  }
  commit();
  return added;
}

export function exportJson() {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

/* ---------- sync ---------- */
let syncConfig = null;
try { syncConfig = JSON.parse(localStorage.getItem(SYNC_KEY) || "null"); } catch { syncConfig = null; }

let status = { state: syncConfig ? "idle" : "off" };
function setStatus(s) {
  status = { ...status, ...s };
  emit("status", status);
}
export function getStatus() { return status; }
export function getSyncConfig() { return syncConfig; }

function saveSyncConfig() {
  try {
    if (syncConfig) localStorage.setItem(SYNC_KEY, JSON.stringify(syncConfig));
    else localStorage.removeItem(SYNC_KEY);
  } catch { /* ignore */ }
}

let syncing = false;
let syncAgain = false;
let pushTimer = null;

function schedulePush() {
  if (!syncConfig) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, PUSH_DELAY);
}

export async function syncNow() {
  if (!syncConfig) return;
  if (syncing) { syncAgain = true; return; }
  clearTimeout(pushTimer);
  if (!navigator.onLine) {
    setStatus({ state: "offline", message: null });
    return;
  }
  syncing = true;
  setStatus({ state: "syncing", message: null });
  try {
    const { token, gistId } = syncConfig;
    const remoteRaw = await gist.readGist(token, gistId);
    const remote = remoteRaw ? normalizeData(remoteRaw) : null;
    const merged = remote ? mergeData(data, remote) : data;

    const mergedFp = fingerprint(merged);
    if (mergedFp !== fingerprint(data)) {
      data = merged;
      saveLocal();
      emit("change", "remote");
    }
    if (!remote || mergedFp !== fingerprint(remote)) {
      await gist.writeGist(token, gistId, JSON.stringify(data));
    }
    syncConfig.lastSyncAt = Date.now();
    saveSyncConfig();
    setStatus({ state: "ok", at: syncConfig.lastSyncAt, message: null });
  } catch (e) {
    setStatus({ state: e.code === "network" ? "offline" : "error", message: e.message || "Помилка синхронізації" });
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; syncNow(); }
  }
}

/** Validate token, find (or create) the data gist, then do a first sync. */
export async function connectSync(token) {
  token = token.trim();
  const user = await gist.getUser(token);
  let gistId = await gist.findGist(token);
  if (!gistId) gistId = await gist.createGist(token, JSON.stringify(data));
  syncConfig = { token, gistId, login: user.login, lastSyncAt: null };
  saveSyncConfig();
  await syncNow();
  return syncConfig;
}

export function disconnectSync() {
  clearTimeout(pushTimer);
  syncConfig = null;
  saveSyncConfig();
  setStatus({ state: "off", message: null, at: null });
}

export function startSync() {
  if (syncConfig) syncNow();
  const pullIfStale = () => {
    if (!syncConfig || document.visibilityState !== "visible") return;
    if (Date.now() - (syncConfig.lastSyncAt || 0) > 10 * 1000) syncNow();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullIfStale();
    else if (syncConfig && pushTimer) syncNow(); // flush pending changes before the tab goes to background
  });
  window.addEventListener("online", () => syncConfig && syncNow());
  window.addEventListener("offline", () => syncConfig && setStatus({ state: "offline", message: null }));
  setInterval(pullIfStale, PULL_INTERVAL);
}
