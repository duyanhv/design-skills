# Layout and adaptive design

Material treats a window size change as a change of **navigation structure**, not a change of width.
That is the idea worth carrying: moving a navigation bar to a rail is a different interface, with
different focus order and different selection semantics, and reviewing it as a styling change misses
what actually broke.

**Read first:** [Adaptive design](https://m3.material.io/foundations/adaptive-design/overview),
[navigation bar](https://m3.material.io/components/navigation-bar/overview), and
[navigation rail](https://m3.material.io/components/navigation-rail/overview).

## Navigation changes shape with the window

The same destinations are presented differently depending on available width — a bar along the
bottom on a compact window, a rail at the side as width increases, a permanent drawer when there is
room. Confirm the current breakpoints and component names on the pages above; they are versioned
and this bundle does not restate them.

What matters for a review is that the switch is a behavior change:

- **Focus order** changes when the container moves. Tab through it at each size.
- **Selection** must survive the transition. A destination that is selected in the bar must be
  selected in the rail.
- **Labels** may be hidden in one form and shown in another. A rail with icon-only destinations
  needs accessible names supplied some other way.
- **The count of destinations** that fits differs. Something is dropped or moved into an overflow,
  and that decision needs to be deliberate.

## Test at sizes, not at devices

"Works on mobile" is not a check. Name the widths you exercised and the input mode at each, because
a window can be wide and still touch-driven, and a small window can be keyboard-driven.

A finding should name the width where the failure appears — "at this width the two actions overlap",
with the width you actually tested — rather than "the layout breaks on phones". The first can be
reproduced; the second cannot.

## The content, not just the frame

An adaptive layout that only moves the chrome leaves the real problem in place. Check:

- **Line length** at wide sizes. Text that spans a full desktop window is hard to read; Material's
  layout guidance covers panes and margins for this reason.
- **Reflow at large text.** Increase the system font size and re-check. A row of a label and a
  fixed-width control is the first thing to break, because the label has nowhere to grow.
- **Panes.** A list-detail layout that becomes two panes must decide what "selected" means when both
  are visible, and what happens on the first load when nothing is selected yet.

## Density and touch targets

Material defines a comfortable target size and lets density be adjusted for pointer-driven
interfaces. Two things follow:

1. The **visible** control and its **touch target** are different rectangles. A small icon can meet
   the target requirement if its interactive area is larger; a screenshot cannot show you this.
2. Reducing density is a decision about input mode, not a way to fit more in. If the same build
   serves touch users, reduced density costs them accuracy.

Target size requirements are an accessibility matter with a standard behind them — see
[accessibility.md](accessibility.md) rather than treating a Material default as the requirement.

## What to record

State the sizes tested, the input mode assumed at each, and which checks needed a running interface
rather than a reading of the code. A layout claim from source inspection alone should say so.
