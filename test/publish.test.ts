import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { publishSkills } from "../src/publish/index.ts";

const scratch: string[] = [];
afterEach(async () => { await Promise.all(scratch.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });
async function git(cwd: string, ...args: string[]) {
  const p = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  if (await p.exited) throw new Error(err);
  return out.trim();
}

// The build/validate subprocesses are controlled fixtures. These tests exercise publishing through
// real Git commits and a local bare remote; the compiler itself has separate e2e coverage.
async function fixture(opts: { validationFails?: boolean; partial?: boolean; unrelated?: boolean } = {}) {
  const base = await mkdtemp(join(tmpdir(), "ds-publish-test-")); scratch.push(base);
  const cwd = join(base, "work"); const remote = join(base, "remote.git");
  await mkdir(cwd); await mkdir(remote);
  await git(remote, "init", "--bare", "--initial-branch=main");
  await git(cwd, "init", "--initial-branch=main");
  await git(cwd, "config", "user.name", "Publisher test");
  await git(cwd, "config", "user.email", "publisher@example.invalid");
  await git(cwd, "config", "commit.gpgsign", "false");
  await git(cwd, "remote", "add", "origin", remote);
  for (const d of ["sources", "src/e2e", "skills/lumen-ds/references"]) await mkdir(join(cwd, d), { recursive: true });
  const source = (id: string, redistributable: boolean) => JSON.stringify({
    id, name: id, kind: "docc", synthetic: true, base_url: "https://example.invalid", entry: "/guide",
    license: { spdx: "MIT", attribution: "Synthetic", redistributable }, skill: { name: id, description: "Test" },
  });
  await writeFile(join(cwd, "sources/lumen-ds.yaml"), source("lumen-ds", true));
  await writeFile(join(cwd, "sources/local-only.yaml"), source("local-only", false));
  await writeFile(join(cwd, ".gitignore"), ".cache/\n");
  await writeFile(join(cwd, "skills/lumen-ds/references/removed.md"), "Old rule\n");
  await writeFile(join(cwd, "src/e2e/run.ts"), `
    import {mkdir,writeFile,rm} from 'node:fs/promises';
    await mkdir('skills/lumen-ds',{recursive:true}); await mkdir('ir/lumen-ds',{recursive:true});
    await mkdir('.cache/lumen-ds',{recursive:true});
    await writeFile('.cache/lumen-ds/private.txt','Not an output');
    await rm('skills/lumen-ds/references/removed.md',{force:true});
    await writeFile('skills/lumen-ds/SKILL.md','# Synthetic skill\\n');
    await writeFile('skills/lumen-ds/provenance.json','{}');
    await writeFile('ir/lumen-ds/meta.json',JSON.stringify({partial:${!!opts.partial}}));
    ${opts.unrelated ? "await writeFile('unrelated.txt','Do not publish');" : ""}
  `);
  await writeFile(join(cwd, "src/cli.ts"), opts.validationFails ? "throw new Error('Synthetic validation failure');" : "process.exit(0);");
  await git(cwd, "add", "."); await git(cwd, "commit", "-m", "fixture");
  return { cwd, remote, head: await git(cwd, "rev-parse", "HEAD") };
}

test("publisher commits generated outputs and deletions, skips local-only sources, pushes a no-op without an empty commit", async () => {
  const { cwd, remote, head } = await fixture();
  await publishSkills(cwd, [], false);
  const built = await git(cwd, "rev-parse", "HEAD");
  expect(built).not.toBe(head);
  const changed = (await git(cwd, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")).split("\n");
  expect(changed).toContain("skills/lumen-ds/SKILL.md");
  expect(changed).toContain("skills/lumen-ds/references/removed.md");
  expect(changed.every((p) => p.startsWith("skills/lumen-ds/") || p.startsWith("ir/lumen-ds/"))).toBe(true);
  expect(await git(cwd, "ls-remote", "origin", "refs/heads/main")).toBe("");
  await publishSkills(cwd);
  expect(await git(cwd, "rev-parse", "HEAD")).toBe(built);
  expect(await git(remote, "rev-parse", "refs/heads/main")).toBe(built);
  expect(await git(cwd, "status", "--porcelain")).toBe("");
});

test("publisher refuses an explicitly requested local-only source before generating or committing", async () => {
  const { cwd, head } = await fixture();
  await expect(publishSkills(cwd, ["local-only"])).rejects.toThrow("marked local-only");
  expect(await git(cwd, "rev-parse", "HEAD")).toBe(head);
  expect(await git(cwd, "status", "--porcelain")).toBe("");
});

test("publisher refuses an unrelated staged change", async () => {
  const { cwd, head } = await fixture();
  await writeFile(join(cwd, "draft.md"), "My draft"); await git(cwd, "add", "draft.md");
  await expect(publishSkills(cwd)).rejects.toThrow("clean working tree");
  expect(await git(cwd, "rev-parse", "HEAD")).toBe(head);
  expect(await git(cwd, "diff", "--cached", "--name-only")).toBe("draft.md");
});

for (const [name, opts, message] of [
  ["validation fails", { validationFails: true }, "Synthetic validation failure"],
  ["build is partial", { partial: true }, "incomplete or unmarked"],
  ["build changes unrelated files", { unrelated: true }, "outside the selected outputs"],
] as const) {
  test(`publisher does not commit or push when ${name}`, async () => {
    const { cwd, head } = await fixture(opts);
    await expect(publishSkills(cwd)).rejects.toThrow(message);
    expect(await git(cwd, "rev-parse", "HEAD")).toBe(head);
    expect(await git(cwd, "ls-remote", "origin", "refs/heads/main")).toBe("");
    expect(await readFile(join(cwd, "skills/lumen-ds/SKILL.md"), "utf8")).toContain("Synthetic skill");
  });
}
