# Components and their states

A Material component is chosen for its **behavior**, not its appearance. The visual difference
between a filled button and an outlined one is small; the difference in what they claim about
priority is not. And most component defects are not in the default state at all — they are in the
states nobody rendered.

**Read first:** [Buttons](https://m3.material.io/components/buttons/overview),
[text fields](https://m3.material.io/components/text-fields/overview), and
[interaction states](https://m3.material.io/foundations/interaction/states/overview).

## Emphasis is a claim about priority

Material's button variants form a hierarchy: filled carries the most emphasis, then filled-tonal,
elevated, outlined, and text the least. A screen with three filled buttons is claiming three primary
actions, which usually means the hierarchy was never decided.

The check is: **how many actions on this screen are the primary one?** Normally exactly one. If the
code disagrees with that answer, the finding is about emphasis, not color.

## The states are the work

Every interactive component has states beyond the one in the mockup:

- **enabled** — the default
- **hovered / focused / pressed** — Material draws these as *state layers*, a translucent overlay of
  the content color at a defined opacity, not as separate colors
- **disabled** — reduced opacity. Two things are true at once here, and an earlier version of this
  guide stated only the first: a disabled control should still be *readable enough to understand
  what is unavailable*, **and** WCAG's contrast criterion exempts text in an inactive user
  interface component. So low contrast on a genuinely inactive control is a usability improvement,
  not a conformance failure, and filing it as one is the most common way a contrast finding dies.
  What is *not* exempt is a control merely **styled** to look disabled while remaining operable —
  the exception is about the component being inactive, not about how it looks. See
  [accessibility.md](accessibility.md)
- **error** — for inputs, paired with a message that says what to do
- **selected** — for navigation and choice components

State layers are why "just change the hover color" is usually wrong: the layer derives from the
content color, so overriding it by hand detaches it from the theme and from dark mode.

A review that inspected only the rendered default has established very little. Say which states you
exercised and which you did not.

## Text fields: the label is not decoration

A Material text field's label moves, the supporting text has a reserved slot, and the error state
replaces that supporting text. Three consequences worth checking:

1. A field whose label is only a placeholder loses its label on focus. The name of a field must not
   vanish when the user starts typing.
2. Error text that appears and shifts the layout means the supporting-text slot was not reserved.
3. Error state must not be color alone. A red outline with no message says something is wrong and
   not what.

## Choosing a component

Ask what the user is doing, then pick:

| The user is… | Component family |
| --- | --- |
| performing the screen's main action | filled button |
| choosing between a few visible options | segmented button, chips |
| entering free text | text field |
| toggling one independent setting | switch |
| moving between top-level destinations | navigation bar / rail — see [layout.md](layout.md) |

Confirm the choice against the component's current official page before applying its details. Names
and available variants change between Material versions, and an example from an older page can be
confidently wrong.

## The library is not the specification

The project's library implements Material; it is not Material, and it may lag, extend, or diverge.
Check the component exists in the installed version before recommending it, and check what that
version calls it. A finding that reads "use the X component" is incomplete without "which your
version provides, as Y".

Do not treat the presence of a Material library as evidence that a screen conforms — see the
[review workflow](../review/evidence.md).
