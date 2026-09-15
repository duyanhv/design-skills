# Generated design skills: audit resolution

Date: 2026-09-15
Audited revision: `fa7dca949be40652bad7ee997d91a1925d564623`
Resolved revision: `f87b0ae`
Status: **A1, A2, A3, A4, A5, A7 resolved with guards. A6 measured; the budget decision is open.**

Companion to [generated-output-2026-09-15.md](generated-output-2026-09-15.md), which states the
findings. This records what changed, what proves it, and what is still a judgement call rather than
a defect.

## What the findings turned out to be

Two of the seven were worse than the audit could see from the outside, and the difference matters
more than the fixes.

A1 reported that block media rendered as nothing. Rendering them recovered the 61 videos and 428
captions, and then the whole-corpus coverage check — which counts every occurrence in the raw JSON
rather than the ones someone thought to look for — refused to balance. Twelve occurrences were
missing for an unrelated reason, in `src/extract/rules.ts`, in a code path the audit never
implicated. `flushTable` removes the context copy of a table's lead-in line, because that line is
already on the page as the table's caption. It removed the *last block pushed* rather than the
caption line itself, and `lastProse` skips figure placeholders while `lastContext` does not. When a
figure sat between the lead-in and the table, the two disagreed and the figure was deleted instead,
leaving the duplicated prose behind. A separate defect in the same function let a stale pointer
survive a heading, so a table could delete a figure from a section three headings earlier.

Both had been shipping silently. They removed illustrations from sections that exist to describe
what the picture shows: Wallet's logo and thumbnail callouts, Game Center's achievement and
leaderboard diagrams, tvOS top-shelf aspect-ratio diagrams, AirPlay's custom-colour icon. Neither is
figure-specific, so ordinary prose was exposed to the same mechanism. Fidelity, evals, validate and
19/19 trace checks all passed throughout.

The audit's own conclusion is what this vindicates: passing checks do not establish fidelity. A
check counting what the corpus contains found in minutes what checks counting what the output
contains could not find at all.

## Findings

### A1 · Apple media · resolved

Block images and videos now render a marker naming the medium, the source alternative description,
and a locator. Each occurrence's own caption ships beside its media, labelled apart from the
descriptive alternative, because a caption frequently carries an instruction the alt text does not.
The audit's `privacy.json` example — 227 characters of extra restriction on withholding
functionality while requesting tracking permission — now ships under its own tab.

The audit's reproduction command, which returned an empty string, now returns the full 350-character
description of `text-entry-pointer.mp4`.

**1,322 of 1,536 occurrences render.** The remaining 214 are enumerated, not assumed: 186 page-header
artwork and 28 table checkmark cells. There is no "known defect" allowance; the two extractor bugs
were fixed rather than excused.

Guards: 5 checks in `src/e2e/probes/apple-media.ts`, including whole-corpus coverage, attachment to
the correct section, and a multi-tab example where four tabs share one asset and keep separate
captions.

### A2 · WCAG notes · resolved

The blanket instruction that every criterion's exceptions *and* notes are part of the requirement is
gone. Authority is now read from the markup W3C chose, never guessed from prose: `p.note` and
`aside.example` are the constructs W3C classifies as informative. `aside.example` had been falling
through to a default branch and arriving as ordinary normative-looking prose.

The split is represented at every layer: normalize marks it, extract records it positionally in
`note_authority`, compose renders `_[informative]_` ahead of the verbatim text, and the entry file
explains what may and may not be failed on. Exceptions stay deliberately unmarked, because
relabelling them advisory is the same bug facing the other way.

Acceptance is executed rather than asserted. A reviewer built from the shipped text judges seven
fixtures in `test/fixtures/wcag-review-cases.html`. Before the fix it returned a false failure on
2.5.3 for label ordering; demoting 2.5.8's Spacing exception to advice produces two wrong verdicts in
the opposite direction. Both states are probed.

### A3 · WCAG dependencies · resolved

`strip()` flattened `[label](url)` to bare text, so 1.3.5 referred to a set of input purposes that
was unreachable. Links now survive extraction: 27 retained across 8 pages.

Input Purposes and the whole Conformance chapter are bundled from the same pinned revision
`13c6f9e6`. The chapter is bundled whole because cc2 links the Statement of Partial Conformance, and
shipping half of it recreates the dangling reference one level down. Neither page is forced through
the success-criterion shape; an appendix becomes prose sections with citable anchors, rather than the
compiler restating the source in a shape the source never used.

Licence posture is unchanged and checked: wcag22 is declared non-redistributable, both new pages
carry attribution, and a probe asserts nothing derived is tracked by git.

Review versus conformance is documented proportionately. An ordinary component review stays scoped
to the user's task; a *claim* of conformance requires cc1–cc5 or an explicit statement of the
review's limits. A probe asserts the scoping clause too, so a later edit cannot satisfy the audit by
making every button review demand a full site audit.

### A4 · Authority · resolved

`skill.authority` is a per-source property, derived from the source's own data when a manifest is
silent: a source whose rules carry a conformance level declares its normative status, everything
else is classified from wording. No source id is hardcoded.

Apple's entry no longer instructs enforcement of inferred badges. It ranks wording strength and
requires quoting the source's own prohibition before alleging a requirement violation. WCAG keeps
enforceable badges, because a success criterion genuinely is normative text. The generic sentence
"Severity is inferred from that wording" — false for WCAG, since severity there comes from the
level — is no longer printed for it.

The guard is application-level, not another regex over the classifier's vocabulary: two real shipped
Apple rules that both carry MUST are run through the permissions the entry file grants, and the
recommendation must not come out as a requirement violation while the explicit prohibition must.

### A5 · Workflow · resolved

A `## Working method` section, marked *"Written for this skill, not by <source>"*, covers context
before deciding, implementation followed by state inspection, review against scope and exceptions,
and marking runtime-only checks unverified. Cost: +1,565 characters, roughly 390 tokens.

Both acceptance fixtures are covered: a small glyph inside a large hit region, and behaviour
inherited from a framework component. No landing-page recipe, font-count rule or mandatory motion
was added, per the audit's warning against importing a web-design aesthetic into platform guidance.

### A6 · Retrieval cost · measured, decision open

`bun run budget` replaces the audit's estimates with measurements, and two of them were wrong:

| | Audited estimate | Measured |
| --- | --- | --- |
| Worst routing row | ~28,133 tok (iOS screen review) | ~40,901 tok (payments/Wallet/Apple Pay), a row the audit never named |
| iOS screen-review row | ~28,133 tok | ~40,297 tok |

Apple: entry ~4,541 tok, index ~3,774, 158 pages ~550,910 total, median 2,485, p90 7,356.

The actionable finding is navigational, not size-related: **100% of Apple rules sit under a rendered
anchor, but only 28.7% are in a Contents list**, because compose adds one to just 20 of 158 pages.
Lowering that threshold improves retrieval without removing anything.

This is left open deliberately. The audit asked for the budget to be *set from* the numbers, and the
numbers now exist; choosing thresholds is a judgement call, and `budget` never fails a build.
Recommended starting point: entry ≤5k, page ≤15k, routing row ≤25k, narrow decision ≤12k.

### A7 · Verification · resolved

`fidelity.ts` claimed to detect misattributed sentences. That claim is now disproved rather than
argued: moving a rendered note to the rule above leaves fidelity reporting all 10,883 sentences
present. Its comment and output now say what it measures — page-wide sentence presence — and
`src/e2e/probes/structure.ts` adds what makes the claim true of something: S-1 ownership, S-2 order,
S-3 required pages, tables and link dependencies, as three separate metrics, each printing its own
partiality rather than a single reassuring number.

The agent scorer resolves citations against the built skill, so a fabricated but well-formed rule id
is reported as naming nothing rather than credited as evidence. The README's "preliminary"
qualification stays.

## Evidence

Every number below was observed, not projected.

| Check | Before | After |
| --- | --- | --- |
| `bun run check` | passing | passing |
| Unit tests | 51 | 64 |
| Trace requirements | 19 | 41 |
| Trace negative probes | 22 | 57 |
| Validate guards | 20 | 21 |
| Apple media occurrences rendered | 0 block videos, 0 captions | 1,322/1,536, 214 enumerated |
| WCAG sentences retained | 625 | 760 |
| Apple sentences retained | 10,883 | 10,883 |
| Apple evals | 13/13 | 13/13 |
| WCAG evals | 10/10 | 17/17 |

Rebuilding from scratch stays byte-identical apart from timestamps; verified by deleting `ir/` and
rebuilding twice. The synthetic example was regenerated for `bold-lead@10` and `note_authority`, and
its only non-metadata diff is the new empty array per rule.

## Standing rule observed

Every guard added here was watched failing on the defect it claims to guard, then passing once
restored. That is what turned up the two extractor bugs, the missing `lumen-ds` fixture in the
negative trace tree, and the fact that one of the two `flushTable` fixes is not independently
observable: reverting the heading-branch line alone leaves all five media checks green, because the
content-based splice repairs the same symptom. It is retained as correct, and recorded here as not
independently proven, rather than being claimed as guarded.

## Still open

- **A6's budget thresholds** and the Contents-list threshold change. Measured, not decided.
- Verification is now broader, not complete. S-1 to S-3 establish that what IR holds is reachable and
  correctly attached; they do not establish that IR holds everything the upstream source states.
- WCAG extraction remains pinned to a repository commit while citations point at the published
  Recommendation. The audit's uncertainty about edition equivalence is unchanged.
- README links to audit documents removed in earlier history still need a documentation decision.
