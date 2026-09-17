# Notification settings screen — build notes

Deliverables: `app/notification-settings.js`, `app/notification-settings.css`.
Library: `@material/web` 2.5.0, read out of `node_modules` in this workspace.
Written following `skills/material-3/SKILL.md`.

---

## 1. Implementation target

Settled before writing any code, as the skill's "Establish the implementation target" step asks:

| Question | Answer, and how it was established |
| --- | --- |
| Platform | Web, plain HTML/CSS/JS, no framework (TASK.md) |
| Library | `@material/web` 2.5.0, confirmed in `node_modules/@material/web/package.json` |
| Design system version behind it | v0.192, stated in the header of `tokens/versions/v0_192/_md-sys-color.scss` |
| Existing theme | **There is none.** No theme file, no host page, no app shell exists in this workspace. See §5. |
| Baseline or Expressive | Baseline M3. 2.5.0 ships no Expressive component; I did not enable any experimental API. |

Components available in 2.5.0 were enumerated from the source rather than assumed, by grepping every
`@customElement('…')` call in the package. That list is what the component choices below are
constrained to.

The design system is not the library: Material 3 describes components this library does not
implement, and a guideline page is not evidence that `md-…` exists in 2.5.0. Every component named
below was checked to exist as a file in this installed version.

## 2. The screen's task, and the component chosen for each part

The skill says to choose a component for its **behaviour**, then confirm usage. Six required
capabilities, one decision each.

### Turn all notifications on/off → `md-switch`

`components.md` maps "toggling one independent setting" to a switch, and the setting takes effect
immediately with no confirm step. A checkbox would imply a pending form submission.

### Per-category delivery (Off / Quiet / Immediate) → `md-radio` in a `role="radiogroup"`

This is the decision I spent longest on, and it went against my first instinct.

A segmented button is Material's component for "choosing between a few visible options", and three
mutually-exclusive options is exactly its shape. **I did not use it**, for two reasons found by
reading the installed code, not by assumption:

1. In 2.5.0 the segmented button lives at `labs/segmentedbutton*`. Labs is explicitly unstable.
2. `labs/segmentedbutton/internal/segmented-button.d.ts` documents it as usable **only** as a child
   of `SegmentedButtonSet`, and the set's own selection API is `getButtonSelected(index)` /
   `setButtonSelected(index, …)` with a `segmented-button-set-selection` CustomEvent. It is
   index-addressed, and the component exposes no radiogroup semantics.

Three independent single-choice groups stacked vertically is what a radio group is for, and the
stable `md-radio` gives roving single-selection for free through its
`SingleSelectionController`, which groups by the `name` attribute within the same root. I verified
in a browser that this scoping works inside a shadow root and does not leak between the three
groups (§4).

**What I did instead of the segmented button:** radios with a visible text label *and* a one-line
hint ("Delivered silently", "Sound and banner"), so the meaning of "Quiet" does not depend on the
user already knowing it.

### Do-not-disturb window → two `md-outlined-text-field` with `type="time"`

There is **no time picker component in `@material/web` 2.5.0.** I checked the full custom-element
list; there is no `md-time-picker` and no date/time component of any kind.

`textfield/internal/text-field.d.ts` classifies `time` under `UnsupportedTextFieldType` — a type
the component permits but does not officially support, distinct from `InvalidTextFieldType`, which
it rejects. So this is a deliberate use of a permitted-but-unsupported type, not an accident.

I verified at runtime that it works: the shadow `<input>` really is `type="time"`, the value round
trips as `"22:00"`, and the floating label renders. The risk it carries is styling, not function:
the native time control's internals are UA-drawn and may not adopt the Material field's metrics
identically in every browser. **This is the item most in need of visual inspection.** See §6.

I did not hand-build a time picker; a custom control that looks Material inherits none of the
library's accessibility, and this is precisely the tradeoff the skill warns about.

### Notification sound → `md-outlined-select` + `md-select-option`

Four options, one choice, low prominence, and the current value must stay visible. A select shows
the chosen value in its own field. Radios for a fifth-tier setting would out-weigh the category
choices, which are the more important decision on this screen.

### Count of categories set to Immediate → derived text in `role="status"`

Not a component: a derived read-out. It is recomputed on every state change and lives in a polite
live region, so a keyboard or screen-reader user hears the consequence of a change without moving
focus. It is stated in full words ("2 of 3 categories are set to Immediate.") rather than as a bare
badge number, which would say nothing on its own.

### Send a test notification → `md-filled-button`, plus `md-circular-progress` and a result line

Emphasis is a claim about priority, and this is the only action on the screen that *does* something
rather than recording a preference, so it is the one filled button. Reset is `md-text-button`: real
but secondary. There are no other filled buttons, so the hierarchy is stated exactly once.

The send is genuinely asynchronous (permission may be requested), so it has three outcomes, all
implemented: in-flight (button disabled + indeterminate progress), success, failure with the
reason and a next step ("permission is 'denied'. Check the browser's notification permission…").

No network is used. The test goes through the browser's own `Notification` API, and when that is
absent or not granted, the failure path reports why.

## 3. Theming: roles, not values

Every colour in the CSS is a `--md-sys-color-*` role. There is no literal hex anywhere except the
documented fallback block, explained in §5.

Pairings are explicit, following `theming.md`:

- Element background `surface` / text `on-surface`
- Cards `surface-container`, the master and summary cards `surface-container-high` — they sit
  higher in the hierarchy. **Dark mode is not an inversion:** the hierarchy is carried by the
  surface-container roles becoming lighter with elevation, not by shadow, so the screen still reads
  as layered in dark. A design where every card sat on plain `surface` would read flat.
- Secondary text `on-surface-variant`, dividers `outline-variant`, error text `error`.

All three changes I made are **component-layer or local**. I did not redefine `primary` or any
other system role, which would have repainted every unrelated surface in the host app.

Typography uses `--md-sys-typescale-*` roles, and each carries size, line-height and weight
together — applying size alone discards the rest of the token, which is what makes hand-copied type
look subtly wrong. `headline-small` sits on an `<h1>` and `title-medium` on `<h2>`: the role styles
the text, the element carries the structure for anything navigating by heading.

## 4. What I actually verified, and how

Verified by **running the component in Google Chrome 141 headless** against a local static server
with an import map, at three configurations. 46 runtime assertions. The harness lived in
`/tmp/mat-build/verify/` and is not part of the deliverable.

Configurations: 1280px light, 390px light, 1280px forced-dark.

Established at runtime:

- All five custom elements upgrade (`MdSwitch`, `MdRadio`, `MdOutlinedSelect`,
  `MdOutlinedTextField`, and the buttons); no console errors, no unhandled rejections.
- `type="time"` really produces `input[type=time]`; value round-trips.
- **Radio selection**: clicking selects, deselects its sibling, and does **not** cross into the
  other two category groups. Shadow-root name scoping confirmed, not assumed.
- **Label activation**: clicking the text label activates its radio, so the target is the whole row
  and not just the 20px circle.
- **Disabled state** (the state most often unrendered): turning the master switch off disables all
  nine radios, both time fields, the select and the send button, and reveals the explanatory note.
- Derived count recomputes correctly, including singular/plural agreement.
- Test-notification failure path renders icon + text + `role="alert"`, and the progress indicator
  is hidden afterwards.
- Reset restores every control, including the select and both time fields.
- Theme override: setting `--md-sys-color-surface-container` on the host really repaints the card,
  so the fallback never wins over a real theme.
- Layout: two columns at 1280px, one at 390px, no horizontal overflow at either.
- **Large text**: with root font-size forced to 32px, the master row and choice labels do not clip
  and nothing overflows horizontally. This was the check `typography.md` says finds real defects,
  and it is why labels wrap and stack rather than sitting in fixed-width rows.
- Touch target: a choice row measures 56px tall, above the 48px the radio's own
  `touch-target="wrapper"` reserves.

**Two real defects were found this way and fixed**, both invisible to source reading:

1. Cards rendered **fully transparent** (`rgba(0,0,0,0)`) on an unthemed page, because a bare
   `var(--md-sys-color-surface-container)` with no fallback resolves to nothing. The library's own
   components were fine — they carry internal fallbacks — so only my custom markup was affected.
   Fixed as described in §5.
2. The count read "1 of 3 category is set to Immediate", which is ungrammatical. Fixed.

Contrast was computed from the baseline scheme values read out of
`tokens/versions/v0_192/_md-sys-color.scss` resolved through `_md-ref-palette.scss`. Body text on
`surface-container` measures 14.85:1 light and 12.57:1 dark; secondary text on
`surface-container-high` 7.63:1 light and 8.42:1 dark; error text on `surface-container-high`
5.34:1 light and 8.41:1 dark. WCAG 2.2 SC 1.4.3 requires 4.5:1 for normal-size text, so all pass
**against this baseline scheme** — which is not the scheme a themed host will supply. See §6.

Colour is never the only channel: the test result pairs an inline SVG icon with text; the disabled
category group carries a written note, not just dimming.

## 5. Things that were not available, and what I did instead

**No theme, and no host page.** The workspace has no app shell, so there is nothing to read role
values out of. Runtime testing then exposed the transparent-card defect above. What I did: define
the baseline scheme as **`var()` fallbacks only** — `var(--md-sys-color-surface-container,
var(--_fb-surface-container))` — with light and dark sets switched by `prefers-color-scheme`. The
values are the library's own baseline, copied from
`tokens/versions/v0_192/_md-sys-color.scss` resolved through `_md-ref-palette.scss`, with the file
path recorded in a CSS comment so they can be re-checked. Any host theme still wins, which I
verified at runtime. This is a fallback for legibility, not a theme, and not a brand claim.

**No time picker in 2.5.0.** Used `type="time"` text fields, an `UnsupportedTextFieldType`. Detailed
in §2.

**No segmented button outside `labs/`.** Used radio groups. Detailed in §2.

**No `md-card` outside `labs/`.** The card containers are plain `<div>`s styled with
`surface-container` roles and `--md-sys-shape-corner-large`, rather than pulling in a labs
component for a purely visual container.

**No `md-icon`.** `md-icon` renders a ligature from the Material Symbols font, and TASK.md forbids
network requests and external assets. Two inline SVG paths are used for the test-result icons
instead, filled with `currentColor` so they follow the role colour.

**Adaptive layout uses container queries, not viewport media queries.** The element may be placed in
a narrow pane inside a wide window, so the space it has matters more than the window's width. A
`@supports not` viewport fallback covers engines without container queries. Note per `layout.md`:
this element contains **no navigation**, so widening changes column count only. No destination moves
between a bar and a rail, nothing is dropped into an overflow, and DOM order is unchanged, so focus
order is identical at every width.

## 6. What needs verification I could not do here

Stated plainly, because an unverifiable claim invites a team to think the work is done.

1. **No screen reader was run.** Roles, `aria-label`, `aria-describedby`, `role="radiogroup"` and
   the live regions are present in source and the radios expose `aria-checked` through the
   library's internals. That is a reasonable basis for "probably fine" and **not** for "verified".
   Specifically unverified: whether the per-radio label ("Mentions: Quiet. Delivered silently.")
   reads sensibly rather than verbosely in context, and whether the polite count announcement is
   helpful or becomes chatter when several categories are changed in a row.
2. **Contrast against the real theme is unmeasured.** The ratios in §4 are against the library's
   baseline scheme. `theming.md` is explicit that a result measured against a static scheme says
   nothing about what a themed or dynamic-colour user sees. Re-measure once the host theme exists.
3. **Only Chromium was exercised.** No Safari or Firefox run. The `type="time"` field is the most
   likely place to differ, since its internals are UA-drawn — this is the single highest-value
   visual check outstanding. Also unverified cross-browser: `container-type: inline-size` and the
   `@supports not` fallback path.
4. **No visual inspection by a human at all.** Every claim in §4 is a programmatic measurement. No
   screenshot was reviewed, so nothing is established about whether the screen looks right: spacing
   rhythm, the select's dropdown surface, the switch's icon, focus-ring visibility.
5. **Focus order was not tabbed through.** DOM order matches visual order and no element sets a
   positive `tabindex`, which makes the order predictable in principle. Actual tab traversal, and
   whether the focus ring is visible against `surface-container-high`, were not exercised.
6. **Hover and pressed state layers were not observed.** They come from the components' own ripples
   and were not overridden, but "not overridden" is an argument, not an observation.
7. **English, default locale, LTR only.** Times are formatted with `Intl.DateTimeFormat` and so
   follow the user's locale, but the layout was checked only in English. Longer translations of
   "Send test notification" or "Delivered silently" could change the wrapping. Logical properties
   (`inline-size`, `padding-block`, `border-block-start`) are used throughout, so RTL should mirror,
   but this was not verified in an RTL locale.
8. **Notification success path never observed.** Headless Chrome denies the permission, so the
   failure branch is the one that ran. The success branch, and the `default` permission prompt
   branch, are untested against a real grant.
9. **Persistence is out of scope.** The element holds state in memory and emits a
   `settings-change` CustomEvent with the full settings object; it does not save anything. Wiring
   that to storage is the host app's job.
