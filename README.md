# design-skills

Deterministically compile platform design guidelines into versioned, cited [Agent Skills](https://agentskills.io).
No LLM in the loop: the same input always produces the same skill, and every rule links back to the exact
section it came from.

Hand-written "Apple HIG skill" repos already exist. They share one weakness: someone read the docs
once, wrote a `SKILL.md`, and it silently rots when the guideline changes — and no rule can tell you
which version it came from. This repo treats skills as **build artifacts**. The source of truth is a
small manifest per guideline; a pipeline turns it into a structured rule set with provenance, and the
skill files are generated from that.

```
sources/<id>.yaml        declarative manifest (url, crawl scope, license, cadence)   ← hand-written
        │  fetch          deterministic crawl → .cache/<id>/raw        (never committed)
        │  normalize      raw → clean markdown → .cache/<id>/md        (never committed)
        │  extract        structural rules (bold-lead sentences, headings) → ir/<id>/pages/*.json
        │  compose        IR → skills/<name>/SKILL.md + references/
        │  validate       schema · provenance · license gate · size budget
        │  eval           evals/<id>/questions.yaml facts must be present in the output
        ▼
skills/<name>/           drop into ~/.claude/skills, .cursor, Codex, etc.
```

## How extraction works without a model

Well-edited guidelines are already structured. Apple's HIG, for instance, writes every rule as a paragraph
whose lead sentence is bold — "**Make buttons easy for people to use.** It's essential to include enough
space…" — grouped under "Best practices" and per-platform "Platform considerations" headings, with a dated
change log at the bottom. The extractor (`src/extract/rules.ts`) reads exactly that:

| From the page | Into the rule |
| --- | --- |
| bold lead sentence | `statement` (verbatim) |
| rest of the paragraph | `rationale` |
| heading path | `section`, citation `anchor` |
| platform-named headings (`iOS, iPadOS`, `macOS`…) | `platforms` |
| wording (avoid/never/always → must, consider/can → may) | `severity` |
| first figure with a unit (`44x44 pt`, `4.5:1`) | `value` |
| tables under guidance sections (sizes, margins, specs) | `tables[]`, rendered verbatim in the reference file |
| change-log dates | page `source_version` |
| bold label without an instruction ("Long delay.", "San Francisco (SF)") | `kind: term` — kept in the reference file, excluded from rule counts |
| plain bullets under "Best practices" (overview pages) | rules, first sentence as statement |

Heuristics are small, tested and versioned (`extractor: bold-lead@5` is stamped into every IR file), so a
change to them re-extracts every page and shows up as a reviewable diff. On the current HIG this yields
~2,340 rules across 158 pages, every one with a section anchor, in about a minute.

## Skill shape

`SKILL.md` is the always-loaded entry point and is kept small: how to use, a curated **Where to look**
table (task keywords → files, from the manifest), and an index — one row per page, or one row per rule
for small sources like WCAG. Each `references/<category>/<page>.md` holds every rule for a topic with
severity, verbatim statement, the explanatory text, platform tags, and a citation; cross-references to
other pages are rewritten as relative links. Spec tables larger than a few KB move to a sibling
`<page>.tables.md` so a rulebook stays cheap to load.

The shape was tuned by handing the generated skills to agents that had never seen this project and
reading their usability reports; `evals/` keeps the facts they needed from regressing.

## Why an intermediate representation

Every rule in `ir/` carries its statement, severity, platform scope, value, and **provenance** (URL, anchor,
content hash, fetch date). One IR can feed many targets — Agent Skills today; Cursor rules, `AGENTS.md`,
an MCP server later — and for redistributable sources a refresh PR is a diff of *rules*, not of a
regenerated 40 KB markdown blob.

## Sources

| id | guideline | kind | license | status |
| --- | --- | --- | --- | --- |
| `apple-hig` | Apple Human Interface Guidelines | `docc` | proprietary → build locally, not committed | in progress |
| `material-3` | Material Design 3 | — | CC-BY 4.0 | blocked: JS app shell, needs a headless-browser fetcher |
| `wcag22` | WCAG 2.2 + glossary (from the w3c/wcag source tree) | `wcag` | W3C Document License → build locally, not committed | working |

See [LICENSING.md](LICENSING.md) for how proprietary sources are handled.

## Usage

Requires [Bun](https://bun.sh) ≥ 1.2. No API keys.

```sh
bun install
bun run build apple-hig      # fetch (≈170 pages, ~1 min) → normalize → extract → compose → validate → eval
bun run build wcag22         # 13 guidelines / 86 success criteria, a few seconds
```

Or step by step: `bun run fetch|normalize|extract|compose|validate apple-hig`. Re-running is cheap —
only pages whose content changed are re-extracted.

The generated skill lands in `skills/apple-hig/`. To use it with Claude Code:

```sh
ln -s "$PWD/skills/apple-hig" ~/.claude/skills/apple-hig
```

## Adding a source

1. Add `sources/<id>.yaml` (copy `apple-hig.yaml`). Set `license.redistributable` honestly; if false, add
   `ir/<id>/` and `skills/<name>/` to `.gitignore` (validate enforces this).
2. If the site isn't DocC, add a fetcher/normalizer for its `kind` under `src/fetch` and `src/normalize`.
3. Add `evals/<id>/questions.yaml` — facts (with the page they come from) that must survive into the
   generated skill. `bun run eval <id>` checks them; `build` runs them last.
4. `bun run build <id>` and open a PR. CI runs validate; the weekly refresh workflow opens PRs when
   the upstream content hash changes.

## Layout

```
sources/      manifests                     src/fetch       crawlers (docc, html)
ir/           rule IR + meta.json           src/normalize   → markdown
skills/       generated Agent Skills        src/extract     structural rule extraction
evals/        golden questions per skill    src/compose     IR → SKILL.md + references
.cache/       raw + normalized text (git-ignored)
```

## Status

Early. Two sources build end-to-end with evals (Apple HIG, WCAG 2.2). Next: a headless-browser fetcher
for Material 3, a generic `html` fetcher, and extra emitters (Cursor rules, `AGENTS.md`).
Contributions welcome — especially new source manifests and eval questions.
