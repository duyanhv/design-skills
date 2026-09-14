/**
 * Extractor for WCAG-shaped markdown (see normalize/wcag.ts): one success criterion per `##`,
 * a `**Level X**` line, then the normative text. One SC = one rule.
 *   section:   "1.4.3 Contrast (Minimum)"
 *   statement: the first normative paragraph (the criterion itself)
 *   rationale: what follows — exceptions, notes — flattened
 *   severity:  A/AA → must (required for typical conformance targets), AAA → may
 *   value:     "Level AA"
 * An SC with no level (e.g. 4.1.1 Parsing, obsolete) is kept as a term.
 */
import type { ExtractedPage, ExtractedRule } from "./rules.ts";
import { valueOf } from "./severity.ts";

export const WCAG_EXTRACTOR = "wcag-sc@2";

const HEADING = /^##\s+(.*?)(?:\s+\{#([^}]+)\})?\s*$/;
const LEVEL = /^\*\*Level (A{1,3})\*\*$/;

function strip(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`>]/g, "").replace(/\s+/g, " ").trim();
}

export function extractWcag(markdown: string): ExtractedPage {
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
    const rationale = rest.join(" ") || undefined;
    rules.push({
      kind: isRule ? "rule" : "term",
      section: cur.title,
      anchor: cur.anchor,
      platforms: [],
      severity: level === "AAA" ? "may" : "must",
      statement,
      rationale: rationale?.slice(0, 4000),
      value: level ? `Level ${level}` : valueOf(rationale ?? ""),
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
  return { summary: summary.slice(0, 1000), source_version: undefined, rules, tables: [] };
}
