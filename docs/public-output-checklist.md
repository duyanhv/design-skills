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

`bun run docs` (new, in `check` and CI) fails on a relative link to a missing path, to a git-ignored
build product such as `skills/apple-hig/`, or to an absent heading anchor. All three were checked by
reintroducing them. It found the two live links to audit documents deleted in `2903b24`.

## 2. Complete the Apple public skill first

- [ ] Expand `guidance/apple-design/` with original, actionable guidance beyond research instructions.
- [ ] Organize references around concrete tasks: navigation, actions, forms, typography, appearance, and accessibility.
- [ ] Cover component selection, implementation considerations, common mistakes, and relevant exceptions.
- [ ] Attach official source links to specification-dependent guidance and verify the linked sections.
- [ ] Retain platform, OS-version, framework, and interaction-state context where it affects a decision.
- [ ] Distinguish upstream requirements, recommendations, and our own design judgments.
- [ ] Include verification steps and identify checks that require runtime or visual inspection.
- [ ] Keep `SKILL.md` concise and route readers to focused references.
- [ ] Rebuild `skills/apple-design/` and verify its links, provenance, and synchronization with authored inputs.

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
