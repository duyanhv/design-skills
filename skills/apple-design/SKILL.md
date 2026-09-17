---
name: apple-design
description: "Design or review Apple-platform interfaces using an original workflow and official HIG references. Use for component choices, navigation, actions, forms, typography, appearance, and accessibility decisions on iOS, iPadOS, macOS, watchOS, tvOS, and visionOS. Requires reading the linked guidance; this is not an offline HIG copy."
license: MIT
metadata:
  compatibility: "A coding agent with file access and a way to read official Apple documentation."
  authorship: "original"
  source: "https://developer.apple.com/design/human-interface-guidelines"
  maintained_by: "design-skills"
---

# Apple interface design

An original workflow for connecting a UI task to the relevant Apple guidance. It contains research
and review instructions written for design-skills, not extracted Apple requirements. The official
[Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) remain
the source for platform behavior and specifications. Not affiliated with Apple.

**Specifications appear only where a record backs them.** One topic — [control sizing](references/tasks/control-sizing.md)
— carries Apple's published values, because each is held in a
[measurement record](records/control-sizing.yaml) naming the source table, the column the
value came from, its platforms, conditions and exceptions, and a snapshot to re-verify against.
Everywhere else this bundle carries no numbers and no images: read them at the linked page and
record the units and platform section you took them from. If you cannot open the linked pages, say
which decisions are unverified rather than working from recollection.

## 1. Establish the context first

Before choosing or judging anything, settle: **platform, minimum OS version, UI framework, and
whether the component is system-provided or custom.** These decide whether a piece of guidance
applies at all, and the last one changes findings most often, because a system control supplies
interaction states and accessibility behavior that a custom lookalike does not.

See [platforms.md](references/context/platforms.md). Keep the work scoped to what was asked: a question
about one control is not an invitation to restructure the screen.

## 2. Route to the task

| The task involves… | Read |
| --- | --- |
| App structure, tabs, sidebars, screen-to-screen movement | [navigation.md](references/tasks/navigation.md) |
| Buttons, menus, destructive or confirming operations | [actions.md](references/tasks/actions.md) |
| Target sizes and spacing, with Apple's published values | [control-sizing.md](references/tasks/control-sizing.md) |
| Contrast ratios, and whose standard they are | [contrast.md](references/tasks/contrast.md) |
| Working in React Native rather than SwiftUI | [react-native.md](references/frameworks/react-native.md) |
| Fields, pickers, toggles, validation, settings | [forms.md](references/tasks/forms.md) |
| Text, type styles, Dynamic Type, localization | [typography.md](references/tasks/typography.md) |
| Color, light and dark, materials, contrast | [appearance.md](references/tasks/appearance.md) |
| Labels, VoiceOver, targets, motion, keyboard access | [accessibility.md](references/tasks/accessibility.md) |

Each task file names the official pages for that decision, what to inspect in code, and what needs a
running app. [The source map](references/research/topics.md) is the fuller decision-to-page table.
For reviewing an existing interface, follow [the evidence workflow](references/review/evidence.md).

## 3. Build or change an interface

1. Connect the task to a control or pattern, and compare plausible alternatives against the official
   pages and the conventions already in the app.
2. Confirm the component's API exists in the project's framework and minimum OS version. Separate
   what the system supplies from what the app must implement.
3. Trace size, interaction bounds, state, text behavior, and semantic role through the actual code.
   A screenshot establishes none of these.
4. Exercise the states the change touches: long content, localization, larger text, appearance
   modes, and the platform's input methods. Record which you tested.
5. Cite the official page and section for material decisions. Call a recommendation a
   recommendation, and label your own preferences as design suggestions.

## 4. Keep the claim proportional to the evidence

Three failure modes account for most bad findings, so check yourself against them:

- **Transferring platform scope.** Read the platform section, not the page title. A macOS behavior
  is not an iOS finding.
- **Confusing visible size with interaction bounds.** A small glyph may sit in a large tappable
  region; a large view may have a small hit shape. Both are code questions.
- **Promoting a preference to a requirement.** If the source did not prohibit it, do not report it
  as a violation. This bundle has no rule IDs, so a citation like `HIG-1234` from here is fabricated;
  use real URLs and section names.

Illustrations carry information this bundle does not reproduce. When a decision depends on visual
anatomy, geometry, or state, read the original figure on the page.
