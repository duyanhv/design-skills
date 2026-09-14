/**
 * WCAG guideline HTML → markdown the `wcag-sc` extractor reads:
 *
 *   # 1.4 Distinguishable
 *   <guideline intro>
 *   ## 1.4.3 Contrast (Minimum) {#contrast-minimum}
 *   **Level AA**
 *   <normative text; <dl> exceptions as "- **Term** — text" items; notes as blockquotes>
 */
import { parse, type HTMLElement, type Node } from "node-html-parser";

function inline(node: Node): string {
  if (node.nodeType === 3) return node.rawText.replace(/\s+/g, " ");
  const el = node as HTMLElement;
  const inner = el.childNodes.map(inline).join("");
  switch (el.tagName) {
    case "A": {
      const href = el.getAttribute("href");
      return href && href.startsWith("#") ? `[${inner}](${href})` : inner; // glossary links have no href
    }
    case "EM":
    case "I":
      return `_${inner}_`;
    case "STRONG":
    case "B":
      return `**${inner}**`;
    case "CODE":
      return `\`${inner}\``;
    default:
      return inner;
  }
}

function block(el: HTMLElement): string {
  const cls = el.getAttribute("class") ?? "";
  switch (el.tagName) {
    case "P":
      if (/\bconformance-level\b/.test(cls)) return `**Level ${el.text.trim()}**`;
      if (/\bnote\b/.test(cls)) return `> **Note:** ${inline(el).trim()}`;
      if (/\bchange\b/.test(cls)) return `_${el.text.trim()}_`;
      return inline(el).trim();
    case "DL": {
      const items: string[] = [];
      let term = "";
      for (const c of el.childNodes) {
        const ce = c as HTMLElement;
        if (ce.tagName === "DT") term = inline(ce).trim();
        else if (ce.tagName === "DD") items.push(`- **${term}** — ${blocks(ce).replace(/\n+/g, " ")}`);
      }
      return items.join("\n");
    }
    case "UL":
    case "OL":
      return el.querySelectorAll(":scope > li").map((li, i) => `${el.tagName === "OL" ? `${i + 1}.` : "-"} ${blocks(li).replace(/\n+/g, " ")}`).join("\n");
    case "DIV":
    case "SECTION":
      return blocks(el);
    default:
      return inline(el).trim();
  }
}

function blocks(el: HTMLElement): string {
  return el.childNodes
    .filter((n) => n.nodeType === 1)
    .map((n) => block(n as HTMLElement))
    .filter(Boolean)
    .join("\n\n");
}

export function wcagToMarkdown(html: string): { title: string; abstract: string; body: string } {
  const number = /<!-- number:([\d.]+) -->/.exec(html)?.[1] ?? "";
  const root = parse(html);
  const guideline = root.querySelector("section.guideline") ?? root;
  const title = `${number} ${guideline.querySelector("h3")?.text.trim() ?? ""}`.trim();
  const abstract = inline(guideline.querySelector(":scope > p") ?? parse("")).trim();

  const out: string[] = [];
  let scNo = 0;
  for (const sc of guideline.querySelectorAll("section.sc")) {
    scNo++;
    const id = sc.getAttribute("id") ?? `sc-${scNo}`;
    const heading = sc.querySelector("h4")?.text.trim() ?? id;
    out.push(`## ${number}.${scNo} ${heading} {#${id}}`);
    for (const child of sc.childNodes) {
      if (child.nodeType !== 1) continue;
      const el = child as HTMLElement;
      if (el.tagName === "H4") continue;
      const md = block(el);
      if (md) out.push(md);
    }
  }
  return { title, abstract, body: out.join("\n\n") };
}
