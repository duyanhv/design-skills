import { z } from "zod";

/** Where a rule came from. Every rule must be traceable to a page + section. */
export const ProvenanceSchema = z.object({
  url: z.string().url(),
  anchor: z.string().optional(),
  source_hash: z.string().length(16),
  fetched_at: z.string().datetime(),
});

export const RuleSchema = z.object({
  /** `${source}/${page}/${nnn}` — stable across regenerations while the statement survives. */
  id: z.string(),
  page: z.string(),
  category: z.string(),
  topic: z.string(),
  /** Heading path the rule sits under, e.g. "Platform considerations › macOS › Push buttons". */
  section: z.string(),
  /** Empty array = applies to every platform the source covers. */
  platforms: z.array(z.string()).default([]),
  /**
   * "rule": an imperative guideline. "term": a bold label + description (e.g. "Long delay." or
   * "San Francisco (SF)") that carries facts but no instruction; kept for reference, excluded from counts.
   */
  kind: z.enum(["rule", "term"]).default("rule"),
  /** Heuristic from the statement's wording — see extract/severity.ts. */
  severity: z.enum(["must", "should", "may"]),
  /** The guideline's lead sentence, verbatim. */
  statement: z.string().min(2).max(400),
  /** The explanatory text that follows the lead sentence, verbatim. */
  rationale: z.string().max(2000).optional(),
  /** First concrete figure with a unit found in the rule, e.g. "at least 44x44 pt". */
  value: z.string().max(80).optional(),
  provenance: ProvenanceSchema,
});

/** A markdown table found under a guidance section — specs, sizes, margins. Kept verbatim. */
export const TableSchema = z.object({
  section: z.string(),
  anchor: z.string().optional(),
  /** Text immediately preceding the table (a tab label or intro sentence), if any. */
  caption: z.string().max(200).optional(),
  markdown: z.string(),
});
export type Table = z.infer<typeof TableSchema>;

export const PageIRSchema = z.object({
  source: z.string(),
  page: z.string(),
  title: z.string(),
  category: z.string(),
  url: z.string().url(),
  source_hash: z.string().length(16),
  fetched_at: z.string().datetime(),
  /** Latest date in the page's own change log, when it has one (YYYY-MM-DD). */
  source_version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  extracted_at: z.string().datetime(),
  /** Extractor implementation + version, so IR produced by older heuristics is identifiable. */
  extractor: z.string(),
  /** The page abstract. */
  summary: z.string().max(1000),
  rules: z.array(RuleSchema),
  tables: z.array(TableSchema).default([]),
});

export type Rule = z.infer<typeof RuleSchema>;
export type PageIR = z.infer<typeof PageIRSchema>;
