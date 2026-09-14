# Design Skills audit

Date: 2026-09-14. Baseline: `d117e42`, plus the existing local generated artifacts. Source files changed concurrently during the audit; the follow-up status below distinguishes that work from the baseline findings. Line numbers refer to the initially inspected code.

The project has a sound compiler architecture and a useful product direction. It is an early prototype, however: the generated skills currently lose requirements and sometimes change their scope or authority. Passing the current checks does not establish that an agent can safely apply the extracted guidance.

## Scope and verification

Reviewed both source adapters, normalization, extraction, IR, composition, validation, evaluations, generated Apple HIG/WCAG skills, documentation, and the refresh workflow. Compared selected cached source passages with their generated references and checked the public Agent Skills specification and WCAG conformance model. This was not an exhaustive survey of competing GitHub projects or a legal review of source licenses.

- `bun test`: 11 passed, 86 assertions.
- `bun run typecheck`: passed.
- `bun run validate`: both sources passed with no warnings.
- `bun run eval`: Apple 8/8; WCAG 5/5.
- Local artifacts contain 2,346 Apple rules across 158 pages and 86 WCAG rules across 13 pages.
- Isolated synthetic reproductions confirmed WCAG text loss, erroneous severity, stale page retention, missing configuration invalidation, and timestamp changes on forced extraction.

This audit changed no production source code or generated skills. The existing `bun.lock` modification and concurrent source edits were left untouched. No fresh full network crawl or model-based task evaluation was performed; findings about output refer to the local artifacts and targeted reproductions.

### Concurrent changes: final verification snapshot

Uncommitted changes appeared in the WCAG fetcher/extractor/normalizer and DocC normalizer during report preparation. The WCAG mixed-content fix now preserves the text-spacing, reflow, and hover/focus requirements when run against cached HTML. Finding 1 is therefore **fixed in the sampled current code paths, pending rebuilt artifacts and regression coverage**; the installed/generated reference still contained the broken text at the last check. Glossary support and DocC reference-label fallback were also being added; these additions were not exhaustively audited.

The follow-up unit test run was **10 passed, 1 failed**: `test/wcag.test.ts:15` expects the old heading, while the changed normalizer adds `(new in 2.2)`. The separate follow-up typecheck passed. These are results for a changing working tree, not a claim that the concurrent work is complete. The baseline all-green results above remain relevant evidence that the original checks missed substantive content loss.

## Findings

### 1. P1 — WCAG normalization drops normative list and definition text

Status: confirmed in baseline code and existing artifacts; concurrent code fixes the sampled cases, as described above.

Location: [src/normalize/wcag.ts](src/normalize/wcag.ts), lines 42–68.

`blocks()` filters out text nodes. It is used on `li` and `dd`, which often contain direct text and inline elements rather than paragraph elements. A plain-text list item becomes empty; mixed content retains only its element fragments.

Confirmed in the generated Distinguishable reference:

- 1.4.12 Text Spacing loses all four list requirements, leaving empty bullet markers.
- 1.4.10 Reflow loses the operative dimensions from its list; numbers remain incidentally in explanatory notes.
- 1.4.13 Content on Hover or Focus loses substantial text from the Dismissible, Hoverable, and Persistent definitions.

A synthetic list containing a line-height requirement and a sentence with one emphasized word produced an empty item followed by only the emphasized word. Current tests use paragraph-wrapped definitions and miss this common source shape.

Fix: preserve mixed text/inline/block children in document order. Add fixtures for direct-text `li`/`dd`, mixed inline content, and nested lists. Assert complete criteria and exceptions, not isolated numbers.

### 2. P1 — Apple extraction omits context needed to apply rules

Location: [src/extract/rules.ts](src/extract/rules.ts), lines 148–179; [src/normalize/docc.ts](src/normalize/docc.ts), image/video handling.

Before the first section heading, only the first paragraph survives. Afterwards, ordinary paragraphs, asides, and plain bullets outside Best practices are discarded. The retained rationale is only the text on the bold lead's own line.

In Buttons, this removes the visionOS note about custom hover effects and the supporting material-selection bullets under platform considerations. Introductory definitions and component-selection context also disappear. Image-only table cells become blank, as seen in the visionOS button-size table, without marking that information as unavailable.

This conflicts with the generated instruction that a reference is the topic's full rulebook. Fix: retain contextual blocks and associate subordinate notes/lists with their parent rule. Preserve source links and available captions/alt text; explicitly mark visual dependencies. Coverage reporting should distinguish intentionally omitted navigation from unsupported guidance blocks.

### 3. P1 — Platform-specific pages become universal guidance

Location: [src/extract/rules.ts](src/extract/rules.ts), `currentPlatforms()` and line 191; [src/compose/index.ts](src/compose/index.ts), line 108.

Scope is inferred only from section headings exactly matching platform names. Platform-specific overview pages use headings such as Best practices, so their rules have empty `platforms` arrays. The skill explicitly says an empty tag applies to every platform.

Confirmed: all 4 tvOS, 7 watchOS, 6 macOS, and 10 visionOS overview rules are unscoped. The highlights include Siri Remote guidance without a platform tag. Topic names provide clues to a reader, but they do not repair contradictory structured metadata and instructions.

Fix: add explicit page/platform mappings or reliable page-level scope, inherited by rules and overridden by narrower sections. Treat unknown scope separately from genuinely universal scope. Add cross-platform negative checks.

### 4. P1 — Inferred severity changes the source's authority

Location: [src/extract/severity.ts](src/extract/severity.ts), lines 5–18; [src/extract/wcag.ts](src/extract/wcag.ts), line 46; [src/compose/index.ts](src/compose/index.ts), line 105.

Any occurrence of words such as `only` produces MUST, including inside a compound word. Synthetic reproduction: `Consider using an icon-only button.` becomes MUST. A real macOS overview highlight becomes MUST because it mentions keyboard-only work styles. The generated workflow then tells the agent to enforce these classifications as hard constraints.

WCAG similarly hardcodes A/AA as MUST and AAA as MAY without asking for a conformance target. AAA criteria are required when targeting AAA; AA criteria are not all required for a Level A target. [WCAG conformance requirements](https://www.w3.org/TR/WCAG22/#conformance-reqs) define this relationship.

Fix: preserve source wording and distinguish explicit requirement strength from heuristic editorial priority. Store WCAG conformance level as its own field and select applicable criteria from the task's target. Do not promote keyword guesses to normative requirements.

### 5. P1 — Refreshes can silently retain removed pages or accept incomplete crawls

Location: [src/normalize/index.ts](src/normalize/index.ts), normalization loop; [src/extract/index.ts](src/extract/index.ts), directory enumeration; [src/compose/index.ts](src/compose/index.ts), `loadIR()`; [src/fetch/docc.ts](src/fetch/docc.ts), lines 51–55.

Normalization writes current pages but does not reconcile old files. Extraction reads every Markdown file on disk, and composition reads every IR file. A removed upstream page therefore remains in the skill. The same issue affects pages that become too short and builds run with a limit.

Reproduction: after extracting one synthetic page, an empty current manifest normalized zero pages, yet extraction reused the old file and composition still linked it.

Separately, DocC fetch failures are warnings followed by a successful manifest write. A partially successful fresh crawl can proceed if existing evaluations do not cover the missing pages. Simply deleting absent pages would make this failure mode worse.

Fix: stage a complete build, record successful/failed/excluded pages, and reconcile outputs only after crawl completeness is established. Treat limited builds as explicitly partial artifacts. Retain the last valid build on failure.

### 6. P2 — Extraction cache omits configuration and metadata dependencies

Location: [src/extract/index.ts](src/extract/index.ts), lines 63–67.

Reuse depends only on normalized body hash and extractor ID. Changing `skip_sections`, platform configuration, title, category, citation URL, or upstream version can leave old IR in place.

Reproduction: after extracting a Best practices rule, adding Best practices to `skip_sections` still returned one unchanged rule. This directly affects the advertised manifest-driven workflow.

Fix: fingerprint all semantic extraction inputs, including relevant manifest settings and page metadata. Version normalization as well as extraction, and test configuration-only rebuilds.

### 7. P2 — Provenance and reproducibility stop short of the delivered skill

Location: [src/compose/index.ts](src/compose/index.ts), lines 27–35 and 106; [src/fetch/wcag.ts](src/fetch/wcag.ts), lines 21–28; [sources/wcag22.yaml](sources/wcag22.yaml).

The generated workflow requests rule IDs, but the reference renderer never emits them. Users copying only the skill cannot recover IDs from the IR. References expose a version date and live URL, but omit the rule's content hash and fetch timestamp.

WCAG fetches a moving `main` branch, stores only a commit date, and cites the published Recommendation. The [published WCAG page](https://www.w3.org/TR/WCAG22/) distinguishes its published revision from the editor's draft. Current fetching does not guarantee that all files came from one immutable revision or that the cited publication matches the extracted revision.

Forced extraction also changes `extracted_at`, and metadata always changes `updated_at`. Rule IDs depend on previous output history. Thus deterministic parsing is established more strongly than reproducible, versioned build artifacts.

Fix: emit stable rule IDs and a compact provenance manifest inside each skill; pin Git-backed fetches to one resolved SHA; distinguish publication version from fetch time. Define reproducibility precisely and keep operational timestamps outside content diffs where possible.

### 8. P2 — Skill validation accepts output that violates the advertised format

Location: [src/compose/index.ts](src/compose/index.ts), frontmatter generation; [src/validate/index.ts](src/validate/index.ts), lines 54–64.

Generated `metadata.rules` is a YAML number. The [Agent Skills specification](https://agentskills.io/specification) requires metadata values to be strings. The validator uses regexes rather than parsing and validating the complete frontmatter, so both outputs pass despite this mismatch. Other name/description constraints are incompletely checked.

The 288-line Apple entry file is 31,025 bytes. A line budget alone does not constrain activation cost; long highlight lines and the 158-page index consume substantial space. The specification recommends fewer than 5,000 tokens for activated instructions; token count was not measured in this audit.

Fix: validate parsed frontmatter against the specification and measure token size. Put a concise platform/topic routing workflow in the entry file, with a separate detailed index. Highlights should remain understandable without omitted continuations; several WCAG highlights currently end with an introduction to a missing list.

### 9. P2 — Evaluations do not establish semantic fidelity or agent usefulness

Location: [src/eval/index.ts](src/eval/index.ts), lines 33–41; [evals](evals); [test](test).

Evaluations check substring presence anywhere in a reference page. A number and a conformance level can belong to different rules and still pass. Swapped platform thresholds, missing exceptions, wrong severity, incomplete definitions, or irrelevant routing can all pass. The confirmed WCAG losses passed every existing check.

Fix: retain these as content smoke checks, then add rule-level assertions for scope, conditions, exceptions, and citations. Add representative agent tasks: choose a component, implement a small screen, and audit seeded violations. Compare no skill, direct source access, and the compiled skill. Measure correctness, false positives, citation accuracy, and context cost. The compiler can remain deterministic while evaluations exercise an LLM.

### 10. P2 — Contributor checks and publication safeguards are incomplete

Location: [.github/workflows/refresh.yml](.github/workflows/refresh.yml); [src/validate/index.ts](src/validate/index.ts), lines 39–44.

The only workflow is scheduled/manual refresh. It does not run on PRs or pushes, and it does not run unit tests or typecheck. Both current sources generate ignored outputs, so this workflow currently produces no source-content diff for maintainers to review. Manifest cadence is not used by the scheduler.

The nonredistribution gate checks only literal `.gitignore` lines. Already tracked files remain tracked even when ignored, and later negations can override ignore entries. The code therefore does not enforce its stated guarantee that restricted generated output cannot be committed. No currently tracked restricted output was found in this audit.

Fix: add PR CI for typecheck, unit tests, synthetic end-to-end builds, and format validation. Check Git's effective ignore behavior and tracked paths. Provide non-text refresh summaries where appropriate. Reconcile the W3C example in `LICENSING.md` with the manifest's current policy; this is a documentation consistency issue, not a new licensing determination.

## Product assessment

Keep the source manifests, adapter boundary, structured IR, citations, and generated-reference approach. They provide a clear basis for auditable updates. Adding HTML/Material adapters before fixing shared semantics would multiply the current failures.

The missing product layer is a tested decision workflow: establish platform and version, identify the user's task, retrieve relevant guidance, preserve conditions and exceptions, apply it, and report evidence. Rule counts and a directory of excerpts do not demonstrate that workflow. The current highest-priority selection is driven partly by shortest wording, which is not evidence of design importance.

Use a small, reviewed workflow template alongside generated source references. Source-specific configuration can specify scope, topic routing, dependencies, and visual requirements. Preserve uncertain or unsupported content visibly instead of silently converting it into authoritative instructions. A model can assist proposed annotations later, with review and provenance; it need not be part of the reproducible core build.

For the open-source launch, publish a synthetic or appropriately licensed example artifact that people can inspect without a network build, contributor instructions for adapters and fixtures, and a clear supported-source/coverage matrix. Avoid the README's broad claim that existing hand-written repositories all lack provenance unless a named comparison supports it.

## Recommended order

1. Repair WCAG mixed-content handling and Apple contextual extraction; add regression fixtures for the failures above.
2. Correct platform scope and requirement strength; preserve WCAG levels and exceptions explicitly.
3. Make refreshes complete, transactional, and configuration-aware; pin revisions and deliver usable provenance.
4. Tighten skill-format validation, entry-file routing, and contributor CI.
5. Demonstrate improvement on a small reviewed suite of agent tasks before expanding to additional design systems.

The next milestone should be one trustworthy, demonstrably useful Apple HIG skill, supported by a reliable compiler and tests that catch semantic loss.
