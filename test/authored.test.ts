import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { SourceSchema } from "../src/schema/source.ts";
import { inspectAuthored } from "../src/authored/index.ts";

const source = SourceSchema.parse({
  id: "original-guide", name: "Original Guide", kind: "authored", entry: "/",
  base_url: "https://example.invalid/guide",
  license: { spdx: "MIT", redistributable: true, attribution: "Original writing" },
  skill: { name: "original-guide", description: "Original review workflow" },
});
const entry = `---
name: original-guide
description: Original review workflow
license: MIT
metadata:
  authorship: original
---
# Original Guide
Read [official guidance](https://example.invalid/guide) and [review steps](references/steps.md).
`;
const files = { "SKILL.md": entry, "references/steps.md": "# Review steps\nInspect the running interface.\n" };
const scratch: string[] = [];
afterEach(async () => { await Promise.all(scratch.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
const cli = resolve("src/cli.ts");
async function run(cwd: string, command: string) {
  const p = Bun.spawn([process.execPath, cli, command, source.id], { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, output: out + err };
}

test("authored validation catches missing, escaping, orphaned references and invalid authorship", () => {
  expect(inspectAuthored(files, source)).toEqual([]);
  expect(inspectAuthored({ "SKILL.md": entry }, source).join()).toContain("Broken local link");
  expect(inspectAuthored({ ...files, "SKILL.md": entry + "[outside](../outside.md)" }, source).join()).toContain("Broken local link");
  expect(inspectAuthored({ ...files, "orphan.md": "unreachable" }, source).join()).toContain("Unreachable reference");
  expect(inspectAuthored({ ...files, "SKILL.md": entry.replace("authorship: original", "authorship: extracted") }, source).join()).toContain("authorship must be original");
});

test("real authored builds are deterministic, reject tampering, and reconcile removed references", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "ds-authored-test-")); scratch.push(cwd);
  await mkdir(join(cwd, "sources"));
  const input = join(cwd, "guidance", source.id);
  const output = join(cwd, "skills", source.skill.name);
  await mkdir(join(input, "references"), { recursive: true });
  await writeFile(join(cwd, "sources", source.id + ".yaml"), JSON.stringify(source));
  for (const [name, text] of Object.entries(files)) await writeFile(join(input, name), text);
  expect((await run(cwd, "build")).code).toBe(0);
  const first = await readFile(join(output, "provenance.json"), "utf8");
  expect((await run(cwd, "build")).code).toBe(0);
  expect(await readFile(join(output, "provenance.json"), "utf8")).toBe(first);
  expect(await readFile(join(output, "SKILL.md"), "utf8")).toBe(entry);
  await writeFile(join(output, "references/steps.md"), "Altered instruction");
  const altered = await run(cwd, "validate");
  expect(altered.code).toBe(1);
  expect(altered.output).toContain("differs from its authored inputs");
  expect(altered.output).toContain("provenance does not match");
  await writeFile(join(input, "SKILL.md"), entry.replace(" and [review steps](references/steps.md)", ""));
  await rm(join(input, "references/steps.md"));
  expect((await run(cwd, "build")).code).toBe(0);
  expect(await Bun.file(join(output, "references/steps.md")).exists()).toBe(false);
  expect(await readFile(join(input, "SKILL.md"), "utf8")).toBe(await readFile(join(output, "SKILL.md"), "utf8"));
  await writeFile(join(cwd, "sources", source.id + ".yaml"), JSON.stringify({ ...source, license: { ...source.license, redistributable: false } }));
  expect((await run(cwd, "validate")).code).toBe(1);
  expect((await run(cwd, "build")).code).not.toBe(0);
});

/*
 * Unknown keys are typos, and a typo must not silently take a constraint with it.
 *
 * Found by sweeping the other e2e checks with the protocol six audit rounds used on the record
 * checks: introduce the defect each check claims to catch, and see whether it is caught.
 * `manifests` accepted an unrecognised key in a source manifest, which is not cosmetic —
 * `max_skill_line` instead of `max_skill_lines` parsed clean, fell back to the default of 300, and
 * a 161-line SKILL.md that the real 150 limit rejects then built without complaint. One character,
 * no diagnostic, the budget doubled.
 */
test("an unknown key in a source manifest is rejected, naming the key", () => {
  const withTypo = {
    id: "original-guide", name: "Original Guide", kind: "authored", entry: "/",
    base_url: "https://example.invalid/guide",
    license: { spdx: "MIT", redistributable: true, attribution: "Original writing" },
    // The real defect: one character, and the 150 below becomes the default 300.
    skill: { name: "original-guide", description: "Original review workflow", max_skill_line: 150 },
  };
  const result = SourceSchema.safeParse(withTypo);
  expect(result.success).toBe(false);
  expect(JSON.stringify(result.error?.issues)).toContain("max_skill_line");

  // The control: spelled correctly, it parses and the budget is the one that was written.
  const correct = SourceSchema.safeParse({
    ...withTypo,
    skill: { name: "original-guide", description: "Original review workflow", max_skill_lines: 150 },
  });
  expect(correct.success).toBe(true);
  expect(correct.data?.skill.max_skill_lines).toBe(150);
});

test("an unknown key at the top level of a manifest is rejected", () => {
  const result = SourceSchema.safeParse({
    id: "original-guide", name: "Original Guide", kind: "authored", entry: "/",
    base_url: "https://example.invalid/guide",
    licence: { spdx: "MIT", redistributable: true, attribution: "x" },   // British spelling
    license: { spdx: "MIT", redistributable: true, attribution: "Original writing" },
    skill: { name: "original-guide", description: "Original review workflow" },
  });
  expect(result.success).toBe(false);
  expect(JSON.stringify(result.error?.issues)).toContain("licence");
});

test("an unknown key in SKILL.md frontmatter is rejected, naming the key", () => {
  const withUnknown = entry.replace("license: MIT", "license: MIT\nunknown_field: whatever");
  const errors = inspectAuthored({ ...files, "SKILL.md": withUnknown }, source);
  expect(errors.join()).toContain("unknown_field");

  // Control: the same bundle without the stray key has no frontmatter complaint.
  expect(inspectAuthored(files, source).join()).not.toContain("frontmatter");
});

test("a budget written in the manifest is the budget enforced", () => {
  // The consequence the typo hid: 161 lines against a 150 limit must fail.
  const tight = SourceSchema.parse({
    id: "original-guide", name: "Original Guide", kind: "authored", entry: "/",
    base_url: "https://example.invalid/guide",
    license: { spdx: "MIT", redistributable: true, attribution: "Original writing" },
    skill: { name: "original-guide", description: "Original review workflow", max_skill_lines: 150 },
  });
  const padded = entry + "\n" + Array.from({ length: 160 }, (_, i) => `<!-- ${i} -->`).join("\n");
  expect(inspectAuthored({ ...files, "SKILL.md": padded }, tight).join()).toContain("size budget");

  // And under the limit it passes, so the check is not simply rejecting everything.
  expect(inspectAuthored(files, tight).join()).not.toContain("size budget");
});
