/**
 * Extractor for WCAG-shaped markdown (see normalize/wcag.ts): one success criterion per `##`,
 * a `**Level X**` line, then the normative text. One SC = one rule.
 *   section:   "1.4.3 Contrast (Minimum)"
 *   statement: the first normative paragraph (the criterion itself)
 *   rationale: what follows — exceptions, notes — flattened
 *   conformance_level: "A" | "AA" | "AAA" — the only authority WCAG actually defines
 *
 * Severity is deliberately *not* derived from the level. WCAG's conformance model
 * (https://www.w3.org/TR/WCAG22/#conformance-reqs) makes a criterion required or not depending on
 * the target a project claims: at Level AA, A and AA criteria are required and AAA are not; at
 * Level AAA all three are. Baking one target into the rule would misstate the source, so every
 * success criterion is a MUST *for the levels at or above it*, and the skill tells the reader to
 * select by target level.
 * An SC with no level (e.g. 4.1.1 Parsing, obsolete) is kept as a term.
 */
import type { ExtractedPage, ExtractedRule } from "./rules.ts";
import { ruleValue } from "./severity.ts";

export const WCAG_EXTRACTOR = "wcag-sc@5";

const HEADING = /^##\s+(.*?)(?:\s+\{#([^}]+)\})?\s*$/;
const LEVEL = /^\*\*Level (A{1,3})\*\*$/;

function strip(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`>]/g, "").replace(/\s+/g, " ").trim();
}

export function extractWcag(markdown: string): ExtractedPage {
  if (/^# Glossary$/m.test(markdown)) return extractGlossary(markdown);
  const rules: ExtractedRule[] = [];
  let summary = "";
  let cur: { title: string; anchor?: string; level?: string; text: string[]; obsolete: boolean } | null = null;

  const flush = () => {
    if (!cur) return;
    const level = cur.level;
    const paras = cur.text.map(strip).filter(Boolean);
    const isRule = !cur.obsolete && !!level;
    // statement = first normative paragraph; for a term (obsolete SC) the title itself
    let statement = isRule && paras[0] ? paras[0] : cur.title;
    let rest = isRule && paras[0] ? paras.slice(1) : paras;
    if (statement.length > 600) {
      rest = [statement, ...rest];
      statement = cur.title;
    }
    // Exceptions and notes stay as separate blocks: an SC without its exceptions is a different rule.
    const notes = rest.map((t) => t.slice(0, 1000));
    rules.push({
      kind: isRule ? "rule" : "term",
      section: cur.title,
      anchor: cur.anchor,
      order: rules.length,
      platforms: [],
      scope: "general",
      // Normative text; whether it applies to you is decided by the conformance target, not by us.
      severity: "must",
      conformance_level: level as "A" | "AA" | "AAA" | undefined,
      statement,
      rationale: undefined,
      notes,
      // A criterion with several sub-requirements (1.4.8 Visual Presentation lists five) has no one
      // value; a badge showing the last of them misrepresents the other four.
      value: ruleValue(statement),
    });
    cur = null;
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("# ")) continue;
    const h = HEADING.exec(line);
    if (h) {
      flush();
      cur = { title: h[1]!, anchor: h[2], text: [], obsolete: /obsolete/i.test(h[1]!) };
      continue;
    }
    if (!cur) {
      if (line && !summary) summary = strip(line);
      continue;
    }
    const lv = LEVEL.exec(line);
    if (lv) {
      cur.level = lv[1];
      continue;
    }
    if (/^_(New|Changed|Updated)_$/.test(line)) continue; // change markers, not normative text
    if (line) cur.text.push(line);
  }
  flush();
  return { summary: summary.slice(0, 1000), source_version: undefined, overview: [], platforms: [], sections: [], rules, tables: [] };
}

/** Glossary page: every `## term {#id}` becomes a term (kind: term) with the definition as rationale. */
export function extractGlossary(markdown: string): ExtractedPage {
  const rules: ExtractedRule[] = [];
  let cur: { title: string; anchor?: string; text: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    rules.push({
      kind: "term",
      section: "Glossary",
      anchor: cur.anchor,
      order: rules.length,
      platforms: [],
      scope: "general",
      severity: "may",
      statement: cur.title,
      rationale: strip(cur.text.join(" ")).slice(0, 4000) || undefined,
      notes: [],
      value: undefined,
    });
    cur = null;
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    const h = HEADING.exec(line);
    if (h) {
      flush();
      cur = { title: h[1]!, anchor: h[2], text: [] };
      continue;
    }
    if (cur && line) cur.text.push(line);
  }
  flush();
  return {
    summary: "Definitions of the terms the success criteria depend on.",
    source_version: undefined,
    overview: [],
    platforms: [],
    sections: [],
    rules,
    tables: [],
  };
}
