import { test, expect } from "bun:test";
import { splitFindings, score } from "../src/agenteval/score.ts";
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
  ];
  for (const h of dismissHeadings) {
    const { findings, dismissed } = splitFindings(`## Issues\n- a real problem\n\n${h}\n- a decoy`);
    expect(findings).toContain("a real problem");
    expect(dismissed).toContain("a decoy");
  }

  // Headings that introduce real findings must never trigger the split.
  for (const h of ["## Issues", "## Findings", "## HIG findings (iOS)", "## Violations", "## What I found", "## Setup"]) {
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
