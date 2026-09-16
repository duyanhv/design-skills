# Pre-registered expectations (written BEFORE the build run)

NOT visible to the building agent. Traps deliberately embedded in the task, and what the skill
should cause an agent to do about them.

## Traps in the request

T1. **iOS 16 floor vs. iOS 17+ APIs.** The obvious modern implementations use iOS 17+ API:
    `@Observable` (17), `.onChange(of:) { old, new }` two-param form (17), `ContentUnavailableView`
    (17), `.scrollBounceBehavior` (16.4). The skill's platforms.md says to confirm the component's
    API exists in the project's minimum OS version. A good result either stays on iOS 16 API
    (`ObservableObject`/`@Published`, one-param `onChange`) or flags availability explicitly.

T2. **Three-state category setting invites the wrong control.** Off/Quiet/Immediate is three
    mutually exclusive options. A `Toggle` cannot express it. The skill's forms.md maps "one of a
    few visible, mutually exclusive options" to a segmented control, and "one of a medium-to-long
    list" to a picker. Using a switch here would be a real mistake.

T3. **"Turn all notifications off" should disable, not hide.** Hiding the categories when the master
    switch is off loses context and breaks VoiceOver continuity. Either is defensible; the skill
    asks that a disabled control's reason be discoverable, so disabling with an explanation is the
    better answer and hiding without explanation is the weaker one.

T4. **A settings screen that duplicates system settings.** Notification permission is a system
    concern. The skill's forms.md says to respect systemwide settings rather than duplicating them,
    and settings guidance says to avoid asking for what the system can provide. A strong result
    mentions deep-linking to Settings for the OS-level permission rather than pretending the app
    owns it.

T5. **"Send a test notification" is an async action with failure.** actions.md asks for repeat
    protection, progress, and a stated outcome. Silent success/failure or a double-fire would be a
    defect.

T6. **Counting "how many are Immediate" is derived state.** Should be computed, not stored, or it
    can desynchronise. This is a correctness point rather than a design one; included to see whether
    the agent distinguishes them.

## What good looks like, per the skill's own instructions

- Establishes platform, minimum OS, framework, and system-vs-custom before choosing components.
- Uses semantic colours and text styles; no hex literals, no fixed point sizes.
- Accessibility labels on any icon-only control; no colour-only status.
- Cites official pages with section anchors where it makes a specification-dependent claim.
- Labels its own preferences as design suggestions, not requirements.
- States what it could not verify (it has no simulator here).
- Does NOT invent rule IDs; this bundle has no rule catalogue.

## Failure modes worth watching for

- Quoting a numeric specification (44pt, a type size, a contrast ratio) as though from memory.
- Claiming a design was "verified" when nothing was run.
- Confusing visible glyph size with interaction bounds.
- Using a `Toggle` for the three-state category setting (T2).
