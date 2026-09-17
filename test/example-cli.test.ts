import { test, expect } from "bun:test";
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Integration tests: the real CLI, run as CI runs it, against a temporary copy of the repository.
 *
 * These exist because of a gap an audit found that every unit test in this repo was structurally
 * incapable of noticing. `test/pilot-claims.test.ts` calls `checkPilotClaims()` directly, so
 * deleting the single line in `example.ts` that turns its problems into failures left all 17 of
 * those tests green while the CLI exited 0 on input it had just been shown to reject. The validator
 * was tested; the wire from the validator to CI was not.
 *
 * That is the same mistake as the previous five rounds at one more remove: verifying the piece I
 * was looking at rather than the thing that actually runs. So these tests run the binary and assert
 * on its exit status and its diagnostics, which is the contract CI depends on.
 *
 * Every case has a control: the same fixture without the defect must exit 0. A test that only ever
 * sees failure cannot tell a working check from one that rejects everything.
 */

// Anchored to this file, not to process.cwd(). Running `bun test` from another directory made
// every case here fail on a missing fixture — which would have read as a broken check rather than
// a broken invocation, exactly the confusion these tests exist to prevent.
const REPO = join(import.meta.dir, "..");

/**
 * Build the sandbox from `git ls-files` rather than a hand-written list.
 *
 * The list started as "files the example CLI reads" and stopped being true the moment these tests
 * covered other tools: docs.ts resolves every relative link in README.md, so omitting CONTRIBUTING.md
 * and LICENSING.md made its control run fail on missing files that exist perfectly well in the
 * repository. A control that fails for a reason unrelated to the defect proves nothing, and worse,
 * looks like a finding.
 *
 * Copying what git tracks removes the guesswork: the sandbox is the repository as published, which
 * is also exactly the set docs.ts is asking about.
 */
// Only paths git does not track are skipped, and git ls-files already excludes those. skills/ is
// NOT excluded: skills/apple-design/ is redistributable and tracked, and README.md links into it,
// so dropping it made docs.ts report thirty broken links that are fine in the repository.
const IGNORED_PREFIXES: string[] = [];

async function trackedFiles(): Promise<string[]> {
  const proc = Bun.spawn(["git", "ls-files"], { cwd: REPO, stdout: "pipe", stderr: "ignore" });
  const listing = await new Response(proc.stdout).text();
  await proc.exited;
  return listing.split("\n").filter(Boolean);
}

async function sandbox(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "design-skills-cli-"));
  for (const entry of await trackedFiles()) {
    if (IGNORED_PREFIXES.some((prefix) => entry.startsWith(prefix))) continue;
    const to = join(dir, entry);
    await mkdir(join(to, ".."), { recursive: true });
    await cp(join(REPO, entry), to);
  }
  // Built skills are git-ignored for the non-redistributable sources, and manifests checks exactly
  // that. Copying the ignore file keeps that check meaningful in the sandbox.
  await cp(join(REPO, ".gitignore"), join(dir, ".gitignore"));
  // The pre-registered-artifact check shells out to git log, so the copy needs history to read.
  // Pointing it at the real repository keeps that check meaningful instead of silently empty.
  await writeFile(join(dir, ".git"), `gitdir: ${join(REPO, ".git")}\n`);
  return dir;
}

/** Run an e2e CLI inside a sandbox, returning its exit code and combined output. */
async function runTool(dir: string, tool: string): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn(["bun", "run", join(dir, "src", "e2e", `${tool}.ts`)], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, output: stdout + stderr };
}

const runCli = (dir: string) => runTool(dir, "example");

/** Apply an edit to one file inside the sandbox. */
async function edit(dir: string, file: string, change: (text: string) => string): Promise<void> {
  const path = join(dir, file);
  const before = await readFile(path, "utf8");
  const after = change(before);
  if (after === before) throw new Error(`edit to ${file} changed nothing; the fixture moved`);
  await writeFile(path, after);
}

const RESULTS = "examples/react-native-pilot/harness/results.tsv";
const REFERENCE = "guidance/apple-design/references/frameworks/react-native.md";

/**
 * Run the CLI twice: once unmodified, once with a defect introduced. The control is the point —
 * it proves the sandbox is sound, so a failure in the second run is the defect and not the setup.
 */
async function controlAndDefect(
  apply: (dir: string) => Promise<void>,
): Promise<{ control: Awaited<ReturnType<typeof runCli>>; defect: Awaited<ReturnType<typeof runCli>> }> {
  const dir = await sandbox();
  try {
    const control = await runCli(dir);
    await apply(dir);
    const defect = await runCli(dir);
    return { control, defect };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("the CLI passes on an unmodified copy of the repository", async () => {
  const dir = await sandbox();
  try {
    const { code, output } = await runCli(dir);
    expect(output).not.toContain("✗");
    expect(code).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 60_000);

test("an unmeasured variant fails the CLI, not just the validator", async () => {
  // The exact case that exposed the gap: with the propagation line removed, this exited 0.
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, RESULTS, (t) =>
      t.split("\n").map((l) => (l.startsWith("C-inline-cap") ? "C-inline-cap\t-\tmissing\t-\t-" : l)).join("\n")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("C-inline-cap has 0 measured row(s)");
}, 60_000);

test("a wrong result cell fails the CLI", async () => {
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, REFERENCE, (t) =>
      t.replace(
        /\| \*\(control\)\* change the title's text \| 53\.15% \| [^|]*\|/,
        "| *(control)* change the title's text | 99.99% | Previously measured 53.15%. |")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain('cell for CONTROL-edited-text says "99.99%"');
}, 60_000);

test("a zero denominator fails the CLI", async () => {
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, RESULTS, (t) => t.replace("\t0\t2993292", "\t0\t0")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain('B-max-multiplier reports a total of "0"');
}, 60_000);

test("a deleted variant row fails the CLI", async () => {
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, RESULTS, (t) => t.split("\n").filter((l) => !l.startsWith("A-uncapped")).join("\n")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("missing variant(s): A-uncapped");
}, 60_000);

test("a percentage that contradicts its counts fails the CLI", async () => {
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, RESULTS, (t) => t.replace("55.26%", "40.00%")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("is 55.26%");
}, 60_000);

/*
 * The CLI's other claim checks, exercised end to end for the same reason.
 *
 * These call fail() inline rather than through a validator, so they cannot have the exact
 * disconnect found above. They are here because that reasoning is a prediction about the code, and
 * this file exists precisely because predictions about the code are what kept turning out wrong.
 */
test("a headline score that disagrees with the scoring table fails the CLI", async () => {
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "README.md", (t) => t.replace(/\d+ of \d+ valid planted/, "99 of 99 valid planted")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("scoring table gives");
}, 60_000);

test("a measurement that disagrees with the committed probe output fails the CLI", async () => {
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "examples/apple-design-review/measurements.md", (t) =>
      t.replace(/39\.5 × 26\.5 pt/g, "40.0 × 27.0 pt")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("does not quote the measured figure");
}, 60_000);

/*
 * The Material examples' scores, checked the same way.
 *
 * Both publish a headline ("11 of 12", "7 of 7") that summarises a pre-registered list. The Apple
 * example had three separate audits find drifted figures before a check tied them together, so
 * these were wired in as the examples were written rather than after the same thing happened again.
 */
test("a Material README claiming more than was pre-registered fails the CLI", async () => {
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "examples/material-3-review/README.md",
         (t) => t.replace("**11 of 12 credited**", "**13 of 13 credited**")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("pre-registers 12");
}, 60_000);

test("deleting a planted defect fails the CLI, because the score no longer matches", async () => {
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "examples/material-3-review/planted-defects.md", (t) => t.replace("**M12.", "**Mxx.")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
}, 60_000);

test("the review example's before/ screen must still render", async () => {
  // A straw man that throws on load tests nothing: any reviewer would find "it does not run" and
  // stop, so the example would stop being evidence about the guides.
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "examples/material-3-review/before/notification-settings.js",
         (t) => t.replace("<md-switch", "<broken-switch")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("no longer renders");
}, 60_000);

/**
 * The meta-test: break the wire itself.
 *
 * Everything above would still pass if `example.ts` reported pilot problems correctly today and
 * stopped tomorrow — unless something asserts that the connection is load-bearing. This removes the
 * propagation line in the sandbox and requires the CLI to stop catching a defect it otherwise
 * catches. If this test ever passes with the line intact, the guard below it has gone slack.
 */
test("removing the problem-propagation line makes the CLI miss a real defect", async () => {
  const dir = await sandbox();
  try {
    const PROPAGATION = "  for (const problem of pilot.problems) fail(problem.message, problem.detail);\n";
    const cli = join(dir, "src", "e2e", "example.ts");
    expect(await readFile(cli, "utf8")).toContain(PROPAGATION);

    // A defect the CLI is known to catch.
    await edit(dir, RESULTS, (t) => t.replace("\t0\t2993292", "\t0\t0"));
    const wired = await runCli(dir);
    expect(wired.code).not.toBe(0);

    // Same defect, propagation removed.
    await writeFile(cli, (await readFile(cli, "utf8")).replace(PROPAGATION, ""));
    const unwired = await runCli(dir);

    // This is the gap an audit found: the validator still reports the problem, and the CLI exits 0.
    expect(unwired.code).toBe(0);
    expect(wired.code).not.toBe(unwired.code);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 60_000);

/*
 * ---- Every e2e CLI must exit non-zero on the defect it exists to catch ----
 *
 * Generalised from the gap found in example.ts. That was not a one-off: docs.ts has the same shape,
 * and commenting out its `process.exit(1)` let a dangling link exit 0 while docs-negative.ts —
 * which tests `checkLinks` directly — stayed green, along with the whole unit suite. Any CLI whose
 * validator is tested through a function call has this seam, and the seam is invisible to exactly
 * the tests that were written to cover the validator.
 *
 * `bun run check` chains these with `&&`, so an exit code that stops being non-zero does not fail
 * a build; it removes a check from the build and says nothing. These cases are cheap insurance
 * against that, and each pairs a control run with the defect run.
 */
interface ToolCase {
  tool: string;
  what: string;
  file: string;
  edit: (text: string) => string;
  expect: string;
}

const TOOL_CASES: ToolCase[] = [
  {
    tool: "docs",
    what: "a relative link to a file that does not exist",
    file: "guidance/apple-design/SKILL.md",
    edit: (t) => t.replace("](references/", "](references/nonexistent-"),
    expect: "broken documentation link",
  },
  {
    tool: "specs",
    what: "a measurement in prose with no record behind it",
    file: "guidance/apple-design/references/tasks/contrast.md",
    edit: (t) => `${t}\n\nA control should be at least 44 pt tall.\n`,
    expect: "44 pt",
  },
  {
    tool: "specs",
    what: "a citation naming a record that does not exist",
    file: "guidance/apple-design/references/tasks/contrast.md",
    // Replacing every occurrence: leaving one behind lets the paragraph keep a valid citation,
    // and specs checks per passage, so the defect would not be reached.
    edit: (t) => t.replaceAll("`contrast.small-text`", "`contrast.invented`"),
    expect: "no record cited nearby",
  },
  {
    tool: "manifests",
    what: "an unknown key in a source manifest",
    file: "sources/apple-design.yaml",
    edit: (t) => t.replace("  max_skill_lines: 150", "  max_skill_line: 150"),
    expect: "max_skill_line",
  },
];

for (const item of TOOL_CASES) {
  test(`${item.tool} exits non-zero on ${item.what}`, async () => {
    const dir = await sandbox();
    try {
      // Control first: this tool must pass on an unmodified copy, or the case proves nothing.
      const control = await runTool(dir, item.tool);
      expect(control.code).toBe(0);

      await edit(dir, item.file, item.edit);
      const defect = await runTool(dir, item.tool);
      expect(defect.code).not.toBe(0);
      expect(defect.output).toContain(item.expect);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
}

test("an uncommitted rewrite of a pre-registered artifact fails the CLI", async () => {
  // The sandbox copies tracked files and points .git at the real repository, so `git diff HEAD`
  // inside it compares the copy against the real commit — which is exactly the comparison this
  // check needs, and what makes the sandbox a faithful stand-in here.
  //
  // Found by sweeping the checks: counting commits passes a file that was rewritten but not
  // committed, and REVIEW.md's whole evidential value is that it has not changed.
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "examples/apple-design-review/REVIEW.md",
         (t) => `${t}\nThis finding was actually about something else entirely.\n`));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("REVIEW.md differs from its committed content");
}, 60_000);

test("cutting a CLI's exit call is caught: docs.ts is the second instance of this seam", async () => {
  const dir = await sandbox();
  try {
    await edit(dir, "guidance/apple-design/SKILL.md", (t) =>
      t.replace("](references/", "](references/nonexistent-"));
    const wired = await runTool(dir, "docs");
    expect(wired.code).not.toBe(0);

    // Remove the propagation and the same defect exits 0. docs-negative.ts, which drives
    // checkLinks() directly, cannot see this — which is the whole reason these tests exist.
    const cli = join(dir, "src", "e2e", "docs.ts");
    const source = await readFile(cli, "utf8");
    expect(source).toContain("    process.exit(1);");
    await writeFile(cli, source.replace("    process.exit(1);", "    // exit removed"));

    const unwired = await runTool(dir, "docs");
    expect(unwired.code).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 60_000);

/*
 * ---- The acceptance path itself ----
 *
 * An audit pointed out that every check in this repository inspects the repository, and none of
 * them exercised how the result is actually used: installing a skill and loading it. That was not
 * hypothetical — three defects were sitting in that path, and the reason none of them had been
 * noticed is that the published-bundle list was written down in three places and drifted in two.
 *
 * These tests hold the two properties that keep the path honest: CI runs what `bun run check` runs,
 * and the published skills install and load as the README says.
 */
test("CI executes every check that `bun run check` runs", async () => {
  // A check that exists locally but not in CI protects nobody on a pull request. wcag-counts.ts was
  // exactly that when this was written: added to `check`, never added to the workflow.
  const pkg = JSON.parse(await readFile(join(REPO, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const workflow = await readFile(join(REPO, ".github", "workflows", "ci.yml"), "utf8");

  // Parse what CI actually EXECUTES, not what its text mentions. Searching raw workflow text for
  // filenames passed when a step was replaced with `echo "skipped src/e2e/checklist.ts"` — the
  // name was still present and the check was gone, which is the exact failure this is for.
  const executed = new Set<string>();
  for (const line of workflow.split("\n")) {
    const run = /^\s*(?:-\s*)?run:\s*(.+)$/.exec(line);
    if (!run) continue;
    const command = run[1]!.trim();
    // A command that merely prints is not a check, however it is spelled.
    if (/^(echo|true|:)\b/.test(command)) continue;
    for (const m of command.matchAll(/bun run (?:src\/e2e\/)?([a-z-]+)(?:\.ts)?/g)) executed.add(m[1]!);
  }

  const inCheck = new Set([...(pkg.scripts.check ?? "").matchAll(/src\/e2e\/([a-z-]+)\.ts/g)].map((m) => m[1]!));
  expect(inCheck.size).toBeGreaterThan(5);
  const missing = [...inCheck].filter((s) => !executed.has(s));
  expect(missing).toEqual([]);

  // CI-only checks are intentional and are named, rather than the two sets being called identical.
  // leak.ts needs the proprietary corpora, which are built locally and never in CI.
  const CI_ONLY = new Set(["leak"]);
  const ciExtra = [...executed].filter(
    (s) => !inCheck.has(s) && !CI_ONLY.has(s) && !(pkg.scripts[s] !== undefined),
  );
  expect(ciExtra).toEqual([]);
});

test("every published skill is built, drift-guarded, and documented as installable", async () => {
  // The same list in three places: build:public, the workflow's git diff guard, and the README's
  // install instructions. accessibility-claims was missing from all three.
  const pkg = JSON.parse(await readFile(join(REPO, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const workflow = await readFile(join(REPO, ".github", "workflows", "ci.yml"), "utf8");
  const readme = await readFile(join(REPO, "README.md"), "utf8");

  // Derived from what is actually committed, so adding a bundle cannot quietly skip these.
  const proc = Bun.spawn(["git", "ls-files", "skills/*/SKILL.md"], { cwd: REPO, stdout: "pipe" });
  const tracked = (await new Response(proc.stdout).text()).trim().split("\n").filter(Boolean);
  await proc.exited;
  const FIXTURES = new Set(["lumen-ds"]);
  const publishedSkills = tracked
    .map((p) => p.split("/")[1]!)
    .filter((s) => !FIXTURES.has(s));

  expect(publishedSkills.length).toBeGreaterThan(0);
  for (const skill of publishedSkills) {
    expect(pkg.scripts["build:public"]).toContain(skill);
    expect(workflow).toContain(`skills/${skill}`);
    expect(readme).toContain(`skills/${skill}"`);
  }
});

test("install.ts fails when a published bundle is missing a file it links to", async () => {
  // The packaging failure this check exists for: guidance builds fine, the shipped bundle is
  // incomplete. Nothing upstream of the install path can see it.
  const dir = await sandbox();
  try {
    const control = await runTool(dir, "install");
    expect(control.code).toBe(0);

    await rm(join(dir, "skills", "accessibility-claims", "references", "tasks", "reporting.md"));
    const defect = await runTool(dir, "install");
    expect(defect.code).not.toBe(0);
    expect(defect.output).toContain("does not resolve from the install location");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 60_000);

/** Run a control/defect pair against a named tool rather than the example CLI. */
async function controlAndDefectFor(
  tool: string,
  apply: (dir: string) => Promise<void>,
): Promise<{ control: Awaited<ReturnType<typeof runTool>>; defect: Awaited<ReturnType<typeof runTool>> }> {
  const dir = await sandbox();
  try {
    const control = await runTool(dir, tool);
    await apply(dir);
    const defect = await runTool(dir, tool);
    return { control, defect };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a fabricated checklist tick fails the CLI", async () => {
  // The defect that prompted this: adding "- [x] Ship a fully verified Flutter skill with three
  // worked examples" to the checklist passed `bun run check` clean. Every tick is a public claim
  // about what this project delivered, and nothing resolved them.
  const { control, defect } = await controlAndDefectFor("checklist", (dir) =>
    edit(dir, "docs/public-output-checklist.md", (t) =>
      t.replace("- [x] Add these bundles and examples to the README",
                "- [x] Ship a Flutter skill: `guidance/flutter/SKILL.md`\n- [x] Add these bundles and examples to the README")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("guidance/flutter/SKILL.md");
}, 60_000);

test("a checklist tick naming a script that does not exist fails the CLI", async () => {
  // The other half of the resolver, and it had no test until each guard was removed one at a time
  // to check. A tick can claim work is verified by a command; the command has to be real.
  const { control, defect } = await controlAndDefectFor("checklist", (dir) =>
    edit(dir, "docs/public-output-checklist.md", (t) =>
      t.replace("- [x] Add these bundles and examples to the README",
                "- [x] Verified by `bun run flutter-check`.\n- [x] Add these bundles and examples to the README")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("flutter-check");
}, 60_000);

test("a checklist tick naming a renamed file fails the CLI", async () => {
  const { control, defect } = await controlAndDefectFor("checklist", (dir) =>
    edit(dir, "docs/public-output-checklist.md",
         (t) => t.replace("`src/e2e/install.ts`", "`src/e2e/installer.ts`")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("installer.ts");
}, 60_000);

/*
 * ---- Section 6 audit (docs/audits/section-6-9becc71.md) ----
 *
 * Seven findings, four of them about acceptance checks that passed claims they should reject. Each
 * mutation below is the auditor's, reproduced against the real CLI with an unchanged control.
 */
test("a score higher than the pre-registered total fails the CLI", async () => {
  // "11 of 10" passed: only the denominator was checked.
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "examples/accessibility-claims-review/README.md",
         (t) => t.replace("**10 of 10 planted defects found", "**11 of 10 planted defects found")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
});

test("changing an adjudicated outcome fails the CLI", async () => {
  // The headline is derived from the scoring table now, so flipping a row contradicts it.
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "examples/accessibility-claims-review/scoring.md",
         (t) => t.replace("| **Found** | Finding 1:", "| **Missed** | Finding 1:")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("credits");
});

test("replacing a preserved review fails the CLI", async () => {
  // A review's evidential value is that it is the output. Only the Apple one was protected.
  const { control, defect } = await controlAndDefect(async (dir) => {
    await writeFile(join(dir, "examples/accessibility-claims-review/REVIEW.md"),
                    "# Review\n\nI found no problems with this audit.\n");
  });

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("differs from its committed content");
});

test("the audit's original Flutter wording fails the CLI", async () => {
  // Verbatim from the audit. The committed regression previously used a variant carrying a path,
  // which exercised path resolution instead of the claim that actually slipped through.
  const { control, defect } = await controlAndDefectFor("checklist", (dir) =>
    edit(dir, "docs/public-output-checklist.md", (t) =>
      t.replace("- [x] Add these bundles and examples to the README",
                "- [x] Ship a fully verified Flutter skill with three worked examples\n- [x] Add these bundles and examples to the README")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("claims a deliverable");
});

test("a checklist tick naming `bun run <file>` resolves that file", async () => {
  // Neither pattern matched this form, though a comment claimed it was covered.
  const { control, defect } = await controlAndDefectFor("checklist", (dir) =>
    edit(dir, "docs/public-output-checklist.md", (t) =>
      t.replace("- [x] Add these bundles and examples to the README",
                "- [x] Verified by `bun run src/e2e/flutter.ts`.\n- [x] Add these bundles and examples to the README")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("flutter.ts");
});

test("a documented install destination that nothing created fails the CLI", async () => {
  // install.ts reconstructed the destination instead of following the documented one, so a typo in
  // the README was invisible.
  const { control, defect } = await controlAndDefectFor("install", (dir) =>
    edit(dir, "README.md", (t) => t.replace("~/.agents/skills/apple-design", "~/.agents/skils/apple-design")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("skils");
});

test("a CI step replaced with echo fails the parity test", async () => {
  // Searching workflow text for filenames cannot tell a step that runs a check from one that
  // prints its name. Asserted directly rather than through a sandbox, since this parses the file.
  const workflow = await readFile(join(REPO, ".github", "workflows", "ci.yml"), "utf8");
  const executed = (text: string) => {
    const found = new Set<string>();
    for (const line of text.split("\n")) {
      const run = /^\s*(?:-\s*)?run:\s*(.+)$/.exec(line);
      if (!run) continue;
      const command = run[1]!.trim();
      if (/^(echo|true|:)\b/.test(command)) continue;
      for (const m of command.matchAll(/bun run (?:src\/e2e\/)?([a-z-]+)(?:\.ts)?/g)) found.add(m[1]!);
    }
    return found;
  };

  expect(executed(workflow).has("checklist")).toBe(true);
  const sabotaged = workflow.replace("        run: bun run src/e2e/checklist.ts",
                                     '        run: echo "skipped src/e2e/checklist.ts"');
  expect(sabotaged).toContain("src/e2e/checklist.ts");   // the name is still there
  expect(executed(sabotaged).has("checklist")).toBe(false);   // and it is not executed
});

test("a criterion level cited in a preserved review must match WCAG", async () => {
  // S6-07: the review calls SC 2.4.7 Focus Visible Level A; it is AA. The review stays verbatim,
  // so ERRATA.md records the correction — and this is what makes that promise enforceable.
  //
  // Asserted against the real CLI in the working tree rather than the sandbox: the sandbox copies
  // only tracked files, and ir/wcag22/ is gitignored because the corpus is non-redistributable, so
  // the level check correctly skips itself in there. Running a check in an environment where it is
  // designed to skip would look like a pass and prove nothing.
  if (!(await Bun.file(join(REPO, "ir", "wcag22", "pages", "navigable.json")).exists())) return;

  const errata = join(REPO, "examples", "accessibility-claims-review", "ERRATA.md");
  const original = await readFile(errata, "utf8");
  try {
    const control = await runTool(REPO, "example");
    expect(control.code).toBe(0);
    expect(control.output).toContain("SC 2.4.7 cited as Level A, actually AA — recorded in ERRATA.md");

    // The erratum stops naming the criterion: the uncorrected claim is live again.
    await writeFile(errata, original.replaceAll("2.4.7", "2.9.9"));
    const defect = await runTool(REPO, "example");
    expect(defect.code).not.toBe(0);
    expect(defect.output).toContain("SC 2.4.7 cited as Level A, actually AA");
  } finally {
    await writeFile(errata, original);
  }
}, 60_000);
