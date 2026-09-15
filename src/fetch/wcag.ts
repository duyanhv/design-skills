/**
 * Fetcher for the w3c/wcag guidelines source tree. `guidelines/index.html` nests
 * principle > guideline > <section data-include="sc/…"> ; we inline each include so that one
 * "page" = one guideline (13 of them), which becomes one reference file with its success criteria.
 *
 * Two sections outside that tree are fetched as well, because criteria are unusable without them:
 *   - `input-purposes.html` — the defined set 1.3.5 refers to. Without it the criterion's own
 *     condition ("serves a purpose identified in the Input Purposes … section") is unresolvable.
 *   - the Conformance chapter of `index.html` (Interpreting Normative Requirements + Conformance
 *     Requirements cc1–cc5) — what conformance *means*, which selecting a level does not cover.
 * They are normative, they are what the guideline links to, and bundling them locally is the same
 * posture as the criteria themselves: `license.redistributable` is false, so nothing here is
 * committed; the reader builds it on their own machine.
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
  /**
   * Failures found while *planning* the crawl. A dependency that the index no longer offers is a
   * missing page, not an absent one, so it is recorded the same way a failed download would be.
   */
  const failedEarly: { url: string; error: string }[] = [];
  const principles = index.querySelectorAll("section.principle");
  let gNo = 0;
  const jobs: { slug: string; title: string; category: string; number: string; html: string; includes: string[]; append?: boolean }[] = [];

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
    jobs.push({ slug: "glossary", title: "Glossary", category: "glossary", number: "", html: "<!-- glossary -->\n", includes: termIncludes, append: true });
  }

  // Input Purposes: an appendix include, fetched like a page of its own.
  const purposeInclude = index.querySelectorAll("[data-include]").map((s) => s.getAttribute("data-include")!).find((p) => /input-purposes\.html$/.test(p));
  if (purposeInclude) {
    jobs.push({
      slug: "input-purposes",
      title: "Input Purposes for User Interface Components",
      category: "reference",
      number: "",
      html: "<!-- appendix:reference -->\n",
      includes: [purposeInclude],
      append: true,
    });
  } else {
    failedEarly.push({ url: `${baseUrl}/input-purposes.html`, error: "index.html no longer includes input-purposes.html; 1.3.5's defined purpose set would ship as a dangling reference" });
  }

  // Conformance: already inline in index.html, so the whole chapter is sliced out rather than
  // fetched. The whole chapter and not just cc1–cc5, because its parts cross-reference each other
  // (cc2 sends the reader to the Statement of Partial Conformance); shipping half of it would
  // recreate the dangling-reference problem one level down.
  const conformance = index
    .querySelectorAll("section")
    .find((s) => s.querySelector(":scope > h1")?.text.trim() === "Conformance");
  if (conformance) {
    jobs.push({
      slug: "conformance-reqs",
      title: "Conformance Requirements",
      category: "conformance",
      number: "",
      html: `<!-- appendix:normative -->\n${conformance.outerHTML}`,
      includes: [],
    });
  } else {
    failedEarly.push({ url: `${baseUrl}${source.entry}#conformance-reqs`, error: "the Conformance chapter was not found in index.html; a conformance conclusion would have nothing to check against" });
  }

  const todo = opts.limit ? jobs.slice(0, opts.limit) : jobs;
  const failed: { url: string; error: string }[] = [...failedEarly];
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
      if (job.append) html += sc + "\n";
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
