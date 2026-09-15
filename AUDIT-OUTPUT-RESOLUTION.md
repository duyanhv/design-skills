# Output audit resolution

Responses to [AUDIT-OUTPUT.md](AUDIT-OUTPUT.md), which audited what the compiler produces rather
than the compiler itself. Every finding is addressed, with the check that now fails if it regresses.
Verification below is from this working tree at the time of writing.

```
bun run check      typecheck · 45 tests, 276 assertions · e2e build · 20 validate guards fire · coverage · fidelity · 12 trace probes · 5 manifests valid
bun run validate   apple-hig 0 errors 0 warnings · wcag22 0/0 · lumen-ds 0/0
bun run eval       apple-hig 13/13 · wcag22 10/10 · lumen-ds 9/9
bun run coverage   0 unexplained content losses across 158 Apple pages and 14 WCAG guidelines
bun run fidelity   0 of 10,883 Apple and 0 of 625 WCAG source sentences missing from the shipped references
bun run trace      15/15 requirements verified against the shipped ir/ and skills/
bun run trace:negative  12 reintroduced defects, each caught by the trace check that claims to guard it
```

The headline number is `fidelity`. At the time of the audit, 25 Apple sentences and 3 WCAG text
blocks did not appear verbatim in the shipped references; both are now zero. That check did not
exist when the compiler was written, and adding it is finding 1's real fix: the defects it found
were invisible to `coverage`, `trace` and `validate` alike, because all three read whatever is on
disk and believe it.

Five findings could still silently regress, so each has an assertion in `bun run trace` over the
shipped artifacts (`O-1` … `O-8`).

A trace check that has never been seen to fail is a guess, in exactly the way the project already
says about `validate`: it reads the shipped artifacts, and a passing report is indistinguishable
from a check whose regex stopped matching. Several of these assertions are strings in a Markdown
file, which is the kind that rots quietly. `bun run trace:negative` reintroduces twelve of the
original defects into a scratch copy of the built skills — a stale render, a dropped sentence, a
definition swallowing the paragraph after it, a term named "Consider", a rule with no source
position, the visionOS table moved after its rules, a badge quoting a figure the rule never states,
the two badges the audit named, a dead heading link, an HTML entity, a flattened glossary entry —
and asserts the named check fails on each. All twelve are caught.

## Findings

### 1 · P1 — Shipped Markdown was stale relative to the renderer → fixed

The audit found the Apple references had been rendered before a `termLine` fix and never recomposed,
so the Buttons page was missing a paragraph. Recomposing was the easy half. The real problem was that
nothing could have told: `compose` reads IR and writes Markdown, so a renderer change alters the
output without changing a single input hash.

Two staleness classes existed, and both are now structurally impossible to miss:

- **Renderer.** Every skill records a `compose_fingerprint` in `provenance.json` — a content hash of
  `src/compose/`, not a git revision, because uncommitted edits are exactly the case that went
  unnoticed. `validate` fails on a mismatch. Guard: `references rendered by an older compose` in
  `validate-negative`, and `O-1` in trace.
- **Extractor.** The same hole existed one stage earlier and the audit did not see it: `input_hash`
  keyed reuse on the extractor's *id string*, a constant someone has to remember to bump. Tightening
  the severity heuristic during this work changed what extraction produces while every hash stayed
  identical, and the next run reused IR the new code would never have written. Reuse is now keyed on
  a hash of `src/extract/`.

`src/e2e/fidelity.ts` was promoted from a one-off script to part of `bun run check`. It walks the
same normalized cache as `coverage` but the unit is a sentence and the match is verbatim, so a
sentence that was dropped, truncated, or attached to the wrong item is reported even when its
vocabulary survives elsewhere on the page.

### 2 · P1 — Definition terms swallow the prose that follows them → fixed

`extractRules` kept a term as `openRule`, so every following paragraph, aside and figure joined that
term's notes. An agent quoting "the Destructive role" would have quoted a sentence about primary
buttons.

A definition now closes at its own line. Prose after it goes to the section, at its source position,
so nothing is lost and nothing is misattributed. Term notes that exist legitimately (WCAG 4.1.1
Parsing, glossary enumerations) render as indented sub-bullets rather than joined into one line.
Two further renderer fixes fell out of this: a separator is only inserted when the label genuinely
ends and something new begins (`**Captions** give people…` is a sentence, not a label), and prose
following a definition list gets a blank line before it so Markdown stops reading it as another item.

60 Apple terms, none carrying following prose. Guard: `O-2 / O-3` in trace, plus a `bold-lead`
fixture in `test/extract.test.ts`.

### 3 · P1 — A split bold lead produces a term named "Consider" → fixed

`**Consider** **presenting a Now Playing view…**` yielded a rule with no id, no severity and no
platform tag. Adjacent bold spans at the start of a line with nothing between them are now merged
before `BOLD_LEAD` applies, anchored at the lead so ordinary emphasis later in a paragraph
(`see **Note** and **Tip**`) is untouched. The statement is whole and classifies as MAY.

### 4 · P2 — Section order is not source order → fixed

`referenceDoc` grouped rule sections first, then terms, then tables, then intro-only sections, which
affected 148 of 158 Apple pages: Anatomy rendered after Platform considerations, and the visionOS
size table rendered after the rules that say "the sizes below".

Every extracted block — rule, term, section prose, table — now carries one monotonically increasing
`order` from a single per-page counter, and compose renders by it. Sections are runs of consecutive
blocks rather than buckets, so a heading the source revisits gets its own run instead of pulling the
later text backwards. The orphan headings at the bottom of `buttons.md` are gone because they are no
longer orphans.

`order` is optional in the schema so IR from an older extractor still parses, falling back to array
position. Guard: `O-4` in trace, asserting the visionOS table precedes its rules and the Platform
considerations intro precedes the platform sections.

### 5 · P2 — Extracted `value` is sometimes the wrong number → fixed

`valueOf` took the first unit-bearing number anywhere in `statement + rationale`, which put
`5 minutes` on "Create engaging challenges." and `24 hours` on a rule about chart labels — rendered
in the same position and typography as `at least 44x44 pt`.

`ruleValue` now walks the rule's sentences in order and applies three restrictions:

1. Sentences that illustrate (`for example`, `such as`) are skipped; their numbers are one app's
   choice, not the guideline's requirement.
2. Within a sentence, a figure carrying an explicit bound (`at least 44x44 pt`) outranks a bare
   figure beside it (`— in visionOS, 60x60 pt`).
3. Two figures with equal claim produce no badge: one badge cannot stand for "60 points from the top
   and bottom, and 80 points from the sides".

A range is also captured whole, so "a consistent frame rate of 30 to 60 fps" no longer reads as a
`60 fps` requirement. 53 badges became 31, and all 31 quote a figure their own rule states. The full
text always ships in the rationale, so a suppressed badge loses nothing but the summary. Guard:
`O-5` in trace, which also names the two badges the audit called out.

### 6 · P2 — The entry file routes to 33 of 158 topics → fixed

The routing table grew from 9 rows to 26, covering each platform family (macOS windows and menu bar,
watchOS complications and Always On, tvOS focus and remotes, iPadOS multitasking and Apple Pencil)
and the categories that had no row at all: notifications, widgets, Live Activities, menus, lists and
collections, charts, materials, motion, loading states, games, payments, Siri, right-to-left, and an
accessibility-audit row.

The Index section now names every one of the 158 topics as a compact per-category list of links
rather than counting them by category. A count told the agent how much material existed without
telling it what any of it was about, so every task outside a routing row cost an extra file read.
Rule counts stay in `index.md`, where they answer "how deep is this topic" instead of "which topic
do I want". SKILL.md is ~4.6k tokens, inside the spec's 5k guidance.

The audit's third suggestion — a "Before you start" block of cross-cutting rules — is **not** done.
Choosing which five or six rules hold everywhere is the compiler forming an opinion and printing it
in Apple's voice, which is the thing this project exists to avoid; it is the same reasoning that
deleted the "Highest-leverage rules" ranking in `3c0963f`. The expanded routing table gets an agent
to the right rulebook without inventing a hierarchy.

### 7 · P2 — Rationale label `Why:` mislabels half its contents → fixed

512 of 2,288 rationales began "For example", "Use", "If you" — procedures, examples and conditions,
not reasons. Worse, an exception stated in the sentence after the lead
("The exception is if Tap to Pay on iPhone is the only payment-acceptance method you support") was
presented as the rule's justification.

Apple's manifest sets `rationale_label: Details`, matching what WCAG already did. Step 3 of the
workflow no longer claims the notes hold the exceptions — it names the label from the manifest and
says exceptions and caveats appear in either place, because in this source they genuinely do.

The optional split at "The exception is" is not done: it would be the compiler restructuring the
source's sentence, and mislabelling was the complaint.

### 8 · P3 — Rendering nits → fixed

Every item, plus two the audit did not reach:

- **Double em dash** (16 lines in `sf-symbols.md`): a leading dash is trimmed from the rationale when
  the source already wrote one after the label. 0 remaining.
- **Root-relative links in table cells** (110): table markdown and captions now pass through
  `Linker.localize`. 0 remaining.
- **114 unresolved anchors**: this was the largest one. A source anchor is a bare section id
  (`Help-buttons`) but the rendered heading is the whole path
  (`### Platform considerations › macOS › Help buttons`), so lowercasing the fragment matched
  nothing. The linker now maps each source anchor to the heading its target file actually renders,
  routes an anchor whose only content is a table to the `.tables.md` sibling, and drops the fragment
  rather than shipping it dead when the section produced no output. 254/254 Apple anchors resolve.
  `validate` now checks reference-to-reference heading links, which nothing did before; guard:
  `cross-reference to a heading that does not exist` in `validate-negative`.
- **HTML entities**: decoded in the WCAG normalizer, at the one place raw text enters the pipeline.
  `if RsRGB &lt;= 0.04045` ships as `if RsRGB <= 0.04045`.
- **Glossary flattening**: a glossary entry's first paragraph is the definition; an enumeration that
  ends it stays an indented list, and Notes stay separate blocks.
- **Orphan headings**: resolved by finding 4, not separately.
- **Truncated requirements** (not in the audit): the verbatim-block cap was 1,000 characters and was
  cutting WCAG's "accessibility supported" definition mid-clause, losing two of the four conditions
  that make a technology qualify. A truncated requirement reads exactly like a complete one. The cap
  exists to bound a pathological page, so it now sits well clear of the longest real block.

Guard: `O-8` in trace, which walks all 746 cross-references across both skills and also asserts the
glossary keeps its structure and carries no entities.

### 9 · P3 — Severity heuristic edge cases → fixed

Two patterns where the strong word was not the directive:

- A trailing purpose clause is stripped before testing. "Choose items deliberately to avoid
  overcrowding" is a SHOULD, because the instruction is "choose"; "Avoid overcrowding the screen"
  is still a MUST. This also covers "help ensure", which is hedged by construction.
- A bare modal is permission only when it governs the reader. "You can use a custom control" is a
  MAY; "Recognize that people can have more than one home" is a SHOULD, because the modal belongs to
  the situation the rule describes rather than to the obligation.

453 MUSTs became 440, and 278 MAYs became 243. `finding 4 (completeness)` in trace still reports 0
unjustified MUSTs and 0 downgraded prohibitions, so the authority guarantee is unchanged.

### 10 · P3 — Reference files are large and have no table of contents → partly done

References over 200 lines with three or more sections open with a `## Contents` list of headings and
their rule counts, placed after the summary and before the rules. 12 Apple references now carry one.

Splitting the largest pages into `widgets/<section>.md` is **not** done. It would break every
citation and cross-reference that currently points at `widgets.md`, and the table of contents
addresses the actual complaint — finding a section without reading the file. Worth revisiting if the
references grow further; `widgets.md` is 468 lines.

## What was not done, and why

Three of the audit's suggestions were considered and declined. Each is a case where following the
recommendation would have made the compiler assert something the source does not say:

- **A "Before you start" block of cross-cutting rules** (finding 6). Picking which rules hold
  everywhere is a ranking, and no guideline states one.
- **Splitting the rationale at "The exception is"** (finding 7). Restructuring the source's own
  sentence, when the complaint was that we had mislabelled it.
- **Splitting large references into subdirectories** (finding 10). Breaks every existing citation
  for a problem a table of contents solves.
