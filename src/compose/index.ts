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
import { composeFingerprint } from "./fingerprint.ts";

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
  /**
   * DocC anchor → the heading a reference file actually renders for it. A source anchor is a bare
   * section id ("Help-buttons") but the rendered heading is the whole path
   * ("### Platform considerations › macOS › Help buttons"), so lowercasing the fragment produced 109
   * links pointing at nothing (AUDIT-OUTPUT finding 8).
   */
  private headingOfAnchor = new Map<string, string>();
  /** Pages whose tables moved to a `<page>.tables.md` sibling; their table anchors live there. */
  private tablesSplit = new Set<string>();
  /** `page#anchor` keys whose only rendered content is a table. */
  private tableOnly = new Set<string>();
  private baseUrl: string;
  constructor(pages: PageIR[], baseUrl: string, splitTablesOver = Infinity) {
    this.baseUrl = baseUrl;
    const pathOf = (u: string) => u.replace(/^https?:\/\/[^/]+/, "").replace(/#.*$/, "").replace(/\/+$/, "");
    for (const p of pages) {
      if (p.tables.reduce((n, t) => n + t.markdown.length, 0) > splitTablesOver) this.tablesSplit.add(p.page);
      this.byPath.set(pathOf(p.url), { category: p.category, page: p.page });
      const frag = /#(.+)$/.exec(p.url)?.[1];
      if (frag) this.byAnchor.set(frag, { category: p.category, page: p.page });
      const remember = (anchor: string | undefined, section: string, isTable: boolean) => {
        if (!anchor) return;
        this.byAnchor.set(anchor, { category: p.category, page: p.page });
        const key = `${p.page}#${anchor}`;
        // First writer wins: the earliest block under an anchor sits under the shallowest heading.
        if (!this.headingOfAnchor.has(key)) {
          this.headingOfAnchor.set(key, section);
          if (isTable) this.tableOnly.add(key);
        }
        if (!isTable) this.tableOnly.delete(key);
      };
      const blocks = [...p.sections, ...p.rules, ...p.tables].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const b of blocks) remember("provenance" in b ? b.provenance.anchor : b.anchor, b.section, "markdown" in b);
    }
  }
  localize(text: string, fromCategory: string): string {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label: string, url: string) => {
      const [base = "", frag = ""] = url.split("#");
      const path = base.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
      const hit = path ? this.byPath.get(path) : frag ? this.byAnchor.get(frag) : undefined;
      if (!hit) return url.startsWith("/") ? `[${label}](${this.baseUrl}${url})` : m; // other root-relative links → absolute
      // Point at the heading the target file renders. When the anchor names a section that produced
      // no output (a skipped section, or one that is pure navigation) the fragment is dropped rather
      // than shipped dead: the file link still lands the reader on the right page.
      const key = `${hit.page}#${frag}`;
      const heading = this.headingOfAnchor.get(key);
      // A section that holds nothing but a table renders in the `.tables.md` sibling when that page
      // split its specs out; the heading exists, just not in the file the rules are in.
      const inTables = this.tableOnly.has(key) && this.tablesSplit.has(hit.page);
      const file = `${hit.page}${inTables ? ".tables" : ""}.md`;
      const rel = hit.category === fromCategory ? file : `../${hit.category}/${file}`;
      return `[${label}](${rel}${heading ? `#${anchorOf(heading)}` : ""})`;
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

function tableBlock(t: Table, linker?: Linker, category?: string): string {
  // Table cells carry cross-references too. Passing the markdown through untouched left 110
  // root-relative links like `[Tasks](/design/human-interface-guidelines/carekit#Tasks)` in the
  // shipped files, where they resolve to nothing (AUDIT-OUTPUT finding 8).
  const md = linker && category ? linker.localize(t.markdown, category) : t.markdown;
  const caption = linker && category && t.caption ? linker.localize(t.caption, category) : t.caption;
  return caption && !/^\|/.test(caption) ? `\n${caption}\n\n${md}` : `\n${md}`;
}

function sectionIntro(s: Section | undefined, linker: Linker, category: string): string[] {
  if (!s?.intro.length) return [];
  // A blank line before as well as after: prose that follows a definition list would otherwise be
  // read as a continuation of the last list item, which is the same misattribution in the renderer
  // that finding 2 fixed in the extractor.
  return [``, s.intro.map((t) => linker.localize(t, category)).join("\n\n"), ``];
}

function termLine(t: Rule, linker: Linker, category: string): string {
  // A term's description can arrive as `rationale` (glossary entries) or as `notes` (an obsolete
  // WCAG criterion, whose whole explanation is a note). Rendering only the first dropped the text
  // explaining *why* 4.1.1 Parsing was removed, leaving a definition with nothing after the dash.
  const local = (s: string) => linker.localize(s, category);
  // "**Captions** give people the textual equivalent…" is a sentence whose subject happens to be
  // bold, not a label followed by a definition. A dash inserted there reads as a break the source
  // never wrote ("**Captions** — give people…"), so the separator is only used when the label
  // genuinely ends and something new begins.
  const continues = t.rationale ? /^[a-z\u2018\u2019'"(]/.test(t.rationale) : false;
  const body = t.rationale ? `${continues ? " " : " — "}${local(t.rationale)}` : "";
  const head = `- **${t.statement}**${body} ${cite(t)}`.replace(/\s+/g, " ");
  // Notes are indented rather than joined onto the head line, so a reader can see where the
  // definition ends. Joining them ran WCAG's "changes of context" list into one sentence with its
  // list markers inline (AUDIT-OUTPUT finding 8).
  // A note that already carries its own sub-list keeps that structure: the items are indented one
  // level further than their lead-in, so "include changes of:" reads as introducing four things.
  // When the note is nothing but a list, every item sits at the same level instead of the first
  // becoming a parent of the rest.
  const notes = t.notes.map((n) => {
    const lines = local(n).split("\n").map((l) => l.trim()).filter(Boolean);
    const isItem = (l: string) => /^(?:[-*]\s|\d+\.\s)/.test(l);
    const allItems = lines.every(isItem);
    return lines
      .map((line, i) => (i === 0 || allItems ? `  ${isItem(line) ? line : `- ${line}`}` : `    ${line}`))
      .join("\n");
  });
  return [head, ...notes].join("\n");
}

interface Rendered { main: string; tables?: string }

/**
 * Source order. Every block a page emits carries one `order` counter, so a reference reads in the
 * sequence of the page it came from. Blocks written by an older extractor have no counter; they
 * fall back to their array position, which is still document order within their own kind.
 */
type Block =
  | { order: number; kind: "intro"; section: Section }
  | { order: number; kind: "rule"; rule: Rule }
  | { order: number; kind: "table"; table: Table };

/**
 * When a reference opens with a table of contents. Length alone was not the right test: Design
 * principles is 115 lines across 16 sections and The menu bar is 175 across 15, both of which cost a
 * full read to find one section, while a 210-line page with four sections does not.
 */
const TOC_OVER_LINES = 200;
const TOC_OVER_SECTIONS = 10;

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
  // A glossary page is nothing but definitions; everywhere else a definition belongs beside the
  // rules that use it ("Destructive." next to "Never give the destructive role to the primary
  // button"), not in a bucket at the end of the file.
  const isGlossary = terms.length > 0 && terms.length === page.rules.length;

  const blocks: Block[] = [
    ...page.sections.map((s, i) => ({ order: s.order ?? i, kind: "intro" as const, section: s })),
    ...page.rules.map((r, i) => ({ order: r.order ?? i, kind: "rule" as const, rule: r })),
    ...(split ? [] : page.tables.map((t, i) => ({ order: t.order ?? i, kind: "table" as const, table: t }))),
  ].sort((a, b) => a.order - b.order);

  // Group into headings without reordering: a section is a run of consecutive blocks, and a heading
  // the source revisits later gets its own run rather than pulling the later text backwards.
  const runs: { section: string; body: string[] }[] = [];
  const headings: string[] = [];
  for (const b of blocks) {
    const section = b.kind === "intro" ? b.section.section : b.kind === "rule" ? b.rule.section : b.table.section;
    let run = runs[runs.length - 1];
    if (!run || run.section !== section) {
      run = { section, body: [] };
      runs.push(run);
      if (!headings.includes(section)) headings.push(section);
    }
    if (b.kind === "intro") run.body.push(...sectionIntro(b.section, linker, page.category));
    else if (b.kind === "table") run.body.push(tableBlock(b.table, linker, page.category));
    else if (isGlossary && b.rule.kind === "term") continue; // rendered under "Definitions" below
    else if (b.rule.kind === "term") run.body.push(termLine(b.rule, linker, page.category));
    else run.body.push(ruleLine(b.rule, { label, linker, category: page.category, withId: true }));
  }
  const sections = runs.filter((r) => r.body.length).map((r) => `\n### ${r.section}\n` + r.body.join("\n"));
  if (isGlossary) sections.push(`\n## Definitions\n` + terms.map((t) => termLine(t, linker, page.category)).join("\n"));
  const main = [...header, ...(rules.length ? ["## Rules"] : []), ...sections];
  if (split) {
    main.push(``, `## Specifications`, ``, `${page.tables.length} tables (${Math.round(tableChars / 1024)} KB) are in [${page.page}.tables.md](${page.page}.tables.md).`);
  }
  const tables = split
    ? [`# ${page.title} — specifications`, ``, `> Source: [${source.name}](${page.url}) · version ${page.source_version ?? meta.source_version}`, `> ${source.license.attribution}`, ``,
       ...[...new Set(page.tables.map((t) => t.section))].map(
         (s) => `\n### ${s}\n` + page.tables.filter((t) => t.section === s).map((t) => tableBlock(t, linker, page.category)).join("\n"),
       ), ``].join("\n")
    : undefined;
  // Blank lines are load-bearing in Markdown but three in a row are just noise; collapse runs.
  const body = main.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  // A split spec file gets the same treatment: typography.tables.md is 923 lines of spec tables, and
  // an agent looking for one weight otherwise has to read all of them.
  return {
    main: withContents(body, headings, page.rules),
    tables: tables ? withContents(tables, [...new Set(page.tables.map((t) => t.section))], []) : undefined,
  };
}

/**
 * A table of contents for long references. Six Apple pages are over 400 lines with 25+ sections;
 * scanning one to find "Platform considerations › macOS" costs the whole file. Short pages do not
 * need one and would only pay tokens for it.
 */
function withContents(doc: string, headings: string[], rules: Rule[]): string {
  if ((doc.split("\n").length <= TOC_OVER_LINES && headings.length <= TOC_OVER_SECTIONS) || headings.length < 3) return doc;
  const counts = new Map<string, number>();
  for (const r of rules) if (r.kind === "rule") counts.set(r.section, (counts.get(r.section) ?? 0) + 1);
  const toc = [
    `## Contents`,
    ``,
    ...headings.map((h) => {
      const n = counts.get(h) ?? 0;
      return `- [${h}](#${anchorOf(h)})${n ? ` — ${n} rule${n === 1 ? "" : "s"}` : ""}`;
    }),
    ``,
  ].join("\n");
  // After the header block (summary + overview), before the body starts. A spec file has no
  // "## Rules", so fall back to its first section heading — appending the list at the end would put
  // the navigation after the thing it is meant to help you navigate.
  const at = doc.indexOf("## Rules");
  const start = at >= 0 ? at : doc.search(/^### /m);
  return start < 0 ? `${doc}\n${toc}` : `${doc.slice(0, start)}${toc}\n${doc.slice(start)}`;
}

function severitiesPresent(pages: PageIR[]): string[] {
  const set = new Set(pages.flatMap((p) => p.rules.filter((r) => r.kind === "rule").map((r) => r.severity)));
  return (["must", "should", "may"] as const).filter((s) => set.has(s));
}

/**
 * Where a severity badge's authority comes from (AUDIT finding A4).
 *
 * A manifest may state it; otherwise it is read off the source's own data. A source whose rules
 * carry a conformance level declares its normative status (WCAG criteria are normative text, and
 * `src/extract/wcag.ts` assigns `must` directly). Everything else is classified from wording by
 * `src/extract/severity.ts`, which is this compiler's reading and not a claim the source made — so
 * the entry file must not instruct an agent to enforce those badges as declared requirements.
 */
function authorityOf(source: Source, pages: PageIR[]): "wording" | "declared" {
  if (source.skill.authority) return source.skill.authority;
  return pages.some((p) => p.rules.some((r) => r.kind === "rule" && r.conformance_level)) ? "declared" : "wording";
}

function skillDoc(
  source: Source,
  pages: PageIR[],
  meta: { source_version: string; rule_count: number; revision?: string; fetched_at?: string; partial?: boolean },
): { skill: string; index?: string } {
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

  const authority = authorityOf(source, pages);
  // With `declared` authority the badge repeats a status the source states, so it can be enforced.
  // With `wording` authority it is this compiler's reading of a sentence, so it ranks how firmly the
  // source spoke and nothing more (AUDIT finding A4).
  const sevText: Record<string, Record<string, string>> = {
    declared: {
      must: "**MUST** rules as hard constraints",
      should: "**SHOULD** as defaults you deviate from only with a reason",
      may: "**MAY** as options",
    },
    wording: {
      must: "**MUST** as the source's firmest wording (a prohibition or an absolute)",
      should: "**SHOULD** as its recommending voice",
      may: "**MAY** as wording that offers an option",
    },
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
    ...(meta.partial ? [`  partial: ${JSON.stringify("true")}`] : []),
    `  generated_by: ${JSON.stringify("design-skills")}`,
    `---`,
    ``,
    `# ${source.name}`,
    ``,
    // A partial build is a rulebook with holes in it. The agent has to be told, in the file it
    // always reads — recording it only in provenance.json leaves the reader confidently wrong.
    ...(meta.partial
      ? [
          `> **This build is incomplete.** The crawl did not cover the whole source, so a rule may be ` +
            `missing rather than absent. Treat "not in this skill" as unknown, not as permitted, and ` +
            `check the source directly for anything load-bearing. See \`provenance.json\`.`,
          ``,
        ]
      : []),
    `Compiled rulebook: ${meta.rule_count} rules across ${pages.length} pages, each cited back to the source. ` +
      `Statements are the guideline's own sentences; follow the citation for visuals and surrounding context.`,
    ``,
    `## How to use this skill`,
    ``,
    ...(source.platforms.length
      ? [`1. **Establish the target** — which of ${source.platforms.join(", ")} the work is for. A rule tagged for another platform does not apply.`]
      : [`1. **Establish the target** — what is being built or audited, and to which conformance level.`]),
    `2. **Find the topic** in **Where to look** or the **Index**, and read that file under \`references/\`. It holds every rule for the topic with its reasoning, exceptions and a citation. Large spec tables live in a sibling \`<topic>.tables.md\`.`,
    // Exceptions are not reliably in one place: Apple states some in the sentence after the lead
    // ("The exception is if Tap to Pay on iPhone is the only payment-acceptance method you support")
    // and some in a following note. Telling the agent to look in the notes sent it to the wrong
    // half of the rule (AUDIT-OUTPUT finding 7).
    `3. **Read the whole rule** — the statement, its \`${skill.rationale_label}\` line, and the indented notes under it. Exceptions and caveats appear in either; a statement applied without them is frequently wrong.`,
    `4. **Apply** ${severitiesPresent(pages).map((s) => sevText[authority]![s]).join(", ")}.`,
    `5. **Report evidence** — quote the rule, its id, and its link, so any finding can be checked against the source.`,
    ``,
    `Rules are ${possessive(source.name)} own sentences. ` +
      (authority === "declared"
        ? `Each rule's badge reports a status ${source.name} declares; read the rule's level and its stated conditions before applying it.`
        : `The badge is this compiler's reading of ${possessive(source.name)} wording, not a status ${source.name} declared. ` +
          `Before reporting anything as a requirement violation, check the cited text: quote the prohibition or absolute it rests on. ` +
          `If the source is advising rather than ruling something out, report it as ${possessive(source.name)} recommendation.`) +
      ` Text marked \`_[figure: …]_\` stands for an image that carries information the text does not.`,
    ``,
    // Authored workflow (AUDIT finding A5). The rulebook answers "what does the source say"; these
    // four bullets are this project's own method for getting from a task to a change or a finding.
    // They are marked as ours so they can never be read back as ${source.name}'s text.
    `## Working method`,
    ``,
    `_Written for this skill, not by ${source.name}. The cited rules below are the source's._`,
    ``,
    `- **Before deciding** — name the change, the ${source.platforms.length ? "platform and version" : "conformance target"} it is for, the framework in use, and how this codebase already builds this kind of element. A shared component or theme is usually the thing to change; a local override that contradicts it is a new defect.`,
    `- **Building** — settle the decision against the rule you read, implement it in that existing context, then inspect the states the change can reach: default, pressed/focused, disabled, empty and error, and the smallest and largest text/size the layout allows.`,
    `- **Reviewing** — for each observed defect name the code or control that produces it, confirm the rule's scope and exceptions cover that case, and check what the framework already supplies: behaviour inherited from a standard component, or a hit region larger than the glyph drawn inside it, is not a defect. Give the fix and the check that would show it worked.`,
    `- **Evidence** — say how you know. Code and screenshots show structure and appearance; behaviour over time (focus order, assistive-technology output, motion, text scaling) needs a run. Mark what you could not run as unverified instead of asserting it.`,
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

  const index: string[] = [];
  if (skill.index === "rules") {
    index.push(`| Category | Rule | ${source.platforms.length ? "Platforms" : "Level"} | Reference |`, `| --- | --- | --- | --- |`);
    for (const cat of categories) {
      for (const p of byCategory.get(cat)!) {
        for (const r of p.rules.filter((r) => r.kind === "rule")) {
          const tag = source.platforms.length
            ? r.scope === "general"
              ? "all"
              : `${r.platforms.join(", ")}${r.scope === "page" ? " only" : ""}`
            : r.conformance_level ?? r.value ?? "";
          index.push(`| ${titleCase(cat)} | ${r.section} | ${tag} | [${p.page}.md](${pageFile(p)}#${anchorOf(r.section)}) |`);
        }
        if (p.rules.every((r) => r.kind === "term")) index.push(`| ${titleCase(cat)} | ${p.title} (${p.rules.length} definitions) | | [${p.page}.md](${pageFile(p)}) |`);
      }
    }
  } else {
    index.push(`| Category | Topic | Rules | Reference |`, `| --- | --- | --- | --- |`);
    for (const cat of categories) {
      for (const p of byCategory.get(cat)!) {
        index.push(`| ${titleCase(cat)} | ${p.title} | ${p.rules.filter((r) => r.kind === "rule").length} | [${p.page}.md](${pageFile(p)}) |`);
      }
    }
  }

  // SKILL.md is loaded on every activation. A long index costs that budget without helping the
  // agent choose, so past a threshold it moves to index.md and the entry file keeps a map of
  // categories — enough to know whether the full index is worth opening.
  const split = index.join("\n").length > skill.split_index_over;
  if (split) {
    // Every topic, by name, with a link. A count-per-category table told the agent how much material
    // existed without telling it what any of it was about, so any task outside a routing row cost an
    // extra file read (AUDIT-OUTPUT finding 6). The rule counts stay in index.md, where they answer
    // "how deep is this topic" rather than "which topic do I want".
    lines.push(`## Index`, ``, `${pages.length} topics, ${meta.rule_count} rules. Rule counts per topic are in [index.md](index.md).`, ``);
    for (const cat of categories) {
      lines.push(`**${titleCase(cat)}** — ` + byCategory.get(cat)!.map((p) => `[${p.title}](${pageFile(p)})`).join(" · "), ``);
    }
  } else {
    lines.push(`## Index`, ``, ...index, ``);
  }
  return { skill: lines.join("\n"), index: split ? index.join("\n") : undefined };
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
  const linker = new Linker(pages, source.canonical_url ?? source.base_url, source.skill.split_tables_over);

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
  const { skill, index } = skillDoc(source, pages, metaFile);
  await writeText(join(dir, "SKILL.md"), skill);
  if (index) {
    await writeText(
      join(dir, "index.md"),
      [
        `# ${source.name} — index`,
        ``,
        `> ${source.license.attribution}`,
        ``,
        `Every topic in this skill. Use [SKILL.md](SKILL.md)'s **Where to look** table first; open this when the task does not match a routing row.`,
        ``,
        index,
        ``,
      ].join("\n"),
    );
  } else {
    await rm(join(dir, "index.md"), { force: true });
  }

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
    // Which renderer produced these files. `validate` compares it against the current code, so a
    // reference that predates a compose change is reported instead of shipping stale.
    compose_fingerprint: await composeFingerprint(),
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
