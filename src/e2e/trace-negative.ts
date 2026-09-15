#!/usr/bin/env bun
/**
 * Negative tests for `trace`.
 *
 * `validate-negative.ts` proves every validate guard fires. The trace checks had no equivalent, and
 * a trace check that has never been seen to fail is a guess in exactly the same way: it reads the
 * shipped artifacts, and a passing report is indistinguishable from a check whose regex stopped
 * matching. Two of the AUDIT-OUTPUT fixes were *renderer* changes, so the thing being asserted is a
 * string in a Markdown file — precisely the kind of assertion that rots silently.
 *
 * Each case reintroduces one defect into a scratch copy of the built skills, runs trace against it,
 * and asserts the named check reports a failure. The real `skills/` and `ir/` are never touched.
 *
 * Usage: `bun run src/e2e/trace-negative.ts` — needs apple-hig and wcag22 built locally.
 */
import { join } from "node:path";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { exists, paths } from "../util/fs.ts";
import { log } from "../util/log.ts";

const REPO = process.cwd();

interface Case {
  /** The `finding` string of the trace check this defect must trip. */
  finding: string;
  name: string;
  break: (dir: string) => Promise<void>;
}

const editRef = async (dir: string, rel: string, fn: (s: string) => string) => {
  const p = join(dir, "skills", rel);
  const before = await readFile(p, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`the defect did not change ${rel}; the fixture text has moved`);
  await writeFile(p, after);
};

const editIR = async (dir: string, id: string, page: string, fn: (ir: any) => void) => {
  const p = join(dir, "ir", id, "pages", `${page}.json`);
  const ir = JSON.parse(await readFile(p, "utf8"));
  fn(ir);
  await writeFile(p, JSON.stringify(ir, null, 2) + "\n");
};

const CASES: Case[] = [
  {
    finding: "O-1",
    name: "a reference rendered by an older compose",
    break: async (d) => {
      const p = join(d, "skills", "apple-hig", "provenance.json");
      const prov = JSON.parse(await readFile(p, "utf8"));
      await writeFile(p, JSON.stringify({ ...prov, compose_fingerprint: "0000000000000000" }, null, 2));
    },
  },
  {
    finding: "O-1",
    name: "a source sentence dropped from a reference",
    break: async (d) =>
      editRef(d, "apple-hig/references/components/buttons.md", (s) =>
        s.replace("Without a press state, a button can feel unresponsive", "Without a press state,"),
      ),
  },
  {
    finding: "O-2 / O-3",
    name: "a definition swallowing the paragraph after it",
    break: async (d) =>
      editRef(d, "apple-hig/references/components/buttons.md", (s) =>
        s.replace(
          "- **Destructive.** — The button performs an action that can result in data destruction.",
          "- **Destructive.** — The button performs an action that can result in data destruction. A button’s role can have additional effects on its appearance.",
        ),
      ),
  },
  {
    finding: "O-2 / O-3",
    name: "a term carrying the prose that followed it in the source",
    break: async (d) => editIR(d, "apple-hig", "buttons", (ir) => {
      const term = ir.rules.find((r: any) => r.kind === "term");
      if (!term) throw new Error("no term on the Buttons page to corrupt");
      term.notes = ["A button’s role can have additional effects on its appearance."];
    }),
  },
  {
    finding: "O-2 / O-3",
    name: "a split bold lead left as a term named Consider",
    break: async (d) =>
      editRef(d, "apple-hig/references/patterns/playing-audio.md", (s) =>
        s.replace(/- \*\*MAY\*\* Consider presenting a Now Playing view/, "- **Consider** — presenting a Now Playing view"),
      ),
  },
  {
    finding: "O-4",
    name: "a rule with no source position",
    break: async (d) => editIR(d, "apple-hig", "buttons", (ir) => {
      delete ir.rules[0].order;
    }),
  },
  {
    finding: "O-4",
    name: "the visionOS size table moved after the rules that refer to it",
    break: async (d) =>
      editRef(d, "apple-hig/references/components/buttons.md", (s) => {
        const table = /\n\| Shape \| Mini \(28 pt\)[\s\S]*?\n(?=\n|- )/.exec(s);
        if (!table) throw new Error("the visionOS size table is not where this fixture expects it");
        return s.replace(table[0], "\n") + table[0];
      }),
  },
  {
    finding: "O-5",
    name: "a value badge quoting a figure the rule never states",
    break: async (d) => editIR(d, "apple-hig", "buttons", (ir) => {
      ir.rules.find((r: any) => r.kind === "rule").value = "17 parsecs";
    }),
  },
  {
    finding: "O-5",
    name: "the illustrative badge the audit named, restored",
    break: async (d) => editIR(d, "apple-hig", "game-center", (ir) => {
      const r = ir.rules.find((x: any) => x.id === "apple-hig/game-center/015");
      if (!r) throw new Error("apple-hig/game-center/015 is gone; update this fixture");
      // Put the figure in the rule text too, so only the audit-named check can catch it.
      r.value = "5 minutes";
      r.rationale = `${r.rationale ?? ""} Allow 5 minutes.`;
    }),
  },
  {
    finding: "O-8",
    name: "a cross-reference to a heading that does not exist",
    break: async (d) =>
      editRef(d, "apple-hig/references/components/buttons.md", (s) => `${s}\nSee [color](../foundations/color.md#no-such-heading).\n`),
  },
  {
    finding: "O-8",
    name: "an HTML entity surviving into the glossary",
    break: async (d) =>
      editRef(d, "wcag22/references/glossary/glossary.md", (s) => s.replace("if RsRGB <= 0.04045", "if RsRGB &lt;= 0.04045")),
  },
  {
    finding: "O-8",
    name: "a glossary definition flattened back into one line",
    break: async (d) =>
      editRef(d, "wcag22/references/glossary/glossary.md", (s) =>
        s.replace(/\n {2}- Changes in context include changes of:\n(?: {4}- [^\n]*\n)+/, " Changes in context include changes of: - user agent; - viewport;\n"),
      ),
  },
];

/** A scratch tree holding the built skills and IR, so trace reads the corrupted copy. */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ds-trace-neg-"));
  for (const sub of [["sources"], ["ir", "apple-hig"], ["ir", "wcag22"], ["skills", "apple-hig"], ["skills", "wcag22"]]) {
    await mkdir(join(dir, ...sub.slice(0, -1)), { recursive: true });
    await cp(join(REPO, ...sub), join(dir, ...sub), { recursive: true });
  }
  // `fidelityOf` compares against the normalized cache, so O-1 needs it present.
  await mkdir(join(dir, ".cache"), { recursive: true });
  for (const id of ["apple-hig", "wcag22"]) {
    await cp(join(REPO, ".cache", id), join(dir, ".cache", id), { recursive: true });
  }
  return dir;
}

/**
 * Run trace with the scratch tree as the working directory, and report which findings failed.
 * A subprocess for the same reason `validate-negative` needs one: `paths` is rooted at
 * `process.cwd()` when the module loads, so an in-process run would read the real tree.
 */
async function runTrace(dir: string): Promise<Set<string>> {
  const proc = Bun.spawn(["bun", "run", join(REPO, "src", "e2e", "trace.ts")], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return new Set([...out.matchAll(/^✗ finding (.+?) —/gm)].map((m) => m[1]!));
}

if (!(await exists(paths.irPages("apple-hig"))) || !(await exists(paths.irPages("wcag22")))) {
  log.warn("trace-negative skipped: build apple-hig and wcag22 first");
  process.exit(0);
}

// Baseline: the pristine build must report no failures, or every case below is meaningless.
const base = await scratch();
const baseFailures = await runTrace(base);
await rm(base, { recursive: true, force: true });
if (baseFailures.size) {
  console.log(`  ✗ baseline already fails: ${[...baseFailures].join(", ")}`);
  throw new Error("baseline trace does not pass in a scratch tree");
}
log.info("baseline clean (0 trace failures)");

let failed = 0;
for (const c of CASES) {
  const dir = await scratch();
  try {
    await c.break(dir);
    const failures = await runTrace(dir);
    if (failures.has(c.finding)) {
      console.log(`✓ ${c.name}\n    → finding ${c.finding} failed, as it must`);
    } else {
      failed++;
      console.log(`✗ ${c.name}\n    → finding ${c.finding} still passed; it does not actually guard this${failures.size ? ` (failures: ${[...failures].join(", ")})` : ""}`);
    }
  } catch (e) {
    failed++;
    console.log(`✗ ${c.name}\n    → fixture error: ${(e as Error).message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (failed) {
  log.warn(`${failed}/${CASES.length} defects go unnoticed by trace`);
  process.exit(1);
}
log.info(`all ${CASES.length} defects are caught by the trace check that claims to guard them`);
