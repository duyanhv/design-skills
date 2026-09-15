/**
 * Deterministic rule extraction from normalized markdown.
 *
 * Guideline sites written in the Apple style put each rule in a paragraph whose lead sentence is
 * bold ("**Make buttons easy for people to use.** It's essential to …"). We treat every paragraph
 * or list item with a bold lead as one rule: lead = statement, remainder = rationale.
 * Headings give the section path, platform scope, and citation anchor.
 *
 * Text that is not a rule is *not* discarded: prose before a section's first rule becomes that
 * section's intro, and prose/bullets/asides that follow a rule become that rule's notes. A rule is
 * frequently unusable without them (exceptions, platform caveats, which material to pick).
 */
import { MAX_BLOCK } from "../schema/ir.ts";
import { ruleValue, severityOf } from "./severity.ts";

export const EXTRACTOR = "bold-lead@10";

/**
 * Where a rule's platform scope came from.
 *   section — a platform-named heading ("### macOS")
 *   page    — the whole page is about one platform ("Designing for visionOS")
 *   general — the source states it without scoping it to a platform (applies to all it covers)
 * Distinguishing `general` from a *missing* scope is the point: an unscoped rule on a
 * platform-specific page used to read as universal guidance.
 */
export type Scope = "section" | "page" | "general";

export interface ExtractedRule {
  kind: "rule" | "term";
  section: string;
  anchor?: string;
  /** Position in the source document. Everything extracted from a page shares one counter. */
  order: number;
  platforms: string[];
  scope: Scope;
  severity: "must" | "should" | "may";
  /** Sources with a formal conformance model (WCAG A/AA/AAA) report it here, separate from severity. */
  conformance_level?: "A" | "AA" | "AAA";
  statement: string;
  rationale?: string;
  /** Blocks that qualify the rule: follow-up paragraphs, sub-bullets, notes. Verbatim, in order. */
  notes: string[];
  /**
   * Positional, parallel to `notes`: whether the source gives each block normative force. Only
   * extractors whose source declares the distinction set it (WCAG marks notes and examples
   * informative). Omitted means "this source does not draw the line", not "all normative".
   */
  note_authority?: ("normative" | "informative")[];
  value?: string;
}

export interface ExtractedTable {
  section: string;
  anchor?: string;
  order: number;
  caption?: string;
  markdown: string;
}

/**
 * A run of prose inside a section — definitions and framing that its rules depend on. A section can
 * hold several of these: the source interleaves prose, definitions and rules, and `order` is what
 * puts them back in that sequence.
 */
export interface ExtractedSection {
  section: string;
  anchor?: string;
  order: number;
  platforms: string[];
  intro: string[];
}

export interface ExtractedPage {
  summary: string;
  source_version?: string;
  /** Paragraphs before the first heading, after the abstract: what the topic is and when to use it. */
  overview: string[];
  /** Platforms the whole page is about, when it is platform-specific ("Designing for tvOS"). */
  platforms: string[];
  sections: ExtractedSection[];
  rules: ExtractedRule[];
  tables: ExtractedTable[];
}

export interface ExtractOptions {
  platforms: string[];
  skipSections: string[];
  /** Page title, used to detect a page-wide platform scope. */
  title?: string;
  /** Manifest override: platforms this page is about, when the title does not say so. */
  pagePlatforms?: string[];
  /** Page URL, cited in the marker left when context exceeds the cap. */
  url?: string;
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

/**
 * Like stripMd but keeps `[label](url)` links so compose can turn cross-references into local links.
 * Emphasis markers are removed everywhere except inside a link target, where `_` and `*` are legal
 * URL characters — hence the split on link syntax rather than one global replace.
 */
function stripMdKeepLinks(s: string): string {
  return s
    .split(/(\]\([^)]*\))/)
    .map((part, i) => (i % 2 ? part : part.replace(/[*`]/g, "").replace(/(^|[^\w])_|_([^\w]|$)/g, "$1$2")))
    .join("")
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

/** A caption is short lead-in prose or a bare bold label ("**Two-column**") — never a rule paragraph. */
function isCaption(prose: string): boolean {
  if (!prose) return false;
  const m = BOLD_LEAD.exec(prose);
  if (m && (m[2] ?? "").trim()) return false;
  return stripMd(prose).length <= 200;
}

/** An aside: "> **Note:** …". Notes carry exceptions, so they are never dropped. */
const ASIDE = /^>\s*(.*)$/;
/** A figure placeholder the normalizer emitted for an image/video (see normalize/docc.ts). */
const FIGURE = /^_\[figure(?::[^\]]*)?\]_$/;

/**
 * Prose kept as context, verbatim. Unlike a rule statement — which is normalized so it can be
 * matched and quoted — context is the source's own formatting: bold labels, list markers, emphasis
 * and links all carry meaning here ("**Destructive.** The button performs…").
 */
function contextText(line: string): string {
  const aside = ASIDE.exec(line.trim());
  return (aside ? aside[1]! : line.trim()).replace(/\s+/g, " ").trim();
}

/** Page-wide platform scope: "Designing for visionOS", "visionOS app icons". */
export function pagePlatformsOf(title: string | undefined, known: string[]): string[] {
  if (!title) return [];
  return known.filter((p) => new RegExp(`(^|[^A-Za-z])${p}([^A-Za-z]|$)`).test(title));
}

/**
 * `**Consider** **presenting a Now Playing view…**` — one bold lead the source split into two spans.
 * Taken literally the statement is "Consider", which classifies as a term and ships as a rule with
 * no id, no severity and no platform tag (AUDIT-OUTPUT finding 3). Adjacent spans with nothing
 * between them are one span.
 */
export function mergeBoldLead(line: string): string {
  // Anchored at the lead: a pair of bold spans later in a paragraph ("see **Note** and **Tip**") is
  // ordinary emphasis, not a split statement.
  const SPLIT_LEAD = /^((?:[-*]\s+|\d+\.\s+)?)\*\*(.+?)\*\*(\s*)\*\*(.+?)\*\*/;
  let out = line;
  for (let i = 0; i < 4 && SPLIT_LEAD.test(out); i++) {
    out = out.replace(SPLIT_LEAD, (_m, bullet: string, a: string, gap: string, b: string) => `${bullet}**${a}${gap || " "}${b}**`);
  }
  return out;
}

/**
 * Cap on context blocks attached to one rule or section.
 *
 * A cap is needed — a pathological page should not produce an unbounded rule — but silently
 * dropping guidance is the failure this module exists to prevent. Apple's Virtual keyboards page
 * lists ~10 keyboard types as label/figure pairs under a single rule; at 12 blocks that catalogue
 * was cut in half with no trace. The cap is now high enough for real pages, and anything past it
 * leaves an explicit marker instead of vanishing.
 */
const MAX_NOTES = 40;
const overflowMarker = (dropped: number, url?: string) =>
  `_[${dropped} further block(s) here are not included; read the source${url ? `: ${url}` : ""}]_`;

export function extractRules(markdown: string, opts: ExtractOptions): ExtractedPage {
  const lines = markdown.split("\n");
  const rules: ExtractedRule[] = [];
  const tables: ExtractedTable[] = [];
  const sections: ExtractedSection[] = [];
  const path: { level: number; text: string; anchor?: string }[] = [];
  let tableBuf: string[] = [];
  let lastProse = "";
  /**
   * One counter for every block the page emits, in the order the source presents them. Compose
   * renders by it, so a reference reads in the same sequence as the page it came from: previously
   * rules were grouped first and prose-only sections were appended at the end, which put Anatomy
   * after Platform considerations and separated "use the sizes below" from its table.
   */
  let order = 0;
  /** Where `lastProse` was stored as context, so a line promoted to a table caption is not duplicated. */
  let lastContext: { list: string[]; text: string } | null = null;
  const flushTable = () => {
    if (tableBuf.length >= 2) {
      const nearest = [...path].reverse().find((p) => p.anchor);
      const caption = isCaption(lastProse) ? stripMd(lastProse) : undefined;
      // The caption line is already on the page as this table's lead-in, so drop the context copy —
      // but drop *that* line, not merely the last one pushed. `lastProse` skips figures and
      // `lastContext` does not, so when a figure sits between the lead-in and the table the two
      // disagree, and popping blind deleted the figure while leaving the duplicated prose. That
      // silently removed 11 illustrations (wallet, game-center, top-shelf) whose sections are
      // entirely about what the picture shows.
      if (caption && lastContext) {
        const list = lastContext.list;
        const at = list.findIndex((t) => stripMd(t) === caption);
        if (at >= 0) list.splice(at, 1);
      }
      tables.push({
        section: path.map((p) => p.text).join(" › "),
        anchor: nearest?.anchor,
        order: order++,
        // caption = a short lead-in ("Two-column", "Sizes vary by platform.") — never a rule paragraph
        caption,
        markdown: tableBuf.join("\n"),
      });
    }
    tableBuf = [];
    lastContext = null;
  };
  let summary = "";
  const overview: string[] = [];
  let sawHeading = false;
  let changeLog = "";
  let inChangeLog = false;
  /** The rule most recently emitted in the current section; qualifying prose attaches to it. */
  let openRule: ExtractedRule | null = null;
  let openSection: ExtractedSection | null = null;

  const pagePlatforms = opts.pagePlatforms?.length ? opts.pagePlatforms : pagePlatformsOf(opts.title, opts.platforms);

  /** Nearest platform-named heading wins; otherwise the page's own scope; otherwise general. */
  const currentScope = (): { platforms: string[]; scope: Scope } => {
    for (let i = path.length - 1; i >= 0; i--) {
      const hit = platformsIn(path[i]!.text, opts.platforms);
      if (hit.length) return { platforms: hit, scope: "section" };
    }
    if (pagePlatforms.length) return { platforms: pagePlatforms, scope: "page" };
    return { platforms: [], scope: "general" };
  };
  const skipping = () => path.some((h) => opts.skipSections.includes(h.text));

  /** Attach qualifying prose to the open rule, or to the section's intro when no rule is open yet. */
  /** Blocks dropped past the cap, per list, so the marker can say how many. */
  const dropped = new Map<string[], number>();
  /** Append to a capped list; past the cap, keep a marker that says what is missing. */
  const push = (list: string[], text: string) => {
    const block = text.slice(0, MAX_BLOCK);
    if (list.length < MAX_NOTES) {
      list.push(block);
      lastContext = { list, text: block };
      return;
    }
    // At the cap the last slot becomes (and stays) the overflow marker: never a silent loss.
    const n = (dropped.get(list) ?? 0) + 1;
    dropped.set(list, n);
    const marker = overflowMarker(n, opts.url);
    if (list.length === MAX_NOTES && dropped.get(list) === 1) list.push(marker);
    else list[list.length - 1] = marker;
    lastContext = null; // a marker is never a table caption
  };
  const addContext = (text: string) => {
    if (!text) return;
    if (openRule) {
      push(openRule.notes, text);
      return;
    }
    if (!openSection) {
      const nearest = [...path].reverse().find((p) => p.anchor);
      openSection = {
        section: path.map((p) => p.text).join(" › "),
        anchor: nearest?.anchor,
        order: order++,
        platforms: currentScope().platforms,
        intro: [],
      };
      sections.push(openSection);
    }
    push(openSection.intro, text);
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const isTableRow = /^\|.*\|$/.test(line.trim());
    if (!isTableRow && tableBuf.length) flushTable();
    const h = HEADING.exec(line);
    if (h) {
      const level = h[1]!.length;
      if (level === 1) continue; // page title
      sawHeading = true;
      while (path.length && path[path.length - 1]!.level >= level) path.pop();
      path.push({ level, text: stripMd(h[2]!), anchor: h[3] });
      inChangeLog = /change log/i.test(h[2]!);
      openRule = null;
      openSection = null;
      // A caption candidate does not survive a heading. `flushTable` pops `lastContext` out of the
      // list holding it, on the theory that the line is already on the page as the table's lead-in.
      // Left uncleared across a heading, it still points into the *previous* section, so a table
      // several sections later deletes that section's last context block — in airplay.md, the
      // "Custom color AirPlay icon" figure, removed by a table three sections down.
      lastContext = null;
      continue;
    }
    if (inChangeLog) changeLog += line + "\n";
    if (!sawHeading) {
      // The abstract is the first paragraph; the rest is the topic's introduction, which defines
      // the component and says when to use it — context a rule alone does not carry.
      if (!line.trim()) continue;
      if (FIGURE.test(line.trim())) continue; // a decorative page header image carries no guidance
      if (!summary) summary = stripMd(line);
      else push(overview, contextText(line));
      continue;
    }
    if (skipping()) continue;

    if (isTableRow) {
      tableBuf.push(line.trim());
      continue;
    }
    if (!line.trim()) continue;
    // A figure placeholder is the preceding illustration, not this table's lead-in text.
    if (!FIGURE.test(line.trim())) lastProse = line.trim();

    let statement: string;
    let rationale: string | undefined;
    let kind: "rule" | "term" = "rule";
    const isIndented = /^\s/.test(raw) && !!openRule; // a continuation line of the rule above
    const m = isIndented ? null : BOLD_LEAD.exec(mergeBoldLead(line.trim()));
    if (m) {
      statement = stripMd(m[1]!);
      rationale = stripMdKeepLinks(m[2] ?? "") || undefined;
      // Apple sometimes closes the bold before the period: "**Keep it consistent**. Once you…"
      const punct = /^([.!?:])\s*(.*)$/.exec(rationale ?? "");
      if (punct) {
        statement += punct[1];
        rationale = punct[2] || undefined;
      }
      // "**Monochrome** — Applies one color…": the dash separates the label from its definition and
      // is not part of either. Left in place it reached the page as "**Monochrome** — — Applies…".
      rationale = rationale?.replace(/^[\u2014\u2013:-]\s*/, "") || undefined;
      kind = classify(statement);
      if (kind === "term" && !rationale) {
        addContext(contextText(line)); // a bare "**Sizes**" label is a caption for what follows
        continue;
      }
    } else {
      // Overview pages ("Designing for iOS") list best practices as plain bullets.
      const inBestPractices = path.some((p) => /best practices/i.test(p.text));
      const item = inBestPractices && !isIndented ? PLAIN_ITEM.exec(line.trim()) : null;
      if (!item) {
        // Not a rule: keep it as context rather than dropping guidance on the floor. A figure is kept
        // too — the prose often depends on it ("use the sizes below"), and an unmarked gap is worse
        // than an explicit "there is a picture here that the text does not describe".
        addContext(contextText(line));
        continue;
      }
      const text = stripMdKeepLinks(item[1]!);
      const fs = FIRST_SENTENCE.exec(text);
      statement = stripMd(fs ? fs[1]! : text);
      rationale = fs?.[2] || undefined;
      if (statement.split(" ").length < 4) {
        addContext(contextText(line));
        continue;
      }
    }
    const nearest = [...path].reverse().find((p) => p.anchor);
    const { platforms, scope } = currentScope();
    const rule: ExtractedRule = {
      kind,
      section: path.map((p) => p.text).join(" › "),
      anchor: nearest?.anchor,
      order: order++,
      platforms,
      scope,
      severity: severityOf(statement),
      statement: statement.slice(0, 400),
      rationale: rationale?.slice(0, 2000),
      notes: [],
      value: ruleValue(statement, rationale),
    };
    rules.push(rule);
    // A definition ends with its own line. Keeping a term open made every following paragraph,
    // aside and figure part of that definition, so "A button's role can have additional effects on
    // its appearance" was attributed to the Destructive role (AUDIT-OUTPUT finding 2). Prose after a
    // term belongs to the section, in its source position.
    openRule = kind === "term" ? null : rule;
    openSection = null;
  }

  flushTable();
  return {
    summary: summary.slice(0, 1000),
    source_version: latestDate(changeLog),
    overview,
    platforms: pagePlatforms,
    sections: sections.filter((s) => s.intro.length),
    rules,
    tables,
  };
}
