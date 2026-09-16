#!/usr/bin/env bun
/**
 * The repository's own Markdown is the public entry point: a visitor reads README.md on GitHub and
 * clicks through to a skill bundle. Those links are checked by nobody — `validate` inspects links
 * *inside* a skill bundle, and the authored build only sees `guidance/`. A renamed heading or a
 * deleted document leaves a README link that renders fine locally and 404s on GitHub.
 *
 * Two failure modes matter, and the second is specific to this project:
 *
 *   1. A relative link to a path that does not exist.
 *   2. A relative link to a path that *does* exist locally but is **git-ignored** — the output of a
 *      non-redistributable source. It resolves on the author's machine, where apple-hig has been
 *      built, and is a dead link for everyone else. The license gate keeps that text out of the
 *      repository; this keeps us from advertising it as though it were in.
 *
 * Anchors are checked within the linking file only, since that is where a renamed section silently
 * breaks navigation we just wrote.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, dirname, posix } from "node:path";
import { ROOT, exists } from "../util/fs.ts";
import { gitIgnores } from "../util/git.ts";
import { log } from "../util/log.ts";

/**
 * Markdown outside a generated bundle: the documents a human reads on GitHub.
 *
 * `test/fixtures` is excluded because its Markdown is *input* — staged copies of source pages whose
 * links are upstream site paths, not links into this repository.
 */
async function documents(): Promise<string[]> {
  const skip = new Set(["node_modules", ".git", ".cache", "skills", "ir", "evals", "fixtures"]);
  const found: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name !== ".github") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) await walk(path);
      } else if (entry.name.endsWith(".md")) found.push(path);
    }
  };
  await walk(ROOT);
  // The two output READMEs are hand-written rather than generated, so they are documents too.
  for (const p of [join(ROOT, "skills", "README.md")]) if (await exists(p)) found.push(p);
  return found.sort();
}

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens. */
function anchors(markdown: string): Set<string> {
  const set = new Set<string>();
  for (const m of markdown.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    set.add(
      m[1]!
        .replace(/`([^`]*)`/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-"),
    );
  }
  return set;
}

let failed = 0;
const fail = (msg: string) => {
  console.log(`✗ ${msg}`);
  failed++;
};

let checked = 0;
for (const file of await documents()) {
  const shown = relative(ROOT, file);
  const text = await readFile(file, "utf8");
  const own = anchors(text);
  for (const link of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = link[1]!;
    if (/^(https?:|mailto:)/.test(href)) continue;
    checked++;
    const [path, anchor] = href.split("#") as [string, string | undefined];
    if (!path) {
      if (anchor && !own.has(anchor)) fail(`${shown}: no heading for anchor #${anchor}`);
      continue;
    }
    const target = resolve(dirname(file), path);
    if (!(await exists(target))) {
      fail(`${shown}: link to missing path ${href}`);
      continue;
    }
    // A git-ignored target is a local-only build product: present here, absent on GitHub.
    const rel = posix.normalize(relative(ROOT, target).split(/[\\/]/).join("/"));
    if (await gitIgnores(rel)) fail(`${shown}: link to git-ignored path ${href} (not published)`);
  }
}

if (failed) {
  log.warn(`${failed} broken documentation link(s)`);
  process.exit(1);
}
log.info(`all ${checked} relative documentation links resolve to published paths`);
