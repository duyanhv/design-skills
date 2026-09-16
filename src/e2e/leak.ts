#!/usr/bin/env bun
/**
 * Does any *tracked* file carry the text of a non-redistributable source?
 *
 * The licence gate in `validate` and `manifests` answers a structural question: are `ir/<id>/` and
 * `skills/<name>/` git-ignored? That is necessary and not sufficient. It says nothing about a
 * sentence that reaches a tracked file by another route — pasted into a README to illustrate a
 * point, copied into a fixture, quoted at length in an example. A repository can pass every ignore
 * check and still be republishing the corpus a paragraph at a time.
 *
 * **Direction matters, and the first version of this got it wrong.** It sampled source sentences and
 * grepped for each one, which meant a file carrying 20 leaked sentences went undetected whenever
 * those 20 fell outside a 10% sample — verified by planting exactly that file and watching the check
 * pass. Sampling the haystack cannot establish absence.
 *
 * So the scan runs the other way: read every tracked text file once, and test each of its sentences
 * against the *complete* source corpus held in a set. Every tracked sentence is checked against
 * every source sentence, with no sampling on either side.
 *
 * **Short quotation is expected and allowed.** The worked example quotes Apple in order to cite it,
 * which is what a citation is, and fixtures contain source-shaped strings because that is their
 * purpose. What this catches is *bulk*: a single file carrying many source sentences is reproducing
 * the source rather than citing it.
 *
 * Skips a source that has not been built locally, like `coverage` and `fidelity`, so it is
 * meaningful without a network crawl and silent in CI.
 *
 * Usage: bun run src/e2e/leak.ts [--max-per-file N]
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, exists, listSources, loadSource, paths } from "../util/fs.ts";
import { log } from "../util/log.ts";

const args = process.argv.slice(2);
const argIndex = args.indexOf("--max-per-file");
/** How many distinct source sentences one tracked file may contain before it counts as bulk. */
const MAX_PER_FILE = argIndex >= 0 && args[argIndex + 1] ? Number(args[argIndex + 1]) : 8;

/** Normalise so that reflowed Markdown and curly quotes still match. */
const norm = (s: string) =>
  s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Sentence-ish split. Long fragments only: short ones collide by chance. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => norm(s.replace(/[*_`#>|\[\]]/g, " ")))
    .filter((s) => s.split(" ").length >= 8);
}

async function trackedTextFiles(): Promise<string[]> {
  const proc = Bun.spawn(["git", "ls-files"], { cwd: ROOT, stdout: "pipe", stderr: "ignore" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => /\.(md|ts|tsx|js|json|yaml|yml|txt|swift|sh)$/.test(f));
}

let failed = 0;

for (const id of await listSources()) {
  const source = await loadSource(id);
  if (source.license.redistributable) continue;

  if (!(await exists(join(paths.ir(id), "meta.json")))) {
    console.log(`? ${id}: not built locally, skipped`);
    continue;
  }

  // The complete corpus, not a sample of it.
  const corpus = new Set<string>();
  const glob = new Bun.Glob("*.json");
  for await (const file of glob.scan({ cwd: paths.irPages(id) })) {
    const page = JSON.parse(await readFile(join(paths.irPages(id), file), "utf8")) as {
      rules?: { statement?: string; rationale?: string | null; notes?: string[] }[];
    };
    for (const rule of page.rules ?? []) {
      for (const text of [rule.statement, rule.rationale, ...(rule.notes ?? [])]) {
        for (const sentence of sentences(text ?? "")) corpus.add(sentence);
      }
    }
  }
  if (!corpus.size) {
    console.log(`? ${id}: built but no sentences found, skipped`);
    continue;
  }

  const perFile = new Map<string, number>();
  for (const file of await trackedTextFiles()) {
    let hits = 0;
    const seen = new Set<string>();
    for (const sentence of sentences(await readFile(join(ROOT, file), "utf8"))) {
      if (corpus.has(sentence) && !seen.has(sentence)) {
        seen.add(sentence);
        hits++;
      }
    }
    if (hits) perFile.set(file, hits);
  }

  const bulk = [...perFile].filter(([, n]) => n > MAX_PER_FILE).sort((a, b) => b[1] - a[1]);
  for (const [file, n] of bulk) {
    console.log(`✗ ${file}: contains ${n} distinct ${id} sentences (limit ${MAX_PER_FILE})`);
    console.log(`    a tracked file carrying this much source text is reproducing it, not citing it`);
    failed++;
  }

  const quoting = [...perFile].filter(([, n]) => n <= MAX_PER_FILE).sort((a, b) => b[1] - a[1]);
  const total = quoting.reduce((sum, [, n]) => sum + n, 0);
  console.log(
    `${bulk.length ? "✗" : "✓"} ${id}: ${corpus.size} source sentences checked against every tracked file; ` +
      `${total} short quotation(s) in ${quoting.length} file(s), ${bulk.length} bulk`,
  );
  for (const [file, n] of quoting.slice(0, 6)) console.log(`    ${file}: ${n}`);
}

if (failed) {
  log.warn(`${failed} tracked file(s) carry bulk text from a non-redistributable source`);
  process.exit(1);
}
log.info("no tracked file carries bulk text from a non-redistributable source");
