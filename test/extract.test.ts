import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { extractRules, platformsIn, latestDate } from "../src/extract/rules.ts";
import { severityOf, valueOf } from "../src/extract/severity.ts";

const md = readFileSync(new URL("./fixtures/page.md", import.meta.url), "utf8");
const PLATFORMS = ["iOS", "iPadOS", "macOS", "watchOS", "visionOS", "tvOS"];
const SKIP = ["Resources", "Related", "Developer documentation", "Change log"];

test("bold-lead paragraphs become rules; labels, nav and change log do not", () => {
  const page = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP });
  expect(page.summary).toBe("A toggle switches a single setting between two states.");
  expect(page.source_version).toBe("2024-06-10");
  const statements = page.rules.map((r) => r.statement);
  expect(statements).toEqual([
    "Make toggles easy for people to reach.",
    "Avoid using a toggle for an action that takes effect later.",
    "Consider pairing a toggle with a short description.",
    "Use a label that names the setting, not the state.",
    "Prefer the switch style in lists of settings.",
    "Use a checkbox instead of a switch inside a form.",
    "Don't shrink toggles below 60x60 pt.",
  ]);
});

test("section path, anchor, platforms, severity and value", () => {
  const { rules } = extractRules(md, { platforms: PLATFORMS, skipSections: SKIP });
  const [reach, avoid, consider, label, ios, mac, vision] = rules;
  expect(reach!.section).toBe("Best practices");
  expect(reach!.anchor).toBe("Best-practices");
  expect(reach!.platforms).toEqual([]);
  expect(reach!.severity).toBe("should");
  expect(reach!.value).toBe("at least 44x44 pt");
  expect(reach!.rationale).toStartWith("Give a toggle a hit region");

  expect(avoid!.severity).toBe("must");
  expect(consider!.severity).toBe("may");
  expect(label!.section).toBe("Content");

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

test("helpers", () => {
  expect(platformsIn("iOS, iPadOS", PLATFORMS)).toEqual(["iOS", "iPadOS"]);
  expect(platformsIn("Push buttons", PLATFORMS)).toEqual([]);
  expect(platformsIn("iOS and visionOS", PLATFORMS)).toEqual(["iOS", "visionOS"]);
  expect(latestDate("2023-01-02 and March 3, 2025")).toBe("2025-03-03");
  expect(severityOf("Never block the main thread.")).toBe("must");
  expect(severityOf("Use system colors.")).toBe("should");
  expect(valueOf("Keep alerts under 3 seconds.")).toBe("3 seconds");
  expect(valueOf("Nothing numeric here.")).toBeUndefined();
});
