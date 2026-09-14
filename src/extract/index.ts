import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import type { Source } from "../schema/source.ts";
import { PageIRSchema, type PageIR, type Rule } from "../schema/ir.ts";
import { parseFrontmatter } from "../normalize/frontmatter.ts";
import { extractRules, EXTRACTOR as BOLD_LEAD, type ExtractedPage } from "./rules.ts";
import { extractWcag, WCAG_EXTRACTOR } from "./wcag.ts";
import { shortHash } from "../util/hash.ts";
import { listFiles, paths, readJson, writeJson } from "../util/fs.ts";
import { log } from "../util/log.ts";

export interface PageMeta {
  slug: string;
  title?: string;
  category?: string;
  url?: string;
  /** Platform scope the source declares for this page (docc `supported-platforms`). */
  platforms?: string[];
}

/** Which extractor a source kind uses; the id is stamped into every IR file. */
export function extractorFor(source: Source): { id: string; run: (md: string, meta: PageMeta) => ExtractedPage } {
  switch (source.kind) {
    case "wcag":
      return { id: WCAG_EXTRACTOR, run: extractWcag };
    default:
      return {
        id: BOLD_LEAD,
        run: (md, meta) =>
          extractRules(md, {
            platforms: source.platforms,
            skipSections: source.skip_sections,
            title: meta.title,
            // Precedence: a manifest override (a human decision) > the source's own declaration >
            // the page title. Title matching is the weakest signal and only fills the remaining gap.
            pagePlatforms: source.page_platforms[meta.slug] ?? meta.platforms,
          }),
      };
  }
}

/**
 * Everything that can change what extraction produces. Reuse is keyed on this rather than on the
 * page body alone, so editing `skip_sections` or a page's platform scope invalidates stale IR.
 */
export function inputHash(source: Source, extractorId: string, body: string, meta: PageMeta): string {
  return shortHash(
    JSON.stringify({
      extractor: extractorId,
      body,
      title: meta.title,
      category: meta.category,
      url: meta.url,
      platforms: source.platforms,
      skip_sections: source.skip_sections,
      page_declared_platforms: meta.platforms ?? null,
      page_platforms: source.page_platforms[meta.slug] ?? null,
    }),
  );
}

export interface ExtractOptions {
  /** Re-extract pages even when neither content nor extractor changed. */
  force?: boolean;
  limit?: number;
  /**
   * This run only covers part of the source (`--limit`), so IR files with no matching normalized
   * page must be left alone instead of being treated as removed upstream.
   */
  partial?: boolean;
}

/** Reuse ids for statements that survived; number new ones after the previous max. */
function assignIds(source: string, slug: string, previous: PageIR | null, statements: string[]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const prevByStatement = new Map((previous?.rules ?? []).map((r) => [norm(r.statement), r.id]));
  let max = 0;
  for (const r of previous?.rules ?? []) {
    const n = Number(r.id.split("/").pop());
    if (n > max) max = n;
  }
  const used = new Set<string>();
  return statements.map((s) => {
    const existing = prevByStatement.get(norm(s));
    if (existing && !used.has(existing)) {
      used.add(existing);
      return existing;
    }
    max += 1;
    const id = `${source}/${slug}/${String(max).padStart(3, "0")}`;
    used.add(id);
    return id;
  });
}

export async function extractSource(
  source: Source,
  opts: ExtractOptions = {},
): Promise<{ extracted: number; skipped: number; removed: number; rules: number }> {
  const files = await listFiles(paths.md(source.id), ".md");
  if (!files.length) throw new Error(`no normalized pages for ${source.id}; run normalize first`);

  let extracted = 0;
  let skipped = 0;
  let rulesTotal = 0;
  const todo = opts.limit ? files.slice(0, opts.limit) : files;
  const extractor = extractorFor(source);
  const partial = opts.partial ?? Boolean(opts.limit);
  const live = new Set<string>();

  for (const file of todo) {
    const slug = file.replace(/\.md$/, "");
    live.add(slug);
    const { meta, body } = parseFrontmatter(await readFile(join(paths.md(source.id), file), "utf8"));
    const previous = await readJson<PageIR>(join(paths.irPages(source.id), `${slug}.json`));
    const pageMeta: PageMeta = {
      slug,
      title: meta.title,
      category: meta.category,
      url: meta.url,
      platforms: meta.platforms ? meta.platforms.split(",").filter(Boolean) : undefined,
    };
    const input_hash = inputHash(source, extractor.id, body, pageMeta);
    if (!opts.force && previous && previous.input_hash === input_hash) {
      skipped++;
      rulesTotal += previous.rules.filter((r) => r.kind === "rule").length;
      continue;
    }

    const page = extractor.run(body, pageMeta);
    const ids = assignIds(source.id, slug, previous, page.rules.map((r) => r.statement));
    const rules: Rule[] = page.rules.map((r, i) => ({
      id: ids[i]!,
      page: slug,
      category: meta.category ?? "uncategorized",
      topic: meta.title ?? slug,
      kind: r.kind,
      section: r.section,
      platforms: r.platforms,
      scope: r.scope,
      severity: r.severity,
      conformance_level: r.conformance_level,
      statement: r.statement,
      rationale: r.rationale,
      notes: r.notes,
      value: r.value,
      provenance: { url: meta.url!, anchor: r.anchor, source_hash: meta.source_hash!, fetched_at: meta.fetched_at! },
    }));
    const ir: PageIR = PageIRSchema.parse({
      source: source.id,
      page: slug,
      title: meta.title,
      category: meta.category,
      url: meta.url,
      source_hash: meta.source_hash,
      fetched_at: meta.fetched_at,
      source_version: page.source_version ?? meta.version,
      extracted_at: new Date().toISOString(),
      extractor: extractor.id,
      input_hash,
      summary: page.summary,
      overview: page.overview,
      platforms: page.platforms,
      sections: page.sections,
      rules,
      tables: page.tables,
    });
    await writeJson(join(paths.irPages(source.id), `${slug}.json`), ir);
    extracted++;
    const n = rules.filter((r) => r.kind === "rule").length;
    rulesTotal += n;
    if (!n) log.warn(`${slug}: 0 rules`);
  }

  // Reconcile: a page that no longer exists upstream must not survive in the skill. Only safe when
  // this run covered the whole source — a partial run says nothing about the pages it did not visit.
  let removed = 0;
  if (!partial) {
    for (const f of await listFiles(paths.irPages(source.id), ".json")) {
      const slug = f.replace(/\.json$/, "");
      if (live.has(slug)) continue;
      await rm(join(paths.irPages(source.id), f));
      removed++;
      log.warn(`removed ${slug}: no longer present upstream`);
    }
  }

  await writeMeta(source);
  log.info(`extracted ${extracted} pages (${skipped} unchanged, ${removed} removed), ${rulesTotal} rules${partial ? " [partial run: stale pages kept]" : ""}`);
  return { extracted, skipped, removed, rules: rulesTotal };
}

export async function writeMeta(source: Source) {
  const files = await listFiles(paths.irPages(source.id), ".json");
  const manifest = await readJson<import("../fetch/types.ts").Manifest>(paths.manifest(source.id));
  const pages: Record<string, { source_hash: string; source_version?: string; rules: number }> = {};
  let rule_count = 0;
  let version = "";
  let fetched = "";
  for (const f of files) {
    const ir = (await readJson<PageIR>(join(paths.irPages(source.id), f)))!;
    const n = ir.rules.filter((r) => r.kind === "rule").length;
    pages[ir.page] = { source_hash: ir.source_hash, source_version: ir.source_version, rules: n };
    rule_count += n;
    if (ir.source_version && ir.source_version > version) version = ir.source_version;
    if (ir.fetched_at > fetched) fetched = ir.fetched_at;
  }
  await writeJson(paths.irMeta(source.id), {
    source: source.id,
    name: source.name,
    license: source.license,
    extractor: extractorFor(source).id,
    source_version: version || fetched.slice(0, 10),
    /** The immutable upstream revision this build read, when the source exposes one. */
    revision: manifest?.revision,
    /** True when the underlying crawl did not cover the whole source; the skill is incomplete. */
    partial: manifest?.partial ?? false,
    fetched_at: fetched,
    updated_at: new Date().toISOString(),
    page_count: files.length,
    rule_count,
    pages,
  });
}
