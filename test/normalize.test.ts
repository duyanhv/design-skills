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
