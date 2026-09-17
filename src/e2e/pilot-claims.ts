/**
 * The React Native pilot's published percentages, checked against the run that produced them.
 *
 * Split out of example.ts so it can be driven by tests. That split is itself an audit finding: four
 * rounds of defects in these checks were each found by hand and fixed without a committed
 * regression, so the next round had to rediscover them. A check with no test is a check that only
 * ever ran once.
 *
 * Pure: takes the file contents, returns problems. No I/O, no process state.
 */

/**
 * Markdown tables in a document, parsed into header + rows of cells.
 *
 * Needed because "the figure appears somewhere in the row" is not the same as "the result column
 * says the figure". An audit put the right number in the NOTES cell — "| 99.99% | Previously
 * measured 53.15%. |" — and a row-level search accepted it while the table told readers 99.99%.
 * Only the column position distinguishes a result from a remark about one.
 */
export interface MarkdownTable {
  header: string[];
  rows: string[][];
  raw: string[];
}

export function markdownTables(text: string): MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  const lines = text.split("\n");
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const next = lines[i + 1];
    // A header followed by the |---|---| separator: that pair is what makes it a table.
    if (!line.trim().startsWith("|") || !next || !/^\s*\|[\s:|-]+\|\s*$/.test(next)) continue;
    const header = cells(line);
    const rows: string[][] = [];
    const raw: string[] = [];
    let j = i + 2;
    for (; j < lines.length && lines[j]!.trim().startsWith("|"); j++) {
      rows.push(cells(lines[j]!));
      raw.push(lines[j]!);
    }
    tables.push({ header, rows, raw });
    i = j - 1;
  }
  return tables;
}

/**
 * The column holding a measured result, identified from the header rather than assumed to be
 * second. Returns -1 when the table has no such column, which is how a prose table (no figures)
 * is told apart from a results table with the figure in the wrong cell.
 */
export function resultColumn(header: string[]): number {
  return header.findIndex((h) => /pixels differing|differing|measured|result %/i.test(h));
}

/**
 * How each variant is named in prose, so its percentage can be checked against the passage that
 * names it rather than against the whole document.
 */
export const VARIANT_MARKERS: Record<string, RegExp> = {
  "A-uncapped": /uncapped/i,
  "B-max-multiplier": /maxFontSizeMultiplier/,
  "C-inline-cap": /Math\.min/,
  // Narrow on purpose. /control/i also matched "small controls", "control arm", and a paragraph
  // explaining why the control exists while quoting another variant's figure — which the
  // contradiction check then flagged, correctly by its own rules and wrongly in substance. A
  // marker has to identify the variant, not mention its name.
  "CONTROL-edited-text": /control (?:variant|row)|\*\*control:\*\*|title'?s? \*?text\*?/i,
  "D-no-scaling": /allowFontScaling=\{false\}/,
  "E-dynamic-type-ramp": /dynamicTypeRamp/,
  "F-platform-color": /PlatformColor/,
};

/** The seven variants that constitute the experiment. Named, not derived from the file. */
export const EXPECTED_VARIANTS = [
  "A-uncapped", "B-max-multiplier", "C-inline-cap",
  "CONTROL-edited-text", "D-no-scaling", "E-dynamic-type-ramp", "F-platform-color",
];

export interface PilotDocs {
  resultsTsv: string;
  pilotReadme: string;
  frameworkReference: string;
}

export interface PilotCheck {
  problems: { message: string; detail?: string }[];
  passes: string[];
}

export function checkPilotClaims({ resultsTsv, pilotReadme, frameworkReference }: PilotDocs): PilotCheck {
  const problems: { message: string; detail?: string }[] = [];
  const passes: string[] = [];
  const fail = (message: string, detail?: string) => problems.push({ message, detail });
  const pass = (message: string) => passes.push(message);

  // Two views of the file: every row, for completeness, and the measured ones, for the figures.
  // Filtering first and asking "is everything here?" afterwards can only ever answer yes.
  const allRows = resultsTsv.trim().split("\n").slice(1)
    .map((line) => line.split("\t"))
    .filter((cells) => cells.length >= 2 && cells[0]?.trim());
  const rows = allRows.filter((cells) => cells[1] !== "-");

  if (!rows.length) fail("results.tsv has no measured rows");

  // The full variant set, named here rather than derived from the file. Deriving it would let a
  // deleted row silently shrink what gets checked: an audit removed C-inline-cap from results.tsv
  // and everything still passed, because a check over "whatever rows exist" cannot notice a
  // missing one. These seven are the experiment.
  const EXPECTED_VARIANTS = [
    "A-uncapped", "B-max-multiplier", "C-inline-cap",
    "CONTROL-edited-text", "D-no-scaling", "E-dynamic-type-ramp", "F-platform-color",
  ];
  // Checked against the rows the file actually has. Adding the baseline to this set by hand was a
  // way of asserting it exists, which is not the same as it existing: an audit deleted the
  // A-uncapped row and the checker still reported all seven present.
  const present = new Set(allRows.map(([v]) => v));
  const missing = EXPECTED_VARIANTS.filter((v) => !present.has(v));
  if (missing.length) {
    fail(`results.tsv is missing variant(s): ${missing.join(", ")}`,
         "a partial run that looks complete is worse than no run");
  } else pass(`results.tsv carries all ${EXPECTED_VARIANTS.length} variants`);

  // Present is not the same as measured. An audit rewrote C-inline-cap's row to "-  missing  -  -"
  // and the run still reported seven of seven, because the row existed and the measurement filter
  // then dropped it from every figure check. A variant that was not measured is a variant that was
  // not tested, however tidy the file looks.
  //
  // A-uncapped is the one legitimate exception: it IS the baseline, so it has nothing to differ
  // from and carries "-" by construction.
  const BASELINE = "A-uncapped";
  for (const variant of EXPECTED_VARIANTS) {
    const all = allRows.filter(([v]) => v === variant);
    const measured = all.filter((cells) => cells[1] !== "-");
    if (variant === BASELINE) {
      if (measured.length) {
        fail(`${BASELINE} has a measurement (${measured[0]![1]}); it is the baseline and cannot differ from itself`);
      }
      continue;
    }
    if (!all.length) continue;              // already reported as missing above
    if (measured.length !== 1) {
      fail(`${variant} has ${measured.length} measured row(s), expected exactly 1`,
           measured.length === 0
             ? `its row reads "${all[0]!.slice(1).join(" | ")}"; an unmeasured variant is an untested one`
             : "duplicate rows make it ambiguous which figure the documents should quote");
    }
  }

  for (const [variant, value] of rows) {
    const figure = (value ?? "").trim();
    for (const [name, text] of [["pilot README", pilotReadme], ["framework reference", frameworkReference]] as const) {
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
        continue;
      }

      // EVERY passage that names the variant and quotes a percentage must quote the right one.
      //
      // "some passage agrees" was not enough: an audit changed the comparison table's control row
      // to 99.99% and it passed, because a prose paragraph elsewhere still had 53.15%. One correct
      // occurrence cannot excuse an incorrect one — a reader looking at the table is reading the
      // wrong number regardless of what a later paragraph says.
      const PERCENT = /\d+(?:\.\d+)?%/g;
      const contradicting = naming
        .map((unit) => ({ unit, quoted: [...unit.matchAll(PERCENT)].map((m) => m[0]) }))
        .filter(({ quoted }) => quoted.length && !quoted.includes(figure));
      if (contradicting.length) {
        fail(`${name} gives ${variant} a percentage that is not its measured ${figure}`,
             `contradicting passage: ${contradicting[0]!.unit.trim().replace(/\s+/g, " ").slice(0, 160)}`);
        continue;
      }
      if (!naming.some((unit) => unit.includes(figure))) {
        fail(`${name} does not give ${variant} its measured ${figure}`,
             `the passage(s) naming it say: ${naming.map((l) => l.trim().replace(/\s+/g, " ")).join(" | ").slice(0, 200)}`);
        continue;
      }

      // The comparison table is what readers scan, so the RESULT CELL specifically must hold the
      // figure. Checking the row was not enough: an audit moved the correct number into the notes
      // cell and left a wrong one in the result cell, and the row still "contained" 53.15%.
      let tableChecked = false;
      for (const table of markdownTables(text)) {
        const column = resultColumn(table.header);
        if (column < 0) continue;
        for (const [index, cells] of table.rows.entries()) {
          if (!marker.test(table.raw[index] ?? "")) continue;
          tableChecked = true;
          // Emphasis is presentation, not content: "**0.00%**" is the same claim as "0.00%", and
          // the pilot bolds its headline result on purpose.
          const cell = (cells[column] ?? "").replace(/[*_`]/g, "").trim();
          if (cell !== figure) {
            fail(`${name}'s "${table.header[column]}" cell for ${variant} says "${cell.trim()}", not ${figure}`,
                 `row: ${(table.raw[index] ?? "").trim().slice(0, 160)}`);
          }
        }
      }
      pass(`${name} gives ${variant} = ${figure}${tableChecked ? " in its result cell and" : ""} everywhere it names it`);
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
    const total = (capRow[4] ?? "").trim();
    if (!/^\d+$/.test(differing)) {
      fail(`B-max-multiplier has no differing-pixel count (got "${capRow[3]}")`,
           "equality cannot be decided from a rounded percentage; re-run the harness");
    } else if (!/^\d+$/.test(total) || Number(total) <= 0) {
      // "0 of 0" is not evidence of anything, and the checker used to print it as a pass. The
      // denominator is the size of the frame the claim is about, so it has to be real.
      fail(`B-max-multiplier reports a total of "${capRow[4]}"`,
           "zero differing pixels out of zero pixels compares nothing; re-run the harness");
    } else if (differing !== "0") {
      fail(`B-max-multiplier differs from the baseline by ${differing} pixel(s)`,
           `it reports ${capRow[1]}, but the reference's claim that the prop does nothing needs exactly zero`);
    } else {
      pass(`B-max-multiplier differs by exactly 0 of ${total} pixels`);
    }
  }

  // Every measured row's percentage must follow from its own counts, and every row must describe
  // the same frame. A denominator that drifts between rows means the captures were not comparable,
  // and a percentage that does not match its counts means one of the two was edited by hand.
  const denominators = new Set<string>();
  let countsUsable = true;
  for (const cells of rows) {
    const [variant, pct, , differing, total] = cells.map((c) => (c ?? "").trim());
    if (!/^\d+$/.test(differing ?? "") || !/^\d+$/.test(total ?? "") || Number(total) <= 0) {
      fail(`${variant} has no usable pixel counts (${differing} of ${total})`);
      countsUsable = false;
      continue;
    }
    denominators.add(total!);
    const expected = (Number(differing) / Number(total) * 100).toFixed(2);
    if (pct !== `${expected}%`) {
      fail(`${variant} reports ${pct}, but ${differing} of ${total} is ${expected}%`,
           "the percentage and the counts disagree, so one of them was not produced by the run");
    }
  }
  if (denominators.size > 1) {
    fail(`variants were compared over different frame sizes: ${[...denominators].join(", ")}`,
         "percentages over different denominators are not comparable to each other");
  } else if (denominators.size === 1 && countsUsable) {
    pass(`all variants compared over the same ${[...denominators][0]} pixel frame, percentages match their counts`);
  }

  return { problems, passes };
}
