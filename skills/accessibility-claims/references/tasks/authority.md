# Authority: whose rule is this?

The first question about any accessibility finding, and the one most often skipped. "This fails
accessibility" is not a claim anyone can check. "This fails WCAG 2.2 SC 1.4.3 at Level AA" is.

## Four kinds of statement, routinely blurred

| Kind | Example source | What a violation means |
| --- | --- | --- |
| **Normative requirement** | a WCAG success criterion | the interface does not conform at that level |
| **Normative continuation** | a criterion's exceptions, its bulleted alternatives, a glossary term it depends on | part of the requirement; ignoring it makes the finding wrong |
| **Note, example, or diagram** | anything WCAG marks as a Note; the Understanding documents | informative by WCAG's own rule; a "violation" of it is not a conformance failure |
| **Vendor or house guidance** | Apple's HIG, Material, a design system | a product decision, arguable on its merits |

The middle two are the trap, because they sit in the same document and often in the same rule.

## Normative and informative live side by side

WCAG is explicit about which of its own words create requirements. From
[Interpreting Normative Requirements](https://www.w3.org/TR/WCAG22/#interpreting-normative-requirements):
the main content is normative, while **"diagrams, examples, and notes are informative
(non-normative)"** and do "not create requirements that impact a conformance claim."

So a **Note is informative.** Full stop. That is the rule to carry, and it is simpler than the one
an earlier version of this page gave.

What does bind you, and is easy to skim past, is the normative material that follows a criterion's
opening sentence:

- **exception lists** — "except for the following", then the cases the requirement does not reach
- **alternatives** — a criterion satisfied by any one of several bulleted options
- **glossary definitions** the criterion depends on

2.5.2 Pointer Cancellation is the clearest example. Its text continues into four bulleted
alternatives — No Down-Event, Abort or Undo, Up Reversal, Essential — any one of which satisfies it.
Those are requirements. Two actual Notes follow them, and those are not.

So "it says so in the criterion" is not enough. It matters **which part**: a paragraph further down
may be an alternative that lets an implementation off, or commentary that binds nobody.

> **A correction, because this page got it wrong.** It previously said WCAG has "118 normative notes
> and 181 informative notes", counted from this repository's own extraction. Those counts are real
> but the label was not: the extractor keeps everything after a criterion's first paragraph in one
> `notes` field, and marks each block normative or informative. Of the 118 blocks it marks
> normative, **none is a Note** — 94 are bulleted alternatives, 5 are exceptions, 19 are other
> normative text. Publishing them as "normative notes" gave an internal representation the source's
> vocabulary, and contradicted what WCAG says about its own notes. An audit caught it.

## Understanding documents are not the standard

WCAG's *Understanding* and *Techniques* documents are informative by design. They are genuinely
useful — often the clearest explanation of what a criterion is for — and they are not the
requirement. A technique is **one way** to satisfy a criterion, not the only way, and failing to use
a documented technique is not a failure.

A finding that reads "this does not follow Technique G18" is citing the wrong document. The claim is
about the criterion; the technique is at most how you would fix it.

## Levels are scope, not severity

A, AA and AAA describe what a conformance claim covers, not how bad a problem is. WCAG 2.2 has
**31 Level A, 24 Level AA, and 31 Level AAA** success criteria (same local build as above).

Two consequences:

- A AAA finding is not "a serious A problem plus extra". If the product's target is AA, a AAA
  criterion is out of scope, and reporting it as a failure misstates the result. Report it as an
  improvement against a named higher level.
- Nothing prevents a Level A failure being trivial to a particular user, or a AAA gap being the
  thing that makes the product unusable for someone. The level is not a priority order; your
  judgement about impact is yours, and should be labelled as yours.

## Vendor guidance is not a standard, and vendors say so

Apple's Human Interface Guidelines and Material's accessibility pages both point at WCAG for
contrast rather than defining their own ratios. Their own numbers — target sizes, spacing — are
platform guidance: worth following, and not conformance requirements.

Attributing a vendor's default to a standard, or a standard's threshold to a vendor, is the same
mistake in either direction, and both are common. See `apple-design` and `material-3` in this
repository for the platform-side treatment.

## What to write

For each finding, one line that fixes the authority before anything else:

> **Requirement** — WCAG 2.2 SC *n.n.n* (Level AA), including its *X* exception.
> **Advice** — Material's guidance on *x*; not a conformance requirement.
> **House** — our own convention; no external authority.

A reader can then argue with the right thing. Without it, a suggestion and a failure look identical
on the page, and the team cannot triage.
