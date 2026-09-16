import { test, expect } from "bun:test";
import { join } from "node:path";

/**
 * The CLI is the project's public interface: every documented workflow in the README and
 * CONTRIBUTING starts with `bun run <command> <source>`. It had no test, and two failure modes were
 * wrong in ways a script would not notice — a mistyped command printed a step header for work it
 * never did, and a mistyped source id surfaced as a raw ENOENT stack trace from `readFile`, which
 * reads as a compiler crash rather than a typo.
 *
 * These run the real binary rather than importing it, because the exit code is the contract.
 */
const CLI = join(import.meta.dir, "..", "src", "cli.ts");

async function run(args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, out: stdout + stderr };
}

test("no command prints usage and fails, so a scripted build cannot mistake it for success", async () => {
  const { code, out } = await run([]);
  expect(code).toBe(1);
  expect(out).toContain("usage:");
});

test("--help succeeds, because asking for help is not an error", async () => {
  const { code, out } = await run(["--help"]);
  expect(code).toBe(0);
  expect(out).toContain("compile design guidelines");
});

test("an unknown command is rejected before any source is touched", async () => {
  const { code, out } = await run(["frobnicate"]);
  expect(code).toBe(1);
  expect(out).toContain("unknown command: frobnicate");
  // The rejection must come first: a step header means work was announced for a command that was
  // about to be refused.
  expect(out).not.toContain("== frobnicate");
});

test("an unknown source names the mistake and lists the real ones", async () => {
  const { code, out } = await run(["validate", "no-such-source"]);
  expect(code).toBe(1);
  expect(out).toContain("unknown source: no-such-source");
  expect(out).toContain("apple-hig");
  // Not a stack trace from deep inside the loader.
  expect(out).not.toContain("ENOENT");
  expect(out).not.toMatch(/at loadSource/);
});

test("a real command on a real source still works", async () => {
  const { code, out } = await run(["validate", "lumen-ds"]);
  expect(code).toBe(0);
  expect(out).toContain("0 errors");
});
