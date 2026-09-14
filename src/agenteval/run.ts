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
import { TASKS, type Task } from "./tasks.ts";
import { score, type Score } from "./score.ts";

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
    if (code !== 0) throw new Error(`claude exited ${code}: ${err.slice(0, 400)}`);
    return { transcript, ms: Date.now() - started };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
for (const task of tasks) {
  for (const arm of arms) {
    // When rescoring, replay however many samples are on disk rather than the requested count.
    const n = rescore ? prior.filter((r) => r.task === task.id && r.arm === arm).length : repeats;
    for (let run = 0; run < n; run++) {
      log.step(`${task.id} · ${arm}${n > 1 ? ` · run ${run + 1}/${n}` : ""}`);
      const cached = rescore ? saved.get(`${task.id}/${arm}/${run}`) : undefined;
      if (rescore && !cached) throw new Error(`no saved transcript for ${task.id}/${arm}/${run}`);
      const { transcript, ms } = cached ? { transcript: cached, ms: 0 } : await runArm(task, arm);
      const s = score(task, transcript);
      const recall = s.found.length / task.violations.length;
      const precision = s.found.length / Math.max(1, s.found.length + s.falsePositives.length);
      console.log(
        `  recall ${s.found.length}/${task.violations.length} (${(recall * 100).toFixed(0)}%) · ` +
          `false positives ${s.falsePositives.length} · decoys correctly dismissed ${s.dismissedCorrectly.length}/${task.decoys.length} · ` +
          `scope errors ${s.scopeErrors.length} · citations ${s.cited} over ~${s.findings} findings · ${(ms / 1000).toFixed(0)}s`,
      );
      if (s.missed.length) console.log(`  missed: ${s.missed.join(", ")}`);
      if (s.falsePositives.length) console.log(`  false positives: ${s.falsePositives.join(", ")}`);
      if (s.scopeErrors.length) console.log(`  scope errors: ${s.scopeErrors.join(", ")}`);
      rows.push({ task: task.id, arm, run, recall, precision, ...s, ms, transcript });
    }
  }
}

// A fresh run replaces every sample for the task/arm it covered; untouched pairs are preserved.
const fresh = new Set(rows.map((r) => `${r.task}/${r.arm}`));
const merged = [...rows, ...prior.filter((r) => !fresh.has(`${r.task}/${r.arm}`))].sort(
  (a, b) => a.task.localeCompare(b.task) || a.arm.localeCompare(b.arm) || (a.run ?? 0) - (b.run ?? 0),
);
await writeJson(resultsPath, { generated_at: new Date().toISOString(), rescored: rescore, rows: merged });
log.info(`wrote ${resultsPath}`);

// Summarise from the merged set, so a subset run still shows the whole picture. Ranges rather than
// single figures: one sample per arm says nothing about whether a difference is real.
const range = (xs: number[]) => (xs.length > 1 && Math.min(...xs) !== Math.max(...xs) ? `${Math.min(...xs)}-${Math.max(...xs)}` : `${xs[0] ?? 0}`);
for (const task of TASKS) {
  const forTask = merged.filter((r) => r.task === task.id);
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
      (rs.length > 1 ? `  (n=${rs.length})` : "")
    );
  };
  console.log(`\n${task.id}\n  no skill: ${fmt("none")}\n  skill:    ${fmt("skill")}`);
}
