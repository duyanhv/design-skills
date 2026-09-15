#!/usr/bin/env bun
/**
 * Traceability probes for AUDIT findings A2 and A3 — what WCAG's own words are allowed to require,
 * and whether the things a criterion depends on can be reached from the criterion.
 *
 * **A2.** The skill used to tell its reader that "every criterion's exceptions and notes … are part
 * of the requirement". W3C says the opposite of half of that: the criteria are normative, while
 * "diagrams, examples, and notes are informative (non-normative)" and "do not create requirements
 * that impact a conformance claim" (https://www.w3.org/TR/WCAG22/#interpreting-normative-requirements).
 * The consequence was a false finding waiting to happen: 2.5.3 Label in Name requires the accessible
 * name to *contain* the visible label, and its note recommends putting the label at the *start*.
 * A conforming component fails a test built from the note.
 *
 * So the two are now distinguished, everywhere the reader can see them: `note_authority` in the IR,
 * an `_[informative]_` prefix in the rendered reference, and an explanation in the entry file.
 * Preserving everything and labelling it is the point — the failure this repo guards against is a
 * caveat that disappears, and deleting notes to fix A2 would have been that same bug.
 *
 * **A3.** `.cache/wcag22/raw/adaptable.html` links to `#input-purposes`; extraction flattened the
 * link to its label, and the bundle had no such page, so 1.3.5's defined purpose set was named but
 * unreachable. Links now survive extraction, and two normative dependencies are bundled: Input
 * Purposes, and the Conformance chapter. Bundling is what the licence already permits for the
 * criteria themselves — `sources/wcag22.yaml` declares `license.redistributable: false`, so no WCAG
 * text is committed and every reader builds it locally (see LICENSING.md). These pages are the same
 * document under the same terms, so they travel the same way.
 *
 * The A3 checks are deliberately written as a *reader's* journey: start at the 1.3.5 block in the
 * shipped reference, follow only what is written there, and see whether the purpose set is reached.
 * Asserting that a file exists somewhere in the bundle would pass while the criterion still pointed
 * at nothing, which is precisely the state the audit found.
 *
 * What these do **not** establish: that an agent obeys any of it. They check that the artifacts say
 * the right thing and hang together. `src/agenteval` is where behaviour is measured.
 *
 * Usage:
 *   bun run src/e2e/probes/wcag-authority.ts            # checks, then the negative probes
 *   bun run src/e2e/probes/wcag-authority.ts --checks   # checks only (what the negative probes run)
 */
import { join } from "node:path";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parse } from "node-html-parser";
import type { PageIR } from "../../schema/ir.ts";
import { exists, listDirs, listFiles, paths, readJson } from "../../util/fs.ts";
import { log } from "../../util/log.ts";

import type { Case, Check } from "./types.ts";
export type { Case, Check } from "./types.ts";

const REPO = process.cwd();
const SOURCE = "wcag22";
const SKILL = "wcag22";

const INFORMATIVE = "_[informative]_";

/**
 * Compose rewrites a cross-reference into a link to the local reference file, so a note's shipped
 * text is not byte-identical to its IR text — by design, and the whole point of A3. Comparing the
 * two therefore compares link *labels*, which is what the reader reads either way.
 */
const sameText = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();

const skillDir = () => join(REPO, "skills", SKILL);
const entry = () => readFile(join(skillDir(), "SKILL.md"), "utf8");
const ref = (cat: string, page: string) => readFile(join(skillDir(), "references", cat, `${page}.md`), "utf8");

async function pages(): Promise<PageIR[]> {
  const dir = join(REPO, "ir", SOURCE, "pages");
  const out: PageIR[] = [];
  for (const f of await listFiles(dir, ".json")) out.push((await readJson<PageIR>(join(dir, f)))!);
  return out;
}

/** The rendered block for one rule: its bullet line plus the indented lines beneath it. */
function block(doc: string, ruleId: string): string {
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => l.includes(`\`${ruleId}\``));
  if (start < 0) throw new Error(`rule ${ruleId} is not rendered in the reference`);
  const out = [lines[start]!];
  for (let i = start + 1; i < lines.length && /^\s+/.test(lines[i]!); i++) out.push(lines[i]!);
  return out.join("\n");
}

/** Find one rule by a fragment of its statement. Ambiguity is an error, not a coin flip. */
async function ruleBy(fragment: string): Promise<{ page: PageIR; id: string; notes: string[]; authority: string[] }> {
  const hits = (await pages()).flatMap((p) => p.rules.filter((r) => r.statement.includes(fragment)).map((r) => ({ p, r })));
  if (hits.length !== 1) throw new Error(`"${fragment}" matched ${hits.length} rules (want exactly 1)`);
  const { p, r } = hits[0]!;
  return { page: p, id: r.id, notes: r.notes, authority: r.note_authority ?? [] };
}

/**
 * The audit's acceptance criteria, as components rather than as strings.
 *
 * `test/fixtures/wcag-review-cases.html` states what WCAG says about each one. The reviewer below
 * is built from the **shipped reference**: it reads the criterion's block, discards every line
 * marked `_[informative]_`, and decides using only what is left. That is the reading the entry file
 * instructs, executed, so the fixture tests the artifact rather than a paraphrase of it.
 *
 * It is deliberately not a general-purpose WCAG engine. It answers two criteria, and it fails if
 * the text it needs is missing from the shipped block — which is what makes it a check on the
 * output instead of on itself.
 */
interface ReviewCase {
  sc: string;
  verdict: "pass" | "fail";
  why: string;
  attrs: Record<string, string>;
  text: string;
}

async function reviewCases(): Promise<ReviewCase[]> {
  // Resolved against this file, not the working directory: the negative probes run the checks in a
  // scratch copy of the build, which has no `test/` tree. The fixture states what WCAG says, so it
  // is part of the check rather than part of the artifact under test, and must not be copied into
  // the corruptible tree.
  const html = await readFile(new URL("../../../test/fixtures/wcag-review-cases.html", import.meta.url), "utf8");
  return parse(html)
    .querySelectorAll("div.case")
    .map((el) => {
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(el.attributes)) if (k.startsWith("data-")) attrs[k.slice(5)] = v;
      return { sc: attrs.sc!, verdict: attrs.verdict as "pass" | "fail", why: attrs.why!, attrs, text: el.text.replace(/\s+/g, " ").trim() };
    });
}

/** The normative lines of a rule's shipped block: everything the reader is told to apply. */
function normativeLines(rendered: string): string[] {
  return rendered
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.includes(INFORMATIVE));
}

/** Decide one case using only the normative text shipped for its criterion. */
function judge(c: ReviewCase, lines: string[]): "pass" | "fail" {
  const normative = lines.join(" ");
  if (c.sc === "2.5.3") {
    if (!/the name contains the text that is presented visually/.test(normative)) {
      throw new Error("2.5.3's statement is not in the shipped normative text; nothing to review against");
    }
    // Containment, and nothing about position: that is what the criterion says once the note is
    // set aside. If ordering advice had survived as normative text, this would read it here.
    const ordering = /at the start of the name|at the beginning of the/.test(normative);
    const contains = c.attrs["accessible-name"]!.toLowerCase().includes(c.attrs["visible-label"]!.toLowerCase());
    if (ordering) {
      const starts = c.attrs["accessible-name"]!.toLowerCase().startsWith(c.attrs["visible-label"]!.toLowerCase());
      return contains && starts ? "pass" : "fail";
    }
    return contains ? "pass" : "fail";
  }
  if (c.sc === "2.5.8") {
    if (!/at least 24 by 24 CSS pixels/.test(normative)) {
      throw new Error("2.5.8's statement is not in the shipped normative text; nothing to review against");
    }
    const w = Number(c.attrs.width);
    const h = Number(c.attrs.height);
    if (w >= 24 && h >= 24) return "pass";
    // Exceptions are only available if they are still normative in the shipped block. Demote them
    // to advice and the undersized-but-spaced target starts reporting as a defect.
    const has = (name: string) => lines.some((l) => l.includes(`${name} —`));
    if (has("Spacing") && Number(c.attrs.spacing) >= 24) return "pass";
    if (has("Inline") && c.attrs.inline === "true") return "pass";
    if (has("User Agent Control") && c.attrs["user-agent-control"] === "true") return "pass";
    if (has("Essential") && c.attrs.essential === "true") return "pass";
    if (has("Equivalent") && c.attrs.equivalent === "true") return "pass";
    return "fail";
  }
  throw new Error(`no reviewer for ${c.sc}`);
}

export const CHECKS: Check[] = [
  {
    finding: "A2",
    requirement: "2.5.3's ordering advice is kept, and is marked as advice rather than as a test",
    observe: async () => {
      const { page, id, notes, authority } = await ruleBy("the name contains the text that is presented visually");
      const i = notes.findIndex((n) => n.includes("best practice is to have the text of the label at the start"));
      if (i < 0) throw new Error("the Label in Name note is gone; A2 is not fixed by deleting the note");
      if (authority[i] !== "informative") throw new Error(`the note is recorded as ${authority[i] ?? "unlabelled"}, so an agent may test ordering as a requirement`);
      const rendered = block(await ref(page.category, page.page), id);
      const line = rendered.split("\n").find((l) => l.includes("best practice"))!;
      if (!line.includes(INFORMATIVE)) throw new Error(`the shipped note carries no ${INFORMATIVE} marker: ${line.trim()}`);
      // The criterion itself must still read as containment, or the fix has changed the rule.
      if (!rendered.includes("the name contains the text that is presented visually")) throw new Error("the criterion's own statement no longer says the name *contains* the label");
      return `2.5.3 keeps its note, marked ${INFORMATIVE}, beside a statement that still requires containment`;
    },
  },
  {
    finding: "A2",
    requirement: "A criterion's exceptions are never marked informative, so they still bind",
    observe: async () => {
      // The inverse failure: a split that labels everything advisory disarms the exceptions that
      // make a criterion satisfiable, which is the defect eval question 1 already guards in reverse.
      const { page, id, notes, authority } = await ruleBy("at least 24 by 24 CSS pixels");
      const exceptions = ["Spacing", "Equivalent", "Inline", "User Agent Control", "Essential"];
      const mislabelled: string[] = [];
      for (const [i, n] of notes.entries()) {
        const isException = exceptions.some((e) => n.startsWith(`- ${e} —`));
        if (isException && authority[i] !== "normative") mislabelled.push(n.slice(0, 50));
        if (!isException && n.startsWith("- ") && authority[i] !== "normative") mislabelled.push(n.slice(0, 50));
      }
      if (mislabelled.length) throw new Error(`${mislabelled.length} exception(s) marked informative, e.g. ${mislabelled[0]}`);
      const rendered = block(await ref(page.category, page.page), id);
      for (const e of exceptions) {
        const line = rendered.split("\n").find((l) => l.includes(`${e} —`));
        if (!line) throw new Error(`exception "${e}" is missing from the shipped 2.5.8 block`);
        if (line.includes(INFORMATIVE)) throw new Error(`exception "${e}" ships marked ${INFORMATIVE}`);
      }
      return `all ${exceptions.length} of 2.5.8's exceptions are normative in IR and unmarked in the shipped block`;
    },
  },
  {
    finding: "A2",
    requirement: "Every informative label in IR matches the marker in the shipped text, corpus-wide",
    observe: async () => {
      // Two representations of one claim drift apart silently. Checked over the whole source rather
      // than the two criteria above, because a heuristic that is right twice is not right.
      //
      // The comparison is per *rendered line*, not "does this text appear in the file". Searching
      // the whole document only caught a marker that went missing; a marker *added* to the shipped
      // text, which tells a reader that a real exception is advisory, still matched the unmarked
      // IR note as a substring and passed. Its negative probe is what exposed that.
      let checked = 0;
      let informative = 0;
      const bad: string[] = [];
      for (const p of await pages()) {
        const doc = await ref(p.category, p.page);
        for (const r of p.rules) {
          const authority = r.note_authority ?? [];
          if (r.notes.length && authority.length !== r.notes.length) {
            bad.push(`${r.id}: ${authority.length} labels for ${r.notes.length} notes`);
            continue;
          }
          const rendered = r.kind === "rule" ? block(doc, r.id) : doc;
          for (const [i, n] of r.notes.entries()) {
            checked++;
            const marked = n.startsWith(INFORMATIVE);
            if (marked) informative++;
            if (marked !== (authority[i] === "informative")) bad.push(`${r.id}[${i}]: marker and label disagree`);
            // Locate this note's own line in the rule's own block, then insist the marker there
            // matches the IR label in both directions. A note can be several lines (a glossary
            // enumeration is one block), and only its first line carries the marker, so that is
            // the line to compare.
            const body = sameText(n.replace(INFORMATIVE, "").split("\n")[0]!).slice(0, 60);
            const line = rendered.split("\n").find((l) => sameText(l).includes(body));
            if (!line) {
              bad.push(`${r.id}[${i}]: note is not rendered in its own rule's block`);
              continue;
            }
            if (line.includes(INFORMATIVE) !== marked) {
              bad.push(`${r.id}[${i}]: shipped line is ${line.includes(INFORMATIVE) ? "marked" : "unmarked"} but IR says ${authority[i]}`);
            }
          }
        }
      }
      if (bad.length) throw new Error(`${bad.length} mismatches, e.g. ${bad[0]}`);
      if (!informative) throw new Error("no note anywhere is marked informative; the distinction is not being drawn at all");
      return `${checked} notes across the corpus agree between IR and shipped text; ${informative} are informative`;
    },
  },
  {
    finding: "A2",
    requirement: "Reviewing with the shipped normative text gives the audit's acceptance verdicts",
    observe: async () => {
      // The audit's acceptance criteria, run rather than asserted: a name containing the visible
      // label *later* must not fail 2.5.3 on ordering, and a case that violates a real exception
      // condition must still be caught.
      const cases = await reviewCases();
      if (cases.length < 4) throw new Error(`only ${cases.length} review cases; the fixture has been emptied`);
      const blocks = new Map<string, string[]>();
      for (const [sc, fragment] of [
        ["2.5.3", "the name contains the text that is presented visually"],
        ["2.5.8", "at least 24 by 24 CSS pixels"],
      ] as const) {
        const { page, id } = await ruleBy(fragment);
        blocks.set(sc, normativeLines(block(await ref(page.category, page.page), id)));
      }
      const wrong: string[] = [];
      for (const c of cases) {
        const got = judge(c, blocks.get(c.sc) ?? []);
        if (got !== c.verdict) wrong.push(`${c.sc} "${c.attrs["accessible-name"] ?? `${c.attrs.width}x${c.attrs.width}`}": reviewed ${got}, WCAG says ${c.verdict} (${c.why})`);
      }
      if (wrong.length) throw new Error(`${wrong.length}/${cases.length} verdicts wrong: ${wrong[0]}`);
      const passes = cases.filter((c) => c.verdict === "pass").length;
      return `${cases.length}/${cases.length} review verdicts correct from the shipped normative text (${passes} conforming, ${cases.length - passes} real defects)`;
    },
  },
  {
    finding: "A2",
    requirement: "The entry file explains the marker instead of calling every note a requirement",
    observe: async () => {
      const doc = await entry();
      if (/exceptions and notes .{0,40}are part of the requirement/i.test(doc)) {
        throw new Error("the entry still says a criterion's notes are part of the requirement");
      }
      if (!doc.includes(INFORMATIVE)) throw new Error(`the entry never mentions the ${INFORMATIVE} marker it ships`);
      if (!/informative \(non-normative\)|advisory/i.test(doc)) throw new Error("the entry does not say what an informative block is for");
      if (!/never fail|not .{0,20}on it alone|advisory/i.test(doc)) throw new Error("the entry does not tell the reader not to fail something on a note alone");
      // A2's other half: the generic "severity is inferred from wording" line is false for WCAG,
      // where every active criterion is assigned MUST from its level.
      if (/severity is inferred from that wording/i.test(doc)) {
        throw new Error("the entry claims WCAG severity is inferred from wording; it is assigned from the conformance level");
      }
      return "the entry explains normative vs. informative and no longer attributes severity to wording";
    },
  },
  {
    finding: "A3",
    requirement: "From the shipped 1.3.5 block alone, a reader reaches the defined set of input purposes",
    observe: async () => {
      const { page, id } = await ruleBy("The purpose of each input field collecting information about the user");
      const dir = join(skillDir(), "references", page.category);
      const rendered = block(await ref(page.category, page.page), id);
      // Follow only what the block itself offers. A bundled page that the criterion does not link
      // to is not reachable from the criterion, which is the state the audit actually found.
      const links = [...rendered.matchAll(/\]\((?!https?:)([^)\s#]+\.md)(?:#([^)\s]+))?\)/g)];
      if (!links.length) throw new Error(`1.3.5 offers no local link to follow:\n${rendered}`);
      for (const [, file, frag] of links) {
        const target = join(dir, file!);
        if (!(await exists(target))) continue;
        const doc = await readFile(target, "utf8");
        if (frag) {
          const headings = new Set([...doc.matchAll(/^#{2,6} (.+)$/gm)].map((m) => m[1]!.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-")));
          if (!headings.has(frag.toLowerCase())) throw new Error(`1.3.5 links to ${file}#${frag}, which is not a heading there`);
        }
        // The defined set itself, not merely a page with the right name.
        const purposes = ["`given-name`", "`street-address`", "`cc-exp-month`", "`bday`", "`url`"];
        const missing = purposes.filter((p) => !doc.includes(p));
        if (missing.length) throw new Error(`followed 1.3.5 to ${file}, but the purpose set is incomplete: missing ${missing.join(", ")}`);
        return `1.3.5 → ${file}, which lists the defined purposes (${purposes.length}/${purposes.length} sampled present)`;
      }
      throw new Error(`none of 1.3.5's links resolve to a bundled file: ${links.map((l) => l[1]).join(", ")}`);
    },
  },
  {
    finding: "A3",
    requirement: "Source links survive extraction rather than being flattened to their label",
    observe: async () => {
      // The mechanism behind the check above. Flattening was silent: the sentence still read
      // correctly, it just no longer pointed anywhere.
      let linked = 0;
      const pagesWith = new Set<string>();
      for (const p of await pages()) {
        for (const r of p.rules) {
          for (const t of [r.statement, r.rationale ?? "", ...r.notes]) {
            for (const _ of t.matchAll(/\[[^\]]+\]\([^)]+\)/g)) {
              linked++;
              pagesWith.add(p.page);
            }
          }
        }
      }
      if (!linked) throw new Error("no rule anywhere retains a link; extraction is flattening them again");
      const { page, id } = await ruleBy("The purpose of each input field collecting information about the user");
      const rendered = block(await ref(page.category, page.page), id);
      if (!/\[Input Purposes[^\]]*\]\(/.test(rendered)) throw new Error("1.3.5's Input Purposes reference ships as bare text, not as a link");
      return `${linked} links retained across ${pagesWith.size} pages, including 1.3.5's Input Purposes reference`;
    },
  },
  {
    finding: "A3",
    requirement: "The conformance requirements are in the bundle, so a conformance claim can be checked",
    observe: async () => {
      const doc = await ref("conformance", "conformance-reqs");
      // cc1–cc5 by what they say, not by their ids: an id can survive an empty section.
      const required: [string, string][] = [
        ["cc1 Conformance Level", "One of the following levels of conformance is met in full."],
        ["cc2 Full pages", "cannot be achieved if part of a web page is excluded"],
        ["cc3 Complete processes", "all web pages in the process conform at the specified level or better"],
        ["cc4 Accessibility support", "ways of using technologies are relied upon to satisfy the success criteria"],
        ["cc5 Non-Interference", "they do not block the ability of users to access the rest of the page"],
      ];
      const missing = required.filter(([, text]) => !doc.includes(text)).map(([name]) => name);
      if (missing.length) throw new Error(`the conformance reference is missing ${missing.join(", ")}`);
      // cc5 names four criteria that apply to all content; without them non-interference is a
      // slogan rather than something a reviewer can check.
      for (const sc of ["1.4.2 - Audio Control", "2.1.2 - No Keyboard Trap", "2.3.1 - Three Flashes or Below Threshold", "2.2.2 - Pause, Stop, Hide"]) {
        if (!doc.includes(sc)) throw new Error(`cc5 no longer names ${sc}`);
      }
      return "cc1–cc5 are all present, including the four criteria cc5 applies to all content";
    },
  },
  {
    finding: "A3",
    requirement: "The entry separates reviewing criteria from claiming conformance, and links the requirements",
    observe: async () => {
      const doc = await entry();
      if (!/conformance is defined for whole pages|conformance is defined only for|reviewing criteria is not establishing conformance/i.test(doc)) {
        throw new Error("the entry does not distinguish a scoped review from a conformance claim");
      }
      if (!/does not establish conformance|report what you did check/i.test(doc)) {
        throw new Error("the entry does not require reporting the limits of a review");
      }
      // It must also stay proportionate: a button review is not a site audit.
      if (!/scoped to that task|keep it scoped/i.test(doc)) {
        throw new Error("the entry does not keep an ordinary review scoped to the user's task");
      }
      const link = /\]\((references\/conformance\/conformance-reqs\.md)(?:#([^)]*))?\)/.exec(doc);
      if (!link) throw new Error("the entry does not link the bundled conformance requirements");
      if (!(await exists(join(skillDir(), link[1]!)))) throw new Error(`the entry links ${link[1]}, which is not in the bundle`);
      return "the entry scopes ordinary reviews, requires stating a review's limits, and links the bundled requirements";
    },
  },
  {
    finding: "A3",
    requirement: "Bundling WCAG's dependencies keeps the licence posture the manifest declares",
    observe: async () => {
      // Bundling more source text is only legitimate under the same terms as the text already
      // shipped. The manifest says non-redistributable, so the gate is that none of it is
      // committed — including the two pages added for this finding.
      const source = await readFile(join(REPO, "sources", `${SOURCE}.yaml`), "utf8");
      if (!/redistributable:\s*false/.test(source)) throw new Error("the manifest no longer declares wcag22 non-redistributable; bundling more of the document needs re-checking");
      const proc = Bun.spawn(["git", "ls-files", `skills/${SKILL}/`, `ir/${SOURCE}/`], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
      const tracked = (await new Response(proc.stdout).text()).trim();
      await proc.exited;
      if (tracked) throw new Error(`WCAG-derived files are tracked by git despite a non-redistributable licence: ${tracked.split("\n").slice(0, 3).join(", ")}`);
      const attribution = "W3C Document License";
      for (const page of ["references/conformance/conformance-reqs.md", "references/reference/input-purposes.md"]) {
        const doc = await readFile(join(skillDir(), page), "utf8");
        if (!doc.includes(attribution)) throw new Error(`${page} ships without the W3C attribution`);
      }
      return "wcag22 is declared non-redistributable, nothing derived from it is tracked, and both bundled pages carry the attribution";
    },
  },
];

// ---------------------------------------------------------------------------
// Negative probes: each defect must fail the check that claims to guard it.
// ---------------------------------------------------------------------------

const editRef = async (dir: string, rel: string, fn: (s: string) => string) => {
  const p = join(dir, "skills", SKILL, "references", rel);
  const before = await readFile(p, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`the defect did not change ${rel}; the fixture text has moved`);
  await writeFile(p, after);
};

const editEntry = async (dir: string, fn: (s: string) => string) => {
  const p = join(dir, "skills", SKILL, "SKILL.md");
  const before = await readFile(p, "utf8");
  const after = fn(before);
  if (after === before) throw new Error("the defect did not change SKILL.md; the fixture text has moved");
  await writeFile(p, after);
};

const editIR = async (dir: string, page: string, fn: (ir: any) => void) => {
  const p = join(dir, "ir", SOURCE, "pages", `${page}.json`);
  const ir = JSON.parse(await readFile(p, "utf8"));
  fn(ir);
  await writeFile(p, JSON.stringify(ir, null, 2) + "\n");
};

const ruleIn = (ir: any, fragment: string) => {
  const r = ir.rules.find((r: any) => r.statement.includes(fragment));
  if (!r) throw new Error(`no rule matching "${fragment}"; the fixture text has moved`);
  return r;
};

export const CASES: Case[] = [
  {
    finding: "A2",
    // The exact state the audit found: the note present, unlabelled, indistinguishable from an
    // exception. This is the pre-fix build.
    name: "2.5.3's ordering note shipped with no authority marker",
    break: async (d) => {
      await editIR(d, "input-modalities", (ir) => {
        const r = ruleIn(ir, "the name contains the text that is presented visually");
        r.notes = r.notes.map((n: string) => n.replace(`${INFORMATIVE} `, ""));
        r.note_authority = r.notes.map(() => "normative");
      });
      await editRef(d, "operable/input-modalities.md", (s) => s.replace(`${INFORMATIVE} Note: A best practice`, "Note: A best practice"));
    },
  },
  {
    finding: "A2",
    // "Fixing" A2 by deleting the advice. The entry stops overstating, and the reader loses
    // interpretive context the source provides — the failure mode CONTRIBUTING warns about.
    name: "the ordering note deleted instead of labelled",
    break: async (d) => {
      await editIR(d, "input-modalities", (ir) => {
        const r = ruleIn(ir, "the name contains the text that is presented visually");
        const i = r.notes.findIndex((n: string) => n.includes("best practice"));
        r.notes.splice(i, 1);
        r.note_authority.splice(i, 1);
      });
      await editRef(d, "operable/input-modalities.md", (s) => s.replace(/^.*best practice is to have the text of the label.*$\n?/m, ""));
    },
  },
  {
    finding: "A2",
    // The inverse: an exception relabelled advisory. A reader told 2.5.8's Spacing exception is
    // non-binding reports a conforming 20px target as a defect.
    name: "an exception relabelled as informative",
    break: (d) =>
      editIR(d, "input-modalities", (ir) => {
        const r = ruleIn(ir, "at least 24 by 24 CSS pixels");
        const i = r.notes.findIndex((n: string) => n.startsWith("- Spacing —"));
        if (i < 0) throw new Error("2.5.8's Spacing exception has moved");
        r.note_authority[i] = "informative";
      }),
  },
  {
    finding: "A2",
    // The marker added to the shipped text only: 2.5.2's "No Down-Event" is a condition of the
    // criterion, and a reader told it is advisory will accept a control that fires on down-event.
    // This probe found the check too weak to see it — the original searched the whole document,
    // where the unmarked IR note still matched as a substring of the marked line.
    name: "an informative marker in the shipped text that IR does not record",
    break: (d) =>
      editRef(d, "operable/input-modalities.md", (s) =>
        s.replace("  - No Down-Event —", `  - ${INFORMATIVE} No Down-Event —`),
      ),
  },
  {
    finding: "A2",
    name: "the entry telling the reader that notes are part of the requirement",
    break: (d) =>
      editEntry(d, (s) =>
        s.replace(
          /\*\*Normative vs\. informative\.\*\*/,
          "Every criterion's exceptions and notes are listed under it and are part of the requirement.\n\n**Normative vs. informative.**",
        ),
      ),
  },
  {
    finding: "A3",
    // The pre-fix extractor: the link flattened to its label. The sentence still reads correctly,
    // which is why this went unnoticed.
    name: "1.3.5's Input Purposes link flattened back to plain text",
    break: async (d) => {
      await editIR(d, "adaptable", (ir) => {
        const r = ruleIn(ir, "The purpose of each input field collecting information about the user");
        r.notes = r.notes.map((n: string) => n.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
      });
      await editRef(d, "perceivable/adaptable.md", (s) =>
        s.replace(/\[Input Purposes for user interface components section\]\([^)]*\)/, "Input Purposes for user interface components section"),
      );
    },
  },
  {
    finding: "A3",
    // A link that survives but lands on nothing: the bundled page removed. Reachability is the
    // claim, so a dangling link must fail even though the link itself is intact.
    name: "the Input Purposes page removed from the bundle",
    break: async (d) => rm(join(d, "skills", SKILL, "references", "reference", "input-purposes.md")),
  },
  {
    finding: "A3",
    // Bundled but gutted: the page exists, the link resolves, and the defined set is not there.
    name: "the Input Purposes page stripped of its purpose list",
    break: (d) =>
      editRef(d, "reference/input-purposes.md", (s) => s.replace(/^- `.*$\n?/gm, "")),
  },
  {
    finding: "A3",
    name: "the conformance reference losing non-interference",
    break: (d) =>
      editRef(d, "conformance/conformance-reqs.md", (s) =>
        s.replace(/they do not block the ability of users to access the rest of the page/, "they are discouraged"),
      ),
  },
  {
    finding: "A3",
    name: "the entry dropping the line that a scoped review does not establish conformance",
    break: (d) =>
      editEntry(d, (s) =>
        s
          .replace(/\*\*Reviewing criteria is not establishing conformance\.\*\*/, "**Conformance.**")
          .replace(/does not establish conformance/g, "is sufficient")
          .replace(/report what you did check/g, "report your conclusion"),
      ),
  },
];

// ---------------------------------------------------------------------------
// Standalone runner.
// ---------------------------------------------------------------------------

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ds-wcag-authority-"));
  for (const sub of [["sources"], ["ir", SOURCE], ["skills", SKILL]]) {
    await mkdir(join(dir, ...sub.slice(0, -1)), { recursive: true });
    await cp(join(REPO, ...sub), join(dir, ...sub), { recursive: true });
  }
  return dir;
}

async function runIn(dir: string): Promise<Set<string>> {
  const proc = Bun.spawn(["bun", "run", join(REPO, "src", "e2e", "probes", "wcag-authority.ts"), "--checks"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return new Set([...out.matchAll(/^✗ finding (.+?) —/gm)].map((m) => m[1]!));
}

if (import.meta.main) {
  if (!(await exists(join(process.cwd(), "ir", SOURCE, "pages")))) {
    log.warn(`wcag-authority probes skipped: build ${SOURCE} first (bun run build ${SOURCE})`);
    process.exit(0);
  }
  const checksOnly = process.argv.includes("--checks");
  let failed = 0;
  for (const c of CHECKS) {
    try {
      console.log(`✓ finding ${c.finding} — ${c.requirement}\n    observed: ${await c.observe()}`);
    } catch (e) {
      failed++;
      console.log(`✗ finding ${c.finding} — ${c.requirement}\n    ${(e as Error).message}`);
    }
  }
  if (checksOnly) process.exit(failed ? 1 : 0);
  if (failed) {
    log.warn(`${failed}/${CHECKS.length} authority requirements are not satisfied by the shipped artifacts`);
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
  log.info(`${CHECKS.length} authority checks pass and all ${CASES.length} defects are caught by the check that claims to guard them`);
}
