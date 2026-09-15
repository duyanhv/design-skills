#!/usr/bin/env bun
/**
 * Traceability probes for AUDIT finding A1 — Apple block media and per-occurrence captions.
 *
 * Apple states a great deal in pictures. Two separate things used to be thrown away:
 *
 *   1. A **block** `image`/`video` node rendered as the empty string. 61 videos across 21 topics
 *      left no trace at all, although every one of them carries a source alternative description.
 *      An agent could not tell a demonstration it should go and watch from a page that never had
 *      one.
 *   2. A media **occurrence**'s own caption (`metadata.abstract`) was ignored in favour of the
 *      referenced asset's `alt`. The alt describes the picture ("An X in a circle"); the caption
 *      states the rule ("you can't withhold functionality … until people allow you to track them").
 *      Those are different claims, and the second one is the one that constrains a design.
 *
 * The checks here read the **shipped artifacts**, not the compiler. Three are hand-written probes
 * that follow one occurrence from a named node in the raw DocC JSON to the section it must land in.
 * The fourth is the complement: it walks every media occurrence in the whole raw corpus and insists
 * each one either renders or falls under an *enumerated* exclusion. An unenumerated omission fails.
 *
 * No asset is downloaded. A marker names the figure; it never reproduces it.
 *
 * Usage: `bun run src/e2e/probes/apple-media.ts` — needs apple-hig built locally.
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { exists, listFiles, loadSource, paths } from "../../util/fs.ts";
import { parseFrontmatter } from "../../normalize/frontmatter.ts";
import { figureText, inlineToText, type Block, type DoccDocument, type DoccRef, type Inline } from "../../normalize/docc.ts";
import { log } from "../../util/log.ts";

import type { Case, Check } from "./types.ts";

const SOURCE = "apple-hig";
const SKILL = "apple-hig";

const rawPage = async (root: string, slug: string): Promise<DoccDocument> =>
  JSON.parse(await readFile(join(root, ".cache", SOURCE, "raw", `${slug}.json`), "utf8"));

/**
 * Everything shipped for one page: the reference plus its sibling `<page>.tables.md`, which is
 * where compose puts a spec table too wide for the main file. A media occurrence inside a table cell
 * lives there, so a coverage check that reads only the reference reports it missing — which is a
 * false alarm that trains a reader to ignore the check.
 */
async function shipped(root: string, slug: string): Promise<string> {
  const base = join(root, "skills", SKILL, "references");
  for (const cat of await listFiles(base, "")) {
    const p = join(base, cat, `${slug}.md`);
    if (!(await exists(p))) continue;
    let out = await readFile(p, "utf8");
    const tables = join(base, cat, `${slug}.tables.md`);
    if (await exists(tables)) out += "\n" + (await readFile(tables, "utf8"));
    return out;
  }
  throw new Error(`no shipped reference for page ${slug}`);
}

/**
 * The section a line sits in, identified by the nearest preceding heading or bold label. Presence
 * "somewhere in the file" is not the claim being made: a caption filed under the wrong example is
 * still a misstatement of what Apple said about *that* example.
 */
function sectionOf(doc: string, needle: string): { heading: string; label: string } {
  const lines = doc.split("\n");
  const i = lines.findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`not present at all: ${needle.slice(0, 70)}…`);
  let heading = "";
  let label = "";
  for (let j = i - 1; j >= 0; j--) {
    const l = lines[j]!.trim();
    if (!label) {
      const bold = /^-?\s*\*\*(.+?)\*\*$/.exec(l);
      if (bold) label = bold[1]!;
    }
    if (l.startsWith("#")) {
      heading = l.replace(/^#+\s*/, "").replace(/\s*\{#.*\}$/, "");
      break;
    }
  }
  return { heading, label };
}

/** Every media occurrence in a raw page, with the marker the normalizer must have produced. */
interface Occurrence {
  slug: string;
  identifier?: string;
  type: string;
  block: boolean;
  alt: string;
  caption: boolean;
  marker: string;
}

function occurrencesOf(doc: DoccDocument, slug: string): Occurrence[] {
  const refs: Record<string, DoccRef> = doc.references ?? {};
  const out: Occurrence[] = [];
  // A block media node is a direct member of a `content`/`columns[].content`/`tabs[].content`
  // array; the same node type nested in `inlineContent` is the inline form. The distinction
  // matters because only the block form gets a locator.
  const walkInline = (nodes: Inline[] | undefined) => {
    for (const n of nodes ?? []) {
      const ref = n.identifier ? refs[n.identifier] : undefined;
      const isMedia = n.type === "image" || n.type === "video" || ref?.type === "image" || ref?.type === "video";
      if (isMedia) {
        const type = (ref?.type ?? n.type)!;
        out.push({
          slug,
          identifier: n.identifier,
          type,
          block: false,
          alt: ref?.alt ?? "",
          caption: !!n.metadata?.abstract?.length,
          marker: figureText(ref, undefined, { media: type, caption: inlineText(n.metadata?.abstract, refs) }),
        });
      }
      walkInline(n.inlineContent);
      walkInline(n.overridingTitleInlineContent);
      walkInline(n.metadata?.abstract);
    }
  };
  const walkBlocks = (blocks: Block[] | undefined) => {
    for (const b of blocks ?? []) {
      if (b.type === "image" || b.type === "video") {
        const ref = b.identifier ? refs[b.identifier] : undefined;
        out.push({
          slug,
          identifier: b.identifier,
          type: b.type,
          block: true,
          alt: ref?.alt ?? "",
          caption: !!b.metadata?.abstract?.length,
          marker: figureText(ref, undefined, {
            media: b.type,
            caption: inlineText(b.metadata?.abstract, refs),
            locator: b.identifier,
          }),
        });
      }
      walkInline(b.inlineContent);
      walkBlocks(b.content);
      for (const c of b.columns ?? []) walkBlocks(c.content);
      for (const t of b.tabs ?? []) walkBlocks(t.content);
      for (const it of b.items ?? []) walkBlocks(it.content);
      for (const row of b.rows ?? []) for (const cell of row) walkBlocks(cell);
    }
  };
  for (const s of doc.primaryContentSections ?? []) walkBlocks(s.content);
  return out;
}

/**
 * The caption text as the normalizer itself would render it. Reconstructing it by hand here would
 * make the probe agree with a bug: a caption containing `systemRed` renders with backticks, and a
 * hand-rolled plain-text version would silently "not find" it and call that an omission.
 */
const inlineText = (nodes: Inline[] | undefined, refs: Record<string, DoccRef> = {}): string =>
  inlineToText(nodes, refs).trim();

/**
 * Enumerated, declared reasons a media occurrence legitimately does not appear as a marker in the
 * shipped reference. Anything outside this list is a defect, which is the entire point: a silent
 * omission and a clean build must not look the same.
 */
type Excuse =
  /** A crawled container page that falls under the word threshold and ships no reference at all. */
  | "page not shipped"
  /** Under a heading the manifest's `skip_sections` removes (Resources, Change log, …). */
  | "skipped section"
  /** An availability table's checkmark cell, deliberately rendered "✓" instead of its alt text. */
  | "checkmark cell"
  /** Page-header art above the first heading: decoration, dropped by the extractor on purpose. */
  | "page header art"
  /** Past the extractor's per-rule context cap, where it leaves its own explicit overflow marker. */
  | "context overflow";

interface Coverage {
  total: number;
  rendered: number;
  captions: number;
  videos: number;
  excused: Record<string, number>;
  unexplained: Occurrence[];
}

async function corpusCoverage(root: string): Promise<Coverage> {
  const source = await loadSource(SOURCE);
  const skipRe = new RegExp(`^#{1,6} (${source.skip_sections.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const raw = join(root, ".cache", SOURCE, "raw");
  const mdDir = join(root, ".cache", SOURCE, "md");

  const cov: Coverage = { total: 0, rendered: 0, captions: 0, videos: 0, excused: {}, unexplained: [] };
  const excuse = (e: Excuse) => (cov.excused[e] = (cov.excused[e] ?? 0) + 1);

  for (const f of await listFiles(raw, ".json")) {
    const slug = f.replace(/\.json$/, "");
    const doc = await rawPage(root, slug);
    const occ = occurrencesOf(doc, slug);
    cov.total += occ.length;
    cov.captions += occ.filter((o) => o.caption).length;
    cov.videos += occ.filter((o) => o.type === "video").length;
    if (!occ.length) continue;

    // Not every crawled page becomes a reference: container pages fall under the word threshold.
    // That is a property of the page, not of its media, so it excuses the whole page at once.
    const mdPath = join(mdDir, `${slug}.md`);
    const ship = await shipped(root, slug).catch(() => "");
    if (!(await exists(mdPath)) || !ship) {
      for (const _ of occ) excuse("page not shipped");
      continue;
    }
    const { body } = parseFrontmatter(await readFile(mdPath, "utf8"));

    // Split the normalized page into the lines that survive `skip_sections` and those that do not,
    // so "absent because the manifest excludes that section" is distinguishable from "absent".
    const kept: string[] = [];
    const dropped: string[] = [];
    let keep = true;
    for (const line of body.split("\n")) {
      if (line.startsWith("#")) keep = !skipRe.test(line);
      (keep ? kept : dropped).push(line);
    }
    const droppedText = dropped.join("\n");
    // The extractor caps context blocks per rule and says so explicitly when it trims.
    const overflow = /_\[\d+ further block\(s\) here are not included/.test(ship);

    for (const o of occ) {
      if (ship.includes(o.marker)) {
        cov.rendered++;
        continue;
      }
      // An availability table's checkmark cell is compacted to "✓" by design; repeating the alt
      // text in every cell would drown the table it is annotating.
      if (/check\s?mark|available/i.test(o.alt) && !o.caption) {
        excuse("checkmark cell");
        continue;
      }
      if (droppedText.includes(o.marker)) {
        excuse("skipped section");
        continue;
      }
      const at = kept.findIndex((l) => l.includes(o.marker));
      if (at < 0) {
        cov.unexplained.push(o);
        continue;
      }
      // Above the first `##`: the decorative page-header illustration, which the extractor drops
      // deliberately because it carries no guidance.
      if (!kept.slice(0, at + 1).some((l) => /^#{2,}\s/.test(l))) {
        excuse("page header art");
        continue;
      }
      if (overflow) {
        excuse("context overflow");
        continue;
      }
      cov.unexplained.push(o);
    }
  }
  return cov;
}

export const CHECKS: Check[] = [
  {
    finding: "A1",
    requirement: "A block video leaves a marker naming it, in the section that discusses it",
    observe: async () => {
      // pointing-devices.json → primaryContentSections[0].content[17] is `text-entry-pointer.mp4`,
      // the audit's own example: a 350-character alternative description that used to render as the
      // empty string. It demonstrates pointer shape changes between text fields, and nothing else on
      // the page says so.
      const root = process.cwd();
      const doc = await rawPage(root, "pointing-devices");
      const node = doc.primaryContentSections?.[0]?.content?.[17] as Block | undefined;
      if (node?.type !== "video") throw new Error(`source moved: content[17] is ${node?.type ?? "missing"}, not a video`);
      const alt = (doc.references ?? {})[node.identifier!]?.alt;
      if (!alt) throw new Error("source video has no alternative description to carry");
      const ship = await shipped(root, "pointing-devices");
      const marker = figureText((doc.references ?? {})[node.identifier!], undefined, { media: "video", locator: node.identifier });
      if (!ship.includes(marker)) throw new Error(`the block video is not in the shipped reference: ${marker.slice(0, 80)}…`);
      if (!/_\[figure: video — /.test(marker)) throw new Error("the marker does not distinguish a video from a still image");
      if (!marker.includes(`source: ${node.identifier}`)) throw new Error("the marker carries no locator back to the original figure");
      const { heading } = sectionOf(ship, marker);
      if (!/pointer/i.test(heading)) throw new Error(`the video is filed under "${heading}", not the pointer section that discusses it`);
      return `text-entry-pointer.mp4 renders as a video marker with a locator under "${heading}" (${alt.length}-char description retained)`;
    },
  },
  {
    finding: "A1",
    requirement: "An occurrence's caption ships beside its own media, labelled apart from the alt text",
    observe: async () => {
      // privacy.json → …content[29].tabs[0].content[1].inlineContent[0]: the alt describes an X in a
      // circle, while the caption adds a restriction found nowhere else — you may not withhold
      // functionality until people allow tracking.
      const root = process.cwd();
      const doc = await rawPage(root, "privacy");
      const tabs = (doc.primaryContentSections?.[0]?.content?.[29] as Block | undefined)?.tabs;
      const node = (tabs?.[0]?.content?.[1] as Block | undefined)?.inlineContent?.[0];
      if (!node) throw new Error("source moved: privacy content[29].tabs[0] no longer holds that media occurrence");
      const ref = (doc.references ?? {})[node.identifier!];
      const caption = inlineText(node.metadata?.abstract, doc.references ?? {});
      if (!caption.includes("withhold functionality")) throw new Error("source caption moved; this probe no longer tests what it claims");
      const ship = await shipped(root, "privacy");
      const marker = figureText(ref, undefined, { media: "image", caption });
      if (!ship.includes(marker)) throw new Error(`the caption does not ship attached to its own media: ${caption.slice(0, 70)}…`);
      // Labelled apart: the alt is the description, `caption:` introduces the instruction.
      if (!marker.includes(` — caption: `)) throw new Error("caption and alternative text are merged into one undifferentiated string");
      if (!ref?.alt || !marker.startsWith(`_[figure: ${ref.alt}`)) throw new Error("the occurrence lost the asset's own alternative description");
      const { label } = sectionOf(ship, marker);
      if (label !== "Incentive") throw new Error(`the caption is filed under "${label}", not the Incentive example it belongs to`);
      return `the ${caption.length}-char caption ships under the "${label}" example, labelled apart from a ${ref.alt.length}-char alternative description`;
    },
  },
  {
    finding: "A1",
    requirement: "In a multi-tab example each tab's media keeps its own caption and its own tab",
    observe: async () => {
      // The same crossout.png is reused by all four tabs of privacy's prohibited-design example. A
      // caption read from the asset would give every tab identical text; it belongs to the
      // occurrence. Each must land under its own tab label.
      const root = process.cwd();
      const doc = await rawPage(root, "privacy");
      const tabs = (doc.primaryContentSections?.[0]?.content?.[29] as Block | undefined)?.tabs ?? [];
      if (tabs.length < 4) throw new Error(`source moved: expected 4 tabs, found ${tabs.length}`);
      const ship = await shipped(root, "privacy");
      const seen = new Set<string>();
      for (const tab of tabs) {
        const node = (tab.content?.[1] as Block | undefined)?.inlineContent?.[0];
        if (!node) throw new Error(`tab "${tab.title}" no longer holds a captioned media occurrence`);
        const caption = inlineText(node.metadata?.abstract, doc.references ?? {});
        const marker = figureText((doc.references ?? {})[node.identifier!], undefined, { media: "image", caption });
        if (seen.has(marker)) throw new Error(`two tabs render the identical marker; the caption came from the asset, not the occurrence`);
        seen.add(marker);
        const { label } = sectionOf(ship, marker);
        if (label !== tab.title) throw new Error(`the "${tab.title}" caption is filed under "${label}"`);
      }
      return `${tabs.length} tabs share one asset and each keeps its own caption under its own label (${[...tabs.map((t) => t.title)].join(", ")})`;
    },
  },
  {
    finding: "A1",
    requirement: "A table does not delete a figure from the section it illustrates",
    observe: async () => {
      // Two defects in `extract/rules.ts` deleted figures from a *different* place than the one the
      // table was in, and both were found by the coverage check rather than by anything targeted.
      // They get their own named check because a count that quietly drops by one reads like nothing.
      //   1. `lastContext` survived a heading, so a table adopted the previous section's last block
      //      as its caption and popped it (airplay's blue icon set).
      //   2. `lastProse` skips figures and `lastContext` does not, so with a figure between the
      //      lead-in and the table the pop removed the figure instead of the duplicated prose
      //      (11 occurrences across wallet, game-center and top-shelf).
      const root = process.cwd();
      const cases: { slug: string; figure: string; section: string }[] = [
        { slug: "airplay", figure: "Two blue AirPlay icons", section: "Custom color AirPlay icon" },
        { slug: "wallet", figure: "callout identifying the logo position", section: "Logo" },
        { slug: "top-shelf", figure: "An illustration showing an outlined square that co", section: "Square (1:1)" },
        { slug: "game-center", figure: "achievement image in iOS, iPadOS, macOS, and visionOS", section: "Creating achievement images" },
      ];
      for (const c of cases) {
        const ship = await shipped(root, c.slug);
        const { heading } = sectionOf(ship, c.figure);
        if (!heading.includes(c.section)) {
          throw new Error(`${c.slug}: the figure is filed under "${heading}", not the "${c.section}" section it illustrates`);
        }
      }
      return `${cases.length} figures adjacent to a spec table stay in the section they illustrate`;
    },
  },
  {
    finding: "A1",
    requirement: "Every media occurrence in the raw corpus renders or carries an enumerated exclusion",
    observe: async () => {
      // The complement of the three probes above: they check the cases I thought to look for, this
      // checks the ones I did not. An omission with no declared reason fails here.
      const { total, rendered, captions, videos, excused, unexplained } = await corpusCoverage(process.cwd());
      if (unexplained.length) {
        const e = unexplained[0]!;
        throw new Error(
          `${unexplained.length}/${total} media occurrence(s) are neither rendered nor excused, e.g. ${e.slug} ${e.identifier} (${e.type}${e.caption ? ", captioned" : ""})`,
        );
      }
      const reasons = Object.entries(excused).sort().map(([k, v]) => `${v} ${k}`).join(", ");
      return `${rendered}/${total} rendered (${videos} videos, ${captions} captioned), ${total - rendered} excused: ${reasons || "none"}`;
    },
  },
];

/**
 * Negative probes: each reintroduces a defect this fix actually removed, and the matching check
 * above must fail. A check that has never been seen to fail is a guess.
 */
const editRef = async (dir: string, slug: string, fn: (s: string) => string) => {
  const base = join(dir, "skills", SKILL, "references");
  for (const cat of await listFiles(base, "")) {
    const p = join(base, cat, `${slug}.md`);
    if (!(await exists(p))) continue;
    const before = await readFile(p, "utf8");
    const after = fn(before);
    if (after === before) throw new Error(`the defect did not change ${slug}.md; the fixture text has moved`);
    await Bun.write(p, after);
    return;
  }
  throw new Error(`no shipped reference for ${slug}`);
};

export const CASES: Case[] = [
  {
    finding: "A1",
    name: "a block video dropped from the reference, as the old normalizer dropped all 61",
    break: (d) => editRef(d, "pointing-devices", (s) => s.replace(/^.*text-entry-pointer\.mp4.*$\n?/m, "")),
  },
  {
    finding: "A1",
    name: "a block video rendered without its video/still distinction and locator",
    break: (d) =>
      editRef(d, "pointing-devices", (s) =>
        s.replace(/_\[figure: video — (.*?) — source: text-entry-pointer\.mp4\]_/, "_[figure: $1]_"),
      ),
  },
  {
    finding: "A1",
    name: "a block video filed under the wrong section",
    break: async (d) => {
      let line = "";
      await editRef(d, "pointing-devices", (s) => {
        line = s.split("\n").find((l) => l.includes("text-entry-pointer.mp4"))!;
        return s.replace(`${line}\n`, "");
      });
      // Re-file it under the page's first heading instead of the pointer section.
      await editRef(d, "pointing-devices", (s) => s.replace(/^(#+ .*)$/m, `$1\n\n${line}`));
    },
  },
  {
    finding: "A1",
    name: "an occurrence caption merged into the alternative description",
    break: (d) => editRef(d, "privacy", (s) => s.replace(" — caption: Don’t offer incentives", ". Don’t offer incentives")),
  },
  {
    finding: "A1",
    name: "an occurrence caption dropped, leaving only the picture's description",
    break: (d) =>
      editRef(d, "privacy", (s) =>
        s.replace(/ — caption: Don’t offer incentives[^\]]*\]_/, "]_"),
      ),
  },
  {
    finding: "A1",
    name: "two tabs of one example given the same caption, as an asset-level caption would",
    break: (d) =>
      editRef(d, "privacy", (s) =>
        s.replace(/caption: Don’t display a custom screen[^\]]*/, "caption: Don’t offer incentives for granting the request."),
      ),
  },
  {
    finding: "A1",
    name: "a caption moved to the neighbouring example",
    break: (d) =>
      editRef(d, "privacy", (s) => {
        const lines = s.split("\n");
        const i = lines.findIndex((l) => l.includes("caption: Don’t offer incentives"));
        const j = lines.findIndex((l) => l.includes("caption: Don’t display a custom screen"));
        if (i < 0 || j < 0) throw new Error("the privacy example pair has moved");
        [lines[i], lines[j]] = [lines[j]!, lines[i]!];
        return lines.join("\n");
      }),
  },
  {
    finding: "A1",
    name: "a table deleting the figure from the section it illustrates",
    break: (d) => editRef(d, "wallet", (s) => s.replace(/^.*callout identifying the logo position.*$\n?/m, "")),
  },
  {
    finding: "A1",
    name: "an arbitrary figure deleted, with no exclusion reason recorded",
    break: (d) => editRef(d, "buttons", (s) => s.replace(/^_\[figure: video — .*$\n?/m, "")),
  },
];

// Standalone run: `bun run src/e2e/probes/apple-media.ts`.
if (import.meta.main) {
  if (!(await exists(paths.irPages(SOURCE)))) {
    log.warn(`apple-media probes skipped: build ${SOURCE} first`);
    process.exit(0);
  }
  let failed = 0;
  for (const c of CHECKS) {
    try {
      console.log(`✓ finding ${c.finding} — ${c.requirement}\n    observed: ${await c.observe()}`);
    } catch (e) {
      failed++;
      console.log(`✗ finding ${c.finding} — ${c.requirement}\n    ${(e as Error).message}`);
    }
  }
  if (failed) {
    log.warn(`${failed}/${CHECKS.length} media requirements are not satisfied by the shipped artifacts`);
    process.exit(1);
  }
  log.info(`${CHECKS.length}/${CHECKS.length} media requirements verified against the shipped artifacts`);
}
