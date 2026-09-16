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

export const APPLE: Verifier = {
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

const VERIFIERS = [APPLE];

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
  // navigation-bars into toolbars, and the old URL answers 200 with Toolbars' content.
  const slug = page.split("/").pop()!;
  const expected = slug.replace(/-/g, "");
  const actual = facts.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (actual !== expected && !actual.includes(expected) && !expected.includes(actual)) {
    return {
      problems: [
        {
          url: page,
          message: `serves "${facts.title}" — the URL slug and the page no longer agree, so this may be a merged or renamed page`,
        },
      ],
      verified: 0,
      unchecked: 0,
    };
  }

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

  for (const [page, anchors] of [...byPage].sort()) {
    const result = await checkPage(page, anchors);
    verified += result.verified;
    unchecked += result.unchecked;
    if (result.unchecked && !quiet) console.log(`? ${page}\n    no verifier for this host; not checked`);
    for (const problem of result.problems) {
      problems++;
      console.log(`✗ ${problem.url}\n    ${problem.message}`);
      for (const where of citations.get(problem.url) ?? citations.get(page) ?? []) console.log(`    cited at ${where}`);
    }
    if (!result.problems.length && result.verified && !quiet) {
      console.log(`✓ ${page.split("/").pop()}${anchors.size ? ` (+${anchors.size} anchors)` : ""}`);
    }
  }

  if (problems) {
    log.warn(`${problems} official link(s) need attention`);
    process.exit(1);
  }
  log.info(`${verified} official link target(s) verified against the source's own data${unchecked ? `, ${unchecked} unchecked` : ""}`);
}
