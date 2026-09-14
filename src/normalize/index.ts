import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { Source } from "../schema/source.ts";
import type { Manifest } from "../fetch/types.ts";
import { doccToMarkdown, type DoccDocument } from "./docc.ts";
import { wcagToMarkdown } from "./wcag.ts";
import { withFrontmatter } from "./frontmatter.ts";
import { paths, readJson, writeText } from "../util/fs.ts";
import { shortHash } from "../util/hash.ts";
import { log } from "../util/log.ts";

export interface NormalizedPage {
  slug: string;
  title: string;
  category: string;
  url: string;
  source_hash: string;
  fetched_at: string;
  words: number;
}

/** Container pages (category landing pages) have little prose; we skip anything under this. */
const MIN_WORDS = Number(process.env.DESIGN_SKILLS_MIN_WORDS ?? 60);

export async function normalizeSource(source: Source): Promise<NormalizedPage[]> {
  const manifest = await readJson<Manifest>(paths.manifest(source.id));
  if (!manifest) throw new Error(`no manifest for ${source.id}; run fetch first`);
  const out: NormalizedPage[] = [];

  for (const entry of Object.values(manifest.pages)) {
    let md: { title: string; abstract: string; body: string };
    switch (source.kind) {
      case "docc":
        md = doccToMarkdown(JSON.parse(await readFile(join(paths.raw(source.id), `${entry.slug}.json`), "utf8")) as DoccDocument);
        break;
      case "wcag":
        md = wcagToMarkdown(await readFile(join(paths.raw(source.id), `${entry.slug}.html`), "utf8"));
        break;
      default:
        throw new Error(`normalizer for kind "${source.kind}" not implemented`);
    }
    const body = [md.abstract, md.body].filter(Boolean).join("\n\n");
    const words = body.split(/\s+/).filter(Boolean).length;
    if (words < MIN_WORDS || entry.category === "root") continue;

    const source_hash = shortHash(body);
    const page: NormalizedPage = {
      slug: entry.slug,
      title: md.title || entry.title,
      category: entry.category,
      url: entry.url,
      source_hash,
      fetched_at: entry.fetched_at,
      words,
    };
    await writeText(
      join(paths.md(source.id), `${entry.slug}.md`),
      withFrontmatter(
        { title: page.title, slug: page.slug, category: page.category, url: page.url, source_hash, fetched_at: page.fetched_at, words, ...(manifest.version ? { version: manifest.version } : {}) },
        `# ${page.title}\n\n${body}`,
      ),
    );
    out.push(page);
  }
  log.info(`normalized ${out.length} content pages (${Object.keys(manifest.pages).length} fetched)`);
  return out;
}
