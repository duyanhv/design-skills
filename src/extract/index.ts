import { join } from "node:path";
import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Source } from "../schema/source.ts";
import { ExtractOutputSchema, PageIRSchema, type PageIR, type Rule } from "../schema/ir.ts";
import { parseFrontmatter } from "../normalize/frontmatter.ts";
import { systemPrompt, userPrompt } from "./prompt.ts";
import { listFiles, paths, readJson, writeJson } from "../util/fs.ts";
import { log } from "../util/log.ts";
import { mapLimit } from "../util/limit.ts";

const MODEL = process.env.DESIGN_SKILLS_MODEL ?? "claude-sonnet-4-5";

export interface ExtractOptions {
  force?: boolean;
  limit?: number;
  concurrency?: number;
  dryRun?: boolean;
}

const RULES_TOOL = {
  name: "emit_rules",
  description: "Return the extracted summary and rules for the page.",
  input_schema: z.toJSONSchema(ExtractOutputSchema) as Anthropic.Tool["input_schema"],
} satisfies Anthropic.Tool;

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

export async function extractSource(source: Source, opts: ExtractOptions = {}): Promise<{ extracted: number; skipped: number }> {
  const files = await listFiles(paths.md(source.id), ".md");
  if (!files.length) throw new Error(`no normalized pages for ${source.id}; run normalize first`);
  const client = opts.dryRun ? null : new Anthropic();

  let extracted = 0;
  let skipped = 0;
  const work: { slug: string; meta: Record<string, string>; body: string; previous: PageIR | null }[] = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const { meta, body } = parseFrontmatter(await readFile(join(paths.md(source.id), file), "utf8"));
    const previous = await readJson<PageIR>(join(paths.irPages(source.id), `${slug}.json`));
    if (!opts.force && previous && previous.source_hash === meta.source_hash) {
      skipped++;
      continue;
    }
    work.push({ slug, meta, body, previous });
  }
  const todo = opts.limit ? work.slice(0, opts.limit) : work;
  log.info(`${todo.length} pages to extract, ${skipped} unchanged`);
  if (opts.dryRun) return { extracted: 0, skipped };

  await mapLimit(todo, opts.concurrency ?? 3, async ({ slug, meta, body, previous }) => {
    const res = await client!.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt(source),
      tools: [RULES_TOOL],
      tool_choice: { type: "tool", name: RULES_TOOL.name },
      messages: [{ role: "user", content: userPrompt(body) }],
    });
    const call = res.content.find((c) => c.type === "tool_use");
    if (!call || call.type !== "tool_use") throw new Error(`no tool call for ${slug}`);
    const parsed = ExtractOutputSchema.parse(call.input);

    const ids = assignIds(source.id, slug, previous, parsed.rules.map((r) => r.statement));
    const rules: Rule[] = parsed.rules.map((r, i) => ({
      id: ids[i]!,
      page: slug,
      category: meta.category ?? "uncategorized",
      topic: meta.title ?? slug,
      platforms: r.platforms.filter((p) => source.platforms.includes(p)),
      severity: r.severity,
      statement: r.statement,
      rationale: r.rationale,
      applies_when: r.applies_when,
      value: r.value,
      provenance: {
        url: meta.url!,
        anchor: r.anchor,
        source_hash: meta.source_hash!,
        fetched_at: meta.fetched_at!,
      },
    }));
    const ir: PageIR = PageIRSchema.parse({
      source: source.id,
      page: slug,
      title: meta.title,
      category: meta.category,
      url: meta.url,
      source_hash: meta.source_hash,
      fetched_at: meta.fetched_at,
      extracted_at: new Date().toISOString(),
      model: MODEL,
      summary: parsed.summary,
      rules,
    });
    await writeJson(join(paths.irPages(source.id), `${slug}.json`), ir);
    extracted++;
    log.info(`${slug}: ${rules.length} rules`);
  });

  await writeMeta(source);
  return { extracted, skipped };
}

export async function writeMeta(source: Source) {
  const files = await listFiles(paths.irPages(source.id), ".json");
  const pages: Record<string, { source_hash: string; fetched_at: string; rules: number }> = {};
  let rule_count = 0;
  let latest = "";
  for (const f of files) {
    const ir = (await readJson<PageIR>(join(paths.irPages(source.id), f)))!;
    pages[ir.page] = { source_hash: ir.source_hash, fetched_at: ir.fetched_at, rules: ir.rules.length };
    rule_count += ir.rules.length;
    if (ir.fetched_at > latest) latest = ir.fetched_at;
  }
  await writeJson(paths.irMeta(source.id), {
    source: source.id,
    name: source.name,
    license: source.license,
    source_version: latest.slice(0, 10),
    updated_at: new Date().toISOString(),
    page_count: files.length,
    rule_count,
    pages,
  });
}
