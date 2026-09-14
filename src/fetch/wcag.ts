/**
 * Fetcher for the w3c/wcag guidelines source tree. `guidelines/index.html` nests
 * principle > guideline > <section data-include="sc/…"> ; we inline each include so that one
 * "page" = one guideline (13 of them), which becomes one reference file with its success criteria.
 */
import { join } from "node:path";
import { parse } from "node-html-parser";
import type { Source } from "../schema/source.ts";
import type { Manifest, PageEntry } from "./types.ts";
import { fetchText } from "./http.ts";
import { paths, writeText, writeJson, readJson } from "../util/fs.ts";
import { shortHash } from "../util/hash.ts";
import { log } from "../util/log.ts";
import { mapLimit } from "../util/limit.ts";

export async function fetchWcag(source: Source, opts: { limit?: number } = {}): Promise<Manifest> {
  const canonical = source.canonical_url ?? source.base_url;
  const previous = await readJson<Manifest>(paths.manifest(source.id));
  const manifest: Manifest = { source: source.id, entry: source.entry, fetched_at: new Date().toISOString(), pages: {} };

  // Pin the crawl to one immutable revision. Fetching each file from a moving branch could mix
  // revisions mid-crawl; resolving the branch to a SHA once and reading every file from that SHA
  // makes the build reproducible and gives the skill a revision to cite.
  const gh = /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(source.base_url);
  let baseUrl = source.base_url;
  if (gh) {
    try {
      const api = `https://api.github.com/repos/${gh[1]}/${gh[2]}/commits?sha=${gh[3]}&path=${gh[4]}&per_page=1`;
      const commits = JSON.parse(await fetchText(api)) as { sha?: string; commit?: { committer?: { date?: string } } }[];
      const date = commits[0]?.commit?.committer?.date;
      const sha = commits[0]?.sha;
      if (date) manifest.version = date.slice(0, 10);
      if (sha) {
        manifest.revision = sha;
        baseUrl = `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${sha}/${gh[4]}`;
        log.info(`pinned to ${gh[1]}/${gh[2]}@${sha.slice(0, 10)} (${manifest.version})`);
      }
    } catch (err) {
      log.warn(`could not read upstream commit date: ${(err as Error).message}`);
    }
  }
  if (gh && !manifest.revision) {
    // Unpinned means files could come from different revisions; say so rather than implying otherwise.
    manifest.partial = true;
    manifest.failed = [{ url: source.base_url, error: "could not resolve a commit SHA; crawl is not pinned to one revision" }];
  }

  const index = parse(await fetchText(`${baseUrl}${source.entry}`));
  const principles = index.querySelectorAll("section.principle");
  let gNo = 0;
  const jobs: { slug: string; title: string; category: string; number: string; html: string; includes: string[] }[] = [];

  principles.forEach((principle, pi) => {
    const category = principle.getAttribute("id") ?? `principle-${pi + 1}`;
    let gi = 0;
    for (const guideline of principle.querySelectorAll("section.guideline")) {
      gi++;
      gNo++;
      const slug = guideline.getAttribute("id") ?? `guideline-${gNo}`;
      const title = guideline.querySelector("h3")?.text.trim() ?? slug;
      const includes = guideline.querySelectorAll("section[data-include]").map((s) => s.getAttribute("data-include")!);
      jobs.push({ slug, title, category, number: `${pi + 1}.${gi}`, html: guideline.outerHTML, includes });
    }
  });

  // Glossary: every terms/* include, as one extra page
  const termIncludes = index.querySelectorAll("[data-include]").map((s) => s.getAttribute("data-include")!).filter((p) => p.startsWith("terms/"));
  if (termIncludes.length) {
    jobs.push({ slug: "glossary", title: "Glossary", category: "glossary", number: "", html: "<!-- glossary -->\n", includes: termIncludes });
  }

  const todo = opts.limit ? jobs.slice(0, opts.limit) : jobs;
  const failed: { url: string; error: string }[] = [];
  await mapLimit(todo, 4, async (job) => {
    let html = job.html;
    for (const inc of job.includes) {
      let sc: string;
      try {
        sc = await fetchText(`${baseUrl}/${inc}`);
      } catch (err) {
        failed.push({ url: `${baseUrl}/${inc}`, error: (err as Error).message });
        continue;
      }
      if (job.slug === "glossary") html += sc + "\n";
      else html = html.replace(new RegExp(`<section[^>]*data-include="${inc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*></section>`), sc);
    }
    const stamped = job.number ? `<!-- number:${job.number} -->\n${html}` : html;
    const raw_hash = shortHash(stamped);
    const prev = previous?.pages[job.slug];
    const entry: PageEntry = {
      slug: job.slug,
      url: `${canonical.replace(/#.*$/, "")}#${job.slug}`,
      data_url: `${baseUrl}${source.entry}`,
      title: job.number ? `${job.number} ${job.title}` : job.title,
      category: job.category,
      parent: null,
      raw_hash,
      fetched_at: prev && prev.raw_hash === raw_hash ? prev.fetched_at : manifest.fetched_at,
    };
    manifest.pages[job.slug] = entry;
    await writeText(join(paths.raw(source.id), `${job.slug}.html`), stamped);
  });

  manifest.limited = Boolean(opts.limit);
  if (failed.length) manifest.failed = [...(manifest.failed ?? []), ...failed];
  manifest.partial = Boolean(manifest.partial) || failed.length > 0 || Boolean(opts.limit);

  const scCount = todo.filter((j) => j.slug !== "glossary").reduce((n, j) => n + j.includes.length, 0);
  const termCount = todo.find((j) => j.slug === "glossary")?.includes.length ?? 0;
  log.info(`fetched ${Object.keys(manifest.pages).length} pages: ${scCount} success criteria, ${termCount} glossary terms`);
  await writeJson(paths.manifest(source.id), manifest);
  return manifest;
}
