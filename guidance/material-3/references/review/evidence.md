# Material 3 review workflow

Review the implementation the user actually has. Identify its library version and theme entry
point, then use [the source map](../research/sources.md) to research the decisions in question.

Trace a potential defect through its theme role, component variant, interaction state, and parent
layout. Verify whether a value is inherited or overridden before recommending a code change.
For a layout issue, describe the size or input mode where the failure appears.

For each supported finding, include the affected element, observed behavior, applicable source
section, relevant state or exception, and the smallest fix that addresses it. State whether the
evidence came from source inspection, a rendered interface, or a runtime test.

Group optional aesthetic suggestions separately from specification mismatches. A custom brand
palette is not by itself proof of incorrect theming. Verify role usage and the resulting behavior.
Likewise, do not turn a screenshot's unfamiliar component style into a requirement to replace the
project's library.

This guide assigns no extracted rule IDs. Cite a real official URL and section. If the available
source cannot support a claim, narrow the claim or mark it unverified. Merely attaching a link does
not show that the source supports the finding.

An illustrative request: review a Material 3 account form in light and dark appearances. Inspect
theme roles, field states, labels, validation behavior, focus, and the layout at relevant sizes.
Verify each proposed defect against the actual implementation and its applicable documentation.
Report checks that need interaction separately from what a static render establishes.
