import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, readdir } from "node:fs/promises";
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

  // Every sandbox gets its OWN git storage, always. No caller can forget.
  //
  // This used to write a gitdir file pointing at the real `.git`, described as read-only. It was
  // not: a borrowed gitdir *is* the same repository, and the R1 test committing inside its sandbox
  // put 14 junk commits into the actual repository. The fix at the time was a helper each
  // committing test had to call, which an audit then defeated by commenting out one call — the
  // suite stayed green while HEAD moved.
  //
  // So isolation is a property of the factory now. A `git clone --local --no-hardlinks` gives the
  // sandbox real history for `git log` and `git diff HEAD` to read, in storage of its own, so a
  // commit inside it cannot reach the caller. Slower than a symlink and correct by construction,
  // which is the right trade for a guard that has failed twice.
  const clone = Bun.spawn(
    ["git", "clone", "--local", "--no-hardlinks", "--quiet", REPO, "__history__"],
    { cwd: dir, stdout: "ignore", stderr: "pipe" },
  );
  if ((await clone.exited) !== 0) {
    throw new Error(`could not clone history into the sandbox: ${await new Response(clone.stderr).text()}`);
  }
  await cp(join(dir, "__history__", ".git"), join(dir, ".git"), { recursive: true });
  await rm(join(dir, "__history__"), { recursive: true, force: true });

  // The clone's HEAD is the caller's HEAD, so `git diff HEAD` compares against real committed
  // content. The working tree is the copy made above, which may differ from it — that is what the
  // uncommitted-rewrite checks look at.
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
/**
 * The workflow invariants, as one function.
 *
 * Extracted because the negative test used to duplicate this logic, so removing a guard from the
 * real test left both green — the regression proved its own copy worked. An audit reported that
 * twice, the second time after I claimed to have fixed it. One implementation, two callers: the
 * real workflow and a sabotaged string.
 *
 * Returns the problems found, so a caller can assert on emptiness or on a specific message.
 */
function workflowProblems(workflow: string): string[] {
  const problems: string[] = [];

  const runs = [...workflow.matchAll(/^\s*run: (.+)$/gm)].map((m) => m[1]!.trim());
  if (!runs.includes("bun run check")) {
    problems.push("the workflow does not run `bun run check`");
  }

  // A conditional above the step disables it silently, and the `run:` line still reads correctly.
  const index = workflow.indexOf("run: bun run check");
  if (index >= 0) {
    const stepStart = workflow.lastIndexOf("- name:", index);
    if (workflow.slice(stepStart, index).includes("if:")) {
      problems.push("the check step is gated by a condition, so it may not run");
    }
  }

  // Anything beyond the shared entry point is a deliberate extra and has to be named here.
  const CI_ONLY = ["bun install --frozen-lockfile", "bun run src/e2e/leak.ts"];
  for (const run of runs) {
    if (run === "bun run check" || CI_ONLY.includes(run) || run === "|") continue;
    problems.push(`unlisted step: ${run}`);
  }

  return problems;
}

test("CI runs the same entry point a contributor runs", () => {
  // Structural, not parsed into a set of names. The previous version compared a regex over the
  // workflow against a regex over the package script, and a step could be neutered three ways it
  // could not see: replaced with `echo`, disabled with `if: false`, or simply omitted — typecheck
  // was, because it only looked for `src/e2e/*.ts`.
  expect(workflowProblems(readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8"))).toEqual([]);
});

test("`bun run check` covers every e2e guard in the repository", async () => {
  // The entry point is only worth anything if it is complete. A new src/e2e/*.ts that nothing runs
  // is a check that protects nobody, which is how wcag-counts.ts sat outside CI.
  const pkg = JSON.parse(await readFile(join(REPO, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const check = pkg.scripts.check ?? "";

  const files = (await readdir(join(REPO, "src", "e2e"))).filter((f) => f.endsWith(".ts"));
  // Modules imported by other checks rather than run directly, and the two CI-only/manual ones.
  const NOT_DIRECTLY_RUN = new Set([
    "links.ts",        // needs the network; its guards run offline via links-negative.ts
    "leak.ts",         // CI-only: needs the locally built proprietary corpora
    "trace.ts",        // needs the built corpora; trace-negative.ts runs its guards
    "records.ts",      // needs the network; test/records.test.ts drives it offline
    "record-source.ts", "pilot-claims.ts", "fixture.ts", "budget.ts",
    "validate-once.ts", "probes",
  ]);

  const unrun = files.filter((f) => !NOT_DIRECTLY_RUN.has(f) && !check.includes(`src/e2e/${f}`));
  expect(unrun).toEqual([]);
});

test("every published skill is built, drift-guarded, and documented as installable", async () => {
  // The same list used to live in three places — build:public, the workflow's git diff guard, and
  // the README's install instructions — and accessibility-claims was missing from all three. The
  // workflow now diffs `skills/` wholesale, so one of the three is gone by construction; the other
  // two are still per-bundle and are checked here.
  //
  // The wholesale diff is asserted separately, because "the guard covers every bundle" is now a
  // property of the path it names rather than of a list.
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
  expect(workflow).toContain("git diff --exit-code -- skills/");
  for (const skill of publishedSkills) {
    expect(pkg.scripts["build:public"]).toContain(skill);
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
  // Message changed when preservation moved from a HEAD diff to a pinned digest (audit R1).
  expect(defect.output).toContain("does not match its recorded digest");
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

test("a workflow that stops running the shared check is caught", () => {
  // Drives workflowProblems — the same function the test above asserts on — rather than a copy.
  // Removing a guard from that function now fails both this and the real check, which is the
  // property the previous version did not have.
  const workflow = readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8");
  expect(workflowProblems(workflow)).toEqual([]);

  for (const [label, sabotaged, expected] of [
    ["replaced with echo", workflow.replace("run: bun run check", 'run: echo "skipped check"'), "does not run"],
    ["disabled by a condition", workflow.replace("      - name: check", "      - name: check\n        if: ${{ false }}"), "gated by a condition"],
    ["removed entirely", workflow.replace("        run: bun run check\n", ""), "does not run"],
    ["an unlisted step added", workflow.replace("      - name: check", "      - name: sneaky\n        run: curl evil.example\n      - name: check"), "unlisted step"],
  ] as const) {
    const problems = workflowProblems(sabotaged);
    expect(problems.length, `${label} should be reported`).toBeGreaterThan(0);
    expect(problems.join(" | ")).toContain(expected);
  }
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
    expect(control.output).toContain("SC 2.4.7 cited as Level A, actually AA — corrected in ERRATA.md");

    // The erratum stops naming the criterion: the uncorrected claim is live again.
    await writeFile(errata, original.replaceAll("2.4.7", "2.9.9"));
    const defect = await runTool(REPO, "example");
    expect(defect.code).not.toBe(0);
    expect(defect.output).toContain("SC 2.4.7 cited as Level A, actually AA");
  } finally {
    await writeFile(errata, original);
  }
}, 60_000);

/*
 * ---- Follow-up audit (docs/audits/section-6-914929d.md) ----
 *
 * Six gaps, all in the checks rather than the published claims. R6 is handled by the two parity
 * tests above; the rest are here, each with an unchanged control.
 */
test("R1: a committed review rewrite fails the CLI", async () => {
  // Comparing to HEAD made a committed rewrite the new reference, and a CI checkout is always
  // already committed. The sandbox commits the change so this is the real scenario, not a dirty
  // working file.
  const dir = await sandbox();
  try {
    const control = await runTool(dir, "example");
    expect(control.code).toBe(0);

    await writeFile(join(dir, "examples/accessibility-claims-review/REVIEW.md"),
                    "# Review\n\nNo findings. Everything conforms.\n");
    for (const args of [
      ["add", "-A"],
      ["-c", "user.email=test@example.invalid", "-c", "user.name=test", "commit", "-q", "-m", "rewrite"],
    ]) {
      const proc = Bun.spawn(["git", ...args], { cwd: dir, stdout: "ignore", stderr: "ignore" });
      await proc.exited;
    }

    const defect = await runTool(dir, "example");
    expect(defect.code).not.toBe(0);
    expect(defect.output).toContain("does not match its recorded digest");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 60_000);

test("R1: an unpinned produced artifact fails the CLI", async () => {
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "examples/preserved.json", (t) => {
      const parsed = JSON.parse(t) as { artifacts: Record<string, unknown> };
      delete parsed.artifacts["examples/accessibility-claims-review/REVIEW.md"];
      return JSON.stringify(parsed, null, 2);
    }));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("not pinned");
}, 60_000);

test("R2: an unbolded inflated headline fails the CLI", async () => {
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "examples/accessibility-claims-review/README.md",
         (t) => t.replace("**10 of 10 planted defects found. 0 false positives.**",
                          "11 of 10 planted defects found. 0 false positives.")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("more than the total");
}, 60_000);

test("R2: an outcome read from the wrong column fails the CLI", async () => {
  // "**Found**" in the Defect column with "**Missed**" in Outcome. The scorer now resolves the
  // column from the header, which is the same fix the RN result-cell check needed.
  const { control, defect } = await controlAndDefect((dir) =>
    edit(dir, "examples/accessibility-claims-review/scoring.md",
         (t) => t.replace("| A1 | No criterion cited at all | **Found** |",
                          "| A1 | **Found** no criterion cited at all | **Missed** |")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("credits");
}, 60_000);

test("R3: an erratum that restates the error fails the CLI", async () => {
  // Verbatim from the audit: a document asserting the review was right counted as its correction.
  //
  // Needs the local WCAG build to resolve the level, and the sandbox copies only tracked files
  // while ir/wcag22/ is gitignored (non-redistributable), so the check correctly skips in there.
  // Run against the working tree instead, and restore.
  if (!(await Bun.file(join(REPO, "ir", "wcag22", "pages", "navigable.json")).exists())) return;

  const errata = join(REPO, "examples", "accessibility-claims-review", "ERRATA.md");
  const original = await readFile(errata, "utf8");
  try {
    expect((await runTool(REPO, "example")).code).toBe(0);
    await writeFile(errata, "# Erratum\n\nSC 2.4.7 is Level A. The review is correct.\n");
    const defect = await runTool(REPO, "example");
    expect(defect.code).not.toBe(0);
    expect(defect.output).toContain("SC 2.4.7 cited as Level A, actually AA");
  } finally {
    await writeFile(errata, original);
  }
}, 60_000);

test("F2: the guide publishes no shape-based classification of WCAG's blocks", async () => {
  // R4 added a breakdown — "94 bulleted alternatives, 5 exceptions, 19 other" — and made every
  // figure checkable. A later audit showed the figures were checkable and the categories were
  // wrong: "starts with a hyphen" is a text shape, and the source disagrees constantly (1.4.12's
  // bullets apply together, 1.4.3's are exceptions, 2.4.13's mix both). The breakdown is removed,
  // so this asserts its absence rather than its arithmetic.
  const guide = await readFile(
    join(REPO, "guidance", "accessibility-claims", "references", "tasks", "authority.md"), "utf8");

  expect(guide).not.toMatch(/\d+ are bulleted alternatives/);
  expect(guide).not.toMatch(/\d+ are exceptions,/);

  // What survives is the claim the source's own text supports, and it is still published.
  expect(guide).toContain("none of the blocks it marks normative is a Note");

  // And it is still verified.
  if (!(await Bun.file(join(REPO, "ir", "wcag22", "pages", "navigable.json")).exists())) return;
  const counts = await runTool(REPO, "wcag-counts");
  expect(counts.code).toBe(0);
  expect(counts.output).toContain("is a Note, as the guide states");
}, 60_000);

test("R5: a shared install-root typo fails the CLI", async () => {
  // Both mkdir and ln agreeing on the wrong directory: internally consistent, externally useless.
  const { control, defect } = await controlAndDefectFor("install", (dir) =>
    edit(dir, "README.md", (t) => t.replaceAll("~/.agents/skills", "~/.agents/skils")));

  expect(control.code).toBe(0);
  expect(defect.code).not.toBe(0);
  expect(defect.output).toContain("not a directory any supported agent reads");
}, 60_000);

test("R3: an erratum that reverses the correction fails the CLI", async () => {
  // Distinct from the false-erratum case above, and the one that needed its own test: the record
  // keeps the criterion and the cited level, and gets the CORRECTED level wrong. Removing the
  // comparison against the WCAG build leaves that undetected by anything else, which is why this
  // exists rather than relying on a sibling guard.
  if (!(await Bun.file(join(REPO, "ir", "wcag22", "pages", "navigable.json")).exists())) return;

  const errata = join(REPO, "examples", "accessibility-claims-review", "ERRATA.md");
  const original = await readFile(errata, "utf8");
  try {
    expect((await runTool(REPO, "example")).code).toBe(0);

    // Mutating the VISIBLE row. This test used to edit `corrected=AA` in an HTML comment; when the
    // record moved into the rendered table that string was gone, so `replace` did nothing, the file
    // stayed correct and the "reversed" case asserted on an unmodified repo. It passed by accident.
    // The sentinel below stops that recurring silently.
    const ROW = "| SC 2.4.7 Focus Visible | Level A | Level AA | E1 |";
    expect(original, "ERRATA.md no longer has the row this test mutates").toContain(ROW);

    // Restates the error the erratum is supposed to fix.
    await writeFile(errata, original.replace(ROW, "| SC 2.4.7 Focus Visible | Level A | Level A | E1 |"));
    const reversed = await runTool(REPO, "example");
    expect(reversed.code).not.toBe(0);
    expect(reversed.output).toContain("the WCAG build gives AA");

    // And a record whose `cited` does not match what the review says.
    await writeFile(errata, original.replace(ROW, "| SC 2.4.7 Focus Visible | Level AAA | Level AA | E1 |"));
    const misquoted = await runTool(REPO, "example");
    expect(misquoted.code).not.toBe(0);
    expect(misquoted.output).toContain("but it cites A");
  } finally {
    await writeFile(errata, original);
  }
}, 60_000);

test("a sandbox cannot write to the repository that created it", async () => {
  // This exists because it happened twice. The R1 test commits a review rewrite to exercise the
  // committed-rewrite case; the sandbox used to borrow the real `.git` through a gitdir file, so
  // those commits landed in the actual repository — 14 of them.
  //
  // The first fix was a helper each committing test had to call. An audit defeated it by
  // commenting out one call: the suite stayed green while HEAD moved. That is the lesson here —
  // an invariant every caller has to remember is not an invariant.
  //
  // So this now tests the FACTORY, not a convention. Any sandbox, without any further call, must
  // be unable to reach the repository it was made from.
  const headOf = async (cwd: string) => {
    const proc = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd, stdout: "pipe", stderr: "ignore" });
    const out = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    return out;
  };
  const gitDirOf = async (cwd: string) => {
    const proc = Bun.spawn(["git", "rev-parse", "--absolute-git-dir"], { cwd, stdout: "pipe", stderr: "ignore" });
    const out = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    return out;
  };

  const before = await headOf(REPO);
  const dir = await sandbox();
  try {
    // Storage of its own, not the caller's. This is the property that makes the rest hold.
    const sandboxGitDir = await gitDirOf(dir);
    expect(sandboxGitDir).not.toBe(await gitDirOf(REPO));
    expect(sandboxGitDir.startsWith(dir)).toBe(true);

    // History is real, so `git log` and `git diff HEAD` mean something.
    expect(await headOf(dir)).toBe(before);

    // A commit made with no isolation call whatsoever stays inside.
    await writeFile(join(dir, "scratch.txt"), "a commit that must stay inside the sandbox\n");
    for (const args of [
      ["add", "-A"],
      ["-c", "user.email=test@example.invalid", "-c", "user.name=test", "commit", "-q", "-m", "sandbox-only"],
    ]) {
      const proc = Bun.spawn(["git", ...args], { cwd: dir, stdout: "ignore", stderr: "ignore" });
      expect(await proc.exited).toBe(0);
    }

    expect(await headOf(dir)).not.toBe(before);
    expect(await headOf(REPO)).toBe(before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 60_000);
