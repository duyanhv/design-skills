# Worked example: reviewing an accessibility audit

The other examples in this repository review or build an *interface*. This one reviews an
**accessibility report**, because that is what the [`accessibility-claims`](../../skills/accessibility-claims/)
bundle is about: whether a claim holds up, not whether a screen is good.

## Protocol

1. [`before/AUDIT.md`](before/AUDIT.md) is a draft audit of an "Orders dashboard", written with
   **ten defects planted** and three sound findings included as false-positive bait. Every defect is
   one that appears in real audits.
2. [`planted-defects.md`](planted-defects.md) was written **before** the review ran and kept outside
   the reviewing agent's workspace, including **three predictions about what would go wrong**.
3. Levels and exceptions in that list were verified against the WCAG 2.2 text as built locally by
   this repository, not recalled.
4. A separate agent received only the draft report and the skill. It had no access to the dashboard,
   which is the point: it is judging claims.
5. [`REVIEW.md`](REVIEW.md) is published exactly as produced; [`scoring.md`](scoring.md) scores it
   without adjusting the rubric.

## Result

**10 of 10 planted defects found. 0 false positives.**

That is a detection score. It is not a claim that the review's explanations are all correct — an
audit found one that is not, and [`ERRATA.md`](ERRATA.md) records it: the review calls SC 2.4.7
Focus Visible Level A when it is AA. The review is published verbatim and not edited, so the
correction lives beside it. Detection quality and explanation accuracy are separate measurements,
and reporting only the first would be the flattering half of the result rather than the result.

The defects were the ones that get audits ignored: a contrast finding against a **disabled control**
and another against a **logotype**, both of which SC 1.4.3 explicitly exempts; a **Level AAA
criterion** reported as failing an AA target; a **clean axe-core run** filed as proof of
accessibility; a real defect cited to **Material's guidance** instead of to the criteria that apply;
and a conclusion claiming the dashboard "will be WCAG 2.2 AA compliant" once nine items are fixed.

The review's handling of the last one is the shape the bundle asks for — it re-cited the misattributed
finding to SC 3.3.2 and SC 4.1.2 rather than discarding it, which was the predicted failure mode.

## My predictions were wrong

Three were written down first. Two were wrong and one was avoided:

| Prediction | Outcome |
| --- | --- |
| A5 (failure vs untested requirement) would be **partial** | Found cleanly |
| A10 (report-level structure) would be **missed or weak** | Found, and raised first |
| N3 (discarding the misattributed finding) was the **false-positive risk** | Avoided |

Published because the alternative is quietly rewriting them as expected. The Material build example
has the same section for the same reason.

## Three defects I did not plant

Recorded in [`scoring.md`](scoring.md), and the sharpest is arithmetic: once findings 2, 3 and 7 are
withdrawn and 5 is out of scope, the report's headline "9 accessibility violations" contradicts its
own contents. I planted the individual errors without noticing they made the summary false.

## Why this result is stronger than the others, and what that costs

The artefact is a document, so every claim in it was fully inspectable. Nothing needed a running
interface, and the review never had to say "I could not check this" about the thing it was judging.

That is also the limit. It shows the guides help an agent judge **claims**, where the evidence is
complete. It does not show they help judge an **interface** — that is what the
[Apple](../apple-design-review/) and [Material](../material-3-review/) examples test, and both
reviews were honestly weaker there.

## Not established

- **One report, one run, no control arm.** No second agent without the skill was run.
- **The dashboard does not exist.** The draft audit describes a plausible screen; the example tests
  reasoning about claims, not about that screen.
- **Not a conformance methodology.** Neither the bundle nor this example produces or validates a
  formal conformance claim. WCAG defines what one must contain.
