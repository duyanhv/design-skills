# Scoring — accessibility-claims review

Scored against [`planted-defects.md`](planted-defects.md), written before the review ran and kept
outside the reviewing agent's workspace. The rubric was fixed in advance and is not adjusted here.

[`REVIEW.md`](REVIEW.md) is published exactly as produced.

## Planted defects

| # | Defect | Outcome | Where |
| --- | --- | --- | --- |
| A1 | No criterion cited at all | **Found** | Finding 1: "under-specified, not wrong" — names the missing criterion, level, measurement, and that the required ratio depends on size and weight |
| A2 | Raised against a disabled control | **Found** | Finding 2: cites the inactive-component exception, says withdraw or reframe as a suggestion, and separately asks whether the *enabled* state was measured |
| A3 | Raised against a logotype | **Found** | Finding 3: quotes the logotype exception; also notes that if the wordmark is the home link the relevant criteria are 1.1.1 and focus, not 1.4.3 |
| A4 | A AAA criterion reported as failing an AA target | **Found** | Finding 5: identifies 2.4.13 as AAA and names 2.4.7 Focus Visible as the AA criterion that applies |
| A5 | Conformance asserted from no measurement | **Found** | Finding 6: "right criterion, unsupported evidence" — *better than I predicted* |
| A6 | A clean automated run reported as a pass | **Found** | Finding 7: "inverted; this is not a finding and the conclusion is unsupported" |
| A7 | Vendor guidance presented as a requirement | **Found** | Finding 9: names the misattribution and re-cites to SC 3.3.2 and SC 4.1.2, both Level A |
| A8 | A conformance claim the audit cannot support | **Found** | A1, first item in the report-level section |
| A9 | No scope, no evidence anywhere | **Found** | A2 and A3, raised as report-level problems rather than per-finding |
| A10 | Requirements, suggestions and non-findings interleaved | **Found** | A4, and a suggested rewrite shape in section D |

**10 of 10 found.**

## Deliberate non-defects

| # | Non-defect | Outcome |
| --- | --- | --- |
| N1 | Finding 4 is correct | **Not flagged.** Listed under "findings I am not disputing": "correct criterion, correct level, correct fix shape. It needs an evidence line, not a rewrite." |
| N2 | Finding 8 is correct | **Not flagged as wrong, and improved.** Kept the criterion and level, and argued the proposed `alt` text is probably wrong because an empty-state graphic usually duplicates adjacent visible text, making `alt=""` correct. The planted list anticipated this as arguable and said raising it as an improvement is fine. |
| N3 | The defect in finding 9 is real; only its attribution is wrong | **Not flagged.** Re-cited rather than discarded, which was the predicted failure mode. |

**0 false positives.**

## Two of my three predictions were wrong

From [`planted-defects.md`](planted-defects.md), written first:

> **A5 I expect to be partial.** The distinction between "this is a failure" and "this is an
> untested requirement" is the subtlest thing in the bundle.

Found cleanly. The review separated the criterion being right from the evidence being absent, and
noted that SC 2.5.8's interactive region is often larger than the visible box.

> **A10 I expect to be missed or raised weakly**, because it is a property of the report as a whole.

Found, and raised structurally: the review opens with six report-level problems before touching any
individual finding.

> **N3 is the false-positive risk.** Having noticed that finding 9 cites the wrong authority, the
> natural next move is to throw the finding out.

Avoided. It re-cited the defect to the criteria that do apply.

Only the shape of the result was predicted correctly — that the report-level problems would be the
harder half. The specific predictions were wrong, and are published here rather than quietly
dropped.

## Unanticipated findings

Not pre-registered, so they do not count toward the score:

- **A5: "9 accessibility violations" is not true on the report's own terms.** Once findings 2, 3 and
  7 are withdrawn and 5 is out of scope, the report's own headline number contradicts its own
  contents. I planted the individual errors and did not notice they made the summary arithmetic
  false.
- **A6: no "what this report is not" section.** The reviewer applied a requirement the bundle makes
  of itself to the artefact under review.
- **Finding 9's scope check**: it correctly noted that SC 2.4.6 Headings and Labels applies *only if
  a label exists at all*, which is a conditional I had not considered.

## What this says about the bundle

The result is stronger than the Material review's, and the difference is instructive: this artefact
is a *document*, so every claim in it was fully inspectable. Nothing needed a running interface, and
the review never had to say "I could not check this" about the thing it was actually judging.

That is also the limit. It shows the guides help an agent judge **claims**, on an artefact where the
evidence is complete. It does not show they help an agent judge an interface, which is what the
`apple-design` and `material-3` examples test, and where both reviews were honestly weaker.
