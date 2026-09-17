# Evidence: what did you actually establish?

Accessibility findings are claims about how an interface behaves for someone. Most are made by
reading code, which establishes something narrower than the claim usually says.

## The ladder

Each rung supports a different claim. Name the rung you are on.

| Evidence | Establishes | Does not establish |
| --- | --- | --- |
| **Source read** | a semantic element, attribute, or style exists | what any assistive technology does with it |
| **Rendered, statically** | what the interface looks like in one state | behaviour, focus order, announcement, or any other state |
| **Exercised** | what happens when you operate it | what it announces, or what it does under different settings |
| **Assistive technology** | what one AT announces in one mode on one platform | what a different AT, mode, or version does |
| **Measured** | a number, under stated conditions | that the number holds under other conditions |

The gap that matters most is the first row. `aria-label="Close"` in source is good evidence the name
exists and no evidence about what a screen reader says, because the accessible name is computed from
several sources in a defined order, and another one may win.

## Four things source alone cannot settle

- **Announcement.** The accessible name computation, live-region behaviour, and role mapping all
  happen at runtime. Reading the markup tells you the input to that, not the output.
- **Focus order.** Determined by DOM order, tabindex, and anything that moves focus. A component
  correct in isolation can land in the wrong place on the page.
- **Target size.** The interactive region is often not the visible box — padding, pseudo-elements,
  and absolutely positioned hit areas all change it. A screenshot cannot show it and a stylesheet
  rarely tells the whole story. Measure the real region.
- **Contrast against a theme.** A ratio computed against a design token is a claim about the token.
  If the product overrides it, or supports dynamic colour, the shipped value is a different number.

## Automated tools

Useful, and bounded in a specific way worth stating: they check what is mechanically checkable.
A tool can tell you an image has no `alt` attribute. It cannot tell you whether the `alt` text
describes the image, which is the actual requirement.

So:

- **A clean automated run is not a pass.** It is the absence of the subset of failures that tool
  detects. Say which tool and which version.
- **A tool's finding is still yours.** If you report it, you are responsible for checking it applies
  — including the exceptions in [criteria.md](criteria.md). Tools raise contrast findings against
  disabled controls and logotypes routinely.

## Writing the boundary down

For each finding, one line about what you did:

> Read in `Component.tsx:42`. Not rendered, not announced.
> Measured at one stated viewport width in Chrome 141, default OS text size. Other widths not checked.
> Announced as "Close, button" by VoiceOver on macOS 26.5, Safari. Not checked on Windows.

This is not hedging. It is the difference between a finding a developer can reproduce and a finding
they have to take on trust, and the second kind is what makes teams stop reading accessibility
reports.

## The honest negative

"I could not check this" is a result, and belongs in the report with the same prominence as the
failures. An audit that silently omits what it could not reach implies coverage it does not have,
and the reader has no way to know.

The strongest version names the test that would settle it:

> Target size for the icon buttons: the interactive region may exceed the visible box because the
> component draws an absolutely positioned hit area. Not measured. To settle it, inspect the
> rendered region against SC 2.5.8, reading its spacing exception first.
