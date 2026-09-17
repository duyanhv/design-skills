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
import {
  fetchPage, resolveTableCell, findTable, sectionText, parsePredicate, intersects,
  type PageData, type Predicate,
} from "./record-source.ts";

const quiet = process.argv.includes("--quiet");

export interface MeasurementRecord {
  id: string;
  /** For local_ir records: the rule id in the IR build the value comes from. */
  rule?: string;
  /** Per value, which clause of that rule states it: "statement", "rationale", or "note:N". */
  clauses?: { [k: string]: string };
  /** Per value, the exact phrase that states it. Must contain the value and appear in the clause. */
  context?: { [k: string]: string };
  /** Per value, the authority claimed for it; checked against the clause's own marking. */
  authority?: { [k: string]: string };
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
  /** "local_ir" marks a file verified against a local IR build instead of Apple's DocC. */
  source_kind?: string;
  source_build?: string;
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
/**
 * Strip the comparison/unit suffix so two records' predicates for the same dimension can be
 * compared. `text_size_max_pt` and `text_size_exact_pt` both constrain text size; keying on the
 * raw names made an overlap claim between them silently skip instead of being evaluated.
 */
function conditionDimension(key: string): string {
  return key.replace(/_(max|min|exact|eq)(_[a-z]+)?$/, "").replace(/_(pt|pts|px|point|points)$/, "");
}
/** One rule from a local IR build, with its clauses kept apart rather than concatenated. */
export interface IrRule {
  statement?: string;
  rationale?: string;
  notes: string[];
  /** WCAG marks each note normative or informative. A normative claim cannot rest on a note. */
  noteAuthority: string[];
}

/**
 * Load rule id -> its clauses from a local IR build.
 *
 * This used to join every field into one string, which is what let an audit swap "18 point" for
 * "14 point": both live in the same rule, so a substring search could not tell them apart. Keeping
 * the clauses separate is the first half of the fix; the `context` pattern is the second.
 */
async function loadIrRules(build: string): Promise<Map<string, IrRule> | undefined> {
  const dir = join(ROOT, build, "pages");
  if (!build || !(await exists(dir))) return undefined;
  const rules = new Map<string, IrRule>();
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    const page = JSON.parse(await readFile(join(dir, file), "utf8")) as {
      rules?: {
        id: string; statement?: string; rationale?: string;
        notes?: string[]; note_authority?: string[];
      }[];
    };
    for (const rule of page.rules ?? []) {
      rules.set(rule.id, {
        statement: rule.statement,
        rationale: rule.rationale,
        notes: rule.notes ?? [],
        noteAuthority: rule.note_authority ?? [],
      });
    }
  }
  return rules;
}

/** Resolve a clause name ("statement", "rationale", "note:2") to its text. */
function clauseText(rule: IrRule, name: string): string | undefined {
  const n = norm(name);
  if (n === "statement") return rule.statement;
  if (n === "rationale") return rule.rationale;
  const note = /^note:(\d+)$/.exec(n);
  if (note) return rule.notes[Number(note[1])];
  return undefined;
}

/**
 * Whether a clause is normative or informative.
 *
 * WCAG's own distinction, and it matters for what a record may claim: the 18/14 point thresholds
 * sit in a glossary definition's rationale, while the reason those sizes were chosen sits in an
 * informative note. A record that cited the note as if it bound implementers would overstate it.
 */
function clauseAuthority(rule: IrRule, name: string): string {
  const n = norm(name);
  const note = /^note:(\d+)$/.exec(n);
  if (note) return rule.noteAuthority[Number(note[1])] ?? "unmarked";
  return "normative";
}

/** Rebuild a record's predicate for one condition dimension, so overlap claims can be evaluated. */
function predicateFor(record: MeasurementRecord, dimension: string): Predicate | undefined {
  const entry = Object.entries(record.conditions_match ?? {}).find(
    ([k]) => conditionDimension(k) === dimension,
  );
  if (!entry) return undefined;
  const [key, raw] = entry;
  if (raw === undefined) return undefined;
  if (norm(String(raw)) === "any") return { kind: "any" };
  const n = Number(raw);
  if (Number.isFinite(n)) {
    return key.includes("_max")
      ? { kind: "max", value: n, unit: "pt" }
      : { kind: "exact", value: n, unit: "pt" };
  }
  return { kind: "literal", text: norm(String(raw)) };
}

function describePredicate(p: Predicate): string {
  switch (p.kind) {
    case "any": return "any";
    case "max": return `<= ${p.value}${p.unit}`;
    case "exact": return `= ${p.value}${p.unit}`;
    case "literal": return p.text;
  }
}


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

    // A conditional record must have a predicate for EVERY condition column, and each predicate
    // must evaluate the same way its source cell does.
    //
    // This check used to compare strings and skip column 0, which made it decorative. An audit
    // changed `text_size_max_pt: 17` to `99`, deleted `text_weight`, and deleted `conditions_match`
    // outright; all three passed. A record could name the right cell and still describe the wrong
    // combination, which is the one thing conditions exist to prevent.
    if (table && record.row) {
      const rowCells = table.rows.find((r) => r.length && norm(r[0]!) === norm(record.row!));
      if (rowCells) {
        const declaredAll = record.conditions_match ?? {};
        for (const [index, header] of table.header.entries()) {
          // Skip value columns; those are checked against `values` further down.
          if (record.columns && Object.values(record.columns).some((c) => norm(c) === norm(header))) continue;
          // Skip a platform column: the platform branch above already verifies it against the row,
          // so requiring a second predicate would be asking for the same fact twice.
          if (norm(header) === "platform") continue;
          const key = norm(header).replace(/\s+/g, "_");
          const cell = rowCells[index] ?? "";
          const predicate = parsePredicate(cell);

          // Keys may carry a comparison/unit suffix (text_size -> text_size_max_pt), so match on
          // prefix in both directions rather than requiring an exact name.
          const entry = Object.entries(declaredAll).find(
            ([k]) => k === key || k.startsWith(`${key}_`) || key.startsWith(k),
          );
          if (!entry) {
            report(
              record.id,
              `names row "${record.row}" but declares no condition for column "${header}" ` +
                `(cell: "${cell}"); a record missing a predicate cannot be matched against a real case`,
            );
            continue;
          }
          const [declaredKey, declaredValue] = entry;
          const declaredText = String(declaredValue);

          if (predicate.kind === "any") {
            if (norm(declaredText) !== "any") {
              report(record.id, `condition "${header}" says "${declaredText}", but the cell is "${cell}"; use \`any\``);
            }
          } else if (predicate.kind === "literal") {
            if (norm(declaredText) !== norm(predicate.text)) {
              report(record.id, `condition "${header}"="${declaredText}" disagrees with the cell "${cell}"`);
            }
          } else {
            const declaredNum = Number(declaredText);
            if (!Number.isFinite(declaredNum)) {
              report(record.id, `condition "${declaredKey}"="${declaredText}" is not numeric, but the cell "${cell}" is`);
              continue;
            }
            // The key's unit suffix must agree with the cell's unit. Without this, renaming
            // text_size_max_pt to text_size_max_px passed silently: same number, different
            // quantity. Equivalent spellings of one unit are fine; a different unit is not.
            const UNIT_ALIASES: Record<string, string> = {
              pt: "pt", pts: "pt", point: "pt", points: "pt",
              px: "px", pixel: "px", pixels: "px",
              dp: "dp",
            };
            const cellUnit = UNIT_ALIASES[predicate.unit.toLowerCase()] ?? predicate.unit.toLowerCase();
            const keyUnitRaw = /_([a-z]+)$/.exec(declaredKey)?.[1] ?? "";
            const keyUnit = UNIT_ALIASES[keyUnitRaw];
            if (!keyUnit) {
              report(
                record.id,
                `condition "${declaredKey}" states no unit, but the cell "${cell}" is in ${cellUnit}; ` +
                  `end the key with the unit (e.g. ..._${cellUnit})`,
              );
            } else if (keyUnit !== cellUnit) {
              report(
                record.id,
                `condition "${declaredKey}" is in ${keyUnit}, but the cell "${cell}" is in ${cellUnit}`,
              );
            }

            const wantsMax = declaredKey.includes("_max");
            const wantsExact = declaredKey.includes("_exact") || declaredKey.includes("_eq");
            if (predicate.kind === "max" && !wantsMax) {
              report(
                record.id,
                `cell "${cell}" is an upper bound, but "${declaredKey}" does not say so; ` +
                  `name it \`..._max_${predicate.unit.replace(/s$/, "")}\``,
              );
            }
            if (predicate.kind === "exact" && (wantsMax || !wantsExact)) {
              report(
                record.id,
                `cell "${cell}" names one exact size, but "${declaredKey}" does not declare an exact match; ` +
                  `the row does not read "${predicate.value} or larger"`,
              );
            }
            if (declaredNum !== predicate.value) {
              report(
                record.id,
                `condition "${declaredKey}"=${declaredNum} does not match the cell "${cell}" (${predicate.value})`,
              );
            }
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

/**
 * A complete measurement token: a number with its unit, as written.
 *
 * Substring matching over prose cannot represent this, and that gap was real: "8 point" matched
 * inside "at least 18 point", "4 point" inside "14 point bold", and "5:1" inside "at least 4.5:1".
 * Three published values could be corrupted into something the source never says, and every one
 * passed, because a regex over characters has no idea where a number begins.
 *
 * So numbers are parsed and compared as numbers.
 */
interface Measurement {
  value: number;
  /** Normalised unit: "pt" for point-like units, "ratio" for an X:1 contrast ratio. */
  unit: string;
  /** The token as it appeared, for error messages. */
  text: string;
}

const MEASUREMENT_TOKEN =
  /(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(pts?|points?|px|pixels?|dp)\b/gi;

const POINT_UNITS: Record<string, string> = {
  pt: "pt", pts: "pt", point: "pt", points: "pt",
  px: "px", pixel: "px", pixels: "px", dp: "dp",
};

/** Every complete measurement in a piece of text, in order. */
export function measurementsIn(text: string): Measurement[] {
  const found: Measurement[] = [];
  for (const m of norm(text).matchAll(MEASUREMENT_TOKEN)) {
    if (m[1] !== undefined && m[2] !== undefined) {
      // "4.5:1" — a ratio. Recorded against its denominator so "4.5:1" and "9:2" stay distinct.
      found.push({ value: Number(m[1]) / Number(m[2]), unit: "ratio", text: norm(m[0]) });
    } else if (m[3] !== undefined && m[4] !== undefined) {
      const unit = POINT_UNITS[m[4].toLowerCase()] ?? m[4].toLowerCase();
      found.push({ value: Number(m[3]), unit, text: norm(m[0]) });
    }
  }
  return found;
}

/** Parse a record's declared value into exactly one measurement, or undefined if it is not one. */
function soleMeasurement(value: string): Measurement | undefined {
  const found = measurementsIn(value);
  return found.length === 1 ? found[0] : undefined;
}

export function sameMeasurement(a: Measurement, b: Measurement): boolean {
  return a.unit === b.unit && a.value === b.value;
}

/**
 * Condition markers this checker can read out of a source's own prose.
 *
 * These are OUR classifications applied to W3C's words, not W3C's taxonomy, and that distinction
 * matters: the lexicon is how a record's declared condition gets checked against the text instead
 * of merely sitting beside it. An audit swapped two records' values AND their context phrases
 * together, leaving each record's stated meaning untouched, and everything passed. The checker
 * proved the phrase existed; nothing proved the phrase supported the condition the record claimed.
 *
 * `from` says which scope the marker is read from, and the two are not interchangeable:
 *
 *   context - a property of the pinned phrase itself. Weight is per-threshold: one clause names
 *             both "18 point" and "14 point bold", so reading weight from the whole clause would
 *             make every threshold in it look bold.
 *   clause  - the case the clause as a whole is about.
 *   entry   - the clause plus the rule's own heading. Needed for glossary terms, where the
 *             defining phrase is the statement ("large scale (text)") and the clause holding the
 *             numbers is its rationale. Reading scale from the rationale alone would make the
 *             definition of large scale look like it was not about large scale. Still narrower
 *             than the whole rule: informative notes are excluded, so a note that merely mentions
 *             a term cannot license a condition.
 */
const CONDITION_LEXICON: {
  dimension: string;
  term: string;
  from: "context" | "clause" | "entry";
  pattern: RegExp;
}[] = [
  { dimension: "text_weight", term: "bold", from: "context", pattern: /\bbold\b/i },
  { dimension: "text_scale", term: "large", from: "entry", pattern: /\blarge[- ]?scale\b|\blarge text\b/i },
];

/** Every dimension the lexicon knows about, in declaration order. */
const CONDITION_DIMENSIONS = [...new Set(CONDITION_LEXICON.map((m) => m.dimension))];

/**
 * Read the conditions a source's own words express.
 *
 * A dimension with no marker present is "any": the source did not narrow that axis. That default
 * is what makes the swap detectable — "at least 18 point" says nothing about weight, so it cannot
 * support a record claiming the bold case.
 */
export function deriveConditions(context: string, clause: string, heading = ""): Map<string, string> {
  const derived = new Map<string, string>();
  for (const dimension of CONDITION_DIMENSIONS) derived.set(dimension, "any");
  for (const marker of CONDITION_LEXICON) {
    const text =
      marker.from === "context" ? context : marker.from === "clause" ? clause : `${heading} ${clause}`;
    if (marker.pattern.test(norm(text))) derived.set(marker.dimension, marker.term);
  }
  return derived;
}

/**
 * Verify one file of local_ir records against a loaded IR build. Exported so the swaps an audit
 * used can be committed as tests rather than re-run by hand.
 */
export function verifyIrRecords(
  doc: RecordDoc,
  rules: Map<string, IrRule>,
  report: (id: string, message: string) => void,
  onPass?: (id: string, message: string) => void,
): number {
  let verified = 0;
  for (const record of doc.records ?? []) {
    if (!record.rule) {
      report(record.id, "a local_ir record must name the `rule` its value comes from");
      continue;
    }
    const rule = rules.get(record.rule);
    if (rule === undefined) {
      report(record.id, `names rule "${record.rule}", which does not exist in ${doc.source_build}`);
      continue;
    }
    if (!record.attribution?.trim()) {
      report(record.id, "a local_ir record must carry `attribution`: these are another body's values");
    }

    for (const [key, value] of Object.entries(record.values ?? {})) {
      const clauseName = record.clauses?.[key];
      if (!clauseName) {
        report(record.id, `value "${key}" names no \`clause\`; without one, any occurrence of the number in the rule would do`);
        continue;
      }
      const clause = clauseText(rule, clauseName);
      if (clause === undefined) {
        report(record.id, `value "${key}" names clause "${clauseName}", which ${record.rule} does not have`);
        continue;
      }

      // The context pattern is the record's claim about what the number MEANS in that clause.
      // It must contain the value, so a pattern cannot match somewhere the value is not.
      const context = record.context?.[key];
      if (!context) {
        report(record.id, `value "${key}" names no \`context\` pattern; the clause alone does not distinguish two numbers in one sentence`);
        continue;
      }
      // The value must be a complete measurement, and the context must contain THAT measurement,
      // compared as a number and a unit rather than as characters.
      //
      // The previous version matched substrings, so "8 point" was accepted as appearing in "at
      // least 18 point" and "5:1" inside "at least 4.5:1". Tokenising removes the whole class:
      // 8 != 18, whatever the characters do.
      const declaredValue = soleMeasurement(String(value));
      if (!declaredValue) {
        report(
          record.id,
          `value "${key}"="${value}" is not a single measurement this checker can parse ` +
            `(expected e.g. "18 point" or "4.5:1"); an unparsed value could only be string-matched`,
        );
        continue;
      }
      const contextMeasurements = measurementsIn(context);
      const matching = contextMeasurements.filter((m) => sameMeasurement(m, declaredValue));
      if (!matching.length) {
        report(
          record.id,
          `context for "${key}" does not state "${value}" as a measurement` +
            (contextMeasurements.length
              ? ` (it states ${contextMeasurements.map((m) => `"${m.text}"`).join(", ")})`
              : " (it states none)"),
        );
        continue;
      }
      // A context holding two different measurements of the same kind is ambiguous: it would
      // accept either one, so it is not pinning this value.
      const distinct = new Set(
        contextMeasurements.filter((m) => m.unit === declaredValue.unit).map((m) => m.value),
      );
      if (distinct.size > 1) {
        report(
          record.id,
          `context for "${key}" contains more than one candidate value ` +
            `(${contextMeasurements.filter((m) => m.unit === declaredValue.unit).map((m) => m.text).join(", ")}), ` +
            `so it does not pin "${value}"; use a phrase that states this case alone`,
        );
        continue;
      }

      // The phrase must appear in the clause, and the clause must state the same measurement.
      // The phrase check alone would accept a context whose number the clause spells differently.
      const contextRe = norm(context).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
      const clauseStatesValue = measurementsIn(clause).some((m) => sameMeasurement(m, declaredValue));
      if (!new RegExp(contextRe, "i").test(norm(clause)) || !clauseStatesValue) {
        report(
          record.id,
          `value "${key}"="${value}" is not stated as "${context}" in ${record.rule} (${clauseName}); ` +
            `the number may appear there for a different case`,
        );
        continue;
      }

      // The record's declared conditions must be the ones the source's own words express.
      //
      // Everything above proves the phrase exists and pins the value. None of it proves the phrase
      // is about the case the record says it is. An audit swapped the regular and bold records'
      // values AND contexts together and both passed: each still cited a real phrase containing
      // its number, while the meaning and conditions still described the other case. It also gave
      // the large-text record the general ratio's value, context and clause while keeping its
      // large-text conditions, and that passed too.
      //
      // So derive the conditions from the source and require agreement. "at least 18 point" is
      // silent about weight, so it cannot support text_weight: bold; the criterion's general
      // statement is not the Large Text exception, so it cannot support text_scale: large.
      // The heading is the rule's own statement, and is only consulted for `entry` markers. For a
      // criterion the statement IS a clause, so passing it changes nothing there; for a glossary
      // term it is the term being defined.
      const derived = deriveConditions(context, clause, rule.statement ?? "");
      const declaredConditions = record.conditions_match ?? {};
      if (!Object.keys(declaredConditions).length) {
        report(
          record.id,
          `value "${key}" declares no \`conditions_match\`; a phrase can be real and still be about ` +
            `another case, so the conditions must be checked against the source rather than asserted`,
        );
        continue;
      }
      let conditionMismatch = false;
      for (const [dimension, expected] of derived) {
        const declared = declaredConditions[dimension];
        if (declared === undefined) {
          report(
            record.id,
            `value "${key}" declares no "${dimension}"; the source phrase implies ${dimension}=${expected}, ` +
              `and an undeclared dimension cannot be checked`,
          );
          conditionMismatch = true;
          continue;
        }
        if (norm(String(declared)) !== expected) {
          report(
            record.id,
            `value "${key}" declares ${dimension}=${declared}, but "${context}" in ${record.rule} ` +
              `(${clauseName}) expresses ${dimension}=${expected}`,
          );
          conditionMismatch = true;
        }
      }
      for (const dimension of Object.keys(declaredConditions)) {
        if (!derived.has(dimension)) {
          report(
            record.id,
            `value "${key}" declares "${dimension}", which this checker cannot read from the source; ` +
              `add it to CONDITION_LEXICON or the condition is unverified`,
          );
          conditionMismatch = true;
        }
      }
      if (conditionMismatch) continue;

      // Discrimination: the context must not be satisfiable by a SIBLING record's value.
      //
      // "14 point bold" and "at least 18 point" both pin their number. But weaken the bold
      // context to a bare "14 point" and it still passes a containment test, while no longer
      // saying anything about weight. Substituting the sibling's value exposes that: "18 point"
      // does occur in the clause, so the weakened context would have been just as true of the
      // other case. A context that cannot tell two cases apart is not binding a value to its
      // condition, which is the whole purpose.
      const siblings = (doc.records ?? []).filter(
        (r) => r.id !== record.id && r.rule === record.rule &&
          norm(r.clauses?.[Object.keys(r.values ?? {})[0] ?? ""] ?? "") === norm(clauseName),
      );
      let ambiguous: string | undefined;
      for (const sibling of siblings) {
        for (const other of Object.values(sibling.values ?? {})) {
          if (norm(String(other)) === norm(String(value))) continue;
          const otherMeasurement = soleMeasurement(String(other));
          if (!otherMeasurement) continue;
          const swapped = norm(context).replace(
            new RegExp(matching[0]!.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"), "gi"),
            norm(String(other)),
          );
          const swappedRe = swapped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
          if (new RegExp(swappedRe, "i").test(norm(clause))) ambiguous = String(other);
        }
      }
      if (ambiguous) {
        report(
          record.id,
          `context "${context}" would be equally true of ${ambiguous} ` +
            `(the same phrase with ${ambiguous} substituted ` +
            `also appears in ${record.rule}); it does not bind "${value}" to this case`,
        );
        continue;
      }

      // A normative claim must not rest on an informative note. WCAG marks which is which.
      const authority = clauseAuthority(rule, clauseName);
      const declared = record.authority?.[key];
      if (declared && norm(declared) !== norm(authority)) {
        report(record.id, `value "${key}" declares authority "${declared}", but ${clauseName} of ${record.rule} is ${authority}`);
        continue;
      }

      verified += 1;
      onPass?.(record.id, `"${value}" as "${context}" in ${record.rule} (${clauseName}, ${authority})`);
    }
  }

  return verified;
}

if (import.meta.main) {
  const dir = join(ROOT, "guidance", "apple-design", "records");
  if (!(await exists(dir))) {
    log.info("no records directory, nothing to verify");
    process.exit(0);
  }

  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".yaml")).sort()) {
    const doc = parse(await readFile(join(dir, file), "utf8")) as RecordDoc;

    // Records taken from a local IR build (WCAG) rather than Apple's live DocC.
    //
    // The first version of this branch asked only whether the value appeared ANYWHERE in the named
    // rule. An audit defeated it three times over: "14 point" and "18 point" both occur in the
    // large-scale definition, and "4.5:1" and "3:1" both occur in SC 1.4.3, so every threshold
    // could be swapped for another one from the same sentence and still pass. That is the same
    // defect as the string-comparison hole in the table branch, moved to a new place: finding a
    // number is not verifying a number.
    //
    // A value is now bound to the CLAUSE it comes from (statement, rationale, or note N) and to a
    // `context` pattern that must match the text immediately around it. "18 point" is only
    // acceptable where the surrounding words are the non-bold threshold.
    if (doc.source_kind === "local_ir") {
      if (!quiet) console.log(`\n== ${file} (${doc.records?.length ?? 0} records from ${doc.source_build})`);
      const rules = await loadIrRules(doc.source_build ?? "");
      if (!rules) {
        fail(file, `source_build "${doc.source_build}" is not a readable IR build`);
        continue;
      }
      verified += verifyIrRecords(doc, rules, fail, (id, msg) => {
        if (!quiet) console.log(`  ✓ ${id}: ${msg}`);
      });
      continue;
    }

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
      // An overlap is a claim that one real case matches both rows. Differing values are not
      // enough: "Up to 17 pts" and "18 pts" disagree on ratio but cannot both apply to any size,
      // so calling them an overlap would invent an ambiguity the source does not have.
      // Verified by evaluating the predicates, not by comparing their text.
      const conditionKeys = new Set(
        found.flatMap((r) => Object.keys(r!.conditions_match ?? {}).map(conditionDimension)),
      );
      for (const key of conditionKeys) {
        const preds = found.map((r) => predicateFor(r!, key));
        if (preds.some((x) => x === undefined)) continue;
        if (!preds.slice(1).every((x) => intersects(preds[0]!, x!))) {
          fail(
            `${file}:overlaps`,
            `claims ${ids.join(" and ")} overlap, but their "${key}" conditions cannot both hold ` +
              `(${preds.map((x) => describePredicate(x!)).join(" vs ")}); no case matches both rows`,
          );
        }
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
