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
 *   bun run src/agenteval/run.ts --rescore        # re-score saved transcripts, no model calls
 */
import { join } from "node:path";
import { mkdtemp, rm, writeFile, symlink, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { paths, ROOT, writeJson } from "../util/fs.ts";
import { log } from "../util/log.ts";
import { TASKS, type Task } from "./tasks.ts";

const ARMS = ["none", "skill"] as const;
type Arm = (typeof ARMS)[number];

interface Score {
  found: string[];
  missed: string[];
  falsePositives: string[];
  /** Decoys the agent named and explicitly set aside — evidence it read the rule's exceptions. */
  dismissedCorrectly: string[];
  cited: number;
  findings: number;
  scopeErrors: string[];
}

/**
 * A good review often ends with "checked and deliberately not flagged", which is exactly the
 * behaviour we want from an agent reading a rule's exceptions. Naive substring scoring would count
 * those as false positives, so the transcript is split: everything from such a heading onward is
 * the agent's *non*-findings and is scored separately.
 */
const NOT_FLAGGED =
  /^(?:#{1,6}\s*|\*\*)\s*.{0,80}?(?:not flagged|not report|deliberately not|non-?issues|no(?:t a)? violation|checked and (?:ok|fine|correct)|verified as conforming|conform(?:s|ing)?\b.{0,20}not|correctly implemented|what'?s correct|done right|passes? at aa|distractors?)/im;

function splitFindings(transcript: string): { findings: string; dismissed: string } {
  const m = NOT_FLAGGED.exec(transcript);
  return m ? { findings: transcript.slice(0, m.index), dismissed: transcript.slice(m.index) } : { findings: transcript, dismissed: "" };
}

/** Does the transcript show the agent recognised this issue? All of a check's cues must appear. */
function hit(transcript: string, cues: string[]): boolean {
  const t = transcript.toLowerCase();
  return cues.every((c) => t.includes(c.toLowerCase()));
}

function score(task: Task, transcript: string): Score {
  const { findings: body, dismissed } = splitFindings(transcript);
  const found: string[] = [];
  const missed: string[] = [];
  // A violation counts wherever it is reported; a *dismissal* of a real violation is not a find.
  for (const v of task.violations) (hit(body, v.cues) ? found : missed).push(v.id);
  // A decoy only costs you if you asserted it as a problem, not if you named it and set it aside.
  const falsePositives = task.decoys.filter((d) => hit(body, d.cues)).map((d) => d.id);
  const scopeErrors = task.scopeTraps.filter((s) => hit(body, s.cues)).map((s) => s.id);
  const dismissedCorrectly = task.decoys.filter((d) => hit(dismissed, d.dismissCues)).map((d) => d.id);

  // A finding is checkable when it carries a rule id or a source link.
  const cited = [...transcript.matchAll(/\b[a-z0-9-]+\/[a-z0-9-]+\/\d{3}\b|https?:\/\/\S*(?:developer\.apple\.com|w3\.org)\S*/gi)].length;
  // Bulleted/numbered lines are the agent's findings; a rough denominator for citation rate.
  const findings = [...body.matchAll(/^\s*(?:\*\*\d+\.|[-*]|\d+\.)\s+\S/gm)].length;
  return { found, missed, falsePositives, dismissedCorrectly, cited, findings, scopeErrors };
}

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

const args = process.argv.slice(2);
const only = args.includes("--task") ? args[args.indexOf("--task") + 1] : undefined;
const armFilter = args.includes("--arm") ? (args[args.indexOf("--arm") + 1] as Arm) : undefined;
const rescore = args.includes("--rescore");
const tasks = only ? TASKS.filter((t) => t.id === only) : TASKS;
if (!tasks.length) throw new Error(`no task matching "${only}"`);
const arms = armFilter ? [armFilter] : ARMS;

const resultsPath = join(ROOT, "evals", "agent-results.json");
/** Scoring is heuristic and gets tuned; rescoring lets that happen without paying for new runs. */
const saved: Record<string, string> = {};
if (rescore) {
  const prior = JSON.parse(await readFile(resultsPath, "utf8")) as { rows: { task: string; arm: string; transcript: string }[] };
  for (const r of prior.rows) saved[`${r.task}/${r.arm}`] = r.transcript;
}

const rows: Record<string, unknown>[] = [];
for (const task of tasks) {
  for (const arm of arms) {
    log.step(`${task.id} · ${arm}`);
    const cached = saved[`${task.id}/${arm}`];
    if (rescore && !cached) throw new Error(`no saved transcript for ${task.id}/${arm}`);
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
    rows.push({ task: task.id, arm, recall, precision, ...s, ms, transcript });
  }
}

await writeJson(resultsPath, { generated_at: new Date().toISOString(), rescored: rescore, rows });
log.info(`wrote ${resultsPath}`);

for (const task of tasks) {
  const byArm = Object.fromEntries(arms.map((a) => [a, rows.find((r) => r.task === task.id && r.arm === a)]));
  const fmt = (a: Arm) => {
    const r = byArm[a] as Score | undefined;
    return r
      ? `${r.found.length}/${task.violations.length} found · ${r.falsePositives.length} false positives · ` +
        `${r.dismissedCorrectly.length}/${task.decoys.length} decoys dismissed · ${r.scopeErrors.length} scope errors · ${r.cited} citations`
      : "—";
  };
  console.log(`\n${task.id}\n  no skill: ${fmt("none")}\n  skill:    ${fmt("skill")}`);
}
