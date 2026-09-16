# Contributing

The most useful contributions are **new source manifests** and **eval questions**. Both are small,
self-contained, and reviewable.

```sh
bun install
bun run check     # typecheck · unit tests · end-to-end build · manifest validation
bun run example   # rebuild the committed synthetic example
```

`bun run check` is what CI runs. If it passes locally it should pass there.

## Extracted guideline rules

**The compiler must never say something the source did not.** Everything else here follows from it:

- Statements are the guideline's own sentences, copied, not paraphrased.
- A rule's exceptions travel with it. A statement quoted without its caveats is a different rule.
- Platform scope comes from the source, and an unscoped rule is not the same as a universal one.
- Severity reports the source's *wording*. It is not a claim about what the source requires.
- If the source puts information in a picture, say so (`_[figure: …]_`) rather than dropping it.
- Nothing ranks rules by importance. No guideline states which of its rules matter most, so any
  ranking would be our opinion printed in the source's voice.

When in doubt, preserve more and mark it clearly. A rule that is visibly incomplete is recoverable; a
rule that is silently wrong is not.

## Adding an original guide

Use `kind: authored` for original workflow instructions, with redistributable MIT text. Put the
entry file and linked Markdown references in `guidance/<source-id>/`; use the existing guides as
examples. Declare `metadata.authorship: original`, link official sources, and distinguish your
review method from upstream requirements. Do not paste a guideline corpus into this path.

`bun run build <id>` validates the entry file and local reference graph, copies the Markdown,
and records deterministic hashes and source URLs. There is no extraction or IR. Rebuild changed
guides and commit both input and output. Smoke assertions check selected content; they do not
prove that an agent reads or correctly applies external guidance.

## Adding an extracted source

1. **Write the manifest.** Copy `sources/apple-hig.yaml`. Set `license.redistributable` honestly. If
   it is false, add `ir/<id>/` and `skills/<name>/` to `.gitignore`; `validate` checks this against
   git's real behaviour (`check-ignore` and `ls-files`), not the text of the file.

2. **Add an adapter if the site is not already supported.** Two functions, both pure and testable:

   | Stage | Where | Contract |
   | --- | --- | --- |
   | fetch | `src/fetch/<kind>.ts` | Crawl → `.cache/<id>/raw`, write a `Manifest`. Record every failure in `manifest.failed` and set `manifest.partial`; never let a missing page look like a deleted one. Pin to an immutable revision if the source has one. |
   | normalize | `src/normalize/<kind>.ts` | Raw → markdown in the shape the extractor reads. Deterministic, no network. Degrade unknown constructs to their text rather than throwing. |

   Then wire the `kind` into `src/fetch/index.ts`, `src/normalize/index.ts`, and the `kind` enum in
   `src/schema/source.ts`.

   Most sources will not need a new *extractor*. `bold-lead` handles any guideline that writes rules
   as a bold lead sentence plus explanation. If yours does not, add one under `src/extract/` and
   register it in `extractorFor()`. Bump the extractor's version string when you change its
   behaviour — it is stamped into every IR file so old output is identifiable, and changing it
   re-extracts everything as a reviewable diff.

3. **Add fixtures.** A test fixture for each *shape* the source uses, especially the awkward ones:
   list items written without paragraph tags, mixed inline and block content, tables with image-only
   cells, notes that carry exceptions. The bugs this project has had were all of that kind.

4. **Add evals** in `evals/<id>/questions.yaml`. Prefer `rule:` assertions over `expect:` substrings:

   ```yaml
   - q: What is the minimum contrast ratio for normal text at Level AA, and what is exempt?
     source: distinguishable
     rule:
       statement_contains: contrast ratio of at least 4.5:1
       conformance_level: AA
       anchor: contrast-minimum
       context_contains: ["Large Text", "Incidental", "Logotypes"]
   ```

   A substring check passes happily while a criterion loses the exception list that made it
   satisfiable — that is a bug this project actually shipped. **Verify each eval by breaking the
   thing it guards and confirming it fails.** An eval that has never failed is a guess.

5. **Build and open a PR.** `bun run build <id>`, then `bun run check`.

## Adding a check

Checks over the *shipped artifacts* live in one file per subject under `src/e2e/probes/`, exporting
`CHECKS` (the requirement, asserted against `ir/` and `skills/` as they stand) and `CASES` (the
defects that must trip them), both typed by `probes/types.ts`:

```ts
import type { Case, Check } from "./types.ts";
export const CHECKS: Check[] = [{ finding: "A1", requirement: "…", observe: async () => "what was seen" }];
export const CASES: Case[] = [{ finding: "A1", name: "…", break: async (dir) => {/* corrupt a scratch copy */} }];
```

`trace` and `trace-negative` discover the directory, so nothing has to be registered. Discovery is
deliberate: a hand-written list is the thing that let a requirement table name checks that did not
exist. A `CASES` entry whose `finding` no check asserts is an error rather than a permanent silent
pass, so a check and its defect ship together or not at all.

Return an *observation*, not a boolean. `observed: 1322/1536 rendered, 214 excused` survives a
refactor that quietly stops matching; `true` does not. Say where a check is partial in its own
output, so a passing report cannot be read as more than it measured.

## Changing the compiler

Anything that changes generated output has to show its work:

- Rebuild the committed example (`bun run example`) in the same PR. CI fails if it drifts.
- Rebuilding unchanged input must stay byte-identical. If your change makes timestamps or ordering
  move, that is a bug in the change, not a fact of life.
- Rebuilding from *scratch* must also be byte-identical: delete `ir/<id>`, re-extract, recompose,
  and nothing may change — including rule ids. Ids are what an agent quotes and a reviewer checks
  against the source, so an id that moves when nothing moved makes a cited finding unverifiable.
  `trace O-11` asserts this, and it exists because ids used to drift on every build.
- If you touch extraction, bump the extractor version. Reuse is keyed on a hash of `src/extract/`
  as well, so a forgotten bump no longer silently reuses stale IR — but the version is still what
  tells a reader which heuristic produced a given IR file.
- If you touch `src/agenteval/score.ts`, add a test. It decides every number the project reports
  about agent behaviour, and three separate bugs in it have already flattered the results.

## Prove it fails

The rule stated for evals above applies to everything in this repo that checks something:

> A check that has never been seen to fail is a guess.

It reads the artifacts and reports what it finds, so a check whose regex stopped matching, whose
fixture text moved, or that never covered the case at all looks exactly like a clean build. This is
not hypothetical — it is how most of this project's real defects were found:

- `src/e2e/validate-negative.ts` corrupts a real build, one defect at a time, and asserts `validate`
  reports each. 22 guards.
- `src/e2e/trace-negative.ts` does the same for `trace`, reintroducing 60 defects the project has
  actually shipped and asserting the named requirement fails. Two of those probes caught a *guard*
  that was too weak rather than a regression: one searched the whole of `SKILL.md` when it should
  have searched the index, and one accepted a state the bug it guarded actually produces.

A check that counts what the *output* contains can only find what someone thought to look for. The
strongest checks here start from the raw source and require every occurrence to be accounted for:
`src/e2e/probes/apple-media.ts` does it for figures and `prose-coverage.ts` for sentences. Balancing
those counts is what exposed three figure-deleting defects that fidelity, evals, validate and every
trace check passed straight over. When you can count the input, count the input.

Balance the count with *enumerated* exclusions, never a threshold. Each excuse must name a property
of the source or the manifest ("declared skip_section", "page header art"), so that adding one is a
visible claim someone can argue with. An excuse that quietly absorbs a defect is worse than no check:
`prose-coverage.ts` shipped with a "figure caption" exemption that was hiding twelve lost captions,
and it was only caught by deleting captions and watching the count move from *found* to *excused*
while the check stayed green.

So: when you add a check, add the defect alongside it. And when you claim a fix is guarded, test the
claim the only way that settles it — revert the fix, run the check, watch it fail, restore. A
requirement-to-check table is itself a claim; two rows of one such table once named guards that did
not exist, and reverting the fix was what exposed them. A fix whose check still passes when you
revert it is not guarded, however correct it is: say so and move on, rather than counting it. One
fix was recorded that way until a later check could see it, at which point it got a real probe and
the disclaimer was withdrawn.

## Running the agent evaluation

`bun run agenteval` costs model calls and is not part of `bun run check` or CI. It needs the `claude`
CLI on `PATH` and the relevant skill built locally.

```sh
bun run agenteval --runs 3            # three samples per arm, reported as ranges
bun run agenteval --task ios-buttons  # one task
bun run agenteval --rescore           # re-score saved transcripts, no model calls
```

Use `--rescore` when fixing the scorer, and read the transcripts before believing a number. Every
scoring bug found so far was caught by reading a transcript that disagreed with its score, and in one
case the eval was wrong and the agent was right.
