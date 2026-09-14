# Audit resolution

Responses to [AUDIT.md](AUDIT.md). Every finding is addressed, with the check that now fails if it
regresses. Verification below is from this working tree at the time of writing.

```
bun run check     typecheck · 21 tests, 137 assertions · e2e build · 3 manifests valid
bun run validate  apple-hig 0 errors 0 warnings · wcag22 0/0 · lumen-ds 0/0
bun run eval      apple-hig 13/13 · wcag22 10/10 · lumen-ds 9/9
bun run agenteval 2 review tasks × 2 arms (summary below)
```

## Findings

### 1 · P1 — WCAG normalization drops normative list and definition text → fixed

`blocks()` now renders inline runs and block children in document order, so a `li`/`dd` written
without `<p>` keeps its text. Exceptions and notes are no longer flattened into one rationale string:
each becomes its own entry in the rule's `notes[]`, rendered under the statement.

Verified on the rebuilt artifacts: 1.4.12 Text Spacing carries all four values, 1.4.10 Reflow carries
both dimensions, 1.4.13 carries the full Dismissible/Hoverable/Persistent definitions.

Guarded by `test/wcag.test.ts` (a fixture with direct-text `li`, mixed inline content, and a `dd`
mixing a bare sentence with a nested paragraph) and by four `rule:` evals that assert the exception
text is attached to its criterion.

### 2 · P1 — Apple extraction omits context needed to apply rules → fixed

Prose that is not a rule is no longer discarded. It is routed to where it belongs:

- paragraphs before the first heading → page `overview` (what the component is, when to use it)
- prose before a section's first rule → that section's `intro`
- prose, bullets and asides after a rule → that rule's `notes[]`, rendered indented beneath it

Images became the other half of this: `inlineToText` emitted `""` for every image, so a figure
vanished without trace. They now render as `_[figure: <alt>]_` using DocC's own alt text, so a
visual dependency is visible rather than absent. Image-only table cells render `✓` instead of blank.
Two related DocC bugs surfaced and were fixed: a link's `overridingTitle` was ignored (so "avoid
displaying **motion**" rendered as "avoid displaying **visionOS**"), and tab panels filed their
content under the previous tab's heading.

Concretely, on the Buttons page the visionOS hover-effect note, the material-selection bullets, and
the role definitions are all present now; the role definitions render beside the rule that uses them
rather than in a trailing "Terms" bucket. Across the HIG this attached 1,023 rule notes and 667 section
intros that were previously dropped.

Guarded by `test/normalize.test.ts`, `test/extract.test.ts`, and evals that assert the note text is
in the rule's own context (not merely somewhere on the page).

### 3 · P1 — Platform-specific pages become universal guidance → fixed

Every rule now carries a `scope`:

| scope | meaning |
| --- | --- |
| `section` | a platform-named heading scoped it |
| `page` | the whole page is about that platform |
| `general` | the source states it without platform scope |

Only `general` means universal. The scope comes from the source rather than a heuristic: Apple
declares each page's platforms in DocC `customMetadata["supported-platforms"]`, which covers 149 of
173 pages; `page_platforms` in the manifest is available as an override. `validate` errors on any
rule whose scope and platform list contradict each other, and on any `general` rule sitting on a
platform-scoped page.

Before: 81 unscoped rules on the six `designing-for-*` pages, and Siri Remote guidance in the
highlights with no tag. After: 0 unscoped rules on any platform-scoped page, 90 pages carrying an
explicit scope, and 980 rules newly tagged. tvOS guidance renders `_[tvOS only]_`.

### 4 · P1 — Inferred severity changes the source's authority → fixed

`only` now counts only when it governs a clause ("Display only one sheet", "Use a sheet only when…")
and not inside a compound adjective ("an icon-only button", "keyboard-only work styles"). Hedged
wording ("In general, avoid…", "Prefer…") caps at SHOULD rather than asserting an absolute. The audit's
two named cases both behave correctly now, and the file states plainly that severity reports the
source's wording rather than conferring authority.

WCAG no longer maps A/AA to MUST and AAA to MAY. `conformance_level` is its own field, every
criterion is normative text, and the skill instructs the agent to establish the conformance target
first and select criteria from it, citing
[the conformance requirements](https://www.w3.org/TR/WCAG22/#conformance-reqs).

Guarded by severity unit tests and by evals on both the macOS keyboard-only case and an AAA criterion.

### 5 · P1 — Refreshes can silently retain removed pages or accept incomplete crawls → fixed

Normalize and extract now reconcile: a page absent from the current build is removed rather than
left to be picked up by the next stage. Because "absent" and "not visited" are different things, a
crawl records completeness. DocC and WCAG fetch failures are collected into `manifest.failed` and set
`manifest.partial`; normalize refuses a partial manifest unless `--allow-partial` is passed, and no
stage reconciles against one. `--limit` marks the build partial for the same reason.

The end-to-end run asserts both halves: removing a page drops its IR (`removed === 1`), and a partial
run over the same state removes nothing.

### 6 · P2 — Extraction cache omits configuration and metadata dependencies → fixed

Reuse is keyed on an `input_hash` over every semantic input: page body, extractor id, title,
category, URL, source platforms, `skip_sections`, and the page's platform scope. The audit's
reproduction is now an assertion in the end-to-end run: rerunning reuses all pages, and adding a
section to `skip_sections` re-extracts all of them.

### 7 · P2 — Provenance and reproducibility stop short of the delivered skill → fixed

Reference files render each rule's id, so the workflow's instruction to quote one is now possible.
Each skill ships a `provenance.json` with the source, license, version, revision, extractor, partial
flag, and per-page hash/URL/fetch date, so a copied skill directory can still answer what it was
built from.

The WCAG crawl resolves `main` to a commit SHA once and reads every file from that SHA, so a build
cannot mix revisions; the SHA lands in the manifest, the IR meta, and the skill's frontmatter.

On reproducibility: `extracted_at` is preserved when the inputs hash the same, and `updated_at` is
derived from the pages rather than the clock. A `--force` rebuild over unchanged input is now
byte-identical, verified by diffing two runs a second apart.

### 8 · P2 — Skill validation accepts output that violates the advertised format → fixed

Validation parses the frontmatter as YAML and checks it against a schema derived from the
[Agent Skills specification](https://agentskills.io/specification), so `rules: 2346` as a bare number
now fails; the composer quotes every metadata value. It also estimates the token budget, requires
`provenance.json`, checks `index.md` linkage, and errors on a reference file with no IR page.

On size: the entry file was ~4,800 estimated tokens, 15 KB of which was a 158-row index. Past
`split_index_over` the index moves to `index.md` and SKILL.md keeps the decision workflow, the
routing table, and a per-category map — 4,805 bytes, ~1,200 tokens, a 4× reduction with the full
table one link away.

The "How to use" section is now the decision workflow the audit asked for: establish the target
platform, route to the topic, read the whole rule including its exceptions, apply, report evidence.

### 9 · P2 — Evaluations do not establish semantic fidelity or agent usefulness → fixed, both halves

**Semantic fidelity.** An eval now locates one rule by a fragment of its statement, requires that
match to be unique, and asserts what an agent acts on: severity, platform scope, conformance level,
the exception text that must travel with that rule, the citation anchor, and what the rendered line
shows. `expect:` substrings remain as page-level smoke checks.

Each eval was verified by reintroducing the original bug and confirming it fails:

| Regression reintroduced | Result |
| --- | --- |
| discard non-rule context | 2 evals fail (visionOS hover note, material bullets) |
| drop declared page platforms | scope eval fails: `scope is "general", expected "page"` |
| restore the bare-`only` heuristic | severity eval fails: `severity is "must", expected "should"` |

**Agent usefulness.** `bun run agenteval` runs the same review task twice, once with no skill and
once with the compiled skill mounted at `.claude/skills`. Each task seeds real violations, decoys
(code that pattern-matches to a violation but is explicitly permitted), and scope traps.

| Task | Arm | Violations found | False positives | Decoys correctly dismissed | Scope errors | Citations |
| --- | --- | --- | --- | --- | --- | --- |
| iOS buttons | no skill | 4/4 | 2 | 0/2 | 0 | 3 |
| iOS buttons | **skill** | 4/4 | **0** | **2/2** | 0 | **38** |
| WCAG form | no skill | 6/6 | 0 | 2/3 | 0 | 0 |
| WCAG form | **skill** | 6/6 | **0** | **3/3** | 0 | **10** |

Recall was already saturated on these tasks — a strong model finds obvious violations without help.
The difference is in the qualities the audit cared about. Without the skill the agent invented a
rule ("remove the trailing ellipsis") that Apple in fact requires, and demanded a press state on a
static `Text` label. With the skill it flagged neither, and said why: the ellipsis rule is *macOS
only*, and the press-state MUST is scoped to *custom buttons*. Both are conclusions the platform-scope
and exception-preservation work made reachable. Citations went from 3 to 38 and 0 to 10, so every
finding can be checked against the source.

An earlier run scored the skill arm with false positives; inspection showed the agent had listed
those items under "deliberately not flagged" and the scorer was counting a dismissal as an assertion.
The scorer now separates the two, and `--rescore` re-scores saved transcripts so scoring can be
corrected without paying for new runs. Scoring remains keyword-based: evidence about a direction, not
a benchmark.

### 10 · P2 — Contributor checks and publication safeguards are incomplete → fixed

A `ci` workflow runs on pull requests and pushes: typecheck, unit tests, the synthetic end-to-end
build, a drift check on the committed example, and manifest validation. The refresh workflow now runs
`bun run check` before building, and its PR body summarises rules/pages/version/revision per source
and marks partial builds — the only signal a reviewer gets for sources that produce no diff.

The license gate asks git rather than grepping `.gitignore`: `git check-ignore` for effective ignore
behaviour (so a later negation cannot defeat it) and `git ls-files` for paths that are already
tracked. `src/e2e/manifests.ts` applies the same gate to manifests before any build runs.

## Product assessment

**One trustworthy skill before expanding sources.** No new guideline sources were added. The only new
manifest is `lumen-ds`, a synthetic MIT-licensed guideline that exists to give CI a network-free
end-to-end build and to give readers a committed example skill they can inspect without building
Apple's or W3C's content. CI fails if it drifts from what the compiler produces.

**The missing decision workflow** is now the shape of SKILL.md, and the agent evaluation is the
evidence that it changes behaviour.

**Highlights removed.** The audit noted that the "highest-leverage rules" selection ranked partly by
how short the sentence was. Turning it on confirmed it: the top pick for Accessibility was "Support
Switch Control", and it leaked a rule's notes into the entry file. The deeper problem is that no
guideline states which of its rules matter most, so any such ranking is the compiler's opinion
printed in the source's voice — the exact failure mode this project exists to prevent. The feature
is deleted rather than tuned; the routing table sends a reader to the right rulebook without
inventing a hierarchy.

**README claims.** The unsupported swipe at hand-written skill repos is gone, replaced with the
specific, checkable property that motivates this design: a hand-written `SKILL.md` cannot tell you
which version it reflects or show you a diff when the guideline changes.

## Not addressed

- **Figure alt text** is preserved and marked, but nothing verifies that a figure's alt text actually
  carries the information the prose defers to it.
- **Agent evaluation breadth** is two tasks, one model, one run per arm. It shows a direction, not a
  distribution. Worth widening to more tasks, several runs, and an implement-a-screen task before any
  quantitative claim is made from it.
