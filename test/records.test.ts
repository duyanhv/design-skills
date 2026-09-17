import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePage, resolveTableCell, sectionText } from "../src/e2e/record-source.ts";
import { verifyRecord, validateProvenance, type MeasurementRecord, type RecordDoc } from "../src/e2e/records.ts";

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
