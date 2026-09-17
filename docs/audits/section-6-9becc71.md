# Section 6 audit — 9becc71

Reviewed commit: `9becc71`, including the Section 6 additions since `6407caa`.

**Conclusion: Section 6 should not yet be described as fully verified.** The prior RN CLI integration gap is closed. The new bundles and acceptance checks have the following source-fidelity and verification gaps.

## Verified in this audit

- 41 tests passed across `test/example-cli.test.ts` and `test/pilot-claims.test.ts`.
- Typecheck, checklist, installation, WCAG-count, and example-claim checks passed on the unchanged repository.
- Installation traversal reached 13 Apple files, 8 Material files, and 5 accessibility-claims files. The latter had 12 traversed links. The fourth traversed bundle is the synthetic Lumen fixture.
- The WCAG counts reproduce from the local IR. This does not establish that their published labels describe the source accurately; see S6-01.
- Mutations below were made in an isolated copy of tracked files. Each affected CLI had a passing unchanged control.
- The full 182-test suite and complete `bun run check` were not independently rerun. The earlier escalation was blocked by automatic approval review because the workspace was out of credits. These local checks required no escalation.

## S6-01 — P1: Internal `notes` entries are described as WCAG notes

[authority.md](../../guidance/accessibility-claims/references/tasks/authority.md), lines 19–31, says WCAG has 118 normative notes, 181 informative notes, and criteria carrying both kinds. It tells readers to determine whether a note is normative. [criteria.md](../../guidance/accessibility-claims/references/tasks/criteria.md) also describes normative notes.

WCAG explicitly classifies notes as informative in [Interpreting Normative Requirements](https://www.w3.org/TR/WCAG22/#interpreting-normative-requirements). The repository's [extractor](../../src/extract/wcag.ts) uses `notes` as an internal container for subsequent normative paragraphs, exception lists, notes, and examples. Its own comments explain this distinction.

For example, the local record for Pointer Cancellation stores four requirement alternatives as normative entries and two actual notes as informative entries. That does not mean WCAG calls those alternatives normative notes.

The counter verifies the internal classification totals while the guide gives that classification the source's terminology. The numerical agreement therefore does not verify the claim being published.

- [ ] Describe the counts as extracted supplemental blocks, with the internal representation identified explicitly, or remove them from the public guide.
- [ ] State that WCAG notes are informative, while requirements, exceptions, and applicable definitions are normative.
- [ ] Update authored and generated copies and the count check's terminology.
- [ ] Add a source-shaped fixture distinguishing a normative exception list from an actual Note; do not validate the distinction solely by recounting `note_authority`.

## S6-02 — P1: Material guidance contradicts the inactive-control exception

[components.md](../../guidance/material-3/references/tasks/components.md), lines 28–29, says a disabled state is not an excuse to fail contrast. The linked accessibility guide states the opposite for genuinely inactive controls.

[WCAG SC 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum) exempts text in inactive UI components. The component guide's unqualified statement can cause an agent to file the false finding the accessibility example is meant to prevent.

- [ ] Distinguish genuinely inactive controls from controls merely styled to look disabled.
- [ ] Separate any recommendation to improve disabled-state readability from a WCAG failure.
- [ ] Rebuild the Material bundle and add an eval for this distinction.

## S6-03 — P2: New exercise scores and preserved artifacts are not protected

[example.ts](../../src/e2e/example.ts), lines 165–171, checks only the denominator for the new exercises. The immutable-artifact check below it still targets only the Apple review.

Each independent mutation below exited **0** and reported that published numbers matched their artifacts:

| Mutation | Result |
| --- | --- |
| Accessibility example headline changed from `10 of 10` to `11 of 10` | Accepted |
| Accessibility scoring table's first `Found` changed to `Missed` | Accepted |
| Entire accessibility `REVIEW.md` replaced with a claim of no findings | Accepted |

Rejecting `11 of 11` proves the denominator check, not the numerator, adjudication, or review preservation claims.

- [ ] Validate each planted identifier and adjudicated outcome, then derive the numerator and denominator.
- [ ] Verify review references resolve to the preserved review sections; keep semantic adjudication identified as human review.
- [ ] Apply the preservation policy to all relevant new reviews and pre-registered artifacts.
- [ ] Add real-CLI regressions for the three mutations above, with unchanged controls.

## S6-04 — P2: The original Flutter checklist mutation still passes

Appending the exact motivating claim still exits **0**:

```markdown
- [x] Ship a fully verified Flutter skill with three worked examples
```

The check reports 47 items, 9 resolvable references, and 38 judgements. A fabricated delivery claim has been classified as a judgement because the parser did not recognize a reference.

The committed regression changes the case to a tick containing `guidance/flutter/SKILL.md`, which exercises path resolution instead. Also accepted:

```markdown
- [x] Verified by `bun run src/e2e/flutter.ts`.
```

[checklist.ts](../../src/e2e/checklist.ts), lines 68–71, recognizes neither that complete command nor its embedded path, despite the comment claiming this form is covered.

- [ ] Give concrete completion claims explicit, resolvable evidence references or a structured claim type.
- [ ] Distinguish unrecognized prose from a judgement that inherently requires human assessment.
- [ ] Parse and resolve `bun run <source-file>` as well as package script names.
- [ ] Preserve the exact original Flutter wording in a regression or explicitly document it as an unverified delivery claim. Do not report that particular defect as caught by the current path-only case.

## S6-05 — P2: Installation is reconstructed, not followed from the README

[install.ts](../../src/e2e/install.ts) extracts source bundle names from the README, then independently creates correct destinations under a temporary `.agents/skills` directory.

Changing the documented Apple destination to `~/.agents/skils/apple-design` leaves the check green. In a fresh setup, the documented command would target a directory the preceding instructions did not create, but the validator silently uses the correct directory.

- [ ] Exercise the actual documented command blocks in an isolated home, or parse and validate their sources, destinations, and directory-creation steps as a restricted command format.
- [ ] Add destination and missing-directory regressions.
- [ ] Until then, describe this as bundle traversal through symlinks, not verification that the README's installation procedure works.

## S6-06 — P2: CI and local checks are not proven equivalent

The parity test in [example-cli.test.ts](../../test/example-cli.test.ts), lines 394–408, searches raw workflow text for script filenames. It checks one-way presence, not execution.

Replacing the checklist step with the following still passes the parity test:

```yaml
run: echo "skipped src/e2e/checklist.ts"
```

The current sets also differ: CI runs the leak check and generated-output drift checks that the local `check` command does not run.

- [ ] Use a shared executable check entry point, or compare parsed executable steps rather than filename occurrences.
- [ ] State intentional CI-only checks explicitly instead of claiming identical sets.
- [ ] Add a regression replacing execution with `echo` or a comment.

## S6-07 — P2: The preserved accessibility review misstates Focus Visible's level

[REVIEW.md](../../examples/accessibility-claims-review/REVIEW.md), lines 127 and 130, labels SC 2.4.7 Focus Visible as Level A. [The criterion is Level AA](https://www.w3.org/TR/WCAG22/#focus-visible). The scoring table credits this section without recording the error.

This does not automatically change the planted-defect detection score or create a false positive. It is a separate factual error in the reviewer output that should remain visible when describing the exercise's quality.

- [ ] Preserve the verbatim review.
- [ ] Append an erratum/adjudication noting the incorrect level, and link it from the example summary.
- [ ] Keep detection counts separate from the accuracy of the review's explanations and proposed fixes.

## Closure criteria

Close the source-fidelity findings first, then the acceptance checks. Re-run the unchanged controls and committed defect cases. Record which assertions are mechanical and which still depend on source review. Passing checks should not be presented as proof beyond their stated coverage.
