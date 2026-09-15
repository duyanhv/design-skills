#!/usr/bin/env bun
/**
 * Retrieval cost: what does it actually cost, in bytes and tokens, to get from a task to a rule?
 *
 * AUDIT-OUTPUT finding A6 estimated this by hand and said so. Estimates are how a routing table
 * gets shrunk for a cost nobody measured, so this measures the artifacts instead:
 *
 *   - entry file, index and per-reference size, with the distribution and the worst offenders;
 *   - for every routing row, the cost of taking it literally and reading each file it names in full;
 *   - cost-to-first-decision for three task shapes — a narrow control question, a broad screen
 *     review, and a topic no routing row names;
 *   - whether the narrow cases could be answered by heading navigation instead of a whole file,
 *     which is only true if every rule sits under a heading the page's own contents list anchors.
 *
 * Tokens are chars/4, the same estimate the rest of the repo uses (`trace` finding 8). It is an
 * estimate: a real tokenizer would move these numbers by some percent, and every figure here is
 * comparative — file against file, route against route — so the bias cancels. Nothing in this file
 * fails a build. It reports; the budget is a human decision informed by it.
 *
 * Usage: `bun run budget [source-id]` — needs the source built locally.
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { exists, listDirs, listFiles, listSources, loadSource, paths, readJson } from "../util/fs.ts";
import type { PageIR } from "../schema/ir.ts";
import { log } from "../util/log.ts";

/** The repo-wide estimate: four characters per token. Comparative, not exact. */
export const tokens = (s: string) => Math.ceil(s.length / 4);

export interface FileCost { path: string; bytes: number; tokens: number }
export interface RouteCost { row: string; files: string[]; bytes: number; tokens: number; missing: string[] }
export interface AnchorReach {
  /** Rules whose section renders as a heading, so a reader can jump to it by anchor at all. */
  headed: number;
  /** Rules whose section is *listed*, with an anchor, in the page's own Contents list. */
  listed: number;
  total: number;
  /** Pages carrying a Contents list, out of pages compared. */
  pagesWithContents: number;
  pagesCompared: number;
  examples: string[];
}
export interface Budget {
  id: string;
  skill: string;
  entry: FileCost;
  index: FileCost | null;
  pages: FileCost[];
  routes: RouteCost[];
  anchors: AnchorReach;
  /** Cost of the largest heading slice of a page, versus the whole page. */
  slices: { page: string; whole: number; largestSlice: number }[];
}

const cost = (path: string, text: string): FileCost => ({ path, bytes: Buffer.byteLength(text, "utf8"), tokens: tokens(text) });

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};

/** Anchor a heading the way `trace` O-8 does, so "reachable" means the same thing in both places. */
const anchorOf = (h: string) => h.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");

/**
 * Split a reference into its `### ` heading slices. This is the unit an agent would read if it
 * navigated by heading instead of loading the file, so its size is the honest alternative cost.
 */
export function slices(doc: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  let heading = "(preamble)";
  let buf: string[] = [];
  for (const line of doc.split("\n")) {
    const m = /^#{2,6} (.+)$/.exec(line);
    if (m) {
      out.push({ heading, text: buf.join("\n") });
      heading = m[1]!;
      buf = [];
    }
    buf.push(line);
  }
  out.push({ heading, text: buf.join("\n") });
  return out;
}

export async function budgetOf(id: string): Promise<Budget> {
  const source = await loadSource(id);
  const skill = source.skill.name;
  const root = paths.skill(skill);

  const entryText = await readFile(join(root, "SKILL.md"), "utf8");
  const entry = cost("SKILL.md", entryText);
  const indexPath = join(root, "index.md");
  const index = (await exists(indexPath)) ? cost("index.md", await readFile(indexPath, "utf8")) : null;

  // Every reference page, with its `.tables.md` sibling folded in: a reader who opens the topic
  // gets sent to the companion by the entry file, so the pair is what a "read the topic" costs.
  const refRoot = join(root, "references");
  const pages: FileCost[] = [];
  const docs = new Map<string, string>();
  for (const cat of await listDirs(refRoot)) {
    for (const f of await listFiles(join(refRoot, cat), ".md")) {
      if (f.endsWith(".tables.md")) continue;
      const rel = `references/${cat}/${f}`;
      let text = await readFile(join(refRoot, cat, f), "utf8");
      const tbl = join(refRoot, cat, f.replace(/\.md$/, ".tables.md"));
      if (await exists(tbl)) text += await readFile(tbl, "utf8");
      docs.set(rel, text);
      pages.push(cost(rel, text));
    }
  }

  // Routing rows, read out of the entry file's own table rather than a copy of it here.
  const routes: RouteCost[] = [];
  for (const m of entryText.matchAll(/^\| ([^|\n]+?) \| ([^|\n]+) \|$/gm)) {
    const row = m[1]!.trim();
    if (row === "When the task involves…" || /^-+$/.test(row)) continue;
    const links = [...m[2]!.matchAll(/\]\((references\/[^)\s#]+\.md)\)/g)].map((l) => l[1]!);
    if (!links.length) continue;
    const missing = links.filter((l) => !docs.has(l));
    const text = links.map((l) => docs.get(l) ?? "").join("");
    routes.push({ row, files: links, bytes: Buffer.byteLength(text, "utf8"), tokens: tokens(text), missing });
  }

  // Anchor reachability: can a narrow question be answered without loading a whole file? Only if
  // the rule's own section is anchored from the page's contents list.
  let headed = 0;
  let listed = 0;
  let total = 0;
  let pagesWithContents = 0;
  let pagesCompared = 0;
  const examples: string[] = [];
  const sliceRows: { page: string; whole: number; largestSlice: number }[] = [];
  for (const f of await listFiles(paths.irPages(id), ".json")) {
    const ir = (await readJson<PageIR>(join(paths.irPages(id), f)))!;
    const rel = `references/${ir.category}/${ir.page}.md`;
    const doc = docs.get(rel);
    if (!doc) continue;
    pagesCompared++;
    const contents = [...doc.matchAll(/^- \[[^\]]+\]\(#([^)]+)\)/gm)].map((c) => c[1]!.toLowerCase());
    const anchors = new Set(contents);
    if (anchors.size) pagesWithContents++;
    // Every `### ` heading actually rendered on the page: an anchor a reader can jump to, whether
    // or not the page bothered to list it in a Contents block.
    const rendered = new Set([...doc.matchAll(/^#{2,6} (.+)$/gm)].map((h) => anchorOf(h[1]!)));
    for (const r of ir.rules) {
      total++;
      if (rendered.has(anchorOf(r.section))) headed++;
      else if (examples.length < 5) examples.push(`${r.id} under "${r.section}" (no heading of its own)`);
      if (anchors.has(anchorOf(r.section))) listed++;
    }
    const parts = slices(doc).map((s) => tokens(s.text));
    sliceRows.push({ page: ir.page, whole: tokens(doc), largestSlice: Math.max(0, ...parts) });
  }

  return {
    id, skill, entry, index, pages, routes,
    anchors: { headed, listed, total, pagesWithContents, pagesCompared, examples },
    slices: sliceRows,
  };
}

/**
 * Cost-to-first-decision for three task shapes. Each is "what an agent following the entry file's
 * own instructions would load before it can state a rule", under two strategies:
 *   whole  — read the topic file(s) in full, which is what step 2 literally says
 *   anchor — read the entry file, then the topic's contents list and the one section that answers
 */
export interface Shape { name: string; strategyWhole: number; strategyAnchor: number | null; note: string }

export async function shapes(b: Budget): Promise<Shape[]> {
  const root = paths.skill(b.skill);
  const read = async (rel: string) => ((await exists(join(root, rel))) ? await readFile(join(root, rel), "utf8") : null);
  const out: Shape[] = [];

  const narrow = b.id === "apple-hig" ? "references/components/buttons.md" : "references/perceivable/distinguishable.md";
  const doc = await read(narrow);
  if (doc) {
    // The anchor strategy costs the entry file, the page's front matter + contents list, and the
    // single largest section — the worst case among sections, not a flattering average.
    const head = doc.slice(0, doc.indexOf("\n## Rules") + 1 || doc.length);
    const biggest = Math.max(...slices(doc).map((s) => tokens(s.text)));
    out.push({
      name: `narrow control question (${narrow.split("/").pop()})`,
      strategyWhole: b.entry.tokens + tokens(doc),
      strategyAnchor: b.entry.tokens + tokens(head) + biggest,
      note: "entry + topic, versus entry + contents list + the single largest section",
    });
  }

  const broad = b.routes[0];
  if (broad) {
    out.push({
      name: `broad review, first routing row ("${broad.row.slice(0, 40)}…")`,
      strategyWhole: b.entry.tokens + broad.tokens,
      strategyAnchor: null,
      note: `${broad.files.length} files read in full; no anchor strategy is defined for a multi-file row`,
    });
  }

  // An uncommon topic: one no routing row names, so the agent pays for the index as well.
  const routed = new Set(b.routes.flatMap((r) => r.files));
  const uncommon = b.pages.filter((p) => !routed.has(p.path)).sort((a, b2) => b2.tokens - a.tokens)[0];
  if (uncommon) {
    out.push({
      name: `uncommon topic (${uncommon.path.split("/").pop()})`,
      strategyWhole: b.entry.tokens + (b.index?.tokens ?? 0) + uncommon.tokens,
      strategyAnchor: null,
      note: "entry + index + topic: the index is the price of a topic no routing row names",
    });
  }
  return out;
}

if (import.meta.main) {
  const only = process.argv[2];
  const ids = only ? [only] : await listSources();
  let ran = 0;
  for (const id of ids) {
    if (!(await exists(paths.irPages(id)))) {
      console.log(`- ${id}: skipped (not built)`);
      continue;
    }
    ran++;
    const b = await budgetOf(id);
    const ts = b.pages.map((p) => p.tokens);
    const totalTokens = ts.reduce((n, t) => n + t, 0);
    console.log(`\n== ${b.id} (skills/${b.skill}) ==`);
    console.log(`entry     ${b.entry.bytes.toLocaleString()} B  ~${b.entry.tokens.toLocaleString()} tok`);
    console.log(`index     ${b.index ? `${b.index.bytes.toLocaleString()} B  ~${b.index.tokens.toLocaleString()} tok` : "(none)"}`);
    console.log(
      `pages     ${b.pages.length} files, ~${totalTokens.toLocaleString()} tok total · ` +
        `median ~${pct(ts, 50).toLocaleString()} · p90 ~${pct(ts, 90).toLocaleString()} · max ~${Math.max(...ts).toLocaleString()}`,
    );
    console.log("\nworst offenders (whole file, incl. .tables.md):");
    for (const p of [...b.pages].sort((x, y) => y.tokens - x.tokens).slice(0, 8)) {
      console.log(`  ~${String(p.tokens).padStart(6)} tok  ${p.path}`);
    }

    console.log("\nrouting rows, read in full:");
    for (const r of [...b.routes].sort((x, y) => y.tokens - x.tokens)) {
      const miss = r.missing.length ? `  ‼ ${r.missing.length} missing file(s)` : "";
      console.log(`  ~${String(r.tokens).padStart(6)} tok  ${r.files.length} files  ${r.row.slice(0, 52)}${miss}`);
    }
    const rt = b.routes.map((r) => r.tokens);
    if (rt.length) {
      console.log(`  → median row ~${pct(rt, 50).toLocaleString()} tok, worst ~${Math.max(...rt).toLocaleString()} tok`);
    }

    console.log("\ncost to first decision (entry file included in every figure):");
    for (const s of await shapes(b)) {
      const anchor = s.strategyAnchor === null ? "—" : `~${s.strategyAnchor.toLocaleString()}`;
      console.log(`  ${s.name}\n    whole ~${s.strategyWhole.toLocaleString()} tok · anchor ${anchor} tok · ${s.note}`);
    }

    const a = b.anchors;
    const share = (n: number) => (a.total ? `${((100 * n) / a.total).toFixed(1)}%` : "—");
    console.log(
      `\nanchor navigation:` +
        `\n  ${a.headed.toLocaleString()}/${a.total.toLocaleString()} rules (${share(a.headed)}) sit under a rendered heading — reachable by anchor if the reader already knows the heading` +
        `\n  ${a.listed.toLocaleString()}/${a.total.toLocaleString()} rules (${share(a.listed)}) sit under a section the page's own Contents list links` +
        `\n  ${a.pagesWithContents}/${a.pagesCompared} pages carry a Contents list at all (compose adds one only to long pages), which is what the gap between those two numbers measures`,
    );
    if (a.examples.length) {
      console.log("  rules with no heading of their own, e.g.:");
      for (const e of a.examples) console.log(`    ${e}`);
    }
    const worstSlice = [...b.slices].sort((x, y) => y.largestSlice - x.largestSlice)[0];
    if (worstSlice) {
      console.log(
        `  largest single section anywhere: ${worstSlice.page} ~${worstSlice.largestSlice.toLocaleString()} tok ` +
          `(whole page ~${worstSlice.whole.toLocaleString()} tok)`,
      );
    }
  }
  if (!ran) log.warn("no source is built locally; nothing to measure");
  else log.info("retrieval cost reported; this check never fails a build — the budget is a decision, not an assertion");
}
