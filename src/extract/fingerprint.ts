/**
 * A fingerprint of the extractor itself, for the same reason `src/compose/fingerprint.ts` exists.
 *
 * `input_hash` keyed reuse on the page body, the manifest settings, and the extractor's *id string*.
 * That made the id a hand-maintained version number: tightening the severity heuristic or the value
 * badge changed what extraction produces while every hash stayed identical, so the next run reused
 * IR the new code would never have written. Forgetting to bump a constant is not a failure mode a
 * compiler should have — hashing the code removes it.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "../util/fs.ts";
import { shortHash } from "../util/hash.ts";

let cached: string | undefined;

export async function extractFingerprint(): Promise<string> {
  if (cached) return cached;
  // Relative to this module, not the working directory: `validate` runs in a scratch tree that
  // holds only sources/, ir/ and skills/, and a cwd-rooted lookup would hash nothing there.
  const dir = dirname(fileURLToPath(import.meta.url));
  const parts: string[] = [];
  for (const f of await listFiles(dir, ".ts")) {
    if (f === "fingerprint.ts" || f === "index.ts") continue; // orchestration, not extraction logic
    parts.push(f, await readFile(join(dir, f), "utf8"));
  }
  cached = shortHash(parts.join("\0"));
  return cached;
}
