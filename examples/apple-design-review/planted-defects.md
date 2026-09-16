# Planted defects — ShareSheetView.swift (before)

Written BEFORE the blind review, stored outside the repository working tree so the reviewing agent
cannot read it. Used only for scoring after the review is captured verbatim.

Target: iOS, SwiftUI, iPhone. Each entry notes what I intended and which guide area should reach it.

## Intended defects

P1. **Icon-only toolbar button has no accessible label.** `Image(systemName: "ellipsis.circle")`
    inside a Button with no `.accessibilityLabel`. VoiceOver announces the symbol name at best.
    → accessibility.md (labels), actions.md.

P2. **Toolbar button's interaction region is smaller than the platform minimum.**
    `.frame(width: 24, height: 24)` on the toolbar Button. This is the case the guide says to trace
    rather than guess, and here tracing confirms it really is small.
    → actions.md (hit region), accessibility.md (targets).

P3. **Remove ("xmark") button: no label AND a 20x20 frame.** Same two problems on a *destructive*
    control. → accessibility.md, actions.md.

P4. **Destructive action has no destructive role.** "Stop sharing" is a `Text` with
    `.onTapGesture`, so it is not a button at all: no role, no trait, no press state, not reachable
    by VoiceOver as a control, not operable by Voice Control by name.
    → actions.md (roles carry meaning; role is not styling).

P5. **Destructive action has no confirmation**, while the *less* destructive per-member removal does.
    "Stop sharing" wipes all members immediately. → actions.md (destructive: reversible?).

P6. **Alert wording names nothing.** "Are you sure?" with "OK"/"Cancel". The guide asks that the
    button text name the outcome, and Apple's Alerts > Content covers alert wording.
    → actions.md.

P7. **Every colour is a hard-coded literal.** `Color(red:green:blue:)` and `Color.white`
    throughout, plus a hard-coded near-white page background. Nothing adapts to Dark Mode or
    Increase Contrast. → appearance.md (semantic colours; hard-coded values).

P8. **Status conveyed by colour alone.** The green/grey 8pt dot is the only signal of whether a
    member can edit. No text, no symbol, no accessibility value.
    → appearance.md (not colour alone), accessibility.md.

P9. **Every font is a fixed point size.** `.font(.system(size: …))` everywhere, so no text responds
    to Dynamic Type. → typography.md (Dynamic Type is a layout requirement).

P10. **`lineLimit(1)` on both name and email**, which carry the only copy of that information.
     "Marcus Oyelaran-Whitfield" and his long email are there specifically to truncate.
     → typography.md.

P11. **Error styling on a field that is not in error.** The invite TextField's border turns red as
     soon as it is non-empty — inverted validation. Also colour-only error signalling.
     → forms.md (validation), appearance.md (colour alone).

P12. **Email field declares no content type or keyboard type.** No `.keyboardType(.emailAddress)`,
     no `.textContentType(.emailAddress)`, no autocapitalization/autocorrection handling, so
     AutoFill cannot help and the keyboard is wrong. → forms.md (keyboard and text entry).

P13. **No visible label bound to the text field.** "Invite" is a separate Text; the field itself has
     only a placeholder, which disappears on focus. → forms.md (label vs placeholder).

P14. **Async action has no disabled/repeat protection.** "Send" can be tapped repeatedly while
     `isSending` is true; the spinner is in the footer, far from the control.
     → actions.md (repeat protection, progress).

P15. **Custom "Send" button has no press state** and is a custom-styled label, not a system button
     style. → actions.md (custom control press state).

## Deliberately correct patterns (should NOT be reported)

C1. **`Toggle` with `.labelsHidden()` next to a descriptive text stack.** A switch in a row-like
    container is the iOS-appropriate control here; the adjacent text identifies it. A reviewer that
    flags this as "unlabelled" without checking the visible text is over-reporting, though noting
    the *accessibility* label is a fair, separate point.

C2. **`Divider()` between rows and the 48pt leading inset.** Ordinary list styling, not a defect.

C3. **The avatar circle with initials.** Decorative-plus-initials is a common, acceptable pattern;
    it should ideally be hidden from VoiceOver but is not itself a design error.

C4. **`ScrollView` + `VStack` instead of `List`.** A legitimate choice for a short, mixed-content
    sheet. A reviewer insisting on `List` would be stating a preference as a requirement.

## Notes on difficulty

- P2/P3 require actually tracing the frame, which is what the guide says to do instead of guessing
  from the glyph size. A reviewer who says "the icon is small" without the frame has not done it.
- P11's inversion is easy to miss by skimming: the code reads as if it has validation.
- P4 is the highest-value finding and is invisible in a screenshot.

---

## CORRECTION to P2, made AFTER the blind review (runtime measurement)

The blind review refused to file a target-size finding on the toolbar button, measuring the rendered
Liquid Glass container at exactly 44.0 x 44.0 pt from the screenshot and concluding the 24pt frame
was a false positive. I then checked at runtime, because neither a code frame nor a screenshot
settles hit-testing. Two independent methods, iPhone 17 Pro / iOS 26.5 / light / default text:

1. `window.hitTest` sampled at 0.5pt over the toolbar neighbourhood:
   touch reaches the bar item only within **39.5 x 26.5 pt** (x 344.5-383.5, y 71.0-97.0).
   Taps at the glass container's corners hit `NavigationBarContentView`, not the control.
2. SwiftUI `GeometryReader` on the control itself: **24.0 x 24.0 pt** laid out.

So the glass container is 44x44 but the *touchable* region is not. P2 stands as a real defect, and
the review's "left alone" item 1 is a **false negative**: it treated a visual container measurement
as evidence about hit-testing, which is the same class of error as reading the glyph size, just from
the other direction.

Also measured at runtime, confirming review findings:
- Send button: 68.7 x 38.0 pt laid out (under on height) — matches the review's screenshot figure.
- Row remove (x): 20.0 x 20.0 pt laid out (x3 rows) — matches the review.

## CORRECTION to P13, made AFTER the blind review

I planted "no visible label bound to the text field" as a defect. The review considered it and
declined, arguing that the "Invite" section header is the describing label and that Apple's Text
fields page endorses a placeholder as a hint. On audit the review is right and this planted item
was wrong, so P13 is removed from the denominator in `scoring.md` rather than counted against the
review. The field's missing keyboard and content type is a separate, genuine defect (planted as P12,
found as F10).

## CORRECTION to C2, made AFTER the blind review

I listed `Divider().padding(.leading, 48)` as a correct pattern that should not be reported. The
review reported it twice, in F3 and F13, as a hard-coded metric that stops matching once text
scales. That argument is sound and my C2 was too generous. It is still counted as a false positive
in `scoring.md`, because loosening the rubric after seeing the answer is precisely the failure this
protocol exists to prevent.

## Defect found in the FIXED version, after publishing

The first "after" build still wrapped the Send button's title onto two lines ("Sen"/"d") at the
largest accessibility text size — a Dynamic Type layout defect in the screen that was supposed to
demonstrate Dynamic Type being fixed. The review's own F3 had recommended `ViewThatFits` for exactly
this row and I had not implemented it. Fixed and recaptured. Worth recording because the pixel-diff
number went *up* between default and AX5 while the defect was present: a larger difference measures
change, not correctness.
