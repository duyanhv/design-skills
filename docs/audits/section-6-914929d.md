# Section 6 follow-up audit — 914929d

Reviewed commit: `914929d`, against the [previous audit](section-6-9becc71.md).

**Conclusion: the source corrections are sound, but “all seven findings closed” overstates the acceptance checks.** The exact previous mutations are now covered. Six related verification gaps remain, reproduced below. These are defects in the checks; the mutations do not establish that the current published scores or artifacts are fraudulent.

## What holds

- The authority guide now distinguishes the extractor's supplemental blocks from WCAG Notes. This agrees with [WCAG's normative/informative distinction](https://www.w3.org/TR/WCAG22/#interpreting-normative-requirements).
- Material's guidance now distinguishes inactive controls from controls merely styled to look disabled. Its contrast exception agrees with [SC 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum).
- The original Flutter tick and the missing `bun run <file>` case now have passing negative tests.
- The actual erratum correctly identifies Focus Visible as [Level AA](https://www.w3.org/TR/WCAG22/#focus-visible), and preserves the review. Detection and explanation accuracy are now distinguished.
- The Material headline now excludes the partial result.

## Verification scope

`bun run check` passed typecheck, then ran 190 tests: **189 passed, 1 failed**. The failing test was `the records CLI reports a substituted snapshot and exits non-zero`, at `test/records.test.ts:323`: its `Bun.serve({ port: 0 })` failed with `EADDRINUSE` before testing the CLI. The command stopped at this stage; subsequent checks in that command did not run. This is an environment-level failure, not evidence that snapshot validation is wrong. No escalation was requested in this audit.

The example, WCAG-count, installation, and CI-parity controls passed separately. Mutations ran in a temporary local clone with its own Git history and dependencies linked from the workspace. The local WCAG IR was available to the source-dependent checks. Each mutation was restored before the next, except the final intentionally committed review rewrite, which remained only in the temporary clone.

No implementation or preserved evidence was changed in the working repository. This audit document is the only addition.

## R1 — P2: Committing a review rewrite defeats preservation

Location: [example.ts](../../src/e2e/example.ts), lines 223–239.

The new artifact guard compares the working file with `HEAD`. That catches an uncommitted rewrite but makes any committed rewrite its new reference. The older Apple-specific history check does not cover the new examples.

Reproduction in the temporary clone:

1. Replace `examples/accessibility-claims-review/REVIEW.md` with `# Review` and `No findings. Everything conforms.`
2. Run `bun run src/e2e/example.ts`: **exit 1**, correctly rejecting the uncommitted rewrite.
3. Commit that replacement in the temporary clone.
4. Run the same CLI: **exit 0**. It reports both that the review matches its committed content and that the 10 credited outcomes agree with the README.

A normal PR/CI checkout is already committed. This guard therefore does not protect the evidence at the point where the repository publishes it. The new pre-registration files also remain outside the new artifact loop.

- [ ] Pin each preserved artifact to its original blob or digest, with sufficient provenance to distinguish an approved appended correction from replacement.
- [ ] Cover the new pre-registration files as well as reviewer outputs.
- [ ] Test a committed rewrite and a deleted required artifact in a separate Git repository, not only a dirty working file.

## R2 — P2: Scores still depend on formatting and the wrong table cell

Location: [example.ts](../../src/e2e/example.ts), lines 179–221.

Two independent mutations passed the real CLI:

| Mutation | Exit | Why it passes |
| --- | --- | --- |
| Replace the bold accessibility headline with plain `11 of 10 planted defects found. 0 false positives.` | 0 | Only headlines beginning with `**` are examined; finding none still prints that the README agrees |
| Change A1's Defect cell to `**Found** no criterion cited at all` and its Outcome cell to `**Missed**` | 0 | The first bold phrase anywhere after the ID is used as the outcome |

The second case reports 10 credited outcomes despite the actual Outcome column now containing only 9 Found rows. This repeats the previously corrected RN result-column problem in the new scorer.

- [ ] Resolve the Outcome column from the table header; read only that cell and validate its allowed values.
- [ ] Reject duplicate adjudications instead of silently overwriting them in a map.
- [ ] Recognize supported headline formatting consistently, and fail or explicitly report an unverified headline when none is parsed.
- [ ] Add the two exact CLI mutations above with unchanged controls.

## R3 — P2: An erratum only has to mention the criterion

Location: [example.ts](../../src/e2e/example.ts), lines 295–303.

Replacing the entire erratum with the following still yields **exit 0**:

```markdown
# Erratum

SC 2.4.7 is Level A. The review is correct.
```

The checker prints `SC 2.4.7 cited as Level A, actually AA — recorded in ERRATA.md`. It checks only `errata.includes(number)`, so a document reinforcing the error qualifies as its correction. The existing negative test removes the identifier and never challenges what the erratum says about it.

- [ ] Bind the criterion, erroneous level, and corrected level in a structured erratum record, and compare the corrected level with the WCAG build.
- [ ] Verify the published erratum presents that correction, rather than relying on identifier presence.
- [ ] Add cases retaining the identifier while deleting or reversing the correction.

## R4 — P2: The new count breakdown is only partly checked

Location: [wcag-counts.ts](../../src/e2e/wcag-counts.ts), lines 116–128.

The correction publishes 118 normative blocks, split into 94 bulleted alternatives, 6 exceptions, and 18 other normative text blocks. The checker validates the total and bullet count, but not the latter two figures or their sum.

Changing `6 are exceptions` to `600 are exceptions` in the authority guide leaves `bun run src/e2e/wcag-counts.ts` at **exit 0**. The published breakdown no longer adds up and the count verifier accepts it.

- [ ] Either remove the unnecessary breakdown or derive every category from an explicit, mutually exclusive classification and verify their sum.
- [ ] Add a mutation for each published category. The source terminology correction can stay closed without claiming that this incomplete counter verifies the whole paragraph.

## R5 — P2: Installation checks internal consistency, not the intended install root

Location: [install.ts](../../src/e2e/install.ts), lines 69–83 and 122–134.

Changing every `~/.agents/skills` occurrence in the README to `~/.agents/skils` leaves `bun run src/e2e/install.ts` at **exit 0**. Both `mkdir` and the symlinks now agree on the same wrong directory, so traversal succeeds outside the intended skills installation root.

This is distinct from the fixed case where only one destination was misspelled. Following commands literally establishes that the links can be created; it does not establish that they install into the agent's expected directory.

- [ ] Validate the documented install root against an explicit supported destination, in addition to consistency between commands.
- [ ] Add a case where both the directory creation and destinations share the typo.
- [ ] Keep the reported result scoped to what was exercised: symlink creation and reference traversal do not themselves test agent discovery or invocation.

## R6 — P2: CI parity still omits checks, and its regression tests a copy

Location: [example-cli.test.ts](../../test/example-cli.test.ts), lines 394–426 and the later `a CI step replaced with echo fails the parity test` case.

The expected set is derived only from `src/e2e/*.ts` occurrences. Removing the typecheck execution from CI therefore does not affect it. The workflow parser also ignores step conditions.

Independent mutations, running `bun test test/example-cli.test.ts -t 'CI executes every'`:

| Mutation | Exit |
| --- | --- |
| Replace `run: bun run typecheck` with `run: echo "typecheck skipped"` | 0 |
| Add `if: ${{ false }}` to the checklist step while retaining its `run` command | 0 |

There is also a regression-test wiring defect: the echo regression duplicates the parser instead of exercising the actual parity test. Removing the echo-exclusion guard from the primary parity test still leaves **both CI tests passing**. The copied guard in the regression remains intact, so it proves its own parser works.

- [ ] Prefer one shared executable check command in local scripts and CI, with explicit CI-only extras.
- [ ] If separate steps remain, include typecheck, unit tests, and build commands, and account for whether required steps can run and propagate failure.
- [ ] Make the negative test exercise the actual parity implementation. Remove its guard to confirm the regression detects that removal.

## Recommended closure order

Preserve the evidence independently of `HEAD` first. Then give outcomes and errata explicit fields instead of inferring their meaning from nearby prose. Centralize the CI entry point rather than extending the shell regex. Finally, either verify the complete count breakdown or remove it. Keep the correct source edits and the fixed checklist regressions; they do not need another rewrite.
