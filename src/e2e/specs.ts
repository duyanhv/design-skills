#!/usr/bin/env bun
/**
 * The authored guides promise they carry no specifications. This checks that they keep the promise.
 *
 * `apple-design/SKILL.md` says, in as many words, that the bundle contains no sizes, spacing, type
 * scales, contrast ratios, or colour values, and every task file repeats some form of "read the
 * value on the page and record its units". That boundary exists for two reasons: a copied number is
 * wrong the next time the source revises it, and copying Apple's or Google's specifications is
 * redistribution this project has no licence for.
 *
 * It is also easy to breach by accident while writing a helpful example. An audit found exactly
 * that: a guide illustrating hit targets with "a 16pt SF Symbol inside a 44pt button", stated
 * without platform qualification, two sections after promising no numbers — and 44 is not even
 * universal, since visionOS differs. The sentence read as an explanation and functioned as an
 * unsourced specification.
 *
 * So: no measurement literals in `guidance/`. Prose that describes *how* to find a number is
 * encouraged; prose that states one is not. Version numbers, list markers, and ordinary English
 * survive, because the patterns below match a number bound to a unit.
 *
 * Usage: bun run src/e2e/specs.ts
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { ROOT, listSources, loadSource } from "../util/fs.ts";
import { log } from "../util/log.ts";

interface Pattern {
  name: string;
  re: RegExp;
  why: string;
}

const PATTERNS: Pattern[] = [
  {
    name: "a length with a unit",
    re: /\b\d+(?:\.\d+)?\s*(?:pt|px|dp|sp|points?|pixels?)\b/gi,
    why: "sizes and spacing are per platform and change between releases; link the page instead",
  },
  {
    name: "a pixel dimension",
    re: /\b\d+\s*[x×]\s*\d+\s*(?:pt|px|dp|points?|pixels?)?\b/gi,
    why: "a target or asset dimension belongs to the source, and differs by platform",
  },
  {
    name: "a contrast ratio",
    re: /\b\d+(?:\.\d+)?\s*:\s*1\b/g,
    why: "a ratio belongs to the standard that defines it; name the standard and link it",
  },
  {
    name: "a colour literal",
    re: /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/gi,
    why: "system colours are semantic and adapt; a literal does not",
  },
  {
    name: "a font weight or size value",
    re: /\bfont-(?:size|weight)\s*[:=]|\bweight\s*[:=]\s*\d+/gi,
    why: "type scales are published per platform and per text style",
  },
];

/** Lines inside fenced code are exempt: a code example may legitimately show an API call. */
function proseLines(markdown: string): { line: string; number: number }[] {
  const out: { line: string; number: number }[] = [];
  let fenced = false;
  markdown.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (!fenced) out.push({ line, number: index + 1 });
  });
  return out;
}

/** A URL may contain digits that mean nothing here (anchors, versions). Strip links first. */
const withoutLinks = (line: string) => line.replace(/\]\([^)]*\)/g, "]()").replace(/https?:\/\/\S+/g, "");

async function markdownFiles(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) out.push(...(await markdownFiles(join(dir, entry.name), name + "/")));
    else if (entry.name.endsWith(".md")) out.push(join(dir, entry.name));
  }
  return out;
}

let failed = 0;
let scanned = 0;

for (const id of await listSources()) {
  if ((await loadSource(id)).kind !== "authored") continue;
  for (const file of await markdownFiles(join(ROOT, "guidance", id))) {
    scanned++;
    const shown = relative(ROOT, file);
    for (const { line, number } of proseLines(await readFile(file, "utf8"))) {
      const text = withoutLinks(line);
      for (const pattern of PATTERNS) {
        for (const match of text.matchAll(pattern.re)) {
          failed++;
          console.log(`✗ ${shown}:${number}: ${pattern.name} — "${match[0].trim()}"`);
          console.log(`    ${pattern.why}`);
        }
      }
    }
  }
}

if (failed) {
  log.warn(`${failed} specification value(s) in authored guidance, which is supposed to carry none`);
  process.exit(1);
}
log.info(`${scanned} authored guidance file(s) carry no copied specification values`);
