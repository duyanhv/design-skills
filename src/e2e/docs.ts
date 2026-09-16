#!/usr/bin/env bun
/**
 * The repository's own Markdown is the public entry point: a visitor reads README.md on GitHub and
 * clicks through to a skill bundle. Those links are checked by nothing else — `validate` inspects
 * links *inside* a skill bundle, and the authored build only sees `guidance/`. A renamed heading or
 * a deleted document leaves a README link that renders fine locally and 404s on GitHub.
 *
 * "Resolves on GitHub" is the question, and it is not the same question as "opens on my machine".
 * Three ways a link passes locally and fails for a visitor:
 *
 *   1. The path does not exist at all.
 *   2. The path exists but git does not track it. An untracked scratch file, and — the case specific
 *      to this project — the output of a non-redistributable source. `skills/apple-hig/` is real on
 *      a machine that has built it and absent for everyone else. The license gate keeps that text
 *      out of the repository; this keeps us from advertising it as though it were in. Tracking is
 *      the direct test: an ignored path is never tracked, but an untracked path is a dead link
 *      whether or not anyone ignored it.
 *   3. The path is right and the `#anchor` is not, because a heading was reworded. Anchors resolve
 *      in the *target* file, which is the case that matters when one document links into a section
 *      of another.
 *
 * Every one of those is exercised against a scratch repository by `docs-negative.ts`, which is why
 * the checking logic below takes a root rather than reading `process.cwd()`.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, dirname } from "node:path";
import { ROOT, exists } from "../util/fs.ts";
import { log } from "../util/log.ts";

/**
 * Markdown outside a generated bundle: the documents a human reads on GitHub.
 *
 * `test/fixtures` is excluded because its Markdown is *input* — staged copies of source pages whose
 * links are upstream site paths, not links into this repository.
 */
async function documents(root: string): Promise<string[]> {
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
  await walk(root);
  // The output README is hand-written rather than generated, so it is a document too.
  const output = join(root, "skills", "README.md");
  if (await exists(output)) found.push(output);
  return found.sort();
}

async function git(root: string, args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const proc = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "ignore" });
    const stdout = await new Response(proc.stdout).text();
    return { code: await proc.exited, stdout };
  } catch {
    return { code: -1, stdout: "" };
  }
}

/**
 * Everything git would publish: committed files plus anything staged, since a link added in the
 * same commit as its target is correct and must not be reported as broken. `null` when git cannot
 * answer (a tarball, say), so the caller can say the question went unasked instead of passing.
 */
async function trackedPaths(root: string): Promise<Set<string> | null> {
  const { code, stdout } = await git(root, ["ls-files", "--cached"]);
  if (code !== 0) return null;
  const set = new Set<string>();
  for (const file of stdout.split("\n").filter(Boolean)) {
    set.add(file);
    // A link may point at a directory; record every ancestor so `skills/apple-design/` resolves.
    for (let i = file.indexOf("/"); i !== -1; i = file.indexOf("/", i + 1)) set.add(file.slice(0, i));
  }
  return set;
}

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens, repeats suffixed. */
export function anchors(markdown: string): Set<string> {
  const set = new Set<string>();
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const slug = m[1]!
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_]/g, "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    let candidate = slug;
    for (let n = 1; set.has(candidate); n++) candidate = `${slug}-${n}`;
    set.add(candidate);
  }
  return set;
}

export interface LinkReport {
  problems: string[];
  checked: number;
  anchorsChecked: number;
  /** False when git could not be consulted, so "is it published?" went unanswered. */
  trackingKnown: boolean;
}

/** Check every relative Markdown link under `root` for a target a GitHub visitor could open. */
export async function checkLinks(root: string): Promise<LinkReport> {
  const problems: string[] = [];
  const tracked = await trackedPaths(root);
  const anchorCache = new Map<string, Set<string>>();
  let checked = 0;
  let anchorsChecked = 0;

  for (const file of await documents(root)) {
    const shown = relative(root, file);
    for (const link of (await readFile(file, "utf8")).matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = link[1]!;
      if (/^(https?:|mailto:)/.test(href)) continue;
      checked++;
      const [path, anchor] = href.split("#") as [string, string | undefined];
      const target = path ? resolve(dirname(file), path) : file;

      if (path) {
        if (!(await exists(target))) {
          problems.push(`${shown}: link to missing path ${href}`);
          continue;
        }
        const rel = relative(root, target).split(/[\\/]/).join("/");
        if (tracked && !tracked.has(rel)) {
          const ignored = (await git(root, ["check-ignore", "-q", rel])).code === 0;
          const why = ignored ? "git-ignored, a local-only build product" : "not tracked by git";
          problems.push(`${shown}: link to ${href} — ${why}, so it does not exist on GitHub`);
          continue;
        }
      }

      // An anchor resolves only in Markdown we can read; a link into another file type is left alone.
      if (anchor && target.endsWith(".md")) {
        anchorsChecked++;
        let found = anchorCache.get(target);
        if (!found) anchorCache.set(target, (found = anchors(await readFile(target, "utf8"))));
        if (!found.has(anchor)) {
          const where = target === file ? "this file" : relative(root, target);
          problems.push(`${shown}: no heading in ${where} for anchor #${anchor} (${href})`);
        }
      }
    }
  }
  return { problems, checked, anchorsChecked, trackingKnown: tracked !== null };
}

if (import.meta.main) {
  const report = await checkLinks(ROOT);
  for (const problem of report.problems) console.log(`✗ ${problem}`);
  if (report.problems.length) {
    log.warn(`${report.problems.length} broken documentation link(s)`);
    process.exit(1);
  }
  if (!report.trackingKnown) log.warn("git unavailable: links were not checked for being published");
  log.info(
    `all ${report.checked} relative documentation links resolve to published paths (${report.anchorsChecked} with anchors)`,
  );
}
