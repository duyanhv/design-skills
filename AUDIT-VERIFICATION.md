# Audit closure verification

Baseline: `bd88258`, 2026-09-14. This follow-up reviewed the fixes, reran the checks, and challenged the strongest verification claims in isolated scratch directories. It changes no implementation or generated artifacts.

The core fixes are substantial. The original sampled WCAG loss, Apple context loss, platform-scope cases, bare-only severity case, stale-page/configuration cases, entry-file size, and rule-ID packaging now have passing evidence. I would not yet describe all findings as unconditionally closed: the completeness and agent-evaluation claims exceed what their checks establish.

## Confirmed results

- `bun run check`: passed, including 30 unit tests, synthetic end-to-end checks, 18 negative validator cases, coverage, and manifest validation.
- `bun run trace`: 10/10 assertions passed. These are ten assertions, not a one-to-one check of the ten original findings: several cover subcases of findings 2–4, and findings 9–10 are not directly asserted there.
- `bun run eval`: Apple 13/13, WCAG 10/10, synthetic example 9/9.
- The trace observed 1,043 rule notes, 667 section intros, 91 platform-scoped Apple pages, and zero scope contradictions. The Apple entry file is approximately 1,198 tokens using the project's character-based estimate.
- The saved 18 agent runs contain nine unaided runs with citation counts of zero, and nine skill runs with counts from 11 to 40. I inspected the saved results and scorer; I did not initiate new model runs or independently adjudicate all transcript findings.
- The working tree was clean before verification; running the checks left tracked files unchanged.

## Remaining findings

### P1 — Coverage is a loss heuristic, not a completeness guarantee

Location: [src/e2e/coverage.ts](src/e2e/coverage.ts), lines 26–62.

The checker keeps only alphabetic words of seven or more characters, skips lines with fewer than four such words, and compares those words against the entire reference page. It reports loss only when more than 60% of those words are absent. Numeric thresholds, short prohibitions, ordering, repeated text, and assignment to the correct rule are not protected by this method. Table rows are skipped outright, even when a sibling table file is absent. A whole missing IR page is also outside the loop, because the checker enumerates output IR rather than the source inventory.

In an isolated copy of the existing WCAG Distinguishable artifact, I changed the text-spacing multiplier from 1.5 to 9.9, the letter-spacing multiplier from 0.12 to 8.88, and the reflow width from 320 to 999. Coverage still exited zero and reported no unexplained content loss. This does not mean the existing targeted evals would accept those particular corruptions; it establishes that the general coverage claim is false.

Coverage also starts at normalized Markdown. Anything lost during raw-source normalization is already invisible to it, including the original class of WCAG normalization bug.

Action: describe the current check as a heuristic scan. For a completeness guarantee, track source blocks and their hashes through normalization, IR, and rendered output, with an explicit retained/transformed/omitted status and reason. Compare source and output inventories, including tables. Keep targeted semantic checks for numbers, conditions, scope, and exceptions; block retention alone cannot establish meaning.

### P1 — CI coverage currently compares no pages

Location: [.github/workflows/ci.yml](.github/workflows/ci.yml), lines 21–38; [src/e2e/run.ts](src/e2e/run.ts), final cleanup; [src/e2e/coverage.ts](src/e2e/coverage.ts), lines 71–94.

The synthetic e2e run deletes its normalized cache unless `--keep` is specified. CI invokes it without that option and then invokes coverage. Apple and WCAG caches/artifacts are not committed or built in this workflow. Consequently, all sources are skipped in a clean CI checkout, yet the command succeeds and prints that every source line is accounted for.

The local check run demonstrated the synthetic source being skipped for lack of normalized cache. A separate isolated directory containing the source manifests but no build caches reproduced the all-skipped success path.

Action: retain the synthetic cache until coverage finishes, or run coverage inside the e2e lifecycle. In CI require at least one explicitly named source and a positive expected page count; fail when that source or its cache is unavailable. Keep optional local skips visibly distinct from a successful coverage result.

### P2 — Agent results measure citation mentions and seeded cues, not validated findings

Location: [src/agenteval/score.ts](src/agenteval/score.ts), lines 95–103; [src/agenteval/run.ts](src/agenteval/run.ts), prompt construction and precision calculation; [src/agenteval/tasks.ts](src/agenteval/tasks.ts), lines 45–48.

Citation count is a regex match over the entire transcript. It does not verify that the rule exists, resolve a URL, attach the citation to a finding, check support for that finding, or deduplicate repeated citations. The precision denominator includes only recognized seeded violations and recognized predefined decoys; arbitrary invented findings are not counted as false positives.

A synthetic transcript with one recognized violation, two copies of a nonexistent rule ID, and an unrelated invented requirement scored as one violation found, two citations, and zero false positives. The runner's precision formula would report 100% for that result.

The skill arm also receives an additional instruction to cite every finding. The observed citation difference therefore describes the effect of the skill plus that instruction; it does not isolate the benefit of compiled references from the benefit of requesting citations.

Action: report the existing numbers as citation mentions and seeded-decoy results. Apply the same evidence-request wording to both arms. Score each finding against valid rule IDs/source anchors, verify scope and supporting content, count unsupported extra findings, and manually adjudicate this small transcript set. Record model/version/settings and artifact revision for reproducibility. A source-access baseline would help distinguish compilation quality from simply having references available.

## Supported public claim

“Across three seeded review tasks with three samples per arm, the skill-assisted workflow produced source links or rule-ID mentions in every run; unaided runs produced none. Recall was high in both arms. These preliminary results suggest improved traceability, but do not yet establish citation correctness for every finding or prevention of invented rules.”

Retain the compiler fixes and regression tests. Reopen the completeness/evaluation portion of finding 9 and the CI coverage portion of finding 10 until the gaps above are closed. The remaining work is focused; it does not require restarting the architecture or expanding to more sources.
