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
import { probeCases } from "./probes/index.ts";
import type { Case } from "./probes/types.ts";
import { log } from "../util/log.ts";

const REPO = process.cwd();

interface LegacyCase {
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

const CASES: LegacyCase[] = [
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
  {
    finding: "O-6 / O-10",
    name: "a topic dropped from the entry file's index",
    break: async (d) =>
      editRef(d, "apple-hig/SKILL.md", (s) => s.replace(" · [Watch faces](references/components/watch-faces.md)", "")),
  },
  {
    finding: "O-6 / O-10",
    name: "the routing table cut back to a handful of rows",
    break: async (d) =>
      editRef(d, "apple-hig/SKILL.md", (s) => {
        const start = s.indexOf("| icons, images, symbols, app icon");
        const end = s.indexOf("\n## Index");
        if (start < 0 || end < 0) throw new Error("the routing table is not where this fixture expects it");
        return s.slice(0, start) + "\n" + s.slice(end);
      }),
  },
  {
    finding: "O-6 / O-10",
    name: "a long reference with its table of contents removed",
    break: async (d) =>
      editRef(d, "apple-hig/references/components/widgets.md", (s) => s.replace(/## Contents\n\n(?:- \[[^\n]*\n)+\n/, "")),
  },
  {
    // The exact revert that went unnoticed: flipping the manifest back to `Why` left every other
    // check green, including all 17 trace requirements and 13/13 evals.
    finding: "O-7",
    name: "rationales relabelled back to Why",
    break: async (d) =>
      editRef(d, "apple-hig/references/components/buttons.md", (s) => s.replace(/^(\s+)- Details: /gm, "$1- Why: ")),
  },
  {
    finding: "O-7",
    name: "the workflow sending the reader to the notes for exceptions",
    break: async (d) =>
      editRef(d, "apple-hig/SKILL.md", (s) =>
        s.replace(/Exceptions and caveats appear in either[^.]*\./, "The notes hold the exceptions."),
      ),
  },
  {
    finding: "O-9",
    name: "a purpose clause promoting a suggestion to MUST",
    break: async (d) => editIR(d, "apple-hig", "toolbars", (ir) => {
      const r = ir.rules.find((x: any) => x.statement.includes("to avoid overcrowding"));
      if (!r) throw new Error("no purpose-clause rule on the Toolbars page; update this fixture");
      r.severity = "must";
    }),
  },
  {
    finding: "O-9",
    name: "a third-party modal making a recommendation optional",
    break: async (d) => editIR(d, "apple-hig", "homekit", (ir) => {
      const r = ir.rules.find((x: any) => x.statement.includes("people can have more than one home"));
      if (!r) throw new Error("the 'more than one home' rule is not on this page; update this fixture");
      r.severity = "may";
    }),
  },
  {
    finding: "O-11",
    name: "two rules sharing one id",
    break: async (d) => editIR(d, "apple-hig", "buttons", (ir) => {
      ir.rules[1].id = ir.rules[0].id;
    }),
  },
  {
    finding: "O-11",
    name: "an id that does not name its own page",
    break: async (d) => editIR(d, "apple-hig", "buttons", (ir) => {
      ir.rules[0].id = "apple-hig/alerts/001";
    }),
  },
  {
    // The defect itself: a page stating one sentence twice, with the pair's ids swapped so that
    // re-extraction moves them. This is what shipped before the fix, and nothing noticed.
    finding: "O-11",
    name: "a repeated statement whose ids drift on re-extract",
    break: async (d) => editIR(d, "apple-hig", "buttons", (ir) => {
      const a = ir.rules[0], b = ir.rules[1];
      b.statement = a.statement; // now a duplicate…
      const t = a.id; a.id = b.id; b.id = t; // …whose ids are in the wrong order
    }),
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

// Defects for findings A1–A7 ship beside the checks they trip, in `probes/`.
const ALL: Case[] = [...CASES, ...(await probeCases())];

let failed = 0;
for (const c of ALL) {
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
  log.warn(`${failed}/${ALL.length} defects go unnoticed by trace`);
  process.exit(1);
}
log.info(`all ${ALL.length} defects are caught by the trace check that claims to guard them`);
