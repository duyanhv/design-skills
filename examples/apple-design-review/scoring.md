# What the review got right, missed, and got wrong

The review in [`REVIEW.md`](REVIEW.md) was produced without access to this page. The defect list
below was written **before** the review, kept outside the repository while it ran, and the reviewing
agent was given only the screen, the skill, and the three screenshots. It was not told that defects
had been planted, nor how many.

This page exists because a demonstration in which the tool finds exactly what its author hid is
evidence about the author, not the tool.

## Score

| | Count |
| --- | --- |
| Planted defects found | 14 of 15 |
| Planted defects missed | 0 |
| Planted defects **wrongly dismissed** | 1 (the interesting one — see below) |
| Real defects found that were **not** planted | 6 |
| Findings unsupported by the cited source | 0 found on audit |
| Correct patterns wrongly reported as defects | 0 |
| Correct patterns explicitly checked and left alone | 7 |

## The one it got wrong, and why it matters

**Planted P2: the toolbar button's touch target.** The code says `.frame(width: 24, height: 24)`.
The review refused to file this, measured the rendered Liquid Glass container at exactly
44.0 × 44.0 pt, and listed it first under "what I checked and deliberately left unchanged" as the
screen's most likely false positive.

That reasoning is exactly what the skill asks for, and the conclusion is still wrong. Measured at
runtime with a hit-test grid, the region that actually receives a touch is **39.5 × 26.5 pt**. A
touch at the glass container's corner lands on `NavigationBarContentView`, not on the button.

So there are three measurements of one control, and they disagree:

| What was measured | Value | What it proves |
| --- | --- | --- |
| Declared frame in the source | 24 × 24 pt | that the app asked for something small |
| Rendered glass container in the screenshot | 44.0 × 44.0 pt | what the eye sees |
| Region that receives a touch, at runtime | **39.5 × 26.5 pt** | what the finger gets |

The skill warns that a small glyph may sit inside a large target. The review applied that warning,
found a large container around a small glyph, and stopped. The mirror-image error — a large
*visual* container whose touch region is smaller — is named in the same paragraph of
[`actions.md`](../../skills/apple-design/references/tasks/actions.md), and it did not catch it.

The honest reading is narrow: **a screenshot cannot settle a hit-target question in either
direction.** The guide said so and the review said so; both then treated a pixel measurement as
sufficient anyway. The measurement that answers the question is in
[`measurements.md`](measurements.md).

The review did flag its own limit: "measured from screenshots, not tapped on a device… only device
testing settles hit-testing." It was right about the limit and wrong about the conclusion it drew
before reaching it.

## Planted defects the review found

| # | Planted | Found as | Notes |
| --- | --- | --- | --- |
| P1 | Toolbar button unlabelled | F4 | |
| P2 | Toolbar touch target too small | — | **wrongly dismissed**, see above |
| P3 | Remove button unlabelled + 20 pt | F4, F7 | measured 20.0 × 20.0 at runtime, matching |
| P4 | Destructive action has no role, is not a button | F1 | ranked first; called out `Text` + `onTapGesture` |
| P5 | Destructive action has no confirmation | F1 | noted it has *less* friction than the lesser action |
| P6 | Alert says "Are you sure?" / "OK" | F8 | cited Alerts › Buttons on "OK" |
| P7 | All colours hard-coded | F2 | proved it with a light/dark pixel diff |
| P8 | Permission by colour alone | F6 | measured both dots' contrast |
| P9 | All fonts fixed point sizes | F3 | measured glyph heights at default vs AX5 |
| P10 | `lineLimit(1)` truncates names | F3, F13 | |
| P11 | Validation inverted (`isEmpty`, not validity) | F9 | |
| P12 | No keyboard/content type | F10 | |
| P13 | No real label on the field | F10, and left-alone #4 | argued the "Invite" header supplies one |
| P14 | Double-submit possible | F11 | traced the race through the 1.2 s callback |
| P15 | Custom Send has no press state | F11 | |

## Real defects it found that were not planted

These are the part of the exercise I did not control, and the most useful signal here.

1. **The "⋯" button silently toggles link sharing** (F5). I wrote that as a throwaway action to give
   the toolbar button something to do. The review identified it as a privacy-relevant control whose
   effect is unpredictable from an ellipsis, cited Buttons › Content on familiar icons, and ranked
   it above several cosmetic items. It is a real defect and I did not notice I had written it.
2. **The alert binding cannot be written back** (F8). `isPresented: .constant(pendingRemoval != nil)`
   works only because both buttons happen to clear the state. Flagged explicitly as the reviewer's
   own observation rather than an Apple citation.
3. **Invited people get an email address as their display name** (F13), so `initials()` yields one
   letter.
4. **"Shared with 1 people"** (F13) — unlocalised pluralisation.
5. **Progress is shown far from the control that triggers it** (F11).
6. **The custom title duplicates the navigation title** (F13), flagged as a design suggestion rather
   than a citation.

## Claim discipline

Spot-checking the review's citations against the built skill and Apple's pages:

- No fabricated rule IDs. The bundle carries none and the review invented none.
- Every finding that cites Apple cites a page **and a section anchor**.
- Its own preferences are labelled: "Design suggestion (mine, no citation)", "my observation, not an
  Apple citation", "the citation supports the control choice; the restructuring is my
  recommendation".
- Where it used contrast ratios it said it was applying the WCAG formula as a measurement, and
  attributed only the 4.5:1 figure to Apple's own Dark Mode page.
- It reported what it did not check, at length and without being asked to soften it.

The reviewing agent also reported verifying its own work: resolving its 26 HIG URLs and anchors
against Apple's data API, checking 52 direct quotations against the fetched pages (finding and
fixing one misquote), verifying cited line numbers against the source (fixing one off-by-one), and
re-measuring one figure it had got wrong on the first pass. Those claims are the agent's; what this
repository verified independently is the runtime measurement above, which contradicted one of its
conclusions.

## What this demonstrates, and what it does not

**Does:** on this screen, with this skill, a reviewing agent produced findings that were traceable,
correctly scoped to iOS, ordered by consequence, honest about what it had not run, and included six
real problems nobody planted. It also declined to file the obvious-but-wrong target finding, which
is the behaviour the guide's "left unchanged" section asks for, even though its reasoning stopped
one step short.

**Does not:** this is one screen, one run, one platform, one model. It says nothing about variance
between runs, about screens with subtler defects, about implementation tasks as opposed to review,
or about how a reviewer without the skill would have performed on the same input. No control arm was
run. Treat it as a worked example, not as a measurement of effectiveness.
