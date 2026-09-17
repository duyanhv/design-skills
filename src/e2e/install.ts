#!/usr/bin/env bun
/**
 * Does an installed skill actually work?
 *
 * Every other check in this repository inspects the repository. This one exercises the path a user
 * takes: follow the README's install instructions, then load the skill the way an agent does —
 * read `SKILL.md`, follow its links, and confirm every file it promises is reachable from the
 * installed location rather than from the working tree.
 *
 * It exists because an audit pointed out that all of the verification was upstream of the thing
 * being verified. The bundles were checked; the *installation* was not, and three defects were
 * sitting in it:
 *
 *   - `build:public` did not build accessibility-claims, so the committed skill was never compared
 *     against its guidance
 *   - CI's drift guard named two of the three published skills
 *   - the README's install instructions named two of the three
 *
 * A skill that installs into a broken state is a skill that does not work, however green the
 * repository's own checks are.
 *
 * Usage: bun run src/e2e/install.ts
 */
import { mkdtemp, rm, mkdir, symlink, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { ROOT, exists } from "../util/fs.ts";
import { log } from "../util/log.ts";

let failed = 0;
const fail = (msg: string, detail?: string) => {
  console.log(`✗ ${msg}`);
  if (detail) console.log(`    ${detail}`);
  failed++;
};
const pass = (msg: string) => console.log(`✓ ${msg}`);

/** The skills the README tells people to install. Read from the README, not hard-coded here. */
const readme = await readFile(join(ROOT, "README.md"), "utf8");
const installed = [...readme.matchAll(/ln -s "\$PWD\/skills\/([a-z0-9-]+)"/g)].map((m) => m[1]!);
const advertised = [...new Set(installed)];

// Every publicly committed skill. A bundle that is published but never mentioned in the install
// section is one a reader cannot install by following the documentation.
const published: string[] = [];
for (const entry of await readdir(join(ROOT, "skills"))) {
  const dir = join(ROOT, "skills", entry);
  if (!(await stat(dir)).isDirectory()) continue;
  if (!(await exists(join(dir, "SKILL.md")))) continue;
  // Locally-built, non-redistributable output is git-ignored and not installable from a clone.
  const proc = Bun.spawn(["git", "ls-files", "--error-unmatch", `skills/${entry}/SKILL.md`], {
    cwd: ROOT, stdout: "ignore", stderr: "ignore",
  });
  if ((await proc.exited) === 0) published.push(entry);
}

// lumen-ds is an invented design system used as a test fixture — the README says so in its skill
// table — so it is published to be *read*, not installed. Excluded by name rather than by a
// heuristic, so adding another fixture is a deliberate act.
const FIXTURES = new Set(["lumen-ds"]);
const missing = published.filter((s) => !advertised.includes(s) && !FIXTURES.has(s));
if (missing.length) {
  fail(`the README's install instructions omit: ${missing.join(", ")}`,
       "a published skill nobody is told how to install is a skill nobody installs");
} else {
  pass(`the install instructions cover all ${published.length} published skill(s)`);
}

const stale = advertised.filter((s) => !published.includes(s));
if (stale.length) {
  fail(`the README tells people to install skills that are not published: ${stale.join(", ")}`,
       "the symlink command would fail, or link to a directory built only locally");
}

// ---- Install each one the way the README says, into a throwaway "agent skills" directory. ----
const home = await mkdtemp(join(tmpdir(), "design-skills-install-"));
try {
  const skillsDir = join(home, ".agents", "skills");
  await mkdir(skillsDir, { recursive: true });

  for (const skill of published) {
    await symlink(join(ROOT, "skills", skill), join(skillsDir, skill));
  }

  for (const skill of published) {
    const root = join(skillsDir, skill);
    const entry = join(root, "SKILL.md");
    if (!(await exists(entry))) {
      fail(`${skill}: SKILL.md is not readable through the installed symlink`);
      continue;
    }

    // Walk the bundle the way an agent does: from SKILL.md, following local links transitively.
    const seen = new Set<string>(["SKILL.md"]);
    const queue = ["SKILL.md"];
    let broken = 0;
    let followed = 0;
    while (queue.length) {
      const file = queue.shift()!;
      const text = await readFile(join(root, file), "utf8");
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const href = match[1]!;
        if (href.startsWith("http") || href.startsWith("#")) continue;
        const target = resolve(dirname(join(root, file)), href.split("#")[0]!);
        // `inspectAuthored` already rejects a link that escapes the bundle or points at nothing,
        // and it does so at build time, so neither can reach a published skill. Verified by making
        // both edits: the build fails before this check runs. They are still *traversed* here
        // rather than asserted, because the point of this check is that the walk happens through
        // the INSTALLED symlink — a path nothing else exercises — and a link that resolves in the
        // working tree but not from the install directory would show up right here.
        if (!target.startsWith(root) || !(await exists(target))) {
          fail(`${skill}/${file} links to ${href}, which does not resolve from the install location`,
               "resolves in the working tree but not for someone who installed only this folder");
          broken++;
          continue;
        }
        followed++;
        const rel = target.slice(root.length + 1);
        if (rel.endsWith(".md") && !seen.has(rel)) {
          seen.add(rel);
          queue.push(rel);
        }
      }
    }

    // Everything shipped should be reachable. `inspectAuthored` checks this too, at build time;
    // this repeats it against the installed tree so that a file present in guidance/ but missing
    // from the published bundle — a packaging failure rather than an authoring one — is caught.
    const shipped: string[] = [];
    const walk = async (dir: string) => {
      for (const item of await readdir(dir)) {
        const full = join(dir, item);
        if ((await stat(full)).isDirectory()) await walk(full);
        else if (item.endsWith(".md")) shipped.push(full.slice(root.length + 1));
      }
    };
    await walk(root);
    const unreachable = shipped.filter((f) => !seen.has(f));

    if (broken) continue;
    if (unreachable.length) {
      fail(`${skill}: ${unreachable.length} shipped file(s) unreachable from SKILL.md`,
           unreachable.slice(0, 3).join(", "));
      continue;
    }
    pass(`${skill}: installs, and all ${seen.size} file(s) resolve through ${followed} link(s)`);
  }
} finally {
  await rm(home, { recursive: true, force: true });
}

console.log("");
if (failed) {
  log.warn(`${failed} problem(s) installing the published skills as documented`);
  process.exit(1);
}
log.info(`all ${published.length} published skill(s) install and load as the README describes`);
