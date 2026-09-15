# Generated output audit

Date: 2026-09-15. Baseline: `7578cf2` plus the uncommitted `authored` source work. This audit looks at the artifacts an agent actually reads (`skills/apple-hig/`, `skills/wcag22/`, `skills/lumen-ds/`) and compares them against three things:

1. **Established design skills** installed on this machine: Anthropic's `frontend-design`, Vercel's `web-design-guidelines` and `react-best-practices`, Expo's `expo-native-ui`, and the `skill-creator` writing guide.
2. **The Agent Skills specification** (frontmatter, progressive disclosure, reference layout).
3. **The raw sources we pulled**: Apple DocC JSON in `.cache/apple-hig/raw`, the normalized Markdown in `.cache/apple-hig/md`, and the WCAG HTML in `.cache/wcag22/raw`.

The earlier audits ([AUDIT.md](AUDIT.md), [AUDIT-VERIFICATION.md](AUDIT-VERIFICATION.md)) reviewed the compiler. This one reviews what it produces. Nothing in production code or tests was changed. The only artifact change was re-running `bun run compose` for Apple HIG and WCAG so that the shipped Markdown reflects the current renderer; see finding 1.

## Verification performed

- `bun test`: 39 pass, 242 assertions. `bun run trace`: 10/10. `bun run eval`: Apple 13/13, WCAG 10/10. `bun run coverage`: 0 unexplained losses. `bun run validate`: apple-hig, wcag22, lumen-ds clean (the new `material-3` manifest fails because `guidance/material-3` does not exist yet; that is in-progress work, not an output defect).
- Sentence-level fidelity scan (`bun run fidelity <source-id>`, added with this audit as `src/e2e/fidelity.ts`): every sentence of six or more words in each normalized Apple page, checked for a verbatim (whitespace and markup normalized) match in the shipped reference plus its `.tables.md` sibling, skipping `skip_sections` and figure lines. Same idea for WCAG but starting from the raw HTML `p`/`li`/`dd`/`dt` nodes rather than the normalized Markdown, so normalization losses are visible.
- Link scan across all 166 Apple reference files and 16 WCAG files: file targets and heading anchors.
- Structural scans over `ir/apple-hig/pages/*.json`: severity triggers, scope distribution, rationale shape, section ordering.
- Manual reading of `buttons.md`, `alerts.md`, `windows.md`, `sf-symbols.md`, `distinguishable.md`, `navigable.md`, `glossary.md`, and the three `SKILL.md` entry files against their sources.

Token figures use the project's `chars / 4` estimate.

## Summary

The generated references are faithful to a degree that hand-written design skills never attempt: after a recompose, 25 of 11,806 Apple sentences and 3 of 556 WCAG text blocks are not present verbatim, and every one of those is a rendering-shape issue rather than a lost requirement. Platform scope, rule IDs, citations, and conformance levels are all present and correct in the samples read. The entry files are inside the spec's token budget.

Where the output falls short of the established skills is in *usability of the entry file* and in a handful of *rendering defects* that make specific rules read wrong. The findings below are ordered by how likely they are to change what an agent does.

| # | Severity | Finding |
| --- | --- | --- |
| 1 | P1 | Shipped Markdown was stale relative to the renderer; a build step is missing from the release path |
| 2 | P1 | Definition-list "terms" swallow the prose that follows them, so guidance is attached to the wrong item |
| 3 | P1 | A split bold lead ("**Consider** **presenting…**") becomes a term named "Consider" |
| 4 | P2 | Section order is not source order: intro-only sections are appended after every rule section |
| 5 | P2 | Extracted `value` is sometimes the wrong number for the rule |
| 6 | P2 | The entry file routes to 33 of 158 topics and has no task-shaped guidance |
| 7 | P2 | Rationale label `Why:` mislabels half its contents |
| 8 | P3 | Rendering nits: double em dash on terms, root-relative links in tables, HTML entities, glossary flattening |
| 9 | P3 | Severity heuristic edge cases: purpose clauses and "help ensure" promote SHOULD to MUST |
| 10 | P3 | Reference files are large relative to the established skills; no per-file table of contents |

## Findings

### 1. P1 — Shipped Markdown was stale relative to the renderer

The Apple references on disk were written at 16:44 on 2026-09-14. The compose fix in `bd88258` (16:47), which makes `termLine` render a term's `notes`, was never applied to them. Before this audit's recompose, the Buttons reference dropped "A button's role can have additional effects on its appearance. For example, a primary button uses an app's accent color, whereas a destructive button uses the system red color." plus the alert figure that illustrates it. `bun run coverage` did not report this because it reads `words()` from the whole reference file and those words appear elsewhere on the page.

After `bun run compose apple-hig`, the fidelity scan dropped from 131 missing sentences across 26 pages to 25 across 6 pages. Nothing in `bun run check` or `bun run trace` would have caught the stale artifacts because they read whatever is on disk.

Refinement:
- Make `compose` part of every path that changes the renderer. Simplest: `bun run check` should recompose every built source before `coverage` and `trace` run, and `trace` should assert that `provenance.json` records the compose revision (`git rev-parse HEAD` of `src/compose`) or a hash of `src/compose/index.ts`.
- Record `composed_at` and a compose fingerprint in `provenance.json` alongside `extractor`, and have `validate` warn when the fingerprint does not match the current code.
- Replace the vocabulary check in `src/e2e/coverage.ts` with the sentence-level scan added as `src/e2e/fidelity.ts`. It is the same walk over `.cache/<id>/md`, but the unit is a sentence and the match is verbatim after normalization. It finds every case below and is not fooled by words appearing elsewhere on the page. Keep the existing skips (figures, table rows moved to `.tables.md`, `skip_sections`).

### 2. P1 — Definition terms swallow the prose that follows them

`extractRules` treats a bold lead with a short label ("**Destructive.**", "**Monochrome**", "**Captions**") as a `term`, then leaves it as `openRule`. Every following paragraph, aside, and figure is appended to that term's `notes` until the next rule or heading. `termLine` then joins `rationale` and all notes into one run-on line.

Observed in `buttons.md` after recompose:

```
- **Destructive.** — The button performs an action that can result in data destruction. A button's role can have additional effects on its appearance. For example, a primary button uses an app's accent color, whereas a destructive button uses the system red color. _[figure: An example alert with three system buttons…]_ [src]
```

The sentence about roles in general is now presented as part of the Destructive definition. In `sf-symbols.md` the 13 rendering-mode and animation terms each absorb the paragraphs that follow. In `windows.md`, the "Inactive." state absorbs the paragraph describing how the system distinguishes main, key, and inactive windows, plus a Note that applies to panels. The 16 lines with `— —` (empty rationale then notes) are the same defect in a different shape.

This is worse than the pre-recompose state in one respect: previously the text was missing, now it is present but attributed to the wrong item. An agent quoting "the Destructive role" with its citation will quote a sentence about primary buttons.

Refinement:
- After emitting a `term`, do not keep it as `openRule` for subsequent paragraphs. Treat a term as closed once its own line ends; following prose goes to the section intro (or to a new "section context" block that renders after the term list) rather than into the term's notes.
- Render term notes, when they exist legitimately (WCAG 4.1.1 Parsing), as indented sub-bullets, not joined into one line, so a reader can see where the definition ends.
- Add a `bold-lead` fixture for `**Label.** definition` followed by a paragraph and a figure, asserting the paragraph is not in the term's notes.

### 3. P1 — A split bold lead produces a term named "Consider"

Apple's Playing audio page has `**Consider** **presenting a Now Playing view so people can control…**`. The extractor takes the first bold span as the statement, classifies "Consider" as a term (too short, not imperative in the list), and renders:

```
- **Consider** — presenting a Now Playing view so people can control current or recently played audio without leaving your app. …
```

with no severity, no rule ID, and no platform tag, on a watchOS section. This is the only instance of the pattern in the current crawl, but it is a source formatting quirk that will recur, and the current output is a rule with no ID that an agent cannot cite.

Refinement: in `extractRules`, when a line matches `**A** **B**` with no text between the spans, merge the spans before applying `BOLD_LEAD`. Add the line as a normalizer fixture.

### 4. P2 — Section order is not source order

`referenceDoc` builds `order` from rule sections first, then term sections, then table sections, then intro-only sections. Any section that has no rules is appended at the end of the file. This affects 148 of 158 Apple pages. Concrete effects:

- `alerts.md`: Anatomy (source position 2) renders after Platform considerations › macOS.
- `buttons.md`: the `### Platform considerations` intro ("No additional considerations for tvOS") and `### Platform considerations › macOS` intro ("Several specific button types are unique to macOS") render after watchOS, as orphan headings at the bottom of the file.
- The visionOS size table in `buttons.md` renders after the visionOS rules, although the source places it before them and the rules refer to "the sizes below".

The established skills (`react-best-practices/rules/*.md`, `expo-native-ui/references/*.md`) keep source structure and rely on it for scanning. An agent reading Apple's page and the reference side by side sees different documents.

Refinement: record a monotonically increasing `order` on every extracted section, rule, term, and table, and render by that order. Drop the "rules first, then terms, then tables" grouping inside a section as well; the source interleaves them deliberately (term list, then rules that use the terms).

### 5. P2 — Extracted `value` is sometimes the wrong number

`valueOf` takes the first unit-bearing number in `statement + rationale`. For 53 rules this produces a `— \`value\`` badge on the rule line. Samples where the badge misrepresents the rule:

- `Create engaging challenges. — \`5 minutes\`` (the source says "1-5 minutes to play").
- `Aid comprehension by adding descriptive text to the chart. — \`24 hours\`` (a passing example about the Weather app).
- `Define rules to help ensure your tips reach the intended audience. — \`24 hours\`` (an example frequency, not a requirement).
- `Keep double tap in mind when choosing the order of custom actions… — \`5 minutes\``.
- WCAG `1.4.8 Visual Presentation — \`up to 200 percent\`` (the last of five sub-requirements; the 80-character width limit and 1.5× spacing are equally load-bearing).

The badge is rendered in the same position and typography as genuinely load-bearing values (`at least 44x44 pt`, `at least 4.5:1`), so an agent skimming rule lines has no way to tell them apart.

Refinement: restrict `valueOf` to the statement only, or to the first sentence of the rationale when the statement has no number. When the rationale contains two or more distinct values, emit none. Add an eval assertion that no rule with a value badge has the badge's number absent from its statement's first sentence.

### 6. P2 — The entry file routes to 33 of 158 topics and has no task-shaped guidance

`skills/apple-hig/SKILL.md` is 1,201 tokens, well inside the budget, and it is spent on: a five-step generic workflow, a legend for tags, a nine-row "Where to look" table, and a six-row category count. The full topic list lives in `index.md` (3,774 tokens).

Compared with the established skills:

- `react-best-practices` lists every rule ID with a one-line summary in `SKILL.md` (70 rules) so the agent can pick without opening anything. We have 2,346 rules, so that exact shape does not fit, but the *topic* list (158 rows) does: `index.md` is 166 lines, and inlining a compact version (title + slug, no counts, no category column) would be roughly 1,500 tokens, keeping the entry under 3,000.
- `expo-native-ui` and `frontend-design` spend most of the entry file on opinionated task guidance ("Every screen that loads data has four states…", "Spend your boldness in one place"). Our entry file contains no design guidance at all; an agent that activates the skill for "build an iOS settings screen" learns only where to look.
- `skill-creator` recommends the description be "pushy" about triggers. Ours is fine on that count.

Specific gaps in the routing table: notifications, widgets, Live Activities, menus, lists/tables outside settings, charts, Liquid Glass/materials, watchOS, tvOS, and macOS windows/menu bar have no row. A macOS or watchOS task falls through to the index every time.

Refinement:
- Inline the full topic index into `SKILL.md` as a compact per-category list (`- [Buttons](references/components/buttons.md)`), and keep `index.md` for the count columns. Budget: under 3,000 tokens total.
- Extend `routing` in `sources/apple-hig.yaml` to cover each platform family and each category with at least one row. Rows for macOS (windows, the-menu-bar, toolbars, sidebars), watchOS (designing-for-watchos, complications, always-on), tvOS (designing-for-tvos, focus-and-selection, remotes), notifications, widgets, live-activities, menus, lists-and-tables, charting-data, materials.
- Consider a short "Before you start" block of five or six cross-cutting rules that hold on every Apple platform (hit region, press state, Dynamic Type, safe areas, system components over custom). These would be `rule ids` with links, not paraphrases, so authority still traces to the source. This is the one place where the generated skill could borrow the opinionated voice of the hand-written ones without inventing guidance.

### 7. P2 — Rationale label `Why:` mislabels half its contents

The `Why:` line holds everything after the bold lead in the source paragraph. 512 of 2,288 rationales begin "For example", "Use", "You can", "Specifically", "To", "If you", "When you", or "In general". These are procedures, examples, and conditions, not reasons. Two consequences:

- Genuine exceptions are labelled as reasons. `Tap to Pay on iPhone/010`: `Why: The exception is if Tap to Pay on iPhone is the only payment-acceptance method you support…` The exception is the most important part of the rule and it is labelled as its justification.
- The SKILL.md instruction "Read the whole rule — the statement, its Why, and the indented notes under it. The notes hold the exceptions" is wrong for this case; the exception is in the `Why`, and the notes hold a figure.

WCAG already uses `rationale_label: Details`. Apple should too.

Refinement: set `rationale_label: Details` (or `Context`) in `sources/apple-hig.yaml`, and rewrite step 3 of the workflow to say exceptions can appear anywhere in the rule body. Optionally split the rationale at the first sentence beginning "The exception is", "Except", or "However" and render that sentence as `Exception:`.

### 8. P3 — Rendering nits

- **Double em dash on terms** (16 lines, all in `sf-symbols.md`): `- **Monochrome** — — Applies one color…`. The source writes `**Monochrome** — Applies…`, the extractor strips the lead and leaves the dash in the rationale, and `termLine` adds its own. Trim a leading `—`/`-`/`:` from the rationale.
- **Root-relative links inside table cells** (110 links, 0 elsewhere): table Markdown is passed through untouched, so `[Tasks](/design/human-interface-guidelines/carekit#Tasks)` stays root-relative and is dead in a skill folder. Run `Linker.localize` over table Markdown.
- **114 anchors that do not resolve**: `Linker` lowercases the fragment, but the rendered headings are `### Platform considerations › macOS › Help buttons`, so `buttons.md#help-buttons` matches nothing. Either render an explicit `{#anchor}`-style id per section (GitHub will not honor it, but agents reading files will find the string), or keep the original DocC anchor as the heading text suffix, or rewrite same-page links to the section's rendered heading slug.
- **HTML entities**: `&lt;=` survives into `glossary.md` (relative luminance formula). Decode entities in the WCAG normalizer.
- **Glossary flattening**: every glossary entry is one line, so "changes of context" reads as `…include changes of: - user agent; - viewport; - focus; - content…` with list markers inline. Render term notes as indented sub-bullets (same fix as finding 2).
- **Orphan headings**: `### Platform considerations` with only "No additional considerations for tvOS" under it, rendered at the bottom of `buttons.md`. Once ordering is fixed (finding 4), this sits in the right place; a further improvement would be to attach "No additional considerations for X" as a scope note at the top of the file, since it is the only place the page says anything about tvOS.

### 9. P3 — Severity heuristic edge cases

The trace check "0 unjustified MUSTs" holds by its own definition (a strong word is present). Reading the 453 MUSTs by hand turns up two patterns where the strong word is not the directive:

- **Purpose clause "to avoid"** (7 rules): `Choose items deliberately to avoid overcrowding.`, `Strive to avoid replicating copyrighted content.`, `Keep primary content centered to avoid truncation…`. The directive is "choose", "strive", "keep"; "avoid" is the goal.
- **"help ensure" / "helps ensure"** (4 rules): `Define rules to help ensure your tips reach the intended audience.` "Help ensure" is hedged by construction.

On the MAY side, 39 rules are MAY only because the sentence contains "can" or "might" somewhere: `Recognize that people can have more than one home.`, `Show people whether a destination can accept dragged content.`, `Clearly communicate that content is loading and how long it might take to complete.` These read as SHOULD.

None of these change a prohibition into permission, so the earlier audit's "authority" concern is not reopened. They do make the MUST/SHOULD split noisier than the entry file's "Apply MUST rules as hard constraints" implies.

Refinement:
- In `severity.ts`, only let PROHIBITIVE match when the word is in the main clause: strip infinitive purpose clauses (`\bto (help )?(avoid|ensure|prevent)\b.*$`) before testing.
- Only let MAY fire on "can"/"might" when the modal governs the addressee ("you can", "you might"), not a third party ("people can", "a destination can").
- Add these sentences to `test/extract.test.ts` as severity fixtures.

### 10. P3 — Reference files are large and have no table of contents

Six references exceed 10,000 tokens (`widgets.md` is ~13,900 and 427 lines with 26 sections); 28 more are between 5,000 and 10,000. The `frontend-design` and `expo-native-ui` references are 1,000 to 3,000 tokens each. The spec says "keep individual reference files focused" and `skill-creator` says a reference over 300 lines should carry a table of contents.

Refinement: when a reference exceeds 200 lines, emit a `## Contents` list of section headings with rule counts after the header. For pages like Widgets, Wallet, and Machine learning, consider splitting on the top-level source heading into `widgets/<section>.md` files with the parent file acting as an index. Both are compose-only changes.

## What matched the established skills well

Worth stating so the refinements above are not read as a verdict on the approach:

- Frontmatter is spec-conformant, `metadata` values are strings, `license` is short, `description` names triggers.
- Progressive disclosure is correct: entry under 1,300 tokens, references loaded on demand, tables split out.
- Every rule carries a stable ID, a resolvable `[src]` anchor, and (where applicable) a platform tag. None of the established design skills do this; `web-design-guidelines` fetches its rules live and `frontend-design` cites nothing.
- WCAG conformance level is separate from severity and the entry file explains how to select criteria by target. Reflow, text-spacing, and focus-appearance criteria carry every sub-requirement, exception, and note from the raw HTML.
- Platform-specific overview pages are tagged `_[tvOS only]_` and the reference header carries a scope banner.
- Zero broken file links across 182 reference files.

## Suggested order of work

1. Finding 1 (build discipline, sentence-level coverage). Small, and it makes every later fix verifiable.
2. Findings 2 and 3 (term extraction). Extractor change plus fixtures, then re-extract and recompose.
3. Finding 4 (source order). Compose-only.
4. Findings 5, 7, 8 (value badge, rationale label, rendering nits). Compose and manifest changes.
5. Finding 6 (entry file routing and inline index). Manifest and compose.
6. Findings 9 and 10 (severity edge cases, TOCs). Independent; can be done at any time.

Items 1 through 4 are enough to make the shipped references match the source in content, attribution, and order. Items 5 through 10 close the gap with the hand-written skills on how easy the output is to use.
