import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePage, resolveTableCell, sectionText, parsePredicate, admits, intersects } from "../src/e2e/record-source.ts";
import {
  verifyRecord, validateProvenance, verifyIrRecords, deriveConditions,
  measurementsIn, sameMeasurement,
  type MeasurementRecord, type RecordDoc, type IrRule,
} from "../src/e2e/records.ts";

/**
 * Regression tests for measurement-record verification.
 *
 * These exist because an audit defeated the verifier with three mutations and the repository had no
 * committed test that could have noticed. Each mutation below is one of those, plus the controls
 * that stop a verifier which simply rejects everything from passing.
 *
 * Offline: driven against a fixture shaped like Apple's DocC render, with two tables in different
 * sections so cross-table borrowing is reproducible without the network.
 */
const raw = readFileSync(join(import.meta.dir, "fixtures", "records", "accessibility.json"), "utf8");
const page = parsePage(JSON.parse(raw), raw);

const doc: RecordDoc = { topic: "t", source_page: "accessibility", source_anchor: "Mobility", records: [] };

/** A correct record: iOS row of the Mobility table, both columns named. */
const valid = (): MeasurementRecord => ({
  id: "control-size.ios",
  platform: ["iOS", "iPadOS"],
  row: "iOS, iPadOS",
  values: { default: "44x44 pt", minimum: "28x28 pt" },
  columns: { default: "Default control size", minimum: "Minimum control size" },
  // A meaning must name the column it describes, so a swapped mapping cannot hide behind it.
  meaning: {
    default: "The Default control size for this platform.",
    minimum: "The Minimum control size for this platform.",
  },
  conditions: "the interaction region, not the glyph",
});

function check(record: MeasurementRecord, anchor = "Mobility") {
  const problems: string[] = [];
  const ok = verifyRecord(record, doc, page, anchor, (_id, msg) => problems.push(msg));
  return { problems, ok };
}

test("the fixture parses into tables bound to their own sections", () => {
  expect(page.tables).toHaveLength(2);
  expect(page.tables[0]!.anchor).toBe("Vision");
  expect(page.tables[1]!.anchor).toBe("Mobility");
  // The two tables share a column *shape* but not meaning, which is the whole difficulty.
  expect(page.tables[0]!.header).toEqual(["Platform", "Default size", "Minimum size"]);
  expect(page.tables[1]!.header).toEqual(["Platform", "Default control size", "Minimum control size"]);
});

test("a cell resolves through section, row and column", () => {
  expect(resolveTableCell(page, "Mobility", "iOS, iPadOS", "Default control size")).toBe("44x44 pt");
  expect(resolveTableCell(page, "Mobility", "iOS, iPadOS", "Minimum control size")).toBe("28x28 pt");
  expect(resolveTableCell(page, "Vision", "iOS, iPadOS", "Default size")).toBe("17 pt");
  // A column that belongs to the other table must not resolve in this section.
  expect(resolveTableCell(page, "Mobility", "iOS, iPadOS", "Default size")).toBeNull();
  // A row that is not in this table must not resolve.
  expect(resolveTableCell(page, "Mobility", "watchOS", "Default control size")).toBeNull();
});

test("a correct record verifies, and reports one pass per value", async () => {
  const { problems, ok } = check(valid());
  expect(problems).toEqual([]);
  expect(await ok).toBe(2);
});

// ---- The three mutations the audit used. Each passed the previous page-wide implementation. ----

test("swapping default and minimum fails", async () => {
  const record = valid();
  record.values = { default: "28x28 pt", minimum: "44x44 pt" };
  const { problems } = check(record);
  expect(problems.join()).toContain('holds "44x44 pt", but the record says default="28x28 pt"');
});

// A second audit found that v2 checked row and columns but never compared them to the record's own
// platform and meaning labels. Both of these passed it.

test("a platform label that disagrees with the row it selects fails", () => {
  const record = valid();
  // Row and values untouched: only the label lies. The earlier platform test changed both, so it
  // could not have caught this.
  record.platform = ["tvOS"];
  const { problems } = check(record);
  expect(problems.join()).toContain("disagrees with the row it selects");
});

test("swapping values and their column mappings together fails, because meaning names the column", () => {
  const record = valid();
  record.values = { default: "28x28 pt", minimum: "44x44 pt" };
  record.columns = { default: "Minimum control size", minimum: "Default control size" };
  // meaning left as-is, which is what made this invisible to a per-field check.
  const { problems } = check(record);
  expect(problems.join()).toContain("does not name the column it describes");
});

test("attributing one platform's values to another fails", async () => {
  const record = valid();
  record.id = "control-size.tvos";
  record.row = "tvOS";
  record.platform = ["tvOS"];
  // tvOS row actually holds 66x66 / 56x56.
  record.values = { default: "44x44 pt", minimum: "28x28 pt" };
  const { problems } = check(record);
  expect(problems.join()).toContain('"tvOS" → "Default control size" holds "66x66 pt"');
});

test("borrowing a value from another table on the same page fails", async () => {
  const record = valid();
  // 17 pt is real, but it is the Vision text-size table, not Mobility's control sizes.
  record.values = { default: "17 pt", minimum: "28x28 pt" };
  const { problems } = check(record);
  expect(problems.join()).toContain('holds "44x44 pt", but the record says default="17 pt"');
});

// ---- Structural requirements, each of which prevents a bare number. ----

test("a value with no named column fails, because default and minimum are then indistinguishable", async () => {
  const record = valid();
  delete record.columns;
  const { problems } = check(record);
  expect(problems.join()).toContain("names no source column");
});

test("a table-sourced record with no row fails", async () => {
  const record = valid();
  delete record.row;
  const { problems } = check(record);
  expect(problems.join()).toContain("must name the `row`");
});

test("a value with no stated meaning fails", async () => {
  const record = valid();
  record.meaning = { minimum: "minimum column" };
  const { problems } = check(record);
  expect(problems.join()).toContain('value "default" has no stated meaning');
});

test("citing a section that does not exist fails", async () => {
  const { problems } = check(valid(), "NoSuchSection");
  expect(problems.join()).toContain('no section "NoSuchSection"');
});

// ---- Prose-sourced records: the qualifier is part of the meaning. ----

const prose = (): MeasurementRecord => ({
  id: "control-spacing.visionos",
  row: "",
  values: { centre_to_centre: "at least 60 points" },
  qualifiers: { centre_to_centre: "at least" },
  meaning: { centre_to_centre: "distance between centres" },
  conditions: "regular-size buttons side by side",
  source_kind: "prose",
});

test("prose text is collected per section", () => {
  expect(sectionText(page, "Mobility")).toContain("at least 60 points apart");
  expect(sectionText(page, "Vision")).not.toContain("60 points");
});

test("a prose record carrying its qualifier verifies", async () => {
  const { problems, ok } = check(prose());
  expect(problems).toEqual([]);
  expect(await ok).toBe(1);
});

test("omitting the qualifiers field entirely fails, rather than skipping the check", () => {
  const record = prose();
  record.values = { centre_to_centre: "60 points" };
  delete record.qualifiers;
  const { problems } = check(record);
  expect(problems.join()).toContain("declares no qualifier");
});

test("declaring `none` where the source hedges fails", () => {
  const record = prose();
  record.values = { centre_to_centre: "60 points" };
  record.qualifiers = { centre_to_centre: "none" };
  const { problems } = check(record);
  expect(problems.join()).toContain('the source reads "at least 60 points"');
});

test("a trailing qualifier is matched after the number, not only before it", () => {
  const record = prose();
  record.id = "control-spacing.visionos.gap";
  record.values = { gap_between: "16 points or more" };
  record.qualifiers = { gap_between: "or more" };
  record.meaning = { gap_between: "space left between the buttons" };
  const { problems, ok } = check(record);
  expect(problems).toEqual([]);
  expect(ok).toBe(1);
});

test("dropping the source's qualifier fails", async () => {
  const record = prose();
  record.values = { centre_to_centre: "60 points" };
  const { problems } = check(record);
  expect(problems.join()).toContain('drops the source\'s qualifier "at least"');
});

test("a prose value absent from the cited section fails", async () => {
  const record = prose();
  record.values = { centre_to_centre: "at least 90 points" };
  record.qualifiers = { centre_to_centre: "at least" };
  const { problems } = check(record);
  expect(problems.join()).toContain("does not appear in the text under Mobility");
});

test("a prose value present on the page but under a different section fails", async () => {
  const record = prose();
  record.values = { centre_to_centre: "at least 17 pt" };
  delete record.qualifiers;
  // 17 pt exists, in the Vision table, not in Mobility's prose.
  const { problems } = check(record);
  expect(problems.join()).toContain("does not appear in the text under Mobility");
});

// ---- Snapshot integrity, through the production validator.
//
// An earlier version of this test hashed files with its own helper and asserted that different
// bytes produce different digests. That is a property of SHA-256, not of this repository: an audit
// disabled the production comparison and all 21 tests still passed. These call
// `validateProvenance`, so removing the check fails them.

async function scratchRecords(contents: string | null): Promise<string> {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "ds-snap-"));
  if (contents !== null) {
    await mkdir(join(dir, "snapshots"), { recursive: true });
    await writeFile(join(dir, "snapshots", "p.json"), contents);
  }
  return dir;
}

const PAGE = '{"metadata":{"title":"Accessibility"}}';
const DIGEST = new Bun.CryptoHasher("sha256").update(PAGE).digest("hex");
const prov = (over: Record<string, string> = {}) => ({
  url: "https://example.invalid/p",
  retrieved: "2026-09-17T00:00:00Z",
  sha256: DIGEST,
  snapshot: "snapshots/p.json",
  ...over,
});

test("a snapshot matching its recorded digest passes the production validator", async () => {
  const dir = await scratchRecords(PAGE);
  const problems: string[] = [];
  await validateProvenance("p", prov(), dir, (m) => problems.push(m));
  expect(problems).toEqual([]);
});

test("replacing the snapshot with {} fails with the integrity diagnostic", async () => {
  // The audit's exact substitution: keep the recorded digest, swap the contents.
  const dir = await scratchRecords("{}");
  const problems: string[] = [];
  await validateProvenance("p", prov(), dir, (m) => problems.push(m));
  expect(problems.join()).toContain("snapshot contents do not match the recorded sha256");
});

test("a missing snapshot file fails", async () => {
  const dir = await scratchRecords(null);
  const problems: string[] = [];
  await validateProvenance("p", prov(), dir, (m) => problems.push(m));
  expect(problems.join()).toContain("does not resolve to a file");
});

test("a missing provenance entry fails", async () => {
  const problems: string[] = [];
  await validateProvenance("p", undefined, "/tmp", (m) => problems.push(m));
  expect(problems.join()).toContain("no provenance entry");
});

test("each provenance field is required", async () => {
  const dir = await scratchRecords(PAGE);
  for (const field of ["url", "retrieved", "sha256", "snapshot"]) {
    const partial = prov();
    delete (partial as Record<string, unknown>)[field];
    const problems: string[] = [];
    await validateProvenance("p", partial, dir, (m) => problems.push(m));
    expect(problems.join()).toContain(`provenance has no ${field}`);
  }
});

// ---- End to end, through the CLI.
//
// The function tests above cover the comparison; this covers the wiring. A correct validator that
// nobody calls would pass them, which is the same class of gap as a test that hashes its own files.
// Runs against a temporary repository whose records cite a page served by a local stub, so no
// network and no dependence on Apple's current content.

test("the records CLI reports a substituted snapshot and exits non-zero", async () => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");

  const page = {
    metadata: { title: "Probe" },
    primaryContentSections: [
      {
        kind: "content",
        content: [
          { type: "heading", level: 2, text: "Mobility", anchor: "Mobility" },
          {
            type: "table",
            header: "row",
            rows: [
              [[{ type: "text", text: "Platform" }], [{ type: "text", text: "Default control size" }]],
              [[{ type: "text", text: "iOS" }], [{ type: "text", text: "44x44 pt" }]],
            ],
          },
        ],
      },
    ],
  };
  const body = JSON.stringify(page);
  const digest = new Bun.CryptoHasher("sha256").update(body).digest("hex");

  const server = Bun.serve({ port: 0, fetch: () => new Response(body) });
  try {
    const root = await mkdtemp(join(tmpdir(), "ds-cli-"));
    const records = join(root, "guidance", "apple-design", "records");
    await mkdir(join(records, "snapshots"), { recursive: true });
    await writeFile(
      join(records, "r.yaml"),
      `topic: t
provenance:
  probe:
    url: "http://127.0.0.1:${server.port}/probe"
    retrieved: "2026-09-17T00:00:00Z"
    sha256: "${digest}"
    snapshot: snapshots/probe.json
source_page: probe
source_anchor: Mobility
records:
  - id: t.ios
    platform: [iOS]
    row: "iOS"
    values: { default: "44x44 pt" }
    columns: { default: "Default control size" }
    meaning: { default: "The Default control size for this platform." }
    conditions: "c"
`,
    );

    const run = async () => {
      const proc = Bun.spawn([process.execPath, join(import.meta.dir, "..", "src", "e2e", "records.ts")], {
        cwd: root,
        env: { ...process.env, DS_RECORD_SOURCE_BASE: `http://127.0.0.1:${server.port}` },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [out, err] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      return { code: await proc.exited, output: out + err };
    };

    // Intact snapshot: the integrity check passes, so any failure is not about the digest.
    await writeFile(join(records, "snapshots", "probe.json"), body);
    const intact = await run();
    expect(intact.output).not.toContain("snapshot contents do not match");

    // The audit's substitution, end to end.
    await writeFile(join(records, "snapshots", "probe.json"), "{}");
    const tampered = await run();
    expect(tampered.output).toContain("snapshot contents do not match the recorded sha256");
    expect(tampered.code).not.toBe(0);
  } finally {
    server.stop(true);
  }
});

// ---- Conditional records: contrast.
//
// Control sizing selects a value by one row label. Contrast selects by size AND weight, with rows
// that overlap and a gap between them, so these test the parts the first pilot could not.

const contrastFixture = {
  metadata: { title: "Accessibility" },
  primaryContentSections: [
    {
      kind: "content",
      content: [
        { type: "heading", level: 2, text: "Vision", anchor: "Vision" },
        {
          type: "table",
          header: "row",
          rows: [
            [
              [{ type: "text", text: "Text size" }],
              [{ type: "text", text: "Text weight" }],
              [{ type: "text", text: "Minimum contrast ratio" }],
            ],
            [
              [{ type: "text", text: "Up to 17 pts" }],
              [{ type: "text", text: "All" }],
              [{ type: "text", text: "4.5:1" }],
            ],
            [[{ type: "text", text: "18 pts" }], [{ type: "text", text: "All" }], [{ type: "text", text: "3:1" }]],
            [[{ type: "text", text: "All" }], [{ type: "text", text: "Bold" }], [{ type: "text", text: "3:1" }]],
          ],
        },
      ],
    },
  ],
};
const contrastRaw = JSON.stringify(contrastFixture);
const contrastPage = parsePage(contrastFixture, contrastRaw);
const contrastDoc: RecordDoc = {
  topic: "contrast",
  source_page: "accessibility",
  source_anchor: "Vision",
  attribution: "WCAG Level AA, reproduced by Apple as guidance",
  records: [],
};

const smallText = (): MeasurementRecord => ({
  id: "contrast.small-text",
  row: "Up to 17 pts",
  values: { minimum_ratio: "4.5:1" },
  columns: { minimum_ratio: "Minimum contrast ratio" },
  meaning: { minimum_ratio: "The Minimum contrast ratio for this combination." },
  conditions_match: { text_size_max_pt: 17, text_weight: "any" },
  conditions: "text at or below 17 pt, any weight",
  attribution: "WCAG Level AA, reproduced by Apple as guidance",
});

function checkContrast(record: MeasurementRecord) {
  const problems: string[] = [];
  const ok = verifyRecord(record, contrastDoc, contrastPage, "Vision", (_id, m) => problems.push(m));
  return { problems, ok };
}

test("a conditional record resolves to its own row", () => {
  const { problems, ok } = checkContrast(smallText());
  expect(problems).toEqual([]);
  expect(ok).toBe(1);
});

test("the three contrast rows resolve to different ratios", () => {
  expect(resolveTableCell(contrastPage, "Vision", "Up to 17 pts", "Minimum contrast ratio")).toBe("4.5:1");
  expect(resolveTableCell(contrastPage, "Vision", "18 pts", "Minimum contrast ratio")).toBe("3:1");
  expect(resolveTableCell(contrastPage, "Vision", "All", "Minimum contrast ratio")).toBe("3:1");
});

test("taking the large-text ratio while citing the small-text row fails", () => {
  const record = smallText();
  record.values = { minimum_ratio: "3:1" };
  const { problems } = checkContrast(record);
  expect(problems.join()).toContain('holds "4.5:1", but the record says minimum_ratio="3:1"');
});

test("a condition that disagrees with its row's cell fails", () => {
  const record = smallText();
  // The row's weight cell is "All"; claiming bold narrows it to something the row does not say.
  record.conditions_match = { text_size_max_pt: 17, text_weight: "bold" };
  const { problems } = checkContrast(record);
  expect(problems.join()).toContain('the cell is "All"');
});

/*
 * The three mutations below defeated this verifier in an audit. Each passed silently because the
 * condition check compared strings, skipped the first column, and treated a missing predicate as
 * nothing to check. They are tests now so that removing the guard fails the suite rather than
 * quietly restoring the hole.
 */
test("a bound that does not match its cell fails (audit: 17 changed to 99, and it passed)", () => {
  const record = smallText();
  record.conditions_match = { text_size_max_pt: 99, text_weight: "any" };
  const { problems } = checkContrast(record);
  expect(problems.join()).toContain('does not match the cell "Up to 17 pts"');
});

test("a missing predicate fails (audit: text_weight deleted, and it passed)", () => {
  const record = smallText();
  record.conditions_match = { text_size_max_pt: 17 };
  const { problems } = checkContrast(record);
  expect(problems.join()).toContain('no condition for column "Text weight"');
});

test("no conditions at all fails (audit: conditions_match deleted, and it passed)", () => {
  const record = smallText();
  delete record.conditions_match;
  const { problems } = checkContrast(record);
  // Every condition column must be accounted for, so dropping the block reports each one.
  expect(problems.join()).toContain('no condition for column "Text size"');
  expect(problems.join()).toContain('no condition for column "Text weight"');
});

test("a condition key whose unit disagrees with its cell fails", () => {
  // Renaming text_size_max_pt to text_size_max_px passed silently: the check validated the
  // comparison and the number but never the quantity. Same digits, different unit.
  const px = smallText();
  px.conditions_match = { text_size_max_px: 17, text_weight: "any" };
  expect(checkContrast(px).problems.join()).toContain("is in px, but the cell");

  const dp = smallText();
  dp.conditions_match = { text_size_max_dp: 17, text_weight: "any" };
  expect(checkContrast(dp).problems.join()).toContain("is in dp, but the cell");

  // A key with no unit at all is just as unverifiable.
  const bare = smallText();
  bare.conditions_match = { text_size_max: 17, text_weight: "any" };
  expect(checkContrast(bare).problems.join()).toContain("states no unit");

  // Equivalent spellings of the same unit must still be accepted, or the check would just be
  // demanding one spelling rather than checking a quantity.
  for (const key of ["text_size_max_pt", "text_size_max_pts", "text_size_max_point", "text_size_max_points"]) {
    const ok = smallText();
    ok.conditions_match = { [key]: 17, text_weight: "any" };
    expect(checkContrast(ok).problems).toEqual([]);
  }
});

test("an upper bound declared as an exact match fails, and the reverse too", () => {
  const upper = smallText();
  // "Up to 17 pts" is a maximum; a key that does not say so would read as "exactly 17".
  upper.conditions_match = { text_size_exact_pt: 17, text_weight: "any" };
  expect(checkContrast(upper).problems.join()).toContain("is an upper bound");

  const exact = smallText();
  exact.id = "contrast.large-text";
  exact.row = "18 pts";
  exact.values = { minimum_ratio: "3:1" };
  exact.conditions_match = { text_size_max_pt: 18, text_weight: "any" };
  expect(checkContrast(exact).problems.join()).toContain("names one exact size");
});

test("a record attributing values to nobody fails when the source attributes them elsewhere", () => {
  const record = smallText();
  delete record.attribution;
  const { problems } = checkContrast(record);
  expect(problems.join()).toContain("must carry `attribution`");
});

test("claiming a platform on a non-platform row fails", () => {
  const record = smallText();
  record.platform = ["iOS"];
  const { problems } = checkContrast(record);
  expect(problems.join()).toContain("selects no platform");
});

// Boundary behaviour. The table's own rows are the authority on what is and is not covered.
test("boundaries are evaluated, not read: 17 covered, 18 covered, 17.5 not", () => {
  // The previous version of this test asserted on the row *strings* in the fixture, which proves
  // the fixture contains the text we wrote and nothing about how a record behaves. An audit called
  // that out. This runs the predicates the records actually carry.
  const upTo17 = parsePredicate("Up to 17 pts");
  const exactly18 = parsePredicate("18 pts");
  const allSizes = parsePredicate("All");

  expect(upTo17).toEqual({ kind: "max", value: 17, unit: "pts" });
  expect(exactly18).toEqual({ kind: "exact", value: 18, unit: "pts" });
  expect(allSizes).toEqual({ kind: "any" });

  // Row 1 covers everything at or below 17, inclusive.
  expect(admits(upTo17, 17)).toBe(true);
  expect(admits(upTo17, 16.9)).toBe(true);
  expect(admits(upTo17, 17.5)).toBe(false);

  // Row 2 names one size. It is not a floor, so it admits neither 17.5 nor 24.
  expect(admits(exactly18, 18)).toBe(true);
  expect(admits(exactly18, 17.5)).toBe(false);
  expect(admits(exactly18, 24)).toBe(false);

  // Hence the gap, and hence `undefined_between` in the record file.
  expect(admits(upTo17, 17.5) || admits(exactly18, 17.5)).toBe(false);

  // But the gap is only total for non-bold text: the wildcard row still admits 17.5 pt bold.
  expect(admits(allSizes, 17.5)).toBe(true);
});

test("an overlap claim is checked by intersecting conditions, not by comparing values", () => {
  const upTo17 = parsePredicate("Up to 17 pts");
  const exactly18 = parsePredicate("18 pts");
  const allSizes = parsePredicate("All");

  // The real overlap: bold text at or below 17 matches row 1 and the bold wildcard at once.
  expect(intersects(upTo17, allSizes)).toBe(true);

  // The false one an audit planted: these rows give different ratios but no size satisfies both,
  // so calling them an overlap invents an ambiguity the source does not have.
  expect(intersects(upTo17, exactly18)).toBe(false);

  // Named categories intersect only with themselves or a wildcard.
  expect(intersects(parsePredicate("Bold"), parsePredicate("All"))).toBe(true);
  expect(intersects(parsePredicate("Bold"), parsePredicate("Regular"))).toBe(false);
});

/*
 * ---- local_ir records: WCAG's own thresholds ----
 *
 * The first version of this branch asked only whether a value appeared ANYWHERE in the rule it
 * cited. An audit swapped three thresholds for other numbers from the same sentences and all three
 * passed, which is the original string-matching flaw wearing a different hat. These tests are those
 * swaps, so the hole cannot be reopened quietly.
 *
 * The fixture is WCAG's real text, short enough to read: both point thresholds live in ONE clause,
 * and both contrast ratios live in one rule split across statement and note.
 */
const irRules = new Map<string, IrRule>([
  [
    "wcag22/glossary/041",
    {
      statement: "large scale (text)",
      rationale:
        "with at least 18 point or 14 point bold or font size that would yield equivalent size " +
        "for Chinese, Japanese and Korean (CJK) fonts",
      notes: ["_[informative]_ > **Note:** The 18 and 14 point sizes for roman texts are taken from print convention."],
      noteAuthority: ["informative"],
    },
  ],
  [
    "wcag22/distinguishable/003",
    {
      statement:
        "The visual presentation of text and images of text has a contrast ratio of at least 4.5:1, " +
        "except for the following:",
      rationale: undefined,
      notes: [
        "- Large Text — Large-scale text and images of large-scale text have a contrast ratio of at least 3:1;",
        "- Logotypes — Text that is part of a logo or brand name has no contrast requirement.",
      ],
      noteAuthority: ["normative", "normative"],
    },
  ],
]);

const irDoc = (records: MeasurementRecord[]): RecordDoc => ({
  topic: "wcag-upstream",
  source_kind: "local_ir",
  source_build: "ir/wcag22",
  records,
});

const regular = (): MeasurementRecord => ({
  id: "wcag.large-scale-regular",
  rule: "wcag22/glossary/041",
  values: { min_size: "18 point" },
  clauses: { min_size: "rationale" },
  context: { min_size: "at least 18 point" },
  conditions_match: { text_weight: "any", text_scale: "large" },
  authority: { min_size: "normative" },
  conditions: "CSS points at delivery size",
  attribution: 'W3C, WCAG 2.2 glossary, "large scale (text)"',
});

const bold = (): MeasurementRecord => ({
  id: "wcag.large-scale-bold",
  rule: "wcag22/glossary/041",
  values: { min_size: "14 point" },
  clauses: { min_size: "rationale" },
  context: { min_size: "14 point bold" },
  conditions_match: { text_weight: "bold", text_scale: "large" },
  authority: { min_size: "normative" },
  conditions: "CSS points at delivery size, bold",
  attribution: 'W3C, WCAG 2.2 glossary, "large scale (text)"',
});

const largeRatio = (): MeasurementRecord => ({
  id: "wcag.large-scale-ratio",
  rule: "wcag22/distinguishable/003",
  values: { minimum_ratio: "3:1" },
  clauses: { minimum_ratio: "note:0" },
  context: { minimum_ratio: "contrast ratio of at least 3:1" },
  conditions_match: { text_weight: "any", text_scale: "large" },
  authority: { minimum_ratio: "normative" },
  conditions: "large-scale text",
  attribution: "W3C, WCAG 2.2 SC 1.4.3",
});

const generalRatio = (): MeasurementRecord => ({
  id: "wcag.contrast-minimum",
  rule: "wcag22/distinguishable/003",
  values: { minimum_ratio: "4.5:1" },
  clauses: { minimum_ratio: "statement" },
  context: { minimum_ratio: "contrast ratio of at least 4.5:1" },
  conditions_match: { text_weight: "any", text_scale: "any" },
  authority: { minimum_ratio: "normative" },
  conditions: "text that is not large scale",
  attribution: "W3C, WCAG 2.2 SC 1.4.3",
});

/** Drive the checker against a modified rule set, for cases that need different source text. */
function checkPilotIr(records: MeasurementRecord[], rules: Map<string, IrRule>) {
  const problems: string[] = [];
  verifyIrRecords(irDoc(records), rules, (_id, m) => problems.push(m));
  return problems.join("\n");
}

function checkIr(records: MeasurementRecord[]) {
  const problems: string[] = [];
  const verified = verifyIrRecords(irDoc(records), irRules, (_id, m) => problems.push(m));
  return { problems, verified };
}

test("correct local_ir records verify, one pass per value", () => {
  const { problems, verified } = checkIr([regular(), bold(), largeRatio()]);
  expect(problems).toEqual([]);
  expect(verified).toBe(3);
});

test("audit swap 1: the regular threshold cannot take the bold number", () => {
  const r = regular();
  r.values = { min_size: "14 point" };
  // "14 point" is in the clause, so a substring search accepted this. The context does not
  // contain it, so binding the value to its phrase rejects it.
  expect(checkIr([r]).problems.join()).toContain('does not state "14 point" as a measurement');
});

test("audit swap 2: the bold threshold cannot take the regular number", () => {
  const r = bold();
  r.values = { min_size: "18 point" };
  expect(checkIr([r]).problems.join()).toContain('does not state "18 point" as a measurement');
});

test("audit swap 3: the large-text ratio cannot take the general ratio", () => {
  const r = largeRatio();
  r.values = { minimum_ratio: "4.5:1" };
  expect(checkIr([r]).problems.join()).toContain('does not state "4.5:1" as a measurement');
});

test("a context naming both thresholds is rejected as ambiguous", () => {
  const r = regular();
  // The full clause mentions 18 AND 14, so it would accept either. A context has to pin one case.
  r.context = { min_size: "at least 18 point or 14 point bold" };
  expect(checkIr([r]).problems.join()).toContain("more than one candidate value");
});

test("a context that would be equally true of a sibling's value is rejected", () => {
  // "14 point bold" pins the bold case. Weakened to "14 point" it still contains its own value and
  // still appears in the clause, but says nothing about weight.
  //
  // Two independent guards now reject this, and the condition check reaches it first: a context
  // with no "bold" in it derives text_weight=any, contradicting the record. Assert that, then
  // isolate the discrimination guard by removing the condition it would otherwise fail on.
  const weak = bold();
  weak.context = { min_size: "14 point" };
  expect(checkIr([weak, regular()]).problems.join()).toContain("expresses text_weight=any");

  // With conditions that match the weakened phrase, the sibling substitution is what is left to
  // catch it: "18 point" put into "14 point" also appears in the clause, so the phrase cannot tell
  // the two cases apart.
  const weakButConsistent = bold();
  weakButConsistent.context = { min_size: "14 point" };
  weakButConsistent.conditions_match = { text_weight: "any", text_scale: "large" };
  expect(checkIr([weakButConsistent, regular()]).problems.join())
    .toContain("would be equally true of 18 point");
});

test("citing the wrong clause fails even when the value is real", () => {
  const r = largeRatio();
  r.clauses = { minimum_ratio: "statement" };   // the statement says 4.5:1, not 3:1
  expect(checkIr([r]).problems.join()).toContain("is not stated as");

  const missing = largeRatio();
  missing.clauses = { minimum_ratio: "note:9" };
  expect(checkIr([missing]).problems.join()).toContain("does not have");
});

test("a value with no clause or no context fails", () => {
  const noClause = regular();
  delete noClause.clauses;
  expect(checkIr([noClause]).problems.join()).toContain("names no `clause`");

  const noContext = regular();
  delete noContext.context;
  expect(checkIr([noContext]).problems.join()).toContain("names no `context`");
});

test("claiming normative authority for an informative note fails", () => {
  // The note explains where the sizes came from. Citing it for a threshold would dress an
  // informative aside as a requirement.
  //
  // This test used to carry "18 and 14 point" as its value, which the whole-value parser now
  // rejects before authority is ever reached — a value naming two numbers is not a measurement.
  // Rewritten with a single one so it exercises the authority check it is named for.
  const r = regular();
  r.clauses = { min_size: "note:0" };
  r.context = { min_size: "The 18 and 14 point sizes" };
  r.values = { min_size: "18 point" };
  const problems = checkIr([r]).problems.join();
  // "The 18 and 14 point sizes" holds exactly one MEASUREMENT: "14 point". "18 and" has no unit,
  // and the parser reads units rather than adjacency, so this context cannot support 18 point.
  expect(problems).toContain('does not state "18 point" as a measurement');

  // Worth noting what "18 and 14 point sizes" parses to: only ONE measurement, "14 point",
  // because "18 and" carries no unit. The measurement parser reads units, not adjacency, so this
  // context cannot support an 18 point claim at all.
  const pinned = regular();
  pinned.clauses = { min_size: "note:0" };
  pinned.context = { min_size: "18 and 14 point sizes" };
  pinned.values = { min_size: "18 point" };
  expect(checkIr([pinned]).problems.join()).toContain('does not state "18 point" as a measurement');
});

test("an informative note cannot warrant a normative claim", () => {
  // A note holding exactly one measurement, so the authority check is what decides it.
  const rules = new Map(irRules);
  rules.set("wcag22/glossary/041", {
    ...irRules.get("wcag22/glossary/041")!,
    notes: ["_[informative]_ > **Note:** roughly 18 point is a common large-print size."],
    noteAuthority: ["informative"],
  });
  const r = regular();
  r.clauses = { min_size: "note:0" };
  r.context = { min_size: "roughly 18 point" };
  const problems = checkPilotIr([r], rules);
  expect(problems).toContain("informative");
});

test("a local_ir record without attribution fails: these are another body's values", () => {
  const r = regular();
  delete r.attribution;
  expect(checkIr([r]).problems.join()).toContain("must carry `attribution`");
});

/*
 * Conditions must be DERIVED from the source, not asserted beside it.
 *
 * A second audit swapped two records' values and their context phrases together, leaving each
 * record's stated meaning and conditions untouched. Both passed: every phrase was real and pinned
 * its own number, so the checker had nothing to object to. It proved the phrase existed and never
 * proved the phrase was about the case the record claimed.
 */
test("swapping two records' values AND contexts together is caught by their conditions", () => {
  const r = regular();
  r.values = { min_size: "14 point" };
  r.context = { min_size: "14 point bold" };       // a real phrase, containing its own value
  // conditions_match still says the non-bold case, which the phrase does not support.
  const problems = checkIr([r, bold()]).problems.join();
  expect(problems).toContain("declares text_weight=any");
  expect(problems).toContain("expresses text_weight=bold");

  const b = bold();
  b.values = { min_size: "18 point" };
  b.context = { min_size: "at least 18 point" };
  const reverse = checkIr([b]).problems.join();
  expect(reverse).toContain("declares text_weight=bold");
  expect(reverse).toContain("expresses text_weight=any");
});

test("taking another clause's value while keeping this record's conditions is caught", () => {
  // The general 4.5:1 is real, in the statement, and pinned by its phrase. What it is not is the
  // large-text case, and this record still claims to be.
  const r = largeRatio();
  r.values = { minimum_ratio: "4.5:1" };
  r.clauses = { minimum_ratio: "statement" };
  r.context = { minimum_ratio: "contrast ratio of at least 4.5:1" };
  const problems = checkIr([r]).problems.join();
  expect(problems).toContain("declares text_scale=large");
  expect(problems).toContain("expresses text_scale=any");
});

test("a record with no conditions_match fails, and an unreadable dimension fails", () => {
  const none = regular();
  delete none.conditions_match;
  expect(checkIr([none]).problems.join()).toContain("declares no `conditions_match`");

  const unknown = regular();
  unknown.conditions_match = { ...unknown.conditions_match, colour_space: "srgb" };
  expect(checkIr([unknown]).problems.join()).toContain("cannot read from the source");
});

test("omitting one dimension fails: silence is not agreement", () => {
  // Declaring some conditions and not others would let a record dodge the dimension that would
  // have caught it. Every dimension the lexicon can read has to be answered.
  const partial = regular();
  partial.conditions_match = { text_scale: "large" };   // text_weight omitted
  const problems = checkIr([partial]).problems.join();
  expect(problems).toContain('declares no "text_weight"');
  expect(problems).toContain("implies text_weight=any");

  const other = regular();
  other.conditions_match = { text_weight: "any" };      // text_scale omitted
  expect(checkIr([other]).problems.join()).toContain('declares no "text_scale"');
});

test("weight is read from the phrase but scale from the whole entry", () => {
  // One clause holds both thresholds, so weight has to come from the pinned phrase: reading it
  // from the clause would make "at least 18 point" look bold because "bold" appears later in the
  // sentence. Scale is the opposite: neither phrase says "large", and the term being defined does.
  expect(deriveConditions("at least 18 point", "with at least 18 point or 14 point bold", "large scale (text)"))
    .toEqual(new Map([["text_weight", "any"], ["text_scale", "large"]]));
  expect(deriveConditions("14 point bold", "with at least 18 point or 14 point bold", "large scale (text)"))
    .toEqual(new Map([["text_weight", "bold"], ["text_scale", "large"]]));

  // A criterion's general statement is not about large text, even though its exceptions are.
  expect(deriveConditions(
    "contrast ratio of at least 4.5:1",
    "The visual presentation of text has a contrast ratio of at least 4.5:1, except for the following:",
    "",
  )).toEqual(new Map([["text_weight", "any"], ["text_scale", "any"]]));

  // The Large Text exception is.
  expect(deriveConditions(
    "contrast ratio of at least 3:1",
    "- Large Text — Large-scale text and images of large-scale text have a contrast ratio of at least 3:1;",
    "",
  )).toEqual(new Map([["text_weight", "any"], ["text_scale", "large"]]));
});

/*
 * Values are measurements, not strings.
 *
 * A fourth audit corrupted three published thresholds into numbers the source never states, and
 * every one passed, because the value was matched as a substring: "8 point" sits inside "at least
 * 18 point", "4 point" inside "14 point bold", "5:1" inside "at least 4.5:1". A regex over
 * characters cannot tell where a number starts.
 */
test("a truncated number is not the number: 8 point is not 18 point", () => {
  for (const [bad, states] of [["8 point", "18 point"], ["1 point", "18 point"]] as const) {
    const r = regular();
    r.values = { min_size: bad };
    const problems = checkIr([r]).problems.join();
    expect(problems).toContain(`does not state "${bad}" as a measurement`);
    expect(problems).toContain(states);
  }

  const b = bold();
  b.values = { min_size: "4 point" };
  expect(checkIr([b]).problems.join()).toContain('does not state "4 point" as a measurement');
});

test("a truncated ratio is not the ratio: 5:1 is not 4.5:1", () => {
  const r = generalRatio();
  r.values = { minimum_ratio: "5:1" };
  expect(checkIr([r]).problems.join()).toContain('does not state "5:1" as a measurement');

  const large = largeRatio();
  large.values = { minimum_ratio: "1:1" };
  expect(checkIr([large]).problems.join()).toContain('does not state "1:1" as a measurement');
});

test("the same number in a different unit is a different measurement", () => {
  const r = regular();
  r.values = { min_size: "18 px" };
  expect(checkIr([r]).problems.join()).toContain('does not state "18 px" as a measurement');
});

test("a value that is not a single parseable measurement is refused", () => {
  const r = regular();
  r.values = { min_size: "largish" };
  expect(checkIr([r]).problems.join()).toContain("is not a single measurement");

  const two = regular();
  two.values = { min_size: "18 point or 14 point" };
  expect(checkIr([two]).problems.join()).toContain("is not a single measurement");
});

test("measurement parsing: equivalent spellings match, different quantities do not", () => {
  const eighteenPt = measurementsIn("at least 18 point");
  expect(eighteenPt).toHaveLength(1);
  expect(eighteenPt[0]).toMatchObject({ value: 18, unit: "pt" });

  // "18 point" and "18 pts" are one quantity written two ways.
  expect(sameMeasurement(measurementsIn("18 point")[0]!, measurementsIn("18 pts")[0]!)).toBe(true);
  // 18 and 8 are not, however the characters overlap.
  expect(sameMeasurement(measurementsIn("18 point")[0]!, measurementsIn("8 point")[0]!)).toBe(false);
  // Nor are the same digits in different units.
  expect(sameMeasurement(measurementsIn("18 point")[0]!, measurementsIn("18 px")[0]!)).toBe(false);

  // Ratios are compared by value, so 4.5:1 and 9:2 are the same ratio and 5:1 is not.
  expect(sameMeasurement(measurementsIn("4.5:1")[0]!, measurementsIn("9:2")[0]!)).toBe(true);
  expect(sameMeasurement(measurementsIn("4.5:1")[0]!, measurementsIn("5:1")[0]!)).toBe(false);

  // A clause with both thresholds yields both, in order.
  expect(measurementsIn("with at least 18 point or 14 point bold").map((m) => m.value)).toEqual([18, 14]);
});

/*
 * A declared value must be parsed WHOLE, not scraped for a plausible token.
 *
 * An audit set the regular threshold to ".18 point", "1,018 point" and "-18 point". Each contains
 * exactly one extractable measurement that reads as 18, so a "find one token" test accepted all
 * three, and the real CLI verified ".18 point" against "at least 18 point". Prose is allowed to be
 * messy around a number; a declared value is not.
 */
test("a declared value must consume its whole text", () => {
  for (const bad of [".18 point", "1,018 point", "-18 point", "18 point or more", "at least 18 point", "18 point."]) {
    const r = regular();
    r.values = { min_size: bad };
    expect(checkIr([r]).problems.join()).toContain("is not a single measurement");
  }

  const ratio = generalRatio();
  ratio.values = { minimum_ratio: ".4.5:1" };
  expect(checkIr([ratio]).problems.join()).toContain("is not a single measurement");
});

test("equivalent spellings of one quantity are still accepted", () => {
  // The point of rejecting unsupported syntax is precision, not pedantry: the same quantity
  // written differently must still verify, or the check is just demanding one spelling.
  for (const good of ["18 point", "18 points", "18 pt", "18 pts", "18.0 point"]) {
    const r = regular();
    r.values = { min_size: good };
    expect(checkIr([r]).problems).toEqual([]);
  }

  for (const good of ["4.5:1", "4.5 : 1", "9:2"]) {
    const r = generalRatio();
    r.values = { minimum_ratio: good };
    expect(checkIr([r]).problems).toEqual([]);
  }
});

test("a ratio with a zero denominator is refused rather than becoming Infinity", () => {
  const r = generalRatio();
  r.values = { minimum_ratio: "4.5:0" };
  expect(checkIr([r]).problems.join()).toContain("is not a single measurement");
});
