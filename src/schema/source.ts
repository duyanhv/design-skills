import { z } from "zod";

export const LicenseSchema = z.object({
  spdx: z.string(),
  /**
   * Whether the guideline's text may be redistributed. When false, `ir/<id>` and `skills/<name>`
   * must be git-ignored (validate checks this) and users build the skill locally.
   */
  redistributable: z.boolean(),
  attribution: z.string(),
});

export const SourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  /** docc: Apple DocC JSON sites · wcag: the w3c/wcag guidelines source tree · html: generic (todo) */
  kind: z.enum(["docc", "wcag", "html"]),
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
  skill: z.object({
    name: z.string(),
    description: z.string(),
    max_skill_lines: z.number().int().positive().default(300),
    top_rules_per_topic: z.number().int().positive().default(1),
    /** Label for the text that follows a rule's statement in reference files. */
    rationale_label: z.string().default("Why"),
    /** Include the "Highest-leverage rules" section in SKILL.md. */
    highlights: z.boolean().default(true),
    /** "pages": one index row per page. "rules": one row per rule (good for small sources like WCAG). */
    index: z.enum(["pages", "rules"]).default("pages"),
    /** Curated routing hints: task keywords → pages to read. Rendered as a "Where to look" table. */
    routing: z.array(z.object({ when: z.string(), read: z.array(z.string()) })).default([]),
    /** Free-form markdown appended to the "How to use" section (e.g. how severities map to levels). */
    notes: z.string().optional(),
    /** Tables larger than this (chars) are moved to <page>.tables.md so the rulebook stays small. */
    split_tables_over: z.number().int().positive().default(6000),
  }),
});

export type Source = z.infer<typeof SourceSchema>;
