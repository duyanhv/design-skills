#!/usr/bin/env bun
/**
 * Do the numbers the README and the example claim still match the artifacts they describe?
 *
 * The worked example makes quantitative claims in four places — the repository README, the example
 * README, `scoring.md`, and `measurements.md` — and every one of them is a number I typed. Three
 * separate audits found figures that disagreed with each other or with the files they summarised: a
 * score counting one item twice, a "14 of 15" left in the checklist beside a correction saying
 * otherwise, a measurement whose instrument was not committed.
 *
 * Prose does not stay consistent on its own, so the invariants are checked here instead:
 *
 *   1. The scoring table's own rows have to add up, and the summary has to agree with the table it
 *      summarises. This is the defect that survived two rounds of correction.
 *   2. Every document quoting a headline figure has to quote the same one.
 *   3. The measurements have to match the committed probe output, not a remembered number.
 *   4. The review and the pre-registered defect list must not have been edited after the fact —
 *      their whole evidential value is that they were written before the result was known.
 *
 * Usage: bun run src/e2e/example.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, exists } from "../util/fs.ts";
import { log } from "../util/log.ts";

const EXAMPLE = join(ROOT, "examples", "apple-design-review");

let failed = 0;
const fail = (msg: string, detail?: string) => {
  console.log(`✗ ${msg}`);
  if (detail) console.log(`    ${detail}`);
  failed++;
};
const pass = (msg: string) => console.log(`✓ ${msg}`);

if (!(await exists(EXAMPLE))) {
  log.info("no worked example present, nothing to check");
  process.exit(0);
}

const read = async (p: string) => readFile(join(EXAMPLE, p), "utf8");
const scoring = await read("scoring.md");
const exampleReadme = await read("README.md");
const measurements = await read("measurements.md");
const repoReadme = await readFile(join(ROOT, "README.md"), "utf8");
const checklist = await readFile(join(ROOT, "docs", "public-output-checklist.md"), "utf8");

// 1. The item-by-item table is the ground truth; the summary must agree with it.
const outcomes = [...scoring.matchAll(/^\| P\d+ \|[^|]*\|([^|]*)\|$/gm)].map((m) => m[1]!.trim());
const found = outcomes.filter((o) => o.startsWith("found")).length;
const dismissed = outcomes.filter((o) => o.includes("wrongly dismissed")).length;
const invalid = outcomes.filter((o) => o.includes("invalid planted item")).length;

if (!outcomes.length) {
  fail("could not read the item-by-item outcome table in scoring.md");
} else {
  pass(`scoring table lists ${outcomes.length} planted items: ${found} found, ${dismissed} dismissed, ${invalid} invalid`);

  const claimedValid = Number(/\| \*\*Valid planted defects\*\* \| \*\*(\d+)\*\* \|/.exec(scoring)?.[1] ?? NaN);
  const claimedFound = Number(/\| Found \| \*\*(\d+)\*\* \|/.exec(scoring)?.[1] ?? NaN);
  const claimedDismissed = Number(/\| Wrongly dismissed \| (\d+)/.exec(scoring)?.[1] ?? NaN);

  if (claimedFound !== found) fail(`scoring summary says ${claimedFound} found, table shows ${found}`);
  else pass(`summary's "found" matches the table (${found})`);

  if (claimedDismissed !== dismissed) fail(`scoring summary says ${claimedDismissed} dismissed, table shows ${dismissed}`);
  else pass(`summary's "wrongly dismissed" matches the table (${dismissed})`);

  // The arithmetic that was wrong twice: valid = found + dismissed, and invalid items are excluded
  // from the denominator rather than charged to either side.
  if (claimedValid !== found + dismissed) {
    fail(`valid (${claimedValid}) should equal found + dismissed (${found + dismissed})`,
         "an invalidated item must leave the denominator, not also be charged as a dismissal");
  } else {
    pass(`valid = found + dismissed (${claimedValid} = ${found} + ${dismissed})`);
  }

  const claimedPlanted = Number(/\| Planted items, as written \| (\d+) \|/.exec(scoring)?.[1] ?? NaN);
  if (claimedPlanted !== outcomes.length) fail(`summary says ${claimedPlanted} planted items, table lists ${outcomes.length}`);
  else if (claimedPlanted - invalid !== claimedValid) {
    fail(`planted (${claimedPlanted}) minus invalid (${invalid}) should equal valid (${claimedValid})`);
  } else {
    pass(`planted - invalid = valid (${claimedPlanted} - ${invalid} = ${claimedValid})`);
  }
}

// 2. Every document quoting the headline score has to quote the same one.
const headline = `${found} of ${found + dismissed}`;
for (const [name, text] of [["README.md", repoReadme], ["examples/.../README.md", exampleReadme], ["checklist", checklist]] as const) {
  const stale = [...text.matchAll(/(\d+) of (\d+) valid planted/g)].filter((m) => `${m[1]} of ${m[2]}` !== headline);
  if (stale.length) fail(`${name} quotes "${stale[0]![1]} of ${stale[0]![2]}", scoring table gives "${headline}"`);
  else pass(`${name} agrees with the scoring table, or does not quote it`);
}

// 3. Measurements must match the committed probe output rather than a remembered figure.
const probeResult = join(EXAMPLE, "probe", "results", "before.txt");
if (!(await exists(probeResult))) {
  fail("probe/results/before.txt is missing", "the headline measurement must ship with its instrument's output");
} else {
  const raw = await readFile(probeResult, "utf8");
  const measured = /touchable region: ([\d.]+) x ([\d.]+) pt/.exec(raw);
  if (!measured) {
    fail("could not parse a touchable region from probe/results/before.txt");
  } else {
    const figure = `${measured[1]} × ${measured[2]} pt`;
    for (const [name, text] of [["measurements.md", measurements], ["example README", exampleReadme], ["README.md", repoReadme], ["scoring.md", scoring]] as const) {
      if (!text.includes(figure)) fail(`${name} does not quote the measured figure ${figure}`);
      else pass(`${name} quotes the probe's measured ${figure}`);
    }
  }
}

/**
 * How each variant is named in prose, so its percentage can be checked against the line that
 * names it rather than against the whole document.
 */
const VARIANT_MARKERS: Record<string, RegExp> = {
  "A-uncapped": /uncapped|baseline/i,
  "B-max-multiplier": /maxFontSizeMultiplier/,
  "C-inline-cap": /Math\.min/,
  "CONTROL-edited-text": /control/i,
  "D-no-scaling": /allowFontScaling=\{false\}/,
  "E-dynamic-type-ramp": /dynamicTypeRamp/,
  "F-platform-color": /PlatformColor/,
};

// 3b. The React Native pilot's percentages must match its harness output.
//
// Same rule as the probe above, added after an audit found the RN numbers were assertions: the app
// was outside the repo, so nothing tied the published figures to a run. Now results.tsv ships with
// the harness and every document quoting a variant has to agree with it. A reproduction changed
// every figure (the status bar was being measured), and this is what would have caught the drift.
const rnResults = join(ROOT, "examples", "react-native-pilot", "harness", "results.tsv");
if (!(await exists(rnResults))) {
  fail("react-native-pilot/harness/results.tsv is missing", "published percentages need the run that produced them");
} else {
  const rows = (await readFile(rnResults, "utf8")).trim().split("\n").slice(1)
    .map((line) => line.split("\t"))
    .filter((cells) => cells.length >= 2 && cells[1] !== "-");
  const rnReadme = await readFile(join(ROOT, "examples", "react-native-pilot", "README.md"), "utf8");
  const rnReference = await readFile(
    join(ROOT, "guidance", "apple-design", "references", "frameworks", "react-native.md"), "utf8");

  if (!rows.length) fail("results.tsv has no measured rows");

  // The full variant set, named here rather than derived from the file. Deriving it would let a
  // deleted row silently shrink what gets checked: an audit removed C-inline-cap from results.tsv
  // and everything still passed, because a check over "whatever rows exist" cannot notice a
  // missing one. These seven are the experiment.
  const EXPECTED_VARIANTS = [
    "A-uncapped", "B-max-multiplier", "C-inline-cap",
    "CONTROL-edited-text", "D-no-scaling", "E-dynamic-type-ramp", "F-platform-color",
  ];
  const present = new Set([...rows.map(([v]) => v), "A-uncapped"]);
  const missing = EXPECTED_VARIANTS.filter((v) => !present.has(v));
  if (missing.length) {
    fail(`results.tsv is missing variant(s): ${missing.join(", ")}`,
         "a partial run that looks complete is worse than no run");
  } else pass(`results.tsv carries all ${EXPECTED_VARIANTS.length} variants`);

  for (const [variant, value] of rows) {
    const figure = (value ?? "").trim();
    for (const [name, text] of [["pilot README", rnReadme], ["framework reference", rnReference]] as const) {
      // The figure must appear ON THE LINE THAT NAMES THIS VARIANT, not anywhere in the document.
      //
      // Searching the whole file was the same class of mistake this repository keeps making: an
      // audit swapped the published dynamicTypeRamp and no-scaling percentages, and both numbers
      // were still somewhere in both documents, so it passed while telling readers the wrong thing
      // about both. A number attached to the wrong variant is exactly the defect that matters.
      const marker = VARIANT_MARKERS[variant!];
      if (!marker) {
        fail(`no prose marker registered for variant ${variant}`,
             "without one, its percentage can only be checked by searching the whole file");
        continue;
      }
      // The unit is the paragraph (or table row): prose wraps, so a figure and the variant that
      // owns it routinely sit on different physical lines. A table row is its own paragraph here
      // because rows are single lines, which keeps the comparison table strict.
      const units = text.split(/\n\s*\n/).flatMap((block) =>
        block.trimStart().startsWith("|") ? block.split("\n") : [block]);
      const naming = units.filter((unit) => marker.test(unit));
      if (!naming.length) {
        fail(`${name} never mentions ${variant} (looked for ${marker})`);
      } else if (!naming.some((unit) => unit.includes(figure))) {
        fail(`${name} does not give ${variant} its measured ${figure}`,
             `the passage(s) naming it say: ${naming.map((l) => l.trim().replace(/\s+/g, " ")).join(" | ").slice(0, 200)}`);
      } else {
        pass(`${name} gives ${variant} = ${figure} in the passage that names it`);
      }
    }
  }

  // The zero is the pilot's load-bearing result, so assert the EXACT PIXEL COUNT rather than the
  // rounded percentage. A single differing pixel in this frame is 0.00004%, which prints as
  // "0.00%": an audit built that fixture and showed the guard could not tell it from identity.
  // The reference says the prop has no effect; that claim needs zero, not nearly zero.
  const capRow = rows.find(([v]) => v === "B-max-multiplier");
  if (!capRow) {
    fail("results.tsv has no B-max-multiplier row; the cap experiment is the pilot's finding");
  } else {
    const differing = (capRow[3] ?? "").trim();
    if (!/^\d+$/.test(differing)) {
      fail(`B-max-multiplier has no differing-pixel count (got "${capRow[3]}")`,
           "equality cannot be decided from a rounded percentage; re-run the harness");
    } else if (differing !== "0") {
      fail(`B-max-multiplier differs from the baseline by ${differing} pixel(s)`,
           `it reports ${capRow[1]}, but the reference's claim that the prop does nothing needs exactly zero`);
    } else {
      pass(`B-max-multiplier differs by exactly 0 of ${capRow[4]} pixels`);
    }
  }
}

// 4. The pre-registered artifacts must not have been edited after the review was scored.
for (const file of ["REVIEW.md", "planted-defects.md"]) {
  const proc = Bun.spawn(["git", "log", "--format=%h %s", "--", `examples/apple-design-review/${file}`], {
    cwd: ROOT, stdout: "pipe", stderr: "ignore",
  });
  const out = (await new Response(proc.stdout).text()).trim().split("\n").filter(Boolean);
  await proc.exited;
  // One commit introduces it. planted-defects.md legitimately gains appended corrections, which are
  // additions after the fact and are labelled as such; REVIEW.md must never change at all.
  if (file === "REVIEW.md" && out.length > 1) {
    fail(`REVIEW.md has ${out.length} commits; it must be published verbatim and never edited`,
         out.map((l) => `      ${l}`).join("\n"));
  } else {
    pass(`${file}: ${out.length} commit(s) touching it`);
  }
}

if (failed) {
  log.warn(`${failed} claim(s) about the worked example do not match its artifacts`);
  process.exit(1);
}
log.info("the worked example's published numbers match its artifacts");
