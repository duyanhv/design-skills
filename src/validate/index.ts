import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { Source } from "../schema/source.ts";
import { PageIRSchema } from "../schema/ir.ts";
import { exists, listFiles, paths, readJson, ROOT } from "../util/fs.ts";

export interface Finding { level: "error" | "warn"; where: string; message: string }

export async function validateSource(source: Source): Promise<Finding[]> {
  const findings: Finding[] = [];
  const err = (where: string, message: string) => findings.push({ level: "error", where, message });
  const warn = (where: string, message: string) => findings.push({ level: "warn", where, message });

  // 1. IR: schema, provenance, id uniqueness
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
    if (!ir.rules.some((r) => r.kind === "rule")) warn(where, "page has zero rules");
    for (const r of ir.rules) {
      if (ids.has(r.id)) err(where, `duplicate rule id ${r.id}`);
      ids.add(r.id);
      if (!r.provenance.url.startsWith(source.canonical_url ?? source.base_url)) err(where, `${r.id}: provenance url outside source`);
      if (r.provenance.source_hash !== ir.source_hash) err(where, `${r.id}: provenance hash != page hash`);
      for (const p of r.platforms) if (!source.platforms.includes(p)) err(where, `${r.id}: unknown platform ${p}`);
    }

  }

  // 2. Non-redistributable sources must have their outputs git-ignored
  if (!source.license.redistributable) {
    const gi = (await exists(join(ROOT, ".gitignore"))) ? await readFile(join(ROOT, ".gitignore"), "utf8") : "";
    for (const dir of [`ir/${source.id}/`, `skills/${source.skill.name}/`]) {
      if (!gi.split("\n").some((l) => l.trim() === dir)) err("license", `${dir} must be listed in .gitignore (license.redistributable is false)`);
    }
  }

  // 3. Skill: exists, line budget, frontmatter, references resolve
  const skillDir = paths.skill(source.skill.name);
  const skillPath = join(skillDir, "SKILL.md");
  if (!(await exists(skillPath))) {
    err("skill", "SKILL.md missing (run compose)");
    return findings;
  }
  const skill = await readFile(skillPath, "utf8");
  const lines = skill.split("\n").length;
  if (lines > source.skill.max_skill_lines) err("skill", `SKILL.md is ${lines} lines, budget ${source.skill.max_skill_lines}`);
  if (!/^---\nname: [a-z0-9-]+\ndescription: /.test(skill)) err("skill", "frontmatter must start with name + description");
  const descMatch = /^description: "(.*)"$/m.exec(skill);
  if (descMatch && descMatch[1]!.length > 1024) err("skill", "description exceeds 1024 chars");
  for (const m of skill.matchAll(/\]\((references\/[^)]+)\)/g)) {
    if (!(await exists(join(skillDir, m[1]!)))) err("skill", `broken reference link ${m[1]}`);
  }
  for (const page of irPages) {
    if (!skill.includes(`/${page}.md`)) warn("skill", `IR page ${page} not linked from SKILL.md index`);
  }
  return findings;
}
