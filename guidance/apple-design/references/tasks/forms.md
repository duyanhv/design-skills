# Forms, input, and settings

Collecting information without making someone type more than they must.

## Do not ask for it at all, if you can avoid it

Apple's [Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data)
page leads with getting information from the system where possible, and with offering choices
instead of requiring text entry. That ordering is the actual guidance, and it is the part most often
skipped in a review that jumps straight to field styling.

Before critiquing a form's controls, ask whether each field needs to exist. Sign in with Apple,
AutoFill, contact and address pickers, and the camera can replace whole groups of fields. See
[Sign in with Apple](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
and [Managing accounts](https://developer.apple.com/design/human-interface-guidelines/managing-accounts).

## Choose the control by the shape of the answer

| The answer is… | Control | Read |
| --- | --- | --- |
| Short free text (name, email) | Text field | [Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields) |
| A secret | Secure text field, never prepopulated | [Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data) |
| One of two opposing states | Toggle | [Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles) |
| One of a few visible, mutually exclusive options | Segmented control | [Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) |
| One of a medium-to-long list | Picker | [Pickers](https://developer.apple.com/design/human-interface-guidelines/pickers) |
| A date or time | Date picker, chosen by available space | [Pickers](https://developer.apple.com/design/human-interface-guidelines/pickers) |
| A value in a continuous range | Slider | [Sliders](https://developer.apple.com/design/human-interface-guidelines/sliders) |
| A small numeric adjustment | Stepper | [Steppers](https://developer.apple.com/design/human-interface-guidelines/steppers) |
| Long-form text | Text view | [Text views](https://developer.apple.com/design/human-interface-guidelines/text-views) |

### Switches, checkboxes, and radio buttons

Apple's Toggles page gives these different homes **on different platforms**, and the guidance does
not transfer between them. Each statement below belongs to the platform section it came from, so
cite the section rather than the page:

- **iOS and iPadOS:** use the switch style only in a list row, and outside a list prefer a button
  that behaves like a toggle rather than a switch. Read
  [Toggles › iOS, iPadOS](https://developer.apple.com/design/human-interface-guidelines/toggles#iOS-iPadOS).
- **macOS:** switches, checkboxes, and radio buttons belong in the window body rather than the
  window frame. Apple prefers a switch for a setting it wants to emphasize, generally advises
  against replacing a checkbox with a switch, and points to a checkbox where a hierarchy of settings
  is needed. Read [Toggles › macOS](https://developer.apple.com/design/human-interface-guidelines/toggles#macOS).

Note that these pull in opposite directions: the list-row restriction is an iOS and iPadOS rule, and
applying it to a Mac window would be exactly the platform-transfer mistake described in
[platforms.md](../context/platforms.md). Check which platform section your finding rests on, and
check the current wording before calling a choice a violation.

## Keyboard and text entry

On iOS, iPadOS, tvOS, and visionOS, the keyboard type is part of the field's design, not an
afterthought: Apple's Text fields page says to show the appropriate keyboard type. Check the code
for keyboard type, content type (which drives AutoFill), autocapitalization, autocorrection, and
submit label. An email field with a default alphabetic keyboard and no `.emailAddress` content type
is a concrete, fixable finding.

Also check that the keyboard does not cover the focused field, and that tab order between fields is
sensible. Apple's text field guidance addresses tabbing expectations between multiple fields. See
[Virtual keyboards](https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards)
and [Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards).

**Our judgment, not Apple's:** on watchOS and tvOS, treat any multi-field form as a design problem
to escape rather than to lay out. Apple's own text field guidance says to minimize text entry there.

## Validation and errors

Apple's guidance covers validating fields when it makes sense and validating dynamically, and says
to make required data clear before someone tries to proceed. Turn that into three checks:

1. **Timing.** Validating on every keystroke can flag a half-typed email as wrong. Validating only
   on submit hides work already done. Decide per field and say which you chose.
2. **Placement.** The message belongs with the field it concerns, not only in a summary banner.
3. **Wording.** Name what to do, not what failed. "Enter a date after today" beats "Invalid input".
   See [Writing](https://developer.apple.com/design/human-interface-guidelines/writing).

An error conveyed by red border alone fails for someone who cannot distinguish it. Apple's
accessibility guidance is explicit about not relying on color alone; see [accessibility.md](accessibility.md).

## Settings

[Settings](https://developer.apple.com/design/human-interface-guidelines/settings) is about
restraint: good defaults, few settings, and respecting systemwide settings rather than duplicating
them. Apple also distinguishes rarely changed options, which can live in the system Settings app,
from task-specific options that belong near the task.

The frequent mistake is a settings screen that re-implements something the system already owns
(text size, appearance, language). Prefer honoring the system value. See
[typography.md](typography.md) and [appearance.md](appearance.md).

## What to check in the code

1. Content type and keyboard type per field, and whether AutoFill can actually fill the form.
2. Whether a secure field is ever prepopulated. Apple states plainly never to do this.
3. Required-vs-optional made visible before submission, not discovered by failing.
4. Validation timing and where the message is rendered.
5. Whether the label is a real label bound to the control, or placeholder text doing double duty. A
   placeholder disappears on focus and is not a label; Apple's text field guidance treats a hint as
   a hint about purpose.
6. State restoration: half-completed input surviving backgrounding.

## Verify

- Fill the form with AutoFill, with a hardware keyboard, and with paste.
- Trigger each validation error and read the message as a stranger would.
- Enter the longest realistic value and the empty value in every field.
- Turn on the largest accessibility text size and confirm labels and fields remain usable.
- With VoiceOver, confirm every field announces its label, its value, and its error.
