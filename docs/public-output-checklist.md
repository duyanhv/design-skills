# Public skill showcase checklist

## Goal

A visitor can understand the product, inspect a complete useful skill, and judge a real example directly on GitHub before cloning.

## 1. Establish the public offering

- [x] Make the public skill bundles the main entry point for the repository.
- [x] Clearly distinguish authored public skills from locally extracted guideline corpora.
- [x] Keep the current redistribution policy for verbatim Apple HIG and WCAG output.
- [x] Explain what each public skill contains and which decisions require reading an external source.

Done in the README's "Browse the skills" table and the two subsections under it, in the rewritten
[`skills/README.md`](../skills/README.md), and in a new [`guidance/README.md`](../guidance/README.md)
describing the input side. Section 3's worked example is what will make these claims demonstrable
rather than merely stated.

`bun run docs` (new, in `check` and CI) checks every relative link in the repository's Markdown for a
target a GitHub visitor could open: the path exists, git actually publishes it, and the `#anchor`
resolves in the *target* file. `bun run docs:negative` reintroduces each defect against a scratch git
repository and asserts the matching case fails, with controls so that a checker rejecting everything
would not pass. It found the two live links to audit documents deleted in `2903b24`, and a review of
its first version found two gaps it could not see — cross-file anchors and untracked-but-present
files — which is why the guards are now a suite rather than shell-history probes.

## 2. Complete the Apple public skill first

- [x] Expand `guidance/apple-design/` with original, actionable guidance beyond research instructions.
- [x] Organize references around concrete tasks: navigation, actions, forms, typography, appearance, and accessibility.
- [x] Cover component selection, implementation considerations, common mistakes, and relevant exceptions.
- [x] Attach official source links to specification-dependent guidance and verify the linked sections.
- [x] Retain platform, OS-version, framework, and interaction-state context where it affects a decision.
- [x] Distinguish upstream requirements, recommendations, and our own design judgments.
- [x] Include verification steps and identify checks that require runtime or visual inspection.
- [x] Keep `SKILL.md` concise and route readers to focused references.
- [x] Rebuild `skills/apple-design/` and verify its links, provenance, and synchronization with authored inputs.

Six task guides under `references/tasks/`, plus `references/context/platforms.md` for the
platform/OS/framework/system-vs-custom context that decides whether guidance applies at all. Each
task file ends with a **Verify** section separating what code review settles from what needs a
running app. `SKILL.md` is a router: context, task table, build loop, and the three failure modes
that produce bad findings.

Grounded against the local `apple-hig` build rather than recall, which is how the guide came to
carry Apple's actual wording ("not to provide actions") and its stated exceptions (a modal covering
the tab bar) instead of a paraphrase.

`bun run links` (new) verifies all 97 official link targets, including deep section anchors, against
Apple's own DocC page data. A status code cannot do this: developer.apple.com returns 200 with an
app shell for a page that does not exist, and the retired `navigation-bars` URL serves the
*Toolbars* document. Both failure modes, plus a bogus anchor, were reproduced and seen to fail.

The eval suite went from 2 checks to 21, rewritten to assert requirements rather than sentences
after the old ones broke on rephrasing. Removing a requirement was verified to fail the matching
check. One eval caught a real defect: a paraphrase that had dropped Apple's own wording.

An audit then found four more: three scope errors in the guides (a switch rule detached from iOS and
iPadOS, a toolbar warning generalized past its source, and unqualified point sizes in the file that
forbids them) and a hole in the link verifier, which counted a 200 carrying `{}` as a verified page.
All fixed in `5e03b6f`. Of those four, only the numeric one is machine-detectable: `bun run specs`
scans prose for measurement literals, and `specs:negative` pins both what it catches and the four
shapes it knowingly misses (words, unitless numbers, prose ratios, fenced code). The platform-scope
errors are reachable only by reading the source section, which is now stated in `guidance/README.md`
rather than implied.

Not done here: section 3's worked example, which is what will demonstrate the guide rather than
describe it.

## 3. Publish one real worked example

- [x] Create an original example screen with representative, verifiable issues.
- [x] Include the starting code and a screenshot of its actual rendered state.
- [x] Review it using the public Apple skill and record supported findings.
- [x] Tie each finding to the affected element, source guidance, applicable scope, and proposed fix.
- [x] Implement the fixes and include the corrected code and rendered screenshot.
- [x] Record what was tested and which checks remain unverified.
- [x] Include a permitted pattern that the review correctly leaves unchanged.
- [x] Make the complete example browsable on GitHub without running the project.

[`examples/apple-design-review/`](../examples/apple-design-review/). A SwiftUI share screen with 15
planted defects, reviewed blind and then fixed, with real captures from iPhone 17 Pro / iOS 26.5 in
light, dark, and AX5, and per-capture conditions recorded.

**Protocol, which is the part that makes it evidence rather than a demo.** The defect list was
written first and kept outside the repository; the screen carries no comments; a separate agent in
an isolated directory received only the screen, the skill, and the screenshots, and was not told
defects existed. Its review is published verbatim, including the corrections it made to its own
figures.

Result: **13 of 14 valid planted defects** found, 0 fabricated rule IDs, 6 permitted patterns
explicitly checked and left alone, and **4 real defects nobody planted** — the best of which, a
toolbar button that silently toggles link sharing, I had written as filler without noticing.

One planted item (P13) was invalidated on audit: the review declined it and was right, so it leaves
the denominator rather than being charged to either side. One pre-designated acceptable pattern (C2)
was flagged by the review, and on audit the review's argument holds, so it is reported as a
disagreement with the rubric rather than as a false positive. Adjudicated false positives: 0.

**One wrong dismissal, settled by measurement rather than by argument.** The review declined to file
a target finding on the toolbar button, measuring its Liquid Glass container at 44 × 44 pt from the
screenshot. A runtime hit test showed the region that actually receives a touch is 39.5 × 26.5 pt.
The guide warns that a screenshot cannot settle a hit-target question; the review repeated that
warning in its own limitations and then relied on a pixel measurement anyway. Published as the
example's headline lesson rather than buried.

Claims are scoped: one screen, one run, one platform, no control arm.

## 4. Lead the README with the outcome

- [x] Open with a short explanation of what the skills help users accomplish.
- [x] Show the real before/after example near the top.
- [x] Add a “Browse the skills” table linking directly to complete public bundles.
- [x] Describe each skill's intended tasks and platform scope.
- [x] Link the worked example beside the relevant skill.
- [x] Put installation after the showcase and browsable output.
- [x] Move compiler architecture and local extraction instructions below the user-facing material.
- [x] Explain why local-only corpora are excluded and point visitors to the available public guides.
- [x] Check all README links and image rendering on GitHub.

Order is now: what the skills do → the worked example with before/after screenshots → the skills
table (with a worked-example column) → what they decide versus what they send the agent to read →
what is not published and why → installation → the compiler.

Rendering was checked against GitHub's own renderer (`api.github.com/markdown/raw`) rather than by
eye: every table in the README, the example, `scoring.md`, `measurements.md`, `skills/README.md`,
and `guidance/README.md` parses with its columns aligned, the escaped pipe in a code cell produces
one cell, and the screenshot paths render as relative `<img src>` that resolve in the repository.
`bun run docs` resolves all 123 relative links and both heading anchors.

## 4a. Corrections after audit

An audit of the first version of the example found four problems, all now fixed:

- **The score did not match the published review.** P13 was counted as found when the review
  explicitly declined it; the toolbar target was counted both as "left alone" and as "wrongly
  dismissed"; a planted item (progress placement) was counted as unplanted; and false positives were
  reported as zero without examining the one pattern where the review contradicted my rubric.
  Adjudicated item by item in `scoring.md`. A second audit caught an over-correction in that fix —
  P13 had been removed from the denominator *and* charged as a dismissal — and separated rubric
  disagreement (C2) from actual false positives. Final: 13 of 14 valid found, 1 wrongly dismissed,
  4 unplanted, 0 adjudicated false positives.
- **The headline measurement was not reproducible.** The hit-test instrumentation existed only in my
  shell history. Both probes and their raw output are now committed under `examples/*/probe/`, and
  the claim is described as programmatic hit-testing rather than "what the finger gets", since real
  taps remain untested.
- **The "after" screen still had a Dynamic Type defect**: the Send button wrapped to "Sen"/"d" at
  AX5, in the screen meant to demonstrate Dynamic Type being fixed. The review's own F3 had
  recommended `ViewThatFits` for that row and I had not implemented it. Fixed and recaptured.
- **Capture conditions could be recorded falsely.** `build.sh` suppressed failures from
  `simctl ui` and then recorded the *requested* settings as fact. It now fails the capture when a
  setting cannot be applied, and records what the device reports when queried.

Also removed "a screen that adapts should differ almost everywhere" from `measurements.md`: pixel
difference measures change, not adaptation quality. The larger AX5 difference was present *while*
the Send button was still wrapping, which is the concrete demonstration that the metric cannot
establish usable Dynamic Type support.

## 5. Verify packaging and usefulness

- [x] Commit both authored inputs in `guidance/` and generated public bundles in `skills/`.
- [x] Verify CI detects drift between authored inputs and generated output.
- [x] Validate every local reference and required bundled file.
- [x] Confirm local-only source text and caches remain excluded from publishing.
- [x] Exercise the public Apple skill on a build task and a review task.
- [x] Check findings for unsupported claims, missed exceptions, and confusion between visible size and actual interaction bounds.
- [x] Confirm the worked example's results match the claims made in the README.

**Packaging.** `guidance/` and `skills/` are both tracked (10 and 11 files for apple-design). The CI
drift gate was verified by *causing* drift: editing `guidance/apple-design/SKILL.md` and rebuilding
changes `skills/`, so CI's `git diff --exit-code` would fail. `validate` reports 0 errors and 0
warnings for all three published sources. `ir/apple-hig/`, `skills/apple-hig/`, `ir/wcag22/`,
`skills/wcag22/` and `.cache/` are present locally, git-ignored, and carry 0 tracked files.

**The exclusion check was too weak, and is now direct.** Ignore rules answer "is this path
excluded?", not "did the text get in by another route?". `bun run leak` (new) checks every tracked
text file against the *complete* local corpus of each non-redistributable source. The first version
sampled the corpus instead, and a planted file carrying 20 Apple sentences passed it; the rewrite
catches that file. Short attributed quotation is allowed, since the worked example quotes Apple in
order to cite it; bulk in a single file is not. Result: 7,971 Apple and 571 WCAG sentences checked,
0 bulk, 2 short quotations in the published review.

**The build task.** [`examples/apple-design-build/`](../examples/apple-design-build/) — a blind run
with six traps pre-registered outside the agent's workspace. All six avoided or handled: it stayed
on iOS 16 API, used a segmented control rather than a switch for a three-state setting, deferred OS
permission to system Settings, protected the async action against repeats, derived the count rather
than storing it, and named the alternative for the one genuinely debatable choice. The result
compiles warning-free at the stated floor, verified independently, and all 13 of its HIG citations
resolve including both section anchors.

**Findings audited for the three failure modes.** No fabricated rule IDs in either exercise. No
copied numeric specifications. On visible-size-versus-interaction-bounds: the review example
contains a *documented failure* of exactly this kind, where the reviewer measured a 44 × 44 pt
visual container and concluded the control was adequately sized while the touchable region is
39.5 × 26.5 pt. It is published as the headline lesson rather than smoothed over.

**README claims.** `bun run example:claims` (new, in `check` and CI) asserts that the scoring
table's rows add up, that the summary agrees with the table it summarises, that every document
quoting the headline quotes the same one, that the measurements match the committed probe output,
and that `REVIEW.md` has never been edited. Each invariant was verified by reintroducing the exact
defect an audit had found: the 12-vs-13 double-count, a stale headline in one document, and a
measurement drifting from its probe.

## 6. Extend the proven structure

- [ ] Apply the same task-oriented structure to the public Material 3 skill.
- [ ] Add a Material worked example using a documented implementation and version.
- [ ] Create an authored public accessibility skill with explicit scope and conformance limitations.
- [ ] Add an accessibility example that distinguishes normative conditions from informative advice.
- [ ] Add these bundles and examples to the README once they are complete and verified.

## Completion check

- [ ] A first-time visitor can identify the product without reading compiler documentation.
- [ ] A visitor can open a complete useful skill in one click.
- [ ] A visitor can inspect the input, supported findings, and corrected result without cloning.
- [ ] Public claims accurately describe the checked-in output and demonstrated behavior.
