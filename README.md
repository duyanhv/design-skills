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
| change-log dates | page `source_version` |

Heuristics are small, tested and versioned (`extractor: bold-lead@1` is stamped into every IR file), so a
change to them re-extracts affected pages and shows up as a reviewable diff.

## Why an intermediate representation

Every rule in `ir/` carries its statement, severity, platform scope, value, and **provenance** (URL, anchor,
content hash, fetch date). One IR can feed many targets — Agent Skills today; Cursor rules, `AGENTS.md`,
an MCP server later — and for redistributable sources a refresh PR is a diff of *rules*, not of a
regenerated 40 KB markdown blob.

## Sources

| id | guideline | kind | license | status |
| --- | --- | --- | --- | --- |
| `apple-hig` | Apple Human Interface Guidelines | `docc` | proprietary → build locally, not committed | in progress |
| `material-3` | Material Design 3 | — | CC-BY 4.0 | planned |
| `wcag-2.2` | WCAG 2.2 | — | W3C | planned |

See [LICENSING.md](LICENSING.md) for how proprietary sources are handled.

## Usage

Requires [Bun](https://bun.sh) ≥ 1.2. No API keys.

```sh
bun install
bun run build apple-hig      # fetch (≈150 pages, ~1 min) → normalize → extract → compose → validate
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
3. Add `evals/<id>/questions.yaml` — golden questions the generated skill must answer.
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

Early. The pipeline runs end-to-end for DocC sources. Next: the eval runner, an `html` fetcher for
Material 3 / WCAG, and extra emitters (Cursor rules, `AGENTS.md`).
Contributions welcome — especially new source manifests and eval questions.
