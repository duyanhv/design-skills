#!/usr/bin/env bun
/**
 * Verify measurement records against the source they cite.
 *
 * A record is the only route by which a number may enter published guidance, so a record that
 * drifts is worse than no record: a wrong number wearing a citation.
 *
 * **Matching a value is not verifying it, and three rounds of this file got that wrong.**
 * The first version searched the whole page for each value and checked the table header
 * separately. That passes every mutation that matters, as an audit demonstrated:
 *
 *   - swap iOS's default and minimum        → both strings still on the page → passed
 *   - give tvOS the iOS values              → both strings still on the page → passed
 *   - cite Mobility, take 17 pt from Vision → string still on the page       → passed
 *
 * All three are the default-versus-minimum confusion the format was built to prevent, so the
 * format was not preventing it. The failure was structural: the check knew the page contained a
 * value, not *where* the value came from.
 *
 * So verification now **resolves** each value: section → table in that section → the row whose
 * first cell names the record's platform → the column whose header the record names. A value is
 * verified only when the cell at that intersection holds it. Cross-table borrowing, swapped
 * columns, and misattributed platforms all fail, because each names a different cell.
 *
 * Prose-sourced values cannot be resolved that way, so they are constrained differently: the value
 * must appear inside the *cited section's* text, and any qualifier the source attaches to it
 * ("at least", "about") must be carried in the record verbatim.
 *
 * Usage: bun run src/e2e/records.ts [--quiet]
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { ROOT, exists } from "../util/fs.ts";
import { log } from "../util/log.ts";
import { fetchPage, resolveTableCell, sectionText, type PageData } from "./record-source.ts";

const quiet = process.argv.includes("--quiet");

export interface MeasurementRecord {
  id: string;
  platform?: string[];
  values?: { [k: string]: string };
  meaning?: { [k: string]: string };
  /** Maps each value key to the source table column whose header gives it meaning. */
  columns?: { [k: string]: string };
  /** The table row this record's values come from, matched against the row's first cell. */
  row?: string;
  conditions?: string;
  exceptions?: string;
  source_page?: string;
  source_anchor?: string;
  source_kind?: string;
  /** For prose-sourced values: the qualifier the source attaches, carried verbatim. */
  qualifiers?: { [k: string]: string };
}

export interface RecordDoc {
  topic: string;
  source_page?: string;
  source_url?: string;
  source_anchor?: string;
  source_table?: string;
  /** Per-page provenance: url, retrieved, content hash, local snapshot. */
  provenance?: {
    [page: string]: { url: string; retrieved: string; sha256: string; snapshot: string; page_updated?: string };
  };
  tension?: string;
  origin?: string;
  method?: string;
  conditions?: string;
  raw_output?: string;
  records: MeasurementRecord[];
}

let failed = 0;
let verified = 0;
const fail = (id: string, msg: string) => {
  console.log(`✗ ${id}: ${msg}`);
  failed++;
};

/** Pull the measurement out of a hedged value ("at least 60 points apart" → "60 points"). */
function measurementIn(value: string): string | null {
  const m = /\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?\s*)?(?:pt|px|points?|pixels?)/i.exec(value);
  return m ? m[0] : null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[×✕]/g, "x").trim();

/** Verify one record against a fetched page. Exported so the negative suite can drive it offline. */
export async function verifyRecord(
  record: MeasurementRecord,
  doc: RecordDoc,
  page: PageData,
  anchor: string,
  report: (id: string, msg: string) => void,
): Promise<number> {
  let ok = 0;

  if (!page.anchors.has(anchor)) {
    report(record.id, `page has no section "${anchor}"`);
    return 0;
  }
  if (!record.values || !Object.keys(record.values).length) {
    report(record.id, "no values");
    return 0;
  }
  for (const key of Object.keys(record.values)) {
    if (!record.meaning?.[key]) {
      report(record.id, `value "${key}" has no stated meaning — a bare number is the error this format prevents`);
    }
  }
  if (!record.conditions?.trim()) report(record.id, "no conditions stated");

  // ---- Table-sourced: resolve section → table → row → column. ----
  if (!record.source_kind) {
    if (!record.row) {
      report(record.id, "table-sourced record must name the `row` its values come from");
      return 0;
    }
    for (const [key, value] of Object.entries(record.values)) {
      const column = record.columns?.[key];
      if (!column) {
        report(record.id, `value "${key}" names no source column; without one, default and minimum are indistinguishable`);
        continue;
      }
      const cell = resolveTableCell(page, anchor, record.row, column);
      if (cell === null) {
        report(
          record.id,
          `could not resolve ${anchor} → row "${record.row}" → column "${column}". ` +
            `Tables under that section: ${page.tables.filter((t) => t.anchor === anchor).map((t) => `[${t.header.join(" | ")}]`).join(", ") || "(none)"}`,
        );
        continue;
      }
      if (norm(cell) !== norm(value)) {
        report(
          record.id,
          `${anchor} → "${record.row}" → "${column}" holds "${cell}", but the record says ${key}="${value}"`,
        );
        continue;
      }
      ok++;
    }
    return ok;
  }

  // ---- Prose-sourced: the value must appear in the cited section, with its qualifier. ----
  const text = sectionText(page, anchor);
  if (!text) {
    report(record.id, `no prose found under section "${anchor}"`);
    return 0;
  }
  const haystack = norm(text);
  for (const [key, value] of Object.entries(record.values)) {
    const needle = measurementIn(value);
    if (!needle) {
      report(record.id, `value ${key}="${value}" contains no measurement to verify`);
      continue;
    }
    if (!haystack.includes(norm(needle))) {
      report(record.id, `value ${key}="${value}" does not appear in the text under ${anchor}`);
      continue;
    }
    // A hedge changes what the number means, so it must survive into the record.
    const qualifier = record.qualifiers?.[key];
    if (qualifier) {
      const phrase = norm(`${qualifier} ${needle}`);
      if (!haystack.includes(phrase)) {
        report(record.id, `the source under ${anchor} does not read "${qualifier} ${needle}"; check the qualifier`);
        continue;
      }
      if (!norm(value).includes(norm(qualifier))) {
        report(record.id, `value ${key}="${value}" drops the source's qualifier "${qualifier}"`);
        continue;
      }
    }
    ok++;
  }
  return ok;
}

if (import.meta.main) {
  const dir = join(ROOT, "guidance", "apple-design", "records");
  if (!(await exists(dir))) {
    log.info("no records directory, nothing to verify");
    process.exit(0);
  }

  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".yaml")).sort()) {
    const doc = parse(await readFile(join(dir, file), "utf8")) as RecordDoc;

    // Measured observations are ours, warranted by a re-runnable probe rather than a source page.
    // Verifying them here would be a category error; passing them silently would imply a check
    // that never ran, so they are reported as skipped.
    if (doc.origin) {
      if (!quiet) {
        console.log(`\n== ${file} (${doc.records?.length ?? 0} measured records)`);
        console.log(`   not verified here: these are our measurements, not the source's values`);
        console.log(`   warranted by: ${doc.origin}${doc.raw_output ? ` (raw: ${doc.raw_output})` : ""}`);
      }
      if (!doc.method) fail(file, "a measured record file must state its method");
      if (!doc.conditions) fail(file, "a measured record file must state its conditions");
      continue;
    }

    if (!quiet) console.log(`\n== ${file} (${doc.records?.length ?? 0} records)`);

    for (const record of doc.records ?? []) {
      const pageName = record.source_page ?? doc.source_page;
      const anchor = record.source_anchor ?? doc.source_anchor;
      if (!pageName || !anchor) {
        fail(record.id, "no source page or anchor");
        continue;
      }

      // Provenance is per page: a record citing a second page must carry that page's own snapshot,
      // not inherit the file's. A date alone does not identify content.
      const prov = doc.provenance?.[pageName];
      if (!prov) {
        fail(record.id, `no provenance entry for page "${pageName}" (needs url, retrieved, sha256, snapshot)`);
      } else {
        for (const field of ["url", "retrieved", "sha256", "snapshot"] as const) {
          if (!prov[field]) fail(record.id, `provenance for "${pageName}" has no ${field}`);
        }
        const snapshot = join(ROOT, "guidance", "apple-design", "records", prov.snapshot ?? "");
        if (prov.snapshot && !(await exists(snapshot))) {
          fail(record.id, `snapshot "${prov.snapshot}" does not resolve to a file`);
        }
      }

      const page = await fetchPage(pageName);
      if (!page) {
        fail(record.id, `cited page "${pageName}" could not be fetched or does not exist`);
        continue;
      }
      if (prov?.sha256) {
        const live = Bun.CryptoHasher ? new Bun.CryptoHasher("sha256").update(page.raw).digest("hex") : "";
        if (live && live !== prov.sha256) {
          console.log(`  ! ${pageName} has changed since the snapshot (${prov.sha256.slice(0, 12)} → ${live.slice(0, 12)})`);
          console.log(`    values are still checked against the live page below; refresh the snapshot if they hold`);
        }
      }

      const before = failed;
      verified += await verifyRecord(record, doc, page, anchor, fail);
      if (!quiet && failed === before) {
        console.log(`  ✓ ${record.id} (${(record.platform ?? []).join(", ") || "unscoped"})`);
      }
    }
  }

  console.log("");
  if (failed) {
    log.warn(`${failed} record problem(s)`);
    process.exit(1);
  }
  log.info(`${verified} measurement value(s) resolved to a specific cell or passage in the live source`);
}
