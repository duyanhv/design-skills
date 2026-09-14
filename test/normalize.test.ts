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
  expect(body).toContain("**Small**\n\n#### Small widget {#Small-widget}\n\n| Attribute | Value |\n| --- | --- |\n| Width | 155 pt |");
  expect(body).not.toContain("**Empty**");
  expect(body).toContain("See `fooColor`"); // API symbol refs have fragments, not a title
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
