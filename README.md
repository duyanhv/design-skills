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

[Browse an example skill](skills/lumen-ds/SKILL.md) · [Generated skills](skills/README.md) · [Contribute](CONTRIBUTING.md)

## Quick start

Requires [Bun](https://bun.sh) 1.2 or later and Git. Building Apple HIG or WCAG also needs internet access.

```sh
git clone https://github.com/duyanhv/design-skills.git
cd design-skills
bun install --frozen-lockfile

# Build either or both guidelines.
bun run build apple-hig
bun run build wcag22
```

The generated folders are `skills/apple-hig/` and `skills/wcag22/`. Each build fetches the source,
extracts its guidance, writes the skill, then runs validation and source-specific assertions.

To try the pipeline without fetching an external guideline:

```sh
bun run example
```

This rebuilds [Lumen](skills/lumen-ds/SKILL.md), an invented design system used as a test fixture and
readable example. It is not guidance for a real platform.

## Available sources

| Source | Build command | Generated output on GitHub |
| --- | --- | --- |
| [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) | `bun run build apple-hig` | Local build only |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and glossary | `bun run build wcag22` | Local build only |
| Lumen Design System — synthetic example | `bun run example` | [skills/lumen-ds/](skills/lumen-ds/) |

The repository publishes the compiler and eligible generated skills. The current source manifests
mark Apple HIG and WCAG as nonredistributable, so their generated text stays out of Git. See
[source and output licensing](LICENSING.md) for the project's policy.

Material Design 3 and a generic HTML adapter are planned; they are not currently supported.

## Use a generated skill

Install the **whole skill folder**, including references and provenance. Copying only `SKILL.md`
leaves the agent without the guidance it links to.

Run the following from this repository's root after building the skills. The symlinks point to
your local output, so rebuilding updates what the agent reads.

### Codex

```sh
mkdir -p ~/.agents/skills
ln -s "$PWD/skills/apple-hig" ~/.agents/skills/apple-hig
ln -s "$PWD/skills/wcag22" ~/.agents/skills/wcag22
```

Codex supports symlinked skill folders in its user skill directory. See the
[official skill documentation](https://learn.chatgpt.com/docs/build-skills).

### Claude Code

```sh
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/apple-hig" ~/.claude/skills/apple-hig
ln -s "$PWD/skills/wcag22" ~/.claude/skills/wcag22
```

If a destination already exists, inspect the existing installation before replacing it.

### Example requests

> Use the apple-hig skill to review this iOS settings screen. Include the applicable rule ID,
> source link, platform scope, and exceptions for each finding.

> Use the wcag22 skill to review this form against Level AA. Explain which criteria apply and
> which checks require testing the running interface.

Other agents can use the generated Markdown when their runtime supports Agent Skills or provides
a way to load the entry file and follow its local references.

## What gets generated

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
commits changes under `skills/<name>/` and the matching `ir/<source-id>/`, and pushes the current
branch to `origin`. It skips local-only sources and creates no empty commit when output is unchanged.

To select an eligible source or commit locally for review:

```sh
bun run publish:skills lumen-ds
bun run publish:skills lumen-ds --no-push
```

`--no-push` still creates a local commit when output changes. Lumen is currently the only eligible
source. [The publishing guide](skills/README.md) describes failure handling and folder contents.

## Verification and limitations

```sh
bun run check              # Typecheck, tests, synthetic e2e, validator probes, and manifest checks
bun run eval apple-hig     # Assertions about selected rules and their rendered output
bun run coverage           # Heuristic content-loss scan; needs local build caches
bun run trace              # Selected audit assertions; needs Apple HIG and WCAG builds
```

The checks exercise extraction, scope, context retention, publishing, and validation. They do not
establish complete source fidelity or guarantee correct agent decisions:

- **Coverage is heuristic.** It compares vocabulary in normalized pages and generated references.
  It can miss changed numbers, short instructions, tables, and losses introduced during normalization.
  Missing caches are skipped; the current CI coverage step does not establish source coverage.
- **Requirement strength is inferred.** MUST/SHOULD/MAY labels are compiler interpretations of
  wording. Follow the source citation when a decision depends on that distinction.
- **Visual guidance needs inspection.** Figure placeholders identify some visual dependencies;
  they do not reproduce the information in the original images.
- **Agent evaluation is preliminary.** The optional `bun run agenteval --runs 3` harness uses the
  Claude CLI and makes model calls. Its scorer measures seeded cues and citation mentions, not
  whether every finding is supported. The skill arm also receives an explicit citation instruction.

The [original audit](AUDIT.md), [implementation responses](AUDIT-RESOLUTION.md), and
[follow-up verification](AUDIT-VERIFICATION.md) document the findings, fixes, and remaining gaps.

## Contributing

Useful contributions include source adapters, regression fixtures, stronger fidelity checks, and
agent tasks that test implementation as well as review.

To add a guideline, define a manifest in `sources/`, use or implement its fetch/normalize/extract
adapters, and add fixtures and rule-level assertions. Sources need an explicit output licensing
policy before their generated text can be published.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the adapter contracts and development workflow.

## License

The compiler and synthetic example are [MIT licensed](LICENSE). Upstream guidelines retain their
own terms; the code license does not apply to their text. See [LICENSING.md](LICENSING.md).
