import { readdir, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join, dirname, posix } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Source } from "../schema/source.ts";
import type { Finding } from "../validate/index.ts";
import { ROOT, paths } from "../util/fs.ts";
import { shortHash } from "../util/hash.ts";

const Frontmatter = z.object({
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  description: z.string().min(1).max(1024),
  license: z.literal("MIT"),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()),
});

async function markdownFiles(dir: string, prefix = ""): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Authored bundle cannot contain symlinks: ${name}`);
    if (entry.isDirectory()) Object.assign(files, await markdownFiles(join(dir, entry.name), name + "/"));
    else if (entry.name.endsWith(".md")) files[name] = await readFile(join(dir, entry.name), "utf8");
  }
  return files;
}

/** Validate original writing as original writing, without manufacturing extracted guideline rules. */
export function inspectAuthored(files: Record<string, string>, source: Source): string[] {
  const errors: string[] = [];
  const entry = files["SKILL.md"] ?? "";
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(entry);
  try {
    const data = Frontmatter.parse(fm ? parse(fm[1]!) : null);
    if (data.name !== source.skill.name) errors.push("SKILL.md name differs from the manifest");
    if (data.metadata.authorship !== "original") errors.push("metadata.authorship must be original");
    if (data.description !== source.skill.description) errors.push("description differs from the manifest");
  } catch { errors.push("Invalid authored SKILL.md frontmatter"); }
  if (entry.split("\n").length > source.skill.max_skill_lines || entry.length > 20000) errors.push("Entry file exceeds its size budget");
  const reachable = new Set(["SKILL.md"]);
  const queue = ["SKILL.md"];
  while (queue.length) {
    const file = queue.shift()!;
    for (const link of (files[file] ?? "").matchAll(/\]\(([^)]+)\)/g)) {
      const href = link[1]!;
      if (href.startsWith("https://") || href.startsWith("#")) continue;
      const target = posix.normalize(posix.join(posix.dirname(file), href.split("#")[0]!));
      if (target.startsWith("../") || !(target in files)) { errors.push(`Broken local link in ${file}: ${href}`); continue; }
      if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
    }
  }
  for (const file of Object.keys(files)) if (!reachable.has(file)) errors.push(`Unreachable reference: ${file}`);
  if (!Object.values(files).some((text) => text.includes(source.base_url))) errors.push("Official source URL is missing");
  return errors;
}

function provenance(source: Source, files: Record<string, string>) {
  return {
    source: source.id, kind: "authored", authorship: "original", license: source.license,
    format: "authored-skill@1", partial: false,
    note: "Original design-skills workflow instructions. Linked upstream guidelines are not bundled; upstream completeness and freshness are not asserted.",
    files: Object.fromEntries(Object.entries(files).map(([file, content]) => [file, shortHash(content)])),
    references: [...new Set(Object.values(files).flatMap((text) => [...text.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => m[1]!)))].sort(),
  };
}

function assertAuthoredSource(source: Source): void {
  if (source.kind !== "authored" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.skill.name)) throw new Error("Authored source and output names must be safe slugs");
  if (!source.license.redistributable || source.license.spdx !== "MIT") throw new Error("Authored bundles must declare their original text as redistributable MIT content");
}

export async function buildAuthoredSource(source: Source): Promise<void> {
  assertAuthoredSource(source);
  const files = await markdownFiles(join(ROOT, "guidance", source.id));
  const errors = inspectAuthored(files, source);
  if (errors.length) throw new Error(errors.join("\n"));
  const output = paths.skill(source.skill.name);
  await rm(output, { recursive: true, force: true });
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(join(output, file)), { recursive: true });
    await writeFile(join(output, file), text);
  }
  await writeFile(join(output, "provenance.json"), JSON.stringify(provenance(source, files), null, 2) + "\n");
  console.log(`Built ${source.id}: ${Object.keys(files).length} original Markdown files → skills/${source.skill.name}/`);
}

export async function validateAuthoredSource(source: Source): Promise<Finding[]> {
  try {
    assertAuthoredSource(source);
    const expected = await markdownFiles(join(ROOT, "guidance", source.id));
    const shipped = await markdownFiles(paths.skill(source.skill.name));
    const errors = inspectAuthored(shipped, source);
    if (JSON.stringify(expected) !== JSON.stringify(shipped)) errors.push("Published Markdown differs from its authored inputs; rebuild");
    const actual = await readFile(join(paths.skill(source.skill.name), "provenance.json"), "utf8");
    if (actual !== JSON.stringify(provenance(source, shipped), null, 2) + "\n") errors.push("Authored provenance does not match the published files");
    return errors.map((message) => ({ level: "error", where: source.id, message }));
  } catch (error) { return [{ level: "error", where: source.id, message: (error as Error).message }]; }
}
