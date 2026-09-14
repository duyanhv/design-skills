#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { fetchSource } from "./fetch/index.ts";
import { normalizeSource } from "./normalize/index.ts";
import { extractSource } from "./extract/index.ts";
import { composeSource } from "./compose/index.ts";
import { validateSource } from "./validate/index.ts";
import { listSources, loadSource } from "./util/fs.ts";
import { log } from "./util/log.ts";

const USAGE = `design-skills — compile design guidelines into Agent Skills

usage: bun run src/cli.ts <command> [source-id] [options]

commands
  fetch       crawl the source into .cache/<id>/raw
  normalize   raw → markdown in .cache/<id>/md
  extract     markdown → rules IR in ir/<id>/pages (deterministic; only changed pages)
  compose     IR → skills/<name>/SKILL.md + references/
  validate    schema, provenance, verbatim and size checks
  build       fetch → normalize → extract → compose → validate

options
  --limit N        cap pages (fetch/extract)
  --force          re-extract unchanged pages
`;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    limit: { type: "string" },
    force: { type: "boolean", default: false },
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

let failed = false;
for (const id of ids) {
  const source = await loadSource(id);
  log.step(`${command} ${id}`);
  switch (command) {
    case "fetch":
      await fetchSource(source, { limit });
      break;
    case "normalize":
      await normalizeSource(source);
      break;
    case "extract":
      await extractSource(source, { limit, force: values.force });
      break;
    case "compose":
      await composeSource(source);
      break;
    case "validate":
      failed = report(await validateSource(source)) || failed;
      break;
    case "build":
      await fetchSource(source, { limit });
      await normalizeSource(source);
      await extractSource(source, { limit, force: values.force });
      await composeSource(source);
      failed = report(await validateSource(source)) || failed;
      break;
    default:
      console.error(`unknown command: ${command}\n\n${USAGE}`);
      process.exit(1);
  }
}
if (failed) process.exit(1);

function report(findings: { level: string; where: string; message: string }[]): boolean {
  for (const f of findings) console.log(`${f.level === "error" ? "✗" : "△"} ${f.where}: ${f.message}`);
  const errors = findings.filter((f) => f.level === "error").length;
  log.info(`${errors} errors, ${findings.length - errors} warnings`);
  return errors > 0;
}
