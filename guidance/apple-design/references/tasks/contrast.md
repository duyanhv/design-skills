# Contrast

Whether foreground text and icons stand out enough from what is behind them. This is the topic where
it matters most to say *whose* rule you are applying, because Apple's page reproduces someone else's.

Values come from [contrast records](../../records/contrast.yaml), each resolved to a row of Apple's
table by `bun run records`.

## The values are WCAG's, presented by Apple as guidance

Apple's [Accessibility › Vision](https://developer.apple.com/design/human-interface-guidelines/accessibility#Vision)
section says it "uses the following values from WCAG Level AA as guidance in determining whether
your app's colors have an acceptable contrast". So when you cite a ratio:

- It is a **WCAG Level AA** threshold. Attributing it to Apple as an Apple requirement is wrong.
- Apple names **APCA** as a second popular standard, and publishes no values for it.
- Satisfying these ratios is not a conformance claim. WCAG conformance has its own scope, testing
  rules, and exceptions; this bundle is not a conformance standard.

| Text size | Text weight | Minimum contrast ratio | Record |
| --- | --- | --- | --- |
| Up to 17 pts | All | 4.5:1 | `contrast.small-text` |
| 18 pts | All | 3:1 | `contrast.large-text` |
| All | Bold | 3:1 | `contrast.bold` |

## The table overlaps itself, and has a gap

Read those three rows as conditions and two problems appear. Apple's page resolves neither, so
neither should you, silently.

**Overlap.** Bold text at or below 17 pt (`contrast.small-text`) matches row 1 (all weights, 4.5:1,
`contrast.small-text`) and row 3 (all sizes when bold, 3:1, `contrast.bold`) at once. The rows disagree. Nothing on the page states a precedence.

**Gap, for non-bold text.** Row 1 ends at 17 pts (`contrast.small-text`). Row 2 names 18 pts
(`contrast.large-text`) — not "18 pts or larger". Non-bold text between those sizes matches no row,
and non-bold text above 18 pt is not addressed by the table at all.

The weight qualifier matters and an earlier version of this page left it out. Bold text in that band
is *not* uncovered: bold text of any size matches row 3 (`contrast.bold`, all sizes when bold →
3:1), including sizes inside the gap and sizes above it. The gap is real but narrower than "nothing
covers it".

If a finding turns on either, say which reading you applied. Measuring against the stricter value
(4.5:1 from `contrast.small-text`) and saying so is defensible; quietly taking the looser one is not.


## Apple's rows and WCAG's thresholds are not the same conditions

They share numbers, which makes it tempting to treat them as interchangeable. They are not, and an
earlier version of this page got the difference wrong in a way worth stating plainly: it claimed
WCAG "defines large scale in its own terms rather than in points". That is false. WCAG 2.2's
glossary defines **large scale (text)** as "at least 18 point or 14 point bold or font size that
would yield equivalent size for Chinese, Japanese and Korean (CJK) fonts" (`wcag.large-scale-regular`,
`wcag.large-scale-bold`). Points, explicitly.

The actual differences are these:

| | WCAG 2.2 large scale | Apple's table |
| --- | --- | --- |
| Shape | lower bound: **18 point** and up (`wcag.large-scale-regular`), or **14 point** bold and up (`wcag.large-scale-bold`) | names **18 pts** (`contrast.large-text`); bold gets a separate wildcard row (`contrast.bold`) |
| Bold | folded into the threshold at 14 point (`wcag.large-scale-bold`) | its own row, at any size (`contrast.bold`) |
| Unit | CSS points, in a document the user may resize | native layout points, under Dynamic Type |
| Sizing note | size "when the content is delivered", excluding user resizing | Dynamic Type resizing is the norm |

WCAG's own thresholds are recorded separately, in
[wcag-upstream.yaml](../../records/wcag-upstream.yaml), and verified against the local WCAG build
rather than against Apple's page. Keeping them in their own file is the point: they are W3C's
values, and a record in `contrast.yaml` would inherit Apple's provenance for something Apple did not
author.

So WCAG sets its bold threshold at 14 point (`wcag.large-scale-bold`) and requires 3:1 at and above
it (`wcag.large-scale-ratio`). Below that, bold text is not large scale, so WCAG's general requirement applies
(`wcag.contrast-minimum`).

Apple's table has no single answer for the same case. A small bold label, well under either
threshold, matches `contrast.bold`
(bold at any size → 3:1) *and* `contrast.small-text` (up to 17 pts, all weights → 4.5:1), and the
page states no precedence. So the correct statement is that Apple's **bold-specific row** permits
3:1 there while its **all-weights row conflicts** — not that "Apple's table permits 3:1", which
quietly picks the looser row. An earlier version of this page did exactly that, one section after
warning against it.

And WCAG covers all text from 18 point upward (`wcag.large-scale-regular`) where Apple's row names
18 pts alone (`contrast.large-text`). Conformance claims must be checked against
[WCAG](https://www.w3.org/TR/WCAG22/#distinguishable) directly. This bundle is not a conformance
standard, and Apple's table is a summary that its own page attributes to WCAG "as guidance".
## Apple's table drops WCAG's exceptions

The upstream criterion is [WCAG 2.2 SC 1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#distinguishable),
Level AA, and it carries exceptions Apple's three rows do not reproduce:

- **Large text** has a lower threshold, which is what Apple's size rows are approximating.
- **Incidental** text — part of an inactive component, pure decoration, invisible, or part of a
  picture with significant other visual content — has no contrast requirement.
- **Logotypes** — text that is part of a logo or brand name — has no contrast requirement.

A finding that flags a disabled control's label, or a wordmark, is usually wrong for this reason.
Read the criterion before asserting one.

## What a contrast number does and does not tell you

Apple asks that you "strive to meet color contrast minimum standards" and points to standard
contrast calculators. Two cautions the page itself raises:

- If the app cannot meet the minimum by default, it should at least offer a higher-contrast scheme
  when **Increase Contrast** is on.
- Check both light and dark appearances. A pair that passes in one can fail in the other.

**Our own addition, not Apple's:** a ratio measured against a *translucent* element is a measurement
against one particular backdrop, not against the element. Material-backed text can pass over one
wallpaper and fail over another, so state the backdrop you measured. See
[appearance.md](appearance.md).

## Verify

- Measure with a contrast calculator, and record the two colours, the backdrop, and the tool.
- Re-measure in dark appearance and with Increase Contrast enabled. Reduce Transparency too, if the
  element sits on a material.
- For text, record the size and weight alongside the ratio, since the threshold depends on both and
  the table's rows overlap.
- Greyscale is a quick proxy for colour-only encoding, not a substitute for measuring contrast.
- Nothing here can be settled from a screenshot alone unless you also know what is behind the
  element and which appearance produced it.
