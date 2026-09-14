# Buttons

> Source: [Lumen Design System](https://example.invalid/design/lumen/buttons) · version 2026-03-04 · 4 rules
> Lumen Design System — a synthetic example guideline, part of design-skills (MIT).

A button performs a single, immediate action.

A button combines a label, an optional icon, and a role. Use a button for actions, and a link for navigation.

## Rules

### Best practices
A button is recognisable when its target is large enough and its label names the action.

- **SHOULD** Give every button a comfortable target. — `at least 44x44 pt` [src](https://example.invalid/design/lumen/buttons#Best-practices) `lumen-ds/buttons/001`
  - Why: A button needs a hit region of at least 44x44 pt on touch inputs, and 32x32 pt with a precise pointer.
  - **Note:** On tv, a focused button grows by 10 percent, so leave room for the focused size.
- **MAY** Consider using an icon-only button when the action is universally understood. [src](https://example.invalid/design/lumen/buttons#Best-practices) `lumen-ds/buttons/002`
  - Why: Close, back and search read clearly without a label. Anything else needs text.
- **MUST** Show only one primary button per view. [src](https://example.invalid/design/lumen/buttons#Best-practices) `lumen-ds/buttons/003`
  - Why: Two primary buttons make the default action ambiguous.

### Roles
A role changes both appearance and behaviour:

- **Primary.** — The action the person is most likely to take. [src](https://example.invalid/design/lumen/buttons#Roles)
- **Destructive.** — The action removes data and cannot be undone. [src](https://example.invalid/design/lumen/buttons#Roles)
- **MUST** Never give the destructive role to the primary button. [src](https://example.invalid/design/lumen/buttons#Roles) `lumen-ds/buttons/006`
  - Why: People activate a prominent button without reading it.

### Sizes

Buttons come in three sizes.

| Size | Height | Label |
| --- | --- | --- |
| Small | 28 pt | 13 pt |
| Medium | 36 pt | 15 pt |
| Large | 44 pt | 17 pt |
