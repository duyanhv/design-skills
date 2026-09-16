# design-skills

**Turn design guidelines into skills your coding agent can read and apply.**

[![CI](https://github.com/duyanhv/design-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/duyanhv/design-skills/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)

design-skills compiles sources such as Apple's Human Interface Guidelines and WCAG into
[Agent Skills](https://agentskills.io): a short `SKILL.md`, topic references, and source provenance.
An agent can find guidance for a task, read its platform scope and exceptions, and cite the rule
behind a design decision or review finding.

The build uses source-specific parsers and versioned extraction rules. It makes no LLM calls and
requires no model API key.

**Status: experimental.** The skills are usable for assisted design and review. Extraction and
evaluation still have [known limitations](#verification-and-limitations).

[Apple design skill](skills/apple-design/SKILL.md) · [Material Design 3 skill](skills/material-3/SKILL.md) · [Generated skills](skills/README.md) · [Contribute](CONTRIBUTING.md)

The repository also ships **original, authored guides** for Apple design and Google Material Design 3.
These provide task workflows and official reference links. They require an agent that can read the
linked documentation; they are not offline copies of the guidelines.

## Quick start

Requires [Bun](https://bun.sh) 1.2 or later and Git. Building Apple HIG or WCAG also needs internet access.

```sh
git clone https://github.com/duyanhv/design-skills.git
cd design-skills
bun install --frozen-lockfile

# Rebuild the two public guides (no network or model calls).
bun run build:public
```

The public folders `skills/apple-design/` and `skills/material-3/` are already included in the clone.
The command rebuilds them from `guidance/`, validates local links and provenance, and runs smoke checks.

To extract the larger guideline corpora for local use:

```sh
bun run build apple-hig
bun run build wcag22
```

These builds fetch the source, extract its guidance, write the skill, and run validation and
source-specific assertions. Their output stays local.

To try the pipeline without fetching an external guideline:

```sh
bun run example
```

This rebuilds [Lumen](skills/lumen-ds/SKILL.md), an invented design system used as a test fixture and
readable example. It is not guidance for a real platform.

## Available sources

| Source | Build command | Generated output on GitHub |
| --- | --- | --- |
| Apple design — original workflow and HIG links | `bun run build apple-design` | [skills/apple-design/](skills/apple-design/) |
| Google Material Design 3 — original workflow and official links | `bun run build material-3` | [skills/material-3/](skills/material-3/) |
| [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) | `bun run build apple-hig` | Local build only |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and glossary | `bun run build wcag22` | Local build only |
| Lumen Design System — synthetic example | `bun run example` | [skills/lumen-ds/](skills/lumen-ds/) |

The repository publishes the compiler and eligible generated skills. The current source manifests
mark Apple HIG and WCAG as nonredistributable, so their generated text stays out of Git. See
[source and output licensing](LICENSING.md) for the project's policy.

Full Material Design 3 extraction and a generic HTML adapter remain planned. The public Material 3
skill is an authored guide, distinct from an extraction adapter and from the MUI React library.

## Use a generated skill

Install the **whole skill folder**, including references and provenance. Copying only `SKILL.md`
leaves the agent without the guidance it links to.

Run the following from this repository's root to install the included public guides. The symlinks point to
your local output, so rebuilding updates what the agent reads.

### Codex

```sh
mkdir -p ~/.agents/skills
ln -s "$PWD/skills/apple-design" ~/.agents/skills/apple-design
ln -s "$PWD/skills/material-3" ~/.agents/skills/material-3
```

Codex supports symlinked skill folders in its user skill directory. See the
[official skill documentation](https://learn.chatgpt.com/docs/build-skills).

### Claude Code

```sh
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/apple-design" ~/.claude/skills/apple-design
ln -s "$PWD/skills/material-3" ~/.claude/skills/material-3
```

If a destination already exists, inspect the existing installation before replacing it.

### Example requests

> Use the apple-design skill to review this iOS settings screen. Read the relevant HIG pages,
> then include the source link, platform scope, and exceptions for each finding.

> Use the material-3 skill to plan this adaptive settings form. Check the official guidance and
> our framework’s supported APIs before choosing components and theme roles.

> Use the wcag22 skill to review this form against Level AA. Explain which criteria apply and
> which checks require testing the running interface.

Other agents can use the generated Markdown when their runtime supports Agent Skills or provides
a way to load the entry file and follow its local references.

## What gets generated

Extracted skills contain the following artifacts. Authored guides contain `SKILL.md`, original
reference notes, and file hashes plus official URLs in `provenance.json`; they have no extracted
rule IDs, fetch dates, or IR.

```text
skills/<name>/
├── SKILL.md              Task workflow and topic routing
├── index.md              Full index when split from the entry file
├── references/
│   └── <category>/
│       ├── <topic>.md     Rules, context, exceptions, IDs, and citations
│       └── <topic>.tables.md  Large tables, when split out
└── provenance.json       Source URLs, versions, hashes, and fetch dates
```

The compiler also writes structured rules under `ir/<source-id>/`. These record source text,
platform scope, inferred requirement strength, and provenance. WCAG conformance levels are stored
separately so the agent can select criteria for the project's target.

```text
Source manifest → Fetch → Normalize → Extract → Compose → Validate → Evaluate
```

Fetched and normalized content lives in the ignored `.cache/` directory. Changes to extraction
inputs invalidate cached rules; complete builds reconcile removed pages. Incomplete crawls are
refused by default. An explicit `--allow-partial` build carries an incomplete-build warning.

## Publish Markdown to the Git tree

From a clean working tree with a configured `origin` and push access:

```sh
bun run publish:skills
```

This command builds sources marked `license.redistributable: true`, validates their output,
commits changes under `skills/<name>/` (plus `ir/<source-id>/` for extracted sources), and pushes the current
branch to `origin`. It skips local-only sources and creates no empty commit when output is unchanged.

To select an eligible source or commit locally for review:

```sh
bun run publish:skills apple-design material-3
bun run publish:skills apple-design material-3 --no-push
```

`--no-push` still creates a local commit when output changes. Apple Design, Material 3, and the
Lumen example are eligible sources. [The publishing guide](skills/README.md) describes failure handling and folder contents.

## Verification and limitations

```sh
bun run check              # Typecheck, tests, synthetic e2e, validator probes, and manifest checks
bun run eval apple-hig     # Assertions about selected rules and their rendered output
bun run coverage           # Heuristic content-loss scan; needs local build caches
bun run fidelity           # Per-sentence verbatim scan of source against shipped references
bun run budget             # Retrieval cost: entry, index, pages, routing rows, cost to first decision
bun run trace              # Selected audit assertions; needs Apple HIG and WCAG builds
bun run trace:negative     # Reintroduces each defect and asserts the matching trace check fails
```

The checks exercise extraction, scope, context retention, source fidelity, publishing, and
validation. They do not guarantee correct agent decisions:

- **Authored guides depend on upstream reading.** Build checks verify packaging and selected content,
  not whether remote pages are reachable, current, or correctly applied by an agent.
- **Fidelity is per sentence, page-wide, and against the normalized cache.** `bun run fidelity`
  asserts that every source sentence of six or more words appears verbatim *somewhere* in the
  corresponding shipped reference — currently 0 missing across 10,883 Apple and 760 WCAG sentences.
  It cannot tell you which rule a sentence landed under: a note moved to the rule above leaves it
  reporting everything present. Ownership and order are separate metrics (`structure` S-1 and S-2),
  and required pages, tables and link dependencies are a third (S-3). It compares against
  `.cache/<id>/md`, so a loss introduced during *normalization* is invisible to it, and a source
  that is not built locally is skipped rather than passing.
- **Counting the output only finds what someone looked for.** Two checks count the raw Apple corpus
  instead: media (1,334 of 1,536 occurrences rendered, 202 enumerated by reason) and prose (12,531 of
  12,807 sentences reaching the shipped text, 279 enumerated), and WCAG's raw HTML (839/839, no
  exclusions). That is how three figure-deleting defects and a word-splitting normalizer bug were
  found while every other check passed. Nothing yet verifies that the *crawl* fetched everything
  upstream publishes.
- **Requirement strength is inferred, per source.** For a source that does not declare normative
  status, MUST/SHOULD/MAY rank how firmly the source worded something and are the compiler's
  reading, not a claim the source made; the generated entry says so and asks for the source's own
  prohibition before a requirement violation is alleged. A source that declares status (WCAG's
  levels) keeps enforceable badges.
- **Visual guidance needs inspection.** Figure placeholders name the medium, carry the source's
  alternative description and any occurrence caption, and locate the original; they do not
  reproduce the information in the image.
- **Agent evaluation is preliminary.** The optional `bun run agenteval --runs 3` harness uses the
  Claude CLI and makes model calls. Its scorer measures seeded cues and citation mentions, not
  whether every finding is supported, and it now resolves each cited id against the built skill so a
  fabricated-but-well-formed citation earns no credit. The skill arm also receives an explicit
  citation instruction. Three samples per arm is a small sample and most ranges overlap; see the
  [resolution](docs/audits/resolution-2026-09-15.md) for the last recorded run and the four defects
  running it exposed, two of which were in the scorer rather than the skill.

The [output audit](docs/audits/generated-output-2026-09-15.md) compares what the compiler produces
against the raw sources and against established hand-written design skills; its
[resolution](docs/audits/resolution-2026-09-15.md) records the fixes, the evidence for each, the two
extractor bugs the audit's own findings led to, and what was deliberately left as a judgement call.
Earlier audit documents were removed from the repository in `fa7dca9`.

## Contributing

Useful contributions include source adapters, regression fixtures, stronger fidelity checks, and
agent tasks that test implementation as well as review.

To add a guideline, define a manifest in `sources/`, use or implement its fetch/normalize/extract
adapters, and add fixtures and rule-level assertions. Sources need an explicit output licensing
policy before their generated text can be published.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the adapter contracts and development workflow.

## License

The compiler, original authored guides, and synthetic example are [MIT licensed](LICENSE). Upstream guidelines retain their
own terms; the code license does not apply to their text. See [LICENSING.md](LICENSING.md).
