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

/**
 * `node-html-parser` hands back the source text with its character references intact, so the
 * relative-luminance formula reached the shipped glossary as `if RsRGB &lt;= 0.04045` — markup in
 * prose an agent is meant to read (AUDIT-OUTPUT finding 8). Decoded once, at the only place raw
 * text enters the pipeline.
 */
const NAMED: Record<string, string> = {
  lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: "\u00a0",
  ndash: "–", mdash: "—", hellip: "…", times: "×", le: "≤", ge: "≥", minus: "−", deg: "°",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
};
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    // `&amp;` must decode last in a chain, so resolve only one level: the source never double-encodes.
    return NAMED[body.toLowerCase()] ?? m;
  });
}

/** Element text with entities resolved. `el.text` alone leaks `&lt;` into the markdown. */
const text = (el: HTMLElement) => decodeEntities(el.text);

function inline(node: Node): string {
  if (node.nodeType === 3) return decodeEntities(node.rawText).replace(/\s+/g, " ");
  const el = node as HTMLElement;
  const inner = el.childNodes.map(inline).join("");
  switch (el.tagName) {
    case "A": {
      const href = el.getAttribute("href");
      // A glossary reference is written as a bare `<a>` with no href; everything else is a real
      // link, and the link *is* the dependency — flattening it to its label is how 1.3.5 ended up
      // naming a section no reader could reach (audit A3).
      if (!href) return inner;
      if (href.startsWith("#") || /^https?:\/\//.test(href)) return `[${inner}](${href})`;
      // A sibling file in the source tree, e.g. `relative-luminance.html`. It is not a page we
      // publish, so it is cited absolutely against the canonical document.
      return `[${inner}](https://www.w3.org/TR/WCAG22/#${href.replace(/\.html$/, "")})`;
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
      if (/\bconformance-level\b/.test(cls)) return `**Level ${text(el).trim()}**`;
      if (/\bnote\b/.test(cls)) return `> **Note:** ${inline(el).trim()}`;
      if (/\bchange\b/.test(cls)) return `_${text(el).trim()}_`;
      return inline(el).trim();
    case "ASIDE":
      // W3C marks examples informative in the same breath as notes
      // (https://www.w3.org/TR/WCAG22/#interpreting-normative-requirements). They used to fall
      // through to `default:` and arrive as an ordinary paragraph — normative-looking prose.
      if (/\bexample\b/.test(cls)) return `> **Example:** ${blocks(el).replace(/\n+/g, " ").trim()}`;
      return blocks(el);
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
    case "H2":
    case "H3":
      // Only appendix pages reach here; a guideline's headings are consumed by the page builder.
      return `**${text(el).trim()}**`;
    default:
      return inline(el).trim();
  }
}

const INLINE_TAGS = new Set(["A", "EM", "I", "STRONG", "B", "CODE", "SPAN", "DFN", "ABBR"]);

/** Children of a container: block elements, or (for <dd>/<li> written without <p>) mixed inline content. */
function blocks(el: HTMLElement): string {
  const kids = el.childNodes;
  const mixed = kids.some((n) => (n.nodeType === 3 && n.rawText.trim()) || (n.nodeType === 1 && INLINE_TAGS.has((n as HTMLElement).tagName)));
  if (mixed) {
    // Render inline runs and block children in order, so "text <p>…</p> text" doesn't lose either.
    const out: string[] = [];
    let run = "";
    for (const n of kids) {
      if (n.nodeType === 1 && !INLINE_TAGS.has((n as HTMLElement).tagName)) {
        if (run.trim()) out.push(run.trim());
        run = "";
        out.push(block(n as HTMLElement));
      } else {
        run += inline(n);
      }
    }
    if (run.trim()) out.push(run.trim());
    return out.filter(Boolean).join("\n\n").replace(/[ \t]+\n/g, "\n");
  }
  return kids
    .filter((n) => n.nodeType === 1)
    .map((n) => block(n as HTMLElement))
    .filter(Boolean)
    .join("\n\n");
}

export function wcagToMarkdown(html: string): { title: string; abstract: string; body: string } {
  if (/<!-- glossary -->/.test(html)) return glossaryToMarkdown(html);
  const appendix = /<!-- appendix:(\w+) -->/.exec(html);
  if (appendix) return appendixToMarkdown(html);
  const number = /<!-- number:([\d.]+) -->/.exec(html)?.[1] ?? "";
  const root = parse(html);
  const guideline = root.querySelector("section.guideline") ?? root;
  const h3 = guideline.querySelector("h3");
  const title = `${number} ${h3 ? text(h3).trim() : ""}`.trim();
  const abstract = inline(guideline.querySelector(":scope > p") ?? parse("")).trim();

  const out: string[] = [];
  let scNo = 0;
  for (const sc of guideline.querySelectorAll("section.sc")) {
    scNo++;
    const id = sc.getAttribute("id") ?? `sc-${scNo}`;
    const h4 = sc.querySelector("h4");
    const heading = h4 ? text(h4).trim() : id;
    const isNew = /\bnew\b/.test(sc.getAttribute("class") ?? "");
    out.push(`## ${number}.${scNo} ${heading}${isNew ? " (new in 2.2)" : ""} {#${id}}`);
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

/**
 * An appendix page: Input Purposes, or the Conformance chapter. Neither is a guideline, so there
 * are no success criteria and no conformance levels; each `<section id>` becomes one `##` heading
 * so the extractor keeps its prose attached to a citable anchor instead of dropping a page that
 * matches none of its shapes.
 *
 * These pages are bundled because a criterion is unusable without them: 1.3.5 names the Input
 * Purposes list as a condition of its own text, and "does this conform?" is a question about
 * cc1–cc5, not about the criteria one happened to review.
 */
export function appendixToMarkdown(html: string): { title: string; abstract: string; body: string } {
  const root = parse(html);
  // The chapter's own wrapper often carries no id (the Conformance chapter is `<section><h1>…`).
  // Its heading is the page title and its lead paragraph is the page abstract; dropping either
  // because it lacked an id would lose the sentence that says what the chapter is for.
  // Only a wrapper *without* an id contributes an abstract: one with an id is emitted by the
  // section loop below, and taking its lead paragraph as well printed that paragraph twice.
  const first = root.querySelector("section");
  const wrapper = first && !first.getAttribute("id") ? first : undefined;
  const wrapperHeading = wrapper?.querySelector(":scope > h1, :scope > h2");
  const sections = root.querySelectorAll("section[id]");
  const title = wrapperHeading
    ? text(wrapperHeading).trim()
    : sections[0]
      ? text(sections[0].querySelector("h1,h2,h3") ?? sections[0]).trim()
      : "Appendix";
  const abstract = wrapper ? inline(wrapper.querySelector(":scope > p") ?? parse("")).trim() : "";
  const out: string[] = [];
  // Top-level sections first; a nested section is emitted by its own iteration, not twice.
  for (const sec of sections) {
    const heading = sec.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4");
    out.push(`## ${heading ? text(heading).trim() : (sec.getAttribute("id") ?? "")} {#${sec.getAttribute("id")}}`);
    for (const child of sec.childNodes) {
      if (child.nodeType !== 1) continue;
      const el = child as HTMLElement;
      if (el === heading) continue;
      if (el.tagName === "SECTION" && el.getAttribute("id")) continue; // emitted as its own heading
      const md = block(el);
      if (md) out.push(md);
    }
  }
  return { title, abstract, body: out.join("\n\n") };
}

/**
 * Glossary: a concatenation of guidelines/terms/*.html includes, each
 *   <dt><dfn id="dfn-x" data-lt="x">term</dfn> (qualifier)</dt><dd>definition…</dd>
 * → `## term (qualifier) {#dfn-x}` followed by the definition.
 */
export function glossaryToMarkdown(html: string): { title: string; abstract: string; body: string } {
  const root = parse(html);
  const out: string[] = [];
  const dts = root.querySelectorAll("dt");
  for (const dt of dts) {
    const dfn = dt.querySelector("dfn");
    const id = dfn?.getAttribute("id") ?? text(dt).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const term = text(dt).replace(/\s+/g, " ").trim();
    let dd = dt.nextElementSibling;
    while (dd && dd.tagName !== "DD") dd = dd.nextElementSibling;
    if (!dd) continue;
    out.push(`## ${term} {#${id}}`, blocks(dd));
  }
  return { title: "Glossary", abstract: "Definitions of the terms the success criteria depend on.", body: out.join("\n\n") };
}
