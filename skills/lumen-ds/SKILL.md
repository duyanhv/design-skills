---
name: lumen-ds
description: "Lumen Design System as actionable rules with citations — a synthetic example showing what design-skills generates. Use when you want to see the output format, not for real design work."
license: "Lumen Design System — a synthetic example guideline, part of design-skills (MIT)."
metadata:
  source: "lumen-ds"
  source_version: "2026-03-04"
  fetched_at: "2026-03-04T00:00:00.000Z"
  rules: "10"
  generated_by: "design-skills"
---

# Lumen Design System

Compiled rulebook: 10 rules across 3 pages, each cited back to the source. Statements are the guideline's own sentences; follow the citation for visuals and surrounding context.

## How to use this skill

1. **Establish the target** — which of web, desktop, mobile, tv the work is for. A rule tagged for another platform does not apply.
2. **Find the topic** in **Where to look** or the **Index**, and read that file under `references/`. It holds every rule for the topic with its reasoning, exceptions and a citation. Large spec tables live in a sibling `<topic>.tables.md`.
3. **Read the whole rule** — the statement, its `Why` line, and the indented notes under it. Exceptions and caveats appear in either; a statement applied without them is frequently wrong.
4. **Apply** **MUST** as the source's firmest wording (a prohibition or an absolute), **SHOULD** as its recommending voice, **MAY** as wording that offers an option.
5. **Report evidence** — quote the rule, its id, and its link, so any finding can be checked against the source.

Rules are Lumen Design System's own sentences. The badge is this compiler's reading of Lumen Design System's wording, not a status Lumen Design System declared. Before reporting anything as a requirement violation, check the cited text: quote the prohibition or absolute it rests on. If the source is advising rather than ruling something out, report it as Lumen Design System's recommendation. Text marked `_[figure: …]_` stands for an image that carries information the text does not.

## Working method

_Written for this skill, not by Lumen Design System. The cited rules below are the source's._

- **Before deciding** — name the change, the platform and version it is for, the framework in use, and how this codebase already builds this kind of element. A shared component or theme is usually the thing to change; a local override that contradicts it is a new defect.
- **Building** — settle the decision against the rule you read, implement it in that existing context, then inspect the states the change can reach: default, pressed/focused, disabled, empty and error, and the smallest and largest text/size the layout allows.
- **Reviewing** — for each observed defect name the code or control that produces it, confirm the rule's scope and exceptions cover that case, and check what the framework already supplies: behaviour inherited from a standard component, or a hit region larger than the glyph drawn inside it, is not a defect. Give the fix and the check that would show it worked.
- **Evidence** — say how you know. Code and screenshots show structure and appearance; behaviour over time (focus order, assistive-technology output, motion, text scaling) needs a run. Mark what you could not run as unverified instead of asserting it.

**Platform tags.** `_[web]_` means the rule comes from a web-specific section. `_[desktop only]_` means the whole page is desktop-specific. An untagged rule is stated by the source without platform scope. Never carry a tagged rule to a platform it is not tagged for.

## Where to look

| When the task involves… | Read |
| --- | --- |
| buttons, actions, destructive flows | [Buttons](references/components/buttons.md) |
| color, contrast, accessibility | [Color](references/foundations/color.md) |
| tv, remote navigation, focus | [Designing for tv](references/getting-started/designing-for-tv.md) |

## Index

| Category | Topic | Rules | Reference |
| --- | --- | --- | --- |
| Getting Started | Designing for tv | 4 | [designing-for-tv.md](references/getting-started/designing-for-tv.md) |
| Foundations | Color | 2 | [color.md](references/foundations/color.md) |
| Components | Buttons | 4 | [buttons.md](references/components/buttons.md) |
