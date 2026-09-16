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
  /**
   * Citation-*shaped* strings in the findings body. A formatting count and nothing more: a
   * fabricated finding quoting `apple-hig/buttons/999` is shaped exactly like a real one.
   */
  cited: number;
  /**
   * Citations that name something the built skill actually contains, when the caller supplies the
   * set of real citations. `null` means no resolution was attempted — which is different from
   * "none resolved", and the summary must not print the two the same way.
   */
  citedResolved: number | null;
  /** Citation-shaped strings naming nothing that exists. A fabrication lands here. */
  citedUnresolvable: string[] | null;
  findings: number;
  /**
   * Findings matching no violation, decoy or scope trap. The fixtures enumerate the mistakes we
   * thought of; these are the ones we did not. Unscored — an unclassified finding may be perfectly
   * correct — but reported, so `precision` is not read as a complete account of what was said.
   */
  unclassified: number;
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
const NEGATIVE = String.raw`not|n't|never|non-|no\b|without|deliberate|rather than|instead|exclud|omit|skip|out[- ]of|outside|rule[sd]? out|set aside|dismiss`;
const CORRECT = String.raw`correct|conform|fine|ok\b|okay|valid|pass(?:es|ing)?|right|allowed|permitted|acceptable|as annotated|as intended|compliant`;
const REPORTING = String.raw`flag|report|apply|applied|applicable|rais(?:e|ed)|list(?:ed)?|find(?:ing)?s?|issue|violat|call(?:ed)? out|consider(?:ed)?|rules?\b|scope|platform`;
/**
 * Headings that are a dismissal on their own, with no reporting verb to pair with: "## Dismissed",
 * "## Out of scope", "## False positives". Kept as an explicit short list rather than folded into
 * NEGATIVE, because these words only mean "what follows was not flagged" when they *are* the
 * heading — "## Out-of-scope rules I should have caught" is a different claim.
 */
const STANDALONE_DISMISSAL = String.raw`dismissed|out[- ]of[- ]scope|false positives?|no issues?|nothing (?:to )?(?:flag|report)|non-?findings?`;
/**
 * A heading (`## …` or a bold lead) that either
 *   - pairs a negation with a reporting verb ("did not apply", "not flagged", "non-issues"), or
 *   - asserts correctness ("Correct as annotated", "Verified as conforming", "Passes at AA").
 *
 * A bold "heading" has to be the whole line (`**Not an issue**`), not a bold label introducing
 * prose (`**Scope:** WCAG 2.2 Level AA only; Level AAA criteria are not applied.`). Allowing the
 * latter meant a one-line scope preamble at the top of a review moved the *entire* report into the
 * dismissed section and scored it 0/6 — a real result in this repo, and indistinguishable in the
 * summary from a review that found nothing.
 */
const HEADING_LINE = String.raw`^(?:#{1,6}\s+[^\n]*|\s*\*\*[^*\n]*\*\*\s*)$`;
const NOT_FLAGGED = new RegExp(
  String.raw`^(?:#{1,6}\s+|\s*\*\*)\s*(?:` +
    String.raw`[^\n]{0,60}?(?:${NEGATIVE})[^\n]{0,40}?(?:${REPORTING})` +
    String.raw`|[^\n]{0,60}?(?:${REPORTING})[^\n]{0,40}?(?:${NEGATIVE})` +
    String.raw`|[^\n]{0,40}?(?:${CORRECT})[^\n]{0,40}` +
    String.raw`|(?:${STANDALONE_DISMISSAL})[^\n]{0,20}` +
    String.raw`)`,
  "img",
);

/**
 * Where the heading a match landed on actually begins, and whether it is a heading at all.
 *
 * The pattern's `\s*` swallows the preceding newline, so `m.index` can point at the end of the line
 * *before* the heading. Both the "is this a heading" test and the split point have to be computed
 * from the real line start, or the findings section keeps a stray blank line and the test reads the
 * wrong text entirely.
 */
function headingAt(transcript: string, index: number): number | null {
  const from = /\s/.test(transcript[index] ?? "") ? index + 1 : index;
  const start = transcript.lastIndexOf("\n", from) + 1;
  const end = transcript.indexOf("\n", start);
  const line = transcript.slice(start, end < 0 ? undefined : end);
  return new RegExp(HEADING_LINE, "i").test(line) ? start : null;
}

export function splitFindings(transcript: string): { findings: string; dismissed: string } {
  const re = new RegExp(NOT_FLAGGED.source, NOT_FLAGGED.flags);
  for (let m = re.exec(transcript); m; m = re.exec(transcript)) {
    const at = headingAt(transcript, m.index);
    if (at === null) continue;
    const findings = transcript.slice(0, at);
    // A dismissal section that swallows every finding is a mis-split, not a review that found
    // nothing: the agent would have had to report its non-issues before its issues.
    if (!findingBlocks(findings).some(isFinding) && findingBlocks(transcript.slice(at)).some(isFinding)) continue;
    return { findings, dismissed: transcript.slice(at) };
  }
  return { findings: transcript, dismissed: "" };
}

/** A bullet, numbered item, or bold lead — the shapes a review states a finding in. */
const isFinding = (b: string) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(b) || /^\s*\*\*/.test(b);

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

/**
 * Citation shapes the scorer recognises: a rule id, a source URL, or a WCAG criterion number.
 * Exported so a resolver and the scorer cannot drift apart on what counts as a citation.
 */
export const CITATION = /\b[a-z0-9-]+\/[a-z0-9-]+\/\d{3}\b|https?:\/\/\S*(?:developer\.apple\.com|w3\.org)\S*|\b\d\.\d\.\d+\b/gi;

/**
 * Normalise a citation for comparison against the real artifacts: lowercased, fragment and trailing
 * punctuation removed. `…/buttons#Role).` and the shipped `…/buttons` are one citation.
 */
export const citationKey = (c: string) => c.toLowerCase().replace(/[).,;:]+$/, "").replace(/#.*$/, "");

/**
 * `known` is the set of citations the built skill actually contains (rule ids, source URLs,
 * criterion numbers), keyed by `citationKey`. Supply it and a fabricated citation counts as
 * unresolvable instead of as evidence. Omit it and `citedResolved` is `null`: the scorer reports
 * that it did not check rather than implying it did.
 *
 * What this still cannot establish: that a resolvable citation *supports* the claim attached to it.
 * A real rule id quoted beside a wrong assertion resolves. Nor do the seeded decoys enumerate every
 * false positive an agent could invent — `unclassified` counts the findings the fixtures say
 * nothing about, so the summary cannot read as a complete account. This is why the README calls
 * these figures preliminary, and that qualification stands.
 */
export function score(task: Task, transcript: string, known?: Set<string>): Score {
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

  // A finding is *checkable* when it carries a rule id or a source link.
  // A WCAG success criterion number is a citation too: "Fails 1.4.3 Contrast (Minimum)" is exactly
  // as checkable as the rule id or the URL, and which form an agent picks varies run to run. Three
  // samples of the same task cited ~29 criteria each and scored 1, 13 and 13, which measured
  // formatting rather than whether a human could verify the finding.
  //
  // Counted over the findings body rather than the whole transcript: a citation under "rules I
  // considered and did not apply" is not evidence for a finding, and counting it credited whichever
  // arm listed more rules it had chosen not to use.
  const citations = [...body.matchAll(CITATION)].map((m) => m[0]!);
  const cited = citations.length;
  const unresolvable = known ? citations.filter((c) => !known.has(citationKey(c))) : null;
  // Bulleted/numbered lines are the agent's findings; a rough denominator for citation rate.
  const findings = bodyBlocks.filter((b) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(b) || /^\s*\*\*/.test(b)).length;
  // Findings the fixtures classify as nothing at all. Counted, never scored.
  const classified = [...task.violations, ...task.decoys, ...task.scopeTraps];
  const unclassified = bodyBlocks.filter(
    (b) => isFinding(b) && !classified.some((c) => c.cues.every((q) => b.toLowerCase().includes(q.toLowerCase()))),
  ).length;
  return {
    found, missed, falsePositives, dismissedCorrectly,
    cited,
    citedResolved: unresolvable ? cited - unresolvable.length : null,
    citedUnresolvable: unresolvable,
    findings, unclassified, scopeErrors,
  };
}

/**
 * Whether two arms can be compared at all.
 *
 * An arm with one sample and an arm with three print in exactly the same shape, so a lopsided
 * comparison reads as sound. That is not hypothetical: a result in this repo was reported from a
 * single skill-arm sample against a three-sample baseline, and the project had already learned this
 * lesson once (`0ef7374`, "three samples per arm; report ranges, not anecdotes") when three samples
 * came out lower than the one. The count is a property of the data, so the check lives here with
 * the rest of the scoring rather than in the runner's output code.
 */
export interface ArmCounts { task: string; counts: Record<string, number> }

export function comparability(rows: { task: string; arm: string }[]): {
  lopsided: ArmCounts[];
  singleSample: ArmCounts[];
} {
  const byTask = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const c = byTask.get(r.task) ?? {};
    c[r.arm] = (c[r.arm] ?? 0) + 1;
    byTask.set(r.task, c);
  }
  const lopsided: ArmCounts[] = [];
  const singleSample: ArmCounts[] = [];
  for (const [task, counts] of byTask) {
    const ns = Object.values(counts);
    // Only meaningful once both arms have run; one arm alone is an incomplete run, not a bad
    // comparison, and the runner already reports that as "—".
    if (ns.length < 2) continue;
    if (new Set(ns).size > 1) lopsided.push({ task, counts });
    else if (ns.every((n) => n === 1)) singleSample.push({ task, counts });
  }
  return { lopsided, singleSample };
}

/**
 * Whether a failed CLI invocation is worth another attempt.
 *
 * True only for a launch that was refused outright: a non-zero exit inside a few hundred
 * milliseconds having written nothing to either stream. A run that produced output, or that lasted
 * long enough to have done real work, failed for a reason retrying will not change, and retrying it
 * would quietly replace a genuine result with another attempt at the same question.
 *
 * It lives here rather than in `run.ts` because this module is pure and importable from a test;
 * importing `run.ts` starts the harness.
 */
export const isRefusedLaunch = (message: string): boolean => /after \d{1,3}ms: no output/.test(message);
