# Reading a criterion: does it actually apply?

Most wrong accessibility findings are not invented. They cite a real criterion, correctly quoted,
against a case the criterion excludes. The criterion is the easy part; its **conditions** are the
work.

## A criterion is a rule plus its conditions

Read all of it before applying any of it:

1. **The statement** — the requirement itself.
2. **Its exceptions** — usually in the statement, sometimes in a normative note.
3. **The glossary terms it uses** — WCAG's definitions are normative, and several criteria turn
   entirely on one. A term like "large scale (text)" or "user interface component" does specific
   work, and the everyday meaning is not it.
4. **Its conformance level** — see [authority.md](authority.md).

In WCAG 2.2 as built locally by this repository, **27 of 86 success criteria state an exception in
their own text**. Roughly a third. A habit of quoting the statement and stopping is wrong about a
third of the time on those criteria, and the cases it is wrong about are exactly the ones a
developer will push back on.

## Where exception-shaped mistakes come from

The recurring ones, in rough order of how often they cost a review its credibility:

- **Disabled controls.** The contrast criterion exempts inactive user interface components. A
  finding against a greyed-out button usually dies here.
- **Logotypes and brand names.** Exempt from contrast. The wordmark is not a bug.
- **Decorative and invisible text.** Exempt. Text behind a modal, or a screen-reader-only string
  positioned off-canvas, is not a contrast failure.
- **Size and weight thresholds.** The required ratio for text is not one number; it depends on the
  text's size and weight. Applying the stricter figure everywhere overstates.
- **Essential presentation.** Several criteria exempt cases where the presentation is essential to
  the information. A seating chart, a map, a code sample with meaningful whitespace.
- **Incidental and inactive states.** Related to the first, and easy to conflate with "the user
  cannot see it well", which is not the test.

None of these are loopholes. They are the criterion, and a review that applies the rule without them
is applying a different rule.

## "Might not conform" is a finding too

Three distinct outcomes, and they should not be written the same way:

| You established | Write it as |
| --- | --- |
| the criterion applies and the interface fails it | a conformance failure, with the measurement |
| the criterion applies and you could not test it | an untested requirement, naming the test needed |
| the criterion may not apply, and it turns on a reading | an open question, naming both readings |

The third is not a weakness. When a source is genuinely ambiguous, resolving it silently — in either
direction — is the error. State which reading you applied and why, and let the team disagree with the
reading rather than with you.

## Conformance is a property of pages and processes

An individual defect is not "a conformance failure" on its own. WCAG's conformance requirements are
about **full pages** and **complete processes**: a page conforms at a level only if every applicable
criterion at that level is satisfied, and a multi-step process conforms only if every page in it
does. See
[WCAG's conformance requirements](https://www.w3.org/TR/WCAG22/#conformance-reqs).

Two practical consequences:

- **"This component is WCAG AA" is not a claim the standard supports.** A component can satisfy the
  criteria that apply to it, in one context. It cannot carry a conformance claim into a page you
  have not seen.
- **A partial audit cannot conclude conformance**, only non-conformance. Finding nothing is not the
  same as there being nothing, and the difference belongs in the report.

## Before you file a finding

- Which criterion, at which level?
- Have I read its exceptions, and does one apply here?
- Which glossary terms does it use, and am I using them in WCAG's sense?
- Is this a failure, an untested requirement, or an open question?
- What exactly did I check, and on what? → [evidence.md](evidence.md)
