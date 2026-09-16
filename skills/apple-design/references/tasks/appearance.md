# Color, appearance, and materials

Making an interface work in light, dark, increased contrast, and over whatever is behind it.

## Use semantic system colors

Apple's [Color](https://developer.apple.com/design/human-interface-guidelines/color) page says to
avoid hard-coding system color values and to avoid redefining the semantic meanings of dynamic
system colors. That is the single highest-value check in this area: a hex literal does not adapt to
dark mode, increased contrast, or a future OS revision, and it is easy to find in code.

Prefer a semantic color (label, secondary label, system background, separator) over a literal, and
an asset-catalog color with light and dark variants over a computed one. Apple documents the system
colors and accent colors in [Color › System colors](https://developer.apple.com/design/human-interface-guidelines/color#System-colors)
and [Color › App accent colors](https://developer.apple.com/design/human-interface-guidelines/color#App-accent-colors).
Read the actual values there; do not quote a remembered RGB.

## Color must not be the only signal

Apple states this in two places, which makes it one of the firmer things this guide can point at:
its Color page advises against relying solely on color to differentiate objects, indicate
interactivity, or communicate essential information, and its Accessibility page says to convey
information with more than color alone.

In practice, look for status dots without text, required-field indicators that are only red, chart
series distinguished only by hue, and "tap the blue text" affordances. Each needs a second channel:
text, a symbol, a shape, or a position. See [accessibility.md](accessibility.md).

## Dark Mode is not an inversion

[Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) covers adapting
colors, icons and images, and text. Apple advises against offering an app-specific appearance
setting, on the grounds that people expect the system setting to be honored; if the project has one,
that is worth raising with this page as the source, and worth checking whether it also *follows* the
system by default.

Specific things Apple's page addresses that reviews miss:

- Softening white backgrounds rather than using pure white.
- Designing separate interface icons per appearance where necessary.
- Using system label and background colors rather than custom greys.
- Including some transparency in custom component backgrounds where appropriate.

Read [Dark Mode › Dark Mode colors](https://developer.apple.com/design/human-interface-guidelines/dark-mode#Dark-Mode-colors)
and its [Text](https://developer.apple.com/design/human-interface-guidelines/dark-mode#Text) section
before proposing a palette change.

## Materials and the content layer

[Materials](https://developer.apple.com/design/human-interface-guidelines/materials) describes the
system materials, vibrancy, and Liquid Glass. Apple's current guidance is restrictive about where
Liquid Glass belongs: not in the content layer, used sparingly, with the clear variant reserved for
components over visually rich backgrounds. Its Color page adds that color should be applied sparingly
to that material.

Read [Materials › Liquid Glass](https://developer.apple.com/design/human-interface-guidelines/materials#Liquid-Glass)
and [Color › Liquid Glass color](https://developer.apple.com/design/human-interface-guidelines/color#Liquid-Glass-color)
directly. This area changed recently, so guidance you remember from an earlier OS is a poor guide,
and an implementation that predates the change is not necessarily wrong — check which OS versions
the project supports before calling it a defect.

The recurring legibility failure: text or a symbol placed on a material whose backdrop varies, so it
passes over one wallpaper and fails over another. Vibrancy exists for this; a hard-coded grey does
not participate in it.

## Contrast

Apple's accessibility guidance asks for meeting color contrast minimums and offers Increase Contrast
as a system setting the interface should respond to. Two cautions before writing a finding:

- A contrast ratio measured from a screenshot of a *translucent* element is measuring one particular
  backdrop, not the element. Say which backdrop you measured.
- The numeric thresholds people quote are usually WCAG's, which is a different document from the
  HIG. If you are asserting a specific ratio, cite the standard you are actually applying rather
  than attributing the number to Apple.

## What to check in the code

1. Hex/RGB literals and hard-coded greys, especially for text and backgrounds.
2. Asset-catalog colors lacking a dark variant.
3. Any place a semantic color's meaning has been redefined.
4. Status, error, and selection states that carry color and nothing else.
5. Custom controls that draw their own background instead of using a material.
6. An in-app appearance override, and whether it defaults to following the system.

## Verify

None of this can be settled by reading code alone:

- Toggle light and dark and walk the affected screens.
- Turn on Increase Contrast, and Reduce Transparency, and look again. Reduce Transparency changes
  materials substantially and is where material-based designs tend to fail.
- Put a material-backed element over both a light and a dark background image.
- Check any chart or status display in grayscale as a quick proxy for color-only encoding.
- If you claim a contrast ratio, state the tool, the two colors, and the backdrop.
