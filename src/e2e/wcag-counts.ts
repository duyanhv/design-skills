#!/usr/bin/env bun
/**
 * The accessibility-claims bundle publishes counts about WCAG 2.2's own structure. Recount them.
 *
 * `specs.ts` catches dimensions, ratios and colour literals, because those are the shapes the
 * platform bundles publish. These are a different kind of number — "118 notes are normative",
 * "20 criteria carry both kinds" — and nothing in the repository could check them. A published
 * count with no instrument is the same class of claim as a published measurement with no record,
 * which four audit rounds established is worth catching.
 *
 * So this recounts them from the local WCAG build and fails if the guidance disagrees. The bundle
 * only cites these to make one point — that normative and informative text sit side by side in the
 * same document — so if a future WCAG revision changes the numbers, the point survives and the
 * sentence needs updating. That is exactly what this makes visible.
 *
 * Skips when wcag22 has not been built locally, like `coverage` and `fidelity`, so it is meaningful
 * without a network crawl and silent in CI.
 *
 * Usage: bun run src/e2e/wcag-counts.ts
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, exists } from "../util/fs.ts";
import { log } from "../util/log.ts";

const TASKS = join(ROOT, "guidance", "accessibility-claims", "references", "tasks");
const GUIDE = join(TASKS, "authority.md");
const CRITERIA = join(TASKS, "criteria.md");
const PAGES = join(ROOT, "ir", "wcag22", "pages");

if (!(await exists(PAGES))) {
  log.info("wcag22 is not built locally; skipping the count check (bun run build wcag22)");
  process.exit(0);
}
if (!(await exists(GUIDE))) {
  log.warn("accessibility-claims/authority.md is missing");
  process.exit(1);
}

interface Rule {
  id: string;
  kind?: string;
  section?: string;
  statement?: string;
  notes?: string[];
  conformance_level?: string;
  note_authority?: string[];
}

const rules: Rule[] = [];
for (const file of (await readdir(PAGES)).filter((f) => f.endsWith(".json"))) {
  const page = JSON.parse(await readFile(join(PAGES, file), "utf8")) as { rules?: Rule[] };
  rules.push(...(page.rules ?? []));
}

const authorities = rules.flatMap((r) => r.note_authority ?? []);
const counts = {
  normativeNotes: authorities.filter((a) => a === "normative").length,
  informativeNotes: authorities.filter((a) => a === "informative").length,
  mixedRules: rules.filter(
    (r) => (r.note_authority ?? []).includes("normative") && (r.note_authority ?? []).includes("informative"),
  ).length,
  levelA: rules.filter((r) => r.conformance_level === "A").length,
  levelAA: rules.filter((r) => r.conformance_level === "AA").length,
  levelAAA: rules.filter((r) => r.conformance_level === "AAA").length,
  // A success criterion is a rule with a conformance level; the glossary terms are not criteria.
  criteria: rules.filter((r) => r.kind === "rule").length,
  withException: rules.filter(
    (r) =>
      r.kind === "rule" &&
      // "exceptions" plural included: SC 2.4.11 writes "Exceptions:" as a heading, and a regex
      // that missed it undercounted by one. Caught because the guide already stated 27 and this
      // check said 26 — the disagreement was the checker being wrong, not the prose.
      /\bexcept\b|\bexceptions?\b/i.test([r.statement, ...(r.notes ?? [])].filter(Boolean).join(" ")),
  ).length,
};

const guide = await readFile(GUIDE, "utf8");
const criteriaGuide = (await exists(CRITERIA)) ? await readFile(CRITERIA, "utf8") : "";
let failed = 0;

/** Each published count, with the sentence it appears in, so a failure says what to edit. */
const CLAIMS: { what: string; actual: number; pattern: RegExp; in?: string }[] = [
  {
    what: "criteria stating an exception",
    actual: counts.withException,
    pattern: /\*\*(\d+) of \d+ success criteria state an exception/,
    in: "criteria.md",
  },
  {
    what: "success criteria in total",
    actual: counts.criteria,
    pattern: /\*\*\d+ of (\d+) success criteria state an exception/,
    in: "criteria.md",
  },
  { what: "normative notes", actual: counts.normativeNotes, pattern: /\*\*(\d+) notes are normative/ },
  { what: "informative notes", actual: counts.informativeNotes, pattern: /normative and (\d+) are informative\*\*/ },
  { what: "criteria carrying both kinds", actual: counts.mixedRules, pattern: /\*\*(\d+) criteria carry both kinds/ },
  { what: "Level A criteria", actual: counts.levelA, pattern: /\*\*(\d+) Level A,/ },
  { what: "Level AA criteria", actual: counts.levelAA, pattern: /Level A, (\d+) Level AA,/ },
  { what: "Level AAA criteria", actual: counts.levelAAA, pattern: /and (\d+) Level AAA\*\*/ },
];

for (const claim of CLAIMS) {
  const where = claim.in ?? "authority.md";
  const text = claim.in === "criteria.md" ? criteriaGuide : guide;
  const match = claim.pattern.exec(text);
  if (!match) {
    console.log(`✗ ${where} no longer states a count for ${claim.what}`);
    console.log(`    the check looks for ${claim.pattern}; the build counts ${claim.actual}`);
    failed++;
    continue;
  }
  const published = Number(match[1]);
  if (published !== claim.actual) {
    console.log(`✗ ${where} says ${published} ${claim.what}, the local WCAG build has ${claim.actual}`);
    console.log(`    recount and update the sentence, or the reader is being told something untrue`);
    failed++;
  } else {
    console.log(`✓ ${claim.what}: ${published}`);
  }
}

// The named examples must really be criteria that mix both kinds of note. A stale example would be
// a specific, checkable falsehood sitting inside a correct count.
const mixedSections = rules
  .filter((r) => (r.note_authority ?? []).includes("normative") && (r.note_authority ?? []).includes("informative"))
  .map((r) => r.section ?? "");
// Read the examples OUT OF the guide rather than checking a hard-coded list against it. The first
// version skipped any example the guide no longer named, so replacing a correct example with a
// wrong one passed: the check only ever looked for names it already believed. Whatever criteria the
// sentence names are the ones that have to be true.
// The claim is a bullet, which ends at a blank line rather than a full stop.
const exampleSentence = /carry both kinds of note at once[\s\S]*?\n\n/.exec(guide)?.[0] ?? "";
const namedExamples = [...exampleSentence.matchAll(/\b(\d\.\d\.\d+)\b/g)].map((m) => m[1]!);
if (!namedExamples.length) {
  console.log("✗ authority.md names no example criteria for the mixed-notes claim");
  console.log("    a structural claim with no instance is not checkable by a reader either");
  failed++;
}
for (const criterion of namedExamples) {
  if (mixedSections.some((s) => s.startsWith(`${criterion} `))) {
    console.log(`✓ SC ${criterion} does mix normative and informative notes`);
  } else {
    const exists = rules.some((r) => (r.section ?? "").startsWith(`${criterion} `));
    console.log(`✗ authority.md names SC ${criterion} as mixing both kinds of note; ${exists ? "it does not" : "no such criterion in the build"}`);
    failed++;
  }
}

console.log("");
if (failed) {
  log.warn(`${failed} published count(s) disagree with the WCAG build they describe`);
  process.exit(1);
}
log.info("every count published about WCAG's structure matches the local build");
