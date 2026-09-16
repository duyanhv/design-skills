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
 * the two. A status-code check would have called that link healthy while it silently sent readers
 * somewhere else.
 *
 * So we ask for the DocC JSON render behind each page (`/tutorials/data/<path>.json`), which 404s
 * honestly, carries the real title, and enumerates the section anchors. That lets us check three
 * things a status code cannot:
 *
 *   - the page exists as its own document, not as a shell or a redirect to another one;
 *   - an `#anchor` names a section that is really on that page;
 *   - the page's title still matches the topic the link text claims, catching a silent merge.
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

/** A source whose pages have a machine-readable render we can ask about existence and anchors. */
interface Verifier {
  /** Does this verifier know how to check the URL? */
  handles: (url: string) => boolean;
  /** Where the structured render of the page lives. */
  dataUrl: (url: string) => string;
  /** Pull the page title and its section anchors out of that render. */
  parse: (body: string) => { title: string | null; anchors: Set<string> };
}

function doccAnchors(node: unknown, found: { title: string | null; anchors: Set<string> }): void {
  if (Array.isArray(node)) {
    for (const child of node) doccAnchors(child, found);
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (record.type === "heading" && typeof record.anchor === "string") found.anchors.add(record.anchor);
    for (const value of Object.values(record)) doccAnchors(value, found);
  }
}

const APPLE: Verifier = {
  handles: (url) => url.startsWith("https://developer.apple.com/design/human-interface-guidelines/"),
  dataUrl: (url) =>
    url.replace("https://developer.apple.com/design/", "https://developer.apple.com/tutorials/data/design/") + ".json",
  parse: (body) => {
    const data = JSON.parse(body) as { metadata?: { title?: string } };
    const found = { title: data.metadata?.title ?? null, anchors: new Set<string>() };
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
      // 404 is an answer. 429/5xx is the server asking us to wait.
      if (res.status !== 429 && res.status < 500) return { ok: false, status: res.status };
    } catch {
      /* fall through to the backoff */
    }
    await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
  }
  return { ok: false, status: null };
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

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const requested = args.filter((a) => !a.startsWith("--"));

const ids: string[] = [];
for (const id of requested.length ? requested : await listSources()) {
  if ((await loadSource(id)).kind === "authored") ids.push(id);
}

/** url → every file:line that links to it, so a failure names where to go and fix it. */
const citations = new Map<string, string[]>();
for (const id of ids) {
  const files = await markdownFiles(join(ROOT, "guidance", id));
  for (const [file, text] of Object.entries(files)) {
    text.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)) {
        const where = `guidance/${id}/${file}:${index + 1}`;
        const url = match[1]!;
        citations.set(url, [...(citations.get(url) ?? []), where]);
      }
    });
  }
}

let problems = 0;
let verified = 0;
let skipped = 0;
const report = (url: string, message: string) => {
  problems++;
  console.log(`✗ ${url}\n    ${message}`);
  for (const where of citations.get(url) ?? []) console.log(`    cited at ${where}`);
};

// Group by page so one request serves every anchor into it.
const byPage = new Map<string, Set<string>>();
for (const url of citations.keys()) {
  const [page, anchor] = url.split("#") as [string, string | undefined];
  const anchors = byPage.get(page) ?? new Set<string>();
  if (anchor) anchors.add(anchor);
  byPage.set(page, anchors);
}

for (const [page, anchors] of [...byPage].sort()) {
  const verifier = VERIFIERS.find((v) => v.handles(page));
  if (!verifier) {
    // Not every official source exposes a structured render; say so rather than implying a pass.
    skipped++;
    if (!quiet) console.log(`? ${page}\n    no verifier for this host; not checked`);
    continue;
  }
  const res = await get(verifier.dataUrl(page));
  if (!res.ok) {
    report(page, res.status === 404 ? "no such page (its data render 404s)" : `could not be checked (${res.status ?? "network"})`);
    continue;
  }
  let parsed: { title: string | null; anchors: Set<string> };
  try {
    parsed = verifier.parse(res.body);
  } catch {
    report(page, "data render was not the expected format");
    continue;
  }

  // A page that now serves a different document is the failure a status check misses: Apple merged
  // navigation-bars into toolbars, and the old URL answers 200 with Toolbars' content.
  const slug = page.split("/").pop()!;
  const expected = slug.replace(/-/g, "");
  const actual = (parsed.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (parsed.title && actual !== expected && !actual.includes(expected) && !expected.includes(actual)) {
    report(page, `serves "${parsed.title}" — the URL slug and the page no longer agree, so this may be a merged or renamed page`);
    continue;
  }

  verified++;
  for (const anchor of anchors) {
    if (parsed.anchors.has(anchor)) verified++;
    else report(`${page}#${anchor}`, `page exists but has no section "${anchor}"`);
  }
  if (!quiet) console.log(`✓ ${parsed.title ?? slug}${anchors.size ? ` (+${anchors.size} anchors)` : ""}`);
}

if (problems) {
  log.warn(`${problems} official link(s) need attention`);
  process.exit(1);
}
log.info(`${verified} official link target(s) verified against the source's own data${skipped ? `, ${skipped} unchecked` : ""}`);
