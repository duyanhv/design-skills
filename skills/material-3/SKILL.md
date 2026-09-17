---
name: material-3
description: "Design or review interfaces using Google Material Design 3, with original workflows and official references for theming, components, and adaptive layouts. Use for Material 3 tasks, not as documentation for the MUI React library."
license: MIT
metadata:
  compatibility: "A coding agent with file access and a way to read linked Google design and platform documentation."
  authorship: "original"
  source: "https://m3.material.io/"
  maintained_by: "design-skills"
---

# Material Design 3

Use this original design-skills workflow to research and apply
[Google Material Design 3](https://m3.material.io/). This bundle links official guidance and provides
independent implementation/review instructions. It is not a downloaded copy of Google's guidelines
and is not affiliated with Google.

## Establish the implementation target

Identify the target platform, component library, dependency version, existing theme, and requested
scope. Distinguish the design system from the library implementing it. A Material design request
does not establish which React, Flutter, web-component, or Compose package the user wants installed.

Check whether the requested design uses baseline Material 3 or newer Expressive features. Verify
the chosen library's available components and APIs before proposing a migration or enabling an
experimental API. Preserve the project's current framework unless the user requests a change.

Read [the source map and implementation notes](references/research/sources.md) for the relevant
platform. Use [the review workflow](references/review/evidence.md) when assessing existing UI.

## Route to the task

| The task involves… | Read |
| --- | --- |
| Colors, roles, tokens, dark theme, dynamic color | [theming.md](references/tasks/theming.md) |
| Choosing a component, or its states and variants | [components.md](references/tasks/components.md) |
| Window sizes, navigation shape, panes, density | [layout.md](references/tasks/layout.md) |
| Type scale, text that must survive user settings | [typography.md](references/tasks/typography.md) |
| Contrast, targets, names, and whose standard applies | [accessibility.md](references/tasks/accessibility.md) |

Each guide states the decision to make and links the official page that settles it. None of them
restates a token value or a threshold: those are versioned, they live in the project's theme or in
the linked source, and a number copied into this bundle would be a number nobody re-checks.

## Design or implement

1. Define the screen's main task and the information needed to complete it. Select a component
   because its behavior fits that task, then confirm its current official usage guidance.
2. Map the design to the project's theme roles before introducing component-specific values.
   Inspect the actual theme, component defaults, and state overrides together.
3. Specify the states the task needs: selected, disabled, pressed, focused, error, loading, and
   empty where relevant. Verify how the installed library represents each state.
4. Check the layout at the sizes and input modes the product supports. Treat changing navigation
   structure as a behavior change with focus and selection consequences, not just a width adjustment.
5. Test the affected component states and document any parts requiring visual or runtime inspection.
   Cite the official source behind specification-dependent choices and identify your own design judgment.

## Apply the right source

Prefer the Material site for design intent and the installed library's documentation for APIs.
Read the source section containing a metric before applying its number; retain units, state,
platform, and exceptions. For accessibility findings, establish the relevant standard and verify
the actual interface rather than treating a component library as proof of conformance.

If the Material site does not render in the available browser, use the official implementation
documentation linked in this bundle and disclose the narrower evidence. Do not claim to have
verified a guideline page that returned only an application shell.
