# Pre-registered expectations

**Written before the build ran, and kept outside the agent's workspace.** Published verbatim
afterwards, including anything the run got right that this did not anticipate, and anything this
predicted that turned out to be wrong.

The point of writing these first is that a trap list assembled after seeing the output is not a
test, it is a description. The Apple build example used the same protocol; this one applies it to
Material and to a library whose gaps I verified rather than assumed.

## How the traps were chosen

Every trap below is a **verified fact about `@material/web@2.5.0`**, read out of the published
tarball rather than recalled:

```
npm pack @material/web@2.5.0 && tar tzf material-web-2.5.0.tgz
```

Stable top-level components: `button checkbox chips dialog divider elevation fab icon iconbutton
list menu progress radio select slider switch tabs textfield typography`.

Under `labs/` (not stable): `badge behaviors card gb item navigationbar navigationdrawer
navigationtab segmentedbutton segmentedbuttonset`.

`package.json` declares no `exports` map, so deep imports are how anything is reached.

## The traps

| # | Trap | What the guides should produce |
| --- | --- | --- |
| **T1** | **The obvious component for a three-state choice is a segmented button, which 2.5.0 ships only in `labs/`.** `components.md` says to confirm a component exists in the installed version and to name what that version calls it. | Either uses `labs/segmentedbutton` **and** flags it as experimental, or picks a stable alternative (radio group, select) and says why. A silent import of a labs path as though it were stable is a miss. |
| **T2** | **There is no time picker in 2.5.0.** Neither stable nor labs. The "do not disturb window" invites one. | Uses a native `<input type="time">` or equivalent and says the library does not provide this. Inventing `<md-time-picker>` is the failure mode. |
| **T3** | **Turning notifications off strands the category controls.** Same shape as the Apple build's T3: a disabled subtree still has to be comprehensible. | Hides or disables them deliberately and says which, and does not leave a disabled control as the only carrier of information. Bonus if it connects this to the disabled-contrast exception in `accessibility.md`. |
| **T4** | **Dark mode is the app's job here.** `theming.md` says a hard-coded colour has no `on-` partner and survives light while failing dark. The task mentions light and dark without saying how. | Uses Material's colour role tokens (`--md-sys-color-*`) rather than hex literals, so both schemes work from one definition. Hex values for surfaces or text is the miss. |
| **T5** | **"How many are Immediate" is derived state.** Storing it invites drift. | Computed at render from the category state, not held in a field that has to be kept in sync. |
| **T6** | **The test action is async and can fail.** Needs a pending state, repeat protection, and a failure path that is not colour alone. | Disables or guards the control while in flight, and reports success and failure with text, not only a red/green colour — `accessibility.md` requires a second channel. |
| **T7** | **The screen is used on phones and desktops from one build.** `layout.md` calls a size change a behaviour change, and warns that a row of a label and a fixed-width control breaks first at large text. | Some deliberate response to width, and some acknowledgement of text scaling. Not necessarily a navigation rail — this is one screen, not an app shell — but a stated decision rather than a fixed-width layout. |

## What I expect to go wrong

Recorded now so that agreeing with the outcome later cannot be hindsight:

- **T1 and T2 are the ones I expect to fail.** An agent that knows Material will reach for a
  segmented button and a time picker, because both are in the design system even though neither is
  in this library at this version. This is the exact "the library is not the specification" gap
  `components.md` was written for, and it is the most useful thing this example can test.
- **T4 I expect to pass**, because `theming.md` is emphatic and role tokens are the documented way.
- **T5 I expect to pass**; it is the same trap the Apple build handled.
- **T7 I expect to be partial** — some media query, little about text scaling.

## Scoring rules, fixed in advance

- **Avoided**: the trap did not catch the run at all.
- **Handled**: the run hit the issue and dealt with it explicitly, saying so.
- **Missed**: the run did the wrong thing, or did the right thing silently where the guide asks for
  the reasoning to be stated.
- A trap is not re-scored after the fact. If the outcome is arguable, the disagreement is recorded
  rather than resolved in the run's favour.

Anything the run does well that is not in this list is recorded separately as **unanticipated**, and
does not count toward the score.
