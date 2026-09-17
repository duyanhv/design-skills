#!/usr/bin/env bun
/**
 * Verify measurement records against the source they cite.
 *
 * A record is the only route by which a number may enter published guidance, so a record that
 * drifts is worse than no record: a wrong number wearing a citation.
 *
 * **Four rounds of this file, each defeated by the same mistake in a smaller place.** Every version
 * checked fields *individually* and never checked that they agreed with each other:
 *
 *   v1  value anywhere on page + header anywhere on page
 *         → swapped columns, wrong platform, cross-table borrowing all passed
 *   v2  resolve section → table → row → column, compare the cell
 *         → but `platform:` was never compared to the row, so a record could claim the iOS cell
 *           and label it tvOS; and `meaning:` was never compared to the column, so swapping the
 *           values *and* their column mappings together left the labels lying in unison
 *   v3  (this file) derive what can be derived, and cross-check the rest
 *
 * The rule that falls out: **a field a record asserts about the source must be checked against the
 * source, not merely be present.** So:
 *
 *   - `platform` is derived from the row label, not taken on trust.
 *   - `meaning` must name the column it claims to describe, so a swapped mapping is visible.
 *   - `qualifiers` must be stated for every value, including an explicit `none`, because a record
 *     that simply omits the field silently skipped the check that a hedge survived.
 *   - the local snapshot is hashed and must equal the recorded digest; live drift is reported
 *     separately, because "the page changed" and "our snapshot is not what we say it is" are
 *     different problems with different fixes.
 *
 * Usage: bun run src/e2e/records.ts [--quiet]
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { ROOT, exists } from "../util/fs.ts";
import { log } from "../util/log.ts";
import { fetchPage, resolveTableCell, findTable, sectionText, type PageData } from "./record-source.ts";

const quiet = process.argv.includes("--quiet");

export interface MeasurementRecord {
  id: string;
  /** Checked against the row label, not trusted: the row is what selects the values. */
  platform?: string[];
  values?: { [k: string]: string };
  /** Must name the column, so a swapped column mapping cannot hide behind unchanged labels. */
  meaning?: { [k: string]: string };
  columns?: { [k: string]: string };
  row?: string;
  conditions?: string;
  exceptions?: string;
  source_page?: string;
  source_anchor?: string;
  source_kind?: string;
  /**
   * Per value, the hedge the source attaches, or `none` when the source states it flat.
   * Required for every prose value: an omitted field used to disable the check entirely.
   */
  qualifiers?: { [k: string]: string };
  /**
   * For a value selected by conditions rather than by one label: the predicate, checked against
   * the row it claims to come from. Contrast needs this; control sizing did not.
   */
  conditions_match?: { [k: string]: string | number };
  /** Who the value belongs to. Required when the page attributes it to another standard. */
  attribution?: string;
}

export interface RecordDoc {
  topic: string;
  source_page?: string;
  source_url?: string;
  source_anchor?: string;
  source_table?: string;
  provenance?: {
    [page: string]: { url: string; retrieved: string; sha256: string; snapshot: string; page_updated?: string };
  };
  tension?: string;
  /** Set when the source attributes its values to another body; makes per-record attribution required. */
  attribution?: string;
  upstream_standard?: { name?: string; criterion?: string; level?: string; url?: string; omitted_by_apples_table?: string[]; note?: string };
  /** Claims about where the source's own rows disagree, asserted rather than described. */
  overlaps?: { between: string[]; when: string; values_disagree: string[]; source_resolves: boolean }[];
  undefined_between?: { description: string; reason: string }[];
  origin?: string;
  method?: string;
  conditions?: string;
  raw_output?: string;
  records: MeasurementRecord[];
}

/**
 * Validate one page's provenance entry, including that the snapshot on disk is the snapshot the
 * record claims.
 *
 * Extracted so the regression suite can call the production code path. An earlier test hashed files
 * with its own helper, which proved only that SHA-256 distinguishes different bytes: disabling the
 * comparison below left all 21 tests passing. A test that cannot fail when the check is removed is
 * not testing the check.
 *
 * `recordsDir` is where a relative `snapshot:` path resolves from.
 */
export async function validateProvenance(
  pageName: string,
  prov: { url?: string; retrieved?: string; sha256?: string; snapshot?: string } | undefined,
  recordsDir: string,
  report: (msg: string) => void,
): Promise<void> {
  if (!prov) {
    report(`no provenance entry for page "${pageName}" (needs url, retrieved, sha256, snapshot)`);
    return;
  }
  for (const field of ["url", "retrieved", "sha256", "snapshot"] as const) {
    if (!prov[field]) report(`provenance has no ${field}`);
  }
  if (!prov.snapshot || !prov.sha256) return;

  const path = join(recordsDir, prov.snapshot);
  if (!(await exists(path))) {
    report(`snapshot "${prov.snapshot}" does not resolve to a file`);
    return;
  }
  // Hash the bytes we hold, not the live response: otherwise the file could be anything.
  const digest = new Bun.CryptoHasher("sha256").update(await readFile(path)).digest("hex");
  if (digest !== prov.sha256) {
    report(
      `snapshot contents do not match the recorded sha256 ` +
        `(recorded ${prov.sha256.slice(0, 12)}…, file is ${digest.slice(0, 12)}…)`,
    );
  }
}

let failed = 0;
let verified = 0;
const fail = (id: string, msg: string) => {
  console.log(`✗ ${id}: ${msg}`);
  failed++;
};

/** The measurement inside a possibly-hedged value: "at least 60 points apart" → "60 points". */
function measurementIn(value: string): string | null {
  const m = /\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?\s*)?(?:pt|px|points?|pixels?)/i.exec(value);
  return m ? m[0] : null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[×✕]/g, "x").trim();

/** Split a row label like "iOS, iPadOS" into the platforms it names. */
const platformsInRow = (row: string) => row.split(/[,/]/).map((p) => norm(p)).filter(Boolean);

/** Verify one record against a fetched page. Exported so tests can drive it offline. */
export function verifyRecord(
  record: MeasurementRecord,
  doc: RecordDoc,
  page: PageData,
  anchor: string,
  report: (id: string, msg: string) => void,
): number {
  let ok = 0;

  if (!page.anchors.has(anchor)) {
    report(record.id, `page has no section "${anchor}"`);
    return 0;
  }
  if (!record.values || !Object.keys(record.values).length) {
    report(record.id, "no values");
    return 0;
  }
  if (!record.conditions?.trim()) report(record.id, "no conditions stated");

  // When the page says its values come from elsewhere, every record must say so too. Publishing
  // WCAG's thresholds as Apple's requirements would misattribute a standard to a vendor.
  if (doc.attribution && !record.attribution?.trim()) {
    report(
      record.id,
      "the source attributes these values to another standard, so this record must carry `attribution`",
    );
  }

  // ---- Table-sourced: resolve section → table → row → column, then cross-check the labels. ----
  if (!record.source_kind) {
    if (!record.row) {
      report(record.id, "table-sourced record must name the `row` its values come from");
      return 0;
    }

    // Derive platform from the row rather than trusting the label — but only when the row really
    // is a platform. Control sizing's first column is "Platform"; contrast's is "Text size", and
    // demanding a platform there was this check over-generalising from one table.
    const table = page.tables.find(
      (tb) => tb.anchor === anchor && tb.rows.some((r) => r.length && norm(r[0]!) === norm(record.row!)),
    );
    const rowIsPlatform = table ? norm(table.header[0] ?? "") === "platform" : false;

    if (rowIsPlatform) {
      const fromRow = platformsInRow(record.row);
      const claimed = (record.platform ?? []).map(norm);
      if (!claimed.length) {
        report(record.id, "no platform, but the row names one");
      } else {
        const extra = claimed.filter((p) => !fromRow.includes(p));
        const missing = fromRow.filter((p) => !claimed.includes(p));
        if (extra.length || missing.length) {
          report(
            record.id,
            `platform [${claimed.join(", ")}] disagrees with the row it selects ("${record.row}" → [${fromRow.join(", ")}])`,
          );
        }
      }
    } else if (record.platform?.length) {
      // The converse: claiming a platform a non-platform row cannot support.
      report(
        record.id,
        `declares platform [${record.platform.join(", ")}], but its row "${record.row}" is a ` +
          `"${table?.header[0] ?? "?"}" value, which selects no platform`,
      );
    }

    // A conditional record must have its predicate agree with the row and the other condition
    // columns. Contrast selects by size AND weight, so a record can name the right cell and still
    // describe the wrong combination.
    if (record.conditions_match && table) {
      const rowCells = table.rows.find((r) => r.length && norm(r[0]!) === norm(record.row!));
      if (rowCells) {
        for (const [index, header] of table.header.entries()) {
          if (index === 0) continue;
          const declared = record.conditions_match[norm(header).replace(/\s+/g, "_")];
          if (declared === undefined) continue;
          const cell = norm(rowCells[index] ?? "");
          if (cell === "all" && norm(String(declared)) !== "any") {
            report(
              record.id,
              `condition "${header}" says "${declared}", but the row's cell is "All"; use \`any\``,
            );
          } else if (cell !== "all" && cell !== norm(String(declared))) {
            report(record.id, `condition "${header}"="${declared}" disagrees with the row's cell "${rowCells[index]}"`);
          }
        }
      }
    }

    for (const [key, value] of Object.entries(record.values)) {
      const column = record.columns?.[key];
      if (!column) {
        report(record.id, `value "${key}" names no source column; without one, default and minimum are indistinguishable`);
        continue;
      }

      // The stated meaning must describe the column it is mapped to. Swapping values and columns
      // together leaves the labels intact but wrong, which is invisible unless they are compared.
      const meaning = record.meaning?.[key];
      if (!meaning) {
        report(record.id, `value "${key}" has no stated meaning — a bare number is the error this format prevents`);
      } else if (!norm(meaning).includes(norm(column))) {
        report(
          record.id,
          `value "${key}" is taken from column "${column}" but its meaning says "${meaning}" — the label does not name the column it describes`,
        );
      }

      const cell = resolveTableCell(page, anchor, record.row, column);
      if (cell === null) {
        const tables = page.tables.filter((t) => t.anchor === anchor);
        report(
          record.id,
          `could not resolve ${anchor} → row "${record.row}" → column "${column}". ` +
            `Tables there: ${tables.map((t) => `[${t.header.join(" | ")}]`).join(", ") || "(none)"}`,
        );
        continue;
      }
      if (norm(cell) !== norm(value)) {
        report(record.id, `${anchor} → "${record.row}" → "${column}" holds "${cell}", but the record says ${key}="${value}"`);
        continue;
      }
      ok++;
    }
    return ok;
  }

  // ---- Prose-sourced: constrain to the cited passage, and require an explicit qualifier. ----
  const text = sectionText(page, anchor);
  if (!text) {
    report(record.id, `no prose found under section "${anchor}"`);
    return 0;
  }
  const haystack = norm(text);
  for (const [key, value] of Object.entries(record.values)) {
    if (!record.meaning?.[key]) {
      report(record.id, `value "${key}" has no stated meaning`);
    }
    const needle = measurementIn(value);
    if (!needle) {
      report(record.id, `value ${key}="${value}" contains no measurement to verify`);
      continue;
    }
    if (!haystack.includes(norm(needle))) {
      report(record.id, `value ${key}="${value}" does not appear in the text under ${anchor}`);
      continue;
    }

    // A qualifier must be declared for every prose value, including "none". Omitting the field
    // used to skip this check, so a record could publish "60 points" where the source says
    // "at least 60 points" and pass.
    const qualifier = record.qualifiers?.[key];
    if (qualifier === undefined) {
      report(
        record.id,
        `value "${key}" declares no qualifier; state the source's hedge (e.g. "at least", "about", ` +
          `"or more") or \`none\` if the source states it flat`,
      );
      continue;
    }
    if (norm(qualifier) === "none") {
      // Assert the absence rather than assuming it: a hedge next to the number contradicts `none`.
      const around = new RegExp(
        `(at least|about|approximately|no less than|minimum of|up to)\\s+${norm(needle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|` +
          `${norm(needle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(or more|or greater|or larger)`,
      );
      const found = around.exec(haystack);
      if (found) {
        report(record.id, `value "${key}" declares no qualifier, but the source reads "${found[0]}"`);
        continue;
      }
      ok++;
      continue;
    }

    // A qualifier may precede the number ("at least 60 points") or follow it ("16 points or more").
    const escaped = norm(needle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const q = norm(qualifier).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const attached = new RegExp(`${q}\\s+${escaped}|${escaped}\\s+${q}`);
    if (!attached.test(haystack)) {
      report(record.id, `the source under ${anchor} does not attach "${qualifier}" to "${needle}"`);
      continue;
    }
    if (!norm(value).includes(norm(qualifier))) {
      report(record.id, `value ${key}="${value}" drops the source's qualifier "${qualifier}"`);
      continue;
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

    // Snapshot integrity is a per-page property, so check it once per page rather than per record.
    const checkedPages = new Set<string>();

    for (const record of doc.records ?? []) {
      const pageName = record.source_page ?? doc.source_page;
      const anchor = record.source_anchor ?? doc.source_anchor;
      if (!pageName || !anchor) {
        fail(record.id, "no source page or anchor");
        continue;
      }

      const prov = doc.provenance?.[pageName];
      if (!checkedPages.has(pageName)) {
        checkedPages.add(pageName);
        const before = failed;
        await validateProvenance(pageName, prov, dir, (msg) => fail(`${file}:${pageName}`, msg));
        if (!quiet && failed === before && prov?.snapshot) {
          console.log(`  · ${pageName}: snapshot matches its recorded digest`);
        }
      } else if (!prov) {
        fail(record.id, `no provenance entry for page "${pageName}"`);
      }

      const page = await fetchPage(pageName);
      if (!page) {
        fail(record.id, `cited page "${pageName}" could not be fetched or does not exist`);
        continue;
      }
      // Live drift is a separate signal from snapshot integrity: the page moving on is expected and
      // is a prompt to re-verify, not a corrupted record.
      if (prov?.sha256 && !checkedPages.has(`live:${pageName}`)) {
        checkedPages.add(`live:${pageName}`);
        const live = new Bun.CryptoHasher("sha256").update(page.raw).digest("hex");
        if (live !== prov.sha256 && !quiet) {
          console.log(`  ! ${pageName} has changed upstream since the snapshot was taken`);
          console.log(`    values below are checked against the live page; refresh the snapshot if they hold`);
        }
      }

      const before = failed;
      verified += verifyRecord(record, doc, page, anchor, fail);
      if (!quiet && failed === before) {
        console.log(`  ✓ ${record.id} (${(record.platform ?? []).join(", ") || "unscoped"})`);
      }
    }

    // An `overlaps:` claim is itself a claim about the source, so check it rather than trust it:
    // the named records must exist and their values must really differ. A stale overlap entry
    // would tell readers the source is ambiguous where it is not.
    for (const overlap of doc.overlaps ?? []) {
      const ids = overlap.between ?? [];
      const found = ids.map((id) => (doc.records ?? []).find((r) => r.id === id));
      const missing = ids.filter((id, i) => !found[i]);
      if (missing.length) {
        fail(`${file}:overlaps`, `names record(s) that do not exist: ${missing.join(", ")}`);
        continue;
      }
      const values = found.map((r) => Object.values(r!.values ?? {})[0] ?? "");
      const unique = new Set(values.map(norm));
      if (unique.size < 2) {
        fail(
          `${file}:overlaps`,
          `claims ${ids.join(" and ")} disagree, but both give "${values[0]}" — the overlap is not a conflict`,
        );
      } else if (overlap.values_disagree) {
        const declared = overlap.values_disagree.map(norm).sort().join(",");
        const actual = [...unique].sort().join(",");
        if (declared !== actual) {
          fail(`${file}:overlaps`, `declares values_disagree ${overlap.values_disagree.join(" vs ")}, but the records hold ${values.join(" vs ")}`);
        }
      }
      if (!quiet) console.log(`  · overlap documented: ${ids.join(" / ")} → ${values.join(" vs ")} (source resolves: ${overlap.source_resolves})`);
    }
  }

  console.log("");
  if (failed) {
    log.warn(`${failed} record problem(s)`);
    process.exit(1);
  }
  log.info(`${verified} measurement value(s) resolved to a specific cell or passage in the live source`);
}
