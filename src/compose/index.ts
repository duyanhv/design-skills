/**
 * IR → Agent Skill. SKILL.md is the always-loaded decision layer (small, budgeted);
 * references/<category>/<page>.md hold the full rulebooks with citations.
 */
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Source } from "../schema/source.ts";
import { PageIRSchema, type PageIR, type Rule } from "../schema/ir.ts";
import { listFiles, paths, readJson, writeText, ensureDir } from "../util/fs.ts";
import { log } from "../util/log.ts";

const SEV_ORDER = { must: 0, should: 1, may: 2 } as const;

export async function loadIR(source: Source): Promise<PageIR[]> {
  const files = await listFiles(paths.irPages(source.id), ".json");
  const pages: PageIR[] = [];
  for (const f of files) pages.push(PageIRSchema.parse(await readJson(join(paths.irPages(source.id), f))));
  return pages.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}

function cite(r: Rule): string {
  const url = r.provenance.anchor ? `${r.provenance.url}#${r.provenance.anchor}` : r.provenance.url;
  return `[src](${url})`;
}

function ruleLine(r: Rule, withTopic = false): string {
  const parts = [`- **${r.severity.toUpperCase()}**`];
  if (withTopic) parts.push(`(${r.topic})`);
  parts.push(r.statement);
  if (r.value) parts.push(`— \`${r.value}\``);
  if (r.platforms.length) parts.push(`_[${r.platforms.join(", ")}]_`);
  parts.push(cite(r));
  const line = parts.join(" ");
  return r.rationale ? `${line}\n  - Why: ${r.rationale}` : line;
}

function referenceDoc(page: PageIR, source: Source, meta: { source_version: string }): string {
  // keep document order; group rules by section path; terms (labels + descriptions) go last
  const rules = page.rules.filter((r) => r.kind === "rule");
  const terms = page.rules.filter((r) => r.kind === "term");
  const bySection = new Map<string, Rule[]>();
  for (const r of rules) bySection.set(r.section, [...(bySection.get(r.section) ?? []), r]);
  const sections = [...bySection.entries()].map(([section, rs]) => `\n### ${section}\n` + rs.map((r) => ruleLine(r)).join("\n"));
  if (terms.length) {
    sections.push(`\n## Terms\n` + terms.map((t) => `- **${t.statement}** ${t.rationale ?? ""} ${cite(t)}`.replace(/\s+/g, " ")).join("\n"));
  }
  return [
    `# ${page.title}`,
    ``,
    `> Source: [${source.name}](${page.url}) · version ${page.source_version ?? meta.source_version} · ${rules.length} rules`,
    `> ${source.license.attribution}`,
    ``,
    page.summary,
    ``,
    `## Rules`,
    ...sections,
    ``,
  ].join("\n");
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

  const lines: string[] = [];
  lines.push(
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
    `Compiled rulebook: ${meta.rule_count} rules across ${pages.length} pages, each cited back to the source. `
      + `Statements are the guideline's own lead sentences; follow the citation for figures and visuals.`,
    ``,
    `## How to use this skill`,
    ``,
    `1. Identify the topic(s) the task touches (a component, a pattern, a foundation like color or typography).`,
    `2. Read the matching file under \`references/\` — that is the full rulebook for the topic.`,
    `3. Apply **MUST** rules as hard constraints, **SHOULD** as defaults you deviate from only with a reason, **MAY** as options.`,
    `4. When reviewing existing UI, cite the rule id and link so the finding is verifiable.`,
    ``,
    `Platforms: ${source.platforms.join(", ")}. A rule with no platform tag applies to all of them.`,
    ``,
    `## Highest-leverage rules`,
    ``,
  );

  // Top rules: N per topic — "Best practices" section first, then must > should > may, then brevity.
  const budgetForTop = Math.max(20, skill.max_skill_lines - 60 - pages.length);
  let used = 0;
  for (const cat of categories) {
    const catPages = byCategory.get(cat)!;
    const picked: Rule[] = [];
    for (const p of catPages) {
      const bp = (r: Rule) => (/best practices/i.test(r.section) ? 0 : 1);
      const best = p.rules.filter((r) => r.kind === "rule")
        .sort((a, b) => bp(a) - bp(b) || SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.statement.length - b.statement.length)
        .slice(0, skill.top_rules_per_topic);
      picked.push(...best);
    }
    if (!picked.length) continue;
    lines.push(`### ${titleCase(cat)}`, ``);
    for (const r of picked) {
      if (used >= budgetForTop) break;
      lines.push(ruleLine({ ...r, rationale: undefined }, true));
      used++;
    }
    lines.push(``);
  }

  lines.push(`## Index`, ``, `| Category | Topic | Rules | Reference |`, `| --- | --- | --- | --- |`);
  for (const cat of categories) {
    for (const p of byCategory.get(cat)!) {
      lines.push(`| ${titleCase(cat)} | ${p.title} | ${p.rules.filter((r) => r.kind === "rule").length} | [${p.page}.md](references/${cat}/${p.page}.md) |`);
    }
  }
  lines.push(``);
  return lines.join("\n");
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

  const dir = paths.skill(source.skill.name);
  await rm(join(dir, "references"), { recursive: true, force: true });
  await ensureDir(dir);
  for (const p of pages) {
    await writeText(join(dir, "references", p.category, `${p.page}.md`), referenceDoc(p, source, metaFile));
  }
  const skill = skillDoc(source, pages, metaFile);
  await writeText(join(dir, "SKILL.md"), skill);
  const skillLines = skill.split("\n").length;
  log.info(`wrote skills/${source.skill.name}: ${pages.length} references, SKILL.md ${skillLines} lines`);
  return { pages: pages.length, rules: metaFile.rule_count, skillLines };
}
