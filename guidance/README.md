# Authored guidance (the input side)

This folder holds the **original writing** behind the published authored skills. It is the file you
edit; [`skills/`](../skills/) is the generated bundle an agent installs. `bun run build:public`
copies these Markdown files into `skills/<name>/`, checks the frontmatter and every local link, and
writes `provenance.json` with a hash per file and the official URLs found in the text. CI rebuilds
and fails on any diff, so the published bundle cannot drift from what is here.

| Input | Published as |
| --- | --- |
| [`apple-design/`](apple-design/) | [`skills/apple-design/`](../skills/apple-design/) |
| [`material-3/`](material-3/) | [`skills/material-3/`](../skills/material-3/) |

## What belongs in an authored guide

Write the durable part of a design task: how to establish platform, OS version, framework and scope
before choosing a component; what to inspect in code rather than in a screenshot; what a finding has
to carry before it is reported; how to label a personal judgment as a judgment.

Do **not** restate upstream specifications. Numeric values, requirement strength, per-platform
differences, API availability and anything carried by an illustration change between releases and
belong at the linked source. A guide that copies a number is wrong the next time the source revises
it, and for Apple and Google it would also be redistributing text this project has no license to
redistribute. Link the page that owns the answer and say what to read there.

Guidance in this folder is MIT licensed original writing. It is not affiliated with Apple or Google.

## Rules the build enforces

- `SKILL.md` frontmatter must set `license: MIT`, `metadata.authorship: original`, and a `name` and
  `description` identical to the source manifest in [`sources/`](../sources/).
- Every local link must resolve inside the bundle, and every `.md` file must be reachable from
  `SKILL.md`. An orphaned reference is an error, not a warning: the agent would never read it.
- The entry file stays within the manifest's line budget, so routing is cheap to load.
- The manifest's `base_url` must appear somewhere in the bundle.
- No symlinks. A bundle is installed by copying or linking the folder, and a symlink inside it
  would point at something the installing machine does not have.

## Authored versus extracted

An **authored** source is written here and links upstream. An **extracted** source is crawled and
split into rules that carry the source's own sentences, rule IDs, platform scope, and citations, and
produces IR under `ir/<id>/` as well as a skill. The two are not interchangeable: an authored guide
has no rule catalogue, so a finding that cites `HIG-XXXX` from one of these bundles is fabricated.

Extracted output may only be committed when its source manifest declares
`license.redistributable: true`. Apple HIG and WCAG 2.2 declare `false`, so their output is built
locally and git-ignored. See [LICENSING.md](../LICENSING.md).
