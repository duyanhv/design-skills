import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { doccToMarkdown } from "../src/normalize/docc.ts";
import { slugFor } from "../src/fetch/docc.ts";
import { parseFrontmatter, withFrontmatter } from "../src/normalize/frontmatter.ts";

const doc = JSON.parse(readFileSync(new URL("./fixtures/docc-page.json", import.meta.url), "utf8"));

test("docc → markdown covers headings, inline, lists, tables, asides, unknown blocks", () => {
  const { title, abstract, body } = doccToMarkdown(doc);
  expect(title).toBe("Widgets");
  expect(abstract).toBe("A widget shows a glanceable slice of an app.");
  expect(body).toContain("## Best practices {#Best-practices}");
  expect(body).toContain("**Keep it glanceable.** Show one idea. See [Layout](/design/human-interface-guidelines/layout) for spacing.");
  expect(body).toContain("- Use `TimelineProvider`\n- Avoid scrolling");
  expect(body).toContain("| Size | Use |\n| --- | --- |\n| Small | One stat |");
  expect(body).toContain("> **Note:** Widgets refresh on a budget.");
  expect(body).toContain("Unknown blocks still surface text.");
  expect(body).not.toContain("img-1");
  // A tab whose heading already carries the label ("Small" / "Small widget") is not labelled twice,
  // and its content follows its own heading rather than the previous section's.
  expect(body).toContain("#### Small widget {#Small-widget}\n\n| Attribute | Value |\n| --- | --- |\n| Width | 155 pt |");
  expect(body).not.toContain("**Small**\n\n#### Small widget");
  expect(body).not.toContain("**Empty**");
  expect(body).toContain("See `fooColor`"); // API symbol refs have fragments, not a title
});

test("images become visible placeholders instead of disappearing", () => {
  // Regression: figures were dropped silently, so "use the sizes below" pointed at nothing and
  // image-only table cells rendered blank.
  const { body } = doccToMarkdown(doc);
  expect(body).toContain("_[figure: A small widget showing one statistic.]_");
  expect(body).toContain("for spacing. _[figure:"); // kept out of the sentence it follows
  // A cell that is nothing but a checkmark image says "available" rather than being empty.
  expect(body).toContain("| Circular | ✓ |");
});

test("a standalone block video leaves a marker naming the asset, not nothing at all", () => {
  // Regression (finding A1): block `image`/`video` nodes emitted an empty string, so 61 videos —
  // every one of which carries a source alternative description, and several of which are the only
  // demonstration of a behaviour on their page — vanished with no trace at all. A reader could not
  // tell a missing demonstration from a page that never had one.
  const { body } = doccToMarkdown(doc);
  expect(body).toContain(
    "_[figure: video — A video showing a widget updating its statistic once an hour. — source: refresh-demo.mp4]_",
  );
  // "video" distinguishes a demonstration over time from a still; the locator names the figure on
  // the original page so the marker can be checked against it.
  expect(body).not.toContain("_[figure: A video showing a widget");
});

test("an occurrence's caption stays beside its own media and separate from the alt text", () => {
  // The alternative description describes the picture ("An X in a circle"); the caption states the
  // rule ("Don't place a widget's title outside its background"). They are different claims, so
  // they are labelled separately rather than merged into one sentence in Apple's voice.
  const { body } = doccToMarkdown(doc);
  expect(body).toContain(
    "_[figure: An X in a circle to indicate an incorrect example. — caption: Don’t place a widget’s title outside its background. — source: crossout.png]_",
  );
});

test("the same asset reused in two tabs keeps each tab's own caption under its own heading", () => {
  // crossout.png appears in both tabs of the example pair. A caption read from the *asset* would
  // give both occurrences the same text; it belongs to the occurrence. And a tab's illustration
  // must sit under that tab's heading, not the previous one's.
  const { body } = doccToMarkdown(doc);
  expect(body).toContain(
    "#### Aligned grid {#Aligned-grid}\n\n_[figure: A checkmark in a circle to indicate a correct example. — caption: Align widget content to the grid. — source: grid-ok.png]_",
  );
  expect(body).toContain(
    "#### Bleeding grid {#Bleeding-grid}\n\n_[figure: An X in a circle to indicate an incorrect example. — caption: Don’t let content bleed past the grid margins. — source: crossout.png]_",
  );
});

test("rendering is deterministic: the same document normalizes byte-identically", () => {
  expect(doccToMarkdown(doc).body).toBe(doccToMarkdown(JSON.parse(JSON.stringify(doc))).body);
});

test("a link's overriding title is used, not the target page's title", () => {
  // "motion" pointing at motion#visionOS used to render as "visionOS", inverting the sentence.
  const { body } = doccToMarkdown(doc);
  expect(body).toContain("Avoid displaying [motion](/design/human-interface-guidelines/motion) that’s jarring.");
});

test("slugs are stable and flat", () => {
  const entry = "/design/human-interface-guidelines";
  expect(slugFor(entry, entry)).toBe("index");
  expect(slugFor(entry, `${entry}/buttons`)).toBe("buttons");
  expect(slugFor(entry, `${entry}/a/b`)).toBe("a--b");
});

test("frontmatter round-trips", () => {
  const text = withFrontmatter({ title: 'Say "hi"', words: 3 }, "body");
  const { meta, body } = parseFrontmatter(text);
  expect(meta.title).toBe('Say "hi"');
  expect(meta.words).toBe("3");
  expect(body.trim()).toBe("body");
});
