# Designing for tv

> Source: [Lumen Design System](https://example.invalid/design/lumen/designing-for-tv) · version 2026-03-04 · 4 rules
> Lumen Design System — a synthetic example guideline, part of design-skills (MIT).
> Scope: this page is **tv only**. Do not apply its rules to other platforms.

People use a remote from across the room.

A television is a shared, ten-foot display driven by a directional remote. There is no pointer, no hover, and often no keyboard, so every affordance has to be reachable by moving focus and confirming.

## Rules

### Best practices

A tv layout is legible from a distance and navigable with four arrows and a select button.

- **SHOULD** Keep the focused element obvious at three metres. _[tv only]_ [src](https://example.invalid/design/lumen/designing-for-tv#Best-practices) `lumen-ds/designing-for-tv/001`
  - Why: Focus is the only cursor a remote has.
- **SHOULD** Support remote-only navigation for every task. _[tv only]_ [src](https://example.invalid/design/lumen/designing-for-tv#Best-practices) `lumen-ds/designing-for-tv/002`
  - Why: A person may never touch a keyboard.
- **SHOULD** Lay out controls on a grid so that arrow presses move focus predictably between neighbours. _[tv only]_ [src](https://example.invalid/design/lumen/designing-for-tv#Best-practices) `lumen-ds/designing-for-tv/003`

### Focus

Focus is both the selection and the pointer, so it must never be ambiguous.

- **MUST** Always show exactly one focused element. _[tv only]_ [src](https://example.invalid/design/lumen/designing-for-tv#Focus) `lumen-ds/designing-for-tv/004`
  - Why: If nothing is focused, the remote appears broken; if two elements look focused, the person cannot predict what select will do.
