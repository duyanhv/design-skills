#!/usr/bin/env bun
/**
 * End-to-end build over the synthetic `lumen-ds` source. No network, no proprietary text.
 *
 * It stages the fixture as if `fetch` had produced it, then runs the real normalize → extract →
 * compose → validate → eval stages. CI runs this on every PR: unit tests cover each stage in
 * isolation, this covers the pipeline, the manifest schema, and the generated skill's format.
 *
 * Usage: `bun run src/e2e/run.ts` (add `--keep` to leave the build in place for inspection).
 */
import { join } from "node:path";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { Manifest, PageEntry } from "../fetch/types.ts";
import { normalizeSource } from "../normalize/index.ts";
import { extractSource } from "../extract/index.ts";
import { composeSource } from "../compose/index.ts";
import { validateSource } from "../validate/index.ts";
import { evalSource } from "../eval/index.ts";
import { loadSource, paths, writeJson, writeText } from "../util/fs.ts";
import { shortHash } from "../util/hash.ts";
import { log } from "../util/log.ts";
import { PAGES } from "./fixture.ts";

const SOURCE_ID = "lumen-ds";

/** Write the fixture into `.cache/<id>/raw` plus a manifest, exactly as a real fetcher would. */
async function stage(baseUrl: string): Promise<void> {
  const fetched_at = "2026-03-04T00:00:00.000Z";
  const manifest: Manifest = { source: SOURCE_ID, entry: "/design/lumen", fetched_at, version: "2026-03-04", partial: false, pages: {} };
  for (const page of PAGES) {
    const text = JSON.stringify(page.doc);
    const entry: PageEntry = {
      slug: page.slug,
      url: `${baseUrl}${page.url}`,
      data_url: `${baseUrl}/data${page.url}.json`,
      title: page.doc.metadata?.title ?? page.slug,
      category: page.category,
      parent: null,
      raw_hash: shortHash(text),
      fetched_at,
    };
    manifest.pages[page.slug] = entry;
    await writeText(join(paths.raw(SOURCE_ID), `${page.slug}.json`), text);
  }
  await writeJson(paths.manifest(SOURCE_ID), manifest);
}

const keep = process.argv.includes("--keep");
const source = await loadSource(SOURCE_ID);

// The cache and the skill are rebuilt from scratch so the run proves the pipeline rather than
// leftovers. `ir/lumen-ds` is *committed* and deliberately kept: extraction reuses it when nothing
// semantic changed, which keeps `extracted_at` stable and makes any real change a reviewable diff.
// CI then asserts the tree is clean, so the committed example cannot drift from the compiler.
for (const dir of [paths.cache(SOURCE_ID), paths.skill(source.skill.name)]) {
  await rm(dir, { recursive: true, force: true });
}

log.step("stage fixture");
await stage(source.base_url);

log.step("normalize");
const pages = await normalizeSource(source);
if (pages.length !== PAGES.length) throw new Error(`normalized ${pages.length} pages, expected ${PAGES.length}`);

log.step("extract");
const { rules } = await extractSource(source);
if (rules < 8) throw new Error(`extracted only ${rules} rules; the fixture should yield more`);

log.step("compose");
await composeSource(source);

log.step("validate");
const findings = await validateSource(source);
for (const f of findings) console.log(`${f.level === "error" ? "✗" : "△"} ${f.where}: ${f.message}`);
const errors = findings.filter((f) => f.level === "error");
if (errors.length) throw new Error(`${errors.length} validation error(s)`);

log.step("eval");
const results = (await evalSource(source)) ?? [];
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.q}`);
  for (const m of r.missing) console.log(`    ${m}`);
}
const failed = results.filter((r) => !r.pass);
if (!results.length) throw new Error("no evals ran for the synthetic source");
if (failed.length) throw new Error(`${failed.length} eval(s) failed`);

// A build that reruns unchanged must reuse everything: this is the cache contract that
// AUDIT finding 6 was about, checked end to end rather than by inspection.
const again = await extractSource(source);
if (again.extracted !== 0 || again.skipped !== PAGES.length) {
  throw new Error(`rerun re-extracted ${again.extracted} pages; expected all ${PAGES.length} to be reused`);
}

// The probes below deliberately corrupt the build to prove the compiler notices. Left as-is they
// would rewrite the committed IR with fresh timestamps, so snapshot it first: the probes are tests,
// not builds, and must not show up as a diff.
const snapshot = await mkdtemp(join(tmpdir(), "ds-e2e-ir-"));
await cp(paths.ir(SOURCE_ID), snapshot, { recursive: true });

// …and a configuration change must invalidate it, even though no page content changed.
const retuned = { ...source, skip_sections: [...source.skip_sections, "Roles"] };
const afterConfigChange = await extractSource(retuned);
if (afterConfigChange.extracted !== PAGES.length) {
  throw new Error(`changing skip_sections re-extracted ${afterConfigChange.extracted} pages; expected ${PAGES.length}`);
}

// A page that disappears upstream must not survive in the skill (AUDIT finding 5). Extract with one
// page removed, check it is gone, then restore — a partial run must *not* do the same.
const dropped = PAGES[PAGES.length - 1]!;
await rm(join(paths.md(SOURCE_ID), `${dropped.slug}.md`));
const afterRemoval = await extractSource(source);
if (afterRemoval.removed !== 1) throw new Error(`removing a page upstream left its IR in place (removed=${afterRemoval.removed})`);
const partialRun = await extractSource(source, { partial: true });
if (partialRun.removed !== 0) throw new Error("a partial run must never delete pages it did not visit");

// Restore the pre-probe IR, then rebuild normally. The restored IR carries the same input_hash, so
// extraction reuses it and timestamps stay put: an unchanged compiler produces an unchanged example.
await rm(paths.ir(SOURCE_ID), { recursive: true, force: true });
await cp(snapshot, paths.ir(SOURCE_ID), { recursive: true });
await rm(snapshot, { recursive: true, force: true });
await normalizeSource(source);
const restored = await extractSource(source);
if (restored.extracted !== 0) throw new Error(`restore re-extracted ${restored.extracted} pages; the snapshot should have been reused`);
await composeSource(source);

log.info(`e2e passed: ${pages.length} pages, ${rules} rules, ${results.length} evals`);

if (!keep) {
  await rm(paths.cache(SOURCE_ID), { recursive: true, force: true });
}
