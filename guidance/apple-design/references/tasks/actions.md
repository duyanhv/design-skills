# Actions, buttons, and destructive operations

Choosing the control that performs something, and making its consequence legible before it happens.

## Pick the surface

| The action is… | Use | Read |
| --- | --- | --- |
| The main thing this screen is for | A prominent button in the content or toolbar | [Buttons › Style](https://developer.apple.com/design/human-interface-guidelines/buttons#Style) |
| One of several comparable choices | Buttons distinguished by *style*, not size | [Buttons › Best practices](https://developer.apple.com/design/human-interface-guidelines/buttons#Best-practices) |
| Secondary, frequent, and screen-wide | A toolbar item | [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) |
| Attached to one specific item | A context menu or swipe action | [Context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus) |
| A list of related commands behind one control | A pull-down menu | [Pull-down buttons](https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons), [Menus](https://developer.apple.com/design/human-interface-guidelines/menus) |
| Choosing among mutually exclusive options | Not a button. See [forms.md](forms.md) | [Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) |
| Rare, and overflowing the toolbar | A More menu | [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) |

## Roles carry meaning, and the system reads them

Apple's Buttons page defines button *roles* as system-defined semantic meanings that can affect
appearance, and it treats the primary and destructive roles separately. Two points from that page
are firm enough to cite directly:

- Assign the primary role to the action people are most likely to choose.
- Do not give the primary role to a destructive action, even when it is the likely choice.

Read [Buttons › Role](https://developer.apple.com/design/human-interface-guidelines/buttons#Role)
for the exact wording and the current list of roles before quoting it as a requirement.

A role is not styling. In SwiftUI, `Button(role: .destructive)` and `.keyboardShortcut(.defaultAction)`
tell the system something that a red `foregroundStyle` does not; the system uses roles for
placement, appearance adaptation, and assistive-technology semantics. Coloring a label red and
calling it destructive leaves that meaning unstated. Check which was actually used.

## Destructive actions

The consequence, not the visual weight, decides the treatment. Ask three questions in order:

1. **Is it reversible?** An undoable delete and a permanent one deserve different friction. See
   [Undo and redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo).
2. **If it needs confirmation, which surface?** An alert interrupts and is for consequences that
   warrant it; an action sheet presents choices originating from a control. Read
   [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) and
   [Action sheets](https://developer.apple.com/design/human-interface-guidelines/action-sheets), and
   check the platform sections, since presentation differs across platforms.
3. **Does the button text name the outcome?** "Delete Draft" is checkable against what the code does;
   "OK" is not. Apple's [Alerts › Content](https://developer.apple.com/design/human-interface-guidelines/alerts#Content)
   covers alert wording.

**Our judgment, not Apple's:** a confirmation whose default is the destructive choice usually
defeats the confirmation. Say so as a design suggestion, not as a cited rule.

## The mistake that wastes the most review time

**A small-looking icon is not a small tap target.** A 16pt SF Symbol inside a 44pt button is
correct, and the symbol size in isolation proves nothing. Before reporting a hit-target finding,
trace the *interactive view*: padding, `frame`, `contentShape`, `.buttonStyle`, the parent stack's
spacing, and whatever the framework adds by default. A list row's whole width is usually tappable
even when the visible glyph is tiny.

The same applies in reverse: a large visual area with a small `contentShape` is a real defect that a
screenshot cannot show. This is a code question, and if you only have a screenshot, say the check is
unverified. Apple's minimum target guidance is per platform; read the relevant platform page rather
than reciting a remembered number, and record the units.

## What to check in the code

1. The semantic role, not the color, for primary and destructive actions.
2. The actual interactive bounds, per the paragraph above.
3. Disabled state: whether it is disabled, and whether anything tells the user *why*. A control that
   is disabled without explanation is a dead end.
4. Repeat protection for a non-idempotent action (double-submit, double-purchase).
5. Whether an async action shows progress and can be cancelled. See
   [Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)
   and [Loading](https://developer.apple.com/design/human-interface-guidelines/loading).
6. A custom (non-system) button's press state. Apple's Buttons page says to always include one; a
   custom control often has none.

## Verify

- Trigger each action, including the failure path, and confirm the result matches the label.
- Confirm a destructive action's confirmation and its undo, if one is claimed.
- Tap near the edges of every icon-only control; hit-target claims need a running app.
- With VoiceOver, confirm each control announces a label *and* a trait, and that a destructive
  action is distinguishable from a benign one by more than color. See [accessibility.md](accessibility.md).
