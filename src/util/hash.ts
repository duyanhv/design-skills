import { createHash } from "node:crypto";

/** 16-hex-char content hash; stable input ordering is the caller's job. */
export function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
