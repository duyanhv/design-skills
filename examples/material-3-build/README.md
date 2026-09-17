# Worked example: building a Material screen with the skill

The [review example](../material-3-review/) tests whether the skill helps an agent *judge* an
existing Material screen. This one tests the other half: whether it helps an agent *build* one.

## Protocol

Same shape as the [Apple build example](../apple-design-build/), and the traps were pre-registered
for the same reason: a trap list assembled after seeing the output is a description, not a test.

1. [`TASK.md`](TASK.md) was written with seven traps embedded. The
   [expectations](expectations.md) naming them — **including which two I predicted would fail** —
   were written before the run and kept outside the agent's workspace.
2. Every trap is a verified fact about `@material/web@2.5.0`, read out of the published tarball
   rather than recalled.
3. A separate agent, in an isolated directory with the library really installed, received only the
   task and the skill.
4. Its output is published exactly as produced: [`notification-settings.js`](notification-settings.js),
   [`notification-settings.css`](notification-settings.css), [`NOTES.md`](NOTES.md).
5. Only then was it checked, by [`verify.ts`](verify.ts) and by reading.

## The traps, and what happened

| # | Trap | Outcome |
| --- | --- | --- |
| T1 | The obvious component for a three-state choice is a segmented button, which 2.5.0 ships only in `labs/` | **Handled.** Found it at `labs/segmentedbutton*`, read its `.d.ts`, established it is index-addressed with no radiogroup semantics, and chose stable `md-radio` in a `role="radiogroup"` — with the reasoning written down. |
| T2 | There is no time picker in 2.5.0, at any path | **Handled.** "I checked the full custom-element list; there is no `md-time-picker` and no date/time component of any kind." Used native `<input type="time">`, and noted the UA-drawn internals will not match Material's field metrics. |
| T3 | Turning notifications off strands the category controls | **Handled.** Disables rather than hides, so the structure stays comprehensible, and adds a text note rather than leaving the disabled styling to carry the meaning alone. |
| T4 | Dark mode is the app's job; a hex literal has no `on-` partner | **Handled.** Colours come from `--md-sys-color-*` roles. The literals present are `var()` **fallbacks**, in separate light and dark sets, read out of the library's own `_md-sys-color.scss`. |
| T5 | "How many are Immediate" is derived state | **Avoided.** Computed at render. |
| T6 | The test action is async and can fail | **Handled.** In-flight state with an indeterminate progress indicator, and success and failure reported as an icon *plus* text. |
| T7 | One build serves phones and desktops | **Handled.** Container queries, with labels that wrap and stack rather than sitting in fixed-width rows. |

**7 of 7 handled.**

## My predictions were wrong, and that is the result

[`expectations.md`](expectations.md) says, before the run:

> **T1 and T2 are the ones I expect to fail.** An agent that knows Material will reach for a
> segmented button and a time picker, because both are in the design system even though neither is
> in this library at this version.

Both were handled, and handled in the specific way `components.md` asks for: not by knowing the
answer, but by **checking the installed package** and writing down what it found. The agent read
`labs/segmentedbutton/internal/segmented-button.d.ts` to establish the component's selection API
before rejecting it.

That is the one prediction in this example worth having been wrong about. It is also the reason the
prediction was written down first: a trap list produced afterwards would have quietly recorded these
as easy.

## What `verify.ts` checks, and what it cannot

Several traps are decidable mechanically — whether a labs path was imported, whether any import
names a component that does not exist in 2.5.0, whether colours are roles or literals, whether the
count is derived. Those run as a script so the scoring is not my reading.

It found nothing in the output, and **two false alarms in itself**, both recorded in its source:

- it first missed the pending state, because the run expressed it as a status machine plus a
  progress indicator rather than an `isSending` flag
- it first counted `var(--md-sys-color-surface, #fef7ff)` as a hard-coded colour, which is the
  opposite of the defect: a fallback still yields to any theme the host defines

A check that only recognises the shape I imagined is checking my imagination.

## Not established

- **Never rendered.** No browser, no screenshots. Every claim here is about the source and the
  package, not about pixels.
- **No screen reader.** Roles and names are present in the code and unheard.
- **No device.** Container queries are read, not observed; touch targets are declared, not measured.
- **One task, one run, no control arm.** This shows what one agent did with the guides on one
  screen. It does not establish that the guides caused it.
