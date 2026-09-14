/**
 * DocC render JSON → clean markdown. Deterministic; no network.
 * Kept tolerant: unknown block/inline types degrade to their text content instead of throwing.
 */

export interface DoccRef { url?: string; title?: string }
export interface DoccDocument {
  metadata?: { title?: string };
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
  [k: string]: unknown;
};

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
          const label = inlineToText(n.inlineContent, refs) || ref?.title || "";
          return ref?.url ? `[${label}](${ref.url})` : label;
        }
        case "image":
        case "video":
          return "";
        default:
          return n.text ?? inlineToText(n.inlineContent, refs);
      }
    })
    .join("");
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
        const t = inlineToText(b.inlineContent, refs).trim();
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
        const rows = (b.rows ?? []).map((row) => row.map((cell) => blocksToMarkdown(cell, refs, depth + 1).replace(/\n+/g, " ")));
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
        // Tabbed spec panels ("Two-column" / "Three-column" grids): flatten, label each tab.
        for (const tab of b.tabs ?? []) {
          const inner = blocksToMarkdown(tab.content, refs, depth + 1);
          if (!inner) continue;
          out.push(tab.title ? `**${tab.title}**\n\n${inner}` : inner);
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

export function doccToMarkdown(doc: DoccDocument): { title: string; abstract: string; body: string } {
  const refs = doc.references ?? {};
  const title = doc.metadata?.title ?? "";
  const abstract = inlineToText(doc.abstract, refs).trim();
  const sections = doc.primaryContentSections?.filter((s) => s.kind === "content" || s.content) ?? [];
  const body = sections.map((s) => blocksToMarkdown(s.content, refs)).filter(Boolean).join("\n\n");
  return { title, abstract, body };
}
