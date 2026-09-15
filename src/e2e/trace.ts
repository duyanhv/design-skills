#!/usr/bin/env bun
/**
 * Requirement-to-evidence traceability.
 *
 * Each AUDIT finding is mapped to an assertion over the **shipped artifacts** — not over the source
 * code, and not over an intermediate value observed while the work was in progress. Everything here
 * reads `ir/` and `skills/` as they stand now and reports what it actually found.
 *
 * Findings numbered `O-n` come from AUDIT-OUTPUT.md, which audited what the compiler produces
 * rather than the compiler itself.
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
import { exists, listDirs, listFiles, paths, readJson } from "../util/fs.ts";
import { composeFingerprint } from "../compose/fingerprint.ts";
import { assignIds } from "../extract/index.ts";
import { fidelityOf } from "./fidelity.ts";
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
    finding: "2 (completeness)",
    requirement: "No context is discarded silently: anything past the cap leaves a counted marker",
    observe: async () => {
      const pages = await loadPages("apple-hig");
      let capped = 0;
      let marked = 0;
      const lists = pages.flatMap((p) => [...p.rules.map((r) => r.notes), ...p.sections.map((s) => s.intro), p.overview]);
      for (const list of lists) {
        if (list.length >= 40) capped++;
        if (list.some((b) => b.includes("not included"))) marked++;
      }
      // Anything that hit the cap must carry a marker; a capped list with no marker is a silent loss.
      if (capped > marked) throw new Error(`${capped - marked} context lists hit the cap with no overflow marker`);
      const kb = pages.find((p) => p.page === "virtual-keyboards");
      const catalogue = kb?.rules.find((r) => r.statement.startsWith("Choose a keyboard"));
      if (!catalogue || catalogue.notes.length < 20) {
        throw new Error(`the keyboard-type catalogue kept only ${catalogue?.notes.length ?? 0} blocks`);
      }
      return `${lists.length} context lists, ${capped} at the cap, ${marked} marked; keyboard catalogue keeps ${catalogue.notes.length} blocks`;
    },
  },
  {
    finding: "3 (completeness)",
    requirement: "No page is platform-specific while shipping its rules as universal",
    observe: async () => {
      const pages = await loadPages("apple-hig");
      const platformNames = ["iOS", "iPadOS", "macOS", "watchOS", "visionOS", "tvOS"];
      // A page is platform-specific when its *title* names one platform ("Designing for tvOS") or a
      // single device ("Designing for iPhone Duo"). "Designing for games" is not: it is a topic that
      // spans all six, and scoping it would be as wrong as leaving tvOS guidance unscoped. The test
      // is the title, not the prefix — an earlier version of this check flagged games and was wrong.
      const DEVICE_SPECIFIC = /\b(iPhone|iPad|Mac|Apple Watch|Apple TV|Apple Vision)\b/;
      const unscoped = pages.filter((p) => {
        if (p.platforms.length) return false;
        const named = platformNames.some((n) => new RegExp(`(^|[^A-Za-z])${n}([^A-Za-z]|$)`).test(p.title));
        return named || DEVICE_SPECIFIC.test(p.title);
      });
      if (unscoped.length) {
        throw new Error(`unscoped but platform-specific: ${unscoped.map((p) => p.page).join(", ")} — add page_platforms`);
      }
      const scoped = pages.filter((p) => p.platforms.length);
      return `every "Designing for …" and platform-named page is scoped (${scoped.length} scoped pages overall)`;
    },
  },
  {
    finding: "4 (completeness)",
    requirement: "Every MUST is justified by the source's wording, and no absolute prohibition is downgraded",
    observe: async () => {
      const rules = (await loadPages("apple-hig")).flatMap((p) => p.rules);
      const strong = /\b(avoid|never|don't|do not|must|shouldn't|should not|cannot|can't|required|refrain from|always|ensure|make sure|be sure|be certain)\b/i;
      const restrictive = /(^|[^\w-])only\s/i;
      const absolute = /\b(never|must not|under no circumstances)\b/i;
      const unjustified: string[] = [];
      const downgraded: string[] = [];
      for (const r of rules) {
        const s = r.statement.replace(/\u2019/g, "'");
        if (r.severity === "must" && !strong.test(s) && !restrictive.test(s)) unjustified.push(r.id);
        if (r.severity !== "must" && absolute.test(s)) downgraded.push(r.id);
      }
      if (unjustified.length) throw new Error(`${unjustified.length} MUSTs with no strong wording, e.g. ${unjustified[0]}`);
      if (downgraded.length) throw new Error(`${downgraded.length} absolute prohibitions below MUST, e.g. ${downgraded[0]}`);
      return `${rules.length} rules: 0 unjustified MUSTs, 0 downgraded prohibitions`;
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
  {
    finding: "O-1",
    requirement: "Shipped Markdown was rendered by the current compose, and every source sentence survives it",
    observe: async () => {
      const out: string[] = [];
      for (const id of ["apple-hig", "wcag22"]) {
        const name = id === "apple-hig" ? "apple-hig" : "wcag22";
        const prov = await readJson<{ compose_fingerprint?: string }>(join(paths.skill(name), "provenance.json"));
        const current = await composeFingerprint();
        if (prov?.compose_fingerprint !== current) throw new Error(`${id} was rendered by compose ${prov?.compose_fingerprint ?? "(none)"}, current is ${current}`);
        // The sentence-level scan is what caught the stale render; vocabulary coverage could not.
        const { total, lost } = await fidelityOf(id);
        const missing = [...lost.values()].reduce((n, l) => n + l.length, 0);
        if (missing) throw new Error(`${id}: ${missing}/${total} source sentences absent from the shipped references`);
        out.push(`${id} ${total} sentences`);
      }
      return `compose fingerprint current for both sources; 0 sentences lost (${out.join(", ")})`;
    },
  },
  {
    finding: "O-2 / O-3",
    requirement: "A definition owns only its own text, and no rule is left without an id",
    observe: async () => {
      const pages = await loadPages("apple-hig");
      const terms = pages.flatMap((p) => p.rules.filter((r) => r.kind === "term"));
      // A term that absorbed the paragraphs after it is the finding-2 defect; on Apple pages a
      // definition is a single line, so any notes on one mean the swallow is back.
      const swallowed = terms.filter((t) => t.notes.length);
      if (swallowed.length) throw new Error(`${swallowed.length} Apple terms carry following prose, e.g. ${swallowed[0]!.id}`);
      const buttons = await ref("apple-hig", "components", "buttons");
      // The sentence must be on the page, and not inside the Destructive definition.
      const roles = /A button’s role can have additional effects on its appearance\./;
      if (!roles.test(buttons)) throw new Error("the general sentence about roles is missing from Buttons");
      const destructive = /- \*\*Destructive\.\*\*[^\n]*/.exec(buttons)?.[0] ?? "";
      if (roles.test(destructive)) throw new Error("the Destructive definition still swallows the sentence about roles");
      // A split bold lead used to produce a term named "Consider" with no id and no severity.
      const audio = await ref("apple-hig", "patterns", "playing-audio");
      if (/^- \*\*Consider\*\* —/m.test(audio)) throw new Error('"**Consider**" still renders as a term');
      if (!/Consider presenting a Now Playing view/.test(audio)) throw new Error("the merged Now Playing statement is missing");
      return `${terms.length} terms, none carrying following prose; role sentence present and unattributed; split bold lead merged`;
    },
  },
  {
    finding: "O-4",
    requirement: "References render in source order",
    observe: async () => {
      const pages = await loadPages("apple-hig");
      const without = pages.filter((p) => p.rules.some((r) => r.order === undefined));
      if (without.length) throw new Error(`${without.length} pages have rules with no source position`);
      const buttons = await ref("apple-hig", "components", "buttons");
      const at = (s: string) => {
        const i = buttons.indexOf(s);
        if (i < 0) throw new Error(`not in the Buttons reference: ${s}`);
        return i;
      };
      // The source places the visionOS size table before the rules that say "the sizes below".
      if (at("| Shape | Mini (28 pt)") > at("Prefer buttons that have a discernible background shape")) {
        throw new Error("the visionOS size table still renders after the rules that refer to it");
      }
      // "Platform considerations" intro text used to be appended as an orphan heading at the end.
      if (at("No additional considerations for tvOS") > at("### Platform considerations › watchOS")) {
        throw new Error("the Platform considerations intro still renders after the platform sections");
      }
      return `every rule carries a source position; the visionOS table and the Platform considerations intro render in source order`;
    },
  },
  {
    finding: "O-5",
    requirement: "Every value badge is a figure the rule itself states",
    observe: async () => {
      const rules = (await loadPages("apple-hig")).flatMap((p) => p.rules).filter((r) => r.value);
      const orphan = rules.filter((r) => !`${r.statement} ${r.rationale ?? ""}`.includes(r.value!));
      if (orphan.length) throw new Error(`${orphan.length} badges quote a figure not in the rule, e.g. ${orphan[0]!.id}`);
      // The badges the audit named: illustrative numbers attached to unrelated rules.
      for (const [id, wrong] of [["apple-hig/game-center/015", "5 minutes"], ["apple-hig/charting-data/007", "24 hours"]] as const) {
        const r = rules.find((x) => x.id === id);
        if (r?.value === wrong) throw new Error(`${id} still carries the illustrative badge "${wrong}"`);
      }
      return `${rules.length} value badges, all traceable to their rule's own text`;
    },
  },
  {
    finding: "O-8",
    requirement: "Every cross-reference resolves, in both files and headings",
    observe: async () => {
      let total = 0;
      const dead: string[] = [];
      const anchorOf = (h: string) => h.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
      for (const name of ["apple-hig", "wcag22"]) {
        const root = join(paths.skill(name), "references");
        const headings = new Map<string, Set<string>>();
        for (const cat of await listDirs(root)) {
          for (const f of await listFiles(join(root, cat), ".md")) {
            const doc = await readFile(join(root, cat, f), "utf8");
            for (const m of doc.matchAll(/\]\((?!https?:)([^)\s#]+\.md)(?:#([^)\s]+))?\)/g)) {
              total++;
              const target = join(root, cat, m[1]!);
              if (!headings.has(target)) {
                if (!(await exists(target))) {
                  dead.push(`${f} → ${m[1]} (no such file)`);
                  continue;
                }
                headings.set(target, new Set([...(await readFile(target, "utf8")).matchAll(/^#{2,6} (.+)$/gm)].map((h) => anchorOf(h[1]!))));
              }
              if (m[2] && !headings.get(target)!.has(m[2].toLowerCase())) dead.push(`${f} → ${m[1]}#${m[2]}`);
            }
          }
        }
      }
      if (dead.length) throw new Error(`${dead.length} dead links, e.g. ${dead[0]}`);
      // Markup that used to survive into prose an agent reads.
      const glossary = await ref("wcag22", "glossary", "glossary");
      if (/&(lt|gt|amp|quot);/.test(glossary)) throw new Error("HTML entities still reach the shipped glossary");
      if (!/^ {2}- Changes in context include changes of:$/m.test(glossary)) throw new Error("glossary definitions are still flattened into one line");
      return `${total} cross-references across two skills, 0 dead; glossary keeps its structure and carries no entities`;
    },
  },
  {
    finding: "O-6 / O-10",
    requirement: "Every topic is reachable from the entry file, and a long reference can be navigated without reading it",
    observe: async () => {
      const skill = await readFile(join(paths.skill("apple-hig"), "SKILL.md"), "utf8");
      const pages = await loadPages("apple-hig");
      // The entry file used to name 33 of 158 topics and count the rest by category, so any task
      // outside a routing row cost an extra file read before the agent knew what existed.
      // Checked against the *index section* rather than the whole file: a topic that appears only
      // in a routing row is reachable for the tasks that row names and invisible for every other,
      // which is the gap this was supposed to close.
      const index = skill.slice(skill.indexOf("## Index"));
      if (!index) throw new Error("SKILL.md has no Index section");
      const unnamed = pages.filter((p) => !index.includes(`/${p.page}.md)`));
      if (unnamed.length) throw new Error(`${unnamed.length} topics are missing from the index, e.g. ${unnamed[0]!.page}`);
      const tokens = Math.ceil(skill.length / 4);
      if (tokens > 5000) throw new Error(`naming every topic pushed SKILL.md to ~${tokens} tokens, over the 5k guidance`);
      const routing = [...skill.matchAll(/^\| (?!---|When the task)[^|]+\|/gm)].length;
      if (routing < 20) throw new Error(`only ${routing} routing rows; platform and category coverage regressed`);

      // A file that is long or heavily sectioned must open with a way to find a section.
      const root = join(paths.skill("apple-hig"), "references");
      let withToc = 0;
      const missing: string[] = [];
      for (const cat of await listDirs(root)) {
        for (const f of await listFiles(join(root, cat), ".md")) {
          const doc = await readFile(join(root, cat, f), "utf8");
          const sections = new Set(doc.match(/^### .+$/gm) ?? []).size;
          const hasToc = /^## Contents$/m.test(doc);
          if (hasToc) withToc++;
          if ((doc.split("\n").length > 200 || sections > 10) && sections >= 3 && !hasToc) missing.push(`${cat}/${f}`);
        }
      }
      if (missing.length) throw new Error(`${missing.length} long references have no table of contents, e.g. ${missing[0]}`);
      return `all ${pages.length} topics linked from a ~${tokens}-token entry file with ${routing} routing rows; ${withToc} long references carry a table of contents`;
    },
  },
  {
    finding: "O-11",
    requirement: "A rule id identifies one rule and survives a rebuild",
    observe: async () => {
      // Ids are what an agent quotes and a human checks against the source, so an id that moves
      // when nothing changed makes a cited finding unverifiable. Found by rebuilding from scratch:
      // a page repeating a sentence renumbered that pair on every extract.
      const out: string[] = [];
      for (const id of ["apple-hig", "wcag22"]) {
        const pages = await loadPages(id);
        const seen = new Set<string>();
        let n = 0;
        for (const p of pages) {
          for (const r of p.rules) {
            n++;
            if (seen.has(r.id)) throw new Error(`${id}: duplicate rule id ${r.id}`);
            seen.add(r.id);
            if (!new RegExp(`^${id}/${p.page}/\\d{3}$`).test(r.id)) throw new Error(`${id}: malformed id ${r.id} on page ${p.page}`);
          }
          // Reuse maps each surviving statement to the id it already had. Re-running it over this
          // page's own rules must therefore be a no-op; if it is not, a rebuild would renumber.
          const reassigned = assignIds(id, p.page, p, p.rules.map((r) => r.statement));
          const moved = reassigned.filter((x, i) => x !== p.rules[i]!.id);
          if (moved.length) throw new Error(`${id}/${p.page}: ${moved.length} id(s) move on re-extract, e.g. ${p.rules[reassigned.findIndex((x, i) => x !== p.rules[i]!.id)]!.id}`);
          // Stability alone is not enough: a page whose repeated statements hold each other's ids
          // is *also* a fixed point, and still wrong — the pair drifted at some point and stuck.
          // On a page never touched by that bug, ids ascend with document order.
          const nums = p.rules.map((r) => Number(r.id.split("/").pop()));
          const out = nums.findIndex((n, i) => i > 0 && n < nums[i - 1]!);
          if (out > 0) throw new Error(`${id}/${p.page}: id ${p.rules[out]!.id} sorts before ${p.rules[out - 1]!.id} but follows it in the page`);
        }
        out.push(`${id} ${n} ids`);
      }
      return `${out.join(", ")}: unique, well-formed, and unchanged by re-extraction`;
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
