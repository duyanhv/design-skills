# Theming and color roles

Material 3's color system is a set of **roles**, not a palette. A role names what a color is for —
`primary`, `on-primary`, `surface`, `surface-container-high`, `error` — and the theme supplies the
value. Getting this right is most of what "looks like Material" means, and getting it wrong is the
most common finding in a Material review.

**Read first:** [Color roles](https://m3.material.io/styles/color/roles) and
[the color system](https://m3.material.io/styles/color/system/overview).

## The question to ask about any color

Not "is this the right blue" but **"which role is this, and is it paired correctly?"**

Every role has an `on-` partner that is designed to be legible on it. `on-primary` is for content
on `primary`, `on-surface-variant` for secondary content on a surface. A hard-coded hex has no
partner, which is why it survives the light theme and fails in dark.

When you find a literal color in a component:

1. Identify what the color is *for* — a container, text on a container, an outline, a disabled state.
2. Find the role that names that job.
3. Check whether the theme already defines it. It usually does.
4. Replace the literal with the role, then check both schemes.

Say which step produced the finding. "This hard-codes a hex value where the theme defines
`primary`" is checkable — name the literal you found in the code. "The colors are off-brand" is
not.

## Three layers, and a change belongs to exactly one

The [Material Web theming guide](https://github.com/material-components/material-web/blob/main/docs/theming/README.md)
names them, and the distinction is what stops a local fix becoming a global one:

| Layer | What it is | Changing it affects |
| --- | --- | --- |
| Reference | the source palette | everything derived from it |
| System | the roles: `primary`, `surface`, `on-surface` | every component using that role |
| Component | one component's own tokens | that component |

A button that should be a different color is a **component-level** change. Redefining `primary` to
fix one button is the bug: it silently repaints every other surface that role touches. Before
proposing a token change, say which layer it sits at and what else reads it.

## Dark theme is not an inversion

Material's dark scheme is a separate set of role values, not the light scheme with the lightness
flipped. Elevation behaves differently too: in light, elevation is a shadow; in dark, higher
surfaces are also *lighter*, through the `surface-container` roles. See
[elevation](https://m3.material.io/styles/elevation/overview).

So a dark-mode check is: does each surface use a `surface-container*` role appropriate to its
elevation, and does its content use the matching `on-` role? A dark screen where everything sits on
plain `surface` reads flat because the hierarchy was carried by shadow alone.

## Dynamic color changes the values, not the roles

On Android, dynamic color derives the scheme from the user's wallpaper. That is precisely why roles
matter: a design pinned to specific hex values cannot participate, and a design expressed in roles
adapts for free.

If a project supports dynamic color, check the fallback scheme too — the values a device supplies
are not knowable in advance, so a contrast result measured against your static theme says nothing
about what a user sees. State which scheme you measured.

## What this guide does not give you

No token values, no ratios, no numbers. Material's roles are defined per-theme and the numbers that
matter are the ones in *this* project's theme. Read them out of the theme, cite the source section
for the rule you are applying, and keep brand choices separate from specification claims.

For contrast requirements specifically, the standard is WCAG, not Material — see
[accessibility.md](accessibility.md).
