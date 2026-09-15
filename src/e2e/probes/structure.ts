#!/usr/bin/env bun
/**
 * Structural traceability: does a sentence appear **under the rule it belongs to**, and is every
 * page a reader is sent to actually there?
 *
 * `fidelity.ts` compares whole sentences against the whole page. That catches a dropped or
 * truncated sentence and cannot, by construction, catch a sentence that survived under the wrong
 * rule — `includes()` over the page is true either way. (Its comment used to claim otherwise; that
 * is fixed, and this file is the check that makes the claim true of something.)
 *
 * Three separate metrics, reported separately on purpose:
 *   S-1 ownership   — every IR rule's own statement, Details line, notes and figure markers appear
 *                     inside that rule's own rendered block, located by its rule id.
 *   S-2 order       — rules render in source order, and a rule's notes render in their source order
 *                     inside its block. An exception that moves to a neighbouring rule fails S-1;
 *                     one that is reordered within its own rule fails S-2.
 *   S-3 dependencies— every IR page has a shipped reference, every table survives into the page or
 *                     its `.tables.md` sibling, and every local link in the entry file and index
 *                     resolves to a file that exists.
 *
 * What these do **not** establish: that the rendered text is faithful to the *upstream source*.
 * They compare IR against shipped Markdown, so a loss that happened in normalization or extraction
 * is invisible here and is `coverage.ts` / `fidelity.ts` / the raw-content probes' business. Each
 * check says so in its own output rather than in a comment only.
 *
 * Usage:
 *   bun run src/e2e/probes/structure.ts            # checks, then the negative probes
 *   bun run src/e2e/probes/structure.ts --checks    # checks only (what the negative probes run)
 */
import { join } from "node:path";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { PageIR, Rule } from "../../schema/ir.ts";
import { exists, listDirs, listFiles, loadSource, paths, readJson } from "../../util/fs.ts";
import { log } from "../../util/log.ts";

const REPO = process.cwd();
/** Sources these probes read. A source that is not built locally is skipped, never passed over. */
const SOURCES = ["apple-hig", "wcag22"];

export interface Check {
  finding: string;
  requirement: string;
  observe: () => Promise<string>;
}

export interface Case {
  finding: string;
  name: string;
  break: (dir: string) => Promise<void>;
}

/**
 * Compare text the way a reader would: markdown emphasis, link syntax, list markers and line
 * wrapping are presentation, not content. Everything else is compared literally, because a rulebook
 * that paraphrases is the defect this repo exists to prevent.
 */
const norm = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\n)\s*(?:[-*]|\d+\.)\s+/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/[\u2019']/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

async function pagesOf(id: string): Promise<PageIR[]> {
  const dir = paths.irPages(id);
  const out: PageIR[] = [];
  for (const f of await listFiles(dir, ".json")) out.push((await readJson<PageIR>(join(dir, f)))!);
  return out;
}

const built = async (id: string) => (await exists(paths.irPages(id))) && (await exists(paths.skill((await loadSource(id)).skill.name)));

async function shipped(id: string, p: PageIR): Promise<{ main: string; tables: string }> {
  const dir = join(paths.skill((await loadSource(id)).skill.name), "references", p.category);
  const main = join(dir, `${p.page}.md`);
  const tbl = join(dir, `${p.page}.tables.md`);
  return {
    main: (await exists(main)) ? await readFile(main, "utf8") : "",
    tables: (await exists(tbl)) ? await readFile(tbl, "utf8") : "",
  };
}

/**
 * The rendered block belonging to one rule: from the `- **SEVERITY** …` line that carries the rule's
 * id, up to the next rule line or heading.
 *
 * Locating blocks by id rather than by statement text is deliberate. Matching on the statement would
 * make the check circular — it would find the text wherever it moved to and call that ownership,
 * which is exactly the `includes()` weakness this file exists to replace.
 */
export function blockFor(doc: string, id: string): string | null {
  const at = doc.indexOf(`\`${id}\``);
  if (at < 0) return null;
  return blockAt(doc, doc.lastIndexOf("\n- ", at) + 1);
}

function blockAt(doc: string, start: number): string | null {
  const lines = doc.slice(start < 1 ? 0 : start).split("\n");
  if (!lines.length) return null;
  const block = [lines[0]!];
  for (const line of lines.slice(1)) {
    if (/^- \*\*/.test(line) || /^#{2,6} /.test(line)) break;
    block.push(line);
  }
  return block.join("\n");
}

/**
 * A *term* renders as `- **Captions** give people…` with no rule id: `ruleLine`'s `withId` is for
 * rules, and a definition list is identified by the term itself. So terms are located by their bold
 * lead instead. This is weaker than an id — if two definitions on a page shared a label the first
 * would win — and it is the price of the renderer not giving terms ids. Where a term *does* render
 * an id, the id is used.
 */
export function blockForTerm(doc: string, statement: string): string | null {
  const lead = `- **${statement}**`;
  const at = doc.indexOf(`\n${lead}`);
  return at < 0 ? null : blockAt(doc, at + 1);
}

/** The pieces of a rule that must live inside its own block, each labelled for the failure message. */
function parts(r: Rule): { label: string; text: string }[] {
  const out = [{ label: "statement", text: r.statement }];
  if (r.rationale) out.push({ label: "details", text: r.rationale });
  r.notes.forEach((n, i) => out.push({ label: `note ${i + 1}`, text: n }));
  return out;
}

/**
 * Whether a block carries a piece of text. Long notes are compared as a whole first; a note that
 * renders as several bullets is then compared line by line, so the failure names the line that
 * actually went missing rather than the whole paragraph.
 */
function carries(block: string, text: string): string | null {
  const b = norm(block);
  const whole = norm(text);
  if (!whole) return null;
  if (b.includes(whole)) return null;
  for (const line of text.split("\n")) {
    const l = norm(line);
    if (l.length < 12) continue;
    if (!b.includes(l)) return l.slice(0, 90);
  }
  // Every line is present but the joined form is not: presentation-only difference, not a loss.
  return null;
}

export const CHECKS: Check[] = [
  {
    finding: "S-1",
    requirement: "Every rule's statement, details, notes and figure markers render inside that rule's own block",
    observe: async () => {
      const bad: string[] = [];
      let rules = 0;
      let pieces = 0;
      let figures = 0;
      const ran: string[] = [];
      for (const id of SOURCES) {
        if (!(await built(id))) continue;
        ran.push(id);
        for (const p of await pagesOf(id)) {
          const { main, tables } = await shipped(id, p);
          if (!main) {
            bad.push(`${p.page}: no shipped reference`);
            continue;
          }
          for (const r of p.rules) {
            rules++;
            const block =
              blockFor(main, r.id) ??
              blockFor(tables, r.id) ??
              (r.kind === "term" ? blockForTerm(main, r.statement) ?? blockForTerm(tables, r.statement) : null);
            if (!block) {
              bad.push(`${r.id}: not rendered${r.kind === "term" ? " (no id and no matching bold lead)" : " with its id"}`);
              continue;
            }
            for (const part of parts(r)) {
              pieces++;
              if (/_\[figure/.test(part.text)) figures++;
              const missing = carries(block, part.text);
              if (missing) bad.push(`${r.id} ${part.label}: "${missing}" is not under this rule`);
            }
          }
        }
      }
      if (!ran.length) throw new Error("no source is built locally; nothing to compare");
      if (bad.length) throw new Error(`${bad.length} piece(s) of ${pieces} not under their own rule, e.g. ${bad[0]}`);
      return (
        `${pieces} statements/details/notes across ${rules} rules are each under their own rule id (${figures} figure markers included) ` +
        `in ${ran.join(", ")}. Partial: terms carry no rule id, so they are located by their bold lead, and this compares IR ` +
        `against shipped Markdown — a loss upstream of IR is invisible to it.`
      );
    },
  },
  {
    finding: "S-2",
    requirement: "Rules and their notes render in source order",
    observe: async () => {
      const bad: string[] = [];
      let compared = 0;
      const ran: string[] = [];
      for (const id of SOURCES) {
        if (!(await built(id))) continue;
        ran.push(id);
        for (const p of await pagesOf(id)) {
          const { main } = await shipped(id, p);
          if (!main) continue;
          // Rule order: the ids in the page, in the order they appear, must be the IR order.
          const rendered = [...main.matchAll(/`((?:[a-z0-9-]+\/){2}\d{3})`/g)].map((m) => m[1]!);
          const expected = [...p.rules]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((r) => r.id)
            .filter((x) => rendered.includes(x));
          for (let i = 0; i < expected.length; i++) {
            compared++;
            if (rendered[i] !== expected[i]) {
              bad.push(`${p.page}: rule ${i + 1} renders as ${rendered[i]}, source order says ${expected[i]}`);
              break;
            }
          }
          // Note order inside one rule: an exception reordered within its own rule changes which
          // rule text it qualifies, and S-1 cannot see it because the text never left the block.
          for (const r of p.rules) {
            const block = blockFor(main, r.id) ?? (r.kind === "term" ? blockForTerm(main, r.statement) : null);
            if (!block) continue;
            const b = norm(block);
            let cursor = 0;
            for (const [i, n] of r.notes.entries()) {
              const needle = norm(n.split("\n")[0]!);
              if (!needle) continue;
              // Search forward from the previous note. A page may state the same note twice — App
              // Clips renders "_[figure: An X in a circle…]_" for two different examples — and
              // matching from the start of the block would find the first copy every time and call
              // a correctly ordered pair a reversal.
              const at = b.indexOf(needle, cursor);
              if (at < 0 && !b.includes(needle)) continue; // absence is S-1's finding, not this one
              compared++;
              if (at < 0) {
                bad.push(`${r.id}: note ${i + 1} renders before the note that precedes it in the source`);
                break;
              }
              cursor = at + needle.length;
            }
          }
        }
      }
      if (!ran.length) throw new Error("no source is built locally; nothing to compare");
      if (bad.length) throw new Error(`${bad.length} ordering defect(s), e.g. ${bad[0]}`);
      return `${compared} order comparisons across ${ran.join(", ")}, none out of source order. Partial: order is compared against IR's recorded positions, not against the upstream document.`;
    },
  },
  {
    finding: "S-3",
    requirement: "Every extracted page ships, every table survives, and every link the entry file and index make resolves",
    observe: async () => {
      const bad: string[] = [];
      let pageCount = 0;
      let tableCount = 0;
      let links = 0;
      const ran: string[] = [];
      for (const id of SOURCES) {
        if (!(await built(id))) continue;
        ran.push(id);
        const source = await loadSource(id);
        const root = paths.skill(source.skill.name);
        const pages = await pagesOf(id);
        for (const p of pages) {
          pageCount++;
          const { main, tables } = await shipped(id, p);
          // A required page: extraction produced rules for it, so a reader can be sent here.
          if (!main) {
            bad.push(`${id}: ${p.category}/${p.page}.md was extracted but is not shipped`);
            continue;
          }
          const both = norm(main + "\n" + tables);
          for (const t of p.tables) {
            tableCount++;
            // Every data row of the table, so a changed or deleted cell value is a failure and not
            // just a missing header.
            for (const row of t.markdown.split("\n").slice(2)) {
              const r = norm(row);
              if (r.length > 8 && !both.includes(r)) {
                bad.push(`${id}/${p.page}: table row missing from the shipped page — "${r.slice(0, 70)}"`);
                break;
              }
            }
          }
        }
        // Entry file and index: every local link must resolve. A topic file that disappears has to
        // fail something, and until now nothing compared these link targets against the tree.
        for (const entry of ["SKILL.md", "index.md"]) {
          const path = join(root, entry);
          if (!(await exists(path))) continue;
          const doc = await readFile(path, "utf8");
          for (const m of doc.matchAll(/\]\((?!https?:|#)([^)\s#]+\.md)(?:#[^)\s]*)?\)/g)) {
            links++;
            if (!(await exists(join(root, m[1]!)))) bad.push(`${id}/${entry} links ${m[1]} which does not exist`);
          }
        }
        // Nothing is shipped that no page produced: an orphan reference is a stale file, and a
        // reader cannot tell it from a current one.
        const refRoot = join(root, "references");
        const known = new Set(pages.map((p) => `${p.category}/${p.page}.md`));
        for (const cat of await listDirs(refRoot)) {
          for (const f of await listFiles(join(refRoot, cat), ".md")) {
            if (f.endsWith(".tables.md")) continue;
            if (!known.has(`${cat}/${f}`)) bad.push(`${id}: ${cat}/${f} is shipped but no IR page produced it`);
          }
        }
      }
      if (!ran.length) throw new Error("no source is built locally; nothing to compare");
      if (bad.length) throw new Error(`${bad.length} dependency defect(s), e.g. ${bad[0]}`);
      return (
        `${pageCount} extracted pages all ship, ${tableCount} tables keep every data row, ${links} entry/index links resolve, no orphan references (${ran.join(", ")}). ` +
        `Partial: this establishes that what IR holds is reachable, not that IR holds everything the upstream source states.`
      );
    },
  },
];

/* ------------------------------------------------------------------ negative probes */

const editRef = async (dir: string, rel: string, fn: (s: string) => string) => {
  const p = join(dir, "skills", rel);
  const before = await readFile(p, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`the defect did not change ${rel}; the fixture text has moved`);
  await writeFile(p, after);
};

/** The first rule on a page that has at least `n` notes — fixtures that do not name moving text. */
const ruleWithNotes = (ir: any, n: number) => {
  const r = ir.rules.find((x: any) => x.notes.length >= n);
  if (!r) throw new Error(`no rule with ${n}+ notes on this page; update this fixture`);
  return r;
};

export const CASES: Case[] = [
  {
    finding: "S-1",
    name: "a media marker dropped from the rule it illustrates",
    break: async (d) => {
      const ir = JSON.parse(await readFile(join(d, "ir", "apple-hig", "pages", "buttons.json"), "utf8"));
      const r = ir.rules.find((x: any) => x.notes.some((n: string) => n.startsWith("_[figure")));
      if (!r) throw new Error("no figure marker on the Buttons page; update this fixture");
      const marker = r.notes.find((n: string) => n.startsWith("_[figure"))!;
      await editRef(d, "apple-hig/references/components/buttons.md", (s) => {
        if (!s.includes(marker)) throw new Error("the figure marker is not rendered where this fixture expects it");
        return s.replace(marker, "");
      });
    },
  },
  {
    finding: "S-1",
    name: "a caption sentence cut out of its rule's details",
    break: async (d) =>
      editRef(d, "apple-hig/references/components/buttons.md", (s) =>
        s.replace("Without a press state, a button can feel unresponsive, making people wonder if it’s accepting their input.", "Without a press state."),
      ),
  },
  {
    finding: "S-1",
    name: "an exception moved to the rule above it",
    break: async (d) => {
      const p = join(d, "skills", "apple-hig", "references", "components", "buttons.md");
      const doc = await readFile(p, "utf8");
      // Move the *rendered* note up into the previous rule's block: the text is still on the page,
      // and still spelled exactly as the source spells it, so a page-wide `includes()` is happy.
      const m = /\n( {2}- \*\*Note:\*\* [^\n]+)/.exec(doc);
      if (!m) throw new Error("no rendered Note on the Buttons page; update this fixture");
      const without = doc.replace(m[0], "");
      const prev = without.lastIndexOf("\n- **", without.indexOf("## Rules") + 20);
      const at = without.indexOf("\n", prev + 1);
      await writeFile(p, without.slice(0, at) + m[0] + without.slice(at));
    },
  },
  {
    finding: "S-2",
    name: "two rules swapped against their source order",
    break: async (d) => {
      const p = join(d, "skills", "apple-hig", "references", "components", "buttons.md");
      const doc = await readFile(p, "utf8");
      const one = /\n- \*\*[A-Z]+\*\*[\s\S]*?(?=\n- \*\*)/.exec(doc.slice(doc.indexOf("## Rules")));
      if (!one) throw new Error("cannot find two adjacent rules; update this fixture");
      const from = doc.indexOf(one[0]);
      const rest = doc.slice(from + one[0].length);
      const two = /^\n- \*\*[A-Z]+\*\*[\s\S]*?(?=\n- \*\*|\n#{2,6} )/.exec(rest);
      if (!two) throw new Error("cannot find the second rule; update this fixture");
      await writeFile(p, doc.slice(0, from) + two[0] + one[0] + rest.slice(two[0].length));
    },
  },
  {
    finding: "S-2",
    name: "a rule's notes reordered within its own block",
    break: async (d) => {
      const p = join(d, "skills", "apple-hig", "references", "components", "buttons.md");
      const doc = await readFile(p, "utf8");
      const irPath = join(d, "ir", "apple-hig", "pages", "buttons.json");
      const r = ruleWithNotes(JSON.parse(await readFile(irPath, "utf8")), 2);
      const block = blockFor(doc, r.id);
      if (!block) throw new Error(`${r.id} is not rendered; update this fixture`);
      const lines = block.split("\n");
      const idx = lines.map((l, i) => [l, i] as const).filter(([l]) => /^ {2}- /.test(l)).map(([, i]) => i);
      if (idx.length < 2) throw new Error(`${r.id} renders fewer than two sub-bullets; update this fixture`);
      const a = idx[idx.length - 2]!, b = idx[idx.length - 1]!;
      [lines[a], lines[b]] = [lines[b]!, lines[a]!];
      await writeFile(p, doc.replace(block, lines.join("\n")));
    },
  },
  {
    finding: "S-3",
    name: "a required reference page deleted",
    break: async (d) => rm(join(d, "skills", "apple-hig", "references", "components", "toggles.md")),
  },
  {
    finding: "S-3",
    name: "a link in the entry file pointing at a page that is not there",
    break: async (d) =>
      editRef(d, "apple-hig/SKILL.md", (s) => s.replace("references/components/buttons.md", "references/components/buttons-v2.md")),
  },
  {
    finding: "S-3",
    name: "a table value changed in the shipped page",
    break: async (d) =>
      editRef(d, "apple-hig/references/components/buttons.md", (s) =>
        s.replace("| Dialog without dismissal buttons | Lower-left or lower-right corner |", "| Dialog without dismissal buttons | Anywhere you like |"),
      ),
  },
  {
    finding: "S-3",
    name: "a WCAG criterion page deleted",
    break: async (d) => rm(join(d, "skills", "wcag22", "references", "perceivable", "adaptable.md")),
  },
];

/* ------------------------------------------------------------------ runner */

async function runChecks(): Promise<number> {
  let failed = 0;
  for (const c of CHECKS) {
    try {
      console.log(`✓ finding ${c.finding} — ${c.requirement}\n    ${await c.observe()}`);
    } catch (e) {
      failed++;
      console.log(`✗ finding ${c.finding} — ${c.requirement}\n    ${(e as Error).message}`);
    }
  }
  return failed;
}

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ds-structure-"));
  for (const sub of [["sources"], ["ir", "apple-hig"], ["ir", "wcag22"], ["skills", "apple-hig"], ["skills", "wcag22"]]) {
    await mkdir(join(dir, ...sub.slice(0, -1)), { recursive: true });
    await cp(join(REPO, ...sub), join(dir, ...sub), { recursive: true });
  }
  return dir;
}

/** A subprocess, because `paths` is rooted at `process.cwd()` when the module loads. */
async function runIn(dir: string): Promise<Set<string>> {
  const proc = Bun.spawn(["bun", "run", join(REPO, "src", "e2e", "probes", "structure.ts"), "--checks"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return new Set([...out.matchAll(/^✗ finding (.+?) —/gm)].map((m) => m[1]!));
}

if (import.meta.main) {
  const checksOnly = process.argv.includes("--checks");
  const anyBuilt = (await Promise.all(SOURCES.map(built))).some(Boolean);
  if (!anyBuilt) {
    log.warn("structure probes skipped: build apple-hig and wcag22 first");
    process.exit(0);
  }
  const failed = await runChecks();
  if (checksOnly) process.exit(failed ? 1 : 0);
  if (failed) {
    log.warn(`${failed} structural check(s) fail against the real build`);
    process.exit(1);
  }

  console.log("\n-- negative probes: each defect must fail the check that claims to guard it --");
  let unguarded = 0;
  for (const c of CASES) {
    const dir = await scratch();
    try {
      await c.break(dir);
      const failures = await runIn(dir);
      if (failures.has(c.finding)) console.log(`✓ ${c.name}\n    → ${c.finding} failed, as it must`);
      else {
        unguarded++;
        console.log(`✗ ${c.name}\n    → ${c.finding} still passed; it does not actually guard this${failures.size ? ` (failures: ${[...failures].join(", ")})` : ""}`);
      }
    } catch (e) {
      unguarded++;
      console.log(`✗ ${c.name}\n    → fixture error: ${(e as Error).message}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  if (unguarded) {
    log.warn(`${unguarded}/${CASES.length} defects go unnoticed`);
    process.exit(1);
  }
  log.info(`${CHECKS.length} structural checks pass and all ${CASES.length} defects are caught by the check that claims to guard them`);
}
