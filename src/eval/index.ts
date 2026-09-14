/**
 * Evals assert facts about *rules*, not about strings anywhere in a file.
 *
 * The old check — "does this substring appear in the reference?" — passed while the WCAG references
 * were losing their exception lists, because the numbers survived in unrelated prose. So an eval now
 * locates one rule (by a distinctive fragment of its statement) and asserts the properties an agent
 * actually acts on: severity, platform scope, conformance level, the exceptions that must travel
 * with it, and the citation it should quote. `contains` remains for whole-page smoke checks.
 *
 * Still no model in the loop: every assertion is a deterministic read of the IR + generated skill.
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Source } from "../schema/source.ts";
import type { PageIR, Rule } from "../schema/ir.ts";
import { exists, paths, ROOT } from "../util/fs.ts";
import { foldQuotes } from "../extract/severity.ts";
import { loadIR } from "../compose/index.ts";

const QuestionSchema = z.object({
  /** The question a reader should be able to answer from the skill. Documentation for humans. */
  q: z.string(),
  /** Page slug the answer must come from. SKILL.md must route to it. */
  source: z.string(),
  /** Page-level smoke check: these strings must appear somewhere in the reference file. */
  expect: z.union([z.string(), z.array(z.string())]).optional(),
  /** Rule-level assertions: find one rule, then check what an agent would act on. */
  rule: z
    .object({
      /** Distinctive fragment of the rule's statement. Must match exactly one rule on the page. */
      statement_contains: z.string(),
      severity: z.enum(["must", "should", "may"]).optional(),
      conformance_level: z.enum(["A", "AA", "AAA"]).optional(),
      /** Exact platform set, order-insensitive. `[]` asserts the rule is not platform-scoped. */
      platforms: z.array(z.string()).optional(),
      scope: z.enum(["section", "page", "general"]).optional(),
      value: z.string().optional(),
      /** Text that must survive *with this rule* — its rationale, notes or exceptions. */
      context_contains: z.array(z.string()).default([]),
      /** Anchor the citation must point at, so the quoted link lands on the right section. */
      anchor: z.string().optional(),
      /** The rendered rule line in the reference file must show these (e.g. "_[macOS]_"). */
      rendered_contains: z.array(z.string()).default([]),
    })
    .optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

export interface EvalResult { q: string; source: string; pass: boolean; missing: string[] }

const norm = (s: string) => foldQuotes(s).toLowerCase().replace(/\s+/g, " ");

/** The rendered block for a rule: its bullet plus the indented lines beneath it. */
function renderedBlock(ref: string, ruleId: string): string | null {
  const lines = ref.split("\n");
  const start = lines.findIndex((l) => l.includes(`\`${ruleId}\``));
  if (start < 0) return null;
  const out = [lines[start]!];
  for (let i = start + 1; i < lines.length && /^\s+/.test(lines[i]!); i++) out.push(lines[i]!);
  return out.join("\n");
}

function checkRule(q: Question, page: PageIR, ref: string, missing: string[]) {
  const spec = q.rule!;
  const needle = norm(spec.statement_contains);
  const hits = page.rules.filter((r) => norm(r.statement).includes(needle));
  if (hits.length !== 1) {
    missing.push(`statement_contains "${spec.statement_contains}" matched ${hits.length} rules on ${page.page} (want exactly 1)`);
    return;
  }
  const r: Rule = hits[0]!;
  const got = (field: string, actual: unknown, want: unknown) => missing.push(`${r.id}: ${field} is ${JSON.stringify(actual)}, expected ${JSON.stringify(want)}`);

  if (spec.severity && r.severity !== spec.severity) got("severity", r.severity, spec.severity);
  if (spec.conformance_level && r.conformance_level !== spec.conformance_level) got("conformance_level", r.conformance_level, spec.conformance_level);
  if (spec.scope && r.scope !== spec.scope) got("scope", r.scope, spec.scope);
  if (spec.platforms) {
    const a = [...r.platforms].sort().join(",");
    const b = [...spec.platforms].sort().join(",");
    if (a !== b) got("platforms", r.platforms, spec.platforms);
  }
  if (spec.value && norm(r.value ?? "") !== norm(spec.value)) got("value", r.value, spec.value);
  if (spec.anchor && r.provenance.anchor !== spec.anchor) got("citation anchor", r.provenance.anchor, spec.anchor);

  // Context must travel with *this* rule, not merely exist somewhere on the page.
  const context = norm([r.rationale ?? "", ...r.notes].join(" "));
  for (const c of spec.context_contains) {
    if (!context.includes(norm(c))) missing.push(`${r.id}: "${c}" is not in this rule's rationale or notes`);
  }

  const block = renderedBlock(ref, r.id);
  if (!block) {
    missing.push(`${r.id}: not rendered in the reference file (id missing)`);
    return;
  }
  for (const c of spec.rendered_contains) {
    if (!norm(block).includes(norm(c))) missing.push(`${r.id}: rendered rule does not show "${c}"`);
  }
}

export async function evalSource(source: Source): Promise<EvalResult[] | null> {
  const file = join(ROOT, "evals", source.id, "questions.yaml");
  if (!(await exists(file))) return null;
  const questions = z.array(QuestionSchema).parse(parseYaml(await readFile(file, "utf8")));
  const skillDir = paths.skill(source.skill.name);
  const skill = await readFile(join(skillDir, "SKILL.md"), "utf8");
  // A large index lives in index.md, linked from SKILL.md. Both count as "the skill routes here".
  const indexPath = join(skillDir, "index.md");
  const indexDoc = (await exists(indexPath)) ? await readFile(indexPath, "utf8") : "";
  const skillNorm = norm(`${skill}\n${indexDoc}`);
  const irBySlug = new Map((await loadIR(source)).map((p) => [p.page, p]));

  const results: EvalResult[] = [];
  for (const q of questions) {
    const m = new RegExp(`references/([a-z0-9-]+)/${q.source}\\.md`).exec(skillNorm);
    const missing: string[] = [];
    if (!m) {
      missing.push(`the skill does not route to page "${q.source}"`);
    } else {
      const refRaw = await readFile(join(skillDir, "references", m[1]!, `${q.source}.md`), "utf8");
      for (const e of q.expect ? (Array.isArray(q.expect) ? q.expect : [q.expect]) : []) {
        if (!norm(refRaw).includes(norm(e))) missing.push(`"${e}" not found in references/${m[1]}/${q.source}.md`);
      }
      if (q.rule) {
        const page = irBySlug.get(q.source);
        if (!page) missing.push(`no IR page "${q.source}"`);
        else checkRule(q, page, refRaw, missing);
      }
    }
    results.push({ q: q.q, source: q.source, pass: missing.length === 0, missing });
  }
  return results;
}
