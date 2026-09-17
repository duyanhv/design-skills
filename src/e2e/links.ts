#!/usr/bin/env bun
/**
 * Verify that the official links in the authored guides point at pages that still exist.
 *
 * An authored guide is almost entirely links. It deliberately carries no specifications, so a link
 * that rots does not degrade the guide, it empties it: the agent is sent to read a page that is not
 * there and has nothing else to go on. Nothing else in this repository checks that, because
 * `validate` only resolves links *inside* a bundle and `docs.ts` only checks relative ones.
 *
 * Checking an Apple link is not a matter of requesting the URL. developer.apple.com is a
 * single-page app that answers 200 with a generic shell for a page that does not exist, so
 * `totally-fake-page-xyz` looks exactly like `buttons` to curl. Worse, `navigation-bars` — a page
 * this guide could plausibly have cited — now serves the *Toolbars* document, because Apple merged
 * the two. A status-code check would have called that link healthy while sending readers elsewhere.
 *
 * So we ask for the DocC JSON render behind each page (`/tutorials/data/<path>.json`), which 404s
 * honestly, carries the real title, and enumerates the section anchors. That lets us check what a
 * status code cannot: that the page exists as its own document, that an `#anchor` names a real
 * section, and that the title still matches the slug, which is what catches a silent merge.
 *
 * **A parsed response is not a verified one.** An earlier version treated any JSON that did not
 * throw as proof of existence, so a 200 carrying `{}` passed and was counted as verified: the
 * identity check was guarded on the title being present, and a missing title skipped it rather than
 * failing it. Anything that cannot be identified is now a failure, because "I could not tell what
 * this page is" and "this page is fine" must never produce the same exit code. `links-negative.ts`
 * holds that case and the rest against a local stub server.
 *
 * Network-dependent by nature, so it is not part of `bun run check`. Run it when editing a guide,
 * and on a schedule. `--quiet` prints only problems.
 *
 * Usage: bun run src/e2e/links.ts [source-id …] [--quiet]
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, listSources, loadSource } from "../util/fs.ts";
import { log } from "../util/log.ts";

const UA = "design-skills/0.1 (+https://github.com/duyanhv/design-skills; guideline compiler)";

/** What a page's structured render told us. `title: null` means the render was unusable. */
export interface PageFacts {
  title: string | null;
  anchors: Set<string>;
}

/** A source whose pages have a machine-readable render we can ask about existence and anchors. */
export interface Verifier {
  handles: (url: string) => boolean;
  dataUrl: (url: string) => string;
  /** Throw, or return `title: null`, when the body is not a usable document for this source. */
  parse: (body: string) => PageFacts;
  /**
   * Does the document returned still correspond to the URL that was requested?
   *
   * Apple's rule — compare the slug to the title — is Apple's, not a general one. GitHub titles a
   * file page "repo/path/to/file at branch", and m3.material.io answers every route with the same
   * "Material Design" title, so applying Apple's comparison to either would report a healthy link
   * as broken. Each verifier states the strongest identity check its host actually supports, and
   * says so where that is weaker than Apple's.
   */
  identity: (page: string, facts: PageFacts) => string | null;
  /**
   * What a pass from this verifier actually establishes.
   *
   * "verified" has to mean the same thing everywhere it is printed. Apple's DocC route proves the
   * page exists as its own document and that cited anchors are real; m3.material.io's HTML proves
   * only that the URL is not a 404. Counting both as "verified" would be the kind of flattening
   * this repository keeps having to correct, so each verifier states its own strength and the
   * summary reports the weaker ones separately.
   */
  establishes: "identity" | "existence";
}

function doccAnchors(node: unknown, found: PageFacts): void {
  if (Array.isArray(node)) {
    for (const child of node) doccAnchors(child, found);
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (record.type === "heading" && typeof record.anchor === "string") found.anchors.add(record.anchor);
    for (const value of Object.values(record)) doccAnchors(value, found);
  }
}

/** Apple's slug-to-title comparison, which catches a silently merged page. */
function appleIdentity(page: string, facts: PageFacts): string | null {
  const slug = page.split("/").pop()!;
  const expected = slug.replace(/-/g, "");
  const actual = facts.title!.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (actual === expected || actual.includes(expected) || expected.includes(actual)) return null;
  return `serves "${facts.title}" — the URL slug and the page no longer agree, so this may be a merged or renamed page`;
}

export const APPLE: Verifier = {
  establishes: "identity",
  identity: appleIdentity,
  handles: (url) => url.startsWith("https://developer.apple.com/design/human-interface-guidelines/"),
  dataUrl: (url) =>
    url.replace("https://developer.apple.com/design/", "https://developer.apple.com/tutorials/data/design/") + ".json",
  parse: (body) => {
    const data = JSON.parse(body) as { metadata?: { title?: unknown }; primaryContentSections?: unknown };
    // A DocC document has a metadata.title and a body. Demand both: an empty object, an error
    // payload, or a truncated response parses as JSON perfectly well and identifies nothing.
    const title = data.metadata?.title;
    if (typeof title !== "string" || !title.trim()) return { title: null, anchors: new Set() };
    if (!Array.isArray(data.primaryContentSections)) return { title: null, anchors: new Set() };
    const found: PageFacts = { title, anchors: new Set() };
    doccAnchors(data, found);
    return found;
  },
};

/** `<title>` from an HTML document, unescaped. */
function htmlTitle(body: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
  if (!match) return null;
  // &nbsp; matters here: developer.android.com separates its title segments with it, and leaving
  // it encoded made the title look like it did not contain the words it plainly does.
  const text = match[1]!
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ").trim();
  return text || null;
}

/**
 * developer.android.com — an ordinary server-rendered documentation site.
 *
 * Unlike Apple it 404s honestly for a page that does not exist, so existence needs no special
 * data endpoint. Identity is checked against the title, which names the document ("Material Design
 * 3 in Compose | Jetpack Compose | Android Developers"), so a page that is retired and redirected
 * to a hub is caught by the title no longer containing the slug's words.
 */
export const ANDROID: Verifier = {
  establishes: "identity",
  handles: (url) => url.startsWith("https://developer.android.com/"),
  dataUrl: (url) => url,
  parse: (body) => {
    const title = htmlTitle(body);
    // A Google error page is served with 200 in some cases; it has a title but no article body.
    if (!title || !/<article|<main|role="main"/i.test(body)) return { title: null, anchors: new Set() };
    return { title, anchors: new Set() };
  },
  identity: (page, facts) => {
    // Compare on letters only, ignoring digits and separators. Android's slugs compress what the
    // title spells out: "material3" is titled "Material Design 3 in Compose", so requiring the
    // literal token reported a perfectly healthy link as renamed. Requiring the slug's letters to
    // appear in order is weaker than Apple's check and is the strongest thing this host supports.
    const slug = page.replace(/\/$/, "").split("/").pop()!;
    const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const want = letters(slug);
    const got = letters(facts.title!);
    if (!want || got.includes(want)) return null;
    return `serves "${facts.title}", whose title does not contain "${slug}" from the URL; the page may have been renamed or merged`;
  },
};

/**
 * github.com — repository and blob pages.
 *
 * GitHub 404s honestly, and titles a file page "<owner>/<repo>/<path> at <branch>", which is a
 * strong identity signal: a file moved or deleted on that branch cannot produce that title. A
 * repository root is titled "GitHub - owner/repo: description".
 *
 * Anchors are NOT checked. GitHub renders Markdown headings to anchors client-side in a form this
 * would have to reimplement, and a check that guesses is worse than one that abstains, so an
 * anchor into github.com is reported as unchecked rather than assumed good.
 */
export const GITHUB: Verifier = {
  establishes: "identity",
  handles: (url) => url.startsWith("https://github.com/"),
  dataUrl: (url) => url,
  parse: (body) => {
    // The shared fetcher sends `accept: application/json`, and GitHub honours it with a payload
    // carrying meta.title. Prefer that over scraping <title>: it is a documented shape rather than
    // whatever the page happens to render, and it keeps working when the HTML changes.
    try {
      const data = JSON.parse(body) as { meta?: { title?: unknown } };
      const title = data.meta?.title;
      if (typeof title === "string" && title.trim()) return { title: title.trim(), anchors: new Set() };
    } catch {
      /* not the JSON payload; fall back to the rendered page */
    }
    const title = htmlTitle(body);
    return title ? { title, anchors: new Set() } : { title: null, anchors: new Set() };
  },
  identity: (page, facts) => {
    const path = page.replace("https://github.com/", "").replace(/\/$/, "");
    const [owner, repo, mode, , ...rest] = path.split("/");
    const title = facts.title!;
    if (!owner || !repo) return `"${page}" is not a repository URL`;
    // Both title shapes name owner/repo; requiring it catches a repository that was renamed or
    // transferred, which GitHub serves by redirecting rather than 404ing.
    if (!title.includes(`${owner}/${repo}`)) {
      return `serves "${title}", which does not name ${owner}/${repo}; the repository may have been renamed or transferred`;
    }
    // For a blob link, the file path must appear too: a deleted file redirects to the repo root.
    if (mode === "blob" && rest.length) {
      const file = rest.join("/");
      if (!title.includes(file)) {
        return `serves "${title}", which does not name the file ${file}; it may have been moved or deleted`;
      }
    }
    return null;
  },
};

/**
 * m3.material.io — existence only, and it says so.
 *
 * This host 404s honestly, so a link that has been removed is caught. Identity is another matter:
 * it is a single-page app whose titles are inconsistent. /components/buttons/overview renders
 * "Buttons – Material Design 3", but /styles/color/overview answers with the generic shell title
 * "Material Design", which is what Apple's app shell does and the reason the DocC route exists
 * there.
 *
 * There is no equivalent data endpoint here that I have found. So this verifier checks that the
 * page exists and deliberately does NOT claim to check that it is still the right page: a generic
 * title is accepted rather than reported, because rejecting it would flag healthy links, and
 * pretending it identifies the document would be the `{}`-passes-as-verified bug again in a new
 * host. The gap is recorded in the guide and in `docs/public-output-checklist.md` rather than
 * hidden behind a green tick.
 */
export const MATERIAL: Verifier = {
  establishes: "existence",
  handles: (url) => url.startsWith("https://m3.material.io/"),
  dataUrl: (url) => url,
  parse: (body) => {
    const title = htmlTitle(body);
    // Still refuse a body that is not a document at all; that much is checkable.
    if (!title || body.length < 2000) return { title: null, anchors: new Set() };
    return { title, anchors: new Set() };
  },
  identity: (page, facts) => {
    const slug = page.replace(/\/$/, "").split("/").filter(Boolean).pop() ?? "";
    const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    // Only a title that names a DIFFERENT document is a failure. The generic shell title cannot
    // distinguish a real page from a missing one, so it is not evidence either way, and the 404
    // check above is what carries this host.
    if (letters(facts.title!) === "materialdesign") return null;
    const want = letters(slug === "overview" ? page.split("/").slice(-2)[0]! : slug);
    if (!want || letters(facts.title!).includes(want)) return null;
    return `serves "${facts.title}", whose title does not contain "${slug}" from the URL; the page may have been renamed or merged`;
  },
};

const VERIFIERS = [APPLE, ANDROID, GITHUB, MATERIAL];

/** Fetch, distinguishing "this page is not there" from "the network misbehaved". */
async function get(url: string): Promise<{ ok: true; body: string } | { ok: false; status: number | null }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
      if (res.ok) return { ok: true, body: await res.text() };
      if (res.status !== 429 && res.status < 500) return { ok: false, status: res.status };
    } catch {
      /* fall through to the backoff */
    }
    await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
  }
  return { ok: false, status: null };
}

export interface LinkReport {
  problems: { url: string; message: string }[];
  verified: number;
  unchecked: number;
}

/**
 * Check one page and the anchors cited into it.
 *
 * Every path either records a problem or increments `verified`; there is no path that does neither,
 * which is the invariant the `{}` bug violated.
 */
export async function checkPage(
  page: string,
  anchors: Set<string>,
  verifiers: Verifier[] = VERIFIERS,
  fetcher = get,
): Promise<{ problems: { url: string; message: string }[]; verified: number; unchecked: number }> {
  const problems: { url: string; message: string }[] = [];
  const verifier = verifiers.find((v) => v.handles(page));
  if (!verifier) return { problems, verified: 0, unchecked: 1 };

  const res = await fetcher(verifier.dataUrl(page));
  if (!res.ok) {
    return {
      problems: [
        {
          url: page,
          message: res.status === 404 ? "no such page (its data render 404s)" : `could not be checked (${res.status ?? "network"})`,
        },
      ],
      verified: 0,
      unchecked: 0,
    };
  }

  let facts: PageFacts;
  try {
    facts = verifier.parse(res.body);
  } catch {
    return { problems: [{ url: page, message: "data render was not valid JSON" }], verified: 0, unchecked: 0 };
  }

  // Unusable render. Previously this fell through to `verified++`; an unidentifiable page is a
  // failure, because it gives us no evidence the link leads anywhere.
  if (facts.title === null) {
    return {
      problems: [{ url: page, message: "data render carried no usable document (no title or no content sections)" }],
      verified: 0,
      unchecked: 0,
    };
  }

  // A page that now serves a different document is the failure a status check misses: Apple merged
  // navigation-bars into toolbars, and the old URL answers 200 with Toolbars' content. Each host
  // states its own version of this, because the signal differs by site.
  const mismatch = verifier.identity(page, facts);
  if (mismatch) return { problems: [{ url: page, message: mismatch }], verified: 0, unchecked: 0 };

  let verified = 1;
  for (const anchor of anchors) {
    if (facts.anchors.has(anchor)) verified++;
    else problems.push({ url: `${page}#${anchor}`, message: `page exists but has no section "${anchor}"` });
  }
  return { problems, verified, unchecked: 0 };
}

async function markdownFiles(dir: string, prefix = ""): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, await markdownFiles(join(dir, entry.name), name + "/"));
    else if (entry.name.endsWith(".md")) files[name] = await readFile(join(dir, entry.name), "utf8");
  }
  return files;
}

/** url → every file:line that links to it, so a failure names where to go and fix it. */
export async function citationsFor(ids: string[]): Promise<Map<string, string[]>> {
  const citations = new Map<string, string[]>();
  for (const id of ids) {
    const files = await markdownFiles(join(ROOT, "guidance", id));
    for (const [file, text] of Object.entries(files)) {
      text.split("\n").forEach((line, index) => {
        for (const match of line.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)) {
          const url = match[1]!;
          citations.set(url, [...(citations.get(url) ?? []), `guidance/${id}/${file}:${index + 1}`]);
        }
      });
    }
  }
  return citations;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const quiet = args.includes("--quiet");
  const requested = args.filter((a) => !a.startsWith("--"));

  const ids: string[] = [];
  for (const id of requested.length ? requested : await listSources()) {
    if ((await loadSource(id)).kind === "authored") ids.push(id);
  }
  const citations = await citationsFor(ids);

  // Group by page so one request serves every anchor into it.
  const byPage = new Map<string, Set<string>>();
  for (const url of citations.keys()) {
    const [page, anchor] = url.split("#") as [string, string | undefined];
    const anchors = byPage.get(page) ?? new Set<string>();
    if (anchor) anchors.add(anchor);
    byPage.set(page, anchors);
  }

  let problems = 0;
  let verified = 0;
  let unchecked = 0;
  /** Pages whose verifier can only establish existence, reported apart from the identity-checked. */
  let existenceOnly = 0;

  for (const [page, anchors] of [...byPage].sort()) {
    const result = await checkPage(page, anchors);
    verified += result.verified;
    unchecked += result.unchecked;
    if (result.verified && VERIFIERS.find((v) => v.handles(page))?.establishes === "existence") {
      existenceOnly += result.verified;
    }
    if (result.unchecked && !quiet) console.log(`? ${page}\n    no verifier for this host; not checked`);
    for (const problem of result.problems) {
      problems++;
      console.log(`✗ ${problem.url}\n    ${problem.message}`);
      for (const where of citations.get(problem.url) ?? citations.get(page) ?? []) console.log(`    cited at ${where}`);
    }
    if (!result.problems.length && result.verified && !quiet) {
      const weak = VERIFIERS.find((v) => v.handles(page))?.establishes === "existence";
      const label = page.split("/").filter(Boolean).pop() ?? page;
      console.log(`✓ ${label}${anchors.size ? ` (+${anchors.size} anchors)` : ""}${weak ? " — exists; identity not checkable on this host" : ""}`);
    }
  }

  if (problems) {
    log.warn(`${problems} official link(s) need attention`);
    process.exit(1);
  }
  const identity = verified - existenceOnly;
  log.info(
    `${identity} official link target(s) verified against the source's own data` +
      (existenceOnly ? `, ${existenceOnly} confirmed to exist but not identifiable on their host` : "") +
      (unchecked ? `, ${unchecked} unchecked` : ""),
  );
}
