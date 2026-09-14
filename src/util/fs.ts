import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { SourceSchema, type Source } from "../schema/source.ts";

export const ROOT = process.cwd();
export const paths = {
  sources: join(ROOT, "sources"),
  cache: (id: string) => join(ROOT, ".cache", id),
  raw: (id: string) => join(ROOT, ".cache", id, "raw"),
  md: (id: string) => join(ROOT, ".cache", id, "md"),
  manifest: (id: string) => join(ROOT, ".cache", id, "manifest.json"),
  ir: (id: string) => join(ROOT, "ir", id),
  irPages: (id: string) => join(ROOT, "ir", id, "pages"),
  irMeta: (id: string) => join(ROOT, "ir", id, "meta.json"),
  skill: (name: string) => join(ROOT, "skills", name),
};

export async function ensureDir(p: string) {
  await mkdir(p, { recursive: true });
}

export async function writeText(p: string, text: string) {
  await ensureDir(dirname(p));
  await writeFile(p, text, "utf8");
}

export async function writeJson(p: string, data: unknown) {
  await writeText(p, JSON.stringify(data, null, 2) + "\n");
}

export async function readJson<T = unknown>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(p, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    return names.filter((n) => n.endsWith(ext)).sort();
  } catch {
    return [];
  }
}

export async function listDirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export async function loadSource(id: string): Promise<Source> {
  const raw = await readFile(join(paths.sources, `${id}.yaml`), "utf8");
  return SourceSchema.parse(parseYaml(raw));
}

export async function listSources(): Promise<string[]> {
  return (await listFiles(paths.sources, ".yaml")).map((n) => n.replace(/\.yaml$/, ""));
}
