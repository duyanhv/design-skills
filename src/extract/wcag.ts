/**
 * Extractor for WCAG-shaped markdown (see normalize/wcag.ts): one success criterion per `##`,
 * a `**Level X**` line, then the normative text. One SC = one rule.
 *   section:   "1.4.3 Contrast (Minimum)"
 *   statement: the first normative paragraph (the criterion itself)
 *   notes:     what follows — exceptions (normative) and notes/examples (informative), labelled
 *   conformance_level: "A" | "AA" | "AAA" — the only authority WCAG actually defines
 *
 * Severity is deliberately *not* derived from the level. WCAG's conformance model
 * (https://www.w3.org/TR/WCAG22/#conformance-reqs) makes a criterion required or not depending on
 * the target a project claims: at Level AA, A and AA criteria are required and AAA are not; at
 * Level AAA all three are. Baking one target into the rule would misstate the source, so every
 * success criterion is a MUST *for the levels at or above it*, and the skill tells the reader to
 * select by target level.
 * An SC with no level (e.g. 4.1.1 Parsing, obsolete) is kept as a term.
 *
 * **Authority within a criterion.** WCAG says which of its own words create requirements
 * (https://www.w3.org/TR/WCAG22/#interpreting-normative-requirements): the main content is
 * normative, while "diagrams, examples, and notes are informative (non-normative). Non-normative
 * material provides advisory information to help interpret the guidelines but does not create
 * requirements that impact a conformance claim."
 *
 * We used to keep notes and exceptions in one undifferentiated list, and the entry file called all
 * of it "part of the requirement" (audit A2). That promotes advice into a test: 2.5.3 Label in Name
 * requires the name to *contain* the visible label, and its note says a best practice is to put the
 * label at the *start* — a component that satisfies the criterion fails the note. Every block is
 * therefore labelled with the authority the source gives it. Nothing is dropped or reordered; the
 * label is a prefix on a block that is otherwise verbatim, in the same spirit as `_[figure: …]_`.
 */
import type { ExtractedPage, ExtractedRule } from "./rules.ts";
import { MAX_BLOCK } from "../schema/ir.ts";
import { ruleValue } from "./severity.ts";

export const WCAG_EXTRACTOR = "wcag-sc@6";

const HEADING = /^##\s+(.*?)(?:\s+\{#([^}]+)\})?\s*$/;
const LEVEL = /^\*\*Level (A{1,3})\*\*$/;

/**
 * A block the source marks as informative. The normalizer renders both shapes W3C names — a
 * `p.note` and an `aside.example` — as a labelled blockquote, so this is a syntactic test on what
 * the source itself declared, not a guess from the prose.
 */
const INFORMATIVE = /^>?\s*\*\*(Note|Example)s?:?\*\*/i;
export const INFORMATIVE_TAG = "_[informative]_";

export type Authority = "normative" | "informative";
export const authorityOf = (block: string): Authority => (INFORMATIVE.test(block.trim()) ? "informative" : "normative");

/**
 * Strip markdown that is presentation, keep markdown that is content.
 *
 * Links are content. `[Input Purposes … section](#input-purposes)` used to be flattened to its
 * label, which left 1.3.5 naming a section the reader had no way to reach — the whole of audit A3.
 * Compose rewrites a surviving link into the local reference file, so keeping it is what makes the
 * dependency reachable from the shipped skill.
 */
function strip(s: string): string {
  return s
    .split(/(\]\([^)]*\))/)
    // Backticks stay: on the Input Purposes page the code spans *are* the values an author writes
    // (`cc-exp-month`), and stripping them turned the defined set into ordinary prose.
    .map((part, i) => (i % 2 ? part : part.replace(/[*>]/g, "").replace(/(^|[^\w])_|_([^\w]|$)/g, "$1$2")))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Link syntax removed. Keeping links in the shipped text is the point of audit A3, but a matcher
 * reading the prose wants "16 px", not `[16 px](#dfn-large)` — `value` measured the latter and
 * produced "16 px" where the sentence says "at least 16 px".
 */
const flatten = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

/**
 * Prefix an informative block with its label, leaving the source's own text untouched after it.
 * `raw` is the block as the normalizer wrote it (where the marker lives); `text` is what ships.
 */
function labelled(raw: string, text: string): string {
  return authorityOf(raw) === "informative" ? `${INFORMATIVE_TAG} ${text}` : text;
}

export function extractWcag(markdown: string): ExtractedPage {
  if (/^# Glossary$/m.test(markdown)) return extractGlossary(markdown);
  // An appendix page (Input Purposes, Conformance) has no success criteria and no levels. Forcing
  // it through the SC shape made every section a "term", which compose then renders under a
  // "Definitions" heading — cc2 Full pages is a conformance requirement, not a definition.
  if (!/^\*\*Level A{1,3}\*\*$/m.test(markdown) && /^## .*\{#/m.test(markdown)) return extractAppendix(markdown);
  const rules: ExtractedRule[] = [];
  let summary = "";
  let cur: { title: string; anchor?: string; level?: string; text: string[]; obsolete: boolean } | null = null;

  const flush = () => {
    if (!cur) return;
    const level = cur.level;
    // Authority is read from the *raw* block, before `strip` removes the `> **Note:**` markup the
    // normalizer put there; the label then travels with the stripped text.
    const paras = cur.text.map((t) => ({ raw: t, text: strip(t) })).filter((p) => p.text);
    const isRule = !cur.obsolete && !!level;
    // statement = first normative paragraph; for a term (obsolete SC) the title itself
    let statement = isRule && paras[0] ? paras[0].text : cur.title;
    let rest = isRule && paras[0] ? paras.slice(1) : paras;
    if (statement.length > 600) {
      rest = [paras[0]!, ...rest];
      statement = cur.title;
    }
    // Exceptions and notes stay as separate blocks: an SC without its exceptions is a different
    // rule. What differs between them is authority, not presence — an exception is a condition of
    // the criterion, a note is advisory — so each block carries the label the source gives it.
    const notes = rest.map((p) => labelled(p.raw, p.text).slice(0, MAX_BLOCK));
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
      // Positional, parallel to `notes`: the same split the `_[informative]_` label renders, in a
      // form a checker can read without parsing prose.
      note_authority: rest.map((p) => authorityOf(p.raw)),
      // A criterion with several sub-requirements (1.4.8 Visual Presentation lists five) has no one
      // value; a badge showing the last of them misrepresents the other four.
      value: ruleValue(flatten(statement)),
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

/**
 * A bundled normative appendix: Input Purposes, and the Conformance chapter.
 *
 * Neither is a guideline, so neither produces rules: there are no success criteria here and no
 * conformance levels, and inventing a MUST for cc1 would be the compiler stating a requirement in
 * a shape the source did not use. Each `## heading {#anchor}` becomes one `sections` entry whose
 * `intro` is the source's own paragraphs, verbatim and in order, so the reference reads as the
 * chapter reads and every part of it keeps a citable anchor.
 *
 * These pages exist because a criterion that points at them is otherwise unusable: 1.3.5 makes the
 * Input Purposes list a condition of its own text, and "does this conform?" is answered by cc1–cc5,
 * not by the criteria a reviewer happened to look at (audit A3).
 */
export function extractAppendix(markdown: string): ExtractedPage {
  const sections: ExtractedPage["sections"] = [];
  const overview: string[] = [];
  let summary = "";
  let cur: { section: string; anchor?: string; order: number; platforms: string[]; intro: string[] } | null = null;
  let order = 0;
  const flush = () => {
    if (cur && cur.intro.length) sections.push(cur);
    cur = null;
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("# ")) continue;
    const h = HEADING.exec(line);
    if (h) {
      flush();
      cur = { section: h[1]!, anchor: h[2], order: order++, platforms: [], intro: [] };
      continue;
    }
    if (!line) continue;
    const text = labelled(line, strip(line)).slice(0, MAX_BLOCK);
    if (!text) continue;
    if (!cur) {
      // Prose before the first heading: the chapter's own framing sentence.
      if (!summary) summary = text;
      else overview.push(text);
      continue;
    }
    // A run of list items is one block. Pushed separately, compose puts a blank line between every
    // item and the 53-entry Input Purposes list stops reading as a list at all.
    //
    // The run *continues into a new block* rather than being truncated at the cap. Input Purposes
    // is 6 KB of list; `${prev}\n${text}`.slice(MAX_BLOCK) silently dropped its last ten entries,
    // including every `tel-*` purpose — a defined set that looks complete and is not, which is the
    // exact failure the cap's own comment in schema/ir.ts warns about. Markdown resumes a list
    // across a block boundary, so the reader sees one list either way.
    const prev = cur.intro[cur.intro.length - 1];
    const joinable = /^(?:[-*]\s|\d+\.\s)/.test(text) && prev !== undefined && /(?:^|\n)(?:[-*]\s|\d+\.\s)/.test(prev);
    if (joinable && prev!.length + 1 + text.length <= MAX_BLOCK) cur.intro[cur.intro.length - 1] = `${prev}\n${text}`;
    else cur.intro.push(text);
  }
  flush();
  return { summary: summary.slice(0, 1000), source_version: undefined, overview, platforms: [], sections, rules: [], tables: [] };
}

/**
 * Glossary page: every `## term {#id}` becomes a term. The first paragraph is the definition; the
 * lists and notes that qualify it stay as separate blocks.
 *
 * Flattening all of it into one line ran "changes of context" together as
 * `…include changes of: - user agent; - viewport; - focus…`, list markers and all — a definition an
 * agent cannot read (AUDIT-OUTPUT finding 8). The structure is the meaning here: the enumeration is
 * what the term *is*.
 */
export function extractGlossary(markdown: string): ExtractedPage {
  const rules: ExtractedRule[] = [];
  let cur: { title: string; anchor?: string; text: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    // A list item belongs to the block above it, so a run of items stays one note instead of
    // becoming a note each and losing the fact that they are alternatives in one enumeration.
    const blocks: string[] = [];
    for (const p of cur.text.map((t) => t.trim()).filter(Boolean)) {
      if (/^(?:[-*]\s|\d+\.\s)/.test(p) && blocks.length) blocks[blocks.length - 1] += `\n  ${p}`;
      else blocks.push(p);
    }
    const noteBlocks = [
      ...(blocks[0] && blocks[0].includes("\n") ? [blocks[0].slice(blocks[0].indexOf("\n") + 1)] : []),
      ...blocks.slice(1),
    ];
    rules.push({
      kind: "term",
      section: "Glossary",
      anchor: cur.anchor,
      order: rules.length,
      platforms: [],
      scope: "general",
      severity: "may",
      statement: cur.title,
      // The definition proper; everything after it qualifies rather than defines.
      // When the definition ends in an enumeration ("…include changes of: - user agent; …") the
      // list is split off rather than run into the sentence, so it renders as a list again.
      rationale: blocks.length ? strip(blocks[0]!.split("\n")[0]!).slice(0, 4000) : undefined,
      notes: noteBlocks.map((b) => labelled(b, b).slice(0, MAX_BLOCK)),
      note_authority: noteBlocks.map(authorityOf),
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
    if (/^_(New|Changed|Updated)_$/.test(line)) continue; // a change marker, not part of the definition
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
