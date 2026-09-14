/**
 * IR → Agent Skill. SKILL.md is the always-loaded decision layer (small, budgeted);
 * references/<category>/<page>.md hold the full rulebooks with citations.
 */
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Source } from "../schema/source.ts";
import { PageIRSchema, type PageIR, type Rule, type Table } from "../schema/ir.ts";
import { listFiles, paths, readJson, writeText, ensureDir } from "../util/fs.ts";
import { log } from "../util/log.ts";

const SEV_ORDER = { must: 0, should: 1, may: 2 } as const;

export async function loadIR(source: Source): Promise<PageIR[]> {
  const files = await listFiles(paths.irPages(source.id), ".json");
  const pages: PageIR[] = [];
  for (const f of files) pages.push(PageIRSchema.parse(await readJson(join(paths.irPages(source.id), f))));
  return pages.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}

/** Rewrites links to other pages of the same source into relative links between reference files. */
class Linker {
  private byPath = new Map<string, { category: string; page: string }>();
  private byAnchor = new Map<string, { category: string; page: string }>();
  private baseUrl: string;
  constructor(pages: PageIR[], baseUrl: string) {
    this.baseUrl = baseUrl;
    const pathOf = (u: string) => u.replace(/^https?:\/\/[^/]+/, "").replace(/#.*$/, "").replace(/\/+$/, "");
    for (const p of pages) {
      this.byPath.set(pathOf(p.url), { category: p.category, page: p.page });
      const frag = /#(.+)$/.exec(p.url)?.[1];
      if (frag) this.byAnchor.set(frag, { category: p.category, page: p.page });
      for (const r of p.rules) if (r.provenance.anchor) this.byAnchor.set(r.provenance.anchor, { category: p.category, page: p.page });
    }
  }
  localize(text: string, fromCategory: string): string {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label: string, url: string) => {
      const [base = "", frag = ""] = url.split("#");
      const path = base.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
      const hit = path ? this.byPath.get(path) : frag ? this.byAnchor.get(frag) : undefined;
      if (!hit) return url.startsWith("/") ? `[${label}](${this.baseUrl}${url})` : m; // other root-relative links → absolute
      const rel = hit.category === fromCategory ? `${hit.page}.md` : `../${hit.category}/${hit.page}.md`;
      return `[${label}](${rel}${frag ? `#${frag.toLowerCase()}` : ""})`;
    });
  }
}

function cite(r: Rule): string {
  const base = r.provenance.url.replace(/#.*$/, "");
  const url = r.provenance.anchor ? `${base}#${r.provenance.anchor}` : r.provenance.url;
  return `[src](${url})`;
}

function ruleLine(r: Rule, opts: { withTopic?: boolean; label?: string; linker?: Linker; category?: string } = {}): string {
  const parts = [`- **${r.severity.toUpperCase()}**`];
  if (opts.withTopic) parts.push(`(${r.topic})`);
  parts.push(r.statement);
  if (r.value) parts.push(`— \`${r.value}\``);
  if (r.platforms.length) parts.push(`_[${r.platforms.join(", ")}]_`);
  parts.push(cite(r));
  const line = parts.join(" ");
  if (!r.rationale) return line;
  const rationale = opts.linker && opts.category ? opts.linker.localize(r.rationale, opts.category) : r.rationale;
  return `${line}\n  - ${opts.label ?? "Why"}: ${rationale}`;
}

function tableBlock(t: Table): string {
  return t.caption && !/^\|/.test(t.caption) ? `\n${t.caption}\n\n${t.markdown}` : `\n${t.markdown}`;
}

interface Rendered { main: string; tables?: string }

function referenceDoc(page: PageIR, source: Source, meta: { source_version: string }, linker: Linker): Rendered {
  const label = source.skill.rationale_label;
  const rules = page.rules.filter((r) => r.kind === "rule");
  const terms = page.rules.filter((r) => r.kind === "term");
  const header = [
    `# ${page.title}`,
    ``,
    `> Source: [${source.name}](${page.url}) · version ${page.source_version ?? meta.source_version} · ${rules.length} rules`,
    `> ${source.license.attribution}`,
    ``,
    page.summary,
    ``,
  ];

  // Large spec tables go to a sibling file so the rulebook itself stays cheap to load.
  const tableChars = page.tables.reduce((n, t) => n + t.markdown.length, 0);
  const split = tableChars > source.skill.split_tables_over;
  const tablesBySection = new Map<string, Table[]>();
  if (!split) for (const t of page.tables) tablesBySection.set(t.section, [...(tablesBySection.get(t.section) ?? []), t]);

  const bySection = new Map<string, Rule[]>();
  for (const r of rules) bySection.set(r.section, [...(bySection.get(r.section) ?? []), r]);
  const order = [...new Set([...bySection.keys(), ...tablesBySection.keys()])];
  const sections = order.map((section) => {
    const body = [
      ...(bySection.get(section) ?? []).map((r) => ruleLine(r, { label, linker, category: page.category })),
      ...(tablesBySection.get(section) ?? []).map(tableBlock),
    ];
    return `\n### ${section}\n` + body.join("\n");
  });
  if (terms.length) {
    const isGlossary = terms.length === page.rules.length;
    sections.push(
      `\n## ${isGlossary ? "Definitions" : "Terms"}\n` +
        terms.map((t) => `- **${t.statement}** — ${linker.localize(t.rationale ?? "", page.category)} ${cite(t)}`.replace(/\s+/g, " ")).join("\n"),
    );
  }
  const main = [...header, ...(rules.length ? ["## Rules"] : []), ...sections];
  if (split) {
    main.push(``, `## Specifications`, ``, `${page.tables.length} tables (${Math.round(tableChars / 1024)} KB) are in [${page.page}.tables.md](${page.page}.tables.md).`);
  }
  const tables = split
    ? [`# ${page.title} — specifications`, ``, `> Source: [${source.name}](${page.url}) · version ${page.source_version ?? meta.source_version}`, `> ${source.license.attribution}`, ``,
       ...[...new Set(page.tables.map((t) => t.section))].map((s) => `\n### ${s}\n` + page.tables.filter((t) => t.section === s).map(tableBlock).join("\n")), ``].join("\n")
    : undefined;
  return { main: main.join("\n") + "\n", tables };
}

function severitiesPresent(pages: PageIR[]): string[] {
  const set = new Set(pages.flatMap((p) => p.rules.filter((r) => r.kind === "rule").map((r) => r.severity)));
  return (["must", "should", "may"] as const).filter((s) => set.has(s));
}

function skillDoc(source: Source, pages: PageIR[], meta: { source_version: string; rule_count: number }): string {
  const { skill } = source;
  const byCategory = new Map<string, PageIR[]>();
  for (const p of pages) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);
  const catOrder = (c: string) => {
    const i = source.categories.indexOf(c);
    return i < 0 ? 999 : i;
  };
  const categories = [...byCategory.keys()].sort((a, b) => catOrder(a) - catOrder(b));
  const pageFile = (p: PageIR) => `references/${p.category}/${p.page}.md`;
  const pageBySlug = new Map(pages.map((p) => [p.page, p]));

  const sevText: Record<string, string> = {
    must: "**MUST** rules as hard constraints",
    should: "**SHOULD** as defaults you deviate from only with a reason",
    may: "**MAY** as options",
  };
  const lines: string[] = [
    `---`,
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description.trim())}`,
    `license: ${JSON.stringify(source.license.attribution)}`,
    `metadata:`,
    `  source: ${source.id}`,
    `  source_version: ${meta.source_version}`,
    `  rules: ${meta.rule_count}`,
    `  generated_by: design-skills`,
    `---`,
    ``,
    `# ${source.name}`,
    ``,
    `Compiled rulebook: ${meta.rule_count} rules across ${pages.length} pages, each cited back to the source. ` +
      `Statements are the guideline's own sentences; follow the citation for visuals and surrounding context.`,
    ``,
    `## How to use this skill`,
    ``,
    `1. Find the topic in **Where to look** or the **Index** below.`,
    `2. Read that file under \`references/\` — it holds every rule for the topic, with the reasoning and a citation. Large spec tables live in a sibling \`<topic>.tables.md\`.`,
    `3. Apply ${severitiesPresent(pages).map((s) => sevText[s]).join(", ")}.`,
    `4. When reviewing existing UI, quote the rule and its link so the finding is verifiable.`,
    ``,
  ];
  if (source.platforms.length) lines.push(`Platforms: ${source.platforms.join(", ")}. A rule with no platform tag applies to all of them; platform-specific sections come after the general ones in each file.`, ``);
  if (skill.notes) lines.push(skill.notes.trim(), ``);

  if (skill.routing.length) {
    lines.push(`## Where to look`, ``, `| When the task involves… | Read |`, `| --- | --- |`);
    for (const r of skill.routing) {
      const links = r.read.map((slug) => {
        const p = pageBySlug.get(slug);
        if (!p) throw new Error(`routing: unknown page "${slug}" in sources/${source.id}.yaml`);
        return `[${p.title}](${pageFile(p)})`;
      });
      lines.push(`| ${r.when} | ${links.join(", ")} |`);
    }
    lines.push(``);
  }

  if (skill.highlights) {
    // Top rules: N per topic — "Best practices" first, platform-agnostic first, must > should > may, then brevity.
    const budgetForTop = Math.max(20, skill.max_skill_lines - 80 - pages.length - skill.routing.length);
    let used = 0;
    const blocks: string[][] = [];
    for (const cat of categories) {
      const picked: Rule[] = [];
      for (const p of byCategory.get(cat)!) {
        const bp = (r: Rule) => (/best practices/i.test(r.section) ? 0 : 1);
        picked.push(
          ...p.rules
            .filter((r) => r.kind === "rule" && !/[:—-]$/.test(r.statement))
            .sort((a, b) => bp(a) - bp(b) || a.platforms.length - b.platforms.length || SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.statement.length - b.statement.length)
            .slice(0, skill.top_rules_per_topic),
        );
      }
      const block: string[] = [];
      for (const r of picked) {
        if (used >= budgetForTop) break;
        block.push(ruleLine({ ...r, rationale: undefined }, { withTopic: true }));
        used++;
      }
      if (block.length) blocks.push([`### ${titleCase(cat)}`, ``, ...block, ``]);
    }
    if (blocks.length) lines.push(`## Highest-leverage rules`, ``, `One rule per topic, to orient — not a checklist. The reference files are the checklist.`, ``, ...blocks.flat());
  }

  lines.push(`## Index`, ``);
  if (skill.index === "rules") {
    lines.push(`| Category | Rule | ${source.platforms.length ? "Platforms" : "Level"} | Reference |`, `| --- | --- | --- | --- |`);
    for (const cat of categories) {
      for (const p of byCategory.get(cat)!) {
        for (const r of p.rules.filter((r) => r.kind === "rule")) {
          const tag = source.platforms.length ? r.platforms.join(", ") || "all" : r.value ?? "";
          lines.push(`| ${titleCase(cat)} | ${r.section} | ${tag} | [${p.page}.md](${pageFile(p)}#${anchorOf(r.section)}) |`);
        }
        if (p.rules.every((r) => r.kind === "term")) lines.push(`| ${titleCase(cat)} | ${p.title} (${p.rules.length} definitions) | | [${p.page}.md](${pageFile(p)}) |`);
      }
    }
  } else {
    lines.push(`| Category | Topic | Rules | Reference |`, `| --- | --- | --- | --- |`);
    for (const cat of categories) {
      for (const p of byCategory.get(cat)!) {
        lines.push(`| ${titleCase(cat)} | ${p.title} | ${p.rules.filter((r) => r.kind === "rule").length} | [${p.page}.md](${pageFile(p)}) |`);
      }
    }
  }
  lines.push(``);
  return lines.join("\n");
}

/** GitHub-style heading anchor for a "### section" line. */
function anchorOf(heading: string): string {
  return heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
}

function titleCase(s: string) {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function composeSource(source: Source): Promise<{ pages: number; rules: number; skillLines: number }> {
  const pages = await loadIR(source);
  if (!pages.length) throw new Error(`no IR for ${source.id}; run extract first`);
  const metaFile = (await readJson<{ source_version: string; rule_count: number }>(paths.irMeta(source.id))) ?? {
    source_version: "unknown",
    rule_count: pages.reduce((n, p) => n + p.rules.length, 0),
  };
  const linker = new Linker(pages, source.canonical_url ?? source.base_url);

  const dir = paths.skill(source.skill.name);
  await rm(join(dir, "references"), { recursive: true, force: true });
  await ensureDir(dir);
  let splitCount = 0;
  for (const p of pages) {
    const { main, tables } = referenceDoc(p, source, metaFile, linker);
    await writeText(join(dir, "references", p.category, `${p.page}.md`), main);
    if (tables) {
      await writeText(join(dir, "references", p.category, `${p.page}.tables.md`), tables);
      splitCount++;
    }
  }
  const skill = skillDoc(source, pages, metaFile);
  await writeText(join(dir, "SKILL.md"), skill);
  const skillLines = skill.split("\n").length;
  log.info(`wrote skills/${source.skill.name}: ${pages.length} references (${splitCount} with split spec tables), SKILL.md ${skillLines} lines`);
  return { pages: pages.length, rules: metaFile.rule_count, skillLines };
}
