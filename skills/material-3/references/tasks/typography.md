# Typography

Material's type system is a **scale of named roles** — display, headline, title, body, label, each
in large/medium/small — expressed as tokens. As with color, the discipline is to use the role rather
than the number.

**Read first:** [Typography](https://m3.material.io/styles/typography/overview) and
[type scale tokens](https://m3.material.io/styles/typography/type-scale-tokens).

## Pick the role by what the text is, not by how big it should look

`headline-small` and `title-large` may render at similar sizes in a given theme, and they mean
different things: a headline introduces a section of content, a title labels a component or a
region. Choosing by size produces a screen that looks right and reads wrong to anything that
navigates by structure.

Two consequences:

- A heading role is not a heading **element**. Applying `headline-medium` to a `<div>` styles the
  text and tells assistive technology nothing. The semantic element is a separate decision, and the
  one that matters for navigation.
- Changing a token's size to make one screen fit changes every screen using that role. If one place
  needs a different size, that is a component-level decision — see [theming.md](theming.md) for why
  the layer matters.

## Text must survive the user's settings

The check that finds real defects is: **raise the system font size to its maximum and look again.**

- Does a title wrap mid-word, or clip?
- Does a label beside a fixed-width control still fit, or does it need to stack?
- Does a button's text truncate, leaving an action the user cannot identify?

A fixed pixel height on a component that contains text is the usual cause. So is a row that assumes
a label and a control sit side by side at every size.

Turning scaling off is not a fix. It is a decision to exclude users who need larger text, and if a
project genuinely requires an exact size somewhere, confine it to display text and say so.

## Line length, line height, and the things a screenshot hides

Material's tokens carry line height and letter spacing alongside size. Applying only the font size
from a token discards the rest, which is why hand-copied type styles look subtly wrong.

Check line length at the widest supported window, not just the narrowest — see
[layout.md](layout.md).

## Localization is a typography problem

Text expands. A label that fits in English may be half again as long in German, and scripts differ
in the line height they need. If the product ships in more than one language, a layout verified in
one is verified in one.

Say which language you tested. "Checked in English at the default size" is a useful, bounded claim.

## Numbers

This guide states none. The type scale's values live in the project's theme and in the linked token
page, both of which are versioned. Read the value from the source you are applying, keep its units,
and cite the section it came from.

Contrast requirements for text are WCAG's, not Material's, and they depend on size and weight — see
[accessibility.md](accessibility.md).
