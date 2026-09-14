#!/usr/bin/env bun
/**
 * Every `sources/*.yaml` must parse against the source schema, its routing must name pages that
 * could exist, and a non-redistributable source must already be git-ignored — *before* anyone runs
 * a build that would write its output into the working tree.
 *
 * This runs in CI, where no source has been built, so it checks the manifests rather than the IR.
 */
import { SourceSchema } from "../schema/source.ts";
import { listSources, paths } from "../util/fs.ts";
import { gitIgnores } from "../util/git.ts";
import { parse as parseYaml } from "yaml";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { log } from "../util/log.ts";

let failed = 0;
const fail = (msg: string) => {
  console.log(`✗ ${msg}`);
  failed++;
};

for (const id of await listSources()) {
  const raw = await readFile(join(paths.sources, `${id}.yaml`), "utf8");
  const parsed = SourceSchema.safeParse(parseYaml(raw));
  if (!parsed.success) {
    for (const i of parsed.error.issues) fail(`${id}: ${i.path.join(".")}: ${i.message}`);
    continue;
  }
  const source = parsed.data;
  if (source.id !== id) fail(`${id}: manifest id is "${source.id}"`);

  // Routing slugs are only resolvable after a build, but duplicates and blanks are always wrong.
  const seen = new Set<string>();
  for (const r of source.skill.routing) {
    if (!r.read.length) fail(`${id}: routing "${r.when}" reads nothing`);
    for (const slug of r.read) {
      if (!/^[a-z0-9-]+$/.test(slug)) fail(`${id}: routing slug "${slug}" is not a page slug`);
    }
    if (seen.has(r.when)) fail(`${id}: duplicate routing condition "${r.when}"`);
    seen.add(r.when);
  }

  // The license gate, checked against git's effective behaviour rather than .gitignore's text.
  if (!source.license.redistributable) {
    for (const dir of [`ir/${source.id}/`, `skills/${source.skill.name}/`]) {
      if (!(await gitIgnores(`${dir}SKILL.md`))) fail(`${id}: ${dir} must be git-ignored (license.redistributable is false)`);
    }
  }
  console.log(`✓ ${id} (${source.kind}, ${source.license.spdx}${source.license.redistributable ? "" : ", local-only"})`);
}

if (failed) {
  log.warn(`${failed} manifest problem(s)`);
  process.exit(1);
}
log.info("all source manifests are valid");
