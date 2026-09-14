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

  // Version = date of the last commit touching the guidelines tree (best effort).
  const gh = /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(source.base_url);
  if (gh) {
    try {
      const api = `https://api.github.com/repos/${gh[1]}/${gh[2]}/commits?sha=${gh[3]}&path=${gh[4]}&per_page=1`;
      const commits = JSON.parse(await fetchText(api)) as { commit?: { committer?: { date?: string } } }[];
      const date = commits[0]?.commit?.committer?.date;
      if (date) manifest.version = date.slice(0, 10);
    } catch (err) {
      log.warn(`could not read upstream commit date: ${(err as Error).message}`);
    }
  }

  const index = parse(await fetchText(`${source.base_url}${source.entry}`));
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
  await mapLimit(todo, 4, async (job) => {
    let html = job.html;
    for (const inc of job.includes) {
      const sc = await fetchText(`${source.base_url}/${inc}`);
      if (job.slug === "glossary") html += sc + "\n";
      else html = html.replace(new RegExp(`<section[^>]*data-include="${inc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*></section>`), sc);
    }
    const stamped = job.number ? `<!-- number:${job.number} -->\n${html}` : html;
    const raw_hash = shortHash(stamped);
    const prev = previous?.pages[job.slug];
    const entry: PageEntry = {
      slug: job.slug,
      url: `${canonical.replace(/#.*$/, "")}#${job.slug}`,
      data_url: `${source.base_url}${source.entry}`,
      title: job.number ? `${job.number} ${job.title}` : job.title,
      category: job.category,
      parent: null,
      raw_hash,
      fetched_at: prev && prev.raw_hash === raw_hash ? prev.fetched_at : manifest.fetched_at,
    };
    manifest.pages[job.slug] = entry;
    await writeText(join(paths.raw(source.id), `${job.slug}.html`), stamped);
  });

  const scCount = todo.filter((j) => j.slug !== "glossary").reduce((n, j) => n + j.includes.length, 0);
  const termCount = todo.find((j) => j.slug === "glossary")?.includes.length ?? 0;
  log.info(`fetched ${Object.keys(manifest.pages).length} pages: ${scCount} success criteria, ${termCount} glossary terms`);
  await writeJson(paths.manifest(source.id), manifest);
  return manifest;
}
