import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkPilotClaims, markdownTables, resultColumn, EXPECTED_VARIANTS,
} from "../src/e2e/pilot-claims.ts";

/**
 * Regression tests for the React Native pilot's claim checks.
 *
 * These exist because of a specific criticism, and it was right: four rounds of audits found
 * defects in these checks, every one was fixed by hand and verified by a manual probe, and not one
 * of them left a committed test behind. So the next round rediscovered the same shape of hole in a
 * new place. A check that has never been seen to fail is a guess; a check whose failure was seen
 * once and not recorded is a guess again by the next commit.
 *
 * Every mutation below was performed by an auditor against the real CLI and passed at the time.
 *
 * The inputs are the repository's own committed files, mutated per test. Using the real documents
 * rather than fixtures means these tests also fail if the published numbers and the harness output
 * drift apart, which is the thing the checks are for.
 */
const ROOT = join(import.meta.dir, "..");
const real = {
  resultsTsv: readFileSync(join(ROOT, "examples/react-native-pilot/harness/results.tsv"), "utf8"),
  pilotReadme: readFileSync(join(ROOT, "examples/react-native-pilot/README.md"), "utf8"),
  frameworkReference: readFileSync(
    join(ROOT, "guidance/apple-design/references/frameworks/react-native.md"), "utf8"),
};

const messages = (docs: Partial<typeof real>) =>
  checkPilotClaims({ ...real, ...docs }).problems.map((p) => p.message).join("\n");

test("the committed pilot passes its own checks", () => {
  const { problems, passes } = checkPilotClaims(real);
  expect(problems).toEqual([]);
  expect(passes.length).toBeGreaterThan(0);
});

// ---- Round 3: a figure attached to the wrong variant ----

test("swapping two variants' published percentages fails", () => {
  const swap = (text: string) =>
    text.replace(/53\.41%/g, "@@X@@").replace(/51\.58%/g, "53.41%").replace(/@@X@@/g, "51.58%");
  const problems = messages({
    pilotReadme: swap(real.pilotReadme),
    frameworkReference: swap(real.frameworkReference),
  });
  expect(problems).toContain("D-no-scaling");
  expect(problems).toContain("E-dynamic-type-ramp");
});

test("deleting a variant's row fails, even though the remaining rows are all correct", () => {
  const withoutC = real.resultsTsv.split("\n").filter((l) => !l.startsWith("C-inline-cap")).join("\n");
  expect(messages({ resultsTsv: withoutC })).toContain("missing variant(s): C-inline-cap");
});

test("deleting the baseline row fails", () => {
  // The baseline carries no measurement, so a presence check built from the measured rows cannot
  // see it. An audit deleted it and the checker reported all seven present.
  const withoutA = real.resultsTsv.split("\n").filter((l) => !l.startsWith("A-uncapped")).join("\n");
  expect(messages({ resultsTsv: withoutA })).toContain("missing variant(s): A-uncapped");
});

// ---- Round 4: counts, denominators, and contradictions ----

test("a zero denominator is not evidence of equality", () => {
  // "0 of 0 pixels" was reported as a pass. It compares nothing.
  const zeroed = real.resultsTsv.replace("\t0\t2993292", "\t0\t0");
  expect(messages({ resultsTsv: zeroed })).toContain('B-max-multiplier reports a total of "0"');
});

test("one differing pixel is not zero, however it rounds", () => {
  const onePixel = real.resultsTsv.replace("\t0\t2993292", "\t1\t2993292");
  expect(messages({ resultsTsv: onePixel })).toContain("differs from the baseline by 1 pixel(s)");
});

test("a percentage that does not follow from its own counts fails", () => {
  const edited = real.resultsTsv.replace("55.26%", "40.00%");
  expect(messages({ resultsTsv: edited })).toContain("is 55.26%");
});

test("variants measured over different frame sizes are not comparable", () => {
  const mixed = real.resultsTsv.replace("\t1654081\t2993292", "\t1654081\t2000000");
  expect(messages({ resultsTsv: mixed })).toContain("different frame sizes");
});

test("a correct paragraph does not excuse an incorrect table row", () => {
  // The prose keeps 53.15%; only the table row is corrupted. A document-wide search passed this.
  const corrupted = real.frameworkReference.replace(
    /\| \*\(control\)\* change the title's text \| 53\.15% \|/,
    "| *(control)* change the title's text | 99.99% |");
  expect(messages({ frameworkReference: corrupted })).toContain("CONTROL-edited-text");
});

// ---- Round 5: this audit ----

test("the correct figure in the notes cell does not excuse a wrong result cell", () => {
  // Row-level containment accepted this: the row does contain "53.15%", in the wrong column.
  const corrupted = real.frameworkReference.replace(
    /\| \*\(control\)\* change the title's text \| 53\.15% \| [^|]*\|/,
    "| *(control)* change the title's text | 99.99% | Previously measured 53.15%. |");
  const problems = messages({ frameworkReference: corrupted });
  expect(problems).toContain('cell for CONTROL-edited-text says "99.99%"');
});

test("a variant present but unmeasured fails: present is not tested", () => {
  const unmeasured = real.resultsTsv.split("\n")
    .map((l) => (l.startsWith("C-inline-cap") ? "C-inline-cap\t-\tmissing\t-\t-" : l)).join("\n");
  const problems = messages({ resultsTsv: unmeasured });
  expect(problems).toContain("C-inline-cap has 0 measured row(s)");
});

test("a duplicated variant row fails: which figure should the documents quote?", () => {
  const duplicated = real.resultsTsv.trimEnd() + "\nC-inline-cap\t99.99%\t\t2000000\t2993292\n";
  expect(messages({ resultsTsv: duplicated })).toContain("C-inline-cap has 2 measured row(s)");
});

test("a measured baseline fails: it cannot differ from itself", () => {
  const measuredBaseline = real.resultsTsv.replace(
    /^A-uncapped\t-\tbaseline\t-\t-$/m, "A-uncapped\t12.00%\tbaseline\t359195\t2993292");
  expect(messages({ resultsTsv: measuredBaseline })).toContain("cannot differ from itself");
});

// ---- The table parser the result-cell check depends on ----

test("markdownTables parses header, rows and raw lines", () => {
  const [table] = markdownTables([
    "prose before",
    "",
    "| Approach | Pixels differing from uncapped | Verdict |",
    "| --- | --- | --- |",
    "| `a` | 1.00% | works |",
    "| `b` | **2.00%** | no |",
    "",
    "prose after",
  ].join("\n"));
  expect(table!.header).toEqual(["Approach", "Pixels differing from uncapped", "Verdict"]);
  expect(table!.rows).toEqual([["`a`", "1.00%", "works"], ["`b`", "**2.00%**", "no"]]);
  expect(resultColumn(table!.header)).toBe(1);
});

test("resultColumn returns -1 for a table with no measured column", () => {
  const [table] = markdownTables("| Need | RN |\n| --- | --- |\n| Role | `accessibilityRole` |");
  expect(resultColumn(table!.header)).toBe(-1);
});

test("emphasis in a result cell is presentation, not a different claim", () => {
  // The pilot bolds its headline zero. "**0.00%**" and "0.00%" are the same number.
  expect(messages({})).toBe("");
  expect(real.pilotReadme).toContain("**0.00%**");
});

test("the expected variant set is the experiment, not whatever the file happens to hold", () => {
  // Named explicitly so a deleted row cannot shrink what gets checked.
  expect(EXPECTED_VARIANTS).toHaveLength(7);
  for (const variant of EXPECTED_VARIANTS) {
    expect(real.resultsTsv).toContain(variant);
  }
});
