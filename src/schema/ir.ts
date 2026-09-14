import { z } from "zod";

/** Where a rule came from. Every rule must be traceable to a page + section. */
export const ProvenanceSchema = z.object({
  url: z.string().url(),
  anchor: z.string().optional(),
  source_hash: z.string().length(16),
  fetched_at: z.string().datetime(),
});

export const RuleSchema = z.object({
  /** `${source}/${page}/${nnn}` — stable across regenerations when the statement survives. */
  id: z.string(),
  page: z.string(),
  category: z.string(),
  topic: z.string(),
  /** Empty array = applies to every platform the source covers. */
  platforms: z.array(z.string()).default([]),
  severity: z.enum(["must", "should", "may"]),
  /** Imperative, self-contained, paraphrased. */
  statement: z.string().min(10).max(320),
  rationale: z.string().max(400).optional(),
  applies_when: z.string().max(200).optional(),
  /** Concrete figure when the guideline gives one, e.g. "44x44 pt", "≥ 4.5:1". */
  value: z.string().max(80).optional(),
  provenance: ProvenanceSchema,
});

export const PageIRSchema = z.object({
  source: z.string(),
  page: z.string(),
  title: z.string(),
  category: z.string(),
  url: z.string().url(),
  source_hash: z.string().length(16),
  fetched_at: z.string().datetime(),
  extracted_at: z.string().datetime(),
  model: z.string(),
  summary: z.string().max(600),
  rules: z.array(RuleSchema),
});

export type Rule = z.infer<typeof RuleSchema>;
export type PageIR = z.infer<typeof PageIRSchema>;

/** What the extract step asks the model to produce (provenance/ids are filled in by us). */
export const ExtractOutputSchema = z.object({
  summary: z.string().max(600),
  rules: z.array(
    z.object({
      anchor: z.string().optional(),
      platforms: z.array(z.string()).default([]),
      severity: z.enum(["must", "should", "may"]),
      statement: z.string().min(10).max(320),
      rationale: z.string().max(400).optional(),
      applies_when: z.string().max(200).optional(),
      value: z.string().max(80).optional(),
    }),
  ),
});
export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;
