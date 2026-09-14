/**
 * DocC render JSON → clean markdown. Deterministic; no network.
 * Kept tolerant: unknown block/inline types degrade to their text content instead of throwing.
 */

export interface DoccRef {
  url?: string;
  title?: string;
  abstract?: Inline[];
  /** Images/videos: the accessibility description, which is often the only text in a figure. */
  alt?: string;
  type?: string;
  fragments?: { kind?: string; text?: string }[];
}
export interface DoccDocument {
  metadata?: { title?: string; customMetadata?: Record<string, string> };
  abstract?: Inline[];
  primaryContentSections?: { kind?: string; content?: Block[] }[];
  sections?: Block[];
  references?: Record<string, DoccRef>;
}

export type Inline = {
  type: string;
  text?: string;
  code?: string;
  identifier?: string;
  inlineContent?: Inline[];
  /** DocC lets a link override the target's title ("motion" pointing at motion#visionOS). */
  overridingTitle?: string;
  overridingTitleInlineContent?: Inline[];
};

export type Block = {
  type: string;
  level?: number;
  text?: string;
  anchor?: string;
  inlineContent?: Inline[];
  content?: Block[];
  items?: { content?: Block[] }[];
  rows?: Block[][][];
  header?: string;
  code?: string[];
  syntax?: string;
  style?: string;
  name?: string;
  columns?: { content?: Block[] }[];
  tabs?: { title?: string; content?: Block[] }[];
  identifier?: string;
  source?: string;
  metadata?: { abstract?: Inline[] };
  [k: string]: unknown;
};

/**
 * Figures carry meaning that the prose relies on ("the sizes below"), so an image is never dropped
 * silently: it becomes `_[figure: <alt>]_`, or `_[figure]_` when the source supplies no description.
 * That keeps a reader (and an agent) aware that something visual is missing from the text.
 */
export function figureText(ref: DoccRef | undefined, fallbackAlt?: string): string {
  const alt = (ref?.alt ?? fallbackAlt ?? "").replace(/\s+/g, " ").trim();
  return alt ? `_[figure: ${alt}]_` : `_[figure]_`;
}

export function inlineToText(nodes: Inline[] | undefined, refs: Record<string, DoccRef> = {}): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return n.text ?? "";
        case "codeVoice":
          return "`" + (n.code ?? n.text ?? "") + "`";
        case "strong":
          return "**" + inlineToText(n.inlineContent, refs) + "**";
        case "emphasis":
          return "_" + inlineToText(n.inlineContent, refs) + "_";
        case "reference": {
          const ref = n.identifier ? refs[n.identifier] : undefined;
          if (ref?.type === "image" || ref?.type === "video") return figureText(ref);
          const symbol = ref?.fragments?.filter((f) => f.kind === "identifier").map((f) => f.text).join("") ?? "";
          // An overriding title is the author's own wording for this link and outranks the target's title.
          const label =
            inlineToText(n.overridingTitleInlineContent, refs) ||
            n.overridingTitle ||
            inlineToText(n.inlineContent, refs) ||
            ref?.title ||
            (symbol && `\`${symbol}\``) ||
            "";
          return ref?.url ? `[${label}](${ref.url})` : label;
        }
        case "image":
        case "video":
          return figureText(n.identifier ? refs[n.identifier] : undefined);
        default:
          return n.text ?? inlineToText(n.inlineContent, refs);
      }
    })
    .join("");
}

/** First heading anywhere in a block tree; DocC wraps tab content in row/column containers. */
function firstHeading(blocks: Block[] | undefined, refs: Record<string, DoccRef>): string {
  for (const b of blocks ?? []) {
    if (b.type === "heading") return b.text ?? inlineToText(b.inlineContent, refs);
    const nested = firstHeading([...(b.content ?? []), ...(b.columns ?? []).flatMap((c) => c.content ?? [])], refs);
    if (nested) return nested;
  }
  return "";
}

/**
 * Pull the first heading out of a block tree and return it plus the remaining blocks.
 * Tab panels put the illustration before the heading; flattening in that order files the
 * illustration under the *previous* tab's heading, which silently misattributes it.
 */
function hoistHeading(blocks: Block[]): Block[] {
  let found: Block | undefined;
  const strip = (bs: Block[]): Block[] =>
    bs.flatMap((b) => {
      if (!found && b.type === "heading") {
        found = b;
        return [];
      }
      if (found) return [b];
      if (b.content) return [{ ...b, content: strip(b.content) }];
      if (b.columns) return [{ ...b, columns: b.columns.map((c) => ({ ...c, content: strip(c.content ?? []) })) }];
      return [b];
    });
  const rest = strip(blocks);
  return found ? [found, ...rest] : blocks;
}

/**
 * Availability tables mark each cell with a checkmark image. Rendering the full alt text in every
 * cell would drown the table, so a cell that is nothing but a checkmark figure becomes "✓".
 */
function cellText(md: string): string {
  const compact = md.replace(/\n+/g, " ").trim();
  const figure = /^_\[figure(?::\s*(.*?))?\]_$/.exec(compact);
  if (figure) return /check\s?mark|available/i.test(figure[1] ?? "") ? "✓" : compact;
  return compact;
}

export function blocksToMarkdown(blocks: Block[] | undefined, refs: Record<string, DoccRef> = {}, depth = 0): string {
  if (!blocks) return "";
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading": {
        const level = Math.min(6, Math.max(2, b.level ?? 2));
        const anchor = b.anchor ? ` {#${b.anchor}}` : "";
        out.push(`${"#".repeat(level)} ${b.text ?? inlineToText(b.inlineContent, refs)}${anchor}`);
        break;
      }
      case "paragraph": {
        // A figure placeholder sits flush against the sentence it followed; give it a space so the
        // prose stays readable and the marker stays recognisable.
        const t = inlineToText(b.inlineContent, refs).replace(/(\S)(_\[figure)/g, "$1 $2").replace(/(figure[^\]]*\]_)(\S)/g, "$1 $2").trim();
        if (t) out.push(t);
        break;
      }
      case "unorderedList":
      case "orderedList": {
        const lines = (b.items ?? []).map((item, i) => {
          const marker = b.type === "orderedList" ? `${i + 1}.` : "-";
          const body = blocksToMarkdown(item.content, refs, depth + 1).replace(/\n\n/g, "\n").replace(/\n/g, "\n  ");
          return `${marker} ${body}`;
        });
        out.push(lines.join("\n"));
        break;
      }
      case "table": {
        const rows = (b.rows ?? []).map((row) => row.map((cell) => cellText(blocksToMarkdown(cell, refs, depth + 1))));
        if (rows.length) {
          const [head, ...rest] = rows;
          const width = head?.length ?? 0;
          out.push(
            [
              `| ${head?.join(" | ")} |`,
              `| ${Array(width).fill("---").join(" | ")} |`,
              ...rest.map((r) => `| ${r.join(" | ")} |`),
            ].join("\n"),
          );
        }
        break;
      }
      case "codeListing":
        out.push("```" + (b.syntax ?? "") + "\n" + (b.code ?? []).join("\n") + "\n```");
        break;
      case "aside": {
        const label = b.name ?? b.style ?? "Note";
        const body = blocksToMarkdown(b.content, refs, depth + 1).replace(/\n/g, "\n> ");
        out.push(`> **${label}:** ${body}`);
        break;
      }
      case "row":
        for (const col of b.columns ?? []) out.push(blocksToMarkdown(col.content, refs, depth + 1));
        break;
      case "termList":
        out.push(blocksToMarkdown(b.items?.flatMap((i) => i.content ?? []), refs, depth + 1));
        break;
      case "tabNavigator":
        // Tabbed spec panels ("Two-column" / "Three-column" grids): flatten and label each tab.
        // A tab usually opens with an illustration and *then* its heading, which when flattened files
        // that illustration under the previous tab's heading. Hoisting the heading to the front of
        // the tab keeps every tab's content under the heading it belongs to. The tab label is dropped
        // when the heading already says the same thing ("Two-column" vs "Two-column grid").
        for (const tab of b.tabs ?? []) {
          const inner = blocksToMarkdown(hoistHeading(tab.content ?? []), refs, depth + 1);
          if (!inner) continue;
          if (!tab.title) {
            out.push(inner);
            continue;
          }
          const headingText = firstHeading(tab.content, refs);
          const redundant = headingText.toLowerCase().includes(tab.title.toLowerCase());
          out.push(redundant ? inner : `**${tab.title}**\n\n${inner}`);
        }
        break;
      case "image":
      case "video":
      case "links":
        break;
      default: {
        // unknown block: recurse into anything that looks like content
        const inner = blocksToMarkdown(b.content, refs, depth + 1) || inlineToText(b.inlineContent, refs);
        if (inner) out.push(inner);
      }
    }
  }
  return out.filter(Boolean).join("\n\n");
}

/**
 * Apple declares each page's platform scope in DocC metadata
 * (`customMetadata["supported-platforms"] = "ios,ipados,watchos"`). That is authoritative, so it is
 * preferred over guessing scope from the page title or its headings.
 */
export function supportedPlatforms(doc: DoccDocument, known: string[]): string[] {
  const raw = doc.metadata?.customMetadata?.["supported-platforms"];
  if (!raw) return [];
  const wanted = new Set(raw.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean));
  const hit = known.filter((p) => wanted.has(p.toLowerCase()));
  // All platforms listed = not a scoped page; treat it as general rather than tagging every rule.
  return hit.length === known.length ? [] : hit;
}

export function doccToMarkdown(doc: DoccDocument): { title: string; abstract: string; body: string } {
  const refs = doc.references ?? {};
  const title = doc.metadata?.title ?? "";
  const abstract = inlineToText(doc.abstract, refs).trim();
  const sections = doc.primaryContentSections?.filter((s) => s.kind === "content" || s.content) ?? [];
  const body = sections.map((s) => blocksToMarkdown(s.content, refs)).filter(Boolean).join("\n\n");
  return { title, abstract, body };
}
