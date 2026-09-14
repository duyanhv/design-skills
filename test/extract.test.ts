import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { extractRules, platformsIn, latestDate, classify, pagePlatformsOf } from "../src/extract/rules.ts";
import { severityOf, valueOf } from "../src/extract/severity.ts";

const md = readFileSync(new URL("./fixtures/page.md", import.meta.url), "utf8");
const PLATFORMS = ["iOS", "iPadOS", "macOS", "watchOS", "visionOS", "tvOS"];
const SKIP = ["Resources", "Related", "Developer documentation", "Change log"];

test("bold-lead paragraphs become rules; labels become terms; nav and change log are dropped", () => {
  const page = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP });
  expect(page.summary).toBe("A toggle switches a single setting between two states.");
  expect(page.source_version).toBe("2024-06-10");
  const statements = page.rules.filter((r) => r.kind === "rule").map((r) => r.statement);
  expect(statements).toEqual([
    "Make toggles easy for people to reach.",
    "Don’t use a toggle for an action that takes effect later.",
    "Consider pairing a toggle with a short description.",
    "Be brief.",
    "Keep visuals consistent.",
    "Translate only the word Hey in “Hey Siri.”",
    "Use the sizes below.",
    "Use a label that names the setting, not the state.",
    "Prefer the switch style in lists of settings.",
    "Use a checkbox instead of a switch inside a form.",
    "Don't shrink toggles below 60x60 pt.",
  ]);
});

test("section path, anchor, platforms, severity and value", () => {
  const all = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP }).rules;
  expect(all.filter((r) => r.kind === "term").map((r) => r.statement)).toEqual(["Style", "Content", "Role", "Long delay.", "San Francisco (SF)"]);
  const rules = all.filter((r) => r.kind === "rule");
  const [reach, avoid, consider, , consistent, , , label, ios, mac, vision] = rules;
  expect(consistent!.rationale).toBe("Once set, keep it.");
  expect(reach!.section).toBe("Best practices");
  expect(reach!.anchor).toBe("Best-practices");
  expect(reach!.platforms).toEqual([]);
  expect(reach!.severity).toBe("should");
  expect(reach!.value).toBe("at least 44x44 pt");
  expect(reach!.rationale).toStartWith("Give a toggle a hit region");

  expect(avoid!.severity).toBe("must");
  expect(consider!.severity).toBe("may");
  expect(label!.section).toBe("Content");
  expect(label!.value).toBe("about 10 pixels");

  expect(ios!.platforms).toEqual(["iOS", "iPadOS"]);
  expect(ios!.anchor).toBe("iOS-iPadOS");
  expect(mac!.platforms).toEqual(["macOS"]);
  expect(mac!.section).toBe("Platform considerations › macOS › Checkboxes");
  expect(mac!.anchor).toBe("Checkboxes");
  expect(mac!.value).toBe("4.5:1");
  expect(vision!.platforms).toEqual(["visionOS"]);
  expect(vision!.severity).toBe("must");
  expect(vision!.value).toBe("60x60 pt");
});

test("tables under guidance sections are captured with section, anchor and caption; change-log tables are not", () => {
  const page = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP });
  expect(page.tables.length).toBe(2);
  expect(page.tables[0]!.caption).toBeUndefined(); // preceded by a rule paragraph, not a caption
  expect(page.tables[1]!.section).toBe("Style › Small");
  expect(page.tables[1]!.anchor).toBe("Small");
  expect(page.tables[1]!.caption).toBe("Sizes");
  expect(page.tables[1]!.markdown).toBe("| Attribute | Value |\n| --- | --- |\n| Width | 155 pt |");
  const sizes = page.rules.find((r) => r.statement === "Use the sizes below.")!;
  expect(sizes.rationale).toBe("Pick by context; see [Layout](/design/human-interface-guidelines/layout)."); // links survive for cross-referencing
});

test("overview pages: abstract is first paragraph; plain best-practice bullets become rules", () => {
  const md = readFileSync(new URL("./fixtures/overview.md", import.meta.url), "utf8");
  const page = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP });
  expect(page.summary).toBe("People enjoy the big screen from across the room.");
  expect(page.rules.map((r) => r.statement)).toEqual([
    "Help people concentrate on content by limiting onscreen controls.",
    "Adapt to appearance changes like Dark Mode.",
  ]);
  expect(page.rules[0]!.rationale).toBe("Secondary actions stay discoverable.");
  expect(page.rules[0]!.anchor).toBe("Best-practices");
});

test("classify", () => {
  expect(classify("Be brief.")).toBe("rule");
  expect(classify("Use symbols.")).toBe("rule");
  expect(classify("Long delay.")).toBe("term");
  expect(classify("Custom view.")).toBe("term");
  expect(classify("Poster pass backgrounds")).toBe("term");
  expect(classify("Keep visuals and interactions consistent")).toBe("term");
  expect(classify("Make buttons easy for people to use.")).toBe("rule");
});

test("helpers", () => {
  expect(platformsIn("iOS, iPadOS", PLATFORMS)).toEqual(["iOS", "iPadOS"]);
  expect(platformsIn("Push buttons", PLATFORMS)).toEqual([]);
  expect(platformsIn("iOS and visionOS", PLATFORMS)).toEqual(["iOS", "visionOS"]);
  expect(latestDate("2023-01-02 and March 3, 2025")).toBe("2025-03-03");
  expect(severityOf("Never block the main thread.")).toBe("must");
  expect(severityOf("Don’t block the main thread.")).toBe("must");
  expect(severityOf("Configure a spinner when you need to wait.")).toBe("should");
  expect(severityOf("In rare cases, consider using only a dark appearance.")).toBe("may");
  expect(severityOf("Use system colors.")).toBe("should");
  expect(valueOf("Keep alerts under 3 seconds.")).toBe("3 seconds");
  expect(valueOf("Nothing numeric here.")).toBeUndefined();
});

test("severity reports the source's wording and does not invent authority", () => {
  // Regression: "only" inside a compound adjective used to promote a suggestion to MUST.
  expect(severityOf("Consider using an icon-only button.")).toBe("may");
  expect(severityOf("Support keyboard-only work styles.")).toBe("should");
  expect(severityOf("Use an icon-only button in a toolbar.")).toBe("should");
  // "only" that genuinely restricts still reads as a requirement.
  expect(severityOf("Display only one sheet at a time.")).toBe("must");
  expect(severityOf("Use a sheet only when the task requires it.")).toBe("must");
  expect(severityOf("Request access only to data that you actually need.")).toBe("must");
  // Hedged phrasing caps a strong word at SHOULD instead of asserting an absolute.
  expect(severityOf("In general, avoid long labels.")).toBe("should");
  expect(severityOf("Prefer to avoid custom controls.")).toBe("should");
});

test("page-level platform scope", () => {
  expect(pagePlatformsOf("Designing for visionOS", PLATFORMS)).toEqual(["visionOS"]);
  expect(pagePlatformsOf("Designing for tvOS", PLATFORMS)).toEqual(["tvOS"]);
  expect(pagePlatformsOf("Buttons", PLATFORMS)).toEqual([]);
  // "iPadOS" must not be read as an iOS page, and vice versa.
  expect(pagePlatformsOf("Designing for iPadOS", PLATFORMS)).toEqual(["iPadOS"]);
});

test("platform-specific pages do not produce universal rules", () => {
  const md = readFileSync(new URL("./fixtures/overview.md", import.meta.url), "utf8");
  const page = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP, title: "Designing for tvOS" });
  expect(page.platforms).toEqual(["tvOS"]);
  for (const r of page.rules) {
    expect(r.scope).toBe("page");
    expect(r.platforms).toEqual(["tvOS"]);
  }
  // A manifest override wins over title detection for pages whose title names no platform.
  const digital = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP, title: "Digital Crown", pagePlatforms: ["watchOS"] });
  expect(digital.rules[0]!.platforms).toEqual(["watchOS"]);
  expect(digital.rules[0]!.scope).toBe("page");
});

test("context that is not a rule is kept, not dropped", () => {
  const page = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP });

  // Prose after the abstract and before the first heading: what the component is.
  expect(page.overview).toEqual([]); // this fixture's abstract is its only pre-heading paragraph

  // A section's framing sentence survives as its intro.
  const best = page.sections.find((s) => s.section === "Best practices")!;
  expect(best.intro).toContain("Toggles are made of three things:");
  expect(best.anchor).toBe("Best-practices");

  // Supporting prose that follows a rule is attached to that rule, not thrown away.
  const checkbox = page.rules.find((r) => r.statement.startsWith("Use a checkbox"))!;
  expect(checkbox.platforms).toEqual(["macOS"]);

  // A note under a rule carries its exception.
  const brief = page.rules.find((r) => r.statement === "Be brief.")!;
  expect(brief.notes.join(" ")).toContain("Exception: a long label is fine in a settings list.");

  // An aside before any rule in a section lands in the section intro.
  const content = page.sections.find((s) => s.section === "Content");
  expect(content?.intro.join(" ")).toContain("**Note:** labels are localized.");

  // Context is kept verbatim — bold labels and list markers are part of the meaning.
  const overview = readFileSync(new URL("./fixtures/overview.md", import.meta.url), "utf8");
  const tv = extractRules(overview, { platforms: PLATFORMS, skipSections: SKIP });
  expect(tv.overview).toContain("Some more preamble that is not the abstract.");
  expect(tv.overview).toContain("**Display.** The TV is large.");
});

test("context past the cap is marked, never silently dropped", () => {
  // Regression: the cap was 12 blocks, so Apple's Virtual keyboards page — a catalogue of ~10
  // keyboard types as label/figure pairs under one rule — lost half its entries with no trace.
  // A cap still exists, but overflow leaves a counted marker pointing at the source.
  const md = [
    "# Topic",
    "",
    "Abstract.",
    "",
    "## Best practices {#bp}",
    "",
    "**A rule with a long catalogue under it.** Why it matters.",
    ...Array.from({ length: 50 }, (_, i) => `- item ${i}`),
  ].join("\n");
  const page = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP, url: "https://example.test/topic" });
  const rule = page.rules.find((r) => r.statement.startsWith("A rule with a long catalogue"))!;

  // Real pages stay well under the cap; this synthetic one exceeds it deliberately.
  expect(rule.notes.length).toBeLessThan(50);
  const last = rule.notes[rule.notes.length - 1]!;
  expect(last).toContain("not included");
  expect(last).toContain("https://example.test/topic");
  // The count must be accurate: 50 items, 40 kept, 10 reported missing.
  expect(last).toContain("10 further");

  // A page that fits keeps everything and gains no marker.
  const small = extractRules(
    ["# T", "", "Abstract.", "", "## Best practices {#bp}", "", "**A rule.** Why.", "- one", "- two"].join("\n"),
    { platforms: PLATFORMS, skipSections: SKIP },
  );
  expect(small.rules[0]!.notes).toEqual(["- one", "- two"]);
});
