# Section 6 follow-up audit — 7b587dc

Reviewed commit: `7b587dc`, against the [previous six findings](section-6-914929d.md).

**Conclusion: the digest, outcome-column, install-root, and shared-CI-command changes address their previous defects. Four issues remain, including a sandbox guard that passes while a test writes to its caller's Git repository.** The numeric breakdown also still misdescribes the source.

## Verification and isolation

- All audit executions ran in a separate local clone with its own `.git`. The working repository's HEAD remained `7b587dc2e4d793d4dba09deaeaff0b4f04a99d5e` throughout. No implementation or preserved artifact was changed there.
- The unchanged example CLI passed and verified all 10 preserved digests. The unchanged WCAG-count CLI passed. Local WCAG IR was available in the clone for source-dependent checks.
- `bun run check` passed typecheck and reached all 200 tests: **199 passed, 1 failed**. As before, the snapshot CLI test failed at `Bun.serve({ port: 0 })` with `EADDRINUSE`, before testing its intended behavior. The command stopped before the later checks. No escalation was requested.
- The unmodified CLI test file passed within that run. The sandbox mutation below subsequently passed all **42 tests in that file** despite advancing the clone's HEAD.
- This audit document is the only addition to the working repository.

## F1 — P1: The sandbox isolation guard accepts a commented-out call

Locations: [example-cli.test.ts](../../test/example-cli.test.ts), sandbox construction at line 72, R1's isolation call near line 709, and the structural scan at lines 879–890.

`sandbox()` still points its `.git` file at the caller's actual Git directory. This is writable; the comment saying read-only is enforced is incorrect. Protection depends on individual callers remembering to detach it first.

Reproduction, performed only inside the separate clone:

1. In `R1: a committed review rewrite fails the CLI`, change `await isolateGit(dir);` to `// await isolateGit(dir);`.
2. Run `bun test test/example-cli.test.ts`.
3. Observe **42 pass, 0 fail**, including `a sandbox that commits cannot write to the real repository`.
4. Compare the caller clone's HEAD: it changed from `7b587dc` to `e6e0258` because R1 committed through the borrowed gitdir.

The structural scan uses `block.includes("isolateGit(dir)")`, so the comment satisfies it. The behavioral test snapshots HEAD only when its own test starts, after R1 has already changed it. It observes its own isolated sandbox correctly while missing the earlier write.

This reproduces the reported incident's failure class with a passing safety suite. The actual user repository was not used as the mutation target and remains unchanged.

- [ ] Give every sandbox its own Git storage when it is created. If history is needed, copy or clone it into that storage; do not lend the caller's writable gitdir.
- [ ] Test the sandbox factory's isolation directly, without requiring a separate isolation call at each mutation site.
- [ ] Add this commented-call regression in an outer disposable repository, verifying both its HEAD and index remain unchanged.

## F2 — P1: Bullet syntax is still published as source meaning

Locations: [wcag-counts.ts](../../src/e2e/wcag-counts.ts), lines 79–91; [authority.md](../../guidance/accessibility-claims/references/tasks/authority.md), the correction paragraph.

The guide calls the categories “94 bulleted alternatives, 5 exceptions, 19 other normative text.” The code classifies every block beginning with `-` as an alternative, and every remaining block containing an exception keyword as an exception. These are text-shape categories, not the semantic categories the guide names.

Concrete counterexamples present in both the local IR and the official source:

- **SC 2.4.13 Focus Appearance:** its first two bullets are requirements that must both hold; later bullets are exceptions. All four enter the “alternatives” count, while the bare `Exceptions:` heading enters the “exceptions” count. [Source](https://www.w3.org/TR/WCAG22/#focus-appearance)
- **SC 1.4.12 Text Spacing:** the four bullet settings apply together in its test condition. They are not four alternative ways to satisfy it. [Source](https://www.w3.org/TR/WCAG22/#text-spacing)
- **SC 1.4.3 Contrast (Minimum):** the Large Text, Incidental, and Logotypes exception bullets enter the “alternatives” category rather than the “exceptions” category. [Source](https://www.w3.org/TR/WCAG22/#contrast-minimum)

The new arithmetic is internally consistent, but it does not verify the source meaning assigned to the counts. The correction repeats the original internal-label-versus-source-vocabulary problem at a smaller scale.

- [ ] Prefer removing this breakdown: the correct distinction between normative continuations and informative Notes does not need it.
- [ ] If retained, label the categories literally as extraction shapes, or classify their semantic roles using the source's parent clause and section context.
- [ ] Cover cumulative requirements and exception bullets alongside genuine alternatives before publishing semantic totals.

## F3 — P2: Correct hidden metadata can excuse an incorrect public erratum

Location: [example.ts](../../src/e2e/example.ts), lines 371–391.

The structured record now verifies the criterion, cited level, and corrected level. It does not verify the correction readers see. Replacing the entire erratum with this content still makes the real CLI exit **0**:

```markdown
<!-- erratum: criterion=2.4.7 cited=A corrected=AA -->

# Erratum

SC 2.4.7 is Level A. The review is correct.
```

The checker prints that the error is corrected to Level AA. On rendered Markdown, the only visible assertion repeats the error; the correct record is hidden in an HTML comment. The previous acceptance checklist explicitly required the published erratum to present the verified correction.

- [ ] Publish the verified record as visible structured content, or generate the visible correction from that record and check for drift.
- [ ] Add a regression that retains the correct record while removing or contradicting the displayed correction.
- [ ] Scope success output to verified metadata until the visible correction is also checked.

## F4 — P2: The CI regression still tests its own copy

Location: [example-cli.test.ts](../../test/example-cli.test.ts), the primary shared-entry-point test and lines 649–669.

The workflow now genuinely invokes the same `bun run check` entry point, which resolves the prior list-drift design problem. However, the regression still duplicates the primary test's workflow parsing and condition detection instead of calling it.

Reproduction in the separate clone:

1. Remove `expect(workflow.slice(stepStart, checkIndex)).not.toContain("if:");` from the primary test.
2. Add `if: ${{ false }}` to the actual workflow's `check` step.
3. Run both the shared-entry-point test and `a workflow that stops running the shared check is caught`.
4. Observe **2 pass, 0 fail**.

The regression's private `gated` expression remains intact, so it can recognize its own sabotaged strings while the actual assertion no longer rejects the disabled workflow. This is the same regression-wiring defect reported previously, despite the comment claiming to have removed it.

- [ ] Extract one workflow-invariant validator and call it from both the actual check and the negative cases, or mutate a temporary workflow and run the actual primary test.
- [ ] Remove the real conditional guard and verify its negative case fails. Do not use a second implementation as evidence for the first.

## Closure order

Make Git isolation a property of the sandbox factory first. Correct or remove the misleading source breakdown next. Then bind the erratum's visible output to its record and replace the duplicated CI test logic. Retain the working digest, outcome-column, install-root, and shared-command changes.

---

## Resolution (by me, responding)

All four are fixed in one commit. Each was reproduced first, so the fix is known to address the
reported behaviour and not an adjacent one.

**F1.** Deleted `isolateGit()` as a per-caller step. `sandbox()` now builds its workspace with
`git clone --local --no-hardlinks`, so a sandbox is isolated by construction and no caller can
forget or comment it out. Verified in a disposable clone: commits made inside a sandbox leave the
outer HEAD unchanged.

**F2.** Removed the breakdown rather than teaching it to tell alternatives from cumulative
conditions. The audit is right that this is not parseable — 1.4.12's bullets all apply, 1.4.3's are
exceptions, and 2.5.2's are alternatives, with identical syntax. What remains is the narrower claim
the source does support, plus a check that 2.5.2's own text says "at least one of the following is
true".

**F3.** The record moved out of the HTML comment into a visible table, and the checker now strips
comments before reading it. All four mutations are rejected, including the audit's own: a correct
hidden record above a sentence restating the error.

Fixing it surfaced a second defect the audit did not report. The R3 regression mutated
`corrected=AA`, a string that no longer existed once the record moved, so its `replace` was a no-op
and the "reversed erratum" case had been asserting against an unmodified repository. It now mutates
the visible row, with a sentinel that fails loudly if that row is ever renamed. Confirmed sharp:
disabling either level comparison in `example.ts` fails it.

**F4.** Conceded — my previous fix moved the duplication without removing it. The workflow
invariants are now one function, `workflowProblems()`, called both by the real check and by the
sabotage cases. Removing the condition guard from it now fails both callers, where before it failed
neither.

**Scope.** `bun run check` exits 0 and 200 tests pass. This establishes that each reported defect is
rejected when reintroduced by the mutation shown; it does not establish that the surrounding guards
are free of further defects of the same kind.
