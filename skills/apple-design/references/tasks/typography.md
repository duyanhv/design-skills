# Typography and text

Making text readable at the size the reader chose, not the size the mockup assumed.

## Start from the system text styles

Apple's [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) page
covers the system fonts (San Francisco and New York), the built-in text styles, and Dynamic Type.
Using a built-in text style is what connects your text to the reader's chosen size, weight behavior,
and accessibility sizes without your code tracking any of it.

The practical rule: pick a text style for its *semantic role* (body, headline, caption), then adjust
if needed, rather than picking a point size that happens to look right in the mockup. Read
[Typography › Using system fonts](https://developer.apple.com/design/human-interface-guidelines/typography#Using-system-fonts).

Apple publishes the per-size specifications, including the accessibility sizes AX1 through AX5, in
[Typography › Specifications](https://developer.apple.com/design/human-interface-guidelines/typography#Specifications).
**Read the table there rather than reproducing a remembered number.** The values are per platform and
per text style, and they change between releases. When you use one, record the platform, the text
style, the size class it came from, and its units.

## Dynamic Type is a layout requirement, not a text setting

This is where most real defects are. Apple's guidance says to make sure the layout adapts to all
font sizes and to prioritize important content when text size changes. Read
[Typography › Supporting Dynamic Type](https://developer.apple.com/design/human-interface-guidelines/typography#Supporting-Dynamic-Type).

Things that break at AX sizes and are invisible at the default:

- A fixed-height container around growing text, which clips it.
- A horizontal row of label + value + chevron that should become vertical.
- `lineLimit(1)` with truncation on text that carries the only copy of some information.
- A button whose title is the only thing identifying it, truncated to "Sav…".
- Text drawn inside a fixed-size image or a custom-drawn view.

In SwiftUI, check for `.font(.system(size:))` with a literal, which opts out of Dynamic Type, versus
`.font(.body)`, and look for `ScaledMetric` where a spacing value must scale with text. In UIKit,
check for `adjustsFontForContentSizeCategory` and whether the font came from
`UIFont.preferredFont(forTextStyle:)`.

## Weight, legibility, and custom fonts

Apple's page advises against light font weights in general and says to make sure custom fonts are
legible and to implement accessibility features for them. A custom font is permitted; a custom font
that ignores Dynamic Type and Bold Text is the actual problem. Check that the custom font scales and
responds to the accessibility settings before either defending or faulting it.

Apple also advises minimizing the number of typefaces, even in a highly customized interface. Treat
"this app uses four typefaces" as worth raising, with that page as the source.

## Emphasis and hierarchy

Apple frames weight, size, and color as the tools for emphasis and hierarchy. Two consequences:

- Do not build hierarchy from color alone; it disappears for some readers and in some appearances.
  See [appearance.md](appearance.md) and [accessibility.md](accessibility.md).
- All-caps runs, letterspaced display text, and very long line lengths are legibility risks. Apple's
  tracking values are published per platform in the Specifications section; if you adjust tracking,
  cite the platform's table.

**Our judgment, not Apple's:** if a screen has more than three levels of text hierarchy, the screen
usually has too much on it. Offer that as a design suggestion.

## Localization and direction

Text length changes with language, often growing substantially. A layout that exactly fits its
English label is fragile. Also check mirroring for right-to-left languages, which affects alignment,
leading/trailing padding, and directional symbols. See
[Right to left](https://developer.apple.com/design/human-interface-guidelines/right-to-left).

Use leading/trailing rather than left/right in layout code; a hard-coded left inset is a
right-to-left defect waiting to happen.

## What to check in the code

1. Whether each text style is semantic or a literal point size.
2. Whether containers around text are fixed-height.
3. `lineLimit` / truncation on text carrying unique information.
4. Custom fonts: do they scale, and do they honor Bold Text?
5. Leading/trailing versus left/right.
6. Numbers, dates, and currency going through a formatter rather than string interpolation.

## Verify

Text size is a runtime setting, so static reading cannot close these. State which you ran:

- Set the largest accessibility text size and walk every screen the change touches.
- Set the smallest size and confirm nothing depends on text filling the space.
- Enable Bold Text and confirm nothing clips.
- Run a long-language pseudolocalization, or at least the longest real string you have.
- Switch to a right-to-left language and confirm mirroring.
