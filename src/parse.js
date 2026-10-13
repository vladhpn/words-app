/**
 * Parse the word-list format used by bulk import and word packs:
 * blocks separated by a blank line, first line "word — translation",
 * following lines (optional) — usage example.
 */
export function parseWordBlocks(text) {
  const items = [], errors = [];
  const blocks = String(text || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const first = lines[0];
    const m = first.match(/^(.+?)\s*[—–]\s*(.+)$/) || first.match(/^(.+?)\s+-\s+(.+)$/) || first.match(/^(.+?)\t+(.+)$/);
    if (!m) {
      errors.push(first);
      continue;
    }
    items.push({ en: m[1].trim(), ua: m[2].trim(), example: lines.slice(1).join(" ") });
  }
  return { items, errors };
}
