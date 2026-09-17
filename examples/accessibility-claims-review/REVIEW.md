# Review of "Accessibility audit — Orders dashboard" (draft, 2026-09-12)

Reviewed: the report text only. I do not have the Orders dashboard and cannot inspect, render, or
measure it. Everything below is a judgement about whether each claim is stated in a form that holds
up — authority, applicability, evidence — not about whether the underlying defect is real.

Method: `skills/accessibility-claims` — authority, criteria, evidence, reporting.

---

## A. Report-level problems

### A1. The summary and conclusion claim conformance the audit cannot establish

> "Once these are fixed the dashboard will be WCAG 2.2 AA compliant." / "After remediation the
> Orders dashboard will conform to WCAG 2.2 Level AA."

**Wrong because:** conformance is a property of full pages and complete processes, and requires
*every* applicable criterion at that level to be satisfied. A review that looked for nine things and
found nine things establishes non-conformance, not conformance. A partial audit can never conclude
conformance, and fixing the items found does not make the remaining, unexamined criteria pass.

**Should say:** "This review found the issues below. Fixing them removes these failures; it does not
establish conformance. A conformance claim would require every applicable Level A and AA criterion
to be evaluated across the full pages and the complete order-management process."

### A2. No scope statement

The report never says which routes, which states (empty/populated, loading, error), which viewports,
light/dark, which browser and version, which assistive technology, which language, or what was not
examined. A reader cannot tell whether a topic is absent because it is fine or because nobody looked.

**Should say:** a scope paragraph at the top, e.g. "Reviewed the Orders list and its filter bar at
default text size in <browser/version>, light theme, English, read from source and rendered
statically. Not announced with a screen reader, not measured for target size, not tested on touch,
dark theme not checked."

### A3. No evidence line on any finding

Not one finding says what was done: read in source, rendered, exercised, announced, or measured. Two
findings turn entirely on a number ("does not meet 4.5:1", "1px", "visibly small") with no stated
measurement conditions. Developers cannot reproduce any of this.

**Should say:** each finding carries one line — file and line, or element and route, plus the rung of
evidence and the conditions.

### A4. Requirements, open questions and suggestions are interleaved

Conformance failures (4, 8), a misclassified AAA item (5), a non-finding (7) and a vendor-guidance
item (9) are numbered in one undifferentiated list of "violations". A reader who finds a style
preference filed beside a Level A failure learns to discount both.

**Should say:** three sections in order — Requirements (named criterion + level), Untested
requirements and open questions, Suggestions (no external authority) — with the item count stated per
section rather than a single "9 violations".

### A5. "9 accessibility violations" is not true on the report's own terms

Item 7 is explicitly "no action needed", items 2 and 3 are excluded by the criterion they cite, item
5 cites a criterion outside the stated AA target, and item 9 cites vendor guidance. The headline
number should be recomputed after the corrections below.

### A6. No "what this report is not" section

The report ends on a clean list with no limits. That is the most misleading way to end an audit,
because it reads as "we are accessible" to exactly the readers least able to check.

---

## B. Finding-by-finding

### Finding 1 — "Archived" badge contrast — *under-specified, not wrong*

**Wrong with the claim:** "fails WCAG contrast requirements" names no criterion, no level, and no
measured ratio. There is no single required ratio: the threshold for text depends on size and weight
(the large-scale text definition is normative), so "fails contrast" cannot be checked. It also does
not say whether the badge text is inactive — the contrast criterion exempts inactive components, and
"Archived" is a status word, but if the badge is part of a disabled row the exception may bite.

**Should say:** "WCAG 2.2 SC 1.4.3 Contrast (Minimum), Level AA. Measured <x.xx>:1 for <size/weight>
text against the pill fill, required <4.5:1 or 3:1 for large-scale text>. Measured with <tool> against
the rendered light theme at default text size; dark theme not checked. The badge is not an inactive
user interface component, so the incidental exception does not apply."

### Finding 2 — disabled "Export" button — **invalid as written; withdraw or reframe**

**Wrong with the claim:** SC 1.4.3 has a normative exception for *incidental* text, which includes
text that is part of an **inactive user interface component**. The Export button is described as
disabled in exactly the state audited. The criterion does not apply, so this is not a conformance
failure. This is the single most common way a contrast finding dies under push-back, and automated
tools raise it routinely.

**Should say:** move to Suggestions. "The disabled Export label is very light against the fill.
SC 1.4.3 exempts inactive user interface components, so this is not a conformance failure; it is a
usability improvement with no external authority. Note separately whether the *enabled* state meets
1.4.3 — that state was/was not measured."

### Finding 3 — company logo — **invalid; withdraw**

**Wrong with the claim:** SC 1.4.3 exempts logotypes: "text that is part of a logo or brand name has
no contrast requirement." The wordmark is not a conformance failure, and citing 1.4.3 against it is
citing a criterion against a case it explicitly excludes.

**Should say:** remove from the requirements list. If the team still wants the dark variant, file it
as house preference with no external authority. (If the wordmark also functions as the "home" link
and carries meaning, the relevant questions are its accessible name under SC 1.1.1 and its focus
indicator — not 1.4.3.)

### Finding 4 — status by colour alone — **sound in substance; needs evidence and one check**

The criterion and level are right: SC 1.4.1 Use of Color, Level A, applies where colour is the only
visual means of conveying information. The fix is the right shape.

**Only gap:** no evidence line, and no statement of whether the status is available non-visually
(e.g. a visually hidden string or an accessible name on the row). 1.4.1 is about *visual* means, so a
hidden text equivalent does not satisfy it, but the report should say which it checked and how.

**Should add:** "Read in <file:line> / observed in the rendered list; the left border colour is the
only visual indicator. Not announced with a screen reader."

### Finding 5 — focus indicator — **wrong level; misstated as an AA failure**

**Wrong with the claim:** SC 2.4.13 Focus Appearance is **Level AAA** in WCAG 2.2. It cannot fail "our
AA target"; a AAA criterion is out of scope of an AA claim, and reporting it as a failure misstates
the result. "Requires a much more prominent indicator" is also a paraphrase, not the criterion's
conditions, and 2.4.13 has exceptions the report has not read. The AA-level criteria that actually
apply to a focus ring are SC 2.4.7 Focus Visible (Level A — is there a visible indicator at all) and
SC 1.4.11 Non-text Contrast (Level AA — does the indicator meet 3:1 against adjacent colours).

**Should say:** "SC 2.4.7 Focus Visible (Level A): an indicator is present — pass/fail. SC 1.4.11
Non-text Contrast (Level AA): the 1px ring measured <x.xx>:1 against the adjacent background, required
3:1 — fail/pass, measured under <conditions>. Separately, as an improvement against a named higher
level: SC 2.4.13 Focus Appearance (Level AAA) is not part of the AA target; the 1px ring would not
meet it."

### Finding 6 — row icon buttons too small — **right criterion, unsupported evidence**

**Wrong with the claim:** "visibly small" is not a measurement, and the visible box is not the
interactive region — padding, pseudo-elements and absolutely positioned hit areas routinely make the
target larger than it looks. A screenshot cannot settle this. The report also does not mention
SC 2.5.8's exceptions (notably the spacing exception, plus inline, user-agent-controlled, essential
and equivalent-control cases), at least one of which commonly applies to dense table row actions.

**Should say:** reclassify as an untested requirement until measured. "SC 2.5.8 Target Size (Minimum),
Level AA. The rendered interactive region was not measured. To settle it: measure the actual hit
region of the row icon buttons and apply SC 2.5.8 with its spacing exception — if the 24px-diameter
undisturbed circles do not overlap, the exception may satisfy the criterion even at a smaller visible
size."

### Finding 7 — filter combobox — **inverted; this is not a finding and the conclusion is unsupported**

**Wrong with the claim:** two errors at once. (a) The heading says "is not announced correctly" while
the body says no action is needed — the report contradicts itself. (b) "axe-core reported no
violations, so the combobox is accessible" does not follow. A clean automated run is the absence of
the subset of failures that tool detects, not a pass; automated tooling cannot establish what a
screen reader announces, which is the actual claim being made. The tool name has no version, and no
browser, AT or mode is stated.

**Should say:** move to Untested requirements. "Filter combobox: axe-core <version> reported no
violations in <browser/version>. That establishes only the absence of the mechanically detectable
failures axe checks; it does not establish that the combobox's name, role, value and expanded state
are announced correctly. Not announced with a screen reader. To settle it: exercise the combobox with
<AT> on <platform> against SC 4.1.2 Name, Role, Value (Level A) and SC 2.1.1 Keyboard (Level A)."

### Finding 8 — empty-state illustration — **criterion right, fix probably wrong**

The criterion and level are correct: SC 1.1.1 Non-text Content, Level A, and a missing `alt`
attribute is a genuine defect.

**Wrong with the claim:** the proposed fix assumes the illustration is informative. SC 1.1.1's
decorative exception says pure decoration should be *implemented so it can be ignored by assistive
technology*. An empty-state graphic almost always sits beside visible text that already says "No
orders yet", in which case `alt="No orders yet"` makes a screen reader announce the same message
twice, and the correct fix is `alt=""`. The report also does not distinguish "no `alt` attribute"
(read in source) from "announced as the filename" (not checked).

**Should say:** "Read in <file:line>: the `<img>` has no `alt` attribute. SC 1.1.1 Non-text Content
(Level A). Fix: if the graphic duplicates adjacent visible text, it is decoration — add `alt=""` so it
is ignored. If it carries information not otherwise available in text, add a short text alternative
conveying that information. Not verified with a screen reader."

### Finding 9 — placeholder used as label — **authority misattributed**

**Wrong with the claim:** it is filed among "violations" but cites Material's text field guidance,
which is vendor guidance and not a conformance requirement. Attributing a vendor's guidance the force
of a standard is the same error as attributing a standard's threshold to a vendor. Meanwhile the
report misses the criteria that do apply: a placeholder-only field is normally a SC 3.3.2 Labels or
Instructions (Level A) issue, and if the placeholder is the only programmatic name it also engages
SC 4.1.2 Name, Role, Value (Level A); the disappearing-label behaviour also touches SC 2.4.6 Headings
and Labels (Level AA) only if a label exists at all. Placeholder contrast is a separate question.

**Should say:** "SC 3.3.2 Labels or Instructions (Level A): the date fields provide their instruction
only via placeholder text, which is removed on input. Check whether a programmatic label exists
(`<label>`, `aria-label`, `aria-labelledby`); if the placeholder is the only source, also cite
SC 4.1.2 Name, Role, Value (Level A). Material's text field guidance agrees, but it is advice, not the
authority for this finding. Evidence: read in <file:line>; not announced."

---

## C. Findings I am not disputing

- **Finding 4** — correct criterion, correct level, correct fix shape. It needs an evidence line, not
  a rewrite.
- **Finding 8's criterion** — the missing `alt` attribute is a real SC 1.1.1 defect; only the proposed
  alternative text is likely wrong.
- The remediation directions in 1, 5, 6 and 9 are plausible engineering fixes. My objection in each
  case is to the authority, level or evidence attached to them, not to the change.

---

## D. Suggested rewrite shape

1. **Scope** — what was examined, in which states and settings, with which tools, and what was not.
2. **Requirements** — confirmed failures with criterion, level, exception checked, measurement:
   currently findings 4, 8, 9 (recited under 3.3.2/4.1.2), and 1 once measured, and 5 recast under
   1.4.11/2.4.7.
3. **Untested requirements and open questions** — findings 6 and 7, each naming the test that settles
   it.
4. **Suggestions** — findings 2 and 3, as improvements with no conformance force.
5. **Limits** — what this review is not, in the report's own words, including that it does not
   establish conformance.
