# Contributing

The most useful contributions are **new source manifests** and **eval questions**. Both are small,
self-contained, and reviewable.

```sh
bun install
bun run check     # typecheck · unit tests · end-to-end build · manifest validation
bun run example   # rebuild the committed synthetic example
```

`bun run check` is what CI runs. If it passes locally it should pass there.

## The one rule that matters

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

## Adding a source

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

## Changing the compiler

Anything that changes generated output has to show its work:

- Rebuild the committed example (`bun run example`) in the same PR. CI fails if it drifts.
- Rebuilding unchanged input must stay byte-identical. If your change makes timestamps or ordering
  move, that is a bug in the change, not a fact of life.
- If you touch extraction, bump the extractor version.
- If you touch `src/agenteval/score.ts`, add a test. It decides every number the project reports
  about agent behaviour, and three separate bugs in it have already flattered the results.

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
