# Measurements

Everything here was measured on a running app. Each number names the instrument that produced it,
and both instruments are committed so the numbers can be reproduced rather than taken on trust.

**Conditions:** iPhone 17 Pro, iOS 26.5, light appearance, default text size unless stated, Xcode
27.0 (27A266a), Swift 6.4, target `arm64-apple-ios18.0-simulator`. Per-capture settings, as reported
by the device after being set, are in [`screenshots/before-conditions.txt`](screenshots/before-conditions.txt)
and [`screenshots/after-conditions.txt`](screenshots/after-conditions.txt).

## Instruments

| Probe | Question it answers | Run it |
| --- | --- | --- |
| [`probe/main.swift`](probe/main.swift) | Where does a touch land? | `./probe/run.sh before\|after` |
| [`probe/SizeReport.swift`](probe/SizeReport.swift) | How large is the control SwiftUI laid out? | `./probe/sizes.sh before\|after` |

Raw output from both, for both variants, is committed under
[`probe/results/`](probe/results/).

**What the hit-test probe establishes, and what it does not.** It calls
`UIWindow.hitTest(_:with:)` on a 0.5 pt grid and records which view UIKit would route a synthetic
point to. That is programmatic hit-testing. It is *not* a finger on glass: real taps were not
tested, and touch delivery on a device involves input handling this probe does not exercise. The
numbers are strong evidence about view geometry and routing, and they are not a substitute for
device testing.

## Target sizes

| Control | Declared in source | Laid out | Touch reaches |
| --- | --- | --- | --- |
| **Before** — toolbar item | 24 × 24 pt | 24.0 × 24.0 pt | **39.5 × 26.5 pt** |
| **Before** — row remove control | 20 × 20 pt | 20.0 × 20.0 pt | n/a (see note) |
| **Before** — Send | padding only | 68.7 × 38.0 pt | n/a |
| **After** — toolbar item | none (system default) | 26.0 × 26.0 pt | **39.5 × 39.5 pt** |
| **After** — Send | `.controlSize(.large)` | 77.3 × 51.3 pt | n/a |
| **After** — row remove | replaced by a swipe action and an accessibility action | — | — |

Controls inside the SwiftUI body do not get their own `UIView`, so the hit-test probe can only
isolate the toolbar item, which UIKit hosts in an identifiable view. In-body controls are reported
by the size probe instead. This is a limitation of the instrument, not a finding about the controls.

### The toolbar item, where three measurements disagree

| What was measured | Value | What it supports |
| --- | --- | --- |
| Declared frame in the source | 24 × 24 pt | the app asked for something small |
| Rendered glass container, from the screenshot | 44.0 × 44.0 pt | what is visible |
| Region the hit-test probe reaches | **39.5 × 26.5 pt** | which view a touch is routed to |

A sampled point at the glass container's corner resolves to `NavigationBarContentView`, not to the
button. The blind review measured the container, concluded the control was adequately sized, and
declined to file a finding; see [`scoring.md`](scoring.md).

After removing the explicit frame, the reached region becomes 39.5 × 39.5 pt. That is what the
system supplies for a toolbar item on this OS version, so the remaining gap to 44 is not something
this screen controls. It is reported here rather than presented as fixed.

## Appearance

Pixel difference between the light and dark captures of the same build, excluding the status-bar
rows (the clock differs between captures).

| Build | Pixels differing between light and dark |
| --- | --- |
| Before | 13,617 / 2,993,292 — **0.45 %** |
| After | 2,986,648 / 2,993,292 — **99.78 %** |

This measures **how much changed**, not whether what changed is correct. A screen could differ in
every pixel and still be unreadable. What makes the before figure a defect is not its size but its
composition: the only pixels that differed were ones the *system* drew, which is also what proves
the device was genuinely in dark appearance. The after screen's correctness rests on reading
[`after-dark.png`](screenshots/after-dark.png), not on the percentage.

## Text size

Pixel difference between the default-size and AX5 captures of the same build.

| Build | Pixels differing between default and AX5 |
| --- | --- |
| Before | 613,588 / 2,993,292 — **20.50 %** |
| After | 1,407,966 / 2,993,292 — **47.04 %** |

The same caveat applies, and more sharply. The before figure is not zero because one control — the
single `TextField` with no `.font()` modifier — kept the system default and scaled while everything
around it did not, producing the mismatched invite row visible in
[`before-xxxl.png`](screenshots/before-xxxl.png). A larger difference is not evidence of usable
Dynamic Type support; the first version of the fixed screen moved the number up while still wrapping
the Send button's title onto two lines. That is a layout defect a percentage cannot see, and it was
caught by looking at the image.

## Known remaining issue

At AX5 the navigation bar's large title truncates to "Quarterly R…". This is the system's large-title
treatment rather than app-drawn text; it is visible in [`after-xxxl.png`](screenshots/after-xxxl.png)
and is left as-is rather than worked around.

## Not measured

- VoiceOver output, Voice Control, Switch Control, and the Accessibility Inspector audit. Every
  claim about announced strings is inference from code, not an observation.
- Increase Contrast, Reduce Transparency, Reduce Motion, Bold Text.
- **Real taps on a device.** See the caveat on the hit-test probe above.
- Intermediate text sizes, the smallest size, iPad, landscape, RTL, and localisation.
