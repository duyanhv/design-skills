# Accessibility

Apple's [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
page is organized by human capability: Vision, Hearing, Mobility, Speech, and Cognitive. That is a
better checklist than a list of API names, because it asks what someone needs rather than what the
framework offers.

**Scope limit, stated up front.** This is a design guide pointing at Apple's guidance. It is not a
conformance standard. If the project must meet WCAG or a legal requirement, that is a different
document with its own normative criteria and testing rules, and satisfying the HIG does not
establish conformance to it. Say which standard you are applying.

## Labels and semantics come first

The most common defect, by a wide margin, is an icon-only control with no accessible label. Apple's
[VoiceOver](https://developer.apple.com/design/human-interface-guidelines/voiceover) page asks for
alternative labels for key interface elements, meaningful images described, decorative images
excluded, and headings used so people can navigate the hierarchy.

A label is not the same as a description, and neither is the same as a *trait*. A button that
announces "star" tells someone what the glyph looks like; "Add to Favorites, button" tells them what
it does and what it is. Check:

- Every icon-only control has a label naming the action, not the picture.
- Decorative images are hidden from assistive technology rather than announced.
- Headings are marked as headings.
- Grouping and order are specified where the visual order differs from the code order.
- A custom control exposes a role/trait, not just a tap handler on a shape.
- Layout or content changes are announced. Apple's VoiceOver page addresses informing VoiceOver when
  visible content or layout changes.

## Targets and spacing

Apple's accessibility guidance covers offering sufficiently sized controls and treats spacing
between controls as being as important as their size. Two adjacent 44pt targets with no gap are
still easy to mis-hit.

Read the platform's own page for the actual minimum, record its units, and do not carry an iOS
number to watchOS or a pointer-based platform. And before filing any target finding, resolve the
visible-size-versus-hit-region question described in [actions.md](actions.md): a small glyph inside
a large tappable row is fine, and the screenshot cannot tell you which you are looking at.

## Not color alone, not sound alone, not gesture alone

Apple's page asks for information conveyed by more than color, haptics used in addition to audio
cues, audio cues augmented with visual ones, and alternatives to gestures. The shape of the check is
the same each time: **every channel needs a redundant one.**

- A status shown only by color needs text or a symbol. See [appearance.md](appearance.md).
- A sound-only notification needs a visible or haptic counterpart.
- A custom gesture (swipe, long-press, multi-finger, drag) needs an equivalent that is reachable
  without it. Apple's VoiceOver page notes custom gestures are not always accessible.
- A hover-only affordance needs a non-pointer path.

## Keyboard, Voice Control, Switch Control

Apple asks that people be able to use the keyboard alone to navigate and interact, and to support
Switch Control and Voice Control. Concretely: everything reachable by touch should be reachable by
keyboard, focus order should follow the visual order, focus should be visible, and a modal should
trap focus and return it on dismissal.

Voice Control largely works from the visible label, which is another reason the label should name
the action. A control labelled "star" cannot be operated by saying what it does.

## Motion and time

[Motion](https://developer.apple.com/design/human-interface-guidelines/motion) asks that motion be
purposeful, optional, and cancellable, and Apple's accessibility page cautions about fast-moving and
blinking animations and about minimizing time-boxed elements.

Check that the app honors Reduce Motion, that any auto-advancing carousel or auto-dismissing message
can be paused or has a non-timed path, and that nothing important is conveyed only during an
animation. A toast that disappears after two seconds is a time-boxed element carrying information.

## Cognitive

The quietest section, and the one reviews skip. Apple asks for simple, intuitive actions, minimal
time pressure, and support for Assistive Access. In review terms: is the primary path completable
without remembering a previous screen, is jargon avoidable, are errors recoverable, and is anything
irreversible clearly marked before it happens?

## What to check in the code

1. Accessibility labels on every icon-only control; `accessibilityHidden` on decorations.
2. Traits/roles on custom controls, and heading markers on headings.
3. Dynamic Type support, per [typography.md](typography.md).
4. Reduce Motion, Reduce Transparency, Increase Contrast, and Bold Text being honored.
5. Focus order and focus visibility, including modals.
6. Timed UI and whether it can be paused or extended.
7. Custom gestures and their alternatives.

## Verify, and be honest about what you did not

Most accessibility claims cannot be settled statically. Distinguish what you ran from what you read:

- Navigate the screen with VoiceOver using swipe navigation only, and listen to every announcement.
- Run the Accessibility Inspector audit, and treat its findings as leads rather than a pass mark.
- Complete the task with a hardware keyboard only.
- Try Voice Control by speaking the visible labels.
- Turn on Reduce Motion, Reduce Transparency, Increase Contrast, Bold Text, and the largest text
  size, one at a time.
- Note explicitly which of these you did not run. An automated audit that reports no issues is not
  evidence that the screen is usable with VoiceOver.
