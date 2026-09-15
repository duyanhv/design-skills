/**
 * Shared shapes for probe modules under `src/e2e/probes/`.
 *
 * A probe module owns one finding's evidence: the `CHECKS` that assert the requirement against the
 * shipped artifacts, and the `CASES` that reintroduce the defect and prove each check fails on it.
 * Keeping the pair in one file is deliberate — a check and the defect it guards are the same claim,
 * and separating them is how this project ended up with guards that had never been seen to fail.
 *
 * `trace.ts` and `trace-negative.ts` import and append these, so a new finding is a new file rather
 * than an edit to two shared lists that several people are changing at once.
 */

/** One requirement, asserted against `ir/` and `skills/` as they stand now. */
export interface Check {
  /** Finding id this check answers, e.g. "A1". Printed, and matched by the negative probe. */
  finding: string;
  requirement: string;
  /** Returns what was observed. Throw to fail; the message is the report. */
  observe: () => Promise<string>;
}

/** One defect, reintroduced into a scratch copy of the build, that a named check must catch. */
export interface Case {
  /** The `finding` of the check this defect must trip. */
  finding: string;
  name: string;
  break: (dir: string) => Promise<void>;
}
