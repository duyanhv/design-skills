# Generated design skills: output audit

Date: 2026-09-15  
Repository revision: `fa7dca949be40652bad7ee997d91a1925d564623`  
Status: **Findings addressed. See [resolution-2026-09-15.md](resolution-2026-09-15.md).**

A1–A5 and A7 are resolved with guards; A6 is measured and its budget decision is open. Two of the
findings turned out to have causes outside the code they implicated: the media loss in A1 was
compounded by two defects in `src/extract/rules.ts` that were deleting figures from the sections
they illustrate. The text below is the audit as written, unchanged, and still describes the state of
revision `fa7dca9`.

## Assessment

The compiler produces useful, navigable reference material, with source citations, platform scope, and retained exceptions. The authored Apple and Material 3 guides already provide stronger implementation and review workflows than the extracted entry files.

Passing checks do not establish fidelity to the original source. Direct inspection found Apple media content omitted before the sentence checker sees it, a WCAG instruction that promotes informative notes into requirements, and a source dependency whose link disappears during extraction. These should be corrected before treating the output as a reliable standalone design/review skill.

Preserve the separation between original workflow advice and extracted source material. Improve the workflow around the rulebook; do not rewrite platform guidance to imitate a particular web-design aesthetic.

## Scope and evidence

### Outputs inspected

| Output | Kind | Current size | Assessment |
| --- | --- | --- | --- |
| `skills/apple-hig/` | Locally extracted Apple HIG | 158 pages; 2,347 guidance rules | Useful corpus; media loss and workflow refinements required |
| `skills/wcag22/` | Locally extracted WCAG | 14 pages; 86 active criteria | Criteria and exceptions retained in sampled topics; authority and dependency issues remain |
| `skills/apple-design/` | Original authored workflow | 3 Markdown files | Good model for evidence-based implementation/review |
| `skills/material-3/` | Original authored workflow | 3 Markdown files | Clear design-system/library distinction; depends on online research |
| `skills/lumen-ds/` | Synthetic example | 3 pages; 10 guidance rules | Useful format fixture; not evidence of real-source completeness |

Apple and WCAG output is ignored by Git and exists locally. Findings refer to the artifacts present during this audit, without refreshing or rebuilding the source corpus. Rule totals exclude glossary/definition records.

Raw-source comparison used `.cache/apple-hig/raw/*.json` and `.cache/wcag22/raw/*.html`, alongside normalized Markdown, IR, and generated references. Apple's cache manifest records a completed crawl on September 14; the entry reports source version `2026-09-09`. WCAG records revision `13c6f9e64157d0732d3253ee522ca6ae6996dc34` and version `2026-08-17`.

### Established skills used as comparison criteria

- [frontend-design](/Users/duyanhv/.codex/skills/frontend-design/SKILL.md): brief-specific decisions, deliberate planning, implementation, and visual self-review.
- [frontend-skill](/Users/duyanhv/.codex/skills/frontend-skill/SKILL.md): concrete acceptance questions, hierarchy, content, and interaction intent.
- [web-design-guidelines](/Users/duyanhv/.codex/skills/web-design-guidelines/SKILL.md), with its [upstream review guide](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md): inspect concrete files and produce actionable findings tied to code locations.
- [skill-creator](/Users/duyanhv/.codex/skills/.system/skill-creator/SKILL.md): precise activation, economical instructions, progressive disclosure, and task-relevant verification.
- The repository's authored [Apple workflow](../../guidance/apple-design/SKILL.md) and [review reference](../../guidance/apple-design/references/review/evidence.md), plus the [Material 3 workflow](../../guidance/material-3/SKILL.md).

These are comparison references, not upstream Apple/W3C requirements. Their stylistic defaults—hero composition, font counts, card preferences, and prescribed motion—should not become universal constraints in generated platform skills. Installed-skill links are machine-local snapshots of the comparison baseline.

### Live source checks

- [Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) returned a JavaScript-only shell through the text browser; its [DocC JSON endpoint](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/buttons.json) was readable. Detailed omission findings below use the actual fetched local JSON, not an assumed rendering of the live page.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) was readable, including its normative/informative distinction and conformance sections.
- [Material Design 3](https://m3.material.io/) did not expose substantive text through this browser. [Google's Compose documentation](https://developer.android.com/develop/ui/compose/designsystems/material3) was readable and supports the authored guide's orientation around theme roles. Full Material-site fidelity was not assessed: this repository ships an authored guide, not an extracted Material corpus.

## Findings

Priority: **P1** = source meaning or necessary evidence is lost/changed; **P2** = meaningful reliability or usability improvement. These priorities assess this compiler, not the importance of upstream design rules.

### A1 · P1 · Apple video descriptions and image captions disappear

**Evidence**

- `src/normalize/docc.ts:222` handles block images/videos by emitting nothing. The current raw Apple corpus contains **61 block videos across 21 output topics**. All 61 have source alternative descriptions; none of those complete descriptions appears in its corresponding generated reference.
- Executing `blocksToMarkdown` on `pointing-devices.json → primaryContentSections[0].content[17]` returned an empty string. The node is `text-entry-pointer.mp4`; its source alternative description is 350 characters long. The generated pointer-effects section has no marker for this missing demonstration.
- `src/normalize/docc.ts:93` renders inline media from the referenced asset's alternative text, but ignores the occurrence's `metadata.abstract`. The raw content contains **421 caption-bearing media occurrences**. Some captions repeat nearby information; this is not a count of 421 distinct lost requirements.
- A stronger example is `privacy.json → primaryContentSections[0].content[29].tabs[0].content[1].inlineContent[0]`: the 227-character caption contains additional restrictions on withholding functionality while requesting tracking permission. Its image alternative describes the pictured incentive screen. The generated `references/foundations/privacy.md:83` retains the general prohibition and screenshot description, but loses the caption's additional explanation.

**Impact:** an agent cannot distinguish an absent demonstration from one it should inspect, and descriptive alternatives do not necessarily preserve the accompanying design instruction. The existing figure disclaimer cannot cover figures that leave no marker.

**Refinement:** normalize block media into explicit placeholders, keep occurrence-specific captions next to their own media, and retain an original-page/section locator. Preserve descriptive alternatives and instructional captions as separate fields or labeled blocks. Downloading or redistributing the assets is unnecessary for this fix.

**Acceptance:** source-to-output probes cover a block video, an image with different alt/caption text, and a multi-tab example. Every in-scope media occurrence must render or carry an explicit exclusion reason. Check attachment to the correct figure/section, not just presence somewhere in the file.

### A2 · P1 · The WCAG entry turns informative notes into requirements

**Evidence:** `sources/wcag22.yaml:41`, copied into `skills/wcag22/SKILL.md:38`, says every criterion's exceptions and notes are part of the requirement. W3C explicitly classifies notes and examples as informative; they help interpretation without creating conformance requirements. [WCAG §5.1](https://www.w3.org/TR/WCAG22/#interpreting-normative-requirements)

The generated Label in Name reference (`references/operable/input-modalities.md:23`) illustrates the consequence: a note recommends placing the visible label at the beginning of the accessible name. The criterion itself requires containment, so converting that ordering advice into a mandatory test can produce a false finding.

**Refinement:** preserve all context, but distinguish normative conditions/exceptions from informative notes/examples. Replace the blanket entry instruction and make the WCAG-specific authority model explicit. The generic claim that severity is inferred from wording is also inaccurate here: `src/extract/wcag.ts:58` assigns every active criterion `must` directly.

**Acceptance:** a review fixture where the accessible name contains the visible label later in the name must not fail this criterion solely on ordering. A fixture that violates an actual exception condition must still be caught.

### A3 · P1 · WCAG dependencies are neither bundled nor reliably linked

**Evidence:** `.cache/wcag22/raw/adaptable.html:68` links to `#input-purposes`. The normalized Markdown retains that link. `src/extract/wcag.ts:26` strips links from rule text/context, leaving only the section name in `skills/wcag22/references/perceivable/adaptable.md:27`. The bundle contains no Input Purposes reference.

This section supplies the defined set needed to apply criterion 1.3.5. [WCAG Input Purposes](https://www.w3.org/TR/WCAG22/#input-purposes)

The fetcher selects guideline sections plus glossary includes (`src/fetch/wcag.ts`). It does not extract the conformance section either. The entry links that section, but its workflow does not require reading it before a conformance conclusion. Full-page/process coverage, accessibility support, and non-interference remain relevant beyond choosing A/AA/AAA. [WCAG conformance requirements](https://www.w3.org/TR/WCAG22/#conformance-reqs)

**Impact:** a partial review can sound complete, and a source-defined condition can become an unresolvable reference in local use. This is a fetch/extraction boundary problem, despite successful sentence and local-link checks.

**Refinement:** preserve source links through extraction. Bundle necessary normative dependencies when supported by the project's output policy; otherwise emit a precise external link and an explicit read requirement at the point of use. Document the difference between reviewing selected criteria and establishing conformance. Keep ordinary component reviews scoped to the user's task.

**Acceptance:** starting only from the generated 1.3.5 reference, a reader can reach the defined purpose set. A request for a conformance conclusion must either cover the applicable conformance requirements or report the limits of the review.

### A4 · P2 · Inferred Apple wording becomes an instruction to enforce hard constraints

**Evidence:** `skills/apple-hig/SKILL.md:23` instructs agents to apply MUST rules as hard constraints; line 26 then says these labels are inferred and not declared by Apple. `src/extract/severity.ts` maps terms such as “avoid,” “ensure,” and “should not” to `must`. For example, the source's advice about introducing help buttons with text appears with a MUST badge at `references/components/buttons.md:144`.

**Impact:** the workflow gives stronger authority to a compiler classification than its disclaimer supports. Existing trace checks establish consistency with the classifier's vocabulary; they do not establish that Apple made a normative requirement.

**Refinement:** separate wording strength from normative status. For Apple, use wording labels or explicitly instruct the agent to establish authority from the source before alleging a requirement violation. Preserve legitimate prohibitions and the complete source text. WCAG's criterion/level model should remain source-specific.

**Acceptance:** a recommendation is not reported as a formal requirement merely because of its generated badge. An explicit prohibition still produces an appropriately supported finding. This needs an application-level check, not another regex matching the classifier's own vocabulary.

### A5 · P2 · The extracted entry files stop at lookup and citation

**Evidence:** the five generated steps in `src/compose/index.ts:340` establish the target, locate a topic, read a rule, apply its label, and cite it. They do not require inspecting the existing component/theme, distinguishing screenshots from runtime evidence, implementing the change, or checking affected states.

The authored Apple/Material guides already address these gaps. The established design skills also connect intent to implementation and critique. This matters because the generated descriptions advertise both building and reviewing interfaces.

**Refinement:** add a short, original workflow around the extracted reference layer:

- Identify the requested change, platform/version, framework, and existing component conventions.
- For implementation: resolve the design decision, implement within that context, then inspect relevant visual and interactive states.
- For review: connect an observed defect and affected code/control to source scope and exceptions; propose a fix and a verification step.
- Mark runtime-only checks as unverified when only code or screenshots are available.

Keep these steps authored and distinct from upstream rules. Do not add a universal landing-page recipe or mandatory decorative motion.

**Acceptance:** evaluate a build task and a review task. Include a small visible icon inside a sufficiently large hit region, and a framework component whose relevant behavior is inherited. A correct result inspects those relationships and avoids unsupported findings. No fresh model-based evaluation was run in this audit.

### A6 · P2 · Routing can consume substantial context before a concrete decision

**Evidence:** Apple's entry is only 74 lines but 18,162 characters, approximately **4,540 tokens** using the repository's four-characters-per-token estimate. Its split index still repeats all 158 topic links in dense category paragraphs (`src/compose/index.ts:416`). The first routing row recommends five files for any iOS/iPadOS screen review; reading those whole files adds approximately **28,133 tokens**, excluding split table companions.

Some individual references are large: Widgets is approximately 14,392 tokens and Wallet 13,496. Existing contents lists help navigation, so these sizes are not automatically defects or measured model failures. The entry's instruction to read the topic file makes the cost avoidable for narrow tasks.

**Refinement:** route first by the actual decision and platform; describe foundation files as conditional checks. Use heading/search navigation before loading a long topic in full, then read the complete relevant rule and attached context. Keep all topics discoverable through the index. Compare retrieval quality before removing direct links—blindly shrinking the entry could make uncommon topics harder to find.

**Acceptance:** measure bytes/tokens read and successful retrieval for narrow controls, broad screens, and uncommon topics. Set the budget from those results. Preserve exceptions, platform scope, and out-of-route discoverability while reducing unnecessary reads.

### A7 · P2 · Verification claims extend beyond what the checks measure

**Evidence:** `src/e2e/fidelity.ts:60` starts from normalized Markdown. It skips absent reference pages, headings, table rows, figure lines, and sentences shorter than six words. It also checks sentence presence anywhere in the corresponding page, not attachment to the correct rule. The file's comment claims misattributed sentences are detected; page-wide `includes()` cannot establish that.

The README already acknowledges the normalization boundary. The confirmed media omissions in A1 show why this limitation needs a complementary check. A passing fidelity result means eligible normalized sentences survive, not that all original-source content survives.

The agent scorer also counts known cue matches and citation-shaped strings (`src/agenteval/score.ts:137` and `:148`). It cannot establish that every finding is supported, and its seeded decoys do not enumerate every possible false positive. This is already described as preliminary in the README; keep that qualification.

**Refinement:** add raw-content coverage with explicit exclusions, structural checks for ownership/order, and required-page/dependency checks. Keep sentence fidelity as one distinct metric. Add behavioral evaluation for the specific failure cases above, with the same evidence requirements in comparison arms and evaluation of unseeded claims.

**Acceptance:** negative probes must fail when a required caption, media marker, table value, reference page, or dependency is removed, and when an exception moves to the wrong rule. A fabricated finding with a valid-looking citation must not receive evidence-quality credit. These are proposed checks, not checks completed by this audit.

## What passed and should be preserved

| Check executed against current artifacts | Result |
| --- | --- |
| `bun run validate` for all five sources | 0 errors and 0 warnings for each |
| `bun run eval apple-hig` | 13/13 |
| `bun run eval wcag22` | 10/10 |
| `bun run eval apple-design` and `material-3` | 2/2 each |
| `bun run eval lumen-ds` | 9/9 |
| `bun run fidelity` | 10,883 Apple and 625 WCAG eligible normalized sentences retained |
| `bun run trace` | 19/19 artifact checks |
| Authored input/output comparison | All six Markdown files byte-identical between `guidance/` and `skills/` |
| Direct calls to the DocC normalizer | Confirmed empty block-video output and omitted occurrence caption |

The fidelity command skipped the authored guides and Lumen because the expected normalized-cache/IR inputs were absent; those skips are not passes. The full `bun run check` suite and fresh model evaluations were not run for this documentation-only audit.

Preserve source ordering, stable IDs, contextual exception blocks, platform tags, glossary structure, local references, and honest visual placeholders. Existing trace checks provide useful regression protection for these behaviors; the new findings concern gaps outside that protection.

## Recommended implementation order

1. **Restore source meaning:** A1 media/captions; A2 normative/informative distinction; A3 dependencies. Add a reproducer for each before changing the compiler.
2. **Improve application:** A4 authority model and A5 authored task workflow. Reuse the strengths of the public guides without duplicating their entire text.
3. **Measure retrieval and behavior:** A6 routing experiments and A7 complementary verification. Do not claim an improvement in agent decisions until evaluated.

Change the manifests, normalizers, extractors, or composer responsible for a defect, then regenerate output; editing generated Markdown alone will not persist. Rebuild public authored output only if its authored inputs change. Follow the existing cache-version/fingerprint and synthetic-example requirements for compiler changes.

## Remaining uncertainties

- WCAG extraction is pinned to a repository commit while citations point at the published Recommendation. The live Recommendation identifies a different publication date from the repository-derived version. This audit does not establish a text mismatch across every criterion. Record source edition/revision distinctly and compare published text before claiming edition equivalence.
- Apple figures were inspected through source structure, alternatives, and captions; a full visual review of all assets was not performed.
- Material's authored guide was checked for workflow quality, local packaging, and a readable official implementation source. Its full remote link graph and every platform's current APIs were not verified.
- Older audit documents were intentionally removed in the current repository history. This is a new snapshot, not a restoration or a claim that previous resolutions remain complete. README links to those removed documents still need a separate documentation decision.

## Reproduction anchors

Commands above run from the repository root. Raw snapshots remain local; these hashes identify two representative inputs without copying guideline prose into this report:

| Raw file | SHA-256 |
| --- | --- |
| `.cache/apple-hig/raw/pointing-devices.json` | `06001b6feb8b9ab4544eca1cd4e98adaf125ba9d79475b6039887efa7e934f40` |
| `.cache/wcag22/raw/adaptable.html` | `09c0512914261d517d748c967486d3a3eec6f59c5ebddfc46af347ef29a45356` |

Minimal read-only reproduction of the block-video loss:

```sh
bun -e '
import { readFileSync } from "node:fs";
import { blocksToMarkdown } from "./src/normalize/docc.ts";
const doc = JSON.parse(readFileSync(".cache/apple-hig/raw/pointing-devices.json", "utf8"));
const node = doc.primaryContentSections[0].content[17];
console.log({
  type: node.type,
  identifier: node.identifier,
  altCharacters: doc.references[node.identifier].alt.length,
  rendered: blocksToMarkdown([node], doc.references)
});
'
```

Observed: `type: video`, `identifier: text-entry-pointer.mp4`, `altCharacters: 350`, and an empty `rendered` string. Re-run against the recorded snapshot; source positions can change after a new crawl.
