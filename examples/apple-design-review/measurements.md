# Runtime measurements

Everything here was measured on a running app, not inferred from code or screenshots. Method and
conditions are recorded so the numbers can be rechecked.

**Conditions:** iPhone 17 Pro, iOS 26.5, light appearance, default text size, Xcode 27.0
(27A266a), Swift 6.4, target `arm64-apple-ios18.0-simulator`. Full detail in
`screenshots/before-conditions.txt` and `screenshots/after-conditions.txt`.

## Touchable regions

Measured with `UIWindow.hitTest(_:with:)` sampled on a 0.5 pt grid, recording where a touch actually
reaches the control. This is the only method that settles a hit-target question: a frame in the code
and a shape in a screenshot can both disagree with what UIKit hit-tests.

| Control | Before | After | Method |
| --- | --- | --- | --- |
| Toolbar item | **39.5 × 26.5 pt** | **39.5 × 39.5 pt** | hit-test grid |
| Toolbar item, visual glass container | 44.0 × 44.0 pt | 44.0 × 44.0 pt | screenshot pixel bbox |
| Toolbar item, declared frame | 24 × 24 pt | none (system default) | source |
| Row remove control | 20.0 × 20.0 pt | removed; now a swipe action plus an accessibility action | `GeometryReader` |
| Send button | 68.7 × 38.0 pt | `.borderedProminent` + `.controlSize(.large)` | `GeometryReader` |

**The toolbar item is the interesting case.** Three different measurements of the same control
disagree, and only one of them answers the question:

- the declared frame says 24 × 24,
- the rendered Liquid Glass container measures exactly 44 × 44,
- the region that actually receives a touch is 39.5 × 26.5.

A touch at the glass container's corner lands on `NavigationBarContentView`, not on the button.
After removing the explicit frame the touchable region becomes 39.5 × 39.5, which is what the system
supplies for a toolbar item on this OS version. The remaining gap to 44 is therefore a system
metric, not something this screen controls, and it is reported here rather than "fixed".

## Appearance adaptation

Pixel diff between the light and dark captures of the same build, excluding the status-bar rows
(the clock differs between captures). A screen that adapts should differ almost everywhere.

| Build | Pixels differing between light and dark |
| --- | --- |
| Before | 13,617 / 2,993,292 — **0.45 %** |
| After | 2,986,648 / 2,993,292 — **99.78 %** |

The before figure is the defect stated numerically: the only pixels that changed were the ones the
*system* drew. Those same system-drawn pixels also prove the device really was in dark appearance
when the capture was taken.

## Dynamic Type

Pixel diff between the default-size and AX5 captures of the same build.

| Build | Pixels differing between default and AX5 |
| --- | --- |
| Before | 613,588 / 2,993,292 — **20.50 %** |
| After | 1,386,229 / 2,993,292 — **46.31 %** |

The before figure is not zero because one control — the single `TextField` with no `.font()`
modifier — kept the system default and scaled while everything around it did not. That is visible in
`before-xxxl.png` as an enlarged field beside an unchanged button.

## Not measured

- VoiceOver output, Voice Control, Switch Control, and the Accessibility Inspector audit. No
  automated way to drive them was used here, so every claim about announced strings is inference
  from the code, not an observation.
- Increase Contrast, Reduce Transparency, Reduce Motion, Bold Text.
- Real taps on a device. The hit-test grid measures what UIKit would route, which is strong evidence
  but is still not a finger on glass.
- iPad, landscape, RTL, and localisation.
