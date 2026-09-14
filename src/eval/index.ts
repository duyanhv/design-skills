/**
 * Deterministic evals: each entry asserts that the generated skill *contains* a fact, in the
 * reference file of the page it should come from, and that SKILL.md routes to that page.
 * No model is involved — this guards against regressions in fetch/normalize/extract/compose.
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Source } from "../schema/source.ts";
import { exists, paths, ROOT } from "../util/fs.ts";
import { foldQuotes } from "../extract/severity.ts";

const QuestionSchema = z.object({
  q: z.string(),
  expect: z.union([z.string(), z.array(z.string())]),
  source: z.string(),
});
export type Question = z.infer<typeof QuestionSchema>;

export interface EvalResult { q: string; source: string; pass: boolean; missing: string[] }

const norm = (s: string) => foldQuotes(s).toLowerCase().replace(/\s+/g, " ");

export async function evalSource(source: Source): Promise<EvalResult[] | null> {
  const file = join(ROOT, "evals", source.id, "questions.yaml");
  if (!(await exists(file))) return null;
  const questions = z.array(QuestionSchema).parse(parseYaml(await readFile(file, "utf8")));
  const skillDir = paths.skill(source.skill.name);
  const skill = norm(await readFile(join(skillDir, "SKILL.md"), "utf8"));

  const results: EvalResult[] = [];
  for (const q of questions) {
    const m = new RegExp(`references/([a-z0-9-]+)/${q.source}\\.md`).exec(skill);
    const missing: string[] = [];
    if (!m) {
      missing.push(`SKILL.md does not route to page "${q.source}"`);
    } else {
      const ref = norm(await readFile(join(skillDir, "references", m[1]!, `${q.source}.md`), "utf8"));
      for (const e of Array.isArray(q.expect) ? q.expect : [q.expect]) {
        if (!ref.includes(norm(e))) missing.push(`"${e}" not found in references/${m[1]}/${q.source}.md`);
      }
    }
    results.push({ q: q.q, source: q.source, pass: missing.length === 0, missing });
  }
  return results;
}
