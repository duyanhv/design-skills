#!/usr/bin/env bun
/**
 * Sentence-level fidelity: which normalized-source sentences never appear verbatim in the shipped
 * reference (plus its `.tables.md` sibling)?
 *
 * `coverage.ts` compares vocabulary per line and is satisfied when the words appear anywhere on the
 * page. This compares whole sentences, so a sentence that was dropped, truncated, or attached to the
 * wrong item is reported even when its words survive elsewhere. See AUDIT-OUTPUT.md, finding 1.
 *
 * Usage: `bun run src/e2e/fidelity.ts <source-id> [max-pages-to-print]` — needs the source built locally.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists, listFiles, loadSource, paths } from "../util/fs.ts";
import { parseFrontmatter } from "../normalize/frontmatter.ts";

const id = process.argv[2];
if (!id) {
  console.error("usage: bun run src/e2e/fidelity.ts <source-id> [max-pages]");
  process.exit(2);
}
const maxPages = Number(process.argv[3] ?? 12);
const source = await loadSource(id);
const skip = new RegExp(`^#{1,6} (${source.skip_sections.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");

const norm = (s: string) =>
  s
    .replace(/^\s*[-*]\s+/, "")
    .toLowerCase()
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|]/g, "")
    .replace(/[\u2019']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const refs = new Map<string, string>();
const refRoot = join(paths.skill(source.skill.name), "references");
for (const cat of await listFiles(refRoot, "")) {
  const dir = join(refRoot, cat);
  if (!(await exists(dir))) continue;
  for (const f of await listFiles(dir, ".md")) {
    const page = f.replace(/\.tables\.md$|\.md$/, "");
    refs.set(page, (refs.get(page) ?? "") + (await readFile(join(dir, f), "utf8")));
  }
}

let total = 0;
const lost = new Map<string, string[]>();
for (const f of await listFiles(paths.md(id), ".md")) {
  const page = f.replace(/\.md$/, "");
  const ref = refs.get(page);
  if (!ref) continue;
  const refN = norm(ref);
  const { body } = parseFrontmatter(await readFile(join(paths.md(id), f), "utf8"));
  let keep = true;
  for (const raw of body.split("\n")) {
    if (raw.startsWith("#")) {
      keep = source.skip_sections.length ? !skip.test(raw) : true;
      continue;
    }
    const line = raw.trim();
    if (!keep || !line || line.startsWith("_[figure") || line.startsWith("|")) continue;
    for (const s of norm(line).split(/(?<=[.!?])\s+/)) {
      if (s.split(" ").length < 6) continue;
      total++;
      if (!refN.includes(s)) lost.set(page, [...(lost.get(page) ?? []), s.slice(0, 140)]);
    }
  }
}
const count = [...lost.values()].reduce((n, l) => n + l.length, 0);
console.log(`${id}: ${count}/${total} source sentences (>=6 words) not found verbatim in the shipped references; ${lost.size} page(s)`);
for (const [page, lines] of [...lost].sort((a, b) => b[1].length - a[1].length).slice(0, maxPages)) {
  console.log(`\n## ${page} (${lines.length})`);
  for (const l of lines.slice(0, 6)) console.log(`  - ${l}`);
}
process.exit(count ? 1 : 0);
