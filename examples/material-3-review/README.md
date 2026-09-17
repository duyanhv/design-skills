# Worked example: reviewing a Material 3 screen

A plausible Material 3 web screen, reviewed with the
[`material-3`](../../skills/material-3/) skill. Everything is browsable without cloning: the code
under review, the review exactly as produced, and an honest account of what it got wrong.

## Protocol

1. The screen in [`before/`](before/) was written with **twelve defects planted** and three
   deliberate non-defects included as false-positive bait.
2. [`planted-defects.md`](planted-defects.md) naming them was written **before** the review ran and
   kept outside the reviewing agent's workspace. The scoring rubric was fixed in the same file.
3. A separate agent, in an isolated directory with `@material/web@2.5.0` really installed, received
   only the screen and the skill.
4. [`REVIEW.md`](REVIEW.md) is published exactly as produced.
5. [`scoring.md`](scoring.md) scores it against the pre-registered list without adjusting the rubric.

The before screen really runs — [`before/renders.mjs`](before/renders.mjs) mounts it and asserts its
controls are present. A straw man that throws on load would test nothing, because any reviewer would
find "it does not run" and stop.

## Result

**12 of 12 planted defects reached**: 10 found outright, 1 handled with the right reasoning, 1
partial. One partial false positive. Full detail, including the disagreements, in
[`scoring.md`](scoring.md).

The two weakest moments are both about **where a finding belongs**, not whether it was seen:

- A missing accessible name on the time inputs landed in "optional suggestions" when it is
  SC 4.1.2 — and the same review cited that criterion correctly for the selects, one element over.
- Its fix for those inputs suggests "Material fields", pointing at something 2.5.0 cannot provide
  for a time value, on a screen where it had already read the package's internal SCSS.

The guide followed in one place and not in the neighbouring one is more useful to know than a clean
sweep would have been.

## The best result is a refusal

The `.info` button is styled to 24px, which looks like a target-size failure. The review traced it
into the component's own source, found the internal `.touch` span is `max(48px, 100%)` and
absolutely positioned, reasoned the real hit area is probably larger than the visible box but may
overlap the neighbouring select — and then wrote:

> I am not asserting a failure here; I could not measure it.

That is the behaviour the bundle exists to produce: a specific hypothesis, the source that supports
it, and a refusal to claim a conformance failure without a measurement.

## Six defects I did not plant

The review found real bugs I introduced by accident while writing the fixture, listed in
[`scoring.md`](scoring.md). The sharpest: the do-not-disturb predicate string-compares
`'22:00' >= '07:00'` as `true`, so the screen renders in its error state on first paint and treats
an overnight quiet window — the normal case — as invalid. I wrote that line to plant a *colour-only
error* and did not notice I had also made it permanently wrong.

They do not count toward the score, since they were not pre-registered. They are the most direct
evidence in this example that the review was reading the code rather than pattern-matching a
checklist.

## Not established

- **Never rendered in a browser.** No screenshots, no dark-mode captures, no contrast measured
  against a real theme. The review says so itself and lists what needs a running interface.
- **No screen reader, no device.** Every accessibility finding is from source.
- **One screen, one run, no control arm.** This shows what one agent found with the guides. It does
  not establish that the guides caused it, and a second agent without them was not run.
