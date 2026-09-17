# Scoring — Material 3 review

Scored against [`planted-defects.md`](planted-defects.md), which was written before the review ran
and kept outside the reviewing agent's workspace. The rubric was fixed in advance and is not
adjusted here; where I disagree with the outcome, the disagreement is recorded rather than resolved
in the review's favour.

[`REVIEW.md`](REVIEW.md) is published exactly as produced.

## Planted defects

| # | Defect | Outcome | Where |
| --- | --- | --- | --- |
| M1 | Hard-coded hex colours | **Found** | A2, with each literal located and the dark-mode consequence stated |
| M2 | `primary` used as a page surface | **Found** | A1, and it went further than planted — see below |
| M3 | Three filled buttons | **Found** | A10 |
| M4 | Destructive action styled like the safe ones | **Found** | A10, plus a confirmation dialog in C5 |
| M5 | Status by colour alone | **Found** | A6, cited to SC 1.4.1 |
| M6 | Disabled section carries information nothing else does | **Found** | A9, and stronger than planted: it observed the section is *not actually inert*, since `pointer-events: none` leaves the controls keyboard-reachable |
| M7 | Placeholder as the only label on the time inputs | **Partial** | Raised in C2 as an optional suggestion, and correctly noted that `placeholder` does nothing on a time input at all. But a field with no accessible name is SC 4.1.2, not an optional improvement, and the review put it in the wrong section. It did catch the same class for the selects in A4. |
| M8 | Error state is a red border with no message | **Found** | A7, cited to SC 1.4.1 and SC 3.3.1 |
| M9 | Heading role on a non-heading element | **Found** | A11, cited to SC 1.3.1, with `<h1>` as the fix |
| M10 | Fixed pixel row heights clip at large text | **Found** | A11 and A15 |
| M11 | No response to width | **Found** | A15 |
| M12 | Touch target smaller than it looks | **Handled, not asserted** | B5. Traced `.info`'s 24px override into the component's own `_shared.scss`, found the internal `.touch` span is `max(48px, 100%)` and absolutely positioned, reasoned the real hit area is probably larger than the visible box but may overlap the neighbouring select — and then declined to claim a failure it could not measure. |

**12 of 12 reached. 10 found outright, 1 handled with the right reasoning and a refusal to assert,
1 partial.**

## Deliberate non-defects

| # | Non-defect | Outcome |
| --- | --- | --- |
| N1 | A custom brand accent is legitimate | **Not flagged.** The review measured against the library's baseline `primary40` and said so, then explicitly asked for re-measurement "against the product palette" (B2). |
| N2 | `md-switch` for one boolean | **Not flagged.** |
| N3 | Native `<input type="time">` is correct; 2.5.0 ships no time picker | **Half-flagged.** C2 suggests replacing it with "Material fields". The review did not claim `md-time-picker` exists, and its actual complaint — the dead `placeholder` and the missing visible label — is correct. But "replace the native input with Material fields" points at something the installed version cannot provide for a time value, and the review did not say that. Counted as a **false positive on N3**, scored against it rather than excused. |

**0 clean false positives, 1 partial (N3).**

## Unanticipated findings

Not in the pre-registered list, so they do not count toward the score. Recorded because they are the
most interesting part of the result — these are real defects I put in the file without meaning to:

- **A7 (first half): the invalid predicate is wrong.** `dndStart >= dndEnd` string-compares
  `'22:00' >= '07:00'` as `true`, so the screen renders in its error state on first paint, and an
  overnight quiet window — the normal case — is treated as invalid. I wrote that predicate to plant
  a *colour-only error*, and did not notice I had also made it permanently wrong.
- **A8: every control loses focus on every interaction.** `render()` rewrites `innerHTML` wholesale,
  so focus is destroyed on each state change. Genuinely bad and entirely accidental.
- **A13: two controls are dead, one state is never stored.** No listener on `#save` or `.info`, and
  none on the sound select, so a chosen sound silently reverts.
- **A14: "1 categories", and the summary is not a live region.**
- **A12: `md-icon` renders the ligature text unless the Material Symbols font is loaded** — the
  screen would show the word "info" three times.
- **A3, A4, A5: no accessible names** on the switch, the four selects, or the icon buttons.

## What this says about the guides

The review reached every planted defect, and its two weakest moments are both about **where a
finding belongs** rather than whether it was seen:

- M7 landed in "optional suggestions" when a missing field name is a standards problem. The
  accessibility guide names SC 4.1.2 explicitly, and the review cited that criterion correctly for
  the selects in A4 — so the guidance was read and applied, and then not applied to the same defect
  one element over.
- N3's fix suggestion points at a component the installed version does not have, which is exactly
  what `components.md` warns about, on a screen where the review had already inspected the package
  closely enough to quote its internal SCSS.

Both are cases of the guide being followed in one place and not in the neighbouring one, which is
more useful to know than a clean sweep would have been.

The strongest result is B5. The guide says a target's real hit area cannot be settled from a
screenshot and that a review must say what it could not check; the review traced the question into
the library's source, formed a specific hypothesis, and refused to assert a conformance failure it
had not measured. That is the behaviour the bundle is for.
