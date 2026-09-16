# Platforms, OS versions, and frameworks

The context that decides whether a piece of guidance applies at all. Establish it before reading a
specification, and record it in every finding.

## Read the platform section, not the page title

An HIG page usually covers several platforms, with a **Platform considerations** section carrying
per-platform differences. A statement in the general part of the page and a statement under
`macOS` are not interchangeable, and the page title tells you nothing about which one you read.

Concretely: [Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles) has a
macOS section about checkboxes and radio buttons;
[Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) has separate
iPadOS, tvOS, and visionOS sections;
[Search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields) has an
iOS section describing several distinct placements. Citing the page without the section is how a
macOS behavior ends up in an iOS finding.

When a finding depends on a platform section, name the section in the citation.

## Platform overviews

Start here when the platform is unfamiliar. Each describes the interaction model, not just the look.

- [Designing for iOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios)
- [Designing for iPadOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ipados)
- [Designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos)
- [Designing for watchOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-watchos)
- [Designing for tvOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-tvos)
- [Designing for visionOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos)

The interaction models differ in ways that invalidate transferred conclusions:

| Platform | Primary input | What this changes |
| --- | --- | --- |
| iOS / iPadOS | Touch, plus pointer and keyboard on iPad | Target size and spacing matter; hover cannot be required |
| macOS | Pointer and keyboard | Hover and right-click exist; menu bar carries commands; windows resize freely |
| watchOS | Touch, Digital Crown | Text entry is expensive; glanceable by design |
| tvOS | Remote, focus-based | Nothing is tapped; focus moves, so focus appearance is essential |
| visionOS | Eyes and hands | Targets are gaze-driven; spatial comfort applies; see [Spatial layout](https://developer.apple.com/design/human-interface-guidelines/spatial-layout) |

See also [Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection)
for focus-driven platforms and [Pointing devices](https://developer.apple.com/design/human-interface-guidelines/pointing-devices)
for pointer behavior.

## Design guidance and API availability are different questions

The HIG says what the interface should do. [Apple developer documentation](https://developer.apple.com/documentation/)
says what the framework can do, and from which OS version. A recommendation you cannot implement on
the project's minimum deployment target is not yet an actionable finding: either it needs a fallback
or it needs a deployment-target change, and that is a product decision.

Always establish:

1. **Minimum deployment target**, from the project file, not from the newest device you have.
2. **UI framework**, and whether the screen is SwiftUI, UIKit/AppKit, Catalyst, or embedded web. A
   SwiftUI modifier is not advice for a UIKit screen.
3. **Whether the component is system-provided or custom.** A system control brings interaction
   states, accessibility behavior, and appearance adaptation; a custom lookalike brings none of
   these unless someone wrote them.

That third point is the one that changes findings most often. "This has no press state" is wrong for
a system button and right for a custom one. Determine which it is before writing it up.

## Recent changes worth checking rather than assuming

Apple's guidelines are revised with each OS release, and material moves between pages:

- **Navigation bars merged into [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars).**
  A `navigation-bars` URL resolves to Toolbars rather than 404ing, so a working link does not prove
  the page you remember still exists.
- **Materials now cover Liquid Glass**, with restrictions on where it belongs. See
  [appearance.md](../tasks/appearance.md) and read
  [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) directly.
- Component pages gain and lose platform sections as platforms change.

If your recollection of a page disagrees with the page, the page wins. If you cannot open the page,
say the check is unverified rather than reciting the recollection.

## Multi-platform projects

A shared codebase does not produce one answer. Decide and document per platform, and state where the
platforms deliberately diverge. A single unqualified checklist applied to an app that ships on iOS
and macOS will be wrong on one of them.

Where a project uses Catalyst, check
[Mac Catalyst](https://developer.apple.com/design/human-interface-guidelines/mac-catalyst), since
the resulting Mac app inherits iPad behaviors that may need adjusting.

## Record this in the finding

Every finding should carry: platform, OS version relevant to the behavior, framework, whether the
component is system or custom, and the interaction state involved. A finding without these cannot be
checked by the person receiving it.
