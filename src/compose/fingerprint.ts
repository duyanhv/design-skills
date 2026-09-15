/**
 * A fingerprint of the renderer itself.
 *
 * `compose` reads IR and writes Markdown, so a change to the renderer changes the shipped files
 * without changing a single input hash. Nothing noticed: the Apple references on disk were written
 * before a `termLine` fix and stayed stale, silently dropping a paragraph from the Buttons page,
 * and `check`/`trace` read whatever was on disk and passed (AUDIT-OUTPUT finding 1).
 *
 * Every skill now records the fingerprint of the code that rendered it, and `validate` reports a
 * mismatch. It is a content hash of `src/compose/`, not a git revision: uncommitted edits to the
 * renderer are exactly the case that went unnoticed, and a revision would not see them.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "../util/fs.ts";
import { shortHash } from "../util/hash.ts";

let cached: string | undefined;

export async function composeFingerprint(): Promise<string> {
  if (cached) return cached;
  // Relative to this module, not the working directory: `validate` runs in a scratch tree that
  // holds only sources/, ir/ and skills/, and a cwd-rooted lookup would hash nothing there.
  const dir = dirname(fileURLToPath(import.meta.url));
  const parts: string[] = [];
  for (const f of await listFiles(dir, ".ts")) {
    if (f === "fingerprint.ts") continue; // this file does not affect the output
    parts.push(f, await readFile(join(dir, f), "utf8"));
  }
  cached = shortHash(parts.join("\0"));
  return cached;
}
