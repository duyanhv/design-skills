/**
 * Git questions the license gate needs answered. `.gitignore` text is not the authority on whether a
 * path is ignored — a later negation can re-include it, and a file that is already tracked keeps
 * being committed regardless. Ask git itself instead.
 */
import { ROOT } from "./fs.ts";

async function git(args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const proc = Bun.spawn(["git", ...args], { cwd: ROOT, stdout: "pipe", stderr: "ignore" });
    const stdout = await new Response(proc.stdout).text();
    return { code: await proc.exited, stdout };
  } catch {
    return { code: -1, stdout: "" };
  }
}

/** True when git would ignore `path` (exit 0 from check-ignore). Unknown → treated as ignored. */
export async function gitIgnores(path: string): Promise<boolean> {
  const { code } = await git(["check-ignore", "-q", path]);
  if (code === 0) return true;
  if (code === 1) return false;
  return true; // no git available (e.g. a tarball): do not fail the build on an unanswerable question
}

/** Files under `dir` that git currently tracks. Non-empty means the ignore rule came too late. */
export async function gitTracked(dir: string): Promise<string[]> {
  const { code, stdout } = await git(["ls-files", "--", dir]);
  if (code !== 0) return [];
  return stdout.split("\n").filter(Boolean);
}
