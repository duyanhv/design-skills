# Planted defects — Orders dashboard audit (before)

Written **before** the blind review and kept outside the reviewing agent's workspace. Used only for
scoring after the review is captured verbatim.

The artefact under review is **an accessibility report**, not an interface. That is the point: this
bundle is about the claim, so the test is whether it catches claims that do not hold up. Every
defect is one that appears in real audits, and several are the kind that get a report ignored by the
engineering team receiving it.

Levels and exceptions below were verified against the WCAG 2.2 text as built locally by this
repository (source version 2026-08-17), not recalled.

## Intended defects

**A1. No criterion cited at all (finding 1).** "Fails WCAG contrast requirements" names no
criterion, no level, and no measurement. Contrast requirements differ by text size and weight, so
without the criterion and the numbers the claim cannot be checked or refuted.
→ `authority.md`, `reporting.md`.

**A2. Raised against a disabled control (finding 2).** SC 1.4.3 exempts text that is part of an
inactive user interface component. The disabled Export button is the textbook case, and this is the
single most common false finding in real audits. → `criteria.md` (exceptions).

**A3. Raised against a logotype (finding 3).** SC 1.4.3 exempts text that is part of a logo or brand
name. The wordmark is not a violation. → `criteria.md` (exceptions).

**A4. A Level AAA criterion reported as failing an AA target (finding 5).** SC 2.4.13 Focus
Appearance is **AAA**. The report says it "fails our AA target", which misstates the result: at AA
the applicable criterion is 2.4.7 Focus Visible. → `authority.md` (levels are scope, not severity),
`criteria.md`.

**A5. A conformance claim asserted from no measurement (finding 6).** "Visibly small" is not a
measurement, and SC 2.5.8 carries exceptions including spacing. The interactive region is also
frequently larger than the visible box. Asserting a failure here without measuring is exactly the
claim `evidence.md` says to downgrade to an open question. → `evidence.md`, `criteria.md`.

**A6. A clean automated run reported as a pass (finding 7).** axe-core reporting no violations
establishes the absence of what axe detects, not that the combobox is accessible. Filing it as a
finding that needs no action inverts what the evidence supports. → `evidence.md` (a clean run is not
a pass).

**A7. Vendor guidance presented as a requirement (finding 9).** The defect is real — a placeholder
is not a label — but it is cited to *Material's* text field guidance rather than to a criterion. As
written it reads as a house-style preference, when a field with no accessible name engages SC 4.1.2
Name, Role, Value (Level A) and SC 3.3.2 Labels or Instructions (Level A). → `authority.md`
(vendor guidance is not a standard).

**A8. A conformance claim the audit cannot support (summary and conclusion).** "Once these are fixed
the dashboard will be WCAG 2.2 AA compliant." Conformance is a property of full pages and complete
processes, and an audit that found nothing else establishes only that this audit found nothing else.
A partial audit can conclude non-conformance, never conformance. → `criteria.md`, `reporting.md`.

**A9. No scope, no evidence, anywhere in the report.** Nothing states what was examined, in which
states, at which sizes or settings, with which tools, or what was not checked. Every finding is
unreproducible as written. → `evidence.md`, `reporting.md`.

**A10. Requirements, suggestions and non-findings are interleaved.** Findings 1–9 are presented as
one undifferentiated list of "violations", mixing genuine Level A failures (4, 8), false findings
(2, 3), an out-of-scope AAA criterion (5), a non-finding (7), and a real defect cited to the wrong
authority (9). → `reporting.md` (separate the kinds).

## Deliberate non-defects

Included so that a review flagging them is scored as a false positive:

**N1. Finding 4 (status by colour alone) is correct.** SC 1.4.1 Use of Color is Level A and has no
exception that applies to a status border. The criterion, level and fix are all right.

**N2. Finding 8 (missing alt) is correct.** SC 1.1.1 is Level A. The suggested `alt` text is
reasonable for an empty-state illustration. Whether a decorative illustration would be better served
by `alt=""` is arguable, and raising it as an improvement is fine; calling the finding wrong is not.

**N3. The underlying defect in finding 9 is real.** Only its attribution is wrong. A review that
dismisses the finding rather than re-citing it has made the opposite error.

## Scoring rules, fixed in advance

- **Found**: the review names the defect and the reason.
- **Partial**: names the symptom but not the cause, or the right item for the wrong reason.
- **Missed**: not raised.
- **False positive**: raises a non-defect above, or an invented problem.

A defect is not re-scored after the fact. If the outcome is arguable the disagreement is recorded
rather than resolved in the review's favour, and anything found that is not on this list is recorded
as **unanticipated** and does not count toward the score.

## What I expect to go wrong

Recorded now so that agreeing with the outcome later cannot be hindsight:

- **A5 I expect to be partial.** The distinction between "this is a failure" and "this is an
  untested requirement" is the subtlest thing in the bundle, and the reviewer has no interface to
  measure either way.
- **A10 I expect to be missed or raised weakly**, because it is a property of the report as a whole
  rather than of any one finding, and reviews tend to work item by item.
- **N3 is the false-positive risk.** Having noticed that finding 9 cites the wrong authority, the
  natural next move is to throw the finding out.
