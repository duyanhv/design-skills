# Control sizing

How large an interactive control must be, and how far apart. This is the one topic where the guide
carries Apple's actual numbers, because it is where agents most often guess and most often guess
wrong.

Every value below comes from a [measurement record](../../records/control-sizing.yaml) that names its
source section and is re-verified against the live page by `bun run records`. Cite the record id
alongside the number, so a reader can check it.

## Apple publishes two numbers per platform, not one

The commonest error is treating the default as the minimum. Apple's
[Accessibility › Mobility](https://developer.apple.com/design/human-interface-guidelines/accessibility#Mobility)
table has **two columns**, and they differ by a factor of more than two on some platforms.

| Platform | Default control size | Minimum control size | Record |
| --- | --- | --- | --- |
| iOS, iPadOS | 44x44 pt | 28x28 pt | `control-size.ios` |
| macOS | 28x28 pt | 20x20 pt | `control-size.macos` |
| tvOS | 66x66 pt | 56x56 pt | `control-size.tvos` |
| visionOS | 60x60 pt | 28x28 pt | `control-size.visionos` |
| watchOS | 44x44 pt | 28x28 pt | `control-size.watchos` |

**The source is ambiguous here, and you should not resolve it silently.** The prose under that table
asks you to "strive to meet the recommended minimum control size for each platform", singular, while
the table publishes two columns and labels neither "recommended". Treating 44x44 pt as a floor
overstates what Apple requires; treating 28x28 pt as a target understates Apple's own default. When you
report a finding, name the column you are applying.

**Do not carry a number across platforms.** macOS's default (28x28 pt) is smaller than iOS's
*minimum* would suggest is safe, because a pointer is more precise than a fingertip. tvOS is larger
again because nothing is tapped at all.

## Spacing is a separate requirement

Two controls that each meet the size values can still be easy to mis-hit. Apple states spacing as
prose rather than a table, hedged with "in general" and "about", and marks it as a MAY rather than a
requirement (`control-spacing.general`):

- Elements **with** a bezel: about 12 points of padding.
- Elements **without** a bezel: about 24 points of padding around the visible edges.

visionOS carries its own guidance (`control-spacing.visionos`): regular-size buttons placed so their
centres are at least 60 points apart, equivalently a margin of at least 16 points around each item.
The same guidance appears on two pages under different sections; cite the one you read.

## Measure the interaction region, not the glyph

A size value applies to the region that receives the touch. That is not the symbol, and it is not
the visible background either.

This is the failure mode the project's worked example documents (`examples/apple-design-review/`
in the design-skills repository).
Three measurements of one toolbar button, each from a different instrument:

| What was measured | Value | Record |
| --- | --- | --- |
| The frame the code declares | 24x24 pt | `measured.toolbar-declared` |
| The rendered container, from a screenshot | 44.0 x 44.0 pt | `measured.toolbar-container` |
| The region a touch actually reaches | 39.5 x 26.5 pt | `measured.toolbar-touchable` |

Only the last answers the question, and it is not the one a screenshot gives you. Those are our own
measurements, recorded in [measured.yaml](../../records/measured.yaml) separately from Apple's
published values, because they are warranted by a re-runnable probe rather than by a source page.

In SwiftUI, trace `frame`, `padding`, `contentShape`, `buttonStyle`, and the parent container. A
`.frame(width:height:)` on a toolbar item may be overridden by the system's own metrics in either
direction.

## Verify

Static reading cannot close a target-size finding. The example's probe (`examples/apple-design-review/probe/main.swift`) is a working method:

1. `UIWindow.hitTest(_:with:)` on a grid, recording which view receives each point. This measures
   what UIKit routes, and is reproducible.
2. `GeometryReader` in a `.background` for a control's laid-out size, which does not alter layout.
3. Neither is a finger on glass. If you have not tapped it on a device, say so.

State which method produced any number you report, and at what text size and appearance: control
sizes can change with Dynamic Type when the layout adapts.
