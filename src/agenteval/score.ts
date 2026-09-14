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

/**
 * Split a review into the individual findings it makes: a bullet, a numbered item, or a bold lead
 * line, each carrying its continuation lines.
 *
 * Cues have to match *within one finding*, not anywhere in the document. Matching document-wide
 * produced a real mis-score: a run that opened with "I verified every contrast claim myself
 * (#767676→4.54:1, …)" and later had a heading called "## Failures" satisfied both cues of a decoy
 * whose two halves were paragraphs apart, even though the transcript went on to dismiss that decoy
 * correctly.
 */
export function findingBlocks(body: string): string[] {
  const lines = body.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.join("").trim()) blocks.push(current.join("\n"));
    current = [];
  };
  for (const line of lines) {
    // A new finding starts at a list marker, a numbered item, or a bold lead ("**Line 9** — …").
    if (/^\s*(?:[-*]|\d+\.)\s+\S/.test(line) || /^\s*\*\*/.test(line) || /^#{1,6}\s/.test(line)) flush();
    current.push(line);
  }
  flush();
  return blocks;
}

/** Does any single finding show the agent recognised this issue? All cues must be in one block. */
function hit(blocks: string[], cues: string[]): boolean {
  const lowered = cues.map((c) => c.toLowerCase());
  return blocks.some((b) => {
    const t = b.toLowerCase();
    return lowered.every((c) => t.includes(c));
  });
}

export function score(task: Task, transcript: string): Score {
  const { findings: body, dismissed } = splitFindings(transcript);
  const bodyBlocks = findingBlocks(body);
  const dismissedBlocks = findingBlocks(dismissed);
  const found: string[] = [];
  const missed: string[] = [];
  // A violation counts wherever it is reported; a *dismissal* of a real violation is not a find.
  for (const v of task.violations) (hit(bodyBlocks, v.cues) ? found : missed).push(v.id);
  // A decoy only costs you if you asserted it as a problem, not if you named it and set it aside.
  const falsePositives = task.decoys.filter((d) => hit(bodyBlocks, d.cues)).map((d) => d.id);
  const scopeErrors = task.scopeTraps.filter((s) => hit(bodyBlocks, s.cues)).map((s) => s.id);
  const dismissedCorrectly = task.decoys.filter((d) => hit(dismissedBlocks, d.dismissCues)).map((d) => d.id);

  // A finding is checkable when it carries a rule id or a source link.
  const cited = [...transcript.matchAll(/\b[a-z0-9-]+\/[a-z0-9-]+\/\d{3}\b|https?:\/\/\S*(?:developer\.apple\.com|w3\.org)\S*/gi)].length;
  // Bulleted/numbered lines are the agent's findings; a rough denominator for citation rate.
  const findings = bodyBlocks.filter((b) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(b) || /^\s*\*\*/.test(b)).length;
  return { found, missed, falsePositives, dismissedCorrectly, cited, findings, scopeErrors };
}
