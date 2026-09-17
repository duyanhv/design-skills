# React Native

The Apple guidance in this bundle is written against Apple's own frameworks. Most of it transfers to
React Native, but the *mechanisms* do not: SwiftUI supplies behaviour that RN makes the app's
responsibility. This file covers the gap, and every claim in it was verified on a running RN app.

**Verified on:** React Native 0.76.5, New Architecture (Fabric, bridgeless), iPhone 17 Pro,
iOS 26.5. Behaviour differs between RN versions more than it differs between iOS versions, so check
your own version rather than trusting this.

## Text scaling is the big one

iOS Dynamic Type has no direct RN equivalent. `Text` scales with the system setting by default, but
nothing caps it per text style the way Apple's semantic styles do. At the largest accessibility size
this screen measured `fontScale = 3.571`, which turns a 34pt title into roughly 121pt and wraps it
mid-word (`measured.rn-fontscale`).

Three ways to handle a display-sized string, two of which do not work:

| Approach | Result on RN 0.76.5 / Fabric |
| --- | --- |
| `maxFontSizeMultiplier={n}` | **No effect.** The prop is declared in `TextProps.js`, but no native implementation reads it on this version. It fails silently. |
| Inline `fontSize: base * fontScale` capped with `Math.min` | **Makes it worse.** RN scales the resulting `fontSize` again, so the cap compounds. |
| `allowFontScaling={false}` plus a size you choose | **Works.** Scaling is off for that one `Text`, so the size is exactly what you set. |

Turning scaling off is a real accessibility cost, so confine it to display text that has a
deliberate size, and leave body text scalable. `useWindowDimensions().fontScale` is the signal to
branch on for layout.

`ViewThatFits` does not exist. The RN equivalent is to read `fontScale` and switch layout yourself:

```tsx
const {fontScale} = useWindowDimensions();
const stacked = fontScale >= 1.5;
// then: stacked && styles.rowStacked  ->  flexDirection: 'column'
```

A label beside a fixed-width control (a `Switch`, a button) is the pattern that breaks first,
because the label has nowhere to grow. Stack them.

## Interaction bounds

RN has no `contentShape`. A `Pressable`'s touch region is its layout box plus `hitSlop`:

```tsx
<Pressable hitSlop={8} ...>   // grows the touch region without changing layout
```

This matters for the same reason it does on Apple platforms: the visible glyph is not the target.
See [control-sizing.md](../tasks/control-sizing.md) for the values and for why a screenshot cannot
settle the question. `hitSlop` is the mechanism that lets a visually small control still meet them.

`minHeight`/`minWidth` on the style is the other half, and is what makes the box itself big enough.

## Accessibility semantics are hand-built

SwiftUI infers a great deal from the control you chose. RN infers almost nothing, so the semantics
are props you write:

| Need | RN |
| --- | --- |
| Role | `accessibilityRole="button" \| "radio" \| "header" \| "radiogroup"` |
| Label | `accessibilityLabel` — required on anything whose text is not self-explanatory |
| State | `accessibilityState={{selected, disabled, busy}}` |
| Grouping | `accessibilityRole="radiogroup"` on the container, `radio` on each option |
| Announcing a change | `AccessibilityInfo.announceForAccessibility(...)` |
| Live region | `accessibilityLiveRegion="polite"` on the element that changes |

There is no built-in segmented control. A row of `Pressable`s needs the radiogroup semantics
supplied by hand, and an option's `accessibilityLabel` should say what it means ("Quiet, delivered
silently"), not just repeat the visible word.

## Dark mode

`useColorScheme()` returns `'light' | 'dark' | null`, and there are no semantic system colours: you
maintain the palette. That makes the hard-coded-colour failure from
[appearance.md](../tasks/appearance.md) much easier to commit, because there is no adaptive default
to fall back on.

Measured on this screen: light and dark captures differ in **99.78%** of pixels, which confirms the
palette is actually switching rather than a few system-drawn elements moving. A near-zero figure
would mean the app is ignoring the setting.

`Appearance.addChangeListener` exists if you need to react outside a component.

## What this pilot did not establish

- **VoiceOver was not run.** Roles and labels are present in the code and unverified in speech.
- **No Android pass.** `accessibilityRole` maps differently there, and `hitSlop` semantics differ.
- **One RN version.** 0.76.5 with the New Architecture. The `maxFontSizeMultiplier` finding in
  particular is version-specific and may be fixed in a later release; re-test rather than assume.
- **No real device.** Simulator only, so touch behaviour is inferred from layout rather than tapped.
