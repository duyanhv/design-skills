# React Native

The Apple guidance in this bundle is written against Apple's own frameworks. Most of it transfers to
React Native, but the *mechanisms* do not: SwiftUI supplies behaviour that RN makes the app's
responsibility. This file covers the gap.

**Pinned to:** React Native 0.76.5, New Architecture (Fabric, bridgeless), iPhone 17 Pro simulator,
iOS 26.5, Xcode 27.0. RN's text behaviour changes between minor versions more than between iOS
versions, so check your own version rather than trusting this.

Claims here are labelled by how they were established, because they are not equally strong. The
harness that produces both kinds lives in the design-skills repository, not in this bundle:

| Label | Means |
| --- | --- |
| **[source]** | Read from the pinned `node_modules`. Re-derive with `examples/react-native-pilot/harness/inspect-source.sh` in this repository. |
| **[measured]** | Observed on the running simulator build. Re-run with `examples/react-native-pilot/harness/run-variants.sh` in this repository. |
| **[untested]** | Believed from documentation or reading, never exercised here. Treat as a lead. |

An earlier version of this file said "every claim in it was verified on a running app". That was
not true, and it was contradicted two screens later by its own list of things it had not tested.

## Text scaling

iOS Dynamic Type has no single RN equivalent, and the options differ sharply in whether they work.
At the largest accessibility size this device reports `fontScale = 3.571`, so an uncapped 34 pt
title renders near 121 pt and wraps mid-word to "Notific / ations" (`measured.rn-fontscale`).

Measured across one clean build per variant at that text size (`measured.rn-variant-diffs`):

| Approach | Pixels differing from uncapped | Verdict |
| --- | --- | --- |
| `dynamicTypeRamp="largeTitle"` | 53.41% | **Works, and keeps scaling on.** Start here. |
| `allowFontScaling={false}` + explicit size | 51.58% | Works, at the cost of never scaling. |
| `maxFontSizeMultiplier={1.4}` | **0.00%** | **No effect.** Byte-identical to no cap. |
| Inline `Math.min(34 * fontScale, ...)` | 55.26% | Worse. RN scales the size you computed. |
| *(control)* change the title's text | 53.15% | Proves edits reach the build. |

### Prefer `dynamicTypeRamp`

**[source]** Fabric routes it through `UIFontMetrics metricsForTextStyle:`, which is the same
mechanism Apple's own semantic text styles use. **[measured]** The title stops wrapping and text
still scales for users who need it.

```tsx
<Text style={styles.title} dynamicTypeRamp="largeTitle">Notifications</Text>
```

This is the closest thing RN has to `.font(.largeTitle)`, and the first pass of this pilot missed it
entirely, recommending that scaling be switched off instead. Reach for `allowFontScaling={false}`
only when you need an exact size, confine it to display text, and never apply it to body text.

### `maxFontSizeMultiplier` silently does nothing on Fabric

**[measured]** The capture with the prop is identical to the capture without it: 0.00% of pixels
differ. The control variant, which changes only the title string, differs in 53.15%, so the build
pipeline was picking up edits.

One caveat on that zero, found by reproducing the run on a clean clone: comparing *whole*
screenshots gives 0.06%, because the simulator's clock advances between builds. The measurement
excludes the status bar for that reason. Inside the app's own frame the two are identical.

**[source]** The precise scope, which an audit corrected:

- `Libraries/Text/RCTTextAttributes.mm:249` **does** implement it: `fminf(maxFontSizeMultiplier,
  fontSizeMultiplier)`. That is the **legacy (Paper)** iOS renderer.
- `Libraries/Text/BaseText/RCTBaseTextViewManager.mm:40` wires it as a shadow property, also legacy.
- In `ReactCommon` the name appears only under **Android** `TextInput`. Fabric's iOS paragraph view,
  `RCTParagraphComponentView.mm`, does not mention it at all.

So it is not that "no native implementation reads it" — the earlier wording here, and too broad. It
is implemented for the old renderer and **absent from the Fabric iOS text path**, which means an app
on the New Architecture gets no cap from it. An accessibility prop that is accepted and ignored is
worse than one that does not exist, because nothing tells you.

### Layout

`ViewThatFits` does not exist. Read `fontScale` and switch layout yourself:

```tsx
const {fontScale} = useWindowDimensions();
const stacked = fontScale >= 1.5;   // then: stacked ? styles.rowStacked : styles.row
```

A label beside a fixed-width control is the pattern that breaks first, because the label has nowhere
to grow. Stack them.

## Colour: semantic colours exist, use them

**[source]** RN 0.76.5 exports `PlatformColor` and `DynamicColorIOS` from the package root, and
`React/Base/RCTConvert.mm` maps 33 iOS semantic colour names natively, `labelColor` among them.

**[measured]** A variant whose palette is built entirely from `PlatformColor`, declaring no colours
of its own, renders (53.41% of pixels differ from the uncapped baseline, which uses hard-coded hex)
and adapts: light versus dark differs by 99.78% of pixels
(`measured.rn-variant-diffs`, `measured.rn-platformcolor-appearance`). The system colours are
doing the work.

```tsx
backgroundColor: PlatformColor('systemGroupedBackgroundColor'),
color: PlatformColor('labelColor'),
// and for a brand colour that must adapt:
tintColor: DynamicColorIOS({light: '#0A84FF', dark: '#409CFF'}),
```

This corrects the earlier claim here that "there are no semantic system colours: you maintain the
palette". A hand-maintained palette is a **choice**, and usually the worse one: semantic colours also
track increased-contrast and other accessibility settings that a hex literal cannot.

`useColorScheme()` still returns `'light' | 'dark' | null` when you need to branch in JS, and
`Appearance.addChangeListener` exists for use outside a component. Prefer letting the colour adapt
over branching on the scheme.

## Interaction bounds

**[untested]** RN has no `contentShape`. A `Pressable`'s touch region is its layout box plus
`hitSlop`:

```tsx
<Pressable hitSlop={8} style={{minHeight: 44, minWidth: 44}} ... />
```

See [control-sizing.md](../tasks/control-sizing.md) for the values and why a screenshot cannot settle
the question. Marked untested because nothing here tapped anything: the simulator was driven by
script, and `hitSlop` was verified as layout, not as ergonomics.

## Accessibility semantics are hand-built

SwiftUI infers a great deal from the control you chose. RN infers almost nothing.

| Need | RN | Note |
| --- | --- | --- |
| Role | `accessibilityRole="button" \| "radio" \| "header" \| "radiogroup"` | **[untested]** in speech |
| Label | `accessibilityLabel` | **[untested]** in speech |
| State | `accessibilityState={{selected, disabled, busy}}` | **[untested]** in speech |
| Grouping | `accessibilityRole="radiogroup"` + `radio` on each option | **[untested]** in speech |
| Announcing a change on **iOS** | `AccessibilityInfo.announceForAccessibility(...)` | **[source]** iOS-supported |
| `accessibilityLiveRegion` | **Android only** | **[source]** `@platform android` in `ViewPropTypes.js` |

The last row is a correction. This file previously listed `accessibilityLiveRegion="polite"` as the
way to announce a validation error, on a screen that runs on iOS. RN declares it
`@platform android`, so that recommendation was a no-op on the platform the example targets. Use
`AccessibilityInfo.announceForAccessibility()` on iOS.

There is no built-in segmented control. A row of `Pressable`s needs radiogroup semantics supplied by
hand, and an option's `accessibilityLabel` should say what it means ("Quiet, delivered silently"),
not repeat the visible word.

## What this pilot did not establish

- **VoiceOver was never run.** Every role and label above is unverified in speech. This is the
  largest gap, and the accessibility semantics table is the part of this file to trust least.
- **No touch testing.** Simulator, scripted. `hitSlop` is inferred from layout.
- **iOS only.** Not built for Android, where several of these props behave differently by design.
- **One RN version, one OS version, one device.** The `maxFontSizeMultiplier` result is specific to
  0.76.5 on Fabric and may change; `harness/inspect-source.sh` re-answers it for another version in
  seconds.
- **Pixel percentages are change detectors, not quality measures.** Only the 0.00% is load-bearing.
