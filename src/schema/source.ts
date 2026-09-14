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
  license: LicenseSchema,
  platforms: z.array(z.string()).default([]),
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
  }),
});

export type Source = z.infer<typeof SourceSchema>;
