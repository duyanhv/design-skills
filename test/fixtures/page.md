# Toggles

A toggle switches a single setting between two states.

## Best practices {#Best-practices}

Toggles are made of three things:

- **Style** — appearance
- **Content** — label
- **Role** — meaning

**Make toggles easy for people to reach.** Give a toggle a hit region of at least 44x44 pt so people can flip it without precision, whether they use a finger or a pointer.

**Avoid using a toggle for an action that takes effect later.** People expect the change to happen immediately.

**Consider pairing a toggle with a short description.** A description can clarify what the setting controls.

## Content {#Content}

**Use a label that names the setting, not the state.** "Wi-Fi" is clearer than "On".

## Platform considerations {#Platform-considerations}

_No additional considerations for tvOS._

### iOS, iPadOS {#iOS-iPadOS}

**Prefer the switch style in lists of settings.** It matches the system Settings app.

### macOS {#macOS}

#### Checkboxes {#Checkboxes}

**Use a checkbox instead of a switch inside a form.** Forms on the Mac typically use checkboxes; a contrast ratio of 4.5:1 is still required for the label.

### visionOS {#visionOS}

**Don't shrink toggles below 60x60 pt.** Eyes need a larger target than fingers.

## Resources {#Resources}

#### Related {#Related}

**Sliders** — not a rule, this is navigation.

## Change log {#Change-log}

| Date | Changes |
| --- | --- |
| June 10, 2024 | Added visionOS guidance. |
| December 5, 2023 | New page. |
