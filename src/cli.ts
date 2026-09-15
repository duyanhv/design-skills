#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { fetchSource } from "./fetch/index.ts";
import { normalizeSource } from "./normalize/index.ts";
import { extractSource } from "./extract/index.ts";
import { composeSource } from "./compose/index.ts";
import { validateSource } from "./validate/index.ts";
import { evalSource } from "./eval/index.ts";
import { listSources, loadSource } from "./util/fs.ts";
import { log } from "./util/log.ts";
import { buildAuthoredSource } from "./authored/index.ts";

const USAGE = `design-skills — compile design guidelines into Agent Skills

usage: bun run src/cli.ts <command> [source-id] [options]

commands
  fetch       crawl the source into .cache/<id>/raw
  normalize   raw → markdown in .cache/<id>/md
  extract     markdown → rules IR in ir/<id>/pages (deterministic; only changed pages)
  compose     IR → skills/<name>/SKILL.md + references/
  validate    schema, provenance, license gate and size checks
  eval        assert evals/<id>/questions.yaml facts are present in the generated skill
  build       fetch → normalize → extract → compose → validate → eval
              authored sources: copy local guidance → validate → eval

options
  --limit N        cap pages (fetch/extract)
  --force          re-extract unchanged pages
  --allow-partial  build from an incomplete crawl (marks the skill partial; never reconciles)
`;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    limit: { type: "string" },
    force: { type: "boolean", default: false },
    "allow-partial": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const [command, sourceArg] = positionals;
if (values.help || !command) {
  console.log(USAGE);
  process.exit(command ? 0 : 1);
}

const ids = sourceArg ? [sourceArg] : await listSources();
const limit = values.limit ? Number(values.limit) : undefined;
const allowPartial = values["allow-partial"] === true;

let failed = false;
for (const id of ids) {
  const source = await loadSource(id);
  // A synthetic source has no upstream; `bun run example` builds it from its local fixture.
  if (source.synthetic && (command === "fetch" || command === "build") && !sourceArg) {
    log.info(`skipping ${id} (synthetic; build it with \`bun run example\`)`);
    continue;
  }
  log.step(`${command} ${id}`);
  switch (command) {
    case "fetch":
      await fetchSource(source, { limit });
      break;
    case "normalize":
      await normalizeSource(source, { allowPartial });
      break;
    case "extract":
      await extractSource(source, { limit, force: values.force, partial: Boolean(limit) || allowPartial });
      break;
    case "compose":
      await composeSource(source);
      break;
    case "validate":
      failed = report(await validateSource(source)) || failed;
      break;
    case "eval":
      failed = reportEval(await evalSource(source)) || failed;
      break;
    case "build":
      if (source.kind === "authored") {
        await buildAuthoredSource(source);
        failed = report(await validateSource(source)) || failed;
        failed = reportEval(await evalSource(source)) || failed;
        break;
      }
      await fetchSource(source, { limit });
      await normalizeSource(source, { allowPartial });
      await extractSource(source, { limit, force: values.force, partial: Boolean(limit) || allowPartial });
      await composeSource(source);
      failed = report(await validateSource(source)) || failed;
      failed = reportEval(await evalSource(source)) || failed;
      break;
    default:
      console.error(`unknown command: ${command}\n\n${USAGE}`);
      process.exit(1);
  }
}
if (failed) process.exit(1);

function reportEval(results: { q: string; source: string; pass: boolean; missing: string[] }[] | null): boolean {
  if (!results) {
    log.info("no evals for this source");
    return false;
  }
  for (const r of results) {
    console.log(`${r.pass ? "✓" : "✗"} ${r.q}  [${r.source}]`);
    for (const m of r.missing) console.log(`    ${m}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  log.info(`${results.length - failed}/${results.length} evals pass`);
  return failed > 0;
}

function report(findings: { level: string; where: string; message: string }[]): boolean {
  for (const f of findings) console.log(`${f.level === "error" ? "✗" : "△"} ${f.where}: ${f.message}`);
  const errors = findings.filter((f) => f.level === "error").length;
  log.info(`${errors} errors, ${findings.length - errors} warnings`);
  return errors > 0;
}
