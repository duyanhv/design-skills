#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { publishSkills } from "./index.ts";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2), allowPositionals: true,
  options: { "no-push": { type: "boolean" }, help: { type: "boolean", short: "h" } },
});
if (values.help) {
  console.log("Usage: bun run publish:skills [source-id ...] [--no-push]\n\nBuild eligible sources, validate, commit skills/ and matching ir/, then push\nto origin on the current branch. Default: all redistributable sources.\n--no-push commits locally for review. Start with a clean working tree.");
} else {
  try { await publishSkills(process.cwd(), positionals, !values["no-push"]); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
