# Accessibility

The most useful thing this guide can do is keep two things apart: **what a standard requires** and
**what Material advises**. They are different documents with different authority, and a review that
blends them either overstates a suggestion or understates a requirement.

**Read first:** [Accessible design](https://m3.material.io/foundations/accessible-design/overview)
for Material's guidance, and [WCAG 2.2](https://www.w3.org/TR/WCAG22/) for the standard.

## Who requires what

| Claim | Whose | Status |
| --- | --- | --- |
| Text contrast ratios | W3C, WCAG 2.2 SC 1.4.3 | normative, testable |
| Target size minimum | W3C, WCAG 2.2 SC 2.5.8 | normative, testable |
| Name, role, value exposed | W3C, WCAG 2.2 SC 4.1.2 | normative, testable |
| "Use sufficient contrast" | Material | advice, pointing at the above |
| Component defaults that happen to conform | the library | evidence about the default, not the screen |

Write findings accordingly. "This fails WCAG 2.2 SC 1.4.3, measured at *x* against the criterion's
requirement for text of this size and weight" is a conformance claim: it names the standard, the
criterion, and a measurement. "Material suggests larger touch areas here" is advice, and saying so
is not a weakness.

Quote the threshold from the criterion when you apply it, rather than from memory or from this
page. The ratio depends on text size and weight, and the criterion carries exceptions that a
remembered number does not.

**This bundle is not a conformance standard.** It does not restate WCAG's thresholds; go to the
criterion, read its exceptions, and cite it.

## The exceptions are where reviews go wrong

WCAG's contrast criterion exempts disabled controls, purely decorative text, and logotypes, and it
sets a lower ratio for large-scale text. A finding raised against a disabled label or a wordmark is
usually wrong for that reason, and raising it costs the credibility of the rest of the review.

Check the exception list before reporting. If it is arguable, say which reading you applied.

## Material's defaults are not proof

A component library implementing Material may ship accessible defaults. That establishes something
about the component in isolation and nothing about the screen, because:

- the default can be overridden, and usually has been
- contrast depends on the **theme's** values, which the project chose
- an accessible control inside an inaccessible structure is still unreachable
- a custom component built to look like a Material one inherits none of it

So verify the rendered interface. "The project uses Material Web, therefore it conforms" is not a
finding; it is a reason not to have looked.

## What a static read cannot settle

Be explicit about the boundary:

| Establishable from source | Needs a running interface |
| --- | --- |
| a semantic element is used | what a screen reader announces |
| an accessible name is supplied | whether that name makes sense in context |
| a focus style is defined | whether focus order follows the visual order |
| a target's declared size | whether it is reachable with a finger |
| a color pair in the theme | contrast at the user's actual settings |

If a screen reader was not run, say so. Roles and labels present in code are a reasonable basis for
"probably fine" and not for "verified".

## Colour is never the only channel

Error states, selection, required fields, and status all need a second signal — text, icon, shape,
position. Check this in the theme, not just one component: an error role defined only as a colour
means every error in the product is colour-only.

See [components.md](components.md) for states and [theming.md](theming.md) for roles.

## A review's own limits belong in the review

State what you examined, at what sizes and settings, in which language, and with which assistive
technology. A finding list without that is not checkable by the person receiving it, and an
unverifiable accessibility claim is worse than none: it invites a team to believe the work is done.
