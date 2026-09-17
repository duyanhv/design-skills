import { z } from "zod";

export const LicenseSchema = z.strictObject({
  spdx: z.string(),
  /**
   * Whether the guideline's text may be redistributed. When false, `ir/<id>` and `skills/<name>`
   * must be git-ignored (validate checks this) and users build the skill locally.
   */
  redistributable: z.boolean(),
  attribution: z.string(),
});

/**
 * Strict on purpose: an unknown key is an error, not something to ignore.
 *
 * Zod objects pass unknown keys through by default, and that default hid a real defect. Typing
 * `max_skill_line` instead of `max_skill_lines` parsed cleanly, silently fell back to the default
 * of 300, and doubled the entry-file budget. A 161-line SKILL.md that the real limit rejects then
 * built without complaint. One character, no diagnostic, a constraint quietly gone.
 *
 * Every misspelling of an optional key is that same bug. Strict parsing turns the whole class into
 * a parse error naming the key, which is the difference between a setting you can rely on and one
 * that happens to work.
 */
export const SourceSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  /** docc: Apple DocC · wcag: W3C source tree · html: generic (todo) · authored: original local Markdown */
  kind: z.enum(["docc", "wcag", "html", "authored"]),
  /** Where the fetcher reads from. */
  base_url: z.string().url(),
  entry: z.string().startsWith("/"),
  data_prefix: z.string().startsWith("/").optional(),
  /** Where citations point, when different from base_url (e.g. fetched from GitHub, cited at w3.org). */
  canonical_url: z.string().url().optional(),
  cadence: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  /**
   * This source has no upstream to crawl; its raw pages are produced locally (see `src/e2e`).
   * `fetch` and `build` skip it, so `bun run build` over all sources does not try the network.
   */
  synthetic: z.boolean().default(false),
  license: LicenseSchema,
  platforms: z.array(z.string()).default([]),
  /**
   * Page slug → platforms the page is about, for pages whose title does not say so
   * ("Siri" is tvOS/watchOS/iOS, "Digital Crown" is watchOS). Overrides title detection and is
   * inherited by every rule on the page that no narrower section scopes.
   */
  page_platforms: z.record(z.string(), z.array(z.string())).default({}),
  categories: z.array(z.string()).default([]),
  /** Section headings whose content is navigation/meta, not guidance. */
  skip_sections: z.array(z.string()).default([]),
  skill: z.strictObject({
    name: z.string(),
    description: z.string(),
    max_skill_lines: z.number().int().positive().default(300),
    /** Label for the text that follows a rule's statement in reference files. */
    rationale_label: z.string().default("Why"),
    /**
     * Where the severity badge's authority comes from, per source.
     *
     * - `wording` — the badge reports how strongly the source *worded* a sentence, classified by
     *   `src/extract/severity.ts`. It is this compiler's reading, so the entry file must not tell an
     *   agent to enforce a MUST badge as a declared requirement (AUDIT finding A4).
     * - `declared` — the source itself declares normative status (WCAG success criteria are
     *   normative text, and `src/extract/wcag.ts` assigns `must` directly rather than by wording).
     *
     * Left unset, it falls back to `declared` when the source's rules carry a declared conformance
     * level and `wording` otherwise — a property of the source's own data, not a source id.
     */
    authority: z.enum(["wording", "declared"]).optional(),
    /**
     * Removed: a "Highest-leverage rules" section used to pick one rule per topic, ranked partly by
     * how short the sentence was. No guideline states which of its rules matter most, so any such
     * ranking is the compiler's opinion presented in the source's voice — exactly what this project
     * exists to avoid. The routing table sends the reader to the right rulebook without inventing a
     * hierarchy. Manifests may still carry `highlights:`; it is ignored.
     */
    highlights: z.boolean().optional(),
    /** "pages": one index row per page. "rules": one row per rule (good for small sources like WCAG). */
    index: z.enum(["pages", "rules"]).default("pages"),
    /** Curated routing hints: task keywords → pages to read. Rendered as a "Where to look" table. */
    routing: z.array(z.strictObject({ when: z.string(), read: z.array(z.string()) })).default([]),
    /** Free-form markdown appended to the "How to use" section (e.g. how severities map to levels). */
    notes: z.string().optional(),
    /** Tables larger than this (chars) are moved to <page>.tables.md so the rulebook stays small. */
    split_tables_over: z.number().int().positive().default(6000),
    /**
     * When the full index exceeds this many characters it moves to `index.md`, leaving SKILL.md with
     * routing plus a per-category summary. The entry file is loaded on every activation, and the
     * Agent Skills spec suggests keeping that under ~5k tokens; a 158-row table blows the budget on
     * its own without helping the agent choose.
     */
    split_index_over: z.number().int().positive().default(6000),
  }),
});

export type Source = z.infer<typeof SourceSchema>;
