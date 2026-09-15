# Reviewing with evidence

Start from observable behavior or a specific code path. Follow a candidate finding to the relevant
official page in [the topic map](../research/topics.md), then check whether the guidance applies to
this platform, component, and state. Read neighboring paragraphs and exceptions before deciding.

For a finding that survives those checks, report:

- The affected control or code location and how to reproduce the issue.
- The consequence for someone using the interface.
- The official page, section, and a concise paraphrase of the relevant guidance.
- The applicable platform and any exception that changes the decision.
- A proposed fix and the observation that would confirm it works.

Label a suggestion based on your own judgment as a design suggestion. Do not attach an Apple
citation to imply it is required. Do not invent rule IDs: this authored guide contains no extracted
rule catalogue. Use actual source URLs and section names.

Source code can suggest a potential issue without proving it. An explicitly small visible icon may
sit inside a larger interactive region; a framework control may already supply a state that is not
declared locally. Inspect the parent layout and component behavior before filing a defect.

When reviewing screenshots, separate visible issues from checks needing runtime access. Note those
checks as unverified rather than claiming that keyboard, accessibility, or dynamic behavior passed.

An illustrative request: review an iOS checkout screen with an icon button and a destructive action.
Read Buttons and Accessibility, inspect actual interaction bounds and the action's role, and verify
the relevant platform guidance. The result should explain decisions with source evidence without
turning every stylistic difference into a violation.
