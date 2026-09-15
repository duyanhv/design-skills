import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Source } from "../schema/source.ts";
import { PageIRSchema } from "../schema/ir.ts";
import { exists, listDirs, listFiles, paths, readJson } from "../util/fs.ts";
import { gitIgnores, gitTracked } from "../util/git.ts";
import { validateAuthoredSource } from "../authored/index.ts";
import { composeFingerprint } from "../compose/fingerprint.ts";

export interface Finding { level: "error" | "warn"; where: string; message: string }

/**
 * Agent Skills frontmatter (https://agentskills.io/specification): `name` and `description` are
 * required, and every `metadata` value must be a **string** — a bare number is not valid.
 */
const FrontmatterSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "name must be lowercase letters, digits and hyphens").max(64),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  metadata: z.record(z.string(), z.string({ error: "metadata values must be strings" })).optional(),
  "allowed-tools": z.array(z.string()).optional(),
});

/** ~4 chars per token is the usual rule of thumb; the specification suggests <5k tokens loaded. */
const TOKEN_BUDGET = 5000;
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Split `---\n<yaml>\n---\n<body>`; returns null when the file has no frontmatter block. */
export function splitFrontmatter(text: string): { yaml: string; body: string } | null {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  return m ? { yaml: m[1]!, body: m[2] ?? "" } : null;
}

export async function validateSource(source: Source): Promise<Finding[]> {
  if (source.kind === "authored") return validateAuthoredSource(source);
  const findings: Finding[] = [];
  const err = (where: string, message: string) => findings.push({ level: "error", where, message });
  const warn = (where: string, message: string) => findings.push({ level: "warn", where, message });

  // 1. IR: schema, provenance, id uniqueness, scope integrity
  const files = await listFiles(paths.irPages(source.id), ".json");
  if (!files.length) err("ir", "no IR pages");
  const ids = new Set<string>();
  const irPages: string[] = [];
  for (const f of files) {
    const where = `ir/${source.id}/pages/${f}`;
    const parsed = PageIRSchema.safeParse(await readJson(join(paths.irPages(source.id), f)));
    if (!parsed.success) {
      err(where, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      continue;
    }
    const ir = parsed.data;
    irPages.push(ir.page);
    // A page that extracted nothing at all. Rules are not the only legitimate yield: a bundled
    // normative appendix (WCAG's Input Purposes, its Conformance chapter) is prose with citable
    // anchors, and forcing it into the rule shape would restate the source in a shape the source
    // never used. Empty of *everything* is still the extraction failure this was written to catch.
    if (!ir.rules.length && !ir.sections.length) warn(where, "page has no rules, terms or sections");
    for (const r of ir.rules) {
      if (ids.has(r.id)) err(where, `duplicate rule id ${r.id}`);
      ids.add(r.id);
      if (!r.provenance.url.startsWith(source.canonical_url ?? source.base_url)) err(where, `${r.id}: provenance url outside source`);
      if (r.provenance.source_hash !== ir.source_hash) err(where, `${r.id}: provenance hash != page hash`);
      for (const p of r.platforms) if (!source.platforms.includes(p)) err(where, `${r.id}: unknown platform ${p}`);
      // A scoped rule with no platforms is the failure mode this field exists to prevent: it would
      // render as universal guidance.
      if (r.scope !== "general" && !r.platforms.length) err(where, `${r.id}: scope "${r.scope}" but no platforms`);
      if (r.scope === "general" && r.platforms.length) err(where, `${r.id}: scope "general" but platforms ${r.platforms.join(",")}`);
      // A page about one platform must not emit rules that claim to apply everywhere.
      if (ir.platforms.length && r.scope === "general") err(where, `${r.id}: page is ${ir.platforms.join(",")}-specific but the rule is unscoped`);
      // note_authority is positional. A short or long array silently relabels notes from some other
      // index, which turns an informative note into a requirement — the defect it exists to prevent.
      if (r.note_authority.length && r.note_authority.length !== r.notes.length) {
        err(where, `${r.id}: ${r.note_authority.length} note_authority entries for ${r.notes.length} notes`);
      }
    }
  }

  // 2. Non-redistributable sources must have their outputs effectively ignored *and* untracked.
  // Checking literal .gitignore lines was not enough: a later negation can re-include a path, and a
  // file that is already tracked keeps being committed no matter what .gitignore says.
  if (!source.license.redistributable) {
    for (const dir of [`ir/${source.id}/`, `skills/${source.skill.name}/`]) {
      const probe = `${dir}SKILL.md`;
      if (!(await gitIgnores(probe))) err("license", `${dir} is not git-ignored (license.redistributable is false)`);
      const tracked = await gitTracked(dir);
      if (tracked.length) err("license", `${tracked.length} file(s) under ${dir} are tracked by git despite a non-redistributable license: ${tracked.slice(0, 3).join(", ")}`);
    }
  }

  // 3. Skill: exists, frontmatter conforms to the spec, budgets, references resolve
  const skillDir = paths.skill(source.skill.name);
  const skillPath = join(skillDir, "SKILL.md");
  if (!(await exists(skillPath))) {
    err("skill", "SKILL.md missing (run compose)");
    return findings;
  }
  const skill = await readFile(skillPath, "utf8");
  const lines = skill.split("\n").length;
  if (lines > source.skill.max_skill_lines) err("skill", `SKILL.md is ${lines} lines, budget ${source.skill.max_skill_lines}`);

  const split = splitFrontmatter(skill);
  if (!split) {
    err("skill", "SKILL.md has no YAML frontmatter block");
  } else {
    let doc: unknown;
    try {
      doc = parseYaml(split.yaml);
    } catch (e) {
      err("skill", `frontmatter is not valid YAML: ${(e as Error).message}`);
    }
    if (doc !== undefined) {
      const fm = FrontmatterSchema.safeParse(doc);
      if (!fm.success) {
        for (const i of fm.error.issues) err("skill", `frontmatter ${i.path.join(".") || "(root)"}: ${i.message}`);
      } else if (fm.data.name !== source.skill.name) {
        err("skill", `frontmatter name "${fm.data.name}" != skill.name "${source.skill.name}"`);
      }
    }
  }

  const tokens = estimateTokens(skill);
  if (tokens > TOKEN_BUDGET) warn("skill", `SKILL.md is ~${tokens} tokens (spec suggests < ${TOKEN_BUDGET} for always-loaded instructions)`);

  const provenance = await readJson<{ compose_fingerprint?: string }>(join(skillDir, "provenance.json"));
  if (!provenance) {
    warn("skill", "provenance.json missing (run compose)");
  } else {
    // Stale Markdown is indistinguishable from correct Markdown by reading it: every other check
    // here reads the files on disk and passes whatever they contain. The fingerprint is the one
    // thing that can tell that the renderer moved on without them (AUDIT-OUTPUT finding 1).
    const current = await composeFingerprint();
    if (provenance.compose_fingerprint !== current) {
      err(
        "skill",
        `shipped files were rendered by a different compose (${provenance.compose_fingerprint ?? "none recorded"} != ${current}); run \`bun run compose ${source.id}\``,
      );
    }
  }

  // A large index moves to index.md; both files are part of the skill's navigation surface, so link
  // checking and index coverage must consider them together.
  const indexPath = join(skillDir, "index.md");
  const indexDoc = (await exists(indexPath)) ? await readFile(indexPath, "utf8") : "";
  if (indexDoc && !skill.includes("index.md")) err("skill", "index.md exists but SKILL.md does not link to it");
  const navigation = `${skill}\n${indexDoc}`;
  for (const m of navigation.matchAll(/\]\((references\/[^)#]+)(?:#[^)]*)?\)/g)) {
    if (!(await exists(join(skillDir, m[1]!)))) err("skill", `broken reference link ${m[1]}`);
  }
  for (const page of irPages) {
    if (!navigation.includes(`/${page}.md`)) warn("skill", `IR page ${page} is not reachable from SKILL.md or index.md`);
  }

  // 4. References must not outlive their IR: a stale file means a removed page is still shipping.
  const expected = new Set(irPages.map((p) => `${p}.md`));
  for (const cat of await listDirs(join(skillDir, "references"))) {
    for (const f of await listFiles(join(skillDir, "references", cat), ".md")) {
      if (!expected.has(f) && !f.endsWith(".tables.md")) err("skill", `references/${cat}/${f} has no IR page`);
    }
  }

  // 5. Cross-references between reference files must land. A dead file link was already caught for
  // SKILL.md, but a link into a *heading* was not checked anywhere, and 109 of them pointed at
  // nothing: the fragment was the source's section id, the heading is the rendered path
  // (AUDIT-OUTPUT finding 8). A link an agent follows to nowhere is worse than no link.
  const headingsOf = new Map<string, Set<string>>();
  const headings = async (file: string): Promise<Set<string> | null> => {
    if (headingsOf.has(file)) return headingsOf.get(file)!;
    if (!(await exists(file))) return null;
    const set = new Set([...(await readFile(file, "utf8")).matchAll(/^#{2,6} (.+)$/gm)].map((m) => headingAnchor(m[1]!)));
    headingsOf.set(file, set);
    return set;
  };
  let dead = 0;
  for (const cat of await listDirs(join(skillDir, "references"))) {
    for (const f of await listFiles(join(skillDir, "references", cat), ".md")) {
      const doc = await readFile(join(skillDir, "references", cat, f), "utf8");
      for (const m of doc.matchAll(/\]\((?!https?:)([^)\s#]+\.md)(?:#([^)\s]+))?\)/g)) {
        const target = join(skillDir, "references", cat, m[1]!);
        const set = await headings(target);
        if (!set) {
          err("skill", `references/${cat}/${f}: link to missing file ${m[1]}`);
          continue;
        }
        if (m[2] && !set.has(m[2].toLowerCase())) {
          dead++;
          if (dead <= 3) err("skill", `references/${cat}/${f}: link to missing heading ${m[1]}#${m[2]}`);
        }
      }
    }
  }
  if (dead > 3) err("skill", `…and ${dead - 3} more links to headings that do not exist`);
  return findings;
}

/** GitHub-style heading anchor, matching what compose generates for a "### section" line. */
function headingAnchor(heading: string): string {
  return heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
}
