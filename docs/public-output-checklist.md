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

- [ ] Create an original example screen with representative, verifiable issues.
- [ ] Include the starting code and a screenshot of its actual rendered state.
- [ ] Review it using the public Apple skill and record supported findings.
- [ ] Tie each finding to the affected element, source guidance, applicable scope, and proposed fix.
- [ ] Implement the fixes and include the corrected code and rendered screenshot.
- [ ] Record what was tested and which checks remain unverified.
- [ ] Include a permitted pattern that the review correctly leaves unchanged.
- [ ] Make the complete example browsable on GitHub without running the project.

## 4. Lead the README with the outcome

- [ ] Open with a short explanation of what the skills help users accomplish.
- [ ] Show the real before/after example near the top.
- [ ] Add a “Browse the skills” table linking directly to complete public bundles.
- [ ] Describe each skill's intended tasks and platform scope.
- [ ] Link the worked example beside the relevant skill.
- [ ] Put installation after the showcase and browsable output.
- [ ] Move compiler architecture and local extraction instructions below the user-facing material.
- [ ] Explain why local-only corpora are excluded and point visitors to the available public guides.
- [ ] Check all README links and image rendering on GitHub.

## 5. Verify packaging and usefulness

- [ ] Commit both authored inputs in `guidance/` and generated public bundles in `skills/`.
- [ ] Verify CI detects drift between authored inputs and generated output.
- [ ] Validate every local reference and required bundled file.
- [ ] Confirm local-only source text and caches remain excluded from publishing.
- [ ] Exercise the public Apple skill on a build task and a review task.
- [ ] Check findings for unsupported claims, missed exceptions, and confusion between visible size and actual interaction bounds.
- [ ] Confirm the worked example's results match the claims made in the README.

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
