#!/usr/bin/env bun
/**
 * Requirement-to-evidence traceability.
 *
 * Each AUDIT finding is mapped to an assertion over the **shipped artifacts** — not over the source
 * code, and not over an intermediate value observed while the work was in progress. Everything here
 * reads `ir/` and `skills/` as they stand now and reports what it actually found.
 *
 * This exists because "I fixed it" and "the output is correct" are different claims, and only the
 * second one matters to someone using the skill. It needs the sources built locally:
 *
 *   bun run build apple-hig && bun run build wcag22 && bun run example
 *   bun run trace
 *
 * Sources that are not built are reported as skipped rather than passing vacuously.
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { PageIR } from "../schema/ir.ts";
import { exists, listFiles, paths, readJson } from "../util/fs.ts";
import { log } from "../util/log.ts";

interface Check {
  finding: string;
  requirement: string;
  /** Returns the observation. Throw to fail; return a string describing what was seen. */
  observe: () => Promise<string>;
}

async function loadPages(id: string): Promise<PageIR[]> {
  const files = await listFiles(paths.irPages(id), ".json");
  const out: PageIR[] = [];
  for (const f of files) out.push((await readJson<PageIR>(join(paths.irPages(id), f)))!);
  return out;
}

const ref = (skill: string, cat: string, page: string) => readFile(join(paths.skill(skill), "references", cat, `${page}.md`), "utf8");

const CHECKS: Check[] = [
  {
    finding: "1",
    requirement: "WCAG criteria keep the list and definition text that makes them satisfiable",
    observe: async () => {
      const doc = await ref("wcag22", "perceivable", "distinguishable");
      const required = [
        "Line height (line spacing) to at least 1.5 times the font size",
        "Letter spacing (tracking) to at least 0.12 times the font size",
        "Vertical scrolling content at a width equivalent to 320 CSS pixels",
        "Dismissible — A mechanism is available to dismiss the additional content",
        "Hoverable — If pointer hover can trigger the additional content",
        "Persistent — The additional content remains visible",
      ];
      const missing = required.filter((r) => !doc.includes(r));
      if (missing.length) throw new Error(`missing from the shipped reference: ${missing.join("; ")}`);
      return `${required.length}/${required.length} normative fragments present in the shipped reference`;
    },
  },
  {
    finding: "2",
    requirement: "Context that is not a rule survives into the shipped skill",
    observe: async () => {
      const pages = await loadPages("apple-hig");
      const notes = pages.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.notes.length, 0), 0);
      const intros = pages.reduce((n, p) => n + p.sections.length, 0);
      const buttons = await ref("apple-hig", "components", "buttons");
      for (const fragment of [
        "In visionOS, buttons don’t support custom hover effects",
        "use the [thin](https://developer.apple.com/documentation/swiftui/material/thin) material",
        "**Destructive.** — The button performs an action that can result in data destruction",
      ]) {
        if (!buttons.includes(fragment)) throw new Error(`Buttons reference lost: ${fragment.slice(0, 60)}`);
      }
      if (!/_\[figure: /.test(buttons)) throw new Error("no figure markers in the Buttons reference");
      return `${notes} rule notes and ${intros} section intros retained; visionOS note, material bullets and role definitions all present`;
    },
  },
  {
    finding: "3",
    requirement: "No rule's platform scope contradicts itself, and platform pages tag their rules",
    observe: async () => {
      const pages = await loadPages("apple-hig");
      let total = 0;
      const bad: string[] = [];
      for (const p of pages) {
        for (const r of p.rules) {
          total++;
          if (r.scope !== "general" && !r.platforms.length) bad.push(`${r.id}: scoped but unplatformed`);
          if (r.scope === "general" && r.platforms.length) bad.push(`${r.id}: general but platformed`);
          if (p.platforms.length && r.scope === "general") bad.push(`${r.id}: universal on a ${p.platforms.join("/")} page`);
        }
      }
      if (bad.length) throw new Error(`${bad.length} contradictions, e.g. ${bad[0]}`);
      const scoped = pages.filter((p) => p.platforms.length).length;
      const tv = await ref("apple-hig", "getting-started", "designing-for-tvos");
      if (!tv.includes("_[tvOS only]_")) throw new Error("tvOS overview rules are not tagged in the shipped reference");
      return `0 contradictions across ${total} rules; ${scoped} platform-scoped pages; tvOS guidance renders _[tvOS only]_`;
    },
  },
  {
    finding: "4",
    requirement: "Severity reports the source's wording; WCAG levels are not collapsed into severity",
    observe: async () => {
      const apple = await loadPages("apple-hig");
      const find = (fragment: string) => apple.flatMap((p) => p.rules).find((r) => r.statement.includes(fragment));
      const kb = find("keyboard-only work styles");
      if (!kb) throw new Error("the macOS keyboard-only rule is missing");
      if (kb.severity !== "should") throw new Error(`macOS keyboard-only is ${kb.severity}, expected should`);
      const consider = find("Consider using text when");
      if (consider?.severity !== "may") throw new Error(`"Consider using text…" is ${consider?.severity}, expected may`);

      const wcag = await loadPages("wcag22");
      const levels = new Map<string, Set<string>>();
      for (const p of wcag) {
        for (const r of p.rules) {
          if (r.kind !== "rule" || !r.conformance_level) continue;
          levels.set(r.conformance_level, (levels.get(r.conformance_level) ?? new Set()).add(r.severity));
        }
      }
      const aaa = levels.get("AAA");
      if (!aaa?.has("must") || aaa.size !== 1) throw new Error(`AAA criteria render as ${[...(aaa ?? [])].join("/")}, expected must`);
      const skill = await readFile(join(paths.skill("wcag22"), "SKILL.md"), "utf8");
      if (!skill.includes("conformance target")) throw new Error("SKILL.md does not tell the agent to establish a conformance target");
      return `macOS keyboard-only = SHOULD, "Consider using text…" = MAY, all AAA criteria normative, target selection documented`;
    },
  },
  {
    finding: "5 / 6",
    requirement: "Extraction reuse is keyed on all semantic inputs, and every page records one",
    observe: async () => {
      const pages = await loadPages("apple-hig");
      const without = pages.filter((p) => !p.input_hash);
      if (without.length) throw new Error(`${without.length} pages have no input_hash`);
      const unique = new Set(pages.map((p) => p.input_hash)).size;
      return `${pages.length} pages, ${unique} distinct input hashes, none missing`;
    },
  },
  {
    finding: "7",
    requirement: "A shipped skill carries rule ids, a pinned revision where one exists, and provenance",
    observe: async () => {
      const buttons = await ref("apple-hig", "components", "buttons");
      const ids = [...buttons.matchAll(/`apple-hig\/buttons\/\d{3}`/g)].length;
      if (!ids) throw new Error("no rule ids rendered in the Buttons reference");
      const prov = await readJson<{ source_revision: string | null; pages: unknown[] }>(join(paths.skill("wcag22"), "provenance.json"));
      if (!prov) throw new Error("wcag22 provenance.json missing");
      if (!prov.source_revision) throw new Error("wcag22 build is not pinned to a revision");
      const skill = await readFile(join(paths.skill("wcag22"), "SKILL.md"), "utf8");
      if (!skill.includes(prov.source_revision)) throw new Error("the pinned revision is not in SKILL.md frontmatter");
      return `${ids} rule ids in one reference; wcag22 pinned to ${prov.source_revision.slice(0, 12)} across ${prov.pages.length} pages`;
    },
  },
  {
    finding: "8",
    requirement: "Entry files stay inside the token budget with spec-conformant string metadata",
    observe: async () => {
      const out: string[] = [];
      for (const name of ["apple-hig", "wcag22", "lumen-ds"]) {
        const p = join(paths.skill(name), "SKILL.md");
        if (!(await exists(p))) continue;
        const text = await readFile(p, "utf8");
        const tokens = Math.ceil(text.length / 4);
        if (tokens > 5000) throw new Error(`${name} entry file is ~${tokens} tokens, over the 5k guidance`);
        const meta = /^metadata:\n((?:  .*\n)+)/m.exec(text)?.[1] ?? "";
        for (const line of meta.trim().split("\n")) {
          const value = line.split(/:\s*/).slice(1).join(": ");
          if (!/^".*"$/.test(value)) throw new Error(`${name} metadata value is not a string: ${line.trim()}`);
        }
        out.push(`${name} ~${tokens} tokens`);
      }
      if (!out.length) throw new Error("no skills built");
      return `${out.join(", ")}; all metadata values quoted`;
    },
  },
];

let failed = 0;
let skipped = 0;
for (const c of CHECKS) {
  // Skip rather than fail when a source has not been built locally; a vacuous pass is worse.
  const needs = [paths.irPages("apple-hig"), paths.irPages("wcag22")];
  if (!(await Promise.all(needs.map(exists))).every(Boolean)) {
    skipped++;
    console.log(`- finding ${c.finding}: skipped (build apple-hig and wcag22 first)`);
    continue;
  }
  try {
    const observed = await c.observe();
    console.log(`✓ finding ${c.finding} — ${c.requirement}\n    observed: ${observed}`);
  } catch (e) {
    failed++;
    console.log(`✗ finding ${c.finding} — ${c.requirement}\n    ${(e as Error).message}`);
  }
}

if (failed) {
  log.warn(`${failed}/${CHECKS.length} requirements are not satisfied by the shipped artifacts`);
  process.exit(1);
}
log.info(`${CHECKS.length - skipped}/${CHECKS.length} requirements verified against the shipped artifacts${skipped ? `, ${skipped} skipped` : ""}`);
