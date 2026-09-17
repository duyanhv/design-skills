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

**Gap.** Row 1 ends at 17 pts (`contrast.small-text`). Row 2 names 18 pts (`contrast.large-text`) —
not "18 pts or larger". Text between those
sizes matches no row, and larger text is not addressed by the table at all.

If a finding turns on either, say which reading you applied. Measuring against the stricter value
(4.5:1 from `contrast.small-text`) and saying so is defensible; quietly taking the looser one is not.

## Apple's table drops WCAG's exceptions

The upstream criterion is [WCAG 2.2 SC 1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#distinguishable),
Level AA, and it carries exceptions Apple's three rows do not reproduce:

- **Large text** has a lower threshold, which is what Apple's size rows are approximating. WCAG
  defines "large scale" in its own terms rather than in points, so Apple's size rows
  (`contrast.small-text`, `contrast.large-text`) are a platform rendering of that idea rather than a
  quotation of it.
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
