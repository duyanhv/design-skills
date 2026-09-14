/**
 * Scoring a review transcript. Kept separate from the runner so it can be unit-tested without
 * spawning a model: this is load-bearing arithmetic behind every number the project reports.
 */
import type { Task } from "./tasks.ts";

export interface Score {
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
 *
 * Phrasing varies a lot ("Correct as annotated", "Verified as conforming", "Rules I considered and
 * did not apply"), so the match is built from two vocabularies — a marker of negation/correctness
 * and a marker of *reporting* — rather than from a list of exact headings. Chasing literal phrases
 * was how an earlier version mis-scored a correct dismissal as a false positive.
 */
const NEGATIVE = String.raw`not|n't|never|non-|no\b|without|deliberate|rather than|instead`;
const CORRECT = String.raw`correct|conform|fine|ok\b|okay|valid|pass(?:es|ing)?|right|allowed|permitted|acceptable|as annotated|as intended|compliant`;
const REPORTING = String.raw`flag|report|apply|applied|rais(?:e|ed)|list(?:ed)?|find(?:ing)?s?|issue|violat|call(?:ed)? out|consider(?:ed)?`;
/**
 * A heading (`## …` or a bold lead) that either
 *   - pairs a negation with a reporting verb ("did not apply", "not flagged", "non-issues"), or
 *   - asserts correctness ("Correct as annotated", "Verified as conforming", "Passes at AA").
 */
const NOT_FLAGGED = new RegExp(
  String.raw`^(?:#{1,6}\s+|\s*\*\*)\s*(?:` +
    String.raw`[^\n]{0,60}?(?:${NEGATIVE})[^\n]{0,40}?(?:${REPORTING})` +
    String.raw`|[^\n]{0,60}?(?:${REPORTING})[^\n]{0,40}?(?:${NEGATIVE})` +
    String.raw`|[^\n]{0,40}?(?:${CORRECT})[^\n]{0,40}` +
    String.raw`)`,
  "im",
);

export function splitFindings(transcript: string): { findings: string; dismissed: string } {
  const m = NOT_FLAGGED.exec(transcript);
  return m ? { findings: transcript.slice(0, m.index), dismissed: transcript.slice(m.index) } : { findings: transcript, dismissed: "" };
}

/** Does the transcript show the agent recognised this issue? All of a check's cues must appear. */
function hit(transcript: string, cues: string[]): boolean {
  const t = transcript.toLowerCase();
  return cues.every((c) => t.includes(c.toLowerCase()));
}

export function score(task: Task, transcript: string): Score {
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

