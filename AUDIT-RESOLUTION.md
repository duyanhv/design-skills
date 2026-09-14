# Audit resolution

Responses to [AUDIT.md](AUDIT.md). Every finding is addressed, with the check that now fails if it
regresses. Verification below is from this working tree at the time of writing.

```
bun run check      typecheck · 29 tests, 191 assertions · e2e build · 18 validate guards fire · 3 manifests valid
bun run validate   apple-hig 0 errors 0 warnings · wcag22 0/0 · lumen-ds 0/0
bun run eval       apple-hig 13/13 · wcag22 10/10 · lumen-ds 9/9
bun run trace      7/7 requirements verified against the shipped ir/ and skills/
bun run agenteval  3 review tasks × 2 arms × 3 samples = 18 runs (summary below)
```

`bun run trace` is the traceability check: every finding below maps to an assertion over the
**shipped artifacts**, not over the source code and not over a value observed while the work was in
progress. "I fixed it" and "the output is correct" are different claims, and only the second matters
to someone using the skill. Each assertion was confirmed to fail when the thing it guards is broken.

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

Testing this end to end rather than by inspection found a real gap. A partial build was recorded in
`ir/<id>/meta.json` and `provenance.json`, but **`SKILL.md` said nothing** — so an agent reading the
skill would treat "not in this rulebook" as "not required by the guideline", which is precisely
backwards for an incomplete crawl. A partial build now carries `partial: "true"` in its frontmatter
and a warning above the fold telling the reader to treat absence as unknown. The e2e run asserts the
whole path: normalize refuses a partial manifest, `--allow-partial` proceeds, and the warning reaches
the frontmatter, the body, and `provenance.json`.

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

Every one of these guards is now *observed* firing rather than asserted by reading the code.
`bun run validate:negative` copies a real build into a scratch tree, introduces one defect at a time
(18 of them: a scoped rule with no platforms, a provenance hash that disagrees with its page, a
metadata number, a broken reference link, a non-redistributable output left un-ignored, …) and
asserts validate reports that specific error. It runs in CI. Writing it caught that the first version
of the harness was reading the wrong directory and reporting "no IR pages" for every case — a false
pass that looked exactly like a real one.

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

**Agent usefulness.** `bun run agenteval` runs the same review task in two arms — no skill, and the
compiled skill mounted at `.claude/skills` — over files seeded with real violations, decoys (code
that pattern-matches to a violation but the guideline explicitly permits), and scope traps (guidance
belonging to another platform). Three samples per arm, because a single run of a stochastic model is
an anecdote:

| Task | Arm | Violations found | False positives | Decoys dismissed | Scope errors | Citations |
| --- | --- | --- | --- | --- | --- | --- |
| iOS buttons | no skill | 3-4 / 4 | 0-1 | 0-1 / 2 | 0 | **0, 0, 0** |
| iOS buttons | **skill** | **4, 4, 4** / 4 | **0** | **2/2 every run** | 0 | **37-40** |
| WCAG form | no skill | 5-6 / 6 | 0 | 3/3 | 0 | **0, 0, 0** |
| WCAG form | **skill** | 5-6 / 6 | 0 | 3/3 | 0 | **11-14** |
| watchOS scope | no skill | 3-4 / 4 | 0 | 1-2 / 2 | 0 | **0, 0, 0** |
| watchOS scope | **skill** | **4, 4, 4** / 4 | 0 | 1-2 / 2 | 0 | **35-40** |

What this does and does not show:

- **Citations are the unambiguous result.** Every no-skill run across all three tasks produced zero
  verifiable citations; every skill run produced 11-40. A reviewer can check a skill-armed finding
  against the source and cannot check an unaided one. That is the property the whole compiler exists
  to deliver, and it is categorical rather than marginal.
- **Recall is near-saturated either way**, as expected: a strong model finds an obviously undersized
  tap target without help. The skill arm was consistent (4/4 on every iOS and watchOS run) where the
  unaided arm varied (3-4), but three samples cannot distinguish that from noise.
- **Precision differences are real but small at this sample size.** The unaided arm produced a false
  positive in one run of nine and missed decoy dismissals more often; the skill arm's only recurring
  gap was a decoy it simply did not mention. An earlier single-sample run showed a much larger
  precision gap; three samples shrank it, which is the honest reason to report ranges.
- **Scope errors are 0 everywhere**, including in the watchOS task built specifically to provoke them.
  The metric is live — an earlier draft of that task did fire it — so 0 is a measurement, not a
  vacuous pass.

The qualitative difference is the most informative part. In the unaided arm the agent invented a rule
Apple in fact *requires* ("remove the trailing ellipsis") and demanded a press state on a static
`Text` label. In the skill arm it flagged neither and said why: the ellipsis rule is tagged *macOS
only*, and the press-state MUST is scoped to *custom buttons*. Both conclusions are only reachable
because platform scope and rule exceptions survive into the reference files.

Three scoring bugs were found and fixed while building this, all in the harness rather than the
compiler, and each made the earlier numbers look better than they were:

1. A scope trap asserted 44x44 pt was iOS-only. The skill arm quoted Apple's control-size table back:
   watchOS is also 44x44 pt. The agent was right and my eval was wrong.
2. The "considered and dismissed" split matched a list of literal headings, so "Correct as annotated"
   was scored as an assertion — penalising exactly the behaviour the skill should produce.
3. Cues matched anywhere in the document, so a preamble listing every colour checked could satisfy a
   decoy that the transcript went on to dismiss correctly. Cues must now co-occur within one finding.

`src/agenteval/score.ts` is unit-tested (8 tests) precisely because it decides every number above.
`--rescore` re-scores saved transcripts so a scoring fix does not require paying for new runs.
Scoring remains keyword-based: evidence about a direction, not a benchmark.

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
- **Agent evaluation breadth** is three tasks, one model, three samples per arm (18 runs). That is
  enough to show the citation result is categorical and to stop me over-claiming on precision; it is
  not enough to put a confidence interval on anything. All three tasks are *review* tasks — an
  implement-a-screen task would test a different and arguably more important behaviour.
- **Scoring is keyword-based.** Three bugs in it were found by inspection, not by the harness. It is
  unit-tested now, but a cue that silently stops matching would still look like a clean result.
