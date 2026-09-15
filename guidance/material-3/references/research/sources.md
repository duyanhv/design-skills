# Material 3 source map

Start with [Material Design 3](https://m3.material.io/) for system-wide design guidance. Follow its
current navigation to the component or foundation involved in the task, rather than guessing a
deep link or assuming older Material 2 guidance applies.

## Android and Compose

[Material Design 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)
describes the Compose implementation. It groups theming into color, typography, and shape, exposed
through `MaterialTheme`. For a Compose task, inspect whether the affected code reads those theme
values or overrides them locally. Check light and dark schemes and any dynamic-color fallback.

Google's page also distinguishes newer Expressive work and experimental APIs. Verify support in
the project's dependency version; do not copy an example's version assumptions into a migration.

These are brief orientation notes. Read the linked documentation before choosing specific tokens,
component variants, API names, numeric values, or platform behavior.

## Web

The [official Material Web repository](https://github.com/material-components/material-web) provides
implementation documentation. Its [theming guide](https://github.com/material-components/material-web/blob/main/docs/theming/README.md)
describes reference, system, and component tokens. Follow the relevant layer when investigating
an override: a component-level change should not accidentally redefine the theme for unrelated UI.

Check that repository's current status and supported components before recommending it for a new
project. It is distinct from the MUI React library. When the project uses another implementation,
consult that implementation's documentation for its APIs and defaults.

## Questions to settle before copying a specification

- Which platform and implementation does the source describe?
- Which theme role or component state does the value belong to?
- Does the example require an API or design variant absent from this project?
- Is the value a default, a permitted customization, or a requirement with exceptions?

Record those answers alongside the official source section. Keep brand choices and application
conventions separate from claims about the Material specification.
