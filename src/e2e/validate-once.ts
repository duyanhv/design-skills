#!/usr/bin/env bun
/**
 * Validate one source in the current working directory and print the findings as JSON.
 *
 * Exists so `validate-negative.ts` can validate a scratch tree: `util/fs.ts` fixes `ROOT` to
 * `process.cwd()` at module load, so the only reliable way to point validate somewhere else is a
 * fresh process with a different cwd.
 */
import { validateSource } from "../validate/index.ts";
import { loadSource } from "../util/fs.ts";

const id = process.argv[2];
if (!id) throw new Error("usage: validate-once.ts <source-id>");
console.log(JSON.stringify(await validateSource(await loadSource(id))));
