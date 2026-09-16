#!/usr/bin/env bun
/**
 * Negative tests for the documentation link check.
 *
 * A check that has never been seen to fail is a guess. This one was written after a review found two
 * real gaps in its first version — cross-file anchors were not resolved at all, and an untracked
 * file counted as published because only *ignored* paths were rejected. Both had been "verified" by
 * hand, and the hand probes proved nothing a week later because they lived in a shell history.
 *
 * So each defect gets a case here. Every case builds a tiny real git repository in a temp directory,
 * writes one broken link into it, and asserts `checkLinks` reports that specific problem. The
 * control cases matter as much: a valid cross-file anchor and a link to a *staged* file must pass,
 * because a checker that rejects everything would satisfy every negative case above.
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { checkLinks, anchors } from "./docs.ts";
import { log } from "../util/log.ts";

interface Case {
  name: string;
  /** Files to write, relative path → contents. */
  files: Record<string, string>;
  /** Paths left out of `git add`, to model an untracked or ignored target. */
  untracked?: string[];
  /** `.gitignore` contents, when the case is about a local-only build product. */
  ignore?: string;
  /** Substring the reported problem must contain, or null when the link must be accepted. */
  expect: string | null;
}

const TARGET = "# Target\n\n## A Real Section\n\nBody.\n";

const CASES: Case[] = [
  {
    name: "a link to a path that does not exist",
    files: { "README.md": "[x](docs/nope.md)\n" },
    expect: "link to missing path docs/nope.md",
  },
  {
    name: "a link to a file git does not track",
    files: { "README.md": "[x](docs/scratch.md)\n", "docs/scratch.md": "# Scratch\n" },
    untracked: ["docs/scratch.md"],
    expect: "not tracked by git",
  },
  {
    name: "a link to the local-only output of a non-redistributable source",
    files: { "README.md": "[x](skills/apple-hig/SKILL.md)\n", "skills/apple-hig/SKILL.md": "# Local\n" },
    untracked: ["skills/apple-hig/SKILL.md"],
    ignore: "skills/apple-hig/\n",
    // The wording has to name *why*, since the fix differs: publish the file, or stop linking it.
    expect: "git-ignored, a local-only build product",
  },
  {
    name: "an anchor into another file whose heading does not exist",
    files: { "README.md": "[x](docs/target.md#renamed-away)\n", "docs/target.md": TARGET },
    expect: "no heading in docs/target.md for anchor #renamed-away",
  },
  {
    name: "an anchor into this file whose heading does not exist",
    files: { "README.md": "# Only Heading\n\n[x](#not-here)\n" },
    expect: "no heading in this file for anchor #not-here",
  },
  {
    name: "an anchor matching a heading that only exists inside a fenced code block",
    files: { "README.md": "# Real\n\n```md\n## Fenced Heading\n```\n\n[x](#fenced-heading)\n" },
    expect: "no heading in this file for anchor #fenced-heading",
  },
  // Controls. Without these, a checker that failed every link would pass every case above.
  {
    name: "a valid anchor into another file is accepted",
    files: { "README.md": "[x](docs/target.md#a-real-section)\n", "docs/target.md": TARGET },
    expect: null,
  },
  {
    name: "a link to a directory is accepted",
    files: { "README.md": "[x](docs/)\n", "docs/target.md": TARGET },
    expect: null,
  },
  {
    name: "a link to a file staged in this very commit is accepted",
    // The target is added but never committed: exactly the state of a PR that introduces both.
    files: { "README.md": "[x](docs/brand-new.md)\n", "docs/brand-new.md": "# Brand new\n" },
    expect: null,
  },
  {
    name: "an external URL containing a fragment is not treated as a local anchor",
    files: { "README.md": "[x](https://example.invalid/page#frag)\n" },
    expect: null,
  },
];

async function run(root: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], { cwd: root, stdout: "ignore", stderr: "ignore" });
  if ((await proc.exited) !== 0) throw new Error(`git ${args.join(" ")} failed`);
}

let failed = 0;
const scratch: string[] = [];

try {
  for (const testCase of CASES) {
    const root = await mkdtemp(join(tmpdir(), "ds-docs-negative-"));
    scratch.push(root);
    await run(root, ["init", "-q"]);
    if (testCase.ignore) await writeFile(join(root, ".gitignore"), testCase.ignore);
    for (const [path, body] of Object.entries(testCase.files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), body);
    }
    const untracked = new Set(testCase.untracked ?? []);
    const add = Object.keys(testCase.files).filter((p) => !untracked.has(p));
    if (testCase.ignore) add.push(".gitignore");
    if (add.length) await run(root, ["add", "--", ...add]);

    const { problems } = await checkLinks(root);
    const matched = testCase.expect === null ? problems.length === 0 : problems.some((p) => p.includes(testCase.expect!));
    if (matched) {
      console.log(`✓ ${testCase.name}`);
      console.log(`    → ${testCase.expect === null ? "accepted, as it must be" : "reported, as it must be"}`);
    } else {
      failed++;
      console.log(`✗ ${testCase.name}`);
      console.log(`    expected: ${testCase.expect ?? "no problem reported"}`);
      console.log(`    got:      ${problems.length ? problems.join("\n              ") : "no problem reported"}`);
    }
  }

  // GitHub suffixes a repeated heading rather than producing two identical anchors. A link to
  // `#dup-1` is the only way to reach the second one, so the slugger has to agree with GitHub.
  const repeated = anchors("# Dup\n# Dup\n# Dup\n");
  const expected = ["dup", "dup-1", "dup-2"];
  if (expected.every((a) => repeated.has(a)) && repeated.size === 3) {
    console.log("✓ repeated headings get GitHub's -1/-2 anchor suffixes");
    console.log("    → dup, dup-1, dup-2, as GitHub renders them");
  } else {
    failed++;
    console.log(`✗ repeated headings get GitHub's -1/-2 anchor suffixes`);
    console.log(`    got: ${[...repeated].join(", ")}`);
  }
} finally {
  await Promise.all(scratch.map((p) => rm(p, { recursive: true, force: true })));
}

if (failed) {
  log.warn(`${failed} documentation-link guard(s) did not behave as claimed`);
  process.exit(1);
}
log.info(`all ${CASES.length + 1} documentation-link guards fire on the defect they claim to catch`);
