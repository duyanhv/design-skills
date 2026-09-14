import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { wcagToMarkdown } from "../src/normalize/wcag.ts";
import { extractWcag, extractGlossary } from "../src/extract/wcag.ts";

const html = readFileSync(new URL("./fixtures/wcag-guideline.html", import.meta.url), "utf8");

test("wcag html → markdown: numbered SC headings, level line, dl exceptions, notes", () => {
  const { title, abstract, body } = wcagToMarkdown(html);
  expect(title).toBe("9.2 Legible");
  expect(abstract).toBe("Make text easy to read.");
  expect(body).toContain("## 9.2.1 Minimum Size {#minimum-size}\n\n**Level AA**\n\nBody text is rendered at least [16 px](#dfn-large) tall, except for the following:");
  expect(body).toContain("- **Captions** — Caption text may be 12 px.\n- **Logotypes** — Text in a logo has no size requirement, unless _essential_.");
  expect(body).toContain("> **Note:** Rendered size, not authored size, is measured.");
  expect(body).toContain("## 9.2.2 Line Length (new in 2.2) {#line-length}\n\n**Level AAA**\n\n_New_\n\nLines of text contain no more than 80 characters.");
  expect(body).toContain("## 9.2.3 Blink (Obsolete and removed) {#blink}");
});

test("wcag extract: one rule per SC, conformance level is its own field, obsolete → term", () => {
  const page = extractWcag(wcagToMarkdown(html).body);
  expect(page.rules.length).toBe(3);
  const [min, len, blink] = page.rules;
  expect(min!.kind).toBe("rule");
  expect(min!.section).toBe("9.2.1 Minimum Size");
  expect(min!.anchor).toBe("minimum-size");
  expect(min!.conformance_level).toBe("AA");
  expect(min!.value).toBe("at least 16 px");
  expect(min!.statement).toBe("Body text is rendered at least 16 px tall, except for the following:");

  // AAA is normative text too; it is not demoted to "may". Applicability is the target's business.
  expect(len!.conformance_level).toBe("AAA");
  expect(len!.severity).toBe("must");
  expect(min!.severity).toBe("must");
  expect(len!.statement).toBe("Lines of text contain no more than 80 characters.");

  expect(blink!.kind).toBe("term");
  expect(blink!.conformance_level).toBeUndefined();
  expect(blink!.statement).toBe("9.2.3 Blink (Obsolete and removed)");
});

test("exceptions and notes stay as separate blocks attached to their criterion", () => {
  const page = extractWcag(wcagToMarkdown(html).body);
  const min = page.rules[0]!;
  // Regression: the audit found exception lists vanishing while the numbers survived in prose.
  expect(min.notes).toEqual([
    "- Captions — Caption text may be 12 px.",
    "- Logotypes — Text in a logo has no size requirement, unless essential.",
    "Note: Rendered size, not authored size, is measured.",
  ]);
  expect(min.rationale).toBeUndefined();
});

test("glossary page: dt/dfn → term with anchor, definition + notes as rationale", () => {
  const html = readFileSync(new URL("./fixtures/wcag-glossary.html", import.meta.url), "utf8");
  const md = wcagToMarkdown(html);
  expect(md.title).toBe("Glossary");
  expect(md.body).toContain("## large scale (text) {#dfn-large-scale}\n\nwith at least 18 point or 14 point bold\n\n> **Note:** Font size is the size when the content is delivered.");
  const page = extractGlossary(`# Glossary\n\n${md.body}`);
  expect(page.rules.map((r) => [r.kind, r.statement, r.anchor])).toEqual([
    ["term", "large scale (text)", "dfn-large-scale"],
    ["term", "logo", "dfn-logo"],
  ]);
  expect(page.rules[0]!.rationale).toBe("with at least 18 point or 14 point bold Note: Font size is the size when the content is delivered.");
});

test("new-in-2.2 marker lands in the SC heading", () => {
  expect(wcagToMarkdown(html).body).toContain("## 9.2.2 Line Length (new in 2.2) {#line-length}");
});

test("mixed-content li/dd keep their text (regression: plain text was dropped)", () => {
  // A list item written without <p>, with one emphasised word, and a definition list item that
  // mixes a bare sentence with a nested paragraph. Both shapes used to lose their prose.
  const mixed = `<!-- number:1.4 -->
<section class="guideline"><h3>Distinguishable</h3><p>Intro.</p>
<section class="sc" id="text-spacing"><h4>Text Spacing</h4>
<p class="conformance-level">AA</p>
<ul>
  <li>Line height to at least 1.5 times the font size;</li>
  <li>Spacing following paragraphs to at least <em>2 times</em> the font size;</li>
</ul>
<dl>
  <dt>Dismissible</dt>
  <dd>A mechanism is available to dismiss the additional content.<p>Except when it conveys an input error.</p></dd>
</dl>
</section></section>`;
  const body = wcagToMarkdown(mixed).body;
  expect(body).toContain("- Line height to at least 1.5 times the font size;");
  expect(body).toContain("- Spacing following paragraphs to at least _2 times_ the font size;");
  expect(body).toContain("A mechanism is available to dismiss the additional content.");
  expect(body).toContain("Except when it conveys an input error.");

  const rule = extractWcag(body).rules[0]!;
  const all = [rule.statement, ...rule.notes].join(" ");
  expect(all).toContain("Line height to at least 1.5 times the font size");
  expect(all).toContain("A mechanism is available to dismiss the additional content.");
});
