/**
 * IR → Agent Skill. SKILL.md is the always-loaded decision layer (small, budgeted);
 * references/<category>/<page>.md hold the full rulebooks with citations.
 */
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Source } from "../schema/source.ts";
import { PageIRSchema, type PageIR, type Rule, type Section, type Table } from "../schema/ir.ts";
import { listFiles, paths, readJson, writeJson, writeText, ensureDir } from "../util/fs.ts";
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

/**
 * Platform tag. "general" prints nothing (the source scoped it to nothing narrower); a page- or
 * section-scoped rule always prints its platforms, so tvOS guidance can never read as universal.
 */
function platformTag(r: Rule): string {
  if (r.scope === "general" || !r.platforms.length) return "";
  return `_[${r.platforms.join(", ")}${r.scope === "page" ? " only" : ""}]_`;
}

function ruleLine(r: Rule, opts: { withTopic?: boolean; label?: string; linker?: Linker; category?: string; withId?: boolean } = {}): string {
  const parts = [`- **${r.severity.toUpperCase()}**`];
  if (r.conformance_level) parts.push(`**(Level ${r.conformance_level})**`);
  if (opts.withTopic) parts.push(`(${r.topic})`);
  parts.push(r.statement);
  if (r.value) parts.push(`— \`${r.value}\``);
  const tag = platformTag(r);
  if (tag) parts.push(tag);
  parts.push(cite(r));
  if (opts.withId) parts.push(`\`${r.id}\``);
  const out = [parts.join(" ")];
  const local = (t: string) => (opts.linker && opts.category ? opts.linker.localize(t, opts.category) : t);
  if (r.rationale) out.push(`  - ${opts.label ?? "Why"}: ${local(r.rationale)}`);
  // Notes carry exceptions and caveats: applying the statement without them is how an agent gets it
  // wrong, so they are rendered with the rule rather than summarised away. A note that was already a
  // list item in the source keeps its marker instead of gaining a second one.
  for (const n of r.notes) out.push(`  ${/^(?:[-*]\s|\d+\.\s)/.test(n) ? local(n) : `- ${local(n)}`}`);
  return out.join("\n");
}

function tableBlock(t: Table): string {
  return t.caption && !/^\|/.test(t.caption) ? `\n${t.caption}\n\n${t.markdown}` : `\n${t.markdown}`;
}

function sectionIntro(s: Section | undefined, linker: Linker, category: string): string[] {
  if (!s?.intro.length) return [];
  return [s.intro.map((t) => linker.localize(t, category)).join("\n\n"), ``];
}

function termLine(t: Rule, linker: Linker, category: string): string {
  return `- **${t.statement}** — ${linker.localize(t.rationale ?? "", category)} ${cite(t)}`.replace(/\s+/g, " ");
}

interface Rendered { main: string; tables?: string }

function referenceDoc(page: PageIR, source: Source, meta: { source_version: string }, linker: Linker): Rendered {
  const label = source.skill.rationale_label;
  const rules = page.rules.filter((r) => r.kind === "rule");
  const terms = page.rules.filter((r) => r.kind === "term");
  const scopeNote = page.platforms.length
    ? `> Scope: this page is **${page.platforms.join(", ")} only**. Do not apply its rules to other platforms.`
    : undefined;
  const header = [
    `# ${page.title}`,
    ``,
    `> Source: [${source.name}](${page.url}) · version ${page.source_version ?? meta.source_version} · ${rules.length} rules`,
    `> ${source.license.attribution}`,
    ...(scopeNote ? [scopeNote] : []),
    ``,
    page.summary,
    ``,
    // The introduction defines the component and says when to use it; rules alone do not.
    ...(page.overview.length ? [page.overview.map((t) => linker.localize(t, page.category)).join("\n\n"), ``] : []),
  ];

  // Large spec tables go to a sibling file so the rulebook itself stays cheap to load.
  const tableChars = page.tables.reduce((n, t) => n + t.markdown.length, 0);
  const split = tableChars > source.skill.split_tables_over;
  const tablesBySection = new Map<string, Table[]>();
  if (!split) for (const t of page.tables) tablesBySection.set(t.section, [...(tablesBySection.get(t.section) ?? []), t]);

  const bySection = new Map<string, Rule[]>();
  for (const r of rules) bySection.set(r.section, [...(bySection.get(r.section) ?? []), r]);
  // A glossary page is nothing but definitions; everywhere else a definition belongs beside the
  // rules that use it ("Destructive." next to "Never give the destructive role to the primary
  // button"), not in a bucket at the end of the file.
  const isGlossary = terms.length > 0 && terms.length === page.rules.length;
  const termsBySection = new Map<string, Rule[]>();
  if (!isGlossary) for (const t of terms) termsBySection.set(t.section, [...(termsBySection.get(t.section) ?? []), t]);
  const introBySection = new Map(page.sections.map((s) => [s.section, s]));
  const order = [...new Set([...bySection.keys(), ...termsBySection.keys(), ...tablesBySection.keys(), ...introBySection.keys()])];
  const sections = order.map((section) => {
    const body = [
      ...sectionIntro(introBySection.get(section), linker, page.category),
      ...(termsBySection.get(section) ?? []).map((t) => termLine(t, linker, page.category)),
      ...(bySection.get(section) ?? []).map((r) => ruleLine(r, { label, linker, category: page.category, withId: true })),
      ...(tablesBySection.get(section) ?? []).map(tableBlock),
    ];
    return `\n### ${section}\n` + body.join("\n");
  });
  if (isGlossary) sections.push(`\n## Definitions\n` + terms.map((t) => termLine(t, linker, page.category)).join("\n"));
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

function skillDoc(source: Source, pages: PageIR[], meta: { source_version: string; rule_count: number; revision?: string; fetched_at?: string }): string {
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
  // The Agent Skills specification requires every metadata value to be a string, so numbers are
  // quoted rather than emitted as YAML scalars.
  const lines: string[] = [
    `---`,
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description.trim())}`,
    `license: ${JSON.stringify(source.license.attribution)}`,
    `metadata:`,
    `  source: ${JSON.stringify(source.id)}`,
    `  source_version: ${JSON.stringify(meta.source_version)}`,
    ...(meta.revision ? [`  source_revision: ${JSON.stringify(meta.revision)}`] : []),
    ...(meta.fetched_at ? [`  fetched_at: ${JSON.stringify(meta.fetched_at)}`] : []),
    `  rules: ${JSON.stringify(String(meta.rule_count))}`,
    `  generated_by: ${JSON.stringify("design-skills")}`,
    `---`,
    ``,
    `# ${source.name}`,
    ``,
    `Compiled rulebook: ${meta.rule_count} rules across ${pages.length} pages, each cited back to the source. ` +
      `Statements are the guideline's own sentences; follow the citation for visuals and surrounding context.`,
    ``,
    `## How to use this skill`,
    ``,
    ...(source.platforms.length
      ? [`1. **Establish the target** — which of ${source.platforms.join(", ")} the work is for. A rule tagged for another platform does not apply.`]
      : [`1. **Establish the target** — what is being built or audited, and to which conformance level.`]),
    `2. **Find the topic** in **Where to look** or the **Index**, and read that file under \`references/\`. It holds every rule for the topic with its reasoning, exceptions and a citation. Large spec tables live in a sibling \`<topic>.tables.md\`.`,
    `3. **Read the whole rule** — the statement, its \`Why\`, and the indented notes under it. The notes hold the exceptions; a statement applied without them is frequently wrong.`,
    `4. **Apply** ${severitiesPresent(pages).map((s) => sevText[s]).join(", ")}.`,
    `5. **Report evidence** — quote the rule, its id, and its link, so any finding can be checked against the source.`,
    ``,
    `Rules are ${possessive(source.name)} own sentences. Severity is inferred from that wording, not declared by ${source.name}; when a decision turns on it, follow the citation. Text marked \`_[figure: …]_\` stands for an image that carries information the text does not.`,
    ``,
  ];
  if (source.platforms.length) {
    // Use real platform names from this source so the examples match what the reader will see.
    const [example = "", other = ""] = source.platforms;
    lines.push(
      `**Platform tags.** \`_[${example}]_\` means the rule comes from ${article(example)} ${example}-specific section. ` +
        `\`_[${other} only]_\` means the whole page is ${other}-specific. An untagged rule is stated by the source without platform scope. ` +
        `Never carry a tagged rule to a platform it is not tagged for.`,
      ``,
    );
  }
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
          const tag = source.platforms.length
            ? r.scope === "general"
              ? "all"
              : `${r.platforms.join(", ")}${r.scope === "page" ? " only" : ""}`
            : r.conformance_level ?? r.value ?? "";
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

/** "Apple Human Interface Guidelines" → "…Guidelines'", "WCAG 2.2" → "WCAG 2.2's". */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** "a iOS" → "an iOS". Platform names are proper nouns, so go by the sound of the first letter. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/** Everything needed to tell what a copied skill directory was built from, without the IR. */
interface IRMeta {
  source_version: string;
  rule_count: number;
  revision?: string;
  fetched_at?: string;
  extractor?: string;
  partial?: boolean;
  page_count?: number;
}

export async function composeSource(source: Source): Promise<{ pages: number; rules: number; skillLines: number }> {
  const pages = await loadIR(source);
  if (!pages.length) throw new Error(`no IR for ${source.id}; run extract first`);
  const metaFile = (await readJson<IRMeta>(paths.irMeta(source.id))) ?? {
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

  // A skill is often copied on its own, away from ir/. This travels with it and answers "what was
  // this built from, when, and is it complete?" per page, without needing the IR.
  await writeJson(join(dir, "provenance.json"), {
    generated_by: "design-skills",
    source: source.id,
    name: source.name,
    license: source.license,
    source_version: metaFile.source_version,
    source_revision: metaFile.revision ?? null,
    fetched_at: metaFile.fetched_at ?? null,
    extractor: metaFile.extractor ?? null,
    partial: metaFile.partial ?? false,
    rule_count: metaFile.rule_count,
    pages: pages.map((p) => ({
      page: p.page,
      category: p.category,
      url: p.url,
      source_version: p.source_version ?? null,
      source_hash: p.source_hash,
      fetched_at: p.fetched_at,
      rules: p.rules.filter((r) => r.kind === "rule").length,
      platforms: p.platforms,
    })),
  });

  const skillLines = skill.split("\n").length;
  log.info(`wrote skills/${source.skill.name}: ${pages.length} references (${splitCount} with split spec tables), SKILL.md ${skillLines} lines`);
  return { pages: pages.length, rules: metaFile.rule_count, skillLines };
}
