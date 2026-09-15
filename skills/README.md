# Generated skills

This is the Git-tracked output folder. A published skill contains `SKILL.md`, its Markdown reference files, and `provenance.json`. Install the whole skill directory so its links keep working.

| Source | Output | Public output |
| --- | --- | --- |
| Lumen Design System | [lumen-ds/SKILL.md](lumen-ds/SKILL.md) | Synthetic MIT-licensed example |
| Apple HIG | `apple-hig/` | Built locally; excluded by its source manifest |
| WCAG 2.2 | `wcag22/` | Built locally; excluded by its source manifest |

From the repository root, run:

```sh
bun run publish:skills
```

The script selects sources marked `license.redistributable: true`, builds and validates them, commits changed files in `skills/<name>/` and the matching `ir/<id>/`, and pushes to `origin` on your current branch. The IR accompanies the Markdown so generated artifacts and source provenance stay consistent. No commit is created when the output is unchanged.

To publish a particular eligible source, or commit locally before pushing:

```sh
bun run publish:skills lumen-ds
bun run publish:skills lumen-ds --no-push
```

Start with a clean working tree and a configured `origin`. A failed build or validation stops before commit/push; generated changes remain available for inspection. A rejected push leaves the local commit intact. This command does not force-push.

Apple HIG and WCAG currently have `license.redistributable: false`. Explicitly selecting either reports that restriction instead of uploading its text. Build them for local use with `bun run build apple-hig` or `bun run build wcag22`. See [the source/output policy](../LICENSING.md).
