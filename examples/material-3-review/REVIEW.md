# Review: notification settings screen

**Target:** web, plain custom elements, `@material/web` 2.5.0 (verified in
`node_modules/@material/web/package.json`), light + dark following the OS, one build for phone and
desktop.

**Evidence basis.** Findings marked *(source)* come from reading `app/notification-settings.js`,
`app/notification-settings.css`, and the installed library sources under `node_modules/@material/web`.
Findings marked *(runtime)* still need a rendered page or a device. The library's design docs render
from the repository (`raw.githubusercontent.com/material-components/material-web/main/docs/...`,
fetched successfully); `m3.material.io` returned an application shell in this environment, so where I
cite an m3.material.io page it is for design intent that the repository docs link to, and I have kept
those claims to intent rather than numbers.

There is no theme entry point in the workspace: no `:root` block defines `--md-sys-color-*`. So the
only system token used by the app, `--md-sys-color-primary` in `.page`, resolves to the library's
baseline value. Baseline light `primary` is `md-ref-palette primary40`, dark `primary` is
`primary80` (`node_modules/@material/web/tokens/versions/v0_192/_md-sys-color.scss:51` and `:93`).

---

## A. Specification and standards problems

### A1. The page background uses the `primary` role as a surface, and its content is not `on-primary`
*(source)*

- **Where:** `notification-settings.css:4` (`.page { background: var(--md-sys-color-primary) }`), with
  `.title` `color:#1c1b1f` (`:14`), `.row-label` `#1c1b1f` (`:29`), `.count` `#49454f` (`:61`).
- **What is wrong:** `primary` is a role for high-emphasis *elements* (a filled button, a selected
  state), not for the page container. Its content partner is `--md-sys-color-on-primary`; the screen
  instead paints near-black text on it. Material Web's color doc states the convention directly:
  "All tokens have a corresponding `--md-sys-color-on-<token>` for content color with accessible
  contrast", and its usage example pairs `background: var(--md-sys-color-primary)` with
  `color: var(--md-sys-color-on-primary)`
  (<https://github.com/material-components/material-web/blob/main/docs/theming/color.md>, "Color
  scheme" → "Tokens"). A page container should use a neutral surface role
  (`surface` / `surface-container*` / `background`, listed in the same table).
- **Consequence, measured:** against the baseline light `primary` `#6750A4`, `#1c1b1f` body text
  computes to 2.66:1 and the `.count` text `#49454f` to 1.45:1. WCAG 2.2 SC 1.4.3 (Contrast
  (Minimum)) requires 4.5:1 for text below large-scale, 3:1 for large-scale
  (<https://www.w3.org/TR/WCAG22/#contrast-minimum>). Both fail; `.count` at 14px fails by a wide
  margin. This is a conformance claim about the baseline theme; if the product ships a different
  palette the ratio changes but the role pairing is still wrong.
- **Smallest fix:** `background: var(--md-sys-color-surface)` on `.page` and
  `color: var(--md-sys-color-on-surface)`, then delete the hard-coded text colors (see A2).

### A2. Hard-coded hex colors do not follow the OS appearance *(source)*

- **Where:** `#1c1b1f` (`:14`, `:29`, `:46`), `#e0e0e0` row rule (`:23`), `#79747e` and `#ffffff` on
  the time inputs (`:42`, `:47`), `#b3261e` (`:51`), `#49454f` (`:61`), and the three dot colors in
  `notification-settings.js:37-39` (`#2e7d32`, `#f9a825`, `#9e9e9e`).
- **What is wrong:** these are light-scheme literals with no dark counterpart. In dark appearance the
  library's own component internals flip (their tokens resolve from `_md-sys-color.scss`), but these
  literals do not, so the screen becomes dark Material components plus a white time field with
  near-black text on whatever the container resolves to. The theming guide's whole model is that a
  scheme is set once as `--md-sys-color-*` custom properties and components and custom CSS both read
  them (same doc, "Color scheme" → "Tokens"; the guide's example headed "Usage in custom components"
  shows custom CSS reading the same variables).
- **Smallest fix:** replace with roles: text `on-surface`, secondary text `on-surface-variant`,
  divider `outline-variant`, field outline `outline`, error `error`, field background `surface`.
  Also note the app has no scheme definition at all: a `:root` light scheme plus a
  `@media (prefers-color-scheme: dark)` override (or a generated pair) has to exist somewhere for
  "follows the OS setting" to be true. **Unverified:** whether another stylesheet outside `app/`
  defines the scheme; nothing in this workspace does.

### A3. The "All notifications" switch has no accessible name *(source)*

- **Where:** `notification-settings.js:64-65`. The text sits in a sibling `<span class="row-label">`,
  not in a `<label>`, and there is no `aria-label`.
- **What is wrong:** the switch doc is explicit: "switches are not automatically labelled by `<label>`
  elements and always need an `aria-label`. See b/294081528"
  (<https://github.com/material-components/material-web/blob/main/docs/components/switch.md>,
  "Accessibility"). A plain `<span>` is weaker still: nothing associates it. This fails WCAG 2.2
  SC 4.1.2 Name, Role, Value (<https://www.w3.org/TR/WCAG22/#name-role-value>) for that control.
- **Smallest fix:** `<md-switch aria-label="All notifications" ...>`.

### A4. The four selects have no accessible name and no visible field label *(source)*

- **Where:** `notification-settings.js:74` (three delivery selects) and `:102` (sound).
- **What is wrong:** `md-outlined-select` takes a `label` property, "The floating label for the
  field" (`select/internal/select.d.ts`), and `select/internal/select.js:295` and `:365` compute the
  exposed name as `this.ariaLabel || this.label` / `this.label || this.ariaLabel`, emitting
  `aria-label=${ariaLabel || nothing}`. With neither set, the button and listbox get no name at all.
  The row's `<span>` is not associated. WCAG 2.2 SC 4.1.2 again, and SC 3.3.2 Labels or Instructions
  (<https://www.w3.org/TR/WCAG22/#labels-or-instructions>) for the visible side.
- **Smallest fix:** `label="Delivery"` plus `aria-label="${c.name} delivery"` on each category select,
  and `label="Sound"` on the sound select. If the floating label is unwanted visually, at minimum set
  `aria-label`.

### A5. The info icon buttons have no accessible name, and no behavior *(source)*

- **Where:** `notification-settings.js:85-87`.
- **What is wrong:** two defects in one element. (a) The icon-button doc requires a name: "Add an
  `aria-label` attribute to buttons whose labels need a more descriptive label", with the example
  `<md-icon-button aria-label="Search for Contact">`
  (<https://github.com/material-components/material-web/blob/main/docs/components/icon-button.md>,
  "Accessibility"). Without it the only text is the ligature "info", repeated three times, so a
  screen-reader user hears three identical unnamed buttons. SC 4.1.2. (b) No listener is ever
  attached to `.info` in `render()` (`:121-140`), so the control does nothing.
- **Smallest fix:** `aria-label="About ${c.name} notifications"`, and either wire a handler or remove
  the button.

### A6. The delivery state is communicated by dot color alone *(source)*

- **Where:** `notification-settings.js:36-40` and `:72`, `.dot` in CSS `:31-36`.
- **What is wrong:** the dot is an empty `<span>` with a background color and no text, no `role`, no
  label. It is the only at-a-glance indicator of off / quiet / immediate. WCAG 2.2 SC 1.4.1 Use of
  Color (<https://www.w3.org/TR/WCAG22/#use-of-color>) requires that color not be the sole visual
  means of conveying information. The colors are also raw hexes outside the scheme (A2), so they do
  not shift for dark appearance.
- **Smallest fix:** the select next to it already shows the state as text, so the cheapest correct
  change is to mark the dot decorative (`aria-hidden="true"`) and accept it as redundant decoration,
  and re-express the three colors as theme roles. If the dot must stand alone, add a text or icon
  difference per state.

### A7. The "do not disturb" range is flagged invalid in its own default state, and the error is
color-only *(source)*

- **Where:** `notification-settings.js:32-34` (`get dndInvalid() { return this.dndStart >= this.dndEnd }`),
  used at `:95` and `:97`; `.invalid` in CSS `:50-52`.
- **What is wrong:** the defaults are `22:00` and `07:00` (`:23-24`). `'22:00' >= '07:00'` is `true`
  as a string comparison, so the screen renders with both fields in the error style on first paint.
  An overnight quiet period is the normal case for this feature, so the predicate is simply the wrong
  rule, not a borderline one. Separately, the error is expressed only as a border color: no message,
  no `aria-invalid`, nothing announced. That is SC 1.4.1 (color alone) and SC 3.3.1 Error
  Identification (<https://www.w3.org/TR/WCAG22/#error-identification>), which requires the error be
  "described to the user in text".
- **Smallest fix:** treat a wrap-around range as valid (`dndStart === dndEnd` is the only degenerate
  case worth flagging), and if an error can occur, render it as text tied to the fields with
  `aria-describedby` and `aria-invalid="true"`.

### A8. Every control loses focus on every interaction *(source; visible effect needs runtime)*

- **Where:** `render()` assigns `this.innerHTML` (`:59`) and is called from every handler
  (`:123`, `:128`, `:135`, `:139`) and from `sendTest()` (`:44`, `:47`).
- **What is wrong:** replacing `innerHTML` destroys and recreates every element, so the element that
  triggered the event no longer exists when the handler returns and focus falls back to `<body>`. A
  keyboard user who toggles the switch is thrown to the start of the page; a user changing a delivery
  select is thrown out of the group they were working in. This is a focus-management defect against
  WCAG 2.2 SC 3.2.2 On Input (<https://www.w3.org/TR/WCAG22/#on-input>) territory and, more plainly,
  makes keyboard operation of the screen impractical. The library components are Lit elements
  designed to be updated by property, not re-serialized.
- **Smallest fix:** stop re-rendering the whole subtree. Mutate the affected elements in place
  (set `.value`, `.selected`, `.disabled`, update the count text). If a full re-render is kept,
  record `document.activeElement`'s id before and restore focus after. **Runtime check:** confirm
  the focus loss in a browser; the code makes it near-certain but I could not execute the page.

### A9. The disabled section is dimmed but not actually inert *(source)*

- **Where:** `.section.is-disabled { opacity: .38; pointer-events: none }` (CSS `:37-40`), applied at
  `notification-settings.js:68`.
- **What is wrong:** `pointer-events: none` removes mouse input only. The three `md-icon-button`s
  inside receive no `disabled` attribute, so they stay in the tab order and remain operable by
  keyboard while presented as unavailable. The selects *are* given `disabled` (`:74`), which means
  they get the wrapper's 0.38 on top of the component's own disabled opacity
  (`button/internal/_shared.scss:142-148` shows the equivalent pattern: components apply their own
  `--_disabled-*-opacity`), so the double-dimming pushes them below the contrast the library's
  disabled tokens were chosen for.
- **Smallest fix:** drop the wrapper `opacity`/`pointer-events` and set `disabled` (or `soft-disabled`)
  on each control, or put `inert` on the section and let the components' own disabled styling show.
  The icon-button doc's "Focusable and logically disabled" section documents `soft-disabled` for the
  case where the control should stay reachable
  (<https://github.com/material-components/material-web/blob/main/docs/components/icon-button.md>).

### A10. Three filled buttons claim three primary actions, one of them destructive *(source)*

- **Where:** `notification-settings.js:113-117`: `md-filled-button` for Save, Send test, and
  "Reset all settings".
- **What is wrong:** Material's button variants are an emphasis hierarchy, filled being the highest
  (<https://m3.material.io/components/buttons/overview> — design intent; the repository's
  `docs/components/button.md` carries the same set of types). Saving is the primary action here;
  sending a test is secondary; resetting everything is a destructive, rarely-wanted action that
  currently has the same visual pull as Save and sits adjacent to it with an 8px gap
  (CSS `:64-67`).
- **Smallest fix:** keep `md-filled-button` for Save, use `md-outlined-button` for Send test, and a
  `md-text-button` (separated from the pair) for Reset. Add a confirmation before Reset, which today
  wipes every category and the master switch immediately (`:50-54`).

### A11. Typography is hard-coded pixel values on non-semantic elements *(source)*

- **Where:** `.title` (CSS `:10-16`) on a `<div class="title">` (`js:61`); `.row-label` 16px
  (`:26-30`); `.count` 14px (`:59-63`); `font-family: Roboto, system-ui, sans-serif` (`:8`).
- **What is wrong:** the type system is a set of named roles exposed as `--md-sys-typescale-*`
  tokens, and the typeface as `--md-ref-typeface-plain`
  (<https://github.com/material-components/material-web/blob/main/docs/theming/typography.md>,
  "Typeface" → "Tokens"). Hard-coded `px` also does not respond to the user's font-size setting.
  Separately, the page's only heading is a `<div>`, so the screen exposes no heading structure at
  all: relevant to WCAG 2.2 SC 1.3.1 Info and Relationships
  (<https://www.w3.org/TR/WCAG22/#info-and-relationships>).
- **Smallest fix:** make the title an `<h1>` and style from
  `var(--md-sys-typescale-headline-small-*)`; row labels from `body-large`; `.count` from
  `body-medium`; set `font-family: var(--md-ref-typeface-plain, Roboto)`.

### A12. `md-icon` will not render as an icon unless the Material Symbols font is loaded *(source)*

- **Where:** `notification-settings.js:86` (`<md-icon>info</md-icon>`).
- **What is wrong:** `md-icon` renders a ligature; the icon doc instructs loading the font, e.g.
  `<link href="https://fonts.googleapis.com/icon?family=Material+Symbols+Outlined" rel="stylesheet">`
  (<https://github.com/material-components/material-web/blob/main/docs/components/icon.md>, "Usage" →
  "Outlined"). Nothing in `app/` loads it, and the same applies to Roboto, which the typography doc
  calls out as needing to be loaded if the typeface is unchanged. Without the font the button shows
  the literal word "info".
- **Smallest fix:** add the Material Symbols and Roboto stylesheet links in the host document.
  **Unverified:** the host HTML is not in this workspace, so the fonts may already be linked there.

### A13. Two controls are dead and one state is never stored *(source)*

- **Where:** `#save` (`js:114`) has no listener in `:121-140`; `.info` buttons likewise (A5); the
  sound select (`:102`) has no `change` listener, so `this.sound` never leaves `'Chime'` and the
  chosen sound is discarded on the next re-render.
- **What is wrong:** the sound value visibly reverts, because `render()` re-derives `selected` from
  `this.sound` (`:104`) and A8 re-renders on every other interaction. A user picks "Pulse", toggles
  anything else, and the field is back to "Chime".
- **Smallest fix:** add a `change` listener on `#sound` setting `this.sound = e.target.value`, and a
  `click` handler on `#save`.

### A14. The summary line changes silently and is ungrammatical at 1 *(source)*

- **Where:** `notification-settings.js:57` and `:111` — `${immediateCount} categories set to Immediate`.
- **What is wrong:** it renders "1 categories". More importantly it is the screen's feedback for a
  change made elsewhere on the page and is not in a live region, so a screen-reader user changing a
  delivery select gets no confirmation. (This one is an SC 4.1.3 Status Messages consideration,
  <https://www.w3.org/TR/WCAG22/#status-messages>; whether it qualifies as a status message depends
  on the intended role of the line, so I state it as a likely rather than certain conformance issue.)
- **Smallest fix:** pluralize, and add `aria-live="polite"` to the `<p class="count">`.

### A15. The row layout has no compact behavior and will overflow on a phone *(source; width needs a device)*

- **Where:** `.row` is a fixed-height 56px flex row (CSS `:18-24`) holding dot + label + select +
  icon button (`js:71-88`), inside `.page { max-width: 640px; padding: 24px }`.
- **What is wrong:** `md-outlined-select` sets `min-width: 210px` on its host
  (`node_modules/@material/web/select/internal/_shared.scss:19`). A category row therefore needs
  roughly 10px dot + 12px gap + label + 12px + 210px + 12px + the icon button, within a 360px
  viewport minus 48px of page padding, i.e. about 312px of content box. The label is `flex:1` so it
  will crush toward zero and then the row overflows horizontally. The two `input[type=time]` fields
  in the DND row (`js:94-97`) sit on the same 56px line and have the same problem. The screen also
  has no adaptive change of any kind for the desktop end of the range, which is the shape question
  the adaptive guidance is about (<https://m3.material.io/foundations/adaptive-design/overview> —
  design intent).
- **Smallest fix:** at a compact width, let `.row` wrap (`flex-wrap: wrap; height: auto;
  min-height: 56px`) so the control drops below its label, and drop the fixed `height` in favor of
  `min-height` everywhere so rows can grow with user font size.
- **Runtime check:** the exact width at which it breaks depends on the rendered label widths and the
  fonts actually loaded; confirm at 320px, 360px, and 412px.

---

## B. Needs a running interface or a device

These follow from the code but I could not execute the page in this workspace.

1. **Dark appearance as a whole.** A2 predicts specific breakage, but the actual result depends on
   whether the host document defines a scheme and a `prefers-color-scheme` override. Load the screen
   in both appearances and check the page background, divider, time fields, dots, and the disabled
   section.
2. **Contrast measurements against the real theme.** The 2.66:1 and 1.45:1 figures in A1 are computed
   against the library's baseline `primary40` (`#6750A4`). Re-measure against the product palette.
3. **Focus loss on re-render (A8).** Tab to the switch, toggle it, and observe where focus lands.
   Repeat for each select and each time input.
4. **Keyboard reachability of the "disabled" section (A9).** With the master switch off, tab through
   and confirm whether the info buttons still take focus.
5. **Icon button target size.** `.info` overrides the host box to 24x24 (CSS `:53-57`) while the
   component's default state layer is 40x40 and its internal `.touch` span is
   `height: max(48px, 100%); width: max(48px, 100%)` positioned absolutely
   (`iconbutton/internal/_shared.scss:103-107`, defaults in
   `tokens/versions/v0_192/_md-comp-icon-button.scss:50-52`). Because `.touch` is absolutely
   positioned it may still extend past the shrunken host, so the effective hit area is probably
   larger than the visible 24px, but it also then overlaps the neighboring select. Measure the real
   hit area and the spacing against WCAG 2.2 SC 2.5.8 Target Size (Minimum)
   (<https://www.w3.org/TR/WCAG22/#target-size-minimum>), reading its "spacing" and other exceptions
   before concluding. I am not asserting a failure here; I could not measure it.
6. **Touch vs pointer.** The screen is one build for phone and desktop; check the row density and the
   native time picker on a touch device.
7. **`Send test` feedback (`js:42-48`).** The button is only disabled for 600ms with no label change
   and no progress indicator, so on a fast machine the state may be imperceptible and on a slow
   network there is no indication at all. Confirm what a user actually sees, and consider
   `md-circular-progress` or a result message.

---

## C. Optional suggestions (not specification problems)

1. **Use `md-list` / `md-list-item` for the rows.** The hand-rolled 56px flex row reimplements list
   item layout and density that the library already provides, and would inherit its type and color
   roles.
2. **Replace the native `<input type="time">` pair with Material fields.** The `placeholder`
   attributes on `js:94` and `:96` do nothing on a time input, so "Start" and "End" are never shown.
   Even keeping the native input, give each a visible label.
3. **Reconsider the dots.** With a labeled select in the same row they add color without adding
   information; removing them would simplify A6 away entirely.
4. **Group the category rows semantically** under a heading or `role="group"` with a name, so the
   three rows read as one section rather than three unrelated rows.
5. **Move `Reset all settings` away from the save/test pair** and give it a confirmation dialog
   (`md-dialog` is available in the installed package).
6. **Consider a `fieldset`/`form`** — the switch, selects, and inputs are all form-associated
   elements in this library (`labs/behaviors/form-associated.d.ts`), so wiring them to a form would
   get reset and restore behavior for free.

---

## What I could not check

No host HTML, no theme file, no build config, and no running browser were available in this
workspace, so anything about the loaded fonts, the defined color scheme, the real palette, and all
rendered measurements is stated as a prediction from source and listed in section B. I did not
open `m3.material.io` pages directly (they returned only an application shell here); design-intent
citations to that site are used for intent only, and every numeric or API claim above is cited to the
installed package or to the Material Web repository documentation.
