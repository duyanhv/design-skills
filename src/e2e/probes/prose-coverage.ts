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
