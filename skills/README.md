# Published skills

This is the Git-tracked output folder: what an agent installs. A bundle contains `SKILL.md`, its
Markdown reference files, and `provenance.json`. Install the whole directory, because `SKILL.md`
links to the references beside it.

| Skill | Kind | Where it comes from | What it gives the agent |
| --- | --- | --- | --- |
| [apple-design](apple-design/SKILL.md) | Authored | [`guidance/apple-design/`](../guidance/apple-design/) | Original MIT workflow and a decision-to-page map for the Apple HIG. Apple's specifications are read at the linked pages, not bundled. |
| [material-3](material-3/SKILL.md) | Authored | [`guidance/material-3/`](../guidance/material-3/) | Original MIT workflow and per-platform source map for Material Design 3. Google's specifications are read at the linked pages, not bundled. |
| [lumen-ds](lumen-ds/SKILL.md) | Extracted | Synthetic fixture in `src/e2e/` | A complete extracted bundle — rule IDs, source text, citations, `index.md` — for an invented design system. Readable example and regression fixture, not guidance for a real platform. |
| `apple-hig/` | Extracted | Crawled from developer.apple.com | Not published. `bun run build apple-hig` writes it locally. |
| `wcag22/` | Extracted | Crawled from w3.org | Not published. `bun run build wcag22` writes it locally. |

## Authored and extracted bundles differ in what you may cite

An **authored** bundle is original writing that routes the agent to official documentation. It has
no rule catalogue and no upstream text, so a finding that cites a rule ID out of `apple-design` or
`material-3` is fabricated; those bundles ask for real URLs and section names instead.

An **extracted** bundle carries the source's own sentences with rule IDs, platform scope, inferred
or declared requirement strength, and citations, plus structured rules under `ir/<id>/`. Its text is
a derivative of the source, which is why publishing it depends on the source's license.

Apple HIG and WCAG 2.2 declare `license.redistributable: false`, so `ir/` and `skills/` for those
ids are git-ignored and `validate` fails if they are not. Selecting either in `publish:skills`
reports the restriction instead of uploading text. See [the source/output policy](../LICENSING.md).

## Publishing

From the repository root, on a clean working tree with a configured `origin`:

```sh
bun run publish:skills
```

The script selects sources marked `license.redistributable: true`, builds and validates them,
commits changed files in `skills/<name>/` and, for extracted sources, the matching `ir/<id>/`, and
pushes to `origin` on your current branch. Authored guides are copied from `guidance/<id>/` with
deterministic file hashes and source links; they contain no extracted IR or upstream corpus. No
commit is created when the output is unchanged.

To publish a particular eligible source, or commit locally before pushing:

```sh
bun run publish:skills apple-design material-3
bun run publish:skills apple-design material-3 --no-push
```

A failed build or validation stops before commit/push; generated changes remain available for
inspection. A rejected push leaves the local commit intact. This command does not force-push.
