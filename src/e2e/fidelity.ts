#!/usr/bin/env bun
/**
 * Sentence-level fidelity: which normalized-source sentences never appear verbatim in the shipped
 * reference (plus its `.tables.md` sibling)?
 *
 * `coverage.ts` compares vocabulary per line and is satisfied when the words appear anywhere on the
 * page, so it could not see the Buttons paragraph that a stale render had dropped — those words were
 * elsewhere on the page. This compares whole sentences, so a sentence that was dropped, truncated,
 * or attached to the wrong item is reported even when its vocabulary survives (AUDIT-OUTPUT
 * finding 1). It runs in `bun run check`, over every source that is built locally.
 *
 * Usage: `bun run fidelity [source-id] [max-pages-to-print]`
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists, listFiles, listSources, loadSource, paths } from "../util/fs.ts";
import { parseFrontmatter } from "../normalize/frontmatter.ts";
import { log } from "../util/log.ts";

const norm = (s: string) =>
  s
    .replace(/^\s*[-*]\s+/, "")
    .toLowerCase()
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|]/g, "")
    .replace(/[\u2019']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Sentence boundary, including one that closes inside a quotation: Apple writes
 * `…the phrase “Hey Siri.” As an Apple trademark…`, where the character before the space is the
 * quote, not the period. Splitting on the period alone joined the two sentences into one "missing"
 * string even though both halves shipped, in the right places.
 */
const SENTENCE = /(?<=[.!?][)"'\u201d\u2019]?)\s+/;

export interface Fidelity {
  total: number;
  lost: Map<string, string[]>;
}

export async function fidelityOf(id: string): Promise<Fidelity> {
  const source = await loadSource(id);
  const skip = new RegExp(`^#{1,6} (${source.skip_sections.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");

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
      for (const s of norm(line).split(SENTENCE)) {
        if (s.split(" ").length < 6) continue;
        total++;
        if (!refN.includes(s)) lost.set(page, [...(lost.get(page) ?? []), s.slice(0, 140)]);
      }
    }
  }
  return { total, lost };
}

if (import.meta.main) {
  const only = process.argv[2];
  const maxPages = Number(process.argv[3] ?? 12);
  const ids = only ? [only] : await listSources();
  let failed = 0;
  let ran = 0;
  for (const id of ids) {
    // A source that is not built locally cannot be compared; saying so beats passing vacuously.
    if (!(await exists(paths.md(id))) || !(await exists(paths.irPages(id)))) {
      console.log(`- ${id}: skipped (not built)`);
      continue;
    }
    ran++;
    const { total, lost } = await fidelityOf(id);
    const count = [...lost.values()].reduce((n, l) => n + l.length, 0);
    if (!count) {
      console.log(`✓ ${id}: all ${total} source sentences (>=6 words) present verbatim in the shipped references`);
      continue;
    }
    failed++;
    console.log(`✗ ${id}: ${count}/${total} source sentences (>=6 words) not found verbatim; ${lost.size} page(s)`);
    for (const [page, lines] of [...lost].sort((a, b) => b[1].length - a[1].length).slice(0, maxPages)) {
      console.log(`\n## ${page} (${lines.length})`);
      for (const l of lines.slice(0, 6)) console.log(`  - ${l}`);
    }
  }
  if (!ran) {
    log.warn("no source is built locally; nothing to compare");
  } else if (failed) {
    log.warn(`${failed} source(s) lose or misattribute sentences the source states`);
    process.exit(1);
  } else {
    log.info("every source sentence survives verbatim into the shipped skills");
  }
}
