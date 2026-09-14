/**
 * Fetcher for DocC-rendered sites (Apple HIG, Apple developer docs).
 * Every page has a JSON render at `${data_prefix}${page_url}.json`. We BFS from the
 * entry page through `topicSections[].identifiers`, resolving each id via `references`.
 */
import { join } from "node:path";
import type { Source } from "../schema/source.ts";
import type { Manifest, PageEntry } from "./types.ts";
import { fetchText } from "./http.ts";
import { paths, writeText, writeJson, readJson } from "../util/fs.ts";
import { shortHash } from "../util/hash.ts";
import { log } from "../util/log.ts";
import { mapLimit } from "../util/limit.ts";

interface DoccRef { url?: string; title?: string; kind?: string; type?: string }
interface DoccPage {
  kind?: string;
  metadata?: { title?: string };
  topicSections?: { title?: string; identifiers?: string[] }[];
  references?: Record<string, DoccRef>;
}

export function slugFor(entry: string, pageUrl: string): string {
  const rel = pageUrl.replace(entry, "").replace(/^\/+|\/+$/g, "");
  return rel === "" ? "index" : rel.replace(/\//g, "--");
}

export async function fetchDocc(source: Source, opts: { limit?: number } = {}): Promise<Manifest> {
  const prefix = source.data_prefix ?? "/tutorials/data";
  const dataUrlFor = (pageUrl: string) => `${source.base_url}${prefix}${pageUrl}.json`;
  const previous = await readJson<Manifest>(paths.manifest(source.id));
  const manifest: Manifest = {
    source: source.id,
    entry: source.entry,
    fetched_at: new Date().toISOString(),
    pages: {},
  };

  // queue items carry the category they were discovered under
  const queue: { url: string; category: string; parent: string | null }[] = [
    { url: source.entry, category: "root", parent: null },
  ];
  const seen = new Set<string>([source.entry]);

  while (queue.length) {
    const batch = queue.splice(0, 8);
    await mapLimit(batch, 4, async ({ url, category, parent }) => {
      if (opts.limit && Object.keys(manifest.pages).length >= opts.limit) return;
      const dataUrl = dataUrlFor(url);
      let text: string;
      try {
        text = await fetchText(dataUrl);
      } catch (err) {
        log.warn(`skip ${url}: ${(err as Error).message}`);
        return;
      }
      const page = JSON.parse(text) as DoccPage;
      const slug = slugFor(source.entry, url);
      const raw_hash = shortHash(text);
      const prev = previous?.pages[slug];
      const entry: PageEntry = {
        slug,
        url: `${source.base_url}${url}`,
        data_url: dataUrl,
        title: page.metadata?.title ?? slug,
        category,
        parent,
        raw_hash,
        // keep the old timestamp if content is byte-identical → stable provenance
        fetched_at: prev && prev.raw_hash === raw_hash ? prev.fetched_at : manifest.fetched_at,
      };
      manifest.pages[slug] = entry;
      await writeText(join(paths.raw(source.id), `${slug}.json`), text);

      // discover children
      const isRoot = url === source.entry;
      for (const section of page.topicSections ?? []) {
        for (const id of section.identifiers ?? []) {
          const ref = page.references?.[id];
          const childUrl = ref?.url;
          if (!childUrl || !childUrl.startsWith(source.entry) || seen.has(childUrl)) continue;
          seen.add(childUrl);
          const childCategory = isRoot ? slugFor(source.entry, childUrl) : category;
          queue.push({ url: childUrl, category: childCategory, parent: slug });
        }
      }
    });
    log.info(`fetched ${Object.keys(manifest.pages).length} pages, ${queue.length} queued`);
  }

  await writeJson(paths.manifest(source.id), manifest);
  return manifest;
}
