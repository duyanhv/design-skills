#!/usr/bin/env bun
/**
 * Probes for AUDIT findings A4 (authority of the severity badge) and A5 (the entry file's workflow).
 *
 * Both findings are about what an agent is *told to do*, so a regex that matches the classifier's
 * own vocabulary would prove nothing — it would only restate that `severity.ts` produced a badge.
 * Instead these checks read the shipped entry file, derive from it the permissions a reader would
 * actually have, and run two small fixtures through that derivation:
 *
 *   - a recommendation that carries a MUST badge only because of its wording ("Avoid displaying
 *     text that introduces a help button") must not come out as a formal requirement violation;
 *   - an explicit prohibition ("Don't assign the primary role to a button that performs a
 *     destructive action") must still come out as a supported finding;
 *   - a review of a small glyph inside a large hit region, and of behaviour inherited from a
 *     framework component, must come out as "inspect first", not as a defect.
 *
 * The derivation deliberately reads the *instructions*, not the compiler: delete the sentence that
 * grants a permission and the fixture changes its answer, which is what the negative CASES assert.
 *
 * Standalone: `bun run src/e2e/probes/authority-workflow.ts` (needs apple-hig and wcag22 built).
 */
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

// Local copies of the interfaces in ../trace.ts and ../trace-negative.ts, so this file is runnable
// and type-checkable on its own. The coordinator wires the exports into those runners.
export interface Check {
  finding: string;
  requirement: string;
  observe: () => Promise<string>;
}
export interface Case {
  finding: string;
  name: string;
  break: (dir: string) => Promise<void>;
}

const entryPath = (root: string, skill: string) => join(root, "skills", skill, "SKILL.md");
const entry = (skill: string, root = process.cwd()) => readFile(entryPath(root, skill), "utf8");

/** A rule as a reviewer meets it: the badge it carries and the source sentence behind the badge. */
interface Fixture {
  id: string;
  badge: "MUST" | "SHOULD" | "MAY";
  /** The source's own sentence, quoted from the shipped reference. */
  statement: string;
}

/**
 * What the entry file permits, read off the entry file itself.
 *
 * `enforceBadge` — may a MUST badge be reported as a requirement violation on its own?
 * `needsSourceWording` — must the reader quote a prohibition or absolute from the cited text first?
 */
function permissions(doc: string) {
  const apply = /^4\. \*\*Apply\*\*.*$/m.exec(doc)?.[0] ?? "";
  return {
    enforceBadge: /\*\*MUST\*\* rules as hard constraints/.test(apply),
    needsSourceWording: /quote the prohibition or absolute it rests on/.test(doc),
  };
}

/**
 * Would a reader following this entry file report `f` as a formal requirement violation?
 *
 * Nothing here consults `src/extract/severity.ts`: the prohibition test is written independently,
 * over the source sentence, precisely so that agreeing with the classifier is not what passes.
 */
function reportsAsRequirement(doc: string, f: Fixture): boolean {
  const p = permissions(doc);
  if (f.badge !== "MUST") return false;
  if (p.enforceBadge) return true; // the badge alone is treated as authority
  if (!p.needsSourceWording) return true; // nothing stops the reader doing the same
  return /\b(don['\u2019]t|do not|never|must not|must|cannot|can['\u2019]t|is required)\b/i.test(f.statement);
}

/**
 * Does the workflow section demand a thing, whatever words it uses?
 *
 * Each concept is a set of alternatives, and a demand is met when every concept it names appears.
 * The first version of this file matched the exact sentences that had just been written, which made
 * it a fixture-text guard rather than a requirement guard: rewording
 * "how this codebase already builds this kind of element" to "the conventions this codebase already
 * uses for this kind of element" failed the check while satisfying the requirement entirely.
 *
 * These still cannot prove an *agent* behaves correctly — only the agent evaluation does that — but
 * they do survive an edit that keeps the meaning, and they fail on one that drops it.
 */
const has = (doc: string, ...concepts: RegExp[][]): boolean =>
  concepts.every((alts) => alts.some((re) => re.test(doc)));

/** Only the authored section: a word elsewhere in the entry file does not satisfy a demand of it. */
function workflow(doc: string): string {
  const at = doc.search(/^## Working method$/m);
  if (at < 0) return "";
  const rest = doc.slice(at + 1);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

const TARGET = [/platform/i, /conformance target/i, /version it is for/i];
const CODEBASE = [/this codebase/i, /existing (?:component|convention)/i, /already (?:builds|uses)/i];
const SHARED = [/shared component/i, /theme/i, /local override/i];
const IMPLEMENT = [/implement/i, /apply the (?:decision|rule)/i];
const STATES = [/pressed/i, /focused/i, /disabled/i, /empty and error/i];
const LOCATE = [/code or control/i, /which (?:file|component|control)/i, /name the (?:code|control|component)/i];
const SCOPE = [/scope and exceptions/i, /rule's scope/i, /exceptions cover/i];
const FIX = [/give the fix/i, /propose a fix/i, /the fix and the check/i];
const UNVERIFIED = [/unverified/i, /could not run/i, /did not run/i];
const RUNTIME = [/needs a run/i, /behaviour over time/i, /at runtime/i];

const REVIEW_FIXTURES = [
  {
    name: "a 16pt glyph centred in a 44pt tappable frame",
    /** The entry must tell the reader that the drawn glyph is not the hit region. */
    permitted: (doc: string) => has(workflow(doc), [/hit (?:region|target|area)/i], [/glyph/i, /icon/i, /drawn inside/i]),
  },
  {
    name: "a framework component whose focus behaviour is inherited, not written locally",
    permitted: (doc: string) => has(workflow(doc), [/inherit/i], [/standard component/i, /framework/i, /system/i]),
  },
];

/** Demands finding A5 makes of the authored workflow, each phrased as a question about the doc. */
const WORKFLOW_DEMANDS: { demand: string; met: (doc: string) => boolean }[] = [
  // "the target" is platform-and-version for a platform source and the conformance level for WCAG,
  // which is the composer's deliberate substitution — the demand is that the target is named at all.
  { demand: "identify the target, framework and existing conventions before deciding", met: (d) => has(workflow(d), TARGET, [/framework/i], CODEBASE, SHARED) },
  { demand: "implement in context, then inspect the states the change reaches", met: (d) => has(workflow(d), IMPLEMENT, STATES) },
  { demand: "a review connects a defect to code, scope and exceptions, and proposes fix + check", met: (d) => has(workflow(d), LOCATE, SCOPE, FIX) },
  { demand: "runtime-only checks are marked unverified when nothing was run", met: (d) => has(workflow(d), UNVERIFIED, RUNTIME) },
];

export const CHECKS: Check[] = [
  {
    finding: "A4",
    requirement: "A wording-derived MUST badge is not sufficient to allege a requirement violation, while an explicit prohibition still is",
    observe: async () => {
      const doc = await entry("apple-hig");
      // Both fixtures are real shipped Apple rules carrying the same MUST badge.
      const advisory: Fixture = { id: "apple-hig/buttons/027", badge: "MUST", statement: "Avoid displaying text that introduces a help button." };
      const prohibition: Fixture = { id: "apple-hig/buttons/014", badge: "MUST", statement: "Don’t assign the primary role to a button that performs a destructive action, even if that action is the most likely choice." };
      const ref = await readFile(join(process.cwd(), "skills", "apple-hig", "references", "components", "buttons.md"), "utf8");
      for (const f of [advisory, prohibition]) {
        if (!ref.includes(f.statement)) throw new Error(`fixture has moved: ${f.id} no longer states "${f.statement.slice(0, 40)}…"`);
        if (!new RegExp(`\\*\\*MUST\\*\\*[^\\n]*\`${f.id}\``).test(ref)) throw new Error(`fixture has moved: ${f.id} no longer carries a MUST badge`);
      }
      if (reportsAsRequirement(doc, advisory)) throw new Error(`${advisory.id} is advice, but the entry file lets its badge alone carry a requirement violation`);
      if (!reportsAsRequirement(doc, prohibition)) throw new Error(`${prohibition.id} states an explicit prohibition but the entry file does not support reporting it`);
      return `both rules ship as MUST; following SKILL.md the prohibition is reportable and the recommendation is not`;
    },
  },
  {
    finding: "A4",
    requirement: "Authority is a per-source property: a source that declares normative status still enforces its badge",
    observe: async () => {
      const wcag = await entry("wcag22");
      const apple = await entry("apple-hig");
      if (!permissions(wcag).enforceBadge) throw new Error("WCAG criteria are normative text; its entry no longer applies MUST as a hard constraint");
      if (permissions(apple).enforceBadge) throw new Error("the Apple entry enforces a wording-derived badge as a hard constraint");
      if (/Severity is inferred from that wording, not declared by WCAG/.test(wcag)) throw new Error("the WCAG entry still claims its severity is inferred from wording");
      return `wcag22 enforces its declared badge; apple-hig ranks wording and requires the source's own prohibition`;
    },
  },
  {
    finding: "A5",
    requirement: "The entry file carries an authored workflow around the rulebook, marked as authored",
    observe: async () => {
      const out: string[] = [];
      for (const skill of ["apple-hig", "wcag22", "lumen-ds"]) {
        const doc = await entry(skill);
        if (!/^## Working method$/m.test(doc)) throw new Error(`${skill}: no authored workflow section`);
        if (!/_Written for this skill, not by /.test(doc)) throw new Error(`${skill}: the authored workflow is not marked as authored, so it reads as the source's text`);
        const unmet = WORKFLOW_DEMANDS.filter((d) => !d.met(doc)).map((d) => d.demand);
        if (unmet.length) throw new Error(`${skill}: workflow does not require: ${unmet.join("; ")}`);
        out.push(`${skill} ${WORKFLOW_DEMANDS.length}/${WORKFLOW_DEMANDS.length}`);
      }
      return `${out.join(", ")} workflow demands met, each marked as authored`;
    },
  },
  {
    finding: "A5",
    requirement: "A review following the entry file inspects inherited and geometric relationships instead of reporting them",
    observe: async () => {
      const doc = await entry("apple-hig");
      const unsupported = REVIEW_FIXTURES.filter((f) => !f.permitted(doc)).map((f) => f.name);
      if (unsupported.length) throw new Error(`the workflow gives a reviewer nothing to stop a false finding on: ${unsupported.join("; ")}`);
      return `${REVIEW_FIXTURES.length}/${REVIEW_FIXTURES.length} review fixtures are answered by the shipped workflow`;
    },
  },
];

const editEntry = async (dir: string, skill: string, fn: (s: string) => string) => {
  const p = entryPath(dir, skill);
  const before = await readFile(p, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`the defect did not change skills/${skill}/SKILL.md; the fixture text has moved`);
  await writeFile(p, after);
};

export const CASES: Case[] = [
  {
    finding: "A4",
    name: "the Apple entry tells the agent to enforce MUST badges as hard constraints",
    break: (d) => editEntry(d, "apple-hig", (s) =>
      s.replace(/^4\. \*\*Apply\*\*.*$/m, "4. **Apply** **MUST** rules as hard constraints, **SHOULD** as defaults you deviate from only with a reason, **MAY** as options."),
    ),
  },
  {
    finding: "A4",
    name: "the instruction to establish authority from the source is dropped",
    break: (d) => editEntry(d, "apple-hig", (s) => s.replace(/ Before reporting anything as a requirement violation[^]*?rests on\./, "")),
  },
  {
    finding: "A4",
    name: "WCAG stops applying its declared criteria as requirements",
    break: (d) => editEntry(d, "wcag22", (s) =>
      s.replace(/^4\. \*\*Apply\*\*.*$/m, "4. **Apply** **MUST** as the source's firmest wording (a prohibition or an absolute)."),
    ),
  },
  {
    finding: "A5",
    name: "the authored workflow is removed from the entry file",
    break: (d) => editEntry(d, "apple-hig", (s) => s.replace(/\n## Working method\n[^]*?\n\n\*\*Platform tags/, "\n\n**Platform tags")),
  },
  {
    finding: "A5",
    name: "the workflow no longer asks for the states a change reaches",
    break: (d) => editEntry(d, "apple-hig", (s) => s.replace(/, then inspect the states the change can reach[^]*?layout allows\./, ".")),
  },
  {
    finding: "A5",
    name: "the workflow stops distinguishing what was run from what was only read",
    break: (d) => editEntry(d, "apple-hig", (s) => s.replace(/Mark what you could not run as unverified instead of asserting it\./, "")),
  },
  {
    finding: "A5",
    name: "the workflow drops the inherited-behaviour and hit-region checks a reviewer needs",
    break: (d) => editEntry(d, "apple-hig", (s) =>
      s.replace(/, and check what the framework already supplies[^]*?is not a defect/, ""),
    ),
  },
];

// Standalone runner: the positive checks against the real artifacts, then every negative case
// against a scratch copy of the entry files.
if (import.meta.main) {
  const { cp, mkdir, mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { existsSync } = await import("node:fs");

  if (!["apple-hig", "wcag22", "lumen-ds"].every((s) => existsSync(entryPath(process.cwd(), s)))) {
    console.log("skipped: build apple-hig, wcag22 and the example first");
    process.exit(0);
  }

  let failed = 0;
  for (const c of CHECKS) {
    try {
      console.log(`✓ finding ${c.finding} — ${c.requirement}\n    observed: ${await c.observe()}`);
    } catch (e) {
      failed++;
      console.log(`✗ finding ${c.finding} — ${c.requirement}\n    ${(e as Error).message}`);
    }
  }

  /** Run the checks with `dir` as the working directory, and report which findings failed. */
  const runIn = async (dir: string): Promise<string[]> => {
    const proc = Bun.spawn(["bun", "run", import.meta.path], { cwd: dir, stdout: "pipe", stderr: "pipe", env: { ...process.env, DS_PROBE_CHECKS_ONLY: "1" } });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return [...out.matchAll(/^✗ finding (.+?) —/gm)].map((m) => m[1]!);
  };

  if (!process.env.DS_PROBE_CHECKS_ONLY) {
    for (const c of CASES) {
      const dir = await mkdtemp(join(tmpdir(), "ds-authority-"));
      try {
        for (const s of ["apple-hig", "wcag22", "lumen-ds"]) {
          await mkdir(join(dir, "skills", s, "references", "components"), { recursive: true });
          await cp(entryPath(process.cwd(), s), entryPath(dir, s));
        }
        await cp(
          join(process.cwd(), "skills", "apple-hig", "references", "components", "buttons.md"),
          join(dir, "skills", "apple-hig", "references", "components", "buttons.md"),
        );
        await c.break(dir);
        const failures = await runIn(dir);
        if (failures.includes(c.finding)) console.log(`✓ ${c.name}\n    → finding ${c.finding} failed, as it must`);
        else {
          failed++;
          console.log(`✗ ${c.name}\n    → finding ${c.finding} still passed; it does not guard this`);
        }
      } catch (e) {
        failed++;
        console.log(`✗ ${c.name}\n    → fixture error: ${(e as Error).message}`);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  }

  if (failed) {
    console.log(`${failed} probe(s) failed`);
    process.exit(1);
  }
  if (!process.env.DS_PROBE_CHECKS_ONLY) console.log(`${CHECKS.length} checks and ${CASES.length} defects verified`);
}
