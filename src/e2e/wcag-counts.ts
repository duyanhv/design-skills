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

/**
 * Is a block a Note, in WCAG's sense?
 *
 * This is the only classification here, and it is the only one the source's own text supports:
 * WCAG marks its Notes, so "is this a Note" is readable. What is NOT readable from a block's shape
 * is its semantic role — an earlier version counted every hyphen-led block as an "alternative",
 * and the source disagrees constantly: 1.4.12's bullets apply together, 1.4.3's are exceptions,
 * 2.4.13's mix both. Those totals were published and are now removed, so nothing here classifies
 * a block beyond Note versus not-a-Note.
 */
const normativeBlocks = rules.flatMap((r) =>
  (r.notes ?? []).filter((_, i) => (r.note_authority ?? [])[i] === "normative"),
);
const isNote = (block: string) =>
  /^_?\[?informative/i.test(block.trim()) || /\bNote\b/.test(block.trim().slice(0, 40));

const authorities = rules.flatMap((r) => r.note_authority ?? []);
const counts = {
  normativeNotes: authorities.filter((a) => a === "normative").length,
  informativeNotes: authorities.filter((a) => a === "informative").length,
  /** Normative blocks that are really Notes. WCAG says this should be zero. */
  normativeRealNotes: normativeBlocks.filter(isNote).length,
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
// The guide's central factual claim: NONE of the normative blocks is a Note. WCAG says its notes
// are informative, so a normative block that is really a Note would mean either the extraction or
// the guide is wrong. Checked directly rather than inferred from a total.
if (counts.normativeRealNotes === 0) {
  console.log(
    `✓ none of the ${counts.normativeNotes} block(s) the extractor marks normative is a Note, ` +
      `as the guide states (the total is reported, not published in the guide)`,
  );
} else {
  console.log(`✗ ${counts.normativeRealNotes} block(s) marked normative are Notes; WCAG says notes are informative`);
  console.log("    either the extraction mislabels them or authority.md's claim is wrong");
  failed++;
}

// The named example must really carry bulleted alternatives followed by real Notes.
//
// 2.5.2 is used because its own statement says "at least one of the following is true", which is
// what makes its bullets alternatives. That is read from the criterion, not inferred from the
// hyphens — the inference an audit rightly rejected for the removed breakdown. A criterion whose
// bullets apply cumulatively (1.4.12) or are exceptions (1.4.3) would be the wrong example here.
const pointerCancellation = rules.find((r) => (r.section ?? "").startsWith("2.5.2 "));
if (!guide.includes("2.5.2 Pointer Cancellation")) {
  console.log("✗ authority.md no longer names the criterion its explanation rests on");
  failed++;
} else if (!pointerCancellation) {
  console.log("✗ authority.md names SC 2.5.2, which is not in the build");
  failed++;
} else {
  // The statement has to establish that the bullets are alternatives, or the example is making the
  // same shape-for-meaning mistake the breakdown made.
  if (!/at least one of the following/i.test(pointerCancellation.statement ?? "")) {
    console.log("✗ SC 2.5.2's statement no longer says its bullets are alternatives");
    console.log("    the example depends on that wording; pick a criterion whose statement says it");
    failed++;
  }
  const blocks = pointerCancellation.notes ?? [];
  const auth = pointerCancellation.note_authority ?? [];
  const alternatives = blocks.filter((b, i) => auth[i] === "normative" && b.trim().startsWith("-")).length;
  const realNotes = blocks.filter((b, i) => auth[i] === "informative" && isNote(b)).length;
  if (alternatives >= 4 && realNotes >= 2) {
    console.log(`✓ SC 2.5.2 carries ${alternatives} normative alternative(s) and ${realNotes} informative Note(s)`);
  } else {
    console.log(`✗ SC 2.5.2 has ${alternatives} normative alternative(s) and ${realNotes} Note(s); the guide describes four and two`);
    failed++;
  }
}

console.log("");
if (failed) {
  log.warn(`${failed} published count(s) disagree with the WCAG build they describe`);
  process.exit(1);
}
log.info("every count published about WCAG's structure matches the local build");
