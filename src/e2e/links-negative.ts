#!/usr/bin/env bun
/**
 * Negative tests for the official-link verifier.
 *
 * Written because an audit got `links.ts` to report success on a page that does not exist. A stub
 * answering 200 with `{}` parsed as JSON, produced no title, and skipped the identity check instead
 * of failing it, so the run exited 0 and counted the target as verified. Every failure mode this
 * script claims to catch had been checked by hand against the live site, and none of those probes
 * survived the terminal they were typed into.
 *
 * So the verifier's decisions are now exercised against a local stub server: no network, fast,
 * deterministic, and able to serve the malformed bodies a real server rarely produces on demand.
 * The control cases matter as much as the failures — a verifier that rejected everything would pass
 * every negative case here.
 */
import { checkPage, APPLE, ANDROID, GITHUB, type Verifier } from "./links.ts";
import { log } from "../util/log.ts";

const HIG = "https://developer.apple.com/design/human-interface-guidelines";

/** A DocC-shaped document: what a healthy page really returns. */
const doc = (title: string, anchors: string[] = []) =>
  JSON.stringify({
    metadata: { title },
    primaryContentSections: [
      { kind: "content", content: anchors.map((anchor) => ({ type: "heading", level: 2, text: anchor, anchor })) },
    ],
  });

interface Case {
  name: string;
  /** Which verifier is under test. Defaults to Apple's, which most cases exercise. */
  verifier?: Verifier;
  /** Page URL under test. */
  page: string;
  /** Anchors cited into it. */
  anchors?: string[];
  /** What the stub server answers with. */
  respond: { status: number; body: string };
  /** Substring the reported problem must contain, or null when the link must be accepted. */
  expect: string | null;
  /** Expected `verified` count. Defaults to 1 when accepted, 0 when rejected. */
  verified?: number;
}

const CASES: Case[] = [
  // The audit's finding: a 200 that identifies nothing.
  {
    name: "200 with an empty JSON object is not a verified page",
    page: `${HIG}/buttons`,
    respond: { status: 200, body: "{}" },
    expect: "no usable document",
  },
  {
    name: "200 with metadata but no content sections is not a verified page",
    page: `${HIG}/buttons`,
    respond: { status: 200, body: JSON.stringify({ metadata: { title: "Buttons" } }) },
    expect: "no usable document",
  },
  {
    name: "200 with a blank title is not a verified page",
    page: `${HIG}/buttons`,
    respond: { status: 200, body: JSON.stringify({ metadata: { title: "   " }, primaryContentSections: [] }) },
    expect: "no usable document",
  },
  {
    name: "200 carrying an HTML error page is not a verified page",
    page: `${HIG}/buttons`,
    respond: { status: 200, body: "<!doctype html><title>Oops</title>" },
    expect: "not valid JSON",
  },
  {
    name: "a page whose data render 404s is reported as missing",
    page: `${HIG}/totally-fake-page-xyz`,
    respond: { status: 404, body: "not found" },
    expect: "no such page",
  },
  // The merge case: Apple retired navigation-bars and serves Toolbars at that URL.
  {
    name: "a URL that now serves a different document is reported as merged or renamed",
    page: `${HIG}/navigation-bars`,
    respond: { status: 200, body: doc("Toolbars", ["Navigation"]) },
    expect: "merged or renamed",
  },
  {
    name: "an anchor that names no section on the page is reported",
    page: `${HIG}/buttons`,
    anchors: ["No-Such-Section"],
    respond: { status: 200, body: doc("Buttons", ["Best-practices", "Role"]) },
    expect: 'has no section "No-Such-Section"',
    // The page itself is real, so it still counts; only the anchor failed. This is the one case
    // where a problem and a nonzero verified count are both correct.
    verified: 1,
  },
  // Controls.
  {
    name: "a healthy page with no anchors is accepted",
    page: `${HIG}/buttons`,
    respond: { status: 200, body: doc("Buttons", ["Best-practices"]) },
    expect: null,
    verified: 1,
  },
  {
    name: "a healthy page counts each resolved anchor",
    page: `${HIG}/buttons`,
    anchors: ["Best-practices", "Role"],
    respond: { status: 200, body: doc("Buttons", ["Best-practices", "Role", "Style"]) },
    expect: null,
    verified: 3,
  },
  {
    name: "a multi-word slug matching a multi-word title is accepted",
    page: `${HIG}/tab-bars`,
    respond: { status: 200, body: doc("Tab bars") },
    expect: null,
    verified: 1,
  },
  {
    name: "a title that differs only in punctuation and case is accepted",
    page: `${HIG}/right-to-left`,
    respond: { status: 200, body: doc("Right to left") },
    expect: null,
    verified: 1,
  },

  /*
   * ---- developer.android.com and github.com ----
   *
   * Added when the Material 3 bundle turned out to have zero of its four official links verified:
   * every one was reported "no verifier for this host". A guide that is almost entirely links and
   * checks none of them is the failure mode links.ts was written for, applied to a different
   * source.
   *
   * These hosts 404 honestly, unlike Apple, so existence is the easy half. Identity is the half
   * worth testing, and each host's signal is different — which is why the first version of both
   * verifiers reported healthy links as broken. Both of those mistakes are cases here.
   */
  {
    name: "android: a page whose title no longer contains the slug is a renamed page",
    verifier: ANDROID,
    page: "https://developer.android.com/develop/ui/compose/designsystems/material3",
    respond: { status: 200, body: "<main><title>Views Interoperability | Android Developers</title></main>" },
    expect: "may have been renamed",
  },
  {
    name: "android: the real title verifies, though the slug is spelled differently in it",
    verifier: ANDROID,
    page: "https://developer.android.com/develop/ui/compose/designsystems/material3",
    // The mistake this catches: requiring the literal token "material3" rejected this real page,
    // whose title spells the same thing as "Material Design 3".
    respond: {
      status: 200,
      body: "<main><title>Material Design 3 in Compose &nbsp;|&nbsp; Jetpack Compose &nbsp;|&nbsp; Android Developers</title></main>",
    },
    expect: null,
  },
  {
    name: "android: a 200 with no article body is not a verified page",
    verifier: ANDROID,
    page: "https://developer.android.com/develop/ui/compose/designsystems/material3",
    respond: { status: 200, body: "<title>Material Design 3</title><div>error</div>" },
    expect: "no usable document",
  },
  {
    name: "github: a repository page that names a different repository is rejected",
    verifier: GITHUB,
    page: "https://github.com/material-components/material-web",
    respond: { status: 200, body: JSON.stringify({ meta: { title: "GitHub - someone-else/other-repo: x" } }) },
    expect: "may have been renamed or transferred",
  },
  {
    name: "github: a blob page that no longer names the file is rejected",
    verifier: GITHUB,
    page: "https://github.com/material-components/material-web/blob/main/docs/theming/README.md",
    // What GitHub serves after a file is deleted: the repository, not the file.
    respond: { status: 200, body: JSON.stringify({ meta: { title: "GitHub - material-components/material-web: x" } }) },
    expect: "may have been moved or deleted",
  },
  {
    name: "github: the real blob title verifies",
    verifier: GITHUB,
    page: "https://github.com/material-components/material-web/blob/main/docs/theming/README.md",
    respond: {
      status: 200,
      body: JSON.stringify({ meta: { title: "material-web/docs/theming/README.md at main · material-components/material-web" } }),
    },
    expect: null,
  },
  {
    name: "github: a 200 carrying no title identifies nothing",
    verifier: GITHUB,
    page: "https://github.com/material-components/material-web",
    respond: { status: 200, body: JSON.stringify({ payload: {} }) },
    expect: "no usable document",
  },
];

let failed = 0;

for (const testCase of CASES) {
  // A stub standing in for developer.apple.com, so the decision under test is the verifier's.
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response(testCase.respond.body, { status: testCase.respond.status }),
  });
  const base = testCase.verifier ?? APPLE;
  const stub: Verifier = { ...base, dataUrl: () => `http://127.0.0.1:${server.port}/page.json` };

  try {
    const result = await checkPage(testCase.page, new Set(testCase.anchors ?? []), [stub]);
    const messages = result.problems.map((p) => p.message);
    const wantVerified = testCase.verified ?? (testCase.expect === null ? 1 : 0);
    const matched =
      testCase.expect === null
        ? result.problems.length === 0
        : messages.some((m) => m.includes(testCase.expect!));
    // A page that could not be identified must never contribute to the verified count. Stated per
    // case rather than as a blanket rule, because a real page with one bad anchor legitimately
    // reports a problem *and* counts itself as verified.
    const counted = result.verified === wantVerified;

    if (matched && counted) {
      console.log(`✓ ${testCase.name}`);
      console.log(`    → ${testCase.expect === null ? `accepted, ${result.verified} verified` : `reported, ${result.verified} verified`}`);
    } else {
      failed++;
      console.log(`✗ ${testCase.name}`);
      if (!counted) console.log(`    counted ${result.verified} verified, expected ${wantVerified}`);
      console.log(`    expected: ${testCase.expect ?? "no problem"}`);
      console.log(`    got:      ${messages.length ? messages.join("; ") : `no problem, ${result.verified} verified`}`);
    }
  } finally {
    server.stop(true);
  }
}

// An unknown host must be reported as unchecked rather than counted as verified, so the summary
// line cannot imply we validated something we never requested.
const foreign = await checkPage("https://m3.material.io/components/buttons", new Set(), [APPLE]);
if (foreign.unchecked === 1 && foreign.verified === 0 && !foreign.problems.length) {
  console.log("✓ a host with no verifier is counted as unchecked, not verified");
  console.log("    → unchecked, as it must be");
} else {
  failed++;
  console.log(`✗ a host with no verifier is counted as unchecked, not verified`);
  console.log(`    got: verified=${foreign.verified} unchecked=${foreign.unchecked} problems=${foreign.problems.length}`);
}

if (failed) {
  log.warn(`${failed} link-verifier guard(s) did not behave as claimed`);
  process.exit(1);
}
log.info(`all ${CASES.length + 1} link-verifier guards fire on the defect they claim to catch`);
