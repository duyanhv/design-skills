import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { wcagToMarkdown } from "../src/normalize/wcag.ts";
import { extractWcag } from "../src/extract/wcag.ts";

const html = readFileSync(new URL("./fixtures/wcag-guideline.html", import.meta.url), "utf8");

test("wcag html → markdown: numbered SC headings, level line, dl exceptions, notes", () => {
  const { title, abstract, body } = wcagToMarkdown(html);
  expect(title).toBe("9.2 Legible");
  expect(abstract).toBe("Make text easy to read.");
  expect(body).toContain("## 9.2.1 Minimum Size {#minimum-size}\n\n**Level AA**\n\nBody text is rendered at least [16 px](#dfn-large) tall, except for the following:");
  expect(body).toContain("- **Captions** — Caption text may be 12 px.\n- **Logotypes** — Text in a logo has no size requirement.");
  expect(body).toContain("> **Note:** Rendered size, not authored size, is measured.");
  expect(body).toContain("## 9.2.2 Line Length {#line-length}\n\n**Level AAA**\n\n_New_\n\nLines of text contain no more than 80 characters.");
  expect(body).toContain("## 9.2.3 Blink (Obsolete and removed) {#blink}");
});

test("wcag extract: one rule per SC, level → severity/value, obsolete → term", () => {
  const page = extractWcag(wcagToMarkdown(html).body);
  expect(page.rules.length).toBe(3);
  const [min, len, blink] = page.rules;
  expect(min!.kind).toBe("rule");
  expect(min!.section).toBe("9.2.1 Minimum Size");
  expect(min!.anchor).toBe("minimum-size");
  expect(min!.severity).toBe("must");
  expect(min!.value).toBe("Level AA");
  expect(min!.statement).toBe("Body text is rendered at least 16 px tall, except for the following:");
  expect(min!.rationale).toBe("- Captions — Caption text may be 12 px. - Logotypes — Text in a logo has no size requirement. Note: Rendered size, not authored size, is measured.");
  expect(len!.severity).toBe("may");
  expect(len!.statement).toBe("Lines of text contain no more than 80 characters.");
  expect(blink!.kind).toBe("term");
  expect(blink!.statement).toBe("9.2.3 Blink (Obsolete and removed)");
});
