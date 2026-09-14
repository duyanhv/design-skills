#!/usr/bin/env bun
/**
 * Negative tests for `validate`.
 *
 * Every guard in `src/validate/index.ts` was, until now, asserted only by reading the code. A guard
 * that has never been *seen* to fire is a guess: a regex that stopped matching, or a check placed
 * after an early return, would look exactly like a clean build. This script corrupts a real build in
 * a scratch tree — one defect at a time — and asserts that validate reports the specific error.
 *
 * It runs in-process in a temp directory (`paths` is rooted at `process.cwd()`), so it needs no
 * network and no model, and it leaves the real working tree untouched.
 *
 * Usage: `bun run src/e2e/validate-negative.ts`
 */
import { join } from "node:path";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { log } from "../util/log.ts";

const REPO = process.cwd();
const SOURCE_ID = "lumen-ds";
const SKILL = "lumen-ds";

/** One defect: mutate a pristine build, then assert validate says something specific about it. */
interface Case {
  name: string;
  /** Mutate the scratch tree. */
  break: (dir: string) => Promise<void>;
  /** Substring the resulting error message must contain. */
  expect: string;
  /** Whether the finding must be an error (default) or may be a warning. */
  level?: "error" | "warn";
}

const CASES: Case[] = [
  {
    name: "IR page missing entirely",
    break: async (d) => rm(join(d, "ir", SOURCE_ID, "pages"), { recursive: true, force: true }),
    expect: "no IR pages",
  },
  {
    name: "rule scoped to a platform but carrying none",
    break: async (d) => mutateRule(d, "buttons", (r) => ({ ...r, scope: "page", platforms: [] })),
    expect: 'scope "page" but no platforms',
  },
  {
    name: "rule marked general yet carrying platforms",
    break: async (d) => mutateRule(d, "buttons", (r) => ({ ...r, scope: "general", platforms: ["web"] })),
    expect: 'scope "general" but platforms',
  },
  {
    name: "unknown platform on a rule",
    break: async (d) => mutateRule(d, "buttons", (r) => ({ ...r, scope: "section", platforms: ["fridgeOS"] })),
    expect: "unknown platform fridgeOS",
  },
  {
    name: "provenance url outside the source",
    break: async (d) =>
      mutateRule(d, "buttons", (r) => ({ ...r, provenance: { ...r.provenance, url: "https://evil.example/x" } })),
    expect: "provenance url outside source",
  },
  {
    name: "provenance hash disagrees with the page hash",
    break: async (d) =>
      mutateRule(d, "buttons", (r) => ({ ...r, provenance: { ...r.provenance, source_hash: "0000000000000000" } })),
    expect: "provenance hash != page hash",
  },
  {
    name: "duplicate rule id across pages",
    break: async (d) => {
      const a = await readIR(d, "buttons");
      await mutateRule(d, "color", (r) => ({ ...r, id: a.rules[0].id }));
    },
    expect: "duplicate rule id",
  },
  {
    name: "metadata value emitted as a YAML number, not a string",
    break: async (d) => patchSkill(d, (s) => s.replace(/ {2}rules: "(\d+)"/, "  rules: $1")),
    expect: "metadata values must be strings",
  },
  {
    name: "frontmatter name disagrees with the manifest",
    break: async (d) => patchSkill(d, (s) => s.replace(/^name: .*$/m, "name: something-else")),
    expect: "!= skill.name",
  },
  {
    name: "frontmatter block removed",
    break: async (d) => patchSkill(d, (s) => s.replace(/^---\n[\s\S]*?\n---\n/, "")),
    expect: "no YAML frontmatter block",
  },
  {
    name: "frontmatter is not valid YAML",
    break: async (d) => patchSkill(d, (s) => s.replace(/^metadata:$/m, "metadata: [unclosed")),
    expect: "frontmatter",
  },
  {
    name: "SKILL.md over its line budget",
    break: async (d) => patchSkill(d, (s) => s + "\n".repeat(500)),
    expect: "budget",
  },
  {
    name: "SKILL.md links a reference that does not exist",
    break: async (d) => patchSkill(d, (s) => s + "\n[gone](references/components/gone.md)\n"),
    expect: "broken reference link",
  },
  {
    name: "SKILL.md missing",
    break: async (d) => rm(join(d, "skills", SKILL, "SKILL.md")),
    expect: "SKILL.md missing",
  },
  {
    name: "reference file with no IR page behind it",
    break: async (d) => writeFile(join(d, "skills", SKILL, "references", "components", "ghost.md"), "# Ghost\n"),
    expect: "has no IR page",
  },
  {
    name: "provenance.json missing",
    break: async (d) => rm(join(d, "skills", SKILL, "provenance.json")),
    expect: "provenance.json missing",
    level: "warn",
  },
  {
    name: "an IR page unreachable from SKILL.md or index.md",
    break: async (d) => patchSkill(d, (s) => s.replace(/\[[^\]]*\]\(references\/foundations\/color\.md\)/g, "(removed)")),
    expect: "not reachable",
    level: "warn",
  },
  {
    name: "non-redistributable output left un-ignored",
    // The scratch tree has no .gitignore entry for lumen-ds, so flipping the flag must trip the gate.
    break: async (d) => patchManifest(d, (s) => s.replace("redistributable: true", "redistributable: false")),
    expect: "not git-ignored",
  },
];

async function readIR(dir: string, page: string): Promise<any> {
  return JSON.parse(await readFile(join(dir, "ir", SOURCE_ID, "pages", `${page}.json`), "utf8"));
}

/** Replace the first rule of a page via `fn`. */
async function mutateRule(dir: string, page: string, fn: (r: any) => any): Promise<void> {
  const p = join(dir, "ir", SOURCE_ID, "pages", `${page}.json`);
  const ir = JSON.parse(await readFile(p, "utf8"));
  ir.rules[0] = fn(ir.rules[0]);
  await writeFile(p, JSON.stringify(ir, null, 2));
}

async function patchSkill(dir: string, fn: (s: string) => string): Promise<void> {
  const p = join(dir, "skills", SKILL, "SKILL.md");
  await writeFile(p, fn(await readFile(p, "utf8")));
}

async function patchManifest(dir: string, fn: (s: string) => string): Promise<void> {
  const p = join(dir, "sources", `${SOURCE_ID}.yaml`);
  await writeFile(p, fn(await readFile(p, "utf8")));
}

/** Copy the pristine build into a scratch tree that is a git repo but ignores nothing. */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ds-validate-neg-"));
  for (const sub of [["sources"], ["ir", SOURCE_ID], ["skills", SKILL]]) {
    await mkdir(join(dir, ...sub.slice(0, -1)), { recursive: true });
    await cp(join(REPO, ...sub), join(dir, ...sub), { recursive: true });
  }
  // git init so the license gate has a repo to ask; nothing is ignored here by design.
  Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
  return dir;
}

/**
 * Run validate with the scratch tree as the working directory.
 *
 * It has to be a subprocess. `util/fs.ts` evaluates `ROOT = process.cwd()` once at module load, so
 * `process.chdir()` plus a cache-busted re-import does not move it — the first attempt at this did
 * exactly that and every case reported "no IR pages", which is the scratch tree being read from the
 * wrong root rather than a guard firing. A fresh process is the only honest isolation.
 */
async function runValidate(dir: string): Promise<{ level: string; where: string; message: string }[]> {
  const runner = join(REPO, "src", "e2e", "validate-once.ts");
  const proc = Bun.spawn(["bun", "run", runner, SOURCE_ID], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if ((await proc.exited) !== 0) throw new Error(`validate runner failed: ${err.slice(0, 300)}`);
  return JSON.parse(out) as { level: string; where: string; message: string }[];
}

// Baseline: the pristine build must be clean, or every case below is meaningless.
const base = await scratch();
const baseFindings = await runValidate(base);
const baseErrors = baseFindings.filter((f) => f.level === "error");
await rm(base, { recursive: true, force: true });
if (baseErrors.length) {
  for (const f of baseErrors) console.log(`  ✗ ${f.where}: ${f.message}`);
  throw new Error("baseline build does not validate cleanly in a scratch tree");
}
log.info(`baseline clean (${baseFindings.length} findings, 0 errors)`);

let failed = 0;
for (const c of CASES) {
  const dir = await scratch();
  try {
    await c.break(dir);
    const findings = await runValidate(dir);
    const want = c.level ?? "error";
    const hit = findings.find((f) => f.level === want && f.message.includes(c.expect));
    if (hit) {
      console.log(`✓ ${c.name}\n    → ${hit.level}: ${hit.message.slice(0, 110)}`);
    } else {
      failed++;
      console.log(`✗ ${c.name}\n    expected a ${want} containing "${c.expect}"`);
      for (const f of findings.slice(0, 4)) console.log(`    got ${f.level}: ${f.message.slice(0, 110)}`);
      if (!findings.length) console.log("    got nothing at all");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (failed) {
  log.warn(`${failed}/${CASES.length} guards did not fire`);
  process.exit(1);
}
log.info(`all ${CASES.length} validate guards fire on a real corrupted build`);
