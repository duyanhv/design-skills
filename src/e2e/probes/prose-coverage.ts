#!/usr/bin/env bun
/**
 * Raw-corpus prose coverage (AUDIT finding A7).
 *
 * `fidelity` and `coverage` both start from the *normalized* markdown, so anything dropped on the
 * way out of the raw DocC JSON is invisible to them: the loss and the baseline move together. A1's
 * media loss lived in exactly that blind spot, and the media probe closed it for figures only.
 * This does the same for prose — the other thing the corpus is made of.
 *
 * It walks every `{"type":"text"}` node in the raw JSON that the normalizer actually visits, splits
 * it into sentences, and requires each one to reach the shipped reference. Sentences rather than
 * whole nodes because the extractor legitimately distributes one source paragraph across a rule's
 * statement and its `Details` line; asking for the node verbatim would report that as loss.
 *
 * Exclusions are enumerated, never assumed, and each is a property of the source or the manifest:
 *
 *   - a section the manifest lists in `skip_sections` (Change log, Resources, Related, …)
 *   - text that ships inside a figure marker, where the caption travels with its own media
 *   - a page that produced no reference at all (container pages under the word threshold)
 *
 * Anything else is a defect. Run standalone: `bun run src/e2e/probes/prose-coverage.ts`
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { exists, listFiles, loadSource, paths } from "../../util/fs.ts";
import { parseFrontmatter } from "../../normalize/frontmatter.ts";
import { log } from "../../util/log.ts";
import type { Case, Check } from "./types.ts";

const SOURCE = "apple-hig";
const SKILL = "apple-hig";

/** Shortest sentence worth judging. Below this, a fragment matches by accident. */
const MIN_SENTENCE = 25;

/** Curly punctuation and collapsed whitespace, so a quotation mark cannot fail a comparison. */
const norm = (s: string) =>
  s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();

/**
 * Sentence split on terminal punctuation followed by a capital. Deliberately conservative: a
 * missed split leaves a longer string that still has to be found somewhere, so it can only make
 * this check stricter, never laxer.
 */
const sentences = (s: string): string[] =>
  s
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((x) => x.trim())
    .filter((x) => x.length >= MIN_SENTENCE);

/** Every text node the normalizer walks, in the order it walks them. */
function textNodes(node: unknown, out: string[], depth = 0): string[] {
  if (!node || depth > 40) return out;
  if (Array.isArray(node)) {
    for (const n of node) textNodes(n, out, depth + 1);
    return out;
  }
  if (typeof node !== "object") return out;
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string" && n.text.trim()) out.push(n.text);
  for (const k of Object.keys(n)) {
    // `references` is the asset table, reached through its occurrences rather than walked directly;
    // `text` is the value already captured above.
    if (k === "references" || k === "text") continue;
    textNodes(n[k], out, depth + 1);
  }
  return out;
}

type Excuse = "skipped section" | "figure caption" | "page not shipped";

interface Coverage {
  checked: number;
  found: number;
  excused: Record<string, number>;
  unexplained: { page: string; sentence: string; heading: string }[];
}

export async function proseCoverage(root: string): Promise<Coverage> {
  const source = await loadSource(SOURCE);
  const skipRe = new RegExp(
    `^#{1,6} (${source.skip_sections.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "i",
  );
  const raw = join(root, ".cache", SOURCE, "raw");
  const mdDir = join(root, ".cache", SOURCE, "md");
  const refRoot = join(root, "skills", SKILL, "references");

  // One page's prose can be split across `<page>.md` and `<page>.tables.md`.
  const shipped = new Map<string, string>();
  const walk = async (dir: string): Promise<void> => {
    const { readdir, stat } = await import("node:fs/promises");
    for (const e of await readdir(dir)) {
      const p = join(dir, e);
      if ((await stat(p)).isDirectory()) await walk(p);
      else if (p.endsWith(".md")) {
        const base = e.replace(/\.tables\.md$|\.md$/, "");
        shipped.set(base, (shipped.get(base) ?? "") + (await readFile(p, "utf8")));
      }
    }
  };
  await walk(refRoot);

  const cov: Coverage = { checked: 0, found: 0, excused: {}, unexplained: [] };
  const excuse = (e: Excuse) => (cov.excused[e] = (cov.excused[e] ?? 0) + 1);

  for (const f of await listFiles(raw, ".json")) {
    const slug = f.replace(/\.json$/, "");
    const doc = JSON.parse(await readFile(join(raw, f), "utf8")) as Record<string, unknown>;
    const nodes = [
      ...textNodes(doc.primaryContentSections, []),
      ...textNodes(doc.sections, []),
    ];
    if (!nodes.length) continue;

    const ship = shipped.get(slug);
    const mdPath = join(mdDir, `${slug}.md`);
    if (!ship || !(await exists(mdPath))) {
      for (const n of nodes) for (const _ of sentences(norm(n))) excuse("page not shipped");
      continue;
    }
    const flatShip = norm(ship);
    const { body } = parseFrontmatter(await readFile(mdPath, "utf8"));

    // Figure text is prose that lives inside a marker rather than in a paragraph, and this check
    // measures the marker's *contents*, not the marker. So the excuse is only available when the
    // sentence is in a figure upstream AND still in a figure downstream: a caption stripped out of
    // the shipped marker would otherwise slide from "found" to "excused" and keep the check green,
    // which is the failure mode this whole file exists to prevent. Found by deleting four captions
    // from augmented-reality.md and watching the count move instead of the result.
    const figuresOf = (s: string) => norm(s.match(/_\[figure:[^\]]*\]_/g)?.join(" ") ?? "");
    const figuresUpstream = figuresOf(body);
    const figuresShipped = figuresOf(ship);

    const kept: string[] = [];
    const dropped: string[] = [];
    let keep = true;
    for (const line of body.split("\n")) {
      if (line.startsWith("#")) keep = !skipRe.test(line);
      (keep ? kept : dropped).push(line);
    }
    const keptText = norm(kept.join("\n"));
    const droppedText = norm(dropped.join("\n"));

    for (const node of nodes) {
      for (const s of sentences(norm(node))) {
        cov.checked++;
        if (flatShip.includes(s)) {
          cov.found++;
          continue;
        }
        if (figuresUpstream.includes(s)) {
          // In a figure upstream. It is only excused if it is still in one downstream; otherwise
          // the caption was dropped on the way out, which is a loss and not an exemption.
          if (figuresShipped.includes(s)) {
            excuse("figure caption");
            continue;
          }
          cov.unexplained.push({ page: slug, sentence: s, heading: "(figure caption dropped in the shipped marker)" });
          continue;
        }
        if (droppedText.includes(s) && !keptText.includes(s)) {
          excuse("skipped section");
          continue;
        }
        const at = kept.findIndex((l) => norm(l).includes(s));
        const heading =
          [...kept.slice(0, at < 0 ? kept.length : at + 1).join("\n").matchAll(/^#{2,}\s+(.+)$/gm)]
            .pop()?.[1]
            ?.replace(/\s*\{#.*$/, "")
            .trim() ?? "(no heading)";
        cov.unexplained.push({ page: slug, sentence: s, heading });
      }
    }
  }
  return cov;
}

const describe = (c: Coverage) =>
  `${c.found}/${c.checked} raw sentences reach the shipped references, ` +
  `${Object.values(c.excused).reduce((a, b) => a + b, 0)} excused: ` +
  (Object.entries(c.excused)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k}`)
    .join(", ") || "none");

/**
 * The same question for WCAG, whose raw form is HTML rather than DocC JSON.
 *
 * Counted per innermost block element (`p`, `li`, `dt`, `td`, headings …) rather than over the
 * document's whole text, because concatenating across element boundaries manufactures sentences the
 * source never wrote and then reports them as lost. The comparison strips markdown syntax, since a
 * sentence rendered as `` `name` - Full name`` or with an _italic_ run is the same sentence.
 */
export async function wcagProseCoverage(root: string): Promise<{ checked: number; found: number; missing: { page: string; sentence: string }[] }> {
  const { parse } = await import("node-html-parser");
  const raw = join(root, ".cache", "wcag22", "raw");
  const refRoot = join(root, "skills", "wcag22", "references");
  const { readdir, stat } = await import("node:fs/promises");

  const shipped = new Map<string, string>();
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir)) {
      const p = join(dir, e);
      if ((await stat(p)).isDirectory()) await walk(p);
      else if (p.endsWith(".md")) {
        const base = e.replace(/\.tables\.md$|\.md$/, "");
        shipped.set(base, (shipped.get(base) ?? "") + (await readFile(p, "utf8")));
      }
    }
  };
  await walk(refRoot);

  // Markdown emphasis, code fences and link syntax are presentation; the sentence underneath is
  // what has to survive.
  const plain = (s: string) =>
    norm(s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_>]/g, ""));
  const BLOCKS = "p,li,dt,dd,h1,h2,h3,h4,h5,h6,td,th,caption";

  let checked = 0;
  let found = 0;
  const missing: { page: string; sentence: string }[] = [];
  for (const f of await listFiles(raw, ".html")) {
    const page = f.replace(/\.html$/, "");
    const ship = shipped.get(page);
    if (!ship) continue;
    const flat = plain(ship);
    const doc = parse(await readFile(join(raw, f), "utf8"));
    for (const el of doc.querySelectorAll(BLOCKS)) {
      if (el.querySelector(BLOCKS)) continue; // innermost only; an ancestor repeats its children
      for (const s of sentences(plain(el.text))) {
        checked++;
        if (flat.includes(s)) found++;
        else missing.push({ page, sentence: s });
      }
    }
  }
  return { checked, found, missing };
}

export const CHECKS: Check[] = [
  {
    finding: "A7",
    requirement: "Every sentence in the raw corpus reaches the shipped reference or carries an enumerated reason",
    observe: async () => {
      const cov = await proseCoverage(process.cwd());
      if (!cov.checked) throw new Error("no raw sentences were examined; the corpus or the skill is missing");
      if (cov.unexplained.length) {
        const eg = cov.unexplained
          .slice(0, 3)
          .map((u) => `[${u.page}] under "${u.heading}": ${u.sentence.slice(0, 90)}`)
          .join(" | ");
        throw new Error(`${cov.unexplained.length} sentence(s) lost with no reason given, e.g. ${eg}`);
      }
      // Said out loud because this check starts from the raw JSON and the others do not: its
      // guarantee is about prose, and figures are the media probe's job.
      return `${describe(cov)}. Partial: prose only — media occurrences are finding A1's coverage check.`;
    },
  },
  {
    finding: "A7",
    requirement: "Every sentence in WCAG's raw HTML reaches the shipped reference",
    observe: async () => {
      const cov = await wcagProseCoverage(process.cwd());
      if (!cov.checked) throw new Error("no WCAG sentences were examined; the corpus or the skill is missing");
      if (cov.missing.length) {
        const eg = cov.missing.slice(0, 3).map((m) => `[${m.page}] ${m.sentence.slice(0, 90)}`).join(" | ");
        throw new Error(`${cov.missing.length} sentence(s) lost, e.g. ${eg}`);
      }
      // WCAG needs no exclusion list: the fetcher selects the sections it wants up front, so
      // everything crawled is meant to ship. That is a stronger guarantee than Apple's and is
      // stated separately rather than averaged into one number.
      return `${cov.found}/${cov.checked} sentences across WCAG's raw HTML reach the shipped references, with no exclusions. Partial: covers what the crawl fetched, not what w3.org publishes.`;
    },
  },
];

export const CASES: Case[] = [
  {
    finding: "A7",
    name: "a paragraph deleted from a shipped reference",
    break: async (dir) => {
      const p = join(dir, "skills", SKILL, "references", "components", "activity-rings.md");
      const before = await readFile(p, "utf8");
      // A real rule, and its context line, removed the way a renderer bug would remove it.
      const after = before.replace(
        /^.*Ensure that the black background remains visible around the outermost ring.*$/m,
        "",
      );
      if (after === before) throw new Error("the defect did not change activity-rings.md; the fixture text has moved");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(p, after);
    },
  },
  {
    finding: "A7",
    name: "a figure's caption dropped from the marker that carries it",
    break: async (dir) => {
      const p = join(dir, "skills", SKILL, "references", "technologies", "augmented-reality.md");
      const before = await readFile(p, "utf8");
      // These captions are instructions ("Limit object rotation to a single axis."), and a marker
      // is the only place they exist. Stripping the caption half leaves the picture's description
      // behind, so the page still reads plausibly and a page-wide sentence scan still passes.
      const after = before.replace(/ — caption: [^\]]*/g, "");
      if (after === before) throw new Error("the defect did not change augmented-reality.md; the fixture text has moved");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(p, after);
    },
  },
  {
    finding: "A7",
    name: "a table deleting a context block from an earlier section (the lastContext defect)",
    break: async (dir) => {
      // The extractor defect this stands in for: a stale `lastContext` surviving a heading let a
      // table pop a block out of a section several headings above it. The fix shipped without a
      // probe of its own, because a second fix repaired the same symptom for figures and left the
      // media checks green either way. Prose coverage does see it — the block it removes on widgets
      // is a sentence — so the guard exists now rather than being recorded as absent.
      const p = join(dir, "skills", SKILL, "references", "components", "widgets.md");
      const before = await readFile(p, "utf8");
      const after = before.replace(/^.*When Display Zoom is set to More Space\..*$\n?/m, "");
      if (after === before) throw new Error("the defect did not change widgets.md; the fixture text has moved");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(p, after);
    },
  },
  {
    finding: "A7",
    name: "a phrasing element treated as a block, splitting a word in two",
    break: async (dir) => {
      // `M<sup>lle</sup>` shipped as "M lle " because SUP was missing from the normalizer's list of
      // inline tags, so it flushed the run around it. The output was a spelling W3C never wrote,
      // and every existing check passed: the fragments were present, just not as a word.
      const p = join(dir, "skills", "wcag22", "references", "reference", "input-purposes.md");
      const before = await readFile(p, "utf8");
      const after = before.replace(/Mlle/g, "M lle ");
      if (after === before) throw new Error("the defect did not change input-purposes.md; the fixture text has moved");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(p, after);
    },
  },
];

if (import.meta.main) {
  let failed = 0;
  for (const c of CHECKS) {
    try {
      console.log(`✓ finding ${c.finding} — ${c.requirement}\n    observed: ${await c.observe()}`);
    } catch (e) {
      failed++;
      console.log(`✗ finding ${c.finding} — ${c.requirement}\n    ${(e as Error).message}`);
    }
  }
  if (failed) process.exit(1);
  log.info(`${CHECKS.length}/${CHECKS.length} prose coverage requirements verified`);
}
