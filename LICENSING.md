# Licensing of sources vs. output

This repository's **code** is MIT. The **guidelines it compiles** each have their own license, and
the pipeline is built so we never redistribute text we aren't allowed to.

| Situation | What gets committed |
| --- | --- |
| `license.redistributable: false` (e.g. Apple HIG) | **Nothing derived from the text.** `ir/<id>/` and `skills/<name>/` are git-ignored and `validate` fails if they aren't. Users run `bun run build <id>` and get the skill on their own machine, the same way they'd read the guideline in a browser. |
| `license.redistributable: true` (e.g. CC-BY, W3C) | `ir/` and `skills/` are committed and refreshed by CI. The attribution string from the manifest is embedded in every generated file. |

Extraction is structural, not generative: statements are the guideline's own lead sentences. That is why
outputs of proprietary sources are never committed here.

Every source manifest must declare `license.spdx`, `license.redistributable` and `license.attribution`.
If you are the rights holder of a guideline and want it removed, open an issue.
