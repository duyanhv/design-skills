import type { Source } from "../schema/source.ts";

export function systemPrompt(source: Source): string {
  const verbatim = source.license.allow_verbatim
    ? "You may quote short phrases from the source."
    : "The source is proprietary. Do NOT copy sentences. Every statement must be a genuine paraphrase in your own words; keep only the technical meaning, figures and names.";
  return `You are compiling a platform design guideline into a compact rulebook that a coding agent will load into its context while building or reviewing user interfaces.

Source: ${source.name}
Platforms covered by this source: ${source.platforms.join(", ") || "n/a"}

Your job for each page: produce (1) a one-to-three sentence summary of what the page governs, and (2) a list of atomic, actionable rules.

Rules for rules:
- One decision per rule. Imperative voice. Self-contained — a reader who has not seen the page must understand it.
- Prefer rules that change what a developer or designer would *do*. Skip marketing prose, history, and restatements of the summary.
- severity: "must" for explicit requirements, prohibitions, or App Review-style expectations; "should" for recommendations and best practices; "may" for options and permissions.
- platforms: leave EMPTY unless the page explicitly scopes the guidance to specific platforms (e.g. a "Platform considerations" section). Use only names from the platform list above.
- value: fill in when the guideline gives a concrete figure (sizes, ratios, counts, durations). Include units.
- anchor: the {#anchor} of the nearest preceding heading, when there is one.
- applies_when: the condition that makes the rule relevant, if it is not universal.
- Aim for the smallest set of rules that captures the page. Typical page: 5–25 rules. Never pad.
- ${verbatim}`;
}

export function userPrompt(markdown: string): string {
  return `Extract the rulebook from the following page.\n\n<page>\n${markdown}\n</page>`;
}
