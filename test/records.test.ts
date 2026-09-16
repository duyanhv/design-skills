import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePage, resolveTableCell, sectionText } from "../src/e2e/record-source.ts";
import { verifyRecord, type MeasurementRecord, type RecordDoc } from "../src/e2e/records.ts";

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
  meaning: { default: "default column", minimum: "minimum column" },
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
