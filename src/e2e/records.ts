#!/usr/bin/env bun
/**
 * Verify measurement records against the source they cite.
 *
 * A record is the only route by which a number may enter published guidance, so a record that
 * drifts is worse than no record: it is a wrong number wearing a citation. This re-reads the live
 * page and checks that every value still appears in the section the record names.
 *
 * **Why this exists rather than a regex over prose.** The previous rule banned measurements from
 * `guidance/` outright, which was a blunt reaction to having quoted "44pt" carelessly. It stopped
 * the symptom and prevented the cure: a skill that cannot state a number cannot answer the question
 * an agent most often gets wrong. But relaxing to "a number is fine if it names a platform and
 * cites a section" would not have caught the error that prompted this file. I proposed publishing
 * "iOS minimum target is 44x44 pt" — platform named, section citable, and **wrong**, because
 * Apple's table gives 44x44 as the *Default* and 28x28 as the *Minimum*. A regex cannot tell that a
 * citation fails to support its claim. A record can, because it has to name which column a value
 * came from, and this script checks the column header is really there.
 *
 * What it verifies, per record:
 *   - the cited page exists and is its own document (not a redirect or a shell);
 *   - the cited section anchor exists on that page;
 *   - every value string still appears in the page's data;
 *   - for table-sourced records, the declared table header still matches the live table;
 *   - the record declares meaning, conditions, and a snapshot version.
 *
 * Network-dependent, so not part of `bun run check`. Run when editing records, and on a schedule.
 *
 * Usage: bun run src/e2e/records.ts [--quiet]
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { ROOT, exists } from "../util/fs.ts";
import { log } from "../util/log.ts";

const UA = "design-skills/0.1 (+https://github.com/duyanhv/design-skills; guideline compiler)";
const quiet = process.argv.includes("--quiet");

interface MeasurementRecord {
  id: string;
  platform?: string[];
  values?: { [k: string]: string };
  meaning?: { [k: string]: string };
  conditions?: string;
  exceptions?: string;
  source_page?: string;
  source_anchor?: string;
  source_kind?: string;
}
interface Doc {
  topic: string;
  source_page: string;
  source_url: string;
  source_anchor: string;
  source_table?: string;
  source_version: string;
  tension?: string;
  /** Set on a file of measured observations: marks it as ours, not the source's. */
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

/** Fetch a page's structured render: title, anchors, raw text, and its tables with section + header. */
const cache = new Map<string, PageData | null>();
interface PageData {
  title: string | null;
  anchors: Set<string>;
  raw: string;
  tables: { anchor: string | null; header: string[] }[];
}

/** Pull the visible text out of a DocC inline-content node. */
function nodeText(node: unknown): string {
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node && typeof node === "object") {
    const r = node as Record<string, unknown>;
    if (r.type === "text" && typeof r.text === "string") return r.text;
    return Object.values(r).map(nodeText).join("");
  }
  return "";
}

/**
 * Walk the render, tracking the most recent heading anchor, and collect each table's first row as
 * its header. Apple's DocC emits `{type: "table", header: "row", rows: [...]}`, so the header cells
 * are the first row rather than a separate field.
 */
function collectTables(node: unknown, out: PageData["tables"], current: { anchor: string | null }): void {
  if (Array.isArray(node)) {
    for (const child of node) collectTables(child, out, current);
    return;
  }
  if (!node || typeof node !== "object") return;
  const r = node as Record<string, unknown>;
  if (r.type === "heading" && typeof r.anchor === "string") current.anchor = r.anchor;
  if (r.type === "table" && Array.isArray(r.rows) && r.rows.length) {
    out.push({ anchor: current.anchor, header: (r.rows[0] as unknown[]).map(nodeText) });
  }
  for (const value of Object.values(r)) collectTables(value, out, current);
}

async function fetchPage(page: string): Promise<PageData | null> {
  if (cache.has(page)) return cache.get(page)!;
  const url = `https://developer.apple.com/tutorials/data/design/human-interface-guidelines/${page}.json`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) {
      cache.set(page, null);
      return null;
    }
    const raw = await res.text();
    const data = JSON.parse(raw) as { metadata?: { title?: string } };
    const anchors = new Set<string>();
    for (const m of raw.matchAll(/"anchor"\s*:\s*"([^"]+)"/g)) anchors.add(m[1]!);
    const tables: PageData["tables"] = [];
    collectTables(data, tables, { anchor: null });
    const out = { title: data.metadata?.title ?? null, anchors, raw, tables };
    cache.set(page, out);
    return out;
  } catch {
    cache.set(page, null);
    return null;
  }
}

/** Normalise for comparison: Apple writes 44x44 pt, a record may write 44x44 pt. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[×✕]/g, "x").trim();

const dir = join(ROOT, "guidance", "apple-design", "records");
if (!(await exists(dir))) {
  log.info("no records directory, nothing to verify");
  process.exit(0);
}

for (const file of (await readdir(dir)).filter((f) => f.endsWith(".yaml")).sort()) {
  const doc = parse(await readFile(join(dir, file), "utf8")) as Doc;

  // Two kinds of record, warranted differently. A source-derived record is checkable against
  // Apple's page and must be. A measured record is our own observation, warranted by a re-runnable
  // probe, with no source page to verify against — checking it here would be a category error, and
  // silently "passing" it would imply a verification that never happened. So it is reported as
  // skipped, with the artifact that does warrant it named.
  if (doc.origin) {
    if (!quiet) {
      console.log(`\n== ${file} (${doc.records?.length ?? 0} measured records)`);
      console.log(`   not verified here: these are our measurements, not Apple's values`);
      console.log(`   warranted by: ${doc.origin}${doc.raw_output ? ` (raw output: ${doc.raw_output})` : ""}`);
      if (!doc.method) fail(file, "a measured record file must state its method");
      if (!doc.conditions) fail(file, "a measured record file must state the conditions it was taken under");
    }
    continue;
  }

  if (!quiet) console.log(`\n== ${file} (${doc.records?.length ?? 0} records, snapshot ${doc.source_version})`);
  if (!doc.source_version) fail(file, "no source_version: a value that cannot be re-verified is not a record");

  for (const record of doc.records ?? []) {
    const page = record.source_page ?? doc.source_page;
    const anchor = record.source_anchor ?? doc.source_anchor;
    const fetched = await fetchPage(page);

    if (!fetched) {
      fail(record.id, `cited page "${page}" could not be fetched or does not exist`);
      continue;
    }
    if (!fetched.anchors.has(anchor)) {
      fail(record.id, `page "${page}" has no section "${anchor}"`);
      continue;
    }

    // Structure the record must carry for its numbers to mean anything.
    if (!record.values || !Object.keys(record.values).length) {
      fail(record.id, "no values");
      continue;
    }
    for (const key of Object.keys(record.values)) {
      if (!record.meaning?.[key]) {
        fail(record.id, `value "${key}" has no stated meaning — a bare number is the error this format exists to prevent`);
      }
    }
    if (!record.conditions?.trim()) fail(record.id, "no conditions stated");

    // The values themselves must still be present in the live page.
    const haystack = norm(fetched.raw);
    for (const [key, value] of Object.entries(record.values)) {
      // Prose values are hedged ("about 12 points of padding"); match the measurement inside them.
      const measurement = /(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*(?:pt|px)|\d+(?:\.\d+)?\s*(?:pt|px|points?))/i.exec(value);
      const needle = norm(measurement ? measurement[0] : value);
      if (!haystack.includes(needle)) {
        fail(record.id, `value ${key}="${value}" (searched "${needle}") no longer appears on ${page}`);
      } else {
        verified++;
      }
    }

    // For a table-sourced record, the column headers are what give the values their meaning, so a
    // renamed or reordered table must fail rather than pass on the numbers alone.
    //
    // This must read the page's actual table structure, not its raw text. Three weaker versions
    // failed in turn: searching for each header independently passed a record that borrowed
    // "Minimum size" from the page's *text size* table; allowing a few hundred characters between
    // headers matched through an unrelated sentence containing "default and minimum sizes"; and
    // even a tight sequence match still accepted "Platform | Default size | Minimum size", which is
    // the genuine header of a *different table on the same page*. Only comparing against the parsed
    // header row of the table in the record's own section distinguishes them — and that distinction
    // is the whole point, since it is the default-versus-minimum confusion this format prevents.
    const table = doc.source_table;
    if (table && !record.source_kind) {
      const declared = table.split("|").map((h) => norm(h)).filter(Boolean);
      const inSection = fetched.tables.filter((t) => t.anchor === anchor);
      if (!inSection.length) {
        fail(record.id, `no table found under section "${anchor}" on ${page}, but the record declares one`);
      } else if (!inSection.some((t) => t.header.map(norm).join(" | ") === declared.join(" | "))) {
        const actual = inSection.map((t) => `"${t.header.join(" | ")}"`).join(", ");
        fail(
          record.id,
          `declared table header "${table}" does not match the table under ${page}#${anchor}. ` +
            `That section actually has: ${actual}`,
        );
      }
    }

    if (!quiet && !failed) console.log(`  ✓ ${record.id} (${(record.platform ?? []).join(", ") || "unscoped"})`);
  }
}

console.log("");
if (failed) {
  log.warn(`${failed} record problem(s)`);
  process.exit(1);
}
log.info(`${verified} measurement value(s) verified against the live source`);
