# React Native pilot: harness

Everything needed to re-run the experiments in [../README.md](../README.md). The first version of
this pilot published percentages and a "no native implementation" claim with no way for a reader to
check either, and an audit called that what it was: an assertion.

Two kinds of evidence here, kept apart on purpose:

- **Source inspection** (`inspect-source.sh`) — reads the pinned `node_modules`. No simulator, no
  build. Deterministic, and it is what settles which renderer reads which prop.
- **Runtime capture** (`run-variants.sh`) — builds the app once per variant, sets the accessibility
  text size, screenshots, and diffs. Needs Xcode and a booted simulator.

## Pinned versions

`package.json` and `Podfile.lock` in this directory are the exact versions the results were produced
against. RN's text behaviour changes between minor versions, so a result from a different version is
a different result.

```
react-native 0.76.5   New Architecture (Fabric, bridgeless)
react        18.3.1
Xcode        27.0 (27A266a)
Simulator    iPhone 17 Pro, iOS 26.5
```

## Running it

```sh
# 1. Source inspection — fast, no build, no simulator.
./inspect-source.sh            # prints a table of which renderer reads which prop

# 2. Runtime — installs, pods, builds, captures. Slow (~10 min cold).
npm install && (cd ios && pod install)
./run-variants.sh              # writes captures/ and results.tsv
```

`run-variants.sh` drives the accessibility text size through the simulator's
`Accessibility` domain rather than through the Settings UI:

```sh
xcrun simctl spawn "$UDID" defaults write \
  com.apple.UIKit UIPreferredContentSizeCategoryName \
  UICTContentSizeCategoryAccessibilityXXXL
```

Each variant is a file in `variants/`, copied over `App.tsx` before its build.

## The variants

| File | What it tests |
| --- | --- |
| `variants/A-uncapped.tsx` | Baseline. A 34 pt title with default scaling. |
| `variants/B-max-multiplier.tsx` | `maxFontSizeMultiplier={1.4}` |
| `variants/C-inline-cap.tsx` | `fontSize: Math.min(34 * fontScale, 34 * 1.4)` |
| `variants/D-no-scaling.tsx` | `allowFontScaling={false}` with an explicit size |
| `variants/E-dynamic-type-ramp.tsx` | `dynamicTypeRamp="largeTitle"`, which the first pass missed |
| `variants/F-platform-color.tsx` | `PlatformColor('labelColor')` and `DynamicColorIOS`, also missed |
| `variants/CONTROL-edited-text.tsx` | Changes the title's *text*. Proves edits reach the app. |

The control variant exists because "the screenshot did not change" has two explanations, and the
boring one (the build did not pick up the edit) has to be ruled out before the interesting one is
believable.

## Measuring a difference

Percentages in the README come from this, not from looking:

```sh
./pixel-diff.sh captures/A-uncapped.png captures/B-max-multiplier.png
# -> 0.00   (identical)
```

It is ImageMagick's `AE` metric (count of differing pixels) over the total, so "58%" means 58% of
pixels differ by any amount, at any magnitude. A large number means the screens differ; it does not
say they differ *usefully*. Read it alongside the captures.

## What this harness cannot tell you

- **VoiceOver.** Not scripted here and not run. Roles and labels are unverified in speech.
- **Touch.** Simulator clicks are not fingers. `hitSlop` is verified as layout, not as ergonomics.
- **Android.** Not built. Several of these props behave differently there by design.
