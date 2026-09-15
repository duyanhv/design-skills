# Licensing of sources vs. output

This repository's **code** is MIT. The **guidelines it compiles** each have their own license, and
the pipeline is built so we never redistribute text we aren't allowed to.

| Situation | What gets committed | Current sources |
| --- | --- | --- |
| `license.redistributable: false` | **Nothing derived from the text.** `ir/<id>/` and `skills/<name>/` must be git-ignored, and `validate` fails if they aren't. Users run `bun run build <id>` and get the skill on their own machine, the same way they'd read the guideline in a browser. | `apple-hig`, `wcag22` |
| `kind: authored`, `license.redistributable: true` | Original Markdown from `guidance/` is published under `skills/`, with authorship metadata and provenance. No upstream guideline corpus or extracted IR is bundled. | `apple-design`, `material-3` |
| Extracted source, `license.redistributable: true` | `ir/` and `skills/` are committed and refreshed by CI. The attribution string from the manifest is embedded in every generated file. | `lumen-ds` |

The gate is enforced against git's actual behaviour, not against the text of `.gitignore`: `validate`
runs `git check-ignore` (so a later negation pattern cannot quietly re-include a path) and
`git ls-files` (so a file that was tracked *before* the ignore rule existed is caught). The same
check runs over every manifest in CI via `bun run src/e2e/manifests.ts`, before any build writes
output into the tree.

Extraction is structural, not generative: statements are the guideline's own lead sentences, and the
surrounding explanation is kept verbatim. That makes the output a derivative of the source text
rather than a summary of it, which is precisely why outputs of non-redistributable sources are never
committed here.

## Why WCAG is treated as non-redistributable

WCAG 2.2 is published under the [W3C Document License](https://www.w3.org/copyright/document-license-2023/),
which permits copying but **not** the creation of derivative works. Splitting the criteria into a
restructured rule set with added severity and scope metadata is a derivative work, so `wcag22` is
built locally like Apple's HIG, even though the W3C's terms are far more permissive than Apple's.
The public `material-3` guide licenses only our original instructions under MIT. It does not
assert a redistribution license for the Material Design website.

This is a conservative reading, not legal advice. If you are the rights holder of a guideline and
want it handled differently or removed, open an issue.

## Requirements for a new source

Every source manifest must declare `license.spdx`, `license.redistributable` and
`license.attribution`. For extracted output, attribution is embedded in `SKILL.md`, every
reference file, and `provenance.json`. Authored output records the manifest attribution in
`provenance.json`, with authorship and source metadata in `SKILL.md`. Install whole bundles so
these records travel with the skill.

## Original authored guides

`apple-design` and `material-3` contain original contributor-written workflows and official links.
Their MIT license covers that writing, not linked Apple or Google content. They are not affiliated
with either company and do not claim to reproduce the complete guidelines. Authorship and source
are declared in each entry file and in the generated provenance.
