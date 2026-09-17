# Planted defects — notification-settings (before)

Written **before** the blind review and kept outside the reviewing agent's workspace. Used only for
scoring after the review is captured verbatim.

Target: web, `@material/web@2.5.0`, light and dark, phone and desktop from one build. Each entry
notes what was intended and which guide area should reach it.

Every defect below is one a real Material codebase produces. None is a trick: no invented API, no
syntax error, nothing that a linter would catch for free.

## Intended defects

**M1. Hard-coded hex colours throughout.** Surfaces, text, and borders are literals rather than
`--md-sys-color-*` roles. The screen is legible in light and unreadable in dark, because a literal
has no `on-` partner. → `theming.md` (roles, not a palette).

**M2. A role used for the wrong job.** `--md-sys-color-primary` is used as a page background, with
body text on top of it. `primary` is an accent for emphasis; its `on-primary` partner is for content
*on* it, and body text at that size is the wrong content for it. → `theming.md` (pairing).

**M3. Three filled buttons on one screen.** "Save", "Send test", and "Reset" are all
`md-filled-button`, so the screen claims three primary actions. → `components.md` (emphasis is a
priority claim).

**M4. A destructive action styled the same as the safe ones.** "Reset all settings" is a filled
button beside "Save", with no confirmation and no visual distinction. → `components.md`.

**M5. Status by colour alone.** Each category row shows a coloured dot for Off/Quiet/Immediate and
nothing else — no text, no icon, no accessible name. → `accessibility.md` (second channel),
`components.md` (states).

**M6. A disabled control carries information nothing else does.** When notifications are off, the
category list is disabled but still on screen, and the disabled styling is the only indication that
the settings below are inert. → `accessibility.md` (disabled is exempt from contrast, so it must not
be the only carrier), `components.md`.

**M7. Placeholder used as the only label on the time inputs.** The do-not-disturb start and end
inputs have `placeholder` and no `<label>`, so the field's name disappears once the user types, and
assistive technology has nothing stable to announce. → `components.md` (text fields: the label is
not decoration), `accessibility.md` (name, role, value).

**M8. Error state is a red border with no message.** An invalid do-not-disturb window (end before
start) turns the field red and says nothing about what is wrong or how to fix it.
→ `components.md` (error state), `accessibility.md` (colour alone).

**M9. A heading role applied to a non-heading element.** The screen title is a `<div>` styled with
the `headline-medium` type role, so it looks like a heading and is not one. Nothing that navigates
by structure can find it. → `typography.md` (a type role is not a semantic element).

**M10. Fixed pixel heights on rows containing text.** Each category row is `height: 56px`, so at
increased text size the label clips rather than the row growing. → `typography.md` (text must
survive the user's settings), `layout.md`.

**M11. No response to width at all.** One fixed `max-width` for every window, with a label and a
fixed-width control side by side in a flex row that cannot reflow. → `layout.md` (a size change is a
behaviour change; the label-beside-a-control row breaks first).

**M12. Touch target smaller than the visible affordance suggests.** The per-row icon button is
`24px` with no padding, so its interactive area is smaller than the minimum a pointer-and-touch
build needs. → `accessibility.md` (target size, WCAG 2.2 SC 2.5.8), `layout.md` (density).

## Deliberate non-defects

Included so that a review flagging them is scored as a false positive, not a find:

**N1. The brand accent is not Material's default purple.** A custom seed colour is a legitimate
choice; `theming.md` says so explicitly. Flagging it as wrong theming is a miss of that guidance.

**N2. `md-switch` for "all notifications".** A single independent boolean is exactly what a switch
is for. There is nothing to fix here.

**N3. The native `<input type="time">`.** `@material/web@2.5.0` ships no time picker at any path —
verified from the published tarball — so the native input is correct, not a shortcut. Recommending
`md-time-picker` would be recommending something that does not exist.

## Scoring rules, fixed in advance

- **Found**: the review names the defect and the reason.
- **Partial**: names the symptom but not the cause, or the right element for the wrong reason.
- **Missed**: not raised.
- **False positive**: raises a non-defect above, or an invented problem.

A defect is not re-scored after the fact. If the outcome is arguable the disagreement is recorded
rather than resolved in the review's favour, and anything the review finds that is not on this list
is recorded as **unanticipated** and does not count toward the score.
