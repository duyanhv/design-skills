/**
 * Agent-task evaluation: does the skill actually change what an agent decides?
 *
 * The deterministic evals in `src/eval` prove the *skill* contains the right rules. They cannot show
 * that an agent given the skill reviews UI better — which is the claim that matters, and the one
 * AUDIT finding 9 said was unproven.
 *
 * So this harness runs the same review task twice: once with no skill, once with the compiled skill
 * mounted. Each task seeds a file with known violations and known *decoys* (code that looks wrong
 * but is fine per the guideline). It then scores:
 *
 *   recall     — seeded violations found
 *   precision  — findings that were real, not decoys or inventions
 *   citations  — findings that quote a rule id or source URL, so a human can check them
 *   scope      — findings that apply guidance to a platform it is not scoped for (the failure the
 *                unscoped-rules bug caused; lower is better)
 *
 * Scoring is keyword-based and deliberately crude: it is evidence about a direction, not a
 * benchmark. It costs model calls, so it is not part of `bun run check` or CI.
 *
 * Usage:
 *   bun run src/agenteval/run.ts                  # both arms, all tasks
 *   bun run src/agenteval/run.ts --task buttons   # one task
 *   bun run src/agenteval/run.ts --arm skill      # one arm
 *   bun run src/agenteval/run.ts --runs 3         # three samples per arm, reported as a range
 *   bun run src/agenteval/run.ts --rescore        # re-score saved transcripts, no model calls
 */
import { join } from "node:path";
import { mkdtemp, rm, writeFile, symlink, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { paths, ROOT, writeJson } from "../util/fs.ts";
import { log } from "../util/log.ts";
import { TASKS, knownCitations, type Task } from "./tasks.ts";
import { comparability, isRefusedLaunch, score, type Score } from "./score.ts";

const ARMS = ["none", "skill"] as const;
type Arm = (typeof ARMS)[number];

async function runArm(task: Task, arm: Arm): Promise<{ transcript: string; ms: number }> {
  const dir = await mkdtemp(join(tmpdir(), `ds-agenteval-${task.id}-${arm}-`));
  try {
    await writeFile(join(dir, task.file), task.code, "utf8");
    if (arm === "skill") {
      // Mount the compiled skill exactly as a user would: a directory under .claude/skills.
      const skills = join(dir, ".claude", "skills");
      await mkdir(skills, { recursive: true });
      await symlink(paths.skill(task.skill), join(skills, task.skill));
    }
    const prompt = arm === "skill" ? `${task.prompt}\n\n${task.skillHint}` : task.prompt;
    const started = Date.now();
    const proc = Bun.spawn(
      ["claude", "-p", prompt, "--permission-mode", "bypassPermissions", "--allowed-tools", "Read,Glob,Grep"],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    const [transcript, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const code = await proc.exited;
    // The CLI can exit non-zero with nothing on stderr, and "claude exited 1:" is not something a
    // reader can act on. Say what was actually observed — whether anything reached stdout, and how
    // long it lasted — because an instant empty failure (a refused launch) and a slow one (a model
    // or network error mid-run) call for different responses.
    if (code !== 0) {
      const ms = Date.now() - started;
      const detail = err.trim() || transcript.trim().slice(0, 400) || `no output on stdout or stderr after ${ms}ms`;
      throw new Error(`claude exited ${code} after ${ms}ms: ${detail}`);
    }
    return { transcript, ms: Date.now() - started };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * One sample, retried when the CLI refuses to launch.
 *
 * Consecutive invocations sometimes exit non-zero within milliseconds, having written nothing to
 * either stream, while the identical command run on its own succeeds. That is the launch being
 * refused, not the model declining the task, and spending a sample on it understates the arm: a
 * three-run batch reported n=1 because two runs died this way.
 */
async function sampleArm(task: Task, arm: Arm, attempts = 3): Promise<{ transcript: string; ms: number }> {
  let last: Error | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      return await runArm(task, arm);
    } catch (e) {
      last = e as Error;
      if (!isRefusedLaunch(last.message) || i === attempts - 1) throw last;
      const wait = 2000 * (i + 1);
      console.log(`  – launch refused with no output; retrying in ${wait / 1000}s (${i + 1}/${attempts - 1})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

interface Row extends Score {
  task: string;
  arm: string;
  /** 0-based repeat index. Model output varies run to run, so a single row is one sample. */
  run: number;
  recall: number;
  precision: number;
  ms: number;
  transcript: string;
  /**
   * Why this sample produced no usable transcript, when it did not. A failed run is recorded and
   * excluded from the summary rather than thrown: it is a fact about the measurement, and deleting
   * it would quietly turn "9 attempted, 8 scored" into an unqualified "8".
   */
  error?: string;
}

const args = process.argv.slice(2);
const only = args.includes("--task") ? args[args.indexOf("--task") + 1] : undefined;
const armFilter = args.includes("--arm") ? (args[args.indexOf("--arm") + 1] as Arm) : undefined;
const rescore = args.includes("--rescore");
const repeats = args.includes("--runs") ? Number(args[args.indexOf("--runs") + 1]) : 1;
if (!Number.isInteger(repeats) || repeats < 1) throw new Error("--runs must be a positive integer");
const tasks = only ? TASKS.filter((t) => t.id === only) : TASKS;
if (!tasks.length) throw new Error(`no task matching "${only}"`);
const arms = armFilter ? [armFilter] : ARMS;

const resultsPath = join(ROOT, "evals", "agent-results.json");
// Previous rows are always loaded, for two reasons: --rescore re-scores them without new model
// calls, and a subset run (--task/--arm) must not wipe the transcripts it did not regenerate.
const prior: Row[] = await readFile(resultsPath, "utf8")
  .then((t) => (JSON.parse(t) as { rows: Row[] }).rows ?? [])
  .catch(() => []);
const saved = new Map(prior.map((r) => [`${r.task}/${r.arm}/${r.run ?? 0}`, r.transcript]));

const rows: Row[] = [];
// A fresh run replaces every sample for the task/arm it covered; untouched pairs are preserved.
const merge = () => {
  const fresh = new Set(rows.map((r) => `${r.task}/${r.arm}`));
  return [...rows, ...prior.filter((r) => !fresh.has(`${r.task}/${r.arm}`))].sort(
    (a, b) => a.task.localeCompare(b.task) || a.arm.localeCompare(b.arm) || (a.run ?? 0) - (b.run ?? 0),
  );
};
/**
 * Written after *every* run, not once at the end.
 *
 * A nine-run batch used to hold everything in memory and save on completion, so when the ninth run
 * failed the eight that had succeeded went with it — forty minutes of model calls, and the failing
 * transcript itself, gone. Samples are expensive and independent; each one is saved as soon as it
 * exists.
 */
const checkpoint = async () =>
  writeJson(resultsPath, { generated_at: new Date().toISOString(), rescored: rescore, rows: merge() });

for (const task of tasks) {
  for (const arm of arms) {
    // When rescoring, replay however many samples are on disk rather than the requested count.
    const n = rescore ? prior.filter((r) => r.task === task.id && r.arm === arm).length : repeats;
    for (let run = 0; run < n; run++) {
      log.step(`${task.id} · ${arm}${n > 1 ? ` · run ${run + 1}/${n}` : ""}`);
      const cached = rescore ? saved.get(`${task.id}/${arm}/${run}`) : undefined;
      if (rescore && !cached) {
        // A recorded failure has no transcript to re-score. Carry it forward as it stands instead
        // of refusing to re-score the samples that did succeed.
        const failed = prior.find((r) => r.task === task.id && r.arm === arm && r.run === run && r.error);
        if (failed) {
          console.log(`  – run ${run + 1}: no transcript (${failed.error}); kept as a failure`);
          rows.push(failed);
          continue;
        }
        throw new Error(`no saved transcript for ${task.id}/${arm}/${run}`);
      }
      let transcript: string;
      let ms: number;
      try {
        ({ transcript, ms } = cached ? { transcript: cached, ms: 0 } : await sampleArm(task, arm));
      } catch (e) {
        // One flaky CLI invocation is not a reason to discard the batch. Record the failure as a
        // sample that produced nothing, so the summary can say "8 of 9 scored" instead of silently
        // reporting eight as if nine had been asked for.
        const error = (e as Error).message;
        console.log(`  ✗ run failed: ${error}`);
        rows.push({
          task: task.id, arm, run, recall: 0, precision: 0, ms: 0, transcript: "", error,
          found: [], missed: task.violations.map((v) => v.id), falsePositives: [],
          dismissedCorrectly: [], cited: 0, findings: 0, scopeErrors: [],
          citedResolved: null, citedUnresolvable: null, unclassified: 0,
        });
        await checkpoint();
        continue;
      }
      // The citations the built skill actually contains, so a fabricated-but-well-formed citation
      // is reported as unresolvable rather than credited as evidence. Undefined when the skill is
      // not built locally: the summary then says the check was not run.
      const s = score(task, transcript, await knownCitations(task.skill));
      const recall = s.found.length / task.violations.length;
      const precision = s.found.length / Math.max(1, s.found.length + s.falsePositives.length);
      console.log(
        `  recall ${s.found.length}/${task.violations.length} (${(recall * 100).toFixed(0)}%) · ` +
          `false positives ${s.falsePositives.length} · decoys correctly dismissed ${s.dismissedCorrectly.length}/${task.decoys.length} · ` +
          `scope errors ${s.scopeErrors.length} · citations ${s.cited} over ~${s.findings} findings ` +
          `(${s.citedResolved === null ? "not resolved against the skill" : `${s.citedResolved} resolve, ${s.cited - s.citedResolved} name nothing that exists`}) · ` +
          `${s.unclassified} finding(s) the fixtures classify as neither violation, decoy nor scope trap · ${(ms / 1000).toFixed(0)}s`,
      );
      if (s.missed.length) console.log(`  missed: ${s.missed.join(", ")}`);
      if (s.falsePositives.length) console.log(`  false positives: ${s.falsePositives.join(", ")}`);
      if (s.scopeErrors.length) console.log(`  scope errors: ${s.scopeErrors.join(", ")}`);
      rows.push({ task: task.id, arm, run, recall, precision, ...s, ms, transcript });
      await checkpoint();
    }
  }
}

const merged = merge();
await checkpoint();
log.info(`wrote ${resultsPath}`);

// Summarise from the merged set, so a subset run still shows the whole picture. Ranges rather than
// single figures: one sample per arm says nothing about whether a difference is real.
const range = (xs: number[]) => (xs.length > 1 && Math.min(...xs) !== Math.max(...xs) ? `${Math.min(...xs)}-${Math.max(...xs)}` : `${xs[0] ?? 0}`);
for (const task of TASKS) {
  // A run that never produced a transcript is not a zero-recall review; averaging it in would
  // report a harness failure as a skill failure.
  const forTask = merged.filter((r) => r.task === task.id && !r.error);
  if (!forTask.length) continue;
  const fmt = (a: Arm) => {
    const rs = forTask.filter((x) => x.arm === a);
    if (!rs.length) return "—";
    return (
      `${range(rs.map((r) => r.found.length))}/${task.violations.length} found · ` +
      `${range(rs.map((r) => r.falsePositives.length))} false positives · ` +
      `${range(rs.map((r) => r.dismissedCorrectly.length))}/${task.decoys.length} decoys dismissed · ` +
      `${range(rs.map((r) => r.scopeErrors.length))} scope errors · ` +
      `${range(rs.map((r) => r.cited))} citations` +
      // Shape and substance kept apart: a citation count alone cannot distinguish a real rule id
      // from an invented one, and the arm without the skill invents more of them.
      (rs.every((r) => r.citedResolved === null)
        ? " (not resolved)"
        : ` (${range(rs.map((r) => r.citedResolved ?? 0))} resolve to something in the skill)`) +
      ` · ${range(rs.map((r) => r.unclassified))} unclassified findings` +
      // Always shown, not only when it is greater than one: the reader needs to see n=1 next to
      // n=3 to know the two lines are not the same kind of measurement.
      `  (n=${rs.length})`
    );
  };
  console.log(`\n${task.id}\n  no skill: ${fmt("none")}\n  skill:    ${fmt("skill")}`);
}

const failures = merged.filter((r) => r.error);
if (failures.length) {
  log.warn(
    `${failures.length} run(s) produced no transcript and are excluded from the figures above: ` +
      `${failures.map((r) => `${r.task}/${r.arm}#${r.run}`).join(", ")}. Re-run to fill them in.`,
  );
}

// Arms with different sample counts print in exactly the same shape, so a lopsided comparison reads
// as sound. Say so rather than leaving it to be noticed.
const { lopsided, singleSample } = comparability(merged.filter((r) => !r.error));
const describe = (x: { task: string; counts: Record<string, number> }) =>
  `${x.task} (${Object.entries(x.counts).map(([a, n]) => `${a}=${n}`).join(", ")})`;
if (lopsided.length) {
  log.warn(
    `unequal samples per arm: ${lopsided.map(describe).join("; ")} — these arms are not comparable as they stand. ` +
      `Re-run the short arm with --runs to match before quoting the difference.`,
  );
}
if (singleSample.length) {
  log.warn(`single sample per arm: ${singleSample.map((x) => x.task).join(", ")} — a range needs at least two runs`);
}
