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

`package.json`, `package-lock.json`, and `Podfile.lock` in this directory are the exact versions the
results were produced against. RN's text behaviour changes between minor versions, so a result from
a different version is a different result.

The RN app template itself is **not** vendored here — it is an Xcode project of ~40 files that would
swamp the diff of a documentation repository. `bootstrap.sh` fetches it by pinned version, then
overwrites its dependency set with the lockfiles above and runs `pod install --deployment`, which
fails rather than silently re-resolving. So this needs network on first run, and that is a real
limitation rather than a hidden one.

```
react-native 0.76.5   New Architecture (Fabric, bridgeless)
react        18.3.1
Xcode        27.0 (27A266a)
Simulator    iPhone 17 Pro, iOS 26.5
```

## Running it

```sh
# 1. Create the app. Fetches the pinned template, npm ci, pod install --deployment. (~1 min)
./bootstrap.sh                 # -> ./app, gitignored

# 2. Source inspection — fast, no build, no simulator.
./inspect-source.sh app/node_modules/react-native

# 3. Runtime — one clean build per variant, captures, diffs. (~5 min)
./run-variants.sh              # writes captures/ and results.tsv
```

An earlier version of this file told you to `cd ios && pod install` in a directory that was never
committed, and the runner expected an app to already exist at a path in `/tmp`. From a clean
checkout there was nothing to build. `bootstrap.sh` is the fix, and the results below were
regenerated through it from a fresh `git clone`.

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

A variant that fails to build aborts the whole run. Continuing would leave the previous run's
capture on disk, and the next diff would silently compare against a stale image.

The control variant exists because "the screenshot did not change" has two explanations, and the
boring one (the build did not pick up the edit) has to be ruled out before the interesting one is
believable.

## Measuring a difference

Percentages in the README come from this, not from looking:

```sh
./pixel-diff.sh captures/A-uncapped.png captures/B-max-multiplier.png
# -> 0.00   (identical)
```

It counts pixels differing in any RGB channel, over the total, so "53%" means 53% of pixels are not
identical, at any magnitude. A large number means the screens differ; it does not say they differ
*usefully*. Read it alongside the captures.

**The status bar is excluded** (top 140 px; pass `--full` to include it). The simulator clock
advances between builds, and an otherwise pixel-identical pair read as 0.06% different because of
it. That mattered here: the whole `maxFontSizeMultiplier` finding rests on a zero. A reproduction
from a clean clone caught this, because the original run happened to capture both variants inside
the same clock minute.

## What this harness cannot tell you

- **VoiceOver.** Not scripted here and not run. Roles and labels are unverified in speech.
- **Touch.** Simulator clicks are not fingers. `hitSlop` is verified as layout, not as ergonomics.
- **Android.** Not built. Several of these props behave differently there by design.
