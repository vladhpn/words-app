// Word packs: every words/*.txt file in the repo is bundled at build time and
// its new entries are added to the dictionary automatically on app start.
import * as store from "./store.js";
import { parseWordBlocks } from "./parse.js";

const files = import.meta.glob("../words/*.txt", { query: "?raw", import: "default", eager: true });

export const PACKS = Object.entries(files).map(([path, text]) => ({
  name: path.split("/").pop().replace(/\.txt$/, ""),
  items: parseWordBlocks(text).items,
}));

/** Adds pack entries not imported before. Returns [{ name, count }] of packs that added words. */
export function importPacks() {
  const report = [];
  for (const pack of PACKS) {
    const count = store.addPackWords(pack.name, pack.items);
    if (count) report.push({ name: pack.name, count });
  }
  return report;
}
