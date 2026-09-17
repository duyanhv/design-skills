# Reporting: writing it so it can be checked

A finding that cannot be verified by its reader will be argued about instead of fixed. Everything in
this guide is in service of one property: someone who disagrees should be able to go and check.

## The shape of one finding

| Field | Why it is not optional |
| --- | --- |
| **Where** | file and line, or the element and the route. "The settings screen" is not a location. |
| **What** | the observable behaviour, not the diagnosis. "The switch has no accessible name", not "this is inaccessible". |
| **Authority** | requirement, advice, or house — see [authority.md](authority.md). |
| **Criterion** | the specific one, at its level, including the exception you checked → [criteria.md](criteria.md) |
| **Evidence** | which rung, under what conditions → [evidence.md](evidence.md) |
| **Fix** | the smallest change that resolves it |

The fix belongs in the finding because proposing one forces you to understand the cause. A finding
whose fix you cannot state is usually a symptom you have not traced yet.

## Separate the kinds

Three groups, in this order, and never interleaved:

1. **Requirements** — conformance failures against a named criterion, with the level.
2. **Untested requirements and open questions** — what applies but was not settled, and what turns
   on a reading.
3. **Suggestions** — improvements with no external authority.

Mixing them is the most common way a report loses its audience: a reader who finds a style
preference filed beside a Level A failure learns to discount both. Put the authority on each item so
the ordering is checkable rather than just claimed.

## Severity is yours, and should be labelled as such

Conformance level is not severity ([authority.md](authority.md)). If you rank findings by impact,
that ranking is your judgement about your users, and it should say so. "Blocks account creation for
screen-reader users" is a claim about impact that a team can act on and argue with; "P1" alone is
neither.

## State the scope, at the top

What was examined, in which states, at which sizes and settings, with which tools, in which
language. And what was not.

> Reviewed: the settings and notification screens, light and dark, at the default text size, on
> desktop Chrome 141. Read from source; not announced with a screen reader, not tested on a touch
> device, not checked in any language but English.

Without this, a reader cannot tell whether a topic is absent because it is fine or because nobody
looked. With it, the gaps are actionable.

## Do not claim conformance you did not establish

- A review finding nothing establishes that **this review** found nothing.
- Conformance is a property of full pages and complete processes, not components, and not a subset
  of criteria. See [criteria.md](criteria.md).
- If a formal claim is the goal, WCAG defines what one must contain; this bundle does not produce
  one and does not substitute for one.

The report's own last section should say what it is not, in its own words. An audit that ends with a
clean list and no limits is the most misleading document in this whole subject, because it will be
read as "we are accessible" by exactly the people least able to check.
