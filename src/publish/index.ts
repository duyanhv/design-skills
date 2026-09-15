import { readFile, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { SourceSchema, type Source } from "../schema/source.ts";

async function run(cwd: string, args: string[], live = false): Promise<string> {
  const proc = Bun.spawn(args, { cwd, stdout: live ? "inherit" : "pipe", stderr: "pipe", stdin: "ignore" });
  const [stdout, stderr] = await Promise.all([
    live ? Promise.resolve("") : new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr).text(),
  ]);
  if (await proc.exited) throw new Error(`${args.slice(0, 3).join(" ")} failed:\n${stderr || stdout}`);
  if (live && stderr) process.stderr.write(stderr);
  return stdout;
}

async function changes(cwd: string): Promise<string[]> {
  // Do not trim the porcelain records: their two status columns include meaningful spaces.
  const raw = await run(cwd, ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const records = raw.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    if (!record) continue;
    paths.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) paths.push(records[++i]!);
  }
  return paths;
}

/** Build, validate, commit and optionally push only the selected redistributable skill outputs. */
export async function publishSkills(cwd: string, requested: string[] = [], push = true): Promise<void> {
  const ids = requested.length ? [...new Set(requested)] : (await readdir(join(cwd, "sources")))
    .filter((f) => f.endsWith(".yaml")).map((f) => f.slice(0, -5)).sort();
  const selected: Source[] = [];
  for (const id of ids) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid source id: ${id}`);
    const source = SourceSchema.parse(parse(await readFile(join(cwd, "sources", `${id}.yaml`), "utf8")));
    if (source.id !== id) throw new Error(`Source filename and id disagree: ${id}`);
    if (!source.license.redistributable) {
      if (requested.length) throw new Error(`${id} is marked local-only (license.redistributable: false). Its generated text cannot be published by this command.`);
      console.log(`Skip ${id}: local-only output.`);
      continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.skill.name)) throw new Error(`Invalid skill folder: ${source.skill.name}`);
    if (source.synthetic && id !== "lumen-ds") throw new Error(`No synthetic build adapter for ${id}`);
    selected.push(source);
  }
  if (!selected.length) throw new Error("No redistributable sources to publish.");
  const root = (await run(cwd, ["git", "rev-parse", "--show-toplevel"])).trim();
  if (await realpath(root) !== await realpath(cwd)) throw new Error("Run publish:skills from the repository root.");
  if ((await changes(cwd)).length) throw new Error("Commit or stash your changes before publishing. The publisher needs a clean working tree.");
  const branch = (await run(cwd, ["git", "symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  if (push) await run(cwd, ["git", "remote", "get-url", "origin"]);

  const outputPaths = selected.flatMap((s) => s.kind === "authored" ? [`skills/${s.skill.name}`] : [`skills/${s.skill.name}`, `ir/${s.id}`]);
  for (const source of selected) {
    console.log(`Build ${source.id} → skills/${source.skill.name}/`);
    const build = source.synthetic ? ["src/e2e/run.ts", "--keep"] : ["src/cli.ts", "build", source.id];
    await run(cwd, [process.execPath, "run", ...build], true);
    await run(cwd, [process.execPath, "run", "src/cli.ts", "validate", source.id], true);
    await run(cwd, [process.execPath, "run", "src/cli.ts", "eval", source.id], true);
    const metaPath = source.kind === "authored" ? join(cwd, "skills", source.skill.name, "provenance.json") : join(cwd, "ir", source.id, "meta.json");
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    if (meta.partial !== false) throw new Error(`${source.id}: cannot publish an incomplete or unmarked build.`);
    await readFile(join(cwd, "skills", source.skill.name, "SKILL.md"), "utf8");
    await readFile(join(cwd, "skills", source.skill.name, "provenance.json"), "utf8");
  }

  const changed = await changes(cwd);
  const unexpected = changed.filter((p) => !outputPaths.some((dir) => p.startsWith(`${dir}/`)));
  if (unexpected.length) throw new Error(`Files outside the selected outputs changed; nothing committed:\n${unexpected.join("\n")}`);
  if (changed.length) {
    await run(cwd, ["git", "add", "--all", "--", ...outputPaths]);
    // --only keeps an unrelated file staged concurrently out of this commit.
    await run(cwd, ["git", "commit", "--only", "-m", `chore: publish skills (${selected.map((s) => s.id).join(", ")})`, "--", ...outputPaths], true);
  } else console.log("Generated skills are unchanged; no new commit needed.");
  if (push) {
    await run(cwd, ["git", "push", "--set-upstream", "origin", `HEAD:refs/heads/${branch}`], true);
    console.log(`Published to origin/${branch}.`);
  } else console.log("Committed locally. Review with git show; push when ready with git push.");
}
