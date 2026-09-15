---
name: apple-design
description: "Design or review Apple-platform interfaces using an original workflow and official HIG references. Use for component choices, navigation, accessibility, and platform-specific UI decisions. Requires reading the linked guidance; this is not an offline HIG copy."
license: MIT
metadata:
  compatibility: "A coding agent with file access and a way to read official Apple documentation."
  authorship: "original"
  source: "https://developer.apple.com/design/human-interface-guidelines"
  maintained_by: "design-skills"
---

# Apple interface design

Use this original workflow to connect a concrete UI task to the relevant Apple guidance. It contains
research and review instructions written for design-skills, not extracted Apple requirements.
The official [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
remain the source for platform behavior and specifications. This project is not affiliated with Apple.

## Establish the context

Identify the target platform, supported OS versions, UI framework, and the user's requested change.
Inspect existing components and theme conventions before proposing alternatives. If the request is
about a single control, keep the work focused on that control and its dependencies.

Use [the topic map](references/research/topics.md) to choose official pages. Read their platform
considerations and linked examples before using a specification. Page titles are navigation aids;
they are not evidence that a particular requirement exists.

When online reading is unavailable, explain which decisions remain unverified. Work from supplied
source excerpts where possible, and distinguish project conventions from claims about Apple's guidance.

## Build or change an interface

1. Connect the user's task to a control or navigation pattern. Compare plausible alternatives using
   the relevant official pages and the behavior already established in the app.
2. Check the chosen component's API in the project's framework and supported OS version. Separate
   what a native component supplies from behavior the app must implement.
3. Trace component size, interaction state, text behavior, and semantic role through the actual code.
   A screenshot cannot establish the hit region or accessibility behavior by itself.
4. Exercise the states affected by the change: long content, localization, larger text, input methods,
   and appearance variations where supported. Record which states were tested.
5. Explain material design decisions with the official page and section used. Call recommendations
   recommendations; do not translate a general preference into a mandatory requirement.

For an existing interface review, use [the evidence workflow](references/review/evidence.md).

## Keep platform scope attached

Check the platform named in the actual section, not only the page title. Do not transfer a
macOS-specific behavior to an iOS finding or a spatial interaction assumption to a touch interface.
If the project serves several platforms, document each platform's decision rather than producing
one unqualified checklist.

Read the original illustration when a decision depends on visual anatomy, geometry, or state.
This bundle includes no Apple images, fonts, icons, or downloaded guideline text.
