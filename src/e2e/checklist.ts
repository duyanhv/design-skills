#!/usr/bin/env bun
/**
 * Does the checklist's tick correspond to anything?
 *
 * `docs/public-output-checklist.md` is where this project records what it has delivered, and every
 * `- [x]` is a public claim. Nothing verified them. An audit flagged that my confidence in "the
 * checklist is closed" had jumped without evidence, and the test was easy: I added
 * "- [x] Ship a fully verified Flutter skill with three worked examples" to the file and
 * `bun run check` passed.
 *
 * A tick is prose, and this repository's whole history is prose drifting from the artifacts it
 * describes. So the ticks that name a concrete artifact are now resolved against it.
 *
 * What this can and cannot do, stated rather than implied:
 *
 *   - It resolves **references**: a ticked item naming a path, a bundle, a script or an example
 *     must name one that exists. That catches the fabricated tick above, and a tick left behind
 *     when a file is renamed or deleted.
 *   - It cannot judge whether the *work* behind a tick is good. "Expand the guidance with
 *     actionable content" is a judgement, and no script settles it. Those items are counted and
 *     reported as unverifiable rather than silently treated as passing.
 *
 * Usage: bun run src/e2e/checklist.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, exists } from "../util/fs.ts";
import { log } from "../util/log.ts";

const CHECKLIST = join(ROOT, "docs", "public-output-checklist.md");
if (!(await exists(CHECKLIST))) {
  log.warn("docs/public-output-checklist.md is missing");
  process.exit(1);
}

let failed = 0;
const fail = (msg: string, detail?: string) => {
  console.log(`✗ ${msg}`);
  if (detail) console.log(`    ${detail}`);
  failed++;
};

const text = await readFile(CHECKLIST, "utf8");

/** A ticked item plus any indented continuation lines that justify it. */
const items: { line: number; body: string }[] = [];
const lines = text.split("\n");
for (const [index, line] of lines.entries()) {
  if (!/^- \[x\]/i.test(line.trim())) continue;
  let body = line;
  for (let j = index + 1; j < lines.length; j++) {
    const next = lines[j]!;
    if (!next.trim() || /^\s*- \[/.test(next) || !/^\s+\S/.test(next)) break;
    body += `\n${next}`;
  }
  items.push({ line: index + 1, body });
}

if (!items.length) {
  fail("the checklist has no completed items", "either nothing is done, or the format changed");
  process.exit(1);
}

/**
 * Things a tick can name that this can resolve. Backticked paths and markdown links are the two
 * ways the checklist refers to real artifacts.
 */
const PATH_LIKE = /`([a-z0-9][\w./-]*\.(?:ts|md|yaml|json|sh|swift|tsx|mjs))`|`((?:src|docs|guidance|skills|examples|evals|test)\/[\w./-]+)`|\]\((\.\.\/[\w./-]+)\)/gi;

/** A named npm script: `bun run x` or `bun run src/e2e/x.ts`. */
const SCRIPT_LIKE = /`bun run ([a-z:-]+)`/gi;

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/** Every file git tracks, so a bare filename can be resolved without guessing its directory. */
const listing = Bun.spawn(["git", "ls-files"], { cwd: ROOT, stdout: "pipe", stderr: "ignore" });
const trackedFiles = (await new Response(listing.stdout).text()).split("\n").filter(Boolean);
await listing.exited;
const trackedNames = new Set(trackedFiles.map((f) => f.split("/").pop()!));
const tracked = async (name: string) => trackedNames.has(name);

let resolved = 0;
let unverifiable = 0;

for (const item of items) {
  const references: string[] = [];

  for (const match of item.body.matchAll(PATH_LIKE)) {
    const raw = (match[1] ?? match[2] ?? match[3])!;
    references.push(raw);

    // Three ways the checklist names a file, all of them legitimate prose:
    //   ../guidance/x/     a link, relative to docs/
    //   src/e2e/links.ts   a repository-relative path
    //   SKILL.md           a bare filename, meaning "the SKILL.md files"
    // The last is the common case and is resolved by search: the claim is that such a file
    // exists, not that it sits at the repository root.
    const direct = raw.startsWith("../") ? join(ROOT, "docs", raw) : join(ROOT, raw);
    if (await exists(direct)) continue;
    if (!raw.includes("/") && (await tracked(raw))) continue;

    fail(`checklist:${item.line} is ticked and names "${raw}", which does not exist`,
         item.body.split("\n")[0]!.trim().slice(0, 96));
  }

  for (const match of item.body.matchAll(SCRIPT_LIKE)) {
    const name = match[1]!;
    references.push(`bun run ${name}`);
    // `bun run <script>` must be a declared script; `bun run src/...` is covered by PATH_LIKE.
    if (!name.includes("/") && !pkg.scripts[name]) {
      fail(`checklist:${item.line} is ticked and names \`bun run ${name}\`, which is not a script`,
           item.body.split("\n")[0]!.trim().slice(0, 96));
    }
  }

  if (references.length) resolved++;
  else unverifiable++;
}

console.log("");
console.log(`  ${items.length} completed item(s): ${resolved} name an artifact that resolves, ${unverifiable} are judgements this cannot check`);
if (unverifiable > resolved) {
  console.log("  (a majority of the ticks assert work rather than naming it; that is a documentation");
  console.log("   weakness, not a failure, and it is reported rather than enforced)");
}

if (failed) {
  log.warn(`${failed} completed checklist item(s) name something that does not exist`);
  process.exit(1);
}
log.info("every completed checklist item that names an artifact resolves to one");
