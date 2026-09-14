#!/usr/bin/env bun
/**
 * Coverage: does the shipped skill still contain what the source said?
 *
 * The other checks ask whether specific things I looked for survived. This asks the complement —
 * whether anything was lost that I did *not* think to look for. It walks every normalized page,
 * finds lines whose distinctive vocabulary is absent from the corresponding reference file, and
 * fails on any that is not explainable.
 *
 * Two kinds of omission are legitimate and are declared here rather than assumed:
 *   - a `_[figure: …]_` on its own, which is page-header art carrying no guidance
 *   - a table row, which may live in a sibling `<page>.tables.md`
 *   - anything under a heading listed in the manifest's `skip_sections`
 * Everything else is a bug. This is how the WCAG 4.1.1 Parsing loss was found: its explanation was
 * in the IR but never rendered, and no targeted check was looking for it.
 *
 * Usage: `bun run coverage [source-id]` — needs the source built locally.
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { PageIR } from "../schema/ir.ts";
import { exists, listFiles, listSources, loadSource, paths, readJson } from "../util/fs.ts";
import { parseFrontmatter } from "../normalize/frontmatter.ts";
import { log } from "../util/log.ts";

/** Words long enough to be distinctive; short ones match by accident. */
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{7,}/g) ?? []);
/** A line is "lost" when most of its distinctive vocabulary is missing downstream. */
const LOST_THRESHOLD = 0.6;
/** Below this many distinctive words a line cannot be judged. */
const MIN_WORDS = 4;

interface Loss { page: string; line: string }

async function coverageOf(id: string): Promise<{ pages: number; losses: Loss[] }> {
  const source = await loadSource(id);
  const skip = new RegExp(`^#{1,6} (${source.skip_sections.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const losses: Loss[] = [];
  const files = await listFiles(paths.irPages(id), ".json");
  for (const f of files) {
    const ir = (await readJson<PageIR>(join(paths.irPages(id), f)))!;
    const mdPath = join(paths.md(id), `${ir.page}.md`);
    if (!(await exists(mdPath))) continue; // cache pruned; nothing to compare against
    const { body } = parseFrontmatter(await readFile(mdPath, "utf8"));

    const dir = join(paths.skill(source.skill.name), "references", ir.category);
    let shipped = await readFile(join(dir, `${ir.page}.md`), "utf8");
    const tables = join(dir, `${ir.page}.tables.md`);
    if (await exists(tables)) shipped += await readFile(tables, "utf8");
    const have = words(shipped);

    let keep = true;
    for (const line of body.split("\n")) {
      if (line.startsWith("#")) keep = source.skip_sections.length ? !skip.test(line) : true;
      if (!keep || !line.trim()) continue;
      // Declared-legitimate omissions.
      if (/^_\[figure/.test(line.trim())) continue;
      if (line.trim().startsWith("|")) continue;
      const w = words(line);
      if (w.size < MIN_WORDS) continue;
      const missing = [...w].filter((x) => !have.has(x)).length;
      if (missing / w.size > LOST_THRESHOLD) losses.push({ page: ir.page, line: line.trim().slice(0, 120) });
    }
  }
  return { pages: files.length, losses };
}

const only = process.argv[2];
const ids = only ? [only] : await listSources();
let failed = 0;
for (const id of ids) {
  if (!(await exists(paths.irPages(id)))) {
    console.log(`- ${id}: skipped (not built)`);
    continue;
  }
  if (!(await exists(paths.md(id)))) {
    console.log(`- ${id}: skipped (no normalized cache to compare against)`);
    continue;
  }
  const { pages, losses } = await coverageOf(id);
  if (losses.length) {
    failed++;
    console.log(`✗ ${id}: ${losses.length} source line(s) absent from the shipped skill`);
    for (const l of losses.slice(0, 10)) console.log(`    ${l.page}: ${l.line}`);
    if (losses.length > 10) console.log(`    …and ${losses.length - 10} more`);
  } else {
    console.log(`✓ ${id}: ${pages} pages, no unexplained content loss`);
  }
}
if (failed) {
  log.warn(`${failed} source(s) lose content that is not a figure, a table row, or a skipped section`);
  process.exit(1);
}
log.info("every source line is accounted for in the shipped skills");
