# Erratum — accessibility-claims review

[`REVIEW.md`](REVIEW.md) is published verbatim, as produced. This file records factual errors found
in it afterwards. The review is not edited: its evidential value is that it is the output, and
correcting it in place would destroy that.

Found by audit, not by me. Each is checked against the WCAG 2.2 text as built locally by this
repository (source version 2026-08-17).

<!-- Structured so a checker can verify the correction rather than the mere mention of a criterion.
     An audit replaced this file with "SC 2.4.7 is Level A. The review is correct." and the check
     passed, because it only asked whether the number appeared. Each record below is resolved
     against the local WCAG build: `corrected` must be the level the source gives, and `cited` must
     be what the review actually says.

     erratum: criterion=2.4.7 cited=A corrected=AA
-->

## E1 — SC 2.4.7 Focus Visible is Level AA, not Level A

In its handling of finding 5, the review writes:

> the two criteria that do apply to a focus ring are SC 2.4.7 Focus Visible (Level A — is there a
> visible indicator at all) and SC 1.4.11 Non-text Contrast (Level AA …)

and repeats the label in its suggested rewrite.

**SC 2.4.7 Focus Visible is Level AA.** The local build gives:

| Criterion | Level |
| --- | --- |
| 2.4.7 Focus Visible | **AA** |
| 1.4.11 Non-text Contrast | AA |
| 2.4.13 Focus Appearance | AAA |

### What this does and does not change

- **It does not change the score.** The planted defect (A4) was that the draft audit reported a
  **AAA** criterion as failing an AA target. The review identified that correctly: it named 2.4.13
  as AAA, said it cannot fail an AA target, and pointed at the criteria that do apply. That
  reasoning is right, and the misattributed level on one of them does not undo it.
- **It does not create a false positive.** Nothing in the planted list is contradicted by it.
- **It is still an error in the output**, of exactly the kind the bundle tells reviewers to avoid —
  a criterion cited with the wrong level. A worked example that showcases a review and quietly
  omits its mistakes is doing the thing this repository keeps correcting itself for.

The distinction worth holding: **detection quality and explanation accuracy are separate
measurements.** The review scored 10 of 10 on detection. Its explanations contain at least one
factual error. Both are true, and reporting only the first would be the more flattering half of the
result rather than the result.

## How this is checked

`src/e2e/example.ts` resolves every criterion-with-level the preserved reviews cite against the
local WCAG build, so a level stated in a published review has to match the source. That check is
what would have caught E1 at the time, and it is the reason this file has one entry rather than an
unknown number.
