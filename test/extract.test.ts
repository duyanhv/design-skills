import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { extractRules, platformsIn, latestDate, classify, pagePlatformsOf, mergeBoldLead } from "../src/extract/rules.ts";
import { assignIds } from "../src/extract/index.ts";
import type { PageIR } from "../src/schema/ir.ts";
import { ruleValue, severityOf, valueOf } from "../src/extract/severity.ts";

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
  // The padding figure is in the rationale's second sentence, which states it plainly rather than
  // illustrating it, so it is still this rule's value.
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
    ["# T", "", "Abstract.", "", "## Best practices {#bp}", "", "**Keep the label short.** Why.", "- one", "- two"].join("\n"),
    { platforms: PLATFORMS, skipSections: SKIP },
  );
  expect(small.rules[0]!.notes).toEqual(["- one", "- two"]);
});

test("a definition ends with its own line; the prose after it is not part of the definition", () => {
  // Apple's Buttons page: a role definition followed by a sentence about roles in general, then a
  // figure. Attaching those to the term made an agent quoting "the Destructive role" cite a sentence
  // about primary buttons (AUDIT-OUTPUT finding 2).
  const md = [
    "# Buttons",
    "",
    "A button initiates an action.",
    "",
    "## Anatomy {#Anatomy}",
    "",
    "**Destructive.** The button performs an action that can result in data destruction.",
    "",
    "A button's role can have additional effects on its appearance.",
    "",
    "_[figure: An example alert with three system buttons.]_",
  ].join("\n");
  const page = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP });
  const term = page.rules.find((r) => r.statement === "Destructive.")!;
  expect(term.kind).toBe("term");
  expect(term.rationale).toBe("The button performs an action that can result in data destruction.");
  expect(term.notes).toEqual([]);

  // The prose is not lost — it moves to the section, after the definition.
  const intro = page.sections.filter((s) => s.section === "Anatomy").flatMap((s) => s.intro);
  expect(intro).toContain("A button's role can have additional effects on its appearance.");
  expect(intro.join(" ")).toContain("_[figure:");
  // …and it sorts after the term, so the reference renders it in source order.
  expect(page.sections.find((s) => s.intro.includes("A button's role can have additional effects on its appearance."))!.order)
    .toBeGreaterThan(term.order);
});

test("a bold lead the source split across two spans is one statement", () => {
  expect(mergeBoldLead("**Consider** **presenting a Now Playing view.** The system also…"))
    .toBe("**Consider presenting a Now Playing view.** The system also…");
  // A bullet keeps its marker.
  expect(mergeBoldLead("- **Use** **the thin material.** Why.")).toBe("- **Use the thin material.** Why.");
  // Emphasis later in a paragraph is not a split lead.
  expect(mergeBoldLead("Read **Note** and **Tip** first.")).toBe("Read **Note** and **Tip** first.");

  const md = ["# Playing audio", "", "Audio.", "", "## Best practices {#bp}", "",
    "**Consider** **presenting a Now Playing view so people can control audio.** The system shows the source."].join("\n");
  const rule = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP }).rules[0]!;
  expect(rule.kind).toBe("rule");
  expect(rule.statement).toBe("Consider presenting a Now Playing view so people can control audio.");
  expect(rule.severity).toBe("may");
});

test("every block records its source position, so a reference can render in source order", () => {
  const page = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP });
  const orders = [
    ...page.rules.map((r) => r.order),
    ...page.sections.map((s) => s.order),
    ...page.tables.map((t) => t.order),
  ];
  expect(new Set(orders).size).toBe(orders.length); // one counter, no collisions
  // "Use the sizes below." precedes the table it refers to.
  const sizes = page.rules.find((r) => r.statement === "Use the sizes below.")!;
  expect(page.tables[0]!.order).toBeGreaterThan(sizes.order);
  // The "Platform considerations" intro ("No additional considerations for tvOS") comes before the
  // platform rules under it, as it does in the source.
  const intro = page.sections.find((s) => s.section === "Platform considerations")!;
  const iosRule = page.rules.find((r) => r.statement.startsWith("Prefer the switch style"))!;
  expect(intro.order).toBeLessThan(iosRule.order);
});

test("a value badge is the rule's own figure, not the first number anywhere in its body", () => {
  // In the statement: kept.
  expect(ruleValue("Give a toggle a hit region of at least 44x44 pt.")).toBe("at least 44x44 pt");
  // A bounded figure is the rule's constraint and outranks a bare figure beside it.
  expect(ruleValue("Make buttons easy to use.", "A button needs a hit region of at least 44x44 pt \u2014 in visionOS, 60x60 pt \u2014 so people can select it."))
    .toBe("at least 44x44 pt");
  // A range is one value and is kept whole; matching only its upper bound would state a floor the
  // source never set.
  expect(ruleValue("Keep frame rates smooth.", "Maintain a consistent frame rate of 30 to 60 fps for a smooth experience.")).toBe("30 to 60 fps");
  // Two figures with equal claim: one badge cannot stand for both (AUDIT-OUTPUT finding 5).
  expect(ruleValue("Adhere to the screen's safe area.", "Inset primary content 60 points from the top and bottom, and 80 points from the sides."))
    .toBeUndefined();
  // An illustration is one app's choice, not the guideline's requirement.
  expect(ruleValue("Keep double tap in mind.", "Order matters. For example, a parking app could offer 5 minutes.")).toBeUndefined();
  expect(ruleValue("Aid comprehension by adding descriptive text.", "Text helps. For example, Weather summarizes the next 24 hours.")).toBeUndefined();
  expect(ruleValue("Nothing numeric here.", "Nor here.")).toBeUndefined();
});

test("severity reads the main clause, not the rule's stated goal", () => {
  // "avoid"/"ensure" inside a purpose clause is the goal; the directive is "choose", "keep", "define".
  expect(severityOf("Choose items deliberately to avoid overcrowding.")).toBe("should");
  expect(severityOf("Keep primary content centered to avoid truncation.")).toBe("should");
  expect(severityOf("Define rules to help ensure your tips reach the intended audience.")).toBe("should");
  // A prohibition in the main clause is still a MUST.
  expect(severityOf("Avoid overcrowding the screen.")).toBe("must");
  expect(severityOf("Never block the main thread to keep scrolling smooth.")).toBe("must");

  // A modal is permission only when it governs the reader.
  expect(severityOf("Recognize that people can have more than one home.")).toBe("should");
  expect(severityOf("Show people whether a destination can accept dragged content.")).toBe("should");
  expect(severityOf("You can use a custom control when the system one does not fit.")).toBe("may");
  expect(severityOf("Consider pairing a toggle with a description.")).toBe("may");
});

test("a rule id survives a rebuild, even when a page states the same sentence twice", () => {
  // Apple's Machine learning page says "Always secure people's information." under two sections.
  // The old lookup kept one id per statement, so the first occurrence took the second's id and the
  // first's id was orphaned — re-extracting identical input renumbered both, every time. Ids are
  // what an agent quotes and a human checks, so they have to be a fixed point.
  const statements = ["Be brief.", "Always secure it.", "Use symbols.", "Always secure it."];
  const first = assignIds("s", "p", null, statements);
  expect(first).toEqual(["s/p/001", "s/p/002", "s/p/003", "s/p/004"]);

  const asIR = (ids: string[]): PageIR =>
    ({ rules: ids.map((id, i) => ({ id, statement: statements[i]! })) }) as unknown as PageIR;

  // Re-extracting the same page must return the same ids, and keep doing so.
  const second = assignIds("s", "p", asIR(first), statements);
  expect(second).toEqual(first);
  expect(assignIds("s", "p", asIR(second), statements)).toEqual(first);

  // The nth occurrence keeps the nth id rather than swapping with its twin.
  expect(second[1]).toBe("s/p/002");
  expect(second[3]).toBe("s/p/004");

  // A new statement is numbered after the previous max; the survivors keep their ids.
  const grown = assignIds("s", "p", asIR(first), [...statements, "Keep it short."]);
  expect(grown.slice(0, 4)).toEqual(first);
  expect(grown[4]).toBe("s/p/005");
});
