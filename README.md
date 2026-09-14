# design-skills

Compile platform design guidelines into versioned, cited, LLM-usable [Agent Skills](https://agentskills.io).

Hand-written "Apple HIG skill" repos already exist. They share one weakness: someone read the docs
once, wrote a `SKILL.md`, and it silently rots when the guideline changes — and no rule can tell you
which version it came from. This repo treats skills as **build artifacts**. The source of truth is a
small manifest per guideline; a pipeline turns it into a structured rule set with provenance, and the
skill files are generated from that.

```
sources/<id>.yaml        declarative manifest (url, crawl scope, license, cadence)   ← hand-written
        │  fetch          deterministic crawl → .cache/<id>/raw        (never committed)
        │  normalize      raw → clean markdown → .cache/<id>/md        (never committed)
        │  extract        LLM, fixed prompt + JSON schema → ir/<id>/pages/*.json   ← committed, reviewable
        │  compose        IR → skills/<name>/SKILL.md + references/     ← committed, generated
        │  validate       schema · provenance · verbatim check · size budget
        ▼
skills/<name>/           drop into ~/.claude/skills, .cursor, Codex, etc.
```

## Why an intermediate representation

Every rule in `ir/` carries: an imperative statement, severity (`must`/`should`/`may`), platform scope,
a concrete value when the guideline gives one, and **provenance** (source URL, section anchor,
content hash, fetch date). Because the IR is committed, a refresh PR shows a diff of *rules*, not of a
regenerated 40 KB markdown blob — reviewers can actually review it. And one IR can feed many targets
(Agent Skills today; Cursor rules, `AGENTS.md`, an MCP server later).

## Sources

| id | guideline | kind | license | status |
| --- | --- | --- | --- | --- |
| `apple-hig` | Apple Human Interface Guidelines | `docc` | proprietary → paraphrased rules only | in progress |
| `material-3` | Material Design 3 | — | CC-BY 4.0 | planned |
| `wcag-2.2` | WCAG 2.2 | — | W3C | planned |

See [LICENSING.md](LICENSING.md) for how proprietary sources are handled.

## Usage

Requires [Bun](https://bun.sh) ≥ 1.2 and an `ANTHROPIC_API_KEY` for the extract step.

```sh
bun install
cp .env.example .env         # add your key

bun run fetch apple-hig                  # crawl (≈150 pages, polite, ~1 min)
bun run normalize apple-hig
bun run extract apple-hig --dry-run      # see what would be sent to the model
bun run extract apple-hig --limit 5      # try a few pages first
bun run compose apple-hig
bun run validate apple-hig

bun run build apple-hig                  # all of the above; only changed pages hit the model
```

The generated skill lands in `skills/apple-hig/`. To use it with Claude Code:

```sh
ln -s "$PWD/skills/apple-hig" ~/.claude/skills/apple-hig
```

## Adding a source

1. Add `sources/<id>.yaml` (copy `apple-hig.yaml`). Set `license.allow_verbatim` honestly.
2. If the site isn't DocC, add a fetcher/normalizer for its `kind` under `src/fetch` and `src/normalize`.
3. Add `evals/<id>/questions.yaml` — golden questions the generated skill must answer.
4. `bun run build <id>` and open a PR. CI runs validate; the weekly refresh workflow opens PRs when
   the upstream content hash changes.

## Layout

```
sources/      manifests                     src/fetch       crawlers (docc, html)
ir/           rule IR + meta.json           src/normalize   → markdown
skills/       generated Agent Skills        src/extract     model call, schema-enforced
evals/        golden questions per skill    src/compose     IR → SKILL.md + references
.cache/       raw + normalized text (git-ignored)
```

## Status

Early. The pipeline runs end-to-end for DocC sources; the eval runner and non-DocC fetchers are next.
Contributions welcome — especially new source manifests and eval questions.
