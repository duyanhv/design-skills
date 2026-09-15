import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { wcagToMarkdown, appendixToMarkdown } from "../src/normalize/wcag.ts";
import { extractWcag, extractGlossary, extractAppendix } from "../src/extract/wcag.ts";

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
  // The link survives into the statement: flattening it is what made 1.3.5's Input Purposes
  // dependency unreachable from the shipped skill (audit A3). `value` still reads the prose.
  expect(min!.statement).toBe("Body text is rendered at least [16 px](#dfn-large) tall, except for the following:");

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
  // They are also labelled by authority now: an exception is a condition of the criterion, a Note
  // is advisory. Both are kept; only one can fail a component (audit A2).
  expect(min.notes).toEqual([
    "- Captions — Caption text may be 12 px.",
    "- Logotypes — Text in a logo has no size requirement, unless essential.",
    "_[informative]_ Note: Rendered size, not authored size, is measured.",
  ]);
  expect(min.note_authority).toEqual(["normative", "normative", "informative"]);
  expect(min.rationale).toBeUndefined();
});

test("an exception is never labelled informative, whatever words it uses", () => {
  // The split is worthless if it leaks: labelling the Logotypes exception would tell a reader to
  // disregard the condition that makes a small logo conforming. Authority is read from the markup
  // the source used (`p.note`, `aside.example`), not from the prose.
  const page = extractWcag(wcagToMarkdown(html).body);
  const min = page.rules[0]!;
  for (const [i, note] of min.notes.entries()) {
    const informative = note.startsWith("_[informative]_");
    expect(informative).toBe(min.note_authority![i] === "informative");
  }
  expect(min.notes.filter((n) => n.startsWith("_[informative]_")).length).toBe(1);
});

test("an aside.example is informative too, and says so", () => {
  // W3C names examples in the same sentence as notes. They used to arrive as an ordinary
  // paragraph — normative-looking prose sitting beside real conditions.
  const src = `<!-- number:9.3 -->
<section class="guideline"><h3>Timely</h3><p>Intro.</p>
<section class="sc" id="soon"><h4>Soon</h4>
<p class="conformance-level">A</p>
<p>Content appears promptly.</p>
<aside class="example"><p>A store's checkout pages all load within a second.</p></aside>
</section></section>`;
  const body = wcagToMarkdown(src).body;
  expect(body).toContain("> **Example:** A store's checkout pages all load within a second.");
  const rule = extractWcag(body).rules[0]!;
  expect(rule.notes).toEqual(["_[informative]_ Example: A store's checkout pages all load within a second."]);
  expect(rule.note_authority).toEqual(["informative"]);
});

test("a criterion's link to another section survives into the rule", () => {
  // Audit A3 in miniature: the extractor flattened `[…](#input-purposes)` to its label, so the
  // shipped reference named a section the reader had no way to reach. Compose rewrites a surviving
  // link into the local reference file; there is nothing to rewrite if extraction ate it.
  const src = `<!-- number:1.3 -->
<section class="guideline"><h3>Adaptable</h3><p>Intro.</p>
<section class="sc" id="identify-input-purpose"><h4>Identify Input Purpose</h4>
<p class="conformance-level">AA</p>
<p>The purpose of each input field can be determined when:</p>
<ul><li>The input field serves a purpose identified in the <a href="#input-purposes">Input Purposes section</a>; and</li></ul>
</section></section>`;
  const rule = extractWcag(wcagToMarkdown(src).body).rules[0]!;
  expect(rule.notes[0]).toBe("- The input field serves a purpose identified in the [Input Purposes section](#input-purposes); and");
});

test("a bundled appendix becomes prose sections with anchors, never invented rules", () => {
  // Input Purposes and the Conformance chapter are normative but are not success criteria. Pushing
  // them through the SC shape made every heading a "term", and compose filed cc2 Full pages under
  // "Definitions" — the compiler restating the source in a shape the source did not use.
  const src = `<!-- appendix:normative -->
<section><h1>Conformance</h1><p>This section lists requirements for conformance.</p>
<section id="cc2"><h3>Full pages</h3>
<p>Conformance is for full web pages only.</p>
<p class="note">Alternatives obtained directly from the page count as part of it.</p>
</section>
<section id="cc3"><h3>Complete processes</h3>
<p>All web pages in the process conform at the specified level or better.</p>
<aside class="example"><p>An online store has a series of pages.</p></aside>
</section></section>`;
  const md = appendixToMarkdown(src);
  expect(md.title).toBe("Conformance");
  expect(md.abstract).toBe("This section lists requirements for conformance.");
  const page = extractAppendix(md.body);
  expect(page.rules).toEqual([]); // no criteria here, so no rules are invented
  expect(page.sections.map((s) => [s.section, s.anchor])).toEqual([
    ["Full pages", "cc2"],
    ["Complete processes", "cc3"],
  ]);
  expect(page.sections[0]!.intro).toEqual([
    "Conformance is for full web pages only.",
    "_[informative]_ Note: Alternatives obtained directly from the page count as part of it.",
  ]);
  expect(page.sections[1]!.intro).toEqual([
    "All web pages in the process conform at the specified level or better.",
    "_[informative]_ Example: An online store has a series of pages.",
  ]);
});

test("a list longer than one block continues into the next, instead of being cut off", () => {
  // Input Purposes is 6 KB of list. Joining the run with `.slice(0, MAX_BLOCK)` dropped its last
  // ten entries — every `tel-*` purpose — leaving a *defined set* that reads as complete and is
  // not. `fidelity` caught it; this is the unit-level guard.
  const items = Array.from({ length: 400 }, (_, i) => `<li><code>purpose-${i}</code> - Definition number ${i}</li>`).join("");
  const src = `<!-- appendix:reference -->
<section id="many"><h2>Many</h2><ul>${items}</ul></section>`;
  const page = extractAppendix(appendixToMarkdown(src).body);
  const all = page.sections[0]!.intro.join("\n");
  expect(all).toContain("- `purpose-0` - Definition number 0");
  expect(all).toContain("- `purpose-399` - Definition number 399");
  expect(all.split("\n").length).toBe(400);
  // Split across blocks rather than truncated, and no block exceeds the cap.
  expect(page.sections[0]!.intro.length).toBeGreaterThan(1);
  for (const b of page.sections[0]!.intro) expect(b.length).toBeLessThanOrEqual(4000);
});

test("an appendix keeps a long list as one block, and keeps its code spans", () => {
  // The Input Purposes list is 53 items. Pushed one block at a time, compose put a blank line
  // between every one and the defined set stopped reading as a list; stripping backticks turned
  // the autocomplete tokens an author actually writes into ordinary prose.
  const src = `<!-- appendix:reference -->
<section id="input-purposes"><h2>Input Purposes</h2>
<p>Common input purposes.</p>
<ul><li><code>given-name</code> - Given name</li><li><code>cc-exp-month</code> - Month component</li></ul>
</section>`;
  const page = extractAppendix(appendixToMarkdown(src).body);
  expect(page.sections[0]!.intro).toEqual([
    "Common input purposes.",
    "- `given-name` - Given name\n- `cc-exp-month` - Month component",
  ]);
});

test("glossary page: dt/dfn → term with anchor; the definition and its notes stay separate", () => {
  const html = readFileSync(new URL("./fixtures/wcag-glossary.html", import.meta.url), "utf8");
  const md = wcagToMarkdown(html);
  expect(md.title).toBe("Glossary");
  expect(md.body).toContain("## large scale (text) {#dfn-large-scale}\n\nwith at least 18 point or 14 point bold\n\n> **Note:** Font size is the size when the content is delivered.");
  const page = extractGlossary(`# Glossary\n\n${md.body}`);
  expect(page.rules.map((r) => [r.kind, r.statement, r.anchor])).toEqual([
    ["term", "large scale (text)", "dfn-large-scale"],
    ["term", "logo", "dfn-logo"],
  ]);
  // The definition is what the term *means*; a Note qualifies it. Joining the two ran every
  // glossary entry into one line, list markers and all (AUDIT-OUTPUT finding 8).
  expect(page.rules[0]!.rationale).toBe("with at least 18 point or 14 point bold");
  expect(page.rules[0]!.notes).toEqual(["_[informative]_ > **Note:** Font size is the size when the content is delivered."]);
  expect(page.rules[0]!.note_authority).toEqual(["informative"]);
});

test("a glossary definition that ends in an enumeration keeps the list as a list", () => {
  const body = [
    "## changes of context {#dfn-change-of-context}",
    "",
    "major changes that can disorient users who cannot view the entire page simultaneously",
    "",
    "Changes in context include changes of:",
    "",
    "- user agent;",
    "- viewport;",
    "- focus",
    "",
    "> **Note:** A change of content is not always a change of context.",
  ].join("\n");
  const term = extractGlossary(`# Glossary\n\n${body}`).rules[0]!;
  expect(term.rationale).toBe("major changes that can disorient users who cannot view the entire page simultaneously");
  // The lead-in keeps its own items, and the Note stays a separate block.
  expect(term.notes).toEqual([
    "Changes in context include changes of:\n  - user agent;\n  - viewport;\n  - focus",
    "_[informative]_ > **Note:** A change of content is not always a change of context.",
  ]);
  expect(term.note_authority).toEqual(["normative", "informative"]);
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
