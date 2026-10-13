// Minimal GitHub Gist client. The whole app state lives in one JSON file
// inside a private gist owned by the user.
const API = "https://api.github.com";
export const FILE = "slovnychok-data.json";

export class SyncError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function request(token, path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `token ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError("network", "Немає з'єднання з GitHub");
  }
  if (res.status === 401) throw new SyncError("auth", "Токен недійсний або відкликаний");
  if (res.status === 403 || res.status === 429) throw new SyncError("forbidden", "GitHub відхилив запит (ліміт запитів або немає дозволу gist)");
  if (res.status === 404) throw new SyncError("notfound", "Gist не знайдено або в токена немає дозволу gist");
  if (!res.ok) throw new SyncError("http", `GitHub відповів помилкою ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export function getUser(token) {
  return request(token, "/user");
}

export async function findGist(token) {
  for (let page = 1; page <= 10; page++) {
    const list = await request(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find(g => g.files && g.files[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

export async function createGist(token, content) {
  const g = await request(token, "/gists", {
    method: "POST",
    body: {
      description: "Словничок — дані застосунку (не видаляйте)",
      public: false,
      files: { [FILE]: { content } },
    },
  });
  return g.id;
}

export async function readGist(token, id) {
  const g = await request(token, `/gists/${id}`);
  const f = g.files && g.files[FILE];
  if (!f) return null;
  let text = f.content;
  if (f.truncated) {
    // Files over ~1MB are truncated in the API response.
    const r = await fetch(f.raw_url, { cache: "no-store" });
    if (!r.ok) throw new SyncError("http", `Не вдалося завантажити дані (${r.status})`);
    text = await r.text();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new SyncError("parse", "Файл у gist пошкоджений");
  }
}

export async function writeGist(token, id, content) {
  await request(token, `/gists/${id}`, { method: "PATCH", body: { files: { [FILE]: { content } } } });
}
