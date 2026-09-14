# Licensing of sources vs. output

This repository's **code** is MIT. The **guidelines it compiles** each have their own license, and
the pipeline is built so we never redistribute text we aren't allowed to.

| Situation | What gets committed |
| --- | --- |
| `license.allow_verbatim: false` (e.g. Apple HIG) | Only `ir/` rules — paraphrased statements with citations — and the skills generated from them. Raw pages and normalized markdown stay in `.cache/` (git-ignored). `validate` fails if any rule shares an 8-word run with the source text. |
| `license.allow_verbatim: true` (e.g. CC-BY, W3C) | The same, plus short quotes may appear in rules. Attribution string from the manifest is embedded in every generated file. |

Every source manifest must declare `license.spdx`, `license.allow_verbatim` and `license.attribution`.
If you are the rights holder of a guideline and want it removed, open an issue.
