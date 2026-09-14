import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { extractRules, platformsIn, latestDate, classify } from "../src/extract/rules.ts";
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
  const [reach, avoid, consider, , consistent, , label, ios, mac, vision] = rules;
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
  expect(severityOf("Use system colors.")).toBe("should");
  expect(valueOf("Keep alerts under 3 seconds.")).toBe("3 seconds");
  expect(valueOf("Nothing numeric here.")).toBeUndefined();
});
