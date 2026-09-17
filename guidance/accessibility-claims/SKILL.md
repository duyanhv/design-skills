---
name: accessibility-claims
description: "Make accessibility findings that hold up: separate what a standard requires from what it advises, read a success criterion with its exceptions, and say what your evidence does and does not establish. Use when writing or reviewing an accessibility finding, an audit, or a conformance claim. This is a method for making claims, not a copy of WCAG and not a conformance standard."
license: MIT
metadata:
  compatibility: "A coding agent with file access and a way to read the published WCAG 2.2 document."
  authorship: "original"
  source: "https://www.w3.org/TR/WCAG22/"
  maintained_by: "design-skills"
---

# Accessibility claims

A method for making accessibility findings that survive being checked. It is about the **claim**,
not the criteria: which document requires a thing, what its conditions and exceptions are, and what
your evidence actually established.

## What this is not

Read this first, because the failure mode of an accessibility bundle is to be mistaken for the
standard.

- **Not a conformance standard, and not a copy of one.** It states no thresholds and no criteria
  text. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) is the normative document; read it there.
- **Not a substitute for testing.** Nothing here establishes that an interface is accessible. It
  helps you avoid claiming more than you checked.
- **Not legal advice, and not an audit methodology.** Conformance claims have a defined meaning in
  [WCAG's own conformance requirements](https://www.w3.org/TR/WCAG22/#conformance-reqs), including scope,
  full pages, and complete processes. If you are producing a formal claim, that section governs,
  not this one.
- **Not platform guidance.** The `apple-design` and `material-3` bundles in this repository cover
  the platform mechanisms; this covers the claim you make about them.

## The three questions

Every accessibility finding answers these, and a finding that skips one is where audits go wrong.

| Question | Guide |
| --- | --- |
| **Whose rule is this, and is it normative?** Standard, vendor advice, or house style | [authority.md](references/tasks/authority.md) |
| **Does the criterion actually apply here?** Conditions, exceptions, level | [criteria.md](references/tasks/criteria.md) |
| **What did I establish, and how?** Source read, rendered, measured, or assumed | [evidence.md](references/tasks/evidence.md) |

Then [reporting.md](references/tasks/reporting.md) for writing it down so someone else can check it.

## Working method

1. **Name the interface and the scope.** Which pages or screens, which states, which settings. A
   finding without a scope cannot be reproduced or refuted.
2. **For each candidate finding, answer the three questions in order.** Authority first: if it is
   advice, say so and stop calling it a failure. Then conditions and exceptions — this is where most
   wrong findings die. Then evidence.
3. **Separate what you verified from what you inferred.** Reading a semantic element in source is
   not hearing a screen reader announce it.
4. **Report the limits with the findings**, not in a footnote. What you did not test is part of what
   you found.

## The habit this is built around

An accessibility finding is a claim about someone else's work, usually made with authority, often
acted on without being re-checked. That asymmetry is why the standard of evidence has to be higher
than "it looks wrong to me", and why an overstated finding costs more than a missed one: it spends
the reviewer's credibility and the team's time, and it teaches people that accessibility work is
arguable.

Say what you checked. Say what you did not. Cite the criterion, with its exceptions, or do not cite
one.
