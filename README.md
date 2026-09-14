# design-skills

Deterministically compile platform design guidelines into versioned, cited [Agent Skills](https://agentskills.io).
No LLM in the loop: the same input always produces the same skill, and every rule links back to the exact
section it came from.

Skills are treated as **build artifacts**. The source of truth is a small manifest per guideline; a
pipeline turns it into a structured rule set with provenance, and the skill files are generated from
that. A hand-written `SKILL.md` cannot tell you which version of the guideline it reflects, or show
you a diff when the guideline changes; a compiled one can.

```
sources/<id>.yaml        declarative manifest (url, crawl scope, license, cadence)   ← hand-written
        │  fetch          deterministic crawl → .cache/<id>/raw        (never committed)
        │  normalize      raw → clean markdown → .cache/<id>/md        (never committed)
        │  extract        structural rules (bold-lead sentences, headings) → ir/<id>/pages/*.json
        │  compose        IR → skills/<name>/SKILL.md + references/ + provenance.json
        │  validate       schema · scope · provenance · license gate · spec conformance · budgets
        │  eval           evals/<id>/questions.yaml rule-level assertions must hold
        ▼
skills/<name>/           drop into ~/.claude/skills, .cursor, Codex, etc.
```

## How extraction works without a model

Well-edited guidelines are already structured. Apple's HIG writes every rule as a paragraph whose
lead sentence is bold — "**Make buttons easy for people to use.** It's essential to include enough
space…" — grouped under "Best practices" and per-platform "Platform considerations" headings, with a
dated change log at the bottom. The extractor (`src/extract/rules.ts`) reads exactly that:

| From the page | Into the rule |
| --- | --- |
| bold lead sentence | `statement` (verbatim) |
| rest of the paragraph | `rationale` |
| prose, bullets and notes that follow a rule | `notes[]` — the exceptions and caveats, verbatim |
| prose before a section's first rule | that section's `intro` |
| paragraphs before the first heading | page `overview` (what the topic is, when to use it) |
| heading path | `section`, citation `anchor` |
| platform-named headings, plus the page's declared scope | `platforms` + `scope` |
| wording (avoid/never → must, consider → may, hedged → should) | `severity` |
| conformance level, where the source defines one | `conformance_level` (A/AA/AAA) |
| first figure with a unit (`44x44 pt`, `4.5:1`) | `value` |
| tables under guidance sections | `tables[]`, rendered verbatim |
| images | `_[figure: alt]_` — marked, never silently dropped |
| change-log dates | page `source_version` |
| bold label without an instruction ("Long delay.") | `kind: term`, rendered beside the rules that use it |

Heuristics are small, tested and versioned (`extractor: bold-lead@6` is stamped into every IR file),
so a change to them re-extracts every page and shows up as a reviewable diff. On the current HIG this
yields ~2,350 rules across 158 pages, every one with a section anchor, in about a minute.

### Scope and authority are not guessed away

Two things a compiled rulebook can get dangerously wrong, and what this does about them:

**Platform scope.** A rule carries a `scope` of `section`, `page` or `general`. Apple declares each
page's platforms in its DocC metadata, so "Designing for tvOS" guidance renders as `_[tvOS only]_`
rather than as universal advice. Only `general` means "applies to everything this source covers", and
`validate` rejects any rule whose scope and platform list contradict each other.

**Requirement strength.** Severity reports how the *source* worded a rule; it never invents authority.
"only" counts when it restricts a clause ("Display only one sheet") and not inside a compound
adjective ("an icon-only button"), and hedged wording ("In general, avoid…") caps at SHOULD. WCAG keeps
its conformance level as a separate field instead of collapsing A/AA into MUST and AAA into MAY: which
criteria bind you depends on the [conformance target](https://www.w3.org/TR/WCAG22/#conformance-reqs)
you claim, so the skill tells the agent to establish that target first.

## Skill shape

`SKILL.md` is the always-loaded entry point and is kept small (~1.2k tokens for the HIG): a decision
workflow, a curated **Where to look** table, and a category map. The full topic index moves to
`index.md` once it would dominate the entry file. Each `references/<category>/<page>.md` holds every
rule for a topic with its severity, verbatim statement, reasoning, exceptions, platform tag, rule id
and citation; cross-references become relative links. Large spec tables move to a sibling
`<page>.tables.md`. `provenance.json` travels with the skill so a copied directory can still say what
it was built from.

## Trust and verification

| Check | What it proves | Runs |
| --- | --- | --- |
| `bun test` | Each stage in isolation, with regression fixtures for every bug the audit found | CI |
| `bun run e2e` | The whole pipeline over a synthetic source, plus the cache and reconciliation contracts | CI |
| `bun run validate <id>` | IR schema, scope integrity, provenance, Agent Skills frontmatter, token budget, license gate | CI + build |
| `bun run eval <id>` | Rule-level assertions: severity, scope, conformance level, exceptions, citation anchors | build |
| `bun run agenteval` | Whether an agent given the skill actually reviews UI better | manual (costs model calls) |

Evals assert facts about *rules*, not substrings on a page. An eval locates one rule and checks what
an agent acts on, because a substring test passes happily while a criterion loses the exception list
that made it satisfiable. Each was verified by reintroducing the original bug and confirming the eval
fails with a precise diagnostic.

`examples/` is not needed: the `lumen-ds` skill under `skills/lumen-ds/` is generated from a synthetic
MIT-licensed guideline and **committed**, so you can read real output of this compiler without
building anyone's proprietary content. CI fails if it drifts from what the compiler produces.

## Why an intermediate representation

Every rule in `ir/` carries its statement, severity, scope, exceptions, value, and **provenance**
(URL, anchor, content hash, fetch date). One IR can feed many targets — Agent Skills today; Cursor
rules, `AGENTS.md`, an MCP server later — and for redistributable sources a refresh PR is a diff of
*rules*, not of a regenerated 40 KB markdown blob. Rebuilding unchanged input is byte-identical, so a
diff only ever shows a real change.

## Sources

| id | guideline | kind | license | status |
| --- | --- | --- | --- | --- |
| `apple-hig` | Apple Human Interface Guidelines | `docc` | proprietary → build locally, not committed | working |
| `wcag22` | WCAG 2.2 + glossary (from the w3c/wcag source tree, pinned to a commit) | `wcag` | W3C Document License → build locally, not committed | working |
| `lumen-ds` | synthetic example guideline | `docc` | MIT → committed, readable in-repo | working |
| `material-3` | Material Design 3 | — | CC-BY 4.0 | blocked: JS app shell, needs a headless-browser fetcher |

See [LICENSING.md](LICENSING.md) for how proprietary sources are handled.

## Usage

Requires [Bun](https://bun.sh) ≥ 1.2. No API keys.

```sh
bun install
bun run build apple-hig      # fetch (≈170 pages, ~1 min) → normalize → extract → compose → validate → eval
bun run build wcag22         # 13 guidelines / 86 success criteria, a few seconds
bun run example              # the synthetic source, no network
bun run check                # typecheck + tests + end-to-end build + manifest validation
```

Or step by step: `bun run fetch|normalize|extract|compose|validate <id>`. Re-running is cheap — only
pages whose content *or configuration* changed are re-extracted. A crawl that fails part-way is
marked partial and refuses to reconcile, so a network blip cannot delete guidance from your skill;
`--allow-partial` overrides that and marks the artifact accordingly.

The generated skill lands in `skills/apple-hig/`. To use it with Claude Code:

```sh
ln -s "$PWD/skills/apple-hig" ~/.claude/skills/apple-hig
```

## Adding a source

1. Add `sources/<id>.yaml` (copy `apple-hig.yaml`). Set `license.redistributable` honestly; if false, add
   `ir/<id>/` and `skills/<name>/` to `.gitignore` (validate enforces this against git's actual
   behaviour, not the file's text).
2. If the site isn't DocC, add a fetcher/normalizer for its `kind` under `src/fetch` and `src/normalize`.
3. Add `evals/<id>/questions.yaml`. Prefer `rule:` assertions over `expect:` substrings — and check
   that each one fails when you break the thing it guards.
4. `bun run build <id>` and open a PR. CI runs typecheck, tests, the end-to-end build and manifest
   validation; the weekly refresh workflow opens PRs when the upstream content hash changes.

## Layout

```
sources/      manifests                     src/fetch       crawlers (docc, wcag)
ir/           rule IR + meta.json           src/normalize   → markdown
skills/       generated Agent Skills        src/extract     structural rule extraction
evals/        rule assertions per skill     src/compose     IR → SKILL.md + references
.cache/       raw + normalized text (git-ignored)
                                            src/e2e         synthetic source + end-to-end build
                                            src/agenteval   does the skill change an agent's decisions?
```

## Status

Early, but the Apple HIG and WCAG 2.2 skills now hold up to scrutiny: guidance keeps its exceptions,
platform scope is the source's own, requirement strength is not invented, and the checks fail when any
of that regresses. Next: a headless-browser fetcher for Material 3, a generic `html` fetcher, and
extra emitters (Cursor rules, `AGENTS.md`).
Contributions welcome — especially new source manifests and eval questions.
