import { z } from "zod";

export const LicenseSchema = z.object({
  spdx: z.string(),
  /** If false, normalized text is never committed and extract must paraphrase. */
  allow_verbatim: z.boolean().default(false),
  attribution: z.string(),
});

export const SourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  kind: z.enum(["docc", "html"]),
  base_url: z.string().url(),
  entry: z.string().startsWith("/"),
  data_prefix: z.string().startsWith("/").optional(),
  cadence: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  license: LicenseSchema,
  platforms: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  skill: z.object({
    name: z.string(),
    description: z.string(),
    max_skill_lines: z.number().int().positive().default(300),
    top_rules_per_topic: z.number().int().positive().default(1),
  }),
});

export type Source = z.infer<typeof SourceSchema>;
