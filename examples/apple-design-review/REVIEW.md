# Design review: `ShareSheetView.swift`

Reviewed with the `apple-design` skill (`skills/apple-design/SKILL.md`), following its workflow:
establish context → route to task files → verify against code rather than appearance → cite the
official page *and section* → keep the claim proportional to the evidence.

---

## 1. Context

| | |
| --- | --- |
| Platform | iOS, iPhone (per `TASK.md`) |
| Minimum deployment target | iOS 17 |
| UI framework | SwiftUI (`NavigationStack`, `@Observable`, `ScrollView`) |
| Screenshots | iPhone 17 Pro, iOS 26.5 — light, dark, largest accessibility text size |
| Status | Shipped as-is, not a prototype |

**System vs. custom** — the distinction the skill says changes findings most often:

| Element | Kind | Consequence |
| --- | --- | --- |
| `Toggle` (link row) | **System** | Brings its own states, adaptation, VoiceOver semantics |
| `Divider` | **System** | Adapts to appearance (proven below) |
| `TextField` | **System** | Default font scales; but keyboard/content type unconfigured |
| `ProgressView` | **System** | Unlabelled here |
| Toolbar `Button` | System button, custom glyph sizing | Toolbar supplies the 44 pt glass container |
| "Send" | **Custom-styled** `Button` (Text + padding + background) | No press state, no role, no disabled state |
| Row "✕" | `Button` with a 20×20 `frame` | Interaction bounds are the app's responsibility |
| "Stop sharing" | **Not a control at all** — `Text` + `onTapGesture` | No role, no trait, no press state |
| Status dot | `Circle()`, decorative shape carrying real meaning | Invisible to assistive tech |

Because iOS 17 is the floor, everything recommended below is available: `Button(role:)`,
`.textContentType`, `.keyboardType`, `.accessibilityLabel`, `Font.TextStyle`, semantic `Color`,
`confirmationDialog`, `List`/`Form`. **No finding here requires raising the deployment target.**

### How the screenshots were verified

Screenshots cannot show hit regions, labels, or focus order, so those are traced through the code.
But the three PNGs *can* be measured, and I decoded them and compared pixel-by-pixel rather than
eyeballing them. Coordinates below are at @3x; point values are divided by 3.

---

## Findings, ordered by consequence

### 🔴 F1. "Stop sharing" is an irreversible destructive action with no confirmation, and it is not a button

**Location:** `footer`, lines 200–206.

```swift
Text("Stop sharing")
    .foregroundColor(Color(red: 0.85, green: 0.2, blue: 0.2))
    .onTapGesture {
        store.members.removeAll()
        store.linkSharingOn = false
    }
```

One tap removes **every** member and disables link sharing. There is no confirmation, no undo, and
no way back. Compare this with removing a *single* member, which does get an alert. The far more
destructive action has strictly less friction than the less destructive one.

Four separate problems compound here:

1. **No confirmation on an uncommon, irreversible, destructive action.** Apple's
   [Alerts › Best practices](https://developer.apple.com/design/human-interface-guidelines/alerts#Best-practices)
   distinguishes the two cases explicitly: it says to avoid alerting for "common, undoable actions,
   even when they're destructive", but that "when people take an uncommon destructive action that
   they can't undo, it's important to display an alert in case they initiated the action
   accidentally." This is the second case.
2. **It is a `Text`, not a `Button`.** `onTapGesture` attaches a tap handler to a shape. It exposes
   no button trait, so VoiceOver announces it as static text rather than as an actionable control;
   Voice Control and Switch Control have no control to operate; and there is no press state. Apple's
   [Buttons › Best practices](https://developer.apple.com/design/human-interface-guidelines/buttons#Best-practices)
   says to "Always include a press state for a custom button."
3. **Red styling is not the destructive role.** The destructive meaning exists only as an RGB
   literal. [Buttons › Role](https://developer.apple.com/design/human-interface-guidelines/buttons#Role)
   defines Destructive as a *system-defined role* that "identifies a button's semantic meaning",
   and notes a destructive button uses the system red color. A hard-coded red conveys this to
   sighted users in light mode only, and to nobody else.
4. **Colour is the only signal.** [Color › Inclusive color](https://developer.apple.com/design/human-interface-guidelines/color#Inclusive-color)
   says to "Avoid relying solely on color to differentiate between objects, indicate interactivity,
   or communicate essential information." Here colour carries both *that it is tappable* and *that
   it is dangerous*.

**Fix**

```swift
Button("Stop Sharing", role: .destructive) { showStopSharingConfirmation = true }
.confirmationDialog("Stop sharing “Quarterly Report”?",
                    isPresented: $showStopSharingConfirmation, titleVisibility: .visible) {
    Button("Stop Sharing", role: .destructive) { store.stopSharing() }
    Button("Cancel", role: .cancel) { }
} message: {
    Text("\(store.members.count) people will lose access. This can't be undone.")
}
```

**Confirms the fix worked:** VoiceOver announces "Stop Sharing, button"; the action cannot complete
in one tap; the label stays legible in dark mode without a hard-coded colour.
**Verified by:** reading the code. Not run.

---

### 🔴 F2. The screen does not adapt to Dark Mode — proven by pixel comparison

**Location:** every colour in the file. `Color.white` (lines 89, 126, 183), the page background
`Color(red: 0.97, green: 0.97, blue: 0.98)` (line 52), and every `foregroundColor(Color(red:…))`.

`before-light.png` and `before-dark.png` differ in only **18,415 of 3,162,132 pixels (0.58%)**.
Crucially, the pixels that *do* differ are exactly the ones the **system** draws, and they prove the
device really was in Dark Mode when the dark screenshot was taken:

| Element | Light | Dark | Who draws it |
| --- | --- | --- | --- |
| Card background | `(255,255,255)` | `(255,255,255)` | **App** — did not adapt |
| Page background | `(247,247,250)` | `(247,247,250)` | **App** — did not adapt |
| Member name text | `(68,68,70)` | `(68,68,70)` | **App** — did not adapt |
| `Divider` (y=1409) | `(198,198,200)` | `(152,152,155)` | **System** — adapted |
| TextField placeholder | darkest `(197,197,199)` | darkest `(249,249,252)` | **System** — adapted |
| Status bar, toolbar glass | differ | differ | **System** — adapted |

So the app is rendering a light interface while the system is in dark appearance. Apple's
[Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) page opens by
saying people "generally expect all apps and games to respect their preference", and
[Dark Mode › Dark Mode colors](https://developer.apple.com/design/human-interface-guidelines/dark-mode#Dark-Mode-colors)
says to "Embrace colors that adapt to the current appearance… Avoid using hard-coded color values or
colors that don't adapt." [Color › System colors](https://developer.apple.com/design/human-interface-guidelines/color#System-colors)
adds: "Avoid hard-coding system color values in your app."

**The concrete harm is worse than a cosmetic mismatch.** Because the system adapted the placeholder
text for a dark background while the app kept the field's background hard-coded white, the
placeholder "Email address" renders at a measured **1.05:1 contrast** against its own field in dark
mode (light mode: 1.72:1). At 1.05:1 the hint is effectively invisible.
[Dark Mode › Dark Mode colors](https://developer.apple.com/design/human-interface-guidelines/dark-mode#Dark-Mode-colors)
states the number directly: "At a minimum, make sure the contrast ratio between colors is no lower
than 4.5:1. For custom foreground and background colors, strive for a contrast ratio of 7:1,
especially in small text."

This is the general failure mode the skill's `appearance.md` warns about: mixing system-drawn and
hard-coded elements produces combinations neither side anticipated.

**Fix:** replace literals with semantic colours — `Color(.systemGroupedBackground)` for the page,
`Color(.secondarySystemGroupedBackground)` for cards, `.primary`/`.secondary` for label text,
`.red` or `role: .destructive` for the destructive label — or asset-catalog colours with light and
dark variants.
**Confirms the fix worked:** re-run the pixel diff; the card and text pixels must differ between
appearances, and placeholder contrast must exceed 4.5:1 in both.
**Verified by:** measured from the supplied screenshots plus code reading. Increase Contrast and
Reduce Transparency were **not** tested.

---

### 🔴 F3. Dynamic Type is opted out everywhere except one control, and that inconsistency is visible

**Location:** every `.font(.system(size: …))` — lines 61, 72, 75, 83, 100, 115, 118, 133, 144, 150,
154, 169, 201. A literal point size does not scale with the reader's text-size setting.

I measured glyph heights in `before-light.png` (default size) against `before-xxxl.png` (largest
accessibility size). They are **identical**:

| Text run | Default | AX5 (largest) |
| --- | --- | --- |
| "Quarterly Report" | 20.0 pt | **20.0 pt** |
| "Shared with 3 people" | 11.3 pt | **11.3 pt** |
| "Invite" section label | 10.0 pt | **10.0 pt** |
| "Anyone with the link" | 13.7 pt | **13.7 pt** |
| "Viewers can open this report" | 10.7 pt | **10.7 pt** |
| Member name / email | 13.7 / 10.7 pt | **13.7 / 10.7 pt** |
| "Stop sharing" | 13.7 pt | **13.7 pt** |

Nothing the app styles responds at all. A reader who has set the largest accessibility size gets
10.0 pt section headers and 10.7 pt email addresses regardless.

The single exception proves the cause. The `TextField` on line 86 is the **only** text in the file
with no `.font()` modifier, so it keeps the system default and *does* scale. Its placeholder glyphs
grow from a measured **12.0 pt tall (93.7 pt wide) to 31.0 pt tall (250.7 pt wide)**, and the field
box itself grows from **43.3 pt to 90.3 pt**, while the adjacent "Send" button stays pinned at
exactly **68.7 × 38.0 pt in both screenshots**. The result visible in `before-xxxl.png` is a field
more than twice as tall beside an unchanged button: the layout is now internally inconsistent, and
the one thing that scaled did so by accident.

Apple's [Typography › Supporting Dynamic Type](https://developer.apple.com/design/human-interface-guidelines/typography#Supporting-Dynamic-Type)
says to "Make sure your app's layout adapts to all font sizes. Verify that your design scales, and
that text and glyphs are legible at all font sizes."
[Typography › Using system fonts](https://developer.apple.com/design/human-interface-guidelines/typography#Using-system-fonts)
says using the built-in text styles "ensures support for Dynamic Type and larger accessibility type
sizes." The exact per-size values are published at
[Typography › Specifications](https://developer.apple.com/design/human-interface-guidelines/typography#Specifications);
I did not reproduce them here.

**Fix:** move to semantic text styles — `.title2` for the header, `.subheadline`/`.footnote` for
secondary text, `.headline` for section labels, `.body` for names, `.caption` for emails. Where a
fixed size is genuinely required, use `.font(.system(size:, relativeTo:))` so it still scales. Use
`@ScaledMetric` for the 36 pt avatar and the 48 pt divider inset. Consider making the invite row a
`ViewThatFits` that stacks the field above the button at accessibility sizes.
**Confirms the fix worked:** repeat the glyph-height measurement at AX5; every row must grow, and
the invite row must not leave a full-width field beside an unscaled button.
**Verified by:** measured from the supplied screenshots. Bold Text was **not** tested.

---

### 🟠 F4. Icon-only and shape-only elements carry no accessibility labels

**Location:** lines 56–64 (toolbar), 161–163 (status dot), 165–172 (remove button), 138–146
(avatar), 197 (`ProgressView`).

Nothing in this file sets an accessibility label, value, trait, or hidden flag. Concretely:

- The toolbar button announces from its SF Symbol name, so VoiceOver says something like
  "ellipsis.circle" — the picture, not the action.
- The remove "✕" announces as "xmark" or similar, with no indication of *whom* it removes. With
  three rows, three identically-announced buttons is a genuine ambiguity.
- The status dot is a bare `Circle()` — it conveys edit permission and is announced as nothing.
- The avatar initials circle is decorative (the name is right beside it) but is not hidden, so
  VoiceOver reads "AL" before every name.
- The `ProgressView` has no label, so the sending state is not described.

Apple's [VoiceOver](https://developer.apple.com/design/human-interface-guidelines/voiceover) page
says to "Provide alternative labels for all key interface elements… System-provided controls have
generic labels by default, but you should provide more descriptive labels that convey your app's
functionality," and to "Exclude purely decorative images from VoiceOver."
[Accessibility › Speech](https://developer.apple.com/design/human-interface-guidelines/accessibility#Speech)
adds that to use Voice Control smoothly, you should "label interface elements appropriately" — a
control announced as "xmark" cannot be operated by saying what it does.

**Fix:** `.accessibilityLabel("Remove \(member.name)")` on the ✕;
`.accessibilityLabel("More options")` (or a real label matching its actual behaviour — see F5) on
the toolbar button; `.accessibilityHidden(true)` on the avatar; fold the dot into the row's
accessibility value (see F6); label the `ProgressView` "Sending invitation".
**Confirms the fix worked:** swipe through the screen with VoiceOver; every stop names an action or
a person, and no stop announces a glyph name.
**Verified by:** reading the code. **VoiceOver was not run** — I had no running app.

---

### 🟠 F5. The toolbar "⋯" button silently toggles link sharing

**Location:** lines 56–64.

```swift
Button { store.linkSharingOn.toggle() } label: { Image(systemName: "ellipsis.circle") }
```

An ellipsis is the system's established signal for "more options" — it promises a menu. This one
instead flips a privacy-relevant setting with no menu, no confirmation, and no visible feedback
except the switch changing further down the screen, which may be scrolled out of view.

[Buttons › Content](https://developer.apple.com/design/human-interface-guidelines/buttons#Content)
says to "Try to associate familiar actions with familiar icons," giving the example that people
"can predict that a button containing the `square.and.arrow.up` symbol will help them perform
share-related activities." The skill's `navigation.md` frames the same point: what is worth
questioning is "a control whose effect is *unexpected*."

This is also a plausible source of accidental public link exposure, which is why I rank it above
the cosmetic items rather than treating it as a naming nit.

**Fix:** either make it a real `Menu` with the screen's overflow commands (Copy Link, Manage
Permissions, Stop Sharing), or, if toggling is the intent, remove it — the switch in the link row
already does this job visibly and reversibly.
**Confirms the fix worked:** tapping the toolbar item produces a menu whose items name their own
outcomes.
**Verified by:** reading the code.

---

### 🟠 F6. Edit permission is communicated by colour alone

**Location:** lines 161–163.

```swift
Circle()
    .fill(member.canEdit ? Color(red: 0.2, green: 0.72, blue: 0.35)
                         : Color(red: 0.75, green: 0.75, blue: 0.77))
    .frame(width: 8, height: 8)
```

Green vs. grey is the *only* channel carrying whether a person can edit. There is no text, no
symbol, no shape difference, and no accessibility value. Red-green colour blindness is the common
case Apple names, and the two dots are also very close in luminance: measured against the white
card, green is **2.59:1** and grey **1.83:1**, so they are hard to separate in greyscale too. (I am
applying WCAG-style ratios as the measurement, per the caution in the skill's `appearance.md`;
Apple's own stated floor of 4.5:1 comes from the Dark Mode page cited in F2.)

Two official statements converge here.
[Color › Inclusive color](https://developer.apple.com/design/human-interface-guidelines/color#Inclusive-color):
"Avoid relying solely on color to differentiate between objects, indicate interactivity, or
communicate essential information… you can use text labels or glyph shapes to identify objects or
states." [Accessibility › Vision](https://developer.apple.com/design/human-interface-guidelines/accessibility#Vision):
"Convey information with more than color alone… Offer visual indicators, like distinct shapes or
icons, in addition to color."

At 8 × 8 pt the dot also cannot grow with Dynamic Type (see F3).

**Fix:** replace the dot with a text label ("Can edit" / "View only") or an SF Symbol pair
(`pencil.circle.fill` / `eye.circle.fill`), and add `.accessibilityValue(member.canEdit ? "Can
edit" : "View only")` to the row.
**Confirms the fix worked:** screenshot the list in greyscale and confirm the two states remain
distinguishable; VoiceOver announces the permission with the name.
**Verified by:** measured from the screenshot plus code reading.

---

### 🟠 F7. Two interactive targets are below the 44 × 44 pt minimum

Apple states the figure plainly in
[Buttons › Best practices](https://developer.apple.com/design/human-interface-guidelines/buttons#Best-practices):
"a button needs a hit region of at least 44x44 pt — in visionOS, 60x60 pt." (iOS value used; the
visionOS number does not transfer.)

Per the skill's warning, I traced the *interactive* bounds rather than the glyph, and measured the
rendered result:

| Control | Code | Measured | Verdict |
| --- | --- | --- | --- |
| Toolbar "⋯" | `.frame(width: 24, height: 24)` | Glass container **44.0 × 44.0 pt** | ✅ **Adequate** — see "left alone" |
| Row "✕" | `.frame(width: 20, height: 20)` | Glyph 8.7 pt in a **20 × 20 pt** button | ❌ Under |
| "Send" | padding 16/10 around 15 pt text | **68.7 × 38.0 pt** | ❌ Under in height |

The "✕" is the worse of the two: it is the smallest target on the screen, it is **destructive**, and
it sits a measured **4.3 pt** from the status dot. Apple's
[Accessibility › Mobility](https://developer.apple.com/design/human-interface-guidelines/accessibility#Mobility)
treats separation as its own requirement: "Consider spacing between controls as important as size.
Include enough padding between elements to reduce the chance that someone taps the wrong control. In
general, it works well to add about 12 points of padding around elements that include a bezel. For
elements without a bezel, about 24 points of padding works well around the element's visible edges."

"Send" misses only in height (38 pt vs 44 pt), which is a smaller miss but trivially fixable.

**Fix:** give the ✕ `.frame(width: 44, height: 44)` with `.contentShape(Rectangle())` (the glyph can
stay 11 pt — visible size and hit region are independent); give "Send" `.frame(minHeight: 44)` or
use `.buttonStyle(.borderedProminent).controlSize(.large)`, which supplies the metrics, a press
state, and appearance adaptation for free.
**Confirms the fix worked:** tap repeatedly near the edges of the ✕ on a device and confirm every
tap in the 44 pt square registers and never hits a neighbour.
**Verified by:** measured from `before-light.png` at @3x plus code reading. **Not** tested on a
device, which is the only way to settle hit-testing definitively.

---

### 🟠 F8. The removal alert asks "Are you sure?" and offers "OK"

**Location:** lines 185–191.

```swift
.alert("Are you sure?", isPresented: .constant(pendingRemoval != nil)) {
    Button("OK") { … }
    Button("Cancel", role: .cancel) { … }
}
```

Three issues, all covered by the same page:

1. **The title carries no information.** It does not say what will happen or to whom — and since
   `pendingRemoval` holds the member, the name is available.
   [Alerts › Content](https://developer.apple.com/design/human-interface-guidelines/alerts#Content):
   "Write a title that clearly and succinctly describes the situation… Avoid writing a title that
   doesn't convey useful information."
2. **"OK" is the wrong button title.**
   [Alerts › Buttons](https://developer.apple.com/design/human-interface-guidelines/alerts#Buttons):
   "Avoid using OK as the default button title unless the alert is purely informational. The meaning
   of 'OK' can be unclear even in alerts that ask people to confirm that they want to do something…
   A specific button title like 'Erase,' 'Convert,' 'Clear,' or 'Delete' helps people understand the
   action they're taking." This alert is a confirmation, not an informational alert.
3. **The confirming button has no destructive role.** Same page: "Use the destructive style to
   identify a button that performs a destructive action people didn't deliberately choose." Removing
   someone is exactly that.

**Separately, a robustness note (my observation, not an Apple citation):**
`isPresented: .constant(pendingRemoval != nil)` passes a binding the alert cannot write back to.
Both buttons happen to clear `pendingRemoval`, so it works today, but any dismissal path that does
not run a button action would leave the alert stuck presented. The idiomatic iOS 17 form is
`.alert(item:)`-style presentation or `.alert(…, isPresented: $flag, presenting: member)`.

**Fix**

```swift
.alert("Remove \(member.name)?", isPresented: …, presenting: pendingRemoval) { member in
    Button("Remove", role: .destructive) { store.remove(member) }
    Button("Cancel", role: .cancel) { }
} message: { _ in Text("They'll lose access to this report.") }
```

**Confirms the fix worked:** the alert names the person; the confirming button names the outcome and
renders in system red; VoiceOver distinguishes it from Cancel by trait, not only colour.
**Verified by:** reading the code.

---

### 🟡 F9. The invite field turns red as soon as it contains any text

**Location:** lines 91–94.

```swift
.stroke(store.inviteEmail.isEmpty ? Color(white: 0.85)
                                  : Color(red: 0.85, green: 0.2, blue: 0.2), lineWidth: 1)
```

The condition is `isEmpty`, not validity. Typing a *correct* address turns the border red; the only
way to make the border "normal" is to empty the field. The validation signal is therefore exactly
inverted, and it is carried by colour alone with no message saying what is wrong or how to fix it.

[Text fields › Best practices](https://developer.apple.com/design/human-interface-guidelines/text-fields#Best-practices)
says to "Validate fields when it makes sense… The appropriate time to check the data depends on the
context: when entering an email address, it's best to validate when people switch to another field."
The colour-alone point is [Color › Inclusive color](https://developer.apple.com/design/human-interface-guidelines/color#Inclusive-color),
as in F1 and F6.

**Fix:** validate the address on focus loss or submit; show the error border **and** a short message
below the field naming the correction ("Enter a complete email address, like name@example.com"); use
`.accessibilityValue` so VoiceOver announces the error state.
**Verified by:** reading the code. Confirmed consistent with `before-light.png`, where the empty
field shows the grey border.

---

### 🟡 F10. The invite field is missing its keyboard, AutoFill, and submit configuration

**Location:** line 86. The `TextField` sets no `.keyboardType(.emailAddress)`,
`.textContentType(.emailAddress)`, `.textInputAutocapitalization(.never)`, `.autocorrectionDisabled()`,
or `.submitLabel(.send)`.

Consequences: no "@" or "." on the primary keyboard row, no AutoFill from Contacts or the keychain,
and iOS will capitalise the first letter and autocorrect the local part of the address — actively
corrupting valid input.

[Text fields › Best practices](https://developer.apple.com/design/human-interface-guidelines/text-fields#Best-practices):
"In iOS, iPadOS, tvOS, and visionOS apps, show the appropriate keyboard type… To streamline data
entry, display the keyboard that's appropriate for the type of content people are entering."
[Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data) leads
with the stronger point: "When possible, offer choices instead of requiring text entry."

**Design suggestion (mine, no citation):** a share sheet is a natural place to offer a contact
picker rather than making people type addresses from memory.

**Fix:** add the four modifiers above; consider `ContactAccessButton` or a recents list.
**Confirms the fix worked:** focus the field and confirm the email keyboard and an AutoFill
suggestion appear; paste and type a mixed-case address and confirm it is not altered.
**Verified by:** reading the code. AutoFill and hardware-keyboard entry **not** tested.

---

### 🟡 F11. "Send" has no disabled, press, or repeat-protected state

**Location:** lines 25–33 and 96–106.

```swift
func invite() {
    guard !inviteEmail.isEmpty else { return }
    isSending = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { … }
}
```

- **Silent no-op.** Tapping Send with an empty field does nothing at all — no message, no disabled
  appearance. The button looks equally active in both states.
- **Double-submit.** `invite()` never checks `isSending`, and `inviteEmail` is not cleared until the
  1.2 s callback fires. Two taps inside that window pass the guard twice and append the same person
  **twice**. This is the non-idempotent-action check from the skill's `actions.md`.
- **No press state.** The custom-styled label has no pressed appearance.
  [Buttons › Best practices](https://developer.apple.com/design/human-interface-guidelines/buttons#Best-practices):
  "Always include a press state for a custom button. Without a press state, a button can feel
  unresponsive, making people wonder if it's accepting their input."
- **Progress is shown far from the action.** The `ProgressView` is in the footer, well below the
  button that triggered it. [Buttons › iOS, iPadOS](https://developer.apple.com/design/human-interface-guidelines/buttons#iOS-iPadOS)
  describes the better pattern: "Configure a button to display an activity indicator when you need
  to provide feedback about an action that doesn't instantly complete… you can also configure the
  button to display a different label alongside the activity indicator."

**Fix:** `.disabled(store.inviteEmail.isEmpty || store.isSending)`; add `guard !isSending` inside
`invite()`; adopt `.buttonStyle(.borderedProminent)` for a free press state; move the spinner into
the button.
**Confirms the fix worked:** double-tap Send rapidly and confirm exactly one member is added.
**Verified by:** reading the code; the race is deterministic from the source. **Not** run.

---

### 🟡 F12. The switch is used outside a list row

**Location:** lines 111–128 — a `Toggle` inside a hand-built `HStack` card, not a `List` row.

[Toggles › iOS, iPadOS](https://developer.apple.com/design/human-interface-guidelines/toggles#iOS-iPadOS)
says: "Use the switch toggle style only in a list row… Outside of a list, use a button that behaves
like a toggle, not a switch."

I am reporting this as a real but **moderate** finding, and I want to be precise about why. The card
is a visual replica of a grouped list row, so a reader is unlikely to be confused. The cost is not
perceptual, it is structural: hand-built cards are the reason this screen has hard-coded white
backgrounds (F2), fixed metrics that do not scale (F3), and no row semantics for VoiceOver (F4).

**Recommended fix** (the citation supports the control choice; the restructuring is my
recommendation): rebuild the screen as a `List` with `.listStyle(.insetGrouped)` and `Section`
headers for "Invite" and "People". That makes the switch correct by construction, supplies grouped
background colours that adapt, gives real section headers for the VoiceOver rotor, and enables
`.swipeActions` for removal — which would also resolve F7's cramped ✕.
**Verified by:** reading the code.

---

### 🔵 F13. Smaller items

- **Custom title duplicates the navigation title.** `navigationTitle("Share")` is set to `.inline`,
  then "Quarterly Report" is drawn as a 22 pt semibold `Text`. The large-title treatment is what the
  navigation bar exists to provide; see
  [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars). *Design
  suggestion:* use `.navigationTitle("Quarterly Report")` with `.large`, and "Share" elsewhere.
- **Hard-coded divider inset.** `Divider().padding(.leading, 48)` (line 177) is tied to the 36 pt
  avatar plus 12 pt spacing. Correct today, wrong as soon as either changes or text scales. Use
  `@ScaledMetric`. (It does correctly use `.leading` rather than `.left`, so this is not an RTL bug.)
- **Invited people get an email as their display name.** `invite()` sets
  `Member(name: inviteEmail, …)` (line 29), so `initials("ana@example.com")` yields "a" — a
  one-letter avatar and a name row showing a raw address.
- **Unlocalised pluralisation.** `"Shared with \(store.members.count) people"` (line 74) reads
  "Shared with 1 people". Use a `String.LocalizedStringResource` with a plural rule; see
  [Writing](https://developer.apple.com/design/human-interface-guidelines/writing).
- **Title-style capitalisation.** "Stop sharing" and "Send" should be "Stop Sharing" / "Send" per
  standard iOS button capitalisation; see [Alerts › Buttons](https://developer.apple.com/design/human-interface-guidelines/alerts#Buttons).

---

## What I checked and deliberately left unchanged

The skill asks for this explicitly, so that the reader knows which conventions were examined rather
than merely not mentioned.

1. **The toolbar button's hit target — the most likely false positive on this screen.** The code
   says `.frame(width: 24, height: 24)`, which looks like a 24 pt target and would be an easy
   finding to file. It is wrong. I measured the rendered glass container in `before-light.png` at
   **exactly 44.0 × 44.0 pt** (x 1026–1157, y 186–317 at @3x), because on iOS 26 the toolbar
   supplies the Liquid Glass background and its own minimum metrics. The 19 pt glyph inside it is a
   small icon in a large target, which is correct and common. **No size finding.** (Its *behaviour*
   is still wrong — F5 — and it still needs a label — F4.)
2. **`Toggle` itself is the right control, and its default green is fine.** Apple's
   [Toggles › Best practices](https://developer.apple.com/design/human-interface-guidelines/toggles#Best-practices)
   describes exactly this use: "a toggle to help people choose between two opposing values that
   affect the state of content or a view." [Toggles › iOS, iPadOS](https://developer.apple.com/design/human-interface-guidelines/toggles#iOS-iPadOS)
   says "Change the default color of a switch only if necessary. The default green color tends to
   work well in most cases." Being a system control, it also supplies the press, disabled, and
   VoiceOver behaviour the custom controls lack. Only its *container* is at issue (F12).
3. **`labelsHidden()` on the toggle is correct, not an accessibility bug.** It is tempting to file
   this as a missing label. The same iOS section says "You don't need to supply a label in this
   situation because the content in the row provides the context" — and the row does carry "Anyone
   with the link". The adjacent text is the label.
4. **Placeholder text is a legitimate hint here.**
   [Text fields › Best practices](https://developer.apple.com/design/human-interface-guidelines/text-fields#Best-practices)
   says to "Show a hint in a text field to help communicate its purpose," and notes a separate
   describing label is also useful — the "Invite" header supplies one. So the placeholder is not
   doing double duty as the only label. **No finding.** (Its dark-mode contrast is F2; its keyboard
   configuration is F10.)
5. **`NavigationStack` with an inline title is a sound structure.** A single self-contained task with
   no peer sections needs neither a tab bar nor a sidebar, per the table in
   [Sidebars › iOS, iPadOS](https://developer.apple.com/design/human-interface-guidelines/sidebars#iOS-iPadOS).
   I did not restructure navigation.
6. **Per-member removal being confirmed at all is correct.** Removing someone's access is not
   undoable here, so the alert is appropriate under
   [Alerts › Best practices](https://developer.apple.com/design/human-interface-guidelines/alerts#Best-practices).
   The confirmation should exist; only its wording and roles need fixing (F8).
7. **An indeterminate `ProgressView` is acceptable** for a send of unknown duration.
   [Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)
   prefers determinate "when possible", which a network invite generally is not. Only its placement
   and missing label are raised (F4, F11).

---

## What I did **not** check

Stated plainly, because several claims above can only be closed with a running app.

- **No running app.** Everything is from the source file and the three supplied screenshots.
  **VoiceOver, the Accessibility Inspector audit, Voice Control, Switch Control, and hardware-keyboard
  navigation were not run.** F4 in particular is reasoned from the absence of labels in code; the
  exact announced strings are unverified.
- **Hit-target claims (F7) were measured from screenshots, not tapped on a device.** The measurements
  are solid for the *rendered* geometry, but only device testing settles hit-testing.
- **Settings not toggled:** Increase Contrast, Reduce Transparency, Reduce Motion, Bold Text,
  Button Shapes, Differentiate Without Color. Reduce Transparency is especially relevant to the
  toolbar glass and was not exercised.
- **Only three text sizes observed** — default and AX5 (plus the dark capture). The intermediate
  sizes and the *smallest* size were not seen.
- **No localisation or RTL pass.** F13 flags the pluralisation bug by inspection. Layout mirroring is
  unverified, though the code uses `.leading`, which is the right primitive.
- **iPhone only.** No iPad, no landscape, no Split View, no Dynamic Island interaction, no Mac
  Catalyst. iPad layout at this width is unexamined.
- **Failure paths unreachable.** `invite()` is a 1.2 s stub with no error branch, so real network
  failure, duplicate-invite, and rejected-address behaviour could not be reviewed.
- **Contrast figures are WCAG-style ratios** I computed from the code's literal sRGB values and from
  screenshot pixels, using the standard relative-luminance formula. The HIG is not a conformance
  standard; where I quote 4.5:1 I am citing Apple's own Dark Mode page, and the rest are
  measurements offered as evidence, not as HIG thresholds.

---

## Summary

| # | Finding | Severity | Claim type |
| --- | --- | --- | --- |
| F1 | "Stop sharing" wipes all access with no confirmation, not a button | 🔴 Blocks/destroys | Cited + suggestion |
| F2 | No Dark Mode adaptation; placeholder at 1.05:1 | 🔴 Unreadable | Cited |
| F3 | Dynamic Type opted out everywhere but one field | 🔴 Unreadable | Cited |
| F4 | No accessibility labels on icon-only/shape-only elements | 🟠 Materially harder | Cited |
| F5 | "⋯" silently toggles link sharing | 🟠 Unpredictable | Cited |
| F6 | Edit permission by colour alone | 🟠 Materially harder | Cited |
| F7 | ✕ (20 pt) and Send (38 pt) below 44 pt | 🟠 Materially harder | Cited |
| F8 | "Are you sure?" / "OK" / no destructive role | 🟠 Unclear destructive | Cited |
| F9 | Validation inverted — valid input shows red | 🟡 Confusing | Cited |
| F10 | No email keyboard, AutoFill, or autocorrect config | 🟡 Harder | Cited |
| F11 | Send: no disabled state, double-submit possible, no press state | 🟡 Data defect | Cited |
| F12 | Switch used outside a list row | 🟡 Platform inconsistency | Cited + recommendation |
| F13 | Title duplication, fixed inset, email-as-name, "1 people", capitalisation | 🔵 Cosmetic | Mixed |

**The single highest-value change** is F12's restructuring into a `List` with semantic colours and
text styles: it dissolves most of F2, F3, F4, F7, and F12 at once, because the system supplies
adaptive backgrounds, scaling type, row semantics, and correct metrics that this screen currently
reimplements by hand. **The single most urgent change** is F1 — it is one tap from irreversible data
loss, and it is the only finding here that can cost a user something they cannot get back.
