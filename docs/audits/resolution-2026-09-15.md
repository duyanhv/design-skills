# Generated design skills: audit resolution

Date: 2026-09-15
Audited revision: `fa7dca949be40652bad7ee997d91a1925d564623`
Resolved revision: `f87b0ae`
Status: **All seven findings resolved with guards.**

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

### A6 · Retrieval cost · resolved

`bun run budget` replaces the audit's estimates with measurements, and two of them were wrong:

| | Audited estimate | Measured |
| --- | --- | --- |
| Worst routing row | ~28,133 tok (iOS screen review) | ~40,901 tok (payments/Wallet/Apple Pay), a row the audit never named |
| iOS screen-review row | ~28,133 tok | ~40,297 tok |

Apple: entry ~4,541 tok, index ~3,774, 158 pages ~550,910 total, median 2,485, p90 7,356.

The actionable finding was navigational, not size-related. 100% of Apple rules sit under a rendered
anchor, but only 28.7% were in a Contents list, because compose added one to 22 of 164 pages on a
length test.

The threshold is now set from the measurement, using the comparison that matters to a reader, who
reads one page and not the corpus: header plus contents list plus the largest single section,
against reading the file whole. Across all 145 pages with three or more sections, in both sources,
the list wins every time — median saving 1,869 tokens on Apple, 472 on WCAG, and the worst case
still saves 26. So three sections is the whole test. Rules reachable from a page's own contents list
go from **28.7% to 94.1%** on Apple and **13.8% to 45.7%** on WCAG, and nothing was removed to get
there.

Corpus-wide cost was the wrong lens and is recorded here to say why: adding 110 lists costs ~7,257
tokens across a 552,840-token corpus, which sounds like a cost and is actually a saving, because no
reader reads the corpus.

The remaining numeric budgets — entry ≤5k, page ≤15k, routing row ≤25k, narrow decision ≤12k — are
reported by `budget`, which never fails a build. Those stay advisory: the audit asked for a budget
derived from the numbers, not for a size limit that would force dropping source material.

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

**Prose is now counted from the raw corpus too.** `fidelity` and `coverage` both start from the
*normalized* markdown, so anything dropped on the way out of the raw DocC JSON moved the loss and
the baseline together — which is precisely where A1's media loss hid.
`src/e2e/probes/prose-coverage.ts` does for prose what the A1 check does for figures: every text node
in the raw JSON, split into sentences, must reach the shipped reference or carry an enumerated
reason. **12,531 of 12,807 reach it**; of the 279 excused, 276 are Change log and other declared
`skip_sections` and 3 are on pages that produce no reference at all.

The same count now covers WCAG, whose raw form is HTML: **839 of 839 sentences reach the shipped
references, with no exclusions at all**. That check needed two corrections before it was worth
trusting, both of which would have made it lie: counting the document's whole text concatenates
across element boundaries and manufactures sentences the source never wrote, and comparing raw text
against markdown reports every formatted sentence as lost. It also found a real defect — `SUP` was
missing from the normalizer's inline-tag list, so W3C's `M<sup>lle</sup>` shipped as "M lle ", a
spelling the source never used and one every existing check accepted because the fragments were all
present.

Writing the Apple check removed the last excuse category it started with. A "figure caption"
exemption was covering a real loss: a captioned figure above the first heading was dropped as decorative
page-header art, so 12 captions that the source wrote as explanations — "The Digital Crown on Apple
Vision Pro", "A confirmation snippet requires additional input to proceed." — existed nowhere in the
output. Plain header art is still dropped, so the fix keeps 12 and discards 174. The media probe
agrees independently: rendered occurrences rose 1,322 → 1,334 as header-art exclusions fell 186 →
174.

## Agent evaluation

The audit's A4/A5 acceptance was met with executed fixtures, which test what the skill *instructs*.
`bun run agenteval` was then run for real, to test what an agent does with it. It is outside
`bun run check` and costs model calls. All 18 samples below are fresh runs against the final
artifacts, 3 per task per arm, 0 failures, 18 distinct transcripts.

| Task | Arm | Recall | False positives | Citations | Unresolvable |
| --- | --- | --- | --- | --- | --- |
| ios-buttons | no skill | 3–4/4 | 0 | 0 | 0 |
| ios-buttons | skill | 4/4 | 0 | 32–39 | 0 |
| wcag-form | no skill | 6/6 | 0 | 11–16 | 0 |
| wcag-form | skill | 6/6 | 0 | 23–40 | 0 |
| watchos-scope | no skill | 4/4 | 0 | 0 | 0 |
| watchos-scope | skill | 4/4 | 0 | 24–38 | 0 |

Totalled across the nine samples in each arm: **40 → 42** violations found, **0 → 0** false
positives, **16 → 17** decoys explicitly dismissed, **40 → 286** citations. Three samples per arm is
small and most ranges overlap, so the defensible reading is narrow: the skill arm is consistently at
full recall and always cites resolvable rules, while the unaided arm reaches full recall only
sometimes and cites nothing at all on the two Apple tasks. No scope errors appeared in any arm.

**Zero unresolvable citations**, down from 13 in one sample and three-of-three runs on another.

Running this evaluation exposed four defects, none of them visible to the fixtures, and two of them
in the measurement rather than the artifact:

- **A term printed no rule id.** Every entry file tells the reader to quote the id, but `termLine`
  emitted only a `src` link, so a term was uncitable on the skill's own terms. An agent quoting
  `apple-hig/accessibility/012` ("Transcripts") — which it had genuinely read — was scored as
  fabricating it, in three of three runs.
- **A refused launch cost a sample.** Two of three runs exited non-zero within milliseconds having
  written nothing to either stream, and the batch reported n=1. Only an instant, entirely silent
  failure is retried now.
- **Replayed transcripts printed as fresh.** `--rescore` keeps the transcript it scored, so a
  replayed row describes the skill as it *was*. Twelve of eighteen samples were replays of a pre-fix
  skill and were nearly quoted as current; the summary now names the stale task/arm pairs.
- **The scorer under-counted correct dismissals.** An interim run appeared to show the skill
  dismissing *fewer* decoys (13 vs 18), which would have been the opposite of what the A5 workflow
  asks for. Investigating found two measurement faults, not a regression: the dismissal vocabulary
  had no word for asserting or failing, so a section headed "Three comments in the file assert
  failures that do not hold" never split; and one decoy required the reviewer to echo Apple's verb
  "span", scoring a correct dismissal as none. With both fixed and every sample re-run, the
  direction reverses to 17 vs 16. **Roughly half the apparent gap was scorer error and the rest was
  sampling noise** — a reminder that a result which flatters or damns the work needs the same
  scrutiny either way.

## Evidence

Every number below was observed, not projected.

### Requirement to check

Every finding maps to named checks over the shipped artifacts, and every one of those has at least
one negative probe that was watched failing. Run `bun run trace` and `bun run trace:negative` to
reproduce the right-hand columns.

| Finding | Checks | Negative probes |
| --- | --- | --- |
| A1 media | 5 | 9 |
| A2 normative/informative | 5 | 5 |
| A3 dependencies | 5 | 5 |
| A4 authority | 2 | 3 |
| A5 workflow | 2 | 4 |
| A7 raw-corpus coverage | 2 | 4 |
| A7 structure (S-1/S-2/S-3) | 3 | 9 |

A6 is excluded deliberately: `bun run budget` reports numbers and never fails a build, so it has no
pass/fail assertion to probe. Its outcome is the threshold change, which is asserted by the
contents-list figures above.

Twelve older findings (numbered `1`–`8` and some `O-n`) still have checks without negative probes.
They predate this work and are recorded here rather than claimed as guarded.

| Check | Before | After |
| --- | --- | --- |
| `bun run check` | passing | passing |
| Unit tests | 51 | 71 |
| Trace requirements | 19 | 43 |
| Trace negative probes | 22 | 61 |
| Validate guards | 20 | 22 |
| Apple media occurrences rendered | 0 block videos, 0 captions | 1,334/1,536, 202 enumerated |
| Apple prose sentences reaching the shipped text | not measured | 12,531/12,807, 279 enumerated |
| WCAG sentences reaching the shipped text from raw HTML | not measured | 839/839, no exclusions |
| WCAG sentences retained | 625 | 760 |
| Apple sentences retained | 10,883 | 10,883 |
| Apple rules reachable from their page's contents list | 28.7% | 94.1% |
| WCAG rules reachable from their page's contents list | 13.8% | 45.7% |
| Apple evals | 13/13 | 13/13 |
| WCAG evals | 10/10 | 17/17 |

Rebuilding from scratch stays byte-identical apart from timestamps; verified by deleting `ir/` and
rebuilding twice. The synthetic example was regenerated for `bold-lead@10` and `note_authority`, and
its only non-metadata diff is the new empty array per rule.

## Standing rule observed

Every guard added here was watched failing on the defect it claims to guard, then passing once
restored. That is what turned up the extractor bugs and the missing `lumen-ds` fixture in the
negative trace tree.

It also produced the one case where the rule was applied against itself. When the two `flushTable`
fixes landed, reverting the heading-branch line alone left all five media checks green, because the
content-based splice repaired the same symptom for figures. That fix was therefore recorded here as
correct but *not independently proven*, rather than being claimed as guarded. Prose coverage later
made it observable — the block that defect deletes on `widgets` is a sentence, not a figure — so it
now has a probe of its own and the earlier disclaimer is withdrawn. The rule works in both
directions: it refuses credit for an unproven fix, and it notices when a fix becomes provable.

## Still open

- Nothing verifies the *crawl*. Raw-corpus counting now covers Apple's media and prose and all of
  WCAG, so everything fetched is accounted for; whether the fetch itself got everything w3.org and
  developer.apple.com publish is unchecked, and a page missed upstream would look identical to a
  page that does not exist.
- The numeric budgets `bun run budget` reports (entry ≤5k, page ≤15k, routing row ≤25k) are
  advisory and do not fail a build. Making them binding would mean dropping source material to meet
  a number, which is the wrong trade for this project.
- WCAG extraction remains pinned to a repository commit while citations point at the published
  Recommendation. The audit's uncertainty about edition equivalence is unchanged.
- The agent evaluation is 3 samples per arm and is not a significance claim. Most ranges overlap;
  what does not overlap is citation behaviour, which is also the thing the skill most directly
  causes.
- A5's checks assert that the authored workflow's sentences are present and marked as authored.
  That is text presence, not behaviour. A4's check is stronger: it derives what the entry file
  permits and tests a real prohibition independently of the severity classifier.
- Twelve older findings (`1`–`8` and some `O-n`) have checks but no negative probe. They predate
  this work; a check that has never been seen to fail is still a guess, whoever wrote it.
