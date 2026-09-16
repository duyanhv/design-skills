# What the review got right, missed, and got wrong

The review in [`REVIEW.md`](REVIEW.md) was produced without access to this page. The defect list in
[`planted-defects.md`](planted-defects.md) was written **before** the review and kept outside the
repository while it ran; the reviewing agent was given only the screen, the skill, and the three
screenshots, and was not told that defects had been planted or how many.

This page exists because a demonstration in which the tool finds exactly what its author hid is
evidence about the author, not the tool. For the same reason the scoring below is adjudicated item
by item, including the cases where my own planted list turned out to be wrong.

## Score

| | Count |
| --- | --- |
| Valid planted defects | 14 (one invalidated on audit — see P13) |
| Found | 12 |
| **Wrongly dismissed** | 2 (P2, P13) |
| Missed without comment | 0 |
| Real defects found that were not planted | 4 |
| Findings unsupported by their citation | 0 found |
| Correct patterns wrongly reported as defects | 1 (C2) |
| Correct patterns checked and left alone | 6 |

These totals are lower than the ones first published here. The originals counted P13 as found when
the review explicitly declined to file it, counted the toolbar target among both "left alone" and
"wrongly dismissed", counted a planted item (progress placement) as unplanted, and reported zero
false positives while the review contradicted one of my own "leave alone" items. Each is corrected
below. The review itself is unchanged.

## The two it dismissed

**P2 — the toolbar button's touch target.** The code says `.frame(width: 24, height: 24)`. The
review refused to file it, measured the rendered Liquid Glass container at exactly 44.0 × 44.0 pt
from the screenshot, and listed it first under "what I checked and deliberately left unchanged" as
the screen's most likely false positive.

That is the reasoning the skill asks for, and the conclusion is still wrong. The
[hit-test probe](probe/main.swift) reports the region that actually receives a touch as
**39.5 × 26.5 pt**; a sampled point at the container's corner resolves to `NavigationBarContentView`.
Three measurements of one control disagree, and only one answers the question — see
[`measurements.md`](measurements.md).

The lesson is narrow and worth more than the score: **a screenshot cannot settle a hit-target
question in either direction.** The guide says a small glyph may sit in a large target. The mirror
image, a large visual container whose touch region is smaller, is named in the same paragraph of
[`actions.md`](../../skills/apple-design/references/tasks/actions.md). The review avoided one
direction and walked into the other. It did flag the limit — "measured from screenshots, not tapped
on a device… only device testing settles hit-testing" — and then drew a conclusion before reaching
it.

**P13 — the text field has no bound label.** I planted this as a defect. The review considered it
and explicitly declined: the "Invite" section header supplies a describing label, and Apple's Text
fields page endorses a placeholder as a hint. **On audit the review is right and my planted item was
wrong**, so P13 is removed from the denominator rather than counted against the review. Its keyboard
and content-type configuration is a separate, real defect, and the review filed that as F10.

## Planted defects, item by item

| # | Planted | Outcome |
| --- | --- | --- |
| P1 | Toolbar button unlabelled | found (F4) |
| P2 | Toolbar touch target too small | **wrongly dismissed** |
| P3 | Remove button unlabelled and 20 pt | found (F4, F7); 20.0 × 20.0 pt confirmed by probe |
| P4 | Destructive action has no role, is not a button | found (F1), ranked first |
| P5 | Destructive action has no confirmation | found (F1) |
| P6 | Alert says "Are you sure?" / "OK" | found (F8) |
| P7 | All colours hard-coded | found (F2) |
| P8 | Permission by colour alone | found (F6) |
| P9 | All fonts fixed point sizes | found (F3) |
| P10 | `lineLimit(1)` truncates names | found (F3, F13) |
| P11 | Validation inverted | found (F9) |
| P12 | No keyboard or content type | found (F10) |
| P13 | No bound label on the field | **invalid planted item** — review correct, see above |
| P14 | Double-submit possible; progress shown far from the control | found (F11), both parts |
| P15 | Custom Send has no press state | found (F11) |

## Real defects it found that were not planted

Four, after removing two that the first version of this page counted wrongly.

1. **The "⋯" button silently toggles link sharing** (F5). Written as filler to give the toolbar
   button something to do; the review identified it as a privacy-relevant control whose effect an
   ellipsis does not predict, cited Buttons › Content, and ranked it above the cosmetic items. The
   most valuable finding on the page, and I did not know I had written it.
2. **The alert binding cannot be written back** (F8). `isPresented: .constant(pendingRemoval != nil)`
   works only because both buttons happen to clear the state. Flagged as the reviewer's own
   observation rather than an Apple citation.
3. **Invited people get an email address as their display name** (F13), so `initials()` returns one
   letter.
4. **"Shared with 1 people"** (F13) — unlocalised pluralisation.

Removed from this list since the first version: *progress placement*, which was part of planted P14
and is counted there; and the *title duplication* item, which the review labelled a design
suggestion rather than a defect.

## Where the review contradicted itself

**C2 — the divider inset.** My planted list named `Divider().padding(.leading, 48)` a correct
pattern that should not be reported. The review reported it twice: in F3 ("Use `@ScaledMetric` for
the … 48 pt divider inset") and again in F13 as a smaller item.

Adjudicating honestly: **my C2 was too generous and the review's point is sound** — a hard-coded
inset tied to a 36 pt avatar does stop matching once text scales. But it is counted as a false
positive here anyway, because it is a hard-coded-metric observation filed against an item I had
designated as acceptable, and adjusting the rubric after seeing the answer is exactly what this page
exists to avoid. It is the weakest of the review's findings, not a wrong one.

## Correct patterns checked and left alone

Six stand. All are argued from a cited section rather than passed over silently:

1. `Toggle` is the right control, and its default green is fine (Toggles › Best practices, and the
   iOS section on not recolouring a switch).
2. `labelsHidden()` is correct here, not a missing label, because the row's own text is the label.
3. Placeholder text is a legitimate hint, with the section header as the describing label. *(This is
   the item my planted list wrongly called a defect — see P13.)*
4. `NavigationStack` with an inline title is a sound structure for a single self-contained task.
5. Confirming per-member removal is appropriate, since the action is not undoable; only its wording
   and roles needed fixing.
6. An indeterminate `ProgressView` is acceptable for a send of unknown duration.

The seventh item in its list was the toolbar target, which is reclassified above as a wrong
dismissal rather than a correct leave-alone.

## Claim discipline

Spot-checking the review against the built skill and Apple's pages:

- No fabricated rule IDs. The bundle carries none and the review invented none.
- Every Apple citation names a page **and** a section anchor.
- Its own preferences are labelled: "Design suggestion (mine, no citation)", "my observation, not an
  Apple citation", "the citation supports the control choice; the restructuring is my
  recommendation".
- Contrast ratios are presented as WCAG-formula measurements, with only the 4.5:1 figure attributed
  to Apple's Dark Mode page.
- It reported what it had not run, at length, unprompted.

The reviewing agent also reported verifying its own work: resolving its 26 HIG URLs and anchors
against Apple's data API, checking 52 quotations against the fetched pages (finding one misquote),
verifying cited line numbers (fixing one off-by-one), and re-measuring a figure it had got wrong.
Those are its claims. What this repository verified independently is the hit-test measurement, which
contradicted one of its conclusions, and the line-number spot check.

## What this demonstrates, and what it does not

**Does:** on this screen, with this skill, a reviewing agent produced findings that were traceable
to a page and section, correctly scoped to iOS, ordered by consequence, explicit about what it had
not run, and included four real problems nobody planted. It argued six correct patterns as correct
rather than ignoring them, and it declined the obvious-but-wrong target finding — the right instinct,
stopping one measurement short of the right answer.

**Does not:** one screen, one run, one platform, one model, no control arm. Nothing here says how a
reviewer without the skill would have done on the same input, how much the result varies between
runs, or how this transfers to implementation rather than review. It is a worked example, not a
measurement of effectiveness.
