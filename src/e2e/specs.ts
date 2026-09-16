/**
 * Measurements in authored guidance must come from a verified record.
 *
 * The rule here used to be simpler and wrong: *no measurements at all*. That was a blunt reaction to
 * having once written "a 16pt SF Symbol inside a 44pt button" with no platform and no source. It
 * stopped the symptom and prevented the cure, because a design guide that cannot state a target size
 * cannot answer the question agents most often get wrong.
 *
 * Relaxing it to "a number is fine if it names a platform and cites a section" would not have been
 * enough either. A review of that proposal caught me about to publish "iOS minimum target is
 * 44x44 pt" — platform named, section citable, and **false**: Apple's table gives 44x44 as the
 * *Default* and 28x28 as the *Minimum*. A regex cannot tell that a citation fails to support the
 * claim built on it.
 *
 * So the rule is now: a measurement may appear in `guidance/` only where a record in
 * `guidance/<id>/records/` carries that exact value, and the file citing it names the record. The
 * record supplies what a bare number cannot — which column it came from, what the source calls it,
 * which platforms it covers, its conditions and exceptions, and a snapshot to re-verify against.
 * `bun run records` then checks those records against the live source, including that the declared
 * table header really is the header of the table in that section.
 *
 * Division of labour:
 *   - this check (offline, in `check` and CI): every measurement traces to a record.
 *   - `bun run records` (network): every record still matches the source.
 *
 * Still refused outright: colour literals, which have no legitimate place in guidance that tells
 * readers to use semantic colours.
 *
 * Usage: bun run src/e2e/specs.ts
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { ROOT, exists, listSources, loadSource } from "../util/fs.ts";
import { log } from "../util/log.ts";

interface Pattern {
  name: string;
  re: RegExp;
  why: string;
  /** A measurement may be licensed by a record; a colour literal never can be. */
  recordable: boolean;
}

const PATTERNS: Pattern[] = [
  {
    name: "a pixel dimension",
    re: /(?<![\d.])\d+(?:\.\d+)?\s*[x\u00d7]\s*\d+(?:\.\d+)?(?:\s*(?:pt|px|dp|points?|pixels?))?(?!\.?\d)/gi,
    why: "a target dimension belongs to a source table with named columns; publish a record and cite it",
    recordable: true,
  },
  {
    name: "a length with a unit",
    re: /(?<![\d.])\d+(?:\.\d+)?\s*(?:pt|px|dp|sp|points?|pixels?)\b/gi,
    why: "sizes are per platform and per meaning (default vs minimum); publish a record and cite it",
    recordable: true,
  },
  {
    name: "a contrast ratio",
    re: /\b\d+(?:\.\d+)?\s*:\s*1\b/g,
    why: "a ratio belongs to the standard that defines it; publish a record naming that standard",
    recordable: true,
  },
  {
    name: "a colour literal",
    re: /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/gi,
    why: "system colours are semantic and adapt; a literal does not, and no record can license one",
    recordable: false,
  },
  {
    name: "a font weight or size value",
    re: /\bfont-(?:size|weight)\s*[:=]|\bweight\s*[:=]\s*\d+/gi,
    why: "type scales are published per platform and per text style; publish a record and cite it",
    recordable: true,
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

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[\u00d7\u2715]/g, "x").trim();

async function markdownFiles(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) out.push(...(await markdownFiles(join(dir, entry.name), name + "/")));
    else if (entry.name.endsWith(".md")) out.push(join(dir, entry.name));
  }
  return out;
}

/** value → the record ids and value keys that publish it. */
interface Publisher {
  recordId: string;
  key: string;
}

async function publishedValues(id: string): Promise<Map<string, Publisher[]>> {
  const values = new Map<string, Publisher[]>();
  const dir = join(ROOT, "guidance", id, "records");
  if (!(await exists(dir))) return values;
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".yaml"))) {
    const doc = parse(await readFile(join(dir, file), "utf8")) as {
      records?: { id: string; values?: { [k: string]: string } }[];
    };
    for (const record of doc.records ?? []) {
      for (const [key, raw] of Object.entries(record.values ?? {})) {
        for (const m of raw.matchAll(/\d+(?:\.\d+)?\s*(?:[x\u00d7]\s*\d+(?:\.\d+)?\s*)?(?:pt|px|dp|points?|pixels?)/gi)) {
          const value = norm(m[0]);
          values.set(value, [...(values.get(value) ?? []), { recordId: record.id, key }]);
        }
      }
    }
  }
  return values;
}

let failed = 0;
let scanned = 0;
let licensed = 0;

for (const id of await listSources()) {
  if ((await loadSource(id)).kind !== "authored") continue;
  const published = await publishedValues(id);
  const knownIds = new Set([...published.values()].flat().map((p) => p.recordId));

  for (const file of await markdownFiles(join(ROOT, id === "apple-design" ? `guidance/${id}` : `guidance/${id}`))) {
    scanned++;
    const shown = relative(ROOT, file);
    const text = await readFile(file, "utf8");

    for (const { line, number } of proseLines(text)) {
      const stripped = withoutLinks(line);
      // A dimension ("39.5 x 26.5 pt") contains a length ("26.5 pt"). Report the whole dimension
      // once rather than its tail a second time, so one value produces one finding.
      const consumed: [number, number][] = [];
      for (const pattern of PATTERNS) {
        for (const match of stripped.matchAll(pattern.re)) {
          const at = match.index ?? 0;
          if (consumed.some(([s, e]) => at >= s && at < e)) continue;
          consumed.push([at, at + match[0].length]);
          const value = norm(match[0]);

          if (!pattern.recordable) {
            failed++;
            console.log(`\u2717 ${shown}:${number}: ${pattern.name} \u2014 "${match[0].trim()}"`);
            console.log(`    ${pattern.why}`);
            continue;
          }

          const publishers = published.get(value);
          if (!publishers?.length) {
            failed++;
            console.log(`\u2717 ${shown}:${number}: ${pattern.name} \u2014 "${match[0].trim()}"`);
            console.log(`    no record in guidance/${id}/records/ publishes this value`);
            console.log(`    ${pattern.why}`);
            continue;
          }

          // The value must be attributed to a record that actually carries it. Citing *some*
          // record is not enough: an audit fixture wrote "66x66 pt on iOS (control-size.ios)",
          // where only the tvOS record holds that value, and the old file-level check passed it.
          //
          // Scope: the citation must appear on this line, in the surrounding table row, or in the
          // paragraph, so the binding is local rather than anywhere in the document.
          const contextLines = text.split("\n");
          const context = contextLines.slice(Math.max(0, number - 4), number + 3).join(" ");
          const cited = publishers.filter((p) => context.includes(p.recordId));
          if (cited.length) {
            licensed++;
            continue;
          }

          const citedButWrong = [...knownIds].filter((rid) => context.includes(rid));
          failed++;
          console.log(`\u2717 ${shown}:${number}: ${pattern.name} \u2014 "${match[0].trim()}"`);
          if (citedButWrong.length) {
            console.log(
              `    cites ${citedButWrong.map((r) => `\`${r}\``).join(", ")}, which does not publish this value`,
            );
            console.log(
              `    "${match[0].trim()}" comes from ${publishers.map((p) => `\`${p.recordId}\`.${p.key}`).join(" or ")}`,
            );
          } else {
            console.log(
              `    no record cited nearby; name ${publishers.map((p) => `\`${p.recordId}\``).join(" or ")} so a reader can check the column it came from`,
            );
          }
        }
      }
    }
  }
}

if (failed) {
  log.warn(`${failed} unsourced measurement(s) or colour literal(s) in authored guidance`);
  process.exit(1);
}
log.info(
  `${scanned} authored guidance file(s): ${licensed} measurement(s) traced to a verified record, 0 unsourced`,
);
