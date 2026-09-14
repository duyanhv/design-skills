/**
 * Deterministic rule extraction from normalized markdown.
 *
 * Guideline sites written in the Apple style put each rule in a paragraph whose lead sentence is
 * bold ("**Make buttons easy for people to use.** It's essential to …"). We treat every paragraph
 * or list item with a bold lead as one rule: lead = statement, remainder = rationale.
 * Headings give the section path, platform scope, and citation anchor.
 */
import { severityOf, valueOf } from "./severity.ts";

export const EXTRACTOR = "bold-lead@3";

export interface ExtractedRule {
  kind: "rule" | "term";
  section: string;
  anchor?: string;
  platforms: string[];
  severity: "must" | "should" | "may";
  statement: string;
  rationale?: string;
  value?: string;
}

export interface ExtractedPage {
  summary: string;
  source_version?: string;
  rules: ExtractedRule[];
}

export interface ExtractOptions {
  platforms: string[];
  skipSections: string[];
}

const HEADING = /^(#{1,6})\s+(.*?)(?:\s+\{#([^}]+)\})?\s*$/;
const BOLD_LEAD = /^(?:[-*]\s+|\d+\.\s+)?\*\*(.+?)\*\*\s*(.*)$/;
/** Plain list item (no bold lead). Only treated as a rule inside a "Best practices" section. */
const PLAIN_ITEM = /^(?:[-*]\s+|\d+\.\s+)(?!\*\*)(?!\[)(.+)$/;
const FIRST_SENTENCE = /^(.*?[.!?])(?:\s+(.*))?$/;

/**
 * A bold lead is a rule when it reads as an instruction. Very short leads are only rules when they
 * start with an imperative verb ("Be brief."); otherwise they are labels ("Long delay.", "Custom view.").
 * Leads with no terminal punctuation are headings-in-disguise ("San Francisco (SF)") → term.
 */
const IMPERATIVE_STARTS = new Set(("be use keep avoid don't do prefer make provide let give help include consider create support " +
  "display show ensure never always offer test design choose place position limit present respect follow write add put set " +
  "allow enable stay try aim minimize maximize localize match align group describe label name pair reserve clarify communicate " +
  "supply require request ask tell start stop pause resume update remove hide reveal confirm handle respond reflect indicate " +
  "prioritize emphasize reduce increase balance combine separate distinguish define specify identify anticipate accommodate").split(" "));

export function classify(statement: string): "rule" | "term" {
  const s = statement.trim();
  if (!/[.!?:]["\u201D\u2019']?$/.test(s)) return "term";
  const words = s.replace(/[.!?:]["\u201D\u2019']?$/, "").split(/\s+/);
  if (words.length <= 2) {
    const first = words[0]!.toLowerCase().replace(/[\u2019]/g, "'");
    return IMPERATIVE_STARTS.has(first) ? "rule" : "term";
  }
  return "rule";
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const LONG_DATE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/g;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

function stripMd(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → label
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match a heading to platform names, e.g. "iOS, iPadOS" → ["iOS","iPadOS"]. */
export function platformsIn(heading: string, known: string[]): string[] {
  const parts = heading.split(/[,/&]|\band\b/).map((p) => p.trim());
  const hits = parts.filter((p) => known.includes(p));
  return hits.length === parts.length && hits.length > 0 ? hits : [];
}

export function latestDate(text: string): string | undefined {
  let best: string | undefined;
  for (const m of text.matchAll(LONG_DATE)) {
    const iso = `${m[3]}-${String(MONTHS.indexOf(m[1]!.toLowerCase()) + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
    if (!best || iso > best) best = iso;
  }
  for (const m of text.matchAll(ISO_DATE)) if (!best || m[0] > best) best = m[0];
  return best;
}

export function extractRules(markdown: string, opts: ExtractOptions): ExtractedPage {
  const lines = markdown.split("\n");
  const rules: ExtractedRule[] = [];
  const path: { level: number; text: string; anchor?: string }[] = [];
  let summary = "";
  let sawHeading = false;
  let changeLog = "";
  let inChangeLog = false;

  const currentPlatforms = (): string[] => {
    for (let i = path.length - 1; i >= 0; i--) {
      const hit = platformsIn(path[i]!.text, opts.platforms);
      if (hit.length) return hit;
    }
    return [];
  };
  const skipping = () => path.some((h) => opts.skipSections.includes(h.text));

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = HEADING.exec(line);
    if (h) {
      const level = h[1]!.length;
      if (level === 1) continue; // page title
      sawHeading = true;
      while (path.length && path[path.length - 1]!.level >= level) path.pop();
      path.push({ level, text: stripMd(h[2]!), anchor: h[3] });
      inChangeLog = /change log/i.test(h[2]!);
      continue;
    }
    if (inChangeLog) changeLog += line + "\n";
    if (!sawHeading) {
      if (line.trim() && !summary) summary = stripMd(line); // the abstract is the first paragraph
      continue;
    }
    if (skipping()) continue;

    let statement: string;
    let rationale: string | undefined;
    let kind: "rule" | "term" = "rule";
    const m = BOLD_LEAD.exec(line.trim());
    if (m) {
      statement = stripMd(m[1]!);
      rationale = stripMd(m[2] ?? "") || undefined;
      // Apple sometimes closes the bold before the period: "**Keep it consistent**. Once you…"
      const punct = /^([.!?:])\s*(.*)$/.exec(rationale ?? "");
      if (punct) {
        statement += punct[1];
        rationale = punct[2] || undefined;
      }
      kind = classify(statement);
      if (kind === "term" && !rationale) continue; // bare "**Style**" list labels carry nothing
    } else {
      // Overview pages ("Designing for iOS") list best practices as plain bullets.
      const inBestPractices = path.some((p) => /best practices/i.test(p.text));
      const item = inBestPractices ? PLAIN_ITEM.exec(line.trim()) : null;
      if (!item) continue;
      const text = stripMd(item[1]!);
      const fs = FIRST_SENTENCE.exec(text);
      statement = fs ? fs[1]! : text;
      rationale = fs?.[2] || undefined;
      if (statement.split(" ").length < 4) continue;
    }
    const nearest = [...path].reverse().find((p) => p.anchor);
    rules.push({
      kind,
      section: path.map((p) => p.text).join(" › "),
      anchor: nearest?.anchor,
      platforms: currentPlatforms(),
      severity: severityOf(statement),
      statement: statement.slice(0, 400),
      rationale: rationale?.slice(0, 2000),
      value: valueOf(`${statement} ${rationale ?? ""}`),
    });
  }

  return { summary: summary.slice(0, 1000), source_version: latestDate(changeLog), rules };
}
