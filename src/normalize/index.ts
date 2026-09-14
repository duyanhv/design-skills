import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import type { Source } from "../schema/source.ts";
import type { Manifest } from "../fetch/types.ts";
import { doccToMarkdown, supportedPlatforms, type DoccDocument } from "./docc.ts";
import { wcagToMarkdown } from "./wcag.ts";
import { withFrontmatter } from "./frontmatter.ts";
import { listFiles, paths, readJson, writeText } from "../util/fs.ts";
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
  /** Platform scope the source itself declares for this page, when it declares one. */
  platforms: string[];
}

/** Container pages (category landing pages) have little prose; we skip anything under this. */
const MIN_WORDS = Number(process.env.DESIGN_SKILLS_MIN_WORDS ?? 60);

export interface NormalizeOptions {
  /** Proceed even though the crawl was incomplete. The build is then explicitly a partial artifact. */
  allowPartial?: boolean;
}

export async function normalizeSource(source: Source, opts: NormalizeOptions = {}): Promise<NormalizedPage[]> {
  const manifest = await readJson<Manifest>(paths.manifest(source.id));
  if (!manifest) throw new Error(`no manifest for ${source.id}; run fetch first`);
  if (manifest.partial && !opts.allowPartial) {
    throw new Error(
      `manifest for ${source.id} is marked partial (${manifest.failed?.length ?? 0} pages failed to fetch); ` +
        `re-run fetch, or pass --allow-partial to build from what was retrieved`,
    );
  }
  if (manifest.partial) log.warn(`building ${source.id} from a partial crawl — the skill will be incomplete`);
  const out: NormalizedPage[] = [];

  for (const entry of Object.values(manifest.pages)) {
    let md: { title: string; abstract: string; body: string };
    let platforms: string[] = [];
    switch (source.kind) {
      case "docc": {
        const doc = JSON.parse(await readFile(join(paths.raw(source.id), `${entry.slug}.json`), "utf8")) as DoccDocument;
        md = doccToMarkdown(doc);
        platforms = supportedPlatforms(doc, source.platforms);
        break;
      }
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
      platforms,
    };
    await writeText(
      join(paths.md(source.id), `${entry.slug}.md`),
      withFrontmatter(
        {
          title: page.title,
          slug: page.slug,
          category: page.category,
          url: page.url,
          source_hash,
          fetched_at: page.fetched_at,
          words,
          ...(platforms.length ? { platforms: platforms.join(",") } : {}),
          ...(manifest.version ? { version: manifest.version } : {}),
        },
        `# ${page.title}\n\n${body}`,
      ),
    );
    out.push(page);
  }

  // Reconcile: drop markdown for pages the current crawl no longer produces (removed upstream, or
  // now below the word threshold). Without this, extraction happily reuses a page that is gone.
  // Skipped for a partial crawl, where absence means "not visited", not "removed".
  const live = new Set(out.map((p) => p.slug));
  let removed = 0;
  if (!manifest.partial) {
    for (const f of await listFiles(paths.md(source.id), ".md")) {
      if (live.has(f.replace(/\.md$/, ""))) continue;
      await rm(join(paths.md(source.id), f));
      removed++;
    }
  }
  log.info(`normalized ${out.length} content pages (${Object.keys(manifest.pages).length} fetched, ${removed} stale removed)`);
  return out;
}
