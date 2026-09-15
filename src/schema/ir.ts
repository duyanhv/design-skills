import { z } from "zod";

/**
 * Cap on one verbatim block of context. It exists so a pathological page cannot produce an
 * unbounded record, not to summarise: at 1,000 characters it cut WCAG's "accessibility supported"
 * definition mid-clause, dropping two of the four conditions that make a technology qualify
 * (AUDIT-OUTPUT finding 8). A truncated requirement reads as a complete one, which is the worst
 * possible failure for a rulebook, so the cap sits well above the longest real block instead.
 */
export const MAX_BLOCK = 4000;

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
  /**
   * Position in the source document, shared by rules, terms, section prose and tables on one page.
   * References render by it so the reader sees the source's own sequence — a definition list before
   * the rules that use it, a table before the rule that says "use the sizes below".
   * Optional so IR written by an earlier extractor still parses; compose falls back to array order.
   */
  order: z.number().int().nonnegative().optional(),
  /** Platforms the rule applies to. Read together with `scope` — never on its own. */
  platforms: z.array(z.string()).default([]),
  /**
   * Why `platforms` holds what it holds:
   *   "section" — a platform-named heading scoped it ("### macOS")
   *   "page"    — the whole page is about that platform ("Designing for visionOS")
   *   "general" — the source states it without platform scope, so it applies to all platforms it covers
   * Only "general" means universal. An empty `platforms` with any other scope is a bug, not a licence
   * to apply tvOS guidance to an iPhone.
   */
  scope: z.enum(["section", "page", "general"]).default("general"),
  /**
   * "rule": an imperative guideline. "term": a bold label + description (e.g. "Long delay." or
   * "San Francisco (SF)") that carries facts but no instruction; kept for reference, excluded from counts.
   */
  kind: z.enum(["rule", "term"]).default("rule"),
  /** Heuristic from the statement's wording — see extract/severity.ts. */
  severity: z.enum(["must", "should", "may"]),
  /**
   * Formal conformance level where the source defines one (WCAG A/AA/AAA). Independent of
   * `severity`: whether the rule binds you depends on the conformance target you claim.
   */
  conformance_level: z.enum(["A", "AA", "AAA"]).optional(),
  /** The guideline's lead sentence, verbatim. */
  statement: z.string().min(2).max(600),
  /** The explanatory text that follows the lead sentence, verbatim. */
  rationale: z.string().max(4000).optional(),
  /**
   * Blocks that qualify the rule and follow it in the source: exceptions, platform caveats,
   * supporting bullets, notes. Verbatim and in document order — a rule is often wrong without them.
   */
  notes: z.array(z.string().max(MAX_BLOCK)).default([]),
  /** First concrete figure with a unit found in the rule, e.g. "at least 44x44 pt". */
  value: z.string().max(80).optional(),
  provenance: ProvenanceSchema,
});

/** A markdown table found under a guidance section — specs, sizes, margins. Kept verbatim. */
export const TableSchema = z.object({
  section: z.string(),
  anchor: z.string().optional(),
  order: z.number().int().nonnegative().optional(),
  /** Text immediately preceding the table (a tab label or intro sentence), if any. */
  caption: z.string().max(200).optional(),
  markdown: z.string(),
});
export type Table = z.infer<typeof TableSchema>;

/** Prose that frames a section's rules (definitions, when-to-use), kept verbatim. */
export const SectionSchema = z.object({
  section: z.string(),
  anchor: z.string().optional(),
  order: z.number().int().nonnegative().optional(),
  platforms: z.array(z.string()).default([]),
  intro: z.array(z.string().max(MAX_BLOCK)).default([]),
});
export type Section = z.infer<typeof SectionSchema>;

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
  /**
   * Hash of every semantic input to extraction: page body, extractor id, and the manifest settings
   * that change the output (skip_sections, platforms, title, category, url). Reuse is keyed on this,
   * so a configuration-only change still re-extracts.
   */
  input_hash: z.string().length(16).optional(),
  /** The page abstract. */
  summary: z.string().max(1000),
  /** Paragraphs after the abstract and before the first heading: what this topic is, when to use it. */
  overview: z.array(z.string().max(MAX_BLOCK)).default([]),
  /** Platforms the page as a whole is about, when it is platform-specific. */
  platforms: z.array(z.string()).default([]),
  sections: z.array(SectionSchema).default([]),
  rules: z.array(RuleSchema),
  tables: z.array(TableSchema).default([]),
});

export type Rule = z.infer<typeof RuleSchema>;
export type PageIR = z.infer<typeof PageIRSchema>;
