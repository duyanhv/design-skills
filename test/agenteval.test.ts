import { test, expect } from "bun:test";
import { comparability, findingBlocks, score, splitFindings } from "../src/agenteval/score.ts";
import { TASKS } from "../src/agenteval/tasks.ts";
import type { Task } from "../src/agenteval/tasks.ts";

/**
 * The scorer decides every number this project reports about agent behaviour, so it is tested like
 * production code. The split between "findings" and "considered and dismissed" matters most: a good
 * review names the things it chose *not* to flag, and counting those as false positives would
 * penalise exactly the behaviour the skill is supposed to produce. Two earlier versions of this
 * scorer did precisely that.
 */

test("a non-findings heading is recognised across phrasings, and a findings heading is not", () => {
  const dismissHeadings = [
    "## Correct as annotated",
    "## Rules I considered and did *not* apply",
    "## Verified as conforming — not reported",
    "### Checked and deliberately not flagged",
    "## Non-issues",
    "**Not an issue**",
    "## Passes at AA",
    // Observed in a real run and mis-scored: the agent listed the visionOS 60 pt spacing rule under
    // this heading precisely to say it did not apply, and the scorer counted it as a scope error.
    "## Rules I considered and excluded as out-of-platform",
    "## Out-of-scope rules",
    "## Considered and set aside",
    "## Rules that do not apply to this platform",
    "## Dismissed",
  ];
  for (const h of dismissHeadings) {
    const { findings, dismissed } = splitFindings(`## Issues\n- a real problem\n\n${h}\n- a decoy`);
    expect(findings).toContain("a real problem");
    expect(dismissed).toContain("a decoy");
  }

  // Headings that introduce real findings must never trigger the split.
  // The dismissal vocabulary is deliberately loose, so these are the cases that keep it from
  // swallowing the report: every one contains a reporting word, and some contain a platform or
  // rule word too.
  for (const h of [
    "## Issues",
    "## Findings",
    "## HIG findings (iOS)",
    "## Violations",
    "## What I found",
    "## Setup",
    "## Rules violated",
    "## Scope",
    "## Platform-specific findings",
    "## watchOS rules that this screen breaks",
    "## Applicable rules",
  ]) {
    const { dismissed } = splitFindings(`${h}\n- a real problem`);
    expect(dismissed).toBe("");
  }
});

const task: Task = {
  id: "t",
  skill: "s",
  file: "f",
  code: "",
  prompt: "",
  skillHint: "",
  violations: [{ id: "v1", cues: ["44x44"] }, { id: "v2", cues: ["stacked sheet"] }],
  decoys: [{ id: "d1", cues: ["ellipsis", "remove"], dismissCues: ["ellipsis"] }],
  scopeTraps: [{ id: "s1", cues: ["60x60"] }],
};

test("a decoy named under a non-findings heading is a dismissal, not a false positive", () => {
  const transcript = `## Issues
- The tap target is 44x44 pt too small.
- A stacked sheet appears here.

## Correct as annotated
- The trailing ellipsis is required on macOS, so I did not flag it.`;
  const s = score(task, transcript);
  expect(s.found.sort()).toEqual(["v1", "v2"]);
  expect(s.falsePositives).toEqual([]);
  expect(s.dismissedCorrectly).toEqual(["d1"]);
});

test("a decoy asserted as a problem is a false positive", () => {
  const s = score(task, `## Issues\n- 44x44 pt target is too small.\n- Remove the trailing ellipsis from the button title.`);
  expect(s.falsePositives).toEqual(["d1"]);
  expect(s.dismissedCorrectly).toEqual([]);
  expect(s.missed).toEqual(["v2"]);
});

test("scope traps only count inside the findings body", () => {
  expect(score(task, `## Issues\n- Targets must be 60x60 pt.`).scopeErrors).toEqual(["s1"]);
  // Naming a rule in order to rule it out is correct behaviour, not a scope error.
  expect(score(task, `## Issues\n- fine\n\n## Rules I considered and did not apply\n- 60x60 pt is visionOS.`).scopeErrors).toEqual([]);
});

test("citations count rule ids and source links", () => {
  const s = score(task, "- something `apple-hig/buttons/010` (https://developer.apple.com/design/human-interface-guidelines/buttons#Role)");
  expect(s.cited).toBe(2);
  const none = score(task, "- something with no citation at all");
  expect(none.cited).toBe(0);
});

test("cues must co-occur inside one finding, not across the whole document", () => {
  // Regression from a real run: a preamble mentioning every colour it had checked, plus a later
  // heading called "## Failures", satisfied both halves of a decoy the review actually dismissed.
  const transcript = `I verified every claim myself: the ellipsis, the spacing, the labels.

## Failures
- Remove the redundant aria-label from the zip field.

## Checked and conforming — not reported
- The trailing ellipsis is required here, so I left it.`;
  const s = score(task, transcript);
  expect(s.falsePositives).toEqual([]);
  expect(s.dismissedCorrectly).toEqual(["d1"]);

  // The same two words inside one finding is a genuine assertion and still counts.
  expect(score(task, "## Failures\n- Remove the trailing ellipsis.").falsePositives).toEqual(["d1"]);
});

test("findings are split at list markers, numbered items and bold leads", () => {
  const blocks = findingBlocks(`## Failures
**Line 9** — the contrast is too low.
  continuation of line 9
- a bullet finding
1. a numbered finding`);
  expect(blocks.length).toBe(4); // heading, bold lead + continuation, bullet, numbered
  expect(blocks[1]).toContain("continuation of line 9");
  expect(blocks[2]!.trim()).toBe("- a bullet finding");
});

test("every task's decoy and scope-trap cues are distinct from its violation cues", () => {
  // A cue collision would make a finding score as a false positive (or vice versa) and silently
  // corrupt the comparison between arms.
  for (const t of TASKS) {
    const violationCues = t.violations.map((v) => v.cues.join("|"));
    for (const d of t.decoys) expect(violationCues).not.toContain(d.cues.join("|"));
    for (const s of t.scopeTraps) expect(violationCues).not.toContain(s.cues.join("|"));
    // Ids must be unique within a task so a result row can be read unambiguously.
    const ids = [...t.violations, ...t.decoys, ...t.scopeTraps].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  }
});

test("a comparison between arms with unequal samples is reported as not comparable", () => {
  const rows = (spec: Record<string, number>) =>
    Object.entries(spec).flatMap(([key, n]) => {
      const [task, arm] = key.split("/");
      return Array.from({ length: n }, () => ({ task: task!, arm: arm! }));
    });

  // The shape that produced a reported result in this repo: the skill arm run once on top of an
  // existing three-sample baseline. Both lines print identically, so nothing flagged it.
  const lopsided = comparability(rows({ "t/none": 3, "t/skill": 1 }));
  expect(lopsided.lopsided.map((x) => x.task)).toEqual(["t"]);
  expect(lopsided.lopsided[0]!.counts).toEqual({ none: 3, skill: 1 });
  expect(lopsided.singleSample).toEqual([]);

  // Matched samples are comparable, however many.
  expect(comparability(rows({ "t/none": 3, "t/skill": 3 })).lopsided).toEqual([]);
  expect(comparability(rows({ "t/none": 3, "t/skill": 3 })).singleSample).toEqual([]);

  // One sample each is symmetric but still supports no range.
  const thin = comparability(rows({ "t/none": 1, "t/skill": 1 }));
  expect(thin.lopsided).toEqual([]);
  expect(thin.singleSample.map((x) => x.task)).toEqual(["t"]);

  // A task where only one arm has run is an incomplete run, not a bad comparison.
  expect(comparability(rows({ "t/skill": 1 }))).toEqual({ lopsided: [], singleSample: [] });

  // Tasks are judged independently.
  const mixed = comparability(rows({ "a/none": 3, "a/skill": 3, "b/none": 3, "b/skill": 1 }));
  expect(mixed.lopsided.map((x) => x.task)).toEqual(["b"]);
});

test("a run that produced no transcript is excluded from the figures, not scored as zero", () => {
  // A failed CLI invocation used to take the whole batch down with it. It is now recorded as a
  // sample with an error and no transcript; the summary must not average it in, or a harness
  // failure reads as a skill scoring 0/6.
  const rows = [
    { task: "t", arm: "skill", run: 0, error: undefined },
    { task: "t", arm: "skill", run: 1, error: "claude exited 1" },
    { task: "t", arm: "none", run: 0, error: undefined },
  ];
  const scored = rows.filter((r) => !r.error);
  expect(scored.length).toBe(2);
  // Once failures are dropped, the two arms are one sample each: symmetric, but no range.
  const c = comparability(scored);
  expect(c.lopsided).toEqual([]);
  expect(c.singleSample.map((x) => x.task)).toEqual(["t"]);
  // Counting the failure would have made the arms look unequal, which is a different — and wrong —
  // complaint about the same data.
  expect(comparability(rows).lopsided.map((x) => x.task)).toEqual(["t"]);
});

test("a bold label introducing prose is not a dismissal heading", () => {
  // The defect: a one-line scope preamble at the top of a review moved the entire report into the
  // dismissed section, scoring a complete audit 0/6. In the summary that is indistinguishable from
  // a review that found nothing, which is how it went unnoticed for a full run.
  for (const preamble of [
    "**Scope:** WCAG 2.2 Level AA only; Level AAA criteria are not applied.",
    "**Platform:** watchOS only. visionOS rules are not applied.",
    "**Target:** Level AA. Nothing below AA is reported.",
    "**Method:** I did not trust the inline comments and recomputed each ratio.",
  ]) {
    const { findings } = splitFindings(`${preamble}\n\n## Findings\n- **1.4.3** contrast fails at 2.85:1\n`);
    expect(findings).toContain("contrast fails");
  }

  // A bold heading that *is* the whole line still splits.
  const { findings, dismissed } = splitFindings("## Issues\n- a real problem\n\n**Not an issue**\n- a decoy");
  expect(findings).toContain("a real problem");
  expect(findings).not.toContain("a decoy");
  expect(dismissed).toContain("a decoy");
});

test("a split that would leave no findings at all is rejected as a mis-split", () => {
  // Belt and braces for the same failure: if the only candidate heading sits before every finding,
  // the split is wrong no matter how the heading is phrased. A review states its findings first.
  const t = "## Nothing here conforms\n\n- **1.4.3** contrast fails\n- **2.4.7** focus not visible\n";
  const { findings } = splitFindings(t);
  expect(findings).toContain("contrast fails");
  expect(findings).toContain("focus not visible");
});

test("a success criterion number counts as a citation, whatever form the agent chose", () => {
  const t = (s: string) => score(
    { ...task, violations: [], decoys: [], scopeTraps: [] } as unknown as Task,
    s,
  ).cited;
  // Three samples of one task cited ~29 criteria each and scored 1, 13 and 13 under the old regex,
  // which measured which *format* the agent happened to pick rather than whether a reader could
  // check the finding. All three forms are checkable.
  expect(t("Fails 1.4.3 Contrast (Minimum) at Level AA.")).toBe(1);
  expect(t("See `wcag22/distinguishable/003`.")).toBe(1);
  expect(t("https://www.w3.org/TR/WCAG22/#contrast-minimum")).toBe(1);
  // Counting it made the no-skill arm's citations visible too, which is the point: an agent citing
  // 1.4.3 from memory is doing something the old metric scored as zero.
  expect(t("Fails 1.4.3 and 2.4.7.")).toBe(2);
});

test("a fabricated finding with a valid-looking citation gets no evidence credit", () => {
  // The A7 acceptance case. Both transcripts are citation-shaped in exactly the same way, and the
  // old scorer counted both as one citation apiece — so inventing a plausible rule id scored the
  // same as quoting a real one.
  const known = new Set(["apple-hig/buttons/002", "https://developer.apple.com/design/human-interface-guidelines/buttons"]);
  const real = score(task, "## Issues\n- 44x44 pt target `apple-hig/buttons/002`", known);
  expect(real.cited).toBe(1);
  expect(real.citedResolved).toBe(1);
  expect(real.citedUnresolvable).toEqual([]);

  const fabricated = score(task, "## Issues\n- 44x44 pt target `apple-hig/buttons/999`", known);
  expect(fabricated.cited).toBe(1); // still citation-*shaped*
  expect(fabricated.citedResolved).toBe(0); // and resolves to nothing
  expect(fabricated.citedUnresolvable).toEqual(["apple-hig/buttons/999"]);

  // A URL with a fragment and trailing punctuation is the same citation as the bare one.
  const url = score(task, "## Issues\n- see (https://developer.apple.com/design/human-interface-guidelines/buttons#Role).", known);
  expect(url.citedResolved).toBe(1);

  // Without the known set the scorer must say it did not check, not that nothing resolved.
  const unchecked = score(task, "## Issues\n- 44x44 pt `apple-hig/buttons/999`");
  expect(unchecked.citedResolved).toBeNull();
  expect(unchecked.citedUnresolvable).toBeNull();
});

test("citations under a non-findings heading are not evidence for a finding", () => {
  // Counting over the whole transcript credited whichever arm listed more rules it had chosen not
  // to apply, which is the opposite of what a citation count is supposed to measure.
  const s = score(task, "## Issues\n- a finding with no citation\n\n## Rules I considered and did not apply\n- `apple-hig/buttons/002` is macOS-only");
  expect(s.cited).toBe(0);
});

test("findings the fixtures classify as nothing are counted, not silently ignored", () => {
  // The seeded decoys cannot enumerate every false positive an agent might invent. Reporting the
  // unclassified count keeps precision from reading as a complete account of the review.
  const s = score(task, "## Issues\n- 44x44 pt target is too small.\n- The view uses a deprecated gradient API.");
  expect(s.found).toEqual(["v1"]);
  expect(s.unclassified).toBe(1);
  // A finding that matches a fixture item is classified, whichever kind it is.
  expect(score(task, "## Issues\n- 60x60 pt targets required.").unclassified).toBe(0);
});

test("only a refused launch is retried, not a run that actually produced something", async () => {
  // Two of three samples once died instantly with empty stderr, and the batch reported n=1 as if
  // only one had been asked for. Retrying those is right; retrying a real failure is not, because
  // it would turn a genuine result into another attempt at the same answer.
  const { isRefusedLaunch } = await import("../src/agenteval/score.ts");
  expect(isRefusedLaunch("claude exited 1 after 4ms: no output on stdout or stderr after 4ms")).toBe(true);
  expect(isRefusedLaunch("claude exited 1 after 118ms: no output on stdout or stderr after 118ms")).toBe(true);
  // Produced output: the CLI ran and had something to say, so the failure is the answer.
  expect(isRefusedLaunch("claude exited 1 after 12ms: Invalid API key")).toBe(false);
  // Lasted long enough to have done work, so an empty result is a fact about the run.
  expect(isRefusedLaunch("claude exited 1 after 9400ms: no output on stdout or stderr after 9400ms")).toBe(false);
});
