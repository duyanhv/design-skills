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
