# Notification Settings: decisions, checks, and open items

## Context established first

Per the skill's step 1, these decide whether any given piece of guidance applies at all:

| | |
| --- | --- |
| Platform | iOS, iPhone |
| Minimum deployment target | iOS 16.0 |
| UI framework | SwiftUI |
| Components | System-provided throughout. No custom controls. |
| Navigation | Pushed from the app's existing settings list |

That last row matters more than it looks. Every control on this screen is a system control, so
press states, focus behavior, Dynamic Type response, appearance adaptation, and assistive-technology
traits come from the system, not from this file. Findings of the form "this has no press state" or
"this needs a manual accessibility trait" would apply to a custom lookalike and do not apply here.

Because the screen is pushed, it declares `navigationTitle` but no `NavigationStack` of its own.
The caller supplies the back button and the interactive back gesture, so nothing here can break them.

## Control choices, and what they rest on

Sources are Apple's Human Interface Guidelines. I read each page's iOS/iPadOS platform section
rather than the page title, since several of these pages answer differently per platform.

**Allow Notifications: a switch in a list row.**
[Toggles › iOS, iPadOS](https://developer.apple.com/design/human-interface-guidelines/toggles#iOS-iPadOS)
says to use the switch toggle style only in a list row, and that no separate label is needed there
because the row content supplies the context. This is in a `Form` row, so that condition is met.
The macOS part of the same page (checkboxes, radio buttons, mini switches) is deliberately ignored;
applying it here would be exactly the platform-transfer error the skill warns about.

**Per-category delivery: a segmented control, at normal text sizes.**
Three mutually exclusive, visible options.
[Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)
asks for no more than about five segments on iPhone, consistent content types, and noun labels:
three noun segments, text only, no mixed icons. Off / Quiet / Immediate are opposing-ish but not a
pair, so a toggle would be wrong; the Toggles page says to use a different component when the choice
is not between two opposing values.

**Notification sound: a pull-down menu, not a wheel picker and not segments.**
[Pickers › Best practices](https://developer.apple.com/design/human-interface-guidelines/pickers)
recommends a picker for medium-to-long lists and says that for a fairly short list of choices, to
consider a pull-down button instead, since a picker "may add too much visual weight to a short list."
Five sounds is a short list, so `.pickerStyle(.menu)` (which renders as a pull-down button in a form
row, showing the current value in the row) is the closer match. Segments were rejected here because
five word-labels of differing length would not size consistently on iPhone.

**Do Not Disturb window: two compact time pickers.**
[Pickers › iOS, iPadOS](https://developer.apple.com/design/human-interface-guidelines/pickers)
describes the compact style as a button that opens a modal editor and recommends it when space is
constrained, which is the case in a form row. `displayedComponents: .hourAndMinute` gives the time
mode. The page also notes date picker values and their order depend on device language and location,
so the screen formats times through `Date.FormatStyle` and durations through `DateComponentsFormatter`
rather than building strings by hand. 12h/24h and locale ordering are therefore the system's job.

**Immediate count: plain text in the section footer.**
The requirement is to see how many categories deliver immediately. It is stated as a sentence rather
than a colored badge, which keeps it readable for someone who cannot distinguish the color and keeps
it in the VoiceOver reading order.
[Color › Best practices](https://developer.apple.com/design/human-interface-guidelines/color) advises
against relying solely on color to communicate essential information.

**Test notification result: an inline row, not an alert.**
This is the decision I most expected to get wrong by reflex.
[Alerts › Best practices](https://developer.apple.com/design/human-interface-guidelines/alerts) says
to avoid using an alert merely to provide information, and to prefer another way of communicating
within the relevant context when the message is not actionable. Success is not actionable, so an
alert for it would be exactly the pattern that page discourages. The result appears as a row under
the button and persists until the next attempt, so it is not a time-boxed element that can vanish
before it is read.

Note the distinction the Notifications page draws:
[Notifications › Best practices](https://developer.apple.com/design/human-interface-guidelines/notifications)
says to use an alert, not a notification, to display an error message. That is about which channel
carries an error, not a requirement to interrupt with an alert for an informational success.

**The button and its states.**
[Buttons › iOS, iPadOS](https://developer.apple.com/design/human-interface-guidelines/buttons) says
a button can be configured to show an activity indicator when an action does not complete instantly,
and to change the label alongside it. The label changes to "Sending Test…" and a `ProgressView`
appears. The indicator is indeterminate because the send has no meaningful fractional progress;
[Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)
prefers determinate where a duration is well defined, which this is not.

The button is disabled while a send is in flight, and `sendTestNotification()` also guards on
`isSendingTest`, so a double tap cannot produce two sends. It is also disabled when notifications are
off, and the section footer says why, so it is not a dead end without explanation.

No button here carries the primary or destructive role. Nothing on the screen destroys data, and
[Buttons › Role](https://developer.apple.com/design/human-interface-guidelines/buttons) reserves the
primary role for the most likely action in a view, which a test send is not.

**Settings restraint, and one deliberate omission.**
[Settings › Best practices](https://developer.apple.com/design/human-interface-guidelines/settings)
says to respect systemwide settings and avoid including redundant versions of them. So this screen
does not re-implement the system's own notification permission, Focus modes, or per-alert-style
controls; it only configures what this app sends. When a send fails because the system permission is
off, the screen shows a button that opens system Settings, which the same page suggests ("consider
providing a button that opens it directly from your interface") rather than duplicating that control.

## Accessibility

- Every control has a visible text label, so Voice Control works by speaking what is on screen.
  There are no icon-only controls on this screen.
- The segmented control's own label is provided and then hidden visually with `.labelsHidden()`,
  so it is not an unlabelled control to VoiceOver. Each segment carries an
  `accessibilityLabel` that names the consequence ("Quiet, delivered silently") rather than just
  the word, per the label-versus-picture point in
  [VoiceOver](https://developer.apple.com/design/human-interface-guidelines/voiceover).
- The success/failure row uses a symbol plus text plus color, so the outcome survives grayscale.
  The `ProgressView` is `accessibilityHidden` because the button label already says "Sending Test".
- The result is announced with `UIAccessibility.post(notification: .announcement,)`, because the row
  appears below the button and VoiceOver focus stays on the button. Apple's VoiceOver page asks that
  layout and content changes be communicated.
- At accessibility text sizes (`dynamicTypeSize.isAccessibilitySize`) each category row swaps the
  segmented control for a pop-up menu. Three text segments cannot show their titles at AX sizes, and
  a truncated "Imm…" would destroy the only copy of that information. This is the Dynamic Type
  layout adaptation asked for in
  [Typography › Supporting Dynamic Type](https://developer.apple.com/design/human-interface-guidelines/typography#Supporting-Dynamic-Type).
- No literal font sizes, no fixed-height containers around text, no `lineLimit(1)` on text carrying
  unique information. Colors are semantic (`.secondary`, and the system `.green`/`.red` used only as
  a redundant channel); there are no hex literals or hard-coded greys, per
  [Color](https://developer.apple.com/design/human-interface-guidelines/color).
- Layout uses leading/trailing alignment only, no left/right, so right-to-left mirroring is the
  system's. User-visible strings go through `LocalizedStringKey` or `NSLocalizedString`, and the two
  interpolated sentences use positional format specifiers (`%1$d`, `%1$@`) so a translation can
  reorder them.

## Design suggestions, labelled as mine and not as Apple requirements

- Each category row carries a one-line explanation ("Messages sent only to you."). Apple does not
  require it; I think the difference between Mentions and Direct Messages is not self-evident.
- The Quiet Hours footer states the resulting window in words, including its duration. My preference,
  on the grounds that two time fields do not make the wrap past midnight obvious.
- When start and end are the same minute the footer says what to do instead of what failed. That
  wording style follows [Writing](https://developer.apple.com/design/human-interface-guidelines/writing)
  and the skill's validation guidance, but the choice to surface it at all is mine. I deliberately
  did not block or auto-correct the value, since it is not an error state, just an empty window.
- Categories, Quiet Hours, and Sound are hidden while notifications are off, since they cannot take
  effect. The alternative, disabling them in place, is also defensible.

## What I checked, and how

There is no Xcode project and no simulator in this directory, so **I did not run the app.** Nothing
below is a claim about runtime appearance or behavior. What I could check, I did:

- **Compiles against the iOS 16 floor.** `swiftc -typecheck -sdk <iPhoneOS SDK> -target
  arm64-apple-ios16.0` passes cleanly, in both `-swift-version 5` and `-swift-version 6` language
  modes. A full `-c` compile to an object file with `-warnings-as-errors` also passes, so the file
  is warning-free.
- **The typecheck is genuinely exercising the file.** I confirmed this two ways rather than trusting
  a fast exit code: injecting a bogus `.pickerStyle(.bogusStyleXYZ)` fails as expected, and a probe
  using `ContentUnavailableView` fails with "only available in iOS 17.0 or newer". So the iOS 16
  availability floor is actually enforced, not merely asserted.
- **API availability checked against Apple's documentation**, not recollection. `LabeledContent`,
  `NavigationStack`, `ViewThatFits`, `Gauge`, `tint(_:)`, `formStyle(_:)` and
  `accessibilityValue(_:)` are iOS 16.0; `dynamicTypeSize` and `DynamicTypeSize.isAccessibilitySize`
  are iOS 15.0; `PickerStyle.menu` is iOS 14.0; `Date.FormatStyle` is iOS 15.0. The file uses only
  APIs at or below the iOS 16 floor. (It does not end up needing `LabeledContent`, `ViewThatFits`,
  or `Gauge`; I checked them while comparing alternatives.)
- **The date logic was executed**, by extracting `doNotDisturbDuration` into a host-macOS harness and
  running it. `22:00→07:00` gives 9 hours (wraps midnight correctly), `07:00→22:00` gives 15 hours,
  `23:30→00:15` gives 45 minutes, `00:00→23:59` gives 23 hours 59 minutes, and `09:00→09:00` returns
  `nil`, which is what drives the "choose a different end time" footer. The Immediate count was
  likewise executed across all-off, all-immediate, the shipped defaults, and a missing-key case.
- **Sources read at the page**, not from memory: Settings, Toggles, Segmented controls, Pickers,
  Buttons, Alerts, Notifications, Lists and tables, Labels, Accessibility, Color, Typography,
  Progress indicators. Where a page had an iOS/iPadOS section I used that section.

## What I could not check here, and what would settle it

These need a running app on a device or simulator. They are unverified, not passing:

1. **Dynamic Type at every size.** I reasoned about the AX-size swap; I did not see it. Walk the
   screen from xSmall to AX5 and confirm the segmented control hands off to the menu cleanly and
   nothing clips. Also enable Bold Text.
2. **VoiceOver.** Swipe through every row and listen. In particular, confirm the announcement after a
   test send actually interrupts appropriately and is not swallowed, and that the combined result row
   reads as one coherent element.
3. **Light and dark, Increase Contrast, Reduce Transparency.** The success green and failure red are
   system colors and should adapt, but I have not looked at them.
4. **The failure path itself.** I could not exercise a real denied-permission failure. Confirm the
   host app throws `TestNotificationFailure.systemPermissionDenied` in that case, that the Open
   Notification Settings button lands on this app's notification settings, and that returning to the
   app leaves the screen in a sensible state.
5. **Localization.** Pseudolocalize with a long language and check the segment titles first; they are
   the tightest text on the screen and the most likely thing to force the menu fallback earlier than
   expected.
6. **Right-to-left.** No hard-coded left/right, but confirm with an RTL pseudolanguage.

## Things I examined and deliberately left alone

- **The `Form` + grouped sections structure.** Consistent with the iOS Settings pattern described in
  [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables),
  which cites iOS Settings as a hierarchy of lists, and it is what the app's own settings list will
  already be using.
- **The default green switch color.** The Toggles iOS section says to change it only if necessary.
  No app accent color is known here, so the default stands.
- **System-supplied press, focus, and disabled states.** Nothing in this file overrides them, which
  is the reason no custom press state is needed.

## Integration notes for whoever wires this up

`NotificationSettingsModel` requires a `sendTest` closure; there is no default. That is deliberate.
A stub that always reported success would make the screen claim delivery works when it may not, and
the whole point of requirement 6 is to report the truth. The host app should request authorization,
schedule the notification, and throw `TestNotificationFailure.systemPermissionDenied` when the system
permission is the blocker so the recovery button appears.

The model holds state but does not persist it. Storage and the actual `UNUserNotificationCenter`
work belong to the host app, per the task's self-contained, no-network constraint.
